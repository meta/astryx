// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A border, corners, shadow, fill or outline asked of a part that draws no edge of its own,
 * whose controls sit side by side in a row of the same component that
 * frames them (a pager's control row around its page cells), go on that
 * row: one strip, never a border or corners on each control. A part whose
 * edges sit in no such row keeps its own answer.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-joined-row-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('p', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('a border or corners on a row of joined controls', () => {
  it('goes on the row that frames them, never on each control', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const border = await refusal(() =>
      themeEditSet('p', 'border', '1px solid #dddddd', {
        cwd,
        on: 'pagination',
      }),
    );
    expect(border.code).toBe('ERR_THEME_NO_EFFECT');
    expect(border.run).toHaveLength(1);
    expect(border.run[0]).toMatch(
      / set p border '1px solid #dddddd' --on pagination-list$/,
    );
    const corners = await refusal(() =>
      themeEditSet('p', 'border-radius', '3px', {cwd, on: 'pagination'}),
    );
    expect(corners.run.join('\n')).not.toMatch(/--on (pagination-item|button)/);
    expect(corners.run[0]).toMatch(/ how pagination-list$/);
    const shadow = await refusal(() =>
      themeEditSet('p', 'box-shadow', '0 1px 2px rgba(0, 0, 0, 0.05)', {
        cwd,
        on: 'pagination',
      }),
    );
    expect(shadow.run).toEqual([
      expect.stringMatching(
        / set p box-shadow '0 1px 2px rgba\(0, 0, 0, 0\.05\)' --on pagination-list$/,
      ),
    ]);
    for (const [thing, value] of [
      ['background-color', '#ffffff'],
      ['outline', '1px solid #dddddd'],
    ]) {
      const box = await refusal(() =>
        themeEditSet('p', thing, value, {cwd, on: 'pagination'}),
      );
      expect(box.run).toHaveLength(1);
      expect(box.run[0]).toMatch(/ --on pagination-list$/);
    }
    // Once the row has its border, the corners go on it.
    await themeEditSet('p', 'border', '1px solid #dddddd', {
      cwd,
      on: 'pagination-list',
    });
    const after = await refusal(() =>
      themeEditSet('p', 'border-radius', '3px', {cwd, on: 'pagination'}),
    );
    expect(after.run).toEqual([
      expect.stringMatching(/ set p border-radius 3px --on pagination-list$/),
    ]);
  }, 240_000);
});
