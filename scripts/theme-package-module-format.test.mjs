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

/** The format Node, bundlers and TypeScript read a file in, from its name. */
function formatOf(file, packageType) {
  if (/\.(?:mjs|d\.mts)$/.test(file)) return 'esm';
  if (/\.(?:cjs|d\.cts)$/.test(file)) return 'cjs';
  return packageType === 'module' ? 'esm' : 'cjs';
}

/**
 * The runtime file and the declaration file one condition resolves to. A
 * condition holds a path, or `{types, default}`; a `types` beside the
 * conditions applies to each of them.
 */
function resolveCondition(entry, condition) {
  const target = entry[condition];
  if (typeof target === 'string') {
    return {runtime: target, types: entry.types};
  }
  return {runtime: target.default, types: target.types ?? entry.types};
}

describe('theme package module formats', () => {
  it('finds the published theme packages', () => {
    expect(THEMES.length).toBeGreaterThan(0);
  });

  for (const {name, manifest} of THEMES) {
    describe(name, () => {
      it('reads ./built, an ES module, as an ES module for import and require', () => {
        for (const condition of ['import', 'require']) {
          const {runtime} = resolveCondition(
            manifest.exports['./built'],
            condition,
          );
          expect(formatOf(runtime, manifest.type), condition).toBe('esm');
        }
      });

      it('reads the source entry in the format tsup writes for each condition', () => {
        const source = manifest.exports['.'];
        const imported = resolveCondition(source, 'import');
        const required = resolveCondition(source, 'require');
        expect(formatOf(imported.runtime, manifest.type)).toBe('esm');
        expect(formatOf(required.runtime, manifest.type)).toBe('cjs');
        expect(formatOf(manifest.main, manifest.type)).toBe('cjs');
        expect(manifest.module).toBe(imported.runtime);
      });

      it('gives each condition declarations in the format of its runtime file', () => {
        // TypeScript reads a declaration file in the format its name and the
        // package's type give it, and checks imports against that format.
        for (const [subpath, entry] of Object.entries(manifest.exports)) {
          for (const condition of ['import', 'require']) {
            if (typeof entry !== 'object' || !(condition in entry)) continue;
            const {runtime, types} = resolveCondition(entry, condition);
            if (types === undefined || !/\.[cm]?js$/.test(runtime)) continue;
            expect(
              formatOf(types, manifest.type),
              `${subpath} ${condition}: ${types} for ${runtime}`,
            ).toBe(formatOf(runtime, manifest.type));
          }
        }
      });
      it('publishes every file its export map points at', () => {
        // npm ships only what `files` lists, so a path outside it resolves to
        // nothing for consumers even though it exists in the repository.
        const included = manifest.files.filter(entry => !entry.startsWith('!'));
        const published = file => {
          const relative = file.replace(/^\.\//, '');
          return included.some(
            entry => relative === entry || relative.startsWith(`${entry}/`),
          );
        };
        const targets = [];
        const collect = value => {
          if (typeof value === 'string') targets.push(value);
          else if (value && typeof value === 'object') {
            Object.values(value).forEach(collect);
          }
        };
        collect(manifest.exports);
        expect(targets.filter(target => !published(target))).toEqual([]);
      });
    });
  }
});
