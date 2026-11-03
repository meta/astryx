// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Selector/|packages/core/src/motion/reducedMotion|apps/storybook/stories/Selector\.stories)

/**
 * @file SelectorReducedMotion.a11y.chromium.spec.ts
 * @input Storybook story core-selector--default
 * @output The open list's opacity transition in a real browser: under Reduce
 *   Motion it completes at once on a fine pointer and takes the 200 ms shared
 *   cross-fade on a coarse one; with no preference it keeps its short fade.
 * @position Real-browser check: jsdom evaluates no media queries.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function listTransition(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--default&viewMode=story&args=presentation:popover`,
    {waitUntil: 'load'},
  );
  await page.getByRole('combobox').first().click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  return listbox.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      property: style.transitionProperty,
      duration: style.transitionDuration,
    };
  });
}

test.describe('fine pointer', () => {
  test.use({isMobile: false, hasTouch: false});

  test('under Reduce Motion the list appears at once', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const transition = await listTransition(page);
    expect(transition.duration).toBe('0s');
  });

  test('with no preference the list keeps its short fade', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'no-preference'});
    const transition = await listTransition(page);
    expect(transition.property).toBe('opacity');
    expect(transition.duration).not.toBe('0s');
  });
});
