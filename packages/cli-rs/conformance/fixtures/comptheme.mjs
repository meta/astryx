// An app whose subfolders each name a theme in package.json `astryx.theme`
// (the legacy theme pointer the component text views read for variants).
import * as path from 'node:path';

export default async function (dir, h) {
  await h.makeApp(dir);
  const theme = `export const sunsetTheme = ${JSON.stringify({name: 'Sunset', tokens: {}, variants: {button: ['pill', 'glow'], badge: ['soft']}})};\n`;
  await h.writeFile(path.join(dir, 'themes/sunset.mjs'), theme);
  await h.writeFile(path.join(dir, 'themes/default.mjs'), `export default ${JSON.stringify({name: 'Plain', variants: {card: ['flat']}})};\n`);
  await h.writeFile(path.join(dir, 'themes/none.mjs'), 'export const notATheme = 1;\n');
  const sub = (name, pointer) =>
    h.writeJson(path.join(dir, name, 'package.json'), {name: `theme-${name}`, version: '1.0.0', astryx: {theme: pointer}});
  await sub('sunset', '../themes/sunset.mjs');
  await sub('plain', '../themes/default.mjs');
  await sub('notheme', '../themes/none.mjs');
  await sub('missing', './nope.mjs');
  await sub('scoped', '@nope/theme');
  await sub('bare', 'nopetheme');
}
