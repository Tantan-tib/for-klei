/* pages.js — the page factory (BROWSE task). Builds ALL inner page contents for both song mode and browse mode.
   API: Book.pages.build({layout, mode}) -> {els, units, refs}; Book.pages.startDays(finaleRefs, {animate});
        Book.pages.ready (Promise: captions + letter text loaded); Book.pages.letter (string once loaded);
        Book.pages.fitLetter(refs); Book.pages.showUnit(unit, on); Book.pages.visibleUnits(innerIndex, layout).
   All sizes are in "u" = --pw / 100 (page width in px / 100), so the pages scale with the book. */
(function () {
  'use strict';
  var B = window.Book = window.Book || {};
  var C = B.CONFIG || {};
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------------- small helpers ---------------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function seeded(seed) {           // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function base(p) { return String(p || '').split('/').pop(); }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------------- data: captions + letter text (fetched once) ---------------- */
  var caps = null, letterTxt = null;
  var P = { letter: null };
  var pCaps = null, pLetter = null;

  function loadCaptions() {
    if (pCaps) return pCaps;
    var cc = C.captions || {};
    if (cc.enabled === false || !cc.src) { caps = {}; return (pCaps = Promise.resolve(caps)); }
    pCaps = fetch(cc.src, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (j) {
        caps = {};
        Object.keys(j || {}).forEach(function (k) { var v = String(j[k] == null ? '' : j[k]).trim(); if (v) caps[base(k)] = v; });
        // late fill for pages built before the fetch resolved
        var nodes = document.querySelectorAll('.pp-cap[data-file]');
        for (var i = 0; i < nodes.length; i++) applyCap(nodes[i]);
        return caps;
      });
    return pCaps;
  }
  function applyCap(node) {
    var t = caps && caps[node.getAttribute('data-file')];
    if (t) { node.textContent = t; node.parentNode && node.parentNode.classList.add('has-cap'); }
  }
  function loadLetter() {
    if (pLetter) return pLetter;
    var src = (C.letter && C.letter.src) || 'letter/letter.txt';
    pLetter = fetch(src, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
      .then(function (t) {
        letterTxt = String(t || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '').replace(/\s+$/, '');
        P.letter = letterTxt;
        var nodes = document.querySelectorAll('.pg-letter[data-fill="1"]');
        for (var i = 0; i < nodes.length; i++) fillLetter(nodes[i]);
        return letterTxt;
      });
    return pLetter;
  }
  function fillLetter(pl) {
    if (letterTxt == null) return;
    var typed = pl.querySelector('.lt-typed'), rest = pl.querySelector('.lt-rest');
    if (typed) typed.textContent = letterTxt;
    if (rest) rest.textContent = '';
    pl.classList.add('done');
    fitLetter(pl);
  }

  /* ---------------- doodles (inline SVG, hand-drawn look; colours via CSS) ---------------- */
  var D = {
    heart: '<svg viewBox="0 0 24 24"><path class="f" d="M12 21C4 14.5 2 9.5 5 6.4 8 3.5 11 5.2 12 8c1-2.8 4-4.5 7-1.6 3 3.100 1 8.100-7 14.600z"/></svg>',
    heartO: '<svg viewBox="0 0 24 24"><path d="M12 20.500C4.500 14.500 2.500 9.800 5.300 6.800 8 4 11 5.600 12 8.200c1-2.600 4-4.200 6.700-1.400 2.800 3 .8 7.700-6.700 13.700z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path class="f" d="M12 2.500l2.700 6.200 6.700.6-5.100 4.400 1.600 6.600L12 16.800l-5.900 3.500 1.600-6.600L2.600 9.300l6.700-.6z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24"><path d="M12 2c.8 5.500 3.500 9.200 10 10-6.500.8-9.200 4.500-10 10-.8-5.500-3.500-9.200-10-10 6.500-.8 9.200-4.500 10-10z"/></svg>',
    flower: '<svg viewBox="0 0 30 30"><path class="f" d="M15 15c-2-6-1-12 0-13 1 1 2 7 0 13zM15 15c6-2 12-1 13 0-1 1-7 2-13 0zM15 15c2 6 1 12 0 13-1-1-2-7 0-13zM15 15c-6 2-12 1-13 0 1-1 7-2 13 0z"/><circle cx="15" cy="15" r="2.600"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><ellipse class="f" cx="6.500" cy="18" rx="3.200" ry="2.600"/><ellipse class="f" cx="17.500" cy="16" rx="3.200" ry="2.600"/></svg>',
    squig: '<svg viewBox="0 0 60 14"><path d="M2 8c5-8 9 6 14-1s9 6 14-1 9 6 14-1 8 4 14-1"/></svg>',
    swirl: '<svg viewBox="0 0 100 14" preserveAspectRatio="none"><path pathLength="1" class="draw" d="M3 9C22 2 40 13 60 6s30 0 37 2"/></svg>',
    arrow: '<svg viewBox="0 0 40 24"><path d="M3 18C12 4 26 4 35 12M35 12l-8-1M35 12l-3 8"/></svg>',
    spiral: '<svg viewBox="0 0 30 30"><path d="M15 15c0-2 3-2 3 0s-4 4-6 1-1-8 4-9 10 3 9 9-5 10-12 9"/></svg>',
    balloon: function (fill) {
      return '<svg viewBox="0 0 30 56"><path d="M15 2C6 2 3 10 4 17s6 12 11 12 10-5 11-12S24 2 15 2z" style="fill:' + fill + '"/><path d="M13 29l2 3 2-3zM15 32c-3 5 3 8 0 12s-3 6-1 10" /><path class="hl" d="M9 8c-2 2-3 5-2.500 8"/></svg>';
    },
    cake: '<svg viewBox="0 0 60 56"><path class="f2" d="M6 50V32c0-3 2-5 5-5h38c3 0 5 2 5 5v18c0 2-2 3-4 3H10c-2 0-4-1-4-3z"/><path d="M6 36c4 4 7-3 11 1s7-3 11 1 7-3 11 1 7-2 10 0"/><path class="f" d="M12 27v-8c0-2 2-4 4-4h28c2 0 4 2 4 4v8"/><path d="M12 22c3 3 6-2 9 1s6-2 9 1 6-2 9 1 6-2 9 0"/><path d="M20 15v-7M30 15V6M40 15V8"/><path class="fl" d="M20 7c-2-3 0-5 0-6 2 1 2 4 0 6zM30 5c-2-3 0-5 0-6 2 1 2 4 0 6zM40 7c-2-3 0-5 0-6 2 1 2 4 0 6z"/></svg>',
    gift: '<svg viewBox="0 0 40 40"><rect class="f2" x="4" y="16" width="32" height="21" rx="2"/><rect class="f" x="2" y="10" width="36" height="8" rx="2"/><path d="M20 10v27M20 10c-6-8-12-3-8 0M20 10c6-8 12-3 8 0"/></svg>',
    film: '<svg viewBox="0 0 60 40"><rect class="f2" x="3" y="3" width="54" height="34" rx="3"/><rect x="11" y="9" width="38" height="22" rx="1"/><path d="M7 7v3M7 15v3M7 23v3M7 31v3M53 7v3M53 15v3M53 23v3M53 31v3"/><path class="f" d="M26 14l10 6-10 6z"/></svg>',
    cam: '<svg viewBox="0 0 40 30"><path class="f2" d="M3 9h8l3-5h12l3 5h8v18H3z"/><circle cx="20" cy="17" r="6"/><circle class="f" cx="20" cy="17" r="2.500"/></svg>'
  };
  function dd(name, cls, style, arg) {
    var d = el('div', 'dd ' + (cls || ''), typeof D[name] === 'function' ? D[name](arg) : D[name]);
    if (style) d.setAttribute('style', style);
    return d;
  }
  function bunting(side) {      // string across the top, flags hanging. side 'l' sags to the right edge, 'r' from the left edge
    var y0 = side === 'r' ? 15 : 7, y1 = side === 'l' ? 15 : 7;
    var cols = ['#f4a8c2', '#fff3c8', '#d9577f', '#fbd3e1', '#ffe0a8'];
    var s = '<svg viewBox="0 0 100 34" preserveAspectRatio="none" class="bunt"><path class="str" d="M-2 ' + y0 + ' Q50 ' + (Math.max(y0, y1) + 12) + ' 102 ' + y1 + '"/>';
    for (var i = 0; i < 7; i++) {
      var t = 0.09 + i * 0.136, mx = 50, my = Math.max(y0, y1) + 12;
      var x = (1 - t) * (1 - t) * -2 + 2 * (1 - t) * t * mx + t * t * 102;
      var y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
      s += '<path style="fill:' + cols[i % cols.length] + '" d="M' + (x - 4.600).toFixed(1) + ' ' + (y - 0.500).toFixed(1) + 'L' + (x + 4.600).toFixed(1) + ' ' + (y + 0.600).toFixed(1) + 'L' + x.toFixed(1) + ' ' + (y + 11).toFixed(1) + 'z"/>';
    }
    return s + '</svg>';
  }
  function bannerEl(side, cls) { var d = el('div', 'dd bunting ' + (cls || ''), bunting(side)); return d; }

  /* hand-lettered word: every letter its own span (.bm-in) with a little wobble */
  function letters(word, seed, opts) {
    opts = opts || {};
    var r = seeded(seed), cols = opts.cols || ['var(--ink,#4a2f3a)', 'var(--pink-deep,#d9577f)', 'var(--ink,#4a2f3a)', '#e87aa0', 'var(--ink,#4a2f3a)'];
    var out = '', n = 0;
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      if (ch === ' ') { out += '<span class="sp"></span>'; continue; }
      var rot = ((r() - 0.5) * 12).toFixed(1), dy = ((r() - 0.5) * 0.14).toFixed(2);
      out += '<span class="bm-l bm-in" style="--r:' + rot + 'deg;--dy:' + dy + 'em;--i:' + (n + (opts.delay || 0)) + ';color:' + cols[(i + (opts.off || 0)) % cols.length] + '">' + esc(ch) + '</span>';
      n++;
    }
    return out;
  }

  /* ---------------- page skeleton ---------------- */
  function mkPage(cls, extra) {
    var p = el('div', 'page pg ' + (cls || ''));
    p.appendChild(el('div', 'pg-in'));
    p._in = p.firstChild;
    return p;
  }

  /* ---------------- photo pages ---------------- */
  var TAPES = ['y', 'p', 'c', 'm', 'y', 'p'];
  var T1 = [
    [{ cx: 36, cy: 62, mw: 56, mh: 94, rot: -2.500 }],
    [{ cx: 38, cy: 66, mw: 54, mh: 90, rot: 2.800 }],
    [{ cx: 34, cy: 58, mw: 58, mh: 96, rot: -1.200 }]
  ];
  var T2 = [
    [{ cx: 29, cy: 35, mw: 47, mh: 60, rot: -4 }, { cx: 44, cy: 98, mw: 50, mh: 60, rot: 3 }],
    [{ cx: 43, cy: 34, mw: 50, mh: 58, rot: 3 }, { cx: 28, cy: 97, mw: 47, mh: 60, rot: -3.500 }],
    [{ cx: 34, cy: 39, mw: 49, mh: 66, rot: -5 }, { cx: 42, cy: 95, mw: 49, mh: 62, rot: 4 }],
    [{ cx: 40, cy: 33, mw: 52, mh: 56, rot: 1.800 }, { cx: 32, cy: 94, mw: 52, mh: 66, rot: -3 }]
  ];
  var T3 = [
    [{ cx: 25, cy: 29, mw: 38, mh: 46, rot: -5 }, { cx: 49, cy: 66, mw: 40, mh: 46, rot: 4 }, { cx: 28, cy: 104, mw: 42, mh: 46, rot: -2 }],
    [{ cx: 38, cy: 35, mw: 52, mh: 60, rot: 2.500 }, { cx: 22, cy: 98, mw: 36, mh: 44, rot: -5 }, { cx: 52, cy: 102, mw: 34, mh: 44, rot: 5 }],
    [{ cx: 24, cy: 31, mw: 34, mh: 44, rot: -4 }, { cx: 52, cy: 35, mw: 34, mh: 44, rot: 5 }, { cx: 38, cy: 93, mw: 54, mh: 60, rot: -1.500 }]
  ];
  var DOODLE_SPOTS = [
    ['heart', 'left:5%;bottom:11%;width:9%;transform:rotate(-12deg)'],
    ['star', 'right:6%;top:6%;width:9%;transform:rotate(10deg)'],
    ['sparkle', 'right:7%;bottom:12%;width:8%'],
    ['flower', 'left:6%;top:5%;width:11%;transform:rotate(-8deg)'],
    ['squig', 'left:10%;bottom:9%;width:18%;transform:rotate(-4deg)'],
    ['note', 'right:6%;bottom:10%;width:8%;transform:rotate(8deg)']
  ];

  function frameRatio(ph) { return 0.92 * ph.h / ph.w + 0.04 + 0.15; }   // frame height / frame width

  function mkPolaroid(ph, slot, idx, rnd, cap) {
    var ratio = frameRatio(ph);
    var W = Math.min(slot.mw, slot.mh / ratio);
    var tape = TAPES[Math.floor(rnd() * TAPES.length)];
    var kind = Math.floor(rnd() * 4);   // tape placement
    var n = el('div', 'pp tc-' + tape + ' tk-' + kind);
    var rot = slot.rot + (rnd() - 0.5) * 2;
    n.style.cssText = 'width:calc(var(--u)*' + W.toFixed(2) + ');left:' + (slot.cx / 0.72).toFixed(2) + '%;top:' + (slot.cy / 1.389).toFixed(2) + '%;--rot:' + rot.toFixed(2) + 'deg;z-index:' + (idx + 1);
    var im = el('img', 'pp-img');
    im.alt = '';
    im.decoding = 'async';
    im.draggable = false;
    im.src = ph.src;
    im.style.aspectRatio = ph.w + ' / ' + ph.h;
    im.addEventListener('load', function () { im.classList.add('ready'); });
    if (im.complete && im.naturalWidth) im.classList.add('ready');
    n.appendChild(im);
    n.appendChild(el('i', 'pp-tape a'));
    n.appendChild(el('i', 'pp-tape b'));
    var c = el('div', 'pp-cap');
    c.setAttribute('data-file', base(ph.src));
    if (cap) { c.textContent = cap; n.classList.add('has-cap'); }
    n.appendChild(c);
    return n;
  }

  function buildPhotoPage(list, pageNo, mirror) {
    var p = mkPage('pg-photos');
    var r = seeded(1000 + pageNo * 77);
    var T = list.length === 1 ? T1 : list.length === 2 ? T2 : T3;
    var tpl = T[(pageNo + Math.floor(r() * 3)) % T.length];
    // sort slots so the biggest photo gets the biggest slot not needed: keep order, but swap portrait/landscape when it helps
    var nodes = [];
    for (var i = 0; i < list.length; i++) {
      var slot = Object.assign({}, tpl[i]);
      if (mirror) { slot.cx = 72 - slot.cx; slot.rot = -slot.rot; }
      var node = mkPolaroid(list[i], slot, i, r, list[i].caption);
      p._in.appendChild(node);
      nodes.push(node);
    }
    return { page: p, nodes: nodes };
  }

  /* ---------------- letter page ---------------- */
  function buildLetterPage(mode, single) {
    var p = mkPage('pg-letterpg');
    var pl = el('div', 'pg-letter');
    var t = el('div', 'lt-text');
    var typed = el('span', 'lt-typed'), cur = el('span', 'lt-cursor'), rest = el('span', 'lt-rest');
    t.appendChild(typed); t.appendChild(cur); t.appendChild(rest);
    pl.appendChild(t);
    p._in.appendChild(el('i', 'lt-tape'));
    p._in.appendChild(pl);
    if (mode === 'browse') {
      pl.setAttribute('data-fill', '1');
      if (letterTxt != null) fillLetter(pl); else loadLetter();
    }
    // keep it fitted whenever the page or its text changes size
    if (window.ResizeObserver) {
      var busy = false, lastW = 0;
      var ro = new ResizeObserver(function () {
        if (busy) return;
        busy = true;
        requestAnimationFrame(function () { busy = false; fitLetter(pl); });
      });
      ro.observe(pl); ro.observe(t);
    }
    return { page: p, letter: pl, text: t, cursor: cur };
  }

  var FIT = { min: 2.2, max: 4.4 };
  function fitLetter(pl) {
    if (!pl || !pl.isConnected || !pl.clientHeight || !pl.firstChild) return;
    if (pl._fitting) return;
    pl._fitting = true;
    var lo = FIT.min, hi = FIT.max, best = lo;
    var key = pl.clientWidth + 'x' + pl.clientHeight + ':' + pl.firstChild.textContent.length + ':' + (document.fonts && document.fonts.status);
    if (pl._fitKey === key) { pl._fitting = false; return; }
    pl._fitKey = key;
    for (var i = 0; i < 9; i++) {
      var mid = (lo + hi) / 2;
      pl.style.setProperty('--lk', mid.toFixed(3));
      if (pl.scrollHeight <= pl.clientHeight + 1) { best = mid; lo = mid; } else hi = mid;
    }
    pl.style.setProperty('--lk', best.toFixed(3));
    pl._fitting = false;
  }

  /* ---------------- lyrics page (double only) ---------------- */
  function buildLyricsPage() {
    var p = mkPage('pg-lyricspg');
    // decorated by Book.doodles (hand-drawn flowers, "for klei" note, taped heart, pressed flower) in build()
    return { page: p, lyrics: null };
  }

  /* ---------------- big moments ---------------- */
  function buildBirthday(single, left) {
    var pages = [];
    function frame(side) { var p = mkPage('pg-bm pg-birthday' + (side ? ' side-' + side : '')); return p; }
    var colA = ['var(--ink,#4a2f3a)', 'var(--pink-deep,#d9577f)', 'var(--ink,#4a2f3a)', '#e87aa0'];
    if (single) {
      var p = frame('');
      p._in.appendChild(bannerEl('l', 'bm-bunt bm-in'));
      var w = el('div', 'bm-words');
      w.appendChild(el('div', 'bm-word w1', letters('HAPPY', 11, { cols: colA })));
      w.appendChild(el('div', 'bm-word w2', letters('BIRTHDAY', 12, { cols: colA, off: 2, delay: 5 })));
      w.appendChild(el('div', 'bm-draw bm-in u1', D.swirl));
      p._in.appendChild(w);
      p._in.appendChild(dd('balloon', 'bm-in bl a', 'left:5%;bottom:20%;width:15%;transform:rotate(-8deg)', '#f4a8c2'));
      p._in.appendChild(dd('balloon', 'bm-in bl b', 'left:17%;bottom:14%;width:12%;transform:rotate(6deg)', '#ffe0a8'));
      p._in.appendChild(dd('cake', 'bm-in ck', 'right:8%;bottom:11%;width:30%;transform:rotate(3deg)'));
      p._in.appendChild(dd('star', 'bm-in sx a', 'right:8%;top:23%;width:8%;transform:rotate(14deg)'));
      p._in.appendChild(dd('heart', 'bm-in sx b', 'left:8%;top:25%;width:8%;transform:rotate(-12deg)'));
      p._in.appendChild(dd('sparkle', 'bm-in sx c', 'right:38%;bottom:12%;width:6%'));
      pages.push(p);
    } else {
      var a = frame('l'), b = frame('r');
      a._in.appendChild(bannerEl('l', 'bm-bunt bm-in'));
      var wa = el('div', 'bm-words');
      wa.appendChild(el('div', 'bm-word w1', letters('HAPPY', 11, { cols: colA })));
      wa.appendChild(el('div', 'bm-draw bm-in u1', D.swirl));
      a._in.appendChild(wa);
      a._in.appendChild(dd('balloon', 'bm-in bl a', 'left:7%;bottom:15%;width:17%;transform:rotate(-8deg)', '#f4a8c2'));
      a._in.appendChild(dd('balloon', 'bm-in bl b', 'left:22%;bottom:10%;width:13%;transform:rotate(7deg)', '#ffe0a8'));
      a._in.appendChild(dd('balloon', 'bm-in bl c', 'left:34%;bottom:16%;width:15%;transform:rotate(-3deg)', '#fbd3e1'));
      a._in.appendChild(dd('star', 'bm-in sx a', 'left:8%;top:27%;width:8%;transform:rotate(-12deg)'));
      a._in.appendChild(dd('heart', 'bm-in sx b', 'right:10%;top:29%;width:7%;transform:rotate(10deg)'));
      b._in.appendChild(bannerEl('r', 'bm-bunt bm-in'));
      var wb = el('div', 'bm-words');
      wb.appendChild(el('div', 'bm-word w2', letters('BIRTHDAY', 12, { cols: colA, off: 2, delay: 5 })));
      wb.appendChild(el('div', 'bm-draw bm-in u2', D.swirl));
      b._in.appendChild(wb);
      b._in.appendChild(dd('cake', 'bm-in ck', 'right:12%;bottom:12%;width:34%;transform:rotate(3deg)'));
      b._in.appendChild(dd('gift', 'bm-in gf', 'left:10%;bottom:11%;width:16%;transform:rotate(-6deg)'));
      b._in.appendChild(dd('star', 'bm-in sx a', 'right:9%;top:27%;width:8%;transform:rotate(14deg)'));
      b._in.appendChild(dd('sparkle', 'bm-in sx c', 'left:10%;top:28%;width:7%'));
      b._in.appendChild(dd('heart', 'bm-in sx b', 'left:38%;bottom:11%;width:7%;transform:rotate(-10deg)'));
      pages.push(a, b);
    }
    return pages;
  }

  function buildMonthsary(single) {
    var pages = [], n = B.dates && B.dates.monthsElapsed ? B.dates.monthsElapsed() : 0;
    var cols = ['var(--pink-deep,#d9577f)', 'var(--ink,#4a2f3a)', '#e87aa0', 'var(--ink,#4a2f3a)'];
    function sub() {
      var s = el('div', 'bm-sub bm-in', 'month <b>' + n + '</b>');
      return s;
    }
    if (single) {
      var p = mkPage('pg-bm pg-monthsary');
      p._in.appendChild(bannerEl('l', 'bm-bunt bm-in'));
      var w = el('div', 'bm-words');
      w.appendChild(el('div', 'bm-word w1', letters('HAPPY', 21, { cols: cols })));
      w.appendChild(el('div', 'bm-word w3', letters('MONTHSARY', 22, { cols: cols, off: 1, delay: 5 })));
      w.appendChild(sub());
      w.appendChild(el('div', 'bm-draw bm-in u1', D.swirl));
      p._in.appendChild(w);
      p._in.appendChild(dd('heart', 'bm-in sx a', 'left:8%;bottom:17%;width:14%;transform:rotate(-12deg)'));
      p._in.appendChild(dd('heart', 'bm-in sx b', 'right:9%;bottom:20%;width:10%;transform:rotate(10deg)'));
      p._in.appendChild(dd('flower', 'bm-in sx c', 'left:38%;bottom:10%;width:13%;transform:rotate(8deg)'));
      p._in.appendChild(dd('star', 'bm-in sx d', 'right:10%;top:23%;width:8%;transform:rotate(12deg)'));
      p._in.appendChild(dd('sparkle', 'bm-in sx e', 'left:9%;top:25%;width:7%'));
      pages.push(p);
    } else {
      var a = mkPage('pg-bm pg-monthsary side-l'), b = mkPage('pg-bm pg-monthsary side-r');
      a._in.appendChild(bannerEl('l', 'bm-bunt bm-in'));
      var wa = el('div', 'bm-words');
      wa.appendChild(el('div', 'bm-word w1', letters('HAPPY', 21, { cols: cols })));
      wa.appendChild(el('div', 'bm-draw bm-in u1', D.swirl));
      a._in.appendChild(wa);
      a._in.appendChild(dd('heart', 'bm-in sx a', 'left:9%;bottom:15%;width:19%;transform:rotate(-12deg)'));
      a._in.appendChild(dd('heart', 'bm-in sx b', 'left:30%;bottom:10%;width:11%;transform:rotate(10deg)'));
      a._in.appendChild(dd('flower', 'bm-in sx c', 'right:11%;bottom:14%;width:15%;transform:rotate(8deg)'));
      a._in.appendChild(dd('sparkle', 'bm-in sx e', 'left:10%;top:28%;width:8%'));
      b._in.appendChild(bannerEl('r', 'bm-bunt bm-in'));
      var wb = el('div', 'bm-words');
      wb.appendChild(el('div', 'bm-word w3', letters('MONTHSARY', 22, { cols: cols, off: 1, delay: 5 })));
      wb.appendChild(sub());
      wb.appendChild(el('div', 'bm-draw bm-in u2', D.swirl));
      b._in.appendChild(wb);
      b._in.appendChild(dd('heart', 'bm-in sx a', 'right:10%;bottom:14%;width:14%;transform:rotate(12deg)'));
      b._in.appendChild(dd('star', 'bm-in sx d', 'right:9%;top:28%;width:8%;transform:rotate(12deg)'));
      b._in.appendChild(dd('flower', 'bm-in sx c', 'left:11%;bottom:12%;width:13%;transform:rotate(-8deg)'));
      b._in.appendChild(dd('heart', 'bm-in sx b', 'left:32%;bottom:9%;width:8%;transform:rotate(-10deg)'));
      pages.push(a, b);
    }
    return pages;
  }

  /* ---------------- montage ---------------- */
  function buildMontage(single, mode) {
    var mc = C.montage || {};
    var pages = [];
    var frame = el('div', 'mt-frame');
    var print = el('div', 'mt-print');
    var v = document.createElement('video');
    v.className = 'mt-video';
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.playsInline = true; v.preload = 'auto'; v.controls = false; v.loop = false;
    v.disablePictureInPicture = true;
    v.setAttribute('disableremoteplayback', '');
    v.poster = mc.poster || '';
    v.src = mc.src || '';
    print.appendChild(v);
    var tape = el('div', 'mt-tape');
    tape.appendChild(el('i', 'mt-tp a')); tape.appendChild(el('i', 'mt-tp b'));
    var hit = el('div', 'mt-hit');
    var cap = el('div', 'mt-cap');
    cap.appendChild(el('span', 'mt-ctext', esc(mc.caption || '')));
    cap.appendChild(el('span', 'mt-cdate', esc(mc.date || '')));
    frame.appendChild(print); frame.appendChild(tape); frame.appendChild(hit); frame.appendChild(cap);
    if (mode === 'browse') frame.classList.add('browse');

    var vp = mkPage('pg-montage ' + (single ? 'single' : 'side-r'));
    var holder = el('div', 'mt-holder'); holder.appendChild(frame);
    vp._in.appendChild(holder);
    vp._in.appendChild(dd('heart', 'mt-dd a', 'right:7%;bottom:9.500%;width:7%;transform:rotate(10deg)'));
    vp._in.appendChild(dd('sparkle', 'mt-dd b', 'left:8%;top:6%;width:7%'));
    if (single) {
      pages.push(vp);
    } else {
      var lp = mkPage('pg-montage side-l');
      var t = el('div', 'mt-title');
      t.appendChild(el('div', 'mt-t1 bm-in', 'a little'));
      t.appendChild(el('div', 'mt-t2 bm-in', 'movie'));
      t.appendChild(el('div', 'mt-t3 bm-in', 'of us'));
      lp._in.appendChild(t);
      lp._in.appendChild(dd('film', 'mt-dd f1 bm-in', 'left:9%;bottom:16%;width:30%;transform:rotate(-7deg)'));
      lp._in.appendChild(dd('cam', 'mt-dd f2 bm-in', 'right:11%;bottom:20%;width:22%;transform:rotate(6deg)'));
      lp._in.appendChild(dd('arrow', 'mt-dd f3 bm-in', 'right:14%;top:35%;width:20%;transform:rotate(-8deg)'));
      lp._in.appendChild(dd('star', 'mt-dd f4 bm-in', 'left:12%;top:8%;width:8%;transform:rotate(-12deg)'));
      lp._in.appendChild(dd('heart', 'mt-dd f5 bm-in', 'right:10%;top:9%;width:7%;transform:rotate(10deg)'));
      pages.push(lp, vp);
    }
    return { pages: pages, page: vp, frame: frame, video: v, tape: tape, caption: cap, hit: hit };
  }

  /* ---------------- finale ---------------- */
  function buildFinale(single) {
    var nm = String(C.name || 'klei').toLowerCase();
    var msg = el('div', 'fin-msg');
    msg.appendChild(el('div', 'fin-l1 bm-in', 'happy birthday'));
    msg.appendChild(el('div', 'fin-l2 bm-in', '&amp; happy monthsary,'));
    msg.appendChild(el('div', 'fin-l3 bm-in', esc(nm) + ' <span class="hh">&hearts;</span>'));
    var days = el('div', 'fin-days');
    days.appendChild(el('div', 'fd-pre bm-in', 'we have been together for'));
    var big = el('div', 'fd-big bm-in');
    var num = el('span', 'fd-num', '0');
    var lbl = el('span', 'fd-lbl', ' days');
    big.appendChild(num); big.appendChild(lbl);
    days.appendChild(big);
    days.appendChild(el('div', 'bm-draw bm-in fd-line', D.swirl));
    days.appendChild(el('div', 'fd-post bm-in', 'and counting&hellip;'));
    var pages = [], refs;
    if (single) {
      var p = mkPage('pg-fin single');
      p._in.appendChild(msg); p._in.appendChild(days);
      p._in.appendChild(dd('heart', 'bm-in fd a', 'left:8%;top:6%;width:9%;transform:rotate(-12deg)'));
      p._in.appendChild(dd('star', 'bm-in fd b', 'right:9%;bottom:10%;width:8%;transform:rotate(12deg)'));
      p._in.appendChild(dd('flower', 'bm-in fd c', 'left:9%;bottom:10%;width:11%;transform:rotate(-6deg)'));
      pages.push(p);
    } else {
      var a = mkPage('pg-fin side-l'), b = mkPage('pg-fin side-r');
      a._in.appendChild(msg); b._in.appendChild(days);
      a._in.appendChild(dd('heart', 'bm-in fd a', 'left:9%;top:7%;width:9%;transform:rotate(-12deg)'));
      a._in.appendChild(dd('flower', 'bm-in fd c', 'left:10%;bottom:12%;width:13%;transform:rotate(-6deg)'));
      a._in.appendChild(dd('sparkle', 'bm-in fd d', 'right:10%;bottom:14%;width:8%'));
      b._in.appendChild(dd('star', 'bm-in fd b', 'right:9%;top:8%;width:8%;transform:rotate(12deg)'));
      b._in.appendChild(dd('heart', 'bm-in fd a', 'left:10%;bottom:12%;width:10%;transform:rotate(10deg)'));
      pages.push(a, b);
    }
    return { pages: pages, daysEl: num, numEl: num, lblEl: lbl, root: pages[0] };
  }

  /* ---------------- days counter ---------------- */
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function setDays(f, v) {
    f.numEl.textContent = String(v);
    f.lblEl.textContent = v === 1 ? ' day' : ' days';
  }
  function startDays(f, opts) {
    if (!f || !f.numEl) return;
    opts = opts || {};
    if (f._raf) cancelAnimationFrame(f._raf);
    var target = B.dates && B.dates.daysSince ? B.dates.daysSince() : 0;
    var animate = opts.animate !== false && !reduced;
    if (!animate || !target) { setDays(f, target); f.counted = true; return; }
    var dur = (opts.dur || 3.2) * 1000, t0 = performance.now();
    setDays(f, 0);
    (function tick(now) {
      var k = clamp(((now || performance.now()) - t0) / dur, 0, 1);
      setDays(f, Math.round(target * easeOut(k)));
      if (k < 1) f._raf = requestAnimationFrame(tick); else { f._raf = 0; f.counted = true; }
    })(t0);
  }

  /* ---------------- build ---------------- */
  var cacheBuilt = [];
  function build(o) {
    o = o || {};
    var single = o.layout === 'single', mode = o.mode === 'browse' ? 'browse' : 'song';
    loadCaptions(); if (mode === 'browse') loadLetter();
    var order = C.pageOrder || [];
    var perPage = (C.photosPerPage || []).slice();
    var photosAll = (C.photos || []).slice();
    var pi = 0, photoPageNo = 0;
    var els = [], units = [];
    var refs = { lyricsPage: null, letterPage: null, letterText: null, cursor: null, montage: null, birthday: null, monthsary: null, finale: null, mode: mode, layout: single ? 'single' : 'double' };

    function add(unit, pageList) {
      unit.idx = [];
      pageList.forEach(function (p) { unit.idx.push(els.length); els.push(p); });
      unit.pages = pageList;
      unit.el = unit.el || {};
      unit.el.root = pageList[0];
      unit.el.pages = pageList;
      units.push(unit);
    }

    order.forEach(function (kind, ui) {
      var unit = { kind: kind, idx: [], photos: [], el: {}, i: ui };
      if (kind === 'letter') {
        var L = buildLetterPage(mode, single);
        refs.letterPage = L.page; refs.letterText = L.text; refs.cursor = L.cursor; refs.letterBox = L.letter;
        unit.el.letter = L.letter;
        if (single) { refs.lyricsPage = null; add(unit, [L.page]); }
        else { var Y = buildLyricsPage(); refs.lyricsPage = Y.page; refs.lyricsEl = Y.lyrics; unit.el.lyrics = Y.lyrics; add(unit, [Y.page, L.page]); }
      } else if (kind === 'birthday') {
        var bp = buildBirthday(single); refs.birthday = { pages: bp }; add(unit, bp);
      } else if (kind === 'monthsary') {
        var mp = buildMonthsary(single); refs.monthsary = { pages: mp }; add(unit, mp);
      } else if (kind === 'montage') {
        var M = buildMontage(single, mode);
        refs.montage = { page: M.page, pages: M.pages, frame: M.frame, video: M.video, tape: M.tape, caption: M.caption, hit: M.hit };
        unit.el.montage = refs.montage;
        add(unit, M.pages);
      } else if (kind === 'finale') {
        var F = buildFinale(single); refs.finale = F; unit.el.finale = F; add(unit, F.pages);
      } else if (kind === 'photos') {
        var pgs = [];
        for (var k = 0; k < 2; k++) {
          var cnt = clamp(perPage[photoPageNo] == null ? 2 : perPage[photoPageNo], 0, 3);
          var list = [];
          for (var q = 0; q < cnt && pi < photosAll.length; q++, pi++) {
            var ph = photosAll[pi];
            list.push({ src: ph.src, w: ph.w || 900, h: ph.h || 1200, caption: caps ? (caps[base(ph.src)] || '') : '' });
          }
          unit.photos = unit.photos.concat(list);
          var bp2 = buildPhotoPage(list, photoPageNo, (photoPageNo % 3) === 1);
          pgs.push(bp2.page);
          photoPageNo++;
        }
        add(unit, pgs);
      }
    });

    // side classes + show-mirroring across the pages of one unit
    els.forEach(function (p, i) {
      p.classList.add(single ? 'pg-s' : (i % 2 === 0 ? 'pg-l' : 'pg-r'));
    });
    units.forEach(function (u) {
      if (u.pages.length > 1) {
        var root = u.pages[0];
        var mo = new MutationObserver(function () {
          var on = root.classList.contains('show');
          u.pages.forEach(function (p) { if (p !== root) p.classList.toggle('show', on); });
        });
        mo.observe(root, { attributes: true, attributeFilter: ['class'] });
        u.mo = mo;
      }
    });

    if (B.doodles && B.doodles.decorateBuilt) B.doodles.decorateBuilt({ els: els, units: units, refs: refs }, { layout: single ? 'single' : 'double', mode: mode });
    loadCaptions().then(function () { els.forEach(function (p) { var ns = p.querySelectorAll('.pp-cap[data-file]'); for (var i = 0; i < ns.length; i++) applyCap(ns[i]); }); });
    if (mode === 'browse') loadLetter().then(function () { if (refs.letterBox) fillLetter(refs.letterBox); });
    // finale days: static final number in browse until it's shown
    if (refs.finale) setDays(refs.finale, 0);
    return { els: els, units: units, refs: refs };
  }

  /* which units are visible when `cur` (inner index of the visible/left page) is shown */
  function visibleUnits(built, cur, layout) {
    var vis = layout === 'single' ? [cur] : [cur, cur + 1];
    return built.units.filter(function (u) { return u.idx.some(function (i) { return vis.indexOf(i) >= 0; }); });
  }
  function showUnit(u, on) { if (u && u.el && u.el.root) u.el.root.classList.toggle('show', on !== false); }

  B.pages = {
    build: build,
    startDays: startDays,
    fitLetter: function (refs) { if (refs && refs.letterBox) { refs.letterBox._fitKey = ''; fitLetter(refs.letterBox); } },
    visibleUnits: visibleUnits,
    showUnit: showUnit,
    get ready() { return Promise.all([loadCaptions(), loadLetter()]); },
    get letter() { return P.letter; }
  };
  loadCaptions();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
    var ns = document.querySelectorAll('.pg-letter'); for (var i = 0; i < ns.length; i++) fitLetter(ns[i]);
  });
})();
