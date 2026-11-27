// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vitest.platform-only.config.mjs
 * @description Runs the Node test files whose cases only Windows or macOS can
 *   run, one per leg of the platform-only workflow: no workspace projects and
 *   no global setup, so a leg does not build Core, warm the theme cache or
 *   pack the CLI for tests that read none of them.
 * @position .github/workflows/platform-only-tests.yml. The files also run in
 *   the `node` project on Linux, where those cases skip.
 */

import {defineConfig} from 'vitest/config';
import {PLATFORM_ONLY} from './platform-only-cases.mjs';

export {PLATFORM_ONLY};

export default defineConfig({
  test: {
    include: PLATFORM_ONLY.map(entry => entry.file),
    environment: 'node',
    // The node project's limit, for slow runners.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
