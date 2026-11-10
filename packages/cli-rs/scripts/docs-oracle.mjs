// Test oracle only: Project.docs() catalog per conformance fixture.
// Usage: node scripts/docs-oracle.mjs <js-cli-root> <out.json>
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const {Project} = await import(pathToFileURL(path.join(cliRoot, 'foundation/config/project.mjs')).href);
const FIX = '/tmp/astryx-conformance/fixtures';
const cases = [];
for (const name of fs.readdirSync(FIX).sort().filter(n => !n.startsWith('.'))) {
  const dir = path.join(FIX, name);
  process.chdir(dir);
  const p = await Project.load(dir, {fresh: true});
  const c = await p.docs();
  cases.push({dir, entries: c.entries().map(e => ({...e, aliases: c.aliasesOf(e)})), issues: c.issues,
    tree: JSON.parse(JSON.stringify(c.treeInputs)), projectIssues: await p.issues()});
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
