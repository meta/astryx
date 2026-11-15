// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sixty-third pass over `astryx experimental theme editor how`: a
 * padding amount ("50% bigger", "double", "150%") is an exact padding from
 * the one the part has now, never a CSS percent padding, and a step over an
 * exact padding moves it.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt63-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} q */
const first = async q => {
  const r = /** @type {any} */ (await themeEditHow(q, {cwd, theme: 't'}));
  return JSON.stringify(r.data);
};

describe('hunt63: how padding amounts', () => {
  it('a percent is a factor of the padding there now, never a CSS percent', async () => {
    for (const q of ['make card padding 50% bigger', 'card padding 150%']) {
      const out = await first(q);
      expect(out, q).not.toMatch(/set t padding '?1?50%/);
      expect(out, q).toMatch(/set t padding [^"]+ --on card/);
    }
  }, 240_000);

  it('double reads the token the card reads when the theme sets none', async () => {
    const out = await first('double the card padding');
    expect(out).toMatch(/padding on card: \S+ \(now \S+\)/);
    expect(out).not.toMatch(/spacing more/);
  }, 240_000);

  it('an exact unequal padding is scaled side by side; a step moves it too', async () => {
    await themeEditSet('t', 'padding', '4px 8px', {cwd, on: 'card'});
    expect(await first('double the card padding')).toMatch(
      /set t padding '8px 16px' --on card/,
    );
    const step = await first('more padding on cards');
    expect(step).toMatch(/set t padding '5px 10px' --on card/);
    expect(step).toMatch(/a step/);
  }, 240_000);
});
