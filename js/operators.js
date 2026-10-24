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

  // 多代表点采样（中心 + 下风向/横风向 5 点十字网格），避免单点刚好落入积云间隙或漏掉播云羽流
  const SAMPLE_PTS = [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]];

  function columnStats(time) {
    let od = 0, scaSum = 0, extSum = 0, gWeightedSum = 0;
    const layers = A.effectiveLayers(), wind = { x: S.windSpeed, dir: S.windDir };
    const nPts = SAMPLE_PTS.length;
    for (let p = 0; p < nPts; p++) {
      const sx = SAMPLE_PTS[p][0], sy = SAMPLE_PTS[p][1];
      for (let z = 0; z <= 14; z += 0.25) {
        const d = P.detailedAt(sx, sy, z, layers, wind, time || 0);
        od += d.betaExt * 250;      // β 为 m⁻¹，Δz = 0.25 km = 250 m → 无量纲光学厚度
        extSum += d.betaExt;
        scaSum += d.betaSca;
        gWeightedSum += d.betaSca * (d.gMix != null ? d.gMix : 0.85);
      }
    }
    od /= nPts;
    const omegaMix = extSum > 0 ? scaSum / extSum : 0.999;
    const gMix = scaSum > 0 ? gWeightedSum / scaSum : 0.85;
    return { od, omegaMix, gMix };
  }

  function columnOpticalDepth(time) {
    return columnStats(time).od;
  }

  // 辐照度：双流近似（晴空 + 云，动态传入相态加权的 ω_mix 与 g_mix）
  function irradiance(time) {
    const cosZ = Math.max(0.05, Math.sin((S.sunElev || 35) * Math.PI / 180));
    const cs = columnStats(time);
    const tau = cs.od;
    if (global.Radiation) {
      const T = global.Radiation.transmittance(tau, cosZ, cs.omegaMix, cs.gMix);
      const Td = global.Radiation.direct(tau, cosZ);
      const direct = S0 * cosZ * Td;
      const diffuse = S0 * cosZ * Math.max(0, T - Td);
      return { direct, diffuse, total: direct + diffuse, cosZ, tau, T, omega: cs.omegaMix, g: cs.gMix };
    }
    const trans = Math.exp(-tau / cosZ);
    const direct = S0 * cosZ * trans;
    const diffuse = 0.12 * S0 * cosZ * (1 - trans);
    return { direct, diffuse, total: direct + diffuse, cosZ, tau };
  }

  // 云反照率：双流查表（接入相态加权 ω_mix 与 g_mix）；未加载 Radiation 时退回 Cahalan 近似
  function cloudAlbedo(time) {
    const cs = columnStats(time);
    const tau = cs.od;
    if (global.Radiation) {
      const cosZ = Math.max(0.05, Math.sin((S.sunElev || 35) * Math.PI / 180));
      return global.Radiation.reflectance(tau, cosZ, cs.omegaMix, cs.gMix);
    }
    const g = cs.gMix || 0.85;
    return tau / (tau + 4 / (3 * (1 - g)));
  }

  // 卫星红外窗区（10.8 µm）等效黑体亮温 T_b：
  // 依据红外辐射传输方程，红外吸收光学厚度 τ_IR ≈ 0.48 · τ_vis，云体红外发射率 ε_c = 1 − exp(−τ_IR)，
  // 向上长波辐射通量按 Stefan-Boltzmann 四次方定律合成：T_b = [ε_c · T_top^4 + (1 − ε_c) · T_sfc^4]^(1/4)
  function satelliteTb(time) {
    const tau = columnOpticalDepth(time);
    const Tsfc = Math.max(180, 273.15 + S.surfaceTemp + (S.envT || 0));
    if (tau < 0.005) {
      return Tsfc;
    }
    let top = 0;
    A.effectiveLayers().forEach(L => { if (L.coverage > 0.02) top = Math.max(top, L.top); });
    const Ttop = Math.max(180, A.tempAt(top) + 273.15);
    const tauIR = 0.48 * tau;
    const epsC = 1 - Math.exp(-tauIR);
    const tb4 = epsC * Math.pow(Ttop, 4) + (1 - epsC) * Math.pow(Tsfc, 4);
    return Math.pow(tb4, 0.25);
  }

  // 激光雷达：体后向散射 β' = βSca · 后向散射相函数(≈0.03 sr⁻¹，水云)，并反映播云冰晶退偏/色比跃升
  function lidar(time) {
    let betaSca = 0, fracIce = 0, fracWater = 0;
    const layers = A.effectiveLayers(), wind = { x: S.windSpeed, dir: S.windDir };
    const nPts = SAMPLE_PTS.length;
    for (let p = 0; p < nPts; p++) {
      const sx = SAMPLE_PTS[p][0], sy = SAMPLE_PTS[p][1];
      for (let z = 0; z <= 14; z += 0.25) {
        const d = P.detailedAt(sx, sy, z, layers, wind, time || 0);
        betaSca += d.betaSca * 250;
        const fi = d.frac ? ((d.frac.ice || 0) + (d.frac.snow || 0)) : 0;
        fracIce += fi * d.betaSca * 250;
        fracWater += (d.frac ? d.frac.water : 0) * d.betaSca * 250;
      }
    }
    betaSca /= nPts; fracIce /= nPts; fracWater /= nPts;
    const ratio = (fracIce + fracWater) > 0 ? fracIce / (fracIce + fracWater) : 0;
    const betaBack = betaSca * 0.03;                 // m⁻¹·sr⁻¹
    const colorRatio = 1.0 + 1.2 * ratio;            // 冰相退偏/色比 > 1
    return { betaBack, colorRatio, tau: betaSca, iceRatio: ratio };
  }

  // 气象雷达反射率（dBZ）：同时耦合（1）云滴/冰晶粒子谱有效方差 ν_eff 的六阶矩放大效应，
  // 与（2）当前微物理参数化方案（Kessler / KK2000 / ICON-SB06）及播云 WBF 过程产生的降水率 R（Marshall–Palmer Z = 200·R^1.6）
  function radar(time) {
    const layers = A.effectiveLayers(), wind = { x: S.windSpeed, dir: S.windDir };
    let lwcLiq = 0, lwcIce = 0;
    const nPts = SAMPLE_PTS.length;
    for (let p = 0; p < nPts; p++) {
      const sx = SAMPLE_PTS[p][0], sy = SAMPLE_PTS[p][1];
      for (let z = 0; z <= 14; z += 0.25) {
        const d = P.detailedAt(sx, sy, z, layers, wind, time || 0);
        const lwcGm3 = d.lwc;
        const f = d.frac || { water: 1 };
        lwcLiq += (lwcGm3 * (f.water || 0)) * 0.25;
        lwcIce += (lwcGm3 * (1 - (f.water || 0))) * 0.25;
      }
    }
    lwcLiq /= nPts; lwcIce /= nPts;
    // Gamma 谱六阶矩修正：M6 / M3^2 随有效方差 veff 增大而显著增长
    const veff = (P.currentVeff ? P.currentVeff() : ((S.spectrum && S.spectrum.veff) || 0.10));
    const v = Math.max(0, Math.min(0.45, veff));
    const m6Factor = (1 + v) * (1 + 2 * v) * (1 + 3 * v) / ((1 + 0.1) * (1 + 0.2) * (1 + 0.3));
    const ZeCloudLiq = 6e5 * Math.pow(Math.max(lwcLiq, 1e-4), 1.6) * m6Factor;
    const ZeCloudIce = 1.5e5 * Math.pow(Math.max(lwcIce, 1e-4), 1.6) * m6Factor;

    // 耦合当前所选微物理方案（Kessler / KK2000 / SB06）的准稳态/实时雨强与 WBF 播云雪强（Marshall–Palmer Z-R 关系）
    let ZePrecip = 0;
    if (global.Kessler) {
      const kr = global.Kessler.readout();
      let rainMmH = kr.rainRate || 0;
      if (rainMmH <= 1e-4 && global.Kessler.compareSchemes && (lwcLiq + lwcIce) > 0.02) {
        const sc = (S.micro && S.micro.scheme) || 'kessler';
        const qcRep = Math.max(1.2e-3, (lwcLiq + lwcIce) * 1.5e-3);
        const cmp = global.Kessler.compareSchemes({ nPts: 7, qc: qcRep });
        if (cmp && cmp.atCurrentN && isFinite(cmp.atCurrentN[sc])) {
          rainMmH = cmp.atCurrentN[sc];
        }
      }
      ZePrecip = 200 * Math.pow(Math.max(0, rainMmH), 1.6);
    }
    const Ze = ZeCloudLiq + ZeCloudIce + ZePrecip;
    const dBZ = 10 * Math.log10(Math.max(1e-3, Ze));
    return { Ze, dBZ, lwcLiq, lwcIce, ZePrecip, m6Factor };
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
