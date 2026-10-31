// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DrawerTouchEntrance.interaction.browser.spec.ts
 * @input The built Drawer stories "Showcase" (modal, with a scrim) and "Row
 *   Inspector" (non-modal), real touch input through the interaction harness
 *   in its phone context, and a mouse there and on a fine-pointer page
 * @output Browser evidence for spec:AST-094 FR35 on Drawer: under a finger, a
 *   tap or a drag that lands while the drawer is still sliding in closes
 *   nothing, runs no action, moves no focus and scrolls nothing, and the
 *   drawer finishes sliding in and stays open; around a non-modal drawer only
 *   a tap on the panel is held, and the page stays live; keys stay live and
 *   the content stays in the accessibility tree meanwhile. With a mouse, a
 *   click during the slide-in acts as before: on a touch screen the hold
 *   decides by each event's pointer, and under a fine primary pointer nothing
 *   is held, a press where the mouse already rests included.
 * @position Browser proof for Drawer's entrance hold (useDrawerDialogPresence,
 *   through the Layer module's holdEntranceInput); the hold itself is proven
 *   in Layer/__tests__/inputHold.interaction.browser.spec.ts
 *
 * Each case slows the slide-in to a minute before opening (a machine as busy
 * as a 3-CPU runner can play a normal one out before a case looks) and holds
 * it where it is (holdAnimations), so every touch lands while the drawer is
 * still entering; the slowing then goes, so the exit keeps its own timing,
 * and finishing the slide-in ends it at once.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  drag,
  frames,
  holdAnimations,
  openStory,
  releaseAnimations,
  seekAnimations,
  touchDriver,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

type Point = {x: number; y: number};

const MODAL = 'core-drawer--showcase';
const NON_MODAL = 'core-drawer--row-inspector';

/** A point in the strip the drawer leaves free: the scrim, or the page. */
const STRIP: Point = {x: 20, y: 357};

const OPEN = 'dialog[open], dialog:popover-open';

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

const openDrawers = (page: Page) => page.locator(OPEN);

/** Waits until the open drawer's slide-in is running, then holds it there. */
async function holdEntrance(page: Page): Promise<void> {
  await page.waitForFunction(
    selector =>
      document
        .querySelector(selector)
        ?.getAnimations()
        .some(animation => animation.playState === 'running') ?? false,
    OPEN,
  );
  const held = await holdAnimations(page, openDrawers(page));
  // Held: later transitions (an exit, the next open) keep their own timing.
  await page.evaluate(() =>
    document.getElementById('__slowEntrance')?.remove(),
  );
  expect(held.length, 'the drawer is still sliding in').toBeGreaterThan(0);
}

/**
 * Moves the held slide-in to 30 ms before its end: the panel is nearly in
 * place, so a control inside it is on screen, and the drawer is still
 * entering.
 */
async function seekNearEnd(page: Page): Promise<void> {
  const endMs = await openDrawers(page).evaluate(drawer =>
    Math.max(
      ...drawer
        .getAnimations()
        .map(animation =>
          Number(animation.effect?.getComputedTiming().endTime ?? 0),
        ),
    ),
  );
  await seekAnimations(page, endMs - 30);
}

/**
 * Slows the next entrance to a minute, so the drawer is still entering when a
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

/** Ends the slide-in at once, held or not. */
async function finishEntrance(page: Page): Promise<void> {
  await releaseAnimations(page, {finish: true});
  await openDrawers(page).evaluate(async drawer => {
    document.getElementById('__slowEntrance')?.remove();
    // An entrance no case held (opened only to be finished) ends here too.
    for (const animation of drawer.getAnimations()) {
      const end = animation.effect?.getComputedTiming().endTime;
      if (typeof end === 'number' && Number.isFinite(end)) {
        animation.finish();
      }
    }
    await Promise.all(
      drawer.getAnimations().map(async animation =>
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

/** Opens the story's drawer with a tap and holds its slide-in midway. */
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
  test('a tap on the scrim while the drawer slides in closes nothing, and once it is in the same tap closes it', async ({
    page,
  }) => {
    const driver = await openMidEntrance(page, MODAL, 'Open inspector');

    await driver.tap(STRIP);
    await frames(page);
    await expect(openDrawers(page)).toHaveCount(1);

    await finishEntrance(page);
    await expect(
      page.getByRole('dialog', {name: 'Deployment details'}),
    ).toBeVisible();

    await driver.tap(STRIP);
    await expect(openDrawers(page)).toHaveCount(0);
  });

  test('a tap on its close button while the drawer slides in runs nothing and moves no focus', async ({
    page,
  }) => {
    const driver = await openMidEntrance(page, MODAL, 'Open inspector');
    await seekNearEnd(page);
    const close = openDrawers(page).getByRole('button', {name: 'Close'});
    const target = await centerOf(close);
    expect(target.x, 'the close button is on screen').toBeLessThan(
      page.viewportSize()?.width ?? 0,
    );
    // Focus starts inside the drawer, on its content area.
    expect(
      await openDrawers(page).evaluate(drawer =>
        drawer.contains(document.activeElement),
      ),
    ).toBe(true);
    const focused = await focusedElement(page);

    await driver.tap(target);
    await frames(page);
    await expect(openDrawers(page)).toHaveCount(1);
    expect(await focusedElement(page)).toBe(focused);

    await finishEntrance(page);
    await expect(openDrawers(page)).toHaveCount(1);

    await driver.tap(await centerOf(close));
    await expect(openDrawers(page)).toHaveCount(0);
  });

  test('around a non-modal drawer sliding in the page stays live: a drag scrolls it and a tap reaches it, while a tap on the drawer reaches nothing (spec:AST-094 FR35)', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'needs native scrolling from injected touches (the WebKit driver has none)',
    );
    await installTouchProbe(page);
    await openStory(page, storybook(), NON_MODAL);
    // A page that scrolls behind the drawer, which leaves it interactive.
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '300vh';
      document.body.append(spacer);
    });
    const driver = await touchDriver(page);
    const up = drag(
      {x: STRIP.x, y: 600},
      {x: STRIP.x, y: 250},
      // A rest before the lift: no fling outlives the pan.
      {durationMs: 200, restMs: 150},
    );
    // Where the visual viewport is in the document. This story's page is
    // wider than the phone, so a pan first moves the visual viewport inside
    // the layout viewport, which `window.scrollY` does not report.
    const pageTop = async () =>
      page.evaluate(() => {
        if (window.visualViewport == null) {
          throw new Error('the page has no visual viewport');
        }
        return window.visualViewport.pageTop;
      });

    const opener = page.getByRole('button', {name: 'Open drawer'});
    await opener.evaluate(element => element.scrollIntoView({block: 'center'}));
    await frames(page, 2);
    await slowNextEntrance(page);
    await driver.tap(await centerOf(opener));
    await holdEntrance(page);
    // The panel nearly in place, so its close button is on screen.
    await seekNearEnd(page);
    // Every click, split by where it landed: on the page or in the drawer.
    await page.evaluate(() => {
      const clicks = {page: [] as string[], drawer: [] as string[]};
      (window as unknown as {__clicks: typeof clicks}).__clicks = clicks;
      document.addEventListener(
        'click',
        event => {
          const target = event.target as Element;
          const inDrawer = target.closest('dialog') != null;
          (inDrawer ? clicks.drawer : clicks.page).push(
            target.tagName.toLowerCase(),
          );
        },
        {capture: true},
      );
    });
    const clicks = async () =>
      page.evaluate(
        () =>
          (window as unknown as {__clicks: {page: string[]; drawer: string[]}})
            .__clicks,
      );

    // The drawer and its close button are up and painted.
    await expect(
      page.getByRole('button', {name: 'Close inspector'}),
    ).toBeVisible();
    // A tap on the drawer while it slides in reaches nothing.
    await driver.tap(
      await centerOf(page.getByRole('button', {name: 'Close inspector'})),
    );
    await frames(page);
    expect((await clicks()).drawer).toEqual([]);
    await expect(openDrawers(page)).toHaveCount(1);

    // The page beside it stays live: a drag scrolls it ...
    const before = await pageTop();
    const free = await playDrag(page, driver, up);
    expectDelivered(free);
    expect(free.panned, 'the browser took the drag to scroll').toBe(true);
    expect(await pageTop()).toBeGreaterThan(before);
    // ... and a tap reaches it.
    await driver.tap(STRIP);
    await expect.poll(async () => (await clicks()).page.length).toBe(1);
    await expect(openDrawers(page)).toHaveCount(1);
  });

  test('keys and assistive technology stay live while the drawer slides in', async ({
    page,
  }) => {
    await openMidEntrance(page, MODAL, 'Open inspector');

    // The content stays in the accessibility tree, close button included.
    const tree = await page
      .getByRole('dialog', {name: 'Deployment details'})
      .ariaSnapshot();
    expect(tree).toContain('button "Close"');

    // A key acts at once: Escape closes the drawer mid-slide.
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', {name: 'Deployment details'}),
    ).toBeHidden();
  });
});

test.describe('with a mouse on a touch screen', () => {
  test('a click on the scrim while the drawer slides in closes it, as before: only a finger is held', async ({
    page,
  }) => {
    await openMidEntrance(page, MODAL, 'Open inspector');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      'the primary pointer is a finger',
    ).toBe(true);

    await page.mouse.click(STRIP.x, STRIP.y);
    await expect(
      page.getByRole('dialog', {name: 'Deployment details'}),
    ).toBeHidden();
  });
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a click on the scrim while the drawer slides in closes it, as before', async ({
    page,
  }) => {
    await openStory(page, storybook(), MODAL);
    await slowNextEntrance(page);
    await page.getByRole('button', {name: 'Open inspector'}).click();
    await holdEntrance(page);

    await page.mouse.click(STRIP.x, STRIP.y);
    await expect(
      page.getByRole('dialog', {name: 'Deployment details'}),
    ).toBeHidden();
  });

  test('a press where the mouse already rests closes the drawer from its scrim while it slides in: under a fine primary pointer nothing is held (spec:AST-094 FR35, FR24)', async ({
    page,
  }) => {
    await openStory(page, storybook(), MODAL);
    // The mouse comes to rest on the scrim's spot before the drawer opens,
    // and a key opens it: no move happens during the slide-in.
    await page.mouse.move(STRIP.x, STRIP.y);
    await slowNextEntrance(page);
    await page.getByRole('button', {name: 'Open inspector'}).focus();
    await page.keyboard.press('Enter');
    await holdEntrance(page);
    // The drawer is up and painted, still sliding in ...
    await expect(openDrawers(page)).toHaveCount(1);
    expect((await openDrawers(page).boundingBox())?.width ?? 0).toBeGreaterThan(
      0,
    );
    // ... and nothing holds it: no shield.
    await expect(
      page.locator('dialog[open] > [popover]'),
      'no input hold, so no shield',
    ).toHaveCount(0);

    await page.mouse.down();
    await page.mouse.up();
    await expect(
      page.getByRole('dialog', {name: 'Deployment details'}),
    ).toBeHidden();
  });
});
