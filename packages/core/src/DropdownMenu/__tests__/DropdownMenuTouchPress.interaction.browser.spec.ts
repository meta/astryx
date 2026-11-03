// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouchPress.interaction.browser.spec.ts
 * @input The built Default DropdownMenu story, real touch input (Chromium
 *   CDP / WebKit's input command), the interaction harness, and UIMenu's
 *   values from the UIKit constants table
 * @output Interaction proofs for a finger on DropdownMenu's trigger, one
 *   touch model on every engine (`spec:AST-094` FR29): the menu opens as the
 *   finger presses a trigger in no scroll view, and the lift picks nothing; a
 *   tap opens it as it presses and its lift leaves it open; in scrolling page
 *   content a held finger opens it once the 150 ms content-touch delay
 *   passes, and a scroll that starts on the trigger takes the touch; a press
 *   that slides onto a row, past the 10 pt handoff, picks that row once; one
 *   open and one close for a tap and a pick (module AR5); a storyboard of the
 *   press, hold, slide and lift
 * @position Evidence for the finger's press model in DropdownMenu (and
 *   MoreMenu, which renders it); the machine itself is unit-tested in
 *   menuPressGesture.test.ts and useMenuPress.test.tsx
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  drag,
  frames,
  installLongTaskLog,
  openStory,
  Storyboard,
  tap,
  touchDriver,
  waitForRest,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {scroll} from '../../motion/uikit/scroll';

/** The element's rendered box; a missing one fails the spec. */
async function boxOf(locator: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element has no rendered box');
  }
  return box;
}

const storybook = withStorybook(test);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OpenStory {
  driver: TouchDriver;
  trigger: Locator;
  popover: Locator;
  center: {x: number; y: number};
  triggerBox: Box;
}

/** Page-side log of the gesture and the menu: performance.now() times. */
async function installMenuLog(page: Page) {
  await page.evaluate(() => {
    const log = {
      down: [] as number[],
      up: [] as number[],
      cancel: [] as number[],
      opened: [] as number[],
      closed: [] as number[],
      shown: [] as number[],
      picked: [] as string[],
    };
    (window as unknown as {__menuLog: typeof log}).__menuLog = log;
    document.addEventListener(
      'pointerdown',
      () => log.down.push(performance.now()),
      true,
    );
    document.addEventListener(
      'pointerup',
      () => log.up.push(performance.now()),
      true,
    );
    document.addEventListener(
      'pointercancel',
      () => log.cancel.push(performance.now()),
      true,
    );
    // The moment the menu shows: `beforetoggle` fires inside showPopover,
    // while `toggle` follows in a task.
    document.addEventListener(
      'beforetoggle',
      event => {
        if (event.newState === 'open') {
          log.shown.push(performance.now());
        }
      },
      true,
    );
    document.addEventListener(
      'toggle',
      event => {
        // A popover hidden from assistive technology (a close's exit copy)
        // is no menu a screen reader hears (module AR5).
        if (
          event.target instanceof Element &&
          event.target.getAttribute('aria-hidden') === 'true'
        ) {
          return;
        }
        const state = event.newState;
        (state === 'open' ? log.opened : log.closed).push(performance.now());
      },
      true,
    );
    // The story reports a pick by logging "<label> clicked"; the spec
    // reads those lines through this page-side capture.
    // eslint-disable-next-line no-console -- see above
    const original = console.log.bind(console);
    // eslint-disable-next-line no-console -- see above
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].endsWith(' clicked')) {
        log.picked.push(args[0].replace(' clicked', ''));
      }
      original(...args);
    };
  });
}

const readMenuLog = async (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __menuLog: {
            down: number[];
            up: number[];
            cancel: number[];
            opened: number[];
            shown: number[];
            closed: number[];
            picked: string[];
          };
        }
      ).__menuLog,
  );

/** The story under a finger (the harness's phone profile). */
async function openDefault(page: Page): Promise<OpenStory> {
  await installLongTaskLog(page);
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await installMenuLog(page);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const triggerBox = await trigger.boundingBox();
  if (triggerBox == null) {
    throw new Error('no trigger');
  }
  return {
    driver,
    trigger,
    popover: page.locator('[popover]:has([role="menu"])').first(),
    center: {
      x: triggerBox.x + triggerBox.width / 2,
      y: triggerBox.y + triggerBox.height / 2,
    },
    triggerBox,
  };
}

const centerOf = (box: Box) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

async function openWithTap(story: OpenStory) {
  await story.driver.tap(story.center);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
}

test('a finger opens the menu as it presses a trigger in no scroll view, and its lift picks nothing', async ({
  page,
}) => {
  const story = await openDefault(page);
  await story.driver.play(tap(story.center, {holdMs: 400}));
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
  const log = await readMenuLog(page);
  // spec:AST-094 FR29: the press opens it; nothing waits for a delay.
  expect(log.shown[0] - log.down[0]).toBeLessThan(
    scroll.delaysContentTouchesMs,
  );
  // Open with the finger still down, and the lift acts on nothing.
  expect(log.shown[0]).toBeLessThan(log.up[0]);
  await frames(page, 2);
  expect(log.picked).toEqual([]);
  expect((await readMenuLog(page)).picked).toEqual([]);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
});

test('a tap opens the menu as it presses and its lift leaves it open', async ({
  page,
}) => {
  const story = await openDefault(page);
  await openWithTap(story);
  // The toggle event is queued as a task after the open.
  await expect
    .poll(async () => (await readMenuLog(page)).opened.length)
    .toBe(1);
  const log = await readMenuLog(page);
  expect(log.shown[0]).toBeLessThan(log.up[0]);
  expect(log.picked).toEqual([]);
  // Focus moves into the menu, as for any pointer open.
  await expect(page.getByRole('menu')).toBeVisible();
});

test('a finger opens the menu once and it closes once at a pick: nothing withdraws the open (module AR5)', async ({
  page,
}) => {
  const story = await openDefault(page);
  // The tap opens the menu as it presses; its lift's click must not toggle
  // it again.
  await story.driver.tap(story.center);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
  await waitForRest(story.popover);
  // The toggle events are queued as tasks after the open.
  await expect
    .poll(async () => (await readMenuLog(page)).opened.length)
    .toBe(1);
  await frames(page, 2);
  expect((await readMenuLog(page)).closed).toEqual([]);
  const row = await boxOf(page.getByRole('menuitem', {name: 'Duplicate'}));
  await story.driver.tap(centerOf(row));
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(async () => (await readMenuLog(page)).closed.length)
    .toBe(1);
  await frames(page, 2);
  const log = await readMenuLog(page);
  expect(log.opened.length).toBe(1);
  expect(log.closed.length).toBe(1);
  expect(log.picked).toEqual(['Duplicate']);
});

/** Lets the page scroll without moving the centered story. */
async function makePageScroll(page: Page) {
  // An absolutely positioned spacer extends the scrollable area only.
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.position = 'absolute';
    spacer.style.insetBlockStart = '0';
    spacer.style.inlineSize = '1px';
    spacer.style.blockSize = '4000px';
    document.body.append(spacer);
  });
  await frames(page, 2);
}

test('in scrolling page content a held finger opens the menu once the content-touch delay passes', async ({
  page,
}) => {
  const story = await openDefault(page);
  await makePageScroll(page);
  await story.driver.play(tap(story.center, {holdMs: 400}));
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
  const log = await readMenuLog(page);
  expect(log.shown[0] - log.down[0]).toBeGreaterThanOrEqual(
    scroll.delaysContentTouchesMs,
  );
  expect(log.shown[0]).toBeLessThan(log.up[0]);
});

test('in scrolling page content a scroll that starts on the trigger takes the touch: the page scrolls and nothing opens', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'a scripted touch scrolls the page only through Chromium\u2019s input pipeline',
  );
  const story = await openDefault(page);
  await makePageScroll(page);
  await story.driver.play(
    drag(
      story.center,
      {x: story.center.x, y: story.center.y - 200},
      {
        holdMs: 0,
        durationMs: 100,
        hz: 60,
        restMs: 0,
      },
    ),
  );
  await frames(page, 2);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test('press, hold, slide onto a row and lift picks that row once', async ({
  page,
}) => {
  const story = await openDefault(page);
  await openWithTap(story);
  await waitForRest(story.popover);
  const row = await page
    .getByRole('menuitem', {name: 'Duplicate'})
    .boundingBox();
  if (row == null) {
    throw new Error('no row');
  }
  await page.keyboard.press('Escape');
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'false');
  await waitForRest(story.popover);
  await story.driver.play(
    drag(story.center, centerOf(row), {
      holdMs: 250,
      durationMs: 250,
      hz: 60,
      restMs: 60,
    }),
  );
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'false');
  expect((await readMenuLog(page)).picked).toEqual(['Duplicate']);
});

test(
  'storyboard (iOS): press, hold, slide onto a row and lift',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const story = await openDefault(page);
    await openWithTap(story);
    await waitForRest(story.popover);
    const row = await boxOf(page.getByRole('menuitem', {name: 'Duplicate'}));
    await page.keyboard.press('Escape');
    await waitForRest(story.popover);
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const board = new Storyboard(page, {
      name: 'dropdownmenu-touch-hold-slide-pick',
      clip: {x: 0, y: 0, width: viewport.width, height: viewport.height},
      columns: 6,
      cellScale: 0.35,
    });
    const measure = async () => ({
      expanded: await story.trigger.getAttribute('aria-expanded'),
      highlighted: await page.evaluate(() =>
        document.activeElement?.getAttribute('role') === 'menuitem'
          ? (document.activeElement.textContent ?? '')
          : '',
      ),
    });
    await board.capture('before', 0, await measure());
    // Paced on the wall clock: the hold-open delay is a real timer. Photos
    // are taken once the menu is open; from there the pick depends on
    // distance, not time, so the photos' delay changes nothing.
    await story.driver.play(
      drag(story.center, centerOf(row), {
        holdMs: 250,
        durationMs: 200,
        hz: 30,
        restMs: 60,
      }),
      {
        onEvent: async step => {
          if (step.type === 'touchStart') {
            return;
          }
          const where = step.changed
            .map(f => `${Math.round(f.x)},${Math.round(f.y)}`)
            .join(' ');
          await board.capture(
            `${step.type} t=${+step.t.toFixed(1)} @${where}`,
            step.t,
            await measure(),
          );
        },
      },
    );
    await board.write(testInfo);
    const highlighted = board.frames.map(f => f.data.highlighted as string);
    // The highlight followed the finger onto the row, which the lift picked.
    expect(highlighted).toContain('Duplicate');
    expect((await readMenuLog(page)).picked).toEqual(['Duplicate']);
  },
);
