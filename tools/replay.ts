/**
 * Headless replay player.
 *   npm run replay -- <level-file> <replay-file>        # play a recorded replay
 *   npm run replay -- <level-file> --inputs EENSuW      # play inputs directly
 * Flags:
 *   --quiet         only print the final board and result
 *   --write-expect  store the result (status, moves, hp, gold, hash) into the replay file
 * Exits with code 1 if the replay's "expect" block doesn't match.
 */
import { writeFileSync } from 'node:fs';
import { defaultRules } from '../src/content/register';
import {
  REPLAY_VERSION,
  createState,
  describeEvent,
  parseInputs,
  renderText,
  runReplay,
  verifyReplay,
  type Replay,
} from '../src/engine';
import { loadLevelFile, loadReplayFile } from './lib/files';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const valueOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter(
  (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--inputs'),
);

const [levelPath, replayPath] = positional;
if (!levelPath || (!replayPath && valueOf('--inputs') === undefined)) {
  console.error(
    'usage: replay <level-file> (<replay-file> | --inputs NESWur...) [--quiet] [--write-expect]',
  );
  process.exit(2);
}

const rules = defaultRules();
const level = loadLevelFile(levelPath);
const replay: Replay = replayPath
  ? loadReplayFile(replayPath)
  : { version: REPLAY_VERSION, level: level.id, inputs: valueOf('--inputs') ?? '' };

const result = runReplay(rules, level, replay);

if (!flag('--quiet')) {
  console.log(renderText(rules, createState(rules, level, replay.options)));
  parseInputs(replay.inputs).forEach((token, i) => {
    const events = result.events[i] ?? [];
    const label = token === 'u' ? 'undo' : token === 'r' ? 'retry' : token;
    console.log(`\n[${i + 1}] ${label}`);
    for (const e of events) console.log(`    ${describeEvent(e)}`);
  });
  console.log('');
}
console.log(renderText(rules, result.final));
console.log(`hash ${result.hash}`);

if (flag('--write-expect') && replayPath) {
  const f = result.final;
  const updated: Replay = {
    ...replay,
    expect: {
      status: f.status,
      moves: f.stats.moves,
      hp: f.player.hp,
      gold: f.gold,
      hash: result.hash,
    },
  };
  writeFileSync(replayPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`wrote expectations to ${replayPath}`);
} else if (replay.expect) {
  const bad = verifyReplay(rules, level, replay);
  if (bad.length) {
    console.log(`MISMATCH\n  - ${bad.join('\n  - ')}`);
    process.exit(1);
  }
  console.log('replay matches expectations');
}
