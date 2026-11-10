// Test oracle only: Project.load on each conformance fixture, dumped for the
// Rust unit test. Usage: node scripts/project-oracle.mjs <js-cli-root> <out.json>
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

const [cliRoot, out] = process.argv.slice(2);
const {Project} = await import(pathToFileURL(path.join(cliRoot, 'foundation/config/project.mjs')).href);
const FIX = '/tmp/astryx-conformance/fixtures';

function toJson(value, seen = new Set()) {
  if (value === undefined) return {__js: 'undefined'};
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : {__js: 'number', value: String(value)};
  if (typeof value === 'function') return {__js: 'function', name: value.name};
  if (typeof value !== 'object') return {__js: typeof value};
  if (seen.has(value)) return {__js: 'circular'};
  seen.add(value);
  const o = Array.isArray(value) ? value.map(v => toJson(v, seen)) : Object.fromEntries(Object.keys(value).map(k => [k, toJson(value[k], seen)]));
  seen.delete(value);
  return o;
}

const cases = [];
for (const name of fs.readdirSync(FIX).sort().filter(n => !n.startsWith('.'))) {
  const dir = path.join(FIX, name);
  process.chdir(dir);
  try {
    const p = await Project.load(dir, {fresh: true});
    cases.push({dir, configPath: p.configPath, config: toJson(p.config), integrations: toJson(p.integrations),
      loaded: toJson(p.loadedIntegrations), issues: await p.issues()});
  } catch (e) {
    cases.push({dir, error: e.message});
  }
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
console.log(cases.length, 'fixtures');
