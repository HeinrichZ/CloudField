/* recorder.js — 场景复现
 * 记录完整参数快照 + 每一步操作，支持精确回放（参数级 + 操作级）。
 * 修复此前"事件数为 0"的问题：在每次参数变化时主动调用 record()。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const P = global.Physics;
  const S = A.STATE;

  const R = {
    recording: false,
    events: [],
    timer: null,
  };

  function capture() {
    const scalars = {};
    const skip = { layers: 1, micro: 1, seeding: 1, spectrum: 1, phases: 1, aerosol: 1, operators: 1, kessler: 1, playing: 1 };
    Object.keys(S).forEach(k => { if (!skip[k] && S[k] !== Object(S[k])) scalars[k] = S[k]; });
    return {
      scalars,
      layers: JSON.parse(JSON.stringify(S.layers)),
      micro: JSON.parse(JSON.stringify(S.micro)),
      seeding: S.seeding ? JSON.parse(JSON.stringify(S.seeding)) : undefined,
      spectrum: JSON.parse(JSON.stringify(S.spectrum)),
      phases: JSON.parse(JSON.stringify(S.phases)),
      aerosol: JSON.parse(JSON.stringify(S.aerosol)),
      operators: JSON.parse(JSON.stringify(S.operators)),
      kessler: JSON.parse(JSON.stringify(S.kessler)),
    };
  }

  function record(label) {
    if (!R.recording) return;
    R.events.push({ t: Date.now(), label: label || 'change', patch: capture() });
  }
  function start() { R.recording = true; R.events = []; record('record-start'); }
  function stop() { if (R.recording) record('record-end'); R.recording = false; }
  function clear() { if (R.timer) { clearInterval(R.timer); R.timer = null; } R.events = []; }
  function count() { return R.events.length; }

  function apply(patch) { P.applyStatePatch(patch); }

  // 回放：按事件顺序逐步应用快照，onStep(i, event) 用于 UI 刷新
  function playback(intervalMs, onStep, onDone) {
    if (!R.events.length) { if (onDone) onDone(); return; }
    let i = 0;
    if (R.timer) clearInterval(R.timer);
    R.timer = setInterval(() => {
      apply(R.events[i].patch);
      if (onStep) onStep(i, R.events[i]);
      i++;
      if (i >= R.events.length) { clearInterval(R.timer); R.timer = null; if (onDone) onDone(); }
    }, intervalMs || 400);
  }

  function exportJSON() { return JSON.stringify({ app: 'CloudField', events: R.events }, null, 2); }
  function importJSON(text) {
    try {
      const o = JSON.parse(text);
      if (o && Array.isArray(o.events)) { R.events = o.events; return true; }
    } catch (e) {}
    return false;
  }

  global.Recorder = { R, record, start, stop, clear, count, apply, playback, exportJSON, importJSON, capture };
})(window);
