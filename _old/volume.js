/* volume.js — desktop volume control. Volume goes through the GainNode that script.js puts AFTER the analyser
   (Edit.audioGraph.gain), so the bass-reactive effects keep working at any volume, even muted. */
(function () {
  'use strict';
  window.Edit = window.Edit || { modules: {} };
  Edit.modules = Edit.modules || {};

  var KEY = 'klei.volume';
  var vol = 0.8, muted = false, audio, box, btn, slider;

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s.vol === 'number') { vol = Math.min(1, Math.max(0, s.vol)); muted = !!s.muted; }
    } catch (e) {}
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ vol: vol, muted: muted })); } catch (e) {} }

  function apply() {
    var eff = muted ? 0 : vol, g = Edit.audioGraph;
    if (g && g.gain) {
      audio.volume = 1; audio.muted = false;                       // keep the element at full so the analyser always sees the signal
      g.gain.gain.setTargetAtTime(eff * eff, g.actx.currentTime, 0.02);   // squared = closer to perceived loudness
    } else {
      audio.volume = eff; audio.muted = muted;                      // no Web Audio (e.g. file://): plain element volume
    }
    if (!slider) return;
    slider.value = String(vol);
    slider.style.setProperty('--v', (vol * 100).toFixed(0) + '%');
    var off = muted || vol === 0;
    box.classList.toggle('muted', off);
    btn.setAttribute('aria-label', off ? 'Unmute' : 'Mute');
    btn.setAttribute('aria-pressed', off ? 'true' : 'false');
  }
  function toggleMute() {
    if (muted || vol === 0) { muted = false; if (vol === 0) vol = 0.5; } else muted = true;
    save(); apply();
  }

  Edit.modules.volume = {
    init: function (ctx) {
      audio = ctx.audio;
      box = document.getElementById('vol'); btn = document.getElementById('volBtn'); slider = document.getElementById('volSlider');
      if (!box || !btn || !slider) return;
      load(); apply();
      btn.addEventListener('click', toggleMute);
      slider.addEventListener('input', function () {
        vol = parseFloat(slider.value) || 0;
        muted = vol === 0 ? muted : false;
        save(); apply();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'm' && e.key !== 'M') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var tg = e.target && e.target.tagName;
        if (tg === 'TEXTAREA' || tg === 'SELECT' || (tg === 'INPUT' && e.target.type !== 'range')) return;
        toggleMute();
      });
      if (ctx.on) ctx.on('start', function () { box.classList.add('on'); apply(); });   // gain node exists by now
    }
  };
})();
