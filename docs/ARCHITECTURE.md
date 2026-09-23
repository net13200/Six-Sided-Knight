# Architecture

A static web app (TypeScript, Vite, no runtime dependencies). Rules are in [SPEC.md](../SPEC.md).

```
┌──────────────────────────────── browser ────────────────────────────────┐
│ index.html (+ inline SugiGames splash)        public/sw.js (offline)     │
│                                                                          │
│ src/main.ts ── wires ──> src/game  (scenes, input, audio, loop, view/)   │
│                             │   uses                                     │
│                             ▼                                            │
│   src/meta (save, progress, crowns/store, skins, daily, depths, analytics, KPIs)
│   src/levels (campaign files)      src/gen (generator + Web Worker)      │
│                             │                                            │
│                             ▼                                            │
│   src/engine (pure rules: step(), dice, levels, undo, replays)           │
│        ▲ registries                                                      │
│   src/content (faces, tiles, enemies, effects: one module each)         │
│   src/solver (BFS, IDA*, difficulty rater)                              │
│   src/platform (storage, share, visibility; browser + in-memory)        │
└──────────────────────────────────────────────────────────────────────────┘
```

## Layers

- **Engine** (`src/engine`): pure and deterministic. `step(rules, state, action)` returns a new state and a list of events. No DOM, timers or `Math.random` (lint-enforced). Content is reached only through registries, and a test proves the engine never names a specific face, tile or enemy.
- **Content** (`src/content`): each face, tile, enemy and effect is a definition object with hooks (`onLeadInto`, `onLand`, `onAttack`, `onEnemyTurn`, `modifyDamage`, `dangerTiles`, ...), registered in `register.ts`. Adding one never touches the engine.
- **Solver** (`src/solver`): proves levels solvable, finds par and star minimums, rates difficulty. Used by tests, tools and the generator.
- **Generator** (`src/gen`): seeded levels, proven winnable, run in a Web Worker so play never stutters; the next floor is prefetched.
- **Meta** (`src/meta`): everything outside a single level: the versioned save (with migrations), unlocks, stars, crowns, the store, skins, daily/depths rules, on-device analytics and KPI maths. Pure functions over the save data.
- **Game** (`src/game`): the scene state machine (menu, map, play, results, daily, depths, floor, forge, skins, stats), input (swipe/tap/keys), synthesized audio, the fixed-step loop. `view/` draws everything procedurally on one canvas; DOM is used for buttons and sheets on top.
- **Platform** (`src/platform`): the only code that touches browser APIs directly (storage, share, visibility, service worker), so the game could run in another host.

## How a turn flows

1. Input becomes a command (`input.ts`).
2. The play scene calls `play()` on the engine: new state + events.
3. `view/animate.ts` turns events into tweens, particles and sounds; the board is always drawn from the real state.
4. The screen-reader live region announces the outcome (`view/describe.ts`).

## Tests

Unit and property tests (Vitest) for rules, content, solver, generator, saves, meta; every campaign level and gauntlet is proven solvable with all stars reachable. Browser tests (Playwright) at three phone sizes cover flows, accessibility, offline play and the splash. See [RELEASE.md](../RELEASE.md).
