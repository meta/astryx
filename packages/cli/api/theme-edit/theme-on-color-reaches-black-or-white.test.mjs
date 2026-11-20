// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text on a role fill: when neither the theme's white nor its
 * near-black reads at 4.5:1 on the fill, the end of the gray ramp on the
 * better side (black, or white) is used where it reads better, so the
 * editor never picks a text color that a darker gray would beat, and its
 * own pick makes no problem.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {parseColor, ratio} from './_color.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-on-ends-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('text on a mid-tone role fill', () => {
  it('a purple info that neither near-black nor white reads on gets black text, with no new problem', async () => {
    await themeEditNew('bakery', {
      cwd,
      like: 'neutral',
      settings: {accent: '#f4a7c0', neutral: '#8a7470'},
    });
    const {data} = /** @type {any} */ (
      await themeEditSet('bakery', 'info', '#9466c0', {cwd})
    );
    expect(
      (data.newProblems ?? []).map((/** @type {any} */ p) => p.problem ?? p),
    ).toEqual([]);
    const tokens = /** @type {Record<string, string>} */ (
      Object.fromEntries(
        /** @type {string[]} */ (data.changedTokens ?? [])
          .map(x => /^(--[\w-]+) \(light\): \S+ -> (#[0-9a-f]{6})/i.exec(x))
          .filter(Boolean)
          .map(m => [/** @type {any} */ (m)[1], /** @type {any} */ (m)[2]]),
      )
    );
    const on = tokens['--color-on-info'];
    expect(on).toMatch(/^#000000$/i);
    expect(
      ratio(
        /** @type {[number, number, number]} */ (parseColor(on)),
        /** @type {[number, number, number]} */ (parseColor('#9466c0')),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  }, 120_000);
});
