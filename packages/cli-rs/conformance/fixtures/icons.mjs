// Core installed plus an icon-set integration (@acme/glyphs) that the
// project selects through experimental.iconSet.
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function writeIcons(dir, h, config) {
  const {writeIconPackage, definitionSource} = await import(path.join(h.PKG('cli'), 'test-utils', 'icon-set-fixture.mjs'));
  h.makeApp(dir, {name: 'icons'});
  writeIconPackage(path.join(dir, 'node_modules', '@acme', 'glyphs'), {
    definitions: {sparkle: definitionSource('sparkle', {words: ['magic', 'new']}), random: definitionSource('random', {description: 'Pick something at random.', words: ['dice', 'shuffle']})},
  });
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  h.writeJson(path.join(dir, 'package.json'), {...pj, dependencies: {...pj.dependencies, '@acme/glyphs': '1.0.0'}});
  if (config) h.writeFile(path.join(dir, 'astryx.config.mjs'), `export default ${JSON.stringify(config)};\n`);
}

export default async function (dir, h) {
  await writeIcons(dir, h, {integrations: ['@acme/glyphs'], experimental: {iconSet: 'glyphs'}});
}
