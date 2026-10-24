/* export.js — 业务系统与大涡模拟前处理输出（#8 + ICON-LES / ETH CLOUDLAB 前处理配置）
 * 把诊断结果导出为标准行业报文与数值模式前处理配置：
 *   1) METAR/AVMET 文本、IWXXM XML、BUFR / GRIB 等效字段集
 *   2) ICON-LES / WRF Fortran Namelist (.nml) 微物理与播云前处理配置块
 *   3) ETH CLOUDLAB 敏感性试验 YAML 对照单
 *   4) 推送到 API 服务端（fetch 桩）
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

  // —— METAR / AVMET 文本 ——
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

  // —— BUFR / GRIB 等效字段集 ——
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

  // —— ICON-LES / WRF 风格 Fortran Namelist (.nml) 前处理配置导出 ——
  function toICONNamelist() {
    const m = S.micro || {};
    const sd = S.seeding || {};
    const sp = S.spectrum || {};
    const schemeId = m.scheme === 'sb06' ? 4 : (m.scheme === 'kk2000' ? 3 : 1);
    const nuShape = Math.max(0, Math.min(4, (1 / Math.max(0.05, sp.veff || 0.10)) - 3));
    return [
      '! ==========================================================================',
      '! CloudField Pre-processor Namelist for ICON-LES / 2-Moment Microphysics',
      '! Reference: ETH CLOUDLAB / Seifert & Beheng (2006) / Khairoutdinov & Kogan (2000)',
      '! ==========================================================================',
      '&microphysics_nml',
      '  inwp_gscp          = ' + schemeId + ',              ! 1=Kessler(1-mom), 3=KK2000(2-mom), 4=SB06(ICON 2-mom)',
      '  scheme_name        = "' + (m.scheme || 'kessler') + '",',
      '  qnc_const          = ' + (m.dropConc * 1e6).toExponential(3) + ',     ! Cloud droplet number conc. N_c [m^-3]',
      '  re_fixed_um        = ' + Number(m.effRadiusUm).toFixed(2) + ',          ! Reference effective radius [um]',
      '  re_mode            = "' + (m.reMode || 'derived') + '",',
      '  nu_c_shape         = ' + nuShape.toFixed(2) + ',          ! Gamma shape parameter from v_eff=' + Number(sp.veff || 0.1).toFixed(2),
      '  k_autoconv         = ' + Number(m.autoConvK).toExponential(3) + ',     ! Autoconversion rate coeff k1 [s^-1]',
      '  qc0_threshold      = ' + Number(m.autoConvQc0).toExponential(3) + ',     ! Critical cloud water mixing ratio [kg/kg]',
      '  k_accretion        = ' + Number(m.accretK).toFixed(2) + ',          ! Accretion coeff k2',
      '  l_korolev_mixed    = .' + (m.autoPhaseTemp ? 'TRUE' : 'FALSE') + '.,       ! T-dependent mixed-phase partitioning (0..-38 degC)',
      '/',
      '',
      '&cloudlab_seeding_nml',
      '  l_seeding_active   = .' + (sd.on ? 'TRUE' : 'FALSE') + '.,       ! Glaciogenic cloud seeding (WBF process)',
      '  seeding_agent      = "' + (sd.agent || 'agi').toUpperCase() + '",          ! AGI (AgI, T<=-4C) or CO2 (Liquid CO2, T<=-0.5C)',
      '  ninp_seed_liter    = ' + Number(sd.inpConc || 80).toFixed(1) + ',          ! Seeded INP concentration [L^-1]',
      '  seed_x0_km         = ' + Number(sd.x0 != null ? sd.x0 : -8.0).toFixed(2) + ',',
      '  seed_z_alt_km      = ' + Number(sd.alt != null ? sd.alt : 1.1).toFixed(2) + ',',
      '  plume_halfwidth_km = ' + Number(sd.width || 2.2).toFixed(2) + ',',
      '  turbulent_diff_k   = ' + Number(sd.diffK || 0.30).toFixed(3) + ',',
      '  wbf_glaciation_eff = ' + Number(sd.glaciationEff != null ? sd.glaciationEff : 0.85).toFixed(2) + ',',
      '/',
      '',
      '&sounding_init_nml',
      '  t_sfc_degc         = ' + Number(S.surfaceTemp).toFixed(2) + ',',
      '  p_sfc_hpa          = ' + Number(S.surfacePressure).toFixed(1) + ',',
      '  rh_sfc_pct         = ' + Number(S.surfaceRH).toFixed(1) + ',',
      '  lapse_rate_k_km    = ' + Number(S.lapseRate).toFixed(2) + ',',
      '  wind_speed_ms      = ' + Number(S.windSpeed).toFixed(2) + ',',
      '  wind_dir_deg       = ' + Number(S.windDir).toFixed(1) + ',',
      '/',
    ].join('\n');
  }

  // —— ETH CLOUDLAB 敏感性试验对照单（YAML）——
  function toExperimentYAML() {
    const r = readouts();
    const sdDiag = P.seedingDiagnostics ? P.seedingDiagnostics(0) : null;
    const cmp = global.Kessler && global.Kessler.compareSchemes ? global.Kessler.compareSchemes() : null;
    return [
      '# CloudField Sensitivity Experiment Manifest (ETH CLOUDLAB / ICON-LES Sandbox)',
      'experiment:',
      '  scheme: ' + (S.micro.scheme || 'kessler'),
      '  re_mode: ' + (S.micro.reMode || 'derived'),
      '  droplet_conc_cm3: ' + S.micro.dropConc,
      '  effective_radius_um: ' + Number(r.re).toFixed(2),
      '  spectral_veff: ' + Number((S.spectrum && S.spectrum.veff) || 0.10).toFixed(3),
      '  korolev_temp_phase: ' + (!!S.micro.autoPhaseTemp),
      'scheme_comparison_at_current_N:',
      '  rain_rate_mm_h:',
      '    kessler_1969: ' + (cmp ? cmp.atCurrentN.kessler.toFixed(3) : '0.000'),
      '    kk2000_2mom: ' + (cmp ? cmp.atCurrentN.kk2000.toFixed(3) : '0.000'),
      '    sb06_icon_2mom: ' + (cmp ? cmp.atCurrentN.sb06.toFixed(3) : '0.000'),
      'cloudlab_seeding:',
      '  enabled: ' + (!!(S.seeding && S.seeding.on)),
      '  agent: ' + ((S.seeding && S.seeding.agent) || 'agi'),
      '  inp_conc_L: ' + ((S.seeding && S.seeding.inpConc) || 80),
      '  ambient_visibility_m: ' + (sdDiag ? Math.round(sdDiag.visAmbientM) : 'NA'),
      '  in_plume_visibility_m: ' + (sdDiag ? Math.round(sdDiag.visSeededM) : 'NA'),
      '  visibility_gain_ratio: ' + (sdDiag ? sdDiag.gainRatio.toFixed(2) : '1.00'),
      '  cat1_minima_recovered: ' + (sdDiag ? sdDiag.cat1Recovered : false),
    ].join('\n');
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

  global.Exporter = { toMETAR, toIWXXM, toBUFR, toGRIB, toICONNamelist, toExperimentYAML, pushTo, readouts };
})(window);
