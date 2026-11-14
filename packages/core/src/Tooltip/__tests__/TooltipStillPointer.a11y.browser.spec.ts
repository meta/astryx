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
 *   tooltip either. A mouse that moves onto the trigger opens it as before.
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
