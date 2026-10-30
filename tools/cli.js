#!/usr/bin/env node
/* cli.js — CloudField 命令行批量诊断
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 *
 * 在 Node 中以伪 window 加载浏览器模块（atmosphere/physics/.../batch），
 * 支持机场列表 × 时次矩阵无人值守批量诊断，输出 CSV 或 JSON。
 *
 * 用法：
 *   node tools/cli.js --stations stations.json --times 0,6,12,18 --out result.csv
 *   node tools/cli.js --stations stations.json --format json --out result.json
 *   node tools/cli.js --preset cloudlab --format yaml
 *
 * stations.json 示例：
 *   [{"name":"ZSSS","patch":{"env":{"surfaceTemp":15,"surfaceRH":80},"layers":{"sc":{"coverage":0.6,"density":0.6}}}},
 *    {"name":"ZGGG","patch":{"env":{"surfaceTemp":22,"surfaceRH":70}}}]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const MODULES = ['js/atmosphere.js', 'js/mie.js', 'js/radiation.js', 'js/physics.js', 'js/spectrum.js', 'js/phases.js',
  'js/kessler.js', 'js/operators.js', 'js/timeseries.js', 'js/qc.js', 'js/validation.js', 'js/export.js', 'js/batch.js', 'js/help.js'];

// 伪浏览器环境：window 即全局上下文
const sandbox = {};
sandbox.window = sandbox;
sandbox.Math = Math;
sandbox.Date = Date;
sandbox.JSON = JSON;
sandbox.console = console;
sandbox.Float32Array = Float32Array;
sandbox.performance = { now: () => Date.now() };
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
sandbox.fetch = undefined;
vm.createContext(sandbox);

for (const m of MODULES) {
  const code = fs.readFileSync(path.join(ROOT, m), 'utf8');
  vm.runInContext(code, sandbox, { filename: m });
}
const Batch = sandbox.window.Batch;
const A = sandbox.window.Atmosphere;

function parseArgs(argv) {
  const o = { stations: null, times: [0], format: 'csv', out: null, scheme: null, dropConc: null, seedInp: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stations') o.stations = argv[++i];
    else if (a === '--times') o.times = argv[++i].split(',').map(Number);
    else if (a === '--format') o.format = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--steps') o.steps = argv[++i];       // 时序文件（时序 CSV）
    else if (a === '--preset') o.preset = argv[++i];
    else if (a === '--scheme') o.scheme = argv[++i];     // kessler | kk2000 | sb06
    else if (a === '--dropConc') o.dropConc = Number(argv[++i]);
    else if (a === '--seed-inp') o.seedInp = Number(argv[++i]);
  }
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.preset && sandbox.window.Help && typeof sandbox.window.Help.applyScenario === 'function') {
    sandbox.window.Help.applyScenario(o.preset);
  }
  if (o.scheme && A.STATE.micro) A.STATE.micro.scheme = o.scheme;
  if (o.dropConc != null && isFinite(o.dropConc) && A.STATE.micro) A.STATE.micro.dropConc = o.dropConc;
  if (o.seedInp != null && isFinite(o.seedInp) && A.STATE.seeding) {
    A.STATE.seeding.on = o.seedInp > 0;
    A.STATE.seeding.inpConc = o.seedInp;
  }
  const Exporter = sandbox.window.Exporter;
  const singleFormats = {
    nml: () => Exporter.toICONNamelist(),
    yaml: () => Exporter.toExperimentYAML(),
    metar: () => Exporter.toMETAR(),
    iwxxm: () => Exporter.toIWXXM(),
    'profile-csv': () => Exporter.toProfileCSV(0),
    'scheme-csv': () => Exporter.toSchemeCSV(),
    matlab: () => Exporter.toMATLABScript(0),
    openfoam: () => Exporter.toOpenFOAM(0),
    fluent: () => Exporter.toFluentProfile(0),
    vtk: () => Exporter.toVTK3D(),
  };
  if (singleFormats[o.format]) {
    const text = singleFormats[o.format]();
    if (o.out) {
      fs.writeFileSync(o.out, text);
      console.log('已写出 ' + o.format.toUpperCase() + ' -> ' + o.out);
    } else {
      console.log(text);
    }
    return;
  }
  let stations = [{ name: 'default', patch: null }];
  if (o.stations) {
    stations = JSON.parse(fs.readFileSync(o.stations, 'utf8'));
  }
  let times = o.times;
  if (o.steps) {
    const ts = sandbox.window.TimeSeries;
    const res = ts.importTimeSeries(fs.readFileSync(o.steps, 'utf8'));
    if (!res.ok) { console.error('时序解析失败：', res.msg); process.exit(1); }
    times = [];
    for (let t = ts.TS.t0; t <= ts.TS.t1 + 1e-6; t += 1) times.push(t);
  }
  const rows = Batch.run({ stations, times });
  const out = o.format === 'json' ? Batch.toJSON(rows) : Batch.toCSV(rows);
  if (o.out) {
    fs.writeFileSync(o.out, out);
    console.log('已写出 ' + rows.length + ' 行 -> ' + o.out);
  } else {
    console.log(out);
  }
}
main();
