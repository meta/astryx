// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Helpers the `experimental theme` test files share: a refusal read
 * as code, message and suggested commands, file reads under the fixture
 * project, and the package.json of a fixture app whose template pages can
 * be added.
 *
 * @position test-utils — used by api/theme-edit/*.test.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * What a refused command says: its code, message and the commands it
 * suggests. Throws when `fn` is not refused.
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<{code: string, message: string, run: string[]}>}
 */
export async function refusal(fn) {
  try {
    await fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      code: err.code,
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

/**
 * Reads under the fixture project, which a test file makes in `beforeAll`.
 * @param {() => string} root the project folder, read at each call
 */
export function projectFiles(root) {
  return {
    /** @param {string} rel */
    read: rel => fs.readFileSync(path.join(root(), rel), 'utf8'),
    /** @param {string} rel */
    exists: rel => fs.existsSync(path.join(root(), rel)),
  };
}

/**
 * The package.json of a fixture app that names the packages the template
 * pages import, so ranked pages can be added.
 * @param {{stylex?: boolean, packageManager?: string}} [opts] `stylex`:
 *   name the StyleX runtime too; `packageManager`: the field, which makes
 *   suggested install commands the same whatever runs the tests
 */
export function appPackages(opts = {}) {
  return {
    name: 'app',
    private: true,
    type: 'module',
    ...(opts.packageManager ? {packageManager: opts.packageManager} : {}),
    dependencies: {
      '@heroicons/react': '*',
      ...(opts.stylex ? {'@stylexjs/stylex': '*'} : {}),
      'lucide-react': '*',
      recharts: '*',
    },
  };
}
