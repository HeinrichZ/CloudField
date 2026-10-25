/* kessler.js — 多方案微物理单柱积分器（Kessler 1969 / KK2000 / ICON-SB06 + ETH CLOUDLAB WBF 播云冰化）
 * 定位：按云层做 0D（每层一个控制体）的云水(q_c) / 雨水(q_r) / 冰相水凝物(q_i) 时间积分与方案对比；
 * 支持三套经典微物理自动转化参数化方案实时切换与同屏残差对比：
 *   1) kessler : Kessler (1969) 单矩阈值方案 P_ac = k1·max(0, q_c − qc0)（不依赖云滴数浓度 N_c）
 *   2) kk2000  : Khairoutdinov & Kogan (2000) 双矩方案 P_ac = 1350·q_c^2.47·N_c^-1.79（体现 Albrecht 气溶胶抑制降水效应）
 *   3) sb06    : Seifert & Beheng (2006) 双矩方案（ICON-LES 原生微物理；含谱宽 ν 与内部时间尺度 τ 普适函数 Φ(τ)）
 * 并集成 ETH CLOUDLAB 过冷水层云人工播云 WBF（Wegener–Bergeron–Findeisen）水汽竞争冰化沉降项 P_wbf。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const S = A.STATE;
  const VT = 5.0;        // 雨滴特征落速 m/s
  const VT_ICE = 1.8;    // 播云生成冰晶/雪晶聚合体特征落速 m/s
  const TAU_COND = 60;   // 凝结维持时间常数 s

  function ensure() {
    if (!S.kessler) {
      S.kessler = { on: true, qc: {}, qr: {}, qi: {}, rainRate: 0, lastPac: 0, lastPgr: 0, lastPwbf: 0, steps: 0 };
    }
    if (!S.kessler.qi) S.kessler.qi = {};
    A.LAYER_ORDER.forEach(k => {
      if (S.kessler.qc[k] == null) S.kessler.qc[k] = 0;
      if (S.kessler.qr[k] == null) S.kessler.qr[k] = 0;
      if (S.kessler.qi[k] == null) S.kessler.qi[k] = 0;
    });
    return S.kessler;
  }

  function layerMid(L) { return 0.5 * (L.base + L.top); }

  // 三种微物理参数化方案的自动转化率 P_ac (kg/kg/s) 与碰并率 P_gr (kg/kg/s)
  function ratesForScheme(scheme, qc, qr, opts) {
    opts = opts || {};
    const k1 = opts.k1 != null ? opts.k1 : S.micro.autoConvK;
    const qc0 = opts.qc0 != null ? opts.qc0 : S.micro.autoConvQc0;
    const k2 = opts.k2 != null ? opts.k2 : S.micro.accretK;
    const defN = A.operativeDropConc ? A.operativeDropConc() : (S.micro.dropConc || 300);
    const N_cm3 = Math.max(10, opts.N != null ? opts.N : defN);
    const defaultVeff = (global.Physics && global.Physics.currentVeff) ? global.Physics.currentVeff() : ((S.spectrum && S.spectrum.veff) || 0.10);
    const veff = Math.max(0.02, Math.min(0.45, opts.veff != null ? opts.veff : defaultVeff));
    const rho = Math.max(0.3, opts.rho || 1.0);
    const qcPos = Math.max(0, qc), qrPos = Math.max(0, qr);

    let pac = 0, pgr = 0;
    if (scheme === 'kk2000') {
      // Khairoutdinov & Kogan (2000), MWR:
      //   P_ac = 1350 * q_c^2.47 * N_c^-1.79
      //   P_gr = 67 * (q_c * q_r)^1.15
      pac = 1350 * Math.pow(qcPos, 2.47) * Math.pow(N_cm3, -1.79);
      pgr = 67 * Math.pow(qcPos * qrPos, 1.15);
    } else if (scheme === 'sb06') {
      // Seifert & Beheng (2006), Meteorology & Atmospheric Physics (ICON 2-moment scheme):
      //   由半径谱有效方差 ν_eff 换算质量谱 Gamma 形状参数 ν_m = (1 / ν_eff - 5) / 3，限制在 [0, 4]
      const nu = Math.max(0, Math.min(4, ((1 / Math.max(0.03, veff)) - 5) / 3));
      const kc = 9.44e9;                              // Long 核系数 (m³ kg⁻² s⁻¹)
      const x_c = Math.min(2.6e-10, Math.max(4.2e-15, (rho * qcPos) / (N_cm3 * 1e6 + 1))); // 平均云滴质量 kg
      const x_star = 2.6e-10;                         // 分界质量 (r ≈ 40 µm)
      const tau = Math.max(0, Math.min(0.99, 1 - qcPos / Math.max(1e-12, qcPos + qrPos)));
      const phiAc = 600 * Math.pow(tau, 0.68) * Math.pow(1 - Math.pow(tau, 0.68), 3);
      const shapeFac = (nu + 2) * (nu + 4) / Math.pow(nu + 1, 2);
      const pacBase = (kc / (20 * x_star)) * shapeFac * rho * qcPos * qcPos * x_c * x_c;
      pac = pacBase * (1 + phiAc / Math.pow(1 - tau + 1e-4, 2));
      const phiGr = Math.pow(tau / (tau + 5e-4), 4);
      pgr = 5.25 * rho * qcPos * qrPos * phiGr;
    } else {
      // 默认 Kessler (1969) 单矩线性阈值方案
      pac = Math.max(0, k1) * Math.max(0, qcPos - Math.max(0, qc0));
      pgr = Math.max(0, k2) * qcPos * qrPos;
    }
    return { pac, pgr };
  }

  // ETH CLOUDLAB 过冷水层云播云 WBF（Wegener–Bergeron–Findeisen）水汽竞争冰化速率 (kg/kg/s)
  // 由 Murphy & Koop (2005) 过冷水与冰晶表面饱和水汽压差 Δe_wi(T) = e_s,w(T) − e_s,i(T) 直接驱动（在 -12.5°C 达热力学峰值）
  function wbfRate(qc, zMid) {
    const sd = S.seeding;
    if (!sd || !sd.on || qc <= 0) return 0;
    const T = A.tempAt(zMid);
    // 暖云物理硬约束：T ≥ 0°C 时无过冷水，WBF 冰化速率严格为 0
    if (T >= 0) return 0;
    const agent = String(sd.agent || 'agi').toLowerCase();
    const thresh = agent === 'co2' ? -0.5 : -5.0;
    const wbf = A.wbfVaporDiff ? A.wbfVaporDiff(T) : { normFactor: Math.exp(-Math.pow((T + 12.5) / 8, 2)) };
    const tempEff = T <= thresh
      ? Math.min(1.35, 0.35 + 1.0 * wbf.normFactor)
      : (agent === 'co2' ? (0.25 + 0.45 * wbf.normFactor) : Math.max(0, ((thresh - T + 5.0) / 5.0) * 0.35 * wbf.normFactor));
    if (tempEff <= 0) return 0;
    const altEff = Math.exp(-Math.pow((zMid - (sd.alt || 1.1)) / 1.2, 2));
    const inpRate = 1.8e-3 * (1 - Math.exp(-Math.max(0, sd.inpConc || 80) / 40));
    return qc * inpRate * tempEff * altEff;
  }

  const SAMPLE_PTS = [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]];

  function step(dt, timeSec) {
    const k = ensure();
    if (!k.on) return readout();
    const d = Math.min(0.5, Math.max(0, dt || 0));
    if (d <= 0) return readout();
    const scheme = (S.micro && S.micro.scheme) || 'kessler';
    const t = timeSec || 0;
    let Pac = 0, Pgr = 0, Pwbf = 0, rain = 0;
    const layers = A.effectiveLayers();
    const wind = { x: S.windSpeed, dir: S.windDir };
    layers.forEach(L => {
      const key = L.key;
      const zMid = layerMid(L);
      const rho = Math.max(0.3, A.airDensityAt(zMid));
      // 5 点十字网格平均取未播撒背景目标云水（避免单点落入积云空隙，且消除播云空间沟槽与 wbfRate 的双重扣减）
      let lwcSum = 0;
      for (let p = 0; p < SAMPLE_PTS.length; p++) {
        const f = A.sampleFields(SAMPLE_PTS[p][0], SAMPLE_PTS[p][1], zMid, layers, wind, t);
        const lwcAmb = (f.seedDepletion && f.seedDepletion < 0.99) ? (f.lwc / (1 - f.seedDepletion)) : f.lwc;
        lwcSum += Math.max(0, lwcAmb);
      }
      const lwcMean = lwcSum / SAMPLE_PTS.length;
      const qcT = lwcMean * 1e-3 / rho;                   // kg/kg
      let qc = k.qc[key] || 0, qr = k.qr[key] || 0, qi = k.qi[key] || 0;
      // 凝结源：向目标云水松弛
      qc += (qcT - qc) * Math.min(1, d / TAU_COND);
      // 选定参数化方案的自动转化 + 碰并
      const r = ratesForScheme(scheme, qc, qr, { rho });
      const pwbf = wbfRate(qc, zMid);
      const convRain = Math.min(qc, (r.pac + r.pgr) * d);
      qc = Math.max(0, qc - convRain);
      const convIce = Math.min(qc, pwbf * d);
      qc = Math.max(0, qc - convIce);
      qr = Math.max(0, qr + convRain);
      qi = Math.max(0, qi + convIce);
      // 雨滴与播云冰晶沉降出层
      const H = Math.max(0.1, (L.top - L.base)) * 1000;   // m
      qr = Math.max(0, qr - qr * VT / H * d);
      qi = Math.max(0, qi - qi * VT_ICE / H * d);
      k.qc[key] = qc; k.qr[key] = qr; k.qi[key] = qi;
      Pac += r.pac; Pgr += r.pgr; Pwbf += pwbf;
      rain += rho * (qr * VT + qi * VT_ICE);
    });
    k.lastPac = Pac; k.lastPgr = Pgr; k.lastPwbf = Pwbf;
    k.rainRate = rain * 3600;     // mm/h
    k.steps = (k.steps || 0) + 1;
    return readout();
  }

  function reset() {
    const k = ensure();
    A.LAYER_ORDER.forEach(key => { k.qc[key] = 0; k.qr[key] = 0; k.qi[key] = 0; });
    k.rainRate = 0; k.lastPac = 0; k.lastPgr = 0; k.lastPwbf = 0; k.steps = 0;
    return readout();
  }

  function readout() {
    const k = ensure();
    let qcT = 0, qrT = 0, qiT = 0;
    A.LAYER_ORDER.forEach(key => {
      qcT += k.qc[key] || 0;
      qrT += k.qr[key] || 0;
      qiT += (k.qi && k.qi[key]) || 0;
    });
    return {
      on: !!k.on, scheme: (S.micro && S.micro.scheme) || 'kessler',
      qcTotal: qcT, qrTotal: qrT, qiTotal: qiT, rainRate: k.rainRate || 0,
      lastPac: k.lastPac || 0, lastPgr: k.lastPgr || 0, lastPwbf: k.lastPwbf || 0, steps: k.steps || 0,
      qc: Object.assign({}, k.qc), qr: Object.assign({}, k.qr), qi: Object.assign({}, k.qi),
    };
  }

  // 同屏对比三套微物理方案（Kessler / KK2000 / ICON-SB06）随云滴数浓度 N_c 的稳态雨强与自动转化率响应曲线
  function compareSchemes(opts) {
    opts = opts || {};
    const nPts = opts.nPts || 24;
    const nMin = opts.nMin || 50, nMax = opts.nMax || 1000;
    const qcRef = opts.qc != null ? opts.qc : 1.5e-3;     // 典型浓层积云云水混合比 1.5 g/kg
    const qrRef = opts.qr != null ? opts.qr : 0;          // 从零雨水启动，凸显自动转化对 N_c 的敏感性
    const rho = 1.05;
    const schemes = ['kessler', 'kk2000', 'sb06'];
    const curves = { N: [], kessler: [], kk2000: [], sb06: [] };
    for (let i = 0; i < nPts; i++) {
      const N = nMin + (nMax - nMin) * i / (nPts - 1);
      curves.N.push(N);
      schemes.forEach(sc => {
        // 对每个 N 做 60 步（每步 2s，共 120s）单柱演进，计算准稳态雨强 (mm/h)
        let qc = qcRef, qr = qrRef;
        for (let st = 0; st < 60; st++) {
          const dt = 2.0;
          qc += (qcRef - qc) * (dt / TAU_COND);
          const r = ratesForScheme(sc, qc, qr, { N, rho });
          const conv = Math.min(qc, (r.pac + r.pgr) * dt);
          qc -= conv; qr += conv;
          qr = Math.max(0, qr - qr * VT / 1200 * dt);
        }
        curves[sc].push(rho * qr * VT * 3600);
      });
    }
    // 当前 N 下的三方案即时对比与残差
    const curN = (A.operativeDropConc ? A.operativeDropConc() : S.micro.dropConc) || 300;
    const idx = Math.max(0, Math.min(nPts - 1, Math.round((curN - nMin) / (nMax - nMin) * (nPts - 1))));
    return {
      N: curves.N,
      kessler: curves.kessler,
      kk2000: curves.kk2000,
      sb06: curves.sb06,
      qcRef,
      qrRef,
      rho,
      atCurrentN: {
        N: curN,
        kessler: curves.kessler[idx],
        kk2000: curves.kk2000[idx],
        sb06: curves.sb06[idx],
        diffKK_Kessler: curves.kk2000[idx] - curves.kessler[idx],
        diffSB_KK: curves.sb06[idx] - curves.kk2000[idx],
      },
    };
  }

  // 微物理源汇过程收支拆解：诊断自动转化 (P_ac)、碰并收集 (P_gr) 与 WBF 播云冰化 (P_wbf) 的速率及贡献占比
  function processBudget(opts) {
    opts = opts || {};
    const scheme = opts.scheme || (S.micro && S.micro.scheme) || 'kessler';
    const qc = opts.qc != null ? opts.qc : 1.5e-3;
    const qr = opts.qr != null ? opts.qr : 2.5e-4;
    const zMid = opts.zMid != null ? opts.zMid : (S.seeding && S.seeding.alt ? S.seeding.alt : 1.1);
    const r = ratesForScheme(scheme, qc, qr, opts);
    const pwbf = wbfRate(qc, zMid);
    const total = r.pac + r.pgr + pwbf;
    const denom = total > 1e-15 ? total : 1;
    const pacPct = total > 1e-15 ? +(r.pac / denom * 100).toFixed(1) : 0;
    const pgrPct = total > 1e-15 ? +(r.pgr / denom * 100).toFixed(1) : 0;
    const pwbfPct = total > 1e-15 ? +(pwbf / denom * 100).toFixed(1) : 0;
    const dominantProcess = total <= 1e-15 ? 'NONE' : (pwbf >= r.pac && pwbf >= r.pgr ? 'WBF' : (r.pgr >= r.pac ? 'ACCRETION' : 'AUTOCONV'));
    return {
      scheme,
      pacRate: r.pac,
      pgrRate: r.pgr,
      pwbfRate: pwbf,
      totalRate: total,
      pacPct,
      pgrPct,
      pwbfPct,
      dominantProcess,
    };
  }

  global.Kessler = { ensure, step, reset, readout, ratesForScheme, wbfRate, compareSchemes, processBudget, VT, TAU_COND };
})(window);
