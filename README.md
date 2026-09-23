# Six Sided Knight

A mobile-first puzzle-dungeon game where you are a rolling die. The face on the side you roll toward is the one that acts: Sword attacks, Key opens doors, Coin opens chests, and so on.

- **Rules:** [SPEC.md](SPEC.md) is the source of truth.
- **Status:** milestone 5 of 6. A 60-level campaign in six chapters (each from chapter 2 on ends in a 3-floor Gauntlet), Daily Roll with streaks and sharing, endless Depths, crowns and the Forge (buy faces, build your own die for Daily Roll and Depths), cosmetic die skins, a stats screen, saved progress, and on-device analytics with a hidden KPI panel.

## Play online

Once deployed: **https://net13200.github.io/Six-Sided-Knight/**

Deployment is automatic on every push to `main` (`.github/workflows/pages.yml`). One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. CI (`.github/workflows/ci.yml`) runs all checks and browser tests on every push.

### Installing on a phone

Open the site in Chrome (Android) and choose **Install app** / **Add to home screen**, or in Safari (iOS) **Share → Add to Home Screen**. It opens full-screen with its own icon and works offline (`public/manifest.webmanifest`, `public/sw.js`). The icons in `public/icons/` are rendered from `mockups/icon.html` with the game's art: `npx vite --port 5199 & node tools/make-icons.mjs`.

## Quick start

```sh
npm install
npm run dev              # play at http://localhost:5173 (add ?level=3 to jump to a level)
npm test                 # unit + property tests
npm run test:e2e         # browser tests at phone sizes (Playwright)
npm run check            # typecheck + lint + format check + unit tests
npm run build            # production build in dist/ (static; works from any path)
```

Controls: swipe or tap toward a tile (touch), arrow keys or WASD (keyboard). Z/U/Backspace undo, R retry, M mute, Esc menu. Tap the die or the compass (or press I) to inspect the die in 3D and preview rolls.

## Layout

```
src/engine/    pure, deterministic simulation (no DOM): dice math, step(), registries, levels, undo, replays
src/content/   faces/, tiles/, enemies/ — one definition module each, registered in register.ts
src/levels/    campaign levels (data/*.txt), gauntlet floors (gauntlets/*.txt) and their loader
src/solver/    solvers (BFS, IDA*) and the difficulty rater
src/gen/       seeded level generator, its Web Worker, and the async level service
src/game/      browser game: scenes, input, audio, loop; view/ holds rendering and effects
src/meta/      save data (versioned, with migrations), progression, analytics, KPI maths
src/platform/  host adapter interface (storage, share, visibility, ...) + browser implementation
tools/         command-line tools: level validator, solver, replay player, level lab, rink/room search
examples/      sample levels (.json and .txt) and golden replays
tests/unit/    Vitest tests      tests/e2e/  Playwright tests
```

### How a turn flows

1. Input (swipe, tap, key) becomes a command.
2. The play scene calls the engine's `play()`, which returns the new state and a list of events.
3. `view/animate.ts` turns the events into tweens, particles, floating numbers and sounds.
4. The board is always drawn from the real state; animations only offset how it is drawn. New input skips any running animation, so play never waits on effects.

## Command-line tools

```sh
# Validate every level (src/levels/data and examples/levels), or specific files
npm run validate-levels
npm run validate-levels -- examples/levels/demo.json

# Solve levels: minimum moves, whether each star is achievable, difficulty score
npm run solve                                   # all campaign levels
npm run solve -- src/levels/data/c1-03.txt      # one level, with solutions
npm run solve -- --write-par                    # set par = solver minimum in .txt files

# Play a level headlessly from a replay file, printing every event
npm run replay -- examples/levels/demo.json examples/replays/demo.replay.json
# ...or from raw inputs: N E S W = roll, u = undo, r = retry
npm run replay -- examples/levels/demo.json --inputs SSSEEE
# Record the current result as the replay's expectations (golden test)
npm run replay -- examples/levels/demo.json examples/replays/demo.replay.json --write-expect
```

```sh
# Preview the generator
npm run generate -- --seed 42 --band 30,50       # print one level
npm run generate -- --sweep 20 --band 30,50      # in-band rate and timing over 20 seeds
```

Every `*.replay.json` in `examples/replays` is checked by the test suite and must reproduce exactly the same result.

## Authoring levels

Campaign levels live in `src/levels/data/` as `.txt` files, played in file-name order, 10 per chapter. Every campaign level is checked by the test suite: it must be solvable, its par must equal the solver's minimum, and all three stars must be achievable.

A **Gauntlet** is a campaign level with extra floors in `src/levels/gauntlets/`, named `<level id>-<floor>.txt` (e.g. `c2-10-2.txt`). Floors are played in a row with HP carried over (+1 between floors). The tests check each extra floor is winnable at 2 HP and that each star (summed par, no damage, all gold) is achievable across the whole gauntlet.

Authoring aids:

```sh
npx tsx tools/lab.ts <files or dirs> [--hp 2] [--trace]   # minimums, solutions, rating; --trace prints every step
npx tsx tools/rink-search.ts <seed> <tries> [extras] [base] [loadout]  # random rooms with long optimal solutions
REQUIRE=Hook npx tsx tools/rink-search.ts 1 500 'k*' . Shield,Heart,Bomb,Key,Sword,Hook  # ...that need the Hook
```

Levels are 8x9 grids. JSON (schema 1):

```json
{
  "schema": 1,
  "id": "c1-01",
  "name": "First Roll",
  "par": 6,
  "grid": ["########", "#@..k.>#", "..."],
  "start": { "top": "Shield", "east": "Sword" },
  "enemies": [{ "x": 4, "y": 1, "data": { "ready": true } }]
}
```

Or the plain-text form (`.txt`):

```
id: c1-01
name: First Roll
par: 6
start: top=Shield east=Sword
---
########
#@..k.>#
...
```

| Glyph | Meaning      | Glyph | Meaning     |
| ----- | ------------ | ----- | ----------- |
| `@`   | player start | `.`   | floor       |
| `#`   | wall         | `^`   | spikes      |
| `~`   | healing pool | `\|`  | locked door |
| `$`   | chest        | `*`   | gem         |
| `>`   | exit         | `k`   | skeleton    |
| `s`   | slime        | `=`   | ice         |
| `a`   | archer       | `g`   | golem       |

`start`, `hint` (one line, at most 40 characters), `enemies` and `loadout` are optional. `loadout` swaps the die's faces for the level, listed by home slot (top bottom north south east west), e.g. `loadout: Shield Heart Bomb Key Sword Freeze`. `start` fixes faces in named slots (the default is top=Shield, bottom=Heart, north=Bomb, south=Key, east=Sword, west=Coin). `enemies` sets per-enemy data, e.g. `{ "ready": true }` makes a slime act on turn 1.

## Versions and releases

The version lives in `package.json` and is shown in the game as `v0.3.0 (commit)`: on the title screen, in Settings and in the KPI panel. Each analytics session records it, so stats can be compared between releases. To release:

1. Bump `version` in `package.json` (major.minor.patch).
2. Add an entry to [CHANGELOG.md](CHANGELOG.md).
3. Commit to `main` (this deploys automatically), then tag it: `git tag v0.4.0 && git push origin v0.4.0`.

## Solver, difficulty and generator

- **Solver** (`src/solver/solve.ts`): breadth-first search or IDA* over full game states, with a node budget. States are de-duplicated with compact keys: position, orientation, HP, enemies, and only the tiles that changed. IDA* uses the distance to the nearest exit as its heuristic (never an overestimate, so solutions stay optimal).
- **Difficulty** (`src/solver/rate.ts`): a 0-100 score from the optimal solution length, how much breadth-first search has to explore, the enemy count, and how often 48 seeded "novice" playouts win. The tutorial rates about 7-60.
- **Generator** (`src/gen/generate.ts`): builds candidate layouts with more walls, hazards and enemies for higher targets. It keeps only candidates the solver proves winnable at the given starting HP, and retries until the rating lands in the band. Property tests check the guarantee over many seeds.

## Save data

Progress lives in `localStorage` under `ssk.save` as versioned JSON (`src/meta/save.ts`; currently v2, which added Daily Roll and Depths). To change the format:

1. Bump `SAVE_VERSION` and add the new shape.
2. Add `migrations[oldVersion]`, which turns an old object into the new one.
3. Add a case to `tests/unit/save.test.ts`.

Safety rules: unreadable data is copied to `ssk.save.corrupt.<time>` before starting fresh, and data from a newer version (after a rollback) is never overwritten. If storage is blocked, the game still runs from memory.

## Analytics and the KPI panel

Events are defined, with versions and typed props, in `EVENTS` in `src/meta/analytics.ts`. They go to a capped ring buffer in `localStorage` (`ssk.analytics`, 3000 events). Nothing is sent anywhere, and there is no personal data: only a random install id, game facts and timestamps. Players can turn recording off in **Settings → Play statistics**, which also deletes what was stored.

Open the hidden panel by adding `#debug` to the URL (or `?debug`, which also logs each event to the console). It shows:

| Section         | How to read it                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hypotheses      | The KPI targets (tutorial completion > 85%, 3+ levels per session, D1 return, daily participation, every level in the 60–90% win band). Each shows pass, fail, or "not enough data". They are targets to test, not facts. |
| Sessions        | Count, average length and levels completed per session. A session ends when the page is hidden or closed; coming back within 30 minutes continues it.                                                                     |
| Return proxies  | D1/D7/D30 from this device's session history. _Exact_ = played on day N after the first session; _rolling_ = played on day N or later. "Not yet" = that day hasn't arrived.                                               |
| Levels          | Attempts (starts + retries), wins, win rate, undo rate, median winning time. Levels outside 60–90% (after 5+ attempts) are flagged _too hard_ or _too easy_.                                                              |
| Fail heatmap    | Where players die: level × turn bucket. Darker = more deaths.                                                                                                                                                             |
| Tutorial funnel | Which of the 10 chapter-1 steps have been completed.                                                                                                                                                                      |

Use **Copy data (JSON)** to export the raw log. The maths lives in `src/meta/kpi.ts`, and each number has a unit test.

## Adding a face, tile or enemy

The turn logic (`src/engine/step.ts`) never names specific content; it only calls hooks. To add content, write one definition module and register it in `src/content/register.ts`. A test (`tests/unit/extensibility.test.ts`) enforces that the engine contains no content names.

Worked example: a **Freeze** face that stops an enemy for 2 turns.

```ts
// src/content/effects/frozen.ts
export const Frozen: EffectDef = {
  id: 'frozen',
  name: 'Frozen',
  onEnemyTurn: () => true, // true = skip this enemy's turn
};

// src/content/faces/freeze.ts
export const Freeze: FaceDef = {
  id: 'Freeze',
  name: 'Freeze',
  glyph: 'F',
  tags: [],
  attack: 0,
  onAttack(ctx, target) {
    ctx.damageEnemy(target.id, 0, 'Freeze');
    ctx.applyEffect(target.id, 'frozen', 2);
    return false; // target survived: the die stays put
  },
};

// src/content/register.ts: add Freeze to FACES and Frozen to EFFECTS, and
// put 'Freeze' in a loadout slot (e.g. CORE_CONFIG.defaultLoadout).
```

Available hooks:

| Definition  | Hooks                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `FaceDef`   | `onAttack`, `onLeadInto`, `onLand`, `modifyIncomingDamage`, `onTurnEnd`; plus `tags` that tiles check (e.g. doors check `unlock`) |
| `TileDef`   | `onLeadInto` (return `enter` / `stay` / `block`), `onLand`, `onTurnEnd`; flags `passable`, `enemyPassable`, `treasure`, `goal`    |
| `EnemyDef`  | `onEnemyTurn` (reuse `chase()` from `engine/ai.ts`), `willAct`, `onTurnEnd`, `initData`                                           |
| `EffectDef` | `onEnemyTurn` (return `true` to skip the turn), `onTurnEnd`                                                                       |

Hooks change the world only through the `TurnContext` they receive (`damageEnemy`, `hurtPlayer`, `setTile`, `addGold`, `rollPlayer`, `emit`, ...). The context works on a copy-on-write draft and records an event for every change, which renderers and audio will subscribe to.
