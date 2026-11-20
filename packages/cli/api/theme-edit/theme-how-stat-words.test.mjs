// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads words near the `stat` part name as themselves:
 * "state", "states", "status", "start" and "stays" never name the Stat
 * part, and no near miss is corrected to it.
 *
 * @position api/theme-edit — tests
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
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-stat-words-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Everything `how` prints for a question, as one string. @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return JSON.stringify(data);
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

describe('words one letter from the stat part', () => {
  it.each([
    'make the hover states darker',
    'make the error state red',
    'brighter status colors',
    'start over',
    'make the stars gold',
    'the sidebar stays white',
  ])('"%s" never names the Stat part', async (q, test) => {
    needsBases(test);
    const text = await answer(q);
    expect(text).not.toMatch(/--on stat\b/);
    expect(text).not.toMatch(/\bstats?\b/);
  });
});
