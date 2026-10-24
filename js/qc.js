/* qc.js — 数据质控（#7）
 * 对导入的探空 / METAR 做合理性检查、缺测处理、异常值标记，
 * 以及时间戳对齐与坐标系统一（UTC 归一、WGS-84 提示）。
 * 输出结构化 QC 报告供 UI 展示。
 */
(function (global) {
  'use strict';

  const LIMITS = {
    p: [100, 1100],        // hPa
    T: [-100, 60],         // °C
    Td: [-100, 35],        // °C
    vis: [0, 100000],      // m
  };

  function flagSounding(rows) {
    const out = [];
    let prevP = Infinity;
    const counts = { ok: 0, warn: 0, error: 0, missing: 0 };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const flags = [];
      const missing = (r.p == null || r.T == null);
      if (missing) {
        counts.missing++;
        flags.push({ level: 'error', msg: '缺测（气压或温度为空）' });
      } else {
        if (r.p < LIMITS.p[0] || r.p > LIMITS.p[1]) flags.push({ level: 'error', msg: '气压越界 ' + r.p + ' hPa' });
        if (r.T < LIMITS.T[0] || r.T > LIMITS.T[1]) flags.push({ level: 'error', msg: '温度越界 ' + r.T + ' °C' });
        if (r.Td != null && r.Td > r.T) flags.push({ level: 'error', msg: '露点高于温度' });
        if (r.Td != null && (r.Td < LIMITS.Td[0] || r.Td > LIMITS.Td[1])) flags.push({ level: 'warn', msg: '露点可疑 ' + r.Td + ' °C' });
        if (r.p > prevP) flags.push({ level: 'warn', msg: '气压随高度未递减（层结异常）' });
        // 露点差过大（>30°C）在边界层偏异常
        if (r.Td != null && (r.T - r.Td) > 30) flags.push({ level: 'warn', msg: '露点差过大 ' + (r.T - r.Td).toFixed(1) + ' °C' });
      }
      prevP = r.p != null ? r.p : prevP;
      const level = flags.some(f => f.level === 'error') ? 'error' : (flags.length ? 'warn' : 'ok');
      counts[level]++;
      out.push({ index: i, z: r.z, p: r.p, T: r.T, Td: r.Td, level, flags });
    }
    return { kind: 'sounding', counts, rows: out, total: rows.length };
  }

  // 轻量 METAR 解析与质控：识别能见度、温度/露点、风
  function flagMetar(text) {
    const blocks = (text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const rows = [];
    let counts = { ok: 0, warn: 0, error: 0, missing: 0 };
    const reVis = /(\d{4})(?=\s|$)/;                 // 能见度 4 位（米），9999=无限
    const reTd = /(M?\d{2})\/(M?\d{2})/;             // 温度/露点
    const reWind = /(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT/;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const flags = [];
      const visM = b.match(reVis);
      let vis = null;
      if (visM) { vis = visM[1] === '9999' ? 99999 : parseInt(visM[1], 10); if (vis < LIMITS.vis[0] || vis > LIMITS.vis[1]) flags.push({ level: 'warn', msg: '能见度可疑 ' + vis }); }
      else flags.push({ level: 'warn', msg: '未解析到能见度' });
      const td = b.match(reTd);
      let T = null, Td = null;
      if (td) {
        T = parseInt(td[1].replace('M', '-'), 10);
        Td = parseInt(td[2].replace('M', '-'), 10);
        if (Td > T) flags.push({ level: 'error', msg: '露点高于温度' });
      }
      const w = b.match(reWind);
      const wind = w ? (w[1] === 'VRB' ? 'VRB' : w[1] + '°/' + w[2] + 'kt') : '未解析';
      const level = flags.some(f => f.level === 'error') ? 'error' : (flags.length ? 'warn' : 'ok');
      counts[level]++;
      rows.push({ index: i, raw: b.slice(0, 60), vis, T, Td, wind, level, flags });
    }
    return { kind: 'metar', counts, rows, total: rows.length };
  }

  // 时间戳对齐与坐标系统一建议
  function coordAdvice() {
    return {
      time: '建议统一为 UTC（ISO-8601）；跨源导入时按 UTC 对齐时次，避免本地时区错位。',
      coord: '建议统一为 WGS-84（经纬度 + 海拔），导入时把本地坐标系统一到该基准。',
    };
  }

  global.QC = { flagSounding, flagMetar, coordAdvice, LIMITS };
})(window);
