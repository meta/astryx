// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A shorthand set for one mode points to the color longhand for that mode,
 * its other words for both modes, never repainting the other mode; a shadow
 * holds its color for one mode in light-dark(). A one-mode theme names the
 * other mode's token changes it writes. Against real bundled base themes.
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
  cwd = makeLinkedFixture('astryx-theme-parts57-', FIXTURE_PACKAGES);
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

describe('a shorthand with --mode', () => {
  it('points to the color longhand for that mode and its other words for both', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('s', 'border', '1px solid red', {
        cwd,
        on: 'text-input',
        mode: 'dark',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_MODE');
    expect(r.run).toEqual([
      expect.stringMatching(/set s border-width 1px --on text-input$/),
      expect.stringMatching(/set s border-style solid --on text-input$/),
      expect.stringMatching(
        /set s border-color red --on text-input --mode dark$/,
      ),
    ]);
    // Following them leaves the light border color as it was.
    for (const line of r.run) {
      const [, thing, value] = /set s (\S+) ('[^']*'|\S+)/.exec(line) ?? [];
      await themeEditSet('s', thing, value.replace(/^'|'$/g, ''), {
        cwd,
        on: 'text-input',
        ...(/--mode dark/.test(line) ? {mode: 'dark'} : {}),
      });
    }
    expect(
      modeValue(cssOf('s'), '.astryx-text-input', 'border-color', 'light'),
    ).toBe(undefined);
    expect(
      modeValue(cssOf('s'), '.astryx-text-input', 'border-color', 'dark'),
    ).toBe('red');
  }, 240_000);

  it('does so for outline and a border side too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    // (The outline a button draws is its focus ring; at rest it draws
    // none, so a one-mode outline there would show in the other mode too.)
    const outline = await refusal(() =>
      themeEditSet('o', 'outline', '2px dashed red', {
        cwd,
        on: 'button',
        state: 'focus-visible',
        mode: 'light',
      }),
    );
    expect(outline.run.at(-1)).toMatch(
      /set o outline-color red --on button --state focus-visible --mode light$/,
    );
    const atRest = await refusal(() =>
      themeEditSet('o', 'outline', '2px dashed red', {
        cwd,
        on: 'button',
        mode: 'light',
      }),
    );
    expect(atRest.message).toMatch(/button draws no outline now/);
    const top = await refusal(() =>
      themeEditSet('o', 'border-top', '3px solid blue', {
        cwd,
        on: 'card',
        mode: 'dark',
      }),
    );
    expect(top.run.at(-1)).toMatch(/set o border-top-color blue --on card/);
    expect(top.message).not.toMatch(/cannot differ/);
  }, 240_000);

  it("writes a shadow's color for one mode in light-dark()", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('h', 'text-shadow', '0 1px 2px red', {
        cwd,
        on: 'heading',
        mode: 'dark',
      }),
    );
    expect(r.run[0]).toMatch(
      /set h text-shadow '0 1px 2px light-dark\(transparent, red\)' --on heading$/,
    );
  }, 240_000);
});

describe('a shadow token with --mode', () => {
  it("writes each layer's color for that mode, the other mode's kept, or says why it cannot", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    const three = await refusal(() =>
      themeEditSet(
        'w',
        '--shadow-low',
        '0 2px 4px red, 0 4px 8px red, inset 0 0 0 1px red',
        {cwd, mode: 'dark'},
      ),
    );
    expect(three.message).not.toMatch(/same in light and dark/);
    expect(three.run[0]).toMatch(
      /--shadow-low '0 2px 4px light-dark\([^,]+, red\), 0 4px 8px light-dark\([^,]+, red\), inset 0 0 0 1px light-dark\([^,]+, red\)'$/,
    );
    const one = await refusal(() =>
      themeEditSet('w', '--shadow-low', '0 2px 4px red', {cwd, mode: 'dark'}),
    );
    expect(one.message).toMatch(/changes the light mode too/);
  }, 240_000);
});

describe('a one-mode theme', () => {
  it("names the other mode's token it writes", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('l', {cwd, like: 'neutral'});
    await themeEditSet('l', 'mode', 'light-only', {cwd});
    const r = await themeEditSet('l', '--color-accent', 'blue', {
      cwd,
      mode: 'dark',
    });
    expect(r.data.changedTokens.join('\n')).toMatch(
      /--color-accent \(dark\): \S+ -> blue/,
    );
  }, 240_000);
});
