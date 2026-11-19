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
    expect(r.data.parts ?? ['segmented-control-item']).toEqual([
      'segmented-control-item',
    ]);
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
});
