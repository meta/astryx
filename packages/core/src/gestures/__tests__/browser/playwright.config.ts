// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright.config.ts
 * @input Uses @playwright/test
 * @output The gesture system's browser proof on a phone-sized touch screen,
 *   in Chromium (touch input through CDP) and WebKit (its own input command)
 * @position Both-engine config for packages/core/src/gestures (CI runs the
 *   same specs in Chromium through playwright.interaction.config.ts); run with
 *   `pnpm exec playwright test --config packages/core/src/gestures/__tests__/browser/playwright.config.ts`.
 *   Where WebKit cannot launch on the host, run its project inside the
 *   official Playwright image (the repository mounted at the same path):
 *   `podman run --rm --network=host --ipc=host -v "$PWD:$PWD" -w "$PWD"
 *   mcr.microsoft.com/playwright:v1.61.1-noble node
 *   node_modules/@playwright/test/cli.js test --config <this file> --project webkit`
 */

import os from 'node:os';
import path from 'node:path';
import {defineConfig, devices} from '@playwright/test';

const phone = {
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
} as const;

export default defineConfig({
  testDir: '.',
  // Traces and screenshots of failures stay out of the source tree.
  outputDir: path.join(os.tmpdir(), 'astryx-gesture-proof'),
  testMatch: ['*.browser.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        ...phone,
      },
    },
    {name: 'webkit', use: {browserName: 'webkit', ...phone}},
  ],
});
