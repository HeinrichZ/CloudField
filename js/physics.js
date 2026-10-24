/* physics.js — CloudField 扩展物理：谱矩、相态分档、气溶胶、详细消光与 ETH CLOUDLAB 播云诊断
 * 作为 atmosphere.js 的增强层（保持向后兼容）。
 * 提供：详细消光（散射/吸收分离、谱宽耦合、Korolev 温度相态分配）、水平能见度场、
 *       ETH CLOUDLAB 播云消散沟对比诊断、参数敏感性扫描、状态补丁。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const S = A.STATE;

  // —— 相态质量消光效率（相对液态水，单位 m²/kg 的归一因子）、单次散射反照率与非球形不对称因子 g ——
  const PHASE_EXT = { water: 1.00, ice: 0.80, snow: 0.50, graupel: 0.40, hail: 0.30 };
  const PHASE_OMEGA = { water: 0.999, ice: 0.9995, snow: 0.998, graupel: 0.992, hail: 0.985 };
  const PHASE_G = { water: 0.85, ice: 0.76, snow: 0.78, graupel: 0.72, hail: 0.70 };
  const PHASE_ORDER = ['water', 'ice', 'snow', 'graupel', 'hail'];

  // Wyser (1998) / Fu (1996) 冰晶非球形习惯（Habit：六棱柱/板状/枝状晶）随温度的有效粒径放大修正：
  // 液态水保持 1.0；冰相粒子因广义有效直径 D_ge 显著大于云滴（25~80 µm），单位质量几何截面随温度修正
  function iceHabitExtFactor(k, T) {
    if (k === 'water') return 1.0;
    if (k === 'ice') {
      // -5°C 暖冰区枝状/柱状晶较大（折减 ~0.68），-45°C 高空冷卷云细小棱柱晶（接近 1.0）
      const tNorm = Math.max(0, Math.min(1, (-T) / 45));
      return 0.68 + 0.32 * tNorm;
    }
    return 1.0;
  }

  // 相态质量分数：支持 Korolev (0 ~ -38°C) 温度自适应混合相分配、同质冻结物理硬约束（T ≤ -38°C 无液态水）、WBF 播云羽流冰晶化增幅
  function phaseFractions(z, x, y) {
    let base;
    if (S.micro && S.micro.autoPhaseTemp && z != null && A.iceFractionAt) {
      const fi = A.iceFractionAt(z);
      base = { water: 1 - fi, ice: fi * 0.75, snow: fi * 0.25, graupel: 0, hail: 0 };
    } else {
      const p = S.phases || { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 };
      let sum = PHASE_ORDER.reduce((s, k) => s + Math.max(0, p[k] || 0), 0);
      if (sum <= 0) base = { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 };
      else {
        base = {};
        PHASE_ORDER.forEach(k => { base[k] = Math.max(0, p[k] || 0) / sum; });
      }
      // 大气物理同质冻结硬约束：T ≤ -38°C 时过冷液态水滴无法存在，且高空冷云 (-22 ~ -38°C) 若未手动指定冰相则按温度自然冰化
      if (z != null && A.tempAt && base.water > 0) {
        const T = A.tempAt(z);
        if (T <= -38) {
          const w = base.water;
          base.water = 0;
          base.ice = (base.ice || 0) + w * 0.85;
          base.snow = (base.snow || 0) + w * 0.15;
        } else if (T < -22 && base.water > 0.98) {
          const fiHigh = Math.min(1, Math.pow((-T - 22) / 16, 1.2));
          const shiftH = base.water * fiHigh;
          base.water -= shiftH;
          base.ice = (base.ice || 0) + shiftH * 0.85;
          base.snow = (base.snow || 0) + shiftH * 0.15;
        }
      }
    }
    // 叠加 ETH CLOUDLAB 人工播云羽流内部的 WBF 冰晶转化（近源端残余水凝物以新生冰晶/雪晶为主）
    if (x != null && y != null && z != null && A.seedingIceBoostAt) {
      const ib = A.seedingIceBoostAt(x, y, z);
      if (ib > 0 && base.water > 0) {
        const shift = base.water * ib * 0.85;
        base.water -= shift;
        base.ice = (base.ice || 0) + shift * 0.65;
        base.snow = (base.snow || 0) + shift * 0.35;
      }
    }
    return base;
  }

  function aerosolBetaAt(z) {
    const a = S.aerosol || { on: false, beta0: 1e-4, scaleH: 1.5 };
    if (!a.on) return 0;
    return Math.max(0, a.beta0) * Math.exp(-Math.max(0, z) / Math.max(0.1, a.scaleH));
  }

  // 当前粒子谱有效方差 ν_eff（来自 Spectrum 模块或 STATE.spectrum）
  function currentVeff() {
    if (global.Spectrum && typeof global.Spectrum.moments === 'function') {
      const m = global.Spectrum.moments();
      if (m && isFinite(m.veff)) return m.veff;
    }
    return (S.spectrum && isFinite(S.spectrum.veff)) ? S.spectrum.veff : 0.10;
  }

  // 详细消光：在 (x,y,z) 处分解各相态、非球形冰晶习惯、粒子谱宽与气溶胶贡献
  function detailedAt(x, y, z, layers, wind, time) {
    const f = A.sampleFields(x, y, z, layers, wind, time);
    const lwcGm3 = f.lwc;                                   // g/m³（已包含播云 WBF 消散沟削减）
    const frac = phaseFractions(z, x, y);
    const reUm = A.operativeRe(lwcGm3);                     // operative 有效半径
    const veff = currentVeff();
    let betaExt = 0, betaSca = 0, gWeighted = 0;
    for (const k of PHASE_ORDER) {
      const lwcK = lwcGm3 * frac[k];
      if (lwcK <= 0) continue;
      const betaGeo = 1.5 * lwcK / Math.max(0.5, reUm);
      const habitFac = iceHabitExtFactor(k, f.temp);
      const betaK = PHASE_EXT[k] * habitFac * (global.Mie ? global.Mie.betaFromLWC_Mie(lwcK, reUm, null, veff) : betaGeo); // m⁻¹
      const scaK = PHASE_OMEGA[k] * betaK;
      betaExt += betaK;
      betaSca += scaK;
      gWeighted += scaK * PHASE_G[k];
    }
    const betaA = aerosolBetaAt(z);
    const scaA = (S.aerosol && S.aerosol.omega ? S.aerosol.omega : 0.92) * betaA;
    betaExt += betaA;
    betaSca += scaA;
    gWeighted += scaA * 0.68;
    const betaAbs = Math.max(0, betaExt - betaSca);
    const omegaMix = betaExt > 0 ? betaSca / betaExt : 0.999;
    const gMix = betaSca > 0 ? gWeighted / betaSca : 0.85;
    return {
      betaExt, betaSca, betaAbs, betaAero: betaA,
      omegaMix, gMix,
      lwc: lwcGm3, reUm, veff, frac,
      seedDepletion: f.seedDepletion || 0,
      density: f.density, temp: f.temp, dew: f.dew, pressure: f.pressure,
    };
  }

  function visibilityDetailed(x, y, z, time) {
    const d = detailedAt(x, y, z, A.effectiveLayers(), { x: S.windSpeed, dir: S.windDir }, time);
    const vis = A.visibilityFromExt(d.betaExt);
    return { vis, beta: d.betaExt, sca: d.betaSca, abs: d.betaAbs, lwc: d.lwc, re: d.reUm, veff: d.veff, frac: d.frac, seedDepletion: d.seedDepletion };
  }

  const WORST_OFFS = [[0, 0], [-12, -12], [-12, 0], [-12, 12], [0, -12], [0, 12], [12, -12], [12, 0], [12, 12]];
  function worstVisibilityDetailed(time) {
    const layers = A.effectiveLayers();
    const wind = { x: S.windSpeed, dir: S.windDir };
    let worst = Infinity, atZ = 0, bestX = 0, bestY = 0, bestD = null;
    for (let z = 0; z <= 13; z += 0.5) {
      for (let k = 0; k < WORST_OFFS.length; k++) {
        const ox = WORST_OFFS[k][0], oy = WORST_OFFS[k][1];
        const d = detailedAt(ox, oy, z, layers, wind, time);
        const vis = A.visibilityFromExt(d.betaExt);
        if (isFinite(vis) && vis < worst) {
          worst = vis; atZ = z; bestX = ox; bestY = oy; bestD = d;
        }
      }
    }
    // 在最差高度上下 ±0.25 km 做精细加密采样
    for (const dz of [-0.25, 0.25]) {
      const zFine = atZ + dz;
      if (zFine < 0 || zFine > 13) continue;
      const d = detailedAt(bestX, bestY, zFine, layers, wind, time);
      const vis = A.visibilityFromExt(d.betaExt);
      if (isFinite(vis) && vis < worst) {
        worst = vis; atZ = zFine; bestD = d;
      }
    }
    const info = bestD ? {
      vis: worst, beta: bestD.betaExt, sca: bestD.betaSca, abs: bestD.betaAbs,
      lwc: bestD.lwc, re: bestD.reUm, veff: bestD.veff, frac: bestD.frac, seedDepletion: bestD.seedDepletion,
    } : visibilityDetailed(0, 0, 0, time);
    return { vis: worst, alt: atZ, x: bestX, y: bestY, info };
  }

  // ETH CLOUDLAB 人工播云试验诊断：对比播撒羽流轴线内（下风向 3~12 km 代表性云团）与周围未播撒环境云体的能见度及跑道起降标准恢复情况
  function seedingDiagnostics(time) {
    const sd = S.seeding || {};
    let z = sd.alt != null ? sd.alt : 1.1;
    const goRad = ((S.windDir || 270) + 180) * Math.PI / 180;
    const ux = Math.sin(goRad), uy = Math.cos(goRad);
    const x0 = sd.x0 != null ? sd.x0 : -8.0;
    const y0 = sd.z0 != null ? sd.z0 : 0.0;

    // 临时关闭播云取背景环境能见度，再开启播云取羽流内能见度；沿下风向轴线扫描代表性有云点
    const prevOn = !!sd.on;
    const prevAlt = sd.alt;
    sd.on = false;
    let xPlume = x0 + ux * 6.0, yPlume = y0 + uy * 6.0;
    let amb = visibilityDetailed(xPlume, yPlume, z, time || 0);
    if (!amb.lwc || amb.lwc < 0.02) {
      const candZ = [z];
      if (S.layers && S.layers.sc && S.layers.sc.on) candZ.push(0.5 * (S.layers.sc.base + S.layers.sc.top));
      if (S.layers && S.layers.cu && S.layers.cu.on) candZ.push(0.5 * (S.layers.cu.base + S.layers.cu.top));
      let bestLwc = amb.lwc || 0;
      for (const cz of candZ) {
        for (const dist of [3, 4.5, 6, 7.5, 9, 11]) {
          const cx = x0 + ux * dist, cy = y0 + uy * dist;
          const cand = visibilityDetailed(cx, cy, cz, time || 0);
          if (cand.lwc > bestLwc) {
            bestLwc = cand.lwc; amb = cand; xPlume = cx; yPlume = cy; z = cz;
          }
        }
      }
    }
    sd.on = true;
    sd.alt = z;
    const seeded = visibilityDetailed(xPlume, yPlume, z, time || 0);
    sd.on = prevOn;
    sd.alt = prevAlt;

    const visAmb = isFinite(amb.vis) ? amb.vis : 99999;
    const visSeed = isFinite(seeded.vis) ? seeded.vis : 99999;
    const gainRatio = visAmb > 0 ? visSeed / visAmb : 1;
    return {
      active: prevOn,
      agent: sd.agent || 'agi',
      inpConc: sd.inpConc || 80,
      altKm: z,
      tempC: A.tempAt(z),
      visAmbientM: visAmb,
      visSeededM: visSeed,
      ambientVis: visAmb,
      seededVis: visSeed,
      lwcAmbient: amb.lwc,
      lwcSeeded: seeded.lwc,
      gainRatio,
      cat1Recovered: visSeed >= 550,
    };
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
    let cloudTop = 0, cloudBase = 99;
    layers.forEach(L => { if (L.coverage > 0.02) { cloudTop = Math.max(cloudTop, L.top); cloudBase = Math.min(cloudBase, L.base); } });
    if (cloudBase > cloudTop) { cloudBase = 0; cloudTop = 0; }
    let od = 0;
    for (let zz = 0; zz <= 14; zz += 0.25) {
      const d = detailedAt(0, 0, zz, layers, wind, opts.time || 0);
      od += d.betaExt * 250;
    }
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
  const SEN_DZ = 0.75;
  const SEN_OFFS = [[0, 0], [7, 7], [-7, -7]];

  function sensitivityOpen(pa, pb, opts) {
    opts = opts || {};
    const N = Math.max(4, Math.min(48, Math.round(opts.N || 20)));
    const metric = opts.metric === 'opticalDepth' ? 'opticalDepth' : 'vis';
    const time = isFinite(opts.time) ? opts.time : 0;
    const dz = opts.dz || SEN_DZ;
    const offs = metric === 'opticalDepth' ? [[0, 0]] : (opts.offsets || SEN_OFFS);

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
      if (path.indexOf('seeding.') === 0 && S.seeding && !S.seeding.on) {
        undo.push({ path: 'seeding.on', prev: false });
        S.seeding.on = true;
      }
    }
    activate(pa.path); activate(pb.path);

    const saveA = getPath(pa.path), saveB = getPath(pb.path);
    const wind = { x: S.windSpeed, dir: S.windDir };
    const grid = new Float32Array(N * N);
    let row = 0;

    function value() {
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
          return (b - a) / Math.max(1e-9, Math.abs((a + b) / 2));
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
    if (patch.seeding && S.seeding) Object.assign(S.seeding, patch.seeding);
    if (patch.spectrum) Object.assign(S.spectrum, patch.spectrum);
    if (patch.phases) Object.assign(S.phases, patch.phases);
    if (patch.aerosol) Object.assign(S.aerosol, patch.aerosol);
    if (patch.operators) Object.assign(S.operators, patch.operators);
    if (patch.kessler) Object.assign(S.kessler, patch.kessler);
    if (patch.env) for (const k in patch.env) S[k] = patch.env[k];
  }

  global.Physics = {
    PHASE_EXT, PHASE_OMEGA, PHASE_ORDER,
    phaseFractions, aerosolBetaAt, currentVeff, detailedAt, visibilityDetailed,
    worstVisibilityDetailed, seedingDiagnostics, fieldStats, sensitivityGrid, sensitivityOpen,
    setPath, getPath, applyStatePatch,
  };
})(window);
