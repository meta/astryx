// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright.config.ts
 * @input Uses @playwright/test
 * @output The touch presentation resolver's answers in real engines: Chromium
 *   as an Android phone (coarse pointer, no -webkit-touch-callout) and WebKit
 *   on a phone-sized touch screen
 * @position Self-contained config for packages/core/src/utils; run with
 *   `pnpm exec playwright test --config packages/core/src/utils/__tests__/browser/playwright.config.ts`.
 *   Where WebKit cannot launch on the host, run its project inside the
 *   official Playwright image (the repository mounted at the same path):
 *   `podman run --rm --network=host --ipc=host -v "$PWD:$PWD" -w "$PWD"
 *   mcr.microsoft.com/playwright:v1.61.1-noble node
 *   node_modules/@playwright/test/cli.js test --config <this file> --project webkit`
 */

import os from 'node:os';
import path from 'node:path';
import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: path.join(os.tmpdir(), 'astryx-touch-presentation-proof'),
  testMatch: ['*.browser.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  projects: [
    // Android Chrome: a finger, and an engine without -webkit-touch-callout.
    {name: 'chromium', use: {...devices['Pixel 7'], browserName: 'chromium'}},
    {
      name: 'webkit',
      use: {
        browserName: 'webkit',
        viewport: {width: 390, height: 844},
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
