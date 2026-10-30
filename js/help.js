/* help.js — 帮助与教学
 * 参数释义卡片（每个状态量的物理含义与"滑块改动后的影响"）+ 示例场景预设。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const P = global.Physics;

  const CARDS = [
    { key: 'surfaceTemp', label: '地面温度', unit: '°C', desc: '决定饱和水汽压与露点；越高越难成雾。', effect: '升高→露点差增大→近地面能见度变好。' },
    { key: 'surfaceRH', label: '地面相对湿度', unit: '%', desc: '接近 100% 时空气饱和，易凝云成雾。', effect: '升高→云/雾更易形成→消光增大→能见度下降。' },
    { key: 'windSpeed', label: '风速', unit: 'm/s', desc: '影响云体平流与湍流混合。', effect: '增大会使云层被吹散/抬升，也可能带来平流雾。' },
    { key: 'micro.scheme', label: '微物理参数化方案', unit: 'Kessler/KK2000/SB06', desc: '单矩阈值方案 vs 双矩气溶胶耦合方案（ICON-LES 原生）。', effect: '切换至 KK2000/SB06 后，N↑显著抑制暖雨自动转化（Albrecht 效应）。' },
    { key: 'micro.effRadiusUm', label: '云滴有效半径 r_e', unit: 'µm', desc: '谱型关键尺度；Twomey 效应：N↑→r_e↓。', effect: 'r_e↓→单位质量消光↑→能见度↓（相同 LWC）。' },
    { key: 'micro.dropConc', label: '云滴数浓度 N', unit: 'cm⁻³', desc: '气溶胶越多 N 越大（污染云）。', effect: 'N↑→r_e↓→消光↑→能见度↓（Twomey 效应）。' },
    { key: 'seeding.inpConc', label: '播云冰核浓度 N_INP', unit: 'L⁻¹', desc: 'ETH CLOUDLAB 人工播撒 AgI/液态 CO₂ 冰核浓度。', effect: '开启后触发 WBF 水汽竞争冰化沉降，在下风向打开高能见度消云沟槽。' },
    { key: 'spectrum.veff', label: '有效方差 ν_eff', unit: '—', desc: '谱宽指标；越大谱越宽，驱动多分散 Mie 消光与雷达 6 阶矩。', effect: '增大→雷达反射率 Z 显著增强，且加速 SB06 自动转化。' },
    { key: 'phases.ice', label: '冰相占比', unit: '—', desc: '混合相/冰云分支；冰晶消光弱于水滴。', effect: '冰相↑→相同质量下消光↓→能见度略升。' },
    { key: 'aerosol.beta0', label: '气溶胶消光', unit: 'm⁻¹', desc: '晴空/雾霾背景消光，随高度指数衰减。', effect: '开启并增大→近地面能见度显著下降（霾）。' },
    { key: 'convection', label: '对流强度', unit: '0–100', desc: 'CAPE 代理；驱动积云/积雨云发展。', effect: '增大→积云增厚、云顶升高。' },
    { key: 'quality', label: '渲染质量', unit: '0–1', desc: '体积光线步进步数 = 36 + 64×质量。', effect: '降低→分辨率/步数下降以保帧率。' },
  ];

  const SCENARIOS = {
    fog: {
      scalars: { surfaceTemp: 8, surfaceRH: 96, windSpeed: 2, lapseRate: 1.0, dewLapse: 1.0, convection: 5 },
      layers: { sc: { on: true, coverage: 0.95, density: 0.85, base: 0.05, top: 0.5 }, cu: { on: false, coverage: 0, density: 0, base: 0.8, top: 3.5 }, ci: { on: false, coverage: 0, density: 0, base: 8, top: 12 }, cs: { on: false, coverage: 0, density: 0, base: 4, top: 7 }, cb: { on: false, coverage: 0, density: 0, base: 0.6, top: 9 } },
      micro: { effRadiusUm: 4, dropConc: 500 },
      phases: { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 },
      aerosol: { on: true, beta0: 4e-4, scaleH: 0.5, omega: 0.9 },
    },
    stratus: {
      scalars: { surfaceTemp: 12, surfaceRH: 88, windSpeed: 4, lapseRate: 4, dewLapse: 1.5, convection: 10 },
      layers: { sc: { on: true, coverage: 0.85, density: 0.6, base: 0.4, top: 1.6 }, cu: { on: false, coverage: 0, density: 0, base: 0.8, top: 3.5 }, ci: { on: false, coverage: 0, density: 0, base: 8, top: 12 }, cs: { on: true, coverage: 0.4, density: 0.4, base: 4, top: 7 }, cb: { on: false, coverage: 0, density: 0, base: 0.6, top: 9 } },
      micro: { effRadiusUm: 8, dropConc: 300 },
      phases: { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 },
      aerosol: { on: false, beta0: 1e-4, scaleH: 1.5, omega: 0.92 },
    },
    cumulus: {
      scalars: { surfaceTemp: 22, surfaceRH: 70, windSpeed: 6, lapseRate: 7, dewLapse: 2, convection: 55 },
      layers: { cu: { on: true, coverage: 0.55, density: 0.65, base: 0.8, top: 3.8 }, sc: { on: true, coverage: 0.4, density: 0.4, base: 0.4, top: 1.2 }, ci: { on: false, coverage: 0, density: 0, base: 8, top: 12 }, cs: { on: false, coverage: 0, density: 0, base: 4, top: 7 }, cb: { on: false, coverage: 0, density: 0, base: 0.6, top: 9 } },
      micro: { effRadiusUm: 10, dropConc: 250 },
      phases: { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 },
      aerosol: { on: false, beta0: 1e-4, scaleH: 1.5, omega: 0.92 },
    },
    cirrus: {
      scalars: { surfaceTemp: 16, surfaceRH: 50, windSpeed: 12, lapseRate: 6.5, dewLapse: 1.8, convection: 20 },
      layers: { ci: { on: true, coverage: 0.55, density: 0.5, base: 8, top: 12 }, cs: { on: true, coverage: 0.3, density: 0.3, base: 5, top: 8 }, cu: { on: false, coverage: 0, density: 0, base: 0.8, top: 3.5 }, sc: { on: false, coverage: 0, density: 0, base: 0.4, top: 1.8 }, cb: { on: false, coverage: 0, density: 0, base: 0.6, top: 9 } },
      micro: { effRadiusUm: 22, dropConc: 50 },
      phases: { water: 0, ice: 1, snow: 0, graupel: 0, hail: 0 },
      aerosol: { on: false, beta0: 1e-4, scaleH: 1.5, omega: 0.92 },
    },
    cloudlab: {
      scalars: { surfaceTemp: -2, surfaceRH: 92, windSpeed: 10, windDir: 270, lapseRate: 5.5, dewLapse: 1.2, convection: 15, sliceAlt: 1.1 },
      layers: { sc: { on: true, coverage: 0.92, density: 0.85, base: 0.4, top: 1.8 }, cu: { on: false, coverage: 0, density: 0, base: 0.8, top: 3.5 }, ci: { on: false, coverage: 0, density: 0, base: 8, top: 12 }, cs: { on: false, coverage: 0, density: 0, base: 4, top: 7 }, cb: { on: false, coverage: 0, density: 0, base: 0.6, top: 9 } },
      micro: { scheme: 'sb06', effRadiusUm: 7, dropConc: 350, autoPhaseTemp: true },
      seeding: { on: true, agent: 'agi', inpConc: 140, alt: 1.1, glaciationEff: 0.88 },
      phases: { water: 0.85, ice: 0.15, snow: 0, graupel: 0, hail: 0 },
      aerosol: { on: false, beta0: 1e-4, scaleH: 1.5, omega: 0.92 },
    },
    cbstorm: {
      scalars: { surfaceTemp: 26, surfaceRH: 82, windSpeed: 14, windDir: 230, lapseRate: 7.5, dewLapse: 1.8, convection: 90, sliceAlt: 3.0 },
      layers: { cb: { on: true, coverage: 0.80, density: 0.90, base: 0.6, top: 11.5 }, cu: { on: true, coverage: 0.65, density: 0.75, base: 0.8, top: 4.2 }, sc: { on: true, coverage: 0.50, density: 0.55, base: 0.4, top: 1.5 }, cs: { on: true, coverage: 0.60, density: 0.50, base: 4.5, top: 8.0 }, ci: { on: true, coverage: 0.70, density: 0.60, base: 8.5, top: 12.5 } },
      micro: { scheme: 'kk2000', effRadiusUm: 14, dropConc: 180, autoPhaseTemp: true },
      phases: { water: 0.35, ice: 0.25, snow: 0.10, graupel: 0.20, hail: 0.10 },
      aerosol: { on: false, beta0: 1e-4, scaleH: 1.5, omega: 0.92 },
    },
    fzra: {
      scalars: { surfaceTemp: -3.5, surfacePressure: 1016, surfaceRH: 95, windSpeed: 9, windDir: 70, lapseRate: 4.5, dewLapse: 1.0, convection: 12, sliceAlt: 0.6, precipRateMmH: 3.5 },
      layers: { sc: { on: true, coverage: 0.95, density: 0.90, base: 0.2, top: 2.2 }, cs: { on: true, coverage: 0.75, density: 0.65, base: 2.2, top: 5.0 }, cu: { on: false, coverage: 0, density: 0, base: 0.8, top: 3.5 }, ci: { on: false, coverage: 0, density: 0, base: 8, top: 12 }, cb: { on: false, coverage: 0, density: 0, base: 0.6, top: 9 } },
      micro: { scheme: 'kk2000', reMode: 'fixed', effRadiusUm: 22, dropConc: 85, autoPhaseTemp: false },
      phases: { water: 0.92, ice: 0.08, snow: 0, graupel: 0, hail: 0 },
      aerosol: { on: false, beta0: 1e-4, scaleH: 1.5, omega: 0.92 },
      radiosonde: '0.0,1016,-3.5,-4.0\n0.6,942,-5.2,-5.5\n1.4,855,2.4,2.1\n2.2,775,-2.5,-2.8\n4.0,616,-11.0,-12.0\n8.0,356,-36.0,-42.0\n12.0,193,-56.0,-64.0',
    },
    plateau: {
      scalars: { surfaceTemp: 28, surfacePressure: 752, surfaceRH: 64, windSpeed: 11, windDir: 250, lapseRate: 7.8, dewLapse: 1.9, convection: 75, sliceAlt: 2.2, precipRateMmH: 0 },
      layers: { cu: { on: true, coverage: 0.68, density: 0.78, base: 1.2, top: 4.8 }, cb: { on: true, coverage: 0.45, density: 0.70, base: 1.4, top: 10.5 }, sc: { on: false, coverage: 0, density: 0, base: 0.4, top: 1.5 }, cs: { on: false, coverage: 0, density: 0, base: 4.5, top: 8.0 }, ci: { on: true, coverage: 0.40, density: 0.45, base: 9.0, top: 12.5 } },
      micro: { scheme: 'sb06', reMode: 'derived', effRadiusUm: 12, dropConc: 160, autoPhaseTemp: true },
      phases: { water: 0.55, ice: 0.25, snow: 0.05, graupel: 0.15, hail: 0 },
      aerosol: { on: false, beta0: 1e-4, scaleH: 1.5, omega: 0.92 },
    },
  };

  function applyScenario(name) {
    const sc = SCENARIOS[name];
    if (!sc) return false;
    if (sc.radiosonde && A.importRadiosonde) {
      A.importRadiosonde(sc.radiosonde, { assimilate: true });
    } else if (A.resetRadiosonde) {
      A.resetRadiosonde();
    }
    const scalarsPatch = Object.assign({ surfacePressure: 1013, precipRateMmH: 0 }, sc.scalars || {});
    const seedingPatch = Object.assign({ on: false, agent: 'agi', inpConc: 80, glaciationEff: 0.85, alt: 1.1 }, sc.seeding || {});
    const microPatch = Object.assign({ reMode: 'derived', autoPhaseTemp: false }, sc.micro || {});
    const patch = { scalars: scalarsPatch, layers: sc.layers, micro: microPatch, seeding: seedingPatch, phases: sc.phases, aerosol: sc.aerosol };
    P.applyStatePatch(patch);
    A.STATE.micro.iceFrac = sc.phases.ice || 0;
    if (global.Kessler && global.Kessler.reset) global.Kessler.reset();
    if (global.GUI && global.GUI.refreshAll) global.GUI.refreshAll();
    if (global.__cf && global.__cf.onChange) global.__cf.onChange();
    if (global.Monitor && global.Monitor.update) global.Monitor.update(0);
    return true;
  }

  global.Help = { CARDS, SCENARIOS, applyScenario };
})(window);
