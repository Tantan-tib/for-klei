/* montage.js — the montage video takes the letter's spot once the letter has folded away. It plays once (muted, the song
   supplies the sound), is slaved to the song (pauses/resumes/seeks with it) and fades out when the outro starts. */
(function () {
  'use strict';
  window.Edit = window.Edit || { modules: {} };
  Edit.modules = Edit.modules || {};

  var DEFAULTS = {
    enabled: true,
    startOffset: 0,      // seconds after the letter is gone until the video starts
    drift: 0.6           // resync the video if it differs from the song by more than this (s)
  };

  var cfg, root, video, outroStart = 260, debug = false;
  var startAt = null, state = '', logged = false;

  function fmt(s) { var m = Math.floor(s / 60); return m + ':' + ('0' + (s - m * 60).toFixed(1)).slice(-4); }

  function setState(s) {
    if (s === state) return;
    state = s;
    root.classList.toggle('show', s === 'show');
    root.classList.toggle('out', s === 'out');
  }

  function rewind() {
    try { video.pause(); video.currentTime = 0; } catch (e) {}
    logged = false;
  }

  function frame(f) {
    if (!root || !video) return;
    var lt = Edit.letterTimes;
    if (!lt) return;
    startAt = lt.goneAt + cfg.startOffset;
    var t = f.t;

    if (t < startAt || startAt >= outroStart) {                 // not yet (or never: the letter ran into the outro)
      if (state !== '') { setState(''); rewind(); }
      return;
    }
    if (t >= outroStart) {                                       // outro: fade out
      if (state === 'show') setState('out');
      if (state === 'out' && !video.paused) video.pause();
      return;
    }

    var want = t - startAt;
    if (state !== 'show') {
      setState('show');
      if (!logged) {
        logged = true;
        if (debug) console.log('[montage] video starts at song time ' + fmt(t) + ' (' + t.toFixed(2) + 's), ' + Math.max(0, outroStart - t).toFixed(1) + 's before the outro');
      }
    }
    var dur = video.duration;
    if (isFinite(dur) && want >= dur) return;                    // finished: it holds on its last frame
    if (f.playing) {
      if (Math.abs(video.currentTime - want) > cfg.drift && video.readyState > 0) {
        try { video.currentTime = want; } catch (e) {}
      }
      if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
    } else if (!video.paused) {
      video.pause();
    }
  }

  function reset() {
    state = ''; root.classList.remove('show', 'out'); rewind();
  }

  Edit.modules.montage = {
    init: function (ctx) {
      cfg = Object.assign({}, DEFAULTS, (ctx.CONFIG && ctx.CONFIG.montage) || {});
      outroStart = (ctx.CONFIG && ctx.CONFIG.times && ctx.CONFIG.times.outroStart) || outroStart;
      debug = !!ctx.debug;
      root = document.getElementById('montage-root');
      if (!root) return;
      video = root.querySelector('video');
      if (!cfg.enabled || !video) { root = null; return; }
      video.muted = true; video.defaultMuted = true; video.loop = false;
      if (ctx.on) {
        ctx.on('seek', function (d) {           // seeking the song: let frame() re-place the video from scratch
          var t = d && d.t != null ? d.t : 0;
          if (startAt == null || t < startAt) { reset(); }
          else { logged = true; if (state === 'out' && t < outroStart) state = ''; }
        });
        ctx.on('reset', reset);
        ctx.on('pause', function () { if (video) video.pause(); });
      }
    },
    frame: frame,
    reset: function () { if (root) reset(); }
  };
})();
