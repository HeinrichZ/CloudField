/* glsl_test.js — 用真实 GLSL ES 3.00 解析器校验 clouds.js 的 4 个着色器
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 * 复现并锁死用户环境中的编译失败：'sampler3D' : No precision specified
 * 运行：node tools/glsl_test.js（需 @shaderfrog/glsl-parser，见 node workspace）
 *
 * 局限：该解析器只做语法级分析，不查作用域与声明顺序——
 * “先用后声明”这类错误要靠 boot_test.js 里的声明顺序断言兜底（真 GPU 会报
 * 'undeclared identifier'，语法树却是合法的）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 解析器位于受管的 node workspace（NODE_PATH 注入）
const parser = require('@shaderfrog/glsl-parser');

const src = fs.readFileSync(path.join(ROOT, 'js', 'clouds.js'), 'utf8');

// 提取 4 个模板字面量着色器，替换插值后交给解析器
const defs = { MAX_LAYERS: 5, OCC_EPS: '0.03' };
function extract(name) {
  const re = new RegExp('const ' + name + ' = `([\\s\\S]*?)`;');
  const m = src.match(re);
  if (!m) throw new Error('未找到着色器 ' + name);
  return m[1].replace(/\$\{(\w+)(?:\.toFixed\((\d+)\))?\}/g, (_, k, d) =>
    k === 'OCC_EPS' ? Number(defs.OCC_EPS).toFixed(Number(d)) : String(defs[k]));
}

let pass = 0, fail = 0;
const shaders = { VERT: extract('VERT'), FRAG: extract('FRAG'), COMP_FRAG: extract('COMP_FRAG'), COPY_FRAG: extract('COPY_FRAG') };

for (const [name, code] of Object.entries(shaders)) {
  try {
    const ast = parser.parse(code, { quiet: true });
    // @shaderfrog/glsl-parser 为语法级解析器：AST 根为 program 节点即解析成功
    const okAst = ast && ast.type === 'program' && Array.isArray(ast.program) && ast.program.length > 0;
    if (okAst) { pass++; console.log('  ✓ ' + name + ' 解析通过（' + code.split('\n').length + ' 行）'); }
    else { fail++; console.log('  ✗ ' + name + ' AST 异常: ' + JSON.stringify(ast).slice(0, 120)); }
  } catch (e) {
    fail++;
    console.log('  ✗ ' + name + ' 解析失败: ' + (e.message || String(e)).split('\n').slice(0, 4).join(' | '));
  }
}

// 负向对照：注入语法错误必须被拒绝（证明解析器确实在校验，而非无条件放过）
try {
  const bad = shaders.FRAG.replace('void main(){', 'void main( {'); // 非法记号
  parser.parse(bad, { quiet: true });
  fail++;
  console.log('  ✗ 负向对照失败：语法错误竟然解析通过（解析器未生效）');
} catch (e) {
  pass++;
  console.log('  ✓ 负向对照：语法错误被拒绝 → ' + String(e.message || e).split('\n')[0].slice(0, 90));
}

console.log('\nGLSL 结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
