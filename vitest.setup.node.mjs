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
 */

import Module from 'node:module';

if (process.env.NODE_PATH !== undefined) {
  delete process.env.NODE_PATH;
  /** @type {any} */ (Module)._initPaths();
}
