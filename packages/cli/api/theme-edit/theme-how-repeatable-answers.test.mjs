// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` gives the same answer to the same ask on the same
 * theme and Core, run after run, with its part-data cache fresh or warm.
 *
 * The asks run as one round each time: the part data a round builds is
 * the project's, the same whichever ask builds it, so a cache cleared
 * before a round is fresh for that whole round. The rounds run in
 * different orders, so each end of the list is asked first on a fresh
 * cache once.
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

const ASKS = [
  'the tooltips are too dark, I hate it',
  'make the card background darker',
  'page background is too blue, make it gray',
];

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';
/** Each ask's answers: cache fresh, warm, and fresh again. */
/** @type {Map<string, {fresh: unknown, warm: unknown, freshAgain: unknown}>} */
const answers = new Map();

/** @param {string} q */
const commands = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results ?? []).map(r => r.commands);
};

const clearCache = () => {
  const root = themeCacheRoot(cwd);
  if (root) fs.rmSync(root, {recursive: true, force: true});
};

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-how-repeatable-answers-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  /** @type {Record<string, Record<string, unknown>>} */
  const by = Object.fromEntries(ASKS.map(q => [q, {}]));
  clearCache();
  for (const q of ASKS) by[q].fresh = await commands(q);
  for (const q of ASKS) by[q].warm = await commands(q);
  clearCache();
  for (const q of [...ASKS].reverse()) by[q].freshAgain = await commands(q);
  for (const q of ASKS)
    answers.set(
      q,
      /** @type {{fresh: unknown, warm: unknown, freshAgain: unknown}} */ (
        by[q]
      ),
    );
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('the same ask', () => {
  it.each(ASKS)('%s: the same answer, cache fresh or warm', (q, test) => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const a = answers.get(q);
    expect(a?.fresh).toBeDefined();
    expect(a?.warm).toEqual(a?.fresh);
    expect(a?.freshAgain).toEqual(a?.fresh);
  });
});
