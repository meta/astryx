// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental theme compile` is a copy of `astryx theme
 * build`: this suite runs every `theme build` suite again with the
 * experimental words, so the copy keeps the same behavior without copied
 * test files.
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

await import('./build-theme.adaptations.test.mjs');
await import('./build-theme.ascii-output.test.mjs');
await import('./build-theme.batch-report.test.mjs');
await import('./build-theme.color-scheme.test.mjs');
await import('./build-theme.data-tokens.test.mjs');
await import('./build-theme.flag-docs.test.mjs');
await import('./build-theme.font-warning.test.mjs');
await import('./build-theme.icons-specifier.test.mjs');
await import('./build-theme.import-path.test.mjs');
await import('./build-theme.multi.test.mjs');
await import('./build-theme.outside-project.test.mjs');
await import('./build-theme.path-safety.test.mjs');
await import('./build-theme.prose.test.mjs');
await import('./build-theme.registry.test.mjs');
await import('./build-theme.torn-read.test.mjs');
await import('./build-theme.variants.test.mjs');
await import('./build-theme.watch.test.mjs');
