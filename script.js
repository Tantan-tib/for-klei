/* =====================================================================
   CONFIG — everything you'll want to edit lives here (the book's page order, photos per page,
   the 30 s wait, flip timings, dates). Times are SECONDS of the song (4:31 = 271).
   Below the config: window.Book.dates helpers, then the orchestrator (lock -> open -> song -> close -> browse).
   ===================================================================== */
const CONFIG = {
  name: "Klei",
  audio: "Music/Clarity_spotdown.org.mp3",
  lrc: "lyrics/clarity.lrc",          // loaded as-is; lines starting with @ are section markers, not lyrics
  duration: 271,                      // fallback if audio.duration isn't known yet

  // ---- dates ----
  // !!! SET THE REAL YEAR !!!  Month/day (Jan 18) is right, the year was never given. Used for "month N", the days counter and the lock answer.
  anniversaryDate: "2026-01-18",
  lock: {
    tag: "{name}, what's our date?",  // {name} -> CONFIG.name (lower-cased)
    placeholder: "mm/dd",
    wrong: "nope, try again",
    tapToOpen: "tap to open",
    // answers are derived from anniversaryDate: 01/18, 1/18, 0118, jan 18, january 18 (+ optional year, any case)
    extraAnswers: []
  },

  // ---- the letter (spread 1, right page) ----
  letter: {
    src: "letter/letter.txt",
    typeStart: 2,          // seconds of song time after which typing begins
    charsPerSec: 35,       // typing speed (same as before)
    commaPause: 0.25,
    periodPause: 0.65,
    paragraphPause: 0.95,
    holdAfterTyped: 30     // the letter stays this long after it finishes typing, then the book flips on.
                           // A fixed anchor (birthdayAt) wins if it comes first: the wait is then shortened (the planner logs it).
  },

  // ---- page order = song order = browse order ----
  // letter    : spread 1  (left: lyrics, right: letter).  portrait/single-page: just the letter page, lyrics go in its bottom margin
  // birthday  : full-spread "HAPPY BIRTHDAY" moment      (lands exactly on song.birthdayAt)
  // photos    : one spread of taped polaroids, 2 pages    (photos are taken from CONFIG.photos in order, count per page = photosPerPage)
  // montage   : spread with the montage video taped on it
  // monthsary : full-spread "HAPPY MONTHSARY / month N"  (lands exactly on song.monthsaryAt)
  // finale    : "happy birthday & happy monthsary, klei" + days counter
  pageOrder: ["letter", "photos", "birthday", "photos", "photos", "photos", "monthsary", "montage", "finale"],
  photosPerPage: [2, 3, 2, 2, 3, 2, 2, 1],   // consumed in order, one entry per photo PAGE (4 photo spreads x 2 pages). Sum must equal photos.length (17); extra entries/slots are ignored/decorative.

  // ---- song mode timeline ----
  song: {
    birthdayAt: 74.35,     // HAPPY BIRTHDAY spread + small confetti lands here (first drop)
    monthsaryAt: 211.9,    // HAPPY MONTHSARY spread + big confetti lands here (final drop)
    momentHold: 7,         // seconds a big-moment spread stays before the photos continue
    finaleAt: 264.2,       // last page "happy birthday & ..." + days counter (montage ends ~262.4, the page then flips)
    closeAt: 270.5,        // the book starts closing (final page stays ~6s)
    closeSecs: 3.5,        // length of the slow close
    mustEndBefore: 264,    // the montage (incl. caption hold) must be finished by here
    montageHold: 1,        // seconds the "tape marks + caption" page stays after the video faded, before the next flip
    // seconds a photo spread stays, by the section it STARTS in (the planner scales these so everything fits exactly).
    spreadWeight: { intro: 1.0, verse: 1.0, prechorus: 1.0, chorus: 1.0, build: 1.0, drop: 1.0, outro: 1.0 },
    // flip animation duration in ms, by the section the flip happens in
    flipMs: { intro: 1400, verse: 1400, prechorus: 900, chorus: 800, build: 650, drop: 450, outro: 1200 }
  },

  montage: {
    src: "video/montage.mp4", poster: "video/montage-poster.jpg",
    duration: 43,                    // fallback until the video metadata is known
    caption: "our little movie",     // handwritten under the print once the video has faded
    date: "2026"                     // small handwritten date next to it (free text)
  },

  // ---- flip / book feel ----
  book: {
    flipSoundVolume: 0.10,     // paper sound, mixed UNDER the song (0..1 of the master gain)
    browseFlipMs: 700,
    singleBreakpoint: 700,     // width (px) at/below which portrait single-page mode is used (or any portrait screen)
    wakeLock: true,            // keep the screen awake while the song plays
    fullscreenOnPhone: false
  },

  // ---- confetti ----
  confetti: {
    enabled: true,
    colors: ["#f7b6cf", "#f4a6c0", "#ee8fb3", "#ffe9d6", "#fff6ea", "#ffffff"],
    small: { count: 70, volleys: 2, spread: 70 },
    big: { count: 150, volleys: 5, spread: 90 },
    heartShare: 0.4
  },

  // ---- captions: captions.json ({"file.jpg": "text"}); non-empty ones show on the polaroid ----
  captions: { enabled: true, src: "captions.json" },

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
    { src: "pictures/photo_6284946062694879529_y.jpg", w: 900, h: 1200 }
  ]
};

/* ---------- namespace + date helpers (shared by every module) ---------- */
(function () {
  'use strict';
  var B = window.Book = window.Book || {};
  B.CONFIG = CONFIG;
  var ls = {};
  B.on = function (evt, fn) { (ls[evt] = ls[evt] || []).push(fn); return fn; };
  B.off = function (evt, fn) { ls[evt] = (ls[evt] || []).filter(function (f) { return f !== fn; }); };
  B.emit = function (evt, data) { (ls[evt] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error('[book] ' + evt, e); } }); };
  B.debug = /[?&]debug\b/.test(location.search);

  function parts() {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(CONFIG.anniversaryDate || ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : { y: 2026, m: 1, d: 18 };
  }
  B.dates = {
    parts: parts,
    start: function () { var p = parts(); return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0); },
    monthsElapsed: function (now) {
      var p = parts(), n = now || new Date();
      var mo = (n.getFullYear() - p.y) * 12 + (n.getMonth() + 1 - p.m);
      if (n.getDate() < p.d) mo--;
      return Math.max(0, mo);
    },
    daysSince: function (now) {
      var p = parts(), n = now || new Date();
      var a = Date.UTC(p.y, p.m - 1, p.d), b = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
      return Math.max(0, Math.round((b - a) / 86400000));
    }
  };
})();

/* ---------- ORCHESTRATOR: lock -> cover -> song -> closing -> closed -> browse (-> song again) ----------
   Book.state is one of: lock | cover | song | closing | closed | browse.  Every change emits Book.emit('state', name).
   The 'tapopen' / 'tapreopen' handlers run synchronously inside the user's tap (iOS needs that to unlock audio). */
(function () {
  'use strict';
  var B = window.Book, OPEN_MS = 1700, closeTimer = 0;
  B.state = '';

  function setState(s) {
    if (B.state === s) return;
    B.state = s;
    document.documentElement.setAttribute('data-state', s);
    B.emit('state', s);
  }
  function has(mod, fn) { return !!(B[mod] && typeof B[mod][fn] === 'function'); }
  function call(mod, fn, a) {
    if (has(mod, fn)) { try { return B[mod][fn](a); } catch (e) { console.error('[book] ' + mod + '.' + fn, e); } }
    else console.warn('[book] ' + mod + '.' + fn + ' is not available yet');
  }
  function startSong() {
    B.engine.mount([], { startPage: -1 });     // drop old pages, sit on the closed cover; the module mounts its own pages next
    call('song', 'start', { openMs: OPEN_MS });   // song.start() mounts its pages and performs the (single) opening flip
  }

  function boot() {
    if (!B.engine) { console.error('[book] book.js (engine) missing'); return; }
    setState('lock');
    B.engine.init();

    B.on('unlocked', function () { if (B.state === 'lock') setState('cover'); });

    // the tap on the cover: audio unlock + open + song, all synchronously in the gesture
    B.on('tapopen', function () {
      if (B.state !== 'cover') return;
      B.audio.unlock();
      B.audio.wake(true);
      B.engine.setCoverNote(null);
      setState('song');
      startSong();
    });

    // song finished its finale: close the book at CONFIG.song.closeAt (song.js may already have closed it; close() is idempotent)
    B.on('songend', function () {
      if (B.state !== 'song') return;
      setState('closing');
      var now = B.audio.el ? B.audio.el.currentTime : 0, at = CONFIG.song.closeAt || 0;
      var wait = (B.audio.el && !B.audio.el.paused && at > now) ? (at - now) * 1000 : 0;
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () { B.engine.close((CONFIG.song.closeSecs || 3.5) * 1000); }, wait);
    });

    B.on('closed', function () {
      if (B.state !== 'closing' && B.state !== 'song') return;
      clearTimeout(closeTimer);
      setState('closed');
      B.audio.wake(false);
      B.engine.setCoverNote('open again');
    });

    B.on('tapreopen', function () {
      if (B.state !== 'closed') return;
      B.audio.unlock();
      B.engine.setCoverNote(null);
      setState('browse');
      B.engine.mount([], { startPage: -1 });
      call('browse', 'enter');
      B.engine.open(OPEN_MS);
    });

    // back-cover button "play our song again"
    B.on('replaysong', function () {
      if (B.state !== 'browse') return;
      B.audio.unlock();
      B.audio.wake(true);
      call('browse', 'exit');
      setState('song');
      startSong();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
