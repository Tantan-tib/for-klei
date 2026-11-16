/* debug.js — ?debug tools: time readout, seeking, lyric timing tapper, section tapper. Does nothing unless ctx.debug. */
(function () {
  'use strict';
  window.Edit = window.Edit || { modules: {} };
  Edit.modules = Edit.modules || {};

  var ctx = null, active = false, audio = null, LRC = null;
  var bar, timeEl, secEl, panel, body, modeBtns = {}, mode = null, lastTimeStr = '';
  var startT = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtClock(t) {
    var cs = Math.max(0, Math.round(t * 100));
    return Math.floor(cs / 6000) + ':' + pad(Math.floor((cs % 6000) / 100)) + '.' + pad(cs % 100);
  }
  function fmtLrc(t) { return LRC && LRC.fmt ? LRC.fmt(t) : (pad(Math.floor(t / 60)) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60).toFixed(2)); }
  function el(tag, cls, text, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function btn(label, fn, parent, cls) {
    var b = el('button', 'dbg-btn' + (cls ? ' ' + cls : ''), label, parent);
    b.type = 'button';
    b.addEventListener('click', function (ev) { ev.preventDefault(); try { fn(ev); } finally { b.blur(); } });
    return b;
  }
  function seekBy(d) {
    if (!audio) return;
    var dur = audio.duration || ctx.duration || 271;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + d), dur);
  }
  function nowT() { return audio ? audio.currentTime : 0; }

  function copyText(ta, btnEl) {
    var done = function () { if (btnEl) { var o = btnEl.textContent; btnEl.textContent = 'Copied!'; setTimeout(function () { btnEl.textContent = o; }, 1200); } };
    var fallback = function () { try { ta.focus(); ta.select(); document.execCommand('copy'); done(); } catch (e) {} };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fallback);
    else fallback();
  }
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- lyrics timing mode ---------------- */
  var T = { items: null, fb: [], stamps: [], pos: 0, hist: [], auto: true, loading: false, err: '', ui: {} };

  function tInitFallback() {
    var mi = 0, li = 0, prev = 0;
    T.fb = T.items.map(function (it) {
      var src = it.kind === 'marker' ? ctx.lrc.markers[mi++] : ctx.lrc.lines[li++];
      var t = src ? src.t : prev + 1;
      prev = t;
      return t;
    });
  }
  function tSkipAuto() {
    while (T.auto && T.pos < T.items.length - 1 && T.items[T.pos].kind === 'marker' && T.items[T.pos + 1].kind === 'line') T.pos++;
  }
  function tTime(i) {
    if (T.stamps[i] != null) return T.stamps[i];
    var it = T.items[i];
    if (T.auto && it.kind === 'marker' && T.items[i + 1] && T.items[i + 1].kind === 'line' && T.stamps[i + 1] != null) return Math.max(0, T.stamps[i + 1] - 0.05);
    return T.fb[i];
  }
  function tParsed() {
    var markers = [], lines = [], prev = -1;
    T.items.forEach(function (it, i) {
      var t = Math.max(tTime(i), prev + 0.01);
      prev = t;
      if (it.kind === 'marker') markers.push({ t: t, name: it.name, type: it.type });
      else lines.push({ t: t, text: it.text, section: markers.length - 1, end: t + 4 });
    });
    return { markers: markers, lines: lines, title: 'Clarity' };
  }
  function tRender() {
    var u = T.ui;
    if (!u.cur) return;
    if (!T.items) {
      u.cur.textContent = T.err || (T.loading ? 'loading lyrics...' : '');
      u.cur.className = 'dbg-cur';
      return;
    }
    var n = T.items.length;
    var show = function (node, i, markerCls) {
      var it = T.items[i];
      if (!it) { node.textContent = ''; return; }
      node.textContent = it.kind === 'marker' ? '[' + it.name + ']' : it.text;
    };
    show(u.prev, T.pos - 1); show(u.n1, T.pos + 1); show(u.n2, T.pos + 2);
    var it = T.items[T.pos];
    u.cur.textContent = it ? (it.kind === 'marker' ? '[' + it.name + ']' : it.text) : 'all stamped - copy the output below';
    u.cur.className = 'dbg-cur' + (it && it.kind === 'marker' ? ' mk' : '');
    u.prog.textContent = Math.min(T.pos + 1, n) + ' / ' + n + (it ? '   (tap Space / button at the moment it starts)' : '');
    u.ta.value = LRC.serialize(tParsed());
  }
  function tStamp() {
    if (!T.items || T.pos >= T.items.length) return;
    var t = nowT();
    T.hist.push({ pos: T.pos, idx: T.pos, t: t });
    T.stamps[T.pos] = t;
    T.pos++;
    tSkipAuto();
    tRender();
  }
  function tUndo() {
    if (!T.items || !T.hist.length) return;
    var h = T.hist.pop();
    T.stamps[h.idx] = null;
    T.pos = h.pos;
    if (audio) audio.currentTime = Math.max(0, h.t - 2);
    tRender();
  }
  function tReset() {
    T.stamps = []; T.hist = []; T.pos = 0; tSkipAuto(); tRender();
  }
  function tOpen() {
    body.textContent = '';
    var u = T.ui = {};
    var row = el('div', 'dbg-row', null, body);
    var lbl = el('label', 'dbg-lbl', null, row);
    var cb = el('input', null, null, lbl); cb.type = 'checkbox'; cb.checked = T.auto;
    el('span', null, 'auto-stamp section tags from the next lyric line', lbl);
    cb.addEventListener('change', function () { T.auto = cb.checked; if (T.items && T.hist.length === 0) { T.pos = 0; tSkipAuto(); } tRender(); cb.blur(); });
    u.prev = el('div', 'dbg-faint', '', body);
    u.cur = el('div', 'dbg-cur', '', body);
    u.n1 = el('div', 'dbg-faint', '', body);
    u.n2 = el('div', 'dbg-faint', '', body);
    u.prog = el('div', 'dbg-prog', '', body);
    var r2 = el('div', 'dbg-row', null, body);
    btn('TAP (Space)', tStamp, r2, 'big');
    btn('Undo (Bksp)', tUndo, r2);
    btn('Start over', function () { if (confirm('Discard all stamps?')) tReset(); }, r2);
    u.ta = el('textarea', 'dbg-ta', null, body);
    u.ta.readOnly = true; u.ta.spellcheck = false;
    var r3 = el('div', 'dbg-row', null, body);
    var cp = btn('Copy', function () { copyText(u.ta, cp); }, r3);
    btn('Download clarity.lrc', function () { download('clarity.lrc', u.ta.value); }, r3);
    el('div', 'dbg-note', 'Then save over lyrics/clarity.lrc. Unstamped items keep their current estimated times.', body);
    if (T.items) { tRender(); return; }
    if (T.loading) { tRender(); return; }
    T.loading = true; tRender();
    fetch(ctx.CONFIG.lyricsTxt).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (txt) {
        T.items = LRC.parseTxt(txt).items;
        tInitFallback(); T.stamps = new Array(T.items.length); T.pos = 0; tSkipAuto();
        T.loading = false; if (mode === 'lyrics') tRender();
      })
      .catch(function (e) { T.loading = false; T.err = 'could not load ' + ctx.CONFIG.lyricsTxt + ' (' + e.message + ') - serve over http'; if (mode === 'lyrics') tRender(); });
  }

  /* ---------------- section mode ---------------- */
  var S = { list: [], ui: {} };
  var SEC_BTNS = [
    { key: '1', label: 'Verse', type: 'verse' },
    { key: '2', label: 'Pre-Chorus', type: 'prechorus' },
    { key: '3', label: 'Chorus', type: 'chorus' },
    { key: '4', label: 'Build', type: 'build' },
    { key: '5', label: 'Drop', type: 'drop' },
    { key: '6', label: 'Intro-end (skip)', type: 'skip' },
    { key: '7', label: 'Outro', type: 'outro' }
  ];
  function sName(entry, idx) {
    if (entry.type !== 'verse') return entry.label;
    var c = 0;
    for (var i = 0; i <= idx; i++) if (S.list[i].type === 'verse') c++;
    return 'Verse ' + c;
  }
  function sRender() {
    var u = S.ui; if (!u.ta) return;
    var rows = [], marks = [], outro = null;
    S.list.forEach(function (e, i) {
      rows.push((i + 1) + '. ' + fmtLrc(e.t) + '  ' + (e.type === 'skip' ? '(intro ends)' : sName(e, i)));
      if (e.type === 'outro') outro = e.t;
      else if (e.type !== 'skip') marks.push('[' + fmtLrc(e.t) + ']@' + sName(e, i));
    });
    u.list.textContent = rows.join('\n');
    u.list.scrollTop = u.list.scrollHeight;
    var out = marks.join('\n');
    var bu = S.list.filter(function (e) { return e.type === 'build'; }).map(function (e) { return '{ from: ' + (Math.round(e.t * 100) / 100) + ' }'; });
    if (bu.length) out += (out ? '\n\n' : '') + 'buildups: [' + bu.join(', ') + ']';
    if (outro != null) out += (out ? '\n\n' : '') + 'outroStart: ' + (Math.round(outro * 100) / 100);
    u.ta.value = out;
  }
  function sTap(i) {
    var d = SEC_BTNS[i]; if (!d) return;
    S.list.push({ t: nowT(), type: d.type, label: d.label });
    sRender();
  }
  function sUndo() { S.list.pop(); sRender(); }
  function sOpen() {
    body.textContent = '';
    var u = S.ui = {};
    var row = el('div', 'dbg-row', null, body);
    SEC_BTNS.forEach(function (d, i) { btn(d.key + ' ' + d.label, function () { sTap(i); }, row); });
    var r2 = el('div', 'dbg-row', null, body);
    btn('Undo (Bksp)', sUndo, r2);
    btn('Clear', function () { S.list = []; sRender(); }, r2);
    u.list = el('pre', 'dbg-list', '', body);
    u.ta = el('textarea', 'dbg-ta', null, body); u.ta.readOnly = true; u.ta.spellcheck = false;
    var r3 = el('div', 'dbg-row', null, body);
    var cp = btn('Copy', function () { copyText(u.ta, cp); }, r3);
    el('div', 'dbg-note', 'Paste the marker lines into lyrics/clarity.lrc (replace the old @markers); put outroStart / buildups into CONFIG.times. The long instrumental build-up is NOT an lrc section: it is derived from CONFIG.times.buildups (from -> next @Drop) and swallows any @Build marker inside it, so tap "Build" at the moment the riser really starts.', body);
    var cs = (ctx.sections || []).filter(function (x) { return x.derived; });
    if (cs.length) el('div', 'dbg-note', 'Derived from CONFIG.times.buildups: ' + cs.map(function (x) { return x.name + ' ' + fmtLrc(x.start) + ' -> ' + fmtLrc(x.end); }).join('; '), body);
    sRender();
  }

  /* ---------------- panel / modes ---------------- */
  function setOpen(open) { panel.hidden = !open; modeBtns.toggle.textContent = open ? '▴' : '▾'; }
  function setMode(m) {
    if (mode === m && !panel.hidden) { mode = null; body.textContent = ''; markModes(); setOpen(false); return; }
    mode = m; setOpen(true);
    if (m === 'lyrics') tOpen(); else if (m === 'sections') sOpen(); else body.textContent = '';
    markModes();
  }
  function markModes() {
    modeBtns.lyrics.classList.toggle('on', mode === 'lyrics');
    modeBtns.sections.classList.toggle('on', mode === 'sections');
  }

  function onKey(e) {
    var tg = e.target, tag = tg && tg.tagName;
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable);
    if (e.key === 'Escape') { if (typing && tg.blur) tg.blur(); setOpen(false); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === 'ArrowLeft') { seekBy(-5); e.preventDefault(); }
    else if (k === 'ArrowRight') { seekBy(5); e.preventDefault(); }
    else if (k === 'l' || k === 'L') { setMode('lyrics'); }
    else if (k === 's' || k === 'S') { setMode('sections'); }
    else if (k === ' ' || e.code === 'Space') {
      if (mode === 'lyrics' && !panel.hidden) { e.preventDefault(); tStamp(); }
      else if (mode === 'sections' && !panel.hidden) e.preventDefault();
    }
    else if (k === 'Backspace') {
      if (mode === 'lyrics' && !panel.hidden) { e.preventDefault(); tUndo(); }
      else if (mode === 'sections' && !panel.hidden) { e.preventDefault(); sUndo(); }
    }
    else if (mode === 'sections' && !panel.hidden && k >= '1' && k <= '7') { e.preventDefault(); sTap(+k - 1); }
  }

  function applyStart() {
    if (startT == null || !audio) return;
    var dur = audio.duration || ctx.duration || 271;
    try { audio.currentTime = Math.min(Math.max(0, startT), dur); } catch (e) {}
  }

  Edit.modules.debug = {
    init: function (c) {
      if (!c || !c.debug) return;
      ctx = c; active = true; audio = c.audio; LRC = Edit.LRC;
      var root = (c.els && c.els.debugRoot) || document.getElementById('debug-root');
      if (!root) { active = false; return; }
      root.textContent = '';
      var q = /[?&]t=([\d.]+)/.exec(location.search);
      if (q) startT = parseFloat(q[1]);

      bar = el('div', 'dbg-bar', null, root);
      timeEl = el('span', 'dbg-time', '0:00.00', bar);
      secEl = el('span', 'dbg-sec', '', bar);
      modeBtns.toggle = btn('▾', function () { setOpen(panel.hidden); }, bar);
      panel = el('div', 'dbg-panel', null, root);
      panel.hidden = true;
      var row = el('div', 'dbg-row', null, panel);
      btn('◀ 5s', function () { seekBy(-5); }, row);
      btn('5s ▶', function () { seekBy(5); }, row);
      modeBtns.lyrics = btn('Lyrics timing (L)', function () { setMode('lyrics'); }, row);
      modeBtns.sections = btn('Sections (S)', function () { setMode('sections'); }, row);
      body = el('div', 'dbg-body', null, panel);
      if (window.innerWidth >= 600) setOpen(true); else setOpen(false);
      if (!panel.hidden) { /* wide screens: open, no mode yet */ }

      document.addEventListener('keydown', onKey);
      if (c.on) c.on('start', function () { applyStart(); });
      if (startT != null && audio) {
        if (audio.readyState >= 1) applyStart();
        else audio.addEventListener('loadedmetadata', applyStart, { once: true });
      }
    },
    frame: function (f) {
      if (!active) return;
      var s = fmtClock(f.t);
      if (s !== lastTimeStr) { lastTimeStr = s; timeEl.textContent = s; }
      var nm = f.sec ? f.sec.name : '';
      if (secEl.textContent !== nm) secEl.textContent = nm;
    },
    reset: function () {},
    onSeek: function () {}
  };
})();
