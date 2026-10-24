/* camera.js — 轨道相机（鼠标/触摸拖拽旋转、滚轮缩放、视角预设）
 * 作者：Heinrich.Z & Tianyuan.J.Z */
(function (global) {
  'use strict';

  function Camera(canvas, target) {
    this.canvas = canvas;
    this.target = target || [0, 4, 0]; // 注视点（km）
    this.yaw = 0.6;      // 方位角（弧度）
    this.pitch = 0.35;   // 俯仰角（弧度）
    this.dist = 38;      // 距离（km）
    this.fov = 50 * Math.PI / 180;
    this.pos = [0, 0, 0];
    this.fwd = [0, 0, 1];
    this.right = [1, 0, 0];
    this.up = [0, 1, 0];
    this._bind();
    this.update();
  }

  Camera.prototype._bind = function () {
    const c = this.canvas;
    let dragging = false, lastX = 0, lastY = 0, btn = 0;

    const down = (x, y, b) => { dragging = true; lastX = x; lastY = y; btn = b; };
    const move = (x, y) => {
      if (!dragging) return;
      const dx = x - lastX, dy = y - lastY;
      lastX = x; lastY = y;
      if (btn === 2 || btn === 1) {
        // 右键/中键：平移注视点（在相机平面内）
        const panX = -dx * this.dist * 0.0015;
        const panY = dy * this.dist * 0.0015;
        this.target[0] += this.right[0] * panX + this.up[0] * panY;
        this.target[1] += this.right[1] * panX + this.up[1] * panY;
        this.target[2] += this.right[2] * panX + this.up[2] * panY;
      } else {
        this.yaw -= dx * 0.005;
        this.pitch += dy * 0.005;
        const lim = Math.PI / 2 - 0.02;
        this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
      }
      this.update();
    };
    const up = () => { dragging = false; };

    c.addEventListener('mousedown', e => down(e.clientX, e.clientY, e.button));
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.dist *= (1 + Math.sign(e.deltaY) * 0.08);
      this.dist = Math.max(6, Math.min(160, this.dist));
      this.update();
    }, { passive: false });

    // 触摸
    let pinchDist = 0;
    c.addEventListener('touchstart', e => {
      if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY, 0);
      else if (e.touches.length === 2) {
        const a = e.touches[0], b = e.touches[1];
        pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      }
    }, { passive: true });
    c.addEventListener('touchmove', e => {
      if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY);
      else if (e.touches.length === 2) {
        const a = e.touches[0], b = e.touches[1];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinchDist) { this.dist *= pinchDist / d; this.dist = Math.max(6, Math.min(160, this.dist)); this.update(); }
        pinchDist = d;
      }
    }, { passive: true });
    c.addEventListener('touchend', up);
  };

  Camera.prototype.update = function () {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this.pos = [
      this.target[0] + this.dist * cp * sy,
      this.target[1] + this.dist * sp,
      this.target[2] + this.dist * cp * cy,
    ];
    const fwd = norm(sub(this.target, this.pos));
    const ref = Math.abs(fwd[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
    const right = norm(cross(fwd, ref));
    const up = cross(right, fwd);
    this.fwd = fwd; this.right = right; this.up = up;
  };

  // 视角预设
  Camera.prototype.setView = function (mode) {
    switch (mode) {
      case 'top':   this.yaw = 0; this.pitch = Math.PI / 2 - 0.03; this.dist = 30; this.target = [0, 6, 0]; break;
      case 'side':  this.yaw = Math.PI / 2; this.pitch = 0.02; this.dist = 42; this.target = [0, 5, 0]; break;
      case 'front': this.yaw = 0; this.pitch = 0.02; this.dist = 42; this.target = [0, 5, 0]; break;
      default:      this.yaw = 0.6; this.pitch = 0.35; this.dist = 38; this.target = [0, 4, 0];
    }
    this.update();
  };

  // 工具
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  global.Camera = Camera;
})(window);
