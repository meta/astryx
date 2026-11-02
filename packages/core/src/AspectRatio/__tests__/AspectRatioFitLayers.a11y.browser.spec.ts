// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file AspectRatioFitLayers.a11y.browser.spec.ts
 * @input The built FitModes story (its rendered markup and compiled CSS) and
 *   Tailwind's preflight.css
 * @output Browser evidence that `fit` fills the box on the documented setups
 * @position AspectRatio integration proof. Which rule sizes the child is a
 *   cascade-layer question, and only a shipping engine resolves the cascade.
 */

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const PREFLIGHT_CSS = fs.readFileSync(
  fileURLToPath(import.meta.resolve('tailwindcss/preflight.css')),
  'utf8',
);

// The layer order each setup guide declares, and the layer preflight goes in.
const TAILWIND_SETUPS = [
  {
    name: 'Tailwind v4',
    order:
      '@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;',
    preflightLayer: 'base',
  },
  {
    name: 'Tailwind v3',
    order: '@layer reset, tw-preflight, astryx-base, astryx-theme;',
    preflightLayer: 'tw-preflight',
  },
];

// A 100×100 image in a 320px-wide 16:9 box: filling the box makes it 320×180.
const IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'/%3E";

type Fit = 'cover' | 'contain';

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
 * The markup AspectRatio renders for `fit`, and every CSS rule the story
 * page loaded, taken from the built story so the classes and rules are the
 * component's real compiled output. The child image gets a fixed id, a
 * local source and any extra class.
 */
async function captureStory(page: Page, fit: Fit, mediaClass: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-aspectratio--fit-modes&viewMode=story`,
  );
  const wrapper = page.locator(`[data-astryx-aspect-ratio-override="${fit}"]`);
  await expect(wrapper).toHaveCount(1);
  return wrapper.evaluate(
    (element, {image, extraClass}) => {
      const root = element.parentElement?.cloneNode(true);
      const media =
        root instanceof HTMLElement ? root.querySelector('img') : null;
      if (!(root instanceof HTMLElement) || media == null) {
        throw new Error('FitModes no longer renders an img inside AspectRatio');
      }
      media.id = 'media';
      media.src = image;
      if (extraClass) {
        media.classList.add(extraClass);
      }
      const css = [...document.styleSheets]
        .flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText))
        .join('\n');
      return {html: root.outerHTML, css};
    },
    {image: IMAGE, extraClass: mediaClass},
  );
}

/** Re-host the captured story with `before` CSS ahead of it and `after` CSS behind it. */
async function measureMedia(
  page: Page,
  fit: Fit,
  {
    before = [],
    after = [],
    mediaClass = '',
  }: {
    before?: string[];
    after?: string[];
    mediaClass?: string;
  },
) {
  const {html, css} = await captureStory(page, fit, mediaClass);
  await page.setContent(
    `<!doctype html><div style="width: 320px">${html}</div>`,
  );
  for (const content of [...before, css, ...after]) {
    await page.addStyleTag({content});
  }
  await page.waitForFunction(
    () => (document.getElementById('media') as HTMLImageElement).complete,
  );
  return page.evaluate(() => {
    const media = document.getElementById('media');
    if (!media) {
      throw new Error('missing media');
    }
    const box = media.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      objectFit: getComputedStyle(media).objectFit,
    };
  });
}

for (const setup of TAILWIND_SETUPS) {
  for (const fit of ['cover', 'contain'] as const) {
    test(`fit="${fit}" fills the box on the ${setup.name} setup`, async ({
      page,
    }) => {
      const media = await measureMedia(page, fit, {
        before: [
          setup.order,
          `@layer ${setup.preflightLayer} { ${PREFLIGHT_CSS} }`,
        ],
      });
      expect(media).toEqual({width: 320, height: 180, objectFit: fit});
    });
  }
}

test('fit fills the box with only Astryx CSS loaded', async ({page}) => {
  const media = await measureMedia(page, 'cover', {});
  expect(media).toEqual({width: 320, height: 180, objectFit: 'cover'});
});

test('a utility class on the child still wins over fit', async ({page}) => {
  const media = await measureMedia(page, 'cover', {
    before: [TAILWIND_SETUPS[0].order, `@layer base { ${PREFLIGHT_CSS} }`],
    after: ['@layer utilities { .h-10 { height: 40px; } }'],
    mediaClass: 'h-10',
  });
  expect(media).toEqual({width: 320, height: 40, objectFit: 'cover'});
});
