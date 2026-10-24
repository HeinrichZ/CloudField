/* kessler.js — Kessler (1969) 暖云单柱预报（q_c / q_r 时间积分）
 * 定位：按云层做 0D（每层一个控制体）的云水/雨水预报，用于降水率诊断；
 *       不反馈到 3D 渲染场（渲染场仍是程序化密度 + 风平流），这是明确的边界。
 * 方程：P_ac = k1·max(0, q_c − qc0)；P_gr = k2·q_c·q_r；
 *       dq_c/dt = S_cond − P_ac − P_gr；dq_r/dt = P_ac + P_gr − V_t·q_r/H
 *       S_cond = (q_c,target − q_c)/τ，q_c,target 由 LWC 与空气密度换算。
 * 雨强：R = Σ ρ_air·q_r·V_t（kg m⁻² s⁻¹）× 3600 → mm/h。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const S = A.STATE;
  const VT = 5.0;        // 雨滴特征落速 m/s
  const TAU_COND = 60;   // 凝结维持时间常数 s

  function ensure() {
    if (!S.kessler) {
      S.kessler = { on: true, qc: {}, qr: {}, rainRate: 0, lastPac: 0, lastPgr: 0, steps: 0 };
    }
    A.LAYER_ORDER.forEach(k => {
      if (S.kessler.qc[k] == null) S.kessler.qc[k] = 0;
      if (S.kessler.qr[k] == null) S.kessler.qr[k] = 0;
    });
    return S.kessler;
  }

  function layerMid(L) { return 0.5 * (L.base + L.top); }

  function step(dt) {
    const k = ensure();
    if (!k.on) return readout();
    const d = Math.min(0.5, Math.max(0, dt || 0));
    if (d <= 0) return readout();
    const k1 = S.micro.autoConvK, qc0 = S.micro.autoConvQc0, k2 = S.micro.accretK;
    let Pac = 0, Pgr = 0, rain = 0;
    const layers = A.effectiveLayers();                 // 只取一次，避免每层重复构造
    const wind = { x: S.windSpeed, dir: S.windDir };
    layers.forEach(L => {
      const key = L.key;
      const zMid = layerMid(L);
      const rho = Math.max(0.3, A.airDensityAt(zMid));
      const f = A.sampleFields(0, 0, zMid, layers, wind, 0);
      const qcT = Math.max(0, f.lwc) * 1e-3 / rho;       // kg/kg
      let qc = k.qc[key] || 0, qr = k.qr[key] || 0;
      // 凝结源：向目标云水松弛
      qc += (qcT - qc) * Math.min(1, d / TAU_COND);
      // Kessler 自动转化 + 碰并
      const pac = Math.max(0, k1) * Math.max(0, qc - Math.max(0, qc0));
      const pgr = Math.max(0, k2) * Math.max(0, qc) * Math.max(0, qr);
      const conv = (pac + pgr) * d;
      qc = Math.max(0, qc - conv);
      qr = Math.max(0, qr + conv);
      // 雨滴沉降出层
      const H = Math.max(0.1, (L.top - L.base)) * 1000;   // m
      qr = Math.max(0, qr - qr * VT / H * d);
      k.qc[key] = qc; k.qr[key] = qr;
      Pac += pac; Pgr += pgr;
      rain += rho * qr * VT;
    });
    k.lastPac = Pac; k.lastPgr = Pgr;
    k.rainRate = rain * 3600;     // mm/h
    k.steps = (k.steps || 0) + 1;
    return readout();
  }

  function reset() {
    const k = ensure();
    A.LAYER_ORDER.forEach(key => { k.qc[key] = 0; k.qr[key] = 0; });
    k.rainRate = 0; k.lastPac = 0; k.lastPgr = 0; k.steps = 0;
    return readout();
  }

  function readout() {
    const k = ensure();
    let qcT = 0, qrT = 0;
    A.LAYER_ORDER.forEach(key => { qcT += k.qc[key] || 0; qrT += k.qr[key] || 0; });
    return {
      on: !!k.on, qcTotal: qcT, qrTotal: qrT, rainRate: k.rainRate || 0,
      lastPac: k.lastPac || 0, lastPgr: k.lastPgr || 0, steps: k.steps || 0,
      qc: Object.assign({}, k.qc), qr: Object.assign({}, k.qr),
    };
  }

  global.Kessler = { ensure, step, reset, readout, VT, TAU_COND };
})(window);
