// Usage: node tools/make-lrc.js [--force]  (refuses to overwrite an existing clarity.lrc without --force) -> writes lyrics/clarity.lrc from lyrics/clarity-lyrics.txt (estimated timeline)
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = path.join(root, 'lyrics', 'clarity-lyrics.txt');
const dst = path.join(root, 'lyrics', 'clarity.lrc');
if (fs.existsSync(dst) && !process.argv.includes('--force')) {
  console.error('Refusing to overwrite ' + dst + ' (it holds your hand-timed lyrics).');
  console.error('Re-run with --force to regenerate the ESTIMATED timeline and lose your timings.');
  process.exit(1);
}

// same junk rules as Edit.LRC.parseTxt
const items = [];
let junk = false;
fs.readFileSync(src, 'utf8').replace(/^﻿/, '').split(/\r\n|\r|\n/).forEach(raw => {
  const s = raw.trim();
  if (!s) return;
  const tag = /^\[([^\]]+)\]$/.exec(s);
  if (tag) { junk = false; items.push({ marker: true, name: tag[1].trim() }); return; }
  if (/^you might also like$/i.test(s)) { junk = true; return; }
  if (junk) return;
  items.push({ marker: false, text: s });
});

// group into sections
const secs = [];
items.forEach(it => {
  if (it.marker) secs.push({ name: it.name, lines: [] });
  else if (secs.length) secs[secs.length - 1].lines.push(it.text);
});

// estimated windows [start, end), in order
const windows = [[12, 44], [44, 60], [60, 76], [76, 100], [100, 116], [116, 148], [148, 164], [164, 180], [180, 196], [196, 216], [216, 236]];
if (secs.length !== windows.length) throw new Error('expected ' + windows.length + ' sections, found ' + secs.length);

const fmt = t => {
  const cs = Math.round(t * 100), m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), x = cs % 100;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(x).padStart(2, '0');
};

const out = ['[ti:Clarity]'];
secs.forEach((sec, i) => {
  const [start, end] = windows[i];
  out.push('[' + fmt(start) + ']@' + sec.name);
  const n = sec.lines.length;
  if (!n) return;
  const isDrop = /^drop/i.test(sec.name);
  const a = start + 0.5;
  const b = isDrop ? start + 11.5 : end - 1.5;
  sec.lines.forEach((text, j) => {
    const t = n === 1 ? a : a + j * (b - a) / (n - 1);
    out.push('[' + fmt(t) + ']' + text);
  });
});
fs.writeFileSync(dst, out.join('\n') + '\n', 'utf8');
console.log('wrote', dst, '(' + out.length + ' entries)');
