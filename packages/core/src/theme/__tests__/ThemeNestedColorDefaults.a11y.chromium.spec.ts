// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/theme/(Theme|tokens|themeColorDefaults)|^apps/storybook/stories/(ListInput|CodeTheme)\.stories

/**
 * @file ThemeNestedColorDefaults.a11y.chromium.spec.ts
 * @input The ListInput theme matrix story (a light Theme, a dark Theme, and a
 *   light Theme nested in the dark one) and the CodeTheme story whose theme
 *   sets no accent, in a built Storybook, in Chromium, with stylesheets served
 *   as built and as a CSS build that lowers `light-dark()` serves them
 * @output Real-engine proof that Core's color defaults inside a nested Theme
 *   follow that Theme's color mode where the build lowers `light-dark()`: a
 *   Tooltip in the dark pane keeps 4.5:1 text, and a theme with no accent of
 *   its own draws a focus ring that contrasts with its surface; and that a
 *   theme's own token value still applies over the defaults
 * @position Run with `pnpm test:a11y-contract`. Which color mode a custom
 *   property resolves in needs a real engine.
 */

import {createRequire} from 'node:module';
import path from 'node:path';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

// lightningcss is the CSS transformer Vite uses. Core does not depend on it;
// @astryxdesign/build does, so it resolves from that package.
interface LightningCss {
  transform(options: {
    filename: string;
    code: Uint8Array;
    targets: Record<string, number>;
    errorRecovery: boolean;
  }): {code: Uint8Array};
}
const lightningcss = createRequire(path.resolve('packages/build/package.json'))(
  'lightningcss',
) as LightningCss;

// Browsers older than these get `light-dark()` lowered into custom-property
// toggles, as a Vite or Lightning CSS build with older targets emits.
const LOWERED_TARGETS = {
  chrome: 100 << 16,
  firefox: 100 << 16,
  safari: 15 << 16,
};

function lower(css: string): string {
  return lightningcss
    .transform({
      filename: 'consumer.css',
      code: Buffer.from(css),
      targets: LOWERED_TARGETS,
      errorRecovery: true,
    })
    .code.toString();
}

const THEME_TEXT = 'rgb(1, 2, 3)';

let storybook: StaticServer;
let stories: Record<'matrix' | 'codeTheme', string>;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  // A story's id carries its package, which can change; find it by name.
  const index = (await (
    await fetch(`${storybook.origin}/index.json`)
  ).json()) as {entries: Record<string, unknown>};
  const find = (suffix: string) => {
    const id = Object.keys(index.entries).find(entry => entry.endsWith(suffix));
    if (id == null) {
      throw new Error(`No story ending in ${suffix} in the build`);
    }
    return id;
  };
  stories = {
    matrix: find('listinput--theme-matrix'),
    codeTheme: find('codetheme--theme-with-syntax-defaults'),
  };
});
test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(
  page: Page,
  storyId: string,
  {lowered, themeText = false}: {lowered: boolean; themeText?: boolean},
): Promise<void> {
  if (lowered) {
    await page.route('**/*.css', async route => {
      const response = await route.fetch();
      await route.fulfill({response, body: lower(await response.text())});
    });
  }
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story&globals=colorMode:light;astryxTheme:neutral`,
  );
  await page.locator('#storybook-root button:visible').first().waitFor();
  if (lowered) {
    // Themes inject their rules at run time; lower those too, as a build
    // lowers a built theme's stylesheet. The page root's scheme comes from a
    // stylesheet, as in an app.
    const styles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('style'), s => s.textContent ?? ''),
    );
    await page.evaluate(
      texts => {
        Array.from(document.querySelectorAll('style')).forEach((s, i) => {
          if (texts[i] != null && texts[i] !== s.textContent) {
            s.textContent = texts[i];
          }
        });
      },
      styles.map(text => (text.includes('light-dark(') ? lower(text) : text)),
    );
    await page.addStyleTag({content: lower(':root { color-scheme: light; }')});
  }
  if (themeText) {
    // A theme that sets the primary text color, as theme rules declare it.
    const rule = `@layer astryx-theme { @scope ([data-astryx-theme="neutral"]) to ([data-astryx-theme]) { :scope { --color-text-primary: ${THEME_TEXT}; } } }`;
    await page.addStyleTag({content: lowered ? lower(rule) : rule});
  }
}

function contrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The element's color and the first opaque background at or above it. */
async function colors(
  page: Page,
  selector: string,
): Promise<{color: string; background: string}> {
  return page.evaluate(found => {
    const element = document.querySelector(found) as HTMLElement;
    let background = 'rgb(255, 255, 255)';
    for (let node: Element | null = element; node; node = node.parentElement) {
      const value = getComputedStyle(node).backgroundColor;
      if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
        background = value;
        break;
      }
    }
    return {color: getComputedStyle(element).color, background};
  }, selector);
}

for (const lowered of [false, true]) {
  const build = lowered
    ? 'a build that lowers light-dark()'
    : 'the build as shipped';

  test(`in ${build}, a Tooltip in a dark Theme keeps its text at 4.5:1`, async ({
    page,
  }) => {
    await openStory(page, stories.matrix, {lowered});
    await page
      .locator('[data-theme="dark"]')
      .getByRole('button', {name: 'Remove tag 1'})
      .first()
      .hover();
    await page.getByRole('tooltip').waitFor();
    const {color, background} = await colors(page, '[role="tooltip"]');
    expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5);
  });

  test(`in ${build}, a dark Theme whose theme sets no accent draws a focus ring at 3:1`, async ({
    page,
  }) => {
    await openStory(page, stories.codeTheme, {lowered});
    const copy = page.getByRole('button', {name: /copy/i}).first();
    await copy.waitFor();
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      if (await copy.evaluate(element => element === document.activeElement)) {
        break;
      }
    }
    const ring = await copy.evaluate(element => {
      let surface = 'rgb(255, 255, 255)';
      for (let node = element.parentElement; node; node = node.parentElement) {
        const value = getComputedStyle(node).backgroundColor;
        if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
          surface = value;
          break;
        }
      }
      const style = getComputedStyle(element);
      return {
        visible: element.matches(':focus-visible'),
        outline: style.outlineColor,
        surface,
      };
    });
    expect(ring.visible).toBe(true);
    expect(contrast(ring.outline, ring.surface)).toBeGreaterThanOrEqual(3);
  });

  test(`in ${build}, a theme's own token value still applies over the defaults`, async ({
    page,
  }) => {
    await openStory(page, stories.matrix, {lowered, themeText: true});
    const panes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-theme]'), pane => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-text-primary)';
        pane.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      }),
    );
    expect(panes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(panes)).toEqual(new Set([THEME_TEXT]));
  });
}
