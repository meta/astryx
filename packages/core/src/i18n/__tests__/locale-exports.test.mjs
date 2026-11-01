// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file locale-exports.test.mjs
 * @input The package's exports map, read through Node's own package
 *   resolution: the package's self-reference, which applies the same map a
 *   consumer's import does
 * @output Verifies the public locale surface: every whole catalog under
 *   `@astryxdesign/core/locales/<locale>.generated.js` resolves, and the
 *   per-namespace English slices under `locales/en/` do not — they are the
 *   package's own, rendered through the internal useComponentTranslator
 * @position Regression test for the `./locales/en/*` null export
 */

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '../../..');

/**
 * Resolve a specifier the way a consumer's bundler or Node would: through
 * the package's exports map. The package's own directory resolves its name
 * through that same map (a self-reference), so no other package is involved:
 * the docsite's server routes trace this package's files, and a path from
 * here into another directory would make them ship that whole directory.
 * `import.meta.resolve` consults the map only and
 * never reads the target, so a built `dist/` is not needed: a matching
 * pattern yields its target path, and a `null` target or no match is
 * ERR_PACKAGE_PATH_NOT_EXPORTED. Run in a fresh process so the test's own
 * module loader plays no part.
 */
function resolveFromConsumer(specifier) {
  const script = `
    try {
      console.log(JSON.stringify({ok: import.meta.resolve(${JSON.stringify(specifier)})}));
    } catch (error) {
      console.log(JSON.stringify({code: error.code}));
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      cwd: CORE_ROOT,
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `node exited ${result.status} (${result.signal ?? 'no signal'}): ${result.stderr}`,
    );
  }
  return JSON.parse(result.stdout.trim());
}

describe('the public locale surface of @astryxdesign/core', () => {
  it('resolves a whole catalog by locale', () => {
    expect(
      resolveFromConsumer('@astryxdesign/core/locales/en.generated.js').ok,
    ).toMatch(/\/dist\/i18n\/generated-locales\/en\.generated\.js$/);
    expect(
      resolveFromConsumer('@astryxdesign/core/locales/fr-FR.generated.js').ok,
    ).toMatch(/\/dist\/i18n\/generated-locales\/fr-FR\.generated\.js$/);
  });

  it('does not resolve a per-namespace English slice', () => {
    for (const namespace of ['button', 'pagination']) {
      expect(
        resolveFromConsumer(
          `@astryxdesign/core/locales/en/${namespace}.generated.js`,
        ),
      ).toEqual({code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
    }
  });
});
