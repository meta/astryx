// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Per-side border asks in `how`: colors written one per side are one
 * border color with every side as written; a border said on several sides
 * ("top and sides", "left and right") is drawn on each side said, never
 * only the first; a side said transparent is that side's line drawn
 * see-through, never a fill or a fainter border; one side's border said
 * after a part's border is that part's side, never the theme's border
 * color; and the sides of a padding list are left to the spacing reader.
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

const T = 240_000;

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-border-sides-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The set lines of the first answer, without the command prefix. @param {string} q */
const first = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results?.[0]?.commands ?? [])
    .flatMap((/** @type {string} */ c) => c.split(' && '))
    .filter((/** @type {string} */ c) => / editor set /.test(c))
    .map((/** @type {string} */ c) => c.replace(/^.* editor set \S+ /, ''));
};

describe('per-side border asks', () => {
  it(
    'keeps colors written one per side as one border color',
    async () => {
      if (unbuilt) return;
      expect(
        await first('border-color: #eee #eee #ddd on hovered tabs'),
      ).toEqual(["border-color '#eee #eee #ddd' --on tab --state hover"]);
    },
    T,
  );

  it(
    'draws a border said on several sides on each of them',
    async () => {
      if (unbuilt) return;
      expect(
        await first(
          'selected tab: #dddddd border on top and sides, no bottom border',
        ),
      ).toEqual([
        "border-top '1px solid #dddddd' --on tab --state selected",
        "border-left '1px solid #dddddd' --on tab --state selected",
        "border-right '1px solid #dddddd' --on tab --state selected",
        'border-bottom none --on tab --state selected',
      ]);
      expect(await first('no border on the sides of cards')).toEqual([
        'border-left none --on card',
        'border-right none --on card',
      ]);
    },
    T,
  );

  it(
    'reads a side said transparent as that side drawn see-through',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'selected tab border #dddddd with transparent bottom',
      );
      expect(lines.at(-1)).toBe(
        "border-bottom '1px solid transparent' --on tab --state selected",
      );
      expect(lines.join('\n')).not.toMatch(/background/);
    },
    T,
  );

  it(
    "reads one side's border after a part's border as that part's side",
    async () => {
      if (unbuilt) return;
      const lines = await first('input border #dddddd, bottom border #999999');
      expect(lines.at(-1)).toBe("border-bottom '1px solid #999999' --on inputs");
      expect(lines.join('\n')).not.toMatch(/--color-border /);
    },
    T,
  );

  it(
    'leaves a list of padding sides to the spacing reader',
    async () => {
      if (unbuilt) return;
      const lines = await first('buttons padding top and bottom 8px');
      expect(lines.some(l => /^padding-bottom 8px/.test(l))).toBe(true);
    },
    T,
  );
});
