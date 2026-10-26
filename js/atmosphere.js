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
    profileMode: 'tz',        // 底部廓线图坐标模式：tz (直角 T-z 廓线) | skewt (气象标准 Skew-T log-p 斜温图)
    thermoCoupledBase: false, // 热力学 LCL 自动锚定对流云 (cu/cb) 云底高度
    sliceAlt: 3.0,
    showSlice: true,          // 3D 云场里的剖面高度亮线
    tintField: 'off',         // 微物理着色叠加：off|lwc|beta|re|Nd
    tintAmt: 0.45,            // 叠加不透明度
    showSun: true,
    showGrid: true,
    quality: 0.8,

    // —— 云微物理参数化（映射到具体方案参数，用于“诊断”）——
    micro: {
      scheme: 'kessler',      // 参数化方案：kessler (1969 单矩) | kk2000 (Khairoutdinov-Kogan 双矩) | sb06 (Seifert-Beheng 双矩/ICON)
      effRadiusUm: 8.0,       // 云滴有效半径 re (µm)
      dropConc: 300,          // 云滴数浓度 N (cm⁻³)
      autoConvK: 1.0e-3,      // Kessler 自动转化系数 k1 (s⁻¹)
      autoConvQc0: 5.0e-4,    // 自动转化临界云水含量 qc0 (kg/kg)
      accretK: 2.2,           // 碰并( accretion )系数 k2
      iceFrac: 0.0,           // 混合相冰相占比 0–1（与 phases.ice 同步联动）
      autoPhaseTemp: false,   // 按温度廓线自动分配混合相冰/水比（Korolev 0 ~ -38°C 区间）
      ccnCoupled: false,      // 气溶胶–上升气流 Köhler/Twomey 活化耦合（由 β_aer 与对流 w 动态决定 N_c）
      reMode: 'derived',      // r_e 来源：derived = 由 LWC 与 N 反推；fixed = 用 effRadiusUm 滑块
    },

    // —— ETH CLOUDLAB 过冷水云人工播云试验（Wegener–Bergeron–Findeisen 冰化消散沟）——
    seeding: {
      on: false,              // 是否启用播云消雾试验
      agent: 'agi',           // 催化剂：agi (碘化银 AgI，活化温度 ≤ -4°C) | co2 (液态CO2/干冰，均质成核 ≤ -0.5°C)
      inpConc: 80,            // 播撒冰核数浓度 N_INP (L⁻¹)
      x0: -8.0,               // 播撒源水平位置 X (km)
      z0: 0.0,                // 播撒源水平位置 Y/Z (km)
      alt: 1.1,               // 播撒作业高度 (km)
      width: 2.2,             // 初始播撒羽流半宽 (km)
      diffK: 0.30,            // 下风向湍流扩散展宽系数
      glaciationEff: 0.85,    // WBF 水汽竞争冰化沉降对液水消光的削减效率 (0–0.95)
    },

    // —— 粒子谱描述：Gamma / 对数正态 / 实测谱 ——
    spectrum: {
      type: 'gamma',          // gamma | lognormal | measured
      re: 8.0,                // Gamma/对数正态 有效半径 (µm)
      N: 300,                 // 数浓度 (cm⁻³)
      veff: 0.10,             // Gamma 有效方差 ν_eff
      rg: 8.0,                // 对数正态 中值半径 (µm)
      sigmaG: 1.30,           // 对数正态 几何标准差
      measured: null,         // 实测谱：[{r:µm, dNdlnr:cm⁻³}] 或 null
    },

    // —— 相态分档：质量分数（内部按总和归一）——
    phases: { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 },

    // —— 气溶胶背景消光 ——
    aerosol: { on: false, beta0: 1.0e-4, scaleH: 1.5, omega: 0.92 },

    // —— 观测算子开关 ——
    operators: {
      visibility: true, extSplit: false, irradiance: true,
      albedo: true, satellite: true, lidar: true, radar: true,
    },

    // —— Kessler / 多方案单柱预报状态（q_c / q_r，按层，kg/kg）——
    kessler: {
      on: true,
      washoutFeedback: true,  // 降水耗云质量守恒反馈：自动转化与碰并消耗的云水实时削减三维/二维云层有效密度
      qc: { ci: 0, cs: 0, sc: 0, cu: 0, cb: 0 },
      qr: { ci: 0, cs: 0, sc: 0, cu: 0, cb: 0 },
      qi: { ci: 0, cs: 0, sc: 0, cu: 0, cb: 0 },
      rainRate: 0, lastPac: 0, lastPgr: 0, lastPwbf: 0, steps: 0,
    },
  };

  // ============ 常量 ============
  const G = 9.80665, R = 287.05;       // 重力、气体常数
  const WIND_SCALE = 0.01;
  const RHO_W = 1000;                  // 水密度 kg/m³
  const MAX_ALT = 15;                  // 模拟顶高 km
  const LWC_MAX = 1.2;                 // 密度场归一化上限 g/m³
  const KOSCHMEIER_EPS = 0.02;         // 能见度对比阈值 ε（Koschmieder）

  // ============ 基础气象计算 ============
  function dewpointFromRH(T, RH) {
    const a = 17.27, b = 237.7;
    const rh = Math.min(100, Math.max(0.1, RH)) / 100;
    const g = Math.log(rh) + a * T / (b + T);
    return b * g / (a - g);
  }
  function surfaceTempEff() { return STATE.surfaceTemp + (STATE.envT || 0); }
  function surfaceRHEff() { return Math.min(100, Math.max(1, STATE.surfaceRH + (STATE.envRH || 0))); }

  let useCustomSounding = false;
  function canUseSoundingProfile() {
    if (!useCustomSounding || !activeRadiosonde || !activeRadiosonde.data || activeRadiosonde.data.length < 3) return false;
    const r0 = activeRadiosonde.data[0];
    return Math.abs(STATE.surfaceTemp - r0[2]) < 1e-3 && Math.abs(STATE.surfacePressure - r0[1]) < 1e-2;
  }
  function interpSounding(z, colIdx) {
    const rows = activeRadiosonde.data;
    if (z <= rows[0][0]) return rows[0][colIdx];
    for (let i = 0; i < rows.length - 1; i++) {
      const z0 = rows[i][0], z1 = rows[i + 1][0];
      if (z >= z0 && z <= z1) {
        const t = (z1 - z0) > 1e-6 ? (z - z0) / (z1 - z0) : 0;
        return rows[i][colIdx] + t * (rows[i + 1][colIdx] - rows[i][colIdx]);
      }
    }
    const last = rows[rows.length - 1];
    const dz = z - last[0];
    if (colIdx === 2) return last[2] - STATE.lapseRate * dz;
    if (colIdx === 3) return last[3] - STATE.dewLapse * dz;
    return last[1] * Math.exp(-dz / 7.4);
  }

  function dewAt(z) {
    if (canUseSoundingProfile()) return interpSounding(z, 3) + (STATE.envT || 0);
    return dewpointFromRH(surfaceTempEff(), surfaceRHEff()) - STATE.dewLapse * z;
  }
  function tempAt(z) {
    if (canUseSoundingProfile()) return interpSounding(z, 2) + (STATE.envT || 0);
    return surfaceTempEff() - STATE.lapseRate * z;
  }
  function lclHeight() {
    const T0 = surfaceTempEff();
    const Td0 = dewpointFromRH(T0, surfaceRHEff());
    const d = T0 - Td0;
    const gamma = Math.max(4, STATE.dryLapseRate || 9.8);
    return Math.max(0, d / gamma);
  }
  function pressureAt(z) {
    if (canUseSoundingProfile() && z >= 0) return Math.max(50, interpSounding(z, 1));
    const Tk0 = surfaceTempEff() + 273.15;
    const Tk = tempAt(z) + 273.15;
    const lr = Math.max(0.05, STATE.lapseRate);
    const expo = 1000 * G / (R * lr);
    return STATE.surfacePressure * Math.pow(Tk / Tk0, expo);
  }
  function airDensityAt(z) {
    const p = pressureAt(z) * 100;
    const Tk = tempAt(z) + 273.15;
    return p / (R * Tk);
  }
  // 大气边界层与自由对流层垂直风廓线、Ekman 风向顺转、湍流动能 TKE k(z) 与耗散率 ε(z)（供 MATLAB / Simulink 与 OpenFOAM / Fluent CFD 入口边界使用）
  function windProfileAt(z) {
    const zz = Math.max(0, z || 0);
    const zm = Math.max(10, zz * 1000);
    const u10 = Math.max(0, STATE.windSpeed || 0);
    const dir0 = STATE.windDir || 0;
    const zAblM = 1200;
    // Hellmann 幂律边界层切变 (α=0.16) + 自由大气热成风切变
    const speedMs = u10 > 0
      ? u10 * Math.pow(Math.min(zm, zAblM) / 10, 0.16) + Math.max(0, zz - 1.2) * (0.15 * u10 + 0.8)
      : 0;
    // 北半球 Ekman 螺线边界层风向随高度顺时针偏转 (0 → +20°)
    const ekmanVeerDeg = u10 > 0 ? 20 * (1 - Math.exp(-zz / 0.65)) : 0;
    const dirDeg = ((dir0 + ekmanVeerDeg) % 360 + 360) % 360;
    const goRad = (dirDeg + 180) * Math.PI / 180;
    const uMs = +(speedMs * Math.sin(goRad)).toFixed(3);
    const vMs = +(speedMs * Math.cos(goRad)).toFixed(3);
    const conv = Math.max(0, STATE.convection || 0) / 100;
    const wUpdraftMs = +(conv * 2.5 * Math.exp(-Math.pow((zz - 2.0) / 2.2, 2))).toFixed(3);
    // 边界层摩擦速度 u*、混合长 l_m 与 k-ε 湍流闭合量 (C_μ = 0.09)
    const uStar = 0.082 * u10 + 0.06;
    const wStar = 2.2 * conv;
    const cMu = 0.09;
    const tkeM2s2 = +Math.max(0.015, (uStar * uStar / Math.sqrt(cMu)) * Math.exp(-zz / 1.8) + 0.35 * wStar * wStar * Math.exp(-Math.pow((zz - 1.6) / 2.4, 2))).toFixed(4);
    const kappaZ = 0.41 * zm;
    const lMixM = Math.max(2.0, kappaZ / (1 + kappaZ / 45));
    const epsM2s3 = +Math.max(1e-6, Math.pow(cMu, 0.75) * Math.pow(tkeM2s2, 1.5) / lMixM).toFixed(6);
    const pHpa = pressureAt(zz);
    const tC = tempAt(zz);
    const tdC = dewAt(zz);
    const thetaK = +((tC + 273.15) * Math.pow(1000 / Math.max(10, pHpa), 0.2854)).toFixed(2);
    const rhoKgm3 = +airDensityAt(zz).toFixed(4);
    const edHpa = 6.112 * Math.exp((17.67 * tdC) / (tdC + 243.5));
    const qvKgkg = +Math.max(0, (0.622 * edHpa) / Math.max(10, pHpa - 0.378 * edHpa)).toFixed(6);
    return {
      zKm: zz,
      zM: Math.round(zz * 1000),
      speedMs: +speedMs.toFixed(3),
      dirDeg: +dirDeg.toFixed(1),
      uMs,
      vMs,
      wUpdraftMs,
      tkeM2s2,
      epsM2s3,
      thetaK,
      rhoKgm3,
      qvKgkg,
    };
  }
  function freezingLevel() {
    if (canUseSoundingProfile()) {
      for (let z = 0; z <= 12; z += 0.1) {
        if (tempAt(z) <= 0) return +z.toFixed(2);
      }
    }
    const T0 = surfaceTempEff();
    if (STATE.lapseRate <= 0) return T0 <= 0 ? 0 : 999;
    return Math.max(0, T0 / STATE.lapseRate);
  }

  // 大气热力学核心守恒/准守恒特征量诊断（Bolton 1980 精确公式 + Normand/Stull 湿球温度）：
  // 输出虚温 Tv(°C)、湿球温度 Tw(°C)、位温 θ(K)、相当位温 θe(K)、饱和相当位温 θes(K)、水汽混合比 rv(g/kg) 与饱和混合比 rs(g/kg)
  function thermoProfileAt(z) {
    const zz = Math.max(0, z || 0);
    const T = tempAt(zz);
    const Td = Math.min(T, dewAt(zz));
    const p = Math.max(20, pressureAt(zz));
    const Tk = T + 273.15;
    const Tdk = Math.max(150, Td + 273.15);
    const es = 6.112 * Math.exp((17.67 * T) / (T + 243.5));
    const e = Math.min(es, 6.112 * Math.exp((17.67 * Td) / (Td + 243.5)));
    const rhPct = Math.max(0.5, Math.min(100, (e / Math.max(1e-6, es)) * 100));
    const qv = (0.622 * e) / Math.max(10, p - 0.378 * e);       // kg/kg
    const qs = (0.622 * es) / Math.max(10, p - 0.378 * es);     // kg/kg
    const rvGkg = qv * 1000;                                    // g/kg
    const rsGkg = qs * 1000;                                    // g/kg
    // 虚温 Tv (°C)：计入水汽分子量小于干空气导致的浮力增幅
    const tvK = Tk * (1 + 0.608 * qv);
    const virtualTempC = +(tvK - 273.15).toFixed(2);
    // 湿球温度 Tw (°C)：先由 Stull (2011) 经验式初猜，再用干湿球方程迭代 2 步以兼容高空低气压
    let tw = T * Math.atan(0.151977 * Math.pow(rhPct + 8.313659, 0.5))
      + Math.atan(T + rhPct) - Math.atan(rhPct - 1.676331)
      + 0.00391838 * Math.pow(rhPct, 1.5) * Math.atan(0.023101 * rhPct) - 4.686035;
    tw = Math.max(Td, Math.min(T, tw));
    const gammaPsychro = 0.000662 * p;
    for (let it = 0; it < 2; it++) {
      const esTw = 6.112 * Math.exp((17.67 * tw) / (tw + 243.5));
      const dEs = (4302.645 * esTw) / Math.pow(tw + 243.5, 2);
      const f = esTw - e + gammaPsychro * (tw - T);
      tw -= f / Math.max(1e-4, dEs + gammaPsychro);
      tw = Math.max(Td, Math.min(T, tw));
    }
    const wetBulbTempC = +tw.toFixed(2);
    // Bolton (1980, MWR Eq. 15, 38, 39) 凝结高度温度 T_LCL (K)、位温 θ (K)、相当位温 θ_e (K) 与饱和相当位温 θ_es (K)
    const thetaDryK = Tk * Math.pow(1000 / p, 0.2854 * (1 - 0.28e-3 * rvGkg));
    const tLclK = 1 / (1 / (Tdk - 56) + Math.log(Tk / Tdk) / 800) + 56;
    const thetaEK = thetaDryK * Math.exp((3.376 / tLclK - 0.00254) * rvGkg * (1 + 0.81e-3 * rvGkg));
    const thetaEsK = Tk * Math.pow(1000 / p, 0.2854 * (1 - 0.28e-3 * rsGkg))
      * Math.exp((3.376 / Tk - 0.00254) * rsGkg * (1 + 0.81e-3 * rsGkg));
    return {
      zKm: zz,
      tempC: +T.toFixed(2),
      dewC: +Td.toFixed(2),
      virtualTempC,
      wetBulbTempC,
      pressureHpa: +p.toFixed(2),
      rhPct: +rhPct.toFixed(1),
      rvGkg: +rvGkg.toFixed(2),
      rsGkg: +rsGkg.toFixed(2),
      thetaK: +thetaDryK.toFixed(2),
      thetaEK: +thetaEK.toFixed(2),
      thetaEsK: +thetaEsK.toFixed(2),
    };
  }

  // 湿球零度层高度 (Wet-Bulb Zero Level, WBZ, Tw = 0°C)：决定降雪融化层与冻雨过冷层的真实相变边界
  function wetBulbZeroLevel() {
    const tw0 = thermoProfileAt(0).wetBulbTempC;
    if (tw0 <= 0) return 0;
    let prevZ = 0, prevTw = tw0;
    for (let z = 0.2; z <= 12.0; z = +(z + 0.2).toFixed(2)) {
      const tw = thermoProfileAt(z).wetBulbTempC;
      if (tw <= 0) {
        const frac = (prevTw - 0) / Math.max(1e-4, prevTw - tw);
        return +(prevZ + frac * 0.2).toFixed(2);
      }
      prevZ = z;
      prevTw = tw;
    }
    return 999;
  }

  // 一键将对流云 (cu / cb) 的云底高度同步锚定至当前热力学抬升凝结高度 LCL
  function syncCloudBasesToLCL() {
    const zLcl = Math.max(0.15, Math.min(5.0, +lclHeight().toFixed(2)));
    ['cu', 'cb'].forEach(k => {
      const L = STATE.layers && STATE.layers[k];
      if (L) {
        L.base = zLcl;
        if (L.top < L.base + 0.6) L.top = +(L.base + (k === 'cb' ? 6.0 : 2.2)).toFixed(2);
      }
    });
    return zLcl;
  }

  // 气块干/湿绝热抬升热力学诊断（含虚温 Tv 浮力修正与真实地面逆温盖 CIN）：
  // 计算气块状态曲线 Tp(z)、Tvp(z)、抬升凝结高度 LCL、自由对流高度 LFC、平衡高度 EL、CAPE (J/kg)、CIN (J/kg)、LI、θe(0) 与位势不稳定指数 Δθe(0→3km)
  function parcelThermodynamics(opts) {
    opts = opts || {};
    const gammaD = Math.max(4, STATE.dryLapseRate || 9.8); // K/km
    const zLcl = lclHeight();
    const th0 = thermoProfileAt(0);
    const th3 = thermoProfileAt(3.0);
    const qv0 = (th0.rvGkg || 0) * 1e-3;
    // 地面气块从真实地面温度起抬（保留 LCL 附近真实的负浮力对流抑制能 CIN），对流加热仅作为云内潜热/上升羽流扰动生效
    const sfcDeltaT = opts.deltaT != null ? +opts.deltaT : 0;
    const convBoost = 1.6 * Math.max(0, (STATE.convection || 0) / 100);
    const Tp0 = tempAt(0) + sfcDeltaT;
    const dzKm = 0.2;
    const dzM = dzKm * 1000;
    const Lv = 2.501e6, Cp = 1004, eps = 0.622;
    let Tp = Tp0;
    let lfcKm = null, elKm = null;
    let cape = 0, cin = 0;
    let passedLfc = false;
    let tpAt55 = null, tEnvAt55 = null;
    const parcelPath = [];

    for (let z = 0; z <= MAX_ALT + 1e-6; z = +(z + dzKm).toFixed(2)) {
      const thEnv = thermoProfileAt(z);
      const Tenv = thEnv.tempC;
      const TvEnv = thEnv.virtualTempC;
      const pHpa = thEnv.pressureHpa;
      let qvParcel = qv0;
      if (z === 0) {
        Tp = Tp0;
      } else if (z <= zLcl) {
        Tp = Tp0 - gammaD * z;
      } else {
        const Tk = Tp + 273.15;
        const es = esWater(Tp);
        const rs = eps * es / Math.max(10, pHpa - es);
        qvParcel = rs;
        const num = 1 + (Lv * rs) / (R * Tk);
        const den = 1 + (eps * Lv * Lv * rs) / (Cp * R * Tk * Tk);
        const gammaM = Math.max(3.2, Math.min(gammaD, gammaD * (num / den))); // K/km
        Tp = Tp - gammaM * dzKm;
      }
      // 云内对流热泡浮力增幅仅在越过 LCL 凝结高度后随高度渐进释放，不破坏云下 CIN 逆温层
      const inCloudBoost = z > zLcl ? convBoost * Math.min(1, (z - zLcl) / 0.8) : 0;
      const TpEff = Tp + inCloudBoost;
      const TvParcel = ((TpEff + 273.15) * (1 + 0.608 * qvParcel)) - 273.15;
      parcelPath.push({
        z,
        pHpa,
        Tp: +TpEff.toFixed(2),
        Tvp: +TvParcel.toFixed(2),
        Tenv: +Tenv.toFixed(2),
        TvEnv: +TvEnv.toFixed(2),
        thetaEK: thEnv.thetaEK,
        wetBulbC: thEnv.wetBulbTempC,
      });
      if (Math.abs(z - 5.4) < 0.11) {
        tpAt55 = TpEff;
        tEnvAt55 = Tenv;
      }
      // 严格采用虚温 Tv 计算阿基米德浮力 B = g · (Tv_p - Tv_env) / Tv_env,K
      const buoy = G * ((TvParcel - TvEnv) / (TvEnv + 273.15)); // m/s²
      if (z >= zLcl) {
        if (TvParcel > TvEnv) {
          if (lfcKm === null) {
            lfcKm = z;
            passedLfc = true;
          }
          cape += buoy * dzM;
          elKm = z;
        } else if (!passedLfc && z <= 6.0) {
          cin += Math.abs(buoy) * dzM;
        }
      } else if (!passedLfc && TvParcel < TvEnv && z > 0) {
        cin += Math.abs(buoy) * dzM;
      }
    }
    const liftedIndex = (tEnvAt55 != null && tpAt55 != null) ? +(tEnvAt55 - tpAt55).toFixed(1) : 0;
    const deltaThetaE0to3Km = +(th3.thetaEK - th0.thetaEK).toFixed(2);
    return {
      lclKm: +zLcl.toFixed(2),
      lfcKm: lfcKm != null ? +lfcKm.toFixed(2) : null,
      elKm: (elKm != null && lfcKm != null && elKm > lfcKm) ? +elKm.toFixed(2) : null,
      capeJkg: Math.round(cape),
      cinJkg: Math.round(cin),
      liftedIndex,
      virtualTempCorrected: true,
      theta0K: th0.thetaK,
      thetaE0K: th0.thetaEK,
      wetBulbSfcC: th0.wetBulbTempC,
      wetBulbZeroKm: wetBulbZeroLevel(),
      deltaThetaE0to3Km,
      potentiallyUnstable: deltaThetaE0to3Km < -1.0,
      parcelPath,
    };
  }

  // Murphy & Koop (2005) / Bolton (1980) 液态水与冰晶表面饱和水汽压 (hPa) 及 WBF 热力学水汽压差 Δe_wi(T)
  function esWater(T) {
    return 6.112 * Math.exp((17.67 * T) / (T + 243.5));
  }
  function esIce(T) {
    if (T >= 0) return esWater(T);
    return 6.1115 * Math.exp((22.46 * T) / (T + 272.62));
  }
  function wbfVaporDiff(T) {
    const esw = esWater(T);
    if (T >= 0) return { esw, esi: esw, diffHpa: 0, siPct: 0, normFactor: 0 };
    const esi = esIce(T);
    const diffHpa = Math.max(0, esw - esi);                  // 在 T ≈ -12.5°C 达热力学极大值 ~0.268 hPa
    const siPct = Math.max(0, (esw / Math.max(1e-6, esi) - 1) * 100);
    const normFactor = Math.min(1.25, diffHpa / 0.268);
    return { esw, esi, diffHpa, siPct, normFactor };
  }

  // Twomey (1959) / Abdul-Razzak & Ghan (2000) 气溶胶-上升气流云滴活化参数化：
  // 由背景气溶胶消光系数 β_0 与对流上升速度 w 计算活化云滴数浓度 N_c (cm⁻³)
  function operativeDropConc() {
    const m = STATE.micro || {};
    if (!m.ccnCoupled) return Math.max(10, m.dropConc || 300);
    const a = STATE.aerosol || {};
    const beta0 = a.on ? Math.max(1e-5, a.beta0 || 1e-4) : 1e-4;
    const Na = Math.min(4000, Math.max(40, 2.2e6 * Math.pow(beta0, 0.92))); // 等效 CCN 数浓度 cm⁻³
    const w = 0.15 + 3.5 * (Math.max(0, STATE.convection || 0) / 100);      // 特征云底上升气流速度 m/s
    const wPow = Math.pow(w, 0.45);
    const Nc = (Na * wPow) / (wPow + 0.045 * Math.pow(Na, 0.60));
    return Math.round(Math.min(1500, Math.max(20, Nc)));
  }

  // 温度自适应或手动统一的冰相比例（打通 micro.iceFrac 与 phases.ice）
  function iceFractionAt(z) {
    if (STATE.micro && STATE.micro.autoPhaseTemp && z != null) {
      const T = tempAt(z);
      if (T >= 0) return 0;
      if (T <= -38) return 1;
      // Korolev 混合相温度分配曲线：0°C 纯水 → -38°C 同质冻结纯冰
      return Math.min(1, Math.max(0, Math.pow(-T / 38, 1.35)));
    }
    return Math.min(1, Math.max(0, (STATE.micro && STATE.micro.iceFrac) || 0));
  }

  // ETH CLOUDLAB 人工播云下风向两阶段羽流（Wegener–Bergeron–Findeisen 冰化过渡区 + 沉降消云沟槽）
  // 阶段 1（近源端 0~2.5 km）：过冷水向新生冰晶快速转化（冰晶有效粒径更大、消光初步降低，且冰相占比跃升）；
  // 阶段 2（中远端 >2.5 km）：冰晶聚合成雪晶沉降出云层，形成高能见度消云沟槽（Seeding Trench）。
  function seedingPlumeAt(x, y, z) {
    const sd = STATE.seeding;
    if (!sd || !sd.on) return { depletion: 0, iceBoost: 0 };
    const dz = Math.abs(z - (sd.alt != null ? sd.alt : 1.1));
    if (dz > 0.95) return { depletion: 0, iceBoost: 0 };
    const vWeight = Math.exp(-Math.pow(dz / 0.55, 2));

    const T = tempAt(z);
    // 暖云物理硬约束：T ≥ 0°C 时水汽对冰无过饱和（Δe_wi = 0），冰晶融化，不发生 WBF 冰化消云
    if (T >= 0) return { depletion: 0, iceBoost: 0 };
    const agent = String(sd.agent || 'agi').toLowerCase();
    const thresh = agent === 'co2' ? -0.5 : -5.0;
    const wbf = wbfVaporDiff(T);
    const tFactor = T <= thresh
      ? Math.min(1.15, 0.72 + 0.43 * wbf.normFactor)
      : (agent === 'co2' ? (0.45 + 0.30 * wbf.normFactor) : Math.max(0, ((thresh - T + 5.0) / 5.0) * 0.35 * wbf.normFactor));
    if (tFactor <= 0) return { depletion: 0, iceBoost: 0 };

    const goRad = ((STATE.windDir || 270) + 180) * Math.PI / 180;
    const ux = Math.sin(goRad), uy = Math.cos(goRad);
    const dx = x - (sd.x0 != null ? sd.x0 : -8.0);
    const dy = y - (sd.z0 != null ? sd.z0 : 0.0);
    const along = dx * ux + dy * uy;          // 下风向距离 km
    const cross = -dx * uy + dy * ux;         // 横风向偏距 km
    if (along < -1.0 || along > 32.0) return { depletion: 0, iceBoost: 0 };

    const alongRamp = along < 0 ? Math.exp(-along * along * 2.5) : 1.0;
    // 近源端冰晶刚成核尚未完全沉降（保留 35% 冰晶散射过渡），下风向随距离指数沉降清空至 100% 沟槽效率
    const falloutRamp = along <= 0 ? 0.35 : (0.35 + 0.65 * (1 - Math.exp(-along / 1.8)));
    const halfW = Math.max(0.4, (sd.width || 2.2) + (sd.diffK || 0.30) * Math.sqrt(Math.max(0, along)));
    const crossWeight = Math.exp(-Math.pow(cross / halfW, 2));
    const inpSat = 1 - Math.exp(-Math.max(0, sd.inpConc || 80) / 35);
    const eff = Math.min(0.95, Math.max(0, sd.glaciationEff != null ? sd.glaciationEff : 0.85));
    const core = inpSat * tFactor * vWeight * alongRamp * crossWeight;
    const depletion = Math.min(0.95, eff * core * falloutRamp);
    // 羽流内部残余水凝物的冰晶化增幅（近源端最强，贯穿整个播云羽流）
    const iceBoost = Math.min(1.0, core * (0.65 + 0.35 * Math.exp(-Math.max(0, along) / 6.0)));
    return { depletion, iceBoost };
  }
  function seedingDepletionAt(x, y, z) {
    return seedingPlumeAt(x, y, z).depletion;
  }
  function seedingIceBoostAt(x, y, z) {
    return seedingPlumeAt(x, y, z).iceBoost;
  }

  // ============ 云层有效范围（随对流/生消变化、LCL 云底耦合及 Kessler 降水耗云质量守恒反馈）============
  function effectiveLayers() {
    const life = STATE.autoLife ? (0.5 + 0.5 * Math.sin(STATE.lifePhase)) : STATE.lifeManual;
    const conv = STATE.convection / 100;
    const zLcl = STATE.thermoCoupledBase ? Math.max(0.15, Math.min(5.0, lclHeight())) : null;
    const kes = STATE.kessler;
    const useWashout = !!(kes && kes.on && kes.washoutFeedback !== false);
    return LAYER_ORDER.filter(k => STATE.layers[k].on).map(k => {
      const L = STATE.layers[k];
      const isCoupledConv = zLcl != null && (k === 'cu' || k === 'cb');
      const baseAnchor = isCoupledConv ? zLcl : L.base;
      let top = L.top;
      if (isCoupledConv && top < baseAnchor + 0.4) top = baseAnchor + (k === 'cb' ? 5.0 : 1.8);
      if (k === 'cu' || k === 'cb') {
        const grow = 1 + conv * (k === 'cb' ? 2.6 : 1.2) * life;
        top = Math.min(15, baseAnchor + (top - baseAnchor) * grow);
      }
      const effBase = Math.max(0, baseAnchor);
      const effScale = Math.max(0.02, L.scale);
      const lifeMod = 0.78 + 0.30 * life;
      let densMod = 0.85 + 0.25 * life;
      if (useWashout) {
        const qrL = (kes.qr && kes.qr[k]) || 0;
        const qiL = (kes.qi && kes.qi[k]) || 0;
        const washoutFac = Math.max(0.25, 1 - 150 * qrL - 90 * qiL);
        densMod *= washoutFac;
      }
      return {
        key: k, base: effBase, top,
        coverage: Math.min(1, L.coverage * lifeMod),
        density: Math.min(1, L.density * densMod),
        scale: L.scale, detail: L.detail,
        invThick: 1 / Math.max(0.05, top - effBase),
        invScale: 1 / effScale,
        keyOffset: k.length * 13.0,
        kind: CLOUD_META[k].kind,
        type: LAYER_ORDER.indexOf(k),
      };
    });
  }

  // ============ 密度场采样（与 3D 着色器严格同源的三维连续值噪声）============
  function fract(x) { return x - Math.floor(x); }
  function hash3(px, py, pz) {
    px = fract(px * 0.3183099 + 0.1);
    py = fract(py * 0.3183099 + 0.1);
    pz = fract(pz * 0.3183099 + 0.1);
    px *= 17.0; py *= 17.0; pz *= 17.0;
    return fract(px * py * pz * (px + py + pz));
  }
  function vnoise(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3.0 - 2.0 * fx);
    fy = fy * fy * (3.0 - 2.0 * fy);
    fz = fz * fz * (3.0 - 2.0 * fz);
    const c000 = hash3(ix, iy, iz),         c100 = hash3(ix + 1, iy, iz);
    const c010 = hash3(ix, iy + 1, iz),     c110 = hash3(ix + 1, iy + 1, iz);
    const c001 = hash3(ix, iy, iz + 1),     c101 = hash3(ix + 1, iy, iz + 1);
    const c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);
    return ((c000 * (1 - fx) + c100 * fx) * (1 - fy) + (c010 * (1 - fx) + c110 * fx) * fy) * (1 - fz)
         + ((c001 * (1 - fx) + c101 * fx) * (1 - fy) + (c011 * (1 - fx) + c111 * fx) * fy) * fz;
  }
  function fbm(x, y, z) {
    let a = 0.5, s = 0.0;
    for (let i = 0; i < 5; i++) {
      s += a * vnoise(x, y, z);
      x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5;
    }
    return s;
  }
  function smoothstep2(a, b, x) {
    const t = Math.max(0.0, Math.min(1.0, (x - a) / (b - a)));
    return t * t * (3.0 - 2.0 * t);
  }
  function sampleFields(x, y, z, layers, wind, time) {
    const wDir = (wind && wind.dir != null) ? wind.dir : 270;
    const wSpd = (wind && wind.x) || 0;
    // 气象风向为来向，顺风平流方向需 +180°；上游回溯采样 p - u_go * t
    const goRad = (wDir + 180) * 0.017453292519943295;
    const wx = Math.sin(goRad) * wSpd * WIND_SCALE;
    const wz = Math.cos(goRad) * wSpd * WIND_SCALE;
    const t = time || 0;
    const px = x - wx * t, pz = y - wz * t;
    let density = 0, lwc = 0;
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      if (L.density < 0.001 || z < L.base || z > L.top) continue;
      const h = (z - L.base) / Math.max(0.001, L.top - L.base);
      const ty = L.type != null ? L.type : LAYER_ORDER.indexOf(L.key);
      let peak = 0.5, w = 1.0;
      if (ty < 0.5) { peak = 0.75; w = 0.7; }
      else if (ty < 1.5) { peak = 0.5; w = 1.0; }
      else if (ty < 2.5) { peak = 0.4; w = 1.6; }
      else if (ty < 3.5) { peak = 0.32; w = 1.3; }
      else { peak = 0.4; w = 1.1; }
      const d2 = (h - peak) * 2.0;
      const vfall = Math.exp(-d2 * d2 * w);
      const sc = Math.max(0.02, L.scale || 0.10);
      const det = L.detail != null ? L.detail : 0.5;
      const nx = px * sc + ty * 13.7 + 3.1, ny = (z * 0.5) * sc, nz = pz * sc + ty * 7.3 + 5.7;
      let n = fbm(nx, ny, nz);
      n += det * (fbm(nx * 3.1, ny * 3.1, nz * 3.1) - 0.5) * 0.6;
      n = Math.max(0.0, Math.min(1.0, n));
      const thresh = 0.76 - L.coverage * 0.55;
      const cov = smoothstep2(thresh - 0.09, thresh + 0.09, n) * (0.65 + 0.35 * n);
      const d = cov * L.density * vfall;
      if (d > 0) {
        density += d;
        const lwcLayer = (d < 1 ? d : 1) * LWC_MAX * (L.kind === 'ice' ? 0.4 : 1.0);
        if (lwcLayer > lwc) lwc = lwcLayer;
      }
    }
    // 叠加 ETH CLOUDLAB 人工播云 WBF 冰化消散沟减消光效应
    const seedDep = (STATE.seeding && STATE.seeding.on) ? seedingDepletionAt(x, y, z) : 0;
    if (seedDep > 0) {
      density *= (1 - seedDep);
      lwc *= (1 - seedDep);
    }
    if (density > 1.5) density = 1.5;
    return { density, lwc, seedDepletion: seedDep, temp: tempAt(z), dew: dewAt(z), pressure: pressureAt(z) };
  }

  // ============ 能见度 / 消光（可信度核心）============
  function extinctionFromLWC(lwc_gm3, effRadiusUm) {
    const lwc = lwc_gm3 / 1000;
    const re = Math.max(1e-6, effRadiusUm * 1e-6);
    return (3 * lwc) / (2 * RHO_W * re);
  }
  function visibilityFromExt(beta) {
    if (beta <= 1e-6) return Infinity;
    return -Math.log(KOSCHMEIER_EPS) / beta;
  }
  function lwcFromDensity(d, kind) { return Math.min(1, Math.max(0, d)) * LWC_MAX * (kind === 'ice' ? 0.4 : 1.0); }
  function betaFromLWC(lwc_gm3, reUm) { return 1500 * lwc_gm3 / Math.max(0.5, reUm); }
  function effRadiusFromLWC(lwc_gm3, N_cm3, veff) {
    const lwcKg = lwc_gm3 / 1000, Nm3 = Math.max(1, N_cm3) * 1e6;
    const vFac = (veff != null && isFinite(veff) && veff > 0) ? (1 + 3 * veff) : 1;
    return 1e6 * Math.pow(Math.max(1e-20, 3 * lwcKg / (4 * Math.PI * RHO_W * Nm3 * vFac)), 1 / 3);
  }
  function totalCloudCover() {
    let clear = 1;
    effectiveLayers().forEach(L => { clear *= (1 - Math.min(1, L.coverage)); });
    return (1 - clear) * 100;
  }

  function operativeRe(lwcGm3) {
    if (STATE.spectrum && STATE.spectrum.type === 'measured' && global.Spectrum && typeof global.Spectrum.moments === 'function') {
      const mr = global.Spectrum.moments().re;
      if (isFinite(mr) && mr > 0) return Math.max(0.5, mr);
    }
    const m = STATE.micro;
    if (m.reMode === 'fixed') {
      if (STATE.spectrum && STATE.spectrum.type === 'lognormal' && global.Spectrum && typeof global.Spectrum.moments === 'function') {
        const lr = global.Spectrum.moments().re;
        if (isFinite(lr) && lr > 0) return Math.max(0.5, lr);
      }
      return Math.max(0.5, m.effRadiusUm);
    }
    const veff = (global.Physics && typeof global.Physics.currentVeff === 'function')
      ? global.Physics.currentVeff()
      : ((STATE.spectrum && isFinite(STATE.spectrum.veff)) ? STATE.spectrum.veff : 0);
    return Math.min(60, Math.max(1, effRadiusFromLWC(lwcGm3, operativeDropConc(), veff)));
  }
  function visibilityAtAltitude(z, layers, wind, time) {
    if (global.Physics && typeof global.Physics.detailedAt === 'function') {
      const d = global.Physics.detailedAt(0, 0, z, layers, wind, time);
      return { vis: visibilityFromExt(d.betaExt), beta: d.betaExt, lwc: d.lwc };
    }
    const f = sampleFields(0, 0, z, layers, wind, time);
    const beta = extinctionFromLWC(f.lwc, operativeRe(f.lwc));
    return { vis: visibilityFromExt(beta), beta, lwc: f.lwc };
  }
  function worstVisibility(layers, wind, time, opts) {
    opts = opts || {};
    const n = Math.max(1, opts.n || 3);
    const half = opts.half != null ? opts.half : 12;
    const dz = opts.dz || 0.5;
    const hasDetailed = !!(global.Physics && typeof global.Physics.detailedAt === 'function');
    const prof = [], bxs = [], bys = [], bbs = [];
    let z0 = 0;
    for (let z = 0; z <= 13; z += dz) {
      if (prof.length === 0) z0 = z;
      let vz = Infinity, vx = 0, vy = 0, vb = 0;
      for (let ix = 0; ix < n; ix++) {
        const x = n === 1 ? 0 : -half + (2 * half) * ix / (n - 1);
        for (let iy = 0; iy < n; iy++) {
          const y = n === 1 ? 0 : -half + (2 * half) * iy / (n - 1);
          let beta;
          if (hasDetailed) {
            beta = global.Physics.detailedAt(x, y, z, layers, wind, time).betaExt;
          } else {
            const f = sampleFields(x, y, z, layers, wind, time);
            beta = extinctionFromLWC(f.lwc, operativeRe(f.lwc));
          }
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
  const SCHEME_LABELS = {
    kessler: 'Kessler (1969) 单矩暖云方案（阈值型自动转化；不依赖 N）',
    kk2000: 'Khairoutdinov & Kogan (2000) 双矩方案（P_ac ∝ q_c^2.47 · N_c^-1.79；LES 基准）',
    sb06: 'Seifert & Beheng (2006) 双矩方案（ICON-LES 原生；含谱宽 ν 与内部时间尺度 τ）',
  };
  function microMapping() {
    const m = STATE.micro;
    const sd = STATE.seeding || {};
    const schemeName = SCHEME_LABELS[m.scheme] || SCHEME_LABELS.kessler;
    return {
      scheme: schemeName + (sd.on ? ' + ETH CLOUDLAB WBF 过冷水播云冰化' : ''),
      params: [
        { key: 'scheme', label: '微物理参数化方案', value: m.scheme || 'kessler', unit: '—',
          mapsTo: '切换 Kessler (1969) / KK2000 / ICON-SB06 (2006) 自动转化与碰并核' },
        { key: 'effRadiusUm', label: '云滴有效半径 r_e', value: m.effRadiusUm, unit: 'µm',
          mapsTo: '消光/散射尺度；决定能见度与米氏消光效率 Q_ext' },
        { key: 'dropConc', label: '云滴数浓度 N_c', value: m.dropConc, unit: 'cm⁻³',
          mapsTo: 'Twomey 效应（N↑→r_e↓→β↑）及双矩方案 Albrecht 效应（N↑→抑制自动转化 P_ac）' },
        { key: 'autoConvK', label: '自动转化系数 k1', value: m.autoConvK, unit: 's⁻¹',
          mapsTo: 'Kessler P_ac = k1·(q_c − qc0)：单矩雨滴自动转化速率系数' },
        { key: 'autoConvQc0', label: '自动转化阈值 qc0', value: m.autoConvQc0, unit: 'kg/kg',
          mapsTo: 'Kessler 临界云水含量（常用 0.5–1 g/kg）：低于此阈值单矩方案不产雨' },
        { key: 'accretK', label: '碰并系数 k2', value: m.accretK, unit: '—',
          mapsTo: 'P_gr = k2·q_c·q_r：雨滴下落收集云水增长速率' },
        { key: 'iceFrac', label: '冰相占比 / Korolev 温度分配', value: m.iceFrac, unit: '—',
          mapsTo: '混合相水/冰质量分配；与相态分档及 Korolev (0 ~ -38°C) 曲线联动' },
        { key: 'inpConc', label: '播云冰核浓度 N_INP', value: sd.inpConc || 0, unit: 'L⁻¹',
          mapsTo: 'ETH CLOUDLAB 过冷水层云播撒（WBF 水汽竞争冰化沉降 → 下风向高能见度消散沟）' },
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
      'showSun','showGrid','quality','envCycle','envT','envRH','fieldBand','profileMode','thermoCoupledBase'];
    for (const k of scalarKeys) if (s[k] !== undefined) STATE[k] = s[k];
    if (s.layers) for (const k of LAYER_ORDER) if (s.layers[k]) Object.assign(STATE.layers[k], s.layers[k]);
    if (s.micro) Object.assign(STATE.micro, s.micro);
    if (s.seeding) Object.assign(STATE.seeding, s.seeding);
    if (s.spectrum) Object.assign(STATE.spectrum, s.spectrum);
    if (s.phases) Object.assign(STATE.phases, s.phases);
    if (s.aerosol) Object.assign(STATE.aerosol, s.aerosol);
    if (s.operators) Object.assign(STATE.operators, s.operators);
    if (s.kessler) Object.assign(STATE.kessler, s.kessler);
    return true;
  }

  // ============ 探空验证（支持导入自定义实测探空与场景同化）============
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
  let activeRadiosonde = RADIOSONDE_SAMPLE;
  function getRadiosonde() { return activeRadiosonde || RADIOSONDE_SAMPLE; }
  function resetRadiosonde() {
    activeRadiosonde = RADIOSONDE_SAMPLE;
    useCustomSounding = false;
    return activeRadiosonde;
  }
  // 解析并导入自定义探空文本（每行: z(km 或 m), p(hPa), T(°C), Td(°C)），可选将温湿压、逆温层折线与直减率同化到当前场景
  function importRadiosonde(text, opts) {
    opts = opts || {};
    const lines = String(text || '').split(/\r?\n/);
    const rows = [];
    for (let ln of lines) {
      ln = ln.trim();
      if (!ln || ln[0] === '#') continue;
      const v = ln.split(/[\s,;]+/).map(Number);
      if (v.length >= 4 && isFinite(v[0]) && isFinite(v[1]) && isFinite(v[2]) && isFinite(v[3])) {
        rows.push([v[0], v[1], v[2], v[3]]);
      }
    }
    if (rows.length < 3) return { ok: false, msg: '探空数据至少需要 3 个有效高度层 (z, p, T, Td)' };
    // 若最大高度 > 50，自动按米 (m) 换算为千米 (km)
    const maxZ = Math.max.apply(null, rows.map(r => r[0]));
    if (maxZ > 50) rows.forEach(r => { r[0] = +(r[0] / 1000).toFixed(3); });
    rows.sort((a, b) => a[0] - b[0]);
    const inversions = [];
    let warmNose = false;
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i + 1][2] > rows[i][2]) {
        inversions.push({ zBaseKm: rows[i][0], zTopKm: rows[i + 1][0], dT: +(rows[i + 1][2] - rows[i][2]).toFixed(2) });
        if (rows[0][2] < 0 && rows[i + 1][2] > 0) warmNose = true;
      }
    }
    activeRadiosonde = {
      station: opts.station || '自定义探空 (Custom Radiosonde)',
      note: '用户导入实测/自定义探空廓线 (' + rows.length + ' 层' + (inversions.length ? ' · 含逆温层' : '') + ')',
      data: rows,
      inversions,
      warmNose,
    };
    if (opts.assimilate !== false) {
      const r0 = rows[0], rTop = rows[rows.length - 1];
      STATE.surfaceTemp = r0[2];
      STATE.surfacePressure = r0[1];
      const a = 17.27, b = 237.7;
      const rh0 = 100 * Math.exp((a * r0[3]) / (b + r0[3]) - (a * r0[2]) / (b + r0[2]));
      STATE.surfaceRH = Math.min(100, Math.max(5, Math.round(rh0)));
      const dz = Math.max(0.5, rTop[0] - r0[0]);
      STATE.lapseRate = Math.min(11, Math.max(0.5, +((r0[2] - rTop[2]) / dz).toFixed(2)));
      STATE.dewLapse = Math.min(4.0, Math.max(0.2, +(STATE.lapseRate - (r0[3] - rTop[3]) / dz).toFixed(2)));
      useCustomSounding = true;
    }
    return { ok: true, count: rows.length, inversions, warmNose, sonde: activeRadiosonde };
  }
  function validateAgainstRadiosonde(sonde) {
    const src = sonde || activeRadiosonde || RADIOSONDE_SAMPLE;
    const layers = effectiveLayers();
    const wind = { x: STATE.windSpeed, dir: STATE.windDir };
    const hasDetailed = !!(global.Physics && typeof global.Physics.detailedAt === 'function');
    return src.data.map(row => {
      const z = row[0], p = row[1], T = row[2], Td = row[3];
      let lwc, beta;
      if (hasDetailed) {
        const d = global.Physics.detailedAt(0, 0, z, layers, wind, 0);
        lwc = d.lwc;
        beta = d.betaExt;
      } else {
        const f = sampleFields(0, 0, z, layers, wind, 0);
        lwc = f.lwc;
        beta = extinctionFromLWC(f.lwc, operativeRe(f.lwc));
      }
      const vis = visibilityFromExt(beta);
      const dtd = Math.max(0, T - Td);
      const rh = 100 * Math.exp((17.27 * Td) / (237.7 + Td) - (17.27 * T) / (237.7 + T));
      let obsVis;
      if (dtd <= 4.0) {
        const lwcObs = Math.max(0.01, 0.42 * Math.exp(-dtd / 1.45) * Math.exp(-Math.max(0, z - 1.2) / 4.5));
        obsVis = Math.min(10000, Math.max(80, visibilityFromExt(extinctionFromLWC(lwcObs, 9.5))));
      } else {
        obsVis = Math.min(10000, Math.round(2500 + 7500 * Math.min(1, (100 - rh) / 35)));
      }
      return { z, p, T, Td, obsVis, modelVis: isFinite(vis) ? vis : null, lwc, beta };
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
    APP_NAME, SNAPSHOT_VERSION, CLOUD_META, LAYER_ORDER, STATE, SCHEME_LABELS,
    LWC_MAX, KOSCHMEIER_EPS, RHO_W, MAX_ALT, WIND_SCALE,
    lclHeight, tempAt, dewAt, dewpointFromRH, pressureAt, airDensityAt, windProfileAt,
    freezingLevel, thermoProfileAt, wetBulbZeroLevel, syncCloudBasesToLCL, parcelThermodynamics,
    esWater, esIce, wbfVaporDiff, operativeDropConc,
    iceFractionAt, seedingPlumeAt, seedingDepletionAt, seedingIceBoostAt,
    effectiveLayers, sampleFields,
    extinctionFromLWC, visibilityFromExt, visibilityAtAltitude, worstVisibility,
    lwcFromDensity, betaFromLWC, effRadiusFromLWC, operativeRe, totalCloudCover,
    microMapping, serialize, deserialize,
    RADIOSONDE_SAMPLE, getRadiosonde, importRadiosonde, resetRadiosonde, validateAgainstRadiosonde, profile,
  };
})(window);
