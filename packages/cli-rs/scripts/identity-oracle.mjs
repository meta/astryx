// Test oracle only: collectIdentities and computeRequiredFiles for every
// loaded integration of each conformance fixture.
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const {Project} = await import(pathToFileURL(path.join(cliRoot, 'foundation/config/project.mjs')).href);
const inv = await import(pathToFileURL(path.join(cliRoot, 'foundation/integrations/contribution-inventory.mjs')).href);
const {fixtureDirs} = await import(new URL('./_fixtures.mjs', import.meta.url).href);
const FIXDIRS = await fixtureDirs();
const cases = [];
for (const {name, dir} of FIXDIRS) {
  process.chdir(dir);
  const p = await Project.load(dir, {fresh: true});
  for (const r of p.loadedIntegrations) {
    cases.push({dir, name: r.name, ...(await inv.collectIdentities(r)), required: r.__packageDir ? inv.computeRequiredFiles(r) : null});
  }
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
console.log(cases.length);
