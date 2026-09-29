/**
 * Every piece of English text the game translates, found in the source: the
 * literals passed to t(), tn() and tk(), level names and hints, and the names
 * of faces, tiles, enemies and effects. Used by the translation test, and
 *
 *   npx tsx tools/i18n-keys.ts [lang]   # prints the keys (missing ones only, with a lang)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { EFFECTS, ENEMIES, FACES, TILES } from '../src/content/register';
import { RANGER_FACE_INFO } from '../src/ranger/lessons';

/** Developer-only screens, never translated. */
const SKIP = ['src/i18n/', 'src/game/debug-panel.ts', 'src/meta/kpi.ts'];

function files(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}

export interface KeyProblem {
  file: string;
  line: number;
  message: string;
}

/** String literals in an expression (both sides of a ?:, etc.). */
function literals(node: ts.Node, out: string[], bad: (n: ts.Node) => void): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  else if (ts.isTemplateExpression(node)) bad(node);
  else if (ts.isConditionalExpression(node)) {
    literals(node.whenTrue, out, bad);
    literals(node.whenFalse, out, bad);
  } else if (ts.isParenthesizedExpression(node)) literals(node.expression, out, bad);
  else if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    literals(node.left, out, bad);
    literals(node.right, out, bad);
  }
}

export function collectKeys(root = '.'): { keys: Set<string>; problems: KeyProblem[] } {
  const keys = new Set<string>();
  const problems: KeyProblem[] = [];
  for (const file of files(join(root, 'src'), '.ts')) {
    const rel = file.slice(root === '.' ? 0 : root.length + 1);
    if (SKIP.some((s) => rel.startsWith(s))) continue;
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const fn = node.expression.text;
        const args =
          fn === 't' || fn === 'tr' || fn === 'tk'
            ? node.arguments.slice(0, 1)
            : fn === 'tn'
              ? node.arguments.slice(1, 3)
              : [];
        for (const a of args) {
          const found: string[] = [];
          literals(a, found, (n) =>
            problems.push({
              file: rel,
              line: src.getLineAndCharacterOfPosition(n.getStart()).line + 1,
              message: `${fn}() gets a template string: use {placeholders}`,
            }),
          );
          for (const k of found) if (k.trim()) keys.add(k);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  // Level names and hints.
  for (const file of [
    ...files(join(root, 'src/levels'), '.txt'),
    ...files(join(root, 'src/ranger/data'), '.txt'),
  ]) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^(name|hint):\s*(.+?)\s*$/.exec(line);
      if (m) keys.add(m[2]!);
      if (line.startsWith('---')) break;
    }
  }
  // Names shown for content.
  for (const d of [...FACES, ...TILES, ...ENEMIES, ...EFFECTS]) keys.add(d.name);
  for (const f of Object.keys(RANGER_FACE_INFO)) keys.add(f);
  return { keys, problems };
}

/** `{name}` placeholders in a string, sorted. */
export function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

if (process.argv[1]?.endsWith('i18n-keys.ts')) {
  const { keys, problems } = collectKeys();
  for (const p of problems) console.error(`${p.file}:${p.line} ${p.message}`);
  const lang = process.argv[2];
  let list = [...keys];
  if (lang) {
    const dict = (await import(`../src/i18n/${lang}.ts`)).default as Record<string, string>;
    list = list.filter((k) => !dict[k]);
  }
  console.log(JSON.stringify(list, null, 1));
  console.error(`${list.length} keys`);
}
