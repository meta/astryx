// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright.config.ts
 * @input Uses @playwright/test; a production build of the docsite in .next
 * @output Chromium proofs for the docsite behaviors jsdom cannot observe.
 * @position Run from the repo root with `pnpm test:docsite-browser`, or from
 *   this directory with `pnpm exec playwright test`. Deliberately separate
 *   from `pnpm -F @astryxdesign/docsite test`: the Vitest suite must stay
 *   runnable from a cold clone with no browser and no build, and everything
 *   here needs both.
 *
 * The specs run against the PRODUCTION server. That is not a preference: the
 * playground preview only gets its opaque origin in production builds (see
 * PreviewStage.tsx), so the isolation these specs prove does not exist under
 * `next dev`. Build first:
 *
 *   pnpm -F @astryxdesign/docsite build
 *   pnpm exec playwright install chromium
 *   pnpm test:docsite-browser
 *
 * Outside CI an already-running `next start` on the port is reused, so a
 * server started by hand works too.
 *
 * The docs-prompt spec needs NEXT_PUBLIC_INTERNAL_DOCS_ORIGIN and
 * NEXT_PUBLIC_DOCS_ACCESS_CHECK_ORIGIN set for both the build and the run (CI
 * uses placeholder origins); without them it skips locally and fails in CI.
 *
 * SYNC: When the docsite gains another browser-only contract, add its spec
 * under e2e/.
 */

import {defineConfig, devices} from '@playwright/test';

// GitHub Actions sets CI=true; some runners set it to an empty string. One
// definition, so `forbidOnly` and the reporter choice cannot disagree.
const isCI = (process.env.CI ?? '') !== '';

// A port no other docsite process on a developer machine is likely to hold.
const port = Number(process.env.DOCSITE_E2E_PORT ?? 3233);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../test-results/docsite',
  testMatch: ['**/*.spec.ts'],
  // The playground specs drive one preview frame through reloads and hostile
  // navigations; parallel workers would only add timing noise to a lifecycle
  // that is already asynchronous end to end.
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCI,
  reporter: isCI ? [['list'], ['github']] : [['list']],
  // The preview loads the TypeScript compiler before it can render anything,
  // and each recovery is a full document lifecycle.
  timeout: 90_000,
  expect: {timeout: 30_000},
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec next start --port ${port}`,
    url: `${baseURL}/playground/preview`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
