// Test oracle only: integrationDocFiles for each fixture integration.
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const {Project} = await import(pathToFileURL(path.join(cliRoot, 'foundation/config/project.mjs')).href);
const {integrationDocFiles} = await import(pathToFileURL(path.join(cliRoot, 'foundation/discovery/integration-doc-files.mjs')).href);
const {fixtureDirs} = await import(new URL('./_fixtures.mjs', import.meta.url).href);
const FIXDIRS = await fixtureDirs();
const cases = [];
for (const {name, dir} of FIXDIRS) {
  process.chdir(dir);
  const p = await Project.load(dir, {fresh: true});
  for (const r of p.loadedIntegrations) cases.push({dir, name: r.name, result: await integrationDocFiles(r)});
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
console.log(cases.map(c => c.result.files.length).join(' '));
