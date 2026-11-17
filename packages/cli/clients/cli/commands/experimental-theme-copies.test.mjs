// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The experimental copies of `astryx theme list`, `add`, `remove`,
 * `use`, `targets` and `template`: this suite runs each
 * stable suite again with the experimental words, so the copies keep the
 * same behavior without copied test files.
 */

import {afterAll, expect, vi} from 'vitest';
import {
  toExperimental,
  toStableResult,
} from '../../../test-utils/experimental-theme-words.mjs';

vi.mock('../../../test-utils/run-cli.mjs', async importOriginal => {
  const real = /** @type {typeof import('../../../test-utils/run-cli.mjs')} */ (
    await importOriginal()
  );
  return {
    ...real,
    runCli: async (
      /** @type {string[]} */ args,
      /** @type {any} */ options,
    ) => {
      const words = toExperimental(args);
      if (words.includes('experimental')) experimentalRuns.count += 1;
      return toStableResult(await real.runCli(words, options));
    },
  };
});

/** How many CLI runs used the experimental words; vi.hoisted so the mock sees it. */
const experimentalRuns = vi.hoisted(() => ({count: 0}));

afterAll(() => {
  expect(experimentalRuns.count).toBeGreaterThan(0);
});

await import('./theme-add-lifecycle.test.mjs');
await import('./theme-list.behavior.test.mjs');
await import('./theme-targets.behavior.test.mjs');
await import('./theme-template.behavior.test.mjs');
