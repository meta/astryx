// Fuzzing: projects with unusual but legal setups, one per subfolder (`cwd`
// picks one; fuzz.mjs also runs in their nested folders).
import * as fs from 'node:fs';
import * as path from 'node:path';

export default async function (dir, h) {
  const app = async (name, files = {}, edit) => {
    const d = path.join(dir, name);
    await h.makeApp(d, {name: path.basename(name)});
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
    if (edit) {
      const file = path.join(d, 'package.json');
      const pj = JSON.parse(fs.readFileSync(file, 'utf8'));
      edit(pj, d);
      h.writeJson(file, pj);
    }
    return d;
  };
  await app('cjs', {'astryx.config.cjs': 'module.exports = {integrations: []};\n'}, pj => (pj.type = 'commonjs'));
  await app('tsconfig', {'astryx.config.ts': 'type C = {integrations: string[]};\nconst config: C = {integrations: []};\nexport default config;\n'});
  await app('fnconfig', {'astryx.config.mjs': 'export default () => ({integrations: []});\n'});
  await app('spaced ü', {'src/pages/Home.tsx': "export default function Home() { return null; }\n"});
  await app('noname', {}, pj => {
    delete pj.name;
    delete pj.version;
  });
  await app('devdep', {}, pj => {
    pj.devDependencies = pj.dependencies;
    delete pj.dependencies;
  });
  await app('oldcore', {}, (pj, d) => {
    const core = path.join(d, 'node_modules/@astryxdesign/core/package.json');
    const cp = JSON.parse(fs.readFileSync(core, 'utf8'));
    cp.version = '0.5.0';
    h.writeJson(core, cp);
    pj.dependencies['@astryxdesign/core'] = '^0.5.0';
  });
  await app('emptyconfig', {'astryx.config.mjs': ''});
  await app('deep', {'src/features/a/b/Widget.tsx': "export const Widget = () => null;\n"});
  // A workspace: the app lives in packages/web; core is hoisted to the root.
  const ws = await app('workspace', {}, pj => {
    pj.name = 'monorepo';
    pj.workspaces = ['packages/*'];
    delete pj.dependencies;
  });
  h.writeJson(path.join(ws, 'packages/web/package.json'), {name: 'web', version: '0.0.1', dependencies: {'@astryxdesign/core': h.CORE_VERSION}});
  h.writeFile(path.join(ws, 'packages/web/src/App.tsx'), "import {Button} from '@astryxdesign/core';\nexport default () => <Button label=\"x\" />;\n");
}
