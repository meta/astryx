// Doctor integration: one authored package with a finding of most kinds the
// authoring checks report (names, blocks, examples, templates, docs).
import * as path from 'node:path';

export default async function (dir, h) {
  const d = path.join(dir, 'kit');
  const w = (rel, text) => h.writeFile(path.join(d, rel), text);
  await h.writeJson(path.join(d, 'package.json'), {
    name: '@acme/kit2',
    version: '2.0.0',
    files: ['src', 'templates', 'docs'],
    exports: {'.': './src/index.ts', './Gauge': './src/Gauge/Gauge.tsx'},
    peerDependencies: {'@astryxdesign/core': h.CORE_VERSION, '@astryxdesign/cli': '>=0.1.0 <0.2.0'},
  });
  h.copyPackage(path.join(h.REPO, 'packages/core'), path.join(d, 'node_modules/@astryxdesign/core'));
  await w('astryx.integration.mjs', "export default {components: './src', templates: './templates', docs: './docs', themes: './themes'};\n");
  await w('src/index.ts', "export {Gauge} from './Gauge/Gauge';\nexport {Button} from './Button/Button';\n");
  await w('src/Gauge/Gauge.tsx', 'export function Gauge() { return null; }\n');
  await w('src/Gauge/Gauge.doc.mjs', "export default {type: 'component', name: 'Gauge', category: 'Data Display', usage: {description: 'A gauge.'}, props: [{name: 'value', type: 'number', description: 'Value.'}, {name: 'value', type: 'number', description: 'Again.'}], examples: [{label: 'Basic', code: \"import {Gauge, Missing} from '@acme/kit2/Gauge';\\n<Gauge />\"}, {code: \"import {Gauge} from '@acme/kit2/nope';\"}]};\nexport const docsZh = {propDescriptions: {ghost: '幽灵'}};\n");
  await w('src/Meter/Meter.tsx', 'export function Dial() { return null; }\n');
  await w('src/Meter/Meter.doc.mjs', "export default {type: 'component', name: 'MeterX', category: 'Data Display', usage: {description: 'A meter.'}, props: []};\n");
  await w('src/Button/Button.tsx', 'export function Button() { return null; }\n');
  await w('src/Button/Button.doc.mjs', "export default {type: 'component', name: 'Button', category: 'Actions', usage: {description: 'A kit button.'}, props: []};\n");
  await w('src/Lamp/Lamp.tsx', 'export default function Lamp() { return null; }\n');
  await w('src/Lamp/Lamp.doc.mjs', "export default {type: 'component', name: 'Lampy', category: 'Data Display', import: '@acme/kit2', usage: {description: 'A lamp.'}, props: []};\n");
  await w('src/Lamp/Lamp.doc.ts', "export default {type: 'component', name: 'Lamp', category: 'Data Display', usage: {description: 'A lamp.'}, props: []};\n");
  await w('src/Orphan.tsx', 'export function Orphan() { return null; }\n');
  await w('templates/gauge-showcase.tsx', "import {Gauge} from '@acme/kit2';\nimport {readFileSync} from 'node:fs';\nimport helper from '../src/helper';\nconst logo = new URL('./logo.svg', import.meta.url);\nexport function GaugeShowcase() { return <Gauge />; }\n");
  await w('templates/gauge-showcase.doc.mjs', "export default {type: 'block', name: 'gauge-showcase', description: 'A gauge.', exampleFor: 'Gauge', isShowcase: true, category: 'components/gauge', componentsUsed: ['Gauge', 'Nonexistent'], aspectRatio: 2};\n");
  await w('templates/page-a.tsx', "import * as UI from './parts';\nexport default function PageA() { return <UI.Card />; }\n");
  await w('templates/parts.ts', "export {Card} from '@astryxdesign/core';\n");
  await w('templates/page-a.doc.mjs', "export default {type: 'page', name: 'page-a', description: 'Page A.', componentsUsed: ['Card', 'Mystery']};\n");
  await w('templates/dashboard.tsx', "import {Card} from '@astryxdesign/core/src/Card/Card';\nexport default function Dashboard() { return <Card />; }\n");
  await w('templates/dashboard.doc.mjs', "export default {type: 'page', name: 'dashboard', description: 'A dashboard that collides with Core.'};\n");
  await w('docs/tokens.doc.mjs', "export default {type: 'generic', name: 'tokens', title: 'Tokens', description: 'Our tokens.', sections: [{title: 'Use', content: [{type: 'prose', text: 'Run npx astryx docs tokens to see more. Very simply put, it is really just basically easy.'}]}]};\n");
  await w('docs/guide.doc.mjs', "export default {type: 'generic', name: 'kit-guide', title: 'Kit guide', description: 'Guide.', sections: [{title: 'Start', content: [{type: 'prose', text: 'Run `pnpm dlx astryx component Gauge` and see the Gauge docs. Install the kit, then wrap the app in the provider so every component reads the theme tokens from one place.'}]}, {title: 'More', content: [{type: 'prose', text: 'Install the kit, then wrap the app in the provider so every component reads the theme tokens from one place.'}]}]};\n");
  await w('themes/stray/helpers.ts', 'export const x = 1;\n');
  await w('lost/Widget.doc.mjs', "export default {type: 'component', name: 'Widget', category: 'Layout', usage: {description: 'Lost.'}, props: []};\n");
}
