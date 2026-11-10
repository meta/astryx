// An app with local themes whose built modules import stylesheets: one that
// exists beside it (or in a subfolder), and one that is missing.
import * as path from 'node:path';

const doc = slug => `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
export default {type: 'theme', name: '${slug}', displayName: '${slug}', description: 'The ${slug} theme.', maintained: false};
`;

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'cssart-app'});
  const w = (rel, text) => writeFile(path.join(dir, rel), text);
  const theme = (slug, built, files = {}) => {
    w(`src/themes/${slug}/${slug}Theme.doc.mjs`, doc(slug));
    w(`src/themes/${slug}/${slug}Theme.ts`, `export const ${slug}Theme = {name: '${slug}'};\n`);
    w(`src/themes/${slug}/${slug}.js`, built);
    w(`src/themes/${slug}/${slug}.css`, '.x {}\n');
    for (const [rel, text] of Object.entries(files)) w(`src/themes/${slug}/${rel}`, text);
  };
  theme('brand', "import './brand.css';\nimport {extra} from './parts/extra.js';\nexport const brandTheme = {name: 'brand', variants: {button: ['pill', ...extra]}};\n", {
    'parts/extra.js': "import './extra.css';\nexport const extra = ['glow'];\n",
    'parts/extra.css': '.y {}\n',
  });
  theme('mono', "import './mono-missing.css';\nexport const monoTheme = {name: 'mono', variants: {button: ['flat']}};\n");
}
