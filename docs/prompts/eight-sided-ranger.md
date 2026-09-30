# Prompt: Eight-Sided Ranger (new project)

Copy everything below the line into a new Claude Code session, with a new, empty repository attached, and read access to `net13200/Six-Sided-Knight`.

---

Build **Eight-Sided Ranger**, a mobile-first browser puzzle game. It's the follow-up to my game **Six Sided Knight** (repo `net13200/Six-Sided-Knight`, live at https://net13200.github.io/Six-Sided-Knight/). The Knight's campaign ends with a teaser for this game, and its bonus chapter is a 7-stage prototype of it. Read that repo before you start: the prototype, the engine and the whole setup are there, and most of what's below was learned the hard way while building it.

Work in small, tested steps. Show me screenshots at phone size and at 16:9 for anything visual before moving on, and ask me before any decision that is mine to make (story, names, art direction, monetisation).

## 1. The game (continuity with the teaser)

The Knight's ending says: _"Meanwhile, in the Greenwood: past the edge of Oddmere, something with eight sides is rolling on purpose too."_ The bonus chapter ends with: _"The Ranger has a story of their own, and it is still being written. Coming soon: Eight-Sided Ranger."_ Pay that off.

**Keep from the prototype** (`src/ranger/` in the Knight repo: `rules.ts`, `solve.ts`, `teaches.ts`, `lessons.ts`, `view.ts`, `data/r-01..r-07.txt`, and `src/game/scenes/ranger-*.ts`). Port it and build on it; don't re-derive it:

- The Ranger is a **d8 (octahedron) rolling on a grid of triangles**. Cell (x, y) points up when x + y is even. Every triangle has three edges, so three moves: left and right along the row, and through the flat edge (down from an up triangle, up from a down one). The roll tables in `rules.ts` are verified; reuse them.
- **The face on the edge you roll across acts.** Faces: **Bow** (shoots along the row, 1 damage, over water), **Knife** (2 damage to an adjacent enemy), **Trap** (face-down: lays a snare, catching a wolf for 3 turns), **Rope** (swings along the row to a post, without rolling), **Cloak** (on top: nobody can see you), **Boots** (leap over the next triangle in the row), **Herb** (face-down on a spring: heal 1), **Leaf** (does nothing).
- Rows are straight lines: the Bow, Boots, Rope and the stag's strike all work along the row.
- **Enemies:** wolf (2 HP, hunts you, bites), stag (3 HP, strikes anyone who stops in its row with a clear line: shown as red triangles). You have **3 HP**. **Tiles:** grass, tree, water, post, spring, snare, exit.
- The Knight's world: Oddmere, where the Queen's wish at the Old Well turned everyone into dice. The Knight rolls "on purpose". The Greenwood lies past Oddmere's edge. Tone: gentle, witty, a little melancholy. Short sentences, no villain for its own sake.

**New:** propose a story of the Ranger's own (who they are, why they roll on purpose, what they want in the Greenwood), 5–6 districts that each teach something, and new faces/enemies/tiles that fit triangles and rows. Show me the proposal before writing levels. The same art style as the Knight: flat, chunky, friendly, canvas-drawn (no image files needed), each face with a clear icon.

## 2. Tech (what worked; keep it)

- **TypeScript + Vite**, canvas 2D, no game engine. The whole Knight is about 0.2 MB zipped: keep it that small.
- **A fixed logical stage (340×480) scaled to fit**, a DOM overlay for buttons (placed in logical units), and a full-window **backdrop** canvas around it: scenery, plus side panels on wide screens (level card on one side, controls on the other). This made 16:9 desktop work without a second layout.
- **Keep clear of the safe-area insets** (notch, rounded corners, home bar), read through a CSS `env()` probe; the Knight's `stage.ts` has it.
- **A pure, deterministic engine** (state in, state out), unit tested, separate from drawing. A **solver** (BFS/IDA\*) proves every level solvable and computes **par**. A **teaches-check** proves each stage's par route actually uses the mechanic it teaches.
- **A fixed-timestep loop** (60 Hz simulation), so it plays the same at 144 Hz.
- **Levels as small text files** (id, name, par, hint, loadout, teaches, then the grid) with a validator in CI. **Level fingerprints**: when a level changes after release, players who beat it get it marked "solve again" instead of keeping stale stars.
- **A platform layer** (`src/platform/`): storage, share, locale, ads. Every portal build is a new implementation plus a Vite mode, never a fork of game code.
- **Invisible buttons** over interactive things (levels on the map, landmarks) with test ids and aria labels: they make screen readers and Playwright tests work.
- **i18n from day one**: text written in English in the code and looked up by that text (`t()`, `tn()`, `tk()`); lazy-loaded language files (es, pt, fr, de, it, nl, tr); a unit test that fails on missing, leftover or placeholder-mismatched strings; long labels shrink to fit.
- **Tests:** Vitest for the engine, solver and layout; Playwright (Chromium at `/opt/pw-browsers/chromium`) on phone portrait, small phone and phone landscape; separate Playwright configs for each portal build. `npm run check` = typecheck, lint, prettier, unit tests. A size budget script.
- **Audio:** WebAudio, unlocked on the first gesture, resumed on `touchend` after iOS interrupts it (a call, switching apps). Tested.

## 3. Design lessons (what didn't work, and what we changed it to)

- **Only use faces the player has learned.** In every tutorial stage, every face on the die must already be taught; untaught slots are Leaf. One new thing per stage, with a short lesson card on first play; the level hint fades after a few moves.
- **Stars are about moves:** ★★★ at par, ★★ within a few moves, ★ for finishing. HP doesn't cost stars. Keep the best result. Undo and Retry are free.
- **Gauntlets** (several floors in a row, HP carried over): show **one par for the whole run**, moves counted across floors, never a single floor's par.
- **The world map:**
  - A road of stones, **one stone between levels**, zigzagging up the world as switchbacks (each district crosses the board, the next crosses back). Long empty roads and a rigid row-by-row snake both looked bad.
  - Roads to locked levels show as faint stones, so the way ahead is visible.
  - **Tap a level (or anywhere) and the die rolls there.** No tile-by-tile rolling on the map: it hid tapping. Arrow keys hop to the next/previous level.
  - **Drag or wheel to scroll**; a drag never presses a level.
  - A **World view** (a parchment map of the districts with their stars) where picking a district **tosses** the die there, with a cute wind-up, flight and bounce.
  - A **medal** marks a district with every level at ★★★. A gold flag was unclear.
  - Landmarks (shop, daily challenge) sit by level 1, reachable from the start.
  - **Leaving a level returns you to that level on the map**, not to the next one.
  - Scenery may sit beside the road but never on it.
- **First-time players:** logo splash, then straight into play (story skippable, short). Portals want gameplay within one click.
- **Removed features:** a gold counter nobody needed. Don't add currencies without a use.
- **Accessibility:** reduced motion, screen-reader board description, visible focus, 44 px touch targets (check the smallest phone in landscape).

## 4. Publishing on CrazyGames (primary target)

Poki is curated and declined early access, so **CrazyGames comes first**; keep the platform layer ready for Poki later.

- **Basic Launch** (first step): no SDK needed, no ads, a limited test launch judged on engagement. Requirements:
  - ≤ 50 MB total, and ≤ 20 MB to be eligible for the mobile homepage; ≤ 1,500 files; relative paths only; **no requests to other hosts**;
  - Chrome/Edge/Safari; smooth on a 4 GB Chromebook;
  - mouse, keyboard and touch; landscape on desktop;
  - readable at DPR 1 in their iframe sizes (smallest: 800×450 and 821×462);
  - `user-select: none` and `-webkit-touch-callout: none`; safe areas;
  - no custom fullscreen button, no outside links or cross-promotion, no data collection, English plus the browser locale;
  - **PEGI 12** (cartoon fantasy violence only).
- **Full Launch** (if selected): SDK v3 from `https://sdk.crazygames.com/crazygames-sdk-v3.js`, `window.CrazyGames.SDK`:
  - `init()`, `game.loadingStart/Stop`, `game.gameplayStart/Stop`, `game.happytime`;
  - `ad.requestAd('midgame' | 'rewarded', { adStarted, adFinished, adError })`, with the game muted and paused during ads;
  - `data.getItem/setItem` for progress (throttle writes), `game.settings.muteAudio`;
  - land new users in gameplay within one click;
  - everything a no-op when the SDK is blocked.
- **Build:** `npm run build:crazygames` → `dist-crazygames/` and a zip with `index.html` at its root; no service worker or manifest; no dev tools or hidden cheats in portal builds (automated test browsers excepted). CI builds and tests it on every push.
- **Covers:** landscape 1920×1080, portrait 800×1200, square 800×800. The title is the only text; no borders, logos or store badges; the same look across all three. Draw them from the game's own art with a script.
- **Preview videos:** 1920×1080 and 1080×1920, 15–20 s, silent, ≤ 50 MB, the cover as the first frame, no black bars or overlays, real-speed gameplay. Show **only part of each solution** and **a different die skin per level**. Record them with a script (Playwright recording plus ffmpeg from `pip install imageio-ffmpeg`); the Knight's `tools/thumbnails/` does exactly this.
- **Terms to remember:** updates must reach CrazyGames no later than anywhere else (upload the new zip whenever the site deploys); you can only leave at the yearly renewal (1 month's notice), and they may keep the game up to a year after; Basic Launch pays nothing; the +50% exclusivity is for 2 months on browser portals.

## 5. How we work

- Develop on a feature branch; **deploy to `main` (GitHub Pages) only when I say "deploy"**. Each release: bump the version, add a player-facing CHANGELOG entry, update the player guide, verify the Pages deploy through GitHub Actions, and give me the matching CrazyGames zip.
- No analytics or tracking unless I ask.
- The sandbox's network blocks portal documentation sites (CrazyGames, Poki, github.io). Don't guess requirements: ask me to upload the page as a PDF.
- Before claiming something works: run the checks, the browser tests, and look at screenshots at phone and 16:9 sizes. Say plainly what you couldn't verify.

**Start by:** reading the Knight repo (the Ranger prototype, `stage.ts`, the platform layer, the world map, the thumbnail tools), then proposing the Ranger's story, districts and new mechanics for my approval.
