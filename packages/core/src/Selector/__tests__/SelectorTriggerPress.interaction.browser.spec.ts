// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectorTriggerPress.interaction.browser.spec.ts
 * @input The ghost and secondary variant stories of Selector, MultiSelector
 *   and ComplexSelector in a built Storybook.
 * @output Real-engine proof that a press on a Selector-family trigger paints
 *   and never scales the trigger, with motion and under Reduce Motion.
 * @position The triggers use the press-feedback record's momentary-control
 *   recipe. Their records state no press scale, and under reduced motion no
 *   press scales (`design:reduced-motion` DR1).
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

const STORIES = [
  'core-selector--ghost-variant',
  'core-selector--secondary-variant',
  'core-multiselector--ghost-variant',
  'core-multiselector--secondary-variant',
  'core-complexselector--secondary-variant',
  'core-complexselector--controlled-toolbar-trigger',
];

/** The transforms on the trigger and its three nearest ancestors. */
async function transformsWhilePressed(page: Page): Promise<string[]> {
  const trigger = page.locator('#storybook-root [role="combobox"]').first();
  await expect(trigger).toBeVisible();
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger box');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Longer than the press transition, so a scale would have landed.
  await page.waitForTimeout(350);
  const transforms = await trigger.evaluate(node => {
    const out: string[] = [];
    for (
      let element: Element | null = node, depth = 0;
      element != null && depth < 4;
      element = element.parentElement, depth++
    ) {
      const style = getComputedStyle(element);
      out.push(`${style.transform} ${style.scale}`);
    }
    return out;
  });
  // A release away from the trigger, so the list does not open.
  await page.mouse.move(2, 2);
  await page.mouse.up();
  return transforms;
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  for (const story of STORIES) {
    test(`a mouse press on ${story} does not scale the trigger (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({reducedMotion});
      await page.goto(
        `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
      );
      expect(await transformsWhilePressed(page)).toEqual([
        'none none',
        'none none',
        'none none',
        'none none',
      ]);
    });
  }
}

// The rule a theme builds for `--state expanded --on selector`
// (theme-states-core-paints-aria.test.mjs checks the built selector).
const OPEN_SELECTOR_RULE =
  '.astryx-selector[data-expanded="expanded"] { background-color: rgb(220, 38, 38); }';

test("a theme's expanded state paints the open trigger only", async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--secondary-variant&viewMode=story`,
  );
  await page.addStyleTag({content: OPEN_SELECTOR_RULE});
  const trigger = page.locator('#storybook-root [role="combobox"]').first();
  const box = page.locator('#storybook-root .astryx-selector').first();
  await expect(trigger).toBeVisible();
  const fill = async () =>
    box.evaluate(node => getComputedStyle(node).backgroundColor);
  expect(await fill()).not.toBe('rgb(220, 38, 38)');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  // The trigger's own background-color transition runs, so poll.
  await expect.poll(fill).toBe('rgb(220, 38, 38)');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(fill).not.toBe('rgb(220, 38, 38)');
});
