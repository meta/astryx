// Test oracle only: integrationDocConsistency over the fixture integrations
// and a crafted package with every finding.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const {Project} = await import(pathToFileURL(path.join(cliRoot, 'foundation/config/project.mjs')).href);
const {integrationDocConsistency} = await import(pathToFileURL(path.join(cliRoot, 'foundation/discovery/doc-consistency.mjs')).href);
const pkg = path.join(os.tmpdir(), 'astryx-consistency-pkg');
fs.rmSync(pkg, {recursive: true, force: true});
const w = (rel, text) => { const f = path.join(pkg, rel); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, text); };
w('package.json', '{"name":"@x/pkg","version":"1.0.0"}');
w('components/Thing.doc.mjs', `export default {type: 'component', name: 'Thing', props: [
  {name: 'size', type: 'string', description: 'a'},
  {name: 'size', type: 'string', description: 'b'},
  {name: 'color / tone', type: 'string', description: 'c'},
  {name: 'tone', type: 'string', description: 'd'},
]};
export const docsZh = {propDescriptions: {sise: '大小', color: '颜色', nothingclose: 'x'}};
`);
w('components/Group.doc.mjs', `export default {type: 'component', name: 'Group', components: [{name: 'A', props: [{name: 'x', type: 'string', description: 'x'}]}]};
export const docsDense = {components: [{name: 'A', propDescriptions: {y: 'z', x: 'ok'}}]};
`);
w('docs/guide.doc.mjs', `export default {type: 'generic', name: 'guide', title: 'Guide', description: 'd', sections: [
  {title: 'Intro', content: []},
  {title: 'Setup', content: [{type: 'prose', text: 'a'}]},
  {title: 'Setup!', content: [{type: 'prose', text: 'b'}]},
]};
`);
w('docs/guid.doc.zh.mjs', 'export const docsZh = {};\n');
w('docs/zzz.doc.dense.mjs', 'export const docsDense = {};\n');
const cases = [{dir: pkg, name: '@x/pkg', integration: {components: path.join(pkg, 'components'), docs: path.join(pkg, 'docs')}, issues: await integrationDocConsistency({components: path.join(pkg, 'components'), docs: path.join(pkg, 'docs')}, pkg)}];
const FIX = '/tmp/astryx-conformance/fixtures';
for (const name of fs.readdirSync(FIX).sort().filter(n => !n.startsWith('.'))) {
  const dir = path.join(FIX, name);
  process.chdir(dir);
  const p = await Project.load(dir, {fresh: true});
  for (const r of p.loadedIntegrations) {
    cases.push({dir, name: r.name, integration: {components: r.components, docs: r.docs}, packageDir: r.__packageDir, issues: await integrationDocConsistency(r, r.__packageDir)});
  }
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
console.log(cases.map(c => c.issues.length).join(' '));
