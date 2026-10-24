/* gl-utils.js — 最小 WebGL 工具集（无外部依赖）
 * 作者：Heinrich.Z & Tianyuan.J.Z */
(function (global) {
  'use strict';

  function getContext(canvas, opts) {
    const gl = canvas.getContext('webgl2', Object.assign({
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    }, opts || {}));
    if (!gl) throw new Error('当前环境不支持 WebGL2');
    return gl;
  }

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader 编译失败:\n' + log + '\n--- 源码片段 ---\n' +
        src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
    }
    return sh;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      throw new Error('Program 链接失败:\n' + log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  // 全屏三角形（覆盖整个视口，无需顶点缓冲）
  function createFullscreenVAO(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindVertexArray(null);
    return vao;
  }

  global.GLU = { getContext, compile, createProgram, createFullscreenVAO };
})(window);
