/* help.js — 帮助与教学（#14）
 * 参数释义卡片（每个状态量的物理含义与"滑块改动后的影响"）+ 示例场景预设。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const P = global.Physics;

  const CARDS = [
    { key: 'surfaceTemp', label: '地面温度', unit: '°C', desc: '决定饱和水汽压与露点；越高越难成雾。', effect: '升高→露点差增大→近地面能见度变好。' },
    { key: 'surfaceRH', label: '地面相对湿度', unit: '%', desc: '接近 100% 时空气饱和，易凝云成雾。', effect: '升高→云/雾更易形成→消光增大→能见度下降。' },
    { key: 'windSpeed', label: '风速', unit: 'm/s', desc: '影响云体平流与湍流混合。', effect: '增大会使云层被吹散/抬升，也可能带来平流雾。' },
    { key: 'micro.effRadiusUm', label: '云滴有效半径 r_e', unit: 'µm', desc: '谱型关键尺度；Twomey 效应：N↑→r_e↓。', effect: 'r_e↓→单位质量消光↑→能见度↓（相同 LWC）。' },
    { key: 'micro.dropConc', label: '云滴数浓度 N', unit: 'cm⁻³', desc: '气溶胶越多 N 越大（污染云）。', effect: 'N↑→r_e↓→消光↑→能见度↓（Twomey 效应）。' },
    { key: 'spectrum.veff', label: '有效方差 ν_eff', unit: '—', desc: '谱宽指标；越大谱越宽，消光对粒径更不敏感。', effect: '增大→相同 LWC 下消光略增。' },
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
  };

  function applyScenario(name) {
    const sc = SCENARIOS[name];
    if (!sc) return false;
    const patch = { scalars: sc.scalars, layers: sc.layers, micro: sc.micro, phases: sc.phases, aerosol: sc.aerosol };
    P.applyStatePatch(patch);
    A.STATE.micro.iceFrac = sc.phases.ice || 0;
    if (global.GUI && global.GUI.refreshAll) global.GUI.refreshAll();
    if (global.__cf && global.__cf.onChange) global.__cf.onChange();
    if (global.Monitor && global.Monitor.update) global.Monitor.update(0);
    return true;
  }

  global.Help = { CARDS, SCENARIOS, applyScenario };
})(window);
