// A project that opts into icon sets, with an integration that adds one.
// The project lives in <fixture>/app.
import * as path from 'node:path';

export default async function (dir, h) {
  const {writeIconSetProject} = await import(path.join(h.PKG('cli'), 'test-utils', 'icon-set-fixture.mjs'));
  writeIconSetProject(dir, {
    config: {integrations: ['@acme/glyphs'], experimental: {iconSet: 'glyphs'}},
  });
}
