/* browse.js — browse mode: after the song the book can be opened again and flipped freely (no music, no lyrics).
   API: Book.browse.enter(), Book.browse.exit(). Uses Book.pages (pages.js) and Book.engine (book.js). */
(function () {
  'use strict';
  var B = window.Book = window.Book || {};
  var C = B.CONFIG || {};
  var active = false, built = null, layout = 'double', busy = false, ui = null, btnPrev, btnNext, btnReplay, slotBtn = null;
  var mt = { on: false };
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function E() { return B.engine || {}; }
  function ms() { return reduced ? 250 : ((C.book && C.book.browseFlipMs) || 700); }
  function noop() {}
  function stopAll(node) {
    ['mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup'].forEach(function (t) {
      node.addEventListener(t, function (e) { e.stopPropagation(); });
    });
  }
  function count() { return built ? built.els.length : 0; }
  function cur() { try { return E().current ? E().current() : 0; } catch (e) { return 0; } }

  /* ---------- UI (arrows + fallback replay button) ---------- */
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.5C11 8 9 10.5 8.5 12c.5 1.5 2.5 4 6.5 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function mkBtn(cls, label, html) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.setAttribute('aria-label', label); b.innerHTML = html || '';
    stopAll(b);
    return b;
  }
  function buildUI() {
    ui = document.getElementById('browse-ui');
    if (!ui) { ui = document.createElement('div'); ui.id = 'browse-ui'; (document.getElementById('app') || document.body).appendChild(ui); }
    ui.innerHTML = '';
    btnPrev = mkBtn('br-arrow br-prev', 'previous page', ARROW);
    btnNext = mkBtn('br-arrow br-next', 'next page', ARROW);
    btnPrev.addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
    btnNext.addEventListener('click', function (e) { e.stopPropagation(); step(1); });
    btnReplay = mkBtn('br-replay br-float', 'play our song again', '<span>play our song again</span>');
    btnReplay.addEventListener('click', replay);
    ui.appendChild(btnPrev); ui.appendChild(btnNext); ui.appendChild(btnReplay);
    ui.classList.add('on');
  }
  function replay(e) { if (e && e.stopPropagation) e.stopPropagation(); B.emit('replaysong'); }
  function backSlot() {
    var slot = null;
    try { slot = E().backCoverSlot ? E().backCoverSlot() : null; } catch (e) { slot = null; }
    if (slot && slot.jquery) slot = slot[0];
    if (slot && slot.nodeType === 1) {
      if (!slotBtn || slotBtn.parentNode !== slot) {
        slotBtn = mkBtn('br-replay br-slot', 'play our song again', '<span>play our song again</span>');
        slotBtn.addEventListener('click', replay);
        slot.appendChild(slotBtn);
      }
      if (ui) ui.classList.add('has-slot');
    } else if (ui) {
      ui.classList.remove('has-slot');
    }
  }

  /* ---------- navigation ---------- */
  function step(dir) {
    if (!active || busy || !E().flipTo) return;
    var c = cur(), n = count(), st = layout === 'double' ? 2 : 1, t;
    if (dir > 0) t = c < 0 ? 0 : c + st; else t = c - st;
    if (t < 0 || t > n) return;
    busy = true;
    var p;
    try { p = E().flipTo(t, { ms: ms() }); } catch (e) { p = null; }
    Promise.resolve(p).catch(noop).then(function () { busy = false; refresh(); });
    setTimeout(function () { busy = false; }, ms() + 900);   // safety if the engine never resolves
  }
  function onKey(e) {
    if (!active || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) step(e.key === 'ArrowRight' ? 1 : -1);
    }
  }

  /* ---------- what is visible: show-animations, montage video, finale counter ---------- */
  function visibleUnits() {
    if (!built) return [];
    var c = cur(), n = count();
    if (c < 0 || c >= n) return [];
    return B.pages.visibleUnits(built, c, layout);
  }
  function montageSet(on) {
    var m = built && built.refs.montage; if (!m) return;
    var v = m.video;
    if (on && !mt.on) {
      mt.on = true; m.frame.classList.remove('faded');
      try { v.currentTime = 0; } catch (e) {}
      var p = v.play(); if (p && p.catch) p.catch(noop);
    } else if (!on && mt.on) {
      mt.on = false;
      try { v.pause(); v.currentTime = 0; } catch (e) {}
      m.frame.classList.remove('faded');
    }
  }
  function montageReplay() {
    var m = built && built.refs.montage; if (!m) return;
    m.frame.classList.remove('faded');
    try { m.video.currentTime = 0; } catch (e) {}
    var p = m.video.play(); if (p && p.catch) p.catch(noop);
  }
  function wire() {   // per-build listeners
    var m = built.refs.montage;
    if (m) {
      m.video.addEventListener('ended', function () { m.frame.classList.add('faded'); });
      stopAll(m.hit);
      m.hit.addEventListener('click', function (e) { e.stopPropagation(); montageReplay(); });
    }
  }
  function refresh() {
    if (!active || !built) return;
    var c = cur(), n = count();
    var vis = visibleUnits();
    built.units.forEach(function (u) { if (vis.indexOf(u) >= 0) B.pages.showUnit(u, true); });
    montageSet(vis.some(function (u) { return u.kind === 'montage'; }));
    var f = built.refs.finale;
    if (f && vis.some(function (u) { return u.kind === 'finale'; }) && !f.counted && !f._raf) B.pages.startDays(f, { animate: true });
    if (ui) {
      ui.classList.toggle('at-start', c <= 0);
      ui.classList.toggle('at-end', c >= n);
      ui.classList.toggle('on-back', c >= n);
      if (btnPrev) btnPrev.disabled = c <= 0;
      if (btnNext) btnNext.disabled = c >= n;
    }
    backSlot();
  }

  /* ---------- enter / exit ---------- */
  function teardownBuilt() {
    if (!built) return;
    built.units.forEach(function (u) { if (u.mo) u.mo.disconnect(); });
    var m = built.refs.montage; if (m) { try { m.video.pause(); } catch (e) {} }
    var f = built.refs.finale; if (f && f._raf) cancelAnimationFrame(f._raf);
    built = null;
  }
  function mount(startUnitIdx) {
    layout = (B.layout && B.layout()) || 'double';
    teardownBuilt();
    built = B.pages.build({ layout: layout, mode: 'browse' });
    wire();
    mt.on = false; slotBtn = null;
    var start = (startUnitIdx != null && built.units[startUnitIdx]) ? built.units[startUnitIdx].idx[0] : -1;
    E().mount(built.els, { startPage: start });   // -1 = closed cover (the orchestrator opens it)
  }
  function enter() {
    if (active) return;
    active = true; busy = false; mt.on = false;
    buildUI();
    mount(null);
    try { if (E().setManual) E().setManual(true); if (E().flipMs) E().flipMs(ms()); } catch (e) {}
    refresh();   // the orchestrator calls engine.open() itself after enter(); 'opened'/'flip' events then refresh
    B.pages.ready.then(function () { if (active) refresh(); });
  }
  function exit() {
    if (!active) return;
    montageSet(false);
    active = false;
    teardownBuilt();
    if (ui) { ui.classList.remove('on', 'on-back', 'has-slot'); ui.innerHTML = ''; }
    slotBtn = null;
  }

  /* Single (portrait) layout: StPageFlip only starts forward drags from outside the page, so taps/swipes are handled here.
     The library's own mouse/touch listeners are cut off (capture phase on #book-wrap) while the single layout is active. */
  var gs = null;
  function singleOn() { return active && layout === 'single' && E().isManual && E().isManual(); }
  (function () {
    var wrap = document.getElementById('book-wrap');
    if (!wrap) return;
    ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (t) {
      wrap.addEventListener(t, function (e) {
        if (!singleOn()) return;
        if (e.target.closest && e.target.closest('button, a, input, .back-cover-slot')) return;
        e.stopPropagation();
      }, true);
    });
    wrap.addEventListener('pointerdown', function (e) {
      if (!singleOn() || (e.pointerType === 'mouse' && e.button !== 0)) { gs = null; return; }
      if (e.target.closest && e.target.closest('button, a, input, .mt-hit, .back-cover-slot')) { gs = null; return; }
      gs = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    });
    wrap.addEventListener('pointercancel', function () { gs = null; });
    wrap.addEventListener('pointerup', function (e) {
      var g = gs; gs = null;
      if (!g || g.id !== e.pointerId || !singleOn()) return;
      var dx = e.clientX - g.x, dy = e.clientY - g.y, adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx > 40 && adx > ady * 1.2) step(dx < 0 ? 1 : -1);
      else if (adx < 12 && ady < 12 && Date.now() - g.t < 500) {
        var r = wrap.getBoundingClientRect();
        step((e.clientX - r.left) < r.width * 0.3 ? -1 : 1);
      }
    });
  })();

  B.on('flip', function () { if (active) refresh(); });
  B.on('opened', function () { if (active) refresh(); });
  B.on('resize', function () { if (active) refresh(); });
  B.on('layout', function () {
    if (!active) return;
    var c = cur(), uIdx = 0;
    if (built) {
      var n = count(), cc = Math.min(Math.max(c, 0), Math.max(n - 1, 0));
      built.units.forEach(function (u, i) { if (u.idx.indexOf(cc) >= 0) uIdx = i; });
    }
    mount(uIdx);
    try { if (E().setManual) E().setManual(true); } catch (e) {}
    refresh();
  });
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', function () {
    if (!active || !built || !built.refs.montage) return;
    var m = built.refs.montage, v = m.video;
    if (document.hidden) { try { v.pause(); } catch (e) {} }
    else if (mt.on && !m.frame.classList.contains('faded')) { var p = v.play(); if (p && p.catch) p.catch(noop); }
  });

  B.browse = { enter: enter, exit: exit, next: function () { step(1); }, prev: function () { step(-1); }, get active() { return active; } };
})();
