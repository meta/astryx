// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Loads a test's code under test natively, as the CLI itself loads, and
 * stubs a Node built-in for that code.
 *
 * @input The test file's `import.meta.url`; a built-in's name and stubs.
 * @output A `require` that resolves from the test file and loads ES modules
 *   with Node's own loader; a function that puts a stubbed built-in back.
 * @position Test helper for a test whose code under test loads many modules:
 *   the docs catalog, or fresh fixture modules. `native-require.test.mjs`
 *   checks every test that uses it.
 */

import {createRequire, syncBuiltinESMExports} from 'node:module';

/**
 * A `require` for the test file at `fromUrl`. The modules it loads, and every
 * module they import, load as Node loads them.
 *
 * SYNC: through Vitest, each module that code under test loads is one request
 * to Vitest's main process. The docs catalog loads about 1,300 modules, so the
 * concurrent files of a full run wait there for seconds. Vitest's mocks and
 * module resets do not reach a module that loads natively. So a test that
 * uses this helper calls none of them, and `native-require.test.mjs` checks
 * that. It stubs a Node built-in with {@link stubBuiltin}. Each test file
 * runs in a process of its own: the forks pool, with `isolate` on. So a
 * native module never carries state from one file to the next. With
 * `isolate` off, these files would share the CLI's module state.
 * @param {string} fromUrl the test file's `import.meta.url`
 * @returns {NodeJS.Require}
 */
export function requireNatively(fromUrl) {
  return createRequire(fromUrl);
}

/**
 * Replaces exports of the Node built-in `name`, for natively loaded code too,
 * until the returned function puts them back. A test that loads natively
 * stubs a built-in this way, not with `vi.mock`.
 *
 * The stubs go on the built-in's one module object, which every loader
 * shares. Node then copies them to the built-in's ES module exports, so an
 * `import {spawnSync} from 'node:child_process'` sees them too. They apply
 * to the whole test process, the runner's own code included, until restored.
 * So a stub passes through each call it does not target. It relies on each
 * test file running in a process of its own, as {@link requireNatively}
 * does.
 * @param {string} name a built-in, such as `node:child_process`
 * @param {(real: Record<string, any>) => Record<string, unknown>} stubs the
 *   replacements, by export name, given the built-in's own exports
 * @returns {() => void} puts the built-in's own exports back
 */
export function stubBuiltin(name, stubs) {
  /** @type {Record<string, any>} */
  const builtin = createRequire(import.meta.url)(name);
  const replacements = stubs({...builtin});
  // Some exports are getters, so each is redefined and later put back whole.
  const own = Object.keys(replacements).map(
    key =>
      /** @type {const} */ ([
        key,
        Object.getOwnPropertyDescriptor(builtin, key),
      ]),
  );
  for (const [key, value] of Object.entries(replacements)) {
    Object.defineProperty(builtin, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  syncBuiltinESMExports();
  return () => {
    for (const [key, descriptor] of own) {
      if (descriptor) Object.defineProperty(builtin, key, descriptor);
      else delete builtin[key];
    }
    syncBuiltinESMExports();
  };
}
