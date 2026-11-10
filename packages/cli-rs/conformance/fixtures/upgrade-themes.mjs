// An app with copied themes (one without a descriptor, one described by a
// same-stem .doc.mjs) that still use removed theme targets.
import * as path from 'node:path';

const DOC = `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
export default {
  type: 'theme',
  name: 'brand',
  displayName: 'Brand',
  description: 'A brand theme.',
  maintained: false,
};
`;

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'themes-app'});
  const w = (rel, text) => writeFile(path.join(dir, rel), text);
  w('src/themes/deep-sea/deepSeaTheme.ts', "export const deepSeaTheme = {name: 'deep-sea', components: {navicon: {base: {}}}};\n");
  w('src/themes/deep-sea/icons.tsx', 'export const icons = {};\n');
  w('src/themes/brand/brandTheme.doc.mjs', DOC);
  w('src/themes/brand/brandTheme.ts', `export const brandTheme = {
  name: 'brand',
  components: {
    navicon: {base: {}},
    hovercard: {root: {}},
  },
};
export const otherLibraryTheme = {name: 'other', components: {checkbox: {root: {}}}};
`);
  w('src/themes/helpers/helper.ts', 'export const helper = true;\n');
  w('src/theme.ts', `import {defineTheme} from '@astryxdesign/core/theme';

export default defineTheme({
  name: 'app',
  components: {codeblock: {root: {}}, progressbar: {root: {}}},
});
`);
}
