/* phases.js — 相态分档与气溶胶
 * 提供相态预设、归一化与元数据，供 GUI 与物理层使用。
 * 相态为"质量分数"，内部在 Physics.phaseFractions() 中按总和归一。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const S = A.STATE;
  const ORDER = ['water', 'ice', 'snow', 'graupel', 'hail'];

  const META = {
    water:   { label: '云滴 (液态)',  short: 'L' },
    ice:     { label: '冰晶',          short: 'I' },
    snow:    { label: '雪',            short: 'S' },
    graupel: { label: '霰',            short: 'G' },
    hail:    { label: '雹',            short: 'H' },
  };

  // 常用相态预设（质量分数，和为 1）
  const PRESETS = {
    pureWater: { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 },
    mixedIce:  { water: 0.6, ice: 0.4, snow: 0, graupel: 0, hail: 0 },
    cirrus:    { water: 0, ice: 1, snow: 0, graupel: 0, hail: 0 },
    snowy:     { water: 0.2, ice: 0.2, snow: 0.6, graupel: 0, hail: 0 },
    convective:{ water: 0.35, ice: 0.25, snow: 0.1, graupel: 0.2, hail: 0.1 },
  };

  function syncMicroIce() {
    if (S.micro) S.micro.iceFrac = Math.max(0, Math.min(1, 1 - (S.phases.water || 0)));
  }

  function set(presetName) {
    const p = PRESETS[presetName];
    if (!p) return false;
    ORDER.forEach(k => { S.phases[k] = p[k] || 0; });
    syncMicroIce();
    return true;
  }
  function normalize() {
    let sum = ORDER.reduce((s, k) => s + Math.max(0, S.phases[k] || 0), 0);
    if (sum <= 0) { S.phases.water = 1; syncMicroIce(); return; }
    ORDER.forEach(k => { S.phases[k] = Math.max(0, S.phases[k] || 0) / sum; });
    syncMicroIce();
  }
  function current() {
    const o = {};
    ORDER.forEach(k => { o[k] = S.phases[k] || 0; });
    return o;
  }

  global.Phases = { ORDER, META, PRESETS, set, normalize, current };
})(window);
