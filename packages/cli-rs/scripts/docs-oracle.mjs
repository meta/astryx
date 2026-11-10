// Test oracle only: Project.docs() catalog per conformance fixture.
// Usage: node scripts/docs-oracle.mjs <js-cli-root> <out.json>
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const {Project} = await import(pathToFileURL(path.join(cliRoot, 'foundation/config/project.mjs')).href);
const {fixtureDirs} = await import(new URL('./_fixtures.mjs', import.meta.url).href);
const FIXDIRS = await fixtureDirs();
// An icon-set project with its own definitions, opted in.
const fx = await import(pathToFileURL(path.join(cliRoot, 'test-utils/icon-set-fixture.mjs')).href);
const ICONS = '/tmp/astryx-icon-docs-fixture';
fs.rmSync(ICONS, {recursive: true, force: true});
fs.mkdirSync(ICONS, {recursive: true});
const iconProject = fx.writeIconSetProject(ICONS, {
  config: {experimental: {iconSet: 'glyphs'}},
  packages: [{definitions: {rotate: fx.definitionSource('rotate')}, data: {...fx.glyphsData(), module: '@acme/glyphs', map: {...fx.glyphsData().map, rotate: 'x'}}}],
});
const cases = [];
const dirs = [...FIXDIRS.map(f => f.dir), iconProject];
for (const dir of dirs) {
  process.chdir(dir);
  const p = await Project.load(dir, {fresh: true});
  const c = await p.docs();
  cases.push({dir, entries: c.entries().map(e => ({...e, aliases: c.aliasesOf(e)})), issues: c.issues,
    tree: JSON.parse(JSON.stringify(c.treeInputs)), projectIssues: await p.issues()});
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
