/* atmosphere.js — CloudField 大气物理与云微物理诊断模型
 * 品牌：CloudField（原 CloudSim / CloudLab）
 * 设计重心：从“渲染管线”转向“云微物理参数化交互式诊断”
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright Tianyuan.J.Z©
 */
(function (global) {
  'use strict';

  // ============ 元数据 ============
  const SNAPSHOT_VERSION = 1;          // 快照/JSON 格式版本号
  const APP_NAME = 'CloudField';

  const CLOUD_META = {
    ci: { name: '卷云', band: '高云 6–13km', kind: 'ice' },
    cs: { name: '高积/高层云', band: '中高云 4–8km', kind: 'mixed' },
    sc: { name: '层云/层积云', band: '低云 0.2–2km', kind: 'water' },
    cu: { name: '积云', band: '低—中云 0.5–4km', kind: 'water' },
    cb: { name: '积雨云', band: '直展云 0.5–12km', kind: 'convective' },
  };
  const LAYER_ORDER = ['ci', 'cs', 'sc', 'cu', 'cb'];

  // ============ 状态（全部可调，且可序列化为快照）============
  const STATE = {
    version: SNAPSHOT_VERSION,

    // —— 大气基础环境 ——
    surfaceTemp: 15,          // 地面温度 °C
    surfacePressure: 1013,    // 地面气压 hPa
    surfaceRH: 70,            // 地面相对湿度 %
    lapseRate: 6.5,           // 环境温度直减率 °C/km
    dewLapse: 1.8,            // 露点直减率 °C/km
    dryLapseRate: 9.8,        // 干绝热直减率 K/km（仅用于 LCL；与环境直减率语义不同）
    windSpeed: 8,             // 风速 m/s
    windDir: 270,             // 风向(来向) °
    sunElev: 35,              // 太阳高度角 °
    sunAz: 135,               // 太阳方位角 °
    envCycle: true,           // 环境慢变（温度/湿度日变化），让温度/气压在演进中真实变化
    envT: 0,                  // 温度偏移 °C（主循环按时间写入）
    envRH: 0,                 // 相对湿度偏移 %（主循环按时间写入）

    // —— 云层（5 类，覆盖常见云族）——
    layers: {
      ci: { on: true,  coverage: 0.5, density: 0.5, scale: 0.18, detail: 0.5, base: 8.0,  top: 12.0 },
      cs: { on: true,  coverage: 0.4, density: 0.5, scale: 0.14, detail: 0.5, base: 4.0,  top: 7.0 },
      sc: { on: true,  coverage: 0.6, density: 0.6, scale: 0.10, detail: 0.55, base: 0.4, top: 1.8 },
      cu: { on: true,  coverage: 0.4, density: 0.6, scale: 0.08, detail: 0.6, base: 0.8,  top: 3.5 },
      cb: { on: false, coverage: 0.5, density: 0.7, scale: 0.10, detail: 0.6, base: 0.6,  top: 9.0 },
    },

    // —— 模拟与演进 ——
    autoLife: true,
    lifeManual: 1.0,
    lifePhase: 0,
    convection: 45,           // 对流强度 CAPE 代理 0–100
    simSpeed: 1.0,

    // —— 可视化与监控 ——
    viewMode: 'real',         // real|temp|pressure|water|coverage
    fieldBand: true,          // 温度/气压视图：等值带 + 等值线（俯视时也能看出空间结构）
    sliceAlt: 3.0,
    showSlice: true,          // 3D 云场里的剖面高度亮线
    tintField: 'off',         // 微物理着色叠加：off|lwc|beta|re|Nd
    tintAmt: 0.45,            // 叠加不透明度
    showSun: true,
    showGrid: true,
    quality: 0.8,

    // —— 云微物理参数化（映射到具体方案参数，用于“诊断”）——
    micro: {
      effRadiusUm: 8.0,       // 云滴有效半径 re (µm)
      dropConc: 300,          // 云滴数浓度 N (cm⁻³)
      autoConvK: 1.0e-3,      // Kessler 自动转化系数 k1 (s⁻¹)
      autoConvQc0: 5.0e-4,    // 自动转化临界云水含量 qc0 (kg/kg)
      accretK: 2.2,           // 碰并( accretion )系数 k2
      iceFrac: 0.0,           // 混合相冰相占比 0–1（影响散射/消光谱型）
      reMode: 'derived',      // r_e 来源：derived = 由 LWC 与 N 反推；fixed = 用 effRadiusUm 滑块
    },

    // —— 粒子谱描述（#4）：Gamma / 对数正态 / 实测谱 ——
    spectrum: {
      type: 'gamma',          // gamma | lognormal | measured
      re: 8.0,                // Gamma/对数正态 有效半径 (µm)
      N: 300,                 // 数浓度 (cm⁻³)
      veff: 0.10,             // Gamma 有效方差 ν_eff
      rg: 8.0,                // 对数正态 中值半径 (µm)
      sigmaG: 1.30,           // 对数正态 几何标准差
      measured: null,         // 实测谱：[{r:µm, dNdlnr:cm⁻³}] 或 null
    },

    // —— 相态分档（#5）：质量分数（内部按总和归一）——
    phases: { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 },

    // —— 气溶胶背景消光（#5）——
    aerosol: { on: false, beta0: 1.0e-4, scaleH: 1.5, omega: 0.92 },

    // —— 观测算子开关（#3）——
    operators: {
      visibility: true, extSplit: false, irradiance: true,
      albedo: true, satellite: true, lidar: true, radar: true,
    },

    // —— Kessler 单柱预报状态（q_c / q_r，按层，kg/kg）——
    kessler: {
      on: true,
      qc: { ci: 0, cs: 0, sc: 0, cu: 0, cb: 0 },
      qr: { ci: 0, cs: 0, sc: 0, cu: 0, cb: 0 },
      rainRate: 0, lastPac: 0, lastPgr: 0, steps: 0,
    },
  };

  // ============ 常量 ============
  const G = 9.80665, R = 287.05;       // 重力、气体常数
  // 风平流换算：m/s → km/s。取 0.01（= 物理值 0.001 的 10× 时间加速，沙盒演示用），
  // 让 3D 云层与诊断面板在可观察的时间内明显演进；如需物理实时，改为 0.001。
  const WIND_SCALE = 0.01;
  const RHO_W = 1000;                  // 水密度 kg/m³
  const MAX_ALT = 15;                  // 模拟顶高 km
  const LWC_MAX = 1.2;                 // 密度场归一化上限 g/m³（见文档“密度场归一化”）
  const KOSCHMEIER_EPS = 0.02;         // 能见度对比阈值 ε（Koschmieder）

  // ============ 基础气象计算 ============
  // Magnus 公式：由温度 T(°C) 与相对湿度 RH(%) 求露点 Td(°C)
  //   γ = ln(RH/100) + a·T/(b+T)，Td = b·γ/(a−γ)，a=17.27, b=237.7
  function dewpointFromRH(T, RH) {
    const a = 17.27, b = 237.7;
    const rh = Math.min(100, Math.max(0.1, RH)) / 100;
    const g = Math.log(rh) + a * T / (b + T);
    return b * g / (a - g);
  }
  // 环境慢变偏移（envT/envRH 由主循环按时间写入）；滑块的 surfaceTemp/RH 仍是基准值
  function surfaceTempEff() { return STATE.surfaceTemp + (STATE.envT || 0); }
  function surfaceRHEff() { return Math.min(100, Math.max(1, STATE.surfaceRH + (STATE.envRH || 0))); }
  function dewAt(z) {                  // 露点温度随高度 °C（地面用 Magnus，向上按 dewLapse 递减）
    return dewpointFromRH(surfaceTempEff(), surfaceRHEff()) - STATE.dewLapse * z;
  }
  function tempAt(z) { return surfaceTempEff() - STATE.lapseRate * z; }
  function lclHeight() {               // 抬升凝结高度 (km)：z_LCL = (T − Td) / Γ_d
    const T0 = surfaceTempEff();
    const Td0 = dewpointFromRH(T0, surfaceRHEff());
    const d = T0 - Td0;
    const gamma = Math.max(4, STATE.dryLapseRate || 9.8);   // K/km，默认干绝热 9.8
    return Math.max(0, d / gamma);
  }
  function pressureAt(z) {             // 压高公式（静力平衡，barometric）
    const Tk0 = surfaceTempEff() + 273.15;
    const Tk = tempAt(z) + 273.15;
    const lr = Math.max(0.05, STATE.lapseRate);
    const expo = 1000 * G / (R * lr);  // lr 为 K/km → Γ=lr/1000 K/m，故指数需 ×1000
    return STATE.surfacePressure * Math.pow(Tk / Tk0, expo);
  }
  function airDensityAt(z) {
    const p = pressureAt(z) * 100;     // Pa
    const Tk = tempAt(z) + 273.15;
    return p / (R * Tk);
  }
  function freezingLevel() {           // 0°C 层高度 km
    const T0 = surfaceTempEff();
    if (STATE.lapseRate <= 0) return T0 <= 0 ? 0 : 999;
    return Math.max(0, T0 / STATE.lapseRate);
  }

  // ============ 云层有效范围（随对流/生消变化）============
  function effectiveLayers() {
    const life = STATE.autoLife ? (0.5 + 0.5 * Math.sin(STATE.lifePhase)) : STATE.lifeManual;
    const conv = STATE.convection / 100;
    return LAYER_ORDER.filter(k => STATE.layers[k].on).map(k => {
      const L = STATE.layers[k];
      let top = L.top, base = L.base;
      if (k === 'cu' || k === 'cb') {
        const grow = 1 + conv * (k === 'cb' ? 2.6 : 1.2) * life;
        top = Math.min(15, L.base + (L.top - L.base) * grow);
      }
      base = Math.max(0, L.base);
      // 生消调制：覆盖率/密度随 life 相位缓慢增减（周期约 42 s），让云层“长出来/散掉”可见
      const lifeMod = 0.78 + 0.30 * life;
      const densMod = 0.85 + 0.25 * life;
      return {
        key: k, base, top,
        coverage: Math.min(1, L.coverage * lifeMod),
        density: Math.min(1, L.density * densMod),
        scale: L.scale, detail: L.detail,
        kind: CLOUD_META[k].kind,
        type: LAYER_ORDER.indexOf(k),
      };
    });
  }

  // ============ 密度场采样（与着色器保持一致）============
  function hash3(x, y, z) {
    let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }
  function fbm(x, y, z) {
    let f = 0, a = 0.5, s = 1;
    for (let i = 0; i < 4; i++) {
      f += a * (hash3(x * s, y * s, z * s) - 0.5);
      s *= 2.03; a *= 0.5;
    }
    return f;
  }
  function sampleFields(x, y, z, layers, wind, time) {
    // 与着色器一致：wx = sin(dir)、wz = cos(dir)（dir 为去向）
    const wx = Math.sin((wind.dir || 0) * Math.PI / 180) * (wind.x || 0) * WIND_SCALE;
    const wz = Math.cos((wind.dir || 0) * Math.PI / 180) * (wind.x || 0) * WIND_SCALE;
    const px = x - wx * time, pz = z - wz * time;
    let density = 0, lwc = 0;
    for (const L of layers) {
      if (z < L.base || z > L.top) continue;
      const h = (z - L.base) / Math.max(0.05, L.top - L.base);
      const vfall = Math.exp(-Math.pow((h - 0.5) * 2.4, 2) * 1.6);
      const cov = L.coverage;
      const sx = px / Math.max(0.02, L.scale) + L.key.length * 13.0;
      const sy = y / Math.max(0.02, L.scale) * 0.6;
      const sz = pz / Math.max(0.02, L.scale);
      const n = fbm(sx, sy, sz);
      const n2 = fbm(sx * 2.1 + 5.0, sy * 2.1, sz * 2.1) * L.detail;
      let d = (0.5 + n + n2 * 0.5);
      d = Math.max(0, d - (1 - cov) * 1.4);
      d *= vfall * L.density;
      if (d > 0) {
        density += d;
        const lwcLayer = Math.min(1, d) * LWC_MAX * (L.kind === 'ice' ? 0.4 : 1.0);
        lwc = Math.max(lwc, lwcLayer);
      }
    }
    density = Math.min(1.5, density);
    return { density, lwc, temp: tempAt(z), dew: dewAt(z), pressure: pressureAt(z) };
  }

  // ============ 能见度 / 消光（可信度核心）============
  // 消光系数 β_ext = (3 · LWC) / (2 · ρ_w · r_e)   [m⁻¹]
  //   LWC: kg/m³, r_e: m；单分散球滴近似（米氏/HG 近似）
  function extinctionFromLWC(lwc_gm3, effRadiusUm) {
    const lwc = lwc_gm3 / 1000;                 // g/m³ -> kg/m³
    const re = Math.max(1e-6, effRadiusUm * 1e-6);
    return (3 * lwc) / (2 * RHO_W * re);        // m⁻¹
  }
  // Koschmieder 能见度：V = -ln(ε) / β_ext = ln(1/ε)/β_ext
  function visibilityFromExt(beta) {
    if (beta <= 1e-6) return Infinity;
    return -Math.log(KOSCHMEIER_EPS) / beta;     // m
  }
  // 由密度场派生的三个微物理量（与 clouds.js 着色器里的公式逐条对应，改一处要同步另一处）
  //   LWC = min(1,d) · LWC_MAX · (冰相 ×0.4)                      [g/m³]
  //   β[km⁻¹] = 1000 · 3·LWC_kgm3 / (2·1000·r_e_m) = 1500 · LWC_gm3 / r_e_um
  //   r_e = (3·LWC/(4π·ρ_w·N))^(1/3)                              [µm]
  function lwcFromDensity(d, kind) { return Math.min(1, Math.max(0, d)) * LWC_MAX * (kind === 'ice' ? 0.4 : 1.0); }
  // 返回 km⁻¹。换算链：β[m⁻¹] = 1.5·LWC_gm3/r_e_um，×1000 得 km⁻¹ → 系数 1500。
  // 与 extinctionFromLWC() 的关系：betaFromLWC() ≡ extinctionFromLWC()×1000（数值相等、单位不同）。
  // 警告：系数 1500 是正确的 km⁻¹ 系数，不要“修正”为 1.5（那会小 1000 倍）。
  function betaFromLWC(lwc_gm3, reUm) { return 1500 * lwc_gm3 / Math.max(0.5, reUm); }
  function effRadiusFromLWC(lwc_gm3, N_cm3) {
    const lwcKg = lwc_gm3 / 1000, Nm3 = Math.max(1, N_cm3) * 1e6;
    return 1e6 * Math.pow(Math.max(1e-20, 3 * lwcKg / (4 * Math.PI * RHO_W * Nm3)), 1 / 3);
  }
  // 聚合指标口径：总云量按各层云量随机重叠（相互独立）合成，1−Π(1−cᵢ)。
  // 这不是卫星反演的面积占比，也不是云光学厚度阈值统计，复现时口径要写清楚。
  function totalCloudCover() {
    let clear = 1;
    effectiveLayers().forEach(L => { clear *= (1 - Math.min(1, L.coverage)); });
    return (1 - clear) * 100;
  }

  // 有效半径的单一来源：derived 时由 LWC 与 N 反推（闭合 N→r_e→β 的 Twomey 链）；
  // fixed 时使用 effRadiusUm 滑块值。上下限 [1, 60] µm 防止极端 LWC/N 造成数值发散。
  function operativeRe(lwcGm3) {
    const m = STATE.micro;
    if (m.reMode === 'fixed') return Math.max(0.5, m.effRadiusUm);
    return Math.min(60, Math.max(1, effRadiusFromLWC(lwcGm3, m.dropConc)));
  }
  function visibilityAtAltitude(z, layers, wind, time) {
    const f = sampleFields(0, 0, z, layers, wind, time);
    const beta = extinctionFromLWC(f.lwc, operativeRe(f.lwc));
    return { vis: visibilityFromExt(beta), beta, lwc: f.lwc };
  }
  // 最差能见度：先按高度层做水平网格扫描（默认 3×3，±12 km），得到每层的最小值剖面，
  // 再在剖面里找全局最小。返回 profile / z0 / dz / 每层最差点，供上层做滞回（避免高度来回跳）。
  function worstVisibility(layers, wind, time, opts) {
    opts = opts || {};
    const n = Math.max(1, opts.n || 3);
    const half = opts.half != null ? opts.half : 12;
    const dz = opts.dz || 0.5;
    const prof = [], bxs = [], bys = [], bbs = [];
    let z0 = 0;
    for (let z = 0; z <= 13; z += dz) {
      if (prof.length === 0) z0 = z;
      let vz = Infinity, vx = 0, vy = 0, vb = 0;
      for (let ix = 0; ix < n; ix++) {
        const x = n === 1 ? 0 : -half + (2 * half) * ix / (n - 1);
        for (let iy = 0; iy < n; iy++) {
          const y = n === 1 ? 0 : -half + (2 * half) * iy / (n - 1);
          const f = sampleFields(x, y, z, layers, wind, time);
          const beta = extinctionFromLWC(f.lwc, operativeRe(f.lwc));
          const vis = visibilityFromExt(beta);
          if (isFinite(vis) && vis < vz) { vz = vis; vx = x; vy = y; vb = beta; }
        }
      }
      prof.push(vz); bxs.push(vx); bys.push(vy); bbs.push(vb);
    }
    let bi = 0;
    for (let i = 1; i < prof.length; i++) if (prof[i] < prof[bi]) bi = i;
    return {
      vis: prof[bi], alt: z0 + bi * dz, beta: bbs[bi], x: bxs[bi], y: bys[bi],
      z0, dz, profile: prof, bx: bxs, by: bys,
    };
  }

  // ============ 微物理参数化映射（诊断叙事）============
  function microMapping() {
    const m = STATE.micro;
    return {
      scheme: 'Kessler (1969) 暖云参数化（单柱 q_c/q_r 积分；不反馈 3D 渲染）',
      params: [
        { key: 'effRadiusUm', label: '云滴有效半径 r_e', value: m.effRadiusUm, unit: 'µm',
          mapsTo: '消光/散射谱型与自动转化尺度依赖；决定能见度与雷达反射率' },
        { key: 'dropConc', label: '云滴数浓度 N', value: m.dropConc, unit: 'cm⁻³',
          mapsTo: '影响 r_e（N↑→r_e↓→消光↑→能见度↓），与 Twomey 效应相关' },
        { key: 'autoConvK', label: '自动转化系数 k1', value: m.autoConvK, unit: 's⁻¹',
          mapsTo: 'Kessler P_ac = k1·(q_c − qc0)：雨滴自动转化速率（参与单柱积分）' },
        { key: 'autoConvQc0', label: '自动转化阈值 qc0', value: m.autoConvQc0, unit: 'kg/kg',
          mapsTo: 'Kessler 临界云水含量（常用 0.5–1 g/kg）：低于此不产生雨（参与单柱积分）' },
        { key: 'accretK', label: '碰并系数 k2', value: m.accretK, unit: '—',
          mapsTo: 'Kessler P_gr = k2·q_c·q_r：云水碰并增长（参与单柱积分）' },
        { key: 'iceFrac', label: '冰相占比', value: m.iceFrac, unit: '—',
          mapsTo: '混合相/冰云分支；影响散射谱型与消光（冰晶消光弱于水滴）' },
      ],
    };
  }

  // ============ 带版本号的快照序列化 ============
  function serialize() {
    return {
      app: APP_NAME,
      snapshotVersion: SNAPSHOT_VERSION,
      savedAt: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(STATE)),
    };
  }
  function deserialize(obj) {
    if (!obj || obj.state == null) throw new Error('快照格式无效');
    if (obj.snapshotVersion !== SNAPSHOT_VERSION) {
      console.warn('CloudField: 快照版本 ' + obj.snapshotVersion +
        ' 与当前 ' + SNAPSHOT_VERSION + ' 不完全兼容，已尽量映射。');
    }
    const s = obj.state;
    const scalarKeys = ['surfaceTemp','surfacePressure','surfaceRH','lapseRate','dewLapse','dryLapseRate',
      'windSpeed','windDir','sunElev','sunAz','autoLife','lifeManual','lifePhase',
      'convection','simSpeed','viewMode','sliceAlt','showSlice','tintField','tintAmt',
      'showSun','showGrid','quality','envCycle','envT','envRH','fieldBand'];
    for (const k of scalarKeys) if (s[k] !== undefined) STATE[k] = s[k];
    if (s.layers) for (const k of LAYER_ORDER) if (s.layers[k]) Object.assign(STATE.layers[k], s.layers[k]);
    if (s.micro) Object.assign(STATE.micro, s.micro);
    if (s.spectrum) Object.assign(STATE.spectrum, s.spectrum);
    if (s.phases) Object.assign(STATE.phases, s.phases);
    if (s.aerosol) Object.assign(STATE.aerosol, s.aerosol);
    if (s.operators) Object.assign(STATE.operators, s.operators);
    if (s.kessler) Object.assign(STATE.kessler, s.kessler);
    return true;
  }

  // ============ 探空验证（最小真实验证）============
  // 公开探空（radiosonde）通常可在 University of Wyoming (weather.uwyo.edu) 获取。
  // 内置一份“代表性样本”（示意），用于把计算能见度与实测并排对照；
  // 可通过“导入探空”载入真实数据（格式：高度km, 气压hPa, 温度°C, 露点°C）。
  const RADIOSONDE_SAMPLE = {
    station: '示例站 (representative sample)',
    note: '示意数据，非实测；请用导入功能载入真实 radiosonde',
    data: [
      [0.0, 1013, 15.0, 11.0], [0.5, 954, 11.5, 8.5], [1.0, 898, 8.0, 5.5],
      [1.5, 845, 4.5, 2.5], [2.0, 795, 1.5, -0.5], [2.5, 748, -1.5, -3.5],
      [3.0, 701, -4.5, -7.0], [4.0, 616, -10.0, -13.0], [5.0, 540, -16.0, -20.0],
      [6.0, 472, -22.0, -27.0], [7.0, 411, -28.0, -34.0], [8.0, 356, -34.0, -41.0],
      [10.0, 264, -46.0, -54.0], [12.0, 194, -58.0, -67.0],
    ],
  };
  function validateAgainstRadiosonde(sonde) {
    const src = sonde || RADIOSONDE_SAMPLE;
    const layers = effectiveLayers();
    const wind = { x: STATE.windSpeed, dir: STATE.windDir };
    return src.data.map(row => {
      const z = row[0], p = row[1], T = row[2], Td = row[3];
      const f = sampleFields(0, 0, z, layers, wind, 0);
      const beta = extinctionFromLWC(f.lwc, operativeRe(f.lwc));
      const vis = visibilityFromExt(beta);
      return { z, p, T, Td, modelVis: isFinite(vis) ? vis : null, lwc: f.lwc, beta };
    });
  }

  function profile(z) {
    const f = sampleFields(0, 0, z, effectiveLayers(), { x: STATE.windSpeed, dir: STATE.windDir }, 0);
    return {
      temp: tempAt(z), dew: dewAt(z), pressure: pressureAt(z),
      rho: airDensityAt(z), density: airDensityAt(z),
      lwc: f.lwc, cloud: f.density,
      sat: tempAt(z) <= dewAt(z),
    };
  }

  global.Atmosphere = {
    APP_NAME, SNAPSHOT_VERSION, CLOUD_META, LAYER_ORDER, STATE,
    LWC_MAX, KOSCHMEIER_EPS, RHO_W, MAX_ALT, WIND_SCALE,
    lclHeight, tempAt, dewAt, dewpointFromRH, pressureAt, airDensityAt, freezingLevel,
    effectiveLayers, sampleFields,
    extinctionFromLWC, visibilityFromExt, visibilityAtAltitude, worstVisibility,
    lwcFromDensity, betaFromLWC, effRadiusFromLWC, operativeRe, totalCloudCover,
    microMapping, serialize, deserialize,
    RADIOSONDE_SAMPLE, validateAgainstRadiosonde, profile,
  };
})(window);
