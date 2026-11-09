// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonTextSize.interaction.browser.spec.ts
 * @input The built Button stories, with the button labels' text enlarged
 *   while the element sizes stay put, as iOS Dynamic Type does
 * @output Real-browser evidence that a labelled button grows with its label,
 *   so the label stays inside its own tap target, and that the default text
 *   size keeps every button at its element size
 * @position Browser proof of Button FR4 (AST-102 FR4)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

async function openStory(
  page: Page,
  story: string,
  theme = 'neutral',
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-button--${story}&viewMode=story&globals=astryxTheme:${theme}`,
  );
  await page.locator('#storybook-root button').first().waitFor();
}

/** Each labelled button's box against its label's line box. */
async function readButtons(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#storybook-root button')]
      .filter(button => (button.textContent ?? '').trim() !== '')
      .map(button => {
        const range = document.createRange();
        range.selectNodeContents(button);
        const label = range.getBoundingClientRect();
        const box = button.getBoundingClientRect();
        return {
          name: (button.textContent ?? '').trim(),
          height: box.height,
          above: box.top - label.top,
          below: label.bottom - box.bottom,
        };
      }),
  );
}

// Each theme's labelled buttons keep exactly their element heights at the
// default text size, block padding included.
for (const theme of ['neutral', 'butter']) {
  test(`at the default text size each size keeps its element height: ${theme}`, async ({
    page,
  }) => {
    await openStory(page, 'size-variants', theme);
    const fits = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#storybook-root button')].map(
        button => {
          const probe = document.createElement('div');
          probe.style.height = `var(--size-element-${button.dataset.size})`;
          button.parentElement?.append(probe);
          const expected = probe.getBoundingClientRect().height;
          probe.remove();
          return (
            expected > 0 &&
            Math.abs(button.getBoundingClientRect().height - expected) < 0.5
          );
        },
      ),
    );
    expect(fits).toEqual([true, true, true]);
  });
}

for (const story of ['primary', 'size-variants', 'icon-with-text']) {
  test(`a label larger than the element size grows its button: ${story}`, async ({
    page,
  }) => {
    await openStory(page, story);
    // Grows the labels' text, but not the element sizes, the way iOS Dynamic
    // Type grows theme text at its accessibility sizes.
    await page.addStyleTag({
      content: '#storybook-root button { font-size: 40px; line-height: 60px; }',
    });
    const buttons = await readButtons(page);
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.above, button.name).toBeLessThanOrEqual(1);
      expect(button.below, button.name).toBeLessThanOrEqual(1);
    }
  });
}
