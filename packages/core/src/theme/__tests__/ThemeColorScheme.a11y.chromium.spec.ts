// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/theme/Theme ^packages/build/src/source-stylesheet ^scripts/build-css ^apps/storybook/stories/ThemeColorScheme

/**
 * @file ThemeColorScheme.a11y.chromium.spec.ts
 * @input The Core/Themes/ColorScheme story in a built Storybook, with the
 *   toolbar theme set to none, in Chromium
 * @output Real-engine proof that a system Theme takes the scheme of the page
 *   root, so a host that forces the root dark gets dark inside the Theme;
 *   that the root follows the reader's preference with and without reset.css;
 *   and that a system Theme under a Theme that forces light follows the
 *   reader's preference
 * @position Run with `pnpm test:a11y-contract`. Which scheme an element
 *   resolves in needs a real engine.
 */

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-themes-colorscheme--cases';
/** Core's built stylesheet, which an app without reset.css still loads. */
const ASTRYX_CSS_FILE = fileURLToPath(
  new URL('../../../dist/astryx.css', import.meta.url),
);
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
 * reset.css and the host make it. Without reset.css, the page loads Core's
 * built stylesheet instead, as an app that skips reset.css does (Storybook
 * compiles the components' styles itself).
 */
async function openStory(
  page: Page,
  {
    withoutReset = false,
    hostScheme,
  }: {withoutReset?: boolean; hostScheme?: string} = {},
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:none`,
  );
  await page.locator('[data-probe="root-system"]').waitFor();
  if (withoutReset) {
    if (!fs.existsSync(ASTRYX_CSS_FILE)) {
      throw new Error(
        'Build Core first: pnpm -F @astryxdesign/core build:css writes dist/astryx.css.',
      );
    }
    await page.addStyleTag({content: fs.readFileSync(ASTRYX_CSS_FILE, 'utf8')});
  }
  await page.evaluate(
    ({withoutReset: dropReset, hostScheme: forced}) => {
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
      if (forced != null) {
        const style = document.createElement('style');
        style.textContent = `:root { color-scheme: ${forced}; }`;
        document.head.append(style);
      }
    },
    {withoutReset, hostScheme},
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
