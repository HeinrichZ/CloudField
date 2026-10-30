/* export.js — 业务系统与大涡模拟前处理输出（ICON-LES / ETH CLOUDLAB 前处理配置）
 * 把诊断结果导出为标准行业报文与数值模式前处理配置：
 *   1) METAR/AVMET 文本、IWXXM XML、BUFR / GRIB 等效字段集
 *   2) ICON-LES / WRF Fortran Namelist (.nml) 微物理与播云前处理配置块
 *   3) ETH CLOUDLAB 敏感性试验 YAML 对照单
 *   4) 推送到 API 服务端（fetch 桩）
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
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
    const ops = O.compute(0, { all: true });
    const info = w.info || {};
    return { vis: w.vis, alt: w.alt, cover, ops, re: info.re != null ? info.re : A.operativeRe(0), lwc: info.lwc || 0 };
  }

  function activeStation(opts) {
    if (opts && opts.station) return opts.station;
    if (global.Integration && global.Integration.state && global.Integration.state.activeStation) {
      return global.Integration.state.activeStation;
    }
    return 'ZCCC';
  }

  // —— METAR / AVMET 文本（符合 ICAO Annex 3 云量 FEW/SCT/BKN/OVC、百英尺云底高与节/米秒风速编码）——
  function toMETAR(opts) {
    if (typeof opts === 'string') opts = { station: opts };
    opts = opts || {};
    const r = readouts();
    const sta = activeStation(opts);
    const vis = isFinite(r.vis) ? Math.min(9999, Math.max(50, Math.round(r.vis / 50) * 50)) : 9999;
    const wdir = pad(Math.round((S.windDir || 0) / 10) * 10, 3);
    const useMPS = opts.windUnit === 'MPS';
    const wspdNum = useMPS ? Math.min(99, Math.round(S.windSpeed || 0)) : Math.min(99, Math.round((S.windSpeed || 0) * 1.94384));
    const wspdStr = pad(wspdNum, 2) + (useMPS ? 'MPS' : 'KT');
    const T = Math.round(A.tempAt(0)), Td = Math.round(A.dewAt(0));
    const dd = (Td < 0 ? 'M' + pad(-Td, 2) : pad(Td, 2));
    const TT = (T < 0 ? 'M' + pad(-T, 2) : pad(T, 2));
    const now = new Date();
    const timeStr = opts.time || (pad(now.getUTCDate(), 2) + pad(now.getUTCHours(), 2) + pad(now.getUTCMinutes(), 2) + 'Z');
    const eff = A.effectiveLayers().slice().sort((a, b) => a.base - b.base);
    const cloudGrps = [];
    eff.forEach(L => {
      if (L.coverage < 0.05 || L.density < 0.05) return;
      const covCode = L.coverage < 0.25 ? 'FEW' : (L.coverage < 0.50 ? 'SCT' : (L.coverage < 0.875 ? 'BKN' : 'OVC'));
      const hft = pad(Math.max(1, Math.round((L.base * 1000) / 30.48)), 3);
      const suffix = L.key === 'cb' ? 'CB' : (L.key === 'cu' && (L.top - L.base) >= 3.0 ? 'TCU' : '');
      cloudGrps.push(covCode + hft + suffix);
    });
    const wx = vis < 1000 ? 'FG ' : (vis < 5000 ? (S.aerosol && S.aerosol.on && S.surfaceRH < 80 ? 'HZ ' : 'BR ') : '');
    const cldStr = cloudGrps.length ? cloudGrps.join(' ') : 'NSC';
    return 'METAR ' + sta + ' ' + timeStr + ' ' +
      wdir + wspdStr + ' ' + (vis === 9999 ? '9999' : pad(vis, 4)) + ' ' + wx +
      cldStr + ' ' + TT + '/' + dd + ' ' +
      'Q' + pad(S.surfacePressure, 4) + ' RMK ' + (opts.remark || ('VIScalc=' + (isFinite(r.vis) ? r.vis.toFixed(0) + 'm' : 'NA') + ' COV=' + r.cover.toFixed(0) + '%'));
  }

  // —— IWXXM XML（航空气象信息交换模型，简化可读版）——
  function toIWXXM(opts) {
    opts = opts || {};
    const r = readouts();
    const sta = activeStation(opts);
    const isoNow = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Metar xmlns="http://www.wmo.int/IWXXM" permissibleUsage="OPERATIONAL">\n' +
      '  <observingTime>' + (opts.time || isoNow) + '</observingTime>\n' +
      '  <station>' + sta + '</station>\n' +
      '  <visibility uom="m">' + (isFinite(r.vis) ? Math.round(r.vis) : 9999) + '</visibility>\n' +
      '  <airTemperature uom="degC">' + A.tempAt(0).toFixed(1) + '</airTemperature>\n' +
      '  <dewpointTemperature uom="degC">' + A.dewAt(0).toFixed(1) + '</dewpointTemperature>\n' +
      '  <qnh uom="hPa">' + S.surfacePressure.toFixed(0) + '</qnh>\n' +
      '  <totalCloudCover uom="percent">' + r.cover.toFixed(0) + '</totalCloudCover>\n' +
      '  <computedVisibility uom="m">' + (isFinite(r.vis) ? Math.round(r.vis) : 9999) + '</computedVisibility>\n' +
      '</Metar>';
  }

  // —— BUFR / GRIB 等效字段集 ——
  function toBUFR(opts) {
    const r = readouts();
    const sta = activeStation(opts);
    return {
      schema: 'BUFR/WMO-equivalent fields (binary encoding requires WMO template)',
      station: sta, category: 0, subtype: 1,
      fields: [
        { f: 'WMOBlockStation', v: sta },
        { f: 'windDirection', u: 'deg', v: S.windDir },
        { f: 'windSpeed', u: 'm/s', v: S.windSpeed },
        { f: 'visibility', u: 'm', v: isFinite(r.vis) ? Math.round(r.vis) : 9999 },
        { f: 'airTemperature', u: 'degC', v: Number(A.tempAt(0).toFixed(2)) },
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
    const effN = A.operativeDropConc ? A.operativeDropConc() : S.micro.dropConc;
    return {
      schema: 'GRIB2-equivalent fields (binary encoding requires GRIB2 template)',
      discipline: 0, parameter: 'visibility',
      fields: [
        { f: 'surfaceVisibility', u: 'm', v: isFinite(r.vis) ? Math.round(r.vis) : 9999 },
        { f: 'totalCloudCover', u: '%', v: r.cover.toFixed(0) },
        { f: 'cloudOpticalDepth', v: r.ops.opticalDepth.toFixed(3) },
        { f: 'effectiveRadius', u: 'um', v: Number(r.re).toFixed(2) },
        { f: 'dropConc', u: 'cm-3', v: Number(effN).toFixed(0) },
      ],
    };
  }

  // —— ICON-LES / WRF 风格 Fortran Namelist (.nml) 前处理配置导出 ——
  function toICONNamelist() {
    const m = S.micro || {};
    const sd = S.seeding || {};
    const sp = S.spectrum || {};
    const effVeff = (P && P.currentVeff) ? P.currentVeff() : (sp.veff || 0.10);
    const effN = A.operativeDropConc ? A.operativeDropConc() : (m.dropConc || 300);
    const schemeId = m.scheme === 'sb06' ? 4 : (m.scheme === 'kk2000' ? 3 : 1);
    const nuShape = Math.max(0, Math.min(4, ((1 / Math.max(0.03, effVeff)) - 5) / 3));
    return [
      '! ==========================================================================',
      '! CloudField Pre-processor Namelist for ICON-LES / 2-Moment Microphysics',
      '! Reference: ETH CLOUDLAB / Seifert & Beheng (2006) / Khairoutdinov & Kogan (2000)',
      '! ==========================================================================',
      '&microphysics_nml',
      '  inwp_gscp          = ' + schemeId + ',              ! 1=Kessler(1-mom), 3=KK2000(2-mom), 4=SB06(ICON 2-mom)',
      '  scheme_name        = "' + (m.scheme || 'kessler') + '",',
      '  qnc_const          = ' + (effN * 1e6).toExponential(3) + ',     ! Cloud droplet number conc. N_c [m^-3]',
      '  re_fixed_um        = ' + Number(m.effRadiusUm).toFixed(2) + ',          ! Reference effective radius [um]',
      '  re_mode            = "' + (m.reMode || 'derived') + '",',
      '  nu_c_shape         = ' + nuShape.toFixed(2) + ',          ! Mass Gamma shape parameter from v_eff=' + Number(effVeff).toFixed(2),
      '  k_autoconv         = ' + Number(m.autoConvK).toExponential(3) + ',     ! Autoconversion rate coeff k1 [s^-1]',
      '  qc0_threshold      = ' + Number(m.autoConvQc0).toExponential(3) + ',     ! Critical cloud water mixing ratio [kg/kg]',
      '  k_accretion        = ' + Number(m.accretK).toFixed(2) + ',          ! Accretion coeff k2',
      '  l_korolev_mixed    = .' + (m.autoPhaseTemp ? 'TRUE' : 'FALSE') + '.,       ! T-dependent mixed-phase partitioning (0..-38 degC)',
      '/',
      '',
      '&cloudlab_seeding_nml',
      '  l_seeding_active   = .' + (sd.on ? 'TRUE' : 'FALSE') + '.,       ! Glaciogenic cloud seeding (WBF process)',
      '  seeding_agent      = "' + (sd.agent || 'agi').toUpperCase() + '",          ! AGI (AgI, T<=-5C) or CO2 (Liquid CO2, T<=-0.5C)',
      '  ninp_seed_liter    = ' + Number(sd.inpConc || 80).toFixed(1) + ',          ! Seeded INP concentration [L^-1]',
      '  seed_x0_km         = ' + Number(sd.x0 != null ? sd.x0 : -8.0).toFixed(2) + ',',
      '  seed_z_alt_km      = ' + Number(sd.alt != null ? sd.alt : 1.1).toFixed(2) + ',',
      '  plume_halfwidth_km = ' + Number(sd.width || 2.2).toFixed(2) + ',',
      '  turbulent_diff_k   = ' + Number(sd.diffK || 0.30).toFixed(3) + ',',
      '  wbf_glaciation_eff = ' + Number(sd.glaciationEff != null ? sd.glaciationEff : 0.85).toFixed(2) + ',',
      '/',
      '',
      '&sounding_init_nml',
      '  t_sfc_degc         = ' + Number(A.tempAt(0)).toFixed(2) + ',',
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
      '  droplet_conc_cm3: ' + (A.operativeDropConc ? A.operativeDropConc().toFixed(1) : S.micro.dropConc),
      '  ccn_coupled: ' + (!!S.micro.ccnCoupled),
      '  effective_radius_um: ' + Number(r.re).toFixed(2),
      '  spectral_veff: ' + Number((P && P.currentVeff) ? P.currentVeff() : ((S.spectrum && S.spectrum.veff) || 0.10)).toFixed(3),
      '  korolev_temp_phase: ' + (!!S.micro.autoPhaseTemp),
      '  lwp_gm2: ' + (r.ops && r.ops.lwp != null ? r.ops.lwp.toFixed(2) : '0.00'),
      '  iwp_gm2: ' + (r.ops && r.ops.iwp != null ? r.ops.iwp.toFixed(2) : '0.00'),
      '  cre_sw_wm2: ' + (r.ops && r.ops.creSW != null ? r.ops.creSW.toFixed(2) : '0.00'),
      'scheme_comparison_at_current_N:',
      '  rain_rate_mm_h:',
      '    kessler_1969: ' + (cmp ? cmp.atCurrentN.kessler.toFixed(3) : '0.000'),
      '    kk2000_2mom: ' + (cmp ? cmp.atCurrentN.kk2000.toFixed(3) : '0.000'),
      '    sb06_icon_2mom: ' + (cmp ? cmp.atCurrentN.sb06.toFixed(3) : '0.000'),
      'cloudlab_seeding:',
      '  enabled: ' + (!!(S.seeding && S.seeding.on)),
      '  agent: ' + ((S.seeding && S.seeding.agent) || 'agi'),
      '  inp_conc_L: ' + ((S.seeding && S.seeding.inpConc) || 80),
      '  wbf_diff_hpa: ' + (sdDiag && sdDiag.wbfDiffHpa != null ? sdDiag.wbfDiffHpa.toFixed(4) : '0.0000'),
      '  ice_supersat_pct: ' + (sdDiag && sdDiag.iceSupersatPct != null ? sdDiag.iceSupersatPct.toFixed(2) : '0.00'),
      '  ambient_visibility_m: ' + (sdDiag ? Math.round(sdDiag.visAmbientM) : 'NA'),
      '  in_plume_visibility_m: ' + (sdDiag ? Math.round(sdDiag.visSeededM) : 'NA'),
      '  visibility_gain_ratio: ' + (sdDiag ? sdDiag.gainRatio.toFixed(2) : '1.00'),
      '  cat1_minima_recovered: ' + (sdDiag ? sdDiag.cat1Recovered : false),
      'thermodynamics_and_aviation_hazards:',
      '  cape_j_kg: ' + (r.ops && r.ops.thermo ? r.ops.thermo.capeJkg : 0),
      '  cin_j_kg: ' + (r.ops && r.ops.thermo ? r.ops.thermo.cinJkg : 0),
      '  lifted_index_c: ' + (r.ops && r.ops.thermo ? r.ops.thermo.liftedIndex : 0),
      '  icing_max_index: ' + (r.ops && r.ops.icing ? r.ops.icing.maxIndex : 0),
      '  svr_cat1_dh_m: ' + (r.ops && r.ops.approachSlant ? r.ops.approachSlant.svrAtCat1DhM : 0),
      '  edr_max_m23s1: ' + (r.ops && r.ops.turbulence ? r.ops.turbulence.edrMax : 0),
      '  llws_kt_per_100ft: ' + (r.ops && r.ops.turbulence ? r.ops.turbulence.llwsKtPer100Ft : 0),
      '  uav_low_alt_status: ' + (r.ops && r.ops.uav ? r.ops.uav.status : 'GO'),
      '  cruise_contrail_persistent: ' + (r.ops && r.ops.contrail ? r.ops.contrail.contrailPersistent : false),
    ].join('\n');
  }

  // —— 科研级垂直廓线 CSV 导出（0–14 km，Δz = 0.25 km，57 层完整热力、微物理与边界层 CFD 廓线）——
  function toProfileCSV(time) {
    const t = time || 0;
    const layers = A.effectiveLayers();
    const wind = { x: S.windSpeed, dir: S.windDir };
    const header = 'z_km,p_hPa,T_degC,Td_degC,RH_pct,esw_hPa,esi_hPa,wbf_diff_hPa,LWC_gm3,IWC_gm3,ice_frac,re_um,beta_ext_m1,vis_m,rho_kgm3,theta_K,qv_kgkg,qc_kgkg,u_ms,v_ms,tke_m2s2,eps_m2s3';
    const lines = [header];
    for (let z = 0; z <= 14.0001; z += 0.25) {
      const zz = Number(z.toFixed(2));
      const d = P.detailedAt(0, 0, zz, layers, wind, t);
      const wp = A.windProfileAt ? A.windProfileAt(zz) : { rhoKgm3: 1.0, thetaK: 288.15, qvKgkg: 0.005, uMs: S.windSpeed || 0, vMs: 0, tkeM2s2: 0.2, epsM2s3: 0.005 };
      const T = d.temp;
      const Td = d.dew;
      const esw = A.esWater ? A.esWater(T) : 6.112 * Math.exp((17.67 * T) / (T + 243.5));
      const ed = A.esWater ? A.esWater(Td) : 6.112 * Math.exp((17.67 * Td) / (Td + 243.5));
      const rh = Math.max(0, Math.min(100, (ed / Math.max(1e-6, esw)) * 100));
      const wbf = A.wbfVaporDiff ? A.wbfVaporDiff(T) : { esw, esi: esw, diffHpa: 0 };
      const fw = d.frac ? (d.frac.water || 0) : 1;
      const fi = Math.max(0, 1 - fw);
      const lwcLiq = d.lwc * fw;
      const iwcIce = d.lwc * fi;
      const qcKgkg = (lwcLiq * 1e-3) / Math.max(0.1, wp.rhoKgm3);
      const vis = A.visibilityFromExt(d.betaExt);
      const visVal = isFinite(vis) ? Math.min(99999, vis) : 99999;
      lines.push([
        zz.toFixed(2),
        d.pressure.toFixed(2),
        T.toFixed(2),
        Td.toFixed(2),
        rh.toFixed(1),
        wbf.esw.toFixed(4),
        wbf.esi.toFixed(4),
        wbf.diffHpa.toFixed(4),
        lwcLiq.toFixed(4),
        iwcIce.toFixed(4),
        fi.toFixed(3),
        d.reUm.toFixed(2),
        d.betaExt.toExponential(4),
        visVal.toFixed(1),
        wp.rhoKgm3.toFixed(4),
        wp.thetaK.toFixed(2),
        wp.qvKgkg.toExponential(4),
        qcKgkg.toExponential(4),
        wp.uMs.toFixed(3),
        wp.vMs.toFixed(3),
        wp.tkeM2s2.toFixed(4),
        wp.epsM2s3.toExponential(4),
      ].join(','));
    }
    return lines.join('\n');
  }

  // —— 三方案（Kessler / KK2000 / ICON-SB06）随云滴数浓度 N_c 响应曲线 CSV 导出 ——
  function toSchemeCSV(opts) {
    if (!global.Kessler || !global.Kessler.compareSchemes) return 'N_cm3,R_kessler_mmh,R_kk2000_mmh,R_sb06_mmh\n';
    const cmp = global.Kessler.compareSchemes(opts);
    const qc = cmp.qcRef != null ? cmp.qcRef : 1.5e-3;
    const qr = cmp.qrRef != null ? cmp.qrRef : 0;
    const rho = cmp.rho != null ? cmp.rho : 1.05;
    const header = 'N_cm3,R_kessler_mmh,R_kk2000_mmh,R_sb06_mmh,Pac_kessler_s1,Pac_kk2000_s1,Pac_sb06_s1';
    const lines = [header];
    for (let i = 0; i < cmp.N.length; i++) {
      const nv = cmp.N[i];
      const rK = global.Kessler.ratesForScheme('kessler', qc, qr, { N: nv, rho });
      const rKK = global.Kessler.ratesForScheme('kk2000', qc, qr, { N: nv, rho });
      const rSB = global.Kessler.ratesForScheme('sb06', qc, qr, { N: nv, rho });
      lines.push([
        nv.toFixed(1),
        cmp.kessler[i].toFixed(4),
        cmp.kk2000[i].toFixed(4),
        cmp.sb06[i].toFixed(4),
        rK.pac.toExponential(4),
        rKK.pac.toExponential(4),
        rSB.pac.toExponential(4),
      ].join(','));
    }
    return lines.join('\n');
  }

  // —— MATLAB / Simulink / Aerospace Blockset 原生工作区脚本导出 (.m) ——
  function toMATLABScript(time) {
    const t = time || 0;
    const r = readouts();
    const layers = A.effectiveLayers();
    const wind = { x: S.windSpeed, dir: S.windDir };
    const lang = P.langmuirDropletSpectrum ? P.langmuirDropletSpectrum({ time: t }) : null;
    const zM = [], pPa = [], tK = [], thetaK = [], rhoKgm3 = [], qvKgkg = [], qcKgkg = [];
    const uMs = [], vMs = [], tke = [], eps = [], lwcGm3 = [], iwcGm3 = [], reUm = [], betaM1 = [], visM = [];
    for (let z = 0; z <= 14.0001; z += 0.25) {
      const zz = Number(z.toFixed(2));
      const d = P.detailedAt(0, 0, zz, layers, wind, t);
      const wp = A.windProfileAt ? A.windProfileAt(zz) : { rhoKgm3: 1.0, thetaK: 288.15, qvKgkg: 0.005, uMs: S.windSpeed || 0, vMs: 0, tkeM2s2: 0.2, epsM2s3: 0.005 };
      const fw = d.frac ? (d.frac.water || 0) : 1;
      const lwcLiq = d.lwc * fw;
      const iwcIce = d.lwc * Math.max(0, 1 - fw);
      const vis = A.visibilityFromExt(d.betaExt);
      zM.push((zz * 1000).toFixed(1));
      pPa.push((d.pressure * 100).toFixed(1));
      tK.push((d.temp + 273.15).toFixed(2));
      thetaK.push(wp.thetaK.toFixed(2));
      rhoKgm3.push(wp.rhoKgm3.toFixed(4));
      qvKgkg.push(wp.qvKgkg.toExponential(4));
      qcKgkg.push(((lwcLiq * 1e-3) / Math.max(0.1, wp.rhoKgm3)).toExponential(4));
      uMs.push(wp.uMs.toFixed(3));
      vMs.push(wp.vMs.toFixed(3));
      tke.push(wp.tkeM2s2.toFixed(4));
      eps.push(wp.epsM2s3.toExponential(4));
      lwcGm3.push(lwcLiq.toFixed(4));
      iwcGm3.push(iwcIce.toFixed(4));
      reUm.push(d.reUm.toFixed(2));
      betaM1.push(d.betaExt.toExponential(4));
      visM.push((isFinite(vis) ? Math.min(99999, vis) : 99999).toFixed(1));
    }
    const st = P.fieldStats({ z: S.sliceAlt || 0.3, N: 16, time: t });
    const xGrid = [];
    for (let i = 0; i < st.N; i++) xGrid.push((-20 + 40 * i / (st.N - 1)).toFixed(2));
    const visRows = [];
    for (let j = 0; j < st.N; j++) {
      const row = [];
      for (let i = 0; i < st.N; i++) row.push(st.field[i * st.N + j].toFixed(1));
      visRows.push(row.join(', '));
    }
    return [
      '% ==========================================================================',
      '% CloudField MATLAB / Simulink / Aerospace Blockset Workspace Data Script',
      '% Usage in MATLAB/Octave: run("CloudField_data.m");',
      '% Provides 1D Lookup Table vectors (cf.profile.*), 2D Slice (cf.slice.*),',
      '% and FENSAP-ICE / LEWICE 7-bin Langmuir droplet spectrum (cf.langmuir.*).',
      '% ==========================================================================',
      'cf = struct();',
      'cf.meta.app = \'CloudField\';',
      'cf.meta.scheme = \'' + (S.micro.scheme || 'kessler') + '\';',
      'cf.meta.slice_alt_km = ' + Number(S.sliceAlt || 0.3).toFixed(2) + ';',
      'cf.summary.worst_vis_m = ' + (isFinite(r.vis) ? r.vis.toFixed(1) : '99999') + ';',
      'cf.summary.cloud_cover_pct = ' + r.cover.toFixed(1) + ';',
      'cf.summary.lwp_gm2 = ' + (r.ops && r.ops.lwp != null ? r.ops.lwp.toFixed(2) : '0') + ';',
      'cf.summary.iwp_gm2 = ' + (r.ops && r.ops.iwp != null ? r.ops.iwp.toFixed(2) : '0') + ';',
      'cf.summary.cre_sw_wm2 = ' + (r.ops && r.ops.creSW != null ? r.ops.creSW.toFixed(2) : '0') + ';',
      'cf.summary.cape_jkg = ' + (r.ops && r.ops.thermo ? r.ops.thermo.capeJkg : 0) + ';',
      'cf.summary.icing_index = ' + (r.ops && r.ops.icing ? r.ops.icing.maxIndex : 0) + ';',
      'cf.summary.svr_cat1_dh_m = ' + (r.ops && r.ops.approachSlant ? r.ops.approachSlant.svrAtCat1DhM : 0) + ';',
      'cf.summary.edr_max = ' + (r.ops && r.ops.turbulence ? r.ops.turbulence.edrMax : 0) + ';',
      '',
      '% --- 1D Vertical Profile Column Vectors (57 levels, 0 to 14000 m, Simulink Lookup Ready) ---',
      'cf.profile.z_m = [' + zM.join('; ') + '];',
      'cf.profile.p_Pa = [' + pPa.join('; ') + '];',
      'cf.profile.T_K = [' + tK.join('; ') + '];',
      'cf.profile.theta_K = [' + thetaK.join('; ') + '];',
      'cf.profile.rho_kgm3 = [' + rhoKgm3.join('; ') + '];',
      'cf.profile.qv_kgkg = [' + qvKgkg.join('; ') + '];',
      'cf.profile.qc_kgkg = [' + qcKgkg.join('; ') + '];',
      'cf.profile.u_ms = [' + uMs.join('; ') + '];',
      'cf.profile.v_ms = [' + vMs.join('; ') + '];',
      'cf.profile.tke_m2s2 = [' + tke.join('; ') + '];',
      'cf.profile.eps_m2s3 = [' + eps.join('; ') + '];',
      'cf.profile.LWC_gm3 = [' + lwcGm3.join('; ') + '];',
      'cf.profile.IWC_gm3 = [' + iwcGm3.join('; ') + '];',
      'cf.profile.re_um = [' + reUm.join('; ') + '];',
      'cf.profile.beta_ext_m1 = [' + betaM1.join('; ') + '];',
      'cf.profile.vis_m = [' + visM.join('; ') + '];',
      '',
      '% --- 2D Horizontal Visibility Field (16x16 grid, [-20, 20] km) ---',
      'cf.slice.x_km = [' + xGrid.join(', ') + '];',
      'cf.slice.y_km = [' + xGrid.join(', ') + '];',
      'cf.slice.vis_m = [',
      '  ' + visRows.join(';\n  '),
      '];',
      '',
      '% --- 7-Bin Langmuir Droplet Spectrum (FENSAP-ICE / NASA LEWICE) ---',
      'cf.langmuir.mvd_um = ' + (lang ? lang.mvdUm : 16) + ';',
      'cf.langmuir.stagnation_beta0 = ' + (lang ? lang.stagnationBeta0 : 0) + ';',
      'cf.langmuir.freezing_fraction = ' + (lang ? lang.freezingFraction : 0) + ';',
      'cf.langmuir.ice_regime = \'' + (lang ? lang.iceRegime : 'NONE') + '\';',
      'cf.langmuir.weights = [' + (lang ? lang.bins.map(b => b.weight).join(', ') : '0.03, 0.08, 0.15, 0.48, 0.15, 0.08, 0.03') + '];',
      'cf.langmuir.diam_um = [' + (lang ? lang.bins.map(b => b.diamUm).join(', ') : '5, 8, 11, 16, 22, 28, 35') + '];',
    ].join('\n');
  }

  // —— OpenFOAM 大气边界层入口边界字典导出 (FoamFile 2.0, 兼容 atmosphericModels / timeVaryingMappedFixedValue) ——
  function toOpenFOAM(time) {
    const t = time || 0;
    const layers = A.effectiveLayers();
    const wind = { x: S.windSpeed, dir: S.windDir };
    const wpRef = A.windProfileAt ? A.windProfileAt(0.01) : { speedMs: S.windSpeed || 5, uMs: S.windSpeed || 5, vMs: 0 };
    const uMag = Math.max(1e-3, Math.hypot(wpRef.uMs, wpRef.vMs));
    const rows = [];
    for (let z = 0; z <= 14.0001; z += 0.25) {
      const zz = Number(z.toFixed(2));
      const d = P.detailedAt(0, 0, zz, layers, wind, t);
      const wp = A.windProfileAt ? A.windProfileAt(zz) : { zM: zz * 1000, uMs: S.windSpeed || 0, vMs: 0, wUpdraftMs: 0, thetaK: 288.15, rhoKgm3: 1.0, tkeM2s2: 0.2, epsM2s3: 0.005, qvKgkg: 0.005 };
      const fw = d.frac ? (d.frac.water || 0) : 1;
      const lwcLiq = d.lwc * fw;
      const qcKgkg = (lwcLiq * 1e-3) / Math.max(0.1, wp.rhoKgm3);
      rows.push('    (' + [
        (zz * 1000).toFixed(1),
        wp.uMs.toFixed(3),
        wp.vMs.toFixed(3),
        wp.wUpdraftMs.toFixed(3),
        (d.temp + 273.15).toFixed(2),
        (d.pressure * 100).toFixed(1),
        wp.tkeM2s2.toFixed(4),
        wp.epsM2s3.toExponential(4),
        wp.qvKgkg.toExponential(4),
        qcKgkg.toExponential(4),
        lwcLiq.toFixed(4),
      ].join(' ') + ')');
    }
    return [
      '/*--------------------------------*- C++ -*----------------------------------*\\',
      '| =========                 |                                                 |',
      '| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |',
      '|  \\\\    /   O peration     | Generated by CloudField Atmospheric Sandbox     |',
      '|   \\\\  /    A nd           | Compatible with buoyantPimpleFoam / ABLInflow   |',
      '|    \\\\/     M anipulation  |                                                 |',
      '\\*---------------------------------------------------------------------------*/',
      'FoamFile',
      '{',
      '    version     2.0;',
      '    format      ascii;',
      '    class       dictionary;',
      '    location    "constant/boundaryData/inlet";',
      '    object      ABLConditions;',
      '}',
      '// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //',
      '',
      'Uref            ' + Number(S.windSpeed || 0).toFixed(2) + ';',
      'Href            10.0;',
      'z0              uniform 0.05;',
      'zGround         uniform 0.0;',
      'flowDir         (' + (wpRef.uMs / uMag).toFixed(4) + ' ' + (wpRef.vMs / uMag).toFixed(4) + ' 0);',
      '',
      '// Columns: (z_m Ux_ms Uy_ms Uz_ms T_K p_Pa k_m2s2 epsilon_m2s3 qv_kgkg qc_kgkg LWC_gm3)',
      'profileTable',
      '(',
      rows.join('\n'),
      ');',
      '',
      '// ************************************************************************* //',
    ].join('\n');
  }

  // —— ANSYS Fluent 入口廓线 (.prof) 与 FENSAP-ICE / NASA LEWICE 7-Bin Langmuir 多分档液滴谱导出 ——
  function toFluentProfile(time) {
    const t = time || 0;
    const layers = A.effectiveLayers();
    const wind = { x: S.windSpeed, dir: S.windDir };
    const lang = P.langmuirDropletSpectrum ? P.langmuirDropletSpectrum({ time: t }) : null;
    const zArr = [], uxArr = [], uyArr = [], uzArr = [], tArr = [], kArr = [], epsArr = [], qvArr = [], qcArr = [], lwcArr = [], mvdArr = [];
    const veff = P.currentVeff ? P.currentVeff() : 0.10;
    for (let z = 0; z <= 14.0001; z += 0.25) {
      const zz = Number(z.toFixed(2));
      const d = P.detailedAt(0, 0, zz, layers, wind, t);
      const wp = A.windProfileAt ? A.windProfileAt(zz) : { uMs: S.windSpeed || 0, vMs: 0, wUpdraftMs: 0, rhoKgm3: 1.0, tkeM2s2: 0.2, epsM2s3: 0.005, qvKgkg: 0.005 };
      const fw = d.frac ? (d.frac.water || 0) : 1;
      const lwcLiq = d.lwc * fw;
      const qcKgkg = (lwcLiq * 1e-3) / Math.max(0.1, wp.rhoKgm3);
      const mvd = 2.0 * d.reUm * (1.0 + 1.15 * veff);
      zArr.push((zz * 1000).toFixed(1));
      uxArr.push(wp.uMs.toFixed(3));
      uyArr.push(wp.vMs.toFixed(3));
      uzArr.push(wp.wUpdraftMs.toFixed(3));
      tArr.push((d.temp + 273.15).toFixed(2));
      kArr.push(wp.tkeM2s2.toFixed(4));
      epsArr.push(wp.epsM2s3.toExponential(4));
      qvArr.push(wp.qvKgkg.toExponential(4));
      qcArr.push(qcKgkg.toExponential(4));
      lwcArr.push((lwcLiq * 1e-3).toExponential(4));
      mvdArr.push(mvd.toFixed(2));
    }
    const N = zArr.length;
    const langLines = lang ? lang.bins.map(b =>
      ';   Bin ' + b.bin + ': weight=' + b.weight.toFixed(2) + '  d=' + b.diamUm.toFixed(2) + ' um  K0=' + b.stokesK0.toFixed(4) + '  beta0=' + b.collectionEffBeta0.toFixed(4)
    ) : [];
    return [
      '; ==========================================================================',
      '; ANSYS Fluent Boundary Profile (.prof) & FENSAP-ICE / LEWICE Icing Inflow',
      '; Import in Fluent: File -> Read -> Profile... -> select "cloudfield-abl-inlet"',
      '; Reference Icing Alt = ' + (lang ? lang.zKm : 1.0) + ' km, T_inf = ' + (lang ? lang.tempC : 0) + ' degC, LWC = ' + (lang ? lang.slwcGm3 : 0) + ' g/m3',
      '; MVD = ' + (lang ? lang.mvdUm : 16) + ' um, Stagnation beta0 = ' + (lang ? lang.stagnationBeta0 : 0) + ', Ice Regime = ' + (lang ? lang.iceRegime : 'NONE') + ' (f=' + (lang ? lang.freezingFraction : 0) + ')',
      '; --- FENSAP-ICE / NASA LEWICE 7-Bin Langmuir Distribution ---',
      langLines.join('\n'),
      '; ==========================================================================',
      '((cloudfield-abl-inlet point ' + N + ')',
      '(z ' + zArr.join(' ') + ')',
      '(x-velocity ' + uxArr.join(' ') + ')',
      '(y-velocity ' + uyArr.join(' ') + ')',
      '(z-velocity ' + uzArr.join(' ') + ')',
      '(temperature ' + tArr.join(' ') + ')',
      '(turbulent-kinetic-energy ' + kArr.join(' ') + ')',
      '(turbulent-dissipation-rate ' + epsArr.join(' ') + ')',
      '(h2o-vapor-mass-frac ' + qvArr.join(' ') + ')',
      '(cloud-liquid-mass-frac ' + qcArr.join(' ') + ')',
      '(lwc-kgm3 ' + lwcArr.join(' ') + ')',
      '(mvd-um ' + mvdArr.join(' ') + ')',
      ')',
    ].join('\n');
  }

  // —— ParaView / Tecplot / VisIt 三维结构化网格 VTK Legacy ASCII 导出 (.vtk) ——
  function toVTK3D(opts) {
    opts = opts || {};
    const nx = opts.nx || 16;
    const ny = opts.ny || 16;
    const nz = opts.nz || 15;
    const halfKm = opts.halfKm || 20;
    const zMaxKm = opts.zMaxKm || 7.0;
    const t = opts.time || 0;
    const layers = A.effectiveLayers();
    const wind = { x: S.windSpeed, dir: S.windDir };
    const dxM = (2 * halfKm * 1000) / Math.max(1, nx - 1);
    const dyM = (2 * halfKm * 1000) / Math.max(1, ny - 1);
    const dzM = (zMaxKm * 1000) / Math.max(1, nz - 1);
    const totalPts = nx * ny * nz;
    const lwcVals = [], betaVals = [], visVals = [], tempVals = [], windVecs = [];
    for (let k = 0; k < nz; k++) {
      const zKm = (k / Math.max(1, nz - 1)) * zMaxKm;
      const wp = A.windProfileAt ? A.windProfileAt(zKm) : { uMs: S.windSpeed || 0, vMs: 0, wUpdraftMs: 0 };
      for (let j = 0; j < ny; j++) {
        const yKm = -halfKm + (2 * halfKm) * j / Math.max(1, ny - 1);
        for (let i = 0; i < nx; i++) {
          const xKm = -halfKm + (2 * halfKm) * i / Math.max(1, nx - 1);
          const d = P.detailedAt(xKm, yKm, zKm, layers, wind, t);
          const vis = A.visibilityFromExt(d.betaExt);
          lwcVals.push(d.lwc.toFixed(4));
          betaVals.push(d.betaExt.toExponential(3));
          visVals.push((isFinite(vis) ? Math.min(99999, vis) : 99999).toFixed(1));
          tempVals.push(d.temp.toFixed(2));
          windVecs.push(wp.uMs.toFixed(2) + ' ' + wp.vMs.toFixed(2) + ' ' + wp.wUpdraftMs.toFixed(2));
        }
      }
    }
    return [
      '# vtk DataFile Version 3.0',
      'CloudField 3D Volumetric Cloud, Extinction, Visibility and Wind Field',
      'ASCII',
      'DATASET STRUCTURED_POINTS',
      'DIMENSIONS ' + nx + ' ' + ny + ' ' + nz,
      'ORIGIN ' + (-halfKm * 1000).toFixed(1) + ' ' + (-halfKm * 1000).toFixed(1) + ' 0.0',
      'SPACING ' + dxM.toFixed(1) + ' ' + dyM.toFixed(1) + ' ' + dzM.toFixed(1),
      'POINT_DATA ' + totalPts,
      'SCALARS LWC_gm3 float 1',
      'LOOKUP_TABLE default',
      lwcVals.join('\n'),
      'SCALARS beta_ext_m1 float 1',
      'LOOKUP_TABLE default',
      betaVals.join('\n'),
      'SCALARS visibility_m float 1',
      'LOOKUP_TABLE default',
      visVals.join('\n'),
      'SCALARS temperature_C float 1',
      'LOOKUP_TABLE default',
      tempVals.join('\n'),
      'VECTORS wind_velocity_ms float',
      windVecs.join('\n'),
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

  global.Exporter = {
    toMETAR, toIWXXM, toBUFR, toGRIB, toICONNamelist, toExperimentYAML,
    toProfileCSV, toSchemeCSV, toMATLABScript, toOpenFOAM, toFluentProfile, toVTK3D,
    pushTo, readouts,
  };
})(window);
