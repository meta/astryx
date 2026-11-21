// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A text color and a fill both typed as solid values are written as
 * typed, with how they read: a pair just under 4.5:1 says its ratio cut
 * down (4.49:1), never rounded up to read as meeting it.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-typed-pair-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('tp', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a typed text and fill pair', () => {
  it.each([['#0374e8'], ['#048858']])(
    'just under 4.5:1 (%s on white) reads 4.49:1, never 4.50:1',
    async text => {
      const {data} = /** @type {any} */ (
        await themeEditHow(`code ${text} text on #ffffff`, {cwd, theme: 'tp'})
      );
      const said = JSON.stringify(data.results ?? []);
      expect(said).toContain('4.49:1, under the 4.5:1 text needs');
      expect(said).not.toContain('4.50:1');
    },
    120_000,
  );
});
