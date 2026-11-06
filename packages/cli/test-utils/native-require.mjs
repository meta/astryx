// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Loads a test's code under test natively, as the CLI itself loads.
 *
 * @input The test file's `import.meta.url`.
 * @output A `require` that resolves from the test file and loads ES modules
 *   with Node's own loader.
 * @position Test helper for a test whose code under test reads the docs
 *   catalog. `native-require.test.mjs` checks every test that uses it.
 */

import {createRequire} from 'node:module';

/**
 * A `require` for the test file at `fromUrl`. The modules it loads, and every
 * module they import, load as Node loads them.
 *
 * SYNC: through Vitest, each module that code under test loads is one request
 * to Vitest's main process. The docs catalog loads about 1,300 modules, so the
 * concurrent files of a full run wait there for seconds. Vitest's mocks and
 * module resets do not reach a module that loads natively. So a test that
 * uses this helper calls none of them, and `native-require.test.mjs` checks
 * that. Each test file runs in a process of its own: the forks pool, with
 * `isolate` on. So a native module never carries state from one file to the
 * next. With `isolate` off, these files would share the CLI's module state.
 * @param {string} fromUrl the test file's `import.meta.url`
 * @returns {NodeJS.Require}
 */
export function requireNatively(fromUrl) {
  return createRequire(fromUrl);
}
