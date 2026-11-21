// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Tooltip/ ^packages/core/src/Text/ ^apps/storybook/stories/Tooltip

/**
 * @file TooltipStillPointer.a11y.browser.spec.ts
 * @input The `Core/Tooltip` Default story and the `Core/Text` single-line
 *   truncation story in a built Storybook, and real mouse input, in Chromium
 *   and WebKit.
 * @output Real-engine proof that a trigger that appears or moves under a
 *   mouse that does not move opens no tooltip, though the engine sends the
 *   trigger its arrival, and that the first move over it then opens the
 *   tooltip. A truncated Text that appears under a still mouse opens no
 *   tooltip either, nor does a wheel or keyboard scroll that brings the
 *   trigger under a still mouse. A mouse that moves onto the trigger opens it
 *   as before, and a mouse already over the trigger when it mounts opens it
 *   on its first move.
 * @position Run with `pnpm test:a11y-contract`. Only a real engine sends the
 *   arrival after a layout change with no move; jsdom sends nothing by itself.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

const STORY = 'core-tooltip--default';
/** Longer than the story's 200 ms show delay, with frames to spare. */
const WAIT_PAST_DELAY_MS = 800;

/** Where the mouse rests: well away from the trigger as the story renders it. */
const REST = {x: 60, y: 60};

async function openStory(page: Page): Promise<Locator> {
  await page.setViewportSize({width: 900, height: 600});
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const trigger = page.getByRole('button', {name: 'Hover me'});
  await trigger.waitFor();
  // Logs the trusted arrival and moves the trigger gets, so a test can show
  // the engine did send the arrival.
  await trigger.evaluate(element => {
    const log: string[] = [];
    (window as unknown as {__triggerLog: string[]}).__triggerLog = log;
    for (const type of ['mouseenter', 'pointermove', 'mousemove']) {
      element.addEventListener(type, event => {
        if (event.isTrusted) {
          log.push(type);
        }
      });
    }
  });
  return trigger;
}

const triggerLog = async (page: Page) =>
  page.evaluate(
    () => (window as unknown as {__triggerLog: string[]}).__triggerLog,
  );

/**
 * Puts an "Open" button over `at` and clicks it with the mouse there. Its
 * click removes it, as a dialog's opener goes away, and, when `shift` is
 * set, moves the trigger so its center is at `at`. Either way the trigger is
 * then under a mouse that does not move.
 */
async function clickAwayOpener(
  trigger: Locator,
  at: {x: number; y: number},
  shift: boolean,
) {
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('the trigger has no layout box');
  }
  const offset = {
    x: at.x - (box.x + box.width / 2),
    y: at.y - (box.y + box.height / 2),
  };
  await trigger.evaluate(
    (element, {x, y, left, top, isShift}) => {
      const opener = document.createElement('button');
      opener.type = 'button';
      opener.textContent = 'Open';
      opener.style.cssText = `position: fixed; z-index: 1; left: ${left - 40}px; top: ${top - 20}px; width: 80px; height: 40px;`;
      opener.addEventListener('click', () => {
        opener.remove();
        if (isShift) {
          // A layout move. Engines do not hit-test again for a transform.
          const {left: from, top: fromTop} = element.getBoundingClientRect();
          element.style.position = 'fixed';
          element.style.left = `${from + x}px`;
          element.style.top = `${fromTop + y}px`;
        }
      });
      document.body.append(opener);
    },
    {...offset, left: at.x, top: at.y, isShift: shift},
  );
  const page = trigger.page();
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.up();
}

for (const shift of [false, true]) {
  const how = shift ? 'moves' : 'appears';
  test(`a trigger that ${how} under a still mouse opens no tooltip until the mouse moves`, async ({
    page,
  }) => {
    const trigger = await openStory(page);
    const box = await trigger.boundingBox();
    if (box == null) {
      throw new Error('the trigger has no layout box');
    }
    const at = shift
      ? REST
      : {x: box.x + box.width / 2, y: box.y + box.height / 2};
    await clickAwayOpener(trigger, at, shift);

    // The engine sends the arrival after the layout change. It sends no move.
    await expect.poll(async () => triggerLog(page)).toContain('mouseenter');
    await page.waitForTimeout(WAIT_PAST_DELAY_MS);
    expect(await triggerLog(page)).not.toContain('pointermove');
    expect(await triggerLog(page)).not.toContain('mousemove');
    await expect(page.getByRole('tooltip')).toBeHidden();

    await page.mouse.move(at.x + 1, at.y);
    await expect(page.getByRole('tooltip')).toBeVisible();
  });
}

test('a mouse that moves onto the trigger opens the tooltip', async ({
  page,
}) => {
  const trigger = await openStory(page);
  await page.mouse.move(REST.x, REST.y);
  await trigger.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
});

test('a truncated Text that appears under a still mouse opens no tooltip until the mouse moves', async ({
  page,
}) => {
  await page.setViewportSize({width: 900, height: 600});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-text--single-line-truncation&viewMode=story`,
  );
  const text = page.getByText('This is a very long text').first();
  await text.waitFor();
  // The text loads its tooltip once it measures as truncated.
  await page.waitForTimeout(WAIT_PAST_DELAY_MS);
  const box = await text.boundingBox();
  if (box == null) {
    throw new Error('the text has no layout box');
  }
  const at = {x: box.x + 100, y: box.y + box.height / 2};
  await clickAwayOpener(text, at, false);

  await page.waitForTimeout(WAIT_PAST_DELAY_MS);
  await expect(page.getByRole('tooltip')).toBeHidden();

  await page.mouse.move(at.x + 1, at.y);
  await expect(page.getByRole('tooltip')).toBeVisible();
});

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
    page,
  }) => {
    const trigger = await openStory(page);
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
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0);

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
  });
}

test('a mouse already over the trigger when it mounts opens the tooltip on its first move', async ({
  page,
}) => {
  const trigger = await openStory(page);
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('the trigger has no layout box');
  }
  const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  await page.mouse.move(at.x, at.y);
  await expect(page.getByRole('tooltip')).toBeVisible();

  // The story mounts again under the mouse, which stays where it was.
  await page.reload();
  await page.getByRole('button', {name: 'Hover me'}).waitFor();
  await page.waitForTimeout(WAIT_PAST_DELAY_MS);
  await expect(page.getByRole('tooltip')).toBeHidden();

  await page.mouse.move(at.x + 1, at.y);
  await expect(page.getByRole('tooltip')).toBeVisible();
});
