/* lyrics.js — kinetic lyrics. Everything is a pure function of f.t (seek-safe). Text only comes from ctx.lrc.lines. */
(function () {
  'use strict';
  window.Edit = window.Edit || { modules: {} };
  Edit.modules = Edit.modules || {};

  var DEFAULTS = {
    nextLineOpacity: 0.35,
    maxLineHold: 9,      // a line never stays longer than this (s)
    tailHold: 5.5,       // a line with no following line in its section is cleared after this long (the "breath" before the next part)
    sweepFrac: 0.9,      // chorus sweep reaches the end at this fraction of the line duration
    popScale: 1.25,      // chorus last-word pop (hard cap; room for it is reserved in the layout)
    bassScale: 0.04,     // block scale per unit of f.beat
    fontMax: 48,         // px cap for the main line (desktop column)
    fontMin: 12,         // never shrink below this (a 3rd row is allowed only then)
    fontFrac: 0.105      // starting font size = column width * this
  };

  var ctx, cfg, lines = [], markers = [], lineType = [];
  var wrap, block, cur, nxt, lineCache = {};
  var curIdx = -2, curLine = null, nextShown = -2, wrapOn = false, lastIdxGuess = 0;
  var blockKey = '', lineKey = '', wrapType = '';
  var rootEl, rootH = 0, blockH = 0, push = 0, lastHB = 0;

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function expoOut(x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); }
  function backOut(x) { var c1 = 2.7, c3 = c1 + 1, y = x - 1; return 1 + c3 * y * y * y + c1 * y * y; }
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function findIdx(t) {
    var n = lines.length;
    if (!n) return -1;
    var g = lastIdxGuess;
    if (g >= 0 && g < n && lines[g].t <= t && (g + 1 >= n || lines[g + 1].t > t)) return g;
    var lo = 0, hi = n - 1, r = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lines[mid].t <= t) { r = mid; lo = mid + 1; } else hi = mid - 1;
    }
    lastIdxGuess = r;
    return r;
  }

  function buildLine(idx) {
    if (lineCache[idx]) return lineCache[idx];
    var text = lines[idx].text;
    var lineEl = el('div', 'ly-line');
    var parts = text.split(/\s+/).filter(Boolean);
    var words = [], total = 0, i;
    for (i = 0; i < parts.length; i++) total += parts[i].length + 1;
    var acc = 0;
    for (i = 0; i < parts.length; i++) {
      var w = el('span', 'ly-w', parts[i]);
      w.setAttribute('data-t', parts[i]);
      var b0 = acc / total; acc += parts[i].length + 1;
      words.push({ el: w, b0: b0, b1: acc / total, key: '', cr: '' });
      lineEl.appendChild(w);
      if (i < parts.length - 1) lineEl.appendChild(document.createTextNode(' '));
    }
    var entry = { el: lineEl, words: words, fs: 0, fitW: -1, fitType: '' };
    lineCache[idx] = entry;
    return entry;
  }

  // Fit to the center column: max 2 rows, font scaled to the column width, shrink-to-fit by measuring.
  function fit(entry, type) {
    var W = cur.clientWidth || wrap.clientWidth || 160;
    var kind = type === 'chorus' ? 'c' : 'n';
    if (entry.fitW === W && entry.fitType === kind) return;
    var S = Math.min(W * cfg.fontFrac, cfg.fontMax, window.innerHeight * 0.09, (rootEl ? rootEl.clientHeight : 9999) * 0.16) * (type === 'chorus' ? 0.9 : 1);
    S = Math.max(S, cfg.fontMin);
    block.style.setProperty('--ly-fs', S + 'px');
    var lastW = entry.words.length ? entry.words[entry.words.length - 1].el : null;
    for (var k = 0; k < 40; k++) {
      // reserve the room the popped last word grows into (scaled from its left edge), so it pushes nothing over its neighbours
      // reserve room for the pop; a last word that wrapped onto row 2 grows up into row 1, so it pops less there
      entry.pop = cfg.popScale;
      if (lastW) lastW.style.marginRight = kind === 'c' ? ((cfg.popScale - 1) * lastW.offsetWidth + 2).toFixed(1) + 'px' : '';
      if (kind === 'c' && lastW && entry.words.length > 1 && lastW.offsetTop > entry.words[0].el.offsetTop + 2) {
        entry.pop = 1 + (cfg.popScale - 1) * 0.4;
        lastW.style.marginRight = ((entry.pop - 1) * lastW.offsetWidth + 2).toFixed(1) + 'px';
      }
      var h = entry.el.offsetHeight;
      if (h <= S * 2.5 && entry.el.scrollWidth <= W + 1) break;
      if (S <= cfg.fontMin) break;           // last resort: 3 rows at the minimum size
      S = Math.max(cfg.fontMin, S * 0.93);
      block.style.setProperty('--ly-fs', S + 'px');
    }
    entry.fs = S; entry.fitW = W; entry.fitType = kind;
  }

  // keep the block below a big hero (core publishes --hero-bottom in px, relative to the column top)
  function applyPush(force) {
    var hb = rootEl ? (parseFloat(rootEl.style.getPropertyValue('--hero-bottom')) || 0) : 0;
    if (!force && Math.abs(hb - lastHB) < 0.5) return;
    lastHB = hb;
    var np = 0;
    if (hb > 0 && rootH > 0) {
      var top = rootH / 2 - blockH / 2;
      np = Math.max(0, Math.min(hb + 10 - top, rootH / 2 - blockH / 2 - 8));
    }
    if (Math.abs(np - push) > 0.4) { push = np; wrap.style.setProperty('--ly-push', np.toFixed(1) + 'px'); }
  }

  function setWrapOn(on) {
    if (on === wrapOn) return;
    wrapOn = on;
    wrap.classList.toggle('ly-on', on);
  }

  function show(idx, type) {
    curIdx = idx;
    lineKey = ''; blockKey = '';
    if (idx < 0) { curLine = null; setWrapOn(false); return; }
    var entry = buildLine(idx);
    curLine = entry;
    entry.words.forEach(function (w) { w.key = ''; w.cr = ''; });
    if (cur.firstChild !== entry.el) {
      while (cur.firstChild) cur.removeChild(cur.firstChild);
      cur.appendChild(entry.el);
    }
    if (wrapType !== type) {
      wrap.className = wrap.className.replace(/\bly-t-\w+/g, '').replace(/\s+/g, ' ').trim() + ' ly-t-' + type;
      wrapType = type;
    }
    fit(entry, type);
    block.style.setProperty('--ly-fs', entry.fs + 'px');
    // next line (same section only)
    var nx = (idx + 1 < lines.length && lines[idx + 1].section === lines[idx].section) ? lines[idx + 1].text : '';
    if (nextShown !== idx) { nxt.textContent = nx; nextShown = idx; }
    setWrapOn(true);
    rootH = rootEl ? rootEl.clientHeight : 0; blockH = block.offsetHeight;
    applyPush(true);
  }

  function setWord(w, a, y, sc, blur) {
    var key = a.toFixed(2) + '|' + y.toFixed(1) + '|' + sc.toFixed(3) + '|' + blur.toFixed(1);
    if (key === w.key) return;
    w.key = key;
    var s = w.el.style;
    s.opacity = a.toFixed(2);
    s.transform = (y || sc !== 1) ? 'translate3d(0,' + y.toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')' : 'none';
    s.filter = blur > 0.2 ? 'blur(' + blur.toFixed(1) + 'px)' : 'none';
  }

  function frame(f) {
    if (!ctx || !wrap) return;
    var t = f.t, reduced = !!f.reduced;
    var idx = -1, type = 'verse', L = null, end = 0;
    var st = f.sec ? f.sec.type : '';
    if (st !== 'intro' && st !== 'outro') {
      idx = findIdx(t);
      if (idx >= 0) {
        L = lines[idx];
        end = Math.min(L.end, L.t + cfg.maxLineHold);
        var nxl = lines[idx + 1];
        if (!nxl || nxl.section !== L.section || nxl.t > L.end + 1e-6) end = Math.min(end, L.t + cfg.tailHold);
        type = lineType[idx];
        if (t >= end || type === 'intro' || type === 'outro') idx = -1;
      }
    }
    if (idx !== curIdx) {
      var wasNew = idx >= 0 && (t - L.t) < 0.3;
      show(idx, type);
      if (idx >= 0 && type === 'drop' && f.playing && wasNew && !reduced && ctx.kick) ctx.kick(0.7);
    }
    if (idx < 0 || !curLine) return;
    applyPush(false);

    var words = curLine.words, n = words.length, i, w;
    var lt = t - L.t;
    var dur = Math.max(0.6, end - L.t);
    var dur0 = Math.min(dur, 6);
    var nl = lines[idx + 1];
    var exitA = (nl && nl.t <= end + 0.05) ? 1 : clamp((end - t) / 0.3, 0, 1);
    var sp = f.secProgress || 0;
    var lineScale = 1, ls = 0, lineOp = exitA;
    var intensity = 0.5;

    if (type === 'verse') {
      var spread = 0.6 * dur0;
      for (i = 0; i < n; i++) {
        var a = clamp((lt - (i / n) * spread) / 0.6, 0, 1); a = 1 - (1 - a) * (1 - a);
        setWord(words[i], a, reduced ? 0 : (1 - a) * 10, 1, reduced ? 0 : (1 - a) * 8);
      }
    } else if (type === 'prechorus') {
      intensity = 0.7;
      var spread2 = 0.28 * dur0, p = clamp(lt / dur, 0, 1);
      for (i = 0; i < n; i++) {
        var a2 = clamp((lt - (i / n) * spread2) / 0.32, 0, 1); a2 = 1 - (1 - a2) * (1 - a2);
        setWord(words[i], a2, reduced ? 0 : (1 - a2) * 8, 1, reduced ? 0 : (1 - a2) * 4);
      }
      if (!reduced) { lineScale = 0.96 + 0.08 * p; ls = Math.round((0.03 - 0.045 * p) * 100) / 100; }
    } else if (type === 'chorus') {
      intensity = 1;
      var spread3 = 0.15 * dur0;
      var s = clamp(lt / (dur * cfg.sweepFrac), 0, 1);
      for (i = 0; i < n; i++) {
        w = words[i];
        var a3 = clamp((lt - (i / n) * spread3) / 0.25, 0, 1);
        var sc = 1;
        if (i === n - 1 && !reduced) {
          var pt = (s * dur * cfg.sweepFrac - w.b0 * dur * cfg.sweepFrac) / 0.4;
          if (pt > 0) sc = Math.min(curLine.pop || cfg.popScale, 1 + ((curLine.pop || cfg.popScale) - 1) * backOut(clamp(pt, 0, 1)));
        }
        setWord(w, a3, reduced ? 0 : (1 - a3) * 8, sc, 0);
        var wp = clamp((s - w.b0) / (w.b1 - w.b0), 0, 1);
        var cr = (Math.round((1 - wp) * 200) / 2) + '%';
        if (cr !== w.cr) { w.cr = cr; w.el.style.setProperty('--cr', cr); }
        w.el.classList.toggle('ly-hot', i === n - 1 && wp > 0.001);
      }
    } else if (type === 'build') {
      intensity = 0.8 + 0.2 * sp;
      var spread4 = 0.5 * dur0 * (1 - 0.75 * sp);
      for (i = 0; i < n; i++) {
        var a4 = clamp((lt - (i / n) * spread4) / 0.3, 0, 1);
        setWord(words[i], a4, reduced ? 0 : (1 - a4) * 8, 1, reduced ? 0 : (1 - a4) * 5);
      }
    } else if (type === 'drop') {
      intensity = 1.6;
      var x = clamp(lt / 0.25, 0, 1), e = expoOut(x);
      for (i = 0; i < n; i++) setWord(words[i], 1, 0, 1, 0);
      lineOp = exitA * (reduced ? clamp(lt / 0.2, 0, 1) : clamp(e * 1.5, 0, 1));
      if (!reduced) {
        lineScale = 1 + 1.5 * (1 - e);
      }
    } else {
      for (i = 0; i < n; i++) setWord(words[i], 1, 0, 1, 0);
    }

    // line-level style (single write when changed)
    var lk = lineOp.toFixed(2) + '|' + lineScale.toFixed(3) + '|' + ls + '|' + (ls || 0);
    if (lk !== lineKey) {
      lineKey = lk;
      var ss = curLine.el.style;
      ss.opacity = lineOp.toFixed(2);
      ss.transform = lineScale !== 1 ? 'scale(' + lineScale.toFixed(3) + ')' : 'none';
      ss.letterSpacing = ls ? ls + 'em' : '';
    }

    // bass pulse on the whole block
    var bs = reduced ? 1 : 1 + (f.beat || 0) * cfg.bassScale * intensity;
    var bk = bs.toFixed(3);
    if (bk !== blockKey) { blockKey = bk; block.style.transform = bs === 1 ? 'none' : 'scale(' + bk + ')'; }
  }

  function snap() { curIdx = -2; nextShown = -2; lineKey = ''; blockKey = ''; }

  Edit.modules.lyrics = {
    init: function (c) {
      ctx = c;
      cfg = Object.assign({}, DEFAULTS, (c.CONFIG && c.CONFIG.lyrics) || {});
      lines = (c.lrc && c.lrc.lines) || [];
      markers = (c.lrc && c.lrc.markers) || [];
      lineType = lines.map(function (l) { var m = markers[l.section]; return m ? m.type : 'verse'; });
      var root = (c.els && c.els.lyricsRoot) || document.getElementById('lyrics-root');
      if (!root) return;
      rootEl = root;
      root.textContent = '';
      wrap = el('div', 'ly-wrap');
      wrap.style.setProperty('--ly-next-op', String(cfg.nextLineOpacity));
      wrap.appendChild(el('div', 'ly-scrim'));
      block = el('div', 'ly-block');
      cur = el('div', 'ly-cur');
      nxt = el('div', 'ly-next');
      block.appendChild(cur); block.appendChild(nxt);
      wrap.appendChild(block);
      root.appendChild(wrap);
      if (c.on) {
        c.on('seek', snap);
        c.on('reset', function () { snap(); });
      }
      var refit = function () { lineCache = {}; snap(); };
      window.addEventListener('resize', refit);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    },
    frame: frame,
    reset: snap,
    onSeek: snap
  };
})();
