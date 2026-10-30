/* occ_check.js — 定量核对 occupancy 体素与运行时密度场是否一致
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 * 判据：worker 把某体素判为“空”(occ < OCC_EPS) 后，着色器会以 2.5 km 粗步跳过它。
 *       若该体素内真实密度（含风的时间偏置、当前生命期）仍显著 > 0，则跳过会抽掉云体，
 *       在画面上留下体素对齐的半透明矩形窗 + 2.5 km 采样网格。
 * 用法：node tools/occ_check.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.window = { addEventListener() {} };
global.document = { documentElement: { lang: '' }, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ getContext: () => null }) };
for (const m of ['i18n.js', 'gl-utils.js', 'camera.js', 'atmosphere.js', 'clouds.js']) {
  require(path.join(ROOT, 'js', m));
  for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];
}
const A = global.Atmosphere;
const S = A.STATE;

const src = fs.readFileSync(path.join(ROOT, 'js', 'clouds.js'), 'utf8');
const wm = src.match(/const OCC_WORKER_SRC = `([\s\S]*?)`;/);
let occResult = null;
const selfStub = { postMessage: d => { occResult = d; } };
new Function('self', wm[1])(selfStub);
const DIM = 16, DOM = 40, EPS = 0.03, MAX_ALT = A.MAX_ALT;
const wlayers = A.effectiveLayers().map(L => ({ base: L.base, top: L.top, coverage: L.coverage, density: L.density, scale: L.scale, detail: L.detail, type: L.type }));
selfStub.onmessage({ data: { type: 'compute', layers: wlayers, wx: 0, wz: 0, dim: DIM, domX: DOM, maxAlt: MAX_ALT, subs: 2 } });
const occ = new Float32Array(occResult.buf);

// ---- 着色器侧密度（含风的时间偏置与当前生命期）----
const dir = (S.windDir + 180) * Math.PI / 180;
const sp = S.windSpeed * (A.WIND_SCALE || 0.01);
const WX = Math.sin(dir) * sp, WZ = Math.cos(dir) * sp;
function fract(x) { return x - Math.floor(x); }
function hash3(px, py, pz) {
  px = fract(px * 0.3183099 + 0.1); py = fract(py * 0.3183099 + 0.1); pz = fract(pz * 0.3183099 + 0.1);
  px *= 17; py *= 17; pz *= 17;
  return fract(px * py * pz * (px + py + pz));
}
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const c000 = hash3(ix, iy, iz), c100 = hash3(ix + 1, iy, iz), c010 = hash3(ix, iy + 1, iz), c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1), c101 = hash3(ix + 1, iy, iz + 1), c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);
  return ((c000 * (1 - fx) + c100 * fx) * (1 - fy) + (c010 * (1 - fx) + c110 * fx) * fy) * (1 - fz)
       + ((c001 * (1 - fx) + c101 * fx) * (1 - fy) + (c011 * (1 - fx) + c111 * fx) * fy) * fz;
}
function fbm(x, y, z) {
  let a = 0.5, s = 0;
  for (let i = 0; i < 5; i++) { s += a * vnoise(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s;
}
function ss(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function densityAt(px, py, pz, t, layers) {
  let d = 0;
  for (const L of layers) {
    if (py < L.base || py > L.top) continue;
    const h = (py - L.base) / Math.max(0.001, L.top - L.base);
    let peak = 0.5, w = 1.0;
    if (L.type < 0.5) { peak = 0.75; w = 0.7; } else if (L.type < 1.5) { peak = 0.5; w = 1.0; }
    else if (L.type < 2.5) { peak = 0.4; w = 1.6; } else if (L.type < 3.5) { peak = 0.32; w = 1.3; }
    else { peak = 0.4; w = 1.1; }
    const d2 = (h - peak) * 2;
    const vfall = Math.exp(-d2 * d2 * w);
    const sc = L.scale, det = L.detail;
    const qx = (px - WX * t) * sc + L.type * 13.7 + 3.1, qy = (py * 0.5) * sc, qz = (pz - WZ * t) * sc + L.type * 7.3 + 5.7;
    let n = fbm(qx, qy, qz);
    n += det * (fbm(qx * 3.1, qy * 3.1, qz * 3.1) - 0.5) * 0.6;
    n = Math.max(0, Math.min(1, n));
    const thresh = 0.76 - L.coverage * 0.55;
    d += ss(thresh - 0.09, thresh + 0.09, n) * (0.65 + 0.35 * n) * L.density * vfall;
  }
  return d;
}

function report(label, t, life) {
  const savedLife = S.lifePhase;
  S.autoLife = false; S.lifeManual = life;
  const layers = A.effectiveLayers();
  S.autoLife = true; S.lifePhase = savedLife;

  let empty = 0, falseEmpty = 0, worst = 0;
  const bx = [99, -99], by = [99, -99], bz = [99, -99];
  for (let k = 0; k < DIM; k++) for (let j = 0; j < DIM; j++) for (let i = 0; i < DIM; i++) {
    const v = occ[(k * DIM + j) * DIM + i];
    if (v >= EPS) continue;
    empty++;
    // 体素内 4×4×4 取真实密度最大值
    let mx = 0;
    for (let c = 0; c < 4; c++) for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
      const px = ((i + (a + 0.5) / 4) / DIM) * DOM - DOM / 2;
      const py = ((j + (b + 0.5) / 4) / DIM) * MAX_ALT;
      const pz = ((k + (c + 0.5) / 4) / DIM) * DOM - DOM / 2;
      mx = Math.max(mx, densityAt(px, py, pz, t, layers));
    }
    if (mx > worst) worst = mx;
    if (mx > 0.05) {
      falseEmpty++;
      bx[0] = Math.min(bx[0], i); bx[1] = Math.max(bx[1], i);
      by[0] = Math.min(by[0], j); by[1] = Math.max(by[1], j);
      bz[0] = Math.min(bz[0], k); bz[1] = Math.max(bz[1], k);
    }
  }
  const km = (idx) => (idx * DOM / DIM - DOM / 2);
  const alt = (jdx) => (jdx * MAX_ALT / DIM);
  console.log(`\n=== ${label} (t=${t}s, life=${life}) ===`);
  console.log(`空体素 ${empty} / ${DIM ** 3}，其中"判空却有云"(真实密度>0.05) ${falseEmpty} 个 (${(100 * falseEmpty / Math.max(1, empty)).toFixed(1)}%)`);
  console.log(`被误判体素内最大真实密度 ${worst.toFixed(3)}`);
  if (falseEmpty) {
    console.log(`误判区域包围盒 x[${km(bx[0]).toFixed(1)}..${km(bx[1] + 1).toFixed(1)}] km, ` +
      `y[${alt(by[0]).toFixed(1)}..${alt(by[1] + 1).toFixed(1)}] km, z[${km(bz[0]).toFixed(1)}..${km(bz[1] + 1).toFixed(1)}] km`);
  }
}

report('刚请求 occ 的时刻', 0, 1.0);
report('运行一段时间后（风偏置累积）', 90, 1.0);
report('运行一段时间后 + 生命期推进', 90, 0.2);

// ---- 修复方案验证：加密子采样 subs=3、再对体素做 1 邻域膨胀（max 滤波）----
function computeOcc(subs) {
  let r = null;
  const stub = { postMessage: d => { r = d; } };
  new Function('self', wm[1])(stub);
  stub.onmessage({ data: { type: 'compute', layers: wlayers, wx: 0, wz: 0, dim: DIM, domX: DOM, maxAlt: MAX_ALT, subs } });
  return new Float32Array(r.buf);
}
function dilate(a) {
  const b = new Float32Array(a.length);
  for (let k = 0; k < DIM; k++) for (let j = 0; j < DIM; j++) for (let i = 0; i < DIM; i++) {
    let m = 0;
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const k2 = k + dk, j2 = j + dj, i2 = i + di;
      if (k2 < 0 || k2 >= DIM || j2 < 0 || j2 >= DIM || i2 < 0 || i2 >= DIM) continue;
      const v = a[(k2 * DIM + j2) * DIM + i2];
      if (v > m) m = v;
    }
    b[(k * DIM + j) * DIM + i] = m;
  }
  return b;
}
function falseEmptyCount(field, t, life) {
  const savedLife = S.lifePhase;
  S.autoLife = false; S.lifeManual = life;
  const layers = A.effectiveLayers();
  S.autoLife = true; S.lifePhase = savedLife;
  let empty = 0, bad = 0, worst = 0;
  for (let k = 0; k < DIM; k++) for (let j = 0; j < DIM; j++) for (let i = 0; i < DIM; i++) {
    if (field[(k * DIM + j) * DIM + i] >= EPS) continue;
    empty++;
    let mx = 0;
    for (let c = 0; c < 4; c++) for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
      const px = ((i + (a + 0.5) / 4) / DIM) * DOM - DOM / 2;
      const py = ((j + (b + 0.5) / 4) / DIM) * MAX_ALT;
      const pz = ((k + (c + 0.5) / 4) / DIM) * DOM - DOM / 2;
      mx = Math.max(mx, densityAt(px, py, pz, t, layers));
    }
    if (mx > worst) worst = mx;
    if (mx > 0.05) bad++;
  }
  return { empty, bad, worst, pct: 100 * bad / Math.max(1, empty) };
}
for (const subs of [2, 3, 4]) {
  const t0 = Date.now();
  const raw = computeOcc(subs);
  const dil = dilate(raw);
  const ms = Date.now() - t0;
  const a = falseEmptyCount(raw, 0, 1.0), b = falseEmptyCount(dil, 0, 1.0), c = falseEmptyCount(dil, 90, 1.0);
  console.log(`\n=== 修复验证 subs=${subs} (计算 ${ms}ms) ===`);
  console.log(`仅加密采样：空体素 ${a.empty}，误判 ${a.bad} (${a.pct.toFixed(1)}%)，最大真实密度 ${a.worst.toFixed(3)}`);
  console.log(`+膨胀：    空体素 ${b.empty}，误判 ${b.bad} (${b.pct.toFixed(1)}%)，最大真实密度 ${b.worst.toFixed(3)}  [t=0]`);
  console.log(`+膨胀：    空体素 ${c.empty}，误判 ${c.bad} (${c.pct.toFixed(1)}%)，最大真实密度 ${c.worst.toFixed(3)}  [t=90]`);
}
