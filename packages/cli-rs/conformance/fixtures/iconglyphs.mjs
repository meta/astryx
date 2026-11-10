// The glyphs icon-set package (hand-written theme map, two variants, a
// custom definition) as its author's checkout: authoring runs here.
import * as path from 'node:path';

export default async function make(dir, h) {
  const {writeIconPackage, definitionSource} = await import(path.join(h.PKG('cli'), 'test-utils', 'icon-set-fixture.mjs'));
  writeIconPackage(dir, {definitions: {sparkle: definitionSource('sparkle', {words: ['shine', 'magic']})}});
}
