/* report.js — 协作与分享
 * 一键导出诊断报告（自包含 HTML）、截图标注、分享链接（状态编码进 URL hash）。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const P = global.Physics;
  const O = global.Operators;
  const E = global.Exporter;

  function snapshotDataURL() {
    const c = document.getElementById('gl');
    try { return c ? c.toDataURL('image/png') : null; } catch (e) { return null; }
  }

  function generateHTML() {
    const snap = A.serialize().state;
    const w = P.worstVisibilityDetailed(0);
    const cover = A.totalCloudCover();
    const ops = O.compute(0, { all: true });
    const sdDiag = P.seedingDiagnostics ? P.seedingDiagnostics(0) : null;
    const cmp = (global.Kessler && global.Kessler.compareSchemes) ? global.Kessler.compareSchemes() : null;
    const img = snapshotDataURL();
    const micro = A.microMapping();
    const params = micro.params.map(p => `<tr><td>${p.label}</td><td>${p.value} ${p.unit}</td><td>${p.mapsTo}</td></tr>`).join('');
    return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>CloudField 诊断报告</title>
<style>body{font-family:system-ui,'Microsoft YaHei',sans-serif;margin:24px;color:#222}
h1{font-size:20px}.kv{display:flex;gap:8px;flex-wrap:wrap}.kv div{background:#f3f5f8;padding:6px 10px;border-radius:6px}
table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #ddd;padding:4px 8px;font-size:13px}
img{max-width:100%;border:1px solid #ccc;border-radius:6px}</style></head><body>
<h1>CloudField 体积云微物理诊断报告</h1>
<p>生成时间：${new Date().toLocaleString()} · 当前参数化方案：<b>${micro.scheme}</b></p>
<h3>关键读数</h3>
<div class="kv">
<div>最坏能见度：${isFinite(w.vis) ? (w.vis >= 1000 ? (w.vis / 1000).toFixed(2) + ' km' : w.vis.toFixed(0) + ' m') : '∞'} @ ${w.alt.toFixed(1)} km</div>
<div>总云量：${cover.toFixed(0)} %</div>
<div>光学厚度：${ops.opticalDepth.toFixed(3)}</div>
${ops.albedo != null ? `<div>云反照率：${ops.albedo.toFixed(3)}</div>` : ''}
${ops.satelliteTb != null ? `<div>卫星红外亮温：${ops.satelliteTb.toFixed(1)} K</div>` : ''}
${ops.radar ? `<div>雷达反射率：${ops.radar.dBZ.toFixed(1)} dBZ</div>` : ''}
${cmp && cmp.atCurrentN ? `<div>三方案雨强 (Kessler/KK2000/SB06)：${cmp.atCurrentN.kessler.toFixed(2)} / ${cmp.atCurrentN.kk2000.toFixed(2)} / ${cmp.atCurrentN.sb06.toFixed(2)} mm/h</div>` : ''}
${sdDiag ? `<div>CLOUDLAB 播云沟槽能见度：${Math.round(sdDiag.visAmbientM)} m → ${Math.round(sdDiag.visSeededM)} m (×${sdDiag.gainRatio.toFixed(2)})</div>` : ''}
</div>
${img ? '<h3>三维视口快照</h3><img src="' + img + '" alt="viewport">' : ''}
<h3>微物理参数映射</h3>
<table><thead><tr><th>参数</th><th>值</th><th>映射到</th></tr></thead><tbody>${params}</tbody></table>
<h3>状态快照（JSON）</h3>
<pre style="background:#f7f7f7;padding:10px;overflow:auto;font-size:12px">${JSON.stringify(snap, null, 2)}</pre>
</body></html>`;
  }

  function download(filename) {
    const html = generateHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || ('CloudField_Report_' + Date.now() + '.html');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // —— 分享链接：把状态序列化编码进 URL hash ——
  function makeShareLink() {
    const payload = btoa(encodeURIComponent(JSON.stringify(A.serialize())));
    return location.origin + location.pathname + '#cfg=' + payload;
  }
  function loadFromHash() {
    const h = location.hash || '';
    const m = h.match(/cfg=([^&]+)/);
    if (!m) return false;
    try {
      const obj = JSON.parse(decodeURIComponent(atob(m[1])));
      A.deserialize(obj);
      return true;
    } catch (e) { return false; }
  }

  // —— 截图标注：在视口上方叠加可手绘 canvas ——
  let overlay = null;
  function enableAnnotation() {
    const c = document.getElementById('gl');
    if (!c || overlay) return;
    const o = document.createElement('canvas');
    o.width = c.width; o.height = c.height;
    o.style.position = 'absolute';
    o.style.left = c.offsetLeft + 'px'; o.style.top = c.offsetTop + 'px';
    o.style.pointerEvents = 'auto'; o.style.cursor = 'crosshair';
    o.style.zIndex = 50;
    const ctx = o.getContext('2d');
    let drawing = false, last = null;
    o.addEventListener('pointerdown', e => { drawing = true; last = pos(e, o); });
    o.addEventListener('pointermove', e => {
      if (!drawing) return;
      const p = pos(e, o);
      ctx.strokeStyle = 'rgba(255,80,80,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    });
    o.addEventListener('pointerup', () => { drawing = false; });
    c.parentElement.appendChild(o);
    overlay = o;
  }
  function pos(e, o) { const r = o.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function disableAnnotation() { if (overlay) { overlay.remove(); overlay = null; } }
  function exportAnnotated() {
    const c = document.getElementById('gl');
    if (!c) return null;
    const out = document.createElement('canvas');
    out.width = c.width; out.height = c.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(c, 0, 0);
    if (overlay) ctx.drawImage(overlay, 0, 0);
    return out.toDataURL('image/png');
  }

  global.Report = {
    generateHTML, download, makeShareLink, loadFromHash,
    enableAnnotation, disableAnnotation, exportAnnotated,
  };
})(window);
