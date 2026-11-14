// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file colorModeBlocks.a11y.chromium.spec.ts
 * @input Core's built stylesheet, its reset stylesheet, and server-rendered
 *   Core components under a theme with `@light`/`@dark` blocks
 * @output Real-Chromium evidence that a color-mode block applies only where
 *   the element's color mode is that mode (the root's mode, the system
 *   preference, a nested Theme, a MediaTheme surface) and, in the other
 *   mode, leaves the rules Core gives a component in context as they were:
 *   the current page in Pagination and a text field's status border
 * @position Browser evidence for color-mode blocks in component overrides
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {Pagination, TextInput} from '@astryxdesign/core';
import {
  MediaTheme,
  Theme,
  defineTheme,
  generateThemeCSS,
} from '@astryxdesign/core/theme';
import type {ComponentStyleMap, DefinedTheme} from '@astryxdesign/core/theme';

const require = createRequire(import.meta.url);
const CORE_CSS = fs.readFileSync(
  require.resolve('@astryxdesign/core/astryx.css'),
  'utf8',
);
const RESET_CSS = fs.readFileSync(
  require.resolve('@astryxdesign/core/reset.css'),
  'utf8',
);

const h = React.createElement;
type Mode = 'light' | 'dark' | 'system';

const MAGENTA = 'rgb(255, 0, 255)';
const GREEN = 'rgb(0, 255, 0)';

/** The components the cases measure, as Core renders them. */
const subjects = () => [
  h(
    'div',
    {key: 'p', 'data-probe': 'pagination'},
    h(Pagination, {page: 2, totalPages: 5, onChange() {}}),
  ),
  h(
    'div',
    {key: 'e', 'data-probe': 'error'},
    h(TextInput, {
      label: 'Email',
      value: '',
      onChange() {},
      status: {type: 'error', message: 'Required'},
    }),
  ),
  h(
    'div',
    {key: 'i', 'data-probe': 'plain'},
    h(TextInput, {label: 'Name', value: '', onChange() {}}),
  ),
];

function themeOf(components?: ComponentStyleMap): DefinedTheme {
  return defineTheme({name: 'modes', components});
}

/** Server-render the subjects under the theme and load them with Core's CSS. */
async function mount(
  page: Page,
  theme: DefinedTheme,
  body: (theme: DefinedTheme) => React.ReactElement,
): Promise<void> {
  const markup = renderToStaticMarkup(body(theme));
  await page.setContent(`<!doctype html><html><head><style>
${RESET_CSS}
${CORE_CSS}
@layer astryx-theme {
${generateThemeCSS(theme).component}
}
</style></head><body>${markup}</body></html>`);
}

const inMode = (mode: Mode) => (theme: DefinedTheme) =>
  h(Theme, {theme, mode}, ...subjects());

interface Seen {
  current: string;
  ghost: string;
  errorBorder: string;
  plainBorder: string;
}

/** What the subjects inside `scope` show. */
async function seen(page: Page, scope = 'body'): Promise<Seen> {
  return page.evaluate(root => {
    const at = document.querySelector(root) ?? document.body;
    const bg = (sel: string) =>
      getComputedStyle(at.querySelector(sel) as Element).backgroundColor;
    const border = (sel: string) =>
      getComputedStyle(at.querySelector(sel) as Element).borderTopColor;
    return {
      current: bg('[data-probe=pagination] [aria-current="page"]'),
      ghost: bg(
        '[data-probe=pagination] .astryx-button[data-variant="ghost"]:not([aria-current])',
      ),
      errorBorder: border('[data-probe=error] .astryx-text-input'),
      plainBorder: border('[data-probe=plain] .astryx-text-input'),
    };
  }, scope);
}

/** What the subjects show under a theme that sets nothing, in a mode. */
async function baseline(page: Page, mode: Mode): Promise<Seen> {
  await mount(page, themeOf(), inMode(mode));
  return seen(page);
}

const DARK_GHOST = themeOf({
  button: {'variant:ghost': {'@dark': {backgroundColor: MAGENTA}}},
});
const LIGHT_BORDER = themeOf({
  'text-input': {base: {'@light': {borderColor: GREEN}}},
});

test.describe('color-mode blocks', () => {
  test('a dark block leaves the light current page as Core draws it', async ({
    page,
  }) => {
    const light = await baseline(page, 'light');
    await mount(page, DARK_GHOST, inMode('light'));
    expect((await seen(page)).current).toBe(light.current);
    await mount(page, DARK_GHOST, inMode('dark'));
    expect((await seen(page)).ghost).toBe(MAGENTA);
  });

  test('a light block leaves the dark status border as Core draws it', async ({
    page,
  }) => {
    const dark = await baseline(page, 'dark');
    await mount(page, LIGHT_BORDER, inMode('dark'));
    const shown = await seen(page);
    expect(shown.errorBorder).toBe(dark.errorBorder);
    expect(shown.plainBorder).toBe(dark.plainBorder);
    await mount(page, LIGHT_BORDER, inMode('light'));
    expect((await seen(page)).plainBorder).toBe(GREEN);
  });

  test('follow the system preference when the theme sets no mode', async ({
    page,
  }) => {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({colorScheme: scheme});
      await mount(page, DARK_GHOST, inMode('system'));
      const ghost = (await seen(page)).ghost;
      if (scheme === 'dark') {
        expect(ghost).toBe(MAGENTA);
      } else {
        expect(ghost).not.toBe(MAGENTA);
      }
    }
  });

  test('follow a nested Theme and a MediaTheme surface', async ({page}) => {
    await mount(page, DARK_GHOST, theme =>
      h(
        Theme,
        {theme, mode: 'dark'},
        h('section', {id: 'outer'}, ...subjects()),
        h(
          Theme,
          {theme, mode: 'light'},
          h('section', {id: 'nested'}, ...subjects()),
        ),
        h(
          MediaTheme,
          {mode: 'light'},
          h('section', {id: 'surface'}, ...subjects()),
        ),
      ),
    );
    expect((await seen(page, '#outer')).ghost).toBe(MAGENTA);
    expect((await seen(page, '#nested')).ghost).not.toBe(MAGENTA);
    expect((await seen(page, '#surface')).ghost).not.toBe(MAGENTA);
  });
});
