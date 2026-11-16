# Klei book — shared contract (read fully before touching code)

Old site code is copied in `_old/` for reference/borrowing (lrc.js is kept in place and is unchanged; `_old/script.js` has the original audio graph/wake lock/begin logic; `_old/outro.js` days counter; `_old/confetti.js`; `_old/lyrics.js` section animations; `_old/lock.js` date parsing; `_old/volume.js`).
No bundler. Plain browser JS (ES5/ES2015 style, IIFE per file), relative paths only (GitHub Pages). `index.html`, the CONFIG block and the `Book` namespace at the top of `script.js` are already written: read them; don't restructure them. Add config keys only if truly needed (tell the lead). Keep the scrapbook look: cream paper `#fbf3e6`, pink `#f4a8c2`/`#d9577f`, ink `#4a2f3a`, Caveat handwriting, masking tape, soft shadows.

## Flow / state machine (orchestrator at the bottom of script.js)
`lock` -> `cover` ("tap to open" on the cover) -> `song` (first open; timed to audio.currentTime) -> `closing` -> `closed` ("open again" on cover) -> `browse` (free flipping, no music) -> (back-cover "play our song again" -> `song` again) ...
`Book.state` holds the current state string; `Book.emit('state', name)` on every change.

## Files and owners (each task edits ONLY its own files)
| task | files |
|---|---|
| ENGINE | `base.css` (tokens, grain, `.page` paper, `#bg`, `#app`), `book.js`, `book.css`, lock UI + date parsing (inside book.js, or `lock.js` + `lock.css` — if you add files tell the lead to add the `<script>/<link>`), flip sound, AudioContext unlock, wake lock, `volume.js` adaptation, the orchestrator at the bottom of `script.js`, `Book.audio` |
| SONG | `song.js`, `song.css` (+ may add `lyrics-anim.css` content inside song.css), planner, lyrics, letter typing, confetti, timeline, finale trigger |
| BROWSE | `pages.js`, `pages.css` (page factory: ALL page contents), `browse.js`, `browse.css` (browse mode, nav, mobile layout/responsive of pages) |

## Shared coordinate system
Every page is a DOM element of the same aspect ratio **0.72 (w/h)**; StPageFlip is created with `width:400, height:556, size:'stretch', showCover:true, usePortrait:true, mobileScrollSupport:false, maxShadowOpacity:0.5, drawShadow:true, flippingTime:<ms>`. Pages are laid out inside with percentage / `em` units based on a CSS var `--pw` (page width in px) set on `#book` by the engine (`Book.engine` updates it on resize). **All page contents must scale with `--pw`** (use `calc(var(--pw) * k)` for font sizes).

## Layouts
`Book.layout()` returns `'double'` (landscape/desktop: two-page spreads, left+right) or `'single'` (portrait/phone: one page, same flip animation). Decided by `window.innerWidth <= CONFIG.book.singleBreakpoint || portrait`. The engine emits `Book.emit('layout', 'double'|'single')` when it changes (after rebuilding with the current pages).

A **unit** = one entry of `CONFIG.pageOrder`. Pages per unit:
| unit | double | single |
|---|---|---|
| letter | 2 (lyrics page, letter page) | 1 (letter page; the lyrics show only in its bottom margin line) |
| birthday | 2 (left: "HAPPY", right: "BIRTHDAY" + doodles — together read as one full spread) | 1 (both words) |
| photos | 2 | 2 |
| montage | 2 (left: caption/doodle page, right: the video print) | 1 (the video print + caption) |
| monthsary | 2 | 1 |
| finale | 2 (left: message, right: days counter) | 1 (both) |
Book page array = `[frontCover, ...unit pages..., backCover]`. In double layout the inner count is even automatically. `index.html` pages 0 and last are covers (engine builds the covers; the page factory builds only the inner pages).

## Shared APIs (all on `window.Book`)

### Book.engine (ENGINE, book.js)
```
Book.engine.init()                          // build cover/lock overlay, called once by the orchestrator
Book.engine.mount(pageEls, {startPage})     // (re)creates the StPageFlip with [cover, ...pageEls, backCover]; pageEls = inner pages only
Book.engine.open(ms)  -> Promise            // flip cover open (to page 1)
Book.engine.close(ms) -> Promise            // slowly flip back to the cover; book then sits closed
Book.engine.flipTo(innerIndex, {ms, instant}) -> Promise   // innerIndex is into pageEls (0-based, cover excluded). In double layout this shows the SPREAD that contains it (innerIndex even = left page). ms = flip duration
Book.engine.current() -> innerIndex of the visible page (left page of the spread in double layout; -1 = cover shown, pageCount = back cover)
Book.engine.setManual(bool)                 // false (song mode) => #book-shield blocks all input; true (browse) => drag/click/keys/swipe allowed
Book.engine.setCoverNote(html|null)         // text shown on the closed cover (handwritten); null hides
Book.engine.flipMs(ms)                      // set flippingTime used by the next flips
Book.engine.pageSize()                      // {w,h} px of one page
Book.audio  = { el, ctx, unlock(), flipSound(), getGain() }   // unlock() MUST be called synchronously inside the user's tap (iOS); flipSound() plays a quiet synthesized paper-flip (call from the 'flip' event; volume CONFIG.book.flipSoundVolume)
```
Events (via `Book.on`): `'unlocked'` (right date), `'tapopen'` (the tap on the cover; orchestrator then does `Book.audio.unlock()`, `engine.open()` and starts the song), `'flip'` ({from,to,manual}) after each page change, `'layout'`, `'closed'`, `'opened'`, `'tapreopen'` (tap on the closed cover in `closed` state), `'resize'`.

### Book.pages (BROWSE, pages.js) — the page factory, used by BOTH song and browse
```
Book.pages.build({layout, mode}) -> {
  els: [HTMLElement...],            // inner pages in order (class "page", already sized 100%/100% by StPageFlip)
  units: [{ kind, idx: [innerIndex...], photos:[{src,w,h,caption}...] , el: {...named parts} }],
  refs: { lyricsPage, letterPage,   // elements; lyricsPage is null in single layout
          letterText,               // element INSIDE letterPage where song.js types text (see below)
          cursor,                   // the .lt-cursor span
          montage: {page, frame, video, tape, caption}, 
          birthday:{pages:[...]}, monthsary:{pages:[...]}, finale:{pages:[...], daysEl, ...} }
}
mode: 'song'   -> letter text EMPTY (song.js types it), montage video not playing and showing its poster, no auto behaviours.
mode: 'browse' -> letter text FULL (typed already), no lyrics anywhere, montage video plays when the page is shown (browse.js hooks 'flip'), tap on the video print replays it, days counter static/animated once when shown.
Book.pages.startDays(finaleRefs, {animate:true}) // count-up animation (song.js calls it at the finale; browse uses it when the finale is shown)
```
Page contract for the live layers song.js writes into (BROWSE must build these exactly):
- **every** page element contains `<div class="pg-margin"><span class="pg-line"></span></div>` — an empty bottom-margin strip (handwritten lyric line is written into `.pg-line`; position: absolute; left/right/bottom at ~4% of page; one line, auto-shrinks with `--pw`). Covers/moment pages too.
- letter page: `<div class="pg-letter"><div class="lt-text"><span class="lt-typed"></span><span class="lt-cursor"></span><span class="lt-rest"></span></div></div>` — same typed/cursor/rest trick as `_old/letter.js` (the untyped rest is transparent to keep wrapping stable). Also make it scroll if the text overflows (lined paper style) — song.js auto-scrolls `.pg-letter`. Must fit the whole letter at desktop sizes without scrolling when possible; shrink font with --pw.
- lyrics page (double): `<div class="pg-lyrics"></div>` — song.js fills it (see below). Style the container (handwritten area with ruled lines, margin).
- photo pages: taped polaroids, **varied** layouts (rotation, offsets, tape colours, different arrangements for 1/2/3 photos and portrait/landscape images, never identical grids), captions from `captions.json` on non-empty entries (handwritten under the print). Preload the images (decoding async).
- montage page: print frame (cream border, 2 tape strips, tilt) holding the `<video muted playsinline preload="auto" poster=...>` (no controls). Class `.mt-frame`; when the video ends song.js/browse.js add class `faded` to the frame: the video fades out, the tape marks stay, a small handwritten `caption`+`date` appears (CONFIG.montage). Browse: tap replays (removes `faded`).
- the big moments (birthday/monthsary): big hand-lettered text with doodles; `{month}` from `Book.dates.monthsElapsed()`; each text element has `.bm-in` children that animate in when the unit's root page gets class `show` (song.js adds `show` when the spread lands; browse.js adds it on 'flip' when the page becomes visible).

### Book.song (SONG, song.js)
```
Book.song.start()          // begin song mode from 0 (orchestrator calls it right after the tap; audio already unlocked). Builds pages with mode:'song', engine.mount(), plays audio, runs the timeline off audio.currentTime
Book.song.stop()
Book.song.plan             // the computed schedule (for debug / reports): array of {kind, unit, flipAt, startT, endT, flipMs, pages:[...]} + {letterDoneAt, montageStart, montageEnd}
```
Emits `Book.emit('songend')` when the finale has been shown and the book is ready to close (the orchestrator closes it using CONFIG.song.closeSecs; or song.js calls `Book.engine.close` itself at `closeAt` — the orchestrator only listens for `'closed'`). **Song mode owns the audio element** (`Book.audio.el`): play/pause/seek reset on start, pauses on `visibilitychange` hidden and resumes on visible (if it was playing), wake lock (borrow `_old/script.js`), `ended`.
Lyrics: load `CONFIG.lrc` (lrc.js `Edit.LRC.parse/buildSections`), lines starting with `@` are markers. Lyrics page: handwritten, current line dark, previous lines lighter above (fade), like being written in; per section-type small paper-safe animations (no glow/glitch). Bottom-margin mode: the current line is written (typewriter/handwriting reveal) into the `.pg-line` of the page(s) currently visible whenever the lyrics page is not showing (and always in single layout).

### Book.browse (BROWSE, browse.js)
```
Book.browse.enter()   // after the song: mount pages with mode:'browse' (all units, same order), engine.setManual(true), open at page 0, arrows/keys/dots, back cover "play our song again"
Book.browse.exit()
```
Back-cover button "play our song again": `Book.emit('replaysong')` (orchestrator calls browse.exit(), song.start()).
Inputs: drag (StPageFlip), click on page corners / left-right halves, ArrowLeft/Right, swipe on phones (StPageFlip touch). Small prev/next arrows are fine on desktop; on phones none (swipe/tap), but never overlap pages.

## Timing rules (SONG planner)
Anchors, fixed: `birthday` spread flips in so that the spread is fully landed at `song.birthdayAt` (start the flip `flipMs` earlier — the CONFIG drop times are the moment the text hits). Same for `monthsary` at `song.monthsaryAt`. Confetti: small at birthdayAt, big at monthsaryAt.
Everything else is derived from the LRC sections (Edit.LRC.buildSections) and CONFIG: letter spread from t=0; letter typing starts at `letter.typeStart`; letter done = simulate with letter.js rules (`_old/letter.js` `schedule()`); the flip to the next unit happens at `letterDone + holdAfterTyped` or earlier if an anchor needs it (log a `console.warn` + record `plan.letterHoldEffective`). Photo spreads share the time between the end of the previous anchor/unit (+`momentHold` for big moments) and the next anchor, weighted by `spreadWeight[section type at the spread's start]`, flip duration by `flipMs[section type]`. The montage spread's duration = `video.duration` (metadata if loaded, else CONFIG.montage.duration) + `montageHold`, and must end <= `mustEndBefore`; the rest of the time between its neighbours goes to photo spreads. Finale at `finaleAt`, book closing from `closeAt`. In `single` layout a 2-page photo unit flips twice (at start and at half its time); single-page units once. Everything is a pure function of audio.currentTime (seek-safe: on a jump, `engine.flipTo(.., {instant:true})` to the right page and rebuild typed/lyrics state).
Debug (`?debug`): console table of the plan + a small on-screen readout of song time and current unit; log when the video starts with the song time.

## Do / don't
- Don't touch other tasks' files. If you need a hook from another task, write down exactly what you expected in your final report.
- No console errors. Test with `python -m http.server` or `npx serve` on the folder (fetch needs http).
- Prefer small DOM updates per frame (no layout thrash). Pause expensive stuff when `document.hidden`.
- Reduced motion: shorten/skip animations, keep the logic identical.
