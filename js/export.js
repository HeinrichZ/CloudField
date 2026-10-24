/* export.js — 业务系统输出（#8）
 * 把诊断结果导出为标准行业报文：METAR/AVMET 文本、IWXXM XML、
 * BUFR / GRIB 的人类可读等效字段集（二进制编码需按 WMO 模板实现，标注于注释）。
 * 并提供"推送到 API 服务端"的能力（fetch 桩）。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const P = global.Physics;
  const O = global.Operators;
  const S = A.STATE;

  function pad(n, w) { return String(Math.round(n)).padStart(w, '0'); }

  function readouts() {
    const w = P.worstVisibilityDetailed(0);
    const cover = A.totalCloudCover();
    const ops = O.compute(0);
    const info = w.info || {};
    return { vis: w.vis, alt: w.alt, cover, ops, re: info.re != null ? info.re : A.operativeRe(0), lwc: info.lwc || 0 };
  }

  // —— METAR / AVMET 文本（自包含，站号与时刻为占位）——
  function toMETAR(opts) {
    opts = opts || {};
    const r = readouts();
    const vis = isFinite(r.vis) ? Math.min(9999, Math.round(r.vis)) : 9999;
    const wdir = pad(S.windDir, 3), wspd = pad(S.windSpeed, 2);
    const T = Math.round(S.surfaceTemp), Td = Math.round(A.dewAt(0));
    const dd = (Td < 0 ? 'M' + pad(-Td, 2) : pad(Td, 2));
    const TT = (T < 0 ? 'M' + pad(-T, 2) : pad(T, 2));
    const clouds = A.LAYER_ORDER.filter(k => S.layers[k].on && S.layers[k].coverage > 0.02)
      .map(k => k.toUpperCase() + (S.layers[k].base * 100).toFixed(0)).join(' ');
    return (opts.station || 'ZCCC') + ' ' + (opts.time || '241200Z') + ' ' +
      wdir + wspd + 'KT ' + (vis === 9999 ? '9999' : pad(vis, 4)) + ' ' +
      'SKC ' + (clouds || 'NSC') + ' ' + TT + '/' + dd + ' ' +
      'Q' + pad(S.surfacePressure, 4) + ' ' + (opts.remark || ('VIScalc=' + (isFinite(r.vis) ? r.vis.toFixed(0) + 'm' : 'NA') + ' COV=' + r.cover.toFixed(0) + '%'));
  }

  // —— IWXXM XML（航空气象信息交换模型，简化可读版）——
  function toIWXXM(opts) {
    opts = opts || {};
    const r = readouts();
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Metar xmlns="http://www.wmo.int/IWXXM" permissibleUsage="OPERATIONAL">\n' +
      '  <observingTime>' + (opts.time || '2026-10-24T12:00:00Z') + '</observingTime>\n' +
      '  <station>' + (opts.station || 'ZCCC') + '</station>\n' +
      '  <visibility uom="m">' + (isFinite(r.vis) ? Math.round(r.vis) : 9999) + '</visibility>\n' +
      '  <airTemperature uom="degC">' + S.surfaceTemp.toFixed(1) + '</airTemperature>\n' +
      '  <dewpointTemperature uom="degC">' + A.dewAt(0).toFixed(1) + '</dewpointTemperature>\n' +
      '  <qnh uom="hPa">' + S.surfacePressure.toFixed(0) + '</qnh>\n' +
      '  <totalCloudCover uom="percent">' + r.cover.toFixed(0) + '</totalCloudCover>\n' +
      '  <computedVisibility uom="m">' + (isFinite(r.vis) ? Math.round(r.vis) : 9999) + '</computedVisibility>\n' +
      '</Metar>';
  }

  // —— BUFR / GRIB 等效字段集（人类可读；二进制编码需 WMO 模板）——
  // 注：真实 BUFR 需按 WMO 模板（如 307080 地面观测、307091 云/能见度）
  //     做二进制编码；此处输出结构化字段，供接入编码器。
  function toBUFR() {
    const r = readouts();
    return {
      schema: 'BUFR/WMO-equivalent fields (binary encoding requires WMO template)',
      station: 'ZCCC', category: 0, subtype: 1,
      fields: [
        { f: 'WMOBlockStation', v: 'ZCCC' },
        { f: 'windDirection', u: 'deg', v: S.windDir },
        { f: 'windSpeed', u: 'm/s', v: S.windSpeed },
        { f: 'visibility', u: 'm', v: isFinite(r.vis) ? Math.round(r.vis) : 9999 },
        { f: 'airTemperature', u: 'degC', v: S.surfaceTemp },
        { f: 'dewpoint', u: 'degC', v: Number(A.dewAt(0).toFixed(2)) },
        { f: 'pressure', u: 'hPa', v: S.surfacePressure },
        { f: 'cloudCover', u: '%', v: r.cover.toFixed(0) },
        { f: 'cloudOpticalDepth', v: r.ops.opticalDepth.toFixed(3) },
        { f: 'computedVisibility', u: 'm', v: isFinite(r.vis) ? Math.round(r.vis) : 9999 },
      ],
    };
  }
  function toGRIB() {
    const r = readouts();
    return {
      schema: 'GRIB2-equivalent fields (binary encoding requires GRIB2 template)',
      discipline: 0, parameter: 'visibility',
      fields: [
        { f: 'surfaceVisibility', u: 'm', v: isFinite(r.vis) ? Math.round(r.vis) : 9999 },
        { f: 'totalCloudCover', u: '%', v: r.cover.toFixed(0) },
        { f: 'cloudOpticalDepth', v: r.ops.opticalDepth.toFixed(3) },
        { f: 'effectiveRadius', u: 'um', v: Number(r.re).toFixed(2) },
        { f: 'dropConc', u: 'cm-3', v: S.micro.dropConc.toFixed(0) },
      ],
    };
  }

  // —— 推送到业务系统（fetch 桩）——
  function pushTo(endpoint, payload, opts) {
    opts = opts || {};
    const body = payload || { format: 'json', data: readouts() };
    if (opts.verbose && global.console) console.log('CloudField: pushing to', endpoint);
    if (typeof fetch !== 'function') return Promise.reject(new Error('当前环境无 fetch（浏览器或 Node18+）'));
    return fetch(endpoint, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
      body: JSON.stringify(body),
    }).then(r => r.ok ? r : Promise.reject(new Error('HTTP ' + r.status)));
  }

  global.Exporter = { toMETAR, toIWXXM, toBUFR, toGRIB, pushTo, readouts };
})(window);
