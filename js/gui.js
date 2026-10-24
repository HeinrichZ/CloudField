/* gui.js — CloudField 控制面板
 * 分组：场景参数 / 云层 / 模拟与演进 / 可视化 / 微物理常量
 * 每条滑块右侧都有实时数值回显（拖动时可见精确值），风向用罗盘旋钮代替线性滑块。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright Tianyuan.J.Z©
 */
(function (global) {
  'use strict';

  const A = global.Atmosphere;
  const S = A.STATE;
  const I18N = global.I18N;
  const U = global.Units;
  let container;
  let playBtn;

  function notifyChange() {
    if (global.__cf && global.__cf.onChange) global.__cf.onChange();
    if (global.Recorder && global.Recorder.R && global.Recorder.R.recording) global.Recorder.record('param');
  }

  // 通用 range 控件：标签 + 实时数值回显 + 单位 + 有效范围
  function rangeCtrl(label, min, max, step, unit, get, set, fmt, tip) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    wrap.title = tip || '';
    const valId = 'v_' + Math.random().toString(36).slice(2);
    const fmtF = fmt || (x => x);
    wrap.innerHTML =
      `<div class="row"><label>${label}</label><span class="val" id="${valId}"></span></div>` +
      `<input type="range" min="${min}" max="${max}" step="${step}" value="${get()}">` +
      `<div class="range-hint">${I18N.t('ctrl.range')} ${min}–${max} ${unit || ''}</div>`;
    const input = wrap.querySelector('input');
    const val = wrap.querySelector('#' + valId);
    const show = () => { val.textContent = fmtF(get()) + (unit ? ' ' + unit : ''); };
    show();
    input.addEventListener('input', () => { set(parseFloat(input.value)); show(); notifyChange(); });
    wrap._set = () => { input.value = get(); show(); };
    return wrap;
  }

  function toggleCtrl(label, get, set, tip) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl toggle';
    wrap.title = tip || '';
    // checkbox 本体是 opacity:0 尺寸 0 的隐形元素，必须用 label 包住（或 for 关联）才能点；
    // 之前用的是 span，点上去永远没反应。
    const id = 'c_' + Math.random().toString(36).slice(2);
    wrap.innerHTML =
      `<div class="row"><label for="${id}">${label}</label>` +
      `<label class="switch"><input id="${id}" type="checkbox" ${get() ? 'checked' : ''}><span class="slider"></span></label></div>`;
    const cb = wrap.querySelector('input');
    cb.addEventListener('change', () => { set(cb.checked); notifyChange(); });
    wrap._set = () => { cb.checked = get(); };
    return wrap;
  }
  function selCtrl(label, options, get, set, tip) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    wrap.title = tip || '';
    const opts = options.map(o => `<option value="${o[0]}" ${get() === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('');
    wrap.innerHTML = `<div class="row"><label>${label}</label></div><select>${opts}</select>`;
    const sel = wrap.querySelector('select');
    sel.addEventListener('change', () => { set(sel.value); notifyChange(); });
    return wrap;
  }

  // 罗盘旋钮：风向是 0–360° 周期量，线性滑块在 359°→0° 处会出现认知断层
  const POINTS = [
    ['n', 0], ['ne', 45], ['e', 90], ['se', 135], ['s', 180], ['sw', 225], ['w', 270], ['nw', 315],
  ];
  function pointName(deg) {
    let best = POINTS[0], bd = 999;
    for (const p of POINTS) {
      let d = Math.abs(((deg - p[1] + 540) % 360) - 180);
      d = 180 - d;
      if (d < bd) { bd = d; best = p; }
    }
    return I18N.t('compass.' + best[0]);
  }
  function compassCtrl(label, get, set, tip) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    wrap.title = tip || '';
    let ticks = '';
    for (let a = 0; a < 360; a += 15) {
      ticks += `<i class="tick${a % 45 === 0 ? ' major' : ''}" style="transform:rotate(${a}deg)"></i>`;
    }
    wrap.innerHTML =
      `<div class="row"><label>${label}</label></div>` +
      `<div class="compass">` +
        `<div class="dial" title="${tip || ''}">${ticks}` +
          `<span class="card" style="left:50%;top:2px;transform:translateX(-50%)">${I18N.t('compass.n')}</span>` +
          `<span class="card" style="right:3px;top:50%;transform:translateY(-50%)">${I18N.t('compass.e')}</span>` +
          `<span class="card" style="left:50%;bottom:2px;transform:translateX(-50%)">${I18N.t('compass.s')}</span>` +
          `<span class="card" style="left:3px;top:50%;transform:translateY(-50%)">${I18N.t('compass.w')}</span>` +
          `<span class="needle"></span><span class="arrow"></span><span class="hub"></span>` +
        `</div>` +
        `<div class="cmeta"><div class="deg"></div><div class="txt"></div><div class="sub"></div></div>` +
      `</div>`;
    const dial = wrap.querySelector('.dial');
    const needle = wrap.querySelector('.needle');
    const arrow = wrap.querySelector('.arrow');
    const degEl = wrap.querySelector('.deg');
    const txtEl = wrap.querySelector('.txt');
    const subEl = wrap.querySelector('.sub');

    const show = () => {
      const d = ((get() % 360) + 360) % 360;
      needle.style.transform = `rotate(${d}deg)`;   // 指针指向风的来向
      arrow.style.transform = `rotate(${d + 180}deg)`;  // 箭头指向气流去向
      degEl.textContent = d.toFixed(0) + '°';
      txtEl.textContent = pointName(d);
      subEl.textContent = I18N.t('compass.from', { pt: pointName(d) });
    };
    show();

    let dragging = false;
    const angleAt = (e) => {
      const r = dial.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      let a = Math.atan2(dx, -dy) * 180 / Math.PI;
      return ((a % 360) + 360) % 360;
    };
    const apply = (e) => { set(Math.round(angleAt(e))); show(); notifyChange(); };
    dial.addEventListener('mousedown', (e) => { dragging = true; apply(e); e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (dragging) apply(e); });
    window.addEventListener('mouseup', () => { dragging = false; });
    dial.addEventListener('touchstart', (e) => { dragging = true; apply(e.touches[0]); e.preventDefault(); }, { passive: false });
    window.addEventListener('touchmove', (e) => { if (dragging) { apply(e.touches[0]); e.preventDefault(); } }, { passive: false });
    window.addEventListener('touchend', () => { dragging = false; });
    wrap._set = show;
    return wrap;
  }

  function group(title, controls, collapsed) {
    const g = document.createElement('div');
    g.className = 'group' + (collapsed ? ' collapsed' : '');
    const h = document.createElement('h2');
    h.innerHTML = `<span>${title}</span><span class="chev">▾</span>`;
    h.addEventListener('click', () => g.classList.toggle('collapsed'));
    g.appendChild(h);
    const body = document.createElement('div');
    body.className = 'group-body';
    controls.forEach(c => body.appendChild(c));
    g.appendChild(body);
    return g;
  }

  function layerGroup(key) {
    const topCtl = rangeCtrl(I18N.t('layer.top'), 1, 15, 0.1, U.U.alt(), () => S.layers[key].top, v => S.layers[key].top = v, x => x.toFixed(1), I18N.t('layer.top.tip'));
    const baseCtl = rangeCtrl(I18N.t('layer.base'), 0, 12, 0.1, U.U.alt(), () => S.layers[key].base, v => S.layers[key].base = Math.min(v, S.layers[key].top - 0.2), x => x.toFixed(1), I18N.t('layer.base.tip'));
    const sub = [
      toggleCtrl(I18N.t('layer.enable', { name: I18N.t('cloud.' + key + '.name') }), () => S.layers[key].on, v => S.layers[key].on = v, I18N.t('cloud.' + key + '.band')),
      rangeCtrl(I18N.t('layer.coverage'), 0, 1, 0.01, '', () => S.layers[key].coverage, v => S.layers[key].coverage = v, x => x.toFixed(2), I18N.t('layer.coverage.tip')),
      rangeCtrl(I18N.t('layer.density'), 0, 1, 0.01, '', () => S.layers[key].density, v => S.layers[key].density = v, x => x.toFixed(2), I18N.t('layer.density.tip')),
      rangeCtrl(I18N.t('layer.scale'), 0.03, 0.4, 0.005, '', () => S.layers[key].scale, v => S.layers[key].scale = v, x => x.toFixed(3), I18N.t('layer.scale.tip')),
      rangeCtrl(I18N.t('layer.detail'), 0, 1, 0.01, '', () => S.layers[key].detail, v => S.layers[key].detail = v, x => x.toFixed(2), I18N.t('layer.detail.tip')),
      baseCtl, topCtl,
    ];
    return group(I18N.t('cloud.' + key + '.name') + '（' + I18N.t('cloud.' + key + '.band') + '）', sub, true);
  }

  function toolbar() {
    const tb = document.createElement('div');
    tb.className = 'btn-row wrap';
    const mk = (txt, title, fn) => { const b = document.createElement('button'); b.className = 'act'; b.textContent = txt; b.title = title; b.onclick = fn; return b; };
    playBtn = mk('▶/⏸', I18N.t('tb.play'), () => { S.playing = !S.playing; syncPlay(); notifyChange(); });
    tb.appendChild(playBtn);
    tb.appendChild(mk(I18N.t('tb.resetView'), I18N.t('tb.resetView.tip'), () => global.__resetView && global.__resetView()));
    tb.appendChild(mk(I18N.t('tb.resetParams'), I18N.t('tb.resetParams.tip'), () => resetParams()));
    tb.appendChild(mk(I18N.t('tb.snapshot'), I18N.t('tb.snapshot.tip'), () => {
      const t = (global.__cf && global.__cf.getTime) ? global.__cf.getTime() : 0;
      const wv = A.worstVisibility(A.effectiveLayers(), { x: S.windSpeed, dir: S.windDir }, t);
      global.Monitor.addSnapshot({ label: 'S' + (global.Monitor.getSnapshots().length + 1), vis: wv.vis });
    }));
    tb.appendChild(mk(I18N.t('tb.export'), I18N.t('tb.export.tip'), () => exportJSON()));
    tb.appendChild(mk(I18N.t('tb.import'), I18N.t('tb.import.tip'), () => importJSON()));
    tb.appendChild(mk('PNG', I18N.t('tb.export.tip'), () => exportImage('image/png')));
    tb.appendChild(mk('WebP', I18N.t('tb.export.tip'), () => exportImage('image/webp')));
    tb.appendChild(mk(I18N.t('tb.validate'), I18N.t('tb.validate.tip'), () => global.__cf && global.__cf.showValidation && global.__cf.showValidation()));
    tb.appendChild(mk(I18N.t('tb.integration'), I18N.t('tb.integration.tip'), () => global.__cf && global.__cf.showIntegration && global.__cf.showIntegration()));
    tb.appendChild(mk(I18N.t('tb.docs'), I18N.t('tb.docs.tip'), () => global.__cf && global.__cf.showDocs && global.__cf.showDocs()));
    tb.appendChild(mk(I18N.t('adv.open'), I18N.t('adv.open'), () => openAdv()));
    return tb;
  }
  function syncPlay() {
    if (playBtn) playBtn.textContent = S.playing ? I18N.t('btn.pause') : I18N.t('btn.play');
    if (global.MainUI && global.MainUI.syncStatus) global.MainUI.syncStatus();
  }

  function build() {
    container.innerHTML = '';
    container.appendChild(toolbar());

    container.appendChild(group(I18N.t('grp.scene'), [
      rangeCtrl(I18N.t('p.surfTemp'), -15, 40, 0.5, U.U.temp(), () => S.surfaceTemp, v => S.surfaceTemp = v, x => U.temp(x, 1), I18N.t('p.surfTemp.tip')),
      rangeCtrl(I18N.t('p.surfPres'), 950, 1050, 1, U.U.pres(), () => S.surfacePressure, v => S.surfacePressure = v, x => U.pres(x, 0), I18N.t('p.surfPres.tip')),
      rangeCtrl(I18N.t('p.surfRH'), 10, 100, 1, '%RH', () => S.surfaceRH, v => S.surfaceRH = v, x => x.toFixed(0), I18N.t('p.surfRH.tip')),
      rangeCtrl(I18N.t('p.lapse'), 0, 12, 0.1, U.U.lapse(), () => S.lapseRate, v => S.lapseRate = v, x => x.toFixed(1), I18N.t('p.lapse.tip')),
      rangeCtrl(I18N.t('p.dewLapse'), 0, 4, 0.1, U.U.lapse(), () => S.dewLapse, v => S.dewLapse = v, x => x.toFixed(1), I18N.t('p.dewLapse.tip')),
      rangeCtrl(I18N.t('p.dryLapse'), 6, 12, 0.1, U.U.lapse(), () => S.dryLapseRate, v => S.dryLapseRate = v, x => x.toFixed(1), I18N.t('p.dryLapse.tip')),
      toggleCtrl(I18N.t('p.envCycle'), () => S.envCycle, v => { S.envCycle = v; if (!v) { S.envT = 0; S.envRH = 0; } }, I18N.t('p.envCycle.tip')),
      rangeCtrl(I18N.t('p.windSpeed'), 0, 30, 0.5, U.U.wind(), () => S.windSpeed, v => S.windSpeed = v, x => U.wind(x, 1), I18N.t('p.windSpeed.tip')),
      compassCtrl(I18N.t('p.windDir'), () => S.windDir, v => S.windDir = v, I18N.t('p.windDir.tip')),
      rangeCtrl(I18N.t('p.sunElev'), 1, 90, 1, '°', () => S.sunElev, v => S.sunElev = v, x => x.toFixed(0), I18N.t('p.sunElev.tip')),
      rangeCtrl(I18N.t('p.sunAz'), 0, 360, 1, '°', () => S.sunAz, v => S.sunAz = v, x => x.toFixed(0), I18N.t('p.sunAz.tip')),
    ], false));

    container.appendChild(group(I18N.t('grp.layers'), A.LAYER_ORDER.map(layerGroup), false));

    container.appendChild(group(I18N.t('grp.sim'), [
      toggleCtrl(I18N.t('sim.autoLife'), () => S.autoLife, v => S.autoLife = v, I18N.t('sim.autoLife.tip')),
      rangeCtrl(I18N.t('sim.lifePhase'), 0, 1, 0.01, '', () => S.lifeManual, v => S.lifeManual = v, x => x.toFixed(2), I18N.t('sim.lifePhase.tip')),
      rangeCtrl(I18N.t('sim.cape'), 0, 100, 1, '/100', () => S.convection, v => S.convection = v, x => x.toFixed(0), I18N.t('sim.cape.tip')),
      rangeCtrl(I18N.t('sim.speed'), 0, 5, 0.1, '×', () => S.simSpeed, v => S.simSpeed = v, x => x.toFixed(1), I18N.t('sim.speed.tip')),
    ], false));

    container.appendChild(group(I18N.t('grp.view'), [
      selCtrl(I18N.t('adv.viewMode'), [
        ['real', I18N.t('vm.real')], ['temp', I18N.t('vm.temp')], ['pressure', I18N.t('vm.pressure')],
        ['water', I18N.t('vm.water')], ['coverage', I18N.t('vm.coverage')],
      ], () => S.viewMode, v => S.viewMode = v, I18N.t('adv.viewMode.tip')),
      toggleCtrl(I18N.t('adv.band'), () => S.fieldBand !== false, v => S.fieldBand = v, I18N.t('adv.band.tip')),
      selCtrl(I18N.t('adv.tintField'), [
        ['off', I18N.t('tint.off')], ['lwc', I18N.t('tint.lwc')], ['beta', I18N.t('tint.beta')], ['re', I18N.t('tint.re')],
      ], () => S.tintField, v => S.tintField = v, I18N.t('adv.tintField.tip')),
      rangeCtrl(I18N.t('adv.tintAmt'), 0, 1, 0.05, '', () => S.tintAmt, v => S.tintAmt = v, x => x.toFixed(2), I18N.t('adv.tintAmt.tip')),
      rangeCtrl(I18N.t('adv.sliceAlt'), 0, 14, 0.1, U.U.alt(), () => S.sliceAlt, v => S.sliceAlt = v, x => U.alt(x, 2), I18N.t('adv.sliceAlt.tip')),
      toggleCtrl(I18N.t('adv.slice'), () => S.showSlice, v => S.showSlice = v, I18N.t('adv.slice.tip')),
      toggleCtrl(I18N.t('adv.sun'), () => S.showSun, v => S.showSun = v, I18N.t('adv.sun.tip')),
      toggleCtrl(I18N.t('adv.grid'), () => S.showGrid, v => S.showGrid = v, I18N.t('adv.grid.tip')),
      rangeCtrl(I18N.t('adv.quality'), 0.4, 1, 0.05, '', () => S.quality, v => S.quality = v, x => x.toFixed(2), I18N.t('adv.quality.tip')),
    ], false));

    container.appendChild(group(I18N.t('grp.const'), [
      selCtrl(I18N.t('const.scheme'), [
        ['kessler', I18N.t('scheme.kessler')],
        ['kk2000', I18N.t('scheme.kk2000')],
        ['sb06', I18N.t('scheme.sb06')],
      ], () => S.micro.scheme || 'kessler', v => { S.micro.scheme = v; if (global.Kessler) global.Kessler.reset(); }, I18N.t('const.scheme.tip')),
      rangeCtrl(I18N.t('const.re'), 2, 25, 0.5, 'µm', () => S.micro.effRadiusUm, v => S.micro.effRadiusUm = v, x => x.toFixed(1), I18N.t('const.re.tip')),
      rangeCtrl(I18N.t('const.N'), 10, 1000, 10, 'cm⁻³', () => S.micro.dropConc, v => S.micro.dropConc = v, x => x.toFixed(0), I18N.t('const.N.tip')),
      toggleCtrl(I18N.t('const.reMode'), () => S.micro.reMode === 'derived', v => S.micro.reMode = v ? 'derived' : 'fixed', I18N.t('const.reMode.tip')),
      rangeCtrl(I18N.t('const.k1'), 0.1, 5, 0.1, '×10⁻³', () => S.micro.autoConvK * 1000, v => S.micro.autoConvK = v / 1000, x => x.toFixed(1), I18N.t('const.k1.tip')),
      rangeCtrl(I18N.t('const.qc0'), 0.1, 2, 0.1, '×10⁻³', () => S.micro.autoConvQc0 * 1000, v => S.micro.autoConvQc0 = v / 1000, x => x.toFixed(1), I18N.t('const.qc0.tip')),
      rangeCtrl(I18N.t('const.k2'), 0.5, 5, 0.1, '', () => S.micro.accretK, v => S.micro.accretK = v, x => x.toFixed(1), I18N.t('const.k2.tip')),
      rangeCtrl(I18N.t('const.ice'), 0, 1, 0.02, '', () => S.micro.iceFrac, v => {
        S.micro.iceFrac = v;
        if (S.phases) { S.phases.ice = v; S.phases.water = Math.max(0, 1 - v); }
      }, x => x.toFixed(2), I18N.t('const.ice.tip')),
      toggleCtrl(I18N.t('const.autoPhaseTemp'), () => !!S.micro.autoPhaseTemp, v => S.micro.autoPhaseTemp = v, I18N.t('const.autoPhaseTemp.tip')),
      toggleCtrl(I18N.t('seed.on'), () => !!(S.seeding && S.seeding.on), v => { if (S.seeding) S.seeding.on = v; }, I18N.t('seed.on.tip')),
      selCtrl(I18N.t('seed.agent'), [
        ['agi', I18N.t('seed.agi')],
        ['co2', I18N.t('seed.co2')],
      ], () => (S.seeding && S.seeding.agent) || 'agi', v => { if (S.seeding) S.seeding.agent = v; }, I18N.t('seed.agent.tip')),
      rangeCtrl(I18N.t('seed.inp'), 5, 500, 5, 'L⁻¹', () => (S.seeding && S.seeding.inpConc) || 80, v => { if (S.seeding) S.seeding.inpConc = v; }, x => x.toFixed(0), I18N.t('seed.inp.tip')),
      rangeCtrl(I18N.t('seed.eff'), 0.1, 0.95, 0.05, '', () => (S.seeding && S.seeding.glaciationEff != null) ? S.seeding.glaciationEff : 0.85, v => { if (S.seeding) S.seeding.glaciationEff = v; }, x => x.toFixed(2), I18N.t('seed.eff.tip')),
      toggleCtrl(I18N.t('kes.on'), () => (S.kessler ? !!S.kessler.on : false), v => { if (global.Kessler) { global.Kessler.ensure(); S.kessler.on = v; } }, I18N.t('kes.on.tip')),
      btn('↺ ' + I18N.t('kes.reset'), () => { if (global.Kessler) global.Kessler.reset(); notifyChange(); }, I18N.t('kes.reset.tip')),
    ], true));

    container.appendChild(advancedGroup());
  }

  function exportJSON() {
    const data = A.serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'CloudField_snapshot_v' + data.snapshotVersion + '_' + Date.now() + '.json';
    a.click(); URL.revokeObjectURL(url);
  }
  function importJSON() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          A.deserialize(JSON.parse(r.result));
          global.Monitor.clearSnapshots();
          build(); syncPlay(); notifyChange();
        } catch (e) { alert(I18N.t('alert.importFail', { msg: e.message })); }
      };
      r.readAsText(f);
    };
    inp.click();
  }
  function exportImage(type) {
    const r = global.__cf && global.__cf.renderer;
    if (!r) return;
    const url = r.exportImage(type);
    if (!url) { alert(I18N.t('alert.exportFail', { type })); return; }
    const a = document.createElement('a');
    a.href = url; a.download = 'CloudField_' + Date.now() + (type === 'image/webp' ? '.webp' : '.png');
    a.click();
  }

  const DEFAULTS = A.serialize();
  function resetParams() {
    A.deserialize(JSON.parse(JSON.stringify(DEFAULTS)));
    if (global.Kessler && global.Kessler.reset) global.Kessler.reset();
    build(); syncPlay(); notifyChange();
  }

  function init() {
    container = document.getElementById('controls');
    build();
    I18N.onLangChange(() => build());            // 语言切换：重建（文案全部实时取）
    global.Units.onChange(() => build());        // 单位体系切换：单位标签与数值都要重排
  }

  // ---------------- 高级诊断（路线图 #1–#14） ----------------
  function btn(label, fn, tip) { const b = document.createElement('button'); b.className = 'act'; b.textContent = label; if (tip) b.title = tip; if (fn) b.onclick = fn; return b; }
  function opt(list) { return list.map(o => `<option value="${o[0]}">${o[1]}</option>`).join(''); }

  function advancedGroup() {
    const sp = S.spectrum, ph = S.phases, ae = S.aerosol;
    const ctrls = [];
    ctrls.push(selCtrl(I18N.t('spec.type'), [['gamma', I18N.t('spec.gamma')], ['lognormal', I18N.t('spec.lognormal')], ['measured', I18N.t('spec.measured')]], () => sp.type, v => sp.type = v, I18N.t('spec.title')));
    ctrls.push(rangeCtrl(I18N.t('spec.re'), 2, 30, 0.5, 'µm', () => sp.re, v => sp.re = v, x => x.toFixed(1), I18N.t('spec.title')));
    ctrls.push(rangeCtrl(I18N.t('spec.N'), 10, 1000, 10, 'cm⁻³', () => sp.N, v => sp.N = v, x => x.toFixed(0), I18N.t('spec.title')));
    ctrls.push(rangeCtrl(I18N.t('spec.veff'), 0, 0.5, 0.01, '', () => sp.veff, v => sp.veff = v, x => x.toFixed(2), I18N.t('spec.title')));
    ctrls.push(rangeCtrl(I18N.t('spec.rg'), 2, 30, 0.5, 'µm', () => sp.rg, v => sp.rg = v, x => x.toFixed(1), I18N.t('spec.title')));
    ctrls.push(rangeCtrl(I18N.t('spec.sigmaG'), 1.05, 2.5, 0.01, '', () => sp.sigmaG, v => sp.sigmaG = v, x => x.toFixed(2), I18N.t('spec.title')));
    const imp = document.createElement('div'); imp.className = 'ctrl';
    imp.innerHTML = '<button class="act" id="imp-measured">' + I18N.t('spec.import') + '</button><div id="spec-moments" class="range-hint"></div>';
    imp.querySelector('#imp-measured').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.txt,.csv,text/plain';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader();
        r.onload = () => { const res = global.Spectrum.importMeasured(r.result); const m = global.Spectrum.moments();
          const el = document.getElementById('spec-moments'); if (el) el.textContent = 'N=' + m.N.toFixed(0) + '  re=' + m.re.toFixed(1) + 'µm  LWC=' + m.LWCgm3.toFixed(2) + 'g/m³ ' + (res.ok ? '✓' : '✗');
          notifyChange(); }; r.readAsText(f); };
      inp.click();
    };
    ctrls.push(imp);
    const PHASES = global.Phases ? global.Phases.ORDER : ['water', 'ice', 'snow', 'graupel', 'hail'];
    PHASES.forEach(k => ctrls.push(rangeCtrl(I18N.t('phase.' + k), 0, 1, 0.02, '', () => ph[k], v => ph[k] = v, x => x.toFixed(2), I18N.t('phase.title'))));
    ctrls.push(selCtrl(I18N.t('phase.preset'), [['pureWater', I18N.t('phase.pureWater')], ['mixedIce', I18N.t('phase.mixedIce')], ['cirrus', I18N.t('phase.cirrus')], ['snowy', I18N.t('phase.snowy')], ['convective', I18N.t('phase.convective')]], () => '', v => { if (global.Phases) global.Phases.set(v); notifyChange(); }, I18N.t('phase.preset')));
    ctrls.push(btn('— ' + I18N.t('phase.normalize'), () => { if (global.Phases) global.Phases.normalize(); notifyChange(); }, I18N.t('phase.normalize')));
    ctrls.push(toggleCtrl(I18N.t('aerosol.on'), () => ae.on, v => ae.on = v, I18N.t('aerosol.title')));
    ctrls.push(rangeCtrl(I18N.t('aerosol.beta0'), 0, 2, 0.05, '×10⁻³ m⁻¹', () => ae.beta0 * 1000, v => ae.beta0 = v / 1000, x => x.toFixed(2), I18N.t('aerosol.title')));
    ctrls.push(rangeCtrl(I18N.t('aerosol.scaleH'), 0.3, 5, 0.1, 'km', () => ae.scaleH, v => ae.scaleH = v, x => x.toFixed(1), I18N.t('aerosol.title')));
    ['visibility', 'extSplit', 'irradiance', 'albedo', 'satellite', 'lidar', 'radar'].forEach(k =>
      ctrls.push(toggleCtrl(I18N.t('op.' + k), () => S.operators[k], v => S.operators[k] = v, I18N.t('op.title'))));
    return group(I18N.t('grp.adv'), ctrls, true);
  }

  let advBuilt = false;
  function buildAdvModal() {
    if (advBuilt) return; advBuilt = true;
    const body = document.getElementById('adv-body');
    if (!body) return;
    const nav = document.createElement('div'); nav.className = 'adv-nav';
    const panes = document.createElement('div'); panes.className = 'adv-panes';
    body.appendChild(nav); body.appendChild(panes);
    const items = ['cloudlab', 'timeseries', 'spatial', 'sensitivity', 'qc', 'export', 'validation', 'recorder', 'report', 'help', 'scenarios'];
    const paneEls = {};
    items.forEach((it, i) => {
      const b = btn(I18N.t('nav.' + it), () => {
        Object.keys(paneEls).forEach(p => paneEls[p].style.display = (p === it ? '' : 'none'));
        nav.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.textContent === I18N.t('nav.' + it)));
      });
      b.className = 'adv-nav-btn' + (i === 0 ? ' active' : '');
      nav.appendChild(b);
      const p = document.createElement('div'); p.className = 'adv-pane'; p.style.display = (i === 0 ? '' : 'none');
      paneEls[it] = p; panes.appendChild(p);
    });
    buildCloudLabPane(paneEls.cloudlab);
    buildTimeSeriesPane(paneEls.timeseries);
    buildSpatialPane(paneEls.spatial);
    buildSensitivityPane(paneEls.sensitivity);
    buildQCPane(paneEls.qc);
    buildExportPane(paneEls.export);
    buildValidationPane(paneEls.validation);
    buildRecorderPane(paneEls.recorder);
    buildReportPane(paneEls.report);
    buildHelpPane(paneEls.help);
    buildScenariosPane(paneEls.scenarios);
  }
  function openAdv() {
    S.__sweeping = false;                 // 清掉可能残留的“扫描中”标志（面板重建会丢弃旧任务）
    buildAdvModal();
    const m = document.getElementById('adv-modal'); if (m) m.classList.remove('hidden');
  }

  function card(t, v) { return '<div class="stat-card"><div class="sv">' + v + '</div><div class="sl">' + t + '</div></div>'; }

  // ETH CLOUDLAB 过冷水播云沙盒 & 三方案（Kessler / KK2000 / ICON-SB06）同屏对比页
  function buildCloudLabPane(root) {
    root.innerHTML = '<h3>' + I18N.t('cl.title') + '</h3><div class="range-hint">' + I18N.t('cl.desc') + '</div>';
    const row = document.createElement('div'); row.className = 'btn-row wrap';
    row.appendChild(btn(I18N.t('cl.compute'), () => refreshCloudLab()));
    row.appendChild(btn(I18N.t('cl.seedDemo'), () => {
      S.surfaceTemp = -2;
      S.surfaceRH = 92;
      S.windSpeed = 10;
      S.windDir = 270;
      S.sliceAlt = 1.1;
      S.layers.sc.on = true; S.layers.sc.base = 0.4; S.layers.sc.top = 1.8; S.layers.sc.coverage = 0.92; S.layers.sc.density = 0.85;
      if (S.seeding) { S.seeding.on = true; S.seeding.agent = 'agi'; S.seeding.inpConc = 120; S.seeding.alt = 1.1; S.seeding.glaciationEff = 0.88; }
      refreshAll();
      notifyChange();
      refreshCloudLab();
    }));
    root.appendChild(row);
    const cv = document.createElement('canvas'); cv.id = 'cl-scheme-cv'; cv.width = 420; cv.height = 175; cv.className = 'adv-canvas'; root.appendChild(cv);
    const schemeStats = document.createElement('div'); schemeStats.id = 'cl-scheme-stats'; schemeStats.className = 'stat-cards'; root.appendChild(schemeStats);
    const seedStats = document.createElement('div'); seedStats.id = 'cl-seed-stats'; seedStats.className = 'stat-cards'; root.appendChild(seedStats);

    function refreshCloudLab() {
      if (global.Kessler && global.Kessler.compareSchemes) {
        const cmp = global.Kessler.compareSchemes();
        if (global.Monitor && global.Monitor.drawSchemeComparison) global.Monitor.drawSchemeComparison(cv, cmp);
        const cur = cmp.atCurrentN;
        schemeStats.innerHTML =
          card('Kessler (1969)', cur.kessler.toFixed(2) + ' mm/h') +
          card('KK2000 (2-Mom)', cur.kk2000.toFixed(2) + ' mm/h') +
          card('ICON-SB06 (2-Mom)', cur.sb06.toFixed(2) + ' mm/h') +
          card('Δ(KK2000−Kessler)', (cur.diffKK_Kessler >= 0 ? '+' : '') + cur.diffKK_Kessler.toFixed(2) + ' mm/h');
      }
      if (global.Physics && global.Physics.seedingDiagnostics) {
        const sd = global.Physics.seedingDiagnostics(0);
        seedStats.innerHTML =
          card(I18N.t('cl.visAmb'), Math.round(sd.visAmbientM) + ' m') +
          card(I18N.t('cl.visSeed'), Math.round(sd.visSeededM) + ' m') +
          card(I18N.t('cl.gain'), sd.gainRatio.toFixed(2) + '×') +
          card('CAT-I (≥550m)', sd.cat1Recovered ? '✓ OK' : '✗');
      }
    }
    setTimeout(refreshCloudLab, 0);
  }
  function buildTimeSeriesPane(root) {
    root.innerHTML = '<h3>' + I18N.t('ts.title') + '</h3>';
    const ta = document.createElement('textarea'); ta.id = 'ts-text'; ta.rows = 5; ta.placeholder = 't,surfTemp,RH,wind,wdir,conv,ci.cov,ci.den,cs.cov,cs.den,sc.cov,sc.den,cu.cov,cu.den,cb.cov,cb.den';
    root.appendChild(ta);
    const row = document.createElement('div'); row.className = 'btn-row wrap';
    row.appendChild(btn(I18N.t('ts.default'), () => { global.TimeSeries.applyDefault(); ta.value = ''; updateTSCurve(); }));
    row.appendChild(btn(I18N.t('ts.import'), () => { const r = global.TimeSeries.importTimeSeries(ta.value); if (!r.ok) alert(r.msg); else updateTSCurve(); }));
    const playBtn = btn(I18N.t('ts.play'));
    row.appendChild(playBtn); row.appendChild(btn(I18N.t('ts.loop'), () => { global.TimeSeries.TS.loop = !global.TimeSeries.TS.loop; }));
    root.appendChild(row);
    const cv = document.createElement('canvas'); cv.id = 'ts-curve'; cv.width = 420; cv.height = 170; cv.className = 'adv-canvas'; root.appendChild(cv);
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '1000'; slider.value = '0'; root.appendChild(slider);
    const lab = document.createElement('div'); lab.className = 'range-hint'; root.appendChild(lab);
    let timer = null;
    slider.addEventListener('input', () => {
      const ts = global.TimeSeries.TS; if (!ts.steps.length) return;
      const t = ts.t0 + (ts.t1 - ts.t0) * slider.value / 1000; global.TimeSeries.sampleAt(t);
      if (global.__cf) global.__cf.onChange();
      const w = global.Physics.worstVisibilityDetailed(0);
      lab.textContent = I18N.t('ts.t0') + ' ' + t.toFixed(1) + 'h  vis=' + (isFinite(w.vis) ? (w.vis >= 1000 ? (w.vis / 1000).toFixed(2) + 'km' : w.vis.toFixed(0) + 'm') : '∞');
    });
    playBtn.onclick = () => {
      if (timer) { clearInterval(timer); timer = null; playBtn.textContent = I18N.t('ts.play'); return; }
      const ts = global.TimeSeries.TS; if (!ts.steps.length) global.TimeSeries.applyDefault();
      playBtn.textContent = '⏸'; let t = global.TimeSeries.TS.t0;
      timer = setInterval(() => {
        global.TimeSeries.sampleAt(t); slider.value = String(Math.round((t - ts.t0) / (ts.t1 - ts.t0) * 1000));
        if (global.__cf) global.__cf.onChange();
        t += 0.5; if (t > ts.t1) { if (global.TimeSeries.TS.loop) t = ts.t0; else { clearInterval(timer); timer = null; playBtn.textContent = I18N.t('ts.play'); } }
      }, 120);
    };
    function updateTSCurve() { const cv = document.getElementById('ts-curve'); if (!cv) return; const curve = global.TimeSeries.visibilityCurve(64).map(p => p.vis); if (global.Monitor) global.Monitor.drawCurve(cv, curve, 'vis'); }
    setTimeout(updateTSCurve, 0);
  }

  function buildSpatialPane(root) {
    root.innerHTML = '<h3>' + I18N.t('sp.title') + '</h3>';
    // 与右侧剖面轴同区间（0–14 km），否则先拖到 3 km 再开此页会被钳到 2 km，看起来像数值错乱
    root.appendChild(rangeCtrl(I18N.t('sp.alt'), 0, 14, 0.1, 'km', () => S.sliceAlt, v => S.sliceAlt = v, x => x.toFixed(1)));
    const row = document.createElement('div'); row.className = 'btn-row wrap';
    row.appendChild(btn(I18N.t('sp.compute'), () => updateField())); root.appendChild(row);
    const cv = document.createElement('canvas'); cv.id = 'sp-field'; cv.width = 256; cv.height = 256; cv.className = 'adv-canvas'; root.appendChild(cv);
    const stats = document.createElement('div'); stats.id = 'sp-stats'; stats.className = 'stat-cards'; root.appendChild(stats);
    // 观测算子读数：只显示侧栏开关勾选的算子（开关不再是无效果的摆设）
    const opsEl = document.createElement('div'); opsEl.id = 'sp-ops'; opsEl.className = 'stat-cards'; root.appendChild(opsEl);
    function updateField() {
      const st = global.Physics.fieldStats({ z: S.sliceAlt, N: 48 });
      if (global.Monitor) global.Monitor.drawField(cv, st.field, st.N, st.minV, Math.min(st.maxV, 10000));
      const el = document.getElementById('sp-stats');
      const me = st.meanExtProfile[Math.floor(st.meanExtProfile.length / 2)].toFixed(4);
      el.innerHTML = card(I18N.t('sp.coverage'), st.coverage.toFixed(0) + '%') + card(I18N.t('sp.cloudTop'), st.cloudTop.toFixed(1) + 'km') +
        card(I18N.t('sp.cloudBase'), st.cloudBase.toFixed(1) + 'km') + card(I18N.t('sp.opticalDepth'), st.opticalDepth.toFixed(3)) + card(I18N.t('sp.meanExt'), me);
      if (global.Operators) {
        const o = global.Operators.compute(0);
        const rows = [];
        if (o.visibility) rows.push(card(I18N.t('op.visibility'), (isFinite(o.visibility.vis) ? o.visibility.vis.toFixed(0) : '—') + ' m'));
        if (o.irradiance) rows.push(card(I18N.t('op.irradiance'), o.irradiance.total.toFixed(0) + ' W/m²'));
        if (o.albedo != null) rows.push(card(I18N.t('op.albedo'), o.albedo.toFixed(3)));
        if (o.satelliteTb != null) rows.push(card(I18N.t('op.satellite'), o.satelliteTb.toFixed(1) + ' K'));
        if (o.lidar) rows.push(card(I18N.t('op.lidar'), o.lidar.betaBack.toExponential(2)));
        if (o.radar) rows.push(card(I18N.t('op.radar'), o.radar.dBZ.toFixed(1) + ' dBZ'));
        if (o.extSplit) rows.push(card(I18N.t('op.extSplit'), (o.extSplit.ratio * 100).toFixed(0) + '%'));
        const oe = document.getElementById('sp-ops'); if (oe) oe.innerHTML = rows.join('');
      }
    }
    setTimeout(updateField, 0);
  }

  function buildSensitivityPane(root) {
    root.innerHTML = '<h3>' + I18N.t('sen.title') + '</h3><div class="range-hint">' + I18N.t('sen.hint') + '</div>';
    // 只列真正会改变指标的参数。带 * 的在本状态下默认“不参与计算”，扫描期间会自动切换到生效状态：
    //   micro.effRadiusUm → 临时 reMode='fixed'（derived 模式下该值被 operativeRe 忽略）
    //   aerosol.*         → 临时 aerosol.on=true（关闭时气溶胶消光恒为 0）
    // 其余（surfaceRH / surfaceTemp / lapseRate / convection / spectrum.*）只影响温度、LCL 或谱读数，
    // 不进 β，扫出来必然是一条平带，容易误判为“热力图坏了”，因此不再列入。
    const PARAMS = [
      ['micro.dropConc', 'N (cm⁻³)'],
      ['micro.effRadiusUm', 'r_e (µm) *'],
      ['spectrum.veff', 'ν_eff (Gamma)'],
      ['seeding.inpConc', 'N_INP (L⁻¹) *'],
      ['layers.sc.coverage', I18N.t('sen.cov') + ' sc'],
      ['layers.cu.coverage', I18N.t('sen.cov') + ' cu'],
      ['layers.cs.coverage', I18N.t('sen.cov') + ' cs'],
      ['layers.ci.coverage', I18N.t('sen.cov') + ' ci'],
      ['aerosol.beta0', 'β_aer (m⁻¹) *'],
    ];
    const mkSel = (label, def) => {
      const s = document.createElement('select'); s.innerHTML = opt(PARAMS); s.value = def;
      const w = document.createElement('div'); w.className = 'ctrl';
      w.innerHTML = '<div class="row"><label>' + label + '</label></div>'; w.appendChild(s);
      return w;
    };
    const wrapSel = (label, sel) => { const w = document.createElement('div'); w.className = 'ctrl'; w.innerHTML = '<div class="row"><label>' + label + '</label></div>'; w.appendChild(sel); return w; };
    const sa = mkSel(I18N.t('sen.paramA'), 'micro.dropConc'); root.appendChild(sa);
    const sb = mkSel(I18N.t('sen.paramB'), 'layers.sc.coverage'); root.appendChild(sb);
    const metric = wrapSel(I18N.t('sen.metric'), (() => { const s = document.createElement('select'); s.innerHTML = opt([['vis', I18N.t('sen.vis')], ['opticalDepth', I18N.t('sen.od')]]); return s; })());
    root.appendChild(metric);
    const cv = document.createElement('canvas'); cv.id = 'sen-heat';
    cv.width = 340; cv.height = 240; cv.className = 'adv-canvas'; root.appendChild(cv);
    const status = document.createElement('div'); status.className = 'range-hint'; status.id = 'sen-status';
    status.textContent = I18N.t('sen.idle'); root.appendChild(status);

    // 参数扫描范围：按物理上合理区间给定，不再用 当前值×0.3–1.7 那种会越界的做法
    function paramRange(path, label) {
      const def = global.Physics.getPath(path);
      let min, max;
      if (path === 'micro.dropConc') { min = 50; max = 1200; }
      else if (path === 'micro.effRadiusUm') { min = 2; max = 20; }
      else if (path === 'spectrum.veff') { min = 0.02; max = 0.45; }
      else if (path === 'seeding.inpConc') { min = 5; max = 300; }
      else if (/\.coverage$/.test(path)) { min = 0.05; max = 1.0; }
      else if (path === 'aerosol.beta0') { min = 1e-5; max = 1e-3; }
      else { min = Math.max(0, def * 0.3); max = def * 1.7; }
      if (!(max > min)) { min = Math.max(0, def * 0.5); max = def * 1.5; }
      return { path, min, max, label };
    }

    let job = null, token = 0;
    root.appendChild(btn(I18N.t('sen.compute'), () => {
      const selA = sa.querySelector('select'), selB = sb.querySelector('select');
      const pa = paramRange(selA.value, selA.options[selA.selectedIndex].textContent);
      const pb = paramRange(selB.value, selB.options[selB.selectedIndex].textContent);
      const mv = metric.querySelector('select').value === 'opticalDepth' ? 'opticalDepth' : 'vis';
      // 上一次任务若还没跑完，先回滚它改过的状态
      if (job && job.restore) { try { job.restore(); } catch (err) { } }
      const my = ++token;
      job = global.Physics.sensitivityOpen(pa, pb, {
        N: 24, metric: mv,
        time: (global.__cf && global.__cf.getTime) ? global.__cf.getTime() : 0,
      });
      S.__sweeping = true;      // 通知主循环暂停出图，避免扫描时画面随参数闪动
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      status.textContent = I18N.t('sen.running', { p: 0 });
      function tick() {
        if (my !== token) return;                       // 已被新任务取代
        job.stepRows(1);
        const p = Math.round(job.progress() * 100);
        if (global.Monitor) {
          global.Monitor.drawHeatmap(cv, job.grid, job.N, {
            minA: pa.min, maxA: pa.max, minB: pb.min, maxB: pb.max,
            labelA: pa.label, labelB: pb.label, metric: mv,
            flatHint: I18N.t('sen.flat'),
          });
        }
        if (!job.finished()) {
          status.textContent = I18N.t('sen.running', { p });
          requestAnimationFrame(tick);
          return;
        }
        job.restore();
        S.__sweeping = false;                           // 恢复出图
        const s = job.summary();
        const ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
        const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3));
        let msg = I18N.t('sen.done', { lo: fmt(s.lo), hi: fmt(s.hi), n: job.N * job.N, ms });
        if (s.spreadA < 0.005) msg += ' · ' + I18N.t('sen.dead', { axis: 'A' });
        if (s.spreadB < 0.005) msg += ' · ' + I18N.t('sen.dead', { axis: 'B' });
        status.textContent = msg;
      }
      requestAnimationFrame(tick);
    }));
  }

  function buildQCPane(root) {
    root.innerHTML = '<h3>' + I18N.t('qc.title') + '</h3><div class="range-hint">' + I18N.t('qc.hint') + '</div>';
    const ta = document.createElement('textarea'); ta.id = 'qc-text'; ta.rows = 6; ta.placeholder = 'METAR 行 或 探空: z,p,T,Td（每行一条）'; root.appendChild(ta);
    const row = document.createElement('div'); row.className = 'btn-row wrap';
    row.appendChild(btn(I18N.t('qc.run'), () => runQC())); root.appendChild(row);
    const out = document.createElement('div'); out.id = 'qc-out'; out.className = 'qc-out'; root.appendChild(out);
    function runQC() {
      const txt = ta.value.trim(); const el = document.getElementById('qc-out');
      if (/^\s*\d/.test(txt) && txt.indexOf(',') >= 0) {
        const rows = txt.split(/\r?\n/).map(l => { const v = l.split(/[\s,]+/).map(Number); return { z: v[0], p: v[1], T: v[2], Td: v[3] }; }).filter(r => isFinite(r.p));
        const rep = global.QC.flagSounding(rows);
        let html = '<div>' + I18N.t('qc.ok') + ':' + rep.counts.ok + ' ' + I18N.t('qc.warn') + ':' + rep.counts.warn + ' ' + I18N.t('qc.error') + ':' + rep.counts.error + ' ' + I18N.t('qc.missing') + ':' + rep.counts.missing + '</div>';
        html += rep.rows.map(r => '<div class="' + (r.level === 'error' ? 'qc-err' : r.level === 'warn' ? 'qc-warn' : 'qc-ok') + '">z=' + r.z + ' p=' + r.p + ' T=' + r.T + ' Td=' + r.Td + ' → ' + r.flags.map(f => f.msg).join('; ') + '</div>').join('');
        el.innerHTML = html;
      } else {
        const rep = global.QC.flagMetar(txt);
        let html = '<div>' + I18N.t('qc.ok') + ':' + rep.counts.ok + ' ' + I18N.t('qc.warn') + ':' + rep.counts.warn + ' ' + I18N.t('qc.error') + ':' + rep.counts.error + '</div>';
        html += rep.rows.map(r => '<div class="' + (r.level === 'error' ? 'qc-err' : r.level === 'warn' ? 'qc-warn' : 'qc-ok') + '">' + (r.raw || '') + ' → ' + r.flags.map(f => f.msg).join('; ') + '</div>').join('');
        el.innerHTML = html;
      }
    }
  }

  function buildExportPane(root) {
    root.innerHTML = '<h3>' + I18N.t('ex.title') + '</h3>';
    const ta = document.createElement('textarea'); ta.id = 'ex-out'; ta.rows = 10; ta.readOnly = true; root.appendChild(ta);
    const row = document.createElement('div'); row.className = 'btn-row wrap';
    row.appendChild(btn(I18N.t('ex.metar'), () => ta.value = global.Exporter.toMETAR()));
    row.appendChild(btn(I18N.t('ex.iwxxm'), () => ta.value = global.Exporter.toIWXXM()));
    row.appendChild(btn(I18N.t('ex.bufr'), () => ta.value = JSON.stringify(global.Exporter.toBUFR(), null, 2)));
    row.appendChild(btn(I18N.t('ex.grib'), () => ta.value = JSON.stringify(global.Exporter.toGRIB(), null, 2)));
    row.appendChild(btn(I18N.t('ex.icon'), () => ta.value = global.Exporter.toICONNamelist()));
    row.appendChild(btn(I18N.t('ex.yaml'), () => ta.value = global.Exporter.toExperimentYAML()));
    row.appendChild(btn(I18N.t('ex.copy'), () => { if (navigator.clipboard) navigator.clipboard.writeText(ta.value); }));
    root.appendChild(row);
    const ep = document.createElement('input'); ep.placeholder = I18N.t('ex.endpoint'); ep.style.width = '70%'; root.appendChild(ep);
    root.appendChild(btn(I18N.t('ex.push'), () => {
      const v = ep.value.trim(); if (!v) { alert(I18N.t('ex.endpoint')); return; }
      global.Exporter.pushTo(v, { format: 'json', data: global.Exporter.readouts() }, { verbose: true }).then(() => alert('OK')).catch(e => alert('ERR ' + e.message));
    }));
  }

  function buildValidationPane(root) {
    root.innerHTML = '<h3>' + I18N.t('val2.title') + '</h3>';
    const row = document.createElement('div'); row.className = 'btn-row wrap';
    row.appendChild(btn(I18N.t('val2.run'), () => runVal())); root.appendChild(row);
    const stats = document.createElement('div'); stats.id = 'val-stats'; stats.className = 'stat-cards'; root.appendChild(stats);
    const cv1 = document.createElement('canvas'); cv1.id = 'val-scatter'; cv1.width = 200; cv1.height = 200; cv1.className = 'adv-canvas'; root.appendChild(cv1);
    const cv2 = document.createElement('canvas'); cv2.id = 'val-taylor'; cv2.width = 200; cv2.height = 200; cv2.className = 'adv-canvas'; root.appendChild(cv2);
    function runVal() {
      const d = global.Validation.fromRadiosonde();
      const st = global.Validation.stats(d.visPairs);
      const el = document.getElementById('val-stats');
      if (st) el.innerHTML = card(I18N.t('val2.bias'), st.bias.toFixed(0)) + card(I18N.t('val2.rmse'), st.rmse.toFixed(0)) + card(I18N.t('val2.mae'), st.mae.toFixed(0)) + card(I18N.t('val2.corr'), st.corr.toFixed(2));
      if (global.Monitor) { global.Monitor.drawScatter(cv1, d.visPairs); const t = global.Validation.taylor(d.visPairs); if (t) global.Monitor.drawTaylor(cv2, t); }
    }
  }

  function buildRecorderPane(root) {
    root.innerHTML = '<h3>' + I18N.t('rec.title') + '</h3>';
    const row = document.createElement('div'); row.className = 'btn-row wrap';
    const st = btn(I18N.t('rec.start')); st.onclick = () => { global.Recorder.start(); refreshRec(); };
    const sp = btn(I18N.t('rec.stop')); sp.onclick = () => { global.Recorder.stop(); refreshRec(); };
    const pl = btn(I18N.t('rec.play')); pl.onclick = () => { global.Recorder.playback(400, () => { if (global.__cf) global.__cf.onChange(); refreshAll(); }, () => refreshRec()); };
    const cl = btn(I18N.t('rec.clear')); cl.onclick = () => { global.Recorder.clear(); refreshRec(); };
    row.appendChild(st); row.appendChild(sp); row.appendChild(pl); row.appendChild(cl); root.appendChild(row);
    const impExp = document.createElement('div'); impExp.className = 'btn-row wrap';
    impExp.appendChild(btn(I18N.t('rec.export'), () => { const blob = new Blob([global.Recorder.exportJSON()], { type: 'application/json' }); const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = 'CloudField_session.json'; a.click(); URL.revokeObjectURL(u); }));
    impExp.appendChild(btn(I18N.t('rec.import'), () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { global.Recorder.importJSON(r.result); refreshRec(); }; r.readAsText(f); }; inp.click(); }));
    root.appendChild(impExp);
    const status = document.createElement('div'); status.id = 'rec-status'; status.className = 'range-hint'; root.appendChild(status);
    function refreshRec() { const e = document.getElementById('rec-status'); if (e) e.textContent = I18N.t('rec.count', { n: global.Recorder.count() }); }
    setTimeout(refreshRec, 0);
  }

  function buildReportPane(root) {
    root.innerHTML = '<h3>' + I18N.t('rep.title') + '</h3>';
    const row = document.createElement('div'); row.className = 'btn-row wrap';
    row.appendChild(btn(I18N.t('rep.html'), () => global.Report.download()));
    const share = btn(I18N.t('rep.share')); share.onclick = () => { const link = global.Report.makeShareLink(); const inp = document.createElement('input'); inp.value = link; inp.style.width = '90%'; root.appendChild(inp); if (navigator.clipboard) navigator.clipboard.writeText(link); };
    row.appendChild(share);
    const ann = btn(I18N.t('rep.annotate')); ann.onclick = () => { if (global.Report.exportAnnotated()) global.Report.disableAnnotation(); else global.Report.enableAnnotation(); };
    row.appendChild(ann);
    row.appendChild(btn(I18N.t('rep.exportAnno'), () => { const u = global.Report.exportAnnotated(); if (u) { const a = document.createElement('a'); a.href = u; a.download = 'CloudField_annotated.png'; a.click(); } }));
    root.appendChild(row);
  }

  function buildHelpPane(root) {
    root.innerHTML = '<h3>' + I18N.t('help.title') + '</h3><div class="range-hint">' + I18N.t('help.desc') + '</div>';
    const cards = document.createElement('div'); cards.className = 'help-cards';
    (global.Help ? global.Help.CARDS : []).forEach(c => {
      const d = document.createElement('div'); d.className = 'help-card';
      d.innerHTML = '<div class="hc-title">' + c.label + ' <span class="hc-unit">' + c.unit + '</span></div><div class="hc-desc">' + c.desc + '</div><div class="hc-eff"><b>' + I18N.t('help.effect') + '：</b>' + c.effect + '</div>';
      cards.appendChild(d);
    });
    root.appendChild(cards);
  }

  function buildScenariosPane(root) {
    root.innerHTML = '<h3>' + I18N.t('help.scenario') + '</h3>';
    const row = document.createElement('div'); row.className = 'btn-row wrap';
    [['fog', I18N.t('help.fog')], ['stratus', I18N.t('help.stratus')], ['cumulus', I18N.t('help.cumulus')], ['cirrus', I18N.t('help.cirrus')]].forEach(([k, lbl]) => {
      row.appendChild(btn(lbl, () => { if (global.Help) global.Help.applyScenario(k); refreshAll(); }));
    });
    root.appendChild(row);
  }

  function refreshAll() { build(); syncPlay(); }

  global.GUI = { init, build, syncPlay, openAdv, refreshAll };
})(window);
