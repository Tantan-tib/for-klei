/* photos.js — two scrolling polaroid columns (left: even photo indices, right: odd) flanking the
   fixed center column. Scroll position is a pure function of audio time (f.t) via a precomputed
   cumulative-travel table over ctx.sections. Registers Edit.modules.photos. Classic script. */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Edit = G.Edit || { modules: {} };
  G.Edit.modules = G.Edit.modules || {};

  /* ---------------- knobs (merged under CONFIG.photoReel) ---------------- */
  var DEFAULTS = {
    speed: { intro: 0.25, verse: 0.6, prechorus: 1.5, chorus: 1.6, build: 2.2, drop: 'snap', outro: 0.2 },
    buildTo: 4.5,          // build ramps from speed.build (number) to this with secProgress (speed.build may also be [from,to])
    loops: 2.0,            // continuous (non-snap) travel = loops * (photos in the longer column) slots over the song
    dropCutBeats: 4,       // snap-cut every N beats during a drop
    dropEase: 0.1,         // seconds, ease of one snap
    dropTailGuard: 0.3,    // no cut within this many seconds of the drop end
    flashStrength: 0.3, flashDur: 0.16,
    reducedDropSpeed: 1.6, // smooth speed for drops under prefers-reduced-motion
    sideWidthFrac: 0.86,   // frame width / column width
    maxFrameW: 260,        // px cap (desktop)
    maxFrameHVh: 0.46,     // frame height cap, fraction of viewport height
    pitchGap: 1.04,        // slot pitch = tallest frame * pitchGap + pitchPad
    pitchPad: 6,
    pulse: 0.03,           // bass pulse scale on the photos nearest the column's vertical center
    bokehParallax: 0.3,    // bokeh speed relative to column speed
    tiltMin: 1, tiltMax: 6,          // per-photo resting tilt (deg), deterministic from the photo index
   
    initTimeout: 4500      // ms: max wait for the first visible photos to decode
  };

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hash(i) { var s = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s); }
  function mod(a, n) { return ((a % n) + n) % n; }
  function merge(cfg) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    if (cfg) for (k in cfg) if (k !== 'speed') o[k] = cfg[k];
    o.speed = {};
    for (k in DEFAULTS.speed) o.speed[k] = DEFAULTS.speed[k];
    if (cfg && cfg.speed) for (k in cfg.speed) o.speed[k] = cfg.speed[k];
    return o;
  }

  /* ---------------- pure math ---------------- */
  // Column membership: left = even indices, right = odd indices.
  function columns(N) {
    var L = [], R = [], i;
    for (i = 0; i < N; i++) (i % 2 === 0 ? L : R).push(i);
    return { L: L, R: R };
  }
  // Photo index shown in slot k. Right column has a half-list phase.
  function photoAt(cols, side, k) {
    if (side === 0) return cols.L[mod(k, cols.L.length)];
    var n = cols.R.length;
    return cols.R[mod(k + (n >> 1), n)];
  }

  // Table of scroll position s(t) in slots (1 slot = one pitch).
  function buildTable(sections, cfgIn, N, duration, bpm, reduced) {
    var cfg = merge(cfgIn), beat = 60 / (bpm || 128);
    var cols = columns(N), longest = Math.max(cols.L.length, cols.R.length, 1);
    var secs = (sections && sections.length) ? sections.slice().sort(function (a, b) { return a.start - b.start; })
      : [{ type: 'verse', start: 0, end: duration || 1 }];
    var es = [], i, s, sp, e, d;
    for (i = 0; i < secs.length; i++) {
      s = secs[i]; d = s.end - s.start;
      if (!(d > 0)) continue;
      sp = cfg.speed[s.type];
      var snap = (sp === 'snap');
      if (snap && reduced) { sp = cfg.reducedDropSpeed; snap = false; }
      var a = 1, b = 1;
      if (snap) { a = b = 0; }
      else if (s.type === 'build') {
        if (Array.isArray(sp)) { a = +sp[0] || 0; b = +sp[1] || a; }
        else { a = (typeof sp === 'number') ? sp : 2.2; b = Math.max(a, cfg.buildTo); }
      } else if (typeof sp === 'number') { a = b = sp; }
      es.push({ type: s.type, start: s.start, end: s.end, d: d, snap: snap, a: a, b: b,
                interval: 0, m: 0, c0: 0, cutBase: 0 });
    }
    if (!es.length) es.push({ type: 'verse', start: 0, end: duration || 1, d: duration || 1, snap: false, a: 1, b: 1, interval: 0, m: 0, c0: 0, cutBase: 0 });
    var ctot = 0, cuts = 0, step = Math.max(1, cfg.dropCutBeats) * beat;
    for (i = 0; i < es.length; i++) {
      e = es[i]; e.c0 = ctot; e.cutBase = cuts;
      if (e.snap) {
        e.interval = step;
        e.m = Math.max(1, Math.floor((e.d - cfg.dropTailGuard) / step) + 1);
        cuts += e.m;
      } else ctot += (e.a + (e.b - e.a) * 0.5) * e.d;
    }
    var k = ctot > 1e-9 ? (cfg.loops * longest) / ctot : 0;
    return { entries: es, k: k, N: N, totalCuts: cuts, ease: cfg.dropEase, duration: duration,
             totalSlots: k * ctot + cuts, cols: cols };
  }
  function findEntry(tbl, t) {
    var es = tbl.entries, lo = 0, hi = es.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (es[mid].start <= t) lo = mid; else hi = mid - 1; }
    return es[lo];
  }
  // weight integral inside an entry: speed ramps a->b linearly across the section
  function inner(e, dt) { return e.a * dt + (e.b - e.a) * dt * dt / (2 * e.d); }
  function snapN(e, dt) { return Math.min(e.m, Math.floor(dt / e.interval + 1e-9) + 1); }
  // Scroll position in slots at time t (pure; monotone; continuous except snaps).
  function posAt(t, tbl) {
    var e = findEntry(tbl, t), dt = clamp(t - e.start, 0, e.d);
    if (e.snap) {
      var n = snapN(e, dt), x = dt - (n - 1) * e.interval;
      var g = tbl.ease > 0 ? clamp(x / tbl.ease, 0, 1) : 1;
      return tbl.k * e.c0 + e.cutBase + (n - 1) + (1 - Math.pow(1 - g, 3));
    }
    return tbl.k * (e.c0 + inner(e, dt)) + e.cutBase;
  }
  // Number of snap cuts that have fired up to t (pure).
  function cutIndexAt(t, tbl) {
    var e = findEntry(tbl, t);
    if (!e.snap) return e.cutBase;
    return e.cutBase + snapN(e, clamp(t - e.start, 0, e.d));
  }

  /* ---------------- module ---------------- */
  var M = {
    _test: { buildTable: buildTable, posAt: posAt, cutIndexAt: cutIndexAt, merge: merge, columns: columns, photoAt: photoAt },

    init: function (ctx) {
      var S = this._s = {};
      var CONFIG = ctx.CONFIG || {};
      var cfg = merge(CONFIG.photoReel);
      var photos = CONFIG.photos || [];
      var N = photos.length;
      var root = ctx.els && ctx.els.photosRoot;
      S.ctx = ctx; S.cfg = cfg; S.photos = photos; S.N = N; S.root = root;
      S.duration = ctx.duration || CONFIG.duration || 271;
      S.bpm = CONFIG.bpm || 128;
      S.tbl = {}; S.tblSec = null;
      S.lastT = null; S.lastCut = -1;
      S.keep = {};
      S.caps = {};
      loadCaptions(S, CONFIG.captions);
      if (!root || !N) { S.dead = true; return Promise.resolve(); }
      S.cols = columns(N);

      root.textContent = '';
      var bg = el('div', 'ph-bg'); bg.setAttribute('aria-hidden', 'true');
      S.bokeh = el('div', 'ph-bokeh'); bg.appendChild(S.bokeh);
      root.appendChild(bg);
      S.col = [mkCol('ph-col ph-left'), mkCol('ph-col ph-right')];
      root.appendChild(S.col[0].el); root.appendChild(S.col[1].el);
      var shL = el('div', 'ph-shade ph-shade-l'), shR = el('div', 'ph-shade ph-shade-r');
      shL.setAttribute('aria-hidden', 'true'); shR.setAttribute('aria-hidden', 'true');
      root.appendChild(shL); root.appendChild(shR);

      this._measure();
      var self = this;
      S.onResize = function () { self._measure(true); };
      G.addEventListener('resize', S.onResize);
      G.addEventListener('orientationchange', S.onResize);
      if (ctx.on) {
        var rs = function () { S.lastT = null; S.lastCut = -1; };
        ctx.on('seek', rs); ctx.on('reset', rs);
      }
      S.ready = true;

      // First visible photos (t = 0): decode them before Play is enabled (never hang).
      var tbl = this._table(!!ctx.reduced), p0 = posAt(0, tbl), want = [], si, k;
      for (si = 0; si < 2; si++) for (k = Math.ceil(p0 - S.nVis / 2 - 1); k <= Math.floor(p0 + S.nVis / 2 + 1); k++) {
        var pi = photoAt(S.cols, si, k);
        if (want.indexOf(pi) < 0) want.push(pi);
      }
      var first = Promise.all(want.map(function (i) { return loadImg(S, i); })).catch(function () {});
      var timeout = new Promise(function (res) { setTimeout(res, cfg.initTimeout); });
      return Promise.race([first, timeout]).then(function () {
        try { self.frame({ t: 0, beat: 0, reduced: ctx.reduced }); } catch (e) {}
      });
    },

    _table: function (red) {
      var S = this._s, sec = S.ctx.sections, key = red ? 'r' : 'n';
      if (S.tblSec !== sec) { S.tbl = {}; S.tblSec = sec; }
      if (!S.tbl[key]) S.tbl[key] = buildTable(sec, S.cfg, S.N, S.duration, S.bpm, red);
      return S.tbl[key];
    },

    // The only place that reads layout (init + resize).
    _measure: function (relayout) {
      var S = this._s; if (!S || S.dead) return;
      var c = S.cfg, r = S.root;
      var vw = (r && r.clientWidth) || G.innerWidth || 360;
      var vh = (r && r.clientHeight) || G.innerHeight || 640;
      var cw = S.col[0].el.clientWidth;
      if (!cw) { // fallback consistent with CONTRACT2 (portrait or <=700px -> 25%, else 30%)
        var narrow = vw <= 700 || vh > vw;
        cw = vw * (narrow ? 0.25 : 0.30);
      }
      S.vw = vw; S.vh = vh; S.cw = cw;
      var fw = Math.min(cw * c.sideWidthFrac, c.maxFrameW);
      var pad0 = clamp(fw * 0.045, 3, 10), maxFh = c.maxFrameHVh * vh, maxFw = fw, i, hMax = 0;
      S.sizes = [];
      for (i = 0; i < S.N; i++) {
        // printed-photo borders: thickness varies per photo; thick polaroid-style bottom (padB) leaves room for a handwritten caption
        var pad = Math.round(pad0 * (0.75 + 0.7 * hash(i + 13)) * 2) / 2, padB = Math.round(pad * (3 + 0.8 * hash(i + 41)) + 4);
        var p = S.photos[i], aw = maxFw - 2 * pad, ah = maxFh - pad - padB;
        var sc = Math.min(aw / p.w, ah / p.h);
        var pw = Math.max(1, Math.round(p.w * sc)), ph = Math.max(1, Math.round(p.h * sc));
        var z = { pw: pw, ph: ph, fw: pw + 2 * pad, fh: ph + pad + padB, pad: pad, padB: padB };
        if (z.fh > hMax) hMax = z.fh;
        S.sizes.push(z);
      }
      S.pitch = hMax * c.pitchGap + c.pitchPad;
      S.nVis = Math.ceil(vh / S.pitch) + 1;           // slots on screen
      S.span = Math.ceil((vh / 2 + S.pitch) / S.pitch); // slots above/below center that can be on screen
      S.tile = vh;
      S.bokeh.style.backgroundSize = '100% 50%';
      var need = 2 * S.span + 3, side;
      for (side = 0; side < 2; side++) {
        var cc = S.col[side];
        while (cc.pool.length < need) { var n = mkNode(); cc.pool.push(n); cc.el.appendChild(n.el); }
        for (i = 0; i < cc.pool.length; i++) { cc.pool[i].slot = null; cc.pool[i].el.style.display = 'none'; cc.pool[i].tf = cc.pool[i].op = cc.pool[i].gl = null; }
      }
      S.bokehTf = null;
      S.curSlot = null;
    },

    frame: function (f) {
      var S = this._s; if (!S || S.dead || !S.ready) return;
      var ctx = S.ctx, red = (f.reduced != null) ? f.reduced : ctx.reduced;
      var tbl = this._table(!!red);
      var t = clamp(f.t || 0, 0, S.duration);
      var sPos = posAt(t, tbl);

      // flash on snap cuts (not the first cut of a drop, which coincides with the big moment; not on seeks)
      if (!red && tbl.totalCuts) {
        var ci = cutIndexAt(t, tbl);
        if (S.lastT !== null && t >= S.lastT && t - S.lastT < 0.5 && ci > S.lastCut && S.lastCut >= 0) {
          var en = findEntry(tbl, t);
          if (ci - en.cutBase > 1 && ctx.flash) ctx.flash(S.cfg.flashStrength, S.cfg.flashDur);
        }
        S.lastCut = ci;
      } else S.lastCut = -1;
      S.lastT = t;

      var beat = red ? 0 : clamp(f.beat || 0, 0, 1);
      var P = S.pitch, vh = S.vh, half = vh / 2, side, k, i;
      var kLo = Math.ceil(sPos - S.span), kHi = Math.floor(sPos + S.span);
      for (side = 0; side < 2; side++) {
        var cc = S.col[side], pool = cc.pool, psz = pool.length, off = side ? P / 2 : 0;
        // hide nodes outside the window
        for (i = 0; i < psz; i++) {
          var nd = pool[i];
          if (nd.slot !== null && (nd.slot < kLo || nd.slot > kHi)) { nd.slot = null; nd.el.style.display = 'none'; nd.el.style.willChange = ''; }
        }
        for (k = kLo; k <= kHi; k++) {
          var n = pool[mod(k, psz)];
          if (n.slot !== k) assign(S, n, k, side);
          var y = half + (sPos - k) * P + off;            // item center, px from top of column
          var e = smooth(-0.35 * P, 0.65 * P, y);          // entry progress vs top edge
          var cd = Math.abs(y - half) / (0.5 * vh);        // distance from vertical center (0..1+)
          var w = cd < 1 ? (1 - cd) * (1 - cd) : 0;
          var sc = (0.9 + 0.1 * e) * (1 + beat * S.cfg.pulse * w);
          var tf = 'translate3d(' + n.ox + 'px,' + (Math.round(y * 4) / 4) + 'px,0) rotate(' + n.rest + 'deg) scale(' + (Math.round(sc * 500) / 500) + ')';
          if (tf !== n.tf) { n.tf = tf; n.el.style.transform = tf; }
          var op = Math.round(e * 100) / 100;
          if (op !== n.op) { n.op = op; n.el.style.opacity = op; }
          var gl = Math.round(clamp(0.6 + 0.4 * beat * (0.4 + 0.6 * w) + 0.1 * w, 0, 1) * 50) / 50;
          if (gl !== n.gl) { n.gl = gl; n.glow.style.opacity = gl; }
        }
      }

      // parallax bokeh (slower than the columns, moves down with them)
      var by = Math.round(((sPos * P * S.cfg.bokehParallax) % S.tile) * 2) / 2;
      var bt = 'translate3d(0,' + by + 'px,0)';
      if (bt !== S.bokehTf) { S.bokehTf = bt; S.bokeh.style.transform = bt; }

      // preload images approaching the entry edge (top) + drop ones far away
      var cur = Math.floor(sPos);
      if (cur !== S.curSlot) {
        S.curSlot = cur;
        var keepSet = {}, s2, q;
        for (s2 = 0; s2 < 2; s2++) for (q = cur - S.span - 1; q <= cur + S.span + 3; q++) {
          var pi = photoAt(S.cols, s2, q);
          keepSet[pi] = 1;
          if (q > cur + S.span - 1) loadImg(S, pi);
        }
        for (var key in S.keep) if (!keepSet[key]) delete S.keep[key];
      }
    },

    reset: function () { var S = this._s; if (S) { S.lastT = null; S.lastCut = -1; S.curSlot = null; } },
    onSeek: function () { var S = this._s; if (S) { S.lastT = null; S.lastCut = -1; S.curSlot = null; } }
  };

  /* ---------------- helpers ---------------- */
  var DOODLES = [
    '<svg viewBox="0 0 26 24"><path class="f" d="M13 21C6 15.5 2.5 12 3 8 3.5 4.5 8 3 11 6.5L13 9 15 6.5C18 3 22.5 4.5 23 8 23.5 12 20 15.5 13 21z"/></svg>',   // heart
    '<svg viewBox="0 0 26 26"><path d="M13 2.5L15.5 10 23.5 10.5 17 15 19.5 23 13 18.5 6.5 23 8.5 15 2.5 10.5 10.5 10z"/></svg>',                            // star
    '<svg viewBox="0 0 34 22"><path d="M2 14C9 6 18 18 30 9M30 9L23 6M30 9L26 16"/></svg>',                                                                  // arrow
    '<svg viewBox="0 0 26 26"><path d="M4 13C6 8 9 8 10 13S14 18 16 13 20 8 22 13"/><path d="M13 3V7M13 19V23M3 13H6"/></svg>'                                // squiggle + rays
  ];
  function el(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }
  function mkCol(cls) { return { el: el('div', cls), pool: [] }; }
  function mkNode() {
    var e = el('div', 'ph-node'), g = el('div', 'ph-glow'), im = document.createElement('img');
    im.className = 'ph-img'; im.decoding = 'async'; im.draggable = false;
    g.setAttribute('aria-hidden', 'true');
    var ta = el('span', 'ph-tape a'), tb = el('span', 'ph-tape b'), dd = el('div', 'ph-doodle');
    dd.setAttribute('aria-hidden', 'true');
    e.appendChild(g); e.appendChild(im); e.appendChild(ta); e.appendChild(tb); e.appendChild(dd);
    var cap = el('div', 'ph-cap'); cap.setAttribute('aria-hidden', 'true'); e.appendChild(cap);
    e.style.display = 'none';
    var node = { cap: cap, doodle: dd, el: e, glow: g, img: im, slot: null, photo: -1, tf: null, op: null, gl: null, rest: 0, ox: 0 };
    im.addEventListener('load', function () { if (node.slot !== null) im.classList.add('ph-ready'); });
    return node;
  }
  function assign(S, n, k, side) {
    var pi = photoAt(S.cols, side, k), z = S.sizes[pi], s = n.el.style, cw = S.cw;
    n.slot = k;
    s.width = z.fw + 'px'; s.height = z.fh + 'px';
    s.marginLeft = (-z.fw / 2) + 'px'; s.marginTop = (-z.fh / 2) + 'px';
    var im = n.img.style;
    im.left = z.pad + 'px'; im.top = z.pad + 'px'; im.width = z.pw + 'px'; im.height = z.ph + 'px';
    var room = Math.max(0, (cw - z.fw) / 2 - 2);
    n.ox = Math.round((hash(pi + 7 + side * 31) - 0.5) * 1.2 * room * 2) / 2;
    // uneven tilt, fixed per photo (hash of the index, never per frame)
    var mag = S.cfg.tiltMin + (S.cfg.tiltMax - S.cfg.tiltMin) * hash(pi + 31);
    n.rest = Math.round(((hash(pi + 57) < 0.5 ? 1 : -1) * mag) * 100) / 100;
    s.setProperty('--pad', z.pad + 'px'); s.setProperty('--padb', z.padB + 'px');
    if (n.photo !== pi) {
      n.photo = pi;
      n.el.dataset.photo = pi;
      n.el.className = 'ph-node tp-' + Math.floor(hash(pi + 3) * 5) + ' tc-' + Math.floor(hash(pi + 71) * 3);
      var dk = hash(pi + 91) < 0.4 ? Math.floor(hash(pi + 17) * 4) : -1;   // doodles on ~40% of the photos only
      n.doodle.className = dk < 0 ? 'ph-doodle' : 'ph-doodle dd-' + dk + ' dp-' + Math.floor(hash(pi + 29) * 4);
      n.doodle.innerHTML = dk < 0 ? '' : DOODLES[dk];
      var img = n.img;
      img.classList.remove('ph-ready');
      img.alt = 'Photo ' + (pi + 1) + ' of ' + S.N;
      setCap(S, n);
      img.src = S.photos[pi].src;
      if (img.complete && img.naturalWidth) img.classList.add('ph-ready');
    }
    n.tf = n.op = n.gl = null;
    s.display = 'block';
    s.willChange = 'transform, opacity';
  }
  // captions: captions.json {"file.jpg": "text"}; shown only when non-empty. Only touched on assign / once on load (no per-frame work).
  function setCap(S, n) {
    var p = S.photos[n.photo], key = p ? String(p.src).split('/').pop() : '';
    var t = (S.caps && S.caps[key]) || '';
    if (n.cap.textContent !== t) n.cap.textContent = t;
    n.cap.style.display = t ? '' : 'none';
  }
  function loadCaptions(S, c) {
    if (!c || !c.enabled || !c.src || typeof fetch !== 'function') return;
    try {
      fetch(c.src).then(function (r) { return r.ok ? r.json() : {}; }).then(function (j) {
        var any = false, k;
        for (k in j) if (typeof j[k] === 'string' && j[k].trim()) { S.caps[k] = j[k].trim(); any = true; }
        if (!any) return;
        S.col.forEach(function (c2) { c2.pool.forEach(function (n) { if (n.photo >= 0) setCap(S, n); }); });
      }).catch(function () {});
    } catch (e) {}
  }
  function loadImg(S, i) {
    if (i < 0 || i >= S.N) return Promise.resolve();
    if (S.keep[i]) return S.keep[i].p;
    var im = new Image(); im.decoding = 'async';
    var p = new Promise(function (res) {
      im.onload = function () { if (im.decode) im.decode().then(res, res); else res(); };
      im.onerror = function () { res(); };
    });
    im.src = S.photos[i].src;
    S.keep[i] = { img: im, p: p };
    return p;
  }

  G.Edit.modules.photos = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})();
