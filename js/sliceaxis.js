/* sliceaxis.js — 剖面高度轴（可拖拽）
 * 把原来右侧那个孤零零的“202 m”读数改成一根能拖的高度轴：
 * 拖动手柄 = 水平切片高度，3D 云场里同步画一条高亮水平线穿过云体（见 clouds.js 的 uSliceAlt）。
 * 轴上另有一个只读标记 = 当前最低能见度所在高度，两者空间关系一眼可见。
 */
(function (global) {
  'use strict';

  const A = global.Atmosphere;

  function init(root, opts) {
    const onChange = (opts && opts.onChange) || function () {};
    root.innerHTML =
      '<div class="sa-title"><span data-sa="title"></span></div>' +
      '<div class="sa-track">' +
        '<div class="sa-grid"></div>' +
        '<div class="sa-mark" id="sa-mark"><span class="sa-mark-tag"></span></div>' +
        '<div class="sa-handle" id="sa-handle"><span class="sa-tag"></span></div>' +
      '</div>';
    const track = root.querySelector('.sa-track');
    const handle = root.querySelector('#sa-handle');
    const tag = handle.querySelector('.sa-tag');
    const mark = root.querySelector('#sa-mark');
    const markTag = mark.querySelector('.sa-mark-tag');
    const grid = root.querySelector('.sa-grid');
    const titleEl = root.querySelector('[data-sa="title"]');

    // 刻度线
    let gridHTML = '';
    for (let z = 0; z <= A.MAX_ALT; z += 1) gridHTML += '<i style="bottom:' + (z / A.MAX_ALT * 100).toFixed(2) + '%"></i>';
    grid.innerHTML = gridHTML;

    const yToAlt = (clientY) => {
      const r = track.getBoundingClientRect();
      const f = 1 - (clientY - r.top) / r.height;
      return Math.max(0, Math.min(A.MAX_ALT, f * A.MAX_ALT));
    };
    const place = () => {
      const S = A.STATE;
      const p = (S.sliceAlt / A.MAX_ALT * 100);
      handle.style.bottom = p.toFixed(2) + '%';
      tag.textContent = global.Units
        ? global.Units.alt(S.sliceAlt, 1) + ' ' + global.Units.U.alt()
        : S.sliceAlt.toFixed(1) + ' km';
      if (titleEl) titleEl.textContent = (global.I18N ? I18N.t('axis.title') : '剖面高度');
      if (global.GUI && global.GUI.syncValues) global.GUI.syncValues();
    };

    let dragging = false;
    const move = (e) => {
      if (!dragging) return;
      A.STATE.sliceAlt = yToAlt(e.clientY);
      place(); onChange();
    };
    const up = () => {
      if (dragging) { dragging = false; handle.classList.remove('dragging'); }
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    const down = (e) => {
      dragging = true;
      handle.classList.add('dragging');
      A.STATE.sliceAlt = yToAlt(e.clientY);
      place(); onChange();
      e.preventDefault();
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };
    const onTouchMove = (e) => { if (dragging && e.touches[0]) { move(e.touches[0]); e.preventDefault(); } };
    const onTouchEnd = () => {
      up();
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
    handle.addEventListener('mousedown', down);
    track.addEventListener('click', (e) => {
      if (e.target === handle) return;
      A.STATE.sliceAlt = yToAlt(e.clientY);
      place(); onChange();
    });
    track.addEventListener('wheel', (e) => {
      e.preventDefault();
      A.STATE.sliceAlt = Math.max(0, Math.min(A.MAX_ALT, A.STATE.sliceAlt - Math.sign(e.deltaY) * 0.1));
      place(); onChange();
    }, { passive: false });
    // 触摸
    handle.addEventListener('touchstart', (e) => {
      if (!e.touches[0]) return;
      dragging = true;
      handle.classList.add('dragging');
      A.STATE.sliceAlt = yToAlt(e.touches[0].clientY);
      place(); onChange();
      e.preventDefault();
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
    }, { passive: false });

    place();

    return {
      // 最低能见度高度标记（只读），alt 单位 km
      setMark(altKm, text) {
        if (altKm == null || !isFinite(altKm) || altKm < 0 || altKm > A.MAX_ALT) { mark.style.display = 'none'; return; }
        mark.style.display = '';
        mark.style.bottom = (altKm / A.MAX_ALT * 100).toFixed(2) + '%';
        markTag.textContent = text || (altKm.toFixed(2) + ' km');
      },
      refresh: place,
    };
  }

  global.SliceAxis = { init };
})(window);
