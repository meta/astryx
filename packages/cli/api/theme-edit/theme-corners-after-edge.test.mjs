// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Corners said before the edge the same ask gives a part that shows
 * no corners yet (a fill, border, shadow or outline) run after that edge,
 * so the whole answer keeps both: "focused links: 12px corners and a
 * shadow" writes the shadow, then the corners.
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
  cwd = makeLinkedFixture('astryx-theme-corners-after-edge-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('c', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The whole answer's set lines, in order. @param {string} q */
const whole = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'c'});
  const results = data.results ?? [];
  const r =
    results.find(x => /^all of it, in order/.test(x.text)) ?? results[0];
  return (r?.commands ?? [])
    .flatMap(c => c.split(' && '))
    .filter(c => / editor set /.test(c))
    .map(c => c.replace(/^.* editor set \S+ /, ''));
};

/** Each ask, and the part its corners and edge land on. @type {Array<[string, string]>} */
const ROWS = [
  [
    'the header with a #2563eb to #ffffff gradient and 12px corners',
    'app-shell-header',
  ],
  [
    'the header with a blue to white gradient and 12px corners',
    'app-shell-header',
  ],
  [
    'the header with a red to orange gradient and 12px corners',
    'app-shell-header',
  ],
  [
    'the header with a white to gray gradient and 12px corners',
    'app-shell-header',
  ],
  [
    'the header with a purple to pink gradient and 12px corners',
    'app-shell-header',
  ],
  ['links when disabled: a #0069d6 fill and 12px corners', 'link'],
  ['disabled links with a #0069d6 fill and 12px corners', 'link'],
  ['links when focused: 12px corners and a shadow', 'link'],
  ['focused links: 12px corners and a shadow', 'link'],
  ['focused links with 12px corners and a shadow', 'link'],
  ['links when active: 12px corners and a red border', 'link'],
  ['active links: 12px corners and a red border', 'link'],
  ['active links with 12px corners and a red border', 'link'],
  [
    'hovered checkboxes with a #0069d6 fill and 12px corners',
    'checkbox-indicator-check',
  ],
  [
    'hovered checkboxes: a #0069d6 fill and 12px corners',
    'checkbox-indicator-check',
  ],
  [
    'checkboxes when hovered: a #0069d6 fill and 12px corners',
    'checkbox-indicator-check',
  ],
];

describe('corners said with an edge the same ask gives the part', () => {
  for (const [q, part] of ROWS)
    it(`run after that edge: ${q}`, async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const sets = await whole(q);
      const on = new RegExp(`--on ${part}(?:\\s|$)`);
      const corners = sets.findIndex(
        x => /^(?:border-radius|corners) 12px /.test(x) && on.test(x),
      );
      const edge = sets.findIndex(
        x =>
          /^(?:background|border(?!-radius)|box-shadow|outline)/.test(x) &&
          on.test(x),
      );
      expect(corners, sets.join('\n')).toBeGreaterThan(-1);
      expect(edge, sets.join('\n')).toBeGreaterThan(-1);
      expect(corners, sets.join('\n')).toBeGreaterThan(edge);
    }, 240_000);

  it('keeps the said order of two corners steps moved past one edge', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const sets = await whole(
      'focused links: 12px corners, a 4px top left radius and a shadow',
    );
    const shadow = sets.findIndex(x => /^box-shadow .*--on link\b/.test(x));
    const all = sets.findIndex(x => /^border-radius 12px --on link\b/.test(x));
    const tl = sets.findIndex(x =>
      /^border-top-left-radius 4px --on link\b/.test(x),
    );
    expect(shadow, sets.join('\n')).toBeGreaterThan(-1);
    if (all >= 0 && tl >= 0) {
      expect(all, sets.join('\n')).toBeGreaterThan(shadow);
      expect(tl, sets.join('\n')).toBeGreaterThan(all);
    }
  }, 240_000);
});
