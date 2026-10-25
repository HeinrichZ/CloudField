/* server.js — CloudField Bridge Adapter（独立 IPC 进程）
 * 纯 Node 内置模块实现（http + crypto + fs），无需 npm install。
 *
 * 职责：
 *   1) REST API：/api/airports（中国机场表）、/api/schema、/api/metar（服务端解析）、
 *      /api/sessions（实验会话存取）
 *   2) WebSocket：RFC6455（手写最小实现），三类消息 snapshot / delta / telemetry + ping/pong
 *   3) 多节点同步：广播 snapshot/delta/telemetry；转发 metar_submit
 *
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright Tianyuan.J.Z©
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { AIRPORTS } = require('./airports_cn');

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1';
const STATIC_DIR = process.env.STATIC_DIR || '';          // 可选：托管静态资源目录

// 共享场景状态（Bridge 侧的“真相源”，各客户端叠加 delta 到此处）
const scene = {
  airport: 'ZBAA',
  location: { lat: 40.08, lon: 116.58, alt: 35 },
  wind: { direction: 240, speed: 15, speedUnit: 'KT' },
  visibility: { value: 800, unit: 'm', source: 'manual' },
  atmosphere: { temperature: 12, dewpoint: -1, pressure: 1003, humidity: 41, lapseRate: 6.5 },
  clouds: [
    { type: 'cumulonimbus', amount: 'FEW', baseHeight: 365, thickness: 3000, density: 0.72, phase: 'liquid' },
    { type: 'stratus', amount: 'BKN', baseHeight: 610, thickness: 400, density: 0.65, phase: 'liquid' },
  ],
  solar: { elevation: 45, azimuth: 180, isDaytime: true },
};

// ============ 极简 METAR 解析（服务端，覆盖主要组）============
function parseMetar(raw) {
  let s = String(raw || '').trim().replace(/=$/, '').replace(/\s+/g, ' ').toUpperCase();
  const tk = s.split(' ');
  const out = { type: 'METAR', station: tk[1] || null, wind: null, visibility: null, qnh: null, temperature: null, dewpoint: null, clouds: [], weather: [], raw: String(raw).trim() };
  let i = 2;
  // 跳过时刻组 DDHHMMZ 与 AUTO 标识
  if (tk[i] && /^(\d{6})Z$/.test(tk[i])) i++;
  if (tk[i] === 'AUTO') i++;
  const windRe = /^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/;
  if (tk[i] && windRe.test(tk[i])) { const m = tk[i].match(windRe); const u = m[5]; const toMps = v => u === 'KT' ? v * 0.514444 : u === 'KMH' ? v * 0.277778 : v; out.wind = { direction: m[1] === 'VRB' ? 'VRB' : +m[1], speed: +m[2], speedMPS: toMps(+m[2]), unit: u }; i++; }
  if (tk[i] && /^(\d{3})V(\d{3})$/.test(tk[i])) i++; // 风向变化区间 dddVddd
  if (tk[i] === 'CAVOK') { out.visibility = 10000; i++; }
  else if (tk[i] && /^\d{4}$/.test(tk[i])) { out.visibility = tk[i] === '9999' ? 9999 : +tk[i]; i++; }
  // 跳过 RVR 组（位于能见度之后，服务端仅记录，不解析为场景）
  const rvrRe = /^R(\d{2}[LCR]?)\/([PM]?)(\d{4})([UDN]?)$/;
  while (tk[i] && rvrRe.test(tk[i])) i++;
  // 跳过现在天气组
  const wxRe = /^(-|\+|VC)?(TS|SH|FZ|RA|DZ|SN|SG|IC|GR|GS|PL|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)+$/;
  while (tk[i] && wxRe.test(tk[i])) i++;
  const cloudRe = /^(NSC|SKC|CLR|FEW|SCT|BKN|OVC)(\d{3})(CB|TCU|CI|CS|CC|AC|AS|NS|SC|CU|ST)?$/;
  while (tk[i] && cloudRe.test(tk[i])) { const c = tk[i].match(cloudRe); out.clouds.push({ amount: c[1], heightFt: +c[2] * 100, heightM: +c[2] * 100 * 0.3048, type: c[3] || null }); i++; }
  if (tk[i] && /^(M?\d{2})\/(M?\d{2})$/.test(tk[i])) { const p = tk[i].split('/'); const sg = v => v[0] === 'M' ? -parseInt(v.slice(1), 10) : parseInt(v, 10); out.temperature = sg(p[0]); out.dewpoint = sg(p[1]); i++; }
  if (tk[i] && /^Q(\d{4})$/.test(tk[i])) { out.qnh = +tk[i].slice(1); i++; }
  return out;
}
function metarToScene(r) {
  const sc = { wind: {}, atmosphere: {}, visibility: {}, clouds: [] };
  if (r.wind) { sc.wind.direction = r.wind.direction; sc.wind.speed = r.wind.speed; sc.wind.speedUnit = r.wind.unit; }
  if (r.visibility != null) sc.visibility = { value: r.visibility, unit: 'm', source: 'metar' };
  if (r.qnh != null) sc.atmosphere.pressure = r.qnh;
  if (r.temperature != null) sc.atmosphere.temperature = r.temperature;
  if (r.dewpoint != null) { sc.atmosphere.dewpoint = r.dewpoint; const a = 17.27, b = 237.7; sc.atmosphere.humidity = Math.min(100, Math.max(0, Math.exp((a * r.dewpoint) / (b + r.dewpoint) - (a * r.temperature) / (b + r.temperature)) * 100)); }
  r.clouds.forEach(c => { const t = c.type === 'CB' ? 'cumulonimbus' : c.type === 'CI' ? 'cirrus' : c.type === 'AC' || c.type === 'AS' ? 'altocumulus' : c.type === 'CU' ? 'cumulus' : 'stratus'; sc.clouds.push({ type: t, amount: c.amount, baseHeight: c.heightM, thickness: 1000, density: c.amount === 'OVC' ? 0.9 : c.amount === 'BKN' ? 0.65 : c.amount === 'SCT' ? 0.35 : 0.15, phase: t === 'cirrus' ? 'ice' : 'liquid' }); });
  return sc;
}

// ============ 会话存储（内存 + 落盘到 ./sessions，含路径清洗防遍历）============
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB 请求体与 WebSocket 帧上限
try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch (_) {}
const sessions = {};
function safeSessionId(id) {
  const clean = String(id || 'session').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return clean || 'session';
}
fs.readdirSync(SESSIONS_DIR).forEach(f => {
  if (f.endsWith('.json')) {
    try {
      const sid = safeSessionId(f.replace(/\.json$/, ''));
      sessions[sid] = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
    } catch (_) {}
  }
});
function saveSession(s) {
  const sid = safeSessionId(s && s.sessionId);
  s.sessionId = sid;
  sessions[sid] = s;
  const target = path.resolve(SESSIONS_DIR, sid + '.json');
  if (!target.startsWith(path.resolve(SESSIONS_DIR) + path.sep)) {
    throw new Error('illegal session path');
  }
  fs.writeFileSync(target, JSON.stringify(s, null, 2));
}

// ============ WebSocket（手写最小 RFC6455）============
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function wsAccept(key) { return crypto.createHash('sha1').update(key + WS_GUID).digest('base64'); }

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  header[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([header, payload]);
}
function sendText(sock, obj) { try { sock.write(encodeFrame(0x1, Buffer.from(JSON.stringify(obj), 'utf8'))); } catch (_) {} }
function sendPing(sock) { try { sock.write(encodeFrame(0x9, Buffer.alloc(0))); } catch (_) {} }
function sendPong(sock) { try { sock.write(encodeFrame(0xA, Buffer.alloc(0))); } catch (_) {} }

const clients = new Set();

function handleWsMessage(sock, msg) {
  // 广播型：把 delta / snapshot 转发给其他节点；自身已先应用
  if (msg.type === 'ping') { sendPong(sock); return; }
  if (msg.type === 'request_snapshot') { sendText(sock, { type: 'snapshot', schemaVersion: '1.0', timestamp: Date.now(), scene }); return; }
  if (msg.type === 'delta' && msg.changes) {
    applyChanges(msg.changes);
    broadcast({ type: 'delta', schemaVersion: '1.0', timestamp: Date.now(), changes: msg.changes }, sock);
    return;
  }
  if (msg.type === 'metar_submit' && msg.raw) {
    try {
      const r = parseMetar(msg.raw);
      const sc = metarToScene(r);
      if (msg.autoApply) { applyScene(sc); broadcast({ type: 'snapshot', schemaVersion: '1.0', timestamp: Date.now(), scene }, sock); }
      sendText(sock, { type: 'metar_result', id: msg.id || 'x', success: true, station: r.station, parsed: r });
    } catch (e) { sendText(sock, { type: 'metar_result', id: msg.id || 'x', success: false, errors: [e.message] }); }
    return;
  }
  // 其他消息原样广播（如 playback 控制）
  broadcast(msg, sock);
}
function applyChanges(changes) {
  // 支持扁平键与 'micro.x' 等；此处仅演示少量关键字段
  Object.keys(changes).forEach(k => {
    const v = changes[k];
    if (k === 'wind.direction' && scene.wind) scene.wind.direction = v;
    else if (k === 'wind.speed' && scene.wind) scene.wind.speed = v;
    else if (k === 'visibility.value' && scene.visibility) scene.visibility.value = v;
    else if (k === 'atmosphere.temperature' && scene.atmosphere) scene.atmosphere.temperature = v;
    else if (k === 'atmosphere.pressure' && scene.atmosphere) scene.atmosphere.pressure = v;
  });
}
function applyScene(sc) { if (sc.wind) Object.assign(scene.wind, sc.wind); if (sc.atmosphere) Object.assign(scene.atmosphere, sc.atmosphere); if (sc.visibility) Object.assign(sc.visibility, sc.visibility); if (Array.isArray(sc.clouds)) scene.clouds = sc.clouds; }
function broadcast(msg, except) { const buf = encodeFrame(0x1, Buffer.from(JSON.stringify(msg), 'utf8')); for (const c of clients) { if (c !== except && c.writable) { try { c.write(buf); } catch (_) {} } } }

// ============ HTTP / REST ============
function sendJSON(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj, null, 2)); }
function readBody(req, res, onDone) {
  let body = '', bytes = 0, aborted = false;
  req.on('data', chunk => {
    if (aborted) return;
    bytes += chunk.length;
    if (bytes > MAX_PAYLOAD_BYTES) {
      aborted = true;
      sendJSON(res, 413, { ok: false, error: 'Payload Too Large' });
      req.destroy();
      return;
    }
    body += chunk.toString('utf8');
  });
  req.on('end', () => { if (!aborted) onDone(body); });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + HOST + ':' + PORT);
  const p = u.pathname;
  // —— REST ——
  if (p === '/api/airports') return sendJSON(res, 200, { schemaVersion: '1.0', count: AIRPORTS.length, airports: AIRPORTS });
  if (p === '/api/schema') return sendJSON(res, 200, require('./schema'));
  if (p === '/api/metar' && req.method === 'POST') {
    readBody(req, res, body => {
      try { const r = parseMetar(body); sendJSON(res, 200, { success: true, station: r.station, parsed: r, scene: metarToScene(r) }); }
      catch (e) { sendJSON(res, 400, { success: false, error: e.message }); }
    });
    return;
  }
  if (p === '/api/sessions' && req.method === 'POST') {
    readBody(req, res, body => {
      try { const s = JSON.parse(body); saveSession(s); sendJSON(res, 201, { ok: true, sessionId: s.sessionId }); }
      catch (e) { sendJSON(res, 400, { ok: false, error: e.message }); }
    });
    return;
  }
  const sm = p.match(/^\/api\/sessions\/(.+)$/);
  if (sm) {
    const id = safeSessionId(decodeURIComponent(sm[1]));
    return sendJSON(res, sessions[id] ? 200 : 404, sessions[id] || { error: 'not found' });
  }
  if (p === '/api/sessions') return sendJSON(res, 200, { sessions: Object.keys(sessions) });

  // —— 静态托管（可选，托管静态资源目录，严格限制在 STATIC_DIR 根路径内）——
  if (STATIC_DIR) {
    const rootDir = path.resolve(STATIC_DIR);
    const relPath = '.' + (p === '/' ? '/index.html' : p);
    const fp = path.resolve(rootDir, relPath);
    if ((fp === rootDir || fp.startsWith(rootDir + path.sep)) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const ext = path.extname(fp); const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime }); fs.createReadStream(fp).pipe(res); return;
    }
  }
  sendJSON(res, 404, { error: 'not found', hint: 'see /api/airports, /api/schema, /api/metar, /api/sessions' });
});

// 升级为 WebSocket
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n'
  );
  socket.writable = true; clients.add(socket);

  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    if (buf.length + chunk.length > MAX_PAYLOAD_BYTES) { socket.destroy(); clients.delete(socket); return; }
    buf = Buffer.concat([buf, chunk]);
    // 解析一个或多个帧
    while (buf.length >= 2) {
      const b0 = buf[0], b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buf.length < 10) break; const hi = buf.readUInt32BE(2), lo = buf.readUInt32BE(6); len = hi * 0x100000000 + lo; offset = 10; }
      if (len > MAX_PAYLOAD_BYTES) { socket.destroy(); clients.delete(socket); return; }
      let maskKey;
      if (masked) { if (buf.length < offset + 4) break; maskKey = buf.slice(offset, offset + 4); offset += 4; }
      if (buf.length < offset + len) break;
      let payload = buf.slice(offset, offset + len);
      if (masked) { const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i % 4]; payload = out; }
      buf = buf.slice(offset + len);
      if (opcode === 0x8) { socket.end(); clients.delete(socket); return; }
      else if (opcode === 0x9) { sendPong(socket); }
      else if (opcode === 0x1) {
        try { handleWsMessage(socket, JSON.parse(payload.toString('utf8'))); }
        catch (_) { /* 忽略非法 JSON */ }
      }
    }
  });
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
});

// ============ 遥测广播（参考 60Hz；此处 10Hz 以省 CPU，可改）============
setInterval(() => {
  if (clients.size === 0) return;
  const v = scene.visibility ? scene.visibility.value : 0;
  broadcast({ type: 'telemetry', schemaVersion: '1.0', timestamp: Date.now(), data: { currentVisibility: v, fps: 60, qualityLevel: 'high', nodes: clients.size } });
}, 100);

server.listen(PORT, HOST, () => {
  console.log('CloudField Bridge Adapter 已启动');
  console.log('  REST  : http://' + HOST + ':' + PORT + '  ( /api/airports, /api/schema, /api/metar, /api/sessions )');
  console.log('  WS    : ws://' + HOST + ':' + PORT);
  console.log('  机场表: ' + AIRPORTS.length + ' 条（可于 airports_cn.js 补齐至 ~250）');
  if (STATIC_DIR) console.log('  静态托管: ' + STATIC_DIR);
});
