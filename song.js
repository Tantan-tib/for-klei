/* song.js — Book.song: the timed "song mode". Everything below is a pure function of audio.currentTime
   (seek / pause / layout-switch safe). Contains: the planner (Book.song.planTimeline, pure), letter typing,
   floating lyrics (outside the book), page flips, big moments + confetti, montage video, finale, closing. */
(function () {
  'use strict';
  var Book = window.Book = window.Book || {};
  var CONFIG = Book.CONFIG || window.CONFIG || {};
  var song = Book.song = Book.song || {};

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function fmtT(s) { var m = Math.floor(s / 60); return m + ':' + ('0' + (s - m * 60).toFixed(1)).slice(-4); }
  function r2(x) { return Math.round(x * 100) / 100; }

  /* ================================================================== planner (pure) ================================================================== */

  // pages per unit kind (mirrors the SPEC table; the real indices come from Book.pages.build().units at runtime)
  var PAGES = {
    double: { letter: 2, birthday: 2, photos: 2, montage: 2, monthsary: 2, finale: 2 },
    single: { letter: 1, birthday: 1, photos: 2, montage: 1, monthsary: 1, finale: 1 }
  };

  /* schedule of the letter typing, same rules as the old letter.js. returns {times:[], done} */
  function letterSchedule(text, cfg) {
    var t = cfg.typeStart, per = 1 / cfg.charsPerSec, times = new Array(text.length);
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i), prev = i ? text.charAt(i - 1) : '', next = text.charAt(i + 1);
      times[i] = t;
      t += per;
      if (c === '\n') t += prev === '\n' ? cfg.paragraphPause : 0.2;
      else if (/[.!?…]/.test(c) && !/[.!?…"”')]/.test(next)) t += cfg.periodPause;
      else if (/[,;:—–]/.test(c)) t += cfg.commaPause;
    }
    return { times: times, done: t };
  }
  function cleanLetter(txt) { return String(txt == null ? '' : txt).replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, ''); }

  /* planTimeline(cfg, sections, {letterDone, vd}) -> array of units + {letterDoneAt, letterHoldEffective, montageStart, montageEnd, ...}
     unit = {kind, unit, flipAt, flipMs(ms), startT (landed), endT (next unit's flipAt)} */
  var MIN_SPREAD = 8;     // seconds: the least a photo spread may stay when the letter wait has to give way to an anchor
  function planTimeline(cfg, secs, o) {
    var S = cfg.song, order = cfg.pageOrder, warnings = [];
    var vd = o.vd > 0 ? o.vd : (cfg.montage && cfg.montage.duration) || 40;
    function typeAt(t) {
      for (var i = 0; i < secs.length; i++) if (t >= secs[i].start && t < secs[i].end) return secs[i].type;
      return secs.length ? secs[secs.length - 1].type : 'verse';
    }
    function fm(t) { var m = S.flipMs && S.flipMs[typeAt(t)]; return (m != null ? m : 900) / 1000; }
    function wt(t) { var w = S.spreadWeight && S.spreadWeight[typeAt(t)]; return w > 0 ? w : 0.5; }

    var U = order.map(function (k, i) { return { kind: k, unit: i, fixed: false, flipAt: 0, flipMs: 0, startT: 0, endT: 0 }; });
    function anchorOf(k) { return k === 'birthday' ? S.birthdayAt : k === 'monthsary' ? S.monthsaryAt : k === 'finale' ? S.finaleAt : null; }
    U.forEach(function (u, i) {
      var a = anchorOf(u.kind);
      if (i === 0) { u.fixed = true; u.startT = 0; u.flipAt = 0; u.flipMs = 0; }       // first unit (letter): there from t=0
      else if (a != null) {
        u.fixed = true; var ms = fm(a);
        u.startT = a; u.flipAt = a - ms; u.flipMs = Math.round(ms * 1000);
      }
    });

    var plan = U;
    plan.letterDoneAt = o.letterDone;
    plan.letterHoldEffective = null;
    plan.warnings = warnings;
    var hold = cfg.letter.holdAfterTyped;

    var fixedIdx = [];
    U.forEach(function (u, i) { if (u.fixed) fixedIdx.push(i); });

    for (var f = 0; f < fixedIdx.length; f++) {
      var a = fixedIdx[f], b = f + 1 < fixedIdx.length ? fixedIdx[f + 1] : -1;
      var free = [];
      for (var q = a + 1; q < (b < 0 ? U.length : b); q++) free.push(U[q]);
      var A = U[a];
      var W0 = a === 0 ? o.letterDone + hold : A.startT + (A.kind === 'birthday' || A.kind === 'monthsary' ? S.momentHold : 0);
      var W1 = b < 0 ? (S.finaleAt || 1e9) : U[b].flipAt;
      if (a === 0 && !free.length && b > 0) {
        // letter followed directly by an anchor: the anchor may cut the wait short
        plan.letterHoldEffective = r2(W1 - o.letterDone);
        if (W1 < o.letterDone + hold - 1e-6) {
          warnings.push('letter hold shortened: ' + hold + 's -> ' + plan.letterHoldEffective + 's (anchor ' + U[b].kind + ' flips at ' + r2(W1) + 's, letter done at ' + r2(o.letterDone) + 's)');
          if (plan.letterHoldEffective < 0) warnings.push('LETTER IS STILL TYPING when the book flips to ' + U[b].kind + ' (cut off by ' + r2(-plan.letterHoldEffective) + 's)');
        }
        A.endT = W1;
        continue;
      }
      if (a === 0) {
        // free units follow the letter: if the full wait would squeeze them below MIN_SPREAD each, shorten the wait (and say so)
        var latest = W1 - free.length * MIN_SPREAD;
        if (b >= 0 && W0 > latest) {
          W0 = Math.max(o.letterDone + 1, latest);
          warnings.push('letter hold shortened: ' + hold + 's -> ' + r2(W0 - o.letterDone) + 's so the ' + free.length + ' photo spread(s) before ' + U[b].kind + ' get at least ' + MIN_SPREAD + 's (letter done at ' + r2(o.letterDone) + 's, ' + U[b].kind + ' flips at ' + r2(W1) + 's). Lower letter.holdAfterTyped to <= ' + Math.floor(latest - o.letterDone) + ' to silence this.');
        }
        plan.letterHoldEffective = r2(W0 - o.letterDone);
      }
      A.endT = free.length ? W0 : (b >= 0 ? U[b].flipAt : W0);
      if (!free.length) continue;
      if (W1 - W0 < free.length * 2) warnings.push('not enough time between ' + A.kind + ' and the next anchor for ' + free.length + ' unit(s): ' + r2(W1 - W0) + 's');

      // ---- distribute [W0, W1] over the free units (montage = fixed length, photos = weighted rest) ----
      var mi = -1; free.forEach(function (u, j) { if (u.kind === 'montage') mi = j; });
      // sequential layout for a scale k: photo slot = k * weight(section type where it STARTS), montage = flip + video + hold
      function run(k) {
        var cur = W0, sl = [];
        for (var j = 0; j < free.length; j++) {
          var s0 = free[j].kind === 'montage' ? fm(cur) + vd + S.montageHold : k * wt(cur);
          sl.push(s0); cur += s0;
        }
        return { end: cur, slots: sl };
      }
      var klo = 0, khi = (W1 - W0), kk;
      for (var it = 0; it < 80; it++) { kk = (klo + khi) / 2; if (run(kk).end > W1) khi = kk; else klo = kk; }
      var slots = run(klo).slots;
      var starts = []; (function () { var c0 = W0; slots.forEach(function (x) { starts.push(c0); c0 += x; }); })();
      {
        // keep the montage (video + caption hold) before mustEndBefore: take time from the spreads before it, give it to those after
        if (mi >= 0) {
          var endM = W0, j2;
          for (j2 = 0; j2 <= mi; j2++) endM += slots[j2];
          var excess = endM - S.mustEndBefore;
          if (excess > 0) {
            var before = [], after = [], sb = 0, sa = 0;
            for (j2 = 0; j2 < free.length; j2++) {
              if (free[j2].kind === 'montage') continue;
              if (j2 < mi) { before.push(j2); sb += slots[j2]; } else { after.push(j2); sa += slots[j2]; }
            }
            var movable = Math.max(0, sb - before.length * 6);
            var mv = Math.min(excess, movable);
            if (mv > 0 && after.length) {
              before.forEach(function (j3) { slots[j3] -= mv * slots[j3] / sb; });
              after.forEach(function (j3) { slots[j3] += mv * slots[j3] / sa; });
            }
          }
        }
      }
      // final exact pass
      var cur = W0;
      for (var j = 0; j < free.length; j++) {
        var u = free[j], ms2 = fm(cur);
        u.flipAt = cur; u.flipMs = Math.round(ms2 * 1000); u.startT = cur + ms2;
        var slot = j === free.length - 1 ? W1 - cur : slots[j];
        u.endT = cur + slot; cur += slot;
        if (u.kind === 'montage') {
          plan.montageStart = u.startT; plan.montageEnd = u.startT + vd; plan.montageSlotEnd = u.endT; plan.videoDuration = vd;
          if (u.endT > S.mustEndBefore + 1e-6) warnings.push('montage (incl. hold) ends at ' + r2(u.endT) + 's > mustEndBefore ' + S.mustEndBefore);
        }
      }
    }
    // last unit's end
    var last = U[U.length - 1];
    if (!last.endT) last.endT = S.closeAt || (last.startT + 5);
    plan.fm = fm;
    plan.typeAt = typeAt;
    return plan;
  }

  /* per-layout page flips: [{at, ms, idx, unit}] ; pagesOf(unit) -> innerIndex array (from Book.pages.build().units or the table) */
  function buildFlips(plan, layout, pagesOf) {
    var flips = [];
    plan.forEach(function (u) {
      var idxs = pagesOf(u);
      u.pages = idxs;
      var n = layout === 'double' ? 1 : idxs.length;
      for (var k = 0; k < n; k++) {
        if (u.unit === 0 && k === 0) continue;                                  // first unit is simply there from the start
        var at = k === 0 ? u.flipAt : u.startT + k * (u.endT - u.startT) / n;
        var ms = k === 0 ? u.flipMs : Math.round(plan.fm(at) * 1000);
        flips.push({ at: at, ms: ms, idx: idxs[k], unit: u.unit });
      }
    });
    flips.sort(function (a, b) { return a.at - b.at; });
    return flips;
  }
  function tablePages(layout) {
    var next = 0, cache = {};
    return function (u) {
      if (cache[u.unit]) return cache[u.unit];
      var n = PAGES[layout][u.kind] || 1, a = [];
      // units are consumed in plan order (planner calls them in order)
      for (var i = 0; i < n; i++) a.push(next++);
      return (cache[u.unit] = a);
    };
  }

  song.planTimeline = planTimeline;
  song.letterSchedule = letterSchedule;
  song.cleanLetter = cleanLetter;
  song.buildFlips = buildFlips;
  song.tablePages = tablePages;

  if (typeof document === 'undefined') return;           // node unit tests stop here

  /* ================================================================== runtime ================================================================== */

  var S = null;                  // run state (null when not running)
  var raf = 0, wakeSentinel = null, listenersOn = false;
  var confettiFn = null, shapesHearts = [], shapesPapers = [], cfTimers = [];

  function cfg() { return Book.CONFIG || CONFIG; }
  function audioEl() { return (Book.audio && Book.audio.el) || document.getElementById('song'); }
  function dbg() { return !!Book.debug; }
  function engine() { return Book.engine; }

  /* ---------- wake lock ---------- */
  function getWakeLock() {
    try {
      if (!(cfg().book && cfg().book.wakeLock) || !navigator.wakeLock || wakeSentinel) return;
      navigator.wakeLock.request('screen').then(function (s) {
        wakeSentinel = s;
        s.addEventListener('release', function () { wakeSentinel = null; });
      }, function () {});
    } catch (e) {}
  }
  function releaseWakeLock() { try { if (wakeSentinel) { wakeSentinel.release(); wakeSentinel = null; } } catch (e) {} }

  /* ---------- confetti (canvas-confetti, papers + hearts; fires when time CROSSES the anchor) ---------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function initConfetti() {
    confettiFn = null;
    var c = cfg().confetti || {};
    if (c.enabled === false || typeof window.confetti !== 'function') return;
    var canvas = document.getElementById('confetti-canvas');
    if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'confetti-canvas'; (document.getElementById('app') || document.body).appendChild(canvas); }
    try {
      confettiFn = window.confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true });
      var sp = window.confetti.shapeFromPath;
      if (sp) {
        shapesHearts = [
          sp({ path: 'M11 19.5C4 14 -1 9.5 2 4.2C4.6 0.2 9.6 1 11 5.4C12.6 0.6 18.2 -0.4 20.6 3.6C23.6 8.8 17 14.2 11 19.5Z' }),
          sp({ path: 'M10.5 19C3.5 13 0 9 1.6 4.6C3.4 0.6 9 0.8 10.8 5C13 1.2 19 0.6 21 4.4C23 9.4 16.5 14 10.5 19Z' })
        ];
        shapesPapers = [
          sp({ path: 'M0 1L10 0L11 6.5L1.2 7.2Z' }),
          sp({ path: 'M0.5 0L7 0.8L6.4 9L0 8.2Z' }),
          sp({ path: 'M0 1.5L4 0L12 1L11 4.2L5 3.6L0.6 4.4Z' })
        ];
      }
    } catch (e) { console.warn('[song] confetti init failed', e); confettiFn = null; }
  }
  function shot(opts, shapes, scalar, n) {
    if (n < 1 || !confettiFn) return;
    var c = cfg().confetti || {};
    confettiFn(Object.assign({
      particleCount: n, colors: c.colors, shapes: shapes && shapes.length ? shapes : ['square'], scalar: scalar,
      ticks: 260, gravity: 0.85, decay: 0.92, drift: rnd(-0.3, 0.3), flat: false, zIndex: 60, disableForReducedMotion: true
    }, opts));
  }
  function both(opts, count) {
    var c = cfg().confetti || {};
    var h = Math.round(count * (c.heartShare != null ? c.heartShare : 0.4));
    shot(opts, shapesHearts, 2.6, h);
    shot(opts, shapesPapers, 1.1, count - h);
  }
  function volley(c, i, n) {
    var side = i % 2;
    both({ origin: { x: side ? 0.92 : 0.08, y: 0.95 }, angle: side ? 118 : 62, spread: c.spread, startVelocity: rnd(48, 62) }, Math.round(c.count / 2));
    both({ origin: { x: side ? 0.08 : 0.92, y: 0.95 }, angle: side ? 62 : 118, spread: c.spread, startVelocity: rnd(48, 62) }, Math.round(c.count / 2));
    if (n > 2 && i % 2 === 1) both({ origin: { x: rnd(0.25, 0.75), y: -0.05 }, angle: 90, spread: 120, startVelocity: 18, gravity: 0.6 }, Math.round(c.count * 0.6));
  }
  function fireConfetti(size) {
    if (!confettiFn) return;
    var all = cfg().confetti || {};
    var c = Object.assign({ count: 80, volleys: 2, spread: 70 }, all[size] || all.small);
    var n = Math.max(1, c.volleys | 0);
    for (var i = 0; i < n; i++) {
      (function (i) {
        if (i === 0) volley(c, 0, n);
        else cfTimers.push(setTimeout(function () { volley(c, i, n); }, i * 230));
      })(i);
    }
  }
  function wipeConfetti() { cfTimers.forEach(clearTimeout); cfTimers = []; try { if (confettiFn && confettiFn.reset) confettiFn.reset(); } catch (e) {} }

  /* ---------- helpers ---------- */
  function offsetWithin(el, anc) {
    var y = 0, n = el;
    while (n && n !== anc) { y += n.offsetTop; n = n.offsetParent; }
    return n === anc ? y : el.offsetTop;
  }
  function findLine(lines, t, guess) {
    var n = lines.length;
    if (!n) return -1;
    if (guess >= 0 && guess < n && lines[guess].t <= t && (guess + 1 >= n || lines[guess + 1].t > t)) return guess;
    var lo = 0, hi = n - 1, r = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (lines[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  /* ---------- state of the current run ---------- */
  function newState() {
    return {
      running: true, layout: 'double', built: null, refs: null, plan: null, flips: [], units: [],
      audio: null, text: '', lsched: null, lrc: null, secs: [],
      prevT: 0, lastTickMs: 0, cmdIdx: null, cmdUnit: 0, lastK: -1, flipChain: 0,
      // per-mount caches
      lt: null, ltShown: -1, ltTarget: 0, ltPos: 0, ltSnap: true,
      lyGuess: 0, fl: null,
      shown: {}, vid: '', vidLogged: false, daysDone: false, cfLast: null,
      closing: false, ended: false, wasPlaying: false,
      dbgEl: null, dbgAt: 0, ready: false
    };
  }

  function layoutNow() { return Book.layout ? Book.layout() : 'double'; }

  /* ---------- mount (initial + on layout change) ---------- */
  function resetCaches() {
    S.lt = null; S.ltShown = -1; S.ltSnap = true;
    floatReset();
    S.shown = {}; S.vid = ''; S.daysDone = false;
  }
  function pagesOfBuilt(built) {
    return function (u) {
      var bu = built && built.units && built.units[u.unit];
      return bu && bu.idx ? bu.idx.slice() : tablePages(S.layout)(u);
    };
  }
  function mountPages(t) {
    S.layout = layoutNow();
    S.built = Book.pages.build({ layout: S.layout, mode: 'song' });
    S.refs = S.built.refs || {};
    resetCaches();
    var opts = {}, kk = -1;
    if (S.plan) {
      S.flips = buildFlips(S.plan, S.layout, pagesOfBuilt(S.built));
      if (t != null) { kk = currentFlipIndex(t); opts.startPage = kk < 0 ? firstIdx() : S.flips[kk].idx; }
    }
    engine().mount(S.built.els, opts);
    engine().setManual(false);
    if (t != null && S.plan) {
      S.cmdIdx = opts.startPage; S.cmdUnit = kk < 0 ? 0 : S.flips[kk].unit; S.lastK = kk;
    } else { S.cmdIdx = null; S.cmdUnit = 0; S.lastK = -1; }
    setupLetter();
    setupMontage();
  }

  function setupLetter() {
    var r = S.refs, root = r.letterPage || null, sc = null;
    if (!root) return;
    var typed = root.querySelector('.lt-typed'), cursor = root.querySelector('.lt-cursor'), rest = root.querySelector('.lt-rest');
    sc = root.querySelector('.pg-letter') || (r.letterText && r.letterText.closest && r.letterText.closest('.pg-letter')) || root;
    if (typed && cursor && rest) S.lt = { typed: typed, cursor: cursor, rest: rest, sc: sc };
  }
  function setupMontage() {
    var m = S.refs.montage;
    if (m && m.video) { try { m.video.muted = true; m.video.pause(); } catch (e) {} }
  }

  /* ---------- per-frame pieces ---------- */

  function currentFlipIndex(t) {
    var f = S.flips, lo = 0, hi = f.length - 1, r = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (f[m].at <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  function firstIdx() { var u = S.plan[0]; return u.pages && u.pages.length ? u.pages[0] : 0; }

  function stepFlip(t, jumped) {
    var k = currentFlipIndex(t);
    var fl = k < 0 ? null : S.flips[k];
    var idx = fl ? fl.idx : firstIdx();
    var unit = fl ? fl.unit : 0;
    if (idx === S.cmdIdx) { S.cmdUnit = unit; return; }
    var first = S.cmdIdx == null;
    S.cmdIdx = idx; S.cmdUnit = unit;
    if (first && !fl) { S.lastK = k; return; }                                 // initial page is already mounted
    var animated = !jumped && fl && S.lastK === k - 1 && (t - fl.at) < 0.4 && !S.closing && !first;
    S.lastK = k;
    try {
      var p;
      if (animated) { engine().flipMs(fl.ms); p = engine().flipTo(idx, { ms: fl.ms }); }
      else p = engine().flipTo(idx, { instant: true });
      if (p && p.catch) p.catch(function () {});
    } catch (e) { console.error('[song] flipTo', e); }
  }

  function visiblePages() {
    var els = S.built.els, i = S.cmdIdx == null ? 0 : S.cmdIdx;
    if (S.layout === 'double') {
      var a = i - (i % 2);
      return [a, a + 1].filter(function (x) { return x >= 0 && x < els.length; });
    }
    return [i];
  }

  /* letter typing */
  function stepLetter(t, dt) {
    var L = S.lt;
    if (!L || !S.text) return;
    var times = S.lsched.times, n = 0;
    if (t >= times[0]) {
      var lo = 0, hi = times.length - 1;
      while (lo <= hi) { var m = (lo + hi) >> 1; if (times[m] <= t) { n = m + 1; lo = m + 1; } else hi = m - 1; }
    }
    if (n !== S.ltShown) {
      S.ltShown = n;
      L.typed.textContent = S.text.slice(0, n);
      L.rest.textContent = S.text.slice(n);
      L.cursor.classList.toggle('typing', n < S.text.length && n > 0);
      L.cursor.classList.toggle('done', n >= S.text.length);
      var ch = L.sc.clientHeight, lh = parseFloat(getComputedStyle(L.typed.parentNode).lineHeight) || 24;
      S.ltTarget = clamp(offsetWithin(L.cursor, L.sc) + lh * 1.6 - ch, 0, Math.max(0, L.sc.scrollHeight - ch));
    }
    if (S.ltSnap) { S.ltPos = S.ltTarget; S.ltSnap = false; }
    else S.ltPos += (S.ltTarget - S.ltPos) * (1 - Math.exp(-dt * 5));
    if (Math.abs(L.sc.scrollTop - S.ltPos) > 0.5) L.sc.scrollTop = S.ltPos;
  }

  /* ================= floating lyrics (outside the book) =================
     #lyric-float is a fixed, click-through layer between #bg and the book. Every line is a pure function of audio.currentTime:
     word-by-word ink reveal, slow drift up, fade when the next line arrives. Lines are placed in the free bands around the
     book (measured from #book's live rect), never over it. */
  var FL_FADE = 2.5, FL_MAXHOLD = 9;
  var FL_SPEED = { verse: 0.22, prechorus: 0.38, build: 0.38, chorus: 0.28, drop: 0.2 };   // em per second while being sung
  var flLayer = null, flProbe = null, flRM = null;

  function rng(seed) {
    var a = (seed * 2654435761 + 1013904223) >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function easeOutBack(x) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  function secType(L) { var sec = S.secs[L.sec]; return (sec && sec.type) || 'verse'; }
  function floatReduced() {
    if (flRM == null) { try { flRM = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { flRM = { matches: false }; } }
    return !!flRM.matches;
  }

  function floatLayer() {
    if (flLayer && flLayer.parentNode) return flLayer;
    flLayer = document.getElementById('lyric-float');
    if (!flLayer) {
      flLayer = document.createElement('div');
      flLayer.id = 'lyric-float';
      flLayer.setAttribute('aria-hidden', 'true');
      var app = document.getElementById('app') || document.body, wrap = document.getElementById('book-wrap');
      if (wrap && wrap.parentNode === app) app.insertBefore(flLayer, wrap); else app.appendChild(flLayer);
    }
    return flLayer;
  }
  function safeInsets() {
    if (!flProbe || !flProbe.parentNode) {
      flProbe = document.createElement('div');
      flProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px) 0';
      document.documentElement.appendChild(flProbe);
    }
    var cs = getComputedStyle(flProbe);
    return { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  }

  /* leave a strip around the book while the song plays (the engine reads these on every fit; browse mode keeps 0) */
  function applyInsets() {
    var st = document.documentElement.style;
    if (document.documentElement.getAttribute('data-state') !== 'song') { st.removeProperty('--book-inset-t'); st.removeProperty('--book-inset-b'); return; }
    var H = window.innerHeight, sf = safeInsets();
    if (layoutNow() === 'single') {
      st.setProperty('--book-inset-t', Math.round(H * 0.14 + sf.t) + 'px');
      st.setProperty('--book-inset-b', Math.round(sf.b + H * 0.01) + 'px');
    } else {
      st.setProperty('--book-inset-t', Math.round(H * 0.06 + sf.t) + 'px');
      st.setProperty('--book-inset-b', Math.round(H * 0.06 + sf.b) + 'px');
    }
  }
  if (Book.on) {
    Book.on('state', applyInsets);
    window.addEventListener('resize', applyInsets);                  // registered after the engine's, but the engine refits in a rAF
    if (window.visualViewport) window.visualViewport.addEventListener('resize', applyInsets);
  }

  /* measured free space: the viewport minus the book's visible rect (incl. page-edge stack + drop shadow) */
  function bookBox() {
    var b = document.getElementById('book');
    if (!b) return null;
    var r = b.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var pos = b.getAttribute('data-pos'), l = r.left, rt = r.right;
    if (S.layout === 'double') {                                   // closed book = one cover, sitting on one half of #book
      if (pos === 'cover') l = r.left + r.width / 2;
      else if (pos === 'back') rt = r.left + r.width / 2;
    }
    return { l: l - 12, r: rt + 14, t: r.top - 10, b: r.bottom + 16 };
  }
  function computeRegions() {
    var W = window.innerWidth, H = window.innerHeight, sf = safeInsets(), bx = bookBox();
    var m = Math.max(10, Math.round(W * 0.02)), gap = 4;
    var x0 = m, x1 = W - m, y0 = sf.t + 6, y1 = H - sf.b - 6;
    var R = { W: W, H: H, phone: S.layout === 'single' };
    if (!bx) bx = { l: W * 0.1, r: W * 0.9, t: H * 0.14, b: H * 0.9 };
    R.book = bx;
    R.top = { name: 'top', x0: x0, x1: x1, y0: y0, y1: bx.t - gap };
    R.bottom = { name: 'bottom', x0: x0, x1: x1, y0: bx.b + gap, y1: y1 };
    R.left = { name: 'left', x0: x0, x1: bx.l - gap, y0: y0 + 20, y1: y1 - 20 };
    R.right = { name: 'right', x0: bx.r + gap, x1: x1, y0: y0 + 20, y1: y1 - 20 };
    ['top', 'bottom', 'left', 'right'].forEach(function (k) { var g = R[k]; g.w = g.x1 - g.x0; g.h = g.y1 - g.y0; });
    var sideOk = !R.phone && R.left.w >= 190 && R.right.w >= 190;
    R.order = R.phone ? ['top', 'bottom'] : (sideOk ? ['top', 'right', 'bottom', 'left'] : ['top', 'bottom']);
    R.key = [W, H, Math.round(bx.l), Math.round(bx.r), Math.round(bx.t), Math.round(bx.b)].join(',');
    return R;
  }

  function floatReset() {
    if (S && S.fl) Object.keys(S.fl.ents).forEach(function (k) { var e = S.fl.ents[k]; if (e.el.parentNode) e.el.parentNode.removeChild(e.el); });
    if (S) S.fl = { ents: {}, R: null, rAt: -1e9, min: -1, on: false };
  }
  function floatJump() { if (S && S.fl) { S.fl.min = -2; S.fl.rAt = -1e9; } }   // seek / layout switch: rebuild the current line only

  function makeEnt(i, L) {
    var rnd = rng(i + 1), type = secType(L), el = document.createElement('div');
    el.className = 'fl-line fl-' + type;
    var words = L.text.split(/\s+/).filter(Boolean), spansW = [], pos = 0, total = L.text.length || 1;
    var plum = rnd() < 0.62;
    var tilt = rnd() * 8 - 4, fx = rnd(), fy = rnd();
    words.forEach(function (w, k) {
      var sp = document.createElement('span'); sp.className = 'fl-w'; sp.textContent = w;
      if (k === words.length - 1 && type === 'chorus' && words.length > 1) sp.classList.add('pink');
      el.appendChild(sp); if (k < words.length - 1) el.appendChild(document.createTextNode(' '));
      spansW.push({ el: sp, a: pos / total, b: (pos + w.length) / total, p: -1 });
      pos += w.length + 1;
    });
    el.style.color = (plum && type !== 'drop') ? '#4a2f3a' : '#d9577f';
    var dur = Math.max(0.1, L.end - L.t);
    var wd = type === 'drop' ? 0.35 : clamp(L.text.length / 16, 0.7, 2.4);
    wd = Math.min(wd, 0.8 * dur);
    var nxt = S.lrc.lines[i + 1];
    var out = Math.min(nxt ? nxt.t : Infinity, L.t + FL_MAXHOLD);
    return { i: i, L: L, el: el, words: spansW, type: type, tilt: tilt, fx: fx, fy: fy, wd: wd, out: out, ops: '', tfs: '', pl: null, rKey: '', done: false };
  }

  /* choose region + font size for one line and set its geometry (ent.pl) so its rotated bounding box lies inside a free band */
  function placeEnt(e, R) {
    var W = R.W, H = R.H;
    var f0 = R.phone ? clamp(W / 13.5, 22, 34) : clamp(Math.min(W / 36, H / 22), 22, 46);
    if (e.type === 'chorus') f0 *= 1.12; else if (e.type === 'drop') f0 *= 1.1; else if (e.type === 'build') f0 *= 0.95;
    var minF = R.phone ? 17 : 19, el = e.el, st = el.style;
    var pad = e.type === 'drop' ? 1.12 : 1.02;                       // pop overshoot headroom
    var rad = Math.abs(e.tilt) * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
    var pref = R.order[e.i % R.order.length];
    var cand = R.phone ? ['top', 'bottom'] : [pref].concat(R.order.filter(function (k) { return k !== pref; }));
    st.position = 'absolute'; st.left = '0px'; st.top = '0px'; st.width = 'max-content'; st.visibility = 'hidden';
    function tryFit(g, wrap) {
      var lo = wrap ? minF : f0 * 0.74;
      for (var f = f0; f >= lo - 0.01; f *= 0.93) {
        st.fontSize = f.toFixed(1) + 'px';
        st.whiteSpace = wrap ? 'normal' : 'nowrap';
        st.maxWidth = wrap ? Math.floor((g.w - 4) / pad) + 'px' : 'none';
        var w = el.offsetWidth, h = el.offsetHeight;
        var lh = parseFloat(getComputedStyle(el).lineHeight) || f * 1.1;
        if (Math.round(h / lh) > 2) continue;
        var bw = (w * cs + h * sn) * pad, bh = (w * sn + h * cs) * pad;
        if (bw <= g.w && bh <= g.h) return { f: f, w: w, h: h, bw: bw, bh: bh, g: g };
      }
      return null;
    }
    var best = null, k, g;
    for (k = 0; k < cand.length && !best; k++) { g = R[cand[k]]; if (g.w > 60 && g.h > 20) best = tryFit(g, false); }
    for (k = 0; k < cand.length && !best; k++) { g = R[cand[k]]; if (g.w > 60 && g.h > 20) best = tryFit(g, true); }
    if (!best) {                                                    // nothing fits: roomiest region at minimum size; hidden if it still would not fit
      var gg = cand.map(function (n) { return R[n]; }).sort(function (a, b) { return b.w * b.h - a.w * a.h; })[0];
      st.fontSize = minF + 'px'; st.whiteSpace = 'normal'; st.maxWidth = Math.max(80, gg.w - 4) + 'px';
      var w3 = el.offsetWidth, h3 = el.offsetHeight, bw3 = (w3 * cs + h3 * sn) * pad, bh3 = (w3 * sn + h3 * cs) * pad;
      best = { f: minF, w: w3, h: h3, bw: bw3, bh: bh3, g: gg, bad: bw3 > gg.w || bh3 > gg.h };
    }
    var g3 = best.g, side = g3.name === 'left' || g3.name === 'right';
    var fxx = R.phone ? 0.25 + e.fx * 0.5 : 0.1 + e.fx * 0.8;
    var cx = g3.x0 + best.bw / 2 + Math.max(0, g3.w - best.bw) * fxx;
    var bottom = side ? g3.y1 - (g3.h - best.bh) * 0.5 * e.fy : g3.y1;      // bands: bottom-aligned (drift goes up / away from the book)
    var restTop = bottom - best.bh;
    var minTop = g3.y0;                                              // drift stays inside the band (the viewport edge for the top strip)
    e.pl = { f: best.f, region: g3.name, bh: best.bh, room: Math.max(0, restTop - minTop), bad: !!best.bad };
    st.left = Math.round(cx - best.w / 2) + 'px';
    st.top = Math.round(restTop + (best.bh - best.h) / 2) + 'px';
    st.visibility = best.bad ? 'hidden' : '';
    e.rKey = R.key;
  }

  function stepFloat(t) {
    var F = S.fl, layer = floatLayer(), lines = S.lrc.lines, fin = null, q;
    for (q = 0; q < S.plan.length; q++) if (S.plan[q].kind === 'finale') { fin = S.plan[q]; break; }
    var on = document.documentElement.getAttribute('data-state') === 'song' && !S.closing && !S.ended && !(fin && t >= fin.startT - 0.3);
    if (on !== F.on) { F.on = on; layer.classList.toggle('on', on); }
    var i = findLine(lines, t, S.lyGuess);
    S.lyGuess = i < 0 ? 0 : i;
    if (F.min === -2) F.min = Math.max(0, i);
    var want = {}, j, lo = Math.max(F.min < 0 ? 0 : F.min, i - 5);
    if (i >= 0 && on) {
      for (j = i; j >= lo; j--) { var o = Math.min(lines[j + 1] ? lines[j + 1].t : Infinity, lines[j].t + FL_MAXHOLD); if (t < o + FL_FADE) want[j] = true; }
    }
    Object.keys(F.ents).forEach(function (k) { if (!want[k]) { var e = F.ents[k]; if (e.el.parentNode) e.el.parentNode.removeChild(e.el); delete F.ents[k]; } });
    var ks = Object.keys(want);
    if (!ks.length) return;
    var nowMs = performance.now();
    if (!F.R || nowMs - F.rAt > 100) {
      F.rAt = nowMs;
      var R = computeRegions();
      if (!F.R || R.key !== F.R.key) F.R = R;
    }
    ks.sort(function (a, b) { return a - b; }).forEach(function (k) {
      var e = F.ents[k];
      if (!e) { e = F.ents[k] = makeEnt(+k, lines[k]); e.el.style.opacity = '0'; layer.appendChild(e.el); }
      if (e.rKey !== F.R.key) placeEnt(e, F.R);
      drawEnt(e, t);
    });
  }

  function drawEnt(e, t) {
    var a = t - e.L.t, pl = e.pl, f = pl ? pl.f : 24, red = floatReduced();
    // opacity: quick in, hold, fade over FL_FADE after the next line (or the hold cap) arrives
    var op = clamp(a / (red ? 0.6 : 0.18), 0, 1);
    if (t > e.out) { var u = clamp((t - e.out) / FL_FADE, 0, 1); op *= 1 - u * u * (3 - 2 * u); }
    var ops = op.toFixed(3);
    if (ops !== e.ops) { e.ops = ops; e.el.style.opacity = ops; }
    // slow drift up (faster once the next line has arrived), soft-limited so it never leaves its band; drop lines pop in
    var dy = 0, sc = 1;
    if (!red) {
      var sp = FL_SPEED[e.type] || 0.22;
      var x = Math.max(0, t - e.out);                                // once the next line arrives the old one is pushed up by about its own height
      dy = sp * Math.min(a, e.out - e.L.t) * f + (pl ? pl.bh * 1.05 : f) * (1 - Math.exp(-x * 2.2)) + 0.4 * f * x;
      dy = pl && pl.room > 0 ? pl.room * Math.tanh(dy / pl.room) : 0;
      if (e.type === 'drop' && a < 0.5) sc = 0.55 + 0.45 * easeOutBack(clamp(a / 0.5, 0, 1));
    }
    var tf = 'translateY(' + (-dy).toFixed(1) + 'px) rotate(' + e.tilt.toFixed(2) + 'deg)' + (sc !== 1 ? ' scale(' + sc.toFixed(3) + ')' : '');
    if (tf !== e.tfs) { e.tfs = tf; e.el.style.transform = tf; }
    // word-by-word ink reveal
    if (e.done) return;
    var all = true;
    for (var k = 0; k < e.words.length; k++) {
      var w = e.words[k], p = red ? 1 : clamp((a / e.wd - w.a) / Math.max(0.001, w.b - w.a), 0, 1);
      p = Math.round(p * 50) / 50;
      if (p < 1) all = false;
      if (p !== w.p) {
        w.p = p;
        w.el.style.clipPath = p >= 1 ? 'none' : 'inset(-0.5em ' + ((1 - p) * 100).toFixed(1) + '% -0.5em -0.2em)';
        w.el.style.visibility = p <= 0 ? 'hidden' : '';
      }
    }
    if (all) e.done = true;
  }

  /* debug / tests: live rects of the floating lines + the book box they avoid */
  song.lyricDebug = function () {
    var F = S && S.fl;
    if (!F) return null;
    return {
      book: F.R && F.R.book,
      ents: Object.keys(F.ents).map(function (k) {
        var e = F.ents[k], r = e.el.getBoundingClientRect();
        return { i: +k, text: e.L.text, region: e.pl && e.pl.region, f: e.pl && e.pl.f, op: +e.ops, bad: !!(e.pl && e.pl.bad), rect: { l: r.left, t: r.top, r: r.right, b: r.bottom } };
      })
    };
  };


  /* big moments + finale + confetti */
  function setShow(name, pages, on) {
    if (S.shown[name] === on) return;
    S.shown[name] = on;
    (pages || []).forEach(function (p) { if (p && p.classList) p.classList.toggle('show', on); });
  }
  function unitByKind(kind) { for (var i = 0; i < S.plan.length; i++) if (S.plan[i].kind === kind) return S.plan[i]; return null; }

  function stepMoments(t, jumped) {
    var b = unitByKind('birthday'), m = unitByKind('monthsary'), f = unitByKind('finale');
    var R = S.refs;
    if (b && R.birthday) setShow('birthday', R.birthday.pages, t >= b.startT - 0.05);
    if (m && R.monthsary) setShow('monthsary', R.monthsary.pages, t >= m.startT - 0.05);
    if (f && R.finale) setShow('finale', R.finale.pages, t >= f.startT - 0.05);
    if (f && !S.daysDone && t >= f.startT) {
      S.daysDone = true;
      try { if (Book.pages && Book.pages.startDays) Book.pages.startDays(R.finale, { animate: !jumped }); } catch (e) { console.error(e); }
    }
    // confetti: fire when playback crosses the anchor (a seek never double-fires)
    if (S.cfLast != null && t > S.cfLast && t - S.cfLast < 0.5) {
      var sg = cfg().song;
      if (S.cfLast < sg.birthdayAt && t >= sg.birthdayAt) fireConfetti('small');
      if (S.cfLast < sg.monthsaryAt && t >= sg.monthsaryAt) fireConfetti('big');
    } else if (S.cfLast != null && Math.abs(t - S.cfLast) >= 0.5) wipeConfetti();
    S.cfLast = t;
  }

  /* montage video */
  function stepMontage(t, playing) {
    var M = S.refs.montage, p = S.plan;
    if (!M || !M.video || p.montageStart == null) return;
    var v = M.video, tv = t - p.montageStart, vd = p.videoDuration;
    var frame = M.frame || (M.page && M.page.querySelector('.mt-frame'));
    if (tv < 0) {
      if (S.vid !== 'pre') {
        S.vid = 'pre'; S.vidLogged = false;
        try { v.pause(); if (v.currentTime > 0.01) v.currentTime = 0; } catch (e) {}
        if (frame) frame.classList.remove('faded');
      }
      return;
    }
    if (tv >= vd) {
      if (S.vid !== 'done') {
        S.vid = 'done';
        try { v.pause(); } catch (e) {}
        if (frame) frame.classList.add('faded');
      }
      return;
    }
    if (S.vid !== 'play') {
      S.vid = 'play';
      if (frame) frame.classList.remove('faded');
      if (!S.vidLogged) { S.vidLogged = true; if (dbg()) console.log('[song] montage video starts at song time ' + fmtT(t) + ' (' + t.toFixed(2) + 's); ends at ' + fmtT(p.montageEnd)); }
    }
    if (playing) {
      if (v.readyState > 0 && Math.abs(v.currentTime - tv) > 0.6) { try { v.currentTime = tv; } catch (e) {} }
      if (v.paused && !v.ended) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
    } else if (!v.paused) { try { v.pause(); } catch (e) {} }
  }

  /* closing */
  function stepClose(t) {
    var sg = cfg().song;
    if (S.closing || t < sg.closeAt) return;
    S.closing = true;
    Book.emit('songend');
    try { var p = engine().close(sg.closeSecs * 1000); if (p && p.catch) p.catch(function () {}); } catch (e) { console.error('[song] close', e); }
  }

  /* debug readout */
  function stepDebug(t, now) {
    if (!S.dbgEl || now - S.dbgAt < 150) return;
    S.dbgAt = now;
    var u = S.plan[S.cmdUnit];
    var k = currentFlipIndex(t);
    S.dbgEl.textContent = fmtT(t) + '  unit ' + S.cmdUnit + ' ' + (u ? u.kind : '') + '  page ' + S.cmdIdx + '  flip#' + k + '  ' + S.layout + (S.vid ? '  video:' + S.vid : '') + (S.fl ? '  fl:' + Object.keys(S.fl.ents).map(function (k) { return S.fl.ents[k].pl ? S.fl.ents[k].pl.region[0] : '?'; }).join('') : '');
  }

  function tick(now) {
    if (!S || !S.running) return;
    raf = requestAnimationFrame(tick);
    if (!S.ready) return;
    var a = S.audio, t = a.currentTime || 0;
    var dtMs = S.lastTickMs ? now - S.lastTickMs : 16;
    S.lastTickMs = now;
    var dt = Math.min(0.1, dtMs / 1000);
    var jumped = t < S.prevT - 0.05 || t - S.prevT > 0.8;
    if (jumped) { S.ltSnap = true; S.vid = ''; floatJump(); }
    S.prevT = t;
    var playing = !a.paused && !a.ended;

    stepFlip(t, jumped);
    stepLetter(t, dt);
    if (S.lrc) stepFloat(t);
    stepMoments(t, jumped);
    stepMontage(t, playing);
    stepClose(t);
    stepDebug(t, now);
  }

  /* ---------- listeners ---------- */
  function onVisibility() {
    if (!S) return;
    var a = S.audio;
    if (document.hidden) {
      S.wasPlaying = !a.paused && !a.ended;
      if (S.wasPlaying) a.pause();
      var v = S.refs && S.refs.montage && S.refs.montage.video;
      if (v && !v.paused) { try { v.pause(); } catch (e) {} }
      releaseWakeLock();
    } else {
      if (S.wasPlaying && !a.ended) { var p = a.play(); if (p && p.catch) p.catch(function () {}); }
      S.wasPlaying = false;
      if (!a.ended) getWakeLock();
    }
  }
  function onEnded() { if (S) { S.ended = true; releaseWakeLock(); } }
  function onLayout() {
    if (!S || !S.running || !S.ready || S.closing) return;
    var t = S.audio.currentTime || 0;
    mountPages(t);                       // instant re-mount at the page that belongs to the current song time
    S.prevT = t; S.ltSnap = true; floatJump();
  }

  function onSeekedAudio() { if (S) S.prevT = -99; }

  function loadVideoDuration(cb) {
    var m = cfg().montage || {}, done = false;
    function fin(d) { if (done) return; done = true; cb(d > 0 && isFinite(d) ? d : 0); }
    try {
      var v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true;
      v.addEventListener('loadedmetadata', function () { fin(v.duration); });
      v.addEventListener('error', function () { fin(0); });
      v.src = m.src;
      setTimeout(function () { fin(0); }, 1800);
    } catch (e) { fin(0); }
  }

  /* ================================================================== public API ================================================================== */

  song.start = function (opts) {
    opts = opts || {};
    if (S) song.stop();
    S = newState();
    var C = cfg();
    var a = S.audio = audioEl();
    S.running = true;
    if (!listenersOn) {
      listenersOn = true;
      document.addEventListener('visibilitychange', onVisibility);
    }
    a.addEventListener('ended', onEnded);
    a.addEventListener('seeked', onSeekedAudio);

    // audio first (we are inside the tap)
    try {
      if (!a.getAttribute('src') && !a.currentSrc && C.audio) a.src = C.audio;
      a.currentTime = 0;
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function (e) { console.error('[song] audio.play() rejected', e); });
    } catch (e) { console.error('[song] audio', e); }
    getWakeLock();
    initConfetti();

    // pages + book
    var needOpen = false;
    try {
      mountPages(null);
      needOpen = engine().current() === -1 && !opts.noOpen;
      if (needOpen) { var op = engine().open(opts.openMs || 1700); if (op && op.catch) op.catch(function () {}); }
    } catch (e) { console.error('[song] mount', e); }

    if (dbg()) {
      var d = document.createElement('div');
      d.id = 'song-debug'; document.body.appendChild(d); S.dbgEl = d;
    }

    var mine = S;
    Promise.all([
      fetch(C.lrc).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }),
      fetch(C.letter.src).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }),
      new Promise(function (res) { loadVideoDuration(res); })
    ]).then(function (res) {
      if (S !== mine || !S.running) return;
      var lrcText = res[0], letter = cleanLetter(res[1]), vd = res[2];
      var parsed = Edit.LRC.parse(lrcText);
      var dur = isFinite(a.duration) && a.duration > 30 ? a.duration : C.duration;
      S.secs = Edit.LRC.buildSections(parsed, C, dur);
      S.lrc = parsed;
      S.text = letter;
      S.lsched = letterSchedule(letter || ' ', C.letter);
      if (!letter) S.lsched = { times: [C.letter.typeStart], done: C.letter.typeStart };
      if (!vd) { vd = (C.montage && C.montage.duration) || 40; if (dbg()) console.log('[song] video metadata not available, using CONFIG.montage.duration ' + vd); }
      S.plan = planTimeline(C, S.secs, { letterDone: S.lsched.done, vd: vd });
      S.flips = buildFlips(S.plan, S.layout, pagesOfBuilt(S.built));
      S.cmdIdx = null;
      song.plan = S.plan;
      S.plan.warnings.forEach(function (w) { console.warn('[song] ' + w); });
      if (S.plan.letterHoldEffective != null && S.plan.letterHoldEffective < C.letter.holdAfterTyped - 1e-6) {
        console.warn('[song] plan.letterHoldEffective = ' + S.plan.letterHoldEffective + 's (wanted ' + C.letter.holdAfterTyped + 's)');
      }
      if (dbg()) {
        console.table(S.plan.map(function (u) {
          return { unit: u.unit, kind: u.kind, pages: u.pages.join(','), flipAt: r2(u.flipAt), flipMs: u.flipMs, startT: r2(u.startT), endT: r2(u.endT), 'show(s)': r2(u.endT - u.startT) };
        }));
        console.log('[song] letter typed by ' + r2(S.plan.letterDoneAt) + 's; hold effective ' + S.plan.letterHoldEffective + 's; montage ' + r2(S.plan.montageStart) + ' - ' + r2(S.plan.montageEnd) + 's (slot end ' + r2(S.plan.montageSlotEnd) + ')');
      }
      S.prevT = a.currentTime || 0;
      S.ready = true;
    }).catch(function (e) { console.error('[song] setup failed', e); });

    if (!song._layoutBound) { song._layoutBound = true; Book.on('layout', onLayout); }
    raf = requestAnimationFrame(tick);
  };

  song.stop = function () {
    if (!S) return;
    S.running = false;
    cancelAnimationFrame(raf);
    try { S.audio.removeEventListener('ended', onEnded); S.audio.removeEventListener('seeked', onSeekedAudio); S.audio.pause(); } catch (e) {}
    try { var v = S.refs && S.refs.montage && S.refs.montage.video; if (v) v.pause(); } catch (e2) {}
    wipeConfetti();
    floatReset(); if (flLayer) flLayer.classList.remove('on');
    releaseWakeLock();
    if (S.dbgEl && S.dbgEl.parentNode) S.dbgEl.parentNode.removeChild(S.dbgEl);
    S = null;
  };

  /* debug helper: Book.song.seek(seconds) */
  song.seek = function (t) { if (S) { try { S.audio.currentTime = t; } catch (e) {} } };
  song.plan = null;
})();
