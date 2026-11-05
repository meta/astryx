// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavTouchPresentation.a11y.chromium.spec.ts
 * @input The built MobileNav "Default" story, real Chromium touch input in a
 *   phone context and a mouse on a fine-pointer page
 * @output Browser evidence that under a finger the drawer takes no tap while
 *   it slides in, while keys and assistive technology stay live; that a close
 *   holds nothing (spec:AST-094 FR35 holds entrances only): the dialog closes
 *   on its own timing (at most 250 ms in, FR5), when focus returns to the
 *   opener and the page takes taps again; the rest of the slide-out after the
 *   close takes no tap and is hidden from assistive technology (FR5). Under a
 *   mouse nothing is held and the close keeps its timing.
 * @position Chromium proof for MobileNav's touch presentation (MobileNav.tsx);
 *   the jsdom layer is MobileNavTouchPresentation.test.tsx
 *
 * A case that must act inside the slide-in or the close stops the page's
 * clock first, so the close's own delay and the slide-in's cap wait for it
 * however long the runner takes between steps, and
 * it runs the clock on by exact amounts. Where the drawer's place or its
 * slide-in matters, the slide is slowed to a minute; the close keeps its own
 * timing either way.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 402, height: 714},
  deviceScaleFactor: 1,
});

test.beforeEach(async ({page}) => {
  // The page's clock runs with real time until a case stops it (stopClock).
  await page.clock.install();
  // Counts the key presses that reach the window (settleInput).
  await page.addInitScript(() => {
    const counter = window as unknown as {__keydowns: number};
    counter.__keydowns = 0;
    window.addEventListener(
      'keydown',
      () => {
        counter.__keydowns += 1;
      },
      true,
    );
  });
});

const MOBILE_NAV_STORY = 'core-mobilenav--default';

interface LoggedEvent {
  type: 'click' | 'focus' | 'open';
  /** performance.now() in the page, ms. */
  t: number;
  /** The event's target is inside the dialog (or is the dialog). */
  inDialog?: boolean;
  /** The event's target is the dialog itself: its backdrop. */
  onBackdrop?: boolean;
  /** The event's target is inside the drawer panel. */
  inDrawer?: boolean;
  /** The focused element's accessible name, for focus events. */
  name?: string | null;
  /** The dialog's `open` attribute, for open events. */
  open?: boolean;
}

/**
 * Opens the drawer from its button with a tap, waits for the slide-in, and
 * starts logging clicks, focus moves and the dialog's `open` attribute.
 */
async function openNav(
  page: Page,
  {
    input = 'touch',
    tokenDefault = false,
  }: {
    input?: 'touch' | 'mouse';
    /**
     * Runs the slide at the token default, `--duration-medium: 410ms`, rather
     * than the story theme's 300 ms, so a close at the end of the slide-out
     * (410 ms) and one on FR5's timing (at most 250 ms) are far apart.
     */
    tokenDefault?: boolean;
  } = {},
) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${MOBILE_NAV_STORY}&viewMode=story`,
  );
  if (tokenDefault) {
    await page.addStyleTag({
      content: '* { --duration-medium: 410ms !important; }',
    });
  }
  const opener = page.getByRole('button', {name: 'Open Navigation'});
  // A tap focuses the button in Chromium; focusing it first makes the opener
  // explicit for the focus-return assertions.
  await opener.focus();
  if (input === 'mouse') {
    await opener.click();
  } else {
    await opener.tap();
  }
  const nav = page.getByRole('dialog');
  await expect(nav).toBeVisible();
  const drawer = nav.locator('[tabindex="-1"]').first();
  await drawer.evaluate(async element => {
    await Promise.all(element.getAnimations().map(async a => a.finished));
  });
  const box = await drawer.boundingBox();
  const viewport = page.viewportSize();
  if (box == null || viewport == null) {
    throw new Error('the drawer did not render');
  }
  const durationMs = await drawer.evaluate(element => {
    const value = getComputedStyle(element).transitionDuration.split(',')[0];
    return value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
  });
  await page.evaluate(() => {
    const events: LoggedEvent[] = [];
    (window as unknown as {__events: LoggedEvent[]}).__events = events;
    const dialog = document.querySelector('dialog');
    if (dialog == null) {
      throw new Error('no dialog');
    }
    new MutationObserver(() => {
      events.push({
        type: 'open',
        t: performance.now(),
        open: dialog.hasAttribute('open'),
      });
    }).observe(dialog, {attributes: true, attributeFilter: ['open']});
    document.addEventListener(
      'click',
      event => {
        const target = event.target as Element;
        // Keep the story's nav links from navigating the frame.
        if (target.closest('a')) {
          event.preventDefault();
        }
        events.push({
          type: 'click',
          t: performance.now(),
          inDialog: target.closest('dialog') != null,
          onBackdrop: target === dialog,
          inDrawer: target.closest('dialog [tabindex="-1"]') != null,
        });
      },
      true,
    );
    document.addEventListener(
      'focusin',
      event => {
        const target = event.target as HTMLElement;
        events.push({
          type: 'focus',
          t: performance.now(),
          name: target.getAttribute('aria-label') ?? target.textContent,
        });
      },
      true,
    );
  });
  // The backdrop is the strip the drawer leaves free.
  const strip =
    box.x > 0.5
      ? {from: 0, to: box.x}
      : {from: box.x + box.width, to: viewport.width};
  const backdrop = {x: (strip.from + strip.to) / 2, y: viewport.height / 2};
  return {nav, drawer, durationMs, backdrop};
}

const loggedEvents = async (page: Page) =>
  page.evaluate(
    () => (window as unknown as {__events: LoggedEvent[]}).__events,
  );

const now = async (page: Page) => page.evaluate(() => performance.now());

/** The dialog's state at this instant. */
const state = async (page: Page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    const drawer = dialog?.querySelector<HTMLElement>('[tabindex="-1"]');
    return {
      modal: dialog?.matches(':modal') ?? false,
      drawerInert: drawer?.inert ?? false,
      scrim:
        dialog == null ? null : +getComputedStyle(dialog, '::backdrop').opacity,
      focusInDrawer: drawer != null && drawer.contains(document.activeElement),
      focusOnOpener:
        document.activeElement?.getAttribute('aria-label') ===
        'Open Navigation',
    };
  });

const middleOf = (box: {x: number; y: number; width: number; height: number}) =>
  [box.x + box.width / 2, box.y + box.height / 2] as const;

/**
 * Stops the page's clock: no timer fires (the close's own delay, the
 * slide-in's cap) until `advance` runs the clock on.
 * Until here it runs with real time; the pause is a minute ahead, so always in
 * its future.
 */
async function stopClock(page: Page) {
  const pageNow = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(pageNow + 60_000);
  return {
    /** Runs the page's clock `ms` on, firing every timer due by then. */
    advance: async (ms: number) => page.clock.runFor(ms),
  };
}

/** Slows the drawer's slide to a minute, so it is still moving at each step. */
const slowSlide = async (page: Page) =>
  page.addStyleTag({content: '* { --duration-medium: 60s !important; }'});

/**
 * Waits until every tap sent before has reached the page, clicks and all: a
 * Shift press goes through the same input queue after them, and no hold takes
 * keys (FR35).
 */
async function settleInput(page: Page) {
  const keydowns = async () =>
    page.evaluate(() => (window as unknown as {__keydowns: number}).__keydowns);
  const before = await keydowns();
  await page.keyboard.press('Shift');
  await expect.poll(keydowns).toBe(before + 1);
}

test('a close holds nothing: the dialog closes at most 250 ms in (FR5), then focus returns', async ({
  page,
}) => {
  const {durationMs, backdrop} = await openNav(page, {tokenDefault: true});
  expect(durationMs).toBeGreaterThan(400);

  const clock = await stopClock(page);
  await page.touchscreen.tap(backdrop.x, backdrop.y);
  const closeTapped = await now(page);
  await settleInput(page);
  // Inside the close, which cannot end while the page's clock is stopped:
  // still the modal dialog with its drawer laid out, and nothing held
  // (spec:AST-094 FR35 holds an entrance only): no shield, the leaving
  // drawer live.
  const early = await state(page);
  expect(early.modal).toBe(true);
  const drawerBox = await page
    .locator('dialog [tabindex="-1"]')
    .first()
    .boundingBox();
  expect(drawerBox?.width ?? 0).toBeGreaterThan(0);
  expect(early.drawerInert).toBe(false);
  await expect(page.locator('dialog > [popover]')).toHaveCount(0);

  await clock.advance(1000);
  // The dialog closed on its own timing, at most 250 ms in, well before the
  // 410 ms slide-out ended...
  const events = await loggedEvents(page);
  const closed = events.find(e => e.type === 'open' && e.open === false);
  expect(closed).toBeDefined();
  const closedIn = (closed?.t ?? Infinity) - closeTapped;
  expect(closedIn).toBeGreaterThan(0);
  expect(closedIn).toBeLessThanOrEqual(250);
  // ...and focus went back to the opener as it did, in the same task.
  const returned = events.find(
    e => e.type === 'focus' && e.name === 'Open Navigation',
  );
  expect(returned?.t).toBe(closed?.t);
  const after = await state(page);
  expect(after.modal).toBe(false);
  expect(after.drawerInert).toBe(false);
});

test('the page takes taps again once the dialog has closed', async ({page}) => {
  const {backdrop} = await openNav(page, {tokenDefault: true});
  await slowSlide(page);

  const clock = await stopClock(page);
  await page.touchscreen.tap(backdrop.x, backdrop.y);
  await settleInput(page);
  await clock.advance(1000);
  expect((await state(page)).modal).toBe(false);
  // The dialog has closed while the drawer still slides out (a minute long
  // here): the page takes the next tap.
  await page.touchscreen.tap(backdrop.x, backdrop.y);
  await settleInput(page);

  const events = await loggedEvents(page);
  const closed = events.find(e => e.type === 'open' && e.open === false);
  expect(closed).toBeDefined();
  const clicks = events.filter(e => e.type === 'click');
  const pageClicks = clicks.filter(e => !e.inDialog);
  // Two clicks: the close tap's on the backdrop, and the page's after the
  // close.
  expect(clicks).toHaveLength(2);
  expect(clicks[0].onBackdrop).toBe(true);
  expect(clicks[0].t).toBeLessThan(closed?.t ?? -Infinity);
  expect(pageClicks).toHaveLength(1);
  expect(pageClicks[0]).toBe(clicks[1]);
  expect(pageClicks[0].t).toBeGreaterThan(closed?.t ?? Infinity);
});

/**
 * The roles and names the browser's accessibility tree gives assistive
 * technology: its nodes that are not ignored.
 */
async function exposedToAssistiveTech(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: {
        ignored: boolean;
        role?: {value: string};
        name?: {value: string};
      }[];
    };
    return nodes
      .filter(node => !node.ignored)
      .map(node =>
        `${node.role?.value ?? ''} ${node.name?.value ?? ''}`.trim(),
      );
  } finally {
    await cdp.detach();
  }
}

/** Whether a hit at a point lands inside the drawer panel. */
const hitsDrawer = async (page: Page, point: readonly [number, number]) =>
  page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x, y)?.closest('dialog [tabindex="-1"]') !=
      null,
    point,
  );

test('after the dialog closes, the rest of the slide-out takes no tap and is hidden from assistive technology (FR5)', async ({
  page,
}) => {
  const {backdrop} = await openNav(page, {tokenDefault: true});
  const link = page.locator('dialog a', {hasText: 'Dashboard'});
  const linkBox = async () => {
    const box = await link.boundingBox();
    if (box == null) {
      throw new Error('no link box');
    }
    return box;
  };
  // Open, its link takes a hit and assistive technology reads the dialog and
  // its links: what the checks below look for is there to find.
  expect(await hitsDrawer(page, middleOf(await linkBox()))).toBe(true);
  expect(await exposedToAssistiveTech(page)).toEqual(
    expect.arrayContaining(['dialog Navigation', 'link Dashboard']),
  );

  await slowSlide(page);
  const clock = await stopClock(page);
  await page.touchscreen.tap(backdrop.x, backdrop.y);
  await settleInput(page);
  await clock.advance(1000);
  // The dialog has closed while the drawer still slides out (a minute long
  // here): the drawer and its link are there, painted on screen.
  expect((await state(page)).modal).toBe(false);
  expect(
    await page.evaluate(() => document.querySelector('dialog')?.open),
  ).toBe(false);
  const tail = await linkBox();
  const viewport = page.viewportSize();
  expect(tail.width).toBeGreaterThan(0);
  expect(tail.x).toBeGreaterThanOrEqual(0);
  expect(tail.x + tail.width).toBeLessThanOrEqual(viewport?.width ?? 0);
  const onLink = middleOf(tail);
  // A tap on the leaving drawer reaches the page, not the drawer...
  expect(await hitsDrawer(page, onLink)).toBe(false);
  await page.touchscreen.tap(...onLink);
  await settleInput(page);
  const clicks = (await loggedEvents(page)).filter(e => e.type === 'click');
  // The close tap's click on the backdrop, then the page's.
  expect(clicks).toHaveLength(2);
  expect(clicks[0].onBackdrop).toBe(true);
  expect(clicks[1].inDialog).toBe(false);
  // ...and assistive technology reads none of it.
  const exposed = await exposedToAssistiveTech(page);
  expect(exposed).not.toContain('dialog Navigation');
  expect(exposed).not.toContain('link Dashboard');
  expect(exposed).not.toContain('button Close navigation');
});

/** Opens the drawer with a tap while the page's clock is stopped. */
async function openInsideSlideIn(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${MOBILE_NAV_STORY}&viewMode=story`,
  );
  await slowSlide(page);
  const opener = await page
    .getByRole('button', {name: 'Open Navigation'})
    .boundingBox();
  if (opener == null) {
    throw new Error('no opener box');
  }
  const clock = await stopClock(page);
  await page.touchscreen.tap(...middleOf(opener));
  await settleInput(page);
  await expect.poll(async () => (await state(page)).modal).toBe(true);
  return clock;
}

test('a tap during the slide-in reaches nothing', async ({page}) => {
  const clock = await openInsideSlideIn(page);
  const viewport = page.viewportSize();
  if (viewport == null) {
    throw new Error('no viewport');
  }
  // Early in the slide-in, on the strip the drawer leaves free: under iOS's
  // rule the tap is dropped, so it does not close the drawer. The point is
  // the backdrop's: inside the dialog, outside the drawer, which is there
  // and laid out.
  const tap = {x: 8, y: viewport.height / 2};
  const dialogBox = await page.locator('dialog').boundingBox();
  const drawerBox = await page
    .locator('dialog [tabindex="-1"]')
    .first()
    .boundingBox();
  if (dialogBox == null || drawerBox == null) {
    throw new Error('no dialog or drawer box');
  }
  expect(drawerBox.width).toBeGreaterThan(0);
  expect(drawerBox.height).toBeGreaterThan(0);
  expect(tap.x).toBeGreaterThan(dialogBox.x);
  expect(tap.x).toBeLessThan(dialogBox.x + dialogBox.width);
  expect(tap.x < drawerBox.x || tap.x > drawerBox.x + drawerBox.width).toBe(
    true,
  );
  await page.touchscreen.tap(tap.x, tap.y);
  await settleInput(page);
  // A close asked for would have closed the dialog by now: the page's clock
  // ran past the close's delay and the slide-in's cap.
  await clock.advance(1000);
  expect(
    await page.evaluate(() => document.querySelector('dialog')?.open),
  ).toBe(true);
});

test('keys and assistive technology stay live during the slide-in (spec:AST-094 FR35)', async ({
  page,
}) => {
  await openInsideSlideIn(page);
  // Early in the slide-in, while a tap is still held: a key moves focus into
  // the drawer, and its links stay in the accessibility tree.
  await page.keyboard.press('Tab');
  const live = await page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    const drawer = dialog?.querySelector('[tabindex="-1"]');
    const focused = document.activeElement;
    return {
      sliding:
        drawer?.getAnimations().some(a => a.playState === 'running') ?? false,
      focusInDialog: dialog?.contains(focused) ?? false,
      focusInert: focused?.closest('[inert]') != null,
    };
  });
  expect(live.sliding).toBe(true);
  expect(live.focusInDialog).toBe(true);
  expect(live.focusInert).toBe(false);
  await expect(page.getByRole('link', {name: 'Dashboard'})).toHaveCount(1);
});

test.describe('under a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('nothing is held, and the dialog closes partway into the slide-out, as before', async ({
    page,
  }) => {
    const {drawer, durationMs, backdrop} = await openNav(page, {
      input: 'mouse',
    });
    expect(
      await page.evaluate(() => matchMedia('(pointer: fine)').matches),
    ).toBe(true);

    const clock = await stopClock(page);
    await page.mouse.click(backdrop.x, backdrop.y);
    const closeClicked = await now(page);
    await settleInput(page);
    // No hold: the leaving drawer is not inert.
    expect(
      await drawer.evaluate(element => (element as HTMLElement).inert),
    ).toBe(false);
    await clock.advance(1000);

    const events = await loggedEvents(page);
    const closed = events.find(e => e.type === 'open' && e.open === false);
    expect(closed).toBeDefined();
    // The close's own timing: at most 250 ms in, well before the slide-out
    // ends.
    const closedIn = (closed?.t ?? Infinity) - closeClicked;
    expect(closedIn).toBeGreaterThan(0);
    expect(closedIn).toBeLessThan(durationMs);
    expect(closedIn).toBeLessThanOrEqual(250);
    expect(
      events.some(e => e.type === 'focus' && e.name === 'Open Navigation'),
    ).toBe(true);
  });
});
