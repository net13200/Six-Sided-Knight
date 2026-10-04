import { defaultRules } from '../../src/content/register';
import { createState, parseTextLevel, step } from '../../src/engine';
import { solve } from '../../src/solver/solve';
import { facesOf } from '../../src/game/view/cube';
import { CLIPS } from './clips';
const rules = defaultRules();
for (const c of CLIPS) {
  let s = createState(rules, parseTextLevel(c.level));
  const moves = c.moves.length ? c.moves : solve(rules, s).path;
  console.log(`== ${c.id}  moves=${moves.join('')}  top=${facesOf(s.player.die).top}`);
  for (const d of moves) {
    const r = step(rules, s, { type: 'move', dir: d });
    s = r.state;
    console.log(
      ' ',
      d,
      r.consumed ? '' : '(bump)',
      r.events.map((e) => e.type + ('face' in e ? ':' + e.face : '')).join(' '),
      'hp',
      s.player.hp,
      'bottom',
      facesOf(s.player.die).bottom,
      s.status,
    );
  }
}
