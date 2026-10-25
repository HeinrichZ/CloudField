/* batch.js — 批处理与自动化核心
 * 无人值守批量诊断：机场列表 × 时次矩阵。
 * 纯计算（不依赖 DOM），可在浏览器与 Node（经 CLI 加载全局）中复用。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const P = global.Physics;
  const O = global.Operators;

  function runOne(statePatch, time) {
    if (statePatch) P.applyStatePatch(statePatch);
    const w = P.worstVisibilityDetailed(time || 0);
    const cover = A.totalCloudCover();
    const ops = O.compute(time || 0);
    return {
      vis: isFinite(w.vis) ? Math.round(w.vis) : null,
      visAlt: +w.alt.toFixed(2),
      cover: +cover.toFixed(1),
      opticalDepth: +ops.opticalDepth.toFixed(3),
      albedo: ops.albedo != null ? +ops.albedo.toFixed(3) : null,
      dBZ: ops.radar ? +ops.radar.dBZ.toFixed(1) : null,
      satelliteTb: ops.satelliteTb != null ? +ops.satelliteTb.toFixed(1) : null,
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
