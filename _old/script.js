/* =====================================================================
   CONFIG — everything you'll want to edit lives here.
   Times are SECONDS of the song (4:31 = 271). Section start times come from
   the section tags in lyrics/clarity.lrc (lines like  [00:44.00]@Pre-Chorus ).
   Use ?debug in the URL to retime lyrics + sections by tapping along.
   ===================================================================== */
const CONFIG = {
  name: "Klei",
  subtitle: "hi klei",
  audio: "Music/Clarity_spotdown.org.mp3",
  lrc: "lyrics/clarity.lrc",
  lyricsTxt: "lyrics/clarity-lyrics.txt",   // source text (used by the debug timing tool)
  duration: 271,                            // fallback if audio.duration isn't known yet

  bpm: 128,         // fallback beat if the Web Audio analyser can't read the song (e.g. file://)
  bpmOffset: 0,
  syncOffset: 0,    // nudge visuals vs. audio (+ = visuals later), try ±0.05

  // Section start times come from the @markers in lyrics/clarity.lrc. Only the things the lrc can't express live here.
  times: {
    typeStart: 2.5,    // "Klei" starts typing in the intro
    // instrumental build-ups with no marker: each runs from `from` until the next @Drop marker (one continuous 'build' section)
    buildups: [],        // extra instrumental build-ups (the lrc @Build marker already covers 3:06-3:29)
    outroStart: 260,   // outro begins (clips whatever section is running)
    finalAt: 262,      // final message fades in
    replayAt: 266      // replay button appears
  },

  // The letter under the lyrics (text lives in letter/letter.txt; blank lines separate paragraphs).
  letter: {
    src: "letter/letter.txt",
    showAt: 9.9,           // letter fades + unfolds in (after the "Klei" intro)
    typeStart: 12,         // typing begins
    charsPerSec: 35,       // typing speed (about 30-40 feels natural)
    commaPause: 0.25,      // extra pause after , ; :
    periodPause: 0.65,     // extra pause after . ! ?
    paragraphPause: 0.95,  // extra pause on each blank line
    holdAfterTyped: 30,    // seconds the finished letter stays before it folds into an envelope and flies away
    resumeAfterMs: 4000    // auto-scroll pauses this long after the viewer scrolls it manually
  },

  // Montage video (video/montage.mp4): appears in the letter's spot once the letter has flown away; plays once, muted, tied to the song.
  montage: {
    enabled: true,
    startOffset: 0         // seconds after the letter is gone until it starts
  },

  // Big full-screen slams, in the lyrics area (top of the CENTER column). 'drop' = Nth section tagged @Drop in the lrc; 'at' = seconds after that drop starts.
  // hold: seconds on screen, or 'drop' = until that drop ends (fades over the last 0.6 s).
  // shrinkAfter: seconds after which the text eases up to the top of the column (0.55x) and stays; lyrics sit below it.
  // {name} -> CONFIG.name, <br> = line break.
  // {month} -> months elapsed since anniversaryDate (Edit.dates.monthsElapsed). .mom-sub = the smaller line under the big text.
  moments: [
    { drop: 1, at: 0, hold: "drop", text: "HAPPY<br>BIRTHDAY" },
    { drop: 2, at: 0, hold: "drop", text: "HAPPY<br>MONTHSARY<span class=\"mom-sub\">month {month}</span>", big: true, shrinkAfter: 3 }
  ],
  finalMessage: "happy birthday &amp; happy monthsary, <span class=\"n\">klei</span>",

  // !!! SET THE REAL YEAR !!!  The month/day (Jan 18) is right, but the year was never given — "2026" is a placeholder.
  // Used for: "month N" on the last drop, the "X days together" counter, and the lock-screen date.
  anniversaryDate: "2026-01-18",

  // Lock screen (lock.js). The answer is derived from anniversaryDate (month + day) unless you set lock.date.
  lock: {
    enabled: true,            // false = skip the lock screen
    skipInDebug: true,        // ?debug skips the lock
    date: null,               // null = use anniversaryDate; or { month: 1, day: 18 }
    extraAnswers: [],         // any extra exact answers (matched after trim/lowercase/strip spaces+dots), e.g. ["our day"]
    strictYear: false,        // false = a typed year is ignored; true = a typed year must match `years`/anniversary year
    years: [],                // accepted years when strictYear is on (default: the anniversaryDate year)
    title: "{name}, what's our date?",
    placeholder: "mm/dd",
    button: "ok",
    wrong: "nope, try again",
    hint: "",                 // optional line shown after `hintAfter` wrong tries (empty = none)
    hintAfter: 3,
    slideMs: 800              // how long the card takes to slide away
  },

  // Outro: days-together counter + photo heart (outro.js) + confetti (confetti.js)
  outro: {
    columnsOpacity: 0.25,     // photo columns fade to this in the outro (they also freeze at heartAt)
    heartAt: null,            // when photos start flying in (null = times.outroStart)
    heartStagger: 0.12,       // seconds between photos
    heartFlyDur: 1.5,         // seconds each photo takes to fly in
    heartSizeFrac: 0.82,      // heart bounding box as a fraction of the screen (width and height)
    heartPulseAmp: 0.03,      // slow pulse scale (0 = none)
    heartPulsePeriod: 3.6,    // seconds per pulse
    countAt: null,            // when "[X] days together" appears (null = times.finalAt + 1.4)
    countDur: 3.2,            // seconds the day number takes to count up from 0
    clockDelay: 0.5           // seconds after the count-up ends until the h:m:s clock appears
  },
  confetti: {
    enabled: true,
    colors: ["#f7b6cf", "#f4a6c0", "#ee8fb3", "#ffe9d6", "#fff6ea", "#ffffff"],   // pink, cream, white
    bursts: [                 // drop = Nth @Drop section; at = seconds after it starts
      { drop: 1, at: 0.05, size: "small" },
      { drop: 2, at: 0.05, size: "big" }
    ],
    small: { count: 70, volleys: 2, spread: 70 },
    big: { count: 150, volleys: 5, spread: 90 },   // count per volley
    heartShare: 0.4           // fraction of pieces that are little hearts (the rest are paper bits)
  },

  // Used for the lyric/ photo styling. Modules merge these over their own defaults.
  lyrics: {
    nextLineOpacity: 0.6,
    maxLineHold: 9,     // a line never stays longer than this (s)
    tailHold: 5.5       // last line of a section (nothing after it in the section) is cleared after this many s
  },
  photoReel: {
    // relative scroll speed per section type ("snap" = discrete beat-cuts + flash).
    // build ramps from `build` (start of the build-up) to `buildTo` (end of it) with section progress.
    speed: { intro: 0.25, verse: 0.6, prechorus: 1.5, chorus: 1.6, build: 2.2, buildTo: 4.5, outro: 0.2, drop: "snap" },
    dropCutBeats: 4,   // drops: one snap-cut every N beats (CONFIG.bpm)
    loops: 4           // times each column's photo list loops over the song
    // (the columns also freeze at CONFIG.outro.heartAt — see outro.js)
  },

  // Photo captions: fill captions.json ({"filename.jpg": "text"}); non-empty ones show on the polaroid.
  captions: { enabled: true, src: "captions.json" },
  // Phone polish
  fullscreenOnPhone: true,   // request fullscreen on play (phones only)
  wakeLock: true,            // keep the screen awake while playing

  // Your photos, in the order they appear. w/h = displayed pixel size (EXIF-corrected).
  photos: [
    { src: "pictures/1732a4d8-d5ff-49f1-8442-df9ae71f3291.jpg", w: 900, h: 1200 },
    { src: "pictures/39b26bb5-919d-48d9-adfc-1ff3ace10fc5.jpg", w: 900, h: 1200 },
    { src: "pictures/690306f8-e29a-4d7d-a0a2-d3421f47cd5b.jpg", w: 900, h: 1200 },
    { src: "pictures/f973a428-de63-4c57-b4a6-3a5b060c33f5-1536.jpg", w: 900, h: 1200 },
    { src: "pictures/photo_6075465458103554420_y.jpg", w: 1200, h: 900 },
    { src: "pictures/photo_6172518554918392097_y.jpg", w: 900, h: 1200 },
    { src: "pictures/photo_6172518554918392106_y.jpg", w: 1200, h: 900 },
    { src: "pictures/photo_6199497267434165057_y.jpg", w: 900, h: 1200 },
    { src: "pictures/photo_6201606774981332980_y.jpg", w: 900, h: 1200 },
    { src: "pictures/photo_6201606774981332991_y.jpg", w: 900, h: 1200 },
    { src: "pictures/photo_6201606774981333001_y.jpg", w: 1200, h: 675 },
    { src: "pictures/photo_6262614251390307881_y.jpg", w: 1200, h: 900 },
    { src: "pictures/photo_6284946062694879525_y.jpg", w: 900, h: 1200 },
    { src: "pictures/photo_6284946062694879526_y.jpg", w: 1200, h: 900 },
    { src: "pictures/photo_6284946062694879527_y.jpg", w: 900, h: 1200 },
    { src: "pictures/photo_6284946062694879528_y.jpg", w: 900, h: 1200 },
    { src: "pictures/photo_6284946062694879529_y.jpg", w: 1200, h: 900 }
  ]
};
/* ---------- date helpers (anniversaryDate): used by the core, lock.js and outro.js ---------- */
(function () {
  var E = window.Edit = window.Edit || { modules: {} };
  E.modules = E.modules || {};
  function parts() {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(CONFIG.anniversaryDate || ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : { y: 2026, m: 1, d: 18 };
  }
  E.dates = {
    parts: parts,
    start: function () { var p = parts(); return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0); },   // local midnight
    // full months since the anniversary (a new month starts on each 18th); never negative
    monthsElapsed: function (now) {
      var p = parts(), n = now || new Date();
      var mo = (n.getFullYear() - p.y) * 12 + (n.getMonth() + 1 - p.m);
      if (n.getDate() < p.d) mo--;
      return Math.max(0, mo);
    },
    // whole calendar days since the anniversary
    daysSince: function (now) {
      var p = parts(), n = now || new Date();
      var a = Date.UTC(p.y, p.m - 1, p.d), b = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
      return Math.max(0, Math.round((b - a) / 86400000));
    }
  };
})();
/* ===================== CORE (below this line) ===================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var Edit = window.Edit = window.Edit || { modules: {} };
  Edit.modules = Edit.modules || {};

  var DEBUG = /[?&]debug\b/.test(location.search);
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FILE = location.protocol === 'file:';

  var audio = $('song'), startEl = $('start'), playBtn = $('play'), label = $('startLabel'), replayBtn = $('replay');
  var els = {
    app: $('app'), stage: $('stage'), photosRoot: $('photos-root'), lyricsRoot: $('lyrics-root'),
    texts: $('texts'), debugRoot: $('debug-root')
  };
  var elName = $('name'), elSub = $('sub'), elHero = $('hero'), elSlam = elHero && elHero.querySelector('.slam'),
      elFinal = $('final'), elFlash = $('flash'), elFlash2 = $('flash2') || elFlash, elPulse = $('pulse'),
      elBright = $('bright'), canvas = $('particles');

  function setLabel(msg) { if (label) label.textContent = msg; }

  if (typeof gsap === 'undefined') {
    console.error('[edit] GSAP failed to load (offline?).');
    setLabel('couldn’t load animation library — check your connection');
    return;
  }
  var HAS_TEXT = !!window.TextPlugin;
  if (HAS_TEXT) gsap.registerPlugin(window.TextPlugin);

  /* ---------- state ---------- */
  var ctx = null, tl = null, sections = [], duration = CONFIG.duration;
  var started = false, wasPlaying = false, hidden = false;
  var lastT = null, lastNow = 0;
  var FX = { impulse: 0, alpha: 0, type: 0 };  // alpha/type timeline-driven; impulse computed from t (seek-safe)
  var flashes = [], shakes = [], lastFlashOp = -1, lastGlow = '';
  var kickAmt = 0;
  var beat = 0, bass = 0, bassAvg = 0, sinceBeat = 1, silentTime = 0;
  var cur = { speed: 0.6, glow: 5, pulse: 0.15 };
  var listeners = {};
  var modFail = {};
  var lastHB = -1, lastShakeOn = false, lastTextScale = 1, typedN = -1;

  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, data) {
    (listeners[evt] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error('[edit] listener ' + evt, e); } });
  }
  function eachModule(method, arg) {
    Object.keys(Edit.modules).forEach(function (name) {
      var m = Edit.modules[name];
      if (!m || m._disabled || typeof m[method] !== 'function') return;
      try { m[method](arg); } catch (e) { modError(name, method, e); }
    });
  }
  function modError(name, where, e) {
    var m = Edit.modules[name];
    modFail[name] = (modFail[name] || 0) + 1;
    if (modFail[name] === 1) console.error('[edit] module "' + name + '" ' + where + ' threw:', e);
    if (modFail[name] >= 5 && m && !m._disabled) { m._disabled = true; console.error('[edit] module "' + name + '" disabled after repeated errors'); }
  }

  /* ---------- flash / kick (realtime, for modules) ---------- */
  function flash(strength, dur) {
    if (REDUCED) return;
    strength = strength == null ? 0.6 : strength; dur = dur == null ? 0.25 : dur;
    gsap.killTweensOf(elFlash2);
    gsap.fromTo(elFlash2, { opacity: strength }, { opacity: 0, duration: dur, ease: 'power2.out' });
  }
  function kick(amount) {
    if (REDUCED) return;
    kickAmt = Math.min(3, kickAmt + (amount == null ? 1 : amount));
  }

  /* ---------- sections ---------- */
  function sectionAt(t) {
    var n = sections.length;
    if (!n) return null;
    if (t <= sections[0].start) return sections[0];
    for (var i = n - 1; i >= 0; i--) if (t >= sections[i].start) return sections[i];
    return sections[0];
  }

  /* ---------- particles ---------- */
  var pc = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var PW = 0, PH = 0, DPR = 1, parts = [], sprite = null;
  function makeSprite() {   // sheet of 4 soft paper bits (32px cells): pink heart, cream heart, paper scrap, tiny star
    sprite = document.createElement('canvas'); sprite.width = 128; sprite.height = 32;
    var g = sprite.getContext('2d');
    function heart(ox, fill, stroke) {
      g.save(); g.translate(ox + 16, 17); g.beginPath();
      g.moveTo(0, 10); g.bezierCurveTo(-14, 1, -11, -11, -4.5, -8); g.bezierCurveTo(-2, -7, -0.5, -5, 0, -3);
      g.bezierCurveTo(0.5, -5, 2, -7, 4.5, -8); g.bezierCurveTo(11, -11, 14, 1, 0, 10); g.closePath();
      g.fillStyle = fill; g.fill(); g.lineWidth = 1.6; g.strokeStyle = stroke; g.stroke(); g.restore();
    }
    heart(0, '#f4a8c2', '#d9577f'); heart(32, '#fffdf8', '#e8a3bb');
    g.save(); g.translate(64 + 16, 16); g.rotate(0.3); g.beginPath();
    g.moveTo(-8, -6); g.lineTo(7, -8); g.lineTo(9, 5); g.lineTo(-6, 8); g.closePath();
    g.fillStyle = '#fbd3e1'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(217,87,127,.55)'; g.stroke(); g.restore();
    g.save(); g.translate(96 + 16, 16); g.beginPath();
    for (var i = 0; i < 8; i++) { var r = i % 2 ? 3 : 9, an = i * Math.PI / 4 - Math.PI / 2; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
    g.closePath(); g.fillStyle = '#fffaf0'; g.fill(); g.lineWidth = 1.3; g.strokeStyle = '#e8a3bb'; g.stroke(); g.restore();
  }
  function resizeAll() {
    PW = window.innerWidth; PH = window.innerHeight; DPR = 1;  // soft glow sprites don't need retina; saves 4x fill
    if (canvas) { canvas.width = Math.round(PW * DPR); canvas.height = Math.round(PH * DPR); }
    if (pc) pc.setTransform(DPR, 0, 0, DPR, 0, 0);
    var want = PW < 600 ? 45 : 80;
    while (parts.length < want) parts.push({ x: Math.random() * PW, y: Math.random() * PH, z: 0.25 + Math.random() * 0.75, ph: Math.random() * 6.28, k: parts.length % 4 });
    parts.length = want;
    fitMoments();
  }
  function drawParticles(t, dt, speed) {
    if (!pc || !sprite) return;
    pc.clearRect(0, 0, PW, PH);
    if (FX.alpha < 0.01) return;
    pc.globalCompositeOperation = 'source-over';   // light paper background: normal blending
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.y -= (14 + 34 * p.z) * speed * dt;
      p.x += Math.sin(t * 0.6 + p.ph) * 9 * dt * speed;
      var s = (9 + p.z * 15) * (1 + beat * 0.15);
      if (p.y < -s) { p.y = PH + s; p.x = Math.random() * PW; }
      pc.globalAlpha = clamp((0.3 + 0.5 * p.z) * FX.alpha, 0, 0.85);
      pc.drawImage(sprite, p.k * 32, 0, 32, 32, p.x - s / 2, p.y - s / 2, s, s);
    }
    pc.globalAlpha = 1; pc.globalCompositeOperation = 'source-over';
  }

  /* ---------- light leaks (cosmetic drift, wall-clock is fine here) ---------- */
  var leaksTL = gsap.timeline();
  [['.l1', 18], ['.l2', 22], ['.l3', 15]].forEach(function (a, i) {
    var el = document.querySelector('#leaks ' + a[0]);
    if (!el) return;
    leaksTL.to(el, { x: (i % 2 ? -1 : 1) * 14 + 'vmax', y: (i === 1 ? -1 : 1) * 12 + 'vmax', scale: 1.2, duration: a[1], ease: 'sine.inOut', repeat: -1, yoyo: true }, 0);
  });

  /* ---------- beat detection ---------- */
  var actx = null, analyser = null, fbuf = null;
  function setupAnalyser() {
    if (FILE) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      var src = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.5;
      // source -> analyser -> gain -> speakers: the volume control (volume.js) only touches the gain, so the analyser always sees full level
      var gain = actx.createGain();
      src.connect(analyser); analyser.connect(gain); gain.connect(actx.destination);
      Edit.audioGraph = { actx: actx, analyser: analyser, gain: gain };
      fbuf = new Uint8Array(analyser.frequencyBinCount);
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { console.warn('[edit] analyser unavailable, using bpm beat', e); analyser = null; }
  }
  function updateBeat(dt, t, playing) {
    if (!playing) { beat *= Math.exp(-9 * dt); bass *= Math.exp(-6 * dt); return; }
    var useFallback = true;
    if (analyser) {
      analyser.getByteFrequencyData(fbuf);
      var s = 0, i, total = 0;
      for (i = 1; i <= 5; i++) s += fbuf[i];
      for (i = 0; i < fbuf.length; i += 4) total += fbuf[i];
      silentTime = total > 0 ? 0 : silentTime + dt;
      if (silentTime < 1.2) {
        useFallback = false;
        var b = s / (5 * 255);
        bass = b;
        bassAvg += (b - bassAvg) * (1 - Math.exp(-dt / 0.8));
        sinceBeat += dt;
        beat *= Math.exp(-9 * dt);
        if (b > bassAvg * 1.2 + 0.03 && b > 0.2 && sinceBeat > 0.16) {
          beat = Math.max(beat, clamp(0.55 + (b - bassAvg) * 2.2, 0.55, 1));
          sinceBeat = 0;
        }
      }
    }
    if (useFallback) {
      var bps = (CONFIG.bpm || 120) / 60, ph = (t + (CONFIG.bpmOffset || 0)) * bps;
      var since = (ph - Math.floor(ph)) / bps;
      beat = 0.9 * Math.exp(-9 * since); bass = beat * 0.7;
    }
  }

  /* ---------- big-moment elements ---------- */
  var momEls = [], shrinkMoms = [], nameMeasure = null;
  var rootStyle = document.documentElement.style;
  function nameWidth100(txt) {   // width of the name at 100px in the handwritten font (canvas measure, + caret)
    if (!nameMeasure) nameMeasure = document.createElement('canvas').getContext('2d');
    nameMeasure.font = '700 100px Caveat, "Segoe Script", cursive';
    return nameMeasure.measureText(txt).width + 12;
  }
  // everything big is fitted to the CENTER column (els.texts) by measuring
  function fitMoments() {
    var cw = els.texts.clientWidth, ch = els.texts.clientHeight;
    if (!cw || !ch) return;
    rootStyle.setProperty('--colw', cw.toFixed(0));
    var nm = String(CONFIG.name || 'x'), nfs = Math.min(cw * 0.78 * 100 / nameWidth100(nm), ch * 0.3, 210);
    rootStyle.setProperty('--name-fs', nfs.toFixed(1) + 'px');
    rootStyle.setProperty('--name-w', (nameWidth100(nm) * nfs / 100).toFixed(0));   // underline + doodle heart follow the typed name
    momEls.forEach(function (m) {
      var el = m.el;
      el.style.fontSize = '100px';
      var w = el.offsetWidth;
      var fs = Math.min(w > 0 ? 100 * cw * 0.94 / w : cw * 0.3, ch * 0.5 / m.lines);
      el.style.fontSize = fs + 'px';
      m.h = el.offsetHeight || fs * m.lines;
    });
  }
  // the fonts are only requested once text uses it (#name is empty at load), so fonts.ready fires too early: load it explicitly + refit on any font load
  if (document.fonts) {
    if (document.fonts.load) {
      document.fonts.load('400 40px "Permanent Marker"', 'HAPPY MONTHSARY').then(fitMoments, function () {});
      document.fonts.load('700 40px Caveat', 'Klei').then(fitMoments, function () {});
      document.fonts.load('400 20px "Special Elite"', 'Happy').catch(function () {});
    }
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', fitMoments);
  }

  /* ---------- master timeline ---------- */
  function buildTimeline() {
    tl = gsap.timeline({ paused: true });
    var T = CONFIG.times, name = String(CONFIG.name || '');
    var drops = sections.filter(function (s) { return s.type === 'drop'; });
    var builds = sections.filter(function (s) { return s.type === 'build'; });
    var firstStart = Infinity;
    sections.forEach(function (s) { if (s.type !== 'intro' && s.start < firstStart) firstStart = s.start; });
    if (!isFinite(firstStart)) firstStart = T.typeStart + 8;

    // intro
    tl.fromTo('#fade', { opacity: 1 }, { opacity: 0, duration: 1.6, ease: 'power1.out', immediateRender: false }, 0.1);
    tl.fromTo(FX, { alpha: 0 }, { alpha: 1, duration: 3, ease: 'power1.inOut', immediateRender: false }, 0.5);

    // typed name + caret + subtitle
    var typeDur = Math.max(0.6, name.length * 0.22), typeEnd = T.typeStart + typeDur;
    var fo = Math.max(typeEnd + 1.8, firstStart - 1.2);
    tl.fromTo(elName, { '--caret': 0 }, { '--caret': 1, duration: 0.1, immediateRender: false }, T.typeStart - 0.3);
    if (HAS_TEXT) {
      tl.fromTo(elName, { text: '' }, { text: { value: name, delimiter: '' }, duration: typeDur, ease: 'none', immediateRender: false }, T.typeStart);
    } else {
      tl.fromTo(FX, { type: 0 }, { type: 1, duration: typeDur, ease: 'none', immediateRender: false }, T.typeStart);
    }
    tl.fromTo(elSub, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'power2.out', immediateRender: false }, typeEnd + 0.3);
    tl.fromTo(elName, { '--caret': 1 }, { '--caret': 0, duration: 0.1, immediateRender: false }, typeEnd + 1.2);
    // hand-drawn underline, then the doodled heart: they draw themselves (stroke-dashoffset on a pathLength=1 path)
    tl.fromTo('#nameLine path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: 'power1.inOut', immediateRender: false }, typeEnd + 0.1);
    tl.fromTo('#nameHeart path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: 'power1.inOut', immediateRender: false }, typeEnd + 0.9);
    tl.fromTo([elName, elSub, $('nameDeco')].filter(Boolean), { opacity: 1 }, { opacity: 0, duration: 1, ease: 'power1.in', immediateRender: false }, fo);

    // build-up: accelerating (geometric) flash schedule; never faster than 2 per second
    if (!REDUCED) builds.forEach(function (s) {
      var len = s.end - s.start, t = s.start + 1.2, gap = Math.max(1.2, len * 0.11);
      while (t < s.end - 0.7) {
        var k = clamp((t - s.start) / len, 0, 1);
        flashAt(0.12 + 0.4 * k, 0.22, t);
        gap = Math.max(0.5, gap * 0.85); t += gap;
      }
    });

    // big moments
    var lastDrop = drops.length ? drops[drops.length - 1].dropNo : 0;
    (CONFIG.moments || []).forEach(function (m, idx) {
      var d = drops.filter(function (s) { return s.dropNo === m.drop; })[0] || drops[m.drop - 1];
      if (!d) { console.warn('[edit] moment skipped, no drop #' + m.drop); return; }
      var big = m.big === true || /MONTHSARY/i.test(m.text || '');
      var txt = String(m.text || '').replace(/\{name\}/g, name).replace(/\{month\}/g, String(Edit.dates ? Edit.dates.monthsElapsed() : 0));
      var el = document.createElement('div');
      el.className = 'mom' + (m.shrinkAfter ? ' shr' : ''); el.innerHTML = txt;
      elSlam.appendChild(el);
      gsap.set(el, { xPercent: -50, yPercent: -50, autoAlpha: 0 });
      var rec = { el: el, lines: txt.split(/<br\s*\/?>/i).length, h: 0 };
      momEls.push(rec);
      var st = d.start + (m.at || 0);
      var hold = m.hold === 'drop' ? Math.max(1, d.end - st) : (m.hold || 4);
      var tilt = (idx % 2 ? -1 : 1) * (big ? 4 : 3);
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, immediateRender: false }, st);
      if (REDUCED) {
        tl.fromTo(el, { scale: 1 }, { scale: 1, duration: 0.01, immediateRender: false }, st);
      } else {
        tl.fromTo(el, { scale: big ? 4.5 : 3, rotation: tilt }, { scale: 1, rotation: -tilt * 0.45, duration: big ? 0.7 : 0.55, ease: 'expo.out', immediateRender: false }, st);
        flashAt(big ? 1 : 0.85, big ? 0.5 : 0.35, st);
        if (big) flashAt(0.8, 0.45, st + 0.16);
        shakes.push({ at: st, imp: big ? 1.7 : 1, id: big ? 1.1 : 0.7 });
        if (!m.shrinkAfter) tl.fromTo(el, { scale: 1 }, { scale: big ? 1.08 : 1.05, duration: Math.max(0.1, hold - 0.65), ease: 'none', immediateRender: false }, st + 0.65);
      }
      if (m.shrinkAfter) {
        var sa = st + m.shrinkAfter, sdur = 1.3;
        tl.fromTo(el, { '--sh': 0, scale: 1 }, { '--sh': 1, scale: 0.55, duration: sdur, ease: 'power2.inOut', immediateRender: false }, sa);
        shrinkMoms.push({ rec: rec, start: st, from: sa, dur: sdur, end: st + hold });
      }
      tl.fromTo(el, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.6, ease: 'power1.in', immediateRender: false }, st + hold - 0.6 + (m.hold === 'drop' ? 0 : 0.6));
    });
    fitMoments();

    // outro: final message + replay
    elFinal.innerHTML = CONFIG.finalMessage || '';
    tl.fromTo(elFinal, { autoAlpha: 0, filter: 'blur(18px)', scale: 1.08 },
      { autoAlpha: 1, filter: 'blur(0px)', scale: 1, duration: 2.4, ease: 'power2.out', immediateRender: false }, T.finalAt);
    tl.fromTo(els.photosRoot, { opacity: 1 }, { opacity: (CONFIG.outro && CONFIG.outro.columnsOpacity != null ? CONFIG.outro.columnsOpacity : 0.45), duration: 2.4, ease: 'power1.inOut', immediateRender: false }, T.finalAt - 0.5);
    tl.fromTo(replayBtn, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 1, ease: 'power2.out', immediateRender: false }, T.replayAt);
    if (lastDrop === 0) console.warn('[edit] no @Drop sections in the lrc — big moments are skipped');
  }
  // Flashes + shake impulses are pure functions of t (a rewound fromTo would leave its "from" value stuck after a seek back).
  function flashAt(strength, dur, at) { flashes.push({ at: at, s: strength, d: dur }); }
  function evalFlash(t) {
    var o = 0;
    for (var i = 0; i < flashes.length; i++) {
      var F = flashes[i], x = t - F.at;
      if (x >= 0 && x < F.d) { var q = 1 - x / F.d; o = Math.max(o, 0.7 * F.s * (1 - (1 - q) * (1 - q))); }
    }
    return o;
  }
  function evalShakes(t) {
    var imp = 0;
    for (var i = 0; i < shakes.length; i++) {
      var S = shakes[i], x = t - S.at;
      if (x < 0) continue;
      if (x < S.id) { var q = 1 - x / S.id; imp = Math.max(imp, S.imp * (1 - (1 - q) * (1 - q))); }
    }
    FX.impulse = imp;
  }

  /* ---------- per-frame loop ---------- */
  var PROFILE = {
    intro:     { speed: 0.6, glow: 5,  pulse: 0.15 },
    verse:     { speed: 0.9, glow: 6,  pulse: 0.22 },
    prechorus: { speed: 1.3, glow: 8,  pulse: 0.35 },
    chorus:    { speed: 1.3, glow: 10, pulse: 0.5 },
    drop:      { speed: 2.2, glow: 18, pulse: 1 },
    outro:     { speed: 0.25, glow: 6, pulse: 0.1 }
  };
  var frameN = 0, modNames = [];
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0.016; lastNow = now;
    if (!ctx || hidden) return;
    var t = audio.currentTime + (CONFIG.syncOffset || 0);
    var playing = started && !audio.paused && !audio.ended;
    var jumped = lastT !== null && (Math.abs(t - lastT) > 1.5 || t < lastT - 0.25);
    lastT = t;
    if (tl) tl.time(t, jumped);
    evalShakes(t);
    var fo2 = evalFlash(t);
    if (fo2 !== lastFlashOp) { lastFlashOp = fo2; elFlash.style.opacity = fo2.toFixed(3); }

    var sec = sectionAt(t) || { index: 0, type: 'intro', start: 0, end: duration, name: '', hasLyrics: false, dropNo: 0, lineIdx: [] };
    var span = Math.max(0.001, sec.end - sec.start), prog = clamp((t - sec.start) / span, 0, 1);
    var inOutro = t >= CONFIG.times.outroStart;
    var type = inOutro ? 'outro' : sec.type;

    if (jumped) { beat = 0; kickAmt = 0; sinceBeat = 1; cur.speed = -1; }
    updateBeat(dt, t, playing);

    // target profile
    var P = PROFILE[type] || PROFILE.verse, tg = { speed: P.speed, glow: P.glow, pulse: P.pulse };
    if (type === 'build') { tg.speed = 1.4 + prog * 4; tg.glow = 8 + prog * 8; tg.pulse = 0.35 + prog * 0.45; }
    if (cur.speed < 0) { cur.speed = tg.speed; cur.glow = tg.glow; cur.pulse = tg.pulse; }
    else {
      var k = 1 - Math.exp(-dt * 2.5);
      cur.speed += (tg.speed - cur.speed) * k; cur.glow += (tg.glow - cur.glow) * k; cur.pulse += (tg.pulse - cur.pulse) * k;
    }
    var inDrop = type === 'drop';

    // lyrics sit below a shrunk hero: publish its bottom edge (px in the column), pure function of t
    var hb = 0;
    for (var hi = 0; hi < shrinkMoms.length; hi++) {
      var SM = shrinkMoms[hi];
      if (t < SM.start || t >= SM.end) continue;
      var xq = clamp((t - SM.from) / SM.dur, 0, 1), sh = xq < 0.5 ? 2 * xq * xq : 1 - 2 * (1 - xq) * (1 - xq);
      var chh = els.texts.clientHeight;
      hb = Math.max(hb, chh * (0.5 - 0.28 * sh) + SM.rec.h * (1 - 0.45 * sh) / 2);
    }
    hb = Math.round(hb);
    if (hb !== lastHB) { lastHB = hb; els.lyricsRoot.style.setProperty('--hero-bottom', String(hb)); }

    // root vars
    var glow = cur.glow * (0.6 + beat * 0.9);
    var rs = document.documentElement.style;
    var gs = glow.toFixed(1);
    if (gs !== lastGlow) { lastGlow = gs; rs.setProperty('--glow', gs); }

    // build brightening, pulse, text beat-scale
    elBright.style.opacity = type === 'build' ? (Math.pow(prog, 1.6) * (REDUCED ? 0.25 : 0.6)).toFixed(3) : '0';
    elPulse.style.opacity = (beat * cur.pulse * (REDUCED ? 0.4 : 0.9)).toFixed(3);
    var ts = 1 + beat * 0.025 * (REDUCED ? 0 : 1);
    if (Math.abs(ts - lastTextScale) > 0.0005) { els.texts.style.transform = 'scale(' + ts.toFixed(4) + ')'; lastTextScale = ts; }

    // camera shake: ONLY during the two big drops, and small (no shake in build-ups / verses)
    if (!REDUCED) {
      kickAmt *= Math.exp(-dt * 7);
      var a = 0;
      if (inDrop) {
        var st = t - sec.start, decay = st < 1 ? 1 - 0.65 * st : 0.35;
        a = FX.impulse + kickAmt * 0.5 + Math.max(0.35, decay) * (0.3 + 0.5 * beat) * (sec.dropNo >= 2 ? 1.2 : 1);
      }
      a = Math.min(a, 2);
      if (a > 0.015) {
        var px = a * 3.4, x = (Math.sin(t * 53) + Math.sin(t * 29 + 1)) * 0.5 * px,
            y = (Math.sin(t * 47 + 2) + Math.sin(t * 31 + 4)) * 0.5 * px, rot = Math.sin(t * 41 + 3) * a * 0.2;
        var sc = 1 + 2 * Math.max(Math.abs(x), Math.abs(y)) / Math.min(PW, PH) + Math.abs(rot) * 0.012 + 0.006;
        els.stage.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + rot.toFixed(3) + 'deg) scale(' + sc.toFixed(4) + ')';
        lastShakeOn = true;
      } else if (lastShakeOn) { els.stage.style.transform = ''; lastShakeOn = false; }
    }

    // leaks speed, particles
    leaksTL.timeScale(clamp(cur.speed * 0.8, 0.15, 3));
    drawParticles(t, dt, cur.speed);

    // typed-name fallback (no TextPlugin)
    if (!HAS_TEXT) {
      var n = Math.round(FX.type * String(CONFIG.name).length);
      if (n !== typedN) { elName.textContent = String(CONFIG.name).slice(0, n); typedN = n; }
    }

    // modules
    if (jumped) { emit('seek', { t: t }); eachModule('onSeek', t); }
    var f = { t: t, dt: dt, playing: playing, bass: bass, beat: beat, sec: sec, secIndex: sec.index, secProgress: prog, reduced: REDUCED };
    for (var mi = 0; mi < modNames.length; mi++) {
      var mn = modNames[mi], m = Edit.modules[mn];
      if (!m || m._disabled || typeof m.frame !== 'function') continue;
      try { m.frame(f); } catch (e) { modError(mn, 'frame', e); }
    }
    frameN++;
  }

  /* ---------- start button: squish + a few small paper hearts ---------- */
  function paperHeart(fill, stroke, px) {
    return '<svg viewBox="0 0 24 22" width="' + px + '" height="' + (px * 22 / 24).toFixed(1) + '"><path d="M12 20.5C5 15 1.5 11.5 1.5 7.5 1.5 4.2 4 2.2 6.7 2.2c2.2 0 4 1.2 5.3 3.3 1.3-2.1 3.1-3.3 5.3-3.3 2.7 0 5.2 2 5.2 5.3 0 4-3.5 7.5-10.5 13z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }
  function playBurst() {
    playBtn.classList.add('squish');
    setTimeout(function () { playBtn.classList.remove('squish'); playBtn.classList.add('go'); }, 120);
    var r = playBtn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var cols = [['#f4a8c2', '#d9577f'], ['#fffdf8', '#e8a3bb'], ['#fbd3e1', '#d9577f']], n = window.innerWidth < 600 ? 8 : 12;
    for (var i = 0; i < n; i++) {
      var e = document.createElement('div'), a = Math.random() * 6.283, d = r.width * (0.7 + Math.random() * 1.0), c = cols[i % 3];
      e.className = 'burst'; e.innerHTML = paperHeart(c[0], c[1], Math.round(14 + Math.random() * 14));
      els.app.appendChild(e);
      gsap.fromTo(e, { x: cx, y: cy, xPercent: -50, yPercent: -50, scale: 0.3, opacity: 1, rotation: (Math.random() - 0.5) * 40 },
        { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d - 30, scale: 0.8 + Math.random() * 0.5, rotation: (Math.random() - 0.5) * 80,
          opacity: 0, duration: 1 + Math.random() * 0.5, ease: 'power2.out', onComplete: function () { this.targets()[0].remove(); } });
    }
  }

  /* ---------- start / replay / visibility ---------- */
  /* phone polish: iOS audio unlock, fullscreen (phones only), screen wake lock. All fail silently. */
  var wakeSentinel = null;
  function unlockAudio() {
    try {
      if (!actx) return;
      if (actx.state !== 'running') actx.resume();            // synchronous, inside the click
      var b = actx.createBuffer(1, 1, 22050), s = actx.createBufferSource();   // iOS Safari silent-buffer trick
      s.buffer = b; s.connect(actx.destination); s.start(0);
    } catch (e) {}
  }
  function isPhone() {
    try {
      return window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 820;
    } catch (e) { return false; }
  }
  function goFullscreen() {
    try {
      if (!CONFIG.fullscreenOnPhone || !isPhone()) return;
      var d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen;
      if (!f || document.fullscreenElement || document.webkitFullscreenElement) return;
      var r = f.call(d); if (r && r.catch) r.catch(function () {});
    } catch (e) {}
  }
  function getWakeLock() {
    try {
      if (!CONFIG.wakeLock || !navigator.wakeLock || wakeSentinel) return;
      navigator.wakeLock.request('screen').then(function (s) {
        wakeSentinel = s;
        s.addEventListener('release', function () { wakeSentinel = null; });
      }, function () {});
    } catch (e) {}
  }
  function releaseWakeLock() {
    try { if (wakeSentinel) { wakeSentinel.release(); wakeSentinel = null; } } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && started && !audio.ended) getWakeLock(); });
  audio.addEventListener('ended', releaseWakeLock);

  function begin() {
    if (started || !ctx) return;
    started = true;
    // everything that must happen inside the user gesture goes first
    var p;
    try {
      setupAnalyser();
      unlockAudio();
      p = audio.play();
    } catch (e) { console.error(e); }
    goFullscreen(); getWakeLock();
    if (p && p.catch) p.catch(function (e) {
      console.error('[edit] play() rejected', e);
      started = false; playBtn.classList.remove('squish', 'go'); gsap.killTweensOf(startEl); startEl.style.visibility = 'visible'; gsap.set(startEl, { autoAlpha: 1 });
      setLabel('tap again to start');
    });
    if (REDUCED) gsap.to(startEl, { autoAlpha: 0, duration: 0.7, ease: 'power1.out' });
    else { playBurst(); gsap.to(startEl, { autoAlpha: 0, duration: 0.7, delay: 0.5, ease: 'power1.out' }); }
    emit('start');
  }
  function doReplay() {
    gsap.killTweensOf([elFlash2, replayBtn]);
    gsap.set(elFlash2, { opacity: 0 });
    gsap.set(replayBtn, { autoAlpha: 0 });
    els.stage.style.transform = ''; lastShakeOn = false;
    kickAmt = 0; beat = 0; cur.speed = -1;
    audio.currentTime = 0; lastT = 0;
    if (tl) tl.time(0, true);
    var p = audio.play(); if (p && p.catch) p.catch(function () {});
    eachModule('reset');
    emit('reset');
  }
  replayBtn.addEventListener('click', doReplay);
  playBtn.addEventListener('click', begin);

  audio.addEventListener('ended', function () {
    emit('ended');
    gsap.to(replayBtn, { autoAlpha: 1, y: 0, duration: 0.6 });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      hidden = true;
      wasPlaying = started && !audio.paused && !audio.ended;
      audio.pause(); gsap.globalTimeline.pause();
      emit('pause');
    } else {
      hidden = false; lastNow = 0;
      gsap.globalTimeline.resume();
      if (actx && actx.state === 'suspended') actx.resume();
      if (wasPlaying) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
      emit('resume');
    }
  });
  window.addEventListener('resize', resizeAll);

  /* ---------- loading ---------- */
  function timeoutP(ms, v) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms); }); }
  function once(target, evts) {
    return new Promise(function (res) {
      var done = function () { evts.forEach(function (e) { target.removeEventListener(e, done); }); res(); };
      evts.forEach(function (e) { target.addEventListener(e, done); });
    });
  }

  function fallbackSections(dur) {
    return [{ index: 0, type: 'intro', name: 'Intro', start: 0, end: dur, hasLyrics: false, dropNo: 0, lineIdx: [] }];
  }

  function load() {
    elSub.textContent = CONFIG.subtitle || '';
    elName.textContent = '';
    makeSprite(); resizeAll();
    requestAnimationFrame(loop);

    audio.preload = 'auto'; audio.src = CONFIG.audio;
    var audioErr = false;
    audio.addEventListener('error', function () { audioErr = true; });
    var meta = Promise.race([once(audio, ['loadedmetadata', 'error']), timeoutP(4000)]);
    var canplay = Promise.race([once(audio, ['canplay', 'error']), timeoutP(6000)]);
    try { audio.load(); } catch (e) {}

    var lrcUrl = CONFIG.lrc + (DEBUG ? '?v=' + Date.now() : '');
    var lrcP = fetch(lrcUrl, { cache: DEBUG ? 'no-store' : 'default' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });

    Promise.all([lrcP, meta]).then(function (res) {
      var text = res[0];
      if (isFinite(audio.duration) && audio.duration > 1) duration = audio.duration;
      var parsed;
      if (Edit.LRC && Edit.LRC.parse && Edit.LRC.buildSections) {
        parsed = Edit.LRC.parse(text);
        sections = Edit.LRC.buildSections(parsed, CONFIG, duration);
      } else {
        console.error('[edit] Edit.LRC missing (lrc.js failed to load) — playing without sections');
        parsed = { markers: [], lines: [] }; sections = fallbackSections(duration);
      }
      modNames = Object.keys(Edit.modules);
      ctx = {
        CONFIG: CONFIG, audio: audio, gsap: gsap, reduced: REDUCED, debug: DEBUG,
        lrc: parsed, sections: sections, sectionAt: sectionAt, duration: duration, els: els,
        flash: flash, kick: kick, on: on, tl: null
      };
      buildTimeline();
      ctx.tl = tl;
      window.__edit = ctx;

      var inits = [];
      Object.keys(Edit.modules).forEach(function (name) {
        var m = Edit.modules[name];
        if (!m || typeof m.init !== 'function') return;
        try { inits.push(Promise.resolve(m.init(ctx)).catch(function (e) { modError(name, 'init', e); })); }
        catch (e) { modError(name, 'init', e); }
      });
      return Promise.all([Promise.race([Promise.all(inits), timeoutP(8000)]), canplay]);
    }).then(function () {
      if (audioErr) { setLabel('couldn’t load the song — check Music/ path'); return; }
      playBtn.disabled = false;
      setLabel('press play');
    }).catch(function (e) {
      console.error('[edit] load failed', e);
      setLabel(FILE || e instanceof TypeError ? 'open this with a local server (Live Server / Go Live)' : 'something went wrong loading — try refreshing');
    });
  }

  load();
})();
