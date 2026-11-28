// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/theme/(Theme|syntax/)|^packages/core/src/privateAttributes/(themeColors|syntaxTheme)|^packages/core/src/CodeBlock/highlightStyles|^apps/storybook/stories/CodeTheme\.stories

/**
 * @file ThemeNestedSyntaxValues.a11y.chromium.spec.ts
 * @input The CodeTheme "Nested Themes" story in a built Storybook, in
 *   Chromium, with stylesheets served as built and as a CSS build that lowers
 *   `light-dark()` serves them
 * @output Real-engine proof that code inside a nested Theme whose theme sets
 *   Core color tokens takes that Theme's syntax colors, that a nested theme's
 *   own syntax palette still wins on its wrapper, and that a components-only
 *   nested theme, a SyntaxTheme inside a Theme, and a SyntaxTheme around a
 *   Theme keep theirs
 * @position Run with `pnpm test:a11y-contract`. Where a custom property
 *   resolves needs a real engine.
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

let storybook: StaticServer;
let storyId: string;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  // A story's id carries its package, which can change; find it by name.
  const index = (await (
    await fetch(`${storybook.origin}/index.json`)
  ).json()) as {entries: Record<string, unknown>};
  const id = Object.keys(index.entries).find(entry =>
    entry.endsWith('codetheme--nested-themes'),
  );
  if (id == null) {
    throw new Error('No story ending in codetheme--nested-themes in the build');
  }
  storyId = id;
});
test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page, lowered: boolean): Promise<void> {
  if (lowered) {
    await page.route('**/*.css', async route => {
      const response = await route.fetch();
      await route.fulfill({response, body: lower(await response.text())});
    });
  }
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story&globals=colorMode:light;astryxTheme:neutral`,
  );
  await page.locator('#storybook-root code').first().waitFor();
  if (lowered) {
    // Themes and the syntax rule are injected at run time; lower those too,
    // as a build lowers a built theme's stylesheet.
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
}

/**
 * The color a property resolves to inside the code of the block with this
 * title: the syntax keyword color, or a Core token for comparison.
 */
async function colorIn(
  page: Page,
  title: string,
  property: string,
): Promise<string> {
  return page.evaluate(
    ([found, name]) => {
      const block = Array.from(
        document.querySelectorAll('.astryx-code-block'),
      ).find(element => element.textContent?.includes(found));
      const code = block?.querySelector('code');
      if (code == null) {
        throw new Error(`No code block titled ${found}`);
      }
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      code.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    },
    [title, property] as const,
  );
}

const KEYWORD = '--color-syntax-keyword';
const DRACULA_KEYWORD = 'rgb(255, 121, 198)';
const NORD_KEYWORD = 'rgb(129, 161, 193)';

for (const lowered of [false, true]) {
  const build = lowered
    ? 'a build that lowers light-dark()'
    : 'the build as shipped';

  test(`in ${build}, code in a nested theme with its own accent takes that accent`, async ({
    page,
  }) => {
    await openStory(page, lowered);
    expect(
      await colorIn(page, 'Nested theme with its own accent', KEYWORD),
    ).toBe('rgb(200, 0, 100)');
  });

  test(`in ${build}, code in a nested dark theme takes the dark side of its accent pair`, async ({
    page,
  }) => {
    await openStory(page, lowered);
    expect(
      await colorIn(
        page,
        'Nested dark theme with its own accent pair',
        KEYWORD,
      ),
    ).toBe('rgb(250, 200, 0)');
  });

  test(`in ${build}, a nested theme's own syntax palette wins over the built-in tokens on its wrapper`, async ({
    page,
  }) => {
    await openStory(page, lowered);
    expect(
      await colorIn(page, 'Nested theme with its own syntax palette', KEYWORD),
    ).toBe(DRACULA_KEYWORD);
  });

  test(`in ${build}, a color-setting theme inside a theme with a syntax palette takes its own colors`, async ({
    page,
  }) => {
    await openStory(page, lowered);
    expect(
      await colorIn(page, 'Color-setting theme inside dark-dev', KEYWORD),
    ).toBe('rgb(200, 0, 100)');
  });

  test(`in ${build}, a components-only theme keeps the syntax colors of the theme around it`, async ({
    page,
  }) => {
    await openStory(page, lowered);
    expect(
      await colorIn(page, 'Components-only theme inside dark-dev', KEYWORD),
    ).toBe(DRACULA_KEYWORD);
  });

  test(`in ${build}, a SyntaxTheme inside a theme and a SyntaxTheme around one keep their colors`, async ({
    page,
  }) => {
    await openStory(page, lowered);
    expect(await colorIn(page, 'SyntaxTheme inside a theme', KEYWORD)).toBe(
      NORD_KEYWORD,
    );
    expect(await colorIn(page, 'Theme inside a SyntaxTheme', KEYWORD)).toBe(
      NORD_KEYWORD,
    );
  });
}
