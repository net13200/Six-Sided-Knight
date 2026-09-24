# Six Sided Knight — Game Spec

Source of truth for game rules. If code and this file disagree, this file wins (or gets updated in the same commit).

Spec version: 0.5 (milestone 5)

## 1. Board

- Grid: 8 columns x 9 rows. Coordinates `(x, y)`, `x` = column 0..7 (west → east), `y` = row 0..8 (north → south).
- Logical resolution 340x480 portrait, scaled to fit, letterboxed, crisp on high-DPI.
- A tile holds exactly one tile type. Entities (the player die, enemies) sit on top of tiles; at most one entity per tile.

## 2. The die

- Faces: `Sword`, `Shield`, `Bomb`, `Heart`, `Key`, `Coin` (the starting die), plus `Freeze` and `Hook` (bought in the store, see 9c; campaign levels may also swap one in).
- A die's faces are its **loadout** (faces by home slot). A level may set its own loadout (`loadout:` in the level file), e.g. Freeze instead of Coin.
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
| Hook               | 0 ("clunk") when the enemy is adjacent (see 4a for pulling from range)                             |
| Freeze             | 0 damage; the enemy is **frozen** and skips its next 2 enemy phases                                |

- Enemy armour: some enemies ignore damage from certain faces (Golem: only Bomb hurts it, splash included).

## 4a. Hook

- When Hook leads into a tile with no enemy, it looks along that line up to 3 tiles from the die. The tile next to the die must be passable and not the exit; the line stops at the first impassable tile (wall, door, chest).
- The first enemy found 2–3 tiles away is pulled onto the tile next to the die (only if enemies may stand there; not onto spikes). The first treasure found (a gem) is collected from range.
- Either way the die stays put, its faces unchanged, and the turn is used. With nothing in reach the die simply rolls.

- If the target dies, the die rolls onto its tile (orientation changes, landing effects apply).
- If the target survives, the die stays put and its orientation does not change.
- Every kill (including splash kills) gives +10 gold.

## 5. Tiles

| Tile         | Rule                                                                                                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floor        | Nothing.                                                                                                                                                                                                                                                                                 |
| Wall         | Impassable. Bump = invalid (no turn).                                                                                                                                                                                                                                                    |
| Spikes       | On landing: player takes 1 damage unless the **bottom** face is Shield. Enemies cannot enter.                                                                                                                                                                                            |
| Healing pool | On landing with **bottom** = Heart and HP below max: heal 2 (cap at max), pool dries → floor. Otherwise nothing, pool stays.                                                                                                                                                             |
| Locked door  | Key leading into it: door opens → floor and the die rolls onto it in the same turn. Any other face: invalid bump. Enemies cannot enter.                                                                                                                                                  |
| Chest        | Coin leading into it: +30 gold, chest → floor and the die rolls onto it in the same turn. Any other face: invalid bump. Enemies cannot enter.                                                                                                                                            |
| Gem          | On landing: +10 gold, gem → floor.                                                                                                                                                                                                                                                       |
| Exit stairs  | On landing: level complete.                                                                                                                                                                                                                                                              |
| Ice          | On landing: the die **slides** on in the same direction without rolling (same faces) until it lands on a non-ice tile, or stops on the last ice tile before a wall, door, chest, enemy or the board edge. Each tile slid onto triggers its landing effect. Enemies walk on ice normally. |

Enemies may stand on floor, pool, gem, ice and exit tiles but never trigger or collect them.

## 6. Defense

- Shield on **top** blocks enemy hits (damage 0).

## 7. Enemies

| Enemy    | HP  | Cadence                                                                                                                                                                                                             |
| -------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skeleton | 2   | Acts every enemy phase.                                                                                                                                                                                             |
| Slime    | 3   | Acts every other enemy phase. Own counter; by default acts on the phases after player turns 2, 4, 6, … A level may mark a slime `ready` (acts on turn 1, 3, 5, …). A visible indicator shows when it will act next. |

| Archer | 1 | Never moves. Every enemy phase it shoots along its row and column: if the die is in a clear straight line it hits for 1 (Shield on top blocks). Walls, doors, chests and other enemies block arrows. Its lanes are shown on the board. |
| Golem | 4 | Stone armour: only Bomb damages it. Acts every other enemy phase like a slime (same `ready` rule). Chases and hits for 1. Bounty 20. |

Frozen enemies skip their turn (no move, no attack, no shot); the counter is shown on the enemy.

Enemy action (skeleton, slime, golem):

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

- Chapters of 10 levels (six chapters, 60 levels). Level 1 is open; each level unlocks when the previous one is beaten.
- **Gauntlets:** from chapter 2 on, each chapter's last level is a Gauntlet of 3 floors played in a row. HP carries over with +1 between floors (like runs). Stars count over the whole gauntlet: total moves within the summed par, no damage on any floor, every treasure on every floor. Leaving between floors starts the gauntlet over. Every floor after the first is winnable when entered with 2 HP.
- "Play" from the title screen opens, in one tap, the level the player was last in if it isn't beaten yet, otherwise the first unbeaten level.
- Per level the save keeps: best stars, fewest moves, completions, and fastest time.

## 9b. Analytics and privacy

- Only local, on-device analytics. No personal data, no network calls.
- The player can turn it off in Settings; turning it off deletes the stored events.
- A session ends when the page is hidden or closed. Returning within 30 minutes continues the same session.

## 9c. Crowns, the Forge and custom dice

- **Crowns** are the currency. Every star earned for the first time pays 10 crowns: campaign stars (improving a level from 1 to 3 stars pays for the 2 new ones), the stars of the day's first Daily Roll completion, and the stars of each Depths floor past your record. Replays for stars already earned pay nothing. Saves from before 0.5.0 are paid once for the stars they already hold.
- **The Forge** sells faces for crowns: Freeze 200, Hook 300 (more later). Nothing is sold for real money.
- **Custom die**: in the Forge the player chooses which of their owned faces go on their die and where (each home slot: top, bottom, north, south, east, west). Each face at most once; always six faces. The die is used for **Daily Roll and Depths** only; campaign levels always use their own fixed die.
- **Daily Roll:** the floors are the same for everyone, with the same par, whatever their die (generated with the default die). If the player's die can't win a floor, a warning says so at the start of that floor; changing the die is part of the challenge. The Daily Roll uses the player's current die on each floor, so it can be changed between floors (and before resuming a floor).
- **Depths** keeps the die it started with for the whole run. Its floors are generated with the default die first; if the player's die can't win one at the floor's HP, a variant floor is generated and proven winnable for that die, with par for that die.

## 10. Daily Roll

- Seeded by the UTC date; the same dungeon and par for everyone, whatever their die (see 9c). A 3-floor run with rising difficulty (rater bands 15-30, 25-42, 35-55).
- From 2026-09-24 the daily may contain ice, archers and golems; earlier dates keep the original feature set so past dailies never change. Depths always may.
- HP carries between floors, +1 per floor (cap 5). Floors 2 and 3 are generated to be winnable when entered with 2 HP, the lowest possible arrival HP (a floor is left with at least 1 HP, then heals 1).
- Unlimited undo and retries. The first completion of the day is recorded for the streak and the share text; later plays are practice.
- Leaving mid-run saves progress; coming back resumes the same floor.
- Streak = consecutive UTC days with a completed daily. It shows through the day after the last completion and drops to 0 once a day is missed. No streak freezes or other pressure mechanics.
- Share: date, stars (out of 9), total moves, HP left, streak (if 2+), link. Via Web Share or the clipboard. No personal data.

## 11. Depths

- An endless run of generated floors. Difficulty band climbs 4 points per floor from 6-22, plateauing at 56-72 (from floor 13; the highest band the generator reliably reaches).
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
- Faces, tiles, enemies, and effects are registry definitions with hooks (`onLeadInto`, `onLand`, `onEnemyTurn`, `onTurnEnd`, `modifyDamage`, `dangerTiles`). Core turn logic never names a specific face, tile, or enemy. Milestone 5's ice, Freeze, Hook, Archer and Golem are content modules only; the engine gained three generic capabilities for them (slide the die without rolling, pull an enemy, an enemy damage modifier), none of which names content.
- Any single-face leading requirement is satisfiable at any tile, so puzzle levels must be proven solvable by the solver, never assumed.

## 12a. Reading the die (UI)

- The die is drawn as a cube seen from above, larger than its tile: a large top face in the middle, each side face on the side it will hit, side faces tinted by role. The bottom face shows under the die and in the compass.
- On the far edge of each neighbouring tile, labels show the outcome of each possible move, computed by running the real rules on a copy of the state. Walls and plain moves get no label.
- Inspect view (tap the die or the compass, or press I): a 3D die the player can spin, all six faces, and a preview of any roll with its outcome, what enemies do next, and HP afterwards. Previews never change the game.

## 13. Hard constraints

- No ads, payments, or monetization code. No dark patterns.
- Analytics: no personal data, with a clear opt-out.
- All art and audio (sound effects and music) are procedural and original.

## 14. Roadmap (not in scope yet — "start simple, upgrade later")

The engine is built so these can be added without touching the turn logic:

- **More dice: d4, d8, d10.** A die shape is data (`DieShapeDef` in `src/engine/dice.ts`): its slots, which slot is top/bottom, which slot leads in each direction, and a permutation per roll. Each shape is compiled into an orientation table. Only the d6 exists today. How non-cube dice "roll" on a square grid is a design decision still to be made.
- **Face upgrades and swaps.** The die's faces are a `loadout` (faces by home slot) separate from its orientation, so swapping or upgrading a face means changing the loadout. Upgraded faces are simply new face definitions (e.g. "Sword+", 4 damage).
- **Face upgrades** (e.g. Sword+) as store items, using the same loadout mechanism as Freeze and Hook.
- **Deferred fun ideas**, to revisit once the core loop is fun on its own: enemy intent arrows, hold-to-preview a move, hints from the solver, combos, die personality, Wordle-style share, more mechanics (pressure plates, teleporters), chapter bosses, daily rule twists, watching the par solution, a 3-star celebration.
