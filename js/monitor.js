/* monitor.js — CloudField 监控与能见度诊断仪表盘
 * 底部：垂直廓线图作为主导读图窗口，实时读数与模拟状态收成紧凑仪表卡。
 * 右侧：读数 / 公式 / 色标 三个 Tab——公式一律附带当前数值的代入示例，
 *       色标 Tab 给出每个量自己的 cmap 与归一化区间（标量用指针标出当前位置）。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright Tianyuan.J.Z©
 */
(function (global) {
  'use strict';

  const A = global.Atmosphere;
  const I18N = global.I18N;
  const U = global.Units;
  const CM = global.CMap;
  const MAX = A.MAX_ALT;

  let els = {};
  let offscreen, offCtx;
  const SEC_N = 64;   // 剖面 64×64（原 96×96：每帧 9216 次 fbm 采样，是主循环最大开销）

  const HIST_N = 240;
  let history = new Float32Array(HIST_N);
  let histLen = 0;
  let snapshots = [];
  let axis = null;            // 剖面高度轴（main.js 注入）

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function fmtVis(v) {
    if (!isFinite(v)) return I18N.t('dash.infinite');
    return U.vis(v) + ' ' + U.U.visOf(v);
  }
  // 当前取值落在色标区间的位置（用于仪表卡配色与阈值提示）
  function gaugeTone(id, v) {
    const t = CM.norm(id, v);
    if (t > 0.85) return 'bad';
    if (t > 0.6) return 'warn';
    return '';
  }

  function init() {
    els.profile = document.getElementById('profile');
    els.section = document.getElementById('section');
    els.readouts = document.getElementById('readouts');
    els.sim = document.getElementById('sim-status');
    els.sliceLabel = document.getElementById('slice-label');
    els.legend = document.getElementById('legend');
    els.dashCanvas = document.getElementById('dash-canvas');
    els.dashReadout = document.getElementById('dash-readout');
    els.dashFormula = document.getElementById('dash-formula');
    els.dashScales = document.getElementById('dash-scales');
    els.dashSnapshots = document.getElementById('dash-snapshots');
    els.dashToggle = document.getElementById('dash-toggle');
    els.dashTabs = document.getElementById('dash-tabs');

    offscreen = document.createElement('canvas');
    offscreen.width = SEC_N; offscreen.height = SEC_N;
    offCtx = offscreen.getContext('2d');

    if (els.dashToggle) {
      els.dashToggle.addEventListener('click', () => {
        const body = document.getElementById('dash-body');
        if (body) body.classList.toggle('collapsed');
        syncToggleText();
      });
    }
    if (els.dashTabs) {
      els.dashTabs.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          els.dashTabs.querySelectorAll('button').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          document.querySelectorAll('#dash-body .tab-pane').forEach(p => {
            p.classList.toggle('active', p.dataset.pane === b.dataset.tab);
          });
        });
      });
    }

    I18N.onLangChange(() => { syncToggleText(); syncTabLabels(); });
    U.onChange(() => { syncToggleText(); });
  }
  function syncToggleText() {
    const body = document.getElementById('dash-body');
    if (els.dashToggle) els.dashToggle.textContent = (body && body.classList.contains('collapsed')) ? I18N.t('dash.expand') : I18N.t('dash.collapse');
  }
  function syncTabLabels() {
    if (axis && axis.refresh) axis.refresh();   // 单位切换时刷新剖面高度手柄读数
    if (!els.dashTabs) return;
    els.dashTabs.querySelectorAll('button').forEach(b => { b.textContent = I18N.t('tab.' + b.dataset.tab); });
  }
  function setAxis(a) { axis = a; }

  // ----------------- 当前显示场（水平切片用） -----------------
  function activeField() {
    const S = A.STATE;
    if (S.tintField && S.tintField !== 'off') {
      return { id: S.tintField, kind: 'micro' };
    }
    if (S.viewMode === 'temp') return { id: 'temp', kind: 'basic' };
    if (S.viewMode === 'pressure') return { id: 'pres', kind: 'basic' };
    if (S.viewMode === 'water') return { id: 'lwc', kind: 'micro' };
    return { id: 'density', kind: 'basic' };
  }
  function fieldValue(f, id) {
    const S = A.STATE;
    switch (id) {
      case 'lwc': return f.lwc;
      case 'beta': return A.betaFromLWC(f.lwc, A.operativeRe(f.lwc));
      case 're': return A.operativeRe(f.lwc);
      case 'Nd': return S.micro.dropConc;
      case 'temp': return f.temp;
      case 'pres': return f.pressure;
      default: return f.density;
    }
  }

  // ----------------- 垂直廓线（主导读图窗口） -----------------
  function drawProfile() {
    const cv = els.profile, ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const padL = 34, padR = 10, padT = 10, padB = 20;
    const pw = W - padL - padR, ph = H - padT - padB;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070b15'; ctx.fillRect(0, 0, W, H);

    // 温度轴按当前单位体系换算标签，坐标系不变（内部一律 °C）
    const Tmin = -80, Tmax = 45;
    const xOf = T => padL + (T - Tmin) / (Tmax - Tmin) * pw;
    const yOf = z => padT + (1 - z / MAX) * ph;

    ctx.strokeStyle = '#1b2740'; ctx.fillStyle = '#5d6f93';
    ctx.font = '9px sans-serif'; ctx.lineWidth = 1;
    for (let z = 0; z <= MAX; z += 2) {
      const y = yOf(z);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      if (z % 2 === 0) ctx.fillText(U.alt(z, 0) + U.U.alt(), 4, y + 3);
    }
    for (let T = -80; T <= 40; T += 20) {
      const x = xOf(T);
      ctx.strokeStyle = '#15203a';
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
      ctx.fillStyle = '#5d6f93'; ctx.fillText(U.temp(T, 0), x - 8, H - 6);
    }

    ctx.fillStyle = 'rgba(91,227,155,0.10)';
    for (let z = 0; z <= MAX; z += 0.1) {
      // sat 只取决于温度/露点，原写法每次调用 profile() 都白跑一次 sampleFields
      if (A.tempAt(z) <= A.dewAt(z)) {
        const y0 = yOf(z), y1 = yOf(Math.min(MAX, z + 0.1));
        ctx.fillRect(padL, y0, pw, y1 - y0);
      }
    }

    const layers = A.effectiveLayers();
    const bandColors = ['rgba(150,200,255,0.10)','rgba(150,200,255,0.10)','rgba(180,180,200,0.10)','rgba(255,230,160,0.10)','rgba(255,160,160,0.12)'];
    layers.forEach(L => {
      ctx.fillStyle = bandColors[Math.min(4, L.type)] || 'rgba(200,200,200,0.1)';
      ctx.fillRect(padL, yOf(L.top), pw, yOf(L.base) - yOf(L.top));
    });

    function curve(fn, color, dash) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.7; ctx.setLineDash(dash);
      ctx.beginPath();
      for (let z = 0; z <= MAX; z += 0.2) {
        const y = yOf(z), x = xOf(fn(z));
        if (z === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    curve(z => A.tempAt(z), '#ff6b6b', []);
    curve(z => A.dewAt(z), '#4fd1ff', [4, 3]);

    const mark = (z, color, text) => {
      if (!(z >= 0 && z <= MAX)) return;
      const y = yOf(z);
      ctx.strokeStyle = color; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = color; ctx.fillText(text, W - 76, y - 3);
    };
    mark(A.lclHeight(), '#ffd166', 'LCL');
    mark(A.freezingLevel(), '#7c9cff', '0°');
    mark(A.STATE.sliceAlt, '#36d1c4', I18N.t('mon.sliceMark'));   // 与 3D 亮线、右侧高度轴同一高度
  }

  // ----------------- 水平切片 -----------------
  function drawSection(timeSec) {
    const cv = els.section, ctx = cv.getContext('2d');
    const S = A.STATE;
    const alt = S.sliceAlt;
    const layers = A.effectiveLayers();
    const dir = (S.windDir + 180) * Math.PI / 180;
    const sp = S.windSpeed * 0.0009;
    const wind = { x: Math.sin(dir) * sp, z: Math.cos(dir) * sp };
    const range = 22;
    const field = activeField();

    const img = offCtx.createImageData(SEC_N, SEC_N);
    const d = img.data;
    for (let j = 0; j < SEC_N; j++) {
      const z = (j / (SEC_N - 1) * 2 - 1) * range;
      for (let i = 0; i < SEC_N; i++) {
        const x = (i / (SEC_N - 1) * 2 - 1) * range;
        const f = A.sampleFields(x, alt, z, layers, wind, timeSec);
        const c = CM.sample(field.id, fieldValue(f, field.id));
        const idx = (j * SEC_N + i) * 4;
        d[idx] = c[0]; d[idx + 1] = c[1]; d[idx + 2] = c[2]; d[idx + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, 0, 0, cv.width, cv.height);
    ctx.strokeStyle = '#22304f'; ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(cv.width / 2, 0); ctx.lineTo(cv.width / 2, cv.height);
    ctx.moveTo(0, cv.height / 2); ctx.lineTo(cv.width, cv.height / 2); ctx.stroke();
    if (els.sliceLabel) els.sliceLabel.textContent = U.alt(alt, 1) + ' ' + U.U.alt();
  }

  // ----------------- 实时读数（紧凑仪表卡） -----------------
  function readouts() {
    const S = A.STATE;
    const layers = A.effectiveLayers();
    const lcl = A.lclHeight();
    const fr = A.freezingLevel();
    let base = MAX, top = 0, maxLWC = 0;
    layers.forEach(L => {
      base = Math.min(base, L.base); top = Math.max(top, L.top);
      maxLWC = Math.max(maxLWC, A.lwcFromDensity(L.density, L.kind));
    });
    if (!layers.length) { base = 0; top = 0; }

    const cover = A.totalCloudCover();
    const cb = layers.find(L => L.type === 4);
    let precip = 0.03;
    if (cb) precip = 0.85;
    else if (S.convection > 60 && S.surfaceRH > 70) precip = 0.35;
    else if (layers.some(L => L.type <= 2 && L.coverage > 0.7)) precip = 0.25;

    const card = (label, value, unit, tone) =>
      `<div class="gauge${tone ? ' ' + tone : ''}"><div class="k">${label}</div>` +
      `<div class="v">${value}<small>${unit || ''}</small></div></div>`;

    els.readouts.innerHTML =
      card(I18N.t('ro.base'), U.alt(base, 2), U.U.alt()) +
      card(I18N.t('ro.top'), U.alt(top, 2), U.U.alt()) +
      card(I18N.t('ro.lcl'), U.alt(lcl, 2), U.U.alt()) +
      card(I18N.t('ro.zero'), fr ? U.alt(fr, 2) : '—', U.U.alt()) +
      card(I18N.t('ro.surfTemp'), U.temp(S.surfaceTemp, 1), U.U.temp(), gaugeTone('temp', S.surfaceTemp)) +
      card(I18N.t('ro.surfPres'), U.pres(S.surfacePressure, 0), U.U.pres()) +
      card(I18N.t('ro.surfRH'), S.surfaceRH.toFixed(0), '%RH', S.surfaceRH > 90 ? 'warn' : '') +
      card(I18N.t('ro.maxLWC'), maxLWC.toFixed(2), 'g/m³', gaugeTone('lwc', maxLWC)) +
      card(I18N.t('ro.cover'), cover.toFixed(0), '%', cover > 80 ? 'bad' : cover > 50 ? 'warn' : '') +
      card(I18N.t('ro.precip'), (precip * 100).toFixed(0), '%', precip > 0.5 ? 'warn' : '') +
      card(I18N.t('ro.convection'), S.convection.toFixed(0), '/100', S.convection > 70 ? 'warn' : '') +
      card(I18N.t('ro.wind'), U.wind(S.windSpeed, 1) + '/' + S.windDir.toFixed(0), U.U.wind() + '·°');
  }

  // ----------------- 模拟状态 -----------------
  function simStatus(timeSec) {
    const S = A.STATE;
    const life = S.autoLife ? (Math.sin(S.lifePhase) * 0.5 + 0.5) : S.lifeManual;
    const stageKey = life < 0.25 ? 'sim.stage0' : life < 0.6 ? 'sim.stage1' : life < 0.85 ? 'sim.stage2' : 'sim.stage3';
    const tag = S.playing
      ? `<span class="tag run">${I18N.t('sim.run')} · ${S.simSpeed.toFixed(1)}×</span>`
      : `<span class="tag pause">${I18N.t('sim.pause')}</span>`;
    els.sim.innerHTML =
      tag +
      `<div>${I18N.t('sim.time')}：<b>${timeSec.toFixed(1)} s</b></div>` +
      `<div>${I18N.t('sim.life')}：<b>${I18N.t(stageKey)}</b> (${life.toFixed(2)})</div>` +
      `<div>${I18N.t('sim.convGain')}：<b>${(S.convection / 100).toFixed(2)}</b></div>` +
      `<div>${S.playing ? I18N.t('sim.evolving') : I18N.t('sim.frozen')}</div>`;
  }

  // ----------------- 图例（用 CMap 的色标与区间） -----------------
  function legend() {
    const S = A.STATE;
    const L = els.legend;
    const field = activeField();
    const cm = CM.CMAPS[field.id];
    if (!cm || (S.viewMode === 'real' && (!S.tintField || S.tintField === 'off'))) { L.classList.add('hidden'); return; }
    L.classList.remove('hidden');
    L.innerHTML =
      `<div style="font-size:11px;color:#8ea2c4">${I18N.t('cmap.' + field.id)}（${cm.unit}）</div>` +
      `<div class="bar" style="background:${CM.gradientCSS(field.id)}"></div>` +
      `<div class="ticks"><span>${cm.range[0]}</span><span>${cm.range[1]}</span></div>` +
      `<div class="lg-note">${I18N.t('leg.normNote', { lo: cm.range[0], hi: cm.range[1], unit: cm.unit })}</div>`;
  }

  // ----------------- 能见度仪表盘 -----------------
  function drawDashboard() {
    const cv = els.dashCanvas; if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a1018'; ctx.fillRect(0, 0, W, H);

    const padL = 32, padR = 8, padT = 8, padB = 16;
    const pw = W - padL - padR, ph = H - padT - padB;
    const vMin = 50, vMax = 20000;
    const vToY = v => {
      const lv = clamp(Math.log(Math.max(vMin, Math.min(vMax, v))), Math.log(vMin), Math.log(vMax));
      return padT + (1 - (lv - Math.log(vMin)) / (Math.log(vMax) - Math.log(vMin))) * ph;
    };
    ctx.strokeStyle = '#16223a'; ctx.fillStyle = '#5d6f93'; ctx.font = '9px sans-serif';
    [100, 1000, 10000].forEach(v => {
      const y = vToY(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(U.vis(v) + U.U.visOf(v), 2, y + 3);
    });

    snapshots.forEach(s => {
      if (s.vis == null) return;
      const y = vToY(s.vis);
      ctx.strokeStyle = s.color || '#9ad'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = s.color || '#9ad';
      ctx.fillText(s.label, padL + 2, y - 2);
    });

    if (histLen > 1) {
      ctx.strokeStyle = '#5be39b'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i < histLen; i++) {
        const v = history[i];
        const x = padL + i / (HIST_N - 1) * pw;
        const y = (v == null || !isFinite(v)) ? vToY(vMax) : vToY(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  const altHist = [];   // 近 5 次最差高度，中值滤波（消除相邻层 argmin 抖动）
  let lastDashT = -1;   // 仪表盘整帧节流（含扫描/取样/DOM），避免扫描尖峰拖慢渲染

  function updateDashboardReadout(timeSec) {
    const S = A.STATE;
    const t = timeSec || 0;
    const layers = A.effectiveLayers();
    const wind = { x: S.windSpeed, dir: S.windDir };
    // 最差能见度扫描（3×3×27 样本）约 3–4 ms；整个仪表盘限制到 ~6 Hz，
    // 避免每 80 ms 一次的扫描尖峰把帧时间推过自适应分辨率阈值（>24 ms 会降 pixelRatio + TAA 重置）。
    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (nowMs - lastDashT < 160) return;
    lastDashT = nowMs;
    const wv = A.worstVisibility(layers, wind, t);
    // 中值滤波：相邻层能见度几乎相等时 argmin 会每帧在 1.0/1.5 km 之间翻，
    // 取最近 5 次高度的中值即可稳定；若该层已变晴/场景切换，则回退到全局最差点。
    let shownAlt = wv.alt, shownVis = wv.vis, shownX = wv.x || 0, shownY = wv.y || 0;
    if (!isFinite(wv.vis)) {
      altHist.length = 0;
    } else {
      altHist.push(wv.alt);
      if (altHist.length > 5) altHist.shift();
      const sorted = altHist.slice().sort((a, b) => a - b);
      const medAlt = sorted[Math.floor(sorted.length / 2)];
      const idx = Math.max(0, Math.min(wv.profile.length - 1, Math.round((medAlt - wv.z0) / wv.dz)));
      const vAt = wv.profile[idx];
      if (isFinite(vAt)) {
        shownAlt = wv.z0 + idx * wv.dz;
        shownVis = vAt;
        shownX = wv.bx[idx]; shownY = wv.by[idx];
      } else {
        altHist.length = 0;   // 中值高度已失效，重新从全局最小开始
      }
    }

    if (histLen < HIST_N) history[histLen++] = shownVis;
    else { history.copyWithin(0, 1); history[HIST_N - 1] = shownVis; }

    // 与显示高度同一位置取样（不再固定 (0,0) 列）；时间用当前仿真时间
    const f = A.sampleFields(shownX, shownY, shownAlt, layers, wind, t);
    const lwc = f.lwc;
    const re = A.operativeRe(lwc);                                // 与 β 共用同一 r_e 源
    const betaKm = A.betaFromLWC(lwc, re);                        // km⁻¹
    const betaM = betaKm / 1000;                                  // m⁻¹（公式用）
    const N = S.micro.dropConc;
    const reDeriv = A.effRadiusFromLWC(lwc, N);
    const kr = global.Kessler ? global.Kessler.readout() : null;

    // 高度轴上标出最低能见度所在高度（滞回后的稳定层高）
    if (axis) axis.setMark(isFinite(wv.vis) ? shownAlt : NaN, U.alt(shownAlt, 2) + ' ' + U.U.alt());

    if (els.dashReadout) {
      els.dashReadout.innerHTML =
        `<div class="dv-main">${fmtVis(shownVis)}</div>` +
        `<div class="dv-sub">${I18N.t('dash.worst', { alt: U.alt(shownAlt, 2) + ' ' + U.U.alt() })}</div>` +
        `<div class="dv-row"><span>${I18N.t('dash.beta')}</span><b>${betaKm.toFixed(2)} km⁻¹</b></div>` +
        `<div class="dv-row"><span>${I18N.t('dash.lwc')}</span><b>${lwc.toFixed(3)} g/m³</b></div>` +
        `<div class="dv-row"><span>${I18N.t('dash.temp')}</span><b>${U.temp(f.temp, 1)} ${U.U.temp()}</b></div>` +
        `<div class="dv-row"><span>${I18N.t('dash.dew')}</span><b>${U.temp(f.dew, 1)} ${U.U.temp()}</b></div>` +
        `<div class="dv-row"><span>${I18N.t('dash.pres')}</span><b>${U.pres(f.pressure, 1)} ${U.U.pres()}</b></div>` +
        `<div class="dv-row"><span>${I18N.t('dash.re')}</span><b>${lwc > 1e-6 ? re.toFixed(1) : '—'} µm</b>` +
          `<em>${I18N.t('dash.reDeriv', { v: lwc > 1e-6 ? reDeriv.toFixed(1) : '—' })}</em></div>` +
        `<div class="dv-row"><span>${I18N.t('dash.N')}</span><b>${N.toFixed(0)} cm⁻³</b></div>` +
        (kr ? `<div class="dv-row"><span>${I18N.t('const.scheme')}</span><b>${(kr.scheme || 'kessler').toUpperCase()}</b></div>` +
              `<div class="dv-row"><span>${I18N.t('dash.rain')}</span><b>${kr.rainRate.toFixed(2)} mm/h</b></div>` +
              `<div class="dv-row"><span>${I18N.t('dash.qr')}</span><b>${kr.qrTotal.toExponential(2)} kg/kg</b></div>` : '');
    }
    if (els.dashFormula) {
      const num = (x, d) => Number(x).toFixed(d == null ? 3 : d);
      els.dashFormula.innerHTML =
        `<div class="f-title">${I18N.t('dash.formulaTitle')}</div>` +

        `<div class="f-line">β = 3·LWC / (2·ρ_w·r_e)　[m⁻¹]</div>` +
        `<div class="f-sub">= 3×${num(lwc, 3)} / (2×1000×${num(re, 1)}×10⁻⁶) = ${num(betaM, 5)} m⁻¹ = ${num(betaKm, 2)} km⁻¹</div>` +

        `<div class="f-line">V = −ln(ε)/β　[ε=${A.KOSCHMEIER_EPS}]</div>` +
        `<div class="f-sub">= −ln(0.02)/${num(betaM, 5)} = ${fmtVis(wv.vis)}</div>` +

        `<div class="f-line">LWC = min(1,d)·LWC_MAX·(冰相×0.4)　[g/m³]</div>` +
        `<div class="f-sub">LWC_MAX=${A.LWC_MAX}，当前 ${num(lwc, 3)} g/m³（最差能见度高度 ${U.alt(shownAlt, 2)} ${U.U.alt()}）</div>` +

        `<div class="f-line">r_e = (3·LWC / (4π·ρ_w·N))^(1/3)　[µm]</div>` +
        `<div class="f-sub">N=${num(N, 0)} cm⁻³ 时 r_e=${num(reDeriv, 2)} µm（滑块设定值 ${num(re, 1)} µm）</div>` +

        `<div class="f-line">β(λ)=β(λ₀)·(λ₀/λ)^α（Ångström，α≈0–2）</div>` +
        `<div class="f-note">${I18N.t('dash.fNote')}</div>` +
        `<div class="f-basis">${I18N.t('dash.coverBasis')}</div>`;
    }
    if (els.dashScales) {
      els.dashScales.innerHTML =
        CM.barHTML('beta', betaKm, I18N.t('cmap.beta')) +
        CM.barHTML('lwc', lwc, I18N.t('cmap.lwc')) +
        CM.barHTML('re', re, I18N.t('cmap.re')) +
        CM.barHTML('Nd', N, I18N.t('cmap.Nd')) +
        `<div class="formula"><div class="f-basis">${I18N.t('dash.scaleBasis')}</div></div>`;
    }
    if (els.dashSnapshots) {
      els.dashSnapshots.innerHTML = snapshots.length
        ? snapshots.map(s => `<span class="snap" style="border-color:${s.color}">${s.label}: ${fmtVis(s.vis)}</span>`).join('')
        : `<span class="snap muted">${I18N.t('dash.snapEmpty')}</span>`;
    }
    drawDashboard();
  }

  function addSnapshot(rec) {
    const colors = ['#ffd166', '#ff8fa3', '#8fd3ff', '#b5e48c', '#d3b5ff'];
    snapshots.push({ label: rec.label, vis: rec.vis, color: colors[snapshots.length % colors.length] });
    if (snapshots.length > 6) snapshots.shift();
  }
  function clearSnapshots() { snapshots = []; }

  let lastSectionT = -1;
  function update(timeSec) {
    drawProfile();
    // 剖面图 64×64 采样较重，限制到 ~10 Hz（主视图仍是 60 fps，互不影响）
    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (nowMs - lastSectionT > 100) { drawSection(timeSec); lastSectionT = nowMs; }
    readouts();
    simStatus(timeSec);
    legend();
    updateDashboardReadout(timeSec);
  }

  // ----------------- 高级面板绘图助手（路线图 #1/#2/#6/#9） -----------------
  // 能见度配色：低能见度（差）→ 红，高能见度（好）→ 蓝绿
  function visColor(v) {
    const lv = Math.log(Math.max(50, Math.min(99999, v)));
    const t = (lv - Math.log(50)) / (Math.log(99999) - Math.log(50));
    const stops = [[255, 107, 107], [255, 209, 102], [91, 227, 155], [124, 156, 255]];
    const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const i = Math.floor(x), f = x - i;
    const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)];
    return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
  }
  // 通用数值配色（蓝→青→绿→黄→红），用于光学厚度等
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [[60, 90, 160], [54, 209, 196], [91, 227, 155], [255, 209, 102], [255, 107, 107]];
    const x = t * (stops.length - 1);
    const i = Math.floor(x), f = x - i;
    const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)];
    return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
  }

  // 曲线（时序能见度演变）：对数纵轴
  function drawCurve(cv, curve, kind) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0a1018'; ctx.fillRect(0, 0, W, H);
    const padL = 34, padR = 8, padT = 8, padB = 16;
    const pw = W - padL - padR, ph = H - padT - padB;
    const vMin = 50, vMax = 99000;
    const vToY = v => {
      const lv = clamp(Math.log(Math.max(vMin, Math.min(vMax, v))), Math.log(vMin), Math.log(vMax));
      return padT + (1 - (lv - Math.log(vMin)) / (Math.log(vMax) - Math.log(vMin))) * ph;
    };
    ctx.strokeStyle = '#16223a'; ctx.fillStyle = '#5d6f93'; ctx.font = '9px sans-serif'; ctx.lineWidth = 1;
    [100, 1000, 10000].forEach(v => { const y = vToY(v); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText((v >= 1000 ? (v / 1000) + 'k' : v) + 'm', 2, y + 3); });
    if (curve && curve.length > 1) {
      ctx.strokeStyle = '#5be39b'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i < curve.length; i++) {
        const x = padL + i / (curve.length - 1) * pw;
        const v = curve[i];
        const y = (v == null || !isFinite(v)) ? vToY(vMax) : vToY(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // 水平能见度场（N×N 网格，值单位 m）
  function drawField(cv, field, N, minV, maxV) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#070b15'; ctx.fillRect(0, 0, W, H);
    if (!field || !N) return;
    const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = field[i * N + j];
      const c = v == null ? [20, 30, 50] : visColor(v);
      const idx = (j * N + i) * 4; img.data[idx] = c[0]; img.data[idx + 1] = c[1]; img.data[idx + 2] = c[2]; img.data[idx + 3] = 255;
    }
    // 离屏放大绘制
    const off = document.createElement('canvas'); off.width = N; off.height = N;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.beginPath();
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  }

  // 参数敏感性热力图（N×N，值可为 vis 或光学厚度）
  // 配色一律按“本次网格的数据值域”归一化：以前对能见度用绝对对数标度（50–99999 m），
  // 而灵敏度值域常常只有 100–160 m，只占色带 4%，整张图看起来是同一个颜色。
  // 兼容旧签名：第 4 个参数若是数字，按 (minA,maxA,minB,maxB,metric) 解析。
  function drawHeatmap(cv, grid, N, a, b, c, d, e) {
    const o = (typeof a === 'number' || a == null)
      ? { minA: a, maxA: b, minB: c, maxB: d, metric: e }
      : (a || {});
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#070b15'; ctx.fillRect(0, 0, W, H);
    if (!grid || !N) return;

    const PADL = 6, PADB = 24, PADT = 6, CBR = 62;      // 左/下/上内边距，右侧留给色标
    const pw = Math.max(10, W - PADL - CBR), ph = Math.max(10, H - PADT - PADB);

    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < grid.length; i++) { const v = grid[i]; if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const flat = !(hi > lo) || (hi - lo) / Math.max(1e-9, Math.abs((lo + hi) / 2)) < 1e-4;

    // 跨度大时用对数刻度（能见度常见 50 m–50 km）
    const useLog = !flat && lo > 0 && hi / lo > 20;
    const norm = (v) => {
      if (flat) return 0.5;
      if (useLog) return (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
      return (v - lo) / (hi - lo);
    };

    const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = grid[i * N + j];
      const col = !isFinite(v) ? [20, 30, 50] : rampColor(norm(v));
      const idx = (j * N + i) * 4;
      img.data[idx] = col[0]; img.data[idx + 1] = col[1]; img.data[idx + 2] = col[2]; img.data[idx + 3] = 255;
    }
    const off = document.createElement('canvas'); off.width = N; off.height = N;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, PADL, PADT, pw, ph);

    // 色标（右侧竖直渐变条 + 上下限数值）
    const cbX = PADL + pw + 10, cbW = 10;
    const g = ctx.createLinearGradient(0, PADT, 0, PADT + ph);
    for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, 'rgb(' + rampColor(1 - k / 4).join(',') + ')');
    ctx.fillStyle = g; ctx.fillRect(cbX, PADT, cbW, ph);
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1;
    ctx.strokeRect(cbX + 0.5, PADT + 0.5, cbW - 1, ph - 1);
    ctx.strokeRect(PADL + 0.5, PADT + 0.5, pw - 1, ph - 1);

    const fmt = (v) => {
      if (!isFinite(v)) return '—';
      if (Math.abs(v) >= 1000) return v.toFixed(0);
      if (Math.abs(v) >= 10) return v.toFixed(1);
      return v.toFixed(3);
    };
    ctx.font = '8px sans-serif'; ctx.fillStyle = '#8ea2c4'; ctx.textBaseline = 'middle';
    ctx.fillText(fmt(hi), cbX + cbW + 3, PADT + 4);
    ctx.fillText(fmt(lo), cbX + cbW + 3, PADT + ph - 4);
    if (!flat) ctx.fillText(useLog ? 'log' : '', cbX + cbW + 3, PADT + ph * 0.5);

    // 轴标注：A 沿 x（底部），B 沿 y（顶部左侧）
    ctx.textBaseline = 'alphabetic';
    const rx = (v) => (v == null ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)));
    const labelA = (o.labelA ? o.labelA + '  ' : 'A  ') + rx(o.minA) + '→' + rx(o.maxA);
    const labelB = (o.labelB ? o.labelB + '  ' : 'B  ') + rx(o.minB) + '↑' + rx(o.maxB);
    ctx.fillStyle = '#9fb2d0';
    ctx.fillText(labelA, PADL, H - 8);
    ctx.fillText(labelB, PADL + 2, PADT + 9);

    if (flat) {
      ctx.fillStyle = 'rgba(7,11,21,.68)';
      ctx.fillRect(PADL, PADT + ph * 0.5 - 9, pw, 18);
      ctx.fillStyle = '#ffd166'; ctx.font = '9px sans-serif';
      ctx.fillText(o.flatHint || '≈ const (no response)', PADL + 6, PADT + ph * 0.5 + 3);
    }
  }

  // 散点图（观测 vs 模型），含 1:1 参考线
  function drawScatter(cv, pairs) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0a1018'; ctx.fillRect(0, 0, W, H);
    if (!pairs || !pairs.length) return;
    let mx = 1; pairs.forEach(p => { mx = Math.max(mx, p.obs || 0, p.model || 0); });
    mx *= 1.05;
    const pad = 18;
    const xy = v => ({ x: pad + v / mx * (W - 2 * pad), y: H - pad - v / mx * (H - 2 * pad) });
    ctx.strokeStyle = '#16223a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, H - pad); ctx.lineTo(W - pad, H - pad); ctx.stroke();
    ctx.strokeStyle = 'rgba(124,156,255,.5)'; ctx.setLineDash([3, 3]); ctx.beginPath();
    ctx.moveTo(pad, H - pad); ctx.lineTo(W - pad, pad); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#5be39b';
    pairs.forEach(p => { if (p.obs == null || p.model == null) return; const a = xy(p.obs), b = xy(p.model); ctx.beginPath(); ctx.arc(a.x, b.y, 2.5, 0, 7); ctx.fill(); });
  }

  // 泰勒图（标准差比 + 相关系数 + 中心化均方根）
  function drawTaylor(cv, t) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0a1018'; ctx.fillRect(0, 0, W, H);
    if (!t) return;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 16;
    ctx.strokeStyle = '#22304f'; ctx.lineWidth = 1.2;
    for (let r = R / 4; r <= R + 0.5; r += R / 4) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); }
    // 参考圆：模型标准差 = 观测标准差（半径归一为 1）
    ctx.strokeStyle = 'rgba(124,156,255,.6)'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // 角度刻度（相关系数）
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    for (let a = 0; a <= 90; a += 30) { const rad = (90 - a) * Math.PI / 180; const x = cx + R * Math.cos(rad), y = cy - R * Math.sin(rad); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); ctx.fillStyle = '#5d6f93'; ctx.font = '8px sans-serif'; ctx.fillText('r=' + (Math.cos(rad)).toFixed(1), x + 2, y - 2); }
    // 模型点：半径 = 标准差比，角度 = acos(corr)
    const ang = Math.acos(Math.max(-1, Math.min(1, t.corr || 0)));
    const rr = Math.max(0.05, Math.min(2, t.stdRatio || 0)) * R;
    const px = cx + rr * Math.cos(ang), py = cy - rr * Math.sin(ang);
    ctx.fillStyle = '#5be39b'; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
  }

  // 三方案对比曲线图（Kessler 1969 / KK2000 / ICON-SB06 随云滴数浓度 N_c 的雨强响应）
  function drawSchemeComparison(cv, cmp) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#070b15'; ctx.fillRect(0, 0, W, H);
    if (!cmp || !cmp.N || !cmp.N.length) return;
    const padL = 36, padR = 12, padT = 18, padB = 22;
    const pw = W - padL - padR, ph = H - padT - padB;
    let rMax = 0.5;
    ['kessler', 'kk2000', 'sb06'].forEach(k => {
      (cmp[k] || []).forEach(v => { if (isFinite(v) && v > rMax) rMax = v; });
    });
    rMax *= 1.12;
    const xOf = i => padL + (i / Math.max(1, cmp.N.length - 1)) * pw;
    const yOf = v => padT + (1 - clamp(v / rMax, 0, 1)) * ph;

    ctx.strokeStyle = '#16223a'; ctx.fillStyle = '#5d6f93'; ctx.font = '9px sans-serif'; ctx.lineWidth = 1;
    for (let k = 0; k <= 3; k++) {
      const val = rMax * k / 3;
      const y = yOf(val);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(val.toFixed(1), 4, y + 3);
    }
    const nMin = cmp.N[0], nMax = cmp.N[cmp.N.length - 1];
    [100, 300, 600, 900].forEach(nv => {
      if (nv < nMin || nv > nMax) return;
      const x = padL + ((nv - nMin) / (nMax - nMin)) * pw;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
      ctx.fillText('N=' + nv, x - 14, H - 6);
    });

    const styles = [
      ['kessler', '#ff8fa3', 'Kessler (1969)'],
      ['kk2000', '#5be39b', 'KK2000 (2-Mom)'],
      ['sb06', '#4fd1ff', 'ICON-SB06 (2-Mom)'],
    ];
    styles.forEach(([key, col, label], idx) => {
      const arr = cmp[key] || [];
      ctx.strokeStyle = col; ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = xOf(i), y = yOf(arr[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillText('━ ' + label, padL + idx * 118, 12);
    });

    // 标出当前 N_c 垂直虚线
    if (cmp.atCurrentN && isFinite(cmp.atCurrentN.N)) {
      const curX = padL + clamp((cmp.atCurrentN.N - nMin) / (nMax - nMin), 0, 1) * pw;
      ctx.strokeStyle = '#ffd166'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(curX, padT); ctx.lineTo(curX, H - padB); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  global.Monitor = {
    init, update, addSnapshot, clearSnapshots, getSnapshots: () => snapshots, setAxis, syncTabLabels,
    drawCurve, drawField, drawHeatmap, drawScatter, drawTaylor, drawSchemeComparison,
  };
})(window);
