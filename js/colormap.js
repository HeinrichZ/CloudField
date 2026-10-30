/* colormap.js — 各物理量的专属色标与归一化区间
 * 之前所有量共用一套 jet，读图时根本分不清量级。这里给每个量配自己的色标，
 * 并统一定义归一化区间；同一份定义导出成 256×1 LUT 纹理交给着色器，
 * 保证 3D 云体、水平切片、色标条三处颜色完全一致（改一处即可，不会各画各的）。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 */
(function (global) {
  'use strict';

  // stops: [位置0–1, [r,g,b]0–255]，首尾必须覆盖 0 和 1
  const CMAPS = {
    lwc: {
      unit: 'g/m³', range: [0, 1.5],
      stops: [[0, '#0b2a5b'], [0.22, '#2166ac'], [0.45, '#67a9cf'], [0.62, '#d1e5f0'],
              [0.78, '#fdd49e'], [0.9, '#ef8a62'], [1, '#b2182b']],   // 冷暖：蓝→白→红
    },
    beta: {
      unit: 'km⁻¹', range: [0, 80],
      stops: [[0, '#fde725'], [0.25, '#5ec962'], [0.5, '#21918c'], [0.75, '#3b528b'], [1, '#440154']], // viridis
    },
    re: {
      unit: 'µm', range: [2, 25],
      stops: [[0, '#00224e'], [0.25, '#123570'], [0.5, '#3b496c'], [0.75, '#8c2981'], [1, '#fe9f6d']],  // cividis
    },
    Nd: {
      unit: 'cm⁻³', range: [0, 1000],
      stops: [[0, '#0d0887'], [0.25, '#7e03a8'], [0.5, '#cc4778'], [0.75, '#f89540'], [1, '#f0f921']],   // plasma
    },
    temp: {
      unit: '°C', range: [-70, 40],
      stops: [[0, '#000080'], [0.25, '#00ffff'], [0.5, '#00ff00'], [0.75, '#ffff00'], [1, '#ff0000']],   // jet（沿用旧观感）
    },
    pres: {
      unit: 'hPa', range: [100, 1013],
      stops: [[0, '#000080'], [0.25, '#00ffff'], [0.5, '#00ff00'], [0.75, '#ffff00'], [1, '#ff0000']],
    },
    density: {
      unit: '—', range: [0, 1],
      stops: [[0, '#080c12'], [0.5, '#6b7686'], [1, '#ffffff']],
    },
  };

  const ORDER = ['lwc', 'beta', 're', 'Nd', 'temp', 'pres', 'density'];

  function hex2rgb(h) {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  const PARSED = {};
  for (const k in CMAPS) PARSED[k] = CMAPS[k].stops.map(s => [s[0], hex2rgb(s[1])]);

  // 归一化：v -> 0..1
  function norm(id, v) {
    const c = CMAPS[id]; if (!c) return 0;
    const [lo, hi] = c.range;
    return Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
  }
  // 取色：返回 [r,g,b]（0–255）
  function sample(id, v) {
    const st = PARSED[id]; if (!st) return [255, 255, 255];
    const t = norm(id, v);
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i], b = st[i + 1];
      if (t >= a[0] && t <= b[0]) {
        const f = (t - a[0]) / ((b[0] - a[0]) || 1);
        return [0, 1, 2].map(ch => Math.round(a[1][ch] + (b[1][ch] - a[1][ch]) * f));
      }
    }
    return st[st.length - 1][1];
  }
  function css(id, v) {
    const c = sample(id, v);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }
  function gradientCSS(id) {
    const st = PARSED[id]; if (!st) return 'linear-gradient(90deg,#000,#fff)';
    return 'linear-gradient(90deg,' + st.map(s => 'rgb(' + s[1].join(',') + ') ' + (s[0] * 100).toFixed(1) + '%').join(',') + ')';
  }
  // 导出 256×1 RGBA LUT（给 WebGL 用，保证与 JS 端同色）
  function lut(id) {
    const out = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const c = sample(id, CMAPS[id].range[0] + (i / 255) * (CMAPS[id].range[1] - CMAPS[id].range[0]));
      out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
    }
    return out;
  }
  // 色标条 DOM：可选 marker（标量在当前区间的位置指针）
  function barHTML(id, value, label) {
    const c = CMAPS[id]; if (!c) return '';
    const [lo, hi] = c.range;
    const pin = (value != null && isFinite(value)) ? (norm(id, value) * 100).toFixed(1) + '%' : null;
    return '<div class="cm-row">' +
      '<div class="cm-head"><span class="cm-name">' + (label || id) + '</span>' +
      '<span class="cm-unit">' + c.unit + '</span></div>' +
      '<div class="cm-bar" style="background:' + gradientCSS(id) + '">' +
      (pin ? '<i class="cm-pin" style="left:' + pin + '"></i>' : '') + '</div>' +
      '<div class="cm-ticks"><span>' + lo + '</span><span>' + hi + '</span></div>' +
      '</div>';
  }

  global.CMap = { CMAPS, ORDER, norm, sample, css, gradientCSS, lut, barHTML };
})(window);
