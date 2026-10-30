/* batch.js — 批处理与自动化核心
 * 无人值守批量诊断：机场列表 × 时次矩阵。
 * 纯计算（不依赖 DOM），可在浏览器与 Node（经 CLI 加载全局）中复用。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const P = global.Physics;
  const O = global.Operators;

  function runOne(statePatch, time) {
    if (statePatch) P.applyStatePatch(statePatch);
    const t = time || 0;
    const w = P.worstVisibilityDetailed(t);
    const cover = A.totalCloudCover();
    const ops = O.compute(t, { all: true });
    return {
      vis: isFinite(w.vis) ? Math.round(w.vis) : null,
      visAlt: +w.alt.toFixed(2),
      cover: +cover.toFixed(1),
      opticalDepth: +ops.opticalDepth.toFixed(3),
      lwp: ops.lwp != null ? +ops.lwp.toFixed(1) : null,
      iwp: ops.iwp != null ? +ops.iwp.toFixed(1) : null,
      creSW: ops.creSW != null ? +ops.creSW.toFixed(1) : null,
      albedo: ops.albedo != null ? +ops.albedo.toFixed(3) : null,
      dBZ: ops.radar ? +ops.radar.dBZ.toFixed(1) : null,
      satelliteTb: ops.satelliteTb != null ? +ops.satelliteTb.toFixed(1) : null,
      capeJkg: ops.thermo ? ops.thermo.capeJkg : null,
      icingIndex: ops.icing ? ops.icing.maxIndex : null,
      svrAtCat1DhM: ops.approachSlant ? ops.approachSlant.svrAtCat1DhM : null,
      edrMax: ops.turbulence ? ops.turbulence.edrMax : null,
      llwsKtPer100Ft: ops.turbulence ? ops.turbulence.llwsKtPer100Ft : null,
      uavStatus: ops.uav ? ops.uav.status : null,
      contrailPersistent: ops.contrail ? ops.contrail.contrailPersistent : null,
    };
  }

  // config: { stations:[{name, patch}], times:[t...] 或 steps }
  function run(config) {
    const stations = config.stations || [{ name: 'default', patch: null }];
    const times = config.times || [0];
    const baseSnap = A.serialize();
    const rows = [];
    try {
      stations.forEach(st => {
        A.deserialize(baseSnap);
        times.forEach(t => {
          const r = runOne(st.patch, t);
          rows.push(Object.assign({ station: st.name, t: +t.toFixed(2) }, r));
        });
      });
    } finally {
      A.deserialize(baseSnap);
    }
    return rows;
  }

  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const head = cols.join(',');
    const body = rows.map(r => cols.map(c => r[c] == null ? '' : r[c]).join(',')).join('\n');
    return head + '\n' + body;
  }
  function toJSON(rows) { return JSON.stringify({ app: 'CloudField', rows }, null, 2); }

  global.Batch = { runOne, run, toCSV, toJSON };
})(window);
