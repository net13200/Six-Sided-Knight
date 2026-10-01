// Bundles the 3D prototype into one self-contained HTML body (for an Artifact).
// node tools/prototype-3d/bundle.mjs <out.html>
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = process.argv[2];
const raw = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({
      path: resolve(a.resolveDir, a.path.slice(0, -4)),
      namespace: 'raw',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({
      contents: readFileSync(a.path, 'utf8'),
      loader: 'text',
    }));
  },
};
const here = dirname(fileURLToPath(import.meta.url));
const res = await build({
  entryPoints: [resolve(here, 'main.ts')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  write: false,
  plugins: [raw],
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.VITE_PORTAL': '""',
  },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(resolve(here, 'index.html'), 'utf8');
const head = html.match(/<title>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*?)<script type="module" src="\.\/main\.ts"><\/script>/)[1];
writeFileSync(out, `${head}\n${body}\n<script type="module">\n${js}\n</script>\n`);
console.log(out, Math.round((head.length + body.length + js.length) / 1024), 'KB');
