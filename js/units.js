/* units.js — 单位体系切换（常用 / SI）
 * 会场上一句“你这是 hPa 还是 mbar”能吵半天，所以做成可切换。
 *   常用（业务/航空气象习惯）：°C、hPa、km、m/s、m|km
 *   SI（严格国际单位）：       K、Pa、m、m/s、m
 * 物理计算内部一律用 °C / hPa / km / m，只在显示层换算，避免状态里出现两套数。
 * 注：1 hPa = 1 mbar，数值恒等，切换只改标签口径。
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'cloudfield.units';
  let system = 'common';                       // 'common' | 'si'

  try {
    const saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
    if (saved === 'si' || saved === 'common') system = saved;
  } catch (e) { /* 隐私模式下 localStorage 不可用，用默认值即可 */ }

  const listeners = [];

  function set(sys) {
    if (sys !== 'si' && sys !== 'common') return;
    if (sys === system) return;
    system = sys;
    try { global.localStorage && global.localStorage.setItem(STORAGE_KEY, sys); } catch (e) { /* 忽略 */ }
    listeners.forEach(fn => fn(system));
  }
  function get() { return system; }
  function onChange(fn) { listeners.push(fn); }
  function isSI() { return system === 'si'; }

  // ---- 换算：入参一律是内部单位（°C / hPa / km / m/s / m）----
  function temp(degC, digits) { return num(isSI() ? degC + 273.15 : degC, digits == null ? 1 : digits); }
  function pres(hPa, digits) { return num(isSI() ? hPa * 100 : hPa, digits == null ? 0 : digits); }
  function alt(km, digits) { return num(isSI() ? km * 1000 : km, digits == null ? 2 : digits); }
  function wind(ms, digits) { return num(ms, digits == null ? 1 : digits); }
  function vis(m) {
    if (!isFinite(m)) return '∞';
    if (isSI()) return num(m, 0);
    return m >= 1000 ? num(m / 1000, 2) : num(m, 0);
  }
  function num(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    return Number(v).toFixed(digits);
  }

  // ---- 单位符号 ----
  const U = {
    temp: () => isSI() ? 'K' : '°C',
    pres: () => isSI() ? 'Pa' : 'hPa',
    alt: () => isSI() ? 'm' : 'km',
    wind: () => 'm/s',
    vis: () => isSI() ? 'm' : (function () { return 'km'; })(),   // 常用下自动按量级选 m/km
    visOf: (m) => isSI() ? 'm' : (isFinite(m) && m >= 1000 ? 'km' : 'm'),
    lapse: () => isSI() ? 'K/km' : '°C/km',
  };

  // 整串输出：数值 + 单位
  function fmt(kind, value, digits) {
    switch (kind) {
      case 'temp': return temp(value, digits) + ' ' + U.temp();
      case 'pres': return pres(value, digits) + ' ' + U.pres();
      case 'alt': return alt(value, digits) + ' ' + U.alt();
      case 'wind': return wind(value, digits) + ' ' + U.wind();
      case 'vis': return vis(value) + ' ' + U.visOf(value);
      case 'lapse': return num(value, digits == null ? 1 : digits) + ' ' + U.lapse();
      default: return num(value, digits);
    }
  }

  global.Units = { get, set, onChange, isSI, temp, pres, alt, wind, vis, fmt, num, U };
})(window);
