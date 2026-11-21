// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatLayoutKeyboard.interaction.browser.spec.ts
 * @input The built "Full AI Chat" ChatLayout story, a stand-in visual
 *   viewport that reports a software keyboard, real touch input and the
 *   interaction harness
 * @output Proofs that on Chrome's profile the dock rides Gboard's slide up
 *   and down with no Layout or Paint per frame. Under Reduce Motion it never
 *   travels, also on a hide reported in steps. The transcript stays at its
 *   newest message. A tap on the composer's text scrolls no page. Done's park
 *   shows the focus ring after typing only. A storyboard shows the rise
 * @position Browser proofs for Chat/useChatKeyboard.ts and
 *   keyboard/keyboardLayoutGuide.ts. Headless browsers have no software
 *   keyboard, so the test shrinks the page's `visualViewport` as Mobile
 *   Safari does: one `resize`, to the final height
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {cubicBezier} from '../../motion/bezier';
import {keyboard as ANDROID_KEYBOARD} from '../../motion/android/keyboard';
import {
  animationStoryboard,
  armHold,
  compareCurve,
  curveOf,
  type HeldAnimation,
  openStory,
  releaseAnimations,
  type RenderingEvent,
  type RenderingTrace,
  sampleCurve,
  type TracedTask,
  timeline,
  touchDriver,
  traceRendering,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
// The cover Mobile Safari reports on an iPhone 17 Pro (keyboard, accessory
// bar and the floating address bar over a 714 px layout viewport).
const COVER = 337;
// How often Chrome's caret blinks, ms.
const CARET_BLINK_MS = 500;
// One frame at 60 Hz, ms.
const FRAME_MS = 1000 / 60;

// The shortest steady part that can judge the rise, ms.
const MIN_STEADY_MS = 2 * FRAME_MS;

/** `PRE class='a b'` reads as `PRE.a`. */
const shortNode = (node: string) =>
  node.replace(/ class='([^' ]*)[^']*'/, '.$1');

/**
 * Whether `e` could only move the ride. It restyles two elements at most, as
 * many as the ride moves, lays out nothing, and paints only the root layer and
 * the code block. The count does not tell which elements those are.
 */
function ridesOnly(e: RenderingEvent): boolean {
  return (
    e.name !== 'Layout' &&
    (e.name !== 'UpdateLayoutTree' || (e.elements ?? Infinity) <= 2) &&
    (e.name !== 'Paint' ||
      e.node === '#document' ||
      (e.node?.startsWith("PRE class='astryx-code-block") ?? false))
  );
}

interface RideStart {
  /** The report's own layout, which starts the commit frame. */
  readonly layout: RenderingEvent;
  /** The frame of each rendering event from that layout on. */
  readonly frameOf: ReadonlyMap<RenderingEvent, number>;
  /** How many frames start the ride: the commit, then its start restyles. */
  readonly frames: number;
  /** The time of the last event in those frames, epoch ms. */
  readonly end: number;
}

/**
 * The frames that start the ride. The report's layout starts the commit
 * frame, which starts the ride. Then each ridden element can take one restyle
 * frame to start, at most two here: the dock and the transcript. Such a frame
 * only moves the ride, and it comes within three frames of the frame before
 * it. A starved main thread runs all of them late.
 */
function rideStart(trace: RenderingTrace, reported: number): RideStart | null {
  const layout = trace.events.find(e => e.t >= reported && e.name === 'Layout');
  if (layout == null) {
    return null;
  }
  // A frame paints once. Its restyle and layout come before its PrePaint, and
  // its paints after it.
  const frameOf = new Map<RenderingEvent, number>();
  let prePaints = 0;
  const after = trace.events
    .filter(e => e.t >= layout.t)
    .sort((x, y) => x.t - y.t);
  for (const e of after) {
    const before = ['UpdateLayoutTree', 'Layout', 'PrePaint'].includes(e.name);
    frameOf.set(e, before ? prePaints : Math.max(0, prePaints - 1));
    if (e.name === 'PrePaint') {
      prePaints += 1;
    }
  }
  const eventsOf = (frame: number) =>
    after.filter(e => frameOf.get(e) === frame);
  let frames = 1;
  let end = eventsOf(0).at(-1)?.t ?? layout.t;
  for (const frame of [1, 2]) {
    const events = eventsOf(frame);
    const first = events.at(0);
    if (
      first == null ||
      first.t - end > 3 * FRAME_MS ||
      !events.every(ridesOnly)
    ) {
      break;
    }
    frames += 1;
    end = events.at(-1)?.t ?? end;
  }
  return {layout, frameOf, frames, end};
}

/**
 * The page's task that holds `t`, long or stretched. A starved task ran its
 * main thread 50 ms or less, so the trace keeps it with the stretched tasks.
 */
function taskAt(trace: RenderingTrace, t: number): TracedTask | undefined {
  return [...trace.longTasks, ...trace.stretchedTasks].find(
    task => task.start <= t && task.start + task.durationMs >= t,
  );
}

/**
 * The evidence that a starved main thread moved the ride's start where the
 * window cannot place it, or null. The report's layout comes more than two
 * frames late, and its task had the main thread for half its wall time or
 * less. Then the window holds only start restyles too late to place. Or it
 * holds nothing, and the start leaves less than two frames of it.
 */
function starvation(
  start: RideStart,
  task: TracedTask | undefined,
  counted: ReadonlyArray<RenderingEvent>,
  judged: number,
  reported: number,
): Record<string, unknown> | null {
  const {layout} = start;
  if (layout.t - reported <= 2 * FRAME_MS) {
    return null;
  }
  if (task == null || task.threadMs > task.durationMs / 2) {
    return null;
  }
  const lateRestyle = (frame: number) =>
    (frame === 1 || frame === 2) &&
    [...start.frameOf]
      .filter(([, f]) => f === frame)
      .every(([e]) => ridesOnly(e));
  const late =
    counted.length > 0 &&
    counted.every(e => lateRestyle(start.frameOf.get(e) ?? -1));
  const unjudged = counted.length === 0 && judged < MIN_STEADY_MS;
  if (!late && !unjudged) {
    return null;
  }
  const at = (t: number) => Math.round(t - reported);
  return {
    layoutMs: at(layout.t),
    reportTask: {
      wallMs: Math.round(task.durationMs),
      threadMs: Math.round(task.threadMs),
    },
    startFrames: start.frames,
    startEndMs: at(start.end),
    steadyLeftMs: Math.round(judged),
    window: counted.map(
      e =>
        `${e.name}${e.node == null ? '' : ` ${shortNode(e.node)}`}@${at(e.t)}`,
    ),
  };
}

/**
 * Replaces `window.visualViewport` before the page loads with one the test
 * drives: `__keyboard(cover)` shrinks it from the bottom and fires one
 * `resize`, as Mobile Safari does.
 */
async function installKeyboard(page: Page) {
  await page.addInitScript(() => {
    // Mobile Safari has no VirtualKeyboard API, so the keyboard layout guide
    // publishes no slide there.
    Reflect.deleteProperty(Navigator.prototype, 'virtualKeyboard');
    const viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport,
    });
    (window as unknown as {__keyboard: (cover: number) => void}).__keyboard =
      cover => {
        viewport.height = window.innerHeight - cover;
        viewport.dispatchEvent(new Event('resize'));
      };
  });
}

/**
 * Chrome on Android: the visual viewport the test drives, and a
 * VirtualKeyboard object the guide must leave alone, so the guide reads
 * Chrome's profile. It runs under a finger, as Chrome on Android does, so the
 * composer's focus routes are the touch ones.
 */
async function installAndroidKeyboard(page: Page) {
  await page.addInitScript(() => {
    const keyboard = Object.assign(new EventTarget(), {
      overlaysContent: false,
      boundingRect: new DOMRect(0, 0, 0, 0),
    });
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: keyboard,
    });
    const viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport,
    });
    (window as unknown as {__keyboard: (cover: number) => void}).__keyboard =
      cover => {
        viewport.height = window.innerHeight - cover;
        viewport.dispatchEvent(new Event('resize'));
      };
  });
}

interface Chat {
  dock: Locator;
  messages: Locator;
  editable: Locator;
  /**
   * How far the dock rises for COVER: until its resting bottom (the root's
   * bottom edge, which may sit below the layout viewport's) clears the cover.
   */
  lift: number;
}

async function openChat(
  page: Page,
  {android = false}: {android?: boolean} = {},
): Promise<Chat> {
  if (android) {
    await installAndroidKeyboard(page);
  } else {
    await installKeyboard(page);
  }
  await openStory(page, storybook(), 'core-chatlayout--full-ai-chat');
  const editable = page.locator('[contenteditable="true"]').first();
  await expect(editable).toBeVisible();
  // Name the dock (the sticky container around the composer) and the
  // message area for the locators below.
  await editable.evaluate(element => {
    let dock: HTMLElement | null = element as HTMLElement;
    while (dock != null && getComputedStyle(dock).position !== 'sticky') {
      dock = dock.parentElement;
    }
    dock?.setAttribute('data-testid', 'keyboard-dock');
    dock?.parentElement?.firstElementChild?.setAttribute(
      'data-testid',
      'keyboard-messages',
    );
  });
  const dock = page.getByTestId('keyboard-dock');
  const messages = page.getByTestId('keyboard-messages');
  // The story opens at its newest message.
  await page.waitForTimeout(300);
  const lift = await dock.evaluate(
    (el, cover) =>
      (el.parentElement as HTMLElement).getBoundingClientRect().bottom -
      (window.innerHeight - cover),
    COVER,
  );
  return {dock, messages, editable, lift};
}

const showKeyboard = async (page: Page, cover = COVER) =>
  page.evaluate(
    c => (window as unknown as {__keyboard: (c: number) => void}).__keyboard(c),
    cover,
  );

// Where the dock is drawn relative to its rest without a keyboard, CSS px,
// negative up. It is its presented vertical `translate`, less the `bottom`
// offset the layout gives it from the keyboard height. The animator moves the
// individual property, not `transform`.
const dockY = async (dock: Locator) => dock.evaluate(presentedY);

// How far above the bottom of the transcript's scrollport the dock is drawn:
// 0 at rest with no keyboard. A sticky dock leaves the bottom when the
// content ends inside the scrollport. A translate or a late scroll clamp can
// cause that, and the dock's styles alone would not show it.
const dockGap = async (dock: Locator) =>
  dock.evaluate(
    el =>
      (el.parentElement as HTMLElement).getBoundingClientRect().bottom -
      el.getBoundingClientRect().bottom,
  );

function presentedY(el: Element): number {
  const style = getComputedStyle(el);
  const translate =
    style.translate === 'none'
      ? 0
      : parseFloat(style.translate.split(' ')[1] ?? '0') || 0;
  const bottom =
    style.position === 'sticky' || style.position === 'fixed'
      ? parseFloat(style.bottom) || 0
      : 0;
  return translate - bottom;
}

test('one keyboard change reads the layout once, however many read the height (architecture:react-component-runtime INV11)', async ({
  page,
}) => {
  const {dock, editable} = await openChat(page);
  await editable.focus();
  const reads = await page.evaluate(async cover => {
    // Count every read of the visual viewport's height from here on: the
    // keyboard module's one measurement per report.
    const viewport = window.visualViewport as unknown as {height: number};
    let height = viewport.height;
    let count = 0;
    Object.defineProperty(viewport, 'height', {
      configurable: true,
      get: () => {
        count += 1;
        return height;
      },
      set: (value: number) => {
        height = value;
      },
    });
    (window as unknown as {__keyboard: (c: number) => void}).__keyboard(cover);
    // The guide, the hook and the ride's commit all run by the next frame.
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return count;
  }, COVER);
  await waitForRest(dock);
  expect(reads).toBe(1);
});

test('the lift is the part of the keyboard over the dock\u2019s resting bottom: a root ending below the viewport rises by more than the cover', async ({
  page,
}) => {
  const {dock, editable} = await openChat(page);
  // A root that ends below the layout viewport: the viewport's full height
  // under the preview's 16 px gutter.
  await dock.evaluate(el => {
    const root = el.parentElement as HTMLElement;
    (root.parentElement as HTMLElement).style.height = '100vh';
  });
  await page.waitForTimeout(200);
  const lift = await dock.evaluate(
    (el, cover) =>
      (el.parentElement as HTMLElement).getBoundingClientRect().bottom -
      (window.innerHeight - cover),
    COVER,
  );
  expect(lift).toBeGreaterThan(COVER);
  await editable.focus();
  await showKeyboard(page);
  await waitForRest(dock);
  await page.waitForTimeout(100);
  const dockBottom = await dock.evaluate(
    el => el.getBoundingClientRect().bottom,
  );
  const keyboardTop = await page.evaluate(c => window.innerHeight - c, COVER);
  expect(dockBottom).toBeCloseTo(keyboardTop, 0);
});

test('a page with room under the chat: the dock rises only by the part of the keyboard that reaches it, and not at all when none does', async ({
  page,
}) => {
  const {dock, editable} = await openChat(page);
  // Leave 200 px of page under the chat's root.
  const room = 200;
  await dock.evaluate((el, r) => {
    const root = el.parentElement as HTMLElement;
    (root.parentElement as HTMLElement).style.height = `calc(100vh - ${r}px)`;
  }, room);
  await page.waitForTimeout(200);
  const restingBottom = await dock.evaluate(
    el => (el.parentElement as HTMLElement).getBoundingClientRect().bottom,
  );
  await editable.focus();
  await showKeyboard(page);
  await waitForRest(dock);
  await page.waitForTimeout(100);
  const expected = await page.evaluate(
    ([c, b]) => Math.max(0, b - (window.innerHeight - c)),
    [COVER, restingBottom],
  );
  expect(expected).toBeGreaterThan(0);
  expect(expected).toBeLessThan(COVER);
  expect(await dockY(dock)).toBeCloseTo(-expected, 0);
  expect(
    await dock.evaluate(el => el.getBoundingClientRect().bottom),
  ).toBeCloseTo(await page.evaluate(c => window.innerHeight - c, COVER), 0);

  // A keyboard that stops short of the chat's bottom moves nothing.
  const short = Math.floor(
    await page.evaluate(b => window.innerHeight - b - 20, restingBottom),
  );
  await showKeyboard(page, short);
  await waitForRest(dock);
  await page.waitForTimeout(100);
  expect(await dockY(dock)).toBeCloseTo(0, 0);
});

test('in a vertical writing mode the lift stays on the physical bottom, where the keyboard is', async ({
  page,
}) => {
  const {dock, editable, lift} = await openChat(page);
  // A logical inset-block-end would map to left under vertical-rl; the
  // on-screen keyboard is still at the bottom of the screen.
  await dock.evaluate(el => {
    (el.parentElement as HTMLElement).style.writingMode = 'vertical-rl';
  });
  await editable.focus();
  await showKeyboard(page);
  await page.waitForTimeout(1200);
  const style = await dock.evaluate(el => {
    const computed = getComputedStyle(el);
    return {
      bottom: computed.bottom,
      left: computed.left,
      right: computed.right,
    };
  });
  expect(parseFloat(style.bottom)).toBeCloseTo(lift, 0);
  expect(style.left).toBe('auto');
  expect(style.right).toBe('auto');
});

test('the transcript at its newest message stays there', async ({page}) => {
  const {dock, lift} = await openChat(page);
  const atEnd = async () =>
    dock.evaluate(el => {
      const scroller = el.parentElement as HTMLElement;
      return (
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 2
      );
    });
  expect(await atEnd()).toBe(true);
  await showKeyboard(page);
  await waitForRest(dock);
  expect(await atEnd()).toBe(true);
  expect(await dockY(dock)).toBeCloseTo(-lift, 0);
});

test.describe('under a mouse', () => {
  // A desktop browser: the primary pointer is fine (the projects emulate a
  // phone).
  test.use({hasTouch: false, isMobile: false});

  test('a click in the dock beside the composer does not focus the composer group (spec:AST-017 FR59)', async ({
    page,
  }) => {
    const {dock, editable} = await openChat(page);
    await editable.click();
    // The composer region: the dock's last box, a plain container under a
    // mouse.
    const region = dock.locator(':scope > div').last();
    await expect(region).not.toHaveAttribute('role', 'group');
    const outer = await region.boundingBox();
    const inner = await region.locator(':scope > div').boundingBox();
    if (outer == null || inner == null) {
      throw new Error('the composer region is not laid out');
    }
    // The region's own gutter, beside the composer.
    const gutter = inner.x - outer.x;
    expect(gutter).toBeGreaterThan(2);
    await page.mouse.click(outer.x + gutter / 2, inner.y + inner.height / 2);
    expect(
      await region.evaluate(element => element === document.activeElement),
    ).toBe(false);
  });
});

test('the dock comes down when the composer text loses focus', async ({
  page,
}) => {
  const {dock, editable, lift} = await openChat(page);
  await editable.focus();
  await showKeyboard(page);
  await waitForRest(dock);
  await editable.evaluate(el => (el as HTMLElement).blur());
  // Mobile Safari reports the keyboard gone once it is down, 0.47 to 0.5 s
  // after a blur on an iOS 26.2 simulator. The ride follows Chrome's slide
  // only, so until that report the dock stays above the keyboard. The wait
  // stands for most of that delay. Nothing moves the dock before the report
  // the test scripts, so a slow runner cannot fail this check.
  await page.waitForTimeout(440);
  expect(await dockY(dock)).toBeCloseTo(-lift, 0);
  await showKeyboard(page, 0);
  await waitForRest(dock);
  await page.waitForTimeout(100);
  expect(await dockY(dock)).toBeCloseTo(0, 0);
  // Drawn at the bottom, not where the transcript ends.
  expect(await dockGap(dock)).toBeCloseTo(0, 0);
});

test('a hide the home-screen app reports early: the dock rests at the bottom once the layout takes over', async ({
  page,
}) => {
  const {dock, editable} = await openChat(page);
  await editable.focus();
  await showKeyboard(page);
  await waitForRest(dock);
  await page.waitForTimeout(300);
  await editable.evaluate(async el => {
    (el as HTMLElement).blur();
    await new Promise(resolve => setTimeout(resolve, 30));
    (window as unknown as {__keyboard: (c: number) => void}).__keyboard(0);
  });
  await page.waitForTimeout(1200);
  expect(await dockY(dock)).toBeCloseTo(0, 0);
  expect(await dockGap(dock)).toBeCloseTo(0, 0);
});

test('a tap on the composer text focuses it without scrolling the page', async ({
  page,
}) => {
  const {editable} = await openChat(page);
  const driver = await touchDriver(page);
  const box = await editable.boundingBox();
  if (box == null) {
    throw new Error('no editable');
  }
  const before = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  await driver.tap({x: box.x + 24, y: box.y + box.height / 2});
  await expect(editable).toBeFocused();
  const after = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  expect(after).toEqual(before);
});

test.describe('under a finger', () => {
  test.use({hasTouch: true, isMobile: true});

  test('the browser\u2019s own reveal pan is put back: the composer rests on the keyboard and the page does not move (spec:AST-099 FR4)', async ({
    page,
  }) => {
    const {dock, editable} = await openChat(page);
    await editable.focus();
    await showKeyboard(page);
    await page.waitForTimeout(150);
    const result = await page.evaluate(async cover => {
      const viewport = window.visualViewport as unknown as EventTarget & {
        offsetTop: number;
      };
      // The browser's side of a put-back: scrolling a fixed element's top
      // into view pans the visual viewport to it.
      let putBacks = 0;
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (
        this: Element,
        ...args: Parameters<Element['scrollIntoView']>
      ) {
        if (getComputedStyle(this).position === 'fixed') {
          putBacks += 1;
          viewport.offsetTop = Math.max(0, this.getBoundingClientRect().top);
        }
        original.apply(this, args);
      };
      // As Chrome 124 does while the composer is still riding up: it pans
      // the visual viewport to the composer by the keyboard's height.
      viewport.offsetTop = cover;
      viewport.dispatchEvent(new Event('scroll'));
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      Element.prototype.scrollIntoView = original;
      return {putBacks, offsetTop: viewport.offsetTop};
    }, COVER);
    await waitForRest(dock);
    expect(result.putBacks).toBeGreaterThan(0);
    expect(result.offsetTop).toBe(0);
  });

  test('after typing, Done parks focus on the composer group, which shows the shared focus ring (architecture:interaction-modality INV1)', async ({
    page,
  }) => {
    const {dock, editable} = await openChat(page);
    await editable.focus();
    await page.keyboard.type('Hi');
    // Done blurs the composer's text, and focus goes to nothing.
    await editable.evaluate(element => (element as HTMLElement).blur());
    const region = dock.locator(':scope > div').last();
    await expect(region).toHaveAttribute('role', 'group');
    await expect(region).toBeFocused();
    const ring = await region.evaluate(element => {
      const style = getComputedStyle(element);
      return {style: style.outlineStyle, width: parseFloat(style.outlineWidth)};
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThan(0);
  });

  test('after a tap and no typing, Done parks focus on the composer group with no focus ring (architecture:interaction-modality INV1)', async ({
    page,
  }) => {
    const {dock, editable} = await openChat(page);
    await editable.tap();
    await expect(editable).toBeFocused();
    // Done blurs the composer's text, and focus goes to nothing.
    await editable.evaluate(element => (element as HTMLElement).blur());
    const region = dock.locator(':scope > div').last();
    await expect(region).toBeFocused();
    const ring = await region.evaluate(element => {
      const style = getComputedStyle(element);
      return {style: style.outlineStyle, width: parseFloat(style.outlineWidth)};
    });
    expect(ring.style === 'none' || ring.width === 0).toBe(true);
  });
});

// The dock's ride among the animations a hold takes on the dock: the one
// script animation that moves `translate`. A CSS transition that starts at
// the blur comes too. Its samples count from its own start, `offsetMs` after
// the hold's earliest start.
function rideOf(held: ReadonlyArray<HeldAnimation>): HeldAnimation {
  const ride = held.find(
    a => a.kind === 'Animation' && a.keyframes.some(k => 'translate' in k),
  );
  if (ride == null) {
    throw new Error(`no ride among ${JSON.stringify(held)}`);
  }
  return ride;
}

test.describe('Chrome on Android (spec:AST-099 FR8)', () => {
  test.use({hasTouch: true, isMobile: true});
  test.skip(
    ({browserName}) => browserName !== 'chromium',
    'Chrome’s keyboard profile needs the VirtualKeyboard API',
  );

  const reportAt = async (page: Page, cover: number) =>
    page.evaluate(c => {
      let at = 0;
      const view = window.visualViewport as unknown as EventTarget;
      view.addEventListener(
        'resize',
        event => {
          at = event.timeStamp;
        },
        {once: true},
      );
      (window as unknown as {__keyboard: (c: number) => void}).__keyboard(c);
      return at;
    }, cover);

  // Gboard's show runs 267 ms and its hide 167 ms. On a busy machine, a hold
  // or a read sent from the test after the report or the blur can arrive
  // after the ride ends. So the page holds the ride itself as it starts.
  const armRideHold = async (page: Page, dock: Locator) =>
    armHold(page, dock, {judges: {target: dock, property: 'translate'}});

  // Records each ride the motion engine starts on the dock from here on, when
  // it starts and when it is cancelled, in epoch ms. Reading an animation's
  // times reads no layout. The engine sets the start in the task that makes
  // the ride, so a microtask reads it, before a hold pauses it. A promise on
  // `ready` would add a main-thread frame when the compositor starts the ride.
  const recordRides = async (page: Page) =>
    page.evaluate(() => {
      const dock = document.querySelector('[data-testid="keyboard-dock"]');
      const rides: {start: number | null; cancelled: number | null}[] = [];
      (window as unknown as {__rides: typeof rides}).__rides = rides;
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (
        this: Element,
        keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        options?: number | KeyframeAnimationOptions,
      ) {
        const animation = animate.call(this, keyframes, options);
        if (
          this === dock &&
          Array.isArray(keyframes) &&
          keyframes.some(keyframe => 'translate' in keyframe)
        ) {
          const ride = {
            start: null as number | null,
            cancelled: null as number | null,
          };
          rides.push(ride);
          queueMicrotask(() => {
            if (animation.startTime != null) {
              ride.start = performance.timeOrigin + Number(animation.startTime);
            }
          });
          animation.addEventListener('cancel', () => {
            ride.cancelled = performance.timeOrigin + performance.now();
          });
        }
        return animation;
      };
    });

  // The start of the first ride since `recordRides`, on the document
  // timeline, where an event's `timeStamp` sits.
  const firstRideStart = async (page: Page) => {
    const starts = await page.evaluate(() =>
      (
        window as unknown as {
          __rides: {start: number | null}[];
        }
      ).__rides.flatMap(({start}) =>
        start == null ? [] : [start - performance.timeOrigin],
      ),
    );
    expect(starts, 'the engine started a ride on the dock').not.toHaveLength(0);
    return starts[0];
  };

  test('the rise does no Layout or Paint per frame', async ({page}) => {
    const {editable} = await openChat(page, {android: true});
    await recordRides(page);
    // No polling inside the trace: reading a sticky element's presented style
    // from the test forces a layout every frame by itself.
    let reported = 0;
    let focusedFor = 0;
    const trace = await traceRendering(page, async () => {
      ({reported, focusedFor} = await editable.evaluate(
        async (element, cover) => {
          // As on a phone, focus brings up the keyboard. Under a fine pointer,
          // focus starts the composer's own feedback, a short box-shadow
          // transition that paints every frame. The report waits for it to
          // end. Under a coarse pointer, as here, the focus look shows at once
          // and the wait ends at once.
          const focusedAt = performance.timeOrigin + performance.now();
          (element as HTMLElement).focus();
          await Promise.all(
            document
              .getAnimations()
              .filter(animation => animation instanceof CSSTransition)
              .map(async transition =>
                transition.finished.catch(() => undefined),
              ),
          );
          const from = performance.timeOrigin + performance.now();
          (window as unknown as {__keyboard: (c: number) => void}).__keyboard(
            cover,
          );
          await new Promise(resolve => setTimeout(resolve, 400));
          return {reported: from, focusedFor: from - focusedAt};
        },
        COVER,
      ));
    });
    // The steady part of Gboard's slide, 125–220 ms after the report. Its start
    // lays out once and paints in its first frames. From about 230 ms, its end
    // paints twice and hands the layers back with one layout.
    const steady = {from: reported + 125, to: reported + 220};
    // The caret blinks every 500 ms from the focus, Chrome's interval, and
    // each blink is a main-thread frame. A report soon after the focus keeps
    // the first blink after the window.
    expect(
      focusedFor,
      'the caret\u2019s first blink could fall in the window',
    ).toBeLessThan(CARET_BLINK_MS - (steady.to - reported));
    // A ride runs through that window: it starts before the window, its slide
    // ends after it, and nothing cancels it sooner. So no rendering in the
    // window means the dock rode without it, not that nothing moved.
    const rides = await page.evaluate(
      () =>
        (
          window as unknown as {
            __rides: {start: number | null; cancelled: number | null}[];
          }
        ).__rides,
    );
    const riding = rides.some(
      ({start, cancelled}) =>
        start != null &&
        start <= steady.from &&
        start + ANDROID_KEYBOARD.showMs >= steady.to &&
        (cancelled == null || cancelled >= steady.to),
    );
    expect(riding, JSON.stringify({reported, rides})).toBe(true);
    const start = rideStart(trace, reported);
    if (start == null) {
      throw new Error('the report laid nothing out, so no ride started');
    }
    // The ride's own start frames do not count when a starved main thread
    // runs them late, into the window. The report's task then had the main
    // thread for half its wall time or less. A start the page itself delays
    // into the window fails, by name.
    const reportTask = taskAt(trace, start.layout.t);
    const isStarved =
      reportTask != null && reportTask.threadMs <= reportTask.durationMs / 2;
    expect(
      start.end >= steady.from && !isStarved
        ? {
            startEndMs: Math.round(start.end - reported),
            reportTask:
              reportTask == null
                ? null
                : {
                    wallMs: Math.round(reportTask.durationMs),
                    threadMs: Math.round(reportTask.threadMs),
                  },
          }
        : null,
      'the ride\u2019s start reached the window without a starved thread',
    ).toBeNull();
    const counted = trace.events.filter(
      e =>
        e.t >= steady.from &&
        e.t <= steady.to &&
        (!isStarved || (start.frameOf.get(e) ?? start.frames) >= start.frames),
    );
    const judged = steady.to - Math.max(steady.from, start.end);
    expect(
      starvation(start, reportTask, counted, judged, reported),
      'the main thread was starved, so the ride\u2019s start reached the window',
    ).toBeNull();
    const during: Record<string, number> = {};
    for (const e of counted) {
      during[e.name] = (during[e.name] ?? 0) + 1;
    }
    // On failure, every rendering event of the rise and the long and
    // stretched tasks, in ms after the report.
    const detail = JSON.stringify({
      during,
      start: {
        frames: start.frames,
        layoutMs: Math.round(start.layout.t - reported),
        endMs: Math.round(start.end - reported),
      },
      events: trace.events
        .filter(e => e.t >= reported - 20 && e.t <= reported + 400)
        .map(e => `${e.name}@${Math.round(e.t - reported)}`),
      longTasks: trace.longTasks.map(
        task =>
          `${Math.round(task.start - reported)}+${Math.round(task.durationMs)}`,
      ),
      stretchedTasks: trace.stretchedTasks.map(
        task =>
          `${Math.round(task.start - reported)}+${Math.round(task.durationMs)}`,
      ),
    });
    expect(during.Layout ?? 0, detail).toBe(0);
    expect(during.Paint ?? 0, detail).toBe(0);
    expect(
      judged,
      'the ride\u2019s start left no steady part to judge',
    ).toBeGreaterThanOrEqual(MIN_STEADY_MS);
  });

  test(
    'storyboard: the keyboard shows and the composer rides Gboard’s slide',
    {tag: '@storyboard'},
    async ({page}, testInfo) => {
      const {dock, editable, messages, lift} = await openChat(page, {
        android: true,
      });
      const viewport = page.viewportSize() ?? {width: 402, height: 714};
      await editable.focus();
      // The transcript rides the same slide beside the dock, from the same
      // task. The film seeks only what the hold took, so it takes both.
      const hold = await armHold(page, dock.locator('xpath=..'), {
        newOnly: true,
        count: 2,
        judges: [
          {target: dock, property: 'translate'},
          {target: messages, property: 'translate'},
        ],
      });
      await reportAt(page, COVER);
      const {storyboard} = await animationStoryboard(page, {
        name: 'chatlayout-keyboard-show',
        held: await hold.held(),
        clip: {x: 0, y: 0, width: viewport.width, height: viewport.height},
        times: timeline(300, 300 / 12),
        columns: 6,
        cellScale: 0.4,
        measure: async () => ({
          dockY: await dockY(dock),
          messagesY: await dockY(messages),
        }),
      });
      await storyboard.write(testInfo);
      const trace = storyboard.frames.map(
        f => f.data as {dockY: number; messagesY: number},
      );
      // The dock only ever rises during the show, ending at the cover.
      for (let i = 1; i < trace.length; i += 1) {
        expect(trace[i].dockY).toBeLessThanOrEqual(trace[i - 1].dockY + 0.01);
      }
      expect(trace.at(-1)?.dockY).toBeCloseTo(-lift, 0);
      // The transcript at its newest message rides with the composer in every
      // frame.
      for (const frame of trace) {
        expect(frame.messagesY, JSON.stringify(trace)).toBeCloseTo(
          frame.dockY,
          0,
        );
      }
    },
  );

  test('the dock rides up on Gboard’s slide from the report, dated back to Gboard’s start', async ({
    page,
  }) => {
    const {dock, editable, lift} = await openChat(page, {android: true});
    await editable.focus();
    await recordRides(page);
    const hold = await armRideHold(page, dock);
    const reported = await reportAt(page, COVER);
    const ride = rideOf(await hold.held());
    expect(
      Math.abs(
        (await firstRideStart(page)) -
          (reported - ANDROID_KEYBOARD.showReportLagMs),
      ),
    ).toBeLessThan(2);
    const samples = curveOf(
      await sampleCurve(dock, timeline(ride.offsetMs + ride.curveEndMs)),
      'translateY',
    );
    await releaseAnimations(page);
    const ease = cubicBezier(ANDROID_KEYBOARD.showCurve);
    const result = compareCurve(
      samples,
      t =>
        -lift *
        ease(
          Math.min(
            1,
            Math.max(0, (t - ride.offsetMs) / ANDROID_KEYBOARD.showMs),
          ),
        ),
      0.5,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.5,
    );
    // And the layout takes the lift once the ride ends.
    await waitForRest(dock);
    await page.waitForTimeout(100);
    expect(await dockY(dock)).toBeCloseTo(-lift, 0);
    expect(
      await page.evaluate(
        () =>
          (
            navigator as unknown as {
              virtualKeyboard: {overlaysContent: boolean};
            }
          ).virtualKeyboard.overlaysContent,
      ),
    ).toBe(false);
  });

  test('the dock rides down on Gboard’s slide from the blur', async ({
    page,
  }) => {
    const {dock, editable} = await openChat(page, {android: true});
    await editable.focus();
    await reportAt(page, COVER);
    await waitForRest(dock);
    await page.waitForTimeout(100);
    const lifted = -(await dockY(dock));
    await recordRides(page);
    const hold = await armRideHold(page, dock);
    const blurAt = await editable.evaluate(el => {
      let at = 0;
      el.addEventListener(
        'focusout',
        event => {
          at = event.timeStamp;
        },
        {once: true},
      );
      (el as HTMLElement).blur();
      return at;
    });
    const ride = rideOf(await hold.held());
    expect(
      Math.abs(
        (await firstRideStart(page)) -
          (blurAt + ANDROID_KEYBOARD.hideAfterBlurMs),
      ),
    ).toBeLessThan(8);
    const samples = curveOf(
      await sampleCurve(dock, timeline(ride.offsetMs + ride.curveEndMs)),
      'translateY',
    );
    await releaseAnimations(page);
    // The layout still holds the lift; the translate takes the dock down.
    const ease = cubicBezier(ANDROID_KEYBOARD.hideCurve);
    const result = compareCurve(
      samples,
      t =>
        lifted *
        ease(
          Math.min(
            1,
            Math.max(0, (t - ride.offsetMs) / ANDROID_KEYBOARD.hideMs),
          ),
        ),
      0.5,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.5,
    );
    expect(ride.curveEndMs).toBeCloseTo(ANDROID_KEYBOARD.hideMs, -1);
  });

  test('Reduce Motion: the dock never travels with Gboard (design:reduced-motion)', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {dock, editable, lift} = await openChat(page, {android: true});
    await editable.focus();
    const ys = await editable.evaluate(async (el, cover) => {
      let host: HTMLElement | null = el as HTMLElement;
      while (host != null && getComputedStyle(host).position !== 'sticky') {
        host = host.parentElement;
      }
      const read = () => {
        const style = getComputedStyle(host as HTMLElement);
        const value = style.translate;
        const translate =
          value === 'none' ? 0 : parseFloat(value.split(' ')[1] ?? '0');
        return translate - (parseFloat(style.bottom) || 0);
      };
      const out: number[] = [];
      const until = performance.now() + 900;
      const sample = () => {
        out.push(read());
        if (performance.now() < until) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
      (window as unknown as {__keyboard: (c: number) => void}).__keyboard(
        cover,
      );
      await new Promise(resolve => setTimeout(resolve, 900));
      return out;
    }, COVER);
    for (const y of ys) {
      expect(
        Math.abs(y) < 0.5 || Math.abs(y + lift) < 0.5,
        JSON.stringify(ys.map(Math.round)),
      ).toBe(true);
    }
    expect(ys.at(-1)).toBeCloseTo(-lift, 0);
    expect(await dock.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  });

  test('Reduce Motion: a hide Chrome reports in steps moves the dock once, after the keyboard has gone', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {dock, editable, lift} = await openChat(page, {android: true});
    await editable.focus();
    await showKeyboard(page);
    // The layout has taken the keyboard's lift: the show is over.
    await expect
      .poll(async () =>
        dock.evaluate(el => parseFloat(getComputedStyle(el).bottom) || 0),
      )
      .toBeCloseTo(lift, 0);
    await expect.poll(async () => dockY(dock)).toBeCloseTo(-lift, 0);
    // Under Remove animations, Chrome reports Back's hide as lower keyboards
    // that are still up, then none. Each frame records where the dock is drawn
    // and the layout's offset.
    const frames = await dock.evaluate(async (el, cover) => {
      const out: {y: number; bottom: number}[] = [];
      const read = () => {
        const style = getComputedStyle(el);
        const translate =
          style.translate === 'none'
            ? 0
            : parseFloat(style.translate.split(' ')[1] ?? '0') || 0;
        const bottom = parseFloat(style.bottom) || 0;
        out.push({y: translate - bottom, bottom});
      };
      const until = performance.now() + 900;
      const sample = () => {
        read();
        if (performance.now() < until) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
      const keyboard = (window as unknown as {__keyboard: (c: number) => void})
        .__keyboard;
      for (const share of [0.6, 0.35, 0.15, 0]) {
        await new Promise(resolve => setTimeout(resolve, 40));
        keyboard(Math.round(cover * share));
      }
      await new Promise(resolve => setTimeout(resolve, 900));
      return out;
    }, COVER);
    const detail = JSON.stringify(
      frames.map(({y, bottom}) => [Math.round(y), Math.round(bottom)]),
    );
    // Every frame draws the dock where the keyboard's top was, or at rest.
    for (const {y} of frames) {
      expect(Math.abs(y + lift) < 0.5 || Math.abs(y) < 0.5, detail).toBe(true);
    }
    // The layout's offset changes once: from the lift to none.
    expect(
      [...new Set(frames.map(({bottom}) => Math.round(bottom)))],
      detail,
    ).toEqual([Math.round(lift), 0]);
    expect(frames.at(-1)?.y ?? Number.NaN, detail).toBeCloseTo(0, 0);
  });
});
