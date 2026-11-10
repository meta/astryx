// Doctor integration: template assets that npm's packing may drop (ignore
// files and `files` entries). Each folder is its own package.
import * as path from 'node:path';

export default async function (dir, h) {
  const kit = async (name, pkg, files) => {
    const d = path.join(dir, name);
    await h.writeJson(path.join(d, 'package.json'), {name: `@acme/${name}`, version: '1.0.0', ...pkg, peerDependencies: {'@astryxdesign/core': h.CORE_VERSION}});
    h.copyPackage(path.join(h.REPO, 'packages/core'), path.join(d, 'node_modules/@astryxdesign/core'));
    await h.writeFile(path.join(d, 'astryx.integration.mjs'), "export default {templates: './templates'};\n");
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
  };
  const tpl = asset => `import {Card} from '@astryxdesign/core';\nconst art = new URL('${asset}', import.meta.url);\nexport default function Promo() { return <Card />; }\n`;
  const doc = "export default {type: 'page', name: 'promo', description: 'A promo page.', componentsUsed: ['Card']};\n";
  const base = asset => ({'templates/promo.tsx': tpl(asset), 'templates/promo.doc.mjs': doc});
  await kit('ignored', {}, {...base('./logo.svg'), 'templates/logo.svg': '<svg/>', '.npmignore': '*.svg\n'});
  await kit('nested', {}, {...base('./art/a.png'), 'templates/art/a.png': 'png', 'templates/.npmignore': 'art/\n'});
  await kit('gitignored', {}, {...base('./assets/a.png'), 'templates/assets/a.png': 'png', '.gitignore': 'assets\n'});
  await kit('negated', {}, {...base('./logo.svg'), 'templates/logo.svg': '<svg/>', '.npmignore': '*.svg\n!templates/logo.svg\n'});
  await kit('kept', {}, {...base('./logo.svg'), 'templates/logo.svg': '<svg/>', '.npmignore': 'tests/\n'});
  await kit('filesglob', {files: ['templates/*.tsx', 'templates/*.mjs']}, {...base('./logo.svg'), 'templates/logo.svg': '<svg/>'});
  await kit('filesneg', {files: ['templates', '!templates/logo.svg']}, {...base('./logo.svg'), 'templates/logo.svg': '<svg/>'});
  await kit('filesok', {files: ['templates']}, {...base('./logo.svg'), 'templates/logo.svg': '<svg/>', 'templates/.npmignore': '*.svg\n'});
  await kit('folder', {}, {...base('./art/'), 'templates/art/a.png': 'png', '.npmignore': 'templates/art/a.png\n'});
}
