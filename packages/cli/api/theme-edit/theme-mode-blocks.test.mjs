// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A color for one mode on a part is written in the part's block for that
 * mode, so in the other mode the theme writes nothing there and the rules
 * Core gives the part in context (the current page in Pagination, a text
 * field's status border) apply as they would without it. Against real
 * bundled base themes; the browser case renders Core's components with
 * Core's built stylesheet in the Chromium the repository pins.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {modeValue} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const require = createRequire(import.meta.url);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

// The browser case runs only in the step that installs the pinned Chromium.
const BROWSER_STEP = process.env.ASTRYX_THEME_EDITOR_BROWSER === '1';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-mode-blocks-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter', 'gothic']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

const HOVER = ':hover:where(:not(:disabled,[aria-disabled="true"]))';

/** Whether a built stylesheet pairs a value with another mode anywhere. */
const paired = (/** @type {string} */ css, /** @type {string} */ value) =>
  new RegExp(`light-dark\\([^;]*${value}`, 'i').test(css);

describe('one-mode settings leave the other mode as it was', () => {
  it("for an indicator's background, so unchecked boxes keep their own fill", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o7', {cwd, like: 'butter'});
    await themeEditSet('o7', 'background-color', '#ff0000', {
      cwd,
      on: 'checkbox-indicator',
      mode: 'dark',
    });
    const css = cssOf('o7');
    expect(paired(css, '#ff0000')).toBe(false);
    expect(
      modeValue(css, '.astryx-checkbox-indicator', 'background-color', 'light'),
    ).toBe(undefined);
    expect(
      modeValue(css, '.astryx-checkbox-indicator', 'background-color', 'dark'),
    ).toBe('#ff0000');
  }, 240_000);

  it("for a top nav heading's text, so the other mode keeps the base theme's own text color there", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o9', {cwd, like: 'butter'});
    await themeEditSet('o9', 'color', '#ff0000', {
      cwd,
      on: 'top-nav-heading',
      mode: 'dark',
    });
    const css = cssOf('o9');
    expect(paired(css, '#ff0000')).toBe(false);
    // The text color token the heading's text reads is written in the dark
    // block alone: in light mode butter's own value on the part (its blue)
    // still applies.
    expect(
      modeValue(css, '.astryx-top-nav-heading', '--color-text-primary', 'dark'),
    ).toBe('#ff0000');
    await themeEditNew('o9b', {cwd, like: 'butter'});
    const own = modeValue(
      cssOf('o9b'),
      '.astryx-top-nav-heading',
      '--color-text-primary',
      'light',
    );
    expect(own).toBeTruthy();
    expect(
      modeValue(
        css,
        '.astryx-top-nav-heading',
        '--color-text-primary',
        'light',
      ),
    ).toBe(own);
  }, 240_000);

  it('for a table row hover, so rows of tables without hover stay still', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o8', {cwd, like: 'butter'});
    await themeEditSet('o8', 'background-color', '#ff0000', {
      cwd,
      on: 'table-row',
      state: 'hover',
      mode: 'dark',
    });
    const css = cssOf('o8');
    expect(paired(css, '#ff0000')).toBe(false);
    expect(css).not.toMatch(/light-dark\(var\(--color-overlay-hover\)/);
    expect(
      modeValue(css, `.astryx-table-row${HOVER}`, 'background-color', 'light'),
    ).toBe(undefined);
  }, 240_000);

  it("in a variant and a state, on the base theme's own variant color", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o1', {cwd, like: 'butter'});
    await themeEditSet('o1', 'color', '#ff0000', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
      state: 'hover',
      mode: 'dark',
    });
    const css = cssOf('o1');
    const ghostHover = `.astryx-button[data-variant="ghost"]${HOVER}`;
    expect(modeValue(css, ghostHover, 'color', 'dark')).toBe('#ff0000');
    expect(paired(css, '#ff0000')).toBe(false);
  }, 240_000);

  it("for a gradient in a state, keeping Core's hover tint in the other mode", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o2', {cwd, like: 'butter'});
    await themeEditSet(
      'o2',
      'background',
      'linear-gradient(#ff0000, #0000ff)',
      {
        cwd,
        on: 'button',
        state: 'hover',
        mode: 'dark',
      },
    );
    const css = cssOf('o2');
    expect(css).not.toMatch(/transparent, transparent|light-dark\(transparent/);
    expect(
      modeValue(css, `.astryx-button${HOVER}`, 'background-image', 'dark'),
    ).toBe('linear-gradient(#ff0000, #0000ff)');
    expect(
      modeValue(css, `.astryx-button${HOVER}`, 'background-image', 'light'),
    ).toBe(undefined);
  }, 240_000);

  it('for a heading color, so headings in colored cards keep their own text color', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o3', {cwd, like: 'gothic'});
    await themeEditSet('o3', 'color', '#ff0000', {
      cwd,
      on: 'heading',
      mode: 'dark',
    });
    const css = cssOf('o3');
    expect(paired(css, '#ff0000')).toBe(false);
    expect(
      modeValue(css, '.astryx-heading', '--color-text-primary', 'dark'),
    ).toBe('#ff0000');
    expect(
      modeValue(css, '.astryx-heading', '--color-text-primary', 'light'),
    ).toBe(undefined);
  }, 240_000);

  it('for a hover on a nav item, never giving it the selected fill', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o4', {cwd, like: 'gothic'});
    await themeEditSet('o4', 'background-color', '#00ff00', {
      cwd,
      on: 'top-nav-item',
      state: 'hover',
      mode: 'dark',
    });
    const css = cssOf('o4');
    expect(paired(css, '#00ff00')).toBe(false);
    expect(css).not.toMatch(/light-dark\(var\(--color-neutral\)/);
  }, 240_000);

  it('for a header background, which the page background still paints in the other mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o5', {cwd, like: 'butter'});
    await themeEditSet('o5', 'background-color', '#ff0000', {
      cwd,
      on: 'app-shell-header',
      mode: 'dark',
    });
    await themeEditSet('o5', 'background-color', '#00ff00', {
      cwd,
      on: 'app-shell',
    });
    const css = cssOf('o5');
    // The page background paints the header; each header variant takes the
    // dark color in its dark rule, which outranks it there.
    expect(
      modeValue(css, '.astryx-app-shell-header', 'background-color', 'light'),
    ).toBe('#00ff00');
    expect(
      modeValue(
        css,
        '.astryx-app-shell-header[data-variant="elevated"]',
        'background-color',
        'dark',
      ),
    ).toBe('#ff0000');
  }, 240_000);

  it('for a size, never giving every size the destructive color', async ctx => {
    if (needBases(ctx)) return;
    for (const like of ['butter', 'neutral']) {
      const slug = `o6-${like}`;
      await themeEditNew(slug, {cwd, like});
      await themeEditSet(slug, 'background-color', '#ff0000', {
        cwd,
        on: 'button',
        when: 'size:sm',
        mode: 'dark',
      });
      const css = cssOf(slug);
      expect(paired(css, '#ff0000'), like).toBe(false);
      expect(
        modeValue(
          css,
          '.astryx-button[data-size="sm"]',
          'background-color',
          'light',
        ),
        like,
      ).toBe(undefined);
    }
  }, 240_000);
});

describe('a color for one mode on a part', () => {
  it('is written for its mode only, never as a pair with the other mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('mb1', {cwd, like: 'neutral'});
    await themeEditSet('mb1', 'background-color', '#ff00ff', {
      cwd,
      on: 'button',
      mode: 'dark',
    });
    await themeEditSet('mb1', 'border-color', '#00ff00', {
      cwd,
      on: 'text-input',
      mode: 'light',
    });
    const css = cssOf('mb1');
    expect(css).not.toMatch(/light-dark\([^;]*#ff00ff/);
    expect(css).not.toMatch(/light-dark\([^;]*#00ff00/);
    const ghost = '.astryx-button[data-variant="ghost"]';
    expect(modeValue(css, ghost, 'background-color', 'dark')).toBe('#ff00ff');
    expect(modeValue(css, ghost, 'background-color', 'light')).toBe(undefined);
    expect(modeValue(css, '.astryx-text-input', 'border-color', 'light')).toBe(
      '#00ff00',
    );
    expect(modeValue(css, '.astryx-text-input', 'border-color', 'dark')).toBe(
      undefined,
    );
  }, 240_000);

  it.runIf(BROWSER_STEP)(
    'leaves the current page and the status borders as Core draws them in the other mode',
    async () => {
      if (unbuilt)
        throw new Error(`the base themes could not be built: ${unbuilt}`);
      const React = require('react');
      const {renderToStaticMarkup} = require('react-dom/server');
      const {Pagination, TextInput} = await import('@astryxdesign/core');
      const {Theme, defineTheme} = await import('@astryxdesign/core/theme');
      const {chromium} = require('playwright');
      const coreCss = fs.readFileSync(
        require.resolve('@astryxdesign/core/astryx.css'),
        'utf8',
      );
      const resetCss = fs.readFileSync(
        require.resolve('@astryxdesign/core/reset.css'),
        'utf8',
      );
      await themeEditNew('mb2', {cwd, like: 'neutral'});
      await themeEditSet('mb2', 'background-color', '#ff00ff', {
        cwd,
        on: 'button',
        mode: 'dark',
      });
      await themeEditSet('mb2', 'border-color', '#00ff00', {
        cwd,
        on: 'text-input',
        mode: 'light',
      });
      // The same base with nothing set: what the other mode must keep.
      await themeEditNew('mb0', {cwd, like: 'neutral'});
      const layered = (/** @type {string} */ slug) => {
        const built = cssOf(slug);
        return built.includes('@layer astryx-theme')
          ? built
          : `@layer astryx-theme {\n${built}\n}`;
      };
      const h = React.createElement;
      /** The markup Core renders under a theme named `name`, in a mode. */
      const markup = (/** @type {string} */ name, /** @type {string} */ mode) =>
        renderToStaticMarkup(
          h(
            Theme,
            {theme: defineTheme({name}), mode},
            h(Pagination, {page: 2, totalPages: 5, onChange() {}}),
            h(
              'div',
              {'data-probe': 'error'},
              h(TextInput, {
                label: 'Email',
                value: '',
                onChange() {},
                status: {type: 'error', message: 'Required'},
              }),
            ),
            h(
              'div',
              {'data-probe': 'plain'},
              h(TextInput, {label: 'Name', value: '', onChange() {}}),
            ),
          ),
        );
      const browser = await chromium.launch({args: ['--no-sandbox']});
      try {
        const page = await browser.newPage();
        /** What the subjects show under a built theme in a mode. */
        const shown = async (
          /** @type {string} */ name,
          /** @type {string} */ mode,
        ) => {
          await page.setContent(
            `<!doctype html><html><head><style>${resetCss}\n${coreCss}\n${layered(name)}</style></head><body>${markup(name, mode)}</body></html>`,
          );
          return page.$eval('body', body => {
            // Through the page's own window: this file lints with Node globals.
            const view = /** @type {any} */ (body.ownerDocument.defaultView);
            const at = (/** @type {string} */ s) =>
              view.getComputedStyle(body.querySelector(s));
            return {
              current: at('[aria-current="page"]').backgroundColor,
              ghost: at(
                '.astryx-button[data-variant="ghost"]:not([aria-current])',
              ).backgroundColor,
              error: at('[data-probe=error] .astryx-text-input').borderTopColor,
              plain: at('[data-probe=plain] .astryx-text-input').borderTopColor,
            };
          });
        };
        const coreLight = await shown('mb0', 'light');
        const coreDark = await shown('mb0', 'dark');
        const light = await shown('mb2', 'light');
        const dark = await shown('mb2', 'dark');
        expect(light.current).toBe(coreLight.current);
        expect(light.plain).toBe('rgb(0, 255, 0)');
        expect(dark.ghost).toBe('rgb(255, 0, 255)');
        expect(dark.error).toBe(coreDark.error);
      } finally {
        await browser.close();
      }
    },
    240_000,
  );
});
