// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuLongPress.a11y.chromium.spec.ts
 * @input The `Core/ContextMenu` Default and popover-presentation touch stories
 *   in a built Storybook, and CDP touch input.
 * @output Real-engine proof that the long press that opens a context menu
 *   does not close it as the finger lifts, and that a tap outside still does.
 *   Under the touch model the lift sends no click. Under today's long press
 *   (`presentation="popover"`) its click arrives and acts on nothing.
 * @position Run with `pnpm test:a11y-contract`; jsdom cannot produce the
 *   compatibility mouse events a real browser sends after a touch.
 */

import {
  expect,
  test,
  type CDPSession,
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

const STORY = 'core-contextmenu--default';
// A finger keeps today's long press under `presentation="popover"`.
const POPOVER_STORY = 'core-contextmenu--touch-long-press-popover';

async function touchCdp(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  });
  return cdp;
}

async function triggerCenter(
  page: Page,
  label = 'Right-click this area',
): Promise<{x: number; y: number}> {
  const box = await page.getByText(label).boundingBox();
  if (box == null) {
    throw new Error('the trigger area has no rendered bounds');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

interface InputEntry {
  type: 'click' | 'touchstart';
  /** For a `touchstart`: whether a menu was open as it arrived. */
  isMenuOpen?: boolean;
}

/** Records every `click` and `touchstart` the page gets from now on, in order. */
async function recordInput(page: Page): Promise<void> {
  await page.evaluate(() => {
    const entries: {type: string; isMenuOpen?: boolean}[] = [];
    (window as unknown as {__input?: typeof entries}).__input = entries;
    document.addEventListener(
      'click',
      () => {
        entries.push({type: 'click'});
      },
      {capture: true},
    );
    document.addEventListener(
      'touchstart',
      () => {
        entries.push({
          type: 'touchstart',
          // A closed menu can stay mounted, hidden.
          isMenuOpen:
            document.querySelector('[role="menu"]')?.checkVisibility() ?? false,
        });
      },
      {capture: true},
    );
  });
}

async function recordedInput(page: Page): Promise<InputEntry[]> {
  return page.evaluate(
    () => (window as unknown as {__input?: InputEntry[]}).__input ?? [],
  );
}

const nextFrame = async (page: Page) =>
  page.evaluate(
    async () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
  );

/**
 * Holds a finger on the trigger until the menu opens, lifts it, waits one
 * frame, then taps outside. Returns the input recorded from the lift on: the
 * outside tap's `touchstart` is the later event that bounds the lift's click.
 */
async function holdLiftThenTapOutside(
  page: Page,
  story: string,
  label?: string,
): Promise<InputEntry[]> {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  // Touch emulation makes the primary pointer coarse.
  const cdp = await touchCdp(page);
  const center = await triggerCenter(page, label);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: center.x, y: center.y, id: 1}],
  });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible({timeout: 2000});
  await recordInput(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await nextFrame(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: 5, y: 5, id: 2}],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  // A tap outside still closes it.
  await expect(menu).toBeHidden();
  return recordedInput(page);
}

/** The clicks before the outside tap, and whether the menu was open at it. */
function beforeOutsideTap(entries: InputEntry[]) {
  const tap = entries.findIndex(entry => entry.type === 'touchstart');
  expect(tap).toBeGreaterThanOrEqual(0);
  return {
    clicks: entries.slice(0, tap).filter(entry => entry.type === 'click')
      .length,
    isMenuOpen: entries[tap].isMenuOpen,
  };
}

test('under the touch model, the long press that opens the menu leaves it open as the finger lifts, and the lift sends no click', async ({
  page,
}) => {
  const entries = await holdLiftThenTapOutside(page, STORY);
  expect(beforeOutsideTap(entries)).toEqual({clicks: 0, isMenuOpen: true});
});

// The positive control: the same steps see the click that follows today's
// long press, so the check above can fail.
test('with presentation="popover", the click that follows the long press arrives before the outside tap and leaves the menu open', async ({
  page,
}) => {
  const entries = await holdLiftThenTapOutside(
    page,
    POPOVER_STORY,
    'Hold for actions',
  );
  expect(beforeOutsideTap(entries)).toEqual({clicks: 1, isMenuOpen: true});
});

test('a mouse press outside closes a right-click menu', async ({page}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const center = await triggerCenter(page);
  await page.mouse.click(center.x, center.y, {button: 'right'});
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(menu).toBeHidden();
});
