// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DialogTouchEntrance.interaction.browser.spec.ts
 * @input The built Dialog stories "Purpose Info" and "Scrolling Content" and
 *   the AlertDialog story "Delete", real touch input through the interaction
 *   harness in its phone context, and a mouse there and on a fine-pointer
 *   page
 * @output Browser evidence for spec:AST-094 FR35 on Dialog: under a finger, a
 *   tap or a drag that lands while the dialog is still entering closes
 *   nothing, runs no action, moves no focus and scrolls nothing, and the
 *   dialog finishes entering and stays open; keys stay live and the content
 *   stays in the accessibility tree meanwhile; an alert's entrance holds its
 *   action alike. With a mouse, a click during the entrance acts as before:
 *   on a touch screen the hold decides by each event's pointer, and under a
 *   fine primary pointer nothing is held, a press where the mouse already
 *   rests included.
 * @position Browser proof for Dialog's entrance hold (Dialog.tsx, through the
 *   Layer module's holdEntranceInput); the hold itself is proven in
 *   Layer/__tests__/inputHold.interaction.browser.spec.ts
 *
 * Each case slows the entrance to a minute before opening (a machine as busy
 * as a 3-CPU runner can play a normal one out before a case looks) and holds
 * it where it is (holdAnimations), so every touch lands while the dialog is
 * still entering; the slowing then goes, so the exit keeps its own timing,
 * and finishing the entrance ends it at once.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  drag,
  frames,
  holdAnimations,
  openStory,
  releaseAnimations,
  touchDriver,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

type Point = {x: number; y: number};

const INFO = 'core-dialog--purpose-info';
const SCROLLING = 'core-dialog--scrolling-content';
const ALERT = 'core-alertdialog--delete';

/** A point on the backdrop: the top of the viewport, above the dialog. */
const BACKDROP: Point = {x: 201, y: 6};

async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element did not render');
  }
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

const openDialogs = (page: Page) => page.locator('dialog[open]');

/** Waits until the open dialog's entrance is running, then holds it there. */
async function holdEntrance(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .querySelector('dialog[open]')
        ?.getAnimations()
        .some(animation => animation.playState === 'running') ?? false,
  );
  const held = await holdAnimations(page, openDialogs(page));
  // Held: later transitions (an exit, the next open) keep their own timing.
  await page.evaluate(() =>
    document.getElementById('__slowEntrance')?.remove(),
  );
  expect(held.length, 'the dialog is still entering').toBeGreaterThan(0);
}

/**
 * Slows the next entrance to a minute, so the dialog is still entering when a
 * case holds it however busy the machine is; holdEntrance and
 * finishEntrance take the slowing away again.
 */
async function slowNextEntrance(page: Page): Promise<void> {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = '__slowEntrance';
    style.textContent =
      'dialog, dialog *, dialog::backdrop { transition-duration: 60s !important; animation-duration: 60s !important; }';
    document.head.append(style);
  });
}

/** Ends the entrance at once, held or not. */
async function finishEntrance(page: Page): Promise<void> {
  await releaseAnimations(page, {finish: true});
  await openDialogs(page).evaluate(async dialog => {
    document.getElementById('__slowEntrance')?.remove();
    // An entrance no case held (opened only to be finished) ends here too.
    for (const animation of dialog.getAnimations()) {
      const end = animation.effect?.getComputedTiming().endTime;
      if (typeof end === 'number' && Number.isFinite(end)) {
        animation.finish();
      }
    }
    await Promise.all(
      dialog.getAnimations().map(async animation =>
        animation.finished.catch((error: unknown) => {
          // A canceled animation's `finished` rejects with an AbortError:
          // it ended. Anything else is a failure, and it surfaces.
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            throw error;
          }
        }),
      ),
    );
  });
  await frames(page);
}

/** Opens the story's dialog with a tap and holds its entrance midway. */
async function openMidEntrance(
  page: Page,
  story: string,
  opener: string,
): Promise<TouchDriver> {
  await openStory(page, storybook(), story);
  await slowNextEntrance(page);
  const driver = await touchDriver(page);
  await driver.tap(await centerOf(page.getByRole('button', {name: opener})));
  await holdEntrance(page);
  return driver;
}

/**
 * Records every touch the page receives, and whether the browser took one to
 * pan something (a `pointercancel`): a window capture listener added before
 * the page's own scripts, so it sees a touch even when the input hold stops
 * it there. Install it before opening the story.
 */
async function installTouchProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as {__touchProbe: string[]}).__touchProbe = seen;
    for (const type of [
      'touchstart',
      'touchmove',
      'touchend',
      'touchcancel',
      'pointercancel',
    ]) {
      window.addEventListener(type, () => seen.push(type), {
        capture: true,
        passive: true,
      });
    }
  });
}

/** What the probe saw since the last read, emptying it. */
const takeTouchProbe = async (page: Page) =>
  page.evaluate(() => {
    const seen = (window as unknown as {__touchProbe: string[]}).__touchProbe;
    return seen.splice(0);
  });

/**
 * Plays one drag and returns what the page received: its touch events, and
 * whether the browser took the touch to pan something (a `pointercancel`).
 * A drag the page never received shows here, so it cannot pass as one that
 * scrolled nothing.
 */
async function playDrag(
  page: Page,
  driver: TouchDriver,
  script: Parameters<TouchDriver['play']>[0],
): Promise<{received: string[]; panned: boolean}> {
  await takeTouchProbe(page);
  await driver.play(script);
  await frames(page, 4);
  const seen = await takeTouchProbe(page);
  return {
    received: seen.filter(type => type.startsWith('touch')),
    panned: seen.includes('pointercancel'),
  };
}

/** The whole drag reached the page: a touchstart, its moves and its touchend. */
function expectDelivered(played: {received: string[]}): void {
  expect(played.received[0], 'the drag reached the page').toBe('touchstart');
  expect(played.received).toContain('touchmove');
  expect(played.received.at(-1)).toBe('touchend');
}

/** What has focus: its tag and accessible name. */
const focusedElement = async (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    if (element == null) {
      return 'none';
    }
    const name =
      element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '';
    return `${element.tagName.toLowerCase()}:${name.slice(0, 40)}`;
  });

test.describe('under a finger (spec:AST-094 FR35)', () => {
  test('a tap on the backdrop while the dialog enters closes nothing, and once it has entered the same tap closes it', async ({
    page,
  }) => {
    const driver = await openMidEntrance(page, INFO, 'Open Info Modal');

    await driver.tap(BACKDROP);
    await frames(page);
    await expect(openDialogs(page)).toHaveCount(1);

    await finishEntrance(page);
    await expect(page.getByRole('dialog', {name: 'Information'})).toBeVisible();

    await driver.tap(BACKDROP);
    await expect(openDialogs(page)).toHaveCount(0);
  });

  test('a tap on an action while the dialog enters runs nothing and moves no focus', async ({
    page,
  }) => {
    const driver = await openMidEntrance(page, INFO, 'Open Info Modal');
    const action = page.getByRole('button', {name: 'Got it'});
    // Focus starts inside the dialog, where opening it put it.
    expect(
      await openDialogs(page).evaluate(dialog =>
        dialog.contains(document.activeElement),
      ),
    ).toBe(true);
    const focused = await focusedElement(page);

    await driver.tap(await centerOf(action));
    await frames(page);
    await expect(openDialogs(page)).toHaveCount(1);
    expect(await focusedElement(page)).toBe(focused);

    await finishEntrance(page);
    await expect(openDialogs(page)).toHaveCount(1);

    await driver.tap(await centerOf(action));
    await expect(openDialogs(page)).toHaveCount(0);
  });

  test('a drag while the dialog enters scrolls nothing, and once it has entered the same drag scrolls its content', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'needs native scrolling from injected touches (the WebKit driver has none)',
    );
    await installTouchProbe(page);
    const driver = await openMidEntrance(
      page,
      SCROLLING,
      'Open Scrolling Modal',
    );
    // The dialog's own scroller: its content area.
    const content = await openDialogs(page).evaluateHandle(dialog => {
      for (const element of dialog.querySelectorAll('*')) {
        const {overflowY} = getComputedStyle(element);
        if (
          (overflowY === 'auto' || overflowY === 'scroll') &&
          element.scrollHeight > element.clientHeight
        ) {
          return element;
        }
      }
      throw new Error('the dialog has no scrolling content');
    });
    const box = await content.asElement()?.boundingBox();
    if (box == null) {
      throw new Error('the content did not render');
    }
    const x = Math.round(box.x + box.width / 2);
    const up = drag(
      {x, y: Math.round(box.y + box.height * 0.8)},
      {x, y: Math.round(box.y + box.height * 0.2)},
      // A rest before the lift: no fling outlives the pan.
      {durationMs: 200, restMs: 150},
    );
    const scrollTop = async () =>
      content.evaluate(element => element.scrollTop);

    const held = await playDrag(page, driver, up);
    expectDelivered(held);
    expect(held.panned, 'the browser panned nothing').toBe(false);
    expect(await scrollTop()).toBe(0);
    await expect(openDialogs(page)).toHaveCount(1);

    await finishEntrance(page);
    const free = await playDrag(page, driver, up);
    expectDelivered(free);
    expect(free.panned, 'the browser took the drag to scroll').toBe(true);
    expect(await scrollTop()).toBeGreaterThan(0);
  });

  test("a tap on an alert's action while it enters runs nothing, and once it has entered the same tap runs it", async ({
    page,
  }) => {
    const driver = await openMidEntrance(page, ALERT, 'Delete item');
    const action = page.getByRole('button', {name: 'Delete', exact: true});

    await driver.tap(await centerOf(action));
    await frames(page);
    await expect(openDialogs(page)).toHaveCount(1);

    await finishEntrance(page);
    await expect(openDialogs(page)).toHaveCount(1);

    await driver.tap(await centerOf(action));
    await expect(openDialogs(page)).toHaveCount(0);
  });

  test('keys and assistive technology stay live while the dialog enters', async ({
    page,
  }) => {
    await openMidEntrance(page, INFO, 'Open Info Modal');

    // The content stays in the accessibility tree, action included.
    const tree = await page
      .getByRole('dialog', {name: 'Information'})
      .ariaSnapshot();
    expect(tree).toContain('button "Got it"');

    // A key acts at once: Escape closes the dialog mid-entrance.
    await page.keyboard.press('Escape');
    await expect(openDialogs(page)).toHaveCount(0);
  });
});

test.describe('with a mouse on a touch screen', () => {
  test('a click on the backdrop while the dialog enters closes it, as before: only a finger is held', async ({
    page,
  }) => {
    await openMidEntrance(page, INFO, 'Open Info Modal');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      'the primary pointer is a finger',
    ).toBe(true);

    await page.mouse.click(BACKDROP.x, BACKDROP.y);
    await expect(openDialogs(page)).toHaveCount(0);
  });

  test('while the dialog enters, a mouse press reaches its action once the mouse has moved; a press before any movement meets the hold', async ({
    page,
  }) => {
    // Under Reduce Motion the dialog only fades in, so its action stays where
    // the mouse rests.
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openStory(page, storybook(), INFO);
    const opener = page.getByRole('button', {name: 'Open Info Modal'});
    // A first presentation, which a mouse opens and a key closes: from it on
    // the page's input hold knows the latest pointer.
    await opener.click();
    await expect(openDialogs(page)).toHaveCount(1);
    await finishEntrance(page);
    const action = await centerOf(page.getByRole('button', {name: 'Got it'}));
    await page.keyboard.press('Escape');
    await expect(openDialogs(page)).toHaveCount(0);
    // The mouse comes to rest where the action appears; a key opens the
    // dialog again.
    await page.mouse.move(action.x - 40, action.y);
    await page.mouse.move(action.x, action.y, {steps: 4});
    // What each click lands on, heard first, before any hold.
    await page.evaluate(() => {
      const clicks: string[] = [];
      (window as unknown as {__clicks: string[]}).__clicks = clicks;
      window.addEventListener(
        'click',
        event => {
          const target = event.target as Element;
          clicks.push(target.closest('button')?.textContent?.trim() ?? '');
        },
        {capture: true},
      );
    });
    await slowNextEntrance(page);
    await opener.focus();
    await page.keyboard.press('Enter');
    await holdEntrance(page);

    const clicks = async () =>
      page.evaluate(() => (window as unknown as {__clicks: string[]}).__clicks);
    // A press where the mouse already is, with no movement first: nothing
    // listened before the hold began, so the hold cannot tell it from a
    // finger's, and it meets the shield (after the key's own click on the
    // opener).
    await page.mouse.down();
    await page.mouse.up();
    await frames(page);
    expect(await clicks()).toEqual(['Open Info Modal', '']);
    await expect(openDialogs(page)).toHaveCount(1);
    // Once the mouse moves, its press reaches the action.
    await page.mouse.move(action.x + 2, action.y, {steps: 2});
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(clicks).toEqual(['Open Info Modal', '', 'Got it']);
    await expect(openDialogs(page)).toHaveCount(0);
  });
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a click on the backdrop while the dialog enters closes it, as before', async ({
    page,
  }) => {
    await openStory(page, storybook(), INFO);
    await slowNextEntrance(page);
    await page.getByRole('button', {name: 'Open Info Modal'}).click();
    await holdEntrance(page);

    await page.mouse.click(BACKDROP.x, BACKDROP.y);
    await expect(openDialogs(page)).toHaveCount(0);
  });

  test('a press where the mouse already rests closes the dialog from its backdrop while it enters: under a fine primary pointer nothing is held (spec:AST-094 FR35, FR24)', async ({
    page,
  }) => {
    await openStory(page, storybook(), INFO);
    // The mouse comes to rest on the backdrop's spot before the dialog
    // opens, and a key opens it: no move happens during the entrance.
    await page.mouse.move(BACKDROP.x, BACKDROP.y);
    await slowNextEntrance(page);
    await page.getByRole('button', {name: 'Open Info Modal'}).focus();
    await page.keyboard.press('Enter');
    await holdEntrance(page);
    // The dialog is up and painted, still entering ...
    await expect(openDialogs(page)).toHaveCount(1);
    expect(
      (await openDialogs(page).boundingBox())?.height ?? 0,
    ).toBeGreaterThan(0);
    // ... and nothing holds it: no shield.
    await expect(
      page.locator('dialog[open] > [popover]'),
      'no input hold, so no shield',
    ).toHaveCount(0);

    await page.mouse.down();
    await page.mouse.up();
    await expect(openDialogs(page)).toHaveCount(0);
  });
});
