// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuLongPress.interaction.browser.spec.ts
 * @input The built "Touch / long press" ContextMenu story, real touch input
 *   (Chromium CDP / WebKit's input command), the interaction harness, the
 *   context-menu constants and UIKit's measured press frames
 * @output Interaction and animation proofs for opening a context menu with a
 *   held finger on UIKit's timeline, one touch model on every touch device
 *   (Chromium's finger stands for Android's engine, WebKit's for iOS; a theme
 *   retunes the feedback's motion roles): the menu opens at 735 ms for a finger
 *   still down, or at a lift after the commit, and not before; under Reduce
 *   Motion the card does not grow and the timeline holds; the lift sends no
 *   click; an early lift opens nothing and the card springs back; a second
 *   finger before the commit opens nothing and the card springs back; a
 *   drift within the tolerance still opens, past it on one axis (or a drag
 *   after the commit) opens nothing; the menu's anchor sits under the
 *   finger, on screen and as laid out, while the trigger is grown, and the
 *   menu stays put; the press feedback's presented scale
 *   follows UIKit's measured frames; it keeps advancing every frame through a
 *   blocked main thread; it does no Layout or Paint; the page does not scroll
 *   under the held finger; a storyboard of the press
 * @position Interaction specs of packages/core/src/ContextMenu (the
 *   BottomSheetDetent spec is the exemplar)
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  countBetween,
  drag,
  freezeTimers,
  holdAnimations,
  installInputLog,
  installLongTaskLog,
  installTimerGate,
  markElement,
  merge,
  openStory,
  readInputLog,
  releaseAnimations,
  startScreencast,
  tap,
  thawTimers,
  timeline,
  touchDriver,
  trackMarker,
  traceRendering,
  waitForAnimation,
  withFinger,
  withStorybook,
  writeEvidence,
  animationStoryboard,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {contextMenu} from '../../motion/uikit/contextMenu';
import {
  PRESS_FEEDBACK_START_MS,
  pressFeedbackCurve,
} from '../contextMenuPressCurve';
import {UIKIT_LONG_PRESS, UIKIT_PRESS_VIEW_WIDTH} from './uikitPressFrames';

const storybook = withStorybook(test);
const {commitMs, menuDisplayMs} = contextMenu.press;

interface TouchStory {
  driver: TouchDriver;
  trigger: Locator;
  center: {x: number; y: number};
}

/** The touch story under the engine's own finger (a coarse pointer). */
async function openTouchStory(
  page: Page,
  story = 'core-contextmenu--touch-long-press',
): Promise<TouchStory> {
  await installInputLog(page);
  await installLongTaskLog(page);
  // Note when the menu is asked to show, on the page clock (no per-frame
  // work: the rendering proofs share this page).
  await page.addInitScript(() => {
    const w = window as unknown as {
      __menuShownAt?: number | null;
      __liftHandledAt?: number | null;
    };
    w.__menuShownAt = null;
    w.__liftHandledAt = null;
    // When the page gets to the lift (the event's own timestamp is the
    // hardware's, or the script's): the menu shows in the same task.
    addEventListener(
      'touchend',
      () => {
        w.__liftHandledAt = performance.now();
      },
      {capture: true, passive: true},
    );
    const show = HTMLElement.prototype.showPopover;
    HTMLElement.prototype.showPopover = function (
      this: HTMLElement,
      ...args: Parameters<typeof show>
    ) {
      // Only a popover that holds the menu (Storybook shows its own).
      if (
        this.matches('[role="menu"]') ||
        this.querySelector('[role="menu"]') != null
      ) {
        w.__menuShownAt ??= performance.now();
      }
      return show.apply(this, args);
    };
  });
  await openStory(page, storybook(), story);
  const driver = await touchDriver(page);
  const trigger = page.getByTestId('touch-context-menu');
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  return {
    driver,
    trigger,
    center: {x: box.x + box.width / 2, y: box.y + box.height / 2},
  };
}

const menuShownAt = async (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {__menuShownAt?: number | null}).__menuShownAt ??
      null,
  );

/** The page-clock timestamp of the last `type` event. */
async function lastInput(
  page: Page,
  type: 'touchstart' | 'touchend',
): Promise<number> {
  const log = await readInputLog(page);
  const record = log.filter(entry => entry.type === type).at(-1);
  if (record == null) {
    throw new Error(`no ${type} reached the page`);
  }
  return record.timeStamp;
}

const touchStartedAt = async (page: Page) => lastInput(page, 'touchstart');

const presentedScale = async (trigger: Locator) =>
  trigger.evaluate(element => {
    const scale = getComputedStyle(element).scale;
    return scale === 'none' ? 1 : Number.parseFloat(scale);
  });

/** A finger held still for `ms`, then lifted. */
const hold = (at: {x: number; y: number}, ms: number) => tap(at, {holdMs: ms});

test('a finger still down gets the menu at 735 ms (iOS 26.2), not before', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  await driver.play(hold(center, menuDisplayMs + 200));
  const start = await touchStartedAt(page);
  const shown = await menuShownAt(page);
  expect(shown, 'the menu never showed').not.toBeNull();
  const after = (shown as number) - start;
  // The timer runs at its deadline, give or take a task.
  expect(after).toBeGreaterThanOrEqual(menuDisplayMs);
  expect(after).toBeLessThan(menuDisplayMs + 20);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
});

test('with presentation="popover" a finger keeps today’s long press: the menu at 500 ms, with no growth and no iOS timeline', async ({
  page,
}) => {
  const {driver, trigger, center} = await openTouchStory(
    page,
    'core-contextmenu--touch-long-press-popover',
  );
  // A coarse primary pointer: only the caller's choice keeps today's menu.
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  expect(await trigger.getAttribute('data-astryx-pressable')).toBeNull();
  const playing = driver.play(hold(center, 1000));
  await page.waitForTimeout(350);
  const scaleBeforeOpen = await presentedScale(trigger);
  // Still held: the menu is up. (On the lift, emulated Chromium sends the
  // compatibility mouse events a long press sends no click for on a device,
  // and they dismiss today's menu as they do on main; the touch model's
  // recognizer claims the finger instead.)
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible({
    timeout: 550,
  });
  await playing;
  const start = await touchStartedAt(page);
  const shown = await menuShownAt(page);
  expect(shown, 'the menu never showed').not.toBeNull();
  const after = (shown as number) - start;
  // Today's 500 ms, give or take a task and the render that shows the menu;
  // far from the touch model's 735 ms.
  expect(after).toBeGreaterThanOrEqual(500);
  expect(after).toBeLessThan(550);
  expect(scaleBeforeOpen).toBe(1);
});

test('a finger where the primary pointer is fine keeps today’s long press: the menu at 500 ms, with no growth', async ({
  browser,
  page,
}) => {
  // A touch screen whose primary pointer is fine (a laptop with a trackpad).
  const context = await browser.newContext({
    viewport: page.viewportSize() ?? {width: 402, height: 874},
    hasTouch: true,
    isMobile: false,
  });
  const fine = await context.newPage();
  try {
    await installInputLog(fine);
    await openStory(fine, storybook(), 'core-contextmenu--touch-long-press');
    const coarse = await fine.evaluate(
      () => matchMedia('(pointer: coarse)').matches,
    );
    test.skip(
      coarse,
      'this engine reports a coarse primary pointer whenever touch is emulated; the fine-primary finger is covered in jsdom',
    );
    const trigger = fine.getByTestId('touch-context-menu');
    const box = await trigger.boundingBox();
    if (box == null) {
      throw new Error('no trigger');
    }
    expect(await trigger.getAttribute('data-astryx-pressable')).toBeNull();
    const driver = await touchDriver(fine);
    const center = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    const playing = driver.play(hold(center, 1000));
    await fine.waitForTimeout(350);
    const scaleBeforeOpen = await presentedScale(trigger);
    await expect(fine.getByRole('menu', {name: 'Photo actions'})).toBeVisible({
      timeout: 550,
    });
    await playing;
    expect(scaleBeforeOpen).toBe(1);
  } finally {
    await context.close();
  }
});

test('under Reduce Motion the card does not grow, and the menu still opens at 735 ms', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, trigger, center} = await openTouchStory(page);
  const playing = driver.play(hold(center, menuDisplayMs + 200));
  // Sampled while the finger is down: before the commit, after it, and just
  // before the menu.
  const scales: number[] = [];
  for (const wait of [300, 250, 100]) {
    await page.waitForTimeout(wait);
    scales.push(await presentedScale(trigger));
  }
  await playing;
  const start = await touchStartedAt(page);
  const shown = await menuShownAt(page);
  expect(scales).toEqual([1, 1, 1]);
  expect(await trigger.evaluate(el => el.getAnimations().length)).toBe(0);
  expect(shown, 'the menu never showed').not.toBeNull();
  const after = (shown as number) - start;
  // The touch's stamp and the page clock are each coarsened (0.1 ms).
  expect(after).toBeGreaterThanOrEqual(menuDisplayMs - 0.5);
  expect(after).toBeLessThan(menuDisplayMs + 20);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
});

test('the trigger’s selection and callout lock: its own style keeps it off at rest, and the gesture host locks it for a held press', async ({
  page,
}) => {
  const {driver, trigger, center} = await openTouchStory(page);
  // WebKit spells it `-webkit-user-select` only.
  const readLock = async () =>
    trigger.evaluate(el => {
      const host = el as HTMLElement;
      const computed = getComputedStyle(host);
      return {
        inline:
          host.style.getPropertyValue('user-select') ||
          host.style.getPropertyValue('-webkit-user-select'),
        computed:
          computed.getPropertyValue('user-select') ||
          computed.getPropertyValue('-webkit-user-select'),
      };
    });
  // At rest the trigger's own style keeps selection off (spec:AST-017
  // FR59), whatever the host writes inline then.
  const rest = await readLock();
  expect(rest.computed).toBe('none');
  // A held finger, short of the commit: the host's lock is on the element.
  const playing = driver.play(hold(center, commitMs - 100));
  await page.waitForTimeout(commitMs / 2);
  const held = await readLock();
  await playing;
  await page.waitForTimeout(100);
  // Lifted with no menu: back to the rest value.
  const lifted = await readLock();
  expect(held).toEqual({inline: 'none', computed: 'none'});
  expect(lifted).toEqual(rest);
  expect(
    await page.getByRole('menu', {name: 'Photo actions'}).isVisible(),
  ).toBe(false);
});

test('a touch open lights no row: the menu itself takes the focus, and every row keeps its resting background', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  const playing = driver.play(hold(center, menuDisplayMs + 300));
  const menu = page.getByRole('menu', {name: 'Photo actions'});
  await expect(menu).toBeVisible();
  // The focus moves on the frame after the menu shows.
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  await expect(menu).toBeFocused();
  // An internal focus target: no browser ring on it.
  expect(await menu.evaluate(el => getComputedStyle(el).outlineStyle)).toBe(
    'none',
  );
  const backgrounds = await menu
    .getByRole('menuitem')
    .evaluateAll(rows =>
      rows.map(row => getComputedStyle(row).backgroundColor),
    );
  expect(new Set(backgrounds).size).toBe(1);
  await playing;
});

test('a theme retunes the press feedback (a motion role): with its latency at 300 ms the card is still at rest at 350 ms, then grows', async ({
  page,
}) => {
  const {driver, trigger, center} = await openTouchStory(page);
  // The theme scope's variable, as `defineTheme({motion})` writes it, set
  // before the first press reads it.
  await trigger.evaluate(el => {
    const scope =
      el.closest<HTMLElement>('[data-astryx-theme]') ??
      document.documentElement;
    scope.style.setProperty(
      '--motion-context-menu-press-feedback-latency-ms',
      '300ms',
    );
  });
  const playing = driver.play(hold(center, menuDisplayMs + 100));
  // The press machine's onset (150 ms) plus the themed latency: nothing
  // shows before 450 ms.
  await page.waitForTimeout(350);
  const early = await presentedScale(trigger);
  await page.waitForTimeout(300);
  const later = await presentedScale(trigger);
  await playing;
  expect(early).toBe(1);
  expect(later).toBeGreaterThan(1.001);
  // The onset, the commit and the menu's moment are gesture timing, not
  // roles.
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
});

test('a finger lifted after the commit gets the menu at the lift, and sends no click', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  await driver.play(hold(center, 530));
  await page.waitForTimeout(300);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  const {lift, shown} = await page.evaluate(() => {
    const w = window as unknown as {
      __menuShownAt?: number | null;
      __liftHandledAt?: number | null;
    };
    return {lift: w.__liftHandledAt ?? null, shown: w.__menuShownAt ?? null};
  });
  expect(lift).not.toBeNull();
  expect(shown).not.toBeNull();
  // In the lift's own task: after it, and before the next frame could paint.
  expect((shown as number) - (lift as number)).toBeGreaterThanOrEqual(0);
  expect((shown as number) - (lift as number)).toBeLessThan(1000 / 60);
  const log = await readInputLog(page);
  const end = log.filter(record => record.type === 'touchend').at(-1);
  expect(end?.defaultPrevented, JSON.stringify(log)).toBe(true);
  expect(log.filter(record => record.type === 'click')).toEqual([]);
});

test('the lift after the menu shows keeps it open and sends no click', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  await driver.play(hold(center, menuDisplayMs + 150));
  await page.waitForTimeout(300);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  const log = await readInputLog(page);
  expect(log.filter(record => record.type === 'click')).toEqual([]);
});

test('the menu’s anchor sits under the finger, on screen and as laid out, while the trigger is grown, and the menu stays put', async ({
  page,
}) => {
  const {driver, trigger} = await openTouchStory(page);
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  const menu = page.getByRole('menu', {name: 'Photo actions'});
  // The cursor anchor (the trigger's last child), on screen and as laid out
  // (engines differ on which one anchor positioning reads), and the menu.
  const read = async () =>
    trigger.evaluate(el => {
      const anchor = el.lastElementChild as HTMLElement | null;
      const box = el.getBoundingClientRect();
      const host = el as HTMLElement;
      const left = box.left + (box.width - host.offsetWidth) / 2;
      const top = box.top + (box.height - host.offsetHeight) / 2;
      const onScreen = anchor?.getBoundingClientRect();
      const list = document
        .querySelector('[role="menu"]')
        ?.getBoundingClientRect();
      return {
        onScreen: onScreen == null ? null : {x: onScreen.x, y: onScreen.y},
        laidOut:
          anchor == null
            ? null
            : {
                x: left + host.clientLeft + anchor.offsetLeft,
                y: top + host.clientTop + anchor.offsetTop,
              },
        menu: list == null ? null : {x: list.x, y: list.y},
      };
    });
  // The middle of the card and near its far corner, where an anchor placed
  // in the grown trigger's scaled coordinates would land furthest off.
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.9, 0.85],
  ] as const) {
    const p = {
      x: Math.round(box.x + box.width * fx),
      y: Math.round(box.y + box.height * fy),
    };
    await driver.play(hold(p, menuDisplayMs + 100));
    await expect(menu).toBeVisible();
    const first = await read();
    await page.waitForTimeout(400);
    const later = await read();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    // Let the trigger return to its size before the next press.
    await page.waitForTimeout(1200);
    const detail = JSON.stringify({p, first, later});
    expect(first.onScreen?.x, detail).toBeCloseTo(p.x, 0);
    expect(first.onScreen?.y, detail).toBeCloseTo(p.y, 0);
    expect(first.laidOut?.x, detail).toBeCloseTo(p.x, 0);
    expect(first.laidOut?.y, detail).toBeCloseTo(p.y, 0);
    expect(later.menu?.x, detail).toBeCloseTo(first.menu?.x ?? NaN, 0);
    expect(later.menu?.y, detail).toBeCloseTo(first.menu?.y ?? NaN, 0);
  }
});

test('a drag past the tolerance after the commit opens nothing', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  await driver.play(
    drag(
      center,
      {x: center.x, y: center.y + 30},
      {durationMs: 50, holdMs: 500, restMs: 400},
    ),
  );
  await page.waitForTimeout(200);
  expect(await menuShownAt(page)).toBeNull();
});

test('an early lift opens nothing, and the card springs back to its size', async ({
  page,
}) => {
  const {driver, trigger, center} = await openTouchStory(page);
  await driver.play(hold(center, 280));
  await page.waitForTimeout(commitMs + 200);
  expect(await menuShownAt(page)).toBeNull();
  // The return spring settles within ~1.2 s; then the scale is gone.
  await expect
    .poll(async () => trigger.evaluate(el => (el as HTMLElement).style.scale), {
      timeout: 3000,
    })
    .toBe('');
  expect(await presentedScale(trigger)).toBe(1);
});

test('a second finger landing before the commit cancels: no menu, and the card springs back', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'two-finger input is Chromium-only in Playwright (WebKit drops the first finger)',
  );
  const {driver, trigger, center} = await openTouchStory(page);
  // The first finger holds; a second lands 200 ms in, before the commit.
  await driver.play(
    merge(
      hold(center, menuDisplayMs + 300),
      withFinger(hold({x: center.x + 50, y: center.y}, 400), 1, 200),
    ),
  );
  await page.waitForTimeout(300);
  expect(await menuShownAt(page)).toBeNull();
  expect(await presentedScale(trigger)).toBeCloseTo(1, 3);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
});

test('a drift within the tolerance still opens the menu; past it on one axis cancels', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  // (8, 8): 11.3 px away, within the tolerance on each axis (a long press's
  // 10 px distance would cancel it). A drift past the browser's own pan slop
  // goes to the page instead, as a scroll view's pan takes it on iOS. Lifted
  // after the commit: the menu opens at the lift.
  await driver.play(
    drag(
      center,
      {x: center.x + 8, y: center.y + 8},
      {durationMs: 60, holdMs: 100, restMs: commitMs},
    ),
  );
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();

  const other = await openTouchStory(page);
  await other.driver.play(
    drag(
      other.center,
      {x: other.center.x, y: other.center.y + 12},
      {durationMs: 60, holdMs: 100, restMs: commitMs},
    ),
  );
  await page.waitForTimeout(200);
  expect(await menuShownAt(page)).toBeNull();
});

test('the press feedback follows UIKit’s measured press, frame by frame', async ({
  page,
}, testInfo) => {
  const {driver, trigger, center} = await openTouchStory(page);
  const playing = driver.play(hold(center, commitMs + 300));
  await waitForAnimation(trigger, {minProgressMs: 16});
  await holdAnimations(page, trigger);
  // Seek the held curve (its time 0 is PRESS_FEEDBACK_START_MS after the
  // touch) to every 60 Hz frame and read the presented scale.
  const samples = await trigger.evaluate((element, times) => {
    const held =
      (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ?? [];
    return times.map(t => {
      for (const animation of held) {
        animation.currentTime = t;
      }
      const scale = getComputedStyle(element).scale;
      return {t, value: scale === 'none' ? 1 : Number.parseFloat(scale)};
    });
  }, timeline(560));
  await releaseAnimations(page);
  await playing;
  const at = (ms: number) => {
    const t = ms - PRESS_FEEDBACK_START_MS;
    if (t <= 0) {
      return 1;
    }
    // Linear between the seeked frames.
    const i = samples.findIndex(s => s.t >= t);
    if (i <= 0) {
      return samples[Math.max(0, i)].value;
    }
    const a = samples[i - 1];
    const b = samples[i];
    return a.value + ((b.value - a.value) * (t - a.t)) / (b.t - a.t);
  };
  const errors = UIKIT_LONG_PRESS.map(([ms, uikit]) => ({
    ms,
    uikit,
    web: at(ms),
    errorPt: Math.abs(at(ms) - uikit) * UIKIT_PRESS_VIEW_WIDTH,
  }));
  const rms = Math.sqrt(
    errors.reduce((sum, e) => sum + e.errorPt ** 2, 0) / errors.length,
  );
  await writeEvidence(
    'curves/contextmenu-press-feedback',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {rmsPt: rms, errors, samples},
        null,
        1,
      ),
    },
    testInfo,
  );
  testInfo.annotations.push({
    type: 'uikit-parity',
    description: `press feedback vs UIKit iOS 26.2 (200 pt card): rms ${rms.toFixed(3)} pt over ${errors.length} frames`,
  });
  expect(rms).toBeLessThan(0.1);
  expect(Math.max(...errors.map(e => e.errorPt))).toBeLessThan(0.25);
});

test('the press feedback keeps advancing every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright (WebKit: the iOS simulator rig)',
  );
  const {driver, trigger, center} = await openTouchStory(page);
  // A wider card grows by about a CSS pixel a frame, which the screencast
  // resolves; it stays inside the viewport at its largest.
  await trigger.evaluate(el => {
    (el.firstElementChild as HTMLElement).style.width = '340px';
  });
  await markElement(trigger, {mode: 'outline'});
  const cast = await startScreencast(page);
  const playing = driver.play(hold(center, 1100));
  const [feedback] = await waitForAnimation(trigger, {minProgressMs: 40});
  const block = await blockMainThread(page, 450);
  await playing;
  await page.waitForTimeout(100);
  const castFrames = await cast.stop();
  const tracked = await trackMarker(page, castFrames);
  const proof = busyWindowProof(tracked, block, {axis: 'width'});
  // What the curve grows by over the judged window, in the marker's pixels.
  const touch =
    (await page.evaluate(() => performance.timeOrigin)) +
    (await touchStartedAt(page));
  const curve = pressFeedbackCurve();
  const scaleAt = (epoch: number) =>
    curve.at((epoch - touch - PRESS_FEEDBACK_START_MS) / 1000);
  const restWidth = (proof.first ?? 0) / scaleAt(block.from + 20);
  const expectedGrowth =
    restWidth * (scaleAt(block.to - 20) - scaleAt(block.from + 20));
  await writeEvidence(
    'busy-main-thread/contextmenu-press-feedback',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          feedback,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - block.from).toFixed(1),
            w: f.box?.width ?? null,
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'contextmenu-press-feedback-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: block.to + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({w: tracked.find(f => f.t === t)?.box?.width ?? -1}),
  });
  await film.write(testInfo, {block, feedback, expectedGrowth});
  // Frames kept coming at display rate and the card kept growing, as much
  // as the curve says. The screencast resolves whole pixels and the card
  // grows by about one every other frame, so a pixel may take 3 frames.
  expect(proof.medianFrameMs).toBeLessThan(20);
  expect(proof.frames).toBeGreaterThanOrEqual(proof.expectedFrames - 2);
  expect(proof.monotonic).toBe(true);
  expect(proof.longestStallMs).toBeLessThan(4 * (1000 / 60) + 4);
  expect((proof.last ?? 0) - (proof.first ?? 0)).toBeGreaterThanOrEqual(
    Math.floor(expectedGrowth) - 1,
  );
});

test('the press feedback does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, center} = await openTouchStory(page);
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const trace = await traceRendering(page, async () => {
    // Lifted just before the commit: the feedback alone, then its return.
    await driver.play(hold(center, commitMs - 20));
  });
  const start = timeOrigin + (await touchStartedAt(page));
  const during = countBetween(
    trace,
    start + PRESS_FEEDBACK_START_MS + 50,
    start + commitMs - 30,
  );
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  expect(trace.longTasks).toEqual([]);
});

/** The story with somewhere to scroll below it, and its trigger's center. */
async function openScrollableStory(page: Page) {
  const story = await openTouchStory(page);
  await page.evaluate(() => {
    document.body.style.paddingBottom = '3000px';
  });
  const box = await story.trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  const center = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  // Where the trigger's container sits: the trigger itself is scaled by the
  // press feedback.
  const top = async () =>
    story.trigger.evaluate(
      el => (el.parentElement ?? el).getBoundingClientRect().y,
    );
  return {...story, center, top};
}

test('the page does not scroll under a finger held until the menu, nor while the menu is up', async ({
  page,
}) => {
  const {driver, center, top} = await openScrollableStory(page);
  const before = await top();
  // Held until the menu shows, then dragged up 200 px.
  await driver.play(
    drag(
      center,
      {x: center.x, y: center.y - 200},
      {durationMs: 300, holdMs: menuDisplayMs + 50, restMs: 100},
    ),
  );
  expect(await top()).toBe(before);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
});

test('a drag that cancels the press after the commit does not scroll the page either', async ({
  page,
}) => {
  const {driver, center, top} = await openScrollableStory(page);
  const before = await top();
  await driver.play(
    drag(
      center,
      {x: center.x, y: center.y - 200},
      {durationMs: 300, holdMs: commitMs + 100, restMs: 100},
    ),
  );
  expect(await menuShownAt(page)).toBeNull();
  expect(await top()).toBe(before);
});

test(
  'storyboard: the press feedback up to the menu',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, trigger, center} = await openTouchStory(page);
    const box = await trigger.boundingBox();
    if (box == null) {
      throw new Error('no trigger');
    }
    // Gate the page's timers first: the commit and the menu wait while the
    // held feedback is photographed, and the finger stays down meanwhile.
    await installTimerGate(page);
    const playing = driver.play(hold(center, 8000));
    await waitForAnimation(trigger, {minProgressMs: 16});
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'contextmenu-press-feedback',
      clip: {
        x: box.x - 24,
        y: box.y - 24,
        width: box.width + 48,
        height: box.height + 48,
      },
      scope: trigger,
      // t counts from the visible ramp's start, 188 ms after the touch.
      times: timeline(menuDisplayMs - PRESS_FEEDBACK_START_MS, 1000 / 30),
      measure: async () => ({
        scale: (await presentedScale(trigger)).toFixed(4),
      }),
      columns: 6,
      cellScale: 0.6,
    });
    await releaseAnimations(page);
    await thawTimers(page);
    await playing;
    await storyboard.write(testInfo);
    const scales = storyboard.frames.map(f => Number(f.data.scale));
    expect(scales.every((s, i) => i === 0 || s >= scales[i - 1])).toBe(true);
    // UIKit's platter at 732.6 ms: 1.0618.
    expect(scales.at(-1)).toBeCloseTo(1.0618, 2);
  },
);
