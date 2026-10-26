/* operators.js — 多诊断量观测算子
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
    let od = 0, odCloud = 0, scaSum = 0, extSum = 0, gWeightedSum = 0, lwpSum = 0, iwpSum = 0;
    const layers = A.effectiveLayers(), wind = { x: S.windSpeed, dir: S.windDir };
    const nPts = SAMPLE_PTS.length;
    for (let p = 0; p < nPts; p++) {
      const sx = SAMPLE_PTS[p][0], sy = SAMPLE_PTS[p][1];
      for (let z = 0; z <= 14; z += 0.25) {
        const d = P.detailedAt(sx, sy, z, layers, wind, time || 0);
        const dzM = 250;            // Δz = 0.25 km = 250 m
        od += d.betaExt * dzM;      // β 为 m⁻¹，无量纲总光学厚度
        odCloud += Math.max(0, d.betaExt - (d.betaAero || 0)) * dzM; // 仅云体光学厚度（不含背景气溶胶）
        extSum += d.betaExt;
        scaSum += d.betaSca;
        gWeightedSum += d.betaSca * (d.gMix != null ? d.gMix : 0.85);
        const fw = d.frac ? (d.frac.water || 0) : 1;
        lwpSum += (d.lwc * fw) * dzM;         // g/m³ × m = g/m²
        iwpSum += (d.lwc * (1 - fw)) * dzM;   // g/m²
      }
    }
    od /= nPts;
    odCloud /= nPts;
    const lwp = lwpSum / nPts;
    const iwp = iwpSum / nPts;
    const omegaMix = extSum > 0 ? scaSum / extSum : 0.999;
    const gMix = scaSum > 0 ? gWeightedSum / scaSum : 0.85;
    return { od, odCloud, omegaMix, gMix, lwp, iwp, twp: lwp + iwp };
  }

  function columnOpticalDepth(time, csCached) {
    return (csCached || columnStats(time)).od;
  }

  // 辐照度：双流近似（晴空 + 云，动态传入相态加权的 ω_mix 与 g_mix）
  function irradiance(time, csCached) {
    const cosZ = Math.max(0.05, Math.sin((S.sunElev || 35) * Math.PI / 180));
    const cs = csCached || columnStats(time);
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
  function cloudAlbedo(time, csCached) {
    const cs = csCached || columnStats(time);
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
  function satelliteTb(time, csCached) {
    const tau = (csCached || columnStats(time)).od;
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

  // 激光雷达：考虑双程 Beer-Lambert 消光衰减 exp(-2τ(z)) 与水云/冰云激光雷达比 S (Lidar Ratio: 水云 ~18.8 sr, 冰晶 ~28 sr)
  // 及非球形冰晶线性退偏比 δ / 色比跃升
  function lidar(time) {
    const S_LIQ = 18.8, S_ICE = 28.0;
    let attBackSum = 0, unattBackSum = 0, betaScaSum = 0, fracIceSum = 0, fracWaterSum = 0;
    const layers = A.effectiveLayers(), wind = { x: S.windSpeed, dir: S.windDir };
    const nPts = SAMPLE_PTS.length;
    const dzM = 250;
    for (let p = 0; p < nPts; p++) {
      const sx = SAMPLE_PTS[p][0], sy = SAMPLE_PTS[p][1];
      let tauCum = 0;
      for (let z = 0; z <= 14; z += 0.25) {
        const d = P.detailedAt(sx, sy, z, layers, wind, time || 0);
        const fi = d.frac ? Math.min(1, (d.frac.ice || 0) + (d.frac.snow || 0) + (d.frac.graupel || 0) + (d.frac.hail || 0)) : 0;
        const fw = Math.max(0, 1 - fi);
        const invS = fw / S_LIQ + fi / S_ICE;
        const bBackLocal = d.betaSca * invS;          // m⁻¹·sr⁻¹
        const dTau = d.betaExt * dzM;
        const twoWayTrans = Math.exp(-2 * tauCum);
        const layerInt = dTau > 1e-5 ? ((1 - Math.exp(-2 * dTau)) / (2 * d.betaExt)) : dzM;
        attBackSum += bBackLocal * twoWayTrans * layerInt;
        unattBackSum += bBackLocal * dzM;
        betaScaSum += d.betaSca * dzM;
        fracIceSum += fi * d.betaSca * dzM;
        fracWaterSum += fw * d.betaSca * dzM;
        tauCum += dTau;
      }
    }
    const betaBack = attBackSum / nPts;               // 含双程衰减的积分后向散射 (sr⁻¹)
    const betaBackUnatten = unattBackSum / nPts;
    const betaSca = betaScaSum / nPts;
    const ratio = (fracIceSum + fracWaterSum) > 0 ? fracIceSum / (fracIceSum + fracWaterSum) : 0;
    const depolRatio = 0.03 + 0.39 * ratio;           // 线性退偏比 δ：水云 ~0.03，冰晶 ~0.42
    const colorRatio = 1.0 + 1.2 * ratio;             // 冰相退偏/色比 > 1
    return { betaBack, betaBackUnatten, colorRatio, depolRatio, tau: betaSca, iceRatio: ratio };
  }

  // 气象雷达反射率（dBZ）：同时耦合（1）云滴/冰晶粒子谱有效方差 ν_eff 的六阶矩瑞利散射放大效应，
  // 与（2）当前微物理参数化方案（Kessler / KK2000 / ICON-SB06）及播云 WBF 过程产生的降水率 R（Marshall–Palmer Z = 200·R^1.6）
  function radar(time) {
    const layers = A.effectiveLayers(), wind = { x: S.windSpeed, dir: S.windDir };
    let lwcLiq = 0, lwcIce = 0, reWeighted = 0, lwcWeight = 0;
    const nPts = SAMPLE_PTS.length;
    for (let p = 0; p < nPts; p++) {
      const sx = SAMPLE_PTS[p][0], sy = SAMPLE_PTS[p][1];
      for (let z = 0; z <= 14; z += 0.25) {
        const d = P.detailedAt(sx, sy, z, layers, wind, time || 0);
        const lwcGm3 = d.lwc;
        if (lwcGm3 <= 0) continue;
        const f = d.frac || { water: 1 };
        lwcLiq += (lwcGm3 * (f.water || 0)) * 0.25;
        lwcIce += (lwcGm3 * (1 - (f.water || 0))) * 0.25;
        reWeighted += (d.reUm || 8) * lwcGm3;
        lwcWeight += lwcGm3;
      }
    }
    lwcLiq /= nPts; lwcIce /= nPts;
    const reMean = lwcWeight > 0 ? (reWeighted / lwcWeight) : (S.micro.effRadiusUm || 8);
    // Gamma 谱六阶矩修正：M6 / (M3 · r_e^3) = (1+v)(1+2v)(1+3v) 随有效方差 veff 增大而显著增长
    const veff = (P.currentVeff ? P.currentVeff() : ((S.spectrum && S.spectrum.veff) || 0.10));
    const v = Math.max(0, Math.min(0.45, veff));
    const m6Factor = (1 + v) * (1 + 2 * v) * (1 + 3 * v) / ((1 + 0.1) * (1 + 0.2) * (1 + 0.3));
    // 非降水云滴与冰晶瑞利散射反射率因子 Z_cloud (mm⁶/m³)：无云时为 0，薄层云约 -35 ~ -10 dBZ
    const ZeCloudLiq = lwcLiq > 1e-5 ? 4.8e-5 * lwcLiq * Math.pow(reMean, 3) * m6Factor : 0;
    const ZeCloudIce = lwcIce > 1e-5 ? 1.2e-4 * lwcIce * Math.pow(Math.max(16, reMean * 2.1), 3) * m6Factor : 0;

    // 耦合当前所选微物理方案（Kessler / KK2000 / SB06）的准稳态/实时雨强与 WBF 播云雪强（Marshall–Palmer Z-R 关系）
    let ZePrecip = 0;
    let rainMmH = (S.precipRateMmH != null && S.precipRateMmH > 0) ? S.precipRateMmH : 0;
    if (global.Kessler) {
      const kr = global.Kessler.readout();
      if (kr.rainRate > rainMmH) rainMmH = kr.rainRate;
      if (rainMmH <= 1e-4 && global.Kessler.compareSchemes && (lwcLiq + lwcIce) > 0.02) {
        const sc = (S.micro && S.micro.scheme) || 'kessler';
        // 由当前激活云层的实际云核液水含量与空气密度诊断云内代表混合比 qcCore（无硬编码保底）
        let qcCore = 0, covWeight = 0;
        for (let i = 0; i < layers.length; i++) {
          const L = layers[i];
          if (L.density > 0.02 && L.coverage > 0.02 && L.kind !== 'ice') {
            const zMid = 0.5 * (L.base + L.top);
            const rhoMid = Math.max(0.35, A.airDensityAt ? A.airDensityAt(zMid) : 1.0);
            const qcL = (L.density * A.LWC_MAX * 2.1e-3) / rhoMid;
            if (qcL > qcCore) { qcCore = qcL; covWeight = L.coverage; }
          }
        }
        if (qcCore > 0) {
          const cmp = global.Kessler.compareSchemes({ nPts: 7, qc: qcCore });
          if (cmp && cmp.atCurrentN && isFinite(cmp.atCurrentN[sc])) {
            rainMmH = cmp.atCurrentN[sc] * Math.max(0.15, covWeight);
          }
        }
      }
      ZePrecip = 200 * Math.pow(Math.max(0, rainMmH), 1.6) * (0.65 + 0.35 * m6Factor);
    }
    const Ze = ZeCloudLiq + ZeCloudIce + ZePrecip;
    const dBZ = 10 * Math.log10(Math.max(1e-4, Ze));
    // 机载 X 波段气象雷达 (Airborne WXR, 9.3 GHz, ARINC 708 标准)：双程雨衰 k_X = 0.014·R^1.15 dB/km（按 15 km 强降水核穿透计）与四色等级
    const xBandTwoWayAttenDb = +(2 * 15 * 0.014 * Math.pow(Math.max(0, rainMmH), 1.15)).toFixed(2);
    const dBZXBand = +(dBZ - xBandTwoWayAttenDb).toFixed(1);
    const wxrColor = dBZ >= 40 ? 'RED' : (dBZ >= 30 ? 'YELLOW' : (dBZ >= 20 ? 'GREEN' : 'BLACK'));
    const pacShadowAlert = xBandTwoWayAttenDb >= 6.0;
    return { Ze, dBZ, dBZXBand, xBandTwoWayAttenDb, wxrColor, pacShadowAlert, rainMmH: +rainMmH.toFixed(2), lwcLiq, lwcIce, ZePrecip, m6Factor };
  }

  // opts.all = true 时忽略开关，返回全部算子（供批处理/报告需要完整字段时使用）
  function compute(time, opts) {
    opts = opts || {};
    const all = !!opts.all;
    const on = S.operators || {};
    const pick = k => all || on[k] !== false;
    // 单次计算 columnStats 并复用于 opticalDepth / irradiance / albedo / satelliteTb，省去 3 次重复的 5×57 层积分
    const cs = columnStats(time);
    const out = { opticalDepth: cs.od, cloudOpticalDepth: cs.odCloud, lwp: cs.lwp, iwp: cs.iwp, twp: cs.twp };
    let w = null;
    const needW = pick('visibility') || pick('extSplit');
    if (needW && global.Physics) w = global.Physics.worstVisibilityDetailed(time || 0);
    if (pick('visibility') && w) out.visibility = { vis: w.vis, alt: w.alt };
    if (pick('extSplit') && w && w.info) {
      const i = w.info;
      out.extSplit = { sca: i.sca, abs: i.abs, ratio: i.beta > 0 ? i.abs / i.beta : 0 };
    }
    if (pick('irradiance')) out.irradiance = irradiance(time, cs);
    if (pick('albedo')) out.albedo = cloudAlbedo(time, cs);
    // 短波云辐射强迫 CRE_SW (W/m²) 与 Twomey 第一间接效应强迫 ΔF_Twomey (相对清洁大陆基线 N_0=80 cm⁻³)
    // 严格基于纯云光学厚度 odCloud 与地表-云层多次反射行星反照率 α_all = R_c + T_c²·α_s/(1 − R_c·α_s)
    const cosZ = Math.max(0.05, Math.sin((S.sunElev || 35) * Math.PI / 180));
    const tauC = cs.odCloud != null ? cs.odCloud : cs.od;
    const sfcAlb = 0.12;
    if (tauC <= 1e-4) {
      out.creSW = 0;
      out.twomeyForcing = 0;
    } else {
      const Rc = global.Radiation
        ? global.Radiation.reflectance(tauC, cosZ, cs.omegaMix, cs.gMix)
        : (tauC / (tauC + 4 / (3 * (1 - (cs.gMix || 0.85)))));
      const Tc = global.Radiation
        ? global.Radiation.transmittance(tauC, cosZ, cs.omegaMix, cs.gMix)
        : Math.max(0, 1 - Rc);
      const albAll = Rc + (Tc * Tc * sfcAlb) / Math.max(1e-6, 1 - Rc * sfcAlb);
      out.creSW = -S0 * cosZ * (albAll - sfcAlb);
      const nEff = (A.operativeDropConc ? A.operativeDropConc() : (S.micro.dropConc || 200));
      const tauClean = tauC * Math.pow(80 / Math.max(10, nEff), 1 / 3);
      const RcClean = global.Radiation
        ? global.Radiation.reflectance(tauClean, cosZ, cs.omegaMix, cs.gMix)
        : (tauClean / (tauClean + 4 / (3 * (1 - (cs.gMix || 0.85)))));
      const TcClean = global.Radiation
        ? global.Radiation.transmittance(tauClean, cosZ, cs.omegaMix, cs.gMix)
        : Math.max(0, 1 - RcClean);
      const albCleanAll = RcClean + (TcClean * TcClean * sfcAlb) / Math.max(1e-6, 1 - RcClean * sfcAlb);
      out.twomeyForcing = -S0 * cosZ * (albAll - albCleanAll);
    }
    if (pick('satellite')) out.satelliteTb = satelliteTb(time, cs);
    if (pick('lidar')) out.lidar = lidar(time);
    if (pick('radar')) out.radar = radar(time);
    if (global.Physics && global.Physics.turbulenceAndShearDiagnostics) {
      out.turbulence = global.Physics.turbulenceAndShearDiagnostics(time);
    }
    if (global.Physics && global.Physics.uavLowAltitudeAssessment) {
      out.uav = global.Physics.uavLowAltitudeAssessment({ time });
    }
    if (global.Physics && global.Physics.cruiseContrailAssessment) {
      out.contrail = global.Physics.cruiseContrailAssessment(10.5, time);
    }
    if (all && global.Physics) {
      if (global.Physics.icingDiagnostics) out.icing = global.Physics.icingDiagnostics(time);
      if (global.Physics.approachSlantProfile) out.approachSlant = global.Physics.approachSlantProfile({ time });
    }
    if (A.parcelThermodynamics) {
      out.thermo = A.parcelThermodynamics();
    }
    return out;
  }

  global.Operators = {
    columnOpticalDepth, irradiance, cloudAlbedo, satelliteTb, lidar, radar, compute, S0,
  };
})(window);
