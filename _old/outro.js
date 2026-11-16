/* outro.js — the ending: (1) photo columns freeze, (2) small taped copies of ALL photos fly in and form a big heart behind the
   final message, which then slowly pulses, (3) "[X] days together" counts up, then a live h:m:s clock ticks under it.
   Everything is a pure function of f.t (seek/replay safe). Registers Edit.modules.outro. Classic script. */
(function () {
  'use strict';
  var G = typeof window !== 'undefined' ? window : globalThis;
  G.Edit = G.Edit || { modules: {} };
  G.Edit.modules = G.Edit.modules || {};

  var DEFAULTS = {
    heartAt: null, heartStagger: 0.12, heartFlyDur: 1.5, heartSizeFrac: 0.82, heartPulseAmp: 0.03, heartPulsePeriod: 3.6,
    heartPhotoScale: 1.3,     // photo size multiplier (1 = just touching on average; >1 overlaps a bit, scrapbook-style)
    heartCenterY: 0.47,       // heart center, fraction of the screen height
    countAt: null, countDur: 3.2, clockDelay: 0.5
  };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function hash(i) { var s = Math.sin(i * 12.9898 + 7.3) * 43758.5453; return s - Math.floor(s); }
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- heart geometry (pure; unit-testable) ---------------- */
  var CURVE = null;
  function curve() {   // dense polyline of the classic heart curve, y down; with arc-length table + bounds + area
    if (CURVE) return CURVE;
    var pts = [], n = 480, i, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (i = 0; i < n; i++) {
      var t = i / n * Math.PI * 2;
      var x = 16 * Math.pow(Math.sin(t), 3);
      var y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push([x, y]);
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    var len = [0], area = 0, cyN = 0;
    for (i = 1; i <= n; i++) {
      var a = pts[i - 1], b = pts[i % n];
      len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
      var cr = a[0] * b[1] - b[0] * a[1];
      area += cr; cyN += (a[1] + b[1]) * cr;
    }
    area /= 2;
    CURVE = { pts: pts, len: len, total: len[n], n: n, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cyBox: (minY + maxY) / 2,
              minY: minY, area: Math.abs(area), centroidY: cyN / (6 * area) };
    return CURVE;
  }
  function pointAt(C, frac) {   // point at fraction of arc length (wraps)
    var target = ((frac % 1) + 1) % 1 * C.total, lo = 0, hi = C.n;
    while (lo < hi - 1) { var m = (lo + hi) >> 1; if (C.len[m] <= target) lo = m; else hi = m; }
    var a = C.pts[lo], b = C.pts[(lo + 1) % C.n], seg = C.len[lo + 1] - C.len[lo] || 1, q = (target - C.len[lo]) / seg;
    return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q];
  }
  // -> { s: photo long-side px, pts: [{x,y}] (px, relative to heart center) }
  function heartLayout(vw, vh, N, frac, photoScale) {
    var C = curve(), s = 60, scale = 1, sy = 1, i;
    for (i = 0; i < 3; i++) {   // photos are centered on the outline, so the box shrinks by one photo size
      scale = Math.max(1, Math.min((vw * frac - s) / C.w, (vh * frac - s) / C.h));
      sy = Math.max(scale, Math.min(scale * 1.3, (vh * frac - s) / C.h));   // tall screens: stretch the heart a little taller
      s = clamp(Math.sqrt(C.area * scale * sy / Math.max(1, N)) * photoScale, 30, 170);
    }
    var rings = N <= 6 ? [1] : N <= 16 ? [1, 0.55] : [1, 0.64, 0.3], wsum = rings.reduce(function (a, b) { return a + b; }, 0), counts = [], left = N;
    rings.forEach(function (r, k) {
      var c = k === rings.length - 1 ? left : Math.round(N * r / wsum);
      c = Math.min(c, left); counts.push(c); left -= c;
    });
    var out = [];
    rings.forEach(function (r, k) {
      var c = counts[k];
      for (var j = 0; j < c; j++) {
        var p = pointAt(C, (j + 0.5) / c + (k === 1 ? 0.5 / c : k === 2 ? 0.08 : 0));
        // ring k = outline scaled toward the centroid
        var px = (p[0] - C.cx) * r, py = C.centroidY + (p[1] - C.centroidY) * r - C.cyBox;
        out.push({ x: px * scale, y: py * sy, ring: k });
      }
    });
    return { s: s, pts: out, scale: scale };
  }

  /* ---------------- module state ---------------- */
  var cfg, ctxRef, stage, layer, wrap, items = [], N = 0, photos = [], lastSize = '';
  var heartAt, countAt, tFull, shownLayer = false, loaded = false, lastWrap = '', reduced = false;
  var oc, ocDays, ocNum, ocLbl, ocClock, ocParts = [], lastNum = -1, lastLbl = '', lastSec = -1, lastOcOp = '', lastClkOp = '';
  var frozen = false;

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  /* ---- photo columns freeze: clamp the time photos.js sees (no edits to photos.js needed) ---- */
  function freezePhotos() {
    var P = G.Edit.modules.photos;
    if (!P || typeof P.frame !== 'function' || P._outroFrozen) return;
    var orig = P.frame;
    P.frame = function (f) {
      if (f && f.t > heartAt) f = Object.assign({}, f, { t: heartAt, beat: 0 });
      return orig.call(this, f);
    };
    P._outroFrozen = true;
  }

  /* ---- heart ---- */
  function buildHeart() {
    layer = el('div'); layer.id = 'outro-heart'; layer.setAttribute('aria-hidden', 'true');
    wrap = el('div', 'oh-wrap'); layer.appendChild(wrap);
    items = photos.map(function (ph, i) {
      var box = el('div', 'oh-ph'), im = el('img', 'oh-img');
      im.alt = ''; im.decoding = 'async'; im.draggable = false;
      var tapeA = el('span', 'oh-tape ' + (hash(i + 3) > 0.5 ? 'pink' : 'cream') + (hash(i + 9) > 0.5 ? ' j1' : ' j2'));
      var tapeB = el('span', 'oh-tape ' + (hash(i + 5) > 0.5 ? 'cream' : 'pink') + (hash(i + 11) > 0.5 ? ' j2' : ' j1'));
      box.appendChild(im); box.appendChild(tapeA);
      var two = hash(i + 21) > 0.35;      // not every photo gets the same tape job
      if (two) box.appendChild(tapeB);
      wrap.appendChild(box);
      return { box: box, img: im, ta: tapeA, tb: tapeB, two: two, tf: '', op: '' };
    });
    stage.insertBefore(layer, document.getElementById('texts') || null);
    layout();
  }
  function layout() {
    if (!layer) return;
    var vw = layer.clientWidth || G.innerWidth, vh = layer.clientHeight || G.innerHeight;
    if (!vw || !vh) return;
    var key = vw + 'x' + vh;
    if (key === lastSize) return;
    lastSize = key;
    var L = heartLayout(vw, vh, N, cfg.heartSizeFrac, cfg.heartPhotoScale), cx = vw / 2, cy = vh * cfg.heartCenterY, far = Math.max(vw, vh) * 0.8;
    wrap.style.transformOrigin = cx + 'px ' + cy + 'px';
    // deterministic shuffle so neighbours in the heart aren't neighbours in the photo order
    var order = photos.map(function (_, i) { return i; }).sort(function (a, b) { return hash(a + 40) - hash(b + 40); });
    items.forEach(function (it, i) {
      var pt = L.pts[order.indexOf(i)] || { x: 0, y: 0 }, ph = photos[i];
      var ar = (ph.w && ph.h) ? ph.w / ph.h : 0.75, pw = ar >= 1 ? L.s : L.s * ar, phh = pw / ar;
      var pad = Math.max(3, L.s * 0.05), padB = pad * 2.4, W = pw + 2 * pad, H = phh + pad + padB;
      var b = it.box.style, im = it.img.style;
      b.width = W + 'px'; b.height = H + 'px'; b.marginLeft = (-W / 2) + 'px'; b.marginTop = (-H / 2) + 'px';
      im.left = pad + 'px'; im.top = pad + 'px'; im.width = pw + 'px'; im.height = phh + 'px';
      var tw = Math.max(16, L.s * 0.42), th = Math.max(7, L.s * 0.15);
      [it.ta, it.tb].forEach(function (t, k) {
        var st = t.style, left = k === 0, jit = hash(i * 3 + k + 50);
        st.width = tw + 'px'; st.height = th + 'px';
        st.top = (-th * (0.35 + 0.25 * jit)) + 'px';
        if (it.two) { st[left ? 'left' : 'right'] = (-tw * (0.25 + 0.2 * hash(i + k + 70))) + 'px'; }
        else if (k === 0) { st.left = ((W - tw) / 2 + (jit - 0.5) * tw * 0.4) + 'px'; }
        st.transform = 'rotate(' + ((left ? -1 : 1) * (14 + 22 * hash(i + 80 + k)) * (it.two ? 1 : 0.2) + (jit - 0.5) * 8).toFixed(1) + 'deg)';
      });
      var a = hash(i + 100) * Math.PI * 2;
      it.tx = cx + pt.x; it.ty = cy + pt.y;
      it.fx = cx + Math.cos(a) * far; it.fy = cy + Math.sin(a) * far;
      it.rot = (hash(i + 120) - 0.5) * 2 * (3 + 7 * hash(i + 130));
      it.spin = (hash(i + 140) - 0.5) * 160;
      it.tf = ''; it.op = '';
    });
  }
  function loadImages() {
    if (loaded) return;
    loaded = true;
    items.forEach(function (it, i) { it.img.src = photos[i].src; });
  }
  function heartFrame(t) {
    var on = t >= heartAt - 0.001;
    if (!on) { if (shownLayer) { layer.style.display = 'none'; shownLayer = false; } return; }
    if (!shownLayer) { layer.style.display = 'block'; shownLayer = true; lastSize = ''; layout(); }
    for (var i = 0; i < items.length; i++) {
      var it = items[i], p = clamp((t - heartAt - i * cfg.heartStagger) / cfg.heartFlyDur, 0, 1), q = easeOut(p), tf, op;
      if (p <= 0) { if (it.op !== '0') { it.op = '0'; it.box.style.opacity = '0'; } continue; }
      if (reduced) { tf = 'translate3d(' + it.tx.toFixed(1) + 'px,' + it.ty.toFixed(1) + 'px,0) rotate(' + it.rot.toFixed(2) + 'deg)'; op = p.toFixed(2); }
      else {
        var x = it.fx + (it.tx - it.fx) * q, y = it.fy + (it.ty - it.fy) * q;
        tf = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + (it.rot + it.spin * (1 - q)).toFixed(2) + 'deg) scale(' + (0.55 + 0.45 * q).toFixed(3) + ')';
        op = Math.min(1, p * 5).toFixed(2);
      }
      if (tf !== it.tf) { it.tf = tf; it.box.style.transform = tf; }
      if (op !== it.op) { it.op = op; it.box.style.opacity = op; }
    }
    // slow pulse once everything has landed
    var w = 'none';
    if (!reduced && cfg.heartPulseAmp > 0 && t > tFull) {
      var x2 = (t - tFull) / cfg.heartPulsePeriod, ramp = clamp((t - tFull) / 1.5, 0, 1);
      w = 'scale(' + (1 + cfg.heartPulseAmp * ramp * (0.5 - 0.5 * Math.cos(x2 * Math.PI * 2))).toFixed(4) + ')';
    }
    if (w !== lastWrap) { lastWrap = w; wrap.style.transform = w; }
  }

  /* ---- days together ---- */
  function buildCounter() {
    var final = document.getElementById('final');
    if (!final) return;
    oc = el('div', 'oc'); oc.setAttribute('aria-hidden', 'true');
    ocDays = el('div', 'oc-days');
    ocNum = el('span', 'oc-num'); ocNum.textContent = '0';
    ocLbl = el('span', 'oc-lbl'); ocLbl.textContent = ' days together';
    ocDays.appendChild(ocNum); ocDays.appendChild(ocLbl);
    ocClock = el('div', 'oc-clock');
    ['h', 'm', 's'].forEach(function (u, i) {
      var b = el('span', 'oc-n'); b.textContent = '00'; ocParts.push(b);
      var l = el('span', 'oc-u'); l.textContent = u;
      ocClock.appendChild(b); ocClock.appendChild(l);
      if (i < 2) ocClock.appendChild(document.createTextNode(' '));
    });
    oc.appendChild(ocDays); oc.appendChild(ocClock);
    final.appendChild(oc);
  }
  function counterFrame(t) {
    if (!oc) return;
    var D = G.Edit.dates, k = clamp((t - countAt) / cfg.countDur, 0, 1);
    var o1 = clamp((t - countAt) / 0.7, 0, 1).toFixed(2);
    if (o1 !== lastOcOp) { lastOcOp = o1; ocDays.style.opacity = o1; }
    var clockAt = countAt + cfg.countDur + cfg.clockDelay, o2 = clamp((t - clockAt) / 0.9, 0, 1).toFixed(2);
    if (o2 !== lastClkOp) { lastClkOp = o2; ocClock.style.opacity = o2; ocClock.style.transform = 'translateY(' + ((1 - o2) * 6).toFixed(1) + 'px)'; }
    if (t < countAt - 0.01) { if (lastNum !== 0) { lastNum = 0; ocNum.textContent = '0'; } return; }
    var now = new Date(), target = D ? D.daysSince(now) : 0, v = Math.round(target * easeOut(k));
    if (reduced) v = target;
    if (v !== lastNum) {
      lastNum = v; ocNum.textContent = String(v);
      var lbl = v === 1 ? ' day together' : ' days together';
      if (lbl !== lastLbl) { lastLbl = lbl; ocLbl.textContent = lbl; }
    }
    if (+o2 > 0) {
      var sec = Math.floor(now.getTime() / 1000);
      if (sec !== lastSec) {   // time since anniversaryDate 00:00 local, past the whole days = just the time of day
        lastSec = sec;
        ocParts[0].textContent = pad2(now.getHours()); ocParts[1].textContent = pad2(now.getMinutes()); ocParts[2].textContent = pad2(now.getSeconds());
      }
    }
  }

  function clearCache() {
    lastNum = -1; lastLbl = ''; lastSec = -1; lastOcOp = ''; lastClkOp = ''; lastWrap = '';
    items.forEach(function (it) { it.tf = ''; it.op = ''; });
  }

  var M = {
    _test: { heartLayout: heartLayout, curve: curve },
    init: function (ctx) {
      ctxRef = ctx;
      var C = ctx.CONFIG || {}, T = C.times || {};
      cfg = Object.assign({}, DEFAULTS, C.outro || {});
      heartAt = cfg.heartAt != null ? cfg.heartAt : (T.outroStart != null ? T.outroStart : 260);
      countAt = cfg.countAt != null ? cfg.countAt : ((T.finalAt != null ? T.finalAt : 262) + 1.4);
      reduced = !!ctx.reduced;
      photos = C.photos || []; N = photos.length;
      stage = document.getElementById('stage');
      tFull = heartAt + Math.max(0, N - 1) * cfg.heartStagger + cfg.heartFlyDur;
      freezePhotos();
      buildCounter();
      if (stage && N) {
        buildHeart();
        layer.style.display = 'none';
        var pending = 0;
        G.addEventListener('resize', function () { if (pending) return; pending = requestAnimationFrame(function () { pending = 0; layout(); }); });
        G.addEventListener('orientationchange', function () { setTimeout(layout, 250); });
      }
    },
    frame: function (f) {
      var t = f.t;
      if (layer) {
        if (!loaded && t >= heartAt - 25) loadImages();
        heartFrame(t);
      }
      counterFrame(t);
    },
    reset: clearCache,
    onSeek: clearCache
  };
  G.Edit.modules.outro = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})();
