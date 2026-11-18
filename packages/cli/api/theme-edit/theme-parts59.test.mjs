// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The census reads overlays drawn open (a tooltip, a menu's list); a fill
 * on the plain part says which variant and state paints it covers; corners
 * step from round to between round and pill; a border the theme sets is
 * held to 3:1. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-parts59-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
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

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

describe('the census', () => {
  it('reads overlays drawn open', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    for (const part of [
      'tooltip',
      'popover',
      'hover-card',
      'dropdown-menu',
      'selector-popup',
    ]) {
      const {data} = await themeEditHow(part, {cwd, theme: 'o'});
      expect(/** @type {any} */ (data).recorded, part).toBe(true);
    }
    // What Core paints a tooltip with is read, not left blank.
    const {data} = await themeEditHow('tooltip', {cwd, theme: 'o'});
    expect(JSON.stringify(data)).toMatch(/--radius-container/);
  }, 240_000);
});

describe('a fill on the plain part', () => {
  it('says which state and variant paints it covers, with the lines that change one', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    const checks = await themeEditSet('f', 'background', '#fff', {
      cwd,
      on: 'checks',
    });
    const checkNotes = checks.data.notes.join('\n');
    expect(checkNotes).toMatch(
      /checkbox-indicator's fill now covers .*checked=checked \(--color-accent\)/,
    );
    // The line that changes only the fill at rest.
    expect(checkNotes).toMatch(
      /set f --color-background-surface '#fff' --on checkbox-indicator/,
    );
    const button = await themeEditSet('f', 'background', '#c0c0c0', {
      cwd,
      on: 'button',
    });
    const buttonNotes = button.data.notes.join('\n');
    expect(buttonNotes).toMatch(
      /button's fill now covers .*variant=primary \(--color-accent\)/,
    );
    expect(buttonNotes).toMatch(/--on button --when variant:primary/);
    const accent = await themeEditSet('f', 'accent', '#ff0000', {cwd});
    expect(accent.data.notes.join('\n')).toMatch(
      /the fill set on button \(#c0c0c0\) covers .*variant=primary.*so accent does not reach button there/,
    );
  }, 240_000);
});

describe('corners more and less', () => {
  it('step between round and pill', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    await themeEditSet('c', 'corners', 'round', {cwd});
    await themeEditSet('c', 'corners', 'more', {cwd});
    const read = () =>
      JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/c/c.settings.json'), 'utf8'),
      ).settings.find((/** @type {any} */ x) => x.thing === 'corners')?.value;
    expect(read()).toBe('24px');
    await themeEditSet('c', 'corners', 'more', {cwd});
    expect(read()).toBe('pill');
    await themeEditSet('c', 'corners', 'less', {cwd});
    expect(read()).toBe('24px');
  }, 240_000);
});

describe('a border the theme sets', () => {
  it('is held to 3:1 on what it sits on, in each mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    const inputs = await themeEditSet('b', 'border-color', '#000000', {
      cwd,
      on: 'inputs',
    });
    expect(JSON.stringify(inputs.data)).toMatch(
      /the border on text-input \(#000000\) is 1\.\d+:1 on its background \S+ in dark; a border needs 3:1/,
    );
    const token = await themeEditSet('b', '--color-border', '#000000', {cwd});
    expect(JSON.stringify(token.data)).toMatch(
      /the border --color-border \(#000000\) is 1\.\d+:1 on the page in dark/,
    );
    // A border as low as the base theme's own is not the theme's doing.
    await themeEditNew('b2', {cwd, like: 'neutral'});
    const card = await themeEditSet('b2', 'border-color', '#d0d0d0', {
      cwd,
      on: 'card',
    });
    expect(JSON.stringify(card.data)).not.toMatch(/the border on card/);
  }, 240_000);
});
