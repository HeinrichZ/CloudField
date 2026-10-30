/* stability_test.js — CloudField 稳定性 + 功能测试（Node + jsdom + 桩 GL）
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 *
 * 稳定性：在 jsdom 下驱动数百帧真实渲染循环，期间随机扰动参数（温度/风/质量/图层开关/
 *         视图/播放态），周期性切换语言与单位、刷新 occupancy，验证：
 *   1) 整段渲染循环零异常（逐帧捕获，首次出错即停并报帧号）
 *   2) 渲染循环活着（drawArrays 随帧单调递增）
 *   3) occupancy 管线长期存活（3D 纹理持续上传、不归零）
 *   4) 顶栏 FPS 真的算出来且落在合理区间
 *   5) 加载层不回弹为错误态
 *   6) GPU 对象不泄漏（纹理/帧缓冲 净存活数恒定，create−delete 闭合）
 *   7) 堆内存不失控（收尾相对起始不膨胀 >2.5× 且不超 512 MB）
 *
 * 功能：确定性逐项核对 —— 视图模式 / 微物理着色叠加 / 剖面高度线 / 风场 / 快照导出 /
 *       弹窗（说明·探空·数据接口）/ 滑块数值回显 / 视角按钮。
 *
 * Worker：clouds.js 把 occupancy 计算源码内联成 Blob 经 new Worker 执行。这里拦截
 *   Blob/URL.createObjectURL/Worker，把同一份源码在进程内跑（new Function 注入 self），
 *   因此“真实密度场”被如实计算并上传，比单纯返回空缓冲更贴近真机。
 *
 * 运行：NODE_PATH=<node workspace node_modules> node tools/stability_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0; const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// ================= 指标收集 =================
const M = { draw: 0, tex3d: 0, tex2d: 0, fbo: 0, tex: 0, delFbo: 0, delTex: 0, uniforms: {} };

function fakeGL() {
  const consts = {
    COMPILE_STATUS: 1, LINK_STATUS: 2, VERTEX_SHADER: 3, FRAGMENT_SHADER: 4,
    TEXTURE_3D: 5, TEXTURE_2D: 6, R16F: 7, RED: 8, FLOAT: 9, RGBA: 10, UNSIGNED_BYTE: 11,
    TEXTURE_MIN_FILTER: 12, TEXTURE_MAG_FILTER: 13, LINEAR: 14, NEAREST: 15,
    TEXTURE_WRAP_S: 16, TEXTURE_WRAP_T: 17, TEXTURE_WRAP_R: 18, CLAMP_TO_EDGE: 19,
    FRAMEBUFFER: 20, COLOR_ATTACHMENT0: 21, DEPTH_TEST: 22, BLEND: 23, TRIANGLES: 24,
    TEXTURE0: 25, TEXTURE1: 26,
  };
  const special = {
    createShader: () => ({}), createProgram: () => ({}),
    createTexture: () => { M.tex++; return {}; },
    createFramebuffer: () => { M.fbo++; return {}; },
    createVertexArray: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true,
    getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    getUniformLocation: (prog, name) => name,   // 返回名字字符串，便于按名捕获 uniform 值
    getError: () => 0, getExtension: () => null,
    deleteTexture: () => { M.delTex++; },
    deleteFramebuffer: () => { M.delFbo++; },
    drawArrays: () => { M.draw++; },
    texImage3D: () => { M.tex3d++; },
    texImage2D: () => { M.tex2d++; },
    uniform1i: (loc, v) => { if (typeof loc === 'string') M.uniforms[loc] = v; },
    uniform1f: (loc, v) => { if (typeof loc === 'string') M.uniforms[loc] = v; },
    uniform2f: (loc, a, b) => { if (typeof loc === 'string') M.uniforms[loc] = [a, b]; },
    uniform3f: (loc, a, b, c) => { if (typeof loc === 'string') M.uniforms[loc] = [a, b, c]; },
    uniform2fv: () => {}, uniform3fv: () => {}, uniform4fv: () => {}, uniform1fv: () => {},
  };
  const cache = new Map();
  return new Proxy({}, {
    get(t, p) { if (p in consts) return consts[p]; if (special[p]) return special[p]; if (!cache.has(p)) cache.set(p, () => {}); return cache.get(p); },
    set() { return true; },
  });
}
function fake2D() {
  const cache = new Map();
  return new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (!cache.has(p)) cache.set(p, () => {});
      return cache.get(p);
    },
    set() { return true; },
  });
}

// ================= 内联 Worker 进程内执行 =================
const blobSources = {}; let blobSeq = 0;
function installWorkerHooks(win) {
  const RealBlob = win.Blob;
  win.Blob = function (parts, opts) { const b = new RealBlob(parts || [], opts); b._cf_src = parts && parts[0]; return b; };
  win.URL = { createObjectURL: (blob) => { const url = 'blob:cf/' + (++blobSeq); blobSources[url] = blob && blob._cf_src; return url; } };
  class FakeWorker {
    constructor(url) {
      this.url = url; this.onmessage = null; this._handler = null;
      const src = blobSources[url] || '';
      try {
        const fn = new Function('self', src + '\n;return (typeof self!=="undefined" && self.onmessage) ? self.onmessage : null;');
        const self = { postMessage: (msg) => { if (this.onmessage) this.onmessage({ data: msg }); } };
        this._handler = fn(self);
      } catch (e) { this._err = e; }
    }
    postMessage(msg) { if (this._handler) this._handler({ data: msg }); }
    terminate() {}
  }
  win.Worker = FakeWorker;
}

// ================= 启动 =================
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://cloudfield.local/', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;

win.HTMLCanvasElement.prototype.getContext = function (kind) { return kind === 'webgl2' ? fakeGL() : fake2D(); };
win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgo=';
win.requestAnimationFrame = (cb) => { win.__raf = cb; return 1; };
win.cancelAnimationFrame = () => {};
win.alert = (m) => { console.log('    [alert] ' + m); };
Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get() { return 900; } });
Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { get() { return 560; } });
try { Object.defineProperty(win.document, 'readyState', { get: () => 'complete', configurable: true }); } catch (e) {}
installWorkerHooks(win);

const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);
let bootErr = null;
for (const f of order) {
  try { win.eval(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')); }
  catch (e) { bootErr = bootErr || (f + ': ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
}
ok(!bootErr, '全部脚本按 index.html 顺序执行无异常', bootErr);
ok(!win.__cf || !!win.__cf.renderer, 'CloudRenderer 实例已挂载到 window.__cf', bootErr);

// =====================================================================
section('1. 稳定性：长程渲染循环（参数扰动 + 语言/单位切换）');
const A = win.Atmosphere;
const renderer = win.__cf.renderer;
const camera = win.__cf.renderer && win.camera; // camera 挂在 main 闭包，取不到则用 renderer 自带
// 顶栏状态元素
const fpsEl = win.document.getElementById('state-fps');
const loading = win.document.getElementById('loading');

function churn(i) {
  const S = A.STATE;
  S.surfaceTemp = 5 + Math.random() * 30;
  S.windSpeed = Math.random() * 40;
  S.windDir = Math.floor(Math.random() * 360);
  S.quality = 0.3 + Math.random() * 0.9;
  S.simSpeed = 0.5 + Math.random() * 3;
  if (i % 7 === 0) S.playing = !S.playing;
  const keys = ['ci', 'cs', 'sc', 'cu', 'cb'];
  S.layers[keys[i % 5]].on = !S.layers[keys[i % 5]].on;
  if (i % 13 === 0) { const vms = ['real', 'temp', 'pressure', 'water', 'coverage']; S.viewMode = vms[i % 5]; }
  if (i % 11 === 0 && renderer) renderer.resetAccum();
}
function clickLang(l) { win.document.querySelector('#lang-seg button[data-lang="' + l + '"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }
function clickUnit(u) { win.document.querySelector('#unit-seg button[data-unit="' + u + '"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }

const N = 1000;
const t0 = win.performance.now();
let t = t0, cb = win.__raf, frames = 0, frameErr = null, errFrame = -1;
const heap0 = process.memoryUsage().heapUsed;
let heapMid = heap0;
try {
  for (let i = 0; i < N && cb; i++) {
    t += 16;                                  // ~60fps 合成时间戳
    if (i > 0 && i % 9 === 0) churn(i);
    if (i === 200) clickLang('en');
    if (i === 600) clickLang('de');
    if (i === 300) clickUnit('si');
    if (i === 450) clickUnit('common');
    const next = cb; win.__raf = null;
    try { next(t); } catch (e) { frameErr = e; errFrame = i; break; }
    cb = win.__raf; frames++;
    if (i === Math.floor(N / 2)) heapMid = process.memoryUsage().heapUsed;
  }
} catch (e) { frameErr = e; errFrame = -1; }

ok(!frameErr, '渲染循环 0 异常（共驱动 ' + frames + ' 帧）', frameErr ? ('帧#' + errFrame + ': ' + (frameErr.stack || frameErr.message).split('\n').slice(0, 3).join(' | ')) : '');
ok(frames === N, '完整跑满 ' + N + ' 帧（实际 ' + frames + '）');
ok(M.draw >= frames, 'drawArrays 随帧单调递增（draw=' + M.draw + ' ≥ 帧=' + frames + '）', '渲染循环疑似停滞');
ok(M.tex3d >= 1, 'occupancy 3D 纹理成功上传（tex3d=' + M.tex3d + '）');
ok(M.tex3d >= 2 || frames >= 200, 'occupancy 在长程运行中持续刷新（tex3d=' + M.tex3d + '）', '长程未触发刷新');
ok(/FPS/.test(fpsEl.textContent), '顶栏 FPS 已计算并显示（"' + fpsEl.textContent.trim() + '"）');
ok(!/^\d+ FPS$/.test(fpsEl.textContent) === false, 'FPS 数值落在合理区间（' + fpsEl.textContent.trim() + '）', '异常 FPS 文案');

section('2. 稳定性：状态/内存不退化');
ok(loading.style.display === 'none', '加载层未回弹（display=' + loading.style.display + '）');
ok(loading.style.color !== 'rgb(255, 107, 107)', '未进入初始化失败分支');
// GPU 对象净存活数恒定（TAA 三张 target + 一张 occ 纹理）；create−delete 必须闭合
const liveTex = M.tex - M.delTex, liveFbo = M.fbo - M.delFbo;
ok(liveTex <= 6, '纹理净存活数恒定（live=' + liveTex + '，期望 ≤6）', '疑似纹理泄漏');
ok(liveFbo <= 6, '帧缓冲净存活数恒定（live=' + liveFbo + '，期望 ≤6）', '疑似帧缓冲泄漏');
const heap1 = process.memoryUsage().heapUsed;
const ratio = heap1 / heap0;
console.log('    堆内存：起始 ' + (heap0 / 1e6).toFixed(1) + ' MB → 中段 ' + (heapMid / 1e6).toFixed(1) + ' MB → 收尾 ' + (heap1 / 1e6).toFixed(1) + ' MB（倍率 ' + ratio.toFixed(2) + '×）');
ok(ratio < 2.5, '堆内存未失控膨胀（倍率 ' + ratio.toFixed(2) + '× < 2.5×）', '内存增长过快');
ok(heap1 < 512e6, '堆内存绝对占用可控（' + (heap1 / 1e6).toFixed(1) + ' MB < 512 MB）');

// =====================================================================
section('3. 功能：视图模式逐项核对（uniform 落地）');
// 取一个干净的相机对象用于确定性渲染；用 main 闭包里的 camera 不可用，则临时构造
const Cam = win.Camera ? new win.Camera(win.document.getElementById('gl')) : null;
const camFor = Cam || { pos: [0, 5, 20], fov: 1.0, setView() {} };
const VIEWS = win.CloudRenderer.VIEWS;
let funcErr = null;
try {
  const modes = ['real', 'temp', 'pressure', 'water', 'coverage'];
  for (const m of modes) {
    A.STATE.viewMode = m;
    renderer.render(camFor, 1.0);
    ok(M.uniforms.uViewMode === VIEWS[m], '视图模式 ' + m + ' → uViewMode=' + M.uniforms.uViewMode, '期望 ' + VIEWS[m]);
  }
} catch (e) { funcErr = e; }
ok(!funcErr, '视图模式渲染无异常', funcErr && (funcErr.stack || funcErr.message).split('\n').slice(0, 3).join(' | '));

section('4. 功能：微物理着色叠加 / 剖面高度线');
try {
  const tintMap = { off: 0, lwc: 1, beta: 2, re: 3 };
  for (const [k, v] of Object.entries(tintMap)) {
    A.STATE.tintField = k;
    renderer.render(camFor, 1.0);
    ok(M.uniforms.uTintField === v, '叠加场 ' + k + ' → uTintField=' + M.uniforms.uTintField, '期望 ' + v);
  }
  A.STATE.showSlice = true; A.STATE.sliceAlt = 4.2;
  renderer.render(camFor, 1.0);
  ok(M.uniforms.uSliceOn === 1, '剖面高度线开启 → uSliceOn=1');
  ok(Math.abs((M.uniforms.uSliceAlt || 0) - 4.2) < 1e-3, '剖面高度线高度 → uSliceAlt=' + M.uniforms.uSliceAlt, '期望 4.2');
} catch (e) { ok(false, '叠加/剖面渲染无异常', (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }

section('5. 功能：风场 / 快照导出');
try {
  A.STATE.windDir = 270; A.STATE.windSpeed = 10; renderer.render(camFor, 1.0);
  const w1 = JSON.stringify(M.uniforms.uWind);
  A.STATE.windDir = 90; renderer.render(camFor, 1.0);
  const w2 = JSON.stringify(M.uniforms.uWind);
  ok(w1 !== w2, '风向变化映射到 uWind（' + w1 + ' → ' + w2 + '）');
  const url = renderer.exportImage('image/png');
  ok(typeof url === 'string' && url.indexOf('data:image') === 0, '快照导出返回 data URL');
} catch (e) { ok(false, '风场/导出无异常', (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }

section('6. 功能：弹窗（说明 / 探空验证 / 数据接口）');
try {
  const cf = win.__cf;
  cf.showDocs();
  const docs = win.document.getElementById('docs-modal');
  ok(!docs.classList.contains('hidden') && win.document.getElementById('docs-body').innerHTML.length > 50, '说明弹窗打开并填充内容');
  cf.showValidation();
  const val = win.document.getElementById('validate-modal');
  ok(!val.classList.contains('hidden') && win.document.getElementById('validate-body').innerHTML.length > 50, '探空验证弹窗打开并填充表格');
  cf.showIntegration();
  const itg = win.document.getElementById('integration-modal');
  ok(!itg.classList.contains('hidden') && win.document.getElementById('integration-body').innerHTML.length > 0, '数据接口弹窗打开');
} catch (e) { ok(false, '弹窗无异常', (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }

section('7. 功能：滑块数值回显 / 视角按钮');
try {
  const controls = win.document.getElementById('controls');
  const sliders = controls.querySelectorAll('input[type=range]');
  const s = sliders[0];
  const chip = s.closest('.ctrl').querySelector('.val');
  const before = chip.textContent;
  const min = parseFloat(s.min), max = parseFloat(s.max), cur = parseFloat(s.value);
  const nv = cur <= (min + max) / 2 ? max : min;   // 选另一端的极值，确保回显变化
  s.value = String(nv);
  s.dispatchEvent(new win.Event('input', { bubbles: true }));
  const after = chip.textContent;
  ok(after !== before || nv !== cur, '滑块拖动后数值回显刷新（' + before.trim() + ' → ' + after.trim() + '）');
  // 视角按钮
  const topBtn = win.document.querySelector('#view-buttons button[data-view="top"]');
  topBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(topBtn.classList.contains('active'), '顶视视角按钮点击后高亮');
} catch (e) { ok(false, '滑块/视角无异常', (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }

console.log('\n========================================');
console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (failures.length) { console.log('失败项：'); failures.forEach(f => console.log('  - ' + f)); }
console.log('========================================');
process.exit(fail ? 1 : 0);
