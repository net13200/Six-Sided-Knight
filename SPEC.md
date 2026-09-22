# Six Sided Knight — Game Spec

Source of truth for game rules. If code and this file disagree, this file wins (or gets updated in the same commit).

Spec version: 0.4 (milestone 4)

## 1. Board

- Grid: 8 columns x 9 rows. Coordinates `(x, y)`, `x` = column 0..7 (west → east), `y` = row 0..8 (north → south).
- Logical resolution 340x480 portrait, scaled to fit, letterboxed, crisp on high-DPI.
- A tile holds exactly one tile type. Entities (the player die, enemies) sit on top of tiles; at most one entity per tile.

## 2. The die

- Faces: `Sword`, `Shield`, `Bomb`, `Heart`, `Key`, `Coin`.
- Orientation: `{ top, bottom, north, south, east, west }`.
- Start orientation: top=Shield, bottom=Heart, north=Bomb, south=Key, east=Sword, west=Coin.
- Roll transforms (new ← old):
  - East: `e=t, b=e, w=b, t=w` (others unchanged)
  - West: `w=t, b=w, e=b, t=e`
  - North: `n=t, b=n, s=b, t=s`
  - South: `s=t, b=s, n=b, t=n`
- **Leading face**: the face on the side of the direction of travel, _before_ the roll (moving east → current `east` face).
- Invariants (tested): all 24 orientations are reachable; rolling in a direction then the opposite direction restores the original orientation; opposite faces stay opposite.

## 3. Input and turns

- Input: swipe, tap (dominant axis toward the tapped tile; tapping the die's own tile does nothing), arrow keys / WASD.
- One valid action = one turn. **Invalid bumps consume no turn and enemies do not act**: wall, locked door without Key leading, chest without Coin leading, board edge.
- Turn order:
  1. Player action resolves (move / attack / open), including landing effects.
  2. If the player landed on the exit → **won**; nothing else happens this turn.
  3. Enemies act, one at a time, in reading order (row, then column) of their positions at the start of the phase.
  4. `onTurnEnd` hooks run.
  5. If player HP ≤ 0 at any point → **lost** (resolution stops immediately).

## 4. Attacking

Moving into an enemy attacks it with the leading face instead of moving.

| Leading face       | Damage                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Sword              | 3                                                                                                  |
| Bomb               | 2 to target, plus 1 splash to each enemy orthogonally adjacent to the target (never to the player) |
| Shield             | 1                                                                                                  |
| Key / Coin / Heart | 0 ("clunk") — still a valid action; consumes the turn                                              |

- If the target dies, the die rolls onto its tile (orientation changes, landing effects apply).
- If the target survives, the die stays put and its orientation does not change.
- Every kill (including splash kills) gives +10 gold.

## 5. Tiles

| Tile         | Rule                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Floor        | Nothing.                                                                                                                                      |
| Wall         | Impassable. Bump = invalid (no turn).                                                                                                         |
| Spikes       | On landing: player takes 1 damage unless the **bottom** face is Shield. Enemies cannot enter.                                                 |
| Healing pool | On landing with **bottom** = Heart and HP below max: heal 2 (cap at max), pool dries → floor. Otherwise nothing, pool stays.                  |
| Locked door  | Key leading into it: door opens → floor and the die rolls onto it in the same turn. Any other face: invalid bump. Enemies cannot enter.       |
| Chest        | Coin leading into it: +30 gold, chest → floor and the die rolls onto it in the same turn. Any other face: invalid bump. Enemies cannot enter. |
| Gem          | On landing: +10 gold, gem → floor.                                                                                                            |
| Exit stairs  | On landing: level complete.                                                                                                                   |

Enemies may stand on floor, pool, gem, and exit tiles but never trigger or collect them.

## 6. Defense

- Shield on **top** blocks enemy hits (damage 0).

## 7. Enemies

| Enemy    | HP  | Cadence                                                                                                                                                                                                             |
| -------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skeleton | 2   | Acts every enemy phase.                                                                                                                                                                                             |
| Slime    | 3   | Acts every other enemy phase. Own counter; by default acts on the phases after player turns 2, 4, 6, … A level may mark a slime `ready` (acts on turn 1, 3, 5, …). A visible indicator shows when it will act next. |

Enemy action:

1. If orthogonally adjacent to the player: attack for 1 (0 if Shield on top).
2. Otherwise step to the orthogonal neighbor with the smallest BFS distance to the player. BFS runs over tiles enemies may enter (other enemies are ignored by the BFS so they don't freeze, but an enemy cannot step onto an occupied tile). Ties are broken in the order N, E, S, W. If no neighbor is strictly closer, it stays.

Enemy intent (next move or attack) is deterministic and shown on the board.

## 8. Player stats and modes

- Max HP 5.
- **Campaign**: every level starts at 5 HP. Undo is unlimited within a level, and there is a Retry button.
- **Runs** (Daily Roll, Depths, chapter Gauntlets): HP carries between floors with +1 heal per floor (cap 5).
- Losing (HP 0) shows a fail screen with Undo and Retry. Undo can step back out of death.

## 9. Stars (campaign)

1. Moves ≤ par. Par = the solver's minimum moves to the exit (a level may loosen it).
2. No damage taken.
3. All gold: every gem and chest collected (kills are optional).

## 9a. Progression

- Chapters of 10 levels. Level 1 is open; each level unlocks when the previous one is beaten.
- "Play" from the title screen opens, in one tap, the level the player was last in if it isn't beaten yet, otherwise the first unbeaten level.
- Per level the save keeps: best stars, fewest moves, completions, and fastest time.

## 9b. Analytics and privacy

- Only local, on-device analytics. No personal data, no network calls.
- The player can turn it off in Settings; turning it off deletes the stored events.
- A session ends when the page is hidden or closed. Returning within 30 minutes continues the same session.

## 10. Daily Roll

- Seeded by the UTC date; the same dungeon for everyone. A 3-floor run with rising difficulty (rater bands 15-30, 25-42, 35-55).
- HP carries between floors, +1 per floor (cap 5). Floors 2 and 3 are generated to be winnable when entered with 2 HP, the lowest possible arrival HP (a floor is left with at least 1 HP, then heals 1).
- Unlimited undo and retries. The first completion of the day is recorded for the streak and the share text; later plays are practice.
- Leaving mid-run saves progress; coming back resumes the same floor.
- Streak = consecutive UTC days with a completed daily. It shows through the day after the last completion and drops to 0 once a day is missed. No streak freezes or other pressure mechanics.
- Share: date, stars (out of 9), total moves, HP left, streak (if 2+), link. Via Web Share or the clipboard. No personal data.

## 11. Depths

- An endless run of generated floors. Difficulty band climbs 4 points per floor from 6-22, plateauing at 70-86.
- Same HP rules as the Daily Roll; every floor is winnable when entered with 2 HP. Undo works as everywhere else.
- A run lasts until the player ends it. Record: deepest floor cleared. A run in progress survives leaving the game.

## 11a. Generated levels

- Seeded: the same seed and parameters give the same level on every device.
- Every generated level is proven solvable by the solver before it is used, and its par is the solver's minimum.
- The generator retries until the difficulty rating lands in the requested band. If it can't, it uses the closest solvable candidate; it never uses an unsolvable one.

## 12. Engine invariants

- The simulation is pure and deterministic: `step(state, action) → { state, events }`. No DOM access. Seeded RNG only.
- State is immutable / copy-on-write; undo is a stack of states.
- Replay = `{ levelId | seed, inputs[] }`; replaying reproduces exactly the same final state and events.
- Faces, tiles, enemies, and effects are registry definitions with hooks (`onLeadInto`, `onLand`, `onEnemyTurn`, `onTurnEnd`). Core turn logic never names a specific face, tile, or enemy.
- Any single-face leading requirement is satisfiable at any tile, so puzzle levels must be proven solvable by the solver, never assumed.

## 13. Hard constraints

- No ads, payments, or monetization code. No dark patterns.
- Analytics: no personal data, with a clear opt-out.
- All art and audio are procedural and original.

## 14. Roadmap (not in scope yet — "start simple, upgrade later")

The engine is built so these can be added without touching the turn logic:

- **More dice: d4, d8, d10.** A die shape is data (`DieShapeDef` in `src/engine/dice.ts`): its slots, which slot is top/bottom, which slot leads in each direction, and a permutation per roll. Each shape is compiled into an orientation table. Only the d6 exists today. How non-cube dice "roll" on a square grid is a design decision still to be made.
- **Face upgrades and swaps.** The die's faces are a `loadout` (faces by home slot) separate from its orientation, so swapping or upgrading a face means changing the loadout. Upgraded faces are simply new face definitions (e.g. "Sword+", 4 damage).
- **Deferred fun ideas**, to revisit once the core loop is fun on its own: enemy intent arrows, hold-to-preview a move, hints from the solver, combos, die personality, Wordle-style share, new mechanics per chapter (ice, plates, teleporters), chapter bosses, daily rule twists, watching the par solution, a 3-star celebration.
