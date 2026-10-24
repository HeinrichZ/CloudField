/* main.js — CloudField 初始化与渲染主循环 / 弹窗 / Bridge 接线
 * 默认语言：德文（de）。所有文案经 I18N.t() 取三语。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright Tianyuan.J.Z©
 */
(function (global) {
  'use strict';

  const A = global.Atmosphere;
  const I18N = global.I18N;
  const vmKey = { real: 'vm.real', temp: 'vm.temp', pressure: 'vm.pressure', water: 'vm.water', coverage: 'vm.coverage' };

  let renderer, camera, occTimer = null, lastCamKey = '', occRefreshT = 0;

  // 初始化/渲染失败：屏幕只显示简洁摘要（长消息如着色器源码会刷满屏），完整错误进控制台
  function showLoadError(key, e) {
    const loading = document.getElementById('loading');
    if (!loading) return;
    const raw = String((e && e.message) || e);
    const brief = raw.length > 240 ? raw.slice(0, 240) + '…' : raw;
    loading.removeAttribute('data-i18n');            // 避免语言切换把错误文案覆盖回默认
    loading.textContent = I18N.t(key, { msg: brief }) + '\n\n' + I18N.t('loading.consoleHint');
    loading.style.color = '#ff6b6b';
    loading.style.whiteSpace = 'pre-wrap';
    loading.style.alignItems = 'flex-start';
    loading.style.padding = '18px';
    console.error(e);
  }

  function boot() {
    const canvas = document.getElementById('gl');
    const loading = document.getElementById('loading');

    // 应用默认/已保存语言到静态文案，并初始化语言菜单
    I18N.bootstrap();
    initLangMenu();
    initUnitSeg();

    let started = false;

    try { renderer = new global.CloudRenderer(canvas); }
    catch (e) { showLoadError('loading.initFail', e); return; }
    camera = new global.Camera(canvas);
    global.__cf = {
      renderer,
      onChange: onParamChange,
      showDocs, showValidation, showIntegration,
      getTime: () => timeSec,          // 当前仿真时间（供快照/诊断用，避免各处写死 0）
      initBridge: () => global.Integration && global.Integration.initBridge && global.Integration.initBridge(),
    };
    global.Monitor.init();
    global.GUI.init();
    if (global.Integration && global.Integration.init) global.Integration.init();

    // 分享链接：若 URL hash 携带 #cfg= 编码的状态，则恢复（在 GUI 构建后应用）
    if (global.Report && global.Report.loadFromHash) {
      try { global.Report.loadFromHash(); } catch (e) { console.warn('分享链接状态恢复失败', e); }
      // 应用分享状态后重建控件，使滑块与新状态一致
      if (global.GUI && global.GUI.build) global.GUI.build();
    }

    // 剖面高度轴：拖动手柄 = 切片高度，3D 云场里同步画高亮水平线
    const axisEl = document.getElementById('slice-axis');
    if (axisEl && global.SliceAxis) {
      const axis = global.SliceAxis.init(axisEl, { onChange: onParamChange });
      global.Monitor.setAxis(axis);
      global.__cfAxis = axis;
    }

    const playChip = document.getElementById('state-play');
    if (playChip) playChip.addEventListener('click', () => {
      A.STATE.playing = !A.STATE.playing;
      if (global.GUI && global.GUI.syncPlay) global.GUI.syncPlay(); else syncStatus();
      onParamChange();
    });

    global.MainUI = { syncStatus };
    syncStatus();
    I18N.onLangChange(syncStatus);

    // 多视角按钮
    const viewBtns = document.querySelectorAll('#view-buttons button');
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        viewBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        camera.setView(btn.dataset.view);
      });
    });
    global.__resetView = () => {
      camera.setView('persp');
      viewBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'persp'));
    };

    // 弹窗关闭
    document.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => document.getElementById(b.dataset.close).classList.add('hidden'));
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
    });

    // 语言切换：已打开的弹窗用新语言重新生成内容
    I18N.onLangChange(() => {
      const docs = document.getElementById('docs-modal');
      if (docs && !docs.classList.contains('hidden')) showDocs();
      const val = document.getElementById('validate-modal');
      if (val && !val.classList.contains('hidden')) showValidation();
    });

    // 初始占位：请求一次 occupancy
    renderer.requestOccupancy();

    let last = performance.now(), timeSec = 0, frames = 0, fpsT = 0, fps = 0, monT = 0, kesAcc = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const S = A.STATE;
      if (S.playing) {
        timeSec += dt * S.simSpeed;
        if (S.autoLife) S.lifePhase += dt * S.simSpeed * 0.15;
        // 单柱 q_c/q_r 预报：固定 0.1 s 步长（不再每帧取样 5 层），显著降低主循环负载
        if (global.Kessler) {
          kesAcc = Math.min(0.5, kesAcc + dt * S.simSpeed);
          let guard = 0;
          while (kesAcc >= 0.1 && guard++ < 8) { global.Kessler.step(0.1); kesAcc -= 0.1; }
        }
        // 环境慢变：180 s 周期，温度 ±2 °C、RH ∓5%；让温度/气压/湿度在演进中真实变化
        if (S.envCycle) {
          const w = 2 * Math.PI / 180;
          S.envT = 5.0 * Math.sin(timeSec * w);
          S.envRH = 10.0 * Math.sin(timeSec * w + Math.PI);
        } else { S.envT = 0; S.envRH = 0; }
      }

      // 相机移动 → 重置 TAA 累积
      const camKey = camera.pos[0].toFixed(2) + ',' + camera.pos[1].toFixed(2) + ',' + camera.pos[2].toFixed(2) + ',' + camera.fov.toFixed(3);
      if (camKey !== lastCamKey) { lastCamKey = camKey; renderer.resetAccum(); }

      // 敏感性扫描期间（S.__sweeping）会逐行改写被扫参数，若继续出图会看到参数闪动；
      // 这里保留上一帧画面、暂停仪表盘刷新，扫描结束自动恢复。
      const sweeping = !!S.__sweeping;
      if (!sweeping) {
        try { renderer.render(camera, timeSec); }
        catch (e) { showLoadError('loading.renderErr', e); return; }
      }

      // 生命期推进会改变积云/积雨云的云顶高度，occ 粗网格得跟着刷新，
      // 否则云长高了而 occ 还是旧的（风致平移已在着色器里按噪声空间补偿，不用管）。
      if (S.playing && S.autoLife) {
        occRefreshT += dt;
        if (occRefreshT >= 2) { occRefreshT = 0; renderer.requestOccupancy(); }
      }

      const hudMode = document.getElementById('hud-mode');
      if (hudMode) hudMode.textContent = I18N.t(vmKey[S.viewMode] || 'vm.real');
      const hudAlt = document.getElementById('hud-alt');
      if (hudAlt) hudAlt.textContent = I18N.t('hud.cameraAlt') + ' ' + camera.pos[1].toFixed(1) + ' km';
      frames++; fpsT += dt;
      if (fpsT >= 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0;
        const hudFps = document.getElementById('state-fps'); if (hudFps) hudFps.textContent = fps + ' FPS';
        syncStatus(); }

      monT += dt;
      if (monT >= 0.08) { if (!sweeping) global.Monitor.update(timeSec); monT = 0; }

      if (!started) { started = true; loading.style.display = 'none'; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // 顶栏语言分段控件（中文/英文/德文，默认德文）：高亮当前语言
  function initLangMenu() {
    const btns = document.querySelectorAll('#lang-seg button[data-lang]');
    const paint = () => btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-lang') === I18N.getLang()));
    paint();
    I18N.onLangChange(paint);
    btns.forEach(b => b.addEventListener('click', () => I18N.setLang(b.getAttribute('data-lang'))));
  }

  // 单位体系（常用 / SI）：切换后数值与单位标签一起重排
  function initUnitSeg() {
    const btns = document.querySelectorAll('#unit-seg button[data-unit]');
    const paint = () => btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-unit') === global.Units.get()));
    paint();
    global.Units.onChange(paint);
    btns.forEach(b => b.addEventListener('click', () => {
      global.Units.set(b.getAttribute('data-unit'));
      if (global.Monitor && global.Monitor.syncTabLabels) global.Monitor.syncTabLabels();
    }));
  }

  // 顶栏运行状态：播放/暂停、时间流速、渲染质量、帧率
  function syncStatus() {
    const S = A.STATE;
    const play = document.getElementById('state-play');
    if (play) {
      play.textContent = S.playing ? I18N.t('sim.run') + ' · ' + S.simSpeed.toFixed(1) + '×' : I18N.t('sim.pause');
      play.classList.toggle('run', !!S.playing);
      play.classList.toggle('pause', !S.playing);
    }
    const sp = document.getElementById('state-speed');
    if (sp) sp.textContent = I18N.t('sim.timeSpeed') + ' ' + S.simSpeed.toFixed(1) + '×';
    const q = document.getElementById('state-quality');
    if (q) q.textContent = 'Q ' + S.quality.toFixed(2);
  }

  // 参数变化：重置 TAA + 防抖请求 occupancy 重算（密度粗网格在 Worker 中）
  function onParamChange() {
    if (!renderer) return;
    renderer.resetAccum();
    if (occTimer) clearTimeout(occTimer);
    occTimer = setTimeout(() => renderer.requestOccupancy(), 160);
  }

  // ---------------- 文档弹窗（可信度说明） ----------------
  function methodologyHTML() {
    const mp = A.microMapping();
    const params = mp.params.map(p =>
      `<tr><td>${p.label}</td><td><code>${p.value}</code> ${p.unit}</td><td>${p.mapsTo}</td></tr>`).join('');
    return `
      <h3>${I18N.t('doc.h1')}</h3>
      <p><b>${I18N.t('doc.p1')}</b></p>
      <p><b>${I18N.t('doc.p2')}</b></p>
      <p><b>${I18N.t('doc.p3')}</b></p>
      <p>${I18N.t('doc.p4', { max: A.LWC_MAX })}</p>

      <h3>${I18N.t('doc.h2')}</h3>
      <p>${I18N.t('doc.p5', { scheme: mp.scheme })}</p>
      <table><thead><tr><th>${I18N.t('doc.th.param')}</th><th>${I18N.t('doc.th.value')}</th><th>${I18N.t('doc.th.mapsTo')}</th></tr></thead><tbody>${params}</tbody></table>

      <h3>${I18N.t('doc.h3')}</h3>
      <p>${I18N.t('doc.p6')}</p>

      <h3>${I18N.t('doc.h4')}</h3>
      <p>${I18N.t('doc.p7')}</p>

      <h3>${I18N.t('doc.h5')}</h3>
      <p class="warn">${I18N.t('doc.p8')}</p>

      <h3>${I18N.t('doc.lic.h')}</h3>
      <p>${I18N.t('doc.lic.p1')}</p>
      <p>${I18N.t('doc.lic.p2', { email: 'zhangheinrich@foxmail.com' })}</p>
      <p>${I18N.t('doc.lic.p3')}</p>
      <p>${I18N.t('doc.lic.p4')}</p>

      <h3>${I18N.t('doc.ack.h')}</h3>
      <p>${I18N.t('doc.ack.p1')}</p>
      <p>${I18N.t('doc.ack.p2')}</p>
      <p>${I18N.t('doc.ack.p3')}</p>
    `;
  }
  function showDocs() {
    const body = document.getElementById('docs-body');
    if (body) body.innerHTML = methodologyHTML();
    const m = document.getElementById('docs-modal'); if (m) m.classList.remove('hidden');
  }

  // ---------------- 探空验证弹窗 ----------------
  function showValidation() {
    const rows = A.validateAgainstRadiosonde();
    const clear = I18N.t('val.clear');
    let html = `<p>${I18N.t('val.intro')}</p>
      <table><thead><tr><th>${I18N.t('val.th.z')}</th><th>${I18N.t('val.th.p')}</th><th>${I18N.t('val.th.T')}</th><th>${I18N.t('val.th.Td')}</th><th>${I18N.t('val.th.vis')}</th><th>${I18N.t('val.th.lwc')}</th></tr></thead><tbody>`;
    rows.forEach(r => {
      const vis = r.modelVis == null ? clear : (r.modelVis >= 1000 ? (r.modelVis / 1000).toFixed(2) + 'km' : r.modelVis.toFixed(0) + 'm');
      html += `<tr><td>${r.z.toFixed(1)}</td><td>${r.p.toFixed(0)}</td><td>${r.T.toFixed(1)}</td><td>${r.Td.toFixed(1)}</td><td>${vis}</td><td>${r.lwc.toFixed(2)}</td></tr>`;
    });
    html += `</tbody></table>
      <p class="warn">${I18N.t('val.note')}</p>`;
    const body = document.getElementById('validate-body'); if (body) body.innerHTML = html;
    const m = document.getElementById('validate-modal'); if (m) m.classList.remove('hidden');
  }

  // ---------------- 数据接口弹窗 ----------------
  function showIntegration() {
    if (global.Integration && global.Integration.renderInto) {
      const body = document.getElementById('integration-body');
      if (body && !body.dataset.built) { global.Integration.renderInto(body); body.dataset.built = '1'; }
    }
    const m = document.getElementById('integration-modal'); if (m) m.classList.remove('hidden');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
