// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A bar's height reaches the row it holds. A height set on the app's
 * header makes the top nav inside it (the part map's one bar row, reached
 * through the layout region that draws no box) fill the bar with no
 * vertical padding of its own, so the nav's items center in the bar; a
 * value the theme gives the nav itself stays; undo takes the reach back;
 * and a part inside the row taller than the bar is a problem `set` and
 * `show` name, with the line that makes it fit.
 */

import * as fs from 'node:fs';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {sizePx, themeFiles} from './_settings.mjs';
import {barRows, partHeightPx} from './_parts.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-bar-height-row-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('b', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The built theme's rule blocks for a part. @param {string} part */
const built = part => {
  const js = fs.readFileSync(themeFiles(cwd, 'b').js, 'utf8');
  const at = js.indexOf(`"${part}": {`);
  if (at < 0) return '';
  return js.slice(at, js.indexOf('\n    }', at));
};

/** Every line a result says. @param {any} r */
const said = r => JSON.stringify(r);

describe("a bar's height", () => {
  it(
    'reaches the top nav in the header: it fills the bar with no padding of its own',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('b', 'height', '40px', {
          cwd,
          on: 'app-shell-header',
        })
      ).data;
      const nav = built('top-nav');
      expect(nav).toMatch(/"paddingBlock": "0"/);
      expect(nav).toMatch(/"alignContent": "center"/);
      expect(nav).toMatch(
        /"height": "calc\(40px - env\(safe-area-inset-top, ?0px\)\)"/,
      );
      expect(said(r)).toMatch(
        /height 40px on app-shell-header reaches top-nav, the row inside it/,
      );
    },
    T,
  );

  it(
    'leaves items that fit unflagged, and names one that hangs out with the line that fits it',
    async () => {
      await themeEditSet('b', 'line-height', '19px', {cwd, on: 'top-nav-item'});
      const fits = /** @type {any} */ (
        await themeEditSet('b', 'padding', '10px 10px 11px', {
          cwd,
          on: 'top-nav-item',
        })
      ).data;
      expect(said(fits)).not.toMatch(/hangs out of the bar/);
      const tall = /** @type {any} */ (
        await themeEditSet('b', 'padding', '16px 10px', {
          cwd,
          on: 'top-nav-item',
        })
      ).data;
      const p = /** @type {Array<{problem: string, fix: string | null}>} */ (
        tall.newProblems
      ).find(x => /hangs out of the bar/.test(x.problem));
      expect(p?.problem).toMatch(
        /top-nav-item is 51px tall, taller than the 40px app-shell-header leaves for top-nav/,
      );
      expect(p?.fix).toMatch(/set b padding-block 10px --on top-nav-item$/);
      const shown = /** @type {any} */ (await themeEditShow('b', {cwd})).data;
      expect(said(shown.openProblems)).toMatch(
        /top-nav-item is 51px tall.*hangs out of the bar/,
      );
      await themeEditUndo('b', {cwd});
    },
    T,
  );

  it(
    'keeps a padding the theme gives the nav itself',
    async () => {
      await themeEditSet('b', 'padding-block', '2px', {cwd, on: 'top-nav'});
      const nav = built('top-nav');
      expect(nav).toMatch(/"paddingBlock": "2px"/);
      expect(nav).not.toMatch(/"paddingBlock": "0"/);
      expect(nav).toMatch(/"height": "calc\(40px/);
      await themeEditUndo('b', {cwd});
    },
    T,
  );

  it(
    'with --only is saved without it, and says so; a saved one reads as absent',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('b', 'height', '48px', {
          cwd,
          on: 'app-shell-header',
          only: true,
        })
      ).data;
      // (A bar spreads through no group: --only changes nothing there.)
      expect(said(r)).toMatch(/saved without it/);
      expect(built('top-nav')).toMatch(/calc\(48px/);
      const saved = () =>
        JSON.parse(
          fs.readFileSync(themeFiles(cwd, 'b').settings, 'utf8'),
        ).settings.find(
          (/** @type {any} */ x) =>
            x.on === 'app-shell-header' &&
            x.thing === 'height' &&
            x.value === '48px',
        );
      expect(saved()).not.toHaveProperty('only');
      // A saved one (as another editor saved it) reads as absent, said.
      const file = themeFiles(cwd, 'b').settings;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const x of data.settings)
        if (x.on === 'app-shell-header' && x.value === '48px') x.only = true;
      fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
      const shown = /** @type {any} */ (await themeEditShow('b', {cwd})).data;
      expect(said(shown)).toMatch(
        /was saved with only, which changes nothing there/,
      );
      expect(built('top-nav')).toMatch(/calc\(48px/);
      // (A step back, so the later tests' steps count as before.)
      await themeEditUndo('b', {cwd});
    },
    T,
  );

  it(
    "reaches only a bar, from a length: never a list's items, a menu's divider, a trigger or an avatar, nor a keyword height",
    async () => {
      for (const [prop, value, on] of [
        ['padding', '12px', 'dropdown-menu'],
        ['height', '600px', 'side-nav'],
        ['height', '300px', 'context-menu'],
        ['height', '200px', 'collapsible'],
        ['height', '64px', 'avatar'],
        ['height', 'auto', 'app-shell-header'],
        ['height', 'fit-content', 'app-shell-header'],
      ]) {
        const r = /** @type {any} */ (
          await themeEditSet('b', prop, value, {cwd, on})
        ).data;
        expect(said(r)).not.toMatch(/the row inside it/);
        expect(said(r)).not.toMatch(/hangs out of the bar/);
        await themeEditUndo('b', {cwd});
      }
    },
    T,
  );

  it(
    'goes back with the height',
    async () => {
      // (The two item settings left, then the height.)
      for (let i = 0; i < 3; i++) await themeEditUndo('b', {cwd});
      expect(built('top-nav')).not.toMatch(/calc\(40px/);
    },
    T,
  );

  it(
    'with --only is saved without it in any spelling of the property',
    async () => {
      for (const thing of ['Height', 'paddingBlock']) {
        const r = /** @type {any} */ (
          await themeEditSet('b', thing, thing === 'Height' ? '48px' : '4px', {
            cwd,
            on: 'app-shell-header',
            only: true,
          })
        ).data;
        expect(said(r)).toMatch(/saved without it/);
        await themeEditUndo('b', {cwd});
      }
    },
    T,
  );

  it(
    'is no padding with no vertical side',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('b', 'padding', '0 24px', {
          cwd,
          on: 'app-shell-header',
        })
      ).data;
      expect(said(r)).not.toMatch(/the row inside it/);
      expect(built('top-nav')).not.toMatch(/"paddingBlock": "0"/);
      await themeEditUndo('b', {cwd});
    },
    T,
  );

  it(
    'in two bars that hold the same row, writes the reach only where their heights agree, and says so',
    async () => {
      // (The top nav sits in the app's header and in a layout header.)
      const lone = /** @type {any} */ (
        await themeEditSet('b', 'height', '72px', {cwd, on: 'layout-header'})
      ).data;
      expect(said(lone)).toMatch(
        /top-nav takes this in every bar that holds it \([^)]*app-shell-header[^)]*\)/,
      );
      const both = /** @type {any} */ (
        await themeEditSet('b', 'height', '48px', {
          cwd,
          on: 'app-shell-header',
        })
      ).data;
      expect(said(both)).toMatch(/as they differ, it takes neither/);
      expect(built('top-nav')).not.toMatch(/calc\((48|72)px/);
      await themeEditUndo('b', {cwd});
      await themeEditUndo('b', {cwd});
    },
    T,
  );
});

describe("the part map's bar facts", () => {
  /** @param {Record<string, Record<string, string>>} at @param {string[]} [contains] */
  const rec = (at, contains = []) =>
    /** @type {any} */ ({
      at: Object.fromEntries(
        Object.entries(at).map(([k, v]) => [k, {always: v}]),
      ),
      contains,
    });
  const row = {display: 'flex', 'align-items': 'center', width: '100%'};

  it('finds a row through a frame, never through a part with a size of its own or one listed in it, and names every row a holder has', () => {
    const map = {
      bar: rec({height: '40px'}, ['frame', 'nav', 'item', 'card', 'inner']),
      frame: rec({'border-bottom-width': '1px'}, ['nav', 'item']),
      nav: rec(row, ['item', 'heading']),
      item: rec({'padding-block': '6px', 'line-height': '20px'}),
      card: rec({padding: '12px'}, ['inner']),
      inner: rec(row, ['icon', 'text']),
      two: rec({}, ['nav', 'inner']),
      menu: {...rec({padding: '4px'}, ['nav']), listed: ['nav']},
      trigger: {...rec(row, ['icon', 'text']), tags: ['button']},
      lone: rec(row, ['icon']),
      holds: rec({}, ['trigger', 'lone']),
    };
    expect(barRows(map, 'bar')).toEqual(['nav']);
    expect(barRows(map, 'menu')).toEqual([]);
    expect(barRows(map, 'holds')).toEqual([]);
    expect(barRows(map, 'two')).toEqual(['nav', 'inner']);
  });

  it("measures a part's height from its padding, borders and line, the theme's own values first", () => {
    const map = {
      item: rec({
        'padding-block': 'var(--s)',
        'font-size': '14px',
        'line-height': 'var(--lead)',
      }),
      sized: rec({'min-height': '32px', padding: '0 8px'}),
    };
    const tokens = {'--s': '6px', '--lead': '1.4286'};
    /** @param {string} v */
    const px = v => sizePx(v);
    expect(partHeightPx(map, 'item', () => null, tokens, px)).toBeCloseTo(32);
    expect(
      partHeightPx(
        map,
        'item',
        p => ({padding: '10px 10px 11px', 'line-height': '19px'})[p] ?? null,
        tokens,
        px,
      ),
    ).toBe(40);
    expect(partHeightPx(map, 'sized', () => null, tokens, px)).toBe(32);
  });
});
