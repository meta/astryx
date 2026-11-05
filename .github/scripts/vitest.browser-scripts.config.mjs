// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vitest.browser-scripts.config.mjs
 * @description Runs one browser-gated script test in a workflow step that has
 *   installed Chromium: no workspace projects and no global setup, so the step
 *   does not rebuild Core for a test that never imports it.
 * @position The CLI smoke test's CDN page render step.
 */

import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['.github/scripts/**/*.browser.test.mjs'],
    // The node project's limit, for slow runners.
    testTimeout: 30_000,
  },
});
