// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Setup for every file in the `node` Vitest project.
 * @position vitest.config.ts: the `node` project's `setupFiles`.
 *
 * A test's fixture project resolves packages only from its own folders, as a
 * user's project does. pnpm's bin shim for Vitest puts the workspace's package
 * store on NODE_PATH, and Node reads NODE_PATH once, when the process starts.
 * A fixture that installs no theme would then find the workspace's theme
 * packages once another test in the run had built them. So each worker clears
 * NODE_PATH and reloads Node's module search paths, and the processes a test
 * starts inherit the cleared environment.
 *
 * The theme editor's page drawing (every component rendered on the server,
 * seconds a page) is stood in for in every file, and everything around it
 * runs as it does for real (test-utils/theme-render-stub.mjs). A file whose
 * assertions read drawn pages or pictures calls realRenders(true) at its top;
 * each file starts back at the default. THEME_EDIT_REAL_RENDERS=1 draws for
 * real everywhere.
 *
 * A render fetches the https images a page names. A test reaches no network:
 * a render in a test file sees a network that answers nothing, unless the
 * test passes its own fetch (remote-images.test.mjs does), so a template that
 * names a remote image renders the same on every machine.
 */

import Module from 'node:module';
import {vi} from 'vitest';
import {resetRenders} from './packages/cli/test-utils/theme-render-stub.mjs';

vi.mock('./packages/cli/api/theme-edit/_parts.mjs', async importOriginal =>
  (await import('./packages/cli/test-utils/theme-render-stub.mjs')).stubDrawing(
    await importOriginal(),
  ),
);
resetRenders();

vi.mock(
  './packages/cli/foundation/render/remote-images.mjs',
  async importOriginal => {
    const actual =
      /** @type {typeof import('./packages/cli/foundation/render/remote-images.mjs')} */ (
        await importOriginal()
      );
    return {
      ...actual,
      /** @param {Parameters<typeof actual.remoteImages>[0]} [options] */
      remoteImages: options =>
        actual.remoteImages({
          fetch: () => Promise.reject(new TypeError('fetch failed')),
          ...options,
        }),
    };
  },
);

if (process.env.NODE_PATH !== undefined) {
  delete process.env.NODE_PATH;
  /** @type {any} */ (Module)._initPaths();
}
