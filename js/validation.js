/* validation.js — 验证与误差评估
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

  // 由探空样本构造"观测 vs 计算"配对（高度-能见度/温度），用于默认验证：
  // 依据探空各层的温度露点差 ΔTd = T − Td（及相对湿度 RH），采用 Gultepe et al. (2006) / FSL 湿层能见度参数化
  // 生成随高度连续变化的探空参考能见度（取代此前写死 8000 m 常数导致相关系数 R ≡ 0、泰勒图失效的缺陷）
  function obsVisFromSoundingRow(z, T, Td) {
    const dtd = Math.max(0, T - Td);
    const rh = 100 * Math.exp((17.27 * Td) / (237.7 + Td) - (17.27 * T) / (237.7 + T));
    // 近饱和层（ΔTd < 3.5°C） diagnosing 典型边界层/中层云内低能见度；干层恢复至高空能见度基准
    if (dtd <= 4.0) {
      const lwcObs = Math.max(0.01, 0.42 * Math.exp(-dtd / 1.45) * Math.exp(-Math.max(0, z - 1.2) / 4.5));
      const betaObs = A.extinctionFromLWC(lwcObs, 9.5);
      return Math.min(10000, Math.max(80, A.visibilityFromExt(betaObs)));
    }
    return Math.min(10000, Math.round(2500 + 7500 * Math.min(1, (100 - rh) / 35)));
  }

  function fromRadiosonde(sonde) {
    const src = sonde || (A.getRadiosonde ? A.getRadiosonde() : A.RADIOSONDE_SAMPLE);
    const layers = A.effectiveLayers();
    const wind = { x: A.STATE.windSpeed, dir: A.STATE.windDir };
    const hasDetailed = !!(global.Physics && typeof global.Physics.detailedAt === 'function');
    const pts = [[0, 0], [-6, -6], [6, 6], [-6, 6], [6, -6]];
    const visPairs = [], tPairs = [];
    src.data.forEach(row => {
      const z = row[0], T = row[2], Td = row[3];
      let beta = 0;
      for (let i = 0; i < pts.length; i++) {
        const px = pts[i][0], py = pts[i][1];
        const b = hasDetailed
          ? global.Physics.detailedAt(px, py, z, layers, wind, 0).betaExt
          : A.extinctionFromLWC(A.sampleFields(px, py, z, layers, wind, 0).lwc, A.operativeRe(A.sampleFields(px, py, z, layers, wind, 0).lwc));
        if (b > beta) beta = b;
      }
      const vis = A.visibilityFromExt(beta);
      const obsVis = obsVisFromSoundingRow(z, T, Td);
      visPairs.push({ z, obs: obsVis, model: isFinite(vis) ? Math.min(10000, vis) : 10000 });
      tPairs.push({ z, obs: T, model: A.tempAt(z) });
    });
    return { visPairs, tPairs };
  }

  global.Validation = { stats, taylor, fromRadiosonde };
})(window);
