// Doctor integration: integration packages being authored, in broken
// states, one package per subfolder (the cwd is the package).
import * as path from 'node:path';

export default async function (dir, h) {
  const pkg = async (name, files, pj) => {
    const d = path.join(dir, name);
    await h.writeJson(path.join(d, 'package.json'), pj);
    h.copyPackage(path.join(h.REPO, 'packages/core'), path.join(d, 'node_modules/@astryxdesign/core'));
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
  };
  await pkg('absolute', {
    'astryx.integration.mjs': "export default {components: '/tmp/elsewhere', docs: '../outside'};\n",
  }, {name: '@acme/abs', version: '1.0.0'});
  await pkg('noname', {
    'astryx.integration.mjs': "export default {components: './components'};\n",
    'components/Gauge.tsx': 'export function Gauge() { return null; }\n',
    'components/Gauge.doc.mjs': "export default {type: 'component', name: 'Gauge', category: 'Data Display', usage: {description: 'A gauge.'}, props: []};\n",
  }, {private: false});
  await pkg('exports', {
    'astryx.integration.mjs': "export default {components: './src'};\n",
    'src/Meter/Meter.tsx': 'export function Meter() { return null; }\n',
    'src/Meter/Meter.doc.mjs': "export default {type: 'component', name: 'Meter', category: 'Data Display', import: '@acme/exp/meter', usage: {description: 'A meter.'}, props: [], examples: [{label: 'Basic', code: \"import {Meter, Nope} from '@acme/exp';\\nimport {Meter as M} from '@acme/exp/private';\\n<Meter />\"}]};\n",
    'src/Dial/Dial.tsx': 'export function Dial() { return null; }\n',
    'src/Dial/Dial.doc.mjs': "export default {type: 'component', name: 'Dial', category: 'Data Display', usage: {description: 'A dial.'}, props: []};\n",
    'src/index.ts': "export {Meter} from './Meter/Meter';\n",
  }, {name: '@acme/exp', version: '1.0.0', exports: {'.': './src/index.ts', './meter': './src/Meter/Meter.tsx'}});
  await pkg('badmanifest', {'astryx.integration.mjs': "export const notDefault = 1;\n"}, {name: '@acme/bad', version: '1.0.0'});
  await pkg('twomanifests', {'astryx.integration.mjs': 'export default {};\n', 'astryx.integration.js': 'export default {};\n'}, {name: '@acme/two', version: '1.0.0'});
  await pkg('nomanifest', {}, {name: '@acme/none', version: '1.0.0'});
  await pkg('badjson', {'astryx.integration.mjs': 'export default {};\n'}, {name: '@acme/x', version: '1.0.0'});
  await h.writeFile(path.join(dir, 'badjson/package.json'), '{"name": "@acme/x",');
}
