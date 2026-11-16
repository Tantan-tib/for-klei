/* letter.js — the letter under the lyrics. It types itself out (typewriter), waits, then folds into an envelope and flies away,
   after which the lyrics area grows to fill the whole center column. Everything is a pure function of f.t (seek/replay safe).
   Lives outside #stage so the drop shake never moves it. */
(function () {
  'use strict';
  window.Edit = window.Edit || { modules: {} };
  Edit.modules = Edit.modules || {};

  var DEFAULTS = {
    src: 'letter/letter.txt',
    showAt: 9.9,          // letter fades/unfolds in (s)
    typeStart: 12,        // typing begins (s)
    charsPerSec: 35,      // typing speed
    commaPause: 0.25,     // extra pause after , ; :
    periodPause: 0.65,    // extra pause after . ! ?
    paragraphPause: 0.95, // extra pause on each blank line
    holdAfterTyped: 30,   // seconds the finished letter stays before it folds away
    foldSecs: 3.4,        // length of the fold -> envelope -> float away animation (keep in sync with letter.css)
    resumeAfterMs: 4000,  // auto-scroll stays paused this long after the viewer scrolls
    outroStart: 260       // overwritten from CONFIG.times.outroStart
  };

  var cfg, app, root, body, textEl, typedEl, restEl, cursorEl;
  var text = '', times = [], doneT = 0, removeAt = 0, goneAt = 0;
  var shown = -1, phase = '', pos = 0, manualUntil = 0, snapNext = true, resizeTimer = 0;

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  function schedule() {
    var t = cfg.typeStart, per = 1 / cfg.charsPerSec;
    times = new Array(text.length);
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i), prev = i ? text.charAt(i - 1) : '', next = text.charAt(i + 1);
      times[i] = t;                                  // moment character i appears
      t += per;
      if (c === '\n') t += prev === '\n' ? cfg.paragraphPause : 0.2;
      else if (/[.!?…]/.test(c) && !/[.!?…"”')]/.test(next)) t += cfg.periodPause;
      else if (/[,;:—–]/.test(c)) t += cfg.commaPause;
    }
    doneT = t;
    removeAt = Math.min(doneT + cfg.holdAfterTyped, cfg.outroStart);   // reaching the outro first removes it at the outro
    goneAt = removeAt + cfg.foldSecs;
    Edit.letterTimes = { doneT: doneT, removeAt: removeAt, goneAt: goneAt };   // montage.js starts when the letter is gone
  }

  function typedCount(t) {
    if (!text.length || t < times[0]) return 0;
    var lo = 0, hi = times.length - 1, r = 0;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (times[m] <= t) { r = m + 1; lo = m + 1; } else hi = m - 1; }
    return r;
  }

  function manual() { manualUntil = performance.now() + cfg.resumeAfterMs; }

  function setPhase(p) {
    if (p === phase) return;
    phase = p;
    root.classList.toggle('open', p === 'open' || p === 'fold');
    root.classList.toggle('fold', p === 'fold');
    root.classList.toggle('gone', p === 'gone');
    // the lyrics stay on top: the montage (montage.js) takes the letter's spot instead of the lyrics growing
  }

  function frame(f) {
    if (!root || !text) return;
    var t = f.t;
    setPhase(t < cfg.showAt ? 'pre' : t < removeAt ? 'open' : t < goneAt ? 'fold' : 'gone');
    if (phase === 'pre' || phase === 'gone') { shown = -1; snapNext = true; return; }

    var n = phase === 'fold' ? text.length : typedCount(t);
    if (n !== shown) {
      shown = n;
      typedEl.textContent = text.slice(0, n);
      restEl.textContent = text.slice(n);
      cursorEl.classList.toggle('typing', n < text.length && n > 0 && t < doneT);
    }
    if (phase === 'fold') return;
    if (performance.now() < manualUntil) { pos = body.scrollTop; return; }

    // keep the line being typed visible: cursor a line and a half above the bottom edge
    var ch = body.clientHeight, lh = parseFloat(getComputedStyle(body).lineHeight) || 24;
    var target = clamp(cursorEl.offsetTop + lh * 1.6 - ch, 0, Math.max(0, body.scrollHeight - ch));
    if (snapNext) { pos = target; snapNext = false; }
    else pos += (target - pos) * (1 - Math.exp(-f.dt * 5));
    body.scrollTop = pos;
  }

  function snap() { shown = -1; phase = ''; snapNext = true; manualUntil = 0; }

  Edit.modules.letter = {
    init: function (ctx) {
      cfg = Object.assign({}, DEFAULTS, (ctx.CONFIG && ctx.CONFIG.letter) || {});
      cfg.outroStart = (ctx.CONFIG && ctx.CONFIG.times && ctx.CONFIG.times.outroStart) || cfg.outroStart;
      app = document.getElementById('app');
      root = document.getElementById('letter-root');
      if (!root) return;
      body = root.querySelector('.lt-body');
      body.textContent = '';
      textEl = document.createElement('div'); textEl.className = 'lt-text';
      typedEl = document.createElement('span'); typedEl.className = 'lt-typed';
      cursorEl = document.createElement('span'); cursorEl.className = 'lt-cursor'; cursorEl.setAttribute('aria-hidden', 'true');
      restEl = document.createElement('span'); restEl.className = 'lt-rest'; restEl.setAttribute('aria-hidden', 'true');
      textEl.appendChild(typedEl); textEl.appendChild(cursorEl); textEl.appendChild(restEl);
      body.appendChild(textEl);
      ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'].forEach(function (e) {
        body.addEventListener(e, manual, { passive: true });
      });
      window.addEventListener('resize', function () { snapNext = true; });
      if (ctx.on) { ctx.on('seek', snap); ctx.on('reset', snap); }
      return fetch(cfg.src).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(function (txt) {
        text = String(txt).replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '');
        body.setAttribute('aria-label', 'Letter: ' + text.slice(0, 80));
        schedule();
      }).catch(function (e) { console.warn('[edit] letter not loaded', e); });
    },
    frame: frame,
    reset: snap,
    onSeek: snap
  };
})();
