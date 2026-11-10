// Generates src/commands/upgrade/registry.json: the Core codemod registry
// (versions, names, metadata) read from packages/cli/assets/codemods.
// Usage: node scripts/gen-upgrade-registry.mjs <path to packages/cli>
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const cliRoot = path.resolve(process.argv[2] ?? new URL('../../cli', import.meta.url).pathname);
const reg = await import(pathToFileURL(path.join(cliRoot, 'assets/codemods/registry.mjs')).href);
const out = [];
for (const v of reg.versions) {
  const [{transforms}] = await reg.getTransformsBetween(prev(v), v);
  out.push({
    version: v,
    transforms: transforms.map(t => ({
      name: t.name,
      title: t.meta.title,
      ...(t.meta.description !== undefined ? {description: t.meta.description} : {}),
      ...(t.meta.pr !== undefined ? {pr: t.meta.pr} : {}),
      ...(t.meta.codemodType !== undefined ? {codemodType: t.meta.codemodType} : {}),
      ...(t.meta.fileExtensions !== undefined ? {fileExtensions: t.meta.fileExtensions} : {}),
      optional: !!t.optional,
    })),
  });
}
function prev(v) {
  const i = reg.versions.indexOf(v);
  return i === 0 ? '0.0.0' : reg.versions[i - 1];
}
fs.writeFileSync(new URL('../src/commands/upgrade/registry.json', import.meta.url), JSON.stringify({latest: reg.latestVersion, versions: out}, null, 1) + '\n');
console.log(out.length, 'versions');
