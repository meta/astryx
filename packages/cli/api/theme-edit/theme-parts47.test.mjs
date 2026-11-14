// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * One-mode gradients and tokens keep what the other mode shows, the page
 * background shows in every AppShell, heading colors and types, against a
 * real bundled base theme. Each check reads the built stylesheet for what
 * each mode resolves to.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

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
  cwd = makeLinkedFixture('astryx-theme-parts47-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** @param {string} slug @param {string} selector */
const ruleOf = (slug, selector) => {
  const css = cssOf(slug);
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

/** @param {string} slug */
const settingsOf = slug =>
  JSON.parse(
    fs.readFileSync(
      path.join(cwd, 'themes', slug, `${slug}.settings.json`),
      'utf8',
    ),
  ).settings;

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

describe('one-mode gradients', () => {
  it('writes a one-mode gradient as background images, so the other mode keeps its color', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g1', {cwd, like: 'neutral'});
    await themeEditSet('g1', 'background', 'linear-gradient(red, blue)', {
      cwd,
      on: 'card',
      mode: 'light',
    });
    const card = ruleOf('g1', '.astryx-card');
    expect(card).toMatch(
      /background-image: linear-gradient\(light-dark\(red, transparent\), light-dark\(blue, transparent\)\)/,
    );
    // No shorthand resets the card's color in either mode.
    expect(card).not.toMatch(/\bbackground:/);
    expect(card).not.toMatch(/background-color/);
  }, 240_000);

  it('keeps a light gradient with a transparent stop beside a later dark one', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g2', {cwd, like: 'neutral'});
    await themeEditSet(
      'g2',
      'background',
      'linear-gradient(transparent, red)',
      {
        cwd,
        on: 'card',
        mode: 'light',
      },
    );
    await themeEditSet('g2', 'background', 'linear-gradient(blue, green)', {
      cwd,
      on: 'card',
      mode: 'dark',
    });
    const card = ruleOf('g2', '.astryx-card');
    expect(card).toContain('light-dark(red, transparent)');
    expect(card).toContain('light-dark(transparent, blue)');
  }, 240_000);

  it('refuses a light-dark() stop in a one-mode gradient', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g3', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet(
        'g3',
        'background-image',
        'linear-gradient(light-dark(red, blue), white)',
        {cwd, on: 'card', mode: 'light'},
      ),
    );
    expect(r.code).toBe('ERR_THEME_NO_MODE');
  }, 240_000);

  it('offers a gradient for one mode in how, as a background image', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g4', {cwd, like: 'neutral'});
    const r = await themeEditHow(
      'make the card a red to blue gradient in dark mode only',
      {cwd, theme: 'g4'},
    );
    const text = JSON.stringify(r.data);
    expect(text).toMatch(
      /background-image '[^']*gradient[^']*' --on card[^"]*--mode dark/,
    );
    expect(text).not.toMatch(/cannot be dark mode only/);
  }, 240_000);
});

describe('one-mode tokens and the background family', () => {
  it("gives a one-mode token on a part the token's own value in the other mode", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t1', {cwd, like: 'neutral'});
    await themeEditSet('t1', '--color-background-card', '#ff0000', {
      cwd,
      on: 'card',
      mode: 'light',
    });
    await themeEditSet('t1', 'color', '#ff0000', {
      cwd,
      on: 'heading',
      mode: 'light',
    });
    expect(cssOf('t1')).not.toMatch(/currentcolor\)/);
    expect(ruleOf('t1', '.astryx-card')).toMatch(
      /--color-background-card: light-dark\(#ff0000, (?!currentcolor)[^)]+\)/,
    );
  }, 240_000);

  it("keeps the other mode's background-color when a one-mode background follows", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t2', {cwd, like: 'neutral'});
    await themeEditSet('t2', 'background-color', '#ff0000', {
      cwd,
      on: 'card',
      mode: 'light',
    });
    await themeEditSet('t2', 'background', '#0000ff', {
      cwd,
      on: 'card',
      mode: 'dark',
    });
    expect(settingsOf('t2').map((/** @type {any} */ x) => x.mode)).toEqual([
      'light',
      'dark',
    ]);
    expect(cssOf('t2')).toMatch(/light-dark\(#ff0000, #0000ff\)/);
  }, 240_000);

  it("says a one-mode color under the part's own gradient does not show", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t3', {cwd, like: 'neutral'});
    await themeEditSet('t3', 'background', 'linear-gradient(red, blue)', {
      cwd,
      on: 'card',
    });
    const r = await themeEditSet('t3', 'background', '#eeeeee', {
      cwd,
      on: 'card',
      mode: 'light',
    });
    expect(r.data.notes.join(' ')).toMatch(/does not show/);
  }, 240_000);
});

describe('headings', () => {
  it('takes the secondary text color without a loop', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h1', {cwd, like: 'neutral'});
    await themeEditSet('h1', 'color', 'var(--color-text-secondary)', {
      cwd,
      on: 'heading',
    });
    const rule = ruleOf('h1', '.astryx-heading');
    expect(rule).toMatch(/--color-text-primary: var\(--color-text-secondary\)/);
    expect(rule).not.toMatch(
      /--color-text-secondary: var\(--color-text-secondary\)/,
    );
  }, 240_000);

  it("lists Heading's own types and refuses Text's", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h2', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('h2', 'color', '#2563eb', {
        cwd,
        on: 'heading',
        when: 'type:body',
      }),
    );
    expect(r.message).toMatch(/display-1, display-2, display-3/);
    const how = await themeEditHow('make headings blue in dark mode', {
      cwd,
      theme: 'h2',
    });
    expect(JSON.stringify(how.data)).not.toMatch(/type:body/);
  }, 240_000);
});

describe('the page background', () => {
  it('writes the fixed attachment after the page gradient and paints both modes on the shell regions', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p2', {cwd, like: 'neutral'});
    await themeEditSet(
      'p2',
      'background',
      'linear-gradient(180deg, #ff0000, #0000ff)',
      {cwd, on: 'app-shell'},
    );
    // The attachment comes after the shorthand, so the shorthand does not
    // reset it.
    for (const sel of ['.astryx-app-shell', '.astryx-app-shell-header']) {
      const rule = ruleOf('p2', sel);
      expect(rule, sel).toMatch(
        /background: linear-gradient[^;]*;[\s\S]*background-attachment: fixed/,
      );
    }
    // The two per-mode commands how suggests reach the header and side nav
    // in both modes.
    await themeEditNew('p3', {cwd, like: 'neutral'});
    const how = await themeEditHow('a gradient on the page background', {
      cwd,
      theme: 'p3',
    });
    const lines = JSON.stringify(how.data).match(
      /set p3 background-image '[^']+' --on app-shell --mode (light|dark)/g,
    );
    expect(lines?.length).toBe(2);
    for (const mode of /** @type {const} */ (['light', 'dark'])) {
      const value = /** @type {string} */ (
        /** @type {string[]} */ (lines)
          .find(l => l.endsWith(mode))
          ?.match(/'([^']+)'/)?.[1]
      );
      await themeEditSet('p3', 'background-image', value, {
        cwd,
        on: 'app-shell',
        mode,
      });
    }
    for (const sel of [
      '.astryx-app-shell-header',
      '.astryx-app-shell-sidenav',
    ]) {
      const rule = ruleOf('p3', sel);
      expect(rule, sel).toMatch(/#f5f7fa/);
      expect(rule, sel).toMatch(/#14171c/);
    }
  }, 240_000);

  it('shows a background on app-shell in every AppShell variant', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p1', {cwd, like: 'neutral'});
    const r = await themeEditSet('p1', 'background', '#ff0000', {
      cwd,
      on: 'app-shell',
    });
    const shell = ruleOf('p1', '.astryx-app-shell');
    expect(shell).toMatch(/background: #ff0000/);
    // The tokens stay defined for what is drawn inside the shell.
    expect(cssOf('p1')).not.toMatch(
      /--color-background-(body|surface): transparent/,
    );
    // The header and side nav take the page background: in an auto-height
    // shell they are sticky, so they stay opaque over scrolled content.
    for (const sel of ['.astryx-app-shell-header', '.astryx-app-shell-sidenav'])
      expect(ruleOf('p1', sel), sel).toMatch(/background: #ff0000/);
    // The main content area is see-through.
    expect(
      ruleOf(
        'p1',
        '.astryx-layout-content:where(.astryx-app-shell [role="main"])',
      ),
    ).toMatch(/background-color: transparent/);
    expect(r.data.notes.join(' ')).toMatch(/header and side nav/);
    expect(r.data.notes.join(' ')).toMatch(/elevated layout/);
    // A page gradient is fixed to the viewport on the shell and its sticky
    // regions, so they line up when content scrolls.
    await themeEditSet(
      'p1',
      'background',
      'linear-gradient(180deg, #ff0000, #0000ff)',
      {cwd, on: 'app-shell'},
    );
    for (const sel of ['.astryx-app-shell', '.astryx-app-shell-header'])
      expect(ruleOf('p1', sel), sel).toMatch(/background-attachment: fixed/);
    // The page gradient how offers reads no token the shell would lose, and
    // gives each mode its own value so text stays readable in dark mode.
    const how = await themeEditHow('a gradient on the page background', {
      cwd,
      theme: 'p1',
    });
    const text = JSON.stringify(how.data);
    expect(text).toMatch(/--on app-shell/);
    expect(text).not.toMatch(/gradient\([^']*var\(--color-background/);
    expect(text).toMatch(
      /background-image 'linear-gradient\(180deg, #f5f7fa, #e4ebf5\)' --on app-shell --mode light/,
    );
    expect(text).toMatch(
      /background-image 'linear-gradient\(180deg, #14171c, #1c222b\)' --on app-shell --mode dark/,
    );
    const solid = JSON.stringify(
      (await themeEditHow('change the page background', {cwd, theme: 'p1'}))
        .data,
    );
    expect(solid).toMatch(/--color-background-body '#f5f7fa' --mode light/);
    expect(solid).toMatch(/--color-background-body '#14171c' --mode dark/);
  }, 240_000);
});
