// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright.config.ts
 * @input Uses @playwright/test
 * @output Chromium accessibility contracts and Chromium/WebKit keyboard proofs.
 * @position Run with `pnpm test:a11y-contract`. Deliberately separate from
 *   `pnpm test`: the Vitest projects must stay runnable from a cold clone with
 *   no browser installed, and the accessibility-tree and real-browser evidence
 *   layers cannot run without one.
 *
 * `docs/specs/AST-020/spec.md` puts it plainly: a DOM emulator cannot prove
 * focus navigation, computed accessibility-tree exposure, or engine state
 * transitions. Everything matched here is an expectation assigned to a layer
 * only a shipping engine can observe.
 *
 * The component bindings read stories out of a built Storybook, the same
 * artifact every other Chromium check in this repository uses. Build it first:
 *
 *   pnpm storybook:build
 *   pnpm exec playwright install chromium webkit
 *   pnpm test:a11y-contract
 *   pnpm exec playwright test BottomSheetKeyboard.a11y.browser.spec.ts
 *
 * Cross-browser specs use `.a11y.browser.spec.ts`; Chromium-only contracts keep
 * `.a11y.chromium.spec.ts`. The WebKit project runs only the former.
 *
 * Pull requests run a scoped selection of the same files with
 * `pnpm test:a11y-contract:pr`; each spec's `@pr-a11y` header lines decide when
 * (`.github/scripts/a11y-pr-contracts.mjs`). A new spec needs no workflow edit.
 *
 * SYNC: When a package gains an accessibility binding outside these globs, add
 *   its glob here and in `.github/scripts/a11y-pr-contracts.test.mjs`.
 */

import {defineConfig, devices} from '@playwright/test';

// GitHub Actions sets CI=true; some runners set it to an empty string. One
// definition, so `forbidOnly` and the reporter choice cannot disagree.
const isCI = (process.env.CI ?? '') !== '';

/**
 * Worker count for the contract run: `A11Y_CONTRACT_WORKERS`, default 1 when
 * unset or empty. Only a positive integer is accepted: Playwright would treat
 * a `NaN` count as zero workers and exit green without running a test.
 */
function contractWorkers(): number {
  const raw = process.env.A11Y_CONTRACT_WORKERS;
  const workers = raw ? Number(raw) : 1;
  if (!Number.isInteger(workers) || workers < 1) {
    throw new Error(
      `A11Y_CONTRACT_WORKERS must be a positive integer, got "${raw}"`,
    );
  }
  return workers;
}

export default defineConfig({
  testDir: '.',
  testMatch: [
    // The contract's own conforming/violating fixture proof.
    'internal/a11y-spec/src/**/*.chromium.spec.ts',
    // Component bindings.
    'packages/*/src/**/*.a11y.chromium.spec.ts',
    'packages/*/src/**/*.a11y.browser.spec.ts',
  ],
  // The contract mounts, focuses, and types into one page at a time, so a spec
  // file's tests run in order on one worker (`fullyParallel: false`). Workers
  // are separate processes, each with its own browser, so they share no
  // keyboard focus: more than one only spreads whole files across them. One
  // by default; the release job sets A11Y_CONTRACT_WORKERS.
  workers: contractWorkers(),
  fullyParallel: false,
  // Evidence captures photograph a whole state matrix in one test and take
  // 25-29 s with four workers sharing four cores, against Playwright's 30 s
  // default; a test that sets its own budget keeps it.
  timeout: 60_000,
  forbidOnly: isCI,
  reporter: isCI ? [['list'], ['github']] : [['list']],
  // One `use` block, on the project. Motion is NOT held here: neither
  // `use.reducedMotion` nor Chromium's `--force-prefers-reduced-motion` reaches
  // `matchMedia` in this Playwright version — both were measured returning
  // false. The specs call `holdMotionStill(page)` instead, which does work.
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {
      name: 'webkit',
      testMatch: ['packages/*/src/**/*.a11y.browser.spec.ts'],
      use: {...devices['Desktop Safari']},
    },
  ],
});
