/* timeseries.js — 时变与预报对接（#1）
 * 时间轴状态、循环播放、场景参数随预报时次插值推进；
 * 支持导入时序探空/时序 METAR；提供能见度随时间演变曲线。
 * 时序格式（CSV/空格，每行一个时次）：
 *   t_hours,surfaceTemp,surfaceRH,windSpeed,windDir,convection,
 *   ci.cov,ci.den,cs.cov,cs.den,sc.cov,sc.den,cu.cov,cu.den,cb.cov,cb.den
 *   井号 # 行为注释，空行忽略。首行可选表头（含这些列名）。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const P = global.Physics;
  const S = A.STATE;
  const LAYER_ORDER = A.LAYER_ORDER;

  const TS = {
    steps: [],            // [{t, env:{}, layers:{ci:{coverage,density},...}}]
    t0: 0, t1: 0,
    playing: false, loop: true,
    speed: 1.0,           // 仿真小时 / 真实秒
    cur: 0,
  };

  const COLS = ['surfaceTemp', 'surfaceRH', 'windSpeed', 'windDir', 'convection',
    'ci.cov', 'ci.den', 'cs.cov', 'cs.den', 'sc.cov', 'sc.den', 'cu.cov', 'cu.den', 'cb.cov', 'cb.den'];

  function parse(text) {
    const lines = (text || '').split(/\r?\n/);
    const steps = [];
    let header = false;
    for (let ln of lines) {
      ln = ln.trim();
      if (!ln || ln[0] === '#') continue;
      const v = ln.split(/[\s,;]+/).map(Number);
      // 首行若含非数字（表头），跳过
      if (v.length < COLS.length + 1 || v.slice(0, COLS.length + 1).some(x => !isFinite(x))) {
        if (!header) { header = true; continue; }
        continue;
      }
      const t = v[0];
      const env = {
        surfaceTemp: v[1], surfaceRH: v[2], windSpeed: v[3], windDir: v[4], convection: v[5],
      };
      const layers = {};
      for (let i = 0; i < LAYER_ORDER.length; i++) {
        const k = LAYER_ORDER[i];
        layers[k] = { coverage: clamp01(v[6 + i * 2]), density: clamp01(v[7 + i * 2]) };
      }
      steps.push({ t, env, layers });
    }
    return steps.length >= 2 ? steps : null;
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function setSteps(steps) {
    if (!steps || steps.length < 2) return false;
    TS.steps = steps; TS.t0 = steps[0].t; TS.t1 = steps[steps.length - 1].t;
    TS.cur = TS.t0;
    return true;
  }
  function importTimeSeries(text) {
    const steps = parse(text);
    if (!steps) return { ok: false, msg: '时序至少需要 2 个时次且列数匹配' };
    setSteps(steps);
    return { ok: true, steps: steps.length, t0: TS.t0, t1: TS.t1 };
  }

  function lerp(a, b, f) { return a + (b - a) * f; }
  // 在时刻 t 插值出状态补丁并应用到 STATE
  function sampleAt(t) {
    const st = TS.steps;
    if (!st.length) return null;
    t = Math.max(TS.t0, Math.min(TS.t1, t));
    let i = 0;
    while (i < st.length - 1 && st[i + 1].t < t) i++;
    const a = st[i], b = st[Math.min(i + 1, st.length - 1)];
    const span = (b.t - a.t) || 1;
    const f = (t - a.t) / span;
    const env = {};
    for (const k of ['surfaceTemp', 'surfaceRH', 'windSpeed', 'windDir', 'convection'])
      env[k] = lerp(a.env[k], b.env[k], f);
    const layers = {};
    for (const k of LAYER_ORDER) {
      layers[k] = {
        coverage: lerp(a.layers[k].coverage, b.layers[k].coverage, f),
        density: lerp(a.layers[k].density, b.layers[k].density, f),
      };
    }
    P.applyStatePatch({ env, layers });
    return { t, env, layers };
  }

  // 能见度随时间演变曲线（最坏高度，计算完毕后无损还原调用前的场景状态）
  function visibilityCurve(n) {
    n = n || 64;
    if (!TS.steps.length) return [];
    const snap = A.serialize();
    const out = [];
    try {
      for (let i = 0; i < n; i++) {
        const t = TS.t0 + (TS.t1 - TS.t0) * i / (n - 1);
        sampleAt(t);
        const w = P.worstVisibilityDetailed(t);
        out.push({ t, vis: isFinite(w.vis) ? w.vis : null, alt: w.alt });
      }
    } finally {
      A.deserialize(snap);
    }
    return out;
  }

  // 默认示例：一次日变化循环（晴→午后对流→傍晚层云）
  function defaultSteps() {
    const mk = (t, T, RH, w, wd, conv, covs, dens) => {
      const env = { surfaceTemp: T, surfaceRH: RH, windSpeed: w, windDir: wd, convection: conv };
      const layers = {};
      LAYER_ORDER.forEach((k, i) => { layers[k] = { coverage: covs[i], density: dens[i] }; });
      return { t, env, layers };
    };
    return [
      mk(0, 12, 85, 3, 270, 10, [0.4, 0.3, 0.5, 0.2, 0.0], [0.4, 0.4, 0.5, 0.5, 0.0]),
      mk(6, 10, 92, 2, 260, 5,  [0.5, 0.4, 0.7, 0.2, 0.0], [0.5, 0.5, 0.6, 0.5, 0.0]),
      mk(12, 18, 70, 6, 240, 60, [0.4, 0.4, 0.4, 0.7, 0.3], [0.4, 0.4, 0.5, 0.7, 0.6]),
      mk(18, 16, 78, 5, 250, 35, [0.5, 0.5, 0.6, 0.5, 0.2], [0.5, 0.5, 0.6, 0.6, 0.5]),
      mk(24, 12, 85, 3, 270, 10, [0.4, 0.3, 0.5, 0.2, 0.0], [0.4, 0.4, 0.5, 0.5, 0.0]),
    ];
  }

  global.TimeSeries = {
    TS, COLS, parse, setSteps, importTimeSeries, sampleAt, visibilityCurve,
    defaultSteps, applyDefault() { return setSteps(defaultSteps()); }, lerp,
  };
})(window);
