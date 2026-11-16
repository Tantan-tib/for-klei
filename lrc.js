/* lrc.js — LRC parsing / section building / serialising. Pure functions, no DOM. */
(function (root) {
  'use strict';

  function fmt(t) {
    var cs = Math.max(0, Math.round((+t || 0) * 100));
    var m = Math.floor(cs / 6000);
    var s = Math.floor((cs % 6000) / 100);
    var x = cs % 100;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + (x < 10 ? '0' : '') + x;
  }

  function typeOf(name) {
    var n = String(name == null ? '' : name).toLowerCase().replace(/[^a-z]/g, '');
    if (!n) return 'verse';
    if (n.indexOf('prechorus') === 0 || n === 'pre' || n.indexOf('prehook') === 0) return 'prechorus';
    if (n.indexOf('chorus') === 0 || n.indexOf('hook') === 0 || n.indexOf('refrain') === 0) return 'chorus';
    if (n.indexOf('verse') === 0) return 'verse';
    if (n.indexOf('build') === 0 || n.indexOf('riser') === 0) return 'build';
    if (n.indexOf('drop') === 0) return 'drop';
    if (n.indexOf('intro') === 0) return 'intro';
    if (n.indexOf('outro') === 0) return 'outro';
    return 'verse';
  }

  var STAMP = /^\s*((?:\[\d+:\d+(?:[.:]\d+)?\]\s*)+)(.*)$/;
  var ONE = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g;

  function parse(text) {
    text = String(text == null ? '' : text).replace(/^﻿/, '');
    var rows = text.split(/\r\n|\r|\n/);
    var entries = [], seq = 0, title = '';
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var tm = /^\s*\[ti:(.*)\]\s*$/i.exec(row);
      if (tm) { title = tm[1].trim(); continue; }
      var m = STAMP.exec(row);
      if (!m) continue;
      var body = m[2].replace(/^\s+|\s+$/g, '');
      if (!body) continue;
      var isMarker = body.charAt(0) === '@';
      var re = new RegExp(ONE.source, 'g'), s;
      while ((s = re.exec(m[1]))) {
        var t = parseInt(s[1], 10) * 60 + parseFloat(s[2].replace(':', '.'));
        if (!isFinite(t)) continue;
        entries.push({ t: t, marker: isMarker, text: body, seq: seq++ });
      }
    }
    entries.sort(function (a, b) {
      return (a.t - b.t) || ((a.marker ? 0 : 1) - (b.marker ? 0 : 1)) || (a.seq - b.seq);
    });
    var markers = [], lines = [];
    entries.forEach(function (e) {
      if (e.marker) {
        var name = e.text.slice(1).replace(/^\s+/, '');
        markers.push({ t: e.t, name: name, type: typeOf(name) });
      } else {
        lines.push({ t: e.t, text: e.text, section: markers.length - 1, end: 0 });
      }
    });
    for (var j = 0; j < lines.length; j++) {
      var L = lines[j], end = L.t + 4, ends = [];
      if (j + 1 < lines.length) ends.push(lines[j + 1].t);
      for (var k = 0; k < markers.length; k++) if (markers[k].t > L.t) { ends.push(markers[k].t); break; }
      if (ends.length) end = Math.min.apply(null, ends);
      L.end = end;
    }
    return { markers: markers, lines: lines, title: title };
  }

  // Sections come purely from the LRC markers (+ intro / outro). Synthetic instrumental build-ups are
  // inserted from CONFIG.times.buildups = [{ from: 185 }]: each runs until the next 'drop' marker and
  // swallows whatever markers/sections lie inside it (e.g. a tiny @Build stinger).
  function buildSections(parsed, CONFIG, duration) {
    var markers = (parsed && parsed.markers) || [], lines = (parsed && parsed.lines) || [];
    var T = (CONFIG && CONFIG.times) || {};
    duration = +duration || (CONFIG && CONFIG.duration) || 271;
    var outroStart = T.outroStart != null ? +T.outroStart : duration;
    outroStart = Math.min(Math.max(outroStart, 0), duration);
    var raw = [], i;
    var firstT = markers.length ? markers[0].t : outroStart;
    raw.push({ type: 'intro', name: 'Intro', start: 0, end: Math.min(firstT, outroStart) });
    for (i = 0; i < markers.length; i++) {
      var s = markers[i].t;
      if (s >= outroStart) break;
      var e = i + 1 < markers.length ? markers[i + 1].t : outroStart;
      raw.push({ type: markers[i].type, name: markers[i].name, start: s, end: Math.min(e, outroStart) });
    }
    // synthetic build-ups
    var bu = (T.buildups || []).map(function (b) { return +(b && b.from != null ? b.from : b); })
      .filter(function (x) { return isFinite(x) && x >= 0 && x < outroStart; }).sort(function (a, b) { return a - b; });
    bu.forEach(function (from) {
      var until = outroStart;
      for (var m = 0; m < markers.length; m++) if (markers[m].type === 'drop' && markers[m].t > from) { until = Math.min(markers[m].t, outroStart); break; }
      var next = [];
      raw.forEach(function (r) {
        if (r.end <= from || r.start >= until) { next.push(r); return; }
        if (r.start < from) next.push({ type: r.type, name: r.name, start: r.start, end: from });
        if (r.end > until) next.push({ type: r.type, name: r.name, start: until, end: r.end });
      });
      next.push({ type: 'build', name: 'Build-up (instrumental)', start: from, end: until, derived: true });
      next.sort(function (a, b) { return a.start - b.start; });
      raw = next;
    });
    raw.push({ type: 'outro', name: 'Outro', start: outroStart, end: duration });
    var out = [], dropNo = 0;
    raw.forEach(function (r) {
      if (!(r.end > r.start)) return;
      var sec = { index: out.length, type: r.type, name: r.name, start: r.start, end: r.end, hasLyrics: false, dropNo: 0, lineIdx: [] };
      if (r.derived) sec.derived = true;
      if (r.type === 'drop') sec.dropNo = ++dropNo;
      out.push(sec);
    });
    if (!out.length) out.push({ index: 0, type: 'intro', name: 'Intro', start: 0, end: duration, hasLyrics: false, dropNo: 0, lineIdx: [] });
    // exact contiguous coverage
    out[0].start = 0;
    for (i = 1; i < out.length; i++) out[i].start = out[i - 1].end;
    out[out.length - 1].end = duration;
    var q;
    for (var k = 0; k < lines.length; k++) {
      var lt = lines[k].t;
      for (q = 0; q < out.length; q++) {
        if (lt >= out[q].start && (lt < out[q].end || q === out.length - 1)) {
          out[q].lineIdx.push(k); out[q].hasLyrics = true;
          // end = min(next line, own section end)  (the section end is the next section boundary)
          var nextT = k + 1 < lines.length ? lines[k + 1].t : Infinity;
          lines[k].end = Math.max(lt, Math.min(nextT, out[q].end));
          lines[k].sec = q;
          break;
        }
      }
    }
    return out;
  }

  function serialize(parsed) {
    var all = [];
    ((parsed && parsed.markers) || []).forEach(function (m, i) { all.push({ t: m.t, k: 0, i: i, s: '@' + m.name }); });
    ((parsed && parsed.lines) || []).forEach(function (l, i) { all.push({ t: l.t, k: 1, i: i, s: l.text }); });
    all.sort(function (a, b) { return (a.t - b.t) || (a.k - b.k) || (a.i - b.i); });
    var out = ['[ti:' + ((parsed && parsed.title) || 'Clarity') + ']'];
    all.forEach(function (e) { out.push('[' + fmt(e.t) + ']' + e.s); });
    return out.join('\n') + '\n';
  }

  function parseTxt(txt) {
    var rows = String(txt == null ? '' : txt).replace(/^﻿/, '').split(/\r\n|\r|\n/);
    var items = [], junk = false;
    rows.forEach(function (raw) {
      var s = raw.replace(/^\s+|\s+$/g, '');
      if (!s) return;
      var tag = /^\[([^\]]+)\]$/.exec(s);
      if (tag) {
        junk = false;
        items.push({ kind: 'marker', name: tag[1].trim(), type: typeOf(tag[1]) });
        return;
      }
      if (/^you might also like$/i.test(s)) { junk = true; return; }
      if (junk) return;
      items.push({ kind: 'line', text: s });
    });
    return { items: items };
  }

  root.Edit = root.Edit || { modules: {} };
  root.Edit.modules = root.Edit.modules || {};
  root.Edit.LRC = { parse: parse, buildSections: buildSections, serialize: serialize, typeOf: typeOf, parseTxt: parseTxt, fmt: fmt };
})(typeof window !== 'undefined' ? window : globalThis);
