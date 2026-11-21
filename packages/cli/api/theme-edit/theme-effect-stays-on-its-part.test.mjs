// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An effect (a shadow or a filter) set on one part stays on that part:
 * it never reaches the other members of its family role, the selected items
 * or the parts drawn as a button. Naming the group with `--on` reaches them
 * all. The always-alike groups (inputs, checks, menus) still take every
 * change as one, an overlay's box shadow (its lift) still reaches the other
 * overlays, and a look that is not an effect still reaches its family.
 * Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {context} from './_context.mjs';
import {reachGroupOf} from './_settings.mjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-effect-stays-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** The parts a value is written on, by the class of each rule. @param {string} slug @param {string} value */
const partsWith = (slug, value) =>
  new Set(
    [
      ...fs
        .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
        .matchAll(/\.astryx-([a-z-]+)[^{]*\{([^}]*)\}/g),
    ]
      .filter(m => m[2].includes(value))
      .map(m => m[1]),
  );

const SHADOW = '0 1px 1px rgba(0,0,0,.25)';

describe('an effect set on one part', () => {
  it('stays on that part, selected look included', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('s', 'text-shadow', SHADOW, {
        cwd,
        on: 'segmented-control-item',
        state: 'selected',
      })
    );
    expect(r.data.parts).toEqual(['segmented-control-item']);
    expect(partsWith('s', SHADOW)).toEqual(new Set(['segmented-control-item']));
  }, 240_000);

  it('on a button stays on the button', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    await themeEditSet('b', 'text-shadow', SHADOW, {cwd, on: 'button'});
    expect(partsWith('b', SHADOW)).toEqual(new Set(['button']));
  }, 240_000);

  it('reaches the group when --on names it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g', {cwd, like: 'neutral'});
    await themeEditSet('g', 'text-shadow', SHADOW, {
      cwd,
      on: 'selected-items',
      state: 'selected',
    });
    expect(partsWith('g', SHADOW).size).toBeGreaterThan(1);
  }, 240_000);

  it('keeps an always-alike group and an overlay frame as one', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('a', {cwd, like: 'neutral'});
    // The inputs take every change as one.
    await themeEditSet('a', 'box-shadow', '0 0 0 1px #123456', {
      cwd,
      on: 'date-time-input',
    });
    expect(partsWith('a', '0 0 0 1px #123456').size).toBeGreaterThan(1);
    // A dialog's lift is every overlay's.
    await themeEditSet('a', 'box-shadow', '0 3px 7px #4d4d4d', {
      cwd,
      on: 'dialog',
    });
    expect(partsWith('a', '0 3px 7px #4d4d4d').size).toBeGreaterThan(1);
    // So is a drop shadow drawn as a filter; another filter stays.
    await themeEditSet('a', 'filter', 'drop-shadow(0 2px 4px #4d4d4d)', {
      cwd,
      on: 'dialog',
    });
    expect(
      partsWith('a', 'drop-shadow(0 2px 4px #4d4d4d)').size,
    ).toBeGreaterThan(1);
    await themeEditSet('a', 'filter', 'grayscale(0.5)', {cwd, on: 'dialog'});
    expect(partsWith('a', 'grayscale(0.5)')).toEqual(new Set(['dialog']));
  }, 240_000);

  it('lets a one-mode border ring reach the family as a border does', async ctx => {
    if (needBases(ctx)) return;
    const ctxt = await context(cwd);
    // (How writes a border for one mode as an inset ring: an edge.)
    expect(
      reachGroupOf(
        ctxt,
        /** @type {any} */ ({
          on: 'side-nav-item',
          thing: 'box-shadow',
          state: 'selected',
          value: 'inset 0 0 0 1px #cccccc',
        }),
      ),
    ).toBe('selected-items');
    // (As how writes it for one mode: the color holds a comma.)
    expect(
      reachGroupOf(
        ctxt,
        /** @type {any} */ ({
          on: 'side-nav-item',
          thing: 'box-shadow',
          state: 'selected',
          value: 'inset 0 0 0 1px light-dark(transparent, #cccccc)',
        }),
      ),
    ).toBe('selected-items');
    expect(
      reachGroupOf(
        ctxt,
        /** @type {any} */ ({
          on: 'side-nav-item',
          thing: 'box-shadow',
          state: 'selected',
          value: '0 1px 2px #000000',
        }),
      ),
    ).toBeNull();
  }, 240_000);

  it("keeps a ring followed by the part's own shadow on the part, as an effect", async ctx => {
    if (needBases(ctx)) return;
    const ctxt = /** @type {any} */ (await context(cwd));
    const own = Object.values(ctxt.C.MAP.toast?.at?.['box-shadow'] ?? {})
      .map(v => String(v).trim())
      .filter(v => v && v !== 'none');
    expect(own.length).toBeGreaterThan(0);
    // (The shadow layer is an effect: written on the family, it would give
    // members that draw none the toast's shadow.)
    expect(
      reachGroupOf(ctxt, {
        on: 'toast',
        thing: 'box-shadow',
        value: `inset 0 0 0 1px light-dark(#cccccc, transparent), ${own[0]}`,
      }),
    ).toBeNull();
  }, 240_000);

  it('leaves a look that is not an effect reaching its family', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    await themeEditSet('c', 'font-weight', '700', {
      cwd,
      on: 'segmented-control-item',
      state: 'selected',
    });
    expect(partsWith('c', 'font-weight: 700').size).toBeGreaterThan(1);
  }, 240_000);
  it('a ring written inset last, or with no color, is an edge too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('rl', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('rl', 'box-shadow', '0 0 0 1px #111111 inset', {
        cwd,
        on: 'button',
      })
    );
    expect(r.data.parts.length).toBeGreaterThan(1);
    await themeEditNew('rn', {cwd, like: 'neutral'});
    const n = /** @type {any} */ (
      await themeEditSet('rn', 'box-shadow', 'inset 0 0 0 1px', {
        cwd,
        on: 'button',
      })
    );
    expect(n.data.parts.length).toBeGreaterThan(1);
  }, 240_000);

  it('an effect saved with a family record keeps the parts it reached', async ctx => {
    if (needBases(ctx)) return;
    // (A member of a menu row's family that the build writes on its own.)
    await themeEditNew('pf', {cwd, like: 'neutral'});
    await themeEditSet('pf', 'background-color', '#123456', {
      cwd,
      on: 'dropdown-menu-item',
    });
    const member = [...partsWith('pf', '#123456')].find(
      p => p !== 'dropdown-menu-item',
    );
    expect(member).toBeTruthy();
    await themeEditNew('pe', {cwd, like: 'neutral'});
    await themeEditSet('pe', 'text-shadow', SHADOW, {
      cwd,
      on: 'dropdown-menu-item',
    });
    const file = path.join(cwd, 'themes', 'pe', 'pe.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const x = data.settings.find(
      (/** @type {any} */ y) => y.thing === 'text-shadow',
    );
    x.reached = ['dropdown-menu-item', String(member)];
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    await themeEditSet('pe', 'corners', '4px', {cwd});
    expect(partsWith('pe', SHADOW).has(String(member))).toBe(true);
    // (A member's own effect still wins over the restored family one.)
    const OWN = '0 2px 0 rgba(255,0,0,.5)';
    await themeEditSet('pe', 'text-shadow', OWN, {
      cwd,
      on: String(member),
      only: true,
    });
    await themeEditSet('pe', 'corners', '8px', {cwd});
    expect(partsWith('pe', OWN).has(String(member))).toBe(true);
    expect(partsWith('pe', SHADOW).has(String(member))).toBe(false);
  }, 240_000);
});
