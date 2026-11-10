// A project with integrations that exercise component resolution: a name
// Core also owns (ambiguity), a family doc with a member, a doc whose export
// name differs from its file name, an invalid doc, a translated doc, a Core
// replacement, and a legacy `astryx.docs` package.
import * as path from 'node:path';

const doc = fields => `export default ${JSON.stringify({type: 'component', ...fields}, null, 2)};\n`;

export default async function (dir, h) {
  await h.makeApp(dir);
  await h.writeJson(path.join(dir, 'package.json'), {
    name: 'compkit-app',
    version: '1.0.0',
    dependencies: {
      '@astryxdesign/core': h.CORE_VERSION,
      '@comp/kit': '2.0.0',
      '@comp/swap': '1.0.0',
      '@comp/legacy': '1.0.0',
    },
  });
  await h.writeFile(path.join(dir, 'astryx.config.mjs'), "export default {integrations: ['@comp/kit', '@comp/swap']};\n");

  const kit = path.join(dir, 'node_modules', '@comp', 'kit');
  await h.writeJson(path.join(kit, 'package.json'), {
    name: '@comp/kit',
    version: '2.0.0',
    exports: {'.': './index.js', './KitPanel': './components/KitPanel/KitPanel.tsx', './package.json': './package.json'},
  });
  await h.writeFile(path.join(kit, 'index.js'), 'export {};\n');
  await h.writeFile(path.join(kit, 'astryx.integration.mjs'), "export default {components: './components'};\n");
  const c = path.join(kit, 'components');
  await h.writeFile(path.join(c, 'Button.tsx'), 'export function Button() { return null; }\n');
  await h.writeFile(
    path.join(c, 'Button.doc.mjs'),
    doc({name: 'Button', group: 'Kit Actions', usage: {description: 'The kit button, with a kit-only look.'}, props: [{name: 'tone', type: "'calm' | 'loud'", description: 'How loud it looks.'}]}),
  );
  await h.writeFile(
    path.join(c, 'KitPanel/KitPanel.tsx'),
    'export function KitPanel() { return null; }\nexport function KitPanelHeader() { return null; }\n',
  );
  await h.writeFile(
    path.join(c, 'KitPanel/KitPanel.doc.mjs'),
    doc({
      name: 'KitPanel',
      group: 'Kit Layout',
      usage: {description: 'A panel with an optional header.', bestPractices: [{guidance: true, description: 'Give every panel a header.'}]},
      components: [
        {name: 'KitPanel', description: 'The panel frame.', props: [{name: 'padding', type: 'number', default: '4', description: 'Inner space.'}]},
        {name: 'KitPanelHeader', description: 'The panel header row.', props: [{name: 'title', type: 'string', required: true, description: 'Header text.'}]},
      ],
    }),
  );
  await h.writeFile(path.join(c, 'Gauge.tsx'), 'export function KitGauge() { return null; }\n');
  await h.writeFile(
    path.join(c, 'Gauge.doc.mjs'),
    doc({name: 'KitGauge', usage: {description: 'A gauge for one value between two bounds.'}, props: [{name: 'value', type: 'number', required: true, description: 'The value.'}]}),
  );
  await h.writeFile(path.join(c, 'Broken.tsx'), 'export function Broken() { return null; }\n');
  await h.writeFile(path.join(c, 'Broken.doc.mjs'), "export const docs = {name: 'Broken'};\n");
  await h.writeFile(path.join(c, 'Dial.tsx'), 'export function Dial() { return null; }\n');
  await h.writeFile(
    path.join(c, 'Dial.doc.mjs'),
    `export default ${JSON.stringify({type: 'component', name: 'Dial', usage: {description: 'A dial to pick a value by turning it.'}, props: [{name: 'value', type: 'number', description: 'The current value.'}]}, null, 2)};\n` +
      `export const docsZh = ${JSON.stringify({usage: {description: '旋转选择数值的旋钮。'}, propDescriptions: {value: '当前值。'}}, null, 2)};\n`,
  );

  const swap = path.join(dir, 'node_modules', '@comp', 'swap');
  await h.writeJson(path.join(swap, 'package.json'), {
    name: '@comp/swap',
    version: '1.0.0',
    peerDependencies: {'@astryxdesign/cli': '>=0.6.7'},
    peerDependenciesMeta: {'@astryxdesign/cli': {optional: true}},
  });
  await h.writeFile(path.join(swap, 'astryx.integration.mjs'), "export default {components: './components'};\n");
  await h.writeFile(path.join(swap, 'components/SwapNav.tsx'), 'export function SwapNav() { return null; }\n');
  await h.writeFile(
    path.join(swap, 'components/SwapNav.doc.mjs'),
    doc({name: 'SwapNav', replaces: 'SideNav', usage: {description: 'A side navigation that replaces the Core one.'}, props: [{name: 'items', type: 'NavItem[]', required: true, description: 'The links.'}]}),
  );

  const legacy = path.join(dir, 'node_modules', '@comp', 'legacy');
  await h.writeJson(path.join(legacy, 'package.json'), {name: '@comp/legacy', version: '1.0.0', astryx: {docs: './docs', category: 'Legacy Kit'}});
  await h.writeFile(
    path.join(legacy, 'docs/LegacyThing.doc.mjs'),
    doc({name: 'LegacyThing', usage: {description: 'A component documented the old way.'}, props: [{name: 'size', type: "'sm' | 'lg'", description: 'Size.'}]}),
  );
}
