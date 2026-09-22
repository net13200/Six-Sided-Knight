# Changelog

Versions follow [semantic versioning](https://semver.org). The version shown in the game comes from `package.json`; bump it and add an entry here with each release.

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
