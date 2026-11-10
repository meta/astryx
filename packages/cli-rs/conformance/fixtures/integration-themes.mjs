// integration verify: theme packages whose built output is fresh, stale,
// renamed, or a wrapper, one package per subfolder.
import * as fs from 'node:fs';
import * as path from 'node:path';

const SOURCE = name =>
  `import {defineTheme} from '@astryxdesign/core/theme';\n\nexport const oceanTheme = defineTheme({\n  name: '${name}',\n  tokens: {colorPrimary: '#0a6cff'},\n});\n`;

const DESCRIPTOR =
  "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {\n  type: 'theme',\n  name: 'ocean',\n  displayName: 'Ocean',\n  description: 'Ocean theme.',\n  maintained: true,\n};\n";

export default async function (dir, h) {
  const pkg = async (name, files, source = SOURCE('ocean')) => {
    const d = path.join(dir, name);
    h.makeApp(d, {name: `@acme/${name}`});
    const pj = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
    delete pj.private;
    pj.version = '1.0.0';
    pj.exports = {
      './themes/ocean': './themes/ocean/ocean.js',
      './themes/ocean.css': './themes/ocean/ocean.css',
    };
    pj.sideEffects = ['**/*.css'];
    pj.peerDependencies = {'@astryxdesign/cli': '>=0.6.4'};
    pj.peerDependenciesMeta = {'@astryxdesign/cli': {optional: true}};
    await h.writeJson(path.join(d, 'package.json'), pj);
    await h.writeFile(path.join(d, 'astryx.integration.mjs'), "export default {\n  themes: './themes'\n};\n");
    await h.writeFile(path.join(d, 'themes/ocean/oceanTheme.ts'), source);
    await h.writeFile(path.join(d, 'themes/ocean/oceanTheme.doc.mjs'), DESCRIPTOR);
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
  };
  // Source only: a case builds it first (fresh), or not (unresolvable).
  await pkg('fresh', {});
  // Built output that matches no build of the source.
  await pkg('stale', {
    'themes/ocean/ocean.css': '/* an old build */\n:root{--x:1}\n',
    'themes/ocean/ocean.js': "import './ocean.css';\nexport const oceanTheme = {name: 'ocean'};\n",
  });
  // The source names the theme "sea", so a build writes sea.js and sea.css.
  await pkg('renamed', {
    'themes/ocean/ocean.css': '/* an old build */\n',
    'themes/ocean/ocean.js': "export const oceanTheme = {name: 'ocean'};\n",
  }, SOURCE('sea'));
  // Only a stylesheet export: an incomplete pair.
  await pkg('cssonly', {'themes/ocean/ocean.css': '/* css */\n'});
  const cssonly = path.join(dir, 'cssonly/package.json');
  const pj = JSON.parse(fs.readFileSync(cssonly, 'utf8'));
  pj.exports = {'./themes/ocean.css': './themes/ocean/ocean.css'};
  await h.writeJson(cssonly, pj);
}
