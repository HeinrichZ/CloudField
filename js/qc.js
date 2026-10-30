/* qc.js — 数据质控
 * 对导入的探空 / METAR 做合理性检查、缺测处理、异常值标记，
 * 以及时间戳对齐与坐标系统一（UTC 归一、WGS-84 提示）。
 * 输出结构化 QC 报告供 UI 展示。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
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

  // 轻量 METAR 解析与质控：支持中国民航 MPS 与国际 KT/KMH 风速单位、CAVOK、温度/露点、QNH/Altimeter 合理性检查
  function flagMetar(text) {
    const blocks = (text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const rows = [];
    let counts = { ok: 0, warn: 0, error: 0, missing: 0 };
    const reVis = /(?:^|\s)(\d{4})(?:NE|SE|NW|SW|N|E|S|W)?(?=\s|$)/;  // 能见度 4 位（米），9999=≥10km
    const reCavok = /\b(CAVOK|SKC|CLR)\b/;
    const reTd = /\b(M?\d{2})\/(M?\d{2})\b/;                          // 温度/露点
    const reWind = /\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)\b/;
    const reQnh = /\b(?:Q(\d{4})|A(\d{4}))\b/;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const flags = [];
      const qnhM = b.match(reQnh);
      let qnhHpa = null;
      if (qnhM) {
        qnhHpa = qnhM[1] ? parseInt(qnhM[1], 10) : Math.round(parseInt(qnhM[2], 10) * 0.01 * 33.8639);
        if (qnhHpa < 870 || qnhHpa > 1085) flags.push({ level: 'error', msg: 'QNH 气压异常 ' + qnhHpa + ' hPa' });
      }
      // 剥离 QNH / 时间组后再匹配 4 位能见度，避免把 Q1013 误当成能见度
      const bNoQnh = b.replace(/\b[QA]\d{4}\b/g, '').replace(/\b\d{6}Z\b/g, '');
      const visM = bNoQnh.match(reVis);
      let vis = null;
      if (reCavok.test(b)) {
        vis = 10000;
      } else if (visM) {
        vis = visM[1] === '9999' ? 99999 : parseInt(visM[1], 10);
        if (vis < LIMITS.vis[0] || vis > LIMITS.vis[1]) flags.push({ level: 'warn', msg: '能见度可疑 ' + vis });
      } else {
        flags.push({ level: 'warn', msg: '未解析到能见度' });
      }
      const td = b.match(reTd);
      let T = null, Td = null;
      if (td) {
        T = parseInt(td[1].replace('M', '-'), 10);
        Td = parseInt(td[2].replace('M', '-'), 10);
        if (Td > T) flags.push({ level: 'error', msg: '露点高于温度' });
      }
      const w = b.match(reWind);
      let wind = '未解析';
      if (w) {
        const spd = parseInt(w[2], 10);
        const gst = w[3] ? parseInt(w[3], 10) : null;
        const unit = w[4];
        wind = (w[1] === 'VRB' ? 'VRB' : w[1] + '°') + '/' + spd + (gst ? 'G' + gst : '') + unit.toLowerCase();
        if (gst != null && gst <= spd) flags.push({ level: 'warn', msg: '阵风未高于平均风速' });
      } else {
        flags.push({ level: 'warn', msg: '未解析到风组' });
      }
      const level = flags.some(f => f.level === 'error') ? 'error' : (flags.length ? 'warn' : 'ok');
      counts[level]++;
      rows.push({ index: i, raw: b.slice(0, 60), vis, T, Td, wind, qnh: qnhHpa, level, flags });
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
