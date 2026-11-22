// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipStillPointerScroll.interaction.browser.spec.ts
 * @input The `Core/Tooltip` Default story in a built Storybook, a desktop
 *   page and real mouse and keyboard input, in Chromium and WebKit
 * @output Real-engine proof that a wheel or keyboard scroll that brings the
 *   trigger under a mouse that does not move opens no tooltip, and that the
 *   first move over it then opens the tooltip. After the scroll WebKit sends
 *   the trigger a move at the arrival's point; it opens nothing either. A
 *   truncated Text or Heading scrolled under a still mouse opens none either. A
 *   mouse that moves onto the trigger in one step still opens it: WebKit's
 *   only move then is at the arrival's point too, but the mouse came from
 *   elsewhere.
 * @position Run with `pnpm test:interaction`. An interaction spec, so CI's
 *   WebKit leg runs it on a Tooltip change; the other still-pointer cases are
 *   in TooltipStillPointer.a11y.browser.spec.ts.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-tooltip--default';
/** Longer than the story's 200 ms show delay, with frames to spare. */
const WAIT_PAST_DELAY_MS = 800;

/** The truncated Heading story's text. */
const HEADING_TEXT = 'Very Long Heading That Will Be Truncated';

/** Where the mouse rests: well away from the trigger as the story renders it. */
const REST = {x: 60, y: 60};

async function openTooltipStory(page: Page): Promise<Locator> {
  await openStory(page, storybook(), STORY);
  const trigger = page.getByRole('button', {name: 'Hover me'});
  await trigger.waitFor();
  return trigger;
}

/**
 * Makes the page scroll and returns the trigger's centre. A spacer before the
 * story puts the trigger low enough to scroll up under the mouse, and one
 * after it gives the document room to scroll down.
 */
async function scrollablePage(page: Page, trigger: Locator) {
  await page.evaluate(() => {
    const before = document.createElement('div');
    before.style.height = '400px';
    document.body.prepend(before);
    const after = document.createElement('div');
    after.style.height = '2000px';
    document.body.append(after);
  });
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('the trigger has no layout box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

const SCROLL_PX = 120;

for (const how of ['wheel', 'keyboard'] as const) {
  test(`a ${how} scroll that brings the trigger under a still mouse opens no tooltip until the mouse moves`, async ({
    browser,
  }) => {
    // A mouse on a desktop page: the project's phone emulation has no hover.
    const context = await browser.newContext({
      hasTouch: false,
      isMobile: false,
      viewport: {width: 900, height: 600},
    });
    const page = await context.newPage();
    try {
      const trigger = await openTooltipStory(page);
      const center = await scrollablePage(page, trigger);
      const scrollBy = async () => {
        if (how === 'wheel') {
          await page.mouse.wheel(0, SCROLL_PX);
        } else {
          await page.evaluate(() => {
            (document.activeElement as HTMLElement | null)?.blur();
          });
          await page.keyboard.press('ArrowDown');
        }
      };
      // The distance one scroll step moves the page, measured with the mouse
      // away from the trigger, then undone.
      await page.mouse.move(REST.x, REST.y);
      await scrollBy();
      await expect
        .poll(async () => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(0);
      await page.waitForTimeout(300);
      const step = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect
        .poll(async () => page.evaluate(() => window.scrollY))
        .toBe(0);

      // The mouse rests where the trigger will be after one step.
      const at = {x: center.x, y: center.y - step};
      await page.mouse.move(at.x, at.y);
      await scrollBy();
      await expect
        .poll(async () => page.evaluate(() => window.scrollY))
        .toBe(step);
      await expect
        .poll(async () =>
          trigger.evaluate(
            (element, point) =>
              element.contains(document.elementFromPoint(point.x, point.y)),
            at,
          ),
        )
        .toBe(true);
      await page.waitForTimeout(WAIT_PAST_DELAY_MS);
      await expect(page.getByRole('tooltip')).toBeHidden();

      await page.mouse.move(at.x + 1, at.y);
      await expect(page.getByRole('tooltip')).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test('a mouse that moves onto the trigger in one step opens the tooltip', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 600},
  });
  const page = await context.newPage();
  try {
    const trigger = await openTooltipStory(page);
    const box = await trigger.boundingBox();
    if (box == null) {
      throw new Error('the trigger has no layout box');
    }
    await page.mouse.move(REST.x, REST.y);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole('tooltip')).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const {name, story, text: textMatch} of [
  {
    name: 'Text',
    story: 'core-text--single-line-truncation',
    text: 'This is a very long text',
  },
  {
    name: 'Heading',
    story: 'core-heading--single-line-truncation',
    text: HEADING_TEXT,
  },
]) {
  test(`a wheel scroll that brings a truncated ${name} under a still mouse opens no tooltip until the mouse moves`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: false,
      isMobile: false,
      viewport: {width: 900, height: 600},
    });
    const page = await context.newPage();
    try {
      await openStory(page, storybook(), story);
      const text = page.getByText(textMatch).first();
      await text.waitFor();
      // The text loads its tooltip once it measures as truncated.
      await page.waitForTimeout(WAIT_PAST_DELAY_MS);
      const center = await scrollablePage(page, text);
      await page.mouse.move(REST.x, REST.y);
      await page.mouse.wheel(0, SCROLL_PX);
      await expect
        .poll(async () => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(0);
      await page.waitForTimeout(300);
      const step = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect
        .poll(async () => page.evaluate(() => window.scrollY))
        .toBe(0);

      // The mouse rests on the text's start where it will be after one step.
      const box = await text.boundingBox();
      if (box == null) {
        throw new Error('the text has no layout box');
      }
      const at = {x: box.x + 100, y: center.y - step};
      await page.mouse.move(at.x, at.y);
      await page.mouse.wheel(0, SCROLL_PX);
      await expect
        .poll(async () => page.evaluate(() => window.scrollY))
        .toBe(step);
      await page.waitForTimeout(WAIT_PAST_DELAY_MS);
      await expect(page.getByRole('tooltip')).toBeHidden();

      await page.mouse.move(at.x + 1, at.y);
      await expect(page.getByRole('tooltip')).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
