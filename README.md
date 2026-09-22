# Six Sided Knight

A mobile-first puzzle-dungeon game where you are a rolling die. The face on the side you roll toward is the one that acts: Sword attacks, Key opens doors, Coin opens chests, and so on.

- **Rules:** [SPEC.md](SPEC.md) is the source of truth.
- **Status:** milestone 1 of 6 (engine core, tests, command-line tools). There is no browser game yet.

## Quick start

```sh
npm install
npm test                 # unit + property tests
npm run check            # typecheck + lint + format check + tests
```

## Layout

```
src/engine/    pure, deterministic simulation (no DOM): dice math, step(), registries, levels, undo, replays
src/content/   faces/, tiles/, enemies/ — one definition module each, registered in register.ts
tools/         command-line tools: level validator, replay player
examples/      sample levels (.json and .txt) and golden replays
tests/unit/    Vitest tests
```

## Command-line tools

```sh
# Validate every level (src/levels/data and examples/levels), or specific files
npm run validate-levels
npm run validate-levels -- examples/levels/demo.json

# Play a level headlessly from a replay file, printing every event
npm run replay -- examples/levels/demo.json examples/replays/demo.replay.json
# ...or from raw inputs: N E S W = roll, u = undo, r = retry
npm run replay -- examples/levels/demo.json --inputs SSSEEE
# Record the current result as the replay's expectations (golden test)
npm run replay -- examples/levels/demo.json examples/replays/demo.replay.json --write-expect
```

Every `*.replay.json` in `examples/replays` is checked by the test suite and must reproduce exactly the same result.

## Authoring levels

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
| `s`   | slime        |       |             |

`start` and `enemies` are optional. `start` fixes faces in named slots (the default is top=Shield, bottom=Heart, north=Bomb, south=Key, east=Sword, west=Coin). `enemies` sets per-enemy data, e.g. `{ "ready": true }` makes a slime act on turn 1.

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
