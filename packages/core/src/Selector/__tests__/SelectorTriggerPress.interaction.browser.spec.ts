// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectorTriggerPress.interaction.browser.spec.ts
 * @input The ghost and secondary variant stories of Selector, MultiSelector
 *   and ComplexSelector in a built Storybook.
 * @output Real-engine proof that a mouse or finger press on a Selector-family
 *   trigger paints the pressed tint and never scales the trigger, with motion
 *   and under Reduce Motion.
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
import {touchDriver} from '@astryxdesign/interaction-harness';

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

type PressInput = 'mouse' | 'finger';

/**
 * Holds a press on the trigger and reads, while it is held: the transforms on
 * the trigger and its three nearest ancestors, and whether the pressable box
 * paints the pressed tint (its background image differs from rest).
 */
async function whilePressed(
  page: Page,
  input: PressInput,
): Promise<{transforms: string[]; isTinted: boolean}> {
  const trigger = page.locator('#storybook-root [role="combobox"]').first();
  await expect(trigger).toBeVisible();
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger box');
  }
  const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  const tintOf = () =>
    trigger.evaluate(node => {
      const pressable = node.closest('[data-astryx-pressable]') ?? node;
      return getComputedStyle(pressable).backgroundImage;
    });
  const rest = await tintOf();
  let release: () => Promise<void>;
  if (input === 'mouse') {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    // A release away from the trigger, so the list does not open.
    release = async () => {
      await page.mouse.move(2, 2);
      await page.mouse.up();
    };
  } else {
    const finger = await (await touchDriver(page)).press(at);
    // A lift after the finger leaves the trigger, so the list does not open.
    release = async () => {
      await finger.move({x: 2, y: 2});
      await finger.lift();
    };
  }
  await expect
    .poll(
      () =>
        trigger.evaluate(
          node => node.closest('[data-astryx-press="on"]') != null,
        ),
      {message: 'the press reaches the trigger'},
    )
    .toBe(true);
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
  const isTinted = (await tintOf()) !== rest;
  await release();
  return {transforms, isTinted};
}

for (const input of ['mouse', 'finger'] as const) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    for (const story of STORIES) {
      test(`a ${input} press on ${story} paints and does not scale the trigger (${reducedMotion})`, async ({
        page,
      }) => {
        await page.emulateMedia({reducedMotion});
        await page.goto(
          `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
        );
        const pressed = await whilePressed(page, input);
        expect(pressed.isTinted, 'the pressed tint paints').toBe(true);
        expect(pressed.transforms).toEqual([
          'none none',
          'none none',
          'none none',
          'none none',
        ]);
      });
    }
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
