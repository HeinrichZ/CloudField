/* validation.js — 验证与误差评估（#9）
 * 模型 vs 观测：偏差、均方根误差、相关系数、散点、时间序列对比、泰勒图统计量。
 * 纯统计计算；绘图由 UI 层（canvas）完成。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;

  function stats(pairs) {
    const n = pairs.length;
    if (n === 0) return null;
    let so = 0, sm = 0;
    pairs.forEach(p => { so += p.obs; sm += p.model; });
    const mo = so / n, mm = sm / n;
    let bias = mm - mo, sse = 0, sae = 0, vo = 0, vm = 0, cov = 0;
    pairs.forEach(p => {
      sse += (p.model - p.obs) ** 2;
      sae += Math.abs(p.model - p.obs);
      vo += (p.obs - mo) ** 2; vm += (p.model - mm) ** 2;
      cov += (p.obs - mo) * (p.model - mm);
    });
    const stdObs = Math.sqrt(vo / n), stdModel = Math.sqrt(vm / n);
    const corr = (stdObs > 0 && stdModel > 0) ? cov / (n * stdObs * stdModel) : 0;
    return {
      n, bias, mae: sae / n, rmse: Math.sqrt(sse / n),
      stdObs, stdModel, corr,
    };
  }

  // 泰勒图统计量：标准差比、相关系数、中心化均方根
  function taylor(pairs) {
    const s = stats(pairs);
    if (!s) return null;
    const stdRatio = s.stdObs > 0 ? s.stdModel / s.stdObs : 0;
    const centeredRMS = Math.sqrt(s.stdModel ** 2 + s.stdObs ** 2 - 2 * s.stdObs * s.stdModel * s.corr);
    return { stdRatio, corr: s.corr, centeredRMS, stdObs: s.stdObs, stdModel: s.stdModel };
  }

  // 由探空样本构造"观测 vs 计算"配对（高度-能见度/温度），用于默认验证
  function fromRadiosonde() {
    const src = A.RADIOSONDE_SAMPLE;
    const layers = A.effectiveLayers();
    const wind = { x: A.STATE.windSpeed, dir: A.STATE.windDir };
    const visPairs = [], tPairs = [];
    src.data.forEach(row => {
      const z = row[0], T = row[2], Td = row[3];
      const f = A.sampleFields(0, 0, z, layers, wind, 0);
      const beta = A.extinctionFromLWC(f.lwc, A.operativeRe(f.lwc));
      const vis = A.visibilityFromExt(beta);
      visPairs.push({ obs: 8000, model: isFinite(vis) ? vis : 8000 });  // 示例：观测取代表性上限
      tPairs.push({ obs: T, model: A.tempAt(z) });
    });
    return { visPairs, tPairs };
  }

  global.Validation = { stats, taylor, fromRadiosonde };
})(window);
