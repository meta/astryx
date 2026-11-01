// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright.perf.config.ts
 * @input Uses @playwright/test; reads the built Sandbox in apps/sandbox/out
 * @output The perf scenes, measured in desktop Chromium
 * @position Run nightly by .github/workflows/perf-nightly.yml, after
 *   `pnpm build && pnpm -F @astryxdesign/sandbox build`. Separate from
 *   playwright.config.ts (accessibility contracts) and
 *   playwright.interaction.config.ts (touch and animation proofs): a perf
 *   sample must not share the CPU with another browser, and its numbers are
 *   trend data, not pass/fail proofs.
 *
 *   pnpm build && pnpm -F @astryxdesign/sandbox build
 *   pnpm exec playwright install chromium
 *   pnpm exec playwright test --config playwright.perf.config.ts
 *   pnpm exec playwright test --config playwright.perf.config.ts --grep table
 */

import {defineConfig, devices} from '@playwright/test';

const isCI = (process.env.CI ?? '') !== '';

export default defineConfig({
  testDir: 'apps/sandbox/perf',
  testMatch: '**/*.perf.spec.ts',
  outputDir: 'test-results/perf-output',
  // Timing data: one browser at a time.
  workers: 1,
  fullyParallel: false,
  // A scene's samples run inside one test, each with a warm-up cycle; overlay
  // churn plays 150 open/close pairs per cycle.
  timeout: 6 * 60_000,
  forbidOnly: isCI,
  reporter: isCI ? [['list'], ['github']] : [['list']],
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
});
