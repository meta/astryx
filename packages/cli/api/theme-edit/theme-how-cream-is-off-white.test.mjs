// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: cream is a pale, warm off-white (very light, with
 * little color), never a butter yellow: a cream page reads as cream. The
 * page said in the plural ("cream pages") is the page, unless a part in
 * the same clause claims the word ("pagination pages" are its items).
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {parseColor} from './_color.mjs';
import {hexToOklch} from '../theme/palette/generate/color.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-cream-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('cream', () => {
  it('"warm cream pages" writes a pale, low-chroma warm page color', async ctx => {
    if (unbuilt) return ctx.skip();
    const {data} = await themeEditHow('warm cream pages', {cwd, theme: 'n'});
    const line = (data.results ?? [])
      .flatMap(r => r.commands)
      .flatMap(c => c.split(' && '))
      .find(c => / --color-background-body /.test(c));
    const hex = /'(#[0-9a-f]{6})'/i.exec(String(line))?.[1];
    expect(hex && parseColor(hex)).toBeTruthy();
    const {L: l, C: c, H: h} = hexToOklch(String(hex));
    expect(l).toBeGreaterThan(0.94);
    expect(c).toBeLessThan(0.04);
    expect(h).toBeGreaterThan(40);
    expect(h).toBeLessThan(110);
  }, 240_000);

  it('"pagination pages in one strip" stays the pagination, never the page', async ctx => {
    if (unbuilt) return ctx.skip();
    const {data} = await themeEditHow(
      'pagination pages in one bordered strip',
      {
        cwd,
        theme: 'n',
      },
    );
    const lines = (data.results ?? [])
      .flatMap(r => r.commands)
      .flatMap(c => c.split(' && '));
    expect(lines.some(c => / --color-background-body /.test(c))).toBe(false);
  }, 240_000);
});
