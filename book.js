/* =====================================================================
   book.js — ENGINE: StPageFlip wrapper, covers, lock tag, cover note, audio graph + flip sound, wake lock.
   Exposes Book.layout(), Book.engine, Book.audio, Book.lock (date parsing). See SPEC.md.
   ===================================================================== */
(function () {
  'use strict';
  var B = window.Book = window.Book || {};
  var C = B.CONFIG || {};
  var doc = document;
  var RATIO = 556 / 400;             // page height / width (matches the StPageFlip 400x556 setup)
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function cfgBook() { return (C.book) || {}; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function byId(id) { return doc.getElementById(id); }
  function el(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ---------------------------------------------------------------
     layout decision
     --------------------------------------------------------------- */
  B.layout = function () {
    var w = window.innerWidth, h = window.innerHeight;
    return (w <= (cfgBook().singleBreakpoint || 700) || h > w) ? 'single' : 'double';
  };

  /* ---------------------------------------------------------------
     lock: lenient date parsing (01/18, 1/18, 0118, jan 18, january 18, optional year, any case)
     --------------------------------------------------------------- */
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function monthFromWord(w) {
    if (!/^[a-z]+$/.test(w) || w.length < 3) return 0;
    if (w === 'sept') return 9;
    for (var i = 0; i < 12; i++) if (MONTHS[i].indexOf(w) === 0) return i + 1;
    return 0;
  }
  function fixYear(s) {
    if (s == null || s === '') return null;
    var y = +s;
    if (s.length === 2) return 2000 + y;
    if (s.length === 4) return y;
    return null;
  }
  function parseDate(raw) {
    var s = String(raw == null ? '' : raw).toLowerCase().trim();
    if (!s) return null;
    s = s.replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/\b(of|the)\b/g, ' ')
      .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2')
      .replace(/[.,\/\\\-–—_:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    var tok = s.split(' '), i, mon = 0, nums = [], bad = false;
    for (i = 0; i < tok.length; i++) {
      if (/^\d+$/.test(tok[i])) nums.push(tok[i]);
      else { var mm = monthFromWord(tok[i]); if (mm && !mon) mon = mm; else bad = true; }
    }
    if (bad) return null;
    var m, d, y = null;
    if (mon) {
      if (!nums.length || nums.length > 2) return null;
      m = mon; d = +nums[0]; y = fixYear(nums[1]);
    } else if (nums.length === 1) {
      var dg = nums[0], ok = false;
      for (var ml = 1; ml <= 2 && !ok; ml++) for (var dl = 1; dl <= 2 && !ok; dl++) {
        var rest = dg.slice(ml + dl);
        if (dg.length < ml + dl || (rest !== '' && rest.length !== 2 && rest.length !== 4)) continue;
        var cm = +dg.slice(0, ml), cd = +dg.slice(ml, ml + dl);
        if (cm >= 1 && cm <= 12 && cd >= 1 && cd <= 31) { m = cm; d = cd; y = fixYear(rest); ok = true; }
      }
      if (!ok) return null;
    } else if (nums.length === 2 || nums.length === 3) {
      m = +nums[0]; d = +nums[1]; y = fixYear(nums[2]);
      if (m > 12 && d <= 12) { var tmp = m; m = d; d = tmp; }
    } else return null;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return { m: m, d: d, y: y };
  }
  function squash(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function checkDate(raw) {
    var cfg = C.lock || {}, ann = B.dates ? B.dates.parts() : { m: 1, d: 18 };
    var sq = squash(raw);
    if (!sq) return false;
    var extra = cfg.extraAnswers || [];
    for (var i = 0; i < extra.length; i++) if (squash(extra[i]) === sq) return true;
    var p = parseDate(raw);
    return !!p && p.m === ann.m && p.d === ann.d;
  }
  B.lock = { parse: parseDate, check: checkDate, unlocked: false };

  /* ---------------------------------------------------------------
     AUDIO: element -> MediaElementSource -> master gain -> speakers; flip sound joins the same master gain
     --------------------------------------------------------------- */
  var A = B.audio = {
    el: byId('song'), ctx: null, gain: null, bus: null, unlocked: false,
    vol: 0.8, muted: false, _noise: null, _wake: null, _wantWake: false, _lastFlip: 0
  };
  function effVol() { var v = A.muted ? 0 : A.vol; return v * v; }   // squared = closer to perceived loudness
  A.setVolume = function (vol, muted) {
    if (typeof vol === 'number') A.vol = clamp(vol, 0, 1);
    if (typeof muted === 'boolean') A.muted = muted;
    if (A.gain && A.ctx) {
      try { A.gain.gain.setTargetAtTime(effVol(), A.ctx.currentTime, 0.02); } catch (e) { A.gain.gain.value = effVol(); }
    } else if (A.el) {
      A.el.volume = A.muted ? 0 : A.vol;
    }
    B.emit('volume', { vol: A.vol, muted: A.muted });
  };
  A.getGain = function () { return A.gain; };
  // MUST be called synchronously inside the user's tap (iOS Safari)
  A.unlock = function () {
    try {
      if (!A.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          A.ctx = new AC();
          A.gain = A.ctx.createGain();
          A.gain.gain.value = effVol();
          A.bus = A.ctx.createGain();
          A.bus.gain.value = 1;
          A.bus.connect(A.gain);
          A.gain.connect(A.ctx.destination);
          if (location.protocol !== 'file:' && A.el) {
            try {
              var src = A.ctx.createMediaElementSource(A.el);
              src.connect(A.gain);
              A.el.volume = 1; A.el.muted = false;
            } catch (e) { console.warn('[book] media element source failed', e); A.el.volume = A.muted ? 0 : A.vol; A.gain.gain.value = 1; }
          } else if (A.el) { A.el.volume = A.muted ? 0 : A.vol; A.gain.gain.value = 1; }
        }
      }
      if (A.ctx) {
        if (A.ctx.state !== 'running') { var p = A.ctx.resume(); if (p && p.catch) p.catch(function () {}); }
        var b = A.ctx.createBuffer(1, 1, 22050), s = A.ctx.createBufferSource();   // silent blip: fully unlocks iOS
        s.buffer = b; s.connect(A.ctx.destination); s.start(0);
      }
    } catch (e) { console.warn('[book] audio unlock failed', e); }
    A.unlocked = true;
    return A.ctx;
  };
  function noiseBuffer() {
    if (A._noise) return A._noise;
    var c = A.ctx, len = Math.floor(c.sampleRate * 1.6), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0;   // pinkish noise
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      b0 = 0.97 * b0 + 0.03 * w; b1 = 0.85 * b1 + 0.15 * w; b2 = 0.55 * b2 + 0.45 * w;
      d[i] = (w * 0.55 + b2 * 0.9 - b0 * 0.4) * 0.8;
    }
    A._noise = buf;
    return buf;
  }
  // soft synthesized paper sound (no asset). ms = length of the flip it accompanies
  A.flipSound = function (ms) {
    var c = A.ctx;
    if (!c || c.state === 'closed' || !A.bus) return;
    var nowMs = Date.now();
    if (nowMs - A._lastFlip < 120) return;
    A._lastFlip = nowMs;
    try {
      var t0 = c.currentTime + 0.005;
      var dur = clamp(((ms || (S.pf ? S.pf.getSettings().flippingTime : 700)) / 1000) * 0.85, 0.22, 0.95);
      var peak = (typeof cfgBook().flipSoundVolume === 'number' ? cfgBook().flipSoundVolume : 0.1) * 1.8;
      var src = c.createBufferSource(); src.buffer = noiseBuffer();
      var off = Math.random() * (src.buffer.duration - dur - 0.05);
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(1500, t0);
      bp.frequency.exponentialRampToValueAtTime(4200, t0 + dur * 0.55);
      bp.frequency.exponentialRampToValueAtTime(2300, t0 + dur);
      var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      var g = c.createGain();
      var n = 32, curve = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        var x = i / (n - 1), env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.7)), 1.4);
        curve[i] = env * (0.55 + 0.45 * Math.random());           // crinkly amplitude
      }
      g.gain.setValueAtTime(0, t0);
      g.gain.setValueCurveAtTime(curve, t0, dur);
      g.gain.setValueAtTime(0, t0 + dur + 0.02);
      var pg = c.createGain(); pg.gain.value = peak;
      src.connect(bp); bp.connect(hp); hp.connect(lp); lp.connect(g); g.connect(pg); pg.connect(A.bus);
      src.start(t0, off, dur + 0.05);
      src.onended = function () { try { pg.disconnect(); } catch (e) {} };
    } catch (e) { /* sound is optional */ }
  };
  // screen wake lock (on while the song plays)
  A.wake = function (on) {
    A._wantWake = !!on;
    try {
      if (!on) { if (A._wake) { A._wake.release(); A._wake = null; } return; }
      if (cfgBook().wakeLock === false || !navigator.wakeLock || A._wake) return;
      navigator.wakeLock.request('screen').then(function (s) {
        A._wake = s; s.addEventListener('release', function () { A._wake = null; });
      }, function () {});
    } catch (e) {}
  };
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden && A._wantWake) A.wake(true); });

  /* ---------------------------------------------------------------
     ENGINE
     --------------------------------------------------------------- */
  var S = {
    inited: false, pf: null, host: null, layout: 'double', pw: 300, ph: 417,
    inner: [], hasInner: false, cur: -1, manual: false, mounting: false, prog: false, silent: false,
    waiters: [], front: null, back: null, slot: null, ms: 1000, pendingOpen: null, closing: null,
    ready: Promise.resolve(), unlocked: false, noteOn: false, noteTap: false, everOpened: false, wasOpen: false, shiftTimer: 0
  };
  var E = {};
  var D = {};   // dom refs

  /* ----- covers ----- */
  var HEART = '<svg class="cv-heart" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11.4" fill="#fffdf8"/><path d="M12 19.2C6.6 15.4 4.3 12.6 4.3 9.7c0-2.100 1.600-3.600 3.500-3.600 1.500 0 2.800.8 4.200 2.400 1.400-1.600 2.700-2.400 4.200-2.400 1.900 0 3.500 1.500 3.500 3.600 0 2.900-2.300 5.700-7.700 9.500z" fill="#d9577f"/></svg>';
  var DOODLE = '<svg class="cv-doodle" viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="#fff6ea" stroke-width="2.4" stroke-linecap="round"><path d="M20 4v8M20 28v8M4 20h8M28 20h8M9 9l5.500 5.500M25.500 25.500L31 31M31 9l-5.500 5.500M14.500 25.500L9 31"/></svg>';
  function makeCovers() {
    var f = el('div', 'page cover cover-front');
    f.setAttribute('data-density', 'hard');
    f.innerHTML = '<div class="cv-stitch"></div>' + DOODLE +
      '<div class="cv-label"><div class="cv-title">klei</div></div><div class="cv-tape t1"></div><div class="cv-tape t2"></div>' + (B.doodles ? B.doodles.cover('front') : '') + HEART +
      '<div class="pg-margin"><span class="pg-line"></span></div>';
    var b = el('div', 'page cover cover-back');
    b.setAttribute('data-density', 'hard');
    b.innerHTML = '<div class="cv-stitch"></div>' + DOODLE.replace('class="cv-doodle"', 'class="cv-doodle" style="left:auto;right:13%"') +
      '<div class="cv-end">the end<small>(for now)</small></div><div class="cv-tape t1"></div><div class="cv-tape t2"></div>' + (B.doodles ? B.doodles.cover('back') : '') + HEART +
      '<div class="back-cover-slot"></div><div class="pg-margin"><span class="pg-line"></span></div>';
    S.front = f; S.back = b; S.slot = b.querySelector('.back-cover-slot');
    // buttons in the slot must not start a page drag/flip
    ['mousedown', 'touchstart', 'mouseup', 'touchend'].forEach(function (ev) {
      S.slot.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true });
    });
  }

  /* ----- geometry ----- */
  function insets() {
    var cs = getComputedStyle(doc.documentElement);
    return { t: parseFloat(cs.getPropertyValue('--book-inset-t')) || 0, b: parseFloat(cs.getPropertyValue('--book-inset-b')) || 0 };
  }
  function fit() {
    var W = D.wrap.clientWidth || window.innerWidth, H = D.wrap.clientHeight || window.innerHeight, ins = insets();
    var padX = Math.max(10, W * 0.03), padY = Math.max(10, H * 0.035);
    var availW = W - 2 * padX, availH = H - ins.t - ins.b - 2 * padY;
    var pw = S.layout === 'double' ? Math.min(availW / 2, availH / RATIO) : Math.min(availW, availH / RATIO);
    pw = clamp(Math.floor(pw), 90, 780);
    S.pw = pw; S.ph = pw * RATIO;
    var w = S.layout === 'double' ? pw * 2 : pw, oy = (ins.t - ins.b) / 2;
    var st = D.book.style;
    st.width = w + 'px'; st.height = S.ph + 'px';
    st.marginLeft = (-w / 2) + 'px'; st.marginTop = (-S.ph / 2 + oy) + 'px';
    [D.book, D.wrap].forEach(function (n) { n.style.setProperty('--pw', pw + 'px'); n.style.setProperty('--ph', S.ph + 'px'); });
    D.wrap.style.setProperty('--oy', oy + 'px');
    D.book.classList.toggle('single', S.layout === 'single');
    if (S.pf) {
      var st2 = S.pf.getSettings();
      if (S.layout === 'single') st2.minWidth = pw;     // keeps StPageFlip in portrait (container < 2 * minWidth)
    }
  }
  function posName(inner) { return inner < 0 ? 'cover' : (inner >= S.inner.length ? 'back' : 'open'); }
  function applyShift(inner, ms, delay) {
    var pos = posName(inner), x = 0;
    if (S.layout === 'double') x = pos === 'cover' ? -S.pw / 2 : (pos === 'back' ? S.pw / 2 : 0);
    clearTimeout(S.shiftTimer);
    function go() {
      D.book.style.setProperty('--shift-ms', (REDUCED ? 10 : (ms == null ? 650 : ms)) + 'ms');
      D.book.style.transform = 'translateX(' + x + 'px)';
      D.book.setAttribute('data-pos', pos);
    }
    if (delay > 0) S.shiftTimer = setTimeout(go, delay); else go();
  }

  /* ----- StPageFlip lifecycle ----- */
  function teardown() {
    if (S.pf) { try { S.pf.destroy(); } catch (e) { /* host already gone */ } }
    S.pf = null;
    if (S.host && S.host.parentNode) S.host.parentNode.removeChild(S.host);
    S.host = null;
  }
  function sideClasses(all) {
    all.forEach(function (p, i) {
      p.classList.remove('pg-l', 'pg-r', 'pg-s');
      if (p === S.front || p === S.back) return;
      if (S.layout === 'single') p.classList.add('pg-s');
      else p.classList.add(i % 2 === 1 ? 'pg-l' : 'pg-r');
    });
  }
  function build(startInner) {
    teardown();
    S.layout = B.layout();
    fit();
    var all = [S.front].concat(S.inner, [S.back]);
    sideClasses(all);
    S.host = el('div', 'pf-host');
    D.book.insertBefore(S.host, D.stackAnchor);
    var single = S.layout === 'single';
    var pf = new St.PageFlip(S.host, {
      width: 400, height: 556, size: 'stretch',
      minWidth: single ? S.pw : 50, maxWidth: 2000, minHeight: 50, maxHeight: 2400,
      showCover: true, usePortrait: single, mobileScrollSupport: false,
      maxShadowOpacity: 0.5, drawShadow: true, flippingTime: S.ms,
      startPage: clamp(startInner, -1, S.inner.length) + 1, swipeDistance: 30,
      showPageCorners: S.manual, startZIndex: 0, autoSize: true
    });
    S.pf = pf;
    pf.on('flip', function (e) { onFlip(e.data); });
    pf.on('changeState', function (e) {
      if (e.data === 'flipping' || e.data === 'user_fold') A.flipSound(pf.getSettings().flippingTime);
    });
    S.mounting = true;
    pf.loadFromHTML(all);
    S.mounting = false;
    S.host.style.minWidth = '0'; S.host.style.maxWidth = 'none';
    S.cur = clamp(startInner, -1, S.inner.length);
    applyShift(S.cur, 0);
    pf.getSettings().showPageCorners = S.manual;
    // StPageFlip stamps animation start times from its own rAF clock: a flip started before its first frame would finish instantly
    S.ready = new Promise(function (res) {
      var done = false, fin = function () { if (!done) { done = true; res(); } };
      requestAnimationFrame(function () { requestAnimationFrame(fin); });
      setTimeout(fin, 160);
    });
  }

  function onFlip(idx) {
    if (S.mounting || S.silent) return;
    var to = idx - 1, from = S.cur;
    var manual = !S.prog;
    if (to === from) { settleWaiters(to); return; }
    S.cur = to; S.prog = false;
    if (S.pf) S.pf.getSettings().flippingTime = S.ms;     // per-call ms (flipTo) only lasts for that one flip
    if (manual) applyShift(to, 480);
    settleWaiters(to);
    B.emit('flip', { from: from, to: to, manual: manual });
    if (from === -1 && to >= 0) { S.wasOpen = true; B.emit('opened'); }
    if (to === -1 && from >= 0) { S.wasOpen = false; B.emit('closed'); }
  }
  function settleWaiters(to) {
    var rest = [];
    S.waiters.forEach(function (w) { if (w.to === to) { clearTimeout(w.timer); w.res(); } else rest.push(w); });
    S.waiters = rest;
  }

  /* ----- public: mount / flipTo / open / close ----- */
  E.mount = function (pageEls, opts) {
    if (!S.inited) E.init();
    opts = opts || {};
    var prevCur = S.cur, hadPf = !!S.pf && S.hasInner;
    S.waiters.forEach(function (w) { clearTimeout(w.timer); w.res(); }); S.waiters = [];
    S.inner = Array.prototype.slice.call(pageEls || []);
    S.hasInner = S.inner.length > 0;
    var start = typeof opts.startPage === 'number' ? opts.startPage : -1;
    S.closing = null; S.prog = false;
    build(start);
    if (hadPf && prevCur !== start && !REDUCED) {       // content swapped under the viewer: soft crossfade
      D.book.classList.remove('swap'); void D.book.offsetWidth; D.book.classList.add('swap');
    }
    if (S.pendingOpen && S.hasInner) {
      var po = S.pendingOpen; S.pendingOpen = null;
      E.open(po.ms).then(po.res);
    }
  };

  E.flipMs = function (ms) {
    if (typeof ms === 'number' && ms > 0) { S.ms = ms; S.msSet = true; if (S.pf) S.pf.getSettings().flippingTime = ms; }
    return S.ms;
  };

  E.flipTo = function (inner, o) {
    o = o || {};
    var gen = S.pf;
    if (o.instant) return flipNow(inner, o, gen);      // instant jumps apply synchronously
    return S.ready.then(function () { return flipNow(inner, o, gen); });
  };
  function flipNow(inner, o, gen) {
    return new Promise(function (res) {
      var pf = S.pf;
      if (!pf || pf !== gen) { res(); return; }
      inner = clamp(Math.round(inner), -1, S.inner.length);
      var coll = pf.getPageCollection(), full = inner + 1;
      var render = pf.getRender();
      try { render.finishAnimation(); } catch (e) {}      // settle a running flip first (its landing page may differ from the target)
      var ts = coll.getSpreadIndexByPage(full), cs = coll.getCurrentSpreadIndex();
      if (ts == null) { res(); return; }
      if (ts === cs) { res(); return; }
      var ms = o.ms > 0 ? o.ms : S.ms;
      if (o.instant) {
        S.prog = true;
        pf.turnToPage(full);
        S.prog = false;
        applyShift(S.cur, 0);
        res(); return;
      }
      pf.getSettings().flippingTime = ms;
      var spreads = coll.getSpread();
      if (Math.abs(ts - cs) > 1) {                       // the library flips one spread at a time: jump next to the target first
        var nb = ts > cs ? ts - 1 : ts + 1;
        S.silent = true; pf.turnToPage(spreads[nb][0]); S.silent = false;
        S.cur = spreads[nb][0] - 1;
      }
      S.prog = true;
      var w = { to: inner, res: res, timer: 0 };
      // double layout: a right-hand page lands as part of its spread, whose "current" is the left page
      if (S.layout === 'double' && inner >= 0 && inner < S.inner.length && inner % 2 === 1) w.to = inner - 1;
      w.timer = setTimeout(function () { S.prog = false; settleWaiters(w.to); res(); }, ms + 700);
      S.waiters.push(w);
      // shift of the book box: open = immediately; close = late in the flip
      if (inner === -1) applyShift(inner, ms * 0.55, ms * 0.45); else applyShift(inner, ms * 0.9, 0);
      pf.flip(full);
    });
  }

  E.open = function (ms) {
    if (!S.inited) E.init();
    if (!S.hasInner) {                                   // pages not mounted yet: open right after mount()
      if (S.pendingOpen) return S.pendingOpen.p;
      var po = { ms: ms };
      po.p = new Promise(function (res) { po.res = res; });
      S.pendingOpen = po;
      return po.p;
    }
    if (S.cur >= 0) return Promise.resolve();
    return E.flipTo(0, { ms: ms || 1600 });
  };

  E.close = function (ms) {
    if (!S.pf) return Promise.resolve();
    if (S.cur === -1 && !S.closing) { if (!S.hasInner) return Promise.resolve(); return Promise.resolve(); }
    if (S.closing) return S.closing;
    ms = ms || 2500;
    // riffle back through the spreads (a jump straight to the first spread would be visible), landing on the cover
    var coll = S.pf.getPageCollection(), spreads = coll.getSpread(), cs = coll.getCurrentSpreadIndex();
    var n = Math.max(1, cs), steps = Math.max(1, Math.min(n, Math.floor(ms / 300))), seq = [], i;
    for (i = 1; i <= steps; i++) seq.push(Math.round(cs - i * n / steps));
    var per = ms / steps, gen = S.pf, chain = Promise.resolve();
    seq.forEach(function (si) {
      chain = chain.then(function () {
        if (S.pf !== gen) return null;
        return E.flipTo(spreads[Math.max(0, si)][0] - 1, { ms: per });
      });
    });
    S.closing = chain.then(function () { S.closing = null; });
    return S.closing;
  };

  E.current = function () { return S.cur; };
  E.pageSize = function () { return { w: S.pw, h: S.ph }; };
  E.backCoverSlot = function () { return S.slot; };
  E.layout = function () { return S.layout; };
  E.setManual = function (on) {
    S.manual = !!on;
    if (S.manual && !S.msSet) { S.ms = cfgBook().browseFlipMs || 700; if (S.pf) S.pf.getSettings().flippingTime = S.ms; }
    if (D.shield) D.shield.classList.toggle('off', S.manual);
    if (S.pf) S.pf.getSettings().showPageCorners = S.manual;
  };
  E.isManual = function () { return S.manual; };
  E.pf = function () { return S.pf; };

  /* ----- cover note (handwritten text on the closed cover) + taps ----- */
  var SWASH = '<svg class="cn-swash" viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 8 C 20 2, 40 12, 60 6 S 100 3, 118 7"/></svg>';
  E.setCoverNote = function (html) {
    var n = D.note;
    if (!n) return;
    if (html == null || html === '') {
      S.noteOn = false; n.classList.remove('show', 'on'); n.removeAttribute('tabindex'); n.removeAttribute('role');
      return;
    }
    n.innerHTML = '<div class="cn-text">' + html + SWASH + '</div>';
    n.classList.remove('show'); n.classList.add('on');
    n.setAttribute('role', 'button'); n.setAttribute('tabindex', '0');
    void n.offsetWidth;
    n.classList.add('show');
    S.noteOn = true;
  };
  function onNoteTap(e) {
    if (!S.noteOn) return;
    if (e && e.type === 'keydown') {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
    }
    S.noteOn = false;
    D.note.classList.remove('show', 'on');
    var reopen = S.everOpened;
    S.everOpened = true;
    B.emit(reopen ? 'tapreopen' : 'tapopen');      // listeners run synchronously inside this user gesture
  }

  /* ----- lock tag ----- */
  function buildLock() {
    var cfg = C.lock || {}, name = String(C.name || 'klei').toLowerCase();
    var title = String(cfg.tag || "{name}, what's our date?").replace(/\{name\}/g, name);
    D.lock.innerHTML =
      '<div class="lk-tag"><svg class="lk-string" viewBox="0 0 40 44" aria-hidden="true"><path d="M20 44 C 20 30, 8 26, 10 14 S 30 2, 28 -4" fill="none" stroke="#d9577f" stroke-width="2" stroke-linecap="round"/><circle cx="28" cy="-4" r="3" fill="#d9577f"/></svg>' +
      '<form class="lk-card" autocomplete="off" novalidate><span class="lk-hole"></span>' +
      '<label class="lk-title" for="lkInput"></label>' +
      '<div class="lk-form"><input id="lkInput" class="lk-input" type="text" inputmode="text" enterkeyhint="go" maxlength="28" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '<button class="lk-go" type="submit" aria-label="open"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></div>' +
      '<div class="lk-msg" role="status" aria-live="polite"></div></form></div>';
    var tag = D.lock.querySelector('.lk-tag'), card = D.lock.querySelector('.lk-card'),
        input = D.lock.querySelector('.lk-input'), msg = D.lock.querySelector('.lk-msg');
    D.lock.querySelector('.lk-title').textContent = title;
    if (cfg.placeholder != null) input.placeholder = cfg.placeholder;
    ['mousedown', 'touchstart'].forEach(function (ev) { D.lock.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    var busy = false;
    card.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy || S.unlocked) return;
      if (checkDate(input.value)) { unlockOK(tag, input, msg); return; }
      msg.textContent = cfg.wrong || 'nope, try again'; msg.classList.add('show');
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      try { input.focus({ preventScroll: true }); input.select(); } catch (er) {}
    });
    input.addEventListener('input', function () { msg.classList.remove('show'); });
    D.lock.classList.add('on');
    if (!B.debug) setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) {} }, 900);
  }
  function unlockOK(tag, input, msg) {
    S.unlocked = true; B.lock.unlocked = true;
    msg.classList.remove('show');
    try { input.blur(); } catch (e) {}
    tag.classList.add('fall');
    B.emit('unlocked');
    setTimeout(function () {
      D.lock.classList.remove('on');
      E.setCoverNote((C.lock && C.lock.tapToOpen) || 'tap to open');
    }, REDUCED ? 450 : 1050);
  }

  /* ----- init ----- */
  E.init = function () {
    if (S.inited) return;
    S.inited = true;
    D.wrap = byId('book-wrap'); D.book = byId('book'); D.shield = byId('book-shield');
    D.lock = byId('lock'); D.note = byId('cover-note');
    if (!D.wrap || !D.book) { console.error('[book] #book-wrap / #book missing'); return; }
    if (typeof St === 'undefined' || !St.PageFlip) { console.error('[book] StPageFlip (page-flip) not loaded'); return; }
    D.book.innerHTML = '<div class="bk-shadow"></div><div class="bk-l"></div><div class="bk-r"></div><span class="bk-anchor"></span>';
    D.stackAnchor = D.book.querySelector('.bk-anchor');
    if (D.shield) D.shield.classList.remove('off');
    makeCovers();
    if (A.el && !A.el.getAttribute('src') && C.audio) { A.el.src = C.audio; A.el.preload = 'auto'; }
    S.layout = B.layout();
    S.ms = cfgBook().browseFlipMs || 1000;
    S.hasInner = false; S.inner = [];
    build(-1);

    D.note.addEventListener('click', onNoteTap);
    D.note.addEventListener('keydown', onNoteTap);
    var rafId = 0;
    window.addEventListener('resize', function () {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(onResize);
    });
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 200); });
    var ro = (window.visualViewport) ? window.visualViewport : null;
    if (ro) ro.addEventListener('resize', function () { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(onResize); });

    var skip = (C.lock && C.lock.enabled === false) || (B.debug && /[?&]nolock\b/.test(location.search));
    if (skip) {
      S.unlocked = true; B.lock.unlocked = true;
      setTimeout(function () { B.emit('unlocked'); E.setCoverNote((C.lock && C.lock.tapToOpen) || 'tap to open'); }, 50);
    } else buildLock();
    B.emit('engineready');
  };

  function onResize() {
    if (!S.inited) return;
    var lay = B.layout();
    if (lay !== S.layout) {
      var cur = S.cur;
      build(cur);
      B.emit('layout', lay);
    } else {
      fit();
      if (S.pf) { try { S.pf.update(); } catch (e) {} if (S.host) { S.host.style.minWidth = '0'; S.host.style.maxWidth = 'none'; } }
      applyShift(S.cur, 0);
    }
    B.emit('resize');
  }

  B.engine = E;
  B.engineState = S;   // debug only
})();
