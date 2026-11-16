/* doodles.js — hand-drawn pencil/ink doodle library (DOODLES task).
   API  Book.doodles.decorate(pageEl, {kind, seed, layout, side, mode})   kind: letter|lyricsPage|photos|birthday|monthsary|montage|finale
        Book.doodles.decorateBuilt(built, {layout, mode})                  (called by pages.js build(): decorates every page + wires draw-on)
        Book.doodles.cover('front'|'back')  -> svg markup string (book.js puts it inside the cover)
        Book.doodles.bg(el)                 -> faint sketch flowers/hearts in #bg
        Book.doodles.reveal(pageEl)         -> run the draw-on of one page (first time only)
        Book.doodles.prim.*                 -> primitives (heart, daisy, tulip, leaf, sprig, garland, vine, star, sparkle, swirl, arrow, dots, petals, pressed, tape)
        Book.doodles.svg(inner, opts), Book.doodles.rng(seed)
   Every shape is generated in PAGE UNITS (viewBox 0 0 100 138.9) with a seeded PRNG, so the layout is identical on every visit.
   Strokes carry pathLength=1 + class "dw" (draw-on via stroke-dashoffset); pencil fills carry class "pf" (fade in after the lines). */
(function () {
  'use strict';
  var B = window.Book = window.Book || {};
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 100, H = 138.9, TAU = Math.PI * 2, DEG = Math.PI / 180;
  var K = { ink: '#4a2f3a', plum: '#5a2d45', pink: '#d9577f', pinkL: '#f4a8c2', butter: '#f7e08a', sage: '#a9c5a0', sageD: '#86a67f', cream: '#fff6ea', rose: '#c98a9a', moss: '#8f966c' };

  /* ---------------- tiny utils ---------------- */
  function rng(seed) {   // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function n2(v) { return Math.round(v * 100) / 100; }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  var SEQ = 0, STEP = 0.032, MAXD = 3.4;     // draw-on stagger: every stroke gets its own delay
  var FORCE = null;
  function dl() { var d = FORCE != null ? FORCE : Math.min(SEQ * STEP, MAXD); SEQ++; return ' style="--dl:' + d.toFixed(2) + 's"'; }
  function P(d, c, w, op) {                   // ink stroke (draws itself)
    return '<path class="dw" pathLength="1" d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + n2(w || .45) + '"' + (op != null && op < 1 ? ' stroke-opacity="' + op + '"' : '') + dl() + '/>';
  }
  function F(d, c, op) {                      // soft colored-pencil fill (fades in)
    return '<path class="pf" d="' + d + '" fill="' + c + '" fill-opacity="' + (op == null ? .55 : op) + '"' + dl() + '/>';
  }

  /* ---------------- geometry ---------------- */
  function xf(pts, cx, cy, s, a) {
    var c = Math.cos(a * DEG), si = Math.sin(a * DEG);
    return pts.map(function (p) { var x = p[0] * s, y = p[1] * s; return [cx + x * c - y * si, cy + x * si + y * c]; });
  }
  function jit(pts, r, a) { return pts.map(function (p) { return [p[0] + (r() - .5) * a, p[1] + (r() - .5) * a]; }); }
  function smooth(p, closed) {
    var n = p.length; if (n < 2) return '';
    function g(i) { return closed ? p[((i % n) + n) % n] : p[Math.max(0, Math.min(n - 1, i))]; }
    var d = 'M' + n2(p[0][0]) + ' ' + n2(p[0][1]), m = closed ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += 'C' + n2(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + n2(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + n2(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + n2(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + n2(p2[0]) + ' ' + n2(p2[1]);
    }
    return d;
  }
  function rough(p, closed, r, bend) {   // straight-ish pencil edges with a little bow
    var n = p.length, d = 'M' + n2(p[0][0]) + ' ' + n2(p[0][1]), m = closed ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var a = p[i], b = p[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, o = (r() - .5) * (bend == null ? .12 : bend) * L;
      d += 'Q' + n2((a[0] + b[0]) / 2 - dy / L * o) + ' ' + n2((a[1] + b[1]) / 2 + dx / L * o) + ' ' + n2(b[0] + (closed && i === m - 1 ? (r() - .5) * .3 : 0)) + ' ' + n2(b[1]);
    }
    return d;
  }
  function bbox(p) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; p.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }); return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 }; }
  /* a closed shape drawn the way a hand does it: slightly wobbly, the end overshoots the start */
  function loop(p, r, jv) { var q = jit(p, r, jv), e = jit([p[0], p[1]], r, jv * 1.6); return smooth(q.concat([[e[0][0], e[0][1]], [e[1][0], e[1][1]]]), false); }
  function closedD(p, r, jv) { return smooth(jit(p, r, jv), true); }
  /* diagonal hatch lines inside a polygon (colored-pencil look) */
  function hatch(poly, angDeg, gap, r, inset) {
    var a = angDeg * DEG, c = Math.cos(-a), s = Math.sin(-a), ca = Math.cos(a), sa = Math.sin(a);
    var q = poly.map(function (p) { return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; }), bb = bbox(q), d = '';
    for (var y = bb.y0 + gap * (.3 + r() * .5); y < bb.y1; y += gap * (.85 + r() * .3)) {
      var xs = [];
      for (var i = 0; i < q.length; i++) {
        var A = q[i], Bp = q[(i + 1) % q.length];
        if ((A[1] <= y && Bp[1] > y) || (Bp[1] <= y && A[1] > y)) xs.push(A[0] + (y - A[1]) * (Bp[0] - A[0]) / (Bp[1] - A[1]));
      }
      xs.sort(function (u, v) { return u - v; });
      for (var j = 0; j + 1 < xs.length; j += 2) {
        var x1 = xs[j] + (inset || 0) + r() * gap * .3, x2 = xs[j + 1] - (inset || 0) - r() * gap * .3;
        if (x2 - x1 < gap * .5) continue;
        var yy = y + (r() - .5) * gap * .25;
        d += 'M' + n2(x1 * ca - yy * sa) + ' ' + n2(x1 * sa + yy * ca) + 'L' + n2(x2 * ca - (yy + (r() - .5) * .3) * sa) + ' ' + n2(x2 * sa + (yy + (r() - .5) * .3) * ca);
      }
    }
    return d;
  }
  function stemPts(x0, y0, x1, y1, amp, waves, r, n) {
    n = n || 14;
    var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, ph = r() * TAU, pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, off = amp * Math.sin(ph + t * waves * TAU) + (r() - .5) * amp * .18;
      pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
    }
    return pts;
  }
  function at(pts, t) {
    var n = pts.length - 1, f = Math.max(0, Math.min(.9999, t)) * n, i = Math.floor(f), u = f - i, a = pts[i], b = pts[i + 1];
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, a: Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG };
  }

  /* ---------------- primitives (all return svg markup, coordinates in page units) ---------------- */
  var HB = (function () {   // heart outline, normalised to width 1, centred
    var a = [], n = 22, i, t;
    for (i = 0; i < n; i++) { t = Math.PI + i / n * TAU; a.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]); }
    var b = bbox(a);
    return a.map(function (p) { return [(p[0] - (b.x0 + b.x1) / 2) / b.w, (p[1] - (b.y0 + b.y1) / 2) / b.w]; });
  })();

  /* heart: o = {fill: colour, hatch: colour, dbl: bool, c: ink colour, w: stroke width} ; s = width in units */
  function heart(r, cx, cy, s, rot, o) {
    o = o || {};
    var c = o.c || K.plum, w = o.w || Math.max(.3, s * .045), pts = xf(HB, cx, cy, s, rot), out = '';
    if (o.fill) out += F(closedD(xf(HB, cx + s * .03, cy + s * .035, s * .96, rot + 3), r, s * .03), o.fill, .55);
    if (o.hatch) out += P(hatch(xf(HB, cx, cy, s * .84, rot), -40 + r() * 10, Math.max(.7, s * .1), r, s * .02), o.hatchC || K.pink, Math.max(.2, w * .55), .8);
    out += P(loop(pts, r, s * .02), c, w);
    if (o.dbl) out += P(loop(xf(HB, cx, cy, s * 1.14, rot + 2), r, s * .03), c, w * .6, .85);
    else if (s > 7) out += P(loop(jit(pts, r, s * .03), r, s * .015), c, w * .4, .45);
    return out;
  }
  function petalShape(r) { return [[.16, 0], [.42, -.2 - r() * .04], [.78, -.2 - r() * .04], [1, 0], [.78, .2 + r() * .04], [.42, .2 + r() * .04]]; }
  /* daisy: n petals around (cx,cy), radius s */
  function daisy(r, cx, cy, s, rot, o) {
    o = o || {};
    var n = o.n || 8, out = '', fills = '', lines = '', i, step = 360 / n;
    for (i = 0; i < n; i++) {
      var ps = xf(petalShape(r), cx, cy, s * (.9 + r() * .2), rot + i * step + (r() - .5) * 10);
      lines += loop(ps, r, s * .03);
      if (o.fill) fills += closedD(xf(petalShape(r), cx + s * .04, cy + s * .03, s * .92, rot + i * step + 4), r, s * .04);
    }
    if (o.fill) out += F(fills, o.fill, o.fillOp || .5);
    out += P(lines, o.c || K.plum, o.w || Math.max(.28, s * .05));
    var cc = [], k;
    for (k = 0; k < 8; k++) { var t = k / 8 * TAU; cc.push([Math.cos(t) * .22 * (.9 + r() * .2), Math.sin(t) * .22 * (.9 + r() * .2)]); }
    var cpts = xf(cc, cx, cy, s, 0);
    out += F(closedD(cpts, r, s * .02), o.center || K.butter, .85);
    out += P(loop(cpts, r, s * .02), o.c || K.plum, Math.max(.25, s * .04));
    return out;
  }
  /* five-dot wildflower */
  function dotFlower(r, cx, cy, s, rot, o) {
    o = o || {};
    var d = '', fd = '', i;
    for (i = 0; i < 5; i++) {
      var a = (rot + i * 72) * DEG, px = cx + Math.cos(a) * s * .34, py = cy + Math.sin(a) * s * .34, rr = s * .27, ring = [];
      for (var k = 0; k < 7; k++) { var t = k / 7 * TAU; ring.push([px + Math.cos(t) * rr, py + Math.sin(t) * rr]); }
      d += loop(ring, r, s * .03);
      if (o.fill) fd += closedD(ring.map(function (q) { return [q[0] + s * .03, q[1] + s * .03]; }), r, s * .03);
    }
    var out = '';
    if (o.fill) out += F(fd, o.fill, .6);
    out += P(d, o.c || K.plum, Math.max(.26, s * .06));
    var cn = []; for (i = 0; i < 6; i++) { var tt = i / 6 * TAU; cn.push([cx + Math.cos(tt) * s * .1, cy + Math.sin(tt) * s * .1]); }
    return out + F(closedD(cn, r, s * .02), K.butter, .95) + P(loop(cn, r, s * .015), o.c || K.plum, .25);
  }
  function leaf(r, x, y, len, ang, o) {
    o = o || {};
    var base = [[0, 0], [.22, -.17], [.6, -.2], [1, 0], [.6, .17], [.22, .14]], wd = o.wide || 1;
    base = base.map(function (p) { return [p[0], p[1] * wd]; });
    var pts = xf(base, x, y, len, ang), out = '';
    if (o.fill !== false) out += F(rough(xf(base, x + len * .03, y + len * .03, len * .96, ang + 2), true, r, .14), o.fill || K.sage, .6);
    if (o.hatch) out += P(hatch(xf(base, x, y, len * .9, ang), 55, Math.max(.6, len * .12), r, len * .02), K.sageD, .22, .7);
    out += P(rough(pts, true, r, .16), o.c || K.plum, o.w || Math.max(.26, len * .045));
    var vein = xf([[.08, 0], [.45, -.01 * (r() - .5)], [.8, 0]], x, y, len, ang);
    out += P(smooth(vein, false), o.c || K.plum, Math.max(.2, len * .025), .8);
    return out;
  }
  function stem(r, pts, c, w) { return P(smooth(pts, false), c || K.plum, w || .42) + P(smooth(jit(pts, r, .35), false), c || K.plum, (w || .42) * .5, .45); }
  function tulip(r, bx, by, h, ang, o) {      // base of stem at (bx,by), grows up (rotated by ang)
    o = o || {};
    var lean = (r() - .5) * h * .18, out = '';
    var sp = xf([[0, 0], [lean * .4, -h * .2], [lean, -h * .45], [lean * .8, -h * .66]], bx, by, 1, ang);
    var top = sp[sp.length - 1], w = h * .17, ch = h * .3, ca = ang + lean * -2;
    // leaves first (behind the cup)
    out += leaf(r, sp[1][0], sp[1][1], h * .5, ang - 62 + (r() - .5) * 14, { wide: .85 });
    out += leaf(r, sp[0][0] + (sp[1][0] - sp[0][0]) * .5, sp[0][1] + (sp[1][1] - sp[0][1]) * .5, h * .46, ang - 118 + (r() - .5) * 14, { wide: .85 });
    out += stem(r, sp, K.plum, Math.max(.3, h * .03));
    var cup = [[-1, -.9], [-.5, -.5], [0, -1.05], [.5, -.5], [1, -.9], [.98, -.3], [.55, .08], [0, .16], [-.55, .08], [-.98, -.3]].map(function (p) { return [p[0] * w, p[1] * ch + ch * .3]; });
    var cp = xf(cup, top[0], top[1], 1, ang + lean * -1.5);
    out += F(rough(xf(cup, top[0] + w * .1, top[1] + w * .08, .95, ang + 2 + lean * -1.5), true, r, .1), o.fill || K.pinkL, .62);
    if (o.hatch !== false) out += P(hatch(xf(cup, top[0], top[1], .86, ang + lean * -1.5), -50, Math.max(.6, h * .045), r, .15), K.pink, Math.max(.2, h * .018), .85);
    out += P(rough(cp, true, r, .1), o.c || K.plum, Math.max(.3, h * .032));
    out += P(smooth(xf([[-.5, -.45], [-.1, -.2], [0, .05]].map(function (p) { return [p[0] * w, p[1] * ch + ch * .3]; }), top[0], top[1], 1, ang), false), o.c || K.plum, Math.max(.2, h * .02), .7);
    return out;
  }
  function star(r, cx, cy, s, rot, o) {
    o = o || {};
    var pts = [], i;
    for (i = 0; i < 10; i++) { var a = (i * 36 - 90) * DEG, rr = i % 2 ? .45 : 1; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    var p = xf(pts, cx, cy, s, rot), out = '';
    if (o.fill) out += F(rough(xf(pts, cx + s * .06, cy + s * .05, s * .9, rot + 4), true, r, .1), o.fill, .6);
    return out + P(rough(p, true, r, .12), o.c || K.plum, o.w || Math.max(.28, s * .07));
  }
  function sparkle(r, cx, cy, s, rot, o) {
    o = o || {};
    var c = o.c || K.pink, w = o.w || Math.max(.3, s * .1), a = rot * DEG, out = '';
    function line(ang, l) { var ca = Math.cos(a + ang), sa = Math.sin(a + ang); return 'M' + n2(cx - ca * l) + ' ' + n2(cy - sa * l) + 'Q' + n2(cx + (r() - .5) * s * .1) + ' ' + n2(cy + (r() - .5) * s * .1) + ' ' + n2(cx + ca * l * (.9 + r() * .2)) + ' ' + n2(cy + sa * l * (.9 + r() * .2)); }
    out += P(line(0, s) + line(Math.PI / 2, s * .8), c, w);
    out += P(line(Math.PI / 4, s * .38) + line(-Math.PI / 4, s * .38), c, w * .7, .8);
    return out;
  }
  function swirl(r, cx, cy, s, rot, o) {
    o = o || {};
    var pts = [], n = 18, i;
    for (i = 0; i <= n; i++) { var t = i / n, a = t * 2.6 * TAU, rr = (.08 + t * .92); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    return P(smooth(jit(xf(pts, cx, cy, s, rot), r, s * .02), false), o.c || K.pink, o.w || Math.max(.3, s * .05));
  }
  function arrow(r, x0, y0, x1, y1, o) {     // curved arrow from (x0,y0) to the tip (x1,y1)
    o = o || {};
    var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, bend = (o.bend == null ? .22 : o.bend) * L;
    var pts = [[x0, y0], [x0 + dx * .33 + nx * bend, y0 + dy * .33 + ny * bend], [x0 + dx * .68 + nx * bend * .85, y0 + dy * .68 + ny * bend * .85], [x1, y1]];
    var a = Math.atan2(y1 - pts[2][1], x1 - pts[2][0]), hl = Math.min(4.5, L * .3), c = o.c || K.plum, w = o.w || .45;
    var h1 = [x1 - Math.cos(a - .5) * hl, y1 - Math.sin(a - .5) * hl], h2 = [x1 - Math.cos(a + .5) * hl, y1 - Math.sin(a + .5) * hl];
    return P(smooth(jit(pts, r, .5), false), c, w) + P(smooth([h1, [x1, y1], h2], false), c, w);
  }
  function dots(r, x0, y0, x1, y1, n, amp, c, s) {   // dotted line (fades in, it cannot be dash-drawn)
    var pts = stemPts(x0, y0, x1, y1, amp || 0, 1.2, r, n || 12), d = '';
    for (var i = 0; i < pts.length; i++) d += 'M' + n2(pts[i][0] + (r() - .5) * .3) + ' ' + n2(pts[i][1] + (r() - .5) * .3) + 'l.01 0';
    return '<path class="fd" d="' + d + '" fill="none" stroke="' + (c || K.pink) + '" stroke-width="' + (s || .75) + '" ' + dl() + '/>';
  }
  function petals(r, cx, cy, spread, n, o) {   // little scattered petals
    var out = '';
    for (var i = 0; i < n; i++) {
      var s = 2 + r() * 1.8, x = cx + (r() - .5) * spread, y = cy + (r() - .5) * spread * 1.3, a = r() * 360;
      var p = [[0, 0], [.3, -.32], [.8, -.28], [1, 0], [.8, .3], [.3, .3]];
      out += F(closedD(xf(p, x, y, s, a), r, .12), pick(r, [K.pinkL, K.pinkL, K.pink, K.butter]), .6) + P(loop(xf(p, x, y, s, a), r, .08), K.plum, .22, .8);
    }
    return out;
  }
  function tape(r, cx, cy, w, h, ang, c) {
    var pts = [[-w / 2, -h / 2], [-w / 2 + .6, -h * .15], [-w / 2, h * .2], [-w / 2 + .5, h / 2], [w / 2, h / 2], [w / 2 - .6, h * .1], [w / 2, -h * .25], [w / 2 - .4, -h / 2]];
    var p = xf(pts, cx, cy, 1, ang);
    return '<path class="tp" d="' + rough(p, true, r, .04) + 'Z" fill="' + (c || 'rgba(247,224,150,.78)') + '" stroke="rgba(120,90,50,.28)" stroke-width=".2"' + dl() + '/>';
  }
  /* garland: a stem along pts with leaves at o.leaves (t values) and flowers at o.flowers ([{t,k,s}]) */
  function flowerAt(r, k, x, y, s, a) {
    if (k === 'daisy') return daisy(r, x, y, s, a, { fill: K.pinkL });
    if (k === 'daisyY') return daisy(r, x, y, s, a, { fill: K.butter, center: K.pink });
    if (k === 'dot') return dotFlower(r, x, y, s, a, { fill: K.pinkL });
    if (k === 'tulip') return tulip(r, x, y, s * 2.6, a - 90 + 90, {});
    if (k === 'heart') return heart(r, x, y, s * 1.3, a, { fill: K.pinkL });
    return dotFlower(r, x, y, s, a, { fill: K.butter });
  }
  function garland(r, pts, o) {
    o = o || {};
    var base = Math.min(SEQ * STEP, MAXD), out = stem(r, pts, o.c || K.plum, o.w || .42);   // stem first, leaves + flowers appear as the pen passes them
    (o.leaves || []).forEach(function (t, k) {
      var q = at(pts, t), side = (k % 2) ? 1 : -1;
      FORCE = base + t * 1.0;
      out += leaf(r, q.x, q.y, (o.leaf || 4.6) * (.8 + r() * .4), q.a + side * (42 + r() * 24), { hatch: r() < .4 });
    });
    (o.flowers || []).forEach(function (f) {
      var q = at(pts, f.t);
      FORCE = base + f.t * 1.0 + .15;
      out += flowerAt(r, f.k, q.x + (f.dx || 0), q.y + (f.dy || 0), (f.s || 3) * (o.fs || 1.3), f.a == null ? (r() * 360) : f.a);
    });
    FORCE = null;
    return out;
  }
  function vine(r, x0, y0, x1, y1, o) {
    o = o || {};
    var pts = stemPts(x0, y0, x1, y1, o.amp || 2, o.waves || 2.5, r, 18), lv = [], n = o.n || 9;
    for (var i = 0; i < n; i++) lv.push((i + .5) / n);
    var curl = pts[pts.length - 1], a = at(pts, .99).a;
    return garland(r, pts, { leaves: lv, leaf: o.leaf || 3.6, flowers: o.flowers || [], w: o.w }) + (o.curl === false ? '' : swirl(r, curl[0] + Math.cos(a * DEG) * 1.6, curl[1] + Math.sin(a * DEG) * 1.6, 1.8, a, { c: K.plum, w: .3 }));
  }
  function sprig(r, bx, by, h, ang, o) {      // little wildflower sprig
    o = o || {};
    var pts = xf(stemPts(0, 0, 0, -h, h * .08, 1, r, 8), bx, by, 1, ang), lv = [.25, .42, .58], fl = [], tips = [];
    var top = at(pts, .98);
    fl.push({ t: .99, k: o.k1 || 'dot', s: h * .17, a: r() * 70 });
    var out = garland(r, pts, { leaves: lv, leaf: h * .3, flowers: fl });
    // two side shoots
    [-1, 1].forEach(function (sd, i) {
      var q = at(pts, .5 + i * .12), sp = xf([[0, 0], [sd * h * .1, -h * .12], [sd * h * .22, -h * .22]], q.x, q.y, 1, ang);
      out += P(smooth(sp, false), K.plum, .3) + flowerAt(r, i ? 'butter' : 'dot', sp[2][0], sp[2][1], h * .12, r() * 70);
    });
    return out;
  }
  function pressed(r, cx, cy, w, h, ang) {    // pressed flower in a tissue-paper pocket (muted, dried look)
    var rect = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], out = '';
    var p = xf(rect, cx, cy, 1, ang);
    out += '<path class="tp" d="' + rough(p, true, r, .02) + 'Z" fill="rgba(255,250,236,.85)" stroke="rgba(120,90,60,.35)" stroke-width=".3"' + dl() + '/>';
    var s = h * .34, bx = 0, by = h * .38, op = .85;
    // stem + leaves
    var st = xf([[0, by], [h * .02, by - h * .28], [-h * .02, by - h * .52], [0, -h * .02]], cx, cy, 1, ang);
    out += P(smooth(st, false), K.moss, .35, op);
    out += leaf(r, st[1][0], st[1][1], h * .26, ang - 38, { fill: '#b9bf93', c: K.moss, w: .3 });
    out += leaf(r, st[1][0], st[1][1] - h * .02, h * .24, ang - 150, { fill: '#b9bf93', c: K.moss, w: .3 });
    // flattened bloom
    var c0 = xf([[0, -h * .12]], cx, cy, 1, ang)[0], fl = '', ln = '';
    for (var i = 0; i < 6; i++) {
      var pp = xf(petalShape(r), c0[0], c0[1], s * .62, ang + i * 60 + 10);
      fl += closedD(pp, r, .12); ln += loop(pp, r, .1);
    }
    out += F(fl, K.rose, .55) + P(ln, '#9c5d73', .28, .85);
    var cn = []; for (i = 0; i < 6; i++) { var t = i / 6 * TAU; cn.push([c0[0] + Math.cos(t) * s * .1, c0[1] + Math.sin(t) * s * .1]); }
    out += F(closedD(cn, r, .06), '#d6b66a', .9);
    out += tape(r, cx - w * .32, cy - h * .5 + .3, 8, 2.8, ang - 20 + 0, 'rgba(244,168,194,.72)') + tape(r, cx + w * .34, cy - h * .5 + .3, 8, 2.8, ang + 24, 'rgba(247,224,150,.78)');
    return out;
  }

  /* an svg (viewBox in page units) */
  function svg(inner, o) {
    o = o || {};
    return '<svg class="' + (o.cls || 'dood') + '" viewBox="' + (o.vb || ('0 0 ' + W + ' ' + H)) + '" preserveAspectRatio="' + (o.par || 'none') + '" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }

  /* ---------------- stems climbing up an edge (page orientation: outer edge on the left) ---------------- */
  function climber(r, x, yBase, yTop, o) {
    o = o || {};
    var pts = stemPts(x, yBase, x + (o.drift || 0), yTop, o.amp || 1.5, o.waves || 2, r, 18), n = o.n || 8, lv = [], i;
    for (i = 0; i < n; i++) lv.push(.06 + .88 * i / n + r() * .03);
    var fl = (o.flowers || [{ t: .5, k: 'daisy', s: 3.2 }, { t: .98, k: 'tulip', s: 3.4 }]);
    return garland(r, pts, { leaves: lv, leaf: o.leaf || 4.4, flowers: fl, fs: o.fs });
  }
  function heartChain(r, x0, y0, x1, y1, n, s) {
    var pts = stemPts(x0, y0, x1, y1, 1.2, 1.5, r, n - 1), out = P(smooth(pts, false), K.pink, .25, .6);
    for (var i = 0; i < n; i++) out += heart(r, pts[i][0], pts[i][1], s * (.75 + r() * .5), (r() - .5) * 40, { fill: i % 2 ? K.pinkL : null, c: i % 3 ? K.pink : K.plum, w: .3 });
    return out;
  }

  /* ---------------- page compositions (orientation: outer edge x=0, spine x=100; mirrored for right pages) ---------------- */
  var PH = H;
  function itemsEdge(r, v, o) {
    var out = [], inner = o.inner || {};
    if (v === 0) {           // stem climbing the outer edge from the bottom corner, hearts along the bottom
      out.push(climber(r, 3.4, PH - 3, PH * .38, { amp: 1.2, flowers: [{ t: .3, k: 'daisy', s: 3.1 }, { t: .62, k: 'dot', s: 2.8 }, { t: .99, k: 'tulip', s: 3.3 }] }));
      out.push(heartChain(r, 14, PH - 3.6, 52, PH - 3.2, 5, 2.6));
      out.push(sparkle(r, 90, 8, 2.8, 10));
      out.push(petals(r, 82, 20, 12, 3));
    } else if (v === 1) {    // vine over the top, tulips in the bottom corner
      out.push(vine(r, -1, 3.4, 78, 3.6, { amp: 1.2, waves: 3, n: 9, flowers: [{ t: .3, k: 'dot', s: 2.4 }, { t: .72, k: 'daisy', s: 2.6 }] }));
      out.push(tulip(r, 7, PH - 2, 15, -6, {}));
      out.push(tulip(r, 14.5, PH - 1.5, 11, 8, { fill: K.butter }));
      out.push(swirl(r, 90, PH - 8, 4.2, 0));
      out.push(dots(r, 96, 30, 96, 70, 11, 1));
    } else if (v === 2) {    // hearts
      out.push(heart(r, 8.5, 9, 10, -14, { hatch: K.pink, c: K.plum }));
      out.push(heartChain(r, 4.5, 24, 4, 62, 6, 2.5));
      out.push(heart(r, 88, PH - 8, 12, 10, { dbl: true, fill: K.pinkL, c: K.pink, w: .5 }));
      out.push(sprig(r, 20, PH - 1.5, 14, -8));
      out.push(star(r, 91, 12, 2.6, 12, { fill: K.butter }));
    } else if (v === 4) {    // flower cluster in the top outer corner, vine along the bottom
      out.push(daisy(r, 9, 10, 6.5, 12, { fill: K.pinkL }));
      out.push(dotFlower(r, 20, 7, 3.6, 30, { fill: K.butter }));
      out.push(sprig(r, 4, 34, 15, 4));
      out.push(vine(r, 28, PH - 3.4, 99, PH - 3, { amp: 1.3, waves: 3.5, n: 9, curl: false, flowers: [{ t: .35, k: 'dot', s: 2.4 }, { t: .8, k: 'daisyY', s: 2.4 }] }));
      out.push(petals(r, 90, 22, 12, 4));
      out.push(sparkle(r, 90, 40, 2.2, 14));
    } else if (v === 5) {    // zig-zag of hearts down the spine-side edge, tulip trio bottom outer
      out.push(heartChain(r, 94, 10, 96, 56, 7, 2.6));
      out.push(tulip(r, 6, PH - 1.5, 12, -10, { fill: K.butter }));
      out.push(tulip(r, 12.5, PH - 1, 15, 4, {}));
      out.push(tulip(r, 19, PH - 1.8, 10, 14, {}));
      out.push(heart(r, 8, 8, 6, -10, { fill: K.pinkL, c: K.plum }));
      out.push(star(r, 20, 16, 2.4, 8, { fill: K.butter }));
      out.push(swirl(r, 89, PH - 9, 3.6, 10));
    } else {                 // bouquet in the spine-side corner + curl at the top outer corner
      out.push(tulip(r, 84, PH - 1.5, 17, 6, {}));
      out.push(daisy(r, 93, PH - 12, 4, 20, { fill: K.pinkL }));
      out.push(sprig(r, 75, PH - 1.5, 13, -14));
      out.push(vine(r, 1.5, 12, 22, 2.5, { amp: 1, waves: 1.4, n: 4, flowers: [{ t: .45, k: 'dot', s: 2.3 }] }));
      out.push(star(r, 7, 24, 2.4, -10, { fill: K.butter }));
      out.push(dots(r, 12, PH - 4.5, 60, PH - 4.5, 14, 1.2));
    }
    return out;
  }

  function itemsLetter(r, v, o) {
    var out = [];
    out.push(climber(r, 3, PH - 2.8, 52, { amp: .9, n: 9, leaf: 3.6, fs: .8, flowers: [{ t: .2, k: 'daisy', s: 3.2 }, { t: .5, k: 'dot', s: 2.7 }, { t: .78, k: 'daisyY', s: 2.8 }, { t: .99, k: 'tulip', s: 3.2 }] }));
    out.push(heartChain(r, 16, PH - 3.4, 60, PH - 3.4, 6, 2.5));
    out.push(vine(r, 66, 3.2, 99, 4.4, { amp: 1, waves: 2, n: 5, curl: false, flowers: [{ t: .5, k: 'dot', s: 2.2 }] }));
    out.push(sparkle(r, 92, PH - 5, 2.6, 8));
    out.push(sparkle(r, 12, 4, 1.8, 20));
    return out;
  }

  function itemsFestive(r, v, o) {   // birthday / monthsary / finale: light, along the outer edge + sparse sparkles, clear of the big lettering
    var out = [];
    out.push(climber(r, 3, PH - 3, PH * .5, { amp: 1.1, n: 6, leaf: 4, flowers: [{ t: .4, k: v % 2 ? 'daisy' : 'dot', s: 3 }, { t: .99, k: 'tulip', s: 3.2 }] }));
    out.push(petals(r, 90, PH * .34, 14, 4));
    out.push(sparkle(r, 93, PH * .52, 2.6, 0));
    out.push(sparkle(r, 8, PH * .3, 2, 14));
    out.push(dots(r, 94, PH * .6, 94, PH * .88, 9, 1.2));
    return out;
  }

  /* photos: variant by seed, plus an arrow to a photo on some pages */
  function itemsPhotos(r, v, o) {
    var out = itemsEdge(r, v % 6, o);
    if (o.arrow) out.push(arrow(r, o.arrow[0], o.arrow[1], o.arrow[2], o.arrow[3], { c: K.pink, w: .5, bend: .3 }), sparkle(r, o.arrow[0] + (o.arrow[2] > o.arrow[0] ? -2 : 2), o.arrow[1] - 3, 1.8, 0));
    return out;
  }

  /* lyrics page (the left page of spread 1): a decorated page, with a "for klei" note + taped heart + pressed flower */
  function itemsLyricsPage(r) {
    var out = [];
    out.push(climber(r, 3.6, PH - 3, PH * .46, { amp: 1.4, n: 10, leaf: 4.8, flowers: [{ t: .18, k: 'daisy', s: 3.4 }, { t: .45, k: 'dot', s: 3 }, { t: .72, k: 'daisyY', s: 3 }, { t: .99, k: 'tulip', s: 3.8 }] }));
    out.push(climber(r, 10.5, PH - 2, PH * .7, { amp: 1.1, n: 6, leaf: 4, drift: 1.5, flowers: [{ t: .55, k: 'dot', s: 2.6 }, { t: .99, k: 'daisy', s: 2.8 }] }));
    out.push(vine(r, 6, 3.8, 70, 3.2, { amp: 1.2, waves: 3.2, n: 10, flowers: [{ t: .3, k: 'daisy', s: 2.6 }, { t: .66, k: 'dot', s: 2.3 }] }));
    // taped heart (right-centre)
    out.push(heart(r, 65, 80, 27, 9, { hatch: K.pink, fill: K.pinkL, dbl: true, c: K.plum, w: .6 }));
    out.push(tape(r, 55.5, 70.5, 17, 5.2, -38, 'rgba(247,224,150,.82)'));
    out.push(sparkle(r, 84, 62, 3, 6));
    out.push(sparkle(r, 49, 96, 2, 20));
    out.push(star(r, 88, 44, 2.6, 10, { fill: K.butter }));
    // pressed flower (lower, left of centre)
    out.push(pressed(r, 38, 115, 27, 31, -4));
    out.push(heartChain(r, 62, 117, 90, PH - 6, 5, 2.6));
    out.push(swirl(r, 83, 100, 4, 30));
    out.push(petals(r, 20, 66, 10, 4));
    out.push(dots(r, 24, 94, 14, 80, 8, 1));
    return out;
  }

  function mirrorWrap(inner, mirror) { return mirror ? '<g transform="translate(' + W + ' 0) scale(-1 1)">' + inner + '</g>' : inner; }

  /* photo rects (page units, true orientation) for the "arrow to a photo" helper */
  function photoRects(host) {
    var out = [], nodes = host.querySelectorAll('.pp');
    for (var i = 0; i < nodes.length; i++) {
      var st = nodes[i].style, m = /\*\s*([\d.]+)/.exec(st.width || ''), w = m ? +m[1] : 40, im = nodes[i].querySelector('.pp-img'), ar = im && /([\d.]+)\s*\/\s*([\d.]+)/.exec(im.style.aspectRatio || '');
      var ratio = ar ? +ar[2] / +ar[1] : 1.33, h = 1.8 + (w - 3.6) * ratio + 15;
      var cx = parseFloat(st.left) || 50, cy = parseFloat(st.top) || 50;   // % of the page: x of 100 wide, y of 100% (height 138.9)
      var X = cx, Y = cy * H / 100;
      out.push({ x0: X - w / 2, x1: X + w / 2, y0: Y - h / 2, y1: Y + h / 2 });
    }
    return out;
  }

  /* ---------------- decorate ---------------- */
  var KINDS = { letter: 1, lyricsPage: 1, photos: 1, birthday: 1, monthsary: 1, montage: 1, finale: 1 };
  function decorate(page, o) {
    if (!page || page._dood) return;
    o = o || {};
    var kind = KINDS[o.kind] ? o.kind : 'photos', host = page._in || page.querySelector('.pg-in') || page;
    var side = o.side || (page.classList.contains('pg-l') ? 'l' : page.classList.contains('pg-r') ? 'r' : 's');
    var seed = (o.seed != null ? o.seed : hashStr(kind + ':' + (o.idx || 0))) >>> 0, r = rng(seed ^ hashStr(kind));
    var mirror = side !== 'l', v = o.variant != null ? o.variant : Math.floor(r() * 6), ob = {};
    SEQ = 0;
    var items;
    if (kind === 'lyricsPage') items = itemsLyricsPage(r);
    else if (kind === 'letter') items = itemsLetter(r, v, ob);
    else if (kind === 'photos' || kind === 'montage') {
      if (kind === 'photos' && o.arrowTo) {
        var rects = photoRects(host), t = rects[o.arrowTo - 1] || rects[0];
        if (t) {
          // an arrow from the outer margin pointing at the photo's edge
          var L = mirror ? { x0: W - t.x1, x1: W - t.x0 } : t, ty = Math.max(24, Math.min(PH - 30, (t.y0 + t.y1) / 2 - 8));
          if (L.x0 > 14) ob.arrow = [Math.max(2.5, L.x0 - 15), ty - 12, L.x0 - 1.5, ty];
        }
      }
      items = itemsPhotos(r, v, ob);
    } else items = itemsFestive(r, v, ob);
    var inner = items.join('');
    var holder = document.createElement('div');
    holder.innerHTML = svg(mirrorWrap(inner, mirror));
    var el = holder.firstChild;
    host.insertBefore(el, host.firstChild);
    page._dood = el;
    if (kind === 'lyricsPage') addNote(host, mirror);
  }

  /* the little handwritten "for klei" note (HTML so it uses the page's hand font) */
  function addNote(host, mirror) {
    var n = document.createElement('div');
    n.className = 'dd-note';
    n.innerHTML = '<i class="dn-tape"></i><span class="dn-t">for klei</span><svg class="dn-u" viewBox="0 0 60 8" preserveAspectRatio="none" aria-hidden="true"><path class="dw" pathLength="1" d="M2 5C12 1.500 18 7 29 4S48 2.500 58 5"/></svg>';
    host.appendChild(n);
  }

  /* ---------------- draw-on: first time a page is seen (song mode); browse pages are always fully drawn ---------------- */
  var tracked = [], poll = 0, wired = false;
  function ensureWired() {
    if (wired) return; wired = true;
    if (B.on) {
      B.on('flip', function () { check(); });
      B.on('opened', function () { check(); });
    }
  }
  function curInner() { try { return B.engine && B.engine.current ? B.engine.current() : -1; } catch (e) { return -1; } }
  function reveal(page) {
    var s = page && page._dood;
    if (!s || !s.classList.contains('dd-pre')) return;
    void s.getBoundingClientRect();
    s.classList.remove('dd-pre'); s.classList.add('dd-go');
    var host = page._in || page, nt = host.querySelector('.dd-note'); if (nt) nt.classList.add('dd-go');
    page._doodDrawn = true;
  }
  function check() {
    var left = 0;
    for (var i = 0; i < tracked.length; i++) {
      var T = tracked[i]; if (!T.pages.length) continue;
      var c = curInner(), vis = c < 0 ? [] : (T.layout === 'single' ? [c] : [c, c + 1]);
      T.pages.forEach(function (p, j) {
        if (!p._dood || !p._dood.classList.contains('dd-pre')) return;
        if (vis.indexOf(j) >= 0 || p.classList.contains('show')) reveal(p); else left++;
      });
    }
    if (left && !poll) poll = setInterval(check, 500);
    else if (!left && poll) { clearInterval(poll); poll = 0; }
  }

  function decorateBuilt(built, o) {
    o = o || {};
    if (!built || !built.els) return;
    var layout = o.layout || (built.refs && built.refs.layout) || 'double', mode = o.mode || (built.refs && built.refs.mode) || 'song';
    var single = layout === 'single', photoNo = 0;
    built.units.forEach(function (u, ui) {
      u.pages.forEach(function (p, k) {
        var kind = u.kind;
        if (kind === 'letter') kind = (!single && k === 0) ? 'lyricsPage' : 'letter';
        var opts = { kind: kind, idx: ui * 4 + k, layout: layout, mode: mode };
        if (kind === 'photos') { opts.seed = 4100 + photoNo * 37; opts.variant = [0, 4, 2, 5, 1, 3, 4, 0][photoNo % 8]; if (photoNo % 4 === 0) opts.arrowTo = 1; photoNo++; }
        else if (kind === 'montage') opts.variant = (k + ui) % 4;
        else if (kind === 'birthday' || kind === 'monthsary' || kind === 'finale') opts.variant = k + ui;
        try { decorate(p, opts); } catch (e) { console.error('[doodles]', e); }
      });
    });
    if (mode === 'song' && !reduced) {
      built.els.forEach(function (p) { if (p._dood) { p._dood.classList.add('dd-pre'); var nt = (p._in || p).querySelector('.dd-note'); if (nt) nt.classList.add('dd-pre'); } });
      tracked.push({ pages: built.els, layout: layout });
      ensureWired();
      setTimeout(check, 0);
    }
  }

  /* ---------------- cover wreath + back-cover sprig ---------------- */
  function cover(which) {
    SEQ = 0;
    var r = rng(which === 'back' ? 77031 : 51907), out = '';
    var cream = '#fffaf0';
    function cfl(k, x, y, s, a) {
      if (k === 'daisy') return daisy(r, x, y, s, a, { fill: cream, fillOp: .9, center: K.butter });
      if (k === 'dot') return dotFlower(r, x, y, s, a, { fill: cream });
      return daisy(r, x, y, s, a, { fill: K.butter, fillOp: .8, center: K.pink });
    }
    if (which === 'front') {
      // label spans x 20..89, y 23.6..58.3 (rotated -2.2deg): a garland hugs its bottom-left, runs under it, and climbs up the right side
      var g1 = stemPts(10, 40, 17, 66, 1.4, 1, r, 8).concat(stemPts(19, 63.5, 52, 62.2, 1.4, 1.5, r, 12).slice(1)).concat(stemPts(54, 62, 90, 61.4, 1.5, 1.5, r, 12).slice(1)).concat(stemPts(92, 60, 96, 44, 1.2, 1, r, 6).slice(1));
      var lv = [], i;
      for (i = 0; i < 16; i++) lv.push(.04 + i * .058);
      out += garland(r, g1, { fs: 1, leaves: lv, leaf: 6.4, w: .6, flowers: [
        { t: .06, k: 'daisy', s: 5.6 }, { t: .2, k: 'dot', s: 4.6, dy: 1.6 }, { t: .34, k: 'daisyY', s: 4.8 }, { t: .5, k: 'daisy', s: 6.4, dy: 1.2 },
        { t: .66, k: 'dot', s: 4.6 }, { t: .8, k: 'daisyY', s: 5 }, { t: .93, k: 'daisy', s: 5.2 }
      ] });
      // small side garland, up the left of the label
      var g2 = stemPts(11, 38, 11.5, 24, 1, 1, r, 6);
      out += garland(r, g2, { fs: 1, leaves: [.25, .55, .8], leaf: 5, w: .5, flowers: [{ t: .99, k: 'daisy', s: 4.4 }] });
      out += heart(r, 79, 71, 7, 10, { fill: K.pink, hatch: cream, c: K.plum, hatchC: cream });
      out += sparkle(r, 10, 74, 2.8, 0, { c: cream }) + sparkle(r, 93, 76, 2.2, 15, { c: cream }) + sparkle(r, 60, 70, 1.8, 8, { c: cream });
      out += petals(r, 50, 76, 40, 5);
    } else {
      var g = stemPts(22, 126, 80, 127.5, 1.6, 2, r, 14), lv2 = [];
      for (i = 0; i < 9; i++) lv2.push(.05 + i * .11);
      out += garland(r, g, { fs: 1, leaves: lv2, leaf: 4.4, w: .5, flowers: [{ t: .15, k: 'daisy', s: 3.6 }, { t: .45, k: 'dot', s: 3.2 }, { t: .75, k: 'daisyY', s: 3.4 }, { t: .99, k: 'daisy', s: 3.2 }] });
      out += heart(r, 87, 14, 6, 12, { fill: K.pink, hatch: cream, hatchC: cream });
      out += sparkle(r, 14, 50, 2.2, 0, { c: cream }) + sparkle(r, 12, 14, 2.2, 14, { c: cream });
    }
    return svg(out, { cls: 'dood cv-dood' });
  }

  /* ---------------- faint sketches on the desk (#bg) ---------------- */
  function bg(host) {
    host = host || document.getElementById('bg');
    if (!host || host._dood) return;
    host._dood = true;
    var r = rng(20240118), items = [
      // [kind, left%, top%, size(vmin), rot]
      ['daisy', 4, 9, 22, -14], ['heart', 91, 7, 15, 12], ['tulip', 94, 86, 24, 8], ['daisy', 3, 84, 17, 20],
      ['heart', 1.5, 44, 10, -18], ['dot', 96, 45, 12, 10], ['sprig', 15, 96, 18, -6], ['star', 80, 3, 7, 12]
    ];
    var html = '';
    items.forEach(function (it) {
      var k = it[0], s = it[3], inner = '', vb = '0 0 40 40';
      SEQ = 0;
      if (k === 'daisy') inner = daisy(r, 20, 20, 15, it[4], { fill: K.pinkL, fillOp: .6 }) + P(smooth(xf([[0, .4], [.1, 1], [-.1, 1.7]], 20, 20, 15, it[4] + 90), false), K.plum, .5);
      else if (k === 'heart') inner = heart(r, 20, 20, 30, it[4], { hatch: K.pink, fill: K.pinkL, dbl: true, w: .9 });
      else if (k === 'tulip') inner = tulip(r, 20, 38, 34, it[4], {});
      else if (k === 'dot') inner = dotFlower(r, 20, 20, 28, it[4], { fill: K.pinkL });
      else if (k === 'sprig') inner = sprig(r, 20, 38, 30, it[4]);
      else inner = star(r, 20, 20, 16, it[4], { fill: K.butter });
      html += '<svg class="bg-dd" viewBox="' + vb + '" style="left:' + it[1] + '%;top:' + it[2] + '%;width:' + s + 'vmin;height:' + s + 'vmin" aria-hidden="true" focusable="false">' + inner + '</svg>';
    });
    var wrap = document.createElement('div');
    wrap.className = 'bg-doodles';
    wrap.innerHTML = html;
    host.insertBefore(wrap, host.firstChild);
  }

  B.doodles = {
    decorate: decorate, decorateBuilt: decorateBuilt, cover: cover, bg: bg, reveal: reveal, svg: svg, rng: rng, colors: K,
    prim: { heart: heart, daisy: daisy, dotFlower: dotFlower, tulip: tulip, leaf: leaf, sprig: sprig, garland: garland, vine: vine, climber: climber, heartChain: heartChain, star: star, sparkle: sparkle, swirl: swirl, arrow: arrow, dots: dots, petals: petals, pressed: pressed, tape: tape, stem: stem }
  };

  function init() { try { bg(); } catch (e) { console.error('[doodles] bg', e); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
