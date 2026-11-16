/* volume.js — desktop volume control. Drives Book.audio (book.js): volume goes through the master GainNode that the song
   and the paper flip sound share, so the flip sound follows the slider too. Hidden by volume.css on phones. */
(function () {
  'use strict';
  var KEY = 'klei.volume';
  var vol = 0.8, muted = false, box, btn, slider;

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s.vol === 'number') { vol = Math.min(1, Math.max(0, s.vol)); muted = !!s.muted; }
    } catch (e) {}
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ vol: vol, muted: muted })); } catch (e) {} }

  function apply() {
    if (window.Book && Book.audio && Book.audio.setVolume) Book.audio.setVolume(vol, muted);
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

  function init() {
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
    if (window.Book && Book.on) {
      Book.on('tapopen', function () { box.classList.add('on'); apply(); });   // gain node exists once the tap unlocked audio
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
