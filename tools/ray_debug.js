/* ray_debug.js — CPU 移植 FRAG 主着色器，复现/定位视口中的网格状伪影
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 * 用法：node tools/ray_debug.js
 * 输出：tools/ray_occ.png（开启 occ 跳步）/ tools/ray_noocc.png（关闭）
 *       tools/occ_top.png / tools/occ_side.png（occ 体素场俯视/侧视，查空区形状）
 * 相机/单位与 camera.js、clouds.js 完全一致（km）。
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

// ---------- occ 体（跑 worker 源码，与运行时一致） ----------
const src = fs.readFileSync(path.join(ROOT, 'js', 'clouds.js'), 'utf8');
const wm = src.match(/const OCC_WORKER_SRC = `([\s\S]*?)`;/);
let occResult = null;
const selfStub = { postMessage: d => { occResult = d; } };
new Function('self', wm[1])(selfStub);
const OCC_DIM = 16, OCC_DOM = 40, OCC_EPS = 0.03;
const wlayers = A.effectiveLayers().map(L => ({ base: L.base, top: L.top, coverage: L.coverage, density: L.density, scale: L.scale, detail: L.detail, type: L.type }));
selfStub.onmessage({ data: { type: 'compute', layers: wlayers, wx: 0, wz: 0, dim: OCC_DIM, domX: OCC_DOM, maxAlt: A.MAX_ALT, subs: 2 } });
const occ = new Float32Array(occResult.buf);

// ---------- 着色器数学的 JS 移植（与 FRAG 逐行对应） ----------
const MAX_ALT = A.MAX_ALT;
const S = A.STATE;
const layers = A.effectiveLayers();
const dir = (S.windDir + 180) * Math.PI / 180;
const sp = S.windSpeed * (A.WIND_SCALE || 0.01);
const WX = Math.sin(dir) * sp, WZ = Math.cos(dir) * sp;   // 与 render() 一致
const UTIME = 90;                                          // 截图像素时刻的估计值

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
function smoothstep2(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function layerDensity(px, py, pz, L) {
  if (py < L.base || py > L.top) return 0;
  const h = (py - L.base) / Math.max(0.001, L.top - L.base);
  let peak = 0.5, w = 1.0;
  if (L.type < 0.5) { peak = 0.75; w = 0.7; } else if (L.type < 1.5) { peak = 0.5; w = 1.0; }
  else if (L.type < 2.5) { peak = 0.4; w = 1.6; } else if (L.type < 3.5) { peak = 0.32; w = 1.3; }
  else { peak = 0.4; w = 1.1; }
  const d2 = (h - peak) * 2;
  const vfall = Math.exp(-d2 * d2 * w);
  const sc = L.scale, det = L.detail;
  const nx = px - WX * UTIME, ny = py * 0.5, nz = pz - WZ * UTIME;
  const qx = nx * sc + L.type * 13.7 + 3.1, qy = ny * sc, qz = nz * sc + L.type * 7.3 + 5.7;
  let n = fbm(qx, qy, qz);
  n += det * (fbm(qx * 3.1, qy * 3.1, qz * 3.1) - 0.5) * 0.6;
  n = Math.max(0, Math.min(1, n));
  const thresh = 0.76 - L.coverage * 0.55;
  const cov = smoothstep2(thresh - 0.09, thresh + 0.09, n) * (0.65 + 0.35 * n);
  return cov * L.density * vfall;
}
function totalDensity(px, py, pz) {
  let d = 0;
  for (const L of layers) d += layerDensity(px, py, pz, L);
  return d;
}
// occ 膨胀（1 邻域 max 滤波），与 worker 里的修复一致
const occDil = (() => {
  const b = new Float32Array(OCC_DIM ** 3);
  for (let k = 0; k < OCC_DIM; k++) for (let j = 0; j < OCC_DIM; j++) for (let i = 0; i < OCC_DIM; i++) {
    let m = 0;
    for (let dk = -1; dk <= 1; dk++) { const kk = k + dk; if (kk < 0 || kk >= OCC_DIM) continue;
      for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= OCC_DIM) continue;
        for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= OCC_DIM) continue;
          const v = occ[(kk * OCC_DIM + jj) * OCC_DIM + ii]; if (v > m) m = v; } } }
    b[(k * OCC_DIM + j) * OCC_DIM + i] = m;
  }
  return b;
})();
// mode: 'raw' = 修复前（世界坐标 + 硬阈值 + 未膨胀）
//       'fix' = 修复后（噪声空间 + 连续步长 + 已膨胀）
function sampleOcc(px, py, pz, mode) {
  let qx = px, qy = py, qz = pz;
  if (mode === 'fix') { qx = px - WX * UTIME; qy = py; qz = pz - WZ * UTIME; }
  const nx = (qx + OCC_DOM * 0.5) / OCC_DOM, ny = qy / MAX_ALT, nz = (qz + OCC_DOM * 0.5) / OCC_DOM;
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1 || nz < 0 || nz > 1) return 1.0;
  const i = Math.min(OCC_DIM - 1, Math.floor(nx * OCC_DIM));
  const j = Math.min(OCC_DIM - 1, Math.floor(ny * OCC_DIM));
  const k = Math.min(OCC_DIM - 1, Math.floor(nz * OCC_DIM));
  const src = mode === 'fix' ? occDil : occ;
  return src[(k * OCC_DIM + j) * OCC_DIM + i];
}
const se = S.sunElev * Math.PI / 180, sa = S.sunAz * Math.PI / 180;
const SUN = [Math.cos(se) * Math.sin(sa), Math.sin(se), Math.cos(se) * Math.cos(sa)];
function lightTransmittance(px, py, pz) {
  let d = 0; const ls = 0.7;
  for (let i = 0; i < 6; i++) {
    const sx = px + SUN[0] * ls * (i + 0.5), sy = py + SUN[1] * ls * (i + 0.5), sz = pz + SUN[2] * ls * (i + 0.5);
    d += totalDensity(sx, sy, sz) * ls;
  }
  return Math.exp(-d * 1.1);
}
function skyColor(rd) {
  const h = Math.max(0, Math.min(1, rd[1] * 0.5 + 0.5));
  const z = [0.16, 0.33, 0.62], hz = [0.60, 0.72, 0.86];
  const c = [0, 1, 2].map(i => hz[i] + (z[i] - hz[i]) * Math.pow(h, 0.6));
  if (S.showSun) {
    const s = Math.max(rd[0] * SUN[0] + rd[1] * SUN[1] + rd[2] * SUN[2], 0);
    const add = Math.pow(s, 64) * 0.55;
    c[0] += 1.0 * add; c[1] += 0.92 * add; c[2] += 0.7 * add;
  }
  return c;
}
function groundColor(px, pz) {
  let base = [0.09, 0.13, 0.10];
  if (S.showGrid) {
    const gx = Math.abs(fract(px * 0.1) - 0.5), gz = Math.abs(fract(pz * 0.1) - 0.5);
    const m = Math.max(gx, gz);
    const line = smoothstep2(0.46, 0.5, m);
    base = [0, 1, 2].map(i => base[i] + ([0.24, 0.34, 0.44][i] - base[i]) * line * 0.7);
  }
  return base;
}

// ---------- 相机（复刻截图场景：高位俯瞰，相机高度 ≈134 km） ----------
const yaw = 0.6, pitch = 1.13, dist = 143, target = [0, 4, 0], fov = 50 * Math.PI / 180;
const cp = Math.cos(pitch), sp2 = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
const pos = [target[0] + dist * cp * sy, target[1] + dist * sp2, target[2] + dist * cp * cy];
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
const fwd = norm(sub(target, pos));
const ref = Math.abs(fwd[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
const right = norm(cross(fwd, ref));
const up = cross(right, fwd);
console.log('camera pos =', pos.map(v => v.toFixed(2)).join(','));

// ---------- 渲染 ----------
const W = 480, H = 300, STEPS = 100, uOccSkip = OCC_DOM / OCC_DIM, tanFov = Math.tan(fov * 0.5);
function render(mode) {
  const useOcc = mode !== 'none';
  const img = Buffer.alloc(W * H * 3);
  let iters = 0, denseSamples = 0, skippedDense = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = (2 * (x + 0.5) - W) / H, py = (2 * (y + 0.5) - H) / H;
      const rd = norm([fwd[0] + (px * right[0] + py * up[0]) * tanFov, fwd[1] + (px * right[1] + py * up[1]) * tanFov, fwd[2] + (px * right[2] + py * up[2]) * tanFov]);
      let tEnter, tExit;
      if (Math.abs(rd[1]) < 1e-4) { tEnter = 0; tExit = (pos[1] >= 0 && pos[1] <= MAX_ALT) ? 240 : 0; }
      else {
        const t0 = (0 - pos[1]) / rd[1], t1 = (MAX_ALT - pos[1]) / rd[1];
        tEnter = Math.max(0, Math.min(t0, t1)); tExit = Math.max(t0, t1);
      }
      if (tExit < 0) tExit = 0;
      const tGround = (rd[1] < -1e-4) ? (-pos[1] / rd[1]) : -1;
      let farLimit = Math.min(tExit, 240);
      let hitGround = false;
      if (tGround > 0 && tGround < farLimit) { farLimit = tGround; hitGround = true; }
      const stepSize = (farLimit - tEnter) / STEPS;
      let t = tEnter + 0.5 * stepSize;
      let transmittance = 1; const col = [0, 0, 0];
      for (let i = 0; i < 512; i++) {
        if (t > farLimit || transmittance < 0.003) break;
        const P = [pos[0] + rd[0] * t, pos[1] + rd[1] * t, pos[2] + rd[2] * t];
        let step = stepSize;
        if (useOcc) {
          const o = sampleOcc(P[0], P[1], P[2], mode);
          step = mode === 'fix'
            ? stepSize + (uOccSkip - stepSize) * (1 - Math.max(0, Math.min(1, o / OCC_EPS)))
            : (o < OCC_EPS ? uOccSkip : stepSize);
        }
        const d = totalDensity(P[0], P[1], P[2]);
        iters++;
        if (d > 0.01) {
          denseSamples++;
          if (step > stepSize * 1.5) skippedDense++;
          const lt = lightTransmittance(P[0], P[1], P[2]);
          const sunC = [1.0, 0.96, 0.86], ambC = [0.45, 0.52, 0.66];
          const sc2 = [0, 1, 2].map(c => ambC[c] * 0.55 + sunC[c] * lt);
          const darkBase = 1 - smoothstep2(0, 2, P[1]);
          const mixv = 0.55 + (1 - 0.55) * lt;
          const sc3 = sc2.map((v, c) => v * mixv * (1 - darkBase) + v * 0.7 * darkBase);
          const a = 1 - Math.exp(-d * step * 1.6);
          for (let c = 0; c < 3; c++) col[c] += transmittance * a * sc3[c];
          transmittance *= (1 - a);
        }
        t += step;
      }
      const bg = hitGround ? groundColor(pos[0] + rd[0] * tGround, pos[2] + rd[2] * tGround) : skyColor(rd);
      const idx = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        const v = Math.pow(Math.max(0, Math.min(1, col[c] + transmittance * bg[c])), 0.9);
        img[idx + c] = Math.round(255 * v);
      }
    }
  }
  render.stats[mode] = { avgIter: iters / (W * H), dense: denseSamples / (W * H), skipDense: skippedDense / (W * H) };
  return img;
}
render.stats = {};
function writePNG(file, img, w, h) {
  const zlib = require('zlib');
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; img.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const idat = zlib.deflateSync(raw);
  const chunks = [];
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc ^ (crc >>> 8)) & 0xffffffff;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
console.log('rendering...');
const baseImg = render('none');                   // 基准：不做空区间跳过
writePNG(path.join(ROOT, 'tools', 'ray_noocc.png'), baseImg, W, H);
const before = render('raw');                     // 修复前
writePNG(path.join(ROOT, 'tools', 'ray_occ.png'), before, W, H);
const after = render('fix');                      // 修复后
writePNG(path.join(ROOT, 'tools', 'ray_occ_fix.png'), after, W, H);

// 量化：与基准图的逐像素偏差（跳步本身不该改变画面）
function diff(a, b) {
  let sum = 0, max = 0, n = 0, bad = 0;
  const bx = [1e9, -1], by = [1e9, -1];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 3;
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a[idx + c] - b[idx + c]));
    sum += d; if (d > max) max = d; n++;
    if (d > 8) { bad++; bx[0] = Math.min(bx[0], x); bx[1] = Math.max(bx[1], x); by[0] = Math.min(by[0], y); by[1] = Math.max(by[1], y); }
  }
  return { mean: sum / n, max, bad, pct: 100 * bad / n, box: bad ? `x[${bx[0]}..${bx[1]}] y[${by[0]}..${by[1]}]` : '—' };
}
const db = diff(baseImg, before), da = diff(baseImg, after);
console.log(`\n与"不跳步"基准的偏差（0–255）`);
console.log(`  修复前：平均 ${db.mean.toFixed(2)}  最大 ${db.max}  明显偏差像素 ${db.pct.toFixed(1)}%  包围盒 ${db.box}`);
console.log(`  修复后：平均 ${da.mean.toFixed(2)}  最大 ${da.max}  明显偏差像素 ${da.pct.toFixed(1)}%  包围盒 ${da.box}`);
for (const m of ['none', 'raw', 'fix']) {
  const s = render.stats[m];
  console.log(`  [${m}] 平均步进 ${s.avgIter.toFixed(1)} 次/像素，命中云样本 ${s.dense.toFixed(1)}，其中被粗步跳过的 ${s.skipDense.toFixed(2)}`);
}

// ---------- occ 体素场可视化（俯视 j=中段 / 侧视） ----------
function occTop() {
  const w = OCC_DIM, h = OCC_DIM, img = Buffer.alloc(w * h * 3);
  const j = 6; // y ≈ 5.6 km 层
  for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) {
    const v = occ[(k * OCC_DIM + j) * OCC_DIM + i];
    const idx = (k * w + i) * 3;
    const g = Math.round(255 * Math.min(1, v * 4));
    img[idx] = 255 - g; img[idx + 1] = 255 - g; img[idx + 2] = 255 - g;
  }
  writePNG(path.join(ROOT, 'tools', 'occ_top.png'), img, w, h);
}
function occSide() {
  const w = OCC_DIM, h = OCC_DIM, img = Buffer.alloc(w * h * 3);
  const i = 8; // x ≈ 0 km 剖面
  for (let k = 0; k < h; k++) for (let j = 0; j < OCC_DIM; j++) {
    const v = occ[(k * OCC_DIM + j) * OCC_DIM + i];
    const idx = (j * w + k) * 3;
    const g = Math.round(255 * Math.min(1, v * 4));
    img[idx] = 255 - g; img[idx + 1] = 255 - g; img[idx + 2] = 255 - g;
  }
  writePNG(path.join(ROOT, 'tools', 'occ_side.png'), img, w, h);
}
occTop(); occSide();
console.log('done');
