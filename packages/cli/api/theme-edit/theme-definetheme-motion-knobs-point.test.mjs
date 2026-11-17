// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file defineTheme's motion knobs typed as a setting (`motion`, `tempo`,
 * `character`) point to how's answers for faster or slower motion, which
 * set the duration tokens.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-definetheme-motion-knobs-point-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} call */
const refusal = async call => {
  try {
    await call();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      message: String(err.message),
      lines: (err.suggestions ?? []).map(
        (/** @type {{name: string}} */ s) => s.name,
      ),
    };
  }
  throw new Error('expected a refusal');
};

describe('a motion knob typed as a setting', () => {
  it('points to how for faster or slower motion, the faster first for a tempo under 1', async () => {
    await themeEditNew('m1', {cwd});
    const r = await refusal(() =>
      themeEditSet('m1', 'motion', 'tempo 0.75', {cwd}),
    );
    expect(r.message).toContain(
      'the editor sets motion through the duration and ease tokens',
    );
    expect(r.lines).toEqual([
      expect.stringMatching(/ how 'faster motion'$/),
      expect.stringMatching(/ how 'slower motion'$/),
    ]);
    const slower = await refusal(() =>
      themeEditSet('m1', 'tempo', '1.3', {cwd}),
    );
    expect(slower.lines[0]).toMatch(/ how 'slower motion'$/);
  }, 240_000);
});
