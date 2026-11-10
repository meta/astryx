import fs from 'node:fs'; import path from 'node:path';
import jscodeshift from 'jscodeshift';
const root = path.resolve(import.meta.dirname, 'assets/codemods/transforms');
const lines = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(l => JSON.parse(l));
const seen = new Set(); const out = [];
for (const r of lines) {
  if (typeof r.source !== 'string') continue;
  const key = JSON.stringify([r.m, r.path, r.source, r.options]);
  if (seen.has(key)) continue; seen.add(key);
  const mod = await import(path.join(root, r.m));
  const ext = path.extname(r.path || 'x.tsx');
  const parser = ext === '.tsx' || ext === '.ts' ? 'tsx' : 'babel';
  const j = jscodeshift.withParser(parser);
  let res, err;
  try { res = mod.default({source: r.source, path: r.path}, {jscodeshift: j, stats() {}, report() {}}, r.options ?? undefined); } catch (e) { err = String(e?.message ?? e); }
  out.push({transform: r.m.replace(/\.mjs$/, ''), path: r.path, options: r.options, source: r.source, output: err ? null : (res == null ? null : res), error: err ?? null});
}
const byT = {};
for (const o of out) (byT[o.transform] ??= []).push(o);
const dir = process.argv[3]; fs.mkdirSync(dir, {recursive: true});
for (const [t, arr] of Object.entries(byT)) fs.writeFileSync(path.join(dir, t.replace('/', '__') + '.json'), JSON.stringify(arr, null, 1) + '\n');
console.log(out.length, Object.keys(byT).length, out.filter(o => o.error).length);
