// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Padding against real bundled base themes and a theme source of the
 * person's own: the editor's padding must win over the base theme's,
 * whichever sides it sets, and a side the own source sets must hold under a
 * narrower padding's nested reset.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-real-bases-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['butter', 'neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} selector */
const ruleOf = (slug, selector) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

describe('padding on real base themes', () => {
  it("replaces butter's number-input and card padding, side padding included", async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    await themeEditNew('b', {cwd, like: 'butter'});
    const before = ruleOf('b', '.astryx-number-input');
    // Butter gives the number input a block and an inline padding.
    expect(before).toMatch(/--astryx-number-input-padding-block-start:/);
    await themeEditSet('b', 'padding', '20px', {cwd, on: 'number-input'});
    const input = ruleOf('b', '.astryx-number-input');
    expect(input).toMatch(/--astryx-number-input-padding:\s*20px/);
    expect(input).not.toMatch(/--astryx-number-input-padding-(block|inline)/);
    await themeEditSet('b', 'padding', '20px', {cwd, on: 'card'});
    const card = ruleOf('b', '.astryx-card');
    expect(card).toMatch(/--astryx-card-padding:\s*20px/);
    expect(card).not.toMatch(/--astryx-card-padding:\s*var\(/);
  }, 240_000);

  it("replaces neutral's card padding", async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    await themeEditNew('n', {cwd, like: 'neutral'});
    await themeEditSet('n', 'padding', '20px', {cwd, on: 'card'});
    const card = ruleOf('n', '.astryx-card');
    expect(card).toMatch(/--astryx-card-padding:\s*20px/);
    expect(card).not.toMatch(/--astryx-card-padding:\s*var\(/);
  }, 240_000);

  it('keeps an own-source card side under a clickable card hover padding', async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    await themeEditNew('o', {cwd, like: 'neutral'});
    const ts = path.join(cwd, 'themes/o/o.theme.ts');
    const src = fs.readFileSync(ts, 'utf8');
    const own = src.includes('components:')
      ? src.replace(
          'components: {',
          "components: {\n    card: {base: {paddingInlineStart: '3px'}},",
        )
      : src.replace(
          /defineTheme\(\{/,
          "defineTheme({\n  components: {card: {base: {paddingInlineStart: '3px'}}},",
        );
    expect(own).not.toBe(src);
    fs.writeFileSync(ts, own);
    await themeEditShow('o', {cwd});
    await themeEditSet('o', 'padding', '9px', {
      cwd,
      on: 'clickable-card',
      state: 'hover',
    });
    expect(ruleOf('o', '.astryx-card')).toMatch(
      /--astryx-card-padding-inline-start:\s*3px/,
    );
    const reset = ruleOf(
      'o',
      '.astryx-card:where(.astryx-clickable-card:hover *)',
    );
    expect(reset).not.toMatch(/--astryx-card-padding-inline-start/);
  }, 240_000);
});
