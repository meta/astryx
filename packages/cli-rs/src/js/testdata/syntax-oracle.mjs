import fs from 'node:fs';
import path from 'node:path';
import {createJiti} from '/home/user/rustcli/astryx/node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.mjs';
const shapes = JSON.parse(fs.readFileSync('/tmp/jse_se/shapes.json', 'utf8'));
const dir = '/tmp/jse_se/files';
fs.mkdirSync(dir, {recursive: true});
const jiti = createJiti(import.meta.url, {moduleCache: false, fsCache: false});
const jitiJsx = createJiti(import.meta.url, {moduleCache: false, fsCache: false, jsx: true});
const out = {};
for (const [name, src] of shapes) {
  const r = {};
  for (const [kind, ext, load] of [
    ['esm', '.mjs', f => import(f)],
    ['jiti_ts', '.ts', f => jiti.import(f)],
    ['jiti_mjs', '.mjs', f => jiti.import(f)],
    ['jiti_jsx_ts', '.ts', f => jitiJsx.import(f)],
    ['jiti_tsx', '.tsx', f => jitiJsx.import(f)],
  ]) {
    const f = path.join(dir, `${name}.${kind}${ext}`);
    fs.writeFileSync(f, src);
    try { await load(f); r[kind] = null; } catch (e) { r[kind] = {name: e.name, message: e.message}; }
  }
  out[name] = r;
}
console.log(JSON.stringify(out, null, 1));
