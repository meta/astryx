// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` says an unknown word held by a place ("the zorp in
 * cards") and writes nothing, as it does one between a part and what
 * changes; a known word there still answers.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-how-c-unknown-place-',
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
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results = data.results ?? [];
  return {
    all: results.flatMap(r => r.commands).filter(c => / editor set /.test(c)),
    text: results.map(r => r.text).join('\n'),
  };
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 300_000;

describe('an unknown word held by a place', () => {
  it.each([
    ['make the zorp in cards red', 'zorp'],
    ['make the zorps on buttons rounder', 'zorp'],
  ])(
    '%s: said, nothing written',
    async (q, word, test) => {
      needsBases(test);
      const r = await answer(q);
      expect(r.all).toEqual([]);
      expect(r.text).toMatch(new RegExp(`no part or word called "${word}"`));
    },
    T,
  );
  it.each([
    'make the links in cards red',
    'make the padding in cards bigger',
    'make the border on inputs red',
  ])(
    '%s: a known word still answers',
    async (q, test) => {
      needsBases(test);
      expect((await answer(q)).all.length).toBeGreaterThan(0);
    },
    T,
  );
});
