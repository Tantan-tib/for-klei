/* confetti.js — paper bits + little hand-drawn hearts (canvas-confetti, loaded from cdnjs in index.html).
   Fires when playback CROSSES a burst's start time (CONFIG.confetti.bursts), so replay works and a seek never double-fires.
   Registers Edit.modules.confetti. Classic script. */
(function () {
  'use strict';
  window.Edit = window.Edit || { modules: {} };
  Edit.modules = Edit.modules || {};

  var DEFAULTS = {
    enabled: true,
    colors: ['#f7b6cf', '#f4a6c0', '#ee8fb3', '#ffe9d6', '#fff6ea', '#ffffff'],
    bursts: [{ drop: 1, at: 0.05, size: 'small' }, { drop: 2, at: 0.05, size: 'big' }],
    small: { count: 70, volleys: 2, spread: 70 },
    big: { count: 150, volleys: 5, spread: 90 },
    heartShare: 0.4
  };

  var cfg, cf = null, canvas = null, hearts = [], papers = [], todo = [], timers = [], lastT = null, reduced = false;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function buildShapes() {
    var sp = cf && cf.shapeFromPath;
    if (!sp) return;
    try {
      // slightly wonky, hand-drawn hearts (two variants)
      hearts = [
        sp({ path: 'M11 19.5C4 14 -1 9.5 2 4.2C4.6 0.2 9.6 1 11 5.4C12.6 0.6 18.2 -0.4 20.6 3.6C23.6 8.8 17 14.2 11 19.5Z' }),
        sp({ path: 'M10.5 19C3.5 13 0 9 1.6 4.6C3.4 0.6 9 0.8 10.8 5C13 1.2 19 0.6 21 4.4C23 9.4 16.5 14 10.5 19Z' })
      ];
      // paper-like bits: uneven quads / a torn strip
      papers = [
        sp({ path: 'M0 1L10 0L11 6.5L1.2 7.2Z' }),
        sp({ path: 'M0.5 0L7 0.8L6.4 9L0 8.2Z' }),
        sp({ path: 'M0 1.5L4 0L12 1L11 4.2L5 3.6L0.6 4.4Z' })
      ];
    } catch (e) { console.warn('[edit] confetti shapes failed', e); hearts = []; papers = []; }
  }

  function shot(opts, shapes, scalar, n) {
    if (n < 1) return;
    cf(Object.assign({
      particleCount: n, colors: cfg.colors, shapes: shapes && shapes.length ? shapes : ['square'], scalar: scalar,
      ticks: 260, gravity: 0.85, decay: 0.92, drift: rnd(-0.3, 0.3), flat: false, zIndex: 25, disableForReducedMotion: true
    }, opts));
  }
  function both(opts, count) {
    var h = Math.round(count * (cfg.heartShare != null ? cfg.heartShare : 0.4));
    shot(opts, hearts, 2.6, h);
    shot(opts, papers, 1.1, count - h);
  }
  function volley(c, i, n) {
    var side = i % 2;
    // cannons from the bottom corners, aimed inward
    both({ origin: { x: side ? 0.92 : 0.08, y: 0.95 }, angle: side ? 118 : 62, spread: c.spread, startVelocity: rnd(48, 62) }, Math.round(c.count / 2));
    both({ origin: { x: side ? 0.08 : 0.92, y: 0.95 }, angle: side ? 62 : 118, spread: c.spread, startVelocity: rnd(48, 62) }, Math.round(c.count / 2));
    if (n > 2 && i % 2 === 1) both({ origin: { x: rnd(0.25, 0.75), y: -0.05 }, angle: 90, spread: 120, startVelocity: 18, gravity: 0.6 }, Math.round(c.count * 0.6));
  }
  function fire(size) {
    if (!cf || reduced) return;
    var c = Object.assign({ count: 80, volleys: 2, spread: 70 }, cfg[size] || cfg.small);
    var n = Math.max(1, c.volleys | 0);
    for (var i = 0; i < n; i++) {
      (function (i) {
        if (i === 0) volley(c, 0, n);
        else timers.push(setTimeout(function () { volley(c, i, n); }, i * 230));
      })(i);
    }
  }

  function wipe() { clearTimers(); lastT = null; try { if (cf && cf.reset) cf.reset(); } catch (e) {} }

  Edit.modules.confetti = {
    _test: { DEFAULTS: DEFAULTS },
    init: function (ctx) {
      cfg = Object.assign({}, DEFAULTS, (ctx.CONFIG && ctx.CONFIG.confetti) || {});
      reduced = !!ctx.reduced;
      if (cfg.enabled === false || reduced) return;
      if (typeof window.confetti !== 'function' || !window.confetti.create) { console.warn('[edit] canvas-confetti not loaded; skipping confetti'); return; }
      var app = document.getElementById('app') || document.body;
      canvas = document.createElement('canvas');
      canvas.id = 'confetti'; canvas.className = 'cf-canvas'; canvas.setAttribute('aria-hidden', 'true');
      app.appendChild(canvas);
      cf = window.confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true });
      buildShapes();
      // resolve bursts to absolute times from the sections (same mapping as the big text moments)
      var drops = ctx.sections.filter(function (s) { return s.type === 'drop'; });
      todo = [];
      (cfg.bursts || []).forEach(function (b) {
        var d = drops.filter(function (s) { return s.dropNo === b.drop; })[0] || drops[b.drop - 1];
        if (d) todo.push({ at: d.start + (b.at || 0), size: b.size || 'small' });
      });
    },
    frame: function (f) {
      if (!cf || !todo.length) return;
      var t = f.t;
      if (lastT !== null && t > lastT && t - lastT < 0.5) {
        for (var i = 0; i < todo.length; i++) if (lastT < todo[i].at && t >= todo[i].at) fire(todo[i].size);
      }
      lastT = t;
    },
    reset: wipe,
    onSeek: wipe
  };
})();
