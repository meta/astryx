// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright.interaction.config.ts
 * @input Uses @playwright/test
 * @output Touch interaction and animation proofs on a phone-sized touch
 *   screen, in Chromium and WebKit.
 * @position Run with `pnpm test:interaction`; filmstrips only with
 *   `pnpm storyboards`. Separate from `pnpm test` (no browser needed there) and
 *   from playwright.config.ts (accessibility contracts on desktop profiles).
 *
 * Specs are named `*.interaction.browser.spec.ts` and read stories from a
 * built Storybook, like the accessibility specs:
 *
 *   pnpm storybook:build
 *   pnpm exec playwright install chromium webkit
 *   pnpm test:interaction --project chromium
 *   pnpm test:interaction harness.interaction.browser.spec.ts
 *
 * A spec that needs Chromium-only evidence (CDP tracing, scripted touch
 * timestamps) skips itself in WebKit with the reason; see the harness README.
 * Where WebKit cannot launch on the host (missing system libraries on some
 * Linux distributions), internal/interaction-harness/scripts/webkit-container.mjs
 * runs the WebKit project inside the official Playwright image.
 *
 * SYNC: Keep the phone profile here equal to `phone` in
 *   internal/interaction-harness/src/story.ts.
 */

import {defineConfig} from '@playwright/test';

// The phone: an iPhone 17 Pro in Safari (402 × 874 pt screen, 402 × 714 pt
// page with the toolbars shown, 3 device px per point), measured on the iOS
// 26.2 simulator. Inline rather than imported: the config loads as CommonJS and
// the harness package is ESM.
const phone = {
  viewport: {width: 402, height: 714},
  screen: {width: 402, height: 874},
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
} as const;

const isCI = (process.env.CI ?? '') !== '';

function workers(): number {
  const raw = process.env.INTERACTION_WORKERS;
  const count = raw ? Number(raw) : 1;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `INTERACTION_WORKERS must be a positive integer, got "${raw}"`,
    );
  }
  return count;
}

export default defineConfig({
  testDir: '.',
  testMatch: [
    'internal/interaction-harness/src/**/*.interaction.browser.spec.ts',
    'packages/*/src/**/*.interaction.browser.spec.ts',
  ],
  // Playwright wipes its output directory per run; evidence (storyboards,
  // curve traces) goes to test-results/interaction-evidence instead.
  outputDir: 'test-results/interaction-output',
  // Frame evidence measures timing: one worker by default, so a proof never
  // shares the CPU with another browser.
  workers: workers(),
  fullyParallel: false,
  timeout: 60_000,
  forbidOnly: isCI,
  reporter: isCI ? [['list'], ['github']] : [['list']],
  projects: [
    {name: 'chromium', use: {browserName: 'chromium', ...phone}},
    {name: 'webkit', use: {browserName: 'webkit', ...phone}},
  ],
});
