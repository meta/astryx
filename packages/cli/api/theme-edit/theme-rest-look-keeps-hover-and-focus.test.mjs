// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A setting that changes a part's resting look keeps the part's hover
 * and keyboard focus visible. A resting background shorthand also resets the
 * background image, where Core draws the hover and press answers: those
 * states take the image back from Core's layer, under Core's own conditions,
 * in the shorthand's own scope. A resting
 * outline (none, or the theme's own) gives the part's focus state Core's
 * focus outline back, for each variant that draws one. A state the theme
 * sets itself keeps what it set. Against real bundled base themes.
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-rest-color-hover-', FIXTURE_PACKAGES);
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

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/**
 * The rules for a state whose selector holds every attribute given (one
 * mode's blocks left out), joined.
 * @param {string} css @param {string} state @param {string[]} attrs
 */
const scoped = (css, state, attrs) =>
  (css.match(/[^{}]*\{[^}]*\}/g) ?? [])
    .filter(r => {
      const sel = r.split('{')[0];
      return (
        sel.includes(state) &&
        !/@/.test(sel) &&
        attrs.every(a => sel.includes(a))
      );
    })
    .join('\n');

/** The declarations of a rule, by its exact selector. @param {string} css @param {string} sel */
const ruleOf = (css, sel) =>
  new RegExp(
    `(?:^|\\n)\\s*${sel.replace(/[.[\]="()]/g, m => `\\${m}`)}\\s*\\{([^}]*)\\}`,
  ).exec(css)?.[1] ?? '';

describe('a resting outline', () => {
  it('gives the focus state Core draws its focus outline back', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    await themeEditSet('o', 'outline', 'none', {cwd, on: 'button', only: true});
    const css = cssOf('o');
    expect(ruleOf(css, '.astryx-button')).toMatch(/outline: none;/);
    const focus = ruleOf(css, '.astryx-button:focus-visible');
    expect(focus).toMatch(/outline-style: var\(--focus-outline-style\);/);
    expect(focus).toMatch(/outline-width: var\(--focus-outline-width\);/);
    // A variant whose focus has its own color keeps it.
    expect(
      ruleOf(css, '.astryx-button[data-variant="destructive"]:focus-visible'),
    ).toMatch(/outline-color: var\(--color-error\);/);
  }, 240_000);

  it('leaves a focus outline the theme sets itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    await themeEditSet('f', 'outline', '2px dotted #000000', {
      cwd,
      on: 'tab',
      state: 'focus-visible',
    });
    await themeEditSet('f', 'outline', 'none', {cwd, on: 'tab'});
    expect(ruleOf(cssOf('f'), '.astryx-tab:focus-visible')).toMatch(
      /outline: 2px dotted #000000;/,
    );
    expect(ruleOf(cssOf('f'), '.astryx-tab:focus-visible')).not.toMatch(
      /outline-style:/,
    );
  }, 240_000);

  it('keeps a focus outline color the theme sets, and still draws the outline', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    await themeEditSet('c', 'outline-color', '#ff0000', {
      cwd,
      on: 'button',
      state: 'focus-visible',
    });
    await themeEditSet('c', 'outline', 'none', {cwd, on: 'button'});
    const focus = ruleOf(cssOf('c'), '.astryx-button:focus-visible');
    expect(focus).toMatch(/outline-color: #ff0000;/);
    expect(focus).toMatch(/outline-style: var\(--focus-outline-style\);/);
    expect(focus).toMatch(/outline-width: var\(--focus-outline-width\);/);
  }, 240_000);

  it('still draws the focus outline in the other mode when the theme sets one mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m1', {cwd, like: 'neutral'});
    await themeEditSet('m1', 'outline-color', '#ff0000', {
      cwd,
      on: 'button',
      state: 'focus-visible',
      mode: 'dark',
    });
    await themeEditSet('m1', 'outline', 'none', {cwd, on: 'button'});
    const css = cssOf('m1');
    const focus = ruleOf(css, '.astryx-button:focus-visible');
    expect(focus).toMatch(/outline-style: var\(--focus-outline-style\);/);
    expect(focus).toMatch(/outline-width: var\(--focus-outline-width\);/);
    // (The destructive variant's own focus color comes back for light mode
    // only, never for both: dark mode keeps the theme's color.)
    expect(
      ruleOf(css, '.astryx-button[data-variant="destructive"]:focus-visible'),
    ).not.toMatch(/outline-color: var\(--color-error\)/);
  }, 240_000);

  it("keeps a variant's own focus color under a resting outline for that variant and a size", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('vs', {cwd, like: 'neutral'});
    await themeEditSet('vs', 'outline-color', '#ff0000', {
      cwd,
      on: 'button',
      state: 'focus-visible',
      when: 'variant:ghost',
    });
    await themeEditSet('vs', 'outline', 'none', {
      cwd,
      on: 'button',
      when: 'variant:ghost+size:sm',
    });
    const css = cssOf('vs');
    const rules = (
      css.match(/[^{}]*:focus-visible[^{]*\{[^}]*\}/g) ?? []
    ).filter(
      r =>
        /data-variant="ghost"/.test(r) &&
        /data-size="sm"/.test(r) &&
        !/@/.test(r.split('{')[0]),
    );
    expect(rules.join('\n')).toMatch(
      /outline-style: var\(--focus-outline-style\)/,
    );
    expect(rules.join('\n')).not.toMatch(/outline-color: var\(/);
    // (The theme's own color is written there, so it outweighs the resting
    // outline.)
    expect(rules.join('\n')).toMatch(/outline-color: #ff0000/);
  }, 240_000);

  it("keeps a variant's whole focus outline under a resting outline for that variant and a size", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('vw', {cwd, like: 'neutral'});
    await themeEditSet('vw', 'outline', '2px dotted #000000', {
      cwd,
      on: 'button',
      state: 'focus-visible',
      when: 'variant:ghost',
    });
    await themeEditSet('vw', 'outline', 'none', {
      cwd,
      on: 'button',
      when: 'variant:ghost+size:sm',
    });
    const rules = scoped(cssOf('vw'), ':focus-visible', [
      'data-variant="ghost"',
      'data-size="sm"',
    ]);
    expect(rules).toMatch(/outline: 2px dotted #000000/);
  }, 240_000);

  it("lets a variant's whole focus outline win over a whole-part focus color under a resting outline for that variant and a size", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('vo', {cwd, like: 'neutral'});
    await themeEditSet('vo', 'outline-color', '#ff0000', {
      cwd,
      on: 'button',
      state: 'focus-visible',
    });
    await themeEditSet('vo', 'outline', '2px solid #000000', {
      cwd,
      on: 'button',
      state: 'focus-visible',
      when: 'variant:ghost',
    });
    await themeEditSet('vo', 'outline', 'none', {
      cwd,
      on: 'button',
      when: 'variant:ghost+size:sm',
    });
    const rules = scoped(cssOf('vo'), ':focus-visible', [
      'data-variant="ghost"',
      'data-size="sm"',
    ]);
    // (The variant's outline comes after the whole part's color, so its
    // black wins, as the theme draws it.)
    expect(rules).toMatch(
      /outline-color: #ff0000;[^}]*outline: 2px solid #000000;/,
    );
  }, 240_000);

  it('keeps a whole-part focus color under a resting outline for one variant', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('wf', {cwd, like: 'neutral'});
    await themeEditSet('wf', 'outline-color', '#ff0000', {
      cwd,
      on: 'button',
      state: 'focus-visible',
    });
    await themeEditSet('wf', 'outline', 'none', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
    });
    expect(
      scoped(cssOf('wf'), ':focus-visible', ['data-variant="ghost"']),
    ).toMatch(/outline-color: #ff0000/);
  }, 240_000);

  it('gives a large or raised button its hover back under a scoped resting background', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('lg', {cwd, like: 'neutral'});
    for (const when of ['size:lg', 'elevation:high'])
      await themeEditSet('lg', 'background', 'transparent', {
        cwd,
        on: 'button',
        when,
      });
    const css = cssOf('lg');
    expect(css).toMatch(
      /\.astryx-button\[data-size="lg"\]:hover[^{]*\{[^}]*background-image: revert-layer/,
    );
    expect(css).toMatch(
      /\.astryx-button\[data-elevation="high"\]:hover[^{]*\{[^}]*background-image: revert-layer/,
    );
  }, 240_000);
});

describe('a resting background shorthand', () => {
  it("gives a ghost button's hover and press Core's layer back", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g', {cwd, like: 'neutral'});
    await themeEditSet('g', 'background', 'transparent', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
    });
    const css = cssOf('g');
    expect(ruleOf(css, '.astryx-button[data-variant="ghost"]')).toMatch(
      /background: transparent;/,
    );
    // The shorthand resets the background image where Core draws them:
    // each state takes it back from Core's layer.
    expect(css).toMatch(
      /\.astryx-button\[data-variant="ghost"\]:hover[^{]*\{\s*background-image: revert-layer;/,
    );
    expect(css).toMatch(
      /\.astryx-button\[data-variant="ghost"\]:active[^{]*\{\s*background-image: revert-layer;/,
    );
  }, 240_000);

  // Core draws the press layer only on an enabled part, and the hover layer
  // only on a screen that can hover. A value written here would hold
  // everywhere the theme's rule matches: on a disabled part under a mouse
  // press, and on a touch screen after a tap. Core's own value keeps both.
  it("leaves a disabled button's press to Core", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d', {cwd, like: 'neutral'});
    await themeEditSet('d', 'background', 'transparent', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
    });
    const css = cssOf('d');
    expect(css).not.toMatch(
      /\.astryx-button\[data-variant="ghost"\]:active[^{]*\{[^}]*overlay-pressed/,
    );
  }, 240_000);

  it("leaves a touch screen's hover to Core", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    await themeEditSet('t', 'background', 'transparent', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
    });
    expect(cssOf('t')).not.toMatch(
      /\.astryx-button\[data-variant="ghost"\]:hover[^{]*\{[^}]*overlay-hover/,
    );
  }, 240_000);

  it('gives a combined scope its hover and press back', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('cs', {cwd, like: 'neutral'});
    await themeEditSet('cs', 'background', 'transparent', {
      cwd,
      on: 'button',
      when: 'variant:ghost+size:sm',
    });
    const css = cssOf('cs');
    for (const state of ['hover', 'active'])
      expect(css).toMatch(
        new RegExp(
          `\\.astryx-button\\[data-size="sm"\\]\\[data-variant="ghost"\\]:${state}[^{]*\\{\\s*background-image: revert-layer;`,
        ),
      );
  }, 240_000);

  it('leaves a variant hover background set before a whole-part shorthand', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    await themeEditSet('w', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
      state: 'hover',
    });
    await themeEditSet('w', 'background', 'transparent', {cwd, on: 'button'});
    const css = cssOf('w');
    const hover =
      /\.astryx-button\[data-variant="ghost"\]:hover[^{]*\{([^}]*)\}/.exec(
        css,
      )?.[1];
    expect(hover).toMatch(/background: #eeeeee;/);
    expect(hover).not.toMatch(/background-image/);
  }, 240_000);

  it('leaves a hover background the theme sets itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    await themeEditSet('h', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
      state: 'hover',
    });
    await themeEditSet('h', 'background', 'transparent', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
    });
    expect(cssOf('h')).not.toMatch(
      /\.astryx-button\[data-variant="ghost"\]:hover[^{]*\{[^}]*overlay-hover/,
    );
  }, 240_000);

  it("keeps a variant's own hover under a resting background for that variant and a size", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('vh', {cwd, like: 'neutral'});
    await themeEditSet('vh', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
      state: 'hover',
    });
    await themeEditSet('vh', 'background', 'transparent', {
      cwd,
      on: 'button',
      when: 'variant:ghost+size:sm',
    });
    expect(
      scoped(cssOf('vh'), ':hover', ['data-variant="ghost"', 'data-size="sm"']),
    ).toMatch(/#eeeeee/);
  }, 240_000);

  it('keeps a whole-part hover under a resting background for one variant', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('wh', {cwd, like: 'neutral'});
    await themeEditSet('wh', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      state: 'hover',
    });
    await themeEditSet('wh', 'background', 'transparent', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
    });
    expect(scoped(cssOf('wh'), ':hover', ['data-variant="ghost"'])).toMatch(
      /#eeeeee/,
    );
  }, 240_000);

  it('leaves a variant hover the theme sets itself under a whole-part background', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('v', {cwd, like: 'neutral'});
    await themeEditSet('v', 'background', 'linear-gradient(#111111, #333333)', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
      state: 'hover',
    });
    await themeEditSet('v', 'background', '#ffffff', {cwd, on: 'button'});
    expect(cssOf('v')).not.toMatch(
      /\.astryx-button\[data-variant="ghost"\]:hover[^{]*\{[^}]*overlay-hover/,
    );
  }, 240_000);
});
