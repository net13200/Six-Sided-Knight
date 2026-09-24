# Changelog

Versions follow [semantic versioning](https://semver.org). The version shown in the game comes from `package.json`; bump it and add an entry here with each release.

## 0.6.2 — Snappier splash

- The SugiGames kanji animation draws about 20% faster (strokes 420 → 340 ms, gaps 90 → 60 ms), matching SugiPaint and SugiGames.

## 0.6.1 — A clearer die

- The die on the board is bigger than its tile, with a large white top face and thicker edges, so it's easy to read at a glance.
- Move labels now sit on the far edge of the tile the move goes to, instead of covering the die.
- New logo: a big 3D die on the title screen, and a new app icon where the die fills the icon.
- Level hints move to the top of the board when the die starts low, so they never cover it.

## 0.6.0 — Polish and release-ready (milestone 6)

- **Accessibility:** screen-reader support (every move is announced; H reads the board: your faces, what each direction does, the exit and nearby enemies). New settings: High contrast, Larger labels, Reduce motion. Archer lanes are hatched so they read without colour. Every button is a comfortable tap target, even in landscape.
- **Performance:** smoother on slower phones (cached board drawing, 2x canvas cap, half-rate drawing when idle), deep Depths floors generate about 4x faster, smaller app icons. Measured and documented in PERFORMANCE.md; the 300 KB download budget is enforced in CI.
- **App:** a "New version ready" bar when an update is out, and Daily Roll/Depths confirmed to work offline.
- **Docs:** how-to-play guide, privacy notes, architecture overview, release checklist.
- The Forge was re-laid out with bigger tiles; Back and Skins are now at the top.

## 0.5.3 — SugiGames splash

- The SugiGames animation (the 杉 kanji painted stroke by stroke, then the wordmark) plays while the game starts, then fades to the title screen. Tap to skip. Ported from the SugiGames repo; its Baloo 2 font is bundled (only the letters it needs, 1.7 KB, SIL Open Font License), so it works offline and makes no third-party requests.

## 0.5.2 — A real app on your home screen

- Web app manifest and icons (drawn with the game's own art): "Add to home screen" / "Install app" now opens the game full-screen like an app, with its own icon and splash colour, instead of a browser tab.
- Service worker: once installed (or visited once), the game opens and plays offline. Updates arrive the next time you're online.

## 0.5.1 — One daily for everyone

- The Daily Roll is now always the same floors and par for everyone, whatever their die. If your die can't win a floor, you're warned at its start: change your die (between floors, or leave and come back) — that's part of the challenge. Depths still makes a variant floor when your die can't win one.

## 0.5.0 — More dungeon

- **50 new levels:** chapters 2-6 (Deep Halls, The Vaults, Ember Keep, Frost Crypt, The Throne), 60 in total. Each chapter from 2 on ends in a **Gauntlet**: 3 floors in a row with HP carried over.
- **Ice:** slide without rolling (same faces) until you reach normal floor or bump into something.
- **New faces:** Freeze (stops an enemy for 2 turns) and Hook (pulls an enemy or a gem 2-3 tiles away to you).
- **New enemies:** Archer (never moves, shoots along its row and column; its lanes are shown in red) and Golem (only Bombs crack it, moves every other turn).
- **Crowns:** every star you earn for the first time pays 10 crowns. Stars you already had are paid once when you update.
- **The Forge:** buy Freeze (200) and Hook (300), and build your own die (which faces, and where) for Daily Roll and Depths. Campaign levels keep their own die.
- **Skins:** 9 cosmetic die skins, unlocked with stars and daily streaks. Looks only.
- **Stats screen:** chapter stars, lifetime totals, runs, crowns and your most-used faces.
- Daily Rolls from 2026-09-24 (and Depths) can include ice, archers and golems.
- Save format v3 (older saves migrate automatically).
- Proof of extensibility: the new faces, tiles and enemies are content modules only; the turn logic is unchanged.

## 0.4.1 — A clearer die

- The die is drawn as a cube seen from above: every side face sits on the side it will hit, with bigger icons.
- Faces are tinted by role (attack warm, defence blue, heal green, tools gold); shapes still tell them apart.
- Labels next to the die show what each move will do (knockout, damage, chest +30, locked ✕, spikes −1), computed with the real rules.
- The bottom face is shown under the die and in the compass (it decides spikes and pools).
- New inspect view: tap the die or the compass (or press I) to spin a 3D die, see all six faces, and preview any roll, including enemy hits that follow. Nothing moves until you swipe.
- A one-time hint points new players to the inspect view.

## 0.4.0 — Daily Roll and Depths

- **Daily Roll:** a 3-floor dungeon generated from the UTC date, the same for everyone. HP carries over (+1 per floor). Streaks, and a share button that copies a spoiler-free result.
- **Depths:** endless generated floors that get harder as you go down, with a best-floor record. Runs survive leaving the game.
- Level generator: seeded, and every level is proven solvable by the solver (even when entered with 2 HP) and rated into a target difficulty band. Runs in a background worker and prefetches the next floor.
- Solver: IDA* alongside breadth-first search, compact state keys, 10-200x faster on the campaign.
- Difficulty rater (0-100) from solution length, search breadth, enemies and simulated novice play.
- Save format v2 (older saves migrate automatically).

## 0.3.0 — Progress and insights

- Progress is saved: stars, best moves and times per level, lifetime stats. Versioned save format with migrations.
- Levels unlock one after another; "Continue" returns to where you left off.
- Chapter map with a winding path, locks and star totals. Results show new bests and unlocks.
- Settings: sound and a play-statistics opt-out.
- On-device analytics (no personal data, nothing sent) and a hidden KPI panel at `#debug`.
- Version number shown on the title screen, in Settings and in the KPI panel; sessions record the app version.

## 0.2.0 — Playable

- Browser game: canvas renderer, swipe/tap/keyboard, synthesized sound, effects driven by game events.
- 10 tutorial levels, each proven solvable, with par set by the solver.
- Undo, retry, stars, results screen. Deployed to GitHub Pages.

## 0.1.0 — Engine

- Deterministic rules engine, content registries, level format, undo, replays, command-line tools.
