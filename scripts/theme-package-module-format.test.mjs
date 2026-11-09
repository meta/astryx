// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Theme packages declare the module format of every entry they export.
 * @input Each published theme package's `package.json`.
 * @output A failure when an exported entry's extension and the package's
 *   `type` would make a bundler or Node read it in the wrong format.
 * @position Packaging check for the theme packages. `astryx theme build`
 *   writes `./built` (`dist/<theme>.js`) as an ES module, and tsup writes the
 *   `source` entry in both formats. A `.js` file is an ES module only where
 *   its package says `"type": "module"`; otherwise bundlers and older Node
 *   read it as CommonJS.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const THEMES_DIR = path.resolve(import.meta.dirname, '../packages/themes');

const THEMES = fs
  .readdirSync(THEMES_DIR)
  .map(name => ({name, dir: path.join(THEMES_DIR, name)}))
  .filter(({dir}) => fs.existsSync(path.join(dir, 'package.json')))
  .map(({name, dir}) => ({
    name,
    manifest: JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    ),
  }))
  .filter(({manifest}) => manifest.private !== true);

/** The format Node and bundlers read a file in, from its extension. */
function formatOf(file, packageType) {
  if (file.endsWith('.mjs')) return 'esm';
  if (file.endsWith('.cjs')) return 'cjs';
  return packageType === 'module' ? 'esm' : 'cjs';
}

describe('theme package module formats', () => {
  it('finds the published theme packages', () => {
    expect(THEMES.length).toBeGreaterThan(0);
  });

  for (const {name, manifest} of THEMES) {
    describe(name, () => {
      it('reads ./built, an ES module, as an ES module for import and require', () => {
        const built = manifest.exports['./built'];
        for (const condition of ['import', 'require']) {
          expect(formatOf(built[condition], manifest.type), condition).toBe(
            'esm',
          );
        }
      });

      it('reads the source entry in the format tsup writes for each condition', () => {
        const source = manifest.exports['.'];
        expect(formatOf(source.import, manifest.type)).toBe('esm');
        expect(formatOf(source.require, manifest.type)).toBe('cjs');
        expect(formatOf(manifest.main, manifest.type)).toBe('cjs');
        expect(manifest.module).toBe(source.import);
      });
    });
  }
});
