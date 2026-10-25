// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file TooltipFocusReturn.a11y.chromium.spec.ts
 * @input Uses @playwright/test, the a11y-spec static Storybook server, and the
 *   checked-in TooltipFocusReturnA11y story
 * @output Real-browser evidence that closing a popover from the keyboard,
 *   which hands focus back to a trigger that carries a tooltip, neither
 *   throws nor loses the tooltip.
 * @position The half of the layer's re-entrancy rule that jsdom cannot
 *   honestly reach. Whether the engine returns focus inside `hidePopover()`,
 *   and refuses a `showPopover()` that arrives inside that window, is an
 *   engine fact (`docs/specs/AST-013/spec.md`: a browser claim is made in a
 *   browser). The Vitest cases in `Layer/useLayer.test.tsx` and
 *   `Tooltip/useTooltip.test.tsx` model that rule; this file checks it against
 *   the shipping Popover API.
 *
 * The HTML specification makes "show popover" throw while the document is
 * showing or hiding any popover. Chromium carries that rule behind the
 * `PopoverHintNewBehavior` and `PopoverHintNestedShowException` runtime
 * features, off in the Chromium build Playwright pins here, so this spec turns
 * them on: without them the nested show silently succeeds and the regression
 * is invisible. Engines that enforce the rule by default need no flag.
 *
 * SYNC: Fixture lives in
 *   /apps/storybook/stories/TooltipFocusReturnA11y.stories.tsx.
 */

import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY_ID = 'a11y-tooltip-focus-return--popover-trigger-with-tooltip';

test.use({
  launchOptions: {
    args: [
      '--enable-blink-features=PopoverHintNewBehavior,PopoverHintNestedShowException',
    ],
  },
});

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

/** Load the story and wait for the trigger the keyboard will reach. */
async function mountStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  await page
    .locator('#storybook-root')
    .getByRole('button', {name: 'Options'})
    .waitFor({state: 'attached'});
}

/** Whether the element the trigger's `aria-describedby` names is showing. */
async function tooltipIsOpen(page: Page): Promise<boolean> {
  return page
    .locator('#storybook-root')
    .getByRole('button', {name: 'Options'})
    .evaluate(trigger => {
      const id = trigger.getAttribute('aria-describedby');
      const tooltip = id == null ? null : document.getElementById(id);
      return tooltip != null && tooltip.matches(':popover-open');
    });
}

test('Escape closes the popover and the returning focus still shows the tooltip, without an error', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      pageErrors.push(message.text());
    }
  });
  await mountStory(page);

  // Tab to the trigger: keyboard focus shows the tooltip.
  await page.keyboard.press('Tab');
  const trigger = page
    .locator('#storybook-root')
    .getByRole('button', {name: 'Options'});
  await expect(trigger).toBeFocused();
  await expect.poll(async () => tooltipIsOpen(page)).toBe(true);

  // Enter opens the popover and focus moves inside it.
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {name: 'Options'});
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', {name: 'Inside action'})).toBeFocused();
  await expect.poll(async () => tooltipIsOpen(page)).toBe(false);

  // Escape closes the popover. The engine returns focus to the trigger while
  // it is still hiding the popover; the tooltip's focus-in must wait for that
  // to finish rather than ask the engine for a show it refuses.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(
    pageErrors.filter(text => /popover/i.test(text)),
    'no popover error or warning is reported for the press',
  ).toEqual([]);
  await expect
    .poll(
      async () => tooltipIsOpen(page),
      'the keyboard focus that returned to the trigger shows its tooltip',
    )
    .toBe(true);
});
