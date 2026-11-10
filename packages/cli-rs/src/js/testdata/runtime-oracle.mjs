import fs from 'node:fs';
const snippets = JSON.parse(fs.readFileSync('/tmp/jse_rt/snippets.json', 'utf8'));
fs.mkdirSync('/tmp/jse_rt/files', {recursive: true});
const out = [];
for (const [name, src] of snippets) {
  const f = `/tmp/jse_rt/files/${name}.mjs`;
  fs.writeFileSync(f, src + '\nexport default 1;\n');
  try { await import(f); out.push({name, source: src, error: null}); }
  catch (e) { out.push({name, source: src, error: e instanceof Error ? {name: e.name, message: e.message} : {name: '', message: String(e)}}); }
}
console.log(JSON.stringify(out, null, 1));
