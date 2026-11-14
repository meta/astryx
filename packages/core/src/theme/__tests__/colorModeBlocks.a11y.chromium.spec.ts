// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file colorModeBlocks.a11y.chromium.spec.ts
 * @input The ColorModeBlocks Storybook story: Core's Pagination and
 *   TextInput under a theme with nothing set and under a theme with
 *   `@light`/`@dark` blocks
 * @output Real-Chromium evidence that a color-mode block applies only where
 *   the element's color mode is that mode (the Theme's mode, the system
 *   preference for any other mode, a nested Theme, the nearest MediaTheme
 *   surface), pseudo-classes included, and, in the other
 *   mode, leaves the current page and the status border as Core draws them
 * @position Browser evidence for color-mode blocks in component overrides
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-themes-colormodeblocks--cases';
const MAGENTA = 'rgb(255, 0, 255)';
const GREEN = 'rgb(0, 255, 0)';
const PRESSED = 'rgb(85, 0, 85)';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await page.locator('[data-case="alternating-dark-again"]').waitFor();
}

interface Shown {
  current: string;
  ghost: string;
  error: string;
  plain: string;
}

/** What the subjects of one case show. */
async function shown(page: Page, id: string): Promise<Shown> {
  return page.locator(`[data-case="${id}"]`).evaluate(root => {
    const at = (selector: string) => {
      const element = root.querySelector(selector);
      if (!element) {
        throw new Error(`no ${selector}`);
      }
      return getComputedStyle(element);
    };
    return {
      current: at('[aria-current="page"]').backgroundColor,
      ghost: at('.astryx-button[data-variant="ghost"]:not([aria-current])')
        .backgroundColor,
      error: at('[data-probe="error"] .astryx-text-input').borderTopColor,
      plain: at('[data-probe="plain"] .astryx-text-input').borderTopColor,
    };
  });
}

test.describe('color-mode blocks', () => {
  test('a dark block leaves the light current page as Core draws it', async ({
    page,
  }) => {
    await openStory(page);
    const plain = await shown(page, 'plain-light');
    const light = await shown(page, 'blocks-light');
    expect(light.current).toBe(plain.current);
    expect(light.ghost).toBe(plain.ghost);
    expect((await shown(page, 'blocks-dark')).ghost).toBe(MAGENTA);
  });

  test('a light block leaves the dark status border as Core draws it', async ({
    page,
  }) => {
    await openStory(page);
    const plain = await shown(page, 'plain-dark');
    const dark = await shown(page, 'blocks-dark');
    expect(dark.error).toBe(plain.error);
    expect(dark.plain).toBe(plain.plain);
    expect((await shown(page, 'blocks-light')).plain).toBe(GREEN);
  });

  test('follow the system preference when the theme sets no mode', async ({
    page,
  }) => {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({colorScheme: scheme});
      await openStory(page);
      const system = await shown(page, 'blocks-system');
      expect(system.ghost === MAGENTA, scheme).toBe(scheme === 'dark');
      expect(system.plain === GREEN, scheme).toBe(scheme === 'light');
    }
  });

  test('apply a pseudo-class in a block after its mode conditions', async ({
    page,
  }) => {
    await openStory(page);
    const ghost = page.locator(
      '[data-case="blocks-dark"] .astryx-button[data-variant="ghost"]:not([aria-current])',
    );
    const box = await ghost.first().boundingBox();
    if (!box) {
      throw new Error('no ghost button');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressed = await ghost
      .first()
      .evaluate(element => getComputedStyle(element).backgroundColor);
    await page.mouse.up();
    expect(pressed).toBe(PRESSED);
  });

  test('follow the system preference for a mode that is neither', async ({
    page,
  }) => {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({colorScheme: scheme});
      await openStory(page);
      const other = await shown(page, 'blocks-other-mode');
      expect(other.ghost === MAGENTA, scheme).toBe(scheme === 'dark');
      expect(other.plain === GREEN, scheme).toBe(scheme === 'light');
    }
  });

  test('follow the nearest of alternating surfaces', async ({page}) => {
    await openStory(page);
    for (const [id, dark] of [
      ['alternating-dark', true],
      ['alternating-light', false],
      ['alternating-dark-again', true],
    ] as const) {
      const inner = await shown(page, id);
      expect(inner.ghost === MAGENTA, id).toBe(dark);
      expect(inner.plain === GREEN, id).toBe(!dark);
    }
  });

  test('follow a nested Theme and a MediaTheme surface', async ({page}) => {
    await openStory(page);
    for (const id of ['nested', 'surface']) {
      const inner = await shown(page, id);
      expect(inner.ghost, id).not.toBe(MAGENTA);
      expect(inner.plain, id).toBe(GREEN);
    }
  });
});
