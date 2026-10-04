/** Dev aid: plays every clip with the real rules and prints what happens. npx tsx tools/lesson-clips/probe.ts [id] */
import { defaultRules } from '../../src/content/register';
import { createState, describeDie, parseTextLevel, step, type GameState } from '../../src/engine';
import { CLIPS, type Reel } from '../../src/game/lesson-clips';

const rules = defaultRules();
const only = process.argv[2];
const short = (f: string) => f.replace(/^Pip/, 'P');
for (const clip of CLIPS) {
  if (only && clip.id !== only) continue;
  const reels: [string, Reel][] = clip.beside
    ? [
        ['left', clip.beside],
        ['right', clip],
      ]
    : [['', clip]];
  for (const [side, reel] of reels) {
    console.log(`== ${clip.id} ${side}`);
    let hp = reel.hp;
    let i = 0;
    for (const floor of [{ level: reel.level, moves: reel.moves }, ...(reel.floors ?? [])]) {
      let s: GameState = createState(rules, parseTextLevel(floor.level));
      if (hp !== undefined) s = { ...s, player: { ...s.player, hp } };
      const show = () => {
        const d = describeDie(s.player.die);
        return `   @${s.player.x},${s.player.y} hp${s.player.hp} T${short(d.top!)} B${short(d.bottom!)} N${short(d.north!)} S${short(d.south!)} E${short(d.east!)} W${short(d.west!)} | ${s.enemies.map((e) => `${e.kind}@${e.x},${e.y} hp${e.hp}${e.effects.length ? ' frozen' : ''}`).join('; ')}`;
      };
      console.log(show());
      for (const dir of floor.moves) {
        const r = step(rules, s, { type: 'move', dir });
        s = r.state;
        console.log(
          ` ${i++} ${dir}: ${r.events
            .filter((e) => e.type !== 'turnEnd')
            .map(
              (e) =>
                e.type +
                ('face' in e ? `(${e.face} ${'damage' in e ? e.damage : ''})` : '') +
                ('blocked' in e ? `(${e.blocked ? 'BLOCKED' : 'hit'})` : ''),
            )
            .join(', ')}`,
        );
        console.log(show());
      }
      hp = s.player.hp;
    }
  }
}
