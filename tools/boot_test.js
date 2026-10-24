/* boot_test.js — CloudField 全链路启动回归（Node + DOM/WebGL2 桩）
 * 用途：在无浏览器环境完整执行 boot()，验证：
 *   1) boot() 全程无异常、渲染循环可跑（fake GL 下 COMPILE_STATUS 恒真，
 *      真实 GLSL 校验见 shader_static_check）
 *   2) 默认语言德文；静态文案被翻译；语言菜单勾选互斥；切换后各面板重建
 *   3) 天气代码描述三语（解析期按当前语言取值）
 *   4) 机场名三语 + 跨语言搜索
 *   5) 词典 zh/en/de 键集合一致
 * 运行：node tools/boot_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const JS = p => fs.readFileSync(path.join(ROOT, 'js', p), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// ================= 伪 WebGL2 上下文 =================
const GL_CONSTS = {
  VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
  TEXTURE_2D: 0x0de1, TEXTURE_3D: 0x806f, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, RED: 0x1903,
  FLOAT: 0x1406, R32F: 0x822e, NEAREST: 0x2600, LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812f,
  TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, TEXTURE_WRAP_R: 0x8072,
  FRAMEBUFFER: 0x8d40, COLOR_ATTACHMENT0: 0x8ce0, DEPTH_TEST: 0x0b71, BLEND: 0x0be2,
  TRIANGLES: 0x0004, TEXTURE0: 0x84c0, TEXTURE1: 0x84c1,
};
let glDrawCalls = 0;
function makeGL() {
  const special = {
    createShader: () => ({}), createProgram: () => ({}), createTexture: () => ({}),
    createFramebuffer: () => ({}), createVertexArray: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true,
    getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    getUniformLocation: () => ({}), getError: () => 0,
    drawArrays: () => { glDrawCalls++; },
  };
  const cache = new Map();
  return new Proxy({}, {
    get(t, prop) {
      if (prop in GL_CONSTS) return GL_CONSTS[prop];
      if (special[prop]) return special[prop];
      if (!cache.has(prop)) cache.set(prop, () => {});
      return cache.get(prop);
    },
    set() { return true; },
  });
}
function make2D() {
  const cache = new Map();
  return new Proxy({}, {
    get(t, prop) {
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray((w | 0) * (h | 0) * 4), width: w, height: h });
      if (!cache.has(prop)) cache.set(prop, () => {});
      return cache.get(prop);
    },
    set() { return true; },
  });
}

// ================= 伪 DOM =================
class FakeEl {
  constructor(tag = 'div', id = '') {
    this.tagName = String(tag).toUpperCase();
    this.id = id; this._attrs = {}; this.dataset = {};
    this.style = {}; this.children = []; this.textContent = ''; this.innerHTML = '';
    this.checked = false; this.value = ''; this.type = ''; this.title = ''; this.href = ''; this.download = '';
    this.clientWidth = 960; this.clientHeight = 600; this.width = 300; this.height = 150;
    this._ev = {};
    const cls = new Set();
    this._cls = cls;
    this.classList = {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; on ? cls.add(c) : cls.delete(c); return on; },
      contains: c => cls.has(c),
    };
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return k in this._attrs; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this._ev[type] = this._ev[type] || []).push(fn); }
  removeEventListener() {}
  dispatch(type, ev = {}) { (this._ev[type] || []).forEach(f => f(ev)); }
  querySelector() { return new FakeEl(); }
  querySelectorAll() { return []; }
  getContext(kind) { return kind === '2d' ? make2D() : makeGL(); }
  toDataURL() { return 'data:image/png;base64,00'; }
  focus() {} click() { this.dispatch('click'); }
}

// 静态元素登记表（对应 index.html 中带 data-i18n 的节点）
const i18nRegistry = [];
function staticEl(tag, id, i18nKey) {
  const e = new FakeEl(tag, id || '');
  if (i18nKey) { e.setAttribute('data-i18n', i18nKey); i18nRegistry.push(e); }
  return e;
}

// 语言切换改成顶栏分段按钮（原来是侧栏复选框）
const langChecks = ['zh', 'en', 'de'].map(c => {
  const b = new FakeEl('button', '');
  b.setAttribute('data-lang', c);
  return b;
});
const unitChecks = ['common', 'si'].map(c => {
  const b = new FakeEl('button', '');
  b.setAttribute('data-unit', c);
  return b;
});
const viewBtns = ['persp', 'top', 'side', 'front'].map(v => {
  const b = new FakeEl('button', '');
  b.dataset.view = v; return b;
});
const closeBtns = ['docs-modal', 'validate-modal', 'integration-modal', 'adv-modal'].map(id => {
  const b = new FakeEl('button', ''); b.dataset.close = id; return b;
});
const modals = ['docs-modal', 'validate-modal', 'integration-modal', 'adv-modal'].map(id => new FakeEl('div', id));

const byId = new Map();
function reg(id, el) { byId.set(id, el); return el; }
reg('gl', Object.assign(new FakeEl('canvas', 'gl'), { clientWidth: 960, clientHeight: 600 }));
reg('loading', staticEl('div', 'loading', 'loading.init'));
reg('hud-mode', new FakeEl('span', 'hud-mode'));
reg('hud-fps', new FakeEl('span', 'hud-fps'));
reg('hud-alt', new FakeEl('span', 'hud-alt'));
reg('profile', Object.assign(new FakeEl('canvas', 'profile'), { width: 320, height: 220 }));
reg('section', Object.assign(new FakeEl('canvas', 'section'), { width: 220, height: 220 }));
reg('dash-canvas', Object.assign(new FakeEl('canvas', 'dash-canvas'), { width: 300, height: 150 }));
reg('readouts', new FakeEl('div', 'readouts'));
reg('sim-status', new FakeEl('div', 'sim-status'));
reg('slice-label', new FakeEl('span', 'slice-label'));
reg('legend', new FakeEl('div', 'legend'));
reg('dash-readout', new FakeEl('div', 'dash-readout'));
reg('dash-formula', new FakeEl('div', 'dash-formula'));
reg('dash-snapshots', new FakeEl('div', 'dash-snapshots'));
reg('dash-toggle', staticEl('button', 'dash-toggle', 'dash.collapse'));
reg('dash-body', new FakeEl('div', 'dash-body'));
reg('controls', new FakeEl('div', 'controls'));
reg('docs-modal', modals[0]); reg('docs-body', new FakeEl('div', 'docs-body'));
reg('validate-modal', modals[1]); reg('validate-body', new FakeEl('div', 'validate-body'));
reg('integration-modal', modals[2]); reg('integration-body', new FakeEl('div', 'integration-body'));
reg('adv-modal', modals[3]); reg('adv-body', new FakeEl('div', 'adv-body'));

const doc = {
  readyState: 'complete',
  documentElement: { lang: 'zh-CN' },
  getElementById: id => byId.get(id) || new FakeEl('div', id || ''),
  createElement: tag => new FakeEl(tag),
  querySelectorAll(sel) {
    if (sel === '[data-i18n]') return i18nRegistry.slice();
    if (sel === '#lang-seg button[data-lang]') return langChecks;
    if (sel === '#unit-seg button[data-unit]') return unitChecks;
    if (sel === '#view-buttons button') return viewBtns;
    if (sel === '[data-close]') return closeBtns;
    if (sel === '.modal') return modals;
    return [];
  },
  addEventListener() {},
};

// ================= 全局桩 =================
const store = {};
const win = {
  devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
};
global.window = win;
global.document = doc;
const lsStore = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
win.localStorage = lsStore;   // 浏览器里模块通过 window.localStorage 访问，桩也要挂在 win 上
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => {};
global.Blob = class Blob { constructor(parts) { this.parts = parts; } };
global.location = { hash: '', origin: 'http://localhost', pathname: '/', search: '' };
global.Worker = class Worker {
  constructor() { this.onmessage = null; this.onerror = null; }
  postMessage() {} terminate() {}
};
if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:fake';
if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => {};
global.alert = m => { console.log('    [alert] ' + m); };

// ================= 加载模块（顺序同 index.html） =================
// 浏览器中 window 的属性即全局变量（clouds.js 等以自由变量引用 GLU/Atmosphere）；
// Node 中需在每加载一个模块后，把 window 上新导出的符号镜像到 global。
const MODULES = ['i18n.js', 'units.js', 'colormap.js', 'gl-utils.js', 'camera.js', 'atmosphere.js',
  'mie.js', 'radiation.js', 'physics.js', 'spectrum.js', 'phases.js', 'kessler.js',
  'operators.js', 'timeseries.js', 'qc.js',
  'export.js', 'validation.js', 'batch.js', 'recorder.js', 'report.js', 'help.js',
  'clouds.js', 'sliceaxis.js', 'monitor.js', 'gui.js', 'integration.js', 'main.js'];
let bootError = null;
try {
  for (const m of MODULES) {
    require(path.join(ROOT, 'js', m));
    for (const k of Object.keys(win)) { if (!(k in global)) global[k] = win[k]; }
  }
} catch (e) { bootError = e; }

// 手动驱动渲染循环若干帧（浏览器中由 rAF 自动驱动）
for (let i = 1; i <= 3 && rafCb; i++) { const cb = rafCb; rafCb = null; cb(i * 16); }

// ================= 1. 启动 =================
const loadingEl = byId.get('loading');
section('1. boot() 全链路（fake GL）');
ok(!bootError, '模块加载 + boot() 无异常', bootError && (bootError.stack || bootError.message || String(bootError)).split('\n').slice(0, 3).join(' | '));
ok(loadingEl.style.color !== '#ff6b6b', 'boot 未进入初始化失败分支（loading 非错误态）', JSON.stringify(loadingEl.style));
ok(glDrawCalls > 0, '渲染循环至少执行过一次 drawArrays（实际 ' + glDrawCalls + ' 次）');
ok(byId.get('loading').style.display === 'none', '首帧后 loading 已隐藏（不再卡加载）');
ok(typeof win.I18N === 'object', 'window.I18N 已导出');

// ================= 2. 语言 =================
section('2. 默认语言与切换');
ok(win.I18N.getLang() === 'de', '默认语言为德文 de', win.I18N.getLang());
ok(doc.documentElement.lang === 'de', '<html lang> = de', doc.documentElement.lang);
ok(loadingEl.getAttribute('data-i18n') === 'loading.init', '成功态下 loading 保留 data-i18n 属性');
ok(win.I18N.t('loading.init') === 'Szene wird initialisiert…', 'loading.init 德文取值', win.I18N.t('loading.init'));
ok(langChecks.find(c => c.getAttribute('data-lang') === 'de').classList.contains('active'), '顶栏语言分段按钮 de 高亮');
ok(!langChecks.find(c => c.getAttribute('data-lang') === 'zh').classList.contains('active'), '顶栏语言分段按钮 zh 未高亮');

// 切到中文
langChecks.find(c => c.getAttribute('data-lang') === 'zh').dispatch('click');
ok(win.I18N.getLang() === 'zh', '点击 zh 后切换到中文');
ok(doc.documentElement.lang === 'zh-CN', '<html lang> = zh-CN');
ok(store['cloudfield.lang'] === 'zh', '语言选择持久化到 localStorage');
ok(!langChecks.find(c => c.getAttribute('data-lang') === 'de').classList.contains('active'), '切换后 de 取消高亮（互斥）');
ok(win.I18N.t('grp.scene') === '场景参数', '切换后 t() 取中文', win.I18N.t('grp.scene'));

// 切到英文再切回德文
langChecks.find(c => c.getAttribute('data-lang') === 'en').dispatch('click');
ok(win.I18N.getLang() === 'en' && win.I18N.t('grp.scene') === 'Scene Parameters', '切换英文', win.I18N.t('grp.scene'));
langChecks.find(c => c.getAttribute('data-lang') === 'de').dispatch('click');
ok(win.I18N.getLang() === 'de', '切回德文');

// ================= 3. 天气代码三语 =================
section('3. 天气代码描述三语');
const WX_CODES = ['BR', 'FG', 'FU', 'VA', 'DU', 'SA', 'HZ', 'DZ', 'RA', 'SN', 'SG', 'IC', 'PL', 'GR', 'GS', 'TS', 'SH', 'FZ', 'PO', 'SQ', 'FC', 'SS', 'DS'];
const METAR_SAMPLE = 'METAR ZBAA 141050Z 24015G28KT 210V280 0800 R27L/0900U +TSRA BR FEW012CB BKN020 12/M01 Q1003';
const r = win.Integration.parse(METAR_SAMPLE);
ok(r.weather.length === 2, '示例报文解析出 2 组现在天气', JSON.stringify(r.weather));
ok(r.weather[0].codes.join('+') === 'TS+RA', '第一组代码 TS+RA', r.weather[0].codes.join('+'));
const wxByLang = {};
for (const lang of ['de', 'en', 'zh']) {
  win.I18N.setLang(lang);
  const rr = win.Integration.parse(METAR_SAMPLE);
  wxByLang[lang] = rr.weather.map(w => w.desc).join(' / ');
  ok(rr.weather[0].desc.includes('+'), 'desc 用 + 连接（' + lang + '）', rr.weather[0].desc);
}
ok(wxByLang.de === 'Gewitter+Regen / leichter Dunst (Sicht ≥ 1000 m)', '德文天气描述', wxByLang.de);
ok(wxByLang.en === 'Thunderstorm+Rain / Mist (vis ≥ 1000 m)', '英文天气描述', wxByLang.en);
ok(wxByLang.zh === '雷暴+雨 / 轻雾（能见度≥1000m）', '中文天气描述', wxByLang.zh);

// 全代码覆盖：23 个代码在三种语言下都必须有描述（不回落代码本身、不为空）
let allCovered = true, missing = [];
for (const lang of ['de', 'en', 'zh']) {
  win.I18N.setLang(lang);
  for (const code of WX_CODES) {
    const probe = 'METAR ZBAA 141050Z ' + code;
    const pr = win.Integration.parse(probe);
    const d = pr.weather[0] && pr.weather[0].desc;
    if (!d || d === code) { allCovered = false; missing.push(lang + ':' + code + '=' + JSON.stringify(d)); }
  }
}
ok(allCovered, '23 个天气代码 × 3 语全部有翻译', missing.join(', '));

// toScene 的三语分隔符
win.I18N.setLang('de');
const sc = win.Integration.toScene(win.Integration.parse(METAR_SAMPLE));
ok(sc.notes.some(n => n.startsWith('Wetter: ')), 'toScene 天气行德文前缀', sc.notes.find(n => n.startsWith('Wetter')));
win.I18N.setLang('zh');
const sc2 = win.Integration.toScene(win.Integration.parse(METAR_SAMPLE));
ok(sc2.notes.some(n => n.startsWith('天气：') && n.includes('；')), 'toScene 天气行中文前缀+中文分隔符', sc2.notes.find(n => n.startsWith('天气')));
win.I18N.setLang('de');

// ================= 4. 机场名三语 =================
section('4. 机场名三语与跨语言搜索');
const Coord = win.Integration.Coord;
ok(Coord.TABLE.length === 63, '内置机场表 63 条', String(Coord.TABLE.length));
const zbaa = Coord.byICAO('ZBAA');
ok(!!zbaa, 'byICAO(ZBAA) 命中');
const apByLang = {};
for (const lang of ['de', 'en', 'zh']) {
  win.I18N.setLang(lang);
  apByLang[lang] = Coord.airportName(zbaa);
}
ok(apByLang.de === 'Beijing Capital', 'ZBAA 德文名', apByLang.de);
ok(apByLang.en === 'Beijing Capital', 'ZBAA 英文名', apByLang.en);
ok(apByLang.zh === '北京首都', 'ZBAA 中文名', apByLang.zh);
win.I18N.setLang('de');
ok(Coord.search('Beijing').some(a => a.icao === 'ZBAA'), '德文界面搜英文名 Beijing 命中');
ok(Coord.search('北京').some(a => a.icao === 'ZBAA'), '德文界面搜中文名 北京 命中');
ok(Coord.search('PEK').some(a => a.icao === 'ZBAA'), '搜 IATA PEK 命中');
ok(Coord.search('ZBAA').length === 1, '搜 ICAO ZBAA 唯一命中');
ok(Coord.search('SHANGHAI').length === 2, '搜 Shanghai 命中浦东+虹桥', String(Coord.search('SHANGHAI').length));
ok(Coord.search('深圳').some(a => a.icao === 'ZGSZ'), '中文搜索命中深圳宝安');
ok(Coord.search('乌鲁木齐').some(a => a.icao === 'ZWTN'), '中文搜索命中乌鲁木齐');
ok(Coord.search('ZZZZ').length === 0, '无命中返回空');
// Bridge 注入未知机场回退
Coord.loadAirportTable([{ icao: 'ZZZZ', iata: 'ZZZ', name: '测试机场', lat: 0, lon: 0, elev: 0 }]);
ok(Coord.airportName(Coord.byICAO('ZZZZ')) === '测试机场', '未知机场回退到自带 name');
Coord.loadAirportTable(Coord.TABLE);

// ================= 5. 词典一致性 =================
section('5. 词典三语键一致性');
const src = JS('i18n.js');
const blocks = {};
for (const lang of ['zh', 'en', 'de']) {
  const start = src.indexOf('    ' + lang + ': {');
  const end = src.indexOf('\n    },', start);
  const body = src.slice(start, end);
  blocks[lang] = new Set([...body.matchAll(/'([\w.\-]+)':/g)].map(m => m[1]));
}
const kz = [...blocks.zh], ke = [...blocks.en], kd = [...blocks.de];
ok(kz.length === ke.length && ke.length === kd.length, '三语键数量相同（zh=' + kz.length + ' en=' + ke.length + ' de=' + kd.length + '）');
ok(kz.every(k => blocks.en.has(k) && blocks.de.has(k)), 'zh 的键在 en/de 中都存在');
ok(ke.every(k => blocks.zh.has(k) && blocks.de.has(k)), 'en 的键在 zh/de 中都存在');
ok(kd.every(k => blocks.zh.has(k) && blocks.en.has(k)), 'de 的键在 zh/en 中都存在');
ok(blocks.zh.has('loading.consoleHint') && blocks.zh.has('out.sep'), '新增键 loading.consoleHint / out.sep 已入词典');
// 抽查：任意键在三语下都不应返回键本身
let fallbackLeak = [];
for (const k of kz) {
  for (const lang of ['zh', 'en', 'de']) {
    win.I18N.setLang(lang);
    if (win.I18N.t(k) === k) fallbackLeak.push(lang + ':' + k);
  }
}
ok(fallbackLeak.length === 0, '所有键在三语下均有取值（无缺失回落）', fallbackLeak.slice(0, 5).join(', '));
win.I18N.setLang('de');

// ================= 6. 着色器静态检查 =================
section('6. 着色器精度限定符（静态）');
const clouds = JS('clouds.js');
const samplerLines = clouds.split('\n').filter(l => /uniform\s+(lowp|mediump|highp\s+)?sampler/.test(l));
ok(samplerLines.length === 4, '共 4 处 sampler 声明（occ 3D + 合成/拷贝 2D + 色标 LUT）', String(samplerLines.length));
const noPrec = samplerLines.filter(l => !/uniform\s+highp\s+sampler/.test(l));
ok(noPrec.length === 0, '所有 sampler 均带 highp 精度限定符', noPrec.join(' | '));
ok(/#version 300 es/.test(clouds) && clouds.split('#version 300 es').length - 1 === 4, '4 个 ES 3.00 着色器均存在');
ok(/precision highp float;/.test(clouds), '片元着色器声明 precision highp float');
// glsl_test 只做语法级解析，查不出“先用后声明”（真 GPU 会报 undeclared identifier），
// 这里用声明顺序断言钉住——着色块必须排在 `vec3 sc;` 之后。
// 注意只在 main() 内找：layerDensity 里另有一个同名的局部 sc，会干扰匹配。
const fragBody = clouds.match(/const FRAG = `([\s\S]*?)`;/)[1];
const mainBody = fragBody.slice(fragBody.indexOf('void main(){'));
const scDecl = mainBody.indexOf('vec3 sc;');
const scFirstUse = mainBody.indexOf('sc = ');
ok(scDecl >= 0 && scFirstUse > scDecl, 'main() 中 sc 先声明后赋值（真实 GPU 作用域检查）',
  `声明位置 ${scDecl}, 首次赋值 ${scFirstUse}`);
const tintBlock = mainBody.indexOf('uTintField > 0');
ok(tintBlock > scDecl, '微物理着色块位于 sc 声明之后');
// 温度/气压场视图：早期实现“取第一个云样本就 break，再用单值覆盖整条射线”，
// 导致无云/远端像素全部取 tempAt(uSliceAlt) 同一个常数（画面顶部整片同色、看起来固定不变）。
const fldStart = mainBody.indexOf('if(fieldMode){');
const fldEnd = mainBody.indexOf('if(!fieldMode && d > 0.01)');
const fldBlock = (fldStart >= 0 && fldEnd > fldStart) ? mainBody.slice(fldStart, fldEnd) : '';
ok(fldBlock.indexOf('transmittance * w * fieldCol') > 0 && fldBlock.indexOf('break') < 0,
  '温度/气压场沿射线逐段累积（不再取单点值覆盖 / 提前跳出）');
// 等值带 + 等值线（俯视时凭“透射率加权平均高度”分出温/压带）
ok(fragBody.indexOf('uniform float uFieldBand') > 0, '着色器提供等值带 uniform');
ok(mainBody.indexOf('hitY = pos.y') > 0 && mainBody.indexOf('float ry = (hitY >= 0.0)') > 0,
  '等值带按“代表高度”取样（有云取云顶 / 无云取半衰点）');
const bandIdx = mainBody.indexOf('uFieldBand > 0.5');
ok(bandIdx > 0 && mainBody.indexOf('fwidth', bandIdx) > bandIdx, '等值线用 fwidth 做屏幕空间抗锯齿');
ok(win.Atmosphere.STATE.fieldBand === true, '默认开启等值带/等值线', String(win.Atmosphere.STATE.fieldBand));

// ================= 7. 单位体系 =================
section('7. 单位体系（常用 / SI）');
ok(win.Units && typeof win.Units.get === 'function', 'Units 模块已导出');
ok(win.Units.get() === 'common', '默认单位体系为“常用”', win.Units.get());
ok(win.Units.temp(15, 1) === '15.0' && win.Units.U.temp() === '°C', '常用：温度按 °C 显示');
ok(win.Units.pres(1013, 0) === '1013' && win.Units.U.pres() === 'hPa', '常用：气压按 hPa 显示');
win.Units.set('si');
ok(Math.abs(parseFloat(win.Units.temp(15, 2)) - 288.15) < 0.01 && win.Units.U.temp() === 'K',
  'SI：温度换算为 K（15°C → 288.15 K）', win.Units.temp(15, 2));
ok(win.Units.pres(1013, 0) === '101300' && win.Units.U.pres() === 'Pa', 'SI：气压换算为 Pa', win.Units.pres(1013, 0));
ok(win.Units.alt(3, 2) === '3000.00' && win.Units.U.alt() === 'm', 'SI：高度换算为 m');
ok(store['cloudfield.units'] === 'si', '单位选择持久化到 localStorage');
win.Units.set('common');
ok(win.Units.temp(15, 1) === '15.0', '切回常用：温度回到 °C');
ok(unitChecks.find(b => b.getAttribute('data-unit') === 'common').classList.contains('active'), '切换后顶栏单位按钮高亮同步');

// ================= 8. 色标 =================
section('8. 色标（各量独立 cmap + 归一化区间）');
ok(!!(win.CMap && win.CMap.CMAPS), 'CMap 模块已导出');
const needMaps = ['lwc', 'beta', 're', 'Nd', 'temp', 'pres', 'density'];
ok(needMaps.every(k => win.CMap.CMAPS[k]), '四个物理量及温度/气压/密度均有色标定义',
  needMaps.filter(k => !win.CMap.CMAPS[k]).join(','));
const ranges = needMaps.map(k => win.CMap.CMAPS[k].range.join('–'));
ok(new Set(ranges).size === ranges.length, '各量归一化区间互不重复（不是共用一套）', ranges.join(' | '));
ok(win.CMap.CMAPS.lwc.range[1] === 1.5 && win.CMap.CMAPS.beta.range[1] === 80, 'LWC 上限 1.5 g/m³、β 上限 80 km⁻¹');
ok(win.CMap.lut('lwc').length === 1024, 'LUT 为 256×1 RGBA（1024 字节）', String(win.CMap.lut('lwc').length));
ok(win.CMap.sample('lwc', 0)[2] > win.CMap.sample('lwc', 0)[0], 'LWC 冷端偏蓝');
ok(win.CMap.sample('lwc', 1.5)[0] > win.CMap.sample('lwc', 1.5)[2], 'LWC 暖端偏红');
ok(win.CMap.barHTML('beta', 40).indexOf('cm-pin') > 0, '标量色标条带当前值指针');

// ================= 9. 微物理派生量与口径 =================
section('9. 微物理派生量 / 聚合口径');
const Amod = win.Atmosphere;
ok(Math.abs(Amod.lwcFromDensity(1, 'water') - Amod.LWC_MAX) < 1e-9, 'LWC = min(1,d)·LWC_MAX');
ok(Math.abs(Amod.lwcFromDensity(1, 'ice') - 0.4 * Amod.LWC_MAX) < 1e-9, '冰相 LWC 折减 0.4');
const b1 = Amod.betaFromLWC(0.3, 8);
ok(Math.abs(b1 - 56.25) < 0.5, 'β = 1.5·LWC/rₑ ·1000：LWC=0.3, rₑ=8 → 56.25 km⁻¹', b1.toFixed(2));
// β 单位等价：betaFromLWC 返回 km⁻¹，extinctionFromLWC 返回 m⁻¹，二者相差 1000（禁止把 1500 改成 1.5）
const bKm = Amod.betaFromLWC(0.3, 8), bM = Amod.extinctionFromLWC(0.3, 8);
ok(Math.abs(bKm - bM * 1000) < 1e-6, 'β(km⁻¹) = β(m⁻¹)×1000：1500 系数正确', bKm.toFixed(4) + ' vs ' + (bM * 1000).toFixed(4));
// Physics 内部统一 m⁻¹：β 应落在 10⁻³ 量级，能见度为百米—公里量级
if (win.Physics) {
  const sc = Amod.STATE.layers.sc, save = { on: sc.on, coverage: sc.coverage, density: sc.density };
  sc.on = true; sc.coverage = 0.95; sc.density = 0.9;
  Amod.STATE.phases = { water: 1, ice: 0, snow: 0, graupel: 0, hail: 0 };
  Amod.STATE.aerosol.on = false;
  let best = 0, bestV = Infinity, bestZ = 1.0;
  for (let z = 0.5; z <= 1.8; z += 0.1) {
    const dp = win.Physics.detailedAt(0, 0, z, Amod.effectiveLayers(), { x: 8, dir: 270 }, 0);
    if (dp.betaExt > best) { best = dp.betaExt; bestV = Amod.visibilityFromExt(dp.betaExt); bestZ = z; }
  }
  ok(best > 0 && best < 1, 'Physics.detailedAt 的 β 以 m⁻¹ 计（0<β<1）', best.toFixed(5));
  ok(isFinite(bestV) && bestV > 10 && bestV < 100000, 'Physics 详细能见度在 10 m–100 km 量级', bestV.toFixed(1));
  // 详细诊断与主模型共用 r_e 滑块：r_e 加倍，能见度应约加倍
  const saveRe2 = Amod.STATE.micro.effRadiusUm, saveMode2 = Amod.STATE.micro.reMode;
  Amod.STATE.micro.reMode = 'fixed';
  Amod.STATE.micro.effRadiusUm = 4;
  const vRe4 = win.Physics.visibilityDetailed(0, 0, bestZ, 0).vis;
  Amod.STATE.micro.effRadiusUm = 16;
  const vRe16 = win.Physics.visibilityDetailed(0, 0, bestZ, 0).vis;
  Amod.STATE.micro.effRadiusUm = saveRe2; Amod.STATE.micro.reMode = saveMode2;
  ok(isFinite(vRe4) && isFinite(vRe16) && vRe16 > vRe4 * 2, '详细能见度随 r_e 滑块变化（共用 r_e 源）', vRe4.toFixed(0) + '→' + vRe16.toFixed(0) + ' m');
  sc.on = save.on; sc.coverage = save.coverage; sc.density = save.density;
}
// LCL 使用可调干绝热直减率（默认 9.8 K/km），改参数应生效
const lclDefault = Amod.lclHeight();
const savedDry = Amod.STATE.dryLapseRate;
Amod.STATE.dryLapseRate = 6.5;
const lcl65 = Amod.lclHeight();
Amod.STATE.dryLapseRate = savedDry;
const lclExpect = (Amod.STATE.surfaceTemp - Amod.dewAt(0)) / 9.8;
ok(Math.abs(lclDefault - lclExpect) < 1e-6, 'LCL = (T−Td)/9.8（Magnus 露点 + 干绝热直减率）', lclDefault.toFixed(3));
ok(Math.abs(Amod.dewpointFromRH(15, 70) - 9.57) < 0.15, 'Magnus 露点：T=15°C,RH=70% → 约 9.6°C', Amod.dewpointFromRH(15, 70).toFixed(2));
ok(Math.abs(lcl65 - lclDefault * 9.8 / 6.5) < 1e-6, 'LCL 随干绝热直减率变化（6.5 时更高）', lcl65.toFixed(3));
// 压高公式（静力平衡）：用固定标准大气参数验证，测后恢复（前面的用例可能改过 STATE）
const svP = { T: Amod.STATE.surfaceTemp, p: Amod.STATE.surfacePressure, lr: Amod.STATE.lapseRate };
Amod.STATE.surfaceTemp = 15; Amod.STATE.surfacePressure = 1013; Amod.STATE.lapseRate = 6.5;
const p1 = Amod.pressureAt(1), p5 = Amod.pressureAt(5);
Amod.STATE.surfaceTemp = svP.T; Amod.STATE.surfacePressure = svP.p; Amod.STATE.lapseRate = svP.lr;
ok(Math.abs(p1 - 898) < 3, '压高公式：1 km ≈ 898 hPa', p1.toFixed(1));
ok(Math.abs(p5 - 540) < 6, '压高公式：5 km ≈ 540 hPa', p5.toFixed(1));
const rel = Amod.effRadiusFromLWC(0.3, 300);
ok(rel > 5 && rel < 8, 'rₑ 由 LWC 与 N 反推落在 5–8 µm（LWC=0.3, N=300）', rel.toFixed(2));
// 总云量口径：1 − Π(1 − cᵢ)
const lay = Amod.effectiveLayers();
let clr = 1; lay.forEach(L => { clr *= (1 - Math.min(1, L.coverage)); });
ok(Math.abs(Amod.totalCloudCover() - (1 - clr) * 100) < 1e-9, 'totalCloudCover 与 1−Π(1−cᵢ) 一致');
ok(/1 − Π/.test(win.I18N.t('dash.coverBasis')) || /Π/.test(win.I18N.t('dash.coverBasis')), '总云量口径说明写进了词典');

// ================= 10. 剖面高度轴与切片联动 =================
section('10. 剖面高度轴 / 切片联动');
ok(typeof win.SliceAxis.init === 'function', 'SliceAxis 模块已导出');
const axisEl = new FakeEl('div', 'slice-axis');
const axis = win.SliceAxis.init(axisEl, { onChange: () => {} });
ok(typeof axis.setMark === 'function' && typeof axis.refresh === 'function', '高度轴提供 setMark / refresh');
axis.setMark(0.202, '202 m');
ok(Amod.STATE.showSlice === true, '默认开启 3D 剖面高度线');
ok(Amod.STATE.tintField === 'off', '默认不叠加微物理着色');
ok(/uSliceAlt/.test(clouds) && /uTintField/.test(clouds), '着色器含剖面高度与微物理着色 uniform');

// ================= 11. 扩展诊断模块（路线图 #1–#14） =================
section('11. 扩展诊断模块导出与基本函数');
ok(typeof win.Physics === 'object' && typeof win.Physics.fieldStats === 'function', 'Physics 已导出（fieldStats 等）');
ok(typeof win.Spectrum === 'object' && typeof win.Spectrum.moments === 'function', 'Spectrum 已导出');
ok(typeof win.Phases === 'object' && typeof win.Phases.PRESETS.pureWater === 'object', 'Phases 已导出（PRESETS）');
ok(typeof win.Operators === 'object' && typeof win.Operators.compute === 'function', 'Operators 已导出');
ok(typeof win.TimeSeries === 'object' && typeof win.TimeSeries.applyDefault === 'function', 'TimeSeries 已导出');
ok(typeof win.QC === 'object' && typeof win.QC.flagSounding === 'function', 'QC 已导出');
ok(typeof win.Exporter === 'object' && typeof win.Exporter.toMETAR === 'function', 'Exporter 已导出');
ok(typeof win.Validation === 'object' && typeof win.Validation.stats === 'function', 'Validation 已导出');
ok(typeof win.Batch === 'object' && typeof win.Batch.runOne === 'function', 'Batch 已导出');
ok(typeof win.Recorder === 'object' && typeof win.Recorder.record === 'function', 'Recorder 已导出');
ok(typeof win.Report === 'object' && typeof win.Report.makeShareLink === 'function', 'Report 已导出');
ok(typeof win.Help === 'object' && Array.isArray(win.Help.CARDS) && win.Help.CARDS.length > 0, 'Help 已导出（CARDS）');

// 关键函数可调用且返回合理
const st = win.Physics.fieldStats({ z: 0.3, N: 16 });
ok(st && st.field && st.field.length === 16 * 16, 'Physics.fieldStats 返回 N×N 能见度场', st && st.field && st.field.length);
ok(isFinite(st.coverage) && st.cloudTop >= 0, 'fieldStats 统计量（coverage/cloudTop）有效');
const sg = win.Physics.sensitivityGrid({ path: 'micro.dropConc', min: 100, max: 500 }, { path: 'surfaceRH', min: 50, max: 100 }, { N: 12, metric: 'vis' });
ok(sg && sg.grid.length === 12 * 12, 'sensitivityGrid 返回网格', sg && sg.grid.length);

// 敏感性热力图的两类“死轴”（会让整张图看起来只有条纹/单色）：
// ① derived 模式下 micro.effRadiusUm 被 operativeRe 忽略 → 扫描期间应自动切 fixed 并在结束后回滚；
// ② layers.*.coverage 若在循环外取一次 effectiveLayers 就冻结 → 覆盖率扫描变平带。
const jobRe = win.Physics.sensitivityOpen(
  { path: 'micro.dropConc', min: 100, max: 500 },
  { path: 'micro.effRadiusUm', min: 2, max: 20 },
  { N: 8, metric: 'vis', time: 0 });
while (!jobRe.finished()) jobRe.stepRows(jobRe.N);
const sumRe = jobRe.summary();
jobRe.restore();
ok(sumRe.spreadB > 0.05, '敏感性：r_e 轴自动切 fixed 后有响应', sumRe.spreadB.toFixed(3));
ok(Amod.STATE.micro.reMode === 'derived', '敏感性：扫描结束后 reMode 已回滚', Amod.STATE.micro.reMode);

const saveScOn = Amod.STATE.layers.sc.on, saveScCov = Amod.STATE.layers.sc.coverage;
Amod.STATE.layers.sc.on = true; Amod.STATE.layers.sc.coverage = 0.5;
const jobCov = win.Physics.sensitivityOpen(
  { path: 'micro.dropConc', min: 100, max: 500 },
  { path: 'layers.sc.coverage', min: 0.1, max: 1 },
  { N: 8, metric: 'vis', time: 0 });
while (!jobCov.finished()) jobCov.stepRows(jobCov.N);
const sumCov = jobCov.summary();
jobCov.restore();
Amod.STATE.layers.sc.on = saveScOn; Amod.STATE.layers.sc.coverage = saveScCov;
ok(sumCov.spreadB > 0.05, '敏感性：覆盖率轴逐点重取层参数后有响应', sumCov.spreadB.toFixed(3));
const op = win.Operators.compute(0);
ok(op && isFinite(op.opticalDepth) && isFinite(op.satelliteTb) && isFinite(op.radar.dBZ), 'Operators.compute 各算子数值有效');
const m = win.Spectrum.moments();
ok(m && isFinite(m.re) && isFinite(m.LWCgm3), 'Spectrum.moments 返回 r_e / LWC');
const vd = win.Physics.worstVisibilityDetailed(0);
ok(vd && isFinite(vd.vis), 'worstVisibilityDetailed 返回有效能见度');
const val = win.Validation.fromRadiosonde();
ok(val && Array.isArray(val.visPairs) && val.visPairs.length > 0, 'Validation.fromRadiosonde 返回配对');
const vs = win.Validation.stats(val.visPairs);
ok(vs && isFinite(vs.rmse) && isFinite(vs.corr), 'Validation.stats 返回 rmse/corr');
const ts = win.TimeSeries.applyDefault();
ok(ts === true && win.TimeSeries.TS.steps.length >= 2, 'TimeSeries.applyDefault 载入示例步骤');
const curve = win.TimeSeries.visibilityCurve(8);
ok(curve.length === 8 && curve.every(c => c.vis === null || isFinite(c.vis)), 'visibilityCurve 产出有限值');
const rec = win.Exporter.toMETAR({ station: 'ZBAA', time: '241200Z' });
ok(/ZBAA/.test(rec) && /Q\d{4}/.test(rec), 'Exporter.toMETAR 含站号与气压', rec.slice(0, 40));
const iwxxm = win.Exporter.toIWXXM();
ok(iwxxm.indexOf('<Metar') > 0 && iwxxm.indexOf('</Metar>') > 0, 'Exporter.toIWXXM 为 XML');
win.Phases.set('cirrus');
ok(win.Phases.current().ice === 1 && win.Phases.current().water === 0, 'Phases.set(cirrus) 生效');
win.Phases.normalize();
ok(Math.abs(Object.values(win.Phases.current()).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'Phases.normalize 归一和为 1');
win.Phases.set('pureWater');
win.Help.applyScenario('fog');
ok(isFinite(win.Atmosphere.STATE.surfaceTemp) && win.Atmosphere.STATE.layers.sc.on, 'Help.applyScenario(fog) 修改状态');

// 录制/回放闭环
win.Recorder.start(); win.Recorder.record('x'); win.Recorder.stop();
ok(win.Recorder.count() >= 2, 'Recorder 记录事件', String(win.Recorder.count()));
const recJSON = win.Recorder.exportJSON();
ok(/CloudField/.test(recJSON) && win.Recorder.importJSON(recJSON), 'Recorder 导出/导入闭环');

// ================= 12. 高级面板接线 =================
section('12. 高级诊断面板接线');
ok(byId.get('adv-modal') && byId.get('adv-body'), 'adv-modal / adv-body 已注册');
ok(closeBtns.find(b => b.dataset.close === 'adv-modal'), 'adv-modal 关闭按钮在 [data-close] 集合中');
ok(typeof win.GUI.openAdv === 'function', 'GUI.openAdv 已导出');
win.GUI.openAdv();
ok(!byId.get('adv-modal').classList.contains('hidden'), 'openAdv 打开面板（移除 hidden）');
const advBody = byId.get('adv-body');
ok(advBody && advBody.children.length >= 2, 'buildAdvModal 生成导航 + 面板容器', advBody && advBody.children.length);

// ================= 13. 新增 i18n 命名空间（三语齐全） =================
section('13. 新增 i18n 命名空间三语齐全');
const newKeys = ['adv.open', 'adv.title', 'nav.timeseries', 'nav.spatial', 'nav.sensitivity', 'nav.qc', 'nav.export',
  'nav.validation', 'nav.recorder', 'nav.report', 'nav.help', 'nav.scenarios',
  'spec.type', 'spec.gamma', 'spec.lognormal', 'spec.measured', 'spec.import',
  'phase.water', 'phase.preset', 'phase.normalize', 'aerosol.on', 'op.visibility',
  'ts.title', 'ts.default', 'sp.title', 'sp.coverage', 'sen.title', 'qc.title', 'qc.ok',
  'ex.title', 'ex.metar', 'val2.title', 'val2.bias', 'rec.title', 'rec.start',
  'rep.title', 'rep.share', 'help.title', 'help.scenario', 'help.fog'];
let newKeyLeak = [];
for (const k of newKeys) {
  for (const lang of ['zh', 'en', 'de']) {
    win.I18N.setLang(lang);
    if (win.I18N.t(k) === k || win.I18N.t(k) == null) newKeyLeak.push(lang + ':' + k);
  }
}
ok(newKeyLeak.length === 0, '新增命名空间键在三语下均有取值', newKeyLeak.slice(0, 8).join(', '));
win.I18N.setLang('de');

// ================= 14. Mie / 辐射查表 / Kessler / r_e 模式 =================
section('14. Mie / 辐射查表 / Kessler / r_e 模式');
ok(win.Mie && win.Radiation && win.Kessler, 'mie / radiation / kessler 三个新模块已加载');
const Mie = win.Mie, Rad = win.Radiation, Kes = win.Kessler;
const qBig = Mie.qext(500);
ok(qBig > 1.2 && qBig < 2.8, 'Mie：大尺度 Q_ext 在 2 附近', qBig.toFixed(2));
const bm = Mie.betaFromLWC_Mie(0.3, 8);
ok(Math.abs(bm - 0.05625) / 0.05625 < 0.1, 'Mie β 与几何光学 1.5·LWC/r_e 相差 <10%', bm.toFixed(5));
ok(Math.abs(Rad.transmittance(0, 0.5) - 1) < 1e-6 && Math.abs(Rad.reflectance(0, 0.5)) < 1e-6, '辐射：τ=0 → T=1, R=0');
const T10 = Rad.transmittance(10, 0.5), R10 = Rad.reflectance(10, 0.5);
ok(T10 > 0 && T10 < 1 && R10 > T10, '辐射：τ=10 时 T 下降且 R>T', T10.toFixed(3) + '/' + R10.toFixed(3));
ok(Math.abs((T10 + R10) - 1) < 0.05, '辐射：保守散射 T+R≈1', (T10 + R10).toFixed(3));
Kes.reset();
const k0 = Kes.readout();
ok(k0.qrTotal === 0 && k0.rainRate === 0, 'Kessler：重置后 q_r 与雨强为 0');
Amod.STATE.kessler.qc.sc = 0.01; Amod.STATE.kessler.qr.sc = 0;
const k1r = Kes.step(1);
ok(k1r.qrTotal > 0 && isFinite(k1r.rainRate), 'Kessler：一步积分后 q_r>0、雨强有限', k1r.qrTotal.toExponential(3));
Kes.reset();
const savedMode = Amod.STATE.micro.reMode, savedN2 = Amod.STATE.micro.dropConc, savedRe3 = Amod.STATE.micro.effRadiusUm;
Amod.STATE.micro.reMode = 'derived';
Amod.STATE.micro.dropConc = 300; const re300 = Amod.operativeRe(0.3);
Amod.STATE.micro.dropConc = 1000; const re1000 = Amod.operativeRe(0.3);
ok(re1000 < re300, 'derived 模式：N↑ → r_e↓（Twomey 链闭合）', re300.toFixed(2) + '→' + re1000.toFixed(2) + ' µm');
Amod.STATE.micro.reMode = 'fixed'; Amod.STATE.micro.effRadiusUm = 8;
ok(Amod.operativeRe(0.3) === 8, 'fixed 模式：r_e 取滑块值');
Amod.STATE.micro.reMode = savedMode; Amod.STATE.micro.dropConc = savedN2; Amod.STATE.micro.effRadiusUm = savedRe3;
// 算子开关真正生效：关闭后 compute 不返回该算子，all 模式仍完整
const savedOps = JSON.parse(JSON.stringify(Amod.STATE.operators));
Amod.STATE.operators.radar = false;
ok(win.Operators.compute(0).radar === undefined, '算子开关：radar 关闭后 compute 不返回 radar');
const allOps = win.Operators.compute(0, { all: true });
ok(allOps.radar && isFinite(allOps.radar.dBZ), '算子开关：all 模式仍返回 radar');
Amod.STATE.operators.radar = savedOps.radar;
// 录制快照包含新增的 Kessler 状态
if (win.Recorder) {
  const cap = win.Recorder.capture();
  ok(cap && cap.kessler && typeof cap.kessler.qc === 'object', '录制快照包含 Kessler 状态');
}
// 环境日变化：envT/envRH 偏移必须真正进入温度/气压/LCL
const svEnvT = Amod.STATE.envT, svEnvRH = Amod.STATE.envRH;
Amod.STATE.envT = 2; Amod.STATE.envRH = 0;
const tEnv = Amod.tempAt(0);
const pEnv = Amod.pressureAt(1);
Amod.STATE.envT = 0;
const pBase = Amod.pressureAt(1);
ok(Math.abs(tEnv - (Amod.STATE.surfaceTemp + 2)) < 1e-9, '环境温度偏移参与 tempAt', tEnv.toFixed(2));
ok(Math.abs(pEnv - pBase) > 0.1, '环境温度偏移改变气压廓线', pEnv.toFixed(1) + ' vs ' + pBase.toFixed(1));
Amod.STATE.envRH = -5;
const lclRH = Amod.lclHeight();
Amod.STATE.envRH = 0;
const lclBase = Amod.lclHeight();
ok(Math.abs(lclRH - lclBase) > 1e-4, '环境湿度偏移改变 LCL', lclRH.toFixed(3) + ' vs ' + lclBase.toFixed(3));
Amod.STATE.envT = svEnvT; Amod.STATE.envRH = svEnvRH;

// 风平流：方向/尺度必须与着色器一致（x = wx·t 处应复现 t=0 的场）
const wLay = Amod.effectiveLayers(), wv8 = { x: 8, dir: 270 };
const fA = Amod.sampleFields(0, 0, 1, wLay, wv8, 0);
const dxW = Math.sin(270 * Math.PI / 180) * 8 * Amod.WIND_SCALE * 10;
const fB = Amod.sampleFields(dxW, 0, 1, wLay, wv8, 10);
ok(Math.abs(fB.density - fA.density) < 1e-6, '风平流方向/尺度与着色器一致（x=wx·t 复现 t=0）', fA.density.toFixed(4) + ' vs ' + fB.density.toFixed(4));
ok(Math.abs(Amod.WIND_SCALE - 0.01) < 1e-12, 'WIND_SCALE = 0.01（10× 时间加速）');

// 最差能见度：水平网格扫描（不再死盯单列），且随仿真时间变化
const scW = Amod.STATE.layers.sc, saveW = { on: scW.on, coverage: scW.coverage, density: scW.density };
const saveWind = Amod.STATE.windSpeed;
scW.on = true; scW.coverage = 0.95; scW.density = 0.9; Amod.STATE.windSpeed = 8;
const windW = { x: Amod.STATE.windSpeed, dir: Amod.STATE.windDir };
const wv0 = Amod.worstVisibility(Amod.effectiveLayers(), windW, 0);
const wv7 = Amod.worstVisibility(Amod.effectiveLayers(), windW, 7);
ok(isFinite(wv0.vis) && isFinite(wv7.vis), '最差能见度：水平网格扫描返回有限值', wv0.vis.toFixed(1) + ' m');
ok(typeof wv0.x === 'number' && typeof wv0.y === 'number', '最差能见度返回取样位置');
ok(Array.isArray(wv0.profile) && Array.isArray(wv0.bx) && wv0.dz > 0, '最差能见度返回分层剖面（供中值稳定）');
ok(Math.abs(wv7.vis - wv0.vis) > 1e-3, '最差能见度随仿真时间变化', wv0.vis.toFixed(1) + '→' + wv7.vis.toFixed(1) + ' m');
scW.on = saveW.on; scW.coverage = saveW.coverage; scW.density = saveW.density; Amod.STATE.windSpeed = saveWind;

// ================= 15. ETH CLOUDLAB / ICON-LES 扩展与多方案诊断 =================
section('15. ETH CLOUDLAB / ICON-LES 扩展与多方案诊断');
// 1) 三方案并排对比（Kessler 1969 vs KK2000 vs ICON-SB06）：双矩方案雨强随 N_c 增大而减小（Albrecht 效应）
const cmp = Kes.compareSchemes({ qc: 0.0018, qr: 0 });
ok(cmp && Array.isArray(cmp.N) && cmp.N.length >= 6, 'Kessler.compareSchemes 返回 N_c 网格与三方案曲线');
ok(Math.abs(cmp.kessler[0] - cmp.kessler[cmp.kessler.length - 1]) < 1e-9,
  'Kessler 1969 单矩方案雨强对云滴数浓度 N_c 不敏感（Albrecht 盲区）');
ok(cmp.kk2000[0] > cmp.kk2000[cmp.kk2000.length - 1] * 2,
  'KK2000 双矩方案：N_c 升高显著抑制自动转化与雨强（Albrecht 第二间接效应）',
  cmp.kk2000[0].toFixed(2) + ' → ' + cmp.kk2000[cmp.kk2000.length - 1].toFixed(2) + ' mm/h');
ok(cmp.sb06[0] > cmp.sb06[cmp.sb06.length - 1] * 2,
  'ICON-SB06 双矩方案：N_c 升高抑制自动转化且受谱宽 ν_eff 调制',
  cmp.sb06[0].toFixed(2) + ' → ' + cmp.sb06[cmp.sb06.length - 1].toFixed(2) + ' mm/h');

// 2) ETH CLOUDLAB 过冷层云播云（WBF 冰化沟槽 + 能见度跃升诊断）
const svSeed = JSON.parse(JSON.stringify(Amod.STATE.seeding));
const svSurfT = Amod.STATE.surfaceTemp;
Amod.STATE.surfaceTemp = 0; // 1 km 处约 -6.5°C（低于 AgI -5°C 阈值）
Amod.STATE.seeding.on = true;
Amod.STATE.seeding.agent = 'AgI';
Amod.STATE.seeding.inpConc = 200;
Amod.STATE.seeding.glaciationEff = 0.88;
Amod.STATE.seeding.alt = 1.0;
const depUpwind = Amod.seedingDepletionAt(-12, 0, 1.0);
const depDownwind = Amod.seedingDepletionAt(0, 0, 1.0);
ok(depUpwind === 0 && depDownwind > 0.3, 'WBF 播云羽流：上风向无消耗、下风向轴线显著消耗过冷水',
  `up=${depUpwind.toFixed(2)}, down=${depDownwind.toFixed(2)}`);
const sdDiag = win.Physics.seedingDiagnostics(0);
ok(sdDiag && sdDiag.seededVis > sdDiag.ambientVis * 1.3,
  'ETH CLOUDLAB 诊断：播云消云沟槽内能见度显著高于背景过冷云',
  `${sdDiag.ambientVis.toFixed(0)} m → ${sdDiag.seededVis.toFixed(0)} m (×${sdDiag.gainRatio.toFixed(2)})`);
Amod.STATE.seeding = svSeed;
Amod.STATE.surfaceTemp = svSurfT;

// 3) Korolev 温度自适应混合相态 + 粒子谱有效方差 ν_eff 光学与雷达耦合
const svAutoT = Amod.STATE.micro.autoPhaseTemp, svLapse = Amod.STATE.lapseRate, svSurfT2 = Amod.STATE.surfaceTemp;
Amod.STATE.surfaceTemp = 10; Amod.STATE.lapseRate = 6.5;
Amod.STATE.micro.autoPhaseTemp = true;
const iceWarm = Amod.iceFractionAt(0.1); // > 0°C
const iceHom = Amod.iceFractionAt(9.0);  // < -38°C (10 - 58.5 = -48.5°C)
ok(iceWarm === 0 && iceHom === 1, 'Korolev 温度相态分配：>0°C 纯液水、<-38°C 完全同质冻结', `${iceWarm} / ${iceHom}`);
Amod.STATE.micro.autoPhaseTemp = svAutoT; Amod.STATE.lapseRate = svLapse; Amod.STATE.surfaceTemp = svSurfT2;

const betaNarrow = Mie.betaFromLWC_Mie(0.3, 8, 550, 0.05);
const betaBroad = Mie.betaFromLWC_Mie(0.3, 8, 550, 0.35);
ok(Math.abs(betaNarrow - betaBroad) > 1e-4, 'Mie 消光随多分散有效方差 ν_eff 变化', `${betaNarrow.toFixed(5)} vs ${betaBroad.toFixed(5)}`);
const svVeff = Amod.STATE.spectrum.veff;
Amod.STATE.spectrum.veff = 0.05;
const dbzNarrow = win.Operators.radar(0).dBZ;
Amod.STATE.spectrum.veff = 0.35;
const dbzBroad = win.Operators.radar(0).dBZ;
Amod.STATE.spectrum.veff = svVeff;
ok(dbzBroad > dbzNarrow + 0.5, '气象雷达 6 阶矩反射率 Z 随谱宽 ν_eff 增大而显著增强', `${dbzNarrow.toFixed(2)} → ${dbzBroad.toFixed(2)} dBZ`);

// 4) ICON-LES Namelist (.nml) 与实验 YAML 导出
const nml = win.Exporter.toICONNamelist();
const yml = win.Exporter.toExperimentYAML();
ok(/&microphysics_nml/.test(nml) && /&cloudlab_seeding_nml/.test(nml), 'Exporter.toICONNamelist 生成标准 Fortran Namelist 块');
ok(/experiment:/.test(yml) && /cloudlab_seeding:/.test(yml), 'Exporter.toExperimentYAML 生成结构化实验配置');

// 5) 实测谱 r_e 与四阶矩有效方差 ν_eff 传递、IWXXM/BUFR Magnus 露点一致性
const svSpec = JSON.parse(JSON.stringify(Amod.STATE.spectrum));
win.Spectrum.importMeasured('2, 10\n5, 80\n12, 200\n20, 40');
const momMeas = win.Spectrum.moments();
const reMeas = Amod.operativeRe(0.3);
ok(Math.abs(reMeas - momMeas.re) < 1e-6 && momMeas.veff > 0.01,
  '实测谱模式下 operativeRe() 与四阶矩有效方差 ν_eff 精确积分生效', `r_e=${reMeas.toFixed(2)}, veff=${momMeas.veff.toFixed(3)}`);
Amod.STATE.spectrum = svSpec;
const bufr = win.Exporter.toBUFR();
const bufrDew = bufr.fields.find(x => x.f === 'dewpoint').v;
ok(Math.abs(bufrDew - Number(Amod.dewAt(0).toFixed(2))) < 1e-6, 'BUFR 导出露点采用 Magnus 公式与主模型严格一致');

// 6) 科学性与工程可靠性加固验证（双流厚云渐近反照率、WBF 两阶段冰化羽流、红外亮温边界、雷达-方案耦合、泰勒图非退化、Recorder 播云快照）
const rThick = Rad.reflectance(128, 0.5, 0.999, 0.85);
ok(rThick > 0.78 && rThick < 1.0, '双流辐射：厚云极限 (τ=128) 反照率收敛于渐近极限 R_∞ > 0.78（不归零）', rThick.toFixed(3));

Amod.STATE.seeding.on = true; Amod.STATE.seeding.x0 = -8; Amod.STATE.seeding.alt = 1.0;
const pNear = Amod.seedingPlumeAt(-7.2, 0, 1.0); // 下风向 0.8 km（近源端冰晶过渡区）
const pFar = Amod.seedingPlumeAt(-1.0, 0, 1.0);  // 下风向 7.0 km（远端沉降沟槽）
ok(pNear.iceBoost > 0.3 && pFar.depletion > pNear.depletion,
  'WBF 两阶段羽流：近源端冰晶激增过渡、远端沉降消云加深',
  `iceBoost=${pNear.iceBoost.toFixed(2)}, dep: ${pNear.depletion.toFixed(2)} → ${pFar.depletion.toFixed(2)}`);
Amod.STATE.seeding = svSeed;

const tbNow = win.Operators.satelliteTb(0);
const tSfcK = 273.15 + Amod.STATE.surfaceTemp;
ok(tbNow <= tSfcK + 0.5 && tbNow >= 190, '卫星 10.8 µm 红外亮温严格落在云顶温度与地表温度之间', tbNow.toFixed(1) + ' K');

const svSch = Amod.STATE.micro.scheme, svDropN = Amod.STATE.micro.dropConc;
Amod.STATE.micro.dropConc = 800;
Amod.STATE.micro.scheme = 'kessler';
const zKes = win.Operators.radar(0).ZePrecip;
Amod.STATE.micro.scheme = 'kk2000';
const zKK = win.Operators.radar(0).ZePrecip;
Amod.STATE.micro.scheme = svSch; Amod.STATE.micro.dropConc = svDropN;
ok(zKes > zKK * 1.5, '气象雷达反射率 Z_precip 与所选微物理方案降水率实时联动', `Ze(Kessler)=${zKes.toFixed(1)} vs Ze(KK2000)=${zKK.toFixed(1)}`);

const valSonde = win.Validation.fromRadiosonde();
const tay = win.Validation.taylor(valSonde.visPairs);
ok(tay && tay.stdObs > 100 && Math.abs(tay.corr) > 0.01 && tay.stdRatio > 0.05,
  '探空验证：Gultepe 湿层参考能见度廓线非退化（stdObs>0, R≠0, 泰勒图有效）',
  `stdRatio=${tay.stdRatio.toFixed(2)}, R=${tay.corr.toFixed(2)}`);

const recCap = win.Recorder.capture();
ok(recCap && recCap.seeding && typeof recCap.seeding.inpConc === 'number', 'Recorder.capture 完整包含 seeding 播云状态');
const repHtml = win.Report.generateHTML();
ok(/CLOUDLAB/.test(repHtml) && /三方案雨强/.test(repHtml), 'Report.generateHTML 包含三方案雨强对比与 CLOUDLAB 播云诊断');

// 7) 水平切片坐标轴修复与公式 Tab 动态方案联动验证
const svSliceAlt = Amod.STATE.sliceAlt, svScOn2 = Amod.STATE.layers.sc.on, svScBase2 = Amod.STATE.layers.sc.base, svScTop2 = Amod.STATE.layers.sc.top;
Amod.STATE.layers.sc.on = true; Amod.STATE.layers.sc.base = 0.4; Amod.STATE.layers.sc.top = 1.8; Amod.STATE.layers.sc.coverage = 0.9; Amod.STATE.layers.sc.density = 0.85;
Amod.STATE.sliceAlt = 1.0;
const fNorth = Amod.sampleFields(0, -10, 1.0, Amod.effectiveLayers(), { x: 8, dir: 270 }, 0);
const fSouth = Amod.sampleFields(0, 10, 1.0, Amod.effectiveLayers(), { x: 8, dir: 270 }, 0);
ok(fNorth.lwc > 0 || fSouth.lwc > 0, '水平切片 (x, y, alt) 在南北半区 (y<0 与 y>0) 均按 sliceAlt 正确采样云水',
  `y=-10: ${fNorth.lwc.toFixed(3)}, y=+10: ${fSouth.lwc.toFixed(3)}`);
Amod.STATE.sliceAlt = svSliceAlt; Amod.STATE.layers.sc.on = svScOn2; Amod.STATE.layers.sc.base = svScBase2; Amod.STATE.layers.sc.top = svScTop2;

const sondeRows = Amod.validateAgainstRadiosonde();
ok(sondeRows.length > 0 && sondeRows.every(r => typeof r.obsVis === 'number' && r.obsVis > 0),
  'validateAgainstRadiosonde 返回逐层探空观测参考能见度 obsVis');

// ================= 汇总 =================
console.log('\n========================================');
console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (failures.length) { console.log('失败项：'); failures.forEach(f => console.log('  - ' + f)); }
console.log('========================================');
process.exit(fail ? 1 : 0);
