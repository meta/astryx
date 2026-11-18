// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * One-mode writes change only their mode: a token's other half keeps what
 * that mode shows, a page background's see-through main area goes with its
 * mode, a one-mode shorthand keeps a both-mode longhand, and a one-mode
 * theme keeps the other mode's settings for the regions Core draws in that
 * mode. A link's color points to the token its color prop reads. Against
 * real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {modeValue, refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-parts55-', FIXTURE_PACKAGES);
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

describe('one-mode writes', () => {
  it("keep a token's other half as what that mode shows", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f3', {cwd, like: 'neutral'});
    await themeEditSet('f3', '--color-accent', '#ff0000', {cwd});
    const r = await themeEditSet('f3', '--focus-outline-color', '#ff8800', {
      cwd,
      mode: 'dark',
    });
    // The light ring still follows the accent.
    expect(cssOf('f3')).toMatch(
      /--focus-outline-color:\s*light-dark\(var\(--color-accent\), #ff8800\)/,
    );
    expect(r.data.changedTokens.join(' ')).not.toMatch(/\(light\)/);
  }, 240_000);

  it("write a page background's see-through main area in its mode only", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f5', {cwd, like: 'neutral'});
    await themeEditSet('f5', 'background-color', '#112233', {
      cwd,
      on: 'app-shell',
      mode: 'dark',
    });
    const main = '.astryx-layout-content';
    const css = cssOf('f5');
    expect(css).not.toMatch(
      /\n {2}\.astryx-layout-content:where\(\.astryx-app-shell \[role="main"\]\) \{/,
    );
    expect(css).toMatch(
      /:is\(\.astryx-layout-content\):where\(:scope\[data-theme="dark"\] \*\)[^{]*:where\(\.astryx-app-shell \[role="main"\]\) \{\s*background-color: transparent;/,
    );
    expect(modeValue(css, main, 'background-color', 'light')).toBe(undefined);
  }, 240_000);

  it('keep a both-mode longhand under a one-mode shorthand', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f6', {cwd, like: 'neutral'});
    await themeEditSet('f6', 'background-color', '#eeeeee', {cwd, on: 'card'});
    const r = await themeEditSet(
      'f6',
      'background',
      'linear-gradient(purple, teal)',
      {cwd, on: 'card', mode: 'dark'},
    );
    expect(r.data.styled.join('\n')).not.toMatch(/\(removed\)/);
    expect(cssOf('f6')).toContain('#eeeeee');
  }, 240_000);
});

describe('a one-mode theme', () => {
  it("keeps the other mode's settings for the regions Core draws in that mode", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('om', {cwd, like: 'neutral'});
    await themeEditSet('om', 'background-color', '#ff0000', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    const r = await themeEditSet('om', 'mode', 'dark-only', {cwd});
    expect(r.data.notes.join(' ')).toMatch(
      /shows the other mode only where Core draws it .* so these apply there/,
    );
    expect(
      modeValue(
        cssOf('om'),
        '.astryx-button[data-variant="primary"]',
        'background-color',
        'light',
      ),
    ).toBe('#ff0000');
    // The other mode stays addressable, and its own mode needs no --mode.
    const light = await themeEditSet('om', 'color', '#00ff00', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    expect(light.data.notes.join(' ')).toMatch(/applies there/);
    const own = await refusal(() =>
      themeEditSet('om', 'color', '#00ff00', {cwd, on: 'button', mode: 'dark'}),
    );
    expect(own.code).toBe('ERR_THEME_NO_MODE');
    expect(own.run[0]).toMatch(/set om color '#00ff00' --on button$/);
  }, 240_000);
});

describe('a link color', () => {
  it('points to the token its color prop reads, on the link', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f7', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('f7', 'color', 'red', {cwd, on: 'link', mode: 'dark'}),
    );
    expect(r.run).toEqual([
      expect.stringMatching(
        /set f7 --color-text-accent red --on link --mode dark$/,
      ),
    ]);
  }, 240_000);
});
