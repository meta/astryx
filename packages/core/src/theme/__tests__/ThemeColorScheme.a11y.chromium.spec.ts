// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/theme/Theme ^packages/build/src/source-stylesheet ^scripts/build-css ^apps/storybook/stories/ThemeColorScheme

/**
 * @file ThemeColorScheme.a11y.chromium.spec.ts
 * @input The Core/Themes/ColorScheme story in a built Storybook, with the
 *   toolbar theme set to none, in Chromium
 * @output Real-engine proof that a system Theme takes the scheme of the page
 *   root, so a host that forces the root dark gets dark inside the Theme and
 *   from `useTheme()`; that the root follows the reader's preference with and
 *   without reset.css; that a system Theme under a Theme that forces light
 *   follows the reader's preference; and that a root Theme that forces dark
 *   keeps the page dark when Core's stylesheet loads after reset.css
 * @position Run with `pnpm test:a11y-contract`. Which scheme an element
 *   resolves in needs a real engine.
 */

import {createRequire} from 'node:module';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-themes-colorscheme--cases';
const FORCED_ROOT_STORY = 'core-themes-colorscheme--forced-root';
/**
 * The layer order and the root block Core's stylesheet begins with, which an
 * app without reset.css still loads. Storybook compiles the components'
 * styles itself, so the page loads them here.
 */
const {LAYER_ORDER, CORE_ROOT_BLOCK} = createRequire(import.meta.url)(
  '../../../../build/src/source-stylesheet.js',
) as {LAYER_ORDER: string; CORE_ROOT_BLOCK: string};
const LIGHT = 'rgb(1, 2, 3)';
const DARK = 'rgb(4, 5, 6)';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

/**
 * Open the story. Storybook pins the page root and the story's frame to the
 * toolbar's scheme; that is taken away, so the root is what Core's CSS,
 * reset.css and the host make it. Without reset.css, the page loads the
 * root block of Core's stylesheet instead, as an app that skips reset.css
 * does. A host scheme arrives in a style element, or with `hostLink` in a
 * linked stylesheet that applies when it loads.
 */
async function openStory(
  page: Page,
  {
    story = STORY,
    withoutReset = false,
    withCoreStylesheet = withoutReset,
    hostScheme,
    hostLink = false,
  }: {
    story?: string;
    withoutReset?: boolean;
    withCoreStylesheet?: boolean;
    hostScheme?: string;
    hostLink?: boolean;
  } = {},
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=astryxTheme:none`,
  );
  await page.locator('[data-probe]').first().waitFor();
  if (withCoreStylesheet) {
    await page.addStyleTag({content: `${LAYER_ORDER}\n${CORE_ROOT_BLOCK}`});
  }
  await page.evaluate(
    ({withoutReset: dropReset, hostScheme: forced, hostLink: linked}) => {
      document.documentElement.style.removeProperty('color-scheme');
      for (const element of document.querySelectorAll<HTMLElement>(
        '[style*="color-scheme"]',
      )) {
        element.style.removeProperty('color-scheme');
      }
      for (const style of Array.from(document.querySelectorAll('style'))) {
        if (
          /^\s*:root\s*\{\s*color-scheme:\s*light;?\s*\}\s*$/.test(
            style.textContent ?? '',
          )
        ) {
          style.remove();
        }
      }
      if (dropReset) {
        for (const sheet of Array.from(document.styleSheets)) {
          const text = Array.from(sheet.cssRules, rule => rule.cssText).join(
            '\n',
          );
          // reset.css: its box-sizing rule for every element.
          if (text.includes(':where(*)') && text.includes('box-sizing')) {
            sheet.disabled = true;
          }
        }
      }
      if (forced != null && linked) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `data:text/css,${encodeURIComponent(`:root { color-scheme: ${forced}; }`)}`;
        document.head.append(link);
      } else if (forced != null) {
        const style = document.createElement('style');
        style.textContent = `:root { color-scheme: ${forced}; }`;
        document.head.append(style);
      }
    },
    {withoutReset, hostScheme, hostLink},
  );
}

/** Each probe's colour: LIGHT or DARK, the scheme it resolves in. */
async function schemes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Array.from(document.querySelectorAll('[data-probe]'), element => [
        element.getAttribute('data-probe') ?? '',
        getComputedStyle(element).color,
      ]),
    ),
  );
}

/** The mode `useTheme()` reports at each probe. */
async function hookModes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Array.from(document.querySelectorAll('[data-probe]'), element => [
        element.getAttribute('data-probe') ?? '',
        element.getAttribute('data-hook-mode') ?? '',
      ]),
    ),
  );
}

test.describe('the reader prefers light', () => {
  test.use({colorScheme: 'light'});

  test('a system Theme takes a dark scheme a host forces on the page root', async ({
    page,
  }) => {
    await openStory(page, {hostScheme: 'dark'});
    expect(await schemes(page)).toEqual({
      'root-system': DARK,
      'forced-light': LIGHT,
      'system-under-light': LIGHT,
      'system-under-system': DARK,
    });
    // useTheme() reads the host's root as the CSS does, once the host's
    // stylesheet arrives.
    await expect
      .poll(async () => hookModes(page))
      .toEqual({
        'root-system': 'dark',
        'forced-light': 'light',
        'system-under-light': 'light',
        'system-under-system': 'dark',
      });
  });

  test('useTheme() reads a dark scheme a host links after the page drew', async ({
    page,
  }) => {
    await openStory(page, {hostScheme: 'dark', hostLink: true});
    await expect
      .poll(async () => hookModes(page))
      .toEqual({
        'root-system': 'dark',
        'forced-light': 'light',
        'system-under-light': 'light',
        'system-under-system': 'dark',
      });
    expect(await schemes(page)).toEqual({
      'root-system': DARK,
      'forced-light': LIGHT,
      'system-under-light': LIGHT,
      'system-under-system': DARK,
    });
  });

  test('a root Theme that forces dark keeps the page dark when Core\u2019s stylesheet loads after reset.css', async ({
    page,
  }) => {
    await openStory(page, {
      story: FORCED_ROOT_STORY,
      withCoreStylesheet: true,
    });
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      ),
    ).toBe('dark');
    expect(await schemes(page)).toEqual({page: DARK, 'forced-root': DARK});
  });

  test('with no host scheme, a system Theme is light', async ({page}) => {
    await openStory(page);
    expect(await schemes(page)).toEqual({
      'root-system': LIGHT,
      'forced-light': LIGHT,
      'system-under-light': LIGHT,
      'system-under-system': LIGHT,
    });
  });
});

test.describe('the reader prefers dark', () => {
  test.use({colorScheme: 'dark'});

  for (const withoutReset of [false, true]) {
    test(`a system Theme is dark, and dark again under a forced light Theme, ${withoutReset ? 'without' : 'with'} reset.css`, async ({
      page,
    }) => {
      await openStory(page, {withoutReset});
      expect(await schemes(page)).toEqual({
        'root-system': DARK,
        'forced-light': LIGHT,
        'system-under-light': DARK,
        'system-under-system': DARK,
      });
    });
  }
});
