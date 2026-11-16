/* lock.js — "what's our date?" card shown before the play button. Just for fun, not security.
   Reads CONFIG.lock + CONFIG.anniversaryDate (script.js). Independent of the Edit.modules timeline:
   it only toggles #app.locked, so the core's own load logic (which enables #play) works in any order.
   Exposes Edit.lock = { parse, check, unlocked } for tests. Classic script. */
(function () {
  'use strict';
  var G = typeof window !== 'undefined' ? window : globalThis;
  G.Edit = G.Edit || { modules: {} };

  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  function monthFromWord(w) {
    if (!/^[a-z]+$/.test(w) || w.length < 3) return 0;
    if (w === 'sept') return 9;
    for (var i = 0; i < 12; i++) if (MONTHS[i].indexOf(w) === 0) return i + 1;
    return 0;
  }
  function fixYear(s) {
    if (s == null || s === '') return null;
    var y = +s;
    if (s.length === 2) return 2000 + y;
    if (s.length === 4) return y;
    return null;
  }
  // -> { m, d, y|null } or null.  Lenient: lowercase, ordinals, dots/commas/dashes/slashes/spaces, names, compact digits.
  function parse(raw) {
    var s = String(raw == null ? '' : raw).toLowerCase().trim();
    if (!s) return null;
    s = s.replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/\b(of|the)\b/g, ' ')
      .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2')
      .replace(/[.,\/\\\-–—_:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    var tok = s.split(' '), i, mon = 0, nums = [], bad = false;
    for (i = 0; i < tok.length; i++) {
      if (/^\d+$/.test(tok[i])) nums.push(tok[i]);
      else {
        var mm = monthFromWord(tok[i]);
        if (mm && !mon) mon = mm; else bad = true;
      }
    }
    if (bad) return null;
    var m, d, y = null;
    if (mon) {                                   // "jan 18", "18 jan 2026", "january 18th"
      if (!nums.length || nums.length > 2) return null;
      m = mon; d = +nums[0]; y = fixYear(nums[1]);
    } else if (nums.length === 1) {              // 0118, 118, 011826, 01182026, 1182026 ...
      var dg = nums[0], ok = false;
      for (var ml = 1; ml <= 2 && !ok; ml++) for (var dl = 1; dl <= 2 && !ok; dl++) {
        var rest = dg.slice(ml + dl);
        if (dg.length < ml + dl || (rest !== '' && rest.length !== 2 && rest.length !== 4)) continue;
        var cm = +dg.slice(0, ml), cd = +dg.slice(ml, ml + dl);
        if (cm >= 1 && cm <= 12 && cd >= 1 && cd <= 31) { m = cm; d = cd; y = fixYear(rest); ok = true; }
      }
      if (!ok) return null;
    } else if (nums.length === 2 || nums.length === 3) {   // 1/18, 01 18, 1/18/2026
      m = +nums[0]; d = +nums[1]; y = fixYear(nums[2]);
      if (m > 12 && d <= 12) { var tmp = m; m = d; d = tmp; }   // 18/01
    } else return null;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return { m: m, d: d, y: y };
  }
  function squash(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  // cfg = CONFIG.lock, ann = {y,m,d}
  function check(raw, cfg, ann) {
    cfg = cfg || {};
    var target = cfg.date && cfg.date.month ? { m: cfg.date.month, d: cfg.date.day } : { m: ann.m, d: ann.d };
    var sq = squash(raw);
    if (!sq) return false;
    var extra = cfg.extraAnswers || [];
    for (var i = 0; i < extra.length; i++) if (squash(extra[i]) === sq) return true;
    var p = parse(raw);
    if (!p || p.m !== target.m || p.d !== target.d) return false;
    if (cfg.strictYear && p.y != null) {
      var years = (cfg.years && cfg.years.length) ? cfg.years : [ann.y];
      if (years.indexOf(p.y) < 0) return false;
    }
    return true;
  }

  var state = G.Edit.lock = { parse: parse, check: check, unlocked: false };

  function init() {
    var app = document.getElementById('app'), lock = document.getElementById('lock'), startEl = document.getElementById('start');
    if (!app || !lock) { if (app) app.classList.remove('locked'); return; }
    var CFG = (typeof CONFIG !== 'undefined' && CONFIG) || {};
    var cfg = CFG.lock || {};
    var ann = (G.Edit.dates && G.Edit.dates.parts) ? G.Edit.dates.parts() : { y: 2026, m: 1, d: 18 };
    var debug = /[?&]debug\b/.test(location.search);

    function open(instant) {
      state.unlocked = true;
      app.classList.remove('locked');
      app.classList.add('unlocked');
      if (startEl) { try { startEl.inert = false; } catch (e) {} startEl.removeAttribute('aria-hidden'); }
      try { document.dispatchEvent(new CustomEvent('edit:unlocked')); } catch (e) {}
      if (instant) { lock.parentNode && lock.parentNode.removeChild(lock); return; }
      lock.classList.add('away');
      setTimeout(function () { if (lock.parentNode) lock.parentNode.removeChild(lock); }, (+cfg.slideMs || 800) + 150);
      var pb = document.getElementById('play'); if (pb && !pb.disabled) { try { pb.focus({ preventScroll: true }); } catch (e) {} }
    }

    if (cfg.enabled === false || (debug && cfg.skipInDebug !== false)) { open(true); return; }

    if (startEl) { try { startEl.inert = true; } catch (e) {} startEl.setAttribute('aria-hidden', 'true'); }
    var name = String(CFG.name || 'klei').toLowerCase();
    var card = document.getElementById('lockCard'), input = document.getElementById('lockInput'),
        msg = document.getElementById('lockMsg'), title = document.getElementById('lockTitle'),
        goBtn = card && card.querySelector('.lk-go');
    if (title) title.textContent = String(cfg.title || "{name}, what's our date?").replace(/\{name\}/g, name);
    if (input && cfg.placeholder != null) input.placeholder = cfg.placeholder;
    if (goBtn && cfg.button != null) goBtn.textContent = cfg.button;
    document.documentElement.style.setProperty('--lk-slide', (+cfg.slideMs || 800) + 'ms');

    var tries = 0, busy = false;
    card.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy || state.unlocked) return;
      if (check(input.value, cfg, ann)) {
        busy = true; msg.textContent = ''; input.blur();
        open(false);
      } else {
        tries++;
        msg.textContent = cfg.wrong || 'nope, try again';
        if (cfg.hint && tries >= (cfg.hintAfter || 3)) msg.textContent += '\n' + cfg.hint;
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        input.select();
      }
    });
    card.addEventListener('animationend', function (e) { if (e.animationName === 'lk-shake') card.classList.remove('shake'); });
    input.addEventListener('input', function () { if (msg.textContent) msg.textContent = ''; });
    // desktop: focus right away (phones: don't force the keyboard open)
    if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) {} }, 50);
  }

  function safeInit() {
    try { init(); }
    catch (e) {   // never leave her stuck behind a broken lock
      console.error('[edit] lock failed, unlocking', e);
      var app = document.getElementById('app'); if (app) { app.classList.remove('locked'); app.classList.add('unlocked'); }
      var l = document.getElementById('lock'); if (l && l.parentNode) l.parentNode.removeChild(l);
      var s = document.getElementById('start'); if (s) { try { s.inert = false; } catch (er) {} s.removeAttribute('aria-hidden'); }
    }
  }
  if (typeof document !== 'undefined') {
    // script.js (CONFIG) is loaded after this file, so wait until all scripts have run
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit);
    else safeInit();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = state;
})();
