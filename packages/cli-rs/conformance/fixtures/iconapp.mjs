// An app with two icon-set packages installed (glyphs, and outline from a
// second package), with and without a config to write the choice into.
import * as path from 'node:path';

export default async function make(dir, h) {
  const {writeIconPackage} = await import(path.join(h.PKG('cli'), 'test-utils', 'icon-set-fixture.mjs'));
  writeIconPackage(path.join(dir, 'node_modules', '@acme', 'glyphs'), {});
  writeIconPackage(path.join(dir, 'node_modules', '@acme', 'outline'), {name: '@acme/outline'});
  writeIconPackage(path.join(dir, 'node_modules', '@acme', 'twin'), {name: '@acme/twin', set: 'glyphs'});
  h.writeJson(path.join(dir, 'package.json'), {name: 'iconapp', private: true, dependencies: {'@acme/glyphs': '1.0.0', '@acme/outline': '1.0.0', '@acme/twin': '1.0.0', '@astryxdesign/core': h.CORE_VERSION}});
  h.copyPackage(h.PKG('core'), path.join(dir, 'node_modules/@astryxdesign/core'));
  h.writeFile(path.join(dir, 'astryx.config.mjs'), "export default {\n  integrations: ['@acme/glyphs', '@acme/outline'],\n};\n");
  h.writeFile(path.join(dir, 'sub', 'spread.config.mjs'), 'const base = {};\nexport default {...base};\n');
}
