// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file TooltipFocusReturn.a11y.chromium.spec.ts
 * @input Uses @playwright/test, the a11y-spec static Storybook server, and the
 *   checked-in TooltipFocusReturnA11y story
 * @output Real-browser evidence that closing a popover from the keyboard,
 *   which hands focus back to a trigger that carries a tooltip, neither
 *   throws nor loses the tooltip; and that on a touch screen, typing into a
 *   dialog's text field does not make the focus the dialog returns open the
 *   trigger's tooltip, while Escape still does.
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
 * After typing, Chromium marks the next script focus `:focus-visible`, so the
 * touch cases need a real engine too: jsdom has no `:focus-visible`.
 *
 * SYNC: Fixtures live in
 *   /apps/storybook/stories/TooltipFocusReturnA11y.stories.tsx.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY_ID = 'a11y-tooltip-focus-return--popover-trigger-with-tooltip';
const DIALOG_STORY_ID =
  'a11y-tooltip-focus-return--dialog-trigger-with-tooltip';

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
async function mountStory(
  page: Page,
  storyId = STORY_ID,
  triggerName = 'Options',
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  await page
    .locator('#storybook-root')
    .getByRole('button', {name: triggerName})
    .waitFor({state: 'attached'});
}

/** Whether the element the trigger's `aria-describedby` names is showing. */
async function tooltipIsOpen(
  page: Page,
  triggerName = 'Options',
): Promise<boolean> {
  return page
    .locator('#storybook-root')
    .getByRole('button', {name: triggerName})
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

test.describe('on a touch screen, a dialog with a text field', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: {width: 390, height: 844},
  });

  /** Tap the trigger, then tap the dialog's field and type into it. */
  async function tapAndType(page: Page) {
    await mountStory(page, DIALOG_STORY_ID, 'Rename');
    const trigger = page
      .locator('#storybook-root')
      .getByRole('button', {name: 'Rename'});
    await trigger.tap();
    const dialog = page.getByRole('dialog', {name: 'Rename'});
    await expect(dialog).toBeVisible();
    const field = dialog.getByRole('textbox', {name: 'File name'});
    await field.tap();
    await expect(field).toBeFocused();
    await page.keyboard.type('-v2');
    await expect(field).toHaveValue('report.pdf-v2');
    return {trigger, dialog};
  }

  test('Enter submits, and the returned focus shows no tooltip', async ({
    page,
  }) => {
    const {trigger, dialog} = await tapAndType(page);

    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(
      await trigger.evaluate(element => element.matches(':focus-visible')),
      'the engine marks the returned focus focus-visible after typing',
    ).toBe(true);
    // Give a wrongly opened tooltip time to show before reading it.
    await page.waitForTimeout(500);
    expect(await tooltipIsOpen(page, 'Rename')).toBe(false);
  });

  test('Escape closes it, and the returned focus shows the tooltip', async ({
    page,
  }) => {
    const {trigger, dialog} = await tapAndType(page);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect
      .poll(
        async () => tooltipIsOpen(page, 'Rename'),
        'focus returned after keyboard navigation shows the tooltip',
      )
      .toBe(true);
  });
});
