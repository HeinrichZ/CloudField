/* physics.js — CloudField 扩展物理：谱矩、相态分档、气溶胶与"详细消光"
 * 作为 atmosphere.js 的增强层（不改动原文件，保持向后兼容）。
 * 提供：详细消光（散射/吸收分离）、水平能见度场、统计量、参数敏感性、状态补丁。
 * 注：消光/散射采用单分散球滴近似的解析修正；如需更高保真，可在 Spectrum.mieExt()
 *     处接入米氏查找表（如 BHMIE 预计算表）。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const S = A.STATE;

  // —— 相态质量消光效率（相对液态水，单位 m²/kg 的归一因子）与单次散射反照率 ——
  // 因子含义：相同质量下，冰晶/雪/霰/雹因粒径更大、数浓度更低，单位质量消光弱于水滴。
  const PHASE_EXT = { water: 1.00, ice: 0.80, snow: 0.50, graupel: 0.40, hail: 0.30 };
  const PHASE_OMEGA = { water: 0.96, ice: 0.85, snow: 0.90, graupel: 0.70, hail: 0.62 };
  const PHASE_ORDER = ['water', 'ice', 'snow', 'graupel', 'hail'];

  function phaseFractions() {
    const p = S.phases || { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 };
    let sum = PHASE_ORDER.reduce((s, k) => s + Math.max(0, p[k] || 0), 0);
    if (sum <= 0) return { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 };
    const o = {};
    PHASE_ORDER.forEach(k => { o[k] = Math.max(0, p[k] || 0) / sum; });
    return o;
  }

  function aerosolBetaAt(z) {
    const a = S.aerosol || { on: false, beta0: 1e-4, scaleH: 1.5 };
    if (!a.on) return 0;
    return Math.max(0, a.beta0) * Math.exp(-Math.max(0, z) / Math.max(0.1, a.scaleH));
  }

  // 详细消光：在 (x,y,z) 处分解各相态与气溶胶贡献
  function detailedAt(x, y, z, layers, wind, time) {
    const f = A.sampleFields(x, y, z, layers, wind, time);
    const lwcGm3 = f.lwc;                                   // g/m³
    const frac = phaseFractions();
    // 与主模型共用同一 r_e 源（A.operativeRe：derived 时由 LWC 与 N 反推，fixed 时用滑块）。
    // Spectrum.moments() 仅用于谱分析读数，不参与消光计算。
    const reUm = A.operativeRe(lwcGm3);                       // operative 有效半径
    let betaExt = 0, betaSca = 0;
    for (const k of PHASE_ORDER) {
      const lwcK = lwcGm3 * frac[k];
      if (lwcK <= 0) continue;
      // 单位约定：本模块内部 β 一律用 m⁻¹（visibilityFromExt / 光学厚度都按 m⁻¹ 处理）。
      //   β[m⁻¹] = 3·LWC_kgm3/(2·ρ_w·r_e_m) = 1.5·LWC_gm3/r_e_um
      //   注意：atmosphere.betaFromLWC() 返回的是 km⁻¹（系数 1500），两者相差 1000，不可混用。
      // 优先用米氏查表（反常衍射近似，Q_ext/2 修正）；未加载时退回几何光学 1.5·LWC/r_e
      const betaGeo = 1.5 * lwcK / Math.max(0.5, reUm);
      const betaK = PHASE_EXT[k] * (global.Mie ? global.Mie.betaFromLWC_Mie(lwcK, reUm) : betaGeo); // m⁻¹
      betaExt += betaK;
      betaSca += PHASE_OMEGA[k] * betaK;
    }
    const betaA = aerosolBetaAt(z);
    betaExt += betaA;
    betaSca += (S.aerosol && S.aerosol.omega ? S.aerosol.omega : 0.92) * betaA;
    const betaAbs = Math.max(0, betaExt - betaSca);
    return {
      betaExt, betaSca, betaAbs, betaAero: betaA,
      lwc: lwcGm3, reUm, frac,
      density: f.density, temp: f.temp, dew: f.dew, pressure: f.pressure,
    };
  }

  function visibilityDetailed(x, y, z, time) {
    const d = detailedAt(x, y, z, A.effectiveLayers(), { x: S.windSpeed, dir: S.windDir }, time);
    const vis = A.visibilityFromExt(d.betaExt);
    return { vis, beta: d.betaExt, sca: d.betaSca, abs: d.betaAbs, lwc: d.lwc, re: d.reUm, frac: d.frac };
  }

  function worstVisibilityDetailed(time) {
    let worst = Infinity, atZ = 0, info = null;
    for (let z = 0; z <= 13; z += 0.25) {
      const v = visibilityDetailed(0, 0, z, time);
      if (isFinite(v.vis) && v.vis < worst) { worst = v.vis; atZ = z; info = v; }
    }
    return { vis: worst, alt: atZ, info };
  }

  // —— 水平能见度场 + 统计量（#2：空间对比与统计）——
  function fieldStats(opts) {
    opts = opts || {};
    const N = opts.N || 32;
    const half = opts.half || 20;                 // km
    const z = opts.z != null ? opts.z : 0.3;       // 近地面水平面高度 km
    const layers = A.effectiveLayers();
    const wind = { x: S.windSpeed, dir: S.windDir };
    const field = new Float32Array(N * N);
    let minV = Infinity, maxV = 0, cloudy = 0, visUnder1k = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = -half + (2 * half) * i / (N - 1);
        const y = -half + (2 * half) * j / (N - 1);
        const d = detailedAt(x, y, z, layers, wind, opts.time || 0);
        const vis = A.visibilityFromExt(d.betaExt);
        const vv = isFinite(vis) ? Math.min(vis, 99999) : 99999;
        field[i * N + j] = vv;
        if (vv < minV) minV = vv;
        if (vv > maxV) maxV = vv;
        if (d.density > 0.05) cloudy++;
        if (vv < 1000) visUnder1k++;
      }
    }
    // 云顶/云底高度
    let cloudTop = 0, cloudBase = 99;
    layers.forEach(L => { if (L.coverage > 0.02) { cloudTop = Math.max(cloudTop, L.top); cloudBase = Math.min(cloudBase, L.base); } });
    if (cloudBase > cloudTop) { cloudBase = 0; cloudTop = 0; }
    // 垂直积分光学厚度（代表列）
    let od = 0;
    for (let zz = 0; zz <= 14; zz += 0.25) {
      const d = detailedAt(0, 0, zz, layers, wind, opts.time || 0);
      od += d.betaExt * 250;
    }
    // 水平平均消光廓线
    const profN = 60; const prof = new Float32Array(profN);
    for (let zi = 0; zi < profN; zi++) {
      const zz = (zi / (profN - 1)) * 14;
      let sum = 0;
      const M = 6;
      for (let s = 0; s < M; s++) {
        const x = -half + (2 * half) * s / (M - 1);
        const d = detailedAt(x, 0, zz, layers, wind, opts.time || 0);
        sum += d.betaExt;
      }
      prof[zi] = sum / M;
    }
    return {
      N, half, z, field, minV, maxV,
      coverage: cloudy / (N * N) * 100,
      visUnder1k: visUnder1k / (N * N) * 100,
      cloudTop, cloudBase, opticalDepth: od,
      meanExtProfile: prof, profAltMax: 14,
    };
  }

  // —— 参数敏感性热力图（#6）——
  // 逐点求值：vis = 多点水平采样下的最差能见度；opticalDepth = 单列垂直积分光学厚度。
  // 这里同时处理三个会让热力图“看起来坏掉”的坑：
  //   1) 有些参数在当前状态下不参与计算——derived 模式下 micro.effRadiusUm 被 operativeRe()
  //      忽略，气溶胶开关关闭时 aerosol.* 恒为 0。直接扫描会得到一条常量轴（整列同色）。
  //      扫描期间临时激活这些参数，结束后原样恢复。
  //   2) 采样时间不能写死 t=0，否则风场类参数（windSpeed）永远没有效果。由调用方传入当前仿真时间。
  //   3) 只看 (0,0) 单列时，若该列恰逢晴空，覆盖类参数（layers.*.coverage）会显示为无效。
  //      改为 3 个水平采样点取最差，既能覆盖云隙也能反映覆盖率变化。
  const SEN_DZ = 0.75;                            // 垂直采样步长 km（0–14 km → 19 层）
  const SEN_OFFS = [[0, 0], [7, 7], [-7, -7]];    // 水平采样点（km）

  function sensitivityOpen(pa, pb, opts) {
    opts = opts || {};
    const N = Math.max(4, Math.min(48, Math.round(opts.N || 20)));
    const metric = opts.metric === 'opticalDepth' ? 'opticalDepth' : 'vis';
    const time = isFinite(opts.time) ? opts.time : 0;
    const dz = opts.dz || SEN_DZ;
    const offs = metric === 'opticalDepth' ? [[0, 0]] : (opts.offsets || SEN_OFFS);

    // 临时激活“当前状态下无效”的被扫参数，结束后回滚
    const undo = [];
    function activate(path) {
      if (path === 'micro.effRadiusUm' && S.micro.reMode !== 'fixed') {
        undo.push({ path: 'micro.reMode', prev: S.micro.reMode });
        S.micro.reMode = 'fixed';
      }
      if (path.indexOf('aerosol.') === 0 && !S.aerosol.on) {
        undo.push({ path: 'aerosol.on', prev: false });
        S.aerosol.on = true;
      }
    }
    activate(pa.path); activate(pb.path);

    const saveA = getPath(pa.path), saveB = getPath(pb.path);
    const wind = { x: S.windSpeed, dir: S.windDir };
    const grid = new Float32Array(N * N);
    let row = 0;

    function value() {
      // 每点重新取层：layers.*.coverage / density 本身可能就是被扫参数，
      // 提到循环外会把覆盖率扫描变成一条平带（早期版本的隐患）。
      const layers = A.effectiveLayers();
      if (metric === 'opticalDepth') {
        let od = 0;
        for (let z = 0; z <= 14; z += dz) od += detailedAt(0, 0, z, layers, wind, time).betaExt * (dz * 1000);
        return od;
      }
      let worst = Infinity;
      for (let k = 0; k < offs.length; k++) {
        for (let z = 0; z <= 14; z += dz) {
          const d = detailedAt(offs[k][0], offs[k][1], z, layers, wind, time);
          const v = A.visibilityFromExt(d.betaExt);
          if (isFinite(v) && v < worst) worst = v;
        }
      }
      return isFinite(worst) ? worst : 99999;
    }

    const job = {
      N, metric, grid, time, pa, pb,
      progress: () => (N > 0 ? row / N : 1),
      finished: () => row >= N,
      // 分块推进：每帧算若干行，避免一次性 700+ ms 阻塞主线程（界面“点了没反应”）
      stepRows(n) {
        let cnt = Math.max(1, n || 1);
        while (cnt-- > 0 && row < N) {
          const a = pa.min + (pa.max - pa.min) * row / (N - 1);
          for (let j = 0; j < N; j++) {
            const b = pb.min + (pb.max - pb.min) * j / (N - 1);
            setPath(pa.path, a); setPath(pb.path, b);
            grid[row * N + j] = value();
          }
          row++;
        }
        return N > 0 ? row / N : 1;
      },
      // 值域与逐轴变化幅度：spread≈0 说明该轴上的参数对当前指标没有影响
      summary() {
        let lo = Infinity, hi = -Infinity;
        for (let k = 0; k < grid.length; k++) {
          const v = grid[k];
          if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
        }
        if (!isFinite(lo)) { lo = 0; hi = 1; }
        const rowM = [], colM = [];
        for (let i = 0; i < N; i++) {
          let s = 0, c = 0;
          for (let j = 0; j < N; j++) { const v = grid[i * N + j]; if (isFinite(v)) { s += v; c++; } }
          rowM.push(c ? s / c : NaN);
        }
        for (let j = 0; j < N; j++) {
          let s = 0, c = 0;
          for (let i = 0; i < N; i++) { const v = grid[i * N + j]; if (isFinite(v)) { s += v; c++; } }
          colM.push(c ? s / c : NaN);
        }
        const span = (arr) => {
          let a = Infinity, b = -Infinity;
          for (let k = 0; k < arr.length; k++) { const v = arr[k]; if (isFinite(v)) { if (v < a) a = v; if (v > b) b = v; } }
          if (!isFinite(a)) return 0;
          return (b - a) / Math.max(1e-9, Math.abs((a + b) / 2));   // 相对变化幅度
        };
        return { lo, hi, spreadA: span(rowM), spreadB: span(colM), spread: hi > lo ? (hi - lo) / Math.max(1e-9, Math.abs((lo + hi) / 2)) : 0 };
      },
      restore() {
        setPath(pa.path, saveA);
        setPath(pb.path, saveB);
        for (let i = undo.length - 1; i >= 0; i--) setPath(undo[i].path, undo[i].prev);
        undo.length = 0;
      },
    };
    return job;
  }

  // 同步封装（CLI / 单元测试用）：一次算完并返回数组
  function sensitivityGrid(pa, pb, opts) {
    const job = sensitivityOpen(pa, pb, opts);
    while (!job.finished()) job.stepRows(job.N);
    const s = job.summary();
    job.restore();
    return {
      N: job.N, grid: job.grid, metric: job.metric, time: job.time,
      paMin: pa.min, paMax: pa.max, pbMin: pb.min, pbMax: pb.max,
      lo: s.lo, hi: s.hi, spread: s.spread, spreadA: s.spreadA, spreadB: s.spreadB,
    };
  }

  // —— 状态补丁（供时序插值、场景预设、录制回放使用）——
  function setPath(path, value) {
    const parts = path.split('.');
    let o = S;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }
  function getPath(path) {
    const parts = path.split('.');
    let o = S;
    for (let i = 0; i < parts.length; i++) o = o[parts[i]];
    return o;
  }
  function applyStatePatch(patch) {
    if (!patch) return;
    if (patch.scalars) for (const k in patch.scalars) if (S[k] !== undefined) S[k] = patch.scalars[k];
    if (patch.layers) for (const k in patch.layers) Object.assign(S.layers[k], patch.layers[k]);
    if (patch.micro) Object.assign(S.micro, patch.micro);
    if (patch.spectrum) Object.assign(S.spectrum, patch.spectrum);
    if (patch.phases) Object.assign(S.phases, patch.phases);
    if (patch.aerosol) Object.assign(S.aerosol, patch.aerosol);
    if (patch.operators) Object.assign(S.operators, patch.operators);
    if (patch.kessler) Object.assign(S.kessler, patch.kessler);
    if (patch.env) for (const k in patch.env) S[k] = patch.env[k];
  }

  global.Physics = {
    PHASE_EXT, PHASE_OMEGA, PHASE_ORDER,
    phaseFractions, aerosolBetaAt, detailedAt, visibilityDetailed,
    worstVisibilityDetailed, fieldStats, sensitivityGrid, sensitivityOpen,
    setPath, getPath, applyStatePatch,
  };
})(window);
