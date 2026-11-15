// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A part's own state setting wins over the build's lifted copy of the
 * plain part's value, and how keeps a state at the value it shows in that
 * state. Against real bundled base themes.
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
  cwd = makeLinkedFixture('astryx-theme-parts58-', FIXTURE_PACKAGES);
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

describe('a state setting of the theme', () => {
  it('wins over the lifted copy of the plain part', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    await themeEditSet('t', 'font-weight', '700', {cwd, on: 'tab'});
    await themeEditSet('t', 'font-weight', '500', {
      cwd,
      on: 'tab',
      state: 'selected',
    });
    const css = cssOf('t');
    const selected = [
      ...css.matchAll(
        /\.astryx-tab\[data-selected="selected"\] \{\s*font-weight: (\d+);/g,
      ),
    ].map(m => m[1]);
    // One rule for the selected tab, the theme's own: no lifted 700 after it.
    expect(selected).toEqual(['500']);
    const settings = JSON.parse(
      fs.readFileSync(path.join(cwd, 'themes/t/t.settings.json'), 'utf8'),
    );
    expect(settings.lifted ?? []).not.toContain(
      'tab selected:selected font-weight',
    );
  }, 240_000);

  it('is kept by how at the weight it shows in that state', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    const {data} = await themeEditHow(
      'make tabs bold except the selected one',
      {cwd, theme: 'k'},
    );
    const commands = data.results[0].commands.join('\n');
    // Core's selected tab reads the semibold weight.
    expect(commands).toMatch(/font-weight 600 --on tab --state selected/);
  }, 240_000);
});

describe('a shadow on a part that rings itself in its shadow', () => {
  it('is written with its rings kept in their states', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    await themeEditSet('r', 'box-shadow', '0 2px 6px #00000066', {
      cwd,
      on: 'text-input',
      only: true,
    });
    expect(cssOf('r')).toMatch(
      /\.astryx-text-input:focus-within\s*\{\s*box-shadow: 0 2px 6px #00000066, inset 0 0 0 2px var\(--color-accent-muted\);/,
    );
    // A part without rings takes it.
    await themeEditSet('r', 'box-shadow', '0 2px 6px #00000066', {
      cwd,
      on: 'card',
    });
  }, 240_000);
});
