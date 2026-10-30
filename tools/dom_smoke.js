/* dom_smoke.js — 用 jsdom 加载真实 index.html 跑一遍启动冒烟
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 * boot_test.js 用的是伪 DOM，查不出元素接线（id 写错、选择器落空）这类问题；
 * 这里加载真实 HTML + 真实脚本顺序，只把 canvas 的 GL/2D 上下文换成桩。
 * 用法：NODE_PATH=<workspace node_modules> node tools/dom_smoke.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0; const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// ---- 计数用的假 GL / 2D 上下文 ----
const counters = { draw: 0, tex3d: 0, tex2d: 0 };
function fakeGL() {
  const consts = { COMPILE_STATUS: 1, LINK_STATUS: 2, VERTEX_SHADER: 3, FRAGMENT_SHADER: 4,
    TEXTURE_3D: 5, TEXTURE_2D: 6, R16F: 7, RED: 8, FLOAT: 9, RGBA: 10, UNSIGNED_BYTE: 11,
    TEXTURE_MIN_FILTER: 12, TEXTURE_MAG_FILTER: 13, LINEAR: 14, NEAREST: 15,
    TEXTURE_WRAP_S: 16, TEXTURE_WRAP_T: 17, TEXTURE_WRAP_R: 18, CLAMP_TO_EDGE: 19,
    FRAMEBUFFER: 20, COLOR_ATTACHMENT0: 21, DEPTH_TEST: 22, BLEND: 23, TRIANGLES: 24,
    TEXTURE0: 25, TEXTURE1: 26 };
  const special = {
    createShader: () => ({}), createProgram: () => ({}), createTexture: () => ({}),
    createFramebuffer: () => ({}), createVertexArray: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true,
    getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    getUniformLocation: () => ({}), getError: () => 0, getExtension: () => null,
    drawArrays: () => { counters.draw++; },
    texImage3D: () => { counters.tex3d++; },
    texImage2D: () => { counters.tex2d++; },
  };
  const cache = new Map();
  return new Proxy({}, {
    get(t, p) {
      if (p in consts) return consts[p];
      if (special[p]) return special[p];
      if (!cache.has(p)) cache.set(p, () => {});
      return cache.get(p);
    },
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

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://cloudfield.local/', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;

// canvas 上下文桩：jsdom 不带 WebGL，也不带 2D 实现
win.HTMLCanvasElement.prototype.getContext = function (kind) {
  return kind === 'webgl2' ? fakeGL() : fake2D();
};
win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,00';
win.requestAnimationFrame = (cb) => { win.__raf = cb; return 1; };
win.cancelAnimationFrame = () => {};
win.alert = (m) => { console.log('    [alert] ' + m); };
// 元素尺寸：jsdom 全是 0，会让相机/画布尺寸算出 0
Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get() { return 900; } });
Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { get() { return 560; } });

// jsdom 构造完 readyState 还停在 loading，main.js 会去等 DOMContentLoaded（我们的手工 eval 不会触发）
try { Object.defineProperty(win.document, 'readyState', { get: () => 'complete', configurable: true }); } catch (e) { /* 只读则跳过 */ }

// ---- 按 index.html 里的顺序执行脚本 ----
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);
console.log('脚本顺序：' + order.join(' → '));
let bootErr = null;
for (const f of order) {
  try { win.eval(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')); }
  catch (e) { bootErr = bootErr || (f + ': ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
}

section('1. 启动');
ok(!bootErr, '全部脚本按 index.html 顺序执行无异常', bootErr);
// 手动驱动几帧
// 时间戳必须与 performance.now() 同源，否则 dt 为负、监控栏永远不刷新
const t0 = win.performance.now();
// Monitor.update 每 0.08 s 才跑一次，帧数要够才能看到读数/公式/色标被填充
try { for (let i = 1; i <= 12 && win.__raf; i++) { const cb = win.__raf; win.__raf = null; cb(t0 + i * 16); } }
catch (e) { console.log('    帧循环异常：' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
ok(counters.draw > 0, '渲染循环调用了 drawArrays（实际 ' + counters.draw + ' 次）');
ok(counters.tex3d > 0, '上传了 3D occupancy 纹理（实际 ' + counters.tex3d + ' 次）');
const loading = win.document.getElementById('loading');
ok(loading.style.display === 'none', 'loading 已隐藏（不卡加载）', JSON.stringify(loading.style));
ok(loading.style.color !== 'rgb(255, 107, 107)', '未进入初始化失败分支');

section('2. 左侧控制面板');
const controls = win.document.getElementById('controls');
ok(controls.children.length > 0, '控制面板已生成控件', String(controls.children.length));
const sliders = controls.querySelectorAll('input[type=range]');
ok(sliders.length >= 10, '滑块数量充足（实际 ' + sliders.length + '）');
const valChips = controls.querySelectorAll('.ctrl .val');
ok(valChips.length === sliders.length, '每条滑块都有数值回显（' + valChips.length + '/' + sliders.length + '）');
ok([...valChips].every(v => v.textContent.trim().length > 0), '数值回显非空');
const dial = controls.querySelector('.compass .dial');
ok(!!dial, '风向使用罗盘旋钮而非线性滑块');
ok(!!dial && dial.querySelectorAll('.tick').length > 0, '罗盘有刻度');
ok(!!dial && dial.querySelector('.needle') && dial.querySelector('.arrow'), '罗盘有来向指针与去向箭头');
const degText = dial.parentElement.querySelector('.deg').textContent;
ok(/^\d+°$/.test(degText.trim()), '罗盘实时显示角度值', degText);
ok(dial.parentElement.querySelector('.txt').textContent.trim().length > 0, '罗盘显示方位名称');
// 太阳方位角保留线性滑块（它不是周期循环量，无所谓 359→0 断层）
ok([...sliders].some(s => s.max === '360'), '太阳方位角仍用滑块（非周期量）');
// 开关必须用 label 包住隐形 checkbox，否则点上去永远没反应
const switchLabels = controls.querySelectorAll('label.switch input[type=checkbox]');
ok(switchLabels.length >= 5, '开关为 label 包裹的 checkbox（可点击切换）', String(switchLabels.length));
const forLabels = [...controls.querySelectorAll('.ctrl.toggle label[for]')];
ok(forLabels.length >= 5 && forLabels.every(l => l.getAttribute('for')), '开关文字标签通过 for 关联');
// 语言顺序：第一德语、第二英语、第三中文，默认德语高亮
const langBtns = [...win.document.querySelectorAll('#lang-seg button[data-lang]')];
ok(langBtns.map(b => b.getAttribute('data-lang')).join(',') === 'de,en,zh', '语言顺序为 德/英/中');
ok(langBtns[0].classList.contains('active'), '默认高亮德语');

section('3. 顶栏');
ok(!!win.document.getElementById('topbar'), '顶栏存在');
ok(win.document.querySelectorAll('#lang-seg button[data-lang]').length === 3, '语言切换在顶栏（3 个按钮）');
ok(win.document.querySelectorAll('#unit-seg button[data-unit]').length === 2, '单位体系切换在顶栏（常用/SI）');
const de = win.document.querySelector('#lang-seg button[data-lang="de"]');
ok(de.classList.contains('active'), '默认德文高亮');
ok(!!win.document.getElementById('state-play'), '顶栏有播放/暂停状态提示');
ok(!!win.document.getElementById('state-speed'), '顶栏有时间流速状态提示');
ok(!!win.document.getElementById('state-quality'), '顶栏有渲染质量状态提示');

section('4. 右侧面板分区');
ok(win.document.querySelectorAll('#dash-tabs button').length === 3, '右侧面板有 3 个 Tab');
ok(!!win.document.querySelector('.tab-pane[data-pane="read"]'), '读数面板存在');
ok(!!win.document.querySelector('.tab-pane[data-pane="formula"]'), '公式面板存在');
ok(!!win.document.querySelector('.tab-pane[data-pane="scale"]'), '色标面板存在');
const dashReadout = win.document.getElementById('dash-readout');
ok(dashReadout.innerHTML.length > 0, '读数区已填充');
const formula = win.document.getElementById('dash-formula');
ok(formula.querySelectorAll('.f-sub').length >= 3, '公式区给出数值代入示例（' + formula.querySelectorAll('.f-sub').length + ' 条）');
ok(/\d/.test(formula.textContent.replace(/\s/g, '')), '代入示例里含具体数字');
const scales = win.document.getElementById('dash-scales');
ok(scales.querySelectorAll('.cm-bar').length >= 4, '色标 Tab 至少 4 条色标条（实际 ' + scales.querySelectorAll('.cm-bar').length + '）');
ok(scales.querySelectorAll('.cm-pin').length >= 3, '标量色标带当前值指针（' + scales.querySelectorAll('.cm-pin').length + '）');

section('5. 底部监控栏');
const readouts = win.document.getElementById('readouts');
ok(readouts.querySelectorAll('.gauge').length >= 10, '读数收成仪表卡（' + readouts.querySelectorAll('.gauge').length + ' 张）');
ok(readouts.querySelectorAll('.ro').length === 0, '旧式平铺读数已移除');
const prof = win.document.getElementById('profile');
const dominant = prof.closest('.mon-panel');
ok(dominant.classList.contains('dominant'), '垂直廓线图所在面板为主导读图窗口');
ok(prof.width >= 600, '廓线画布分辨率足够（' + prof.width + '×' + prof.height + '）');
const sim = win.document.getElementById('sim-status');
ok(sim.textContent.length > 0, '模拟状态已填充');
ok(/·|×|%/.test(sim.textContent) || sim.querySelector('.tag'), '模拟状态含运行/暂停标记');

section('6. 剖面高度轴与 3D 联动');
const axis = win.document.getElementById('slice-axis');
ok(axis.children.length > 0, '剖面高度轴已挂载');
ok(!!axis.querySelector('.sa-handle'), '高度轴有可拖动手柄');
ok(!!axis.querySelector('.sa-track'), '高度轴有轨道（点击可跳转）');
ok(axis.querySelectorAll('.sa-grid i').length >= 15, '高度轴有刻度（' + axis.querySelectorAll('.sa-grid i').length + '）');
ok(!!axis.querySelector('.sa-mark'), '高度轴有最低能见度高度标记');

section('7. 单位体系切换');
ok(win.Units.get() === 'common', '默认常用单位');
const beforeTemp = [...controls.querySelectorAll('.ctrl .val')].map(v => v.textContent).join('|');
win.document.querySelector('#unit-seg button[data-unit="si"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
ok(win.Units.get() === 'si', '点击 SI 后切换');
const afterTemp = [...win.document.getElementById('controls').querySelectorAll('.ctrl .val')].map(v => v.textContent).join('|');
ok(beforeTemp !== afterTemp, '切换单位后数值回显重排', '切换前后一致');
ok(win.localStorage.getItem('cloudfield.units') === 'si', '单位选择已持久化');
ok(win.document.querySelector('#unit-seg button[data-unit="si"]').classList.contains('active'), 'SI 按钮高亮');
win.document.querySelector('#unit-seg button[data-unit="common"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

section('8. 语言切换（顶栏）');
win.document.querySelector('#lang-seg button[data-lang="zh"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
ok(win.I18N.getLang() === 'zh', '切换到中文');
ok(controls.textContent.indexOf('场景参数') >= 0, '控制面板重建为中文');
ok(win.document.getElementById('dash-tabs').textContent.indexOf('色标') >= 0, 'Tab 标签已本地化');
win.document.querySelector('#lang-seg button[data-lang="de"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

console.log('\n========================================');
console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (failures.length) { console.log('失败项：'); failures.forEach(f => console.log('  - ' + f)); }
console.log('========================================');
process.exit(fail ? 1 : 0);
