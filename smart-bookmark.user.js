// ==UserScript==
// @name         智能收藏 Smart Bookmark
// @namespace    smart-bookmark
// @version      0.2.2
// @description  星按钮可自由拖动、自动吸附左右边缘、闲置半隐藏；保留智能收藏全部功能
// @match        http://*/*
// @match        https://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      ghtnniublwkejociyedh.supabase.co
// @connect      *
// @require      https://raw.githubusercontent.com/Lcy040109/Lcy040109.github.io/6d6dd8e12931d2355a30be12793e649ebdc1cc23/smart-bookmark.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const POS_KEY = 'sbu_fab_pos_v1';
  const IDLE_MS = 2200;

  function initDockButton() {
    const fab = document.getElementById('sbu-fab');
    if (!fab) {
      setTimeout(initDockButton, 120);
      return;
    }
    if (fab.dataset.smartDockReady === '1') return;
    fab.dataset.smartDockReady = '1';
    fab.classList.add('sbu-dock-managed');

    const originalClick = fab.onclick;
    fab.onclick = null;

    const style = document.createElement('style');
    style.textContent = `
      #sbu-fab.sbu-dock-managed {
        right:auto!important;
        bottom:auto!important;
        touch-action:none!important;
        user-select:none!important;
        -webkit-user-select:none!important;
        cursor:grab!important;
        transition:transform .22s ease,opacity .22s ease,box-shadow .18s ease!important;
        will-change:left,top,transform!important;
      }
      #sbu-fab.sbu-dock-managed.sbu-dragging {
        transition:none!important;
        transform:none!important;
        opacity:1!important;
        cursor:grabbing!important;
      }
      #sbu-fab.sbu-dock-managed.sbu-idle-left {
        transform:translateX(-24px)!important;
        opacity:.68!important;
      }
      #sbu-fab.sbu-dock-managed.sbu-idle-right {
        transform:translateX(24px)!important;
        opacity:.68!important;
      }
      #sbu-fab.sbu-dock-managed:active { opacity:1!important; }
    `;
    document.documentElement.appendChild(style);

    let saved = GM_getValue(POS_KEY, null);
    if (typeof saved === 'string') {
      try { saved = JSON.parse(saved); } catch { saved = null; }
    }

    let side = saved?.side === 'left' ? 'left' : 'right';
    let y = Number(saved?.y);
    if (!Number.isFinite(y)) y = Math.max(12, window.innerHeight - 82);

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    let idleTimer = null;
    let skipClick = false;

    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    function clearIdle() {
      clearTimeout(idleTimer);
      fab.classList.remove('sbu-idle-left', 'sbu-idle-right');
    }

    function scheduleIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (dragging || document.getElementById('sbu-panel')) return;
        fab.classList.remove('sbu-idle-left', 'sbu-idle-right');
        fab.classList.add(side === 'left' ? 'sbu-idle-left' : 'sbu-idle-right');
      }, IDLE_MS);
    }

    function place(save = false) {
      const size = 50;
      const maxY = Math.max(8, window.innerHeight - size - 8);
      y = clamp(y, 8, maxY);
      const x = side === 'left' ? 0 : Math.max(0, window.innerWidth - size);
      fab.style.setProperty('left', `${x}px`, 'important');
      fab.style.setProperty('top', `${y}px`, 'important');
      fab.style.setProperty('right', 'auto', 'important');
      fab.style.setProperty('bottom', 'auto', 'important');
      if (save) GM_setValue(POS_KEY, { side, y });
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      clearIdle();
      dragging = true;
      moved = false;
      fab.classList.add('sbu-dragging');
      startX = e.clientX;
      startY = e.clientY;
      const r = fab.getBoundingClientRect();
      originX = r.left;
      originY = r.top;
      try { fab.setPointerCapture?.(e.pointerId); } catch {}
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      const size = 50;
      const x = clamp(originX + dx, 0, Math.max(0, window.innerWidth - size));
      y = clamp(originY + dy, 8, Math.max(8, window.innerHeight - size - 8));
      fab.style.setProperty('left', `${x}px`, 'important');
      fab.style.setProperty('top', `${y}px`, 'important');
      e.preventDefault();
    }

    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      fab.classList.remove('sbu-dragging');
      const r = fab.getBoundingClientRect();
      side = (r.left + r.width / 2) < window.innerWidth / 2 ? 'left' : 'right';
      y = r.top;
      place(true);
      try { fab.releasePointerCapture?.(e.pointerId); } catch {}
      if (moved) {
        skipClick = true;
        setTimeout(() => { skipClick = false; }, 120);
      }
      scheduleIdle();
    }

    fab.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: false });
    window.addEventListener('pointercancel', onUp, { passive: false });

    fab.addEventListener('click', (e) => {
      if (skipClick) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      clearIdle();
      if (typeof originalClick === 'function') originalClick.call(fab, e);
      scheduleIdle();
    });

    window.addEventListener('resize', () => {
      place(false);
      scheduleIdle();
    });

    const observer = new MutationObserver(() => {
      if (document.getElementById('sbu-panel')) clearIdle();
      else scheduleIdle();
    });
    observer.observe(document.documentElement, { childList: true });

    place(false);
    scheduleIdle();
  }

  initDockButton();
})();
