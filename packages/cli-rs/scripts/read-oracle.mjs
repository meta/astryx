// Test oracle only: readDocView over Core's and lab's component and hook docs
// in every language and both loaders. Usage:
//   node scripts/read-oracle.mjs <js-cli-root> <out.json>
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

const [cliRoot, out] = process.argv.slice(2);
const {loadComponentDoc, loadDocs} = await import(pathToFileURL(path.join(cliRoot, 'foundation/discovery/component-loader.mjs')).href);
function toJson(value, seen = new Set()) {
  if (value === undefined) return {__js: 'undefined'};
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Object.is(value, -0) ? 0 : Number.isFinite(value) ? value : {__js: 'number', value: String(value)};
  if (typeof value === 'function') return {__js: 'function', name: value.name};
  if (typeof value !== 'object') return {__js: typeof value};
  if (seen.has(value)) return {__js: 'circular'};
  seen.add(value);
  const o = Array.isArray(value) ? value.map(v => toJson(v, seen)) : Object.fromEntries(Object.keys(value).map(k => [k, toJson(value[k], seen)]));
  seen.delete(value);
  return o;
}
const files = [];
const walk = d => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, {withFileTypes: true})) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.doc\.(mjs|ts)$/.test(e.name)) files.push(f); } };
const {fixtureDirs} = await import(new URL('./_fixtures.mjs', import.meta.url).href);
for (const {name, dir} of await fixtureDirs()) if (['app', 'large', 'integration', 'author'].includes(name)) walk(dir);
const cases = [];
for (const f of files.sort()) {
  const root = /\/use[A-Z]|hooks?\//.test(f) ? 'hooks' : 'components';
  for (const lang of [null, 'zh', 'dense']) {
    for (const [name, fn] of [['strict', loadComponentDoc], ['native', loadDocs]]) {
      let r;
      try { const v = await fn(f, {lang, root}); r = {ok: v === undefined ? null : toJson(v), undef: v === undefined}; } catch (e) { r = {error: e.message}; }
      cases.push({file: f, root, lang, reader: name, ...r});
    }
  }
}
fs.writeFileSync(out, JSON.stringify(cases));
console.log(cases.length, 'reads,', cases.filter(c => c.error).length, 'errors');
