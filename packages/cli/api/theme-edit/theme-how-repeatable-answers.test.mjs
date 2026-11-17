// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` gives the same answer to the same ask on the same
 * theme and Core, run after run, with its part-data cache fresh or warm.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {themeCacheRoot} from './_project.mjs';
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
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-how-repeatable-answers-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const commands = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results ?? []).map(r => r.commands);
};

describe('the same ask', () => {
  it.each([
    'the tooltips are too dark, I hate it',
    'make the card background darker',
    'page background is too blue, make it gray',
  ])(
    '%s: the same answer, cache fresh or warm',
    async (q, test) => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const root = themeCacheRoot(cwd);
      if (root) fs.rmSync(root, {recursive: true, force: true});
      const fresh = await commands(q);
      const warm = await commands(q);
      if (root) fs.rmSync(root, {recursive: true, force: true});
      const freshAgain = await commands(q);
      expect(warm).toEqual(fresh);
      expect(freshAgain).toEqual(fresh);
    },
    300_000,
  );
});
