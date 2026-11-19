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

/** What every answer says it applied. @param {string} q */
const said = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n');
};

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
      ).toEqual([
        "border-color '#eee #eee #ddd' --on tab --state hover --mode light",
      ]);
      expect(await first('tabs with a #eee #eee #ddd border')).toEqual([
        "border-color '#eee #eee #ddd' --on tab --mode light",
      ]);
      expect(await said('tabs with a #eee #eee #ddd border')).toContain(
        'one per side as written (top, then left and right, then bottom)',
      );
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
      expect(
        await said('selected tab: #dddddd border on top and sides'),
      ).toContain('a border on its top, left and right');
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
      expect(
        await said('selected tab border #dddddd with transparent bottom'),
      ).toContain('read "transparent" as that side\'s line');
    },
    T,
  );

  it(
    "reads one side's border after a part's border as that part's side",
    async () => {
      if (unbuilt) return;
      const lines = await first('input border #dddddd, bottom border #999999');
      expect(lines.at(-1)).toBe(
        "border-bottom '1px solid #999999' --on inputs",
      );
      expect(lines.join('\n')).not.toMatch(/--color-border /);
      expect(await said('input border #dddddd, bottom border #999999')).toMatch(
        /read "bottom border #999999" as inputs' bottom border/,
      );
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

  it(
    'keeps a padding list beside a border word whole',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'cards with a #dddddd border, buttons padding top and bottom 8px',
      );
      expect(lines).toContainEqual(
        expect.stringMatching(/^padding-bottom 8px --on button$/),
      );
    },
    T,
  );

  it(
    'reads "on top of" as a place, never a side',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'make the header transparent on top of the hero',
      );
      expect(lines.join('\n')).not.toMatch(/border-top/);
      expect(lines.join('\n')).toMatch(/background-color transparent/);
    },
    T,
  );

  it(
    'leaves a slightly see-through side to the fainter border',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'inputs with a slightly transparent bottom border',
      );
      expect(lines.join('\n')).not.toMatch(/solid transparent/);
    },
    T,
  );

  it(
    'writes a light run of per-side colors for the light mode only',
    async () => {
      if (unbuilt) return;
      expect(await first('card border #eee #eee #ddd')).toEqual([
        "border-color '#eee #eee #ddd' --on card --mode light",
      ]);
      expect(
        await first(
          'a rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25) border on primary buttons',
        ),
      ).toEqual([
        "border-color 'rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25)' --on button --when variant:primary",
      ]);
    },
    T,
  );

  it(
    'draws every side of a comma list, and only the sides said',
    async () => {
      if (unbuilt) return;
      expect(
        await first('cards with a #dddddd border on top, left and right'),
      ).toEqual([
        "border-top '1px solid #dddddd' --on card",
        "border-left '1px solid #dddddd' --on card",
        "border-right '1px solid #dddddd' --on card",
      ]);
      expect(
        await first('inputs with only a top and bottom border #999999'),
      ).toEqual([
        'border none --on inputs',
        "border-top '1px solid #999999' --on inputs",
        "border-bottom '1px solid #999999' --on inputs",
      ]);
    },
    T,
  );

  it(
    'leaves a padding side list beside a border word to the padding',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'inputs with a #cccccc border and padding top and bottom 6px',
      );
      expect(lines.some(l => /^padding-top .* --on inputs$/.test(l))).toBe(
        true,
      );
      expect(lines).toContain('padding-bottom 6px --on inputs');
    },
    T,
  );

  it(
    'keeps any graded transparent side a fainter border, never an invisible line',
    async () => {
      if (unbuilt) return;
      for (const w of ['barely', 'very', 'fairly', 'subtly', 'lightly'])
        expect(
          (await first(`inputs with a ${w} transparent bottom border`)).join(
            '\n',
          ),
          w,
        ).not.toMatch(/solid transparent/);
    },
    T,
  );

  it(
    'draws a border on each side said with no color, width or style',
    async () => {
      if (unbuilt) return;
      const lines = await first('cards with a border on top and bottom');
      expect(lines.map(l => l.split(' ')[0])).toEqual([
        'border-top',
        'border-bottom',
      ]);
    },
    T,
  );

  it(
    'keeps color functions said after border one per side',
    async () => {
      if (unbuilt) return;
      expect(
        await first(
          'card border rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25)',
        ),
      ).toEqual([
        "border-color 'rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25)' --on card",
      ]);
    },
    T,
  );
});
