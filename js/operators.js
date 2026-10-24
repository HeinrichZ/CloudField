/* operators.js — 多诊断量观测算子（#3）
 * 同一微物理场的不同"观测算子"：散射/吸收分离、太阳/天空辐照度、
 * 云反照率、卫星可见光亮温、激光雷达回波、微波/气象雷达反射率（含粒子谱宽六阶矩修正）。
 * 均为自包含近似模型；真实传感器需接入光谱响应/散射查找表（标注于注释）。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const P = global.Physics;
  const S = A.STATE;
  const S0 = 1361;                                   // 太阳常数 W/m²

  function columnOpticalDepth(time) {
    let od = 0;
    const layers = A.effectiveLayers(), wind = { x: S.windSpeed, dir: S.windDir };
    for (let z = 0; z <= 14; z += 0.25) {
      const d = P.detailedAt(0, 0, z, layers, wind, time || 0);
      od += d.betaExt * 250;      // β 为 m⁻¹，Δz = 0.25 km = 250 m → 无量纲光学厚度
    }
    return od;
  }

  // 辐照度：简单双流近似（晴空 + 云）
  function irradiance(time) {
    const cosZ = Math.max(0.05, Math.sin((S.sunElev || 35) * Math.PI / 180));
    const tau = columnOpticalDepth(time);
    if (global.Radiation) {
      const T = global.Radiation.transmittance(tau, cosZ, 0.999, 0.85);
      const Td = global.Radiation.direct(tau, cosZ);
      const direct = S0 * cosZ * Td;
      const diffuse = S0 * cosZ * Math.max(0, T - Td);
      return { direct, diffuse, total: direct + diffuse, cosZ, tau, T };
    }
    const trans = Math.exp(-tau / cosZ);
    const direct = S0 * cosZ * trans;
    const diffuse = 0.12 * S0 * cosZ * (1 - trans);
    return { direct, diffuse, total: direct + diffuse, cosZ, tau };
  }

  // 云反照率：双流查表；未加载 Radiation 时退回 Cahalan 近似 A = τ/(τ + 4/3·(1−g))
  function cloudAlbedo(time) {
    const tau = columnOpticalDepth(time);
    if (global.Radiation) {
      const cosZ = Math.max(0.05, Math.sin((S.sunElev || 35) * Math.PI / 180));
      return global.Radiation.reflectance(tau, cosZ, 0.999, 0.85);
    }
    const g = 0.85;
    return tau / (tau + 4 / (3 * (1 - g)));
  }

  // 卫星可见通道"等效亮温"：云顶温度叠加上反照率影响（近似）
  function satelliteTb(time) {
    const tau = columnOpticalDepth(time);
    if (tau < 0.01) {
      return 273.15 + S.surfaceTemp - 15;
    }
    let top = 0;
    A.effectiveLayers().forEach(L => { if (L.coverage > 0.02) top = Math.max(top, L.top); });
    const Tcloud = A.tempAt(top) + 273.15;
    const A_c = cloudAlbedo(time);
    return Tcloud - 30 * A_c;
  }

  // 激光雷达：体后向散射 β' = βSca · 后向散射比(≈0.03 sr⁻¹，水云)
  function lidar(time) {
    let betaSca = 0, fracIce = 0, fracWater = 0;
    const layers = A.effectiveLayers(), wind = { x: S.windSpeed, dir: S.windDir };
    for (let z = 0; z <= 14; z += 0.25) {
      const d = P.detailedAt(0, 0, z, layers, wind, time || 0);
      betaSca += d.betaSca * 250;
      fracIce += (d.frac ? d.frac.ice : 0) * d.betaSca * 250;
      fracWater += (d.frac ? d.frac.water : 0) * d.betaSca * 250;
    }
    const ratio = (fracIce + fracWater) > 0 ? fracIce / (fracIce + fracWater) : 0;
    const betaBack = betaSca * 0.03;                 // m⁻¹·sr⁻¹
    const colorRatio = 1.0 + 1.2 * ratio;            // 冰相色比 > 1
    return { betaBack, colorRatio, tau: betaSca };
  }

  // 气象雷达反射率：液态与水凝物分开近似（dBZ），并耦合粒子谱有效方差 ν_eff 对六阶矩 M6 的放大效应
  function radar(time) {
    const layers = A.effectiveLayers(), wind = { x: S.windSpeed, dir: S.windDir };
    let lwcLiq = 0, lwcIce = 0;
    for (let z = 0; z <= 14; z += 0.25) {
      const d = P.detailedAt(0, 0, z, layers, wind, time || 0);
      const lwcGm3 = d.lwc;
      const f = d.frac || { water: 1 };
      lwcLiq += (lwcGm3 * (f.water || 0)) * 0.25;
      lwcIce += (lwcGm3 * (1 - (f.water || 0))) * 0.25;
    }
    // Gamma 谱六阶矩修正：M6 / M3^2 随有效方差 veff 增大而显著增长
    const veff = (P.currentVeff ? P.currentVeff() : ((S.spectrum && S.spectrum.veff) || 0.10));
    const v = Math.max(0, Math.min(0.45, veff));
    const m6Factor = (1 + v) * (1 + 2 * v) * (1 + 3 * v) / ((1 + 0.1) * (1 + 0.2) * (1 + 0.3));
    const ZeLiq = 6e5 * Math.pow(Math.max(lwcLiq, 1e-4), 1.6) * m6Factor;
    const ZeIce = 1.5e5 * Math.pow(Math.max(lwcIce, 1e-4), 1.6) * m6Factor;
    const Ze = ZeLiq + ZeIce;
    const dBZ = 10 * Math.log10(Math.max(1e-3, Ze));
    return { Ze, dBZ, lwcLiq, lwcIce, m6Factor };
  }

  // opts.all = true 时忽略开关，返回全部算子（供批处理/报告需要完整字段时使用）
  function compute(time, opts) {
    opts = opts || {};
    const all = !!opts.all;
    const on = S.operators || {};
    const pick = k => all || on[k] !== false;
    const out = { opticalDepth: columnOpticalDepth(time) };
    let w = null;
    const needW = pick('visibility') || pick('extSplit');
    if (needW && global.Physics) w = global.Physics.worstVisibilityDetailed(time || 0);
    if (pick('visibility') && w) out.visibility = { vis: w.vis, alt: w.alt };
    if (pick('extSplit') && w && w.info) {
      const i = w.info;
      out.extSplit = { sca: i.sca, abs: i.abs, ratio: i.beta > 0 ? i.abs / i.beta : 0 };
    }
    if (pick('irradiance')) out.irradiance = irradiance(time);
    if (pick('albedo')) out.albedo = cloudAlbedo(time);
    if (pick('satellite')) out.satelliteTb = satelliteTb(time);
    if (pick('lidar')) out.lidar = lidar(time);
    if (pick('radar')) out.radar = radar(time);
    return out;
  }

  global.Operators = {
    columnOpticalDepth, irradiance, cloudAlbedo, satelliteTb, lidar, radar, compute, S0,
  };
})(window);
