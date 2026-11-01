// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gestures.interaction.browser.spec.ts
 * @input The gesture fixture bundled with esbuild, a phone-sized touch
 *   screen, and real engine touch input: Chromium through CDP with explicit
 *   timestamps, WebKit through its own input command (real-time pacing)
 * @output Browser proof of the negotiation the unit tests cannot see:
 *   touch-action per element, touchmove cancelled exactly while a recognizer
 *   owns the finger, native scrolling untouched otherwise, click suppression
 *   with no ghost click, a drag that began as a scroll staying the browser's, pinch-zoom
 *   left to the browser, a second finger that never breaks the first,
 *   timing taken from event timestamps under a blocked main thread, gestures
 *   for every pointer with nothing listening while idle where the primary
 *   pointer is fine, nothing for a disabled recognizer,
 *   and a held finger's selection lock only where the hold takes the touch
 * @position Browser tests of packages/core/src/gestures, run by
 *   `pnpm test:interaction` (playwright.interaction.config.ts, a phone in
 *   Chromium and WebKit) and in CI's interaction proofs. WebKit's Linux build
 *   cannot scroll, fling or pinch-zoom from injected touches, and synthesises
 *   a click only from its tap gesture; the checks that need those run in
 *   Chromium here and in Mobile Safari on the iOS simulator.
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {webInputDriver, WHEEL_SKIP} from '@astryxdesign/interaction-harness';

/**
 * Chromium's driver sends each wheel as one notch, `wheelDeltaY` -120
 * whatever its delta, which the host reads as a mouse wheel's (FR43);
 * WebKit's sends a trackpad's precise deltas (`wheelDeltaY` three times the
 * delta), so it carries the trackpad-only cases.
 */
const TRACKPAD_SKIP =
  "Chromium's driver sends each wheel as a mouse wheel's notch (wheelDeltaY -120 whatever its delta); WebKit's driver sends a trackpad's precise deltas";
import {expect, test, type Page} from '@playwright/test';

interface Entry {
  name: string;
  state: string;
  time: number;
  x?: number;
  y?: number;
  scale?: number;
  beganAt?: number | null;
  startedAt?: number;
}

let bundle = '';
let bareBundle = '';

test.beforeAll(async () => {
  const bundleOf = async (file: string) => {
    const result = await build({
      entryPoints: [
        path.join(path.dirname(fileURLToPath(import.meta.url)), file),
      ],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      // A development build, as an app's bundler would make one.
      define: {'process.env.NODE_ENV': '"development"'},
    });
    return result.outputFiles[0].text;
  };
  bundle = await bundleOf('fixture.ts');
  bareBundle = await bundleOf('bareFixture.ts');
});

type Point = {x: number; y: number};
type Finger = Point & {id: number};

/** The fingers down after a step, and when (ms after the gesture's start). */
interface Step {
  t: number;
  down: Finger[];
}

interface Driver {
  readonly engine: 'chromium' | 'webkit';
  /** Plays the steps as real touch input; returns the page time of t = 0. */
  play(steps: Step[]): Promise<number>;
  /** A tap through the engine's tap path (WebKit synthesises click only from it). */
  tap(at: Point): Promise<void>;
}

const sleep = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

/** Each step's change against the previous one: who landed, lifted, moved. */
function diff(previous: Finger[], next: Finger[]) {
  const before = new Set(previous.map(finger => finger.id));
  const after = new Set(next.map(finger => finger.id));
  return {
    landed: next.filter(finger => !before.has(finger.id)),
    lifted: previous.filter(finger => !after.has(finger.id)),
  };
}

async function chromiumDriver(page: Page): Promise<Driver> {
  const cdp = await page.context().newCDPSession(page);
  const origin = await page.evaluate(() => performance.timeOrigin);
  // The fingers down, across calls: a gesture may span several.
  let down: Finger[] = [];
  const send = async (type: string, points: Finger[], at: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: points.map(point => ({
        x: point.x,
        y: point.y,
        id: point.id,
      })),
      timestamp: (origin + at) / 1000,
    });
  return {
    engine: 'chromium',
    async play(steps) {
      // CDP stamps every event with the scripted time, so the page sees the
      // script's timing exactly, whatever the dispatch latency.
      const base = Math.ceil(await page.evaluate(() => performance.now())) + 50;
      for (const step of steps) {
        const {landed} = diff(down, step.down);
        // CDP diffs active points against the previous event: a new point
        // is pressed, a missing one released; touchEnd carries none.
        const type =
          landed.length > 0
            ? 'touchStart'
            : step.down.length === 0
              ? 'touchEnd'
              : 'touchMove';
        await send(type, step.down, base + step.t);
        down = step.down;
      }
      return base;
    },
    async tap(at) {
      const base = Math.ceil(await page.evaluate(() => performance.now())) + 50;
      await send('touchStart', [{...at, id: 1}], base);
      await send('touchEnd', [], base + 60);
    },
  };
}

interface WebKitSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

/** Playwright's server-side WebKit page session (a locally launched browser). */
function webkitSession(page: Page): WebKitSession {
  const connection = (
    page as unknown as {_connection?: {toImpl?: (o: unknown) => unknown}}
  )._connection;
  const impl = connection?.toImpl?.(page) as
    {delegate?: {_pageProxySession?: WebKitSession}} | undefined;
  const session = impl?.delegate?._pageProxySession;
  if (session == null) {
    throw new Error('WebKit touch input needs a locally launched browser');
  }
  return session;
}

function webkitDriver(page: Page): Driver {
  const session = webkitSession(page);
  // WebKit's command applies the event's phase to every point it lists: a
  // start lists only the fingers that land, an end only those that lift, a
  // move every finger down. Integer CSS px; the page sees real time.
  const points = (fingers: Finger[]) =>
    fingers.map(f => ({x: Math.round(f.x), y: Math.round(f.y), id: f.id}));
  // The fingers down, across calls: a gesture may span several.
  let down: Finger[] = [];
  return {
    engine: 'webkit',
    async play(steps) {
      const start = Date.now();
      const base = await page.evaluate(() => performance.now());
      for (const step of steps) {
        const wait = start + step.t - Date.now();
        if (wait > 0) {
          await sleep(wait);
        }
        const {landed, lifted} = diff(down, step.down);
        if (landed.length > 0) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: points(landed),
          });
        } else if (lifted.length > 0) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: points(lifted),
          });
        } else {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: points(step.down),
          });
        }
        down = step.down;
      }
      return base;
    },
    async tap(at) {
      await page.touchscreen.tap(Math.round(at.x), Math.round(at.y));
    },
  };
}

/** One finger from `from` to `to` in `count` frames of 16 ms, then a lift. */
function drag(from: Point, to: Point, count = 12, lift = true): Step[] {
  const steps: Step[] = [{t: 0, down: [{...from, id: 1}]}];
  for (let i = 1; i <= count; i++) {
    const k = i / count;
    steps.push({
      t: i * 16,
      down: [
        {
          x: from.x + (to.x - from.x) * k,
          y: from.y + (to.y - from.y) * k,
          id: 1,
        },
      ],
    });
  }
  if (lift) {
    steps.push({t: (count + 1) * 16, down: []});
  }
  return steps;
}

/** Down at `from`, through each offset in turn 16 ms apart, then up. */
function travel(from: Point, offsets: ReadonlyArray<Point>): Step[] {
  const steps: Step[] = [{t: 0, down: [{...from, id: 1}]}];
  offsets.forEach((offset, index) => {
    steps.push({
      t: (index + 1) * 16,
      down: [{x: from.x + offset.x, y: from.y + offset.y, id: 1}],
    });
  });
  steps.push({t: (offsets.length + 2) * 16, down: []});
  return steps;
}

/** Offsets along x, one per step, ending `distance` px from touch-down. */
const alongX = (...xs: number[]): Point[] => xs.map(x => ({x, y: 0}));

async function open(page: Page, engine: string): Promise<Driver> {
  // A real navigation first: touch emulation exposes the Touch Events API
  // to documents it creates.
  await page.goto('about:blank');
  await page.setContent(
    '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
  );
  await page.addScriptTag({content: bundle});
  return engine === 'webkit' ? webkitDriver(page) : chromiumDriver(page);
}

/** A page with nothing attached: the test attaches through `window.__api`. */
async function openBare(page: Page, engine: string): Promise<Driver> {
  await page.goto('about:blank');
  await page.setContent(
    '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
  );
  await page.addScriptTag({content: bareBundle});
  return engine === 'webkit' ? webkitDriver(page) : chromiumDriver(page);
}

/**
 * The touch-action the host gives an element (its mark, or an inline value
 * it wrote) and the page's touch listeners, read after the next frame: the
 * host reads an author's value there (FR18), so an absent value is absent
 * for good, not merely not yet written.
 */
async function footprint(page: Page, id: string) {
  return page.evaluate(async target => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });
    const element = document.getElementById(target);
    return {
      touchAction:
        element?.getAttribute('data-astryx-touch-action') ??
        element?.style.getPropertyValue('touch-action') ??
        null,
      pageTouchListeners: window.__pageTouch,
    };
  }, id);
}

/**
 * Whether a selection starting on an element now is refused: where iOS
 * WebKit does not run, the selection lock cancels `selectstart` and writes
 * no style (`spec:AST-094` FR41).
 */
async function refusesSelection(page: Page, id: string): Promise<boolean> {
  return page.evaluate(target => {
    const event = new Event('selectstart', {bubbles: true, cancelable: true});
    (document.getElementById(target) ?? document.body).dispatchEvent(event);
    return event.defaultPrevented;
  }, id);
}

async function center(page: Page, id: string): Promise<Point> {
  const box = await page.locator(`#${id}`).boundingBox();
  if (box == null) {
    throw new Error(`#${id} has no box`);
  }
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

async function log(page: Page): Promise<Entry[]> {
  await page.waitForTimeout(50);
  return page.evaluate(() => window.__gestures);
}

async function clearLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__gestures.length = 0;
  });
}

async function scrollTop(page: Page, id: string): Promise<number> {
  return page.evaluate(
    target => document.getElementById(target)?.scrollTop ?? -1,
    id,
  );
}

/** Record whether each touchmove reached the page cancelled. */
async function logTouchMoves(page: Page): Promise<void> {
  await page.evaluate(() => {
    const moves: boolean[] = [];
    (window as unknown as {__moves: boolean[]}).__moves = moves;
    window.addEventListener(
      'touchmove',
      event => moves.push(event.defaultPrevented),
      {passive: true},
    );
  });
}

async function readTouchMoves(page: Page): Promise<boolean[]> {
  return page.evaluate(
    () => (window as unknown as {__moves: boolean[]}).__moves,
  );
}

const states = (entries: Entry[], name: string) =>
  entries.filter(entry => entry.name === name).map(entry => entry.state);

test('derives touch-action per element from its recognizers', async ({
  page,
  browserName,
}) => {
  await open(page, browserName);
  // The host reads each author's value and writes its own in the frame
  // after the attach (FR18).
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      }),
  );
  const actions = await page.evaluate(() =>
    Object.fromEntries(
      ['hpan', 'tapper', 'presser', 'pinchable', 'sheetBody'].map(id => [
        id,
        getComputedStyle(document.getElementById(id) as HTMLElement)
          .touchAction,
      ]),
    ),
  );
  expect(actions).toEqual({
    hpan: 'pan-y pinch-zoom',
    tapper: 'manipulation',
    presser: 'manipulation',
    pinchable: 'none',
    sheetBody: 'auto',
  });
});

test('only elements whose recognizers claim a moving touch carry a blocking touchmove listener', async ({
  page,
  browserName,
}) => {
  await open(page, browserName);
  const blocking = await page.evaluate(() =>
    window.__listeners
      .filter(entry => entry.type === 'touchmove' && entry.passive === false)
      .map(entry => entry.id),
  );
  // Pans (the cards', the screen-edge pans', the switch's drag and a
  // one-finger pan too), a long press, a pinch, the sheet's pan and a press
  // that keeps its touch can take a moving touch; a tap-only element and a
  // plain press consumer never wait.
  expect(new Set(blocking)).toEqual(
    new Set([
      'hpan',
      'presser',
      'pinchable',
      'sheetBody',
      'slider',
      'switchRow',
      'card',
      'onePan',
      'kept',
      'authorNone',
      'authorPanY',
      'authorPinchZoom',
      'authorPanXY',
      'inlinePanXY',
      'edgeZone',
      'edgeWide',
      'edgeZoneRtl',
      'edgeWideRtl',
    ]),
  );
});

test('a horizontal drag on a pan-y element is the recognizer’s: cancelled moves, no scroll, no click', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await logTouchMoves(page);
  const start = await center(page, 'hbutton');
  // A 4:1 drag, the shape WebKit would otherwise pan natively.
  await driver.play(drag(start, {x: start.x + 120, y: start.y + 30}));
  const entries = await log(page);
  const hpan = states(entries, 'hpan');
  expect(hpan[0]).toBe('began');
  expect(hpan.slice(-2)).toEqual(['ended', 'possible']);
  const last = entries
    .filter(entry => entry.name === 'hpan' && entry.state === 'changed')
    .at(-1);
  // As in UIKit, the 10 px hysteresis is not part of the translation.
  expect(last?.x).toBeCloseTo(120 - 10, 0);
  // Every touchmove after the claim was cancelled.
  const moves = await readTouchMoves(page);
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.slice(-3).every(Boolean)).toBe(true);
  expect(await scrollTop(page, 'scroller')).toBe(0);
  expect(entries.some(entry => entry.name.startsWith('click:'))).toBe(false);
  expect(entries.some(entry => entry.name.startsWith('mousedown:'))).toBe(
    false,
  );
});

test('a vertical drag on the same element fails the pan and is never cancelled', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await logTouchMoves(page);
  const start = await center(page, 'hpan');
  await driver.play(drag(start, {x: start.x + 4, y: start.y - 120}));
  const entries = await log(page);
  expect(states(entries, 'hpan')).toEqual(['failed', 'possible']);
  expect((await readTouchMoves(page)).some(Boolean)).toBe(false);
  if (driver.engine === 'chromium') {
    // The browser scrolled it natively.
    expect(await scrollTop(page, 'scroller')).toBeGreaterThan(60);
  }
  expect(entries.some(entry => entry.name.startsWith('click:'))).toBe(false);
});

test('a horizontal drag on a passive pan-y control keeps its press: uncancelable moves the browser cannot pan are not a claim', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await page.evaluate(() => {
    document.getElementById('passive')?.scrollIntoView({block: 'center'});
  });
  const start = await center(page, 'passive');
  await driver.play(
    drag({x: start.x - 120, y: start.y}, {x: start.x + 120, y: start.y + 6}),
  );
  const consumed = (await log(page))
    .filter(entry => entry.name === 'passive')
    .map(entry => entry.state);
  expect(consumed[0]).toBe('began');
  expect(consumed).not.toContain('cancelled');
  expect(consumed.at(-1)).toBe('ended');
});

test('a vertical drag on a passive pan-y control, over a page with room to scroll, hands the press to the browser (FR20)', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'needs native scrolling from injected touches (Mobile Safari on the simulator)',
  );
  const driver = await open(page, browserName);
  await page.evaluate(() => {
    document.getElementById('passive')?.scrollIntoView({block: 'center'});
  });
  const before = await page.evaluate(() => window.scrollY);
  const start = await center(page, 'passive');
  // Up, along the axis pan-y leaves the browser, which has room that way.
  await driver.play(drag(start, {x: start.x + 4, y: start.y - 120}));
  const consumed = states(await log(page), 'passive');
  expect(consumed[0]).toBe('began');
  expect(consumed.at(-1)).toBe('cancelled');
  expect(consumed).not.toContain('ended');
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(
    before + 20,
  );
});

test('a vertical drag on a passive pan-y control where no scroller has room is not handed over by its moves: the browser\u2019s pointercancel ends the press (FR20)', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'needs native scrolling from injected touches (Mobile Safari on the simulator)',
  );
  const driver = await open(page, browserName);
  // The page at its end: no room to scroll on.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const atEnd = await page.evaluate(() => window.scrollY);
  const start = await center(page, 'passiveEnd');
  await driver.play(drag(start, {x: start.x + 4, y: start.y - 120}));
  const entries = (await log(page)).filter(
    entry => entry.name === 'passiveEnd' || entry.name === 'dom:pointercancel',
  );
  const order = entries.map(entry =>
    entry.name === 'passiveEnd' ? entry.state : 'pointercancel',
  );
  expect(order[0]).toBe('began');
  // The press ends cancelled, at the browser's pointercancel and not before:
  // an uncancelable move along an axis no scroller can scroll is no claim.
  const cancelledAt = order.indexOf('cancelled');
  expect(cancelledAt).toBeGreaterThan(0);
  expect(order.slice(0, cancelledAt)).toContain('pointercancel');
  expect(order).not.toContain('ended');
  expect(await page.evaluate(() => window.scrollY)).toBe(atEnd);
});

test('a one-way overlay pan keeps its direction from the page, and leaves the other way to it', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'needs native scrolling from injected touches (Mobile Safari on the simulator)',
  );
  const driver = await open(page, browserName);
  await page.evaluate(() => {
    document.getElementById('card')?.scrollIntoView({block: 'center'});
  });
  const before = await page.evaluate(() => window.scrollY);
  const start = await center(page, 'card');
  // Up, slowly: the card's pan begins at 10 px and the page never moves.
  await driver.play(drag(start, {x: start.x, y: start.y - 40}, 40));
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  const up = (await log(page)).filter(entry => entry.name === 'card');
  expect(up[0]?.state).toBe('began');
  expect(up.filter(entry => entry.state === 'changed').at(-1)?.y).toBe(-30);
  // Down: the page's.
  await clearLog(page);
  await driver.play(drag(start, {x: start.x, y: start.y + 60}, 30));
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before - 20);
  expect(states(await log(page), 'card')).toEqual(['failed', 'possible']);
});

test('a held finger turns text selection off only where the hold does something (a pan that asks), until it lifts; a press-tracked control, a mouse and other pans keep native selection (spec:AST-094 FR41)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const held: Record<string, boolean[]> = {};
  for (const id of ['passive', 'slider', 'hpan']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    const at = await center(page, id);
    const before = await refusesSelection(page, id);
    await driver.play([{t: 0, down: [{id: 1, ...at}]}]);
    const during = await refusesSelection(page, id);
    await driver.play([{t: 0, down: []}]);
    held[id] = [before, during, await refusesSelection(page, id)];
  }
  // A control whose hold does nothing keeps the browser's long-press
  // selection.
  expect(held.passive).toEqual([false, false, false]);
  expect(held.slider).toEqual([false, true, false]);
  expect(held.hpan).toEqual([false, false, false]);

  const at = await center(page, 'passive');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  const withMouse = await refusesSelection(page, 'passive');
  await page.mouse.up();
  expect(withMouse).toBe(false);
});

test('a held finger on a checkbox inside an element whose hold does something turns its selection off too, as WebKit makes every input selectable; inside a press-tracked row it stays native (spec:AST-094 FR41)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const heldSelection = async (id: string) => {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    const at = await center(page, id);
    const before = await refusesSelection(page, id);
    await driver.play([{t: 0, down: [{id: 1, ...at}]}]);
    const during = await refusesSelection(page, id);
    await driver.play([{t: 0, down: []}]);
    return [before, during, await refusesSelection(page, id)];
  };
  expect(await heldSelection('switchInput')).toEqual([false, true, false]);
  expect(await heldSelection('check')).toEqual([false, false, false]);
});

test('a scroll the page makes under a still finger keeps the touch and its tap', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await page.locator('#feed').scrollIntoViewIfNeeded();
  const at = await center(page, 'feedRow');
  await clearLog(page);
  await driver.play([{t: 0, down: [{id: 1, ...at}]}]);
  // The page scrolls the feed under the resting finger (scrollIntoView, a
  // pinned transcript): the finger never travelled, so the touch stays.
  await page.evaluate(() => {
    const feed = document.getElementById('feed');
    if (feed != null) {
      feed.scrollTop += 6;
    }
  });
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });
  });
  await driver.play([{t: 0, down: []}]);
  expect(states(await log(page), 'feedTap')).toEqual(['ended', 'possible']);
});

test('a drag that scrolls the feed natively is the browser’s: no tap', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'needs native scrolling from injected touches (Mobile Safari on the simulator)',
  );
  const driver = await open(page, browserName);
  await page.locator('#feed').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const feed = document.getElementById('feed');
    if (feed != null) {
      feed.scrollTop = 0;
    }
  });
  const start = await center(page, 'feedRow');
  await clearLog(page);
  await driver.play(drag(start, {x: start.x, y: start.y - 60}, 30));
  const scrolled = await page.evaluate(
    () => document.getElementById('feed')?.scrollTop ?? 0,
  );
  expect(scrolled).toBeGreaterThan(20);
  expect(states(await log(page), 'feedTap')).not.toContain('ended');
});

test('a second finger before any claim fails a one-finger pan and leaves the pinch to the page', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await page.locator('#onePan').scrollIntoViewIfNeeded();
  const at = await center(page, 'onePan');
  await clearLog(page);
  await logTouchMoves(page);
  const pair = (spread: number) => [
    {id: 1, x: at.x - spread, y: at.y},
    {id: 2, x: at.x + spread, y: at.y},
  ];
  await driver.play([
    {t: 0, down: [{id: 1, x: at.x - 10, y: at.y}]},
    {t: 30, down: pair(10)},
    {t: 60, down: pair(30)},
    {t: 90, down: pair(50)},
    {t: 120, down: pair(70)},
    {t: 150, down: []},
  ]);
  const pan = states(await log(page), 'onePan');
  expect(pan).toContain('failed');
  expect(pan).not.toContain('began');
  // No move of the pinch is cancelled: the page may zoom.
  const moves = await readTouchMoves(page);
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.some(Boolean)).toBe(false);
});

test('a page hold keeps the page still under a one-finger pan, and leaves a pinch alone', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await page.locator('#plainArea').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const own = window as unknown as {
      __holdPage: () => () => void;
      __releaseHold: () => void;
    };
    own.__releaseHold = own.__holdPage();
  });
  await logTouchMoves(page);
  const start = await center(page, 'plainArea');
  const before = await page.evaluate(() => window.scrollY);
  await driver.play(drag(start, {x: start.x, y: start.y - 80}, 30));
  expect((await readTouchMoves(page)).some(Boolean)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  // A second finger is a pinch: never cancelled.
  await logTouchMoves(page);
  await driver.play([
    {
      t: 0,
      down: [
        {id: 1, x: start.x - 10, y: start.y},
        {id: 2, x: start.x + 10, y: start.y},
      ],
    },
    {
      t: 30,
      down: [
        {id: 1, x: start.x - 40, y: start.y},
        {id: 2, x: start.x + 40, y: start.y},
      ],
    },
    {t: 60, down: []},
  ]);
  expect((await readTouchMoves(page)).some(Boolean)).toBe(false);
  await page.evaluate(() =>
    (window as unknown as {__releaseHold: () => void}).__releaseHold(),
  );
});

test('a control that keeps its press through a drag holds the page still and stays pressed', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await page.locator('#kept').scrollIntoViewIfNeeded();
  await clearLog(page);
  const start = await center(page, 'kept');
  const before = await page.evaluate(() => window.scrollY);
  // The finger rests until the press is delivered: a control in a scroller
  // waits before it highlights, and a drag that starts sooner is a scroll.
  await driver.play([{t: 0, down: [{id: 1, ...start}]}]);
  await page.waitForFunction(() =>
    window.__gestures.some(
      entry => entry.name === 'kept' && entry.state === 'highlight',
    ),
  );
  await logTouchMoves(page);
  await driver.play(drag(start, {x: start.x, y: start.y - 40}, 20, false));
  let kept = states(await log(page), 'kept');
  expect(kept).toContain('touchDown');
  expect(kept).not.toContain('touchCancel');
  expect(kept).not.toContain('unhighlight');
  // Its press was delivered, so every move is cancelled: the page stays.
  const moves = await readTouchMoves(page);
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.every(Boolean)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await driver.play([{t: 0, down: []}]);
  kept = states(await log(page), 'kept');
  expect(kept).toContain('touchUpInside');
  expect(kept).not.toContain('touchCancel');
});

test('where the primary pointer is fine, the host still writes touch-action, leaves the page no listener while idle, and pans with a mouse (spec:AST-094 FR43, FR24)', async ({
  browser,
}) => {
  // A desktop: a mouse is the primary pointer.
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({content: bareBundle});
    await page.evaluate(() => {
      const {host, LongPressGestureRecognizer, PanGestureRecognizer} =
        window.__api;
      document.body.innerHTML =
        '<div id="drag" style="height: 80px">drag</div><div id="hold" style="height: 80px">hold</div>';
      const pan = new PanGestureRecognizer({direction: 'horizontal'});
      const states: string[] = [];
      (window as unknown as {__panStates: string[]}).__panStates = states;
      pan.addTransitionListener((_current, _from, to) => states.push(to));
      host.attach(document.getElementById('drag') as HTMLElement, pan);
      host.attach(
        document.getElementById('hold') as HTMLElement,
        new LongPressGestureRecognizer(),
      );
    });
    // A touchscreen laptop's finger needs the same touch-action as a phone's.
    expect(await footprint(page, 'drag')).toEqual({
      touchAction: 'pan-y pinch-zoom',
      pageTouchListeners: 0,
    });
    expect((await footprint(page, 'hold')).touchAction).toBe('manipulation');
    // A real mouse drag pans; the page's listeners last only the press.
    const box = await page.locator('#drag').boundingBox();
    if (box == null) {
      throw new Error('no box for #drag');
    }
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 20, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, y, {steps: 8});
    await page.mouse.up();
    const states = await page.evaluate(
      () => (window as unknown as {__panStates: string[]}).__panStates,
    );
    expect(states[0]).toBe('began');
    expect(states).toContain('ended');
    expect((await footprint(page, 'drag')).pageTouchListeners).toBe(0);
  } finally {
    await context.close();
  }
});

test("the host's touch-action applies from the attach itself, an author rule outranks it from the first frame, and a shadow root gets it too (spec:AST-094 FR18, DEC-8)", async ({
  page,
  browserName,
}) => {
  await openBare(page, browserName);
  const actions = await page.evaluate(() => {
    const {host, PanGestureRecognizer, LongPressGestureRecognizer} =
      window.__api;
    const author = document.createElement('style');
    author.textContent = '#authored { touch-action: none; }';
    document.head.append(author);
    document.body.innerHTML =
      '<div id="plain" style="height: 60px"></div><div id="authored" style="height: 60px"></div><div id="shadowed" style="height: 60px"></div>';
    const plain = document.getElementById('plain') as HTMLElement;
    const authored = document.getElementById('authored') as HTMLElement;
    const inner = document.createElement('div');
    inner.style.height = '60px';
    (document.getElementById('shadowed') as HTMLElement)
      .attachShadow({mode: 'open'})
      .append(inner);
    host.attach(plain, new PanGestureRecognizer({direction: 'horizontal'}));
    host.attach(authored, new LongPressGestureRecognizer());
    host.attach(inner, new LongPressGestureRecognizer());
    // Read in the attach's own task, before any frame.
    return {
      plain: getComputedStyle(plain).touchAction,
      authored: getComputedStyle(authored).touchAction,
      inner: getComputedStyle(inner).touchAction,
    };
  });
  expect(actions).toEqual({
    plain: 'pan-y pinch-zoom',
    authored: 'none',
    inner: 'manipulation',
  });
});

test("an author rule in any cascade layer outranks the host's touch-action (spec:AST-094 FR18, DEC-8)", async ({
  page,
  browserName,
}) => {
  await openBare(page, browserName);
  const actions = await page.evaluate(() => {
    const {host, PanGestureRecognizer} = window.__api;
    // The layer order a package stylesheet declares (spec:AST-080 FR3), and
    // author rules in Astryx's base layer and in the product's layer.
    const author = document.createElement('style');
    author.textContent = `@layer reset, astryx-base, astryx-theme, product;
      @layer astryx-base { #base { touch-action: none; } }
      @layer product { #product { touch-action: pan-x; } }`;
    document.head.append(author);
    document.body.innerHTML =
      '<div id="base" style="height: 60px"></div><div id="product" style="height: 60px"></div>';
    const base = document.getElementById('base') as HTMLElement;
    const product = document.getElementById('product') as HTMLElement;
    host.attach(base, new PanGestureRecognizer({direction: 'horizontal'}));
    host.attach(product, new PanGestureRecognizer({direction: 'horizontal'}));
    return {
      base: getComputedStyle(base).touchAction,
      product: getComputedStyle(product).touchAction,
    };
  });
  expect(actions).toEqual({base: 'none', product: 'pan-x'});
});

test('a subtree that mounts with a recognizer is styled once: the host adds no second recalc of it (spec:AST-094 FR18)', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'counts style recalcs in a Chromium trace',
  );
  await openBare(page, browserName);
  const cdp = await page.context().newCDPSession(page);
  const events: {name: string; args?: {elementCount?: number}}[] = [];
  cdp.on('Tracing.dataCollected', ({value}) => {
    events.push(...(value as unknown as typeof events));
  });
  const complete = new Promise(resolve => {
    cdp.once('Tracing.tracingComplete', resolve);
  });
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
      ],
      excludedCategories: ['*'],
    },
  });
  await page.evaluate(async () => {
    const {host, PanGestureRecognizer} = window.__api;
    const wheel = document.createElement('div');
    for (let i = 0; i < 300; i += 1) {
      const row = document.createElement('div');
      row.textContent = `Row ${i}`;
      wheel.append(row);
    }
    document.body.append(wheel);
    host.attach(wheel, new PanGestureRecognizer({direction: 'vertical'}));
    for (let i = 0; i < 4; i += 1) {
      await new Promise(resolve => {
        requestAnimationFrame(resolve);
      });
    }
  });
  await cdp.send('Tracing.end');
  await complete;
  // The subtree's first styling, and no recalc of it after: a touch-action
  // written later would restyle every row (each one's effective value).
  const subtreeRecalcs = events.filter(
    event =>
      event.name === 'UpdateLayoutTree' &&
      (event.args?.elementCount ?? 0) >= 300,
  );
  expect(subtreeRecalcs).toHaveLength(1);
});

test('a recognizer registers no touch listener and writes no touch-action while it is disabled, and does once it is enabled (spec:AST-094 FR24)', async ({
  page,
  browserName,
}) => {
  await openBare(page, browserName);
  await page.evaluate(() => {
    const {host, PanGestureRecognizer} = window.__api;
    document.body.innerHTML = '<div id="solo" style="height: 120px">solo</div>';
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      isEnabled: false,
    });
    (window as unknown as {__solo: typeof pan}).__solo = pan;
    host.attach(document.getElementById('solo') as HTMLElement, pan);
  });
  expect(await footprint(page, 'solo')).toEqual({
    touchAction: '',
    pageTouchListeners: 0,
  });
  const setEnabled = async (isEnabled: boolean) =>
    page.evaluate(next => {
      const solo = (
        window as unknown as {
          __solo: {setEnabled(value: boolean): void};
        }
      ).__solo;
      solo.setEnabled(next);
      window.__api.host.update(document.getElementById('solo') as HTMLElement);
    }, isEnabled);
  await setEnabled(true);
  const enabled = await footprint(page, 'solo');
  expect(enabled.touchAction).toBe('pan-y pinch-zoom');
  expect(enabled.pageTouchListeners).toBeGreaterThan(0);
  await setEnabled(false);
  expect(await footprint(page, 'solo')).toEqual({
    touchAction: '',
    pageTouchListeners: 0,
  });
});

test('a zero-delay hold that brings its own lock turns selection off only for a touch it takes: a touch it declines keeps native selection (spec:AST-094 FR41)', async ({
  page,
  browserName,
}) => {
  const driver = await openBare(page, browserName);
  await page.evaluate(() => {
    const {host, LongPressGestureRecognizer, lockSelection} = window.__api;
    // A tab bar: its lens is a hold at 0 ms, and the search tab beside it
    // is a button the lens's recognizer declines.
    document.body.innerHTML =
      '<div id="bar" style="display: flex; height: 80px"><div id="lens" style="flex: 1">lens</div><button id="search" style="width: 120px">search</button></div>';
    const lens = document.getElementById('lens') as HTMLElement;
    host.attach(
      document.getElementById('bar') as HTMLElement,
      new LongPressGestureRecognizer({
        minimumPressDuration: 0,
        selectionLock: lockSelection,
        shouldReceiveTouch: (_recognizer, touch) =>
          touch.target instanceof Node && lens.contains(touch.target),
      }),
    );
  });
  expect(await refusesSelection(page, 'lens')).toBe(false);
  const held: Record<string, boolean[]> = {};
  for (const id of ['search', 'lens']) {
    const at = await center(page, id);
    await driver.play([{t: 0, down: [{id: 1, ...at}]}]);
    const during = await refusesSelection(page, 'lens');
    await driver.play([{t: 0, down: []}]);
    held[id] = [during, await refusesSelection(page, 'lens')];
  }
  expect(held.search).toEqual([false, false]);
  expect(held.lens).toEqual([true, false]);
});

test('a tap recognizer replaces the click: no ghost click, no compatibility mouse events', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await driver.tap(await center(page, 'tapper'));
  let entries = await log(page);
  expect(states(entries, 'tap')).toEqual(['ended', 'possible']);
  expect(entries.filter(entry => entry.state === 'dom')).toEqual([]);

  // A tap the pan does not take keeps its click (exactly one).
  await clearLog(page);
  await driver.tap(await center(page, 'hbutton'));
  entries = await log(page);
  expect(entries.filter(entry => entry.name === 'click:hbutton')).toHaveLength(
    1,
  );
});

test('a keyboard activation inside the click window after a claimed drag still clicks: the swallower passes a click whose detail is 0 (FR21)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  // A pan claims the drag: its touchend is cancelled, so no click follows it,
  // and the swallower stays armed for the stray one it may still owe.
  const start = await center(page, 'hpan');
  await driver.play(drag(start, {x: start.x + 40, y: start.y}, 8));
  expect(states(await log(page), 'hpan')).toContain('ended');
  await clearLog(page);
  // Enter on a focused button: a click whose detail is 0, which passes.
  await page.focus('#hbutton');
  await page.keyboard.press('Enter');
  const entries = await log(page);
  expect(entries.filter(entry => entry.name === 'click:hbutton')).toHaveLength(
    1,
  );
});

test('a finger the window blur cancelled lifts on nothing: its lift gets no click, and a later tap there keeps its own (spec:AST-094 FR28)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const at = await center(page, 'hbutton');
  await clearLog(page);
  await driver.play([{t: 0, down: [{id: 1, ...at}]}]);
  // A headless page keeps its focus, so the blur is dispatched to the window.
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
  await driver.play([{t: 0, down: []}]);
  await page.waitForTimeout(100);
  const clicks = async () =>
    (await log(page)).filter(entry => entry.name === 'click:hbutton');
  expect(await clicks()).toEqual([]);
  await driver.tap(at);
  expect(await clicks()).toHaveLength(1);
});

test('scroll edge: at the top the pull is the sheet’s at once', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const start = await center(page, 'sheetBody');
  await driver.play(drag(start, {x: start.x, y: start.y + 96}));
  const entries = await log(page);
  const sheet = entries.filter(entry => entry.name === 'sheet');
  expect(sheet[0]?.state).toBe('began');
  expect(
    sheet.filter(entry => entry.state === 'changed').at(-1)?.y,
  ).toBeCloseTo(96 - 10, 0);
  expect(await scrollTop(page, 'sheetBody')).toBe(0);
});

test("scroll edge: at the top the sheet cancels the pull's moves from the first one, before it begins (spec:AST-094 FR19, DEC-18)", async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await logTouchMoves(page);
  const start = await center(page, 'sheetBody');
  await driver.play(drag(start, {x: start.x, y: start.y + 24}));
  const moves = await readTouchMoves(page);
  // WebKit sends the first move at 2 px, well before the sheet's 10 px begin;
  // Chromium sends none inside its own 15 px slop. Every move the page sees
  // is cancelled, the first one included.
  expect(moves.length).toBeGreaterThan(0);
  expect(moves).toEqual(moves.map(() => true));
  const sheet = (await log(page)).filter(entry => entry.name === 'sheet');
  expect(sheet[0]?.state).toBe('began');
  expect(await scrollTop(page, 'sheetBody')).toBe(0);
});

test('a drag that began as a scroll stays the browser’s (AST-094 FR14): the content scrolls to its top and the sheet never begins', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'needs native scrolling from injected touches (Mobile Safari on the simulator)',
  );
  const driver = await open(page, browserName);
  await page.evaluate(() => {
    (document.getElementById('sheetBody') as HTMLElement).scrollTop = 60;
  });
  const start = await center(page, 'sheetBody');
  start.y -= 60;
  await driver.play(drag(start, {x: start.x, y: start.y + 200}, 25));
  const entries = await log(page);
  const sheet = entries.filter(entry => entry.name === 'sheet');
  // The content takes the whole drag: it scrolls to its top, and the travel
  // past that point never becomes the sheet's.
  expect(await scrollTop(page, 'sheetBody')).toBe(0);
  expect(sheet.some(entry => entry.state === 'began')).toBe(false);
});

/** Two fingers that land one after the other and spread apart. */
function spread(at: Point, from: number, by: number, drift = 0): Step[] {
  const steps: Step[] = [
    {t: 0, down: [{x: at.x - from, y: at.y, id: 1}]},
    {
      t: 30,
      down: [
        {x: at.x - from, y: at.y, id: 1},
        {x: at.x + from, y: at.y, id: 2},
      ],
    },
  ];
  for (let i = 1; i <= 12; i++) {
    const half = from + (by * i) / 12;
    steps.push({
      t: 30 + i * 16,
      down: [
        {x: at.x - half + drift * i, y: at.y, id: 1},
        {x: at.x + half + drift * i, y: at.y, id: 2},
      ],
    });
  }
  steps.push({t: 30 + 13 * 16, down: []});
  return steps;
}

test('pinch-zoom stays the browser’s on an element without a pinch recognizer', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'needs native pinch-zoom from injected touches (Mobile Safari on the simulator)',
  );
  const driver = await open(page, browserName);
  await driver.play(spread(await center(page, 'tapper'), 20, 96));
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => window.visualViewport?.scale ?? 1),
  ).toBeGreaterThan(1.2);
  expect(states(await log(page), 'tap')).not.toContain('ended');
});

test('a pinch recognizer takes the two-finger gesture on its element only, alongside its pan', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await driver.play(spread(await center(page, 'pinchable'), 20, 40, 1));
  const entries = await log(page);
  expect(states(entries, 'pinch')[0]).toBe('began');
  const scale = entries
    .filter(entry => entry.name === 'pinch' && entry.state === 'changed')
    .at(-1)?.scale;
  // The span grew from 40 to 120; as in UIKit, the scale is measured from
  // the starting span moved by the 8 px hysteresis.
  expect(scale).toBeCloseTo(120 / (40 + 8), 1);
  expect(states(entries, 'pinchPan')).toContain('began');
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test('a second finger never breaks a claimed one-finger pan', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const start = await center(page, 'hbutton');
  const other = await center(page, 'tapper');
  const steps: Step[] = [{t: 0, down: [{...start, id: 1}]}];
  for (let i = 1; i <= 4; i++) {
    steps.push({t: i * 16, down: [{x: start.x + i * 10, y: start.y, id: 1}]});
  }
  const first = {x: start.x + 40, y: start.y, id: 1};
  steps.push({t: 80, down: [first, {...other, id: 2}]});
  for (let i = 1; i <= 6; i++) {
    steps.push({
      t: 80 + i * 16,
      down: [
        {x: first.x + i * 5, y: first.y, id: 1},
        {x: other.x + i * 15, y: other.y + i * 15, id: 2},
      ],
    });
  }
  steps.push({
    t: 200,
    down: [{x: other.x + 90, y: other.y + 90, id: 2}],
  });
  steps.push({t: 216, down: []});
  await driver.play(steps);
  const entries = await log(page);
  const hpan = entries.filter(entry => entry.name === 'hpan');
  expect(hpan.map(entry => entry.state)).not.toContain('cancelled');
  expect(hpan.map(entry => entry.state)).toContain('ended');
  expect(hpan.filter(entry => entry.state === 'changed').at(-1)?.x).toBeCloseTo(
    70 - 10,
    0,
  );
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test('a long press begins at touch-down + 500 ms on the event clock, even when the main thread was blocked', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const at = await center(page, 'presser');
  const base = await driver.play([{t: 0, down: [{...at, id: 1}]}]);
  // Block the main thread well past the press duration.
  await page.evaluate(() => {
    const end = performance.now() + 800;
    while (performance.now() < end) {
      // busy
    }
  });
  await page.waitForTimeout(100);
  await driver.play([{t: 0, down: []}]);
  const entries = await log(page);
  const began = entries.find(
    entry => entry.name === 'press' && entry.state === 'began',
  );
  if (driver.engine === 'chromium') {
    // The touch carries the timestamp CDP gave it (to the browser's 0.1 ms
    // timestamp precision).
    expect(Math.abs((began?.startedAt ?? 0) - base)).toBeLessThan(0.5);
  }
  // The press began exactly 500 ms after the touch, though the timer that
  // noticed it ran 300 ms late.
  expect((began?.beganAt ?? 0) - (began?.startedAt ?? 0)).toBeCloseTo(500, 6);
  expect(states(entries, 'press')).toEqual(['began', 'ended', 'possible']);
  expect(entries.some(entry => entry.name.startsWith('click:'))).toBe(false);
});

async function scrollToCenter(page: Page, id: string): Promise<void> {
  await page.evaluate(target => {
    document.getElementById(target)?.scrollIntoView({block: 'center'});
  }, id);
}

async function resetMoves(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as {__moves: boolean[]}).__moves.length = 0;
  });
}

test('takes a pan at 10 px of travel on its axis and not at 9: the move that reaches 10 is the first cancelled (FR19)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await logTouchMoves(page);
  const start = await center(page, 'hpan');
  await driver.play(travel(start, alongX(3, 6, 9)));
  expect(states(await log(page), 'hpan')).not.toContain('began');
  expect((await readTouchMoves(page)).some(Boolean)).toBe(false);
  await clearLog(page);
  await resetMoves(page);
  await driver.play(travel(start, alongX(3, 6, 10)));
  expect(states(await log(page), 'hpan')[0]).toBe('began');
  if (driver.engine === 'webkit') {
    // WebKit delivers every move. Chromium holds back the moves inside its
    // own touch slop, so the page sees none of them to cancel.
    const moves = await readTouchMoves(page);
    expect(moves.at(-1)).toBe(true);
    expect(moves.filter(Boolean)).toHaveLength(1);
  }
});

test('measures a pan’s travel per axis: a free pan stays possible at (7, 7) and (8, 8) and begins at (10, 10) (FR19)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const start = await center(page, 'pinchable');
  for (const d of [7, 8]) {
    await clearLog(page);
    await driver.play(
      travel(start, [
        {x: d - 4, y: d - 4},
        {x: d, y: d},
      ]),
    );
    expect(states(await log(page), 'pinchPan')).not.toContain('began');
  }
  await clearLog(page);
  await driver.play(
    travel(start, [
      {x: 6, y: 6},
      {x: 10, y: 10},
    ]),
  );
  expect(states(await log(page), 'pinchPan')[0]).toBe('began');
});

test('keeps a narrower author touch-action: the derived value intersected with the author’s, never wider (FR18, DEC-8)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  // A class rule wider than what both allow is narrowed inline after a frame.
  await page.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const values = await page.evaluate(() =>
    Object.fromEntries(
      [
        'authorNone',
        'authorPanY',
        'authorPinchZoom',
        'authorPanXY',
        'inlinePanXY',
      ].map(id => {
        const element = document.getElementById(id) as HTMLElement;
        return [
          id,
          [getComputedStyle(element).touchAction, element.style.touchAction],
        ];
      }),
    ),
  );
  expect(values).toEqual({
    // A long press derives `manipulation`; the author's `none` stands.
    authorNone: ['none', ''],
    // Author values the derived `pan-y pinch-zoom` contains: theirs, no write.
    authorPanY: ['pan-y', ''],
    authorPinchZoom: ['pinch-zoom', ''],
    // Wider author values: what both allow, written inline.
    authorPanXY: ['pan-y', 'pan-y'],
    inlinePanXY: ['pan-y', 'pan-y'],
  });
  // Each pan still takes a horizontal drag.
  for (const id of [
    'authorPanY',
    'authorPinchZoom',
    'authorPanXY',
    'inlinePanXY',
  ]) {
    await scrollToCenter(page, id);
    await clearLog(page);
    const start = await center(page, id);
    await driver.play(drag(start, {x: start.x + 60, y: start.y}, 6));
    expect(states(await log(page), id)[0]).toBe('began');
  }
  if (driver.engine === 'chromium') {
    // The browser keeps the axis the author left it, and only that: none on
    // the author's `none`, the vertical one on the author's `pan-y`.
    await scrollToCenter(page, 'authorNone');
    let before = await page.evaluate(() => window.scrollY);
    let start = await center(page, 'authorNone');
    await driver.play(drag(start, {x: start.x, y: start.y - 80}, 10));
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await scrollToCenter(page, 'authorPanY');
    before = await page.evaluate(() => window.scrollY);
    start = await center(page, 'authorPanY');
    await driver.play(drag(start, {x: start.x, y: start.y - 80}, 10));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(
      before + 20,
    );
  }
});

test('an edge-zone strip claims pan-x for its band, and a touch 1 px inside the edge begins at 15 px of inward travel, not 14 (FR18, DEC-13)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await scrollToCenter(page, 'edgeZone');
  expect(
    await page.evaluate(() => [
      getComputedStyle(document.getElementById('edgeZone') as HTMLElement)
        .touchAction,
      getComputedStyle(document.getElementById('edgeWide') as HTMLElement)
        .touchAction,
      document
        .getElementById('edgeWide')
        ?.getAttribute('data-astryx-touch-action') ?? null,
    ]),
  ).toEqual(['pan-y pinch-zoom', 'auto', null]);
  const {y} = await center(page, 'edgeZone');
  await driver.play(travel({x: 39, y}, alongX(5, 10, 14)));
  expect(states(await log(page), 'edgeZone')).not.toContain('began');
  await clearLog(page);
  await driver.play(travel({x: 39, y}, alongX(5, 10, 15)));
  expect(states(await log(page), 'edgeZone')[0]).toBe('began');
});

test('on an element reaching beyond the band, a touch at 40 px decides at 10 px and one at 41 px fails at touch-down (FR18, DEC-13)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await logTouchMoves(page);
  await scrollToCenter(page, 'edgeWide');
  const {y} = await center(page, 'edgeWide');
  await driver.play(travel({x: 40, y}, alongX(3, 6, 9)));
  expect(states(await log(page), 'edgeWide')).not.toContain('began');
  await clearLog(page);
  await resetMoves(page);
  await driver.play(travel({x: 40, y}, alongX(3, 6, 10)));
  expect(states(await log(page), 'edgeWide')[0]).toBe('began');
  if (driver.engine === 'webkit') {
    // From the move it begins on, it claims by cancelling them (Chromium
    // holds back moves inside its touch slop).
    expect((await readTouchMoves(page)).at(-1)).toBe(true);
  }
  await clearLog(page);
  await resetMoves(page);
  await driver.play(travel({x: 41, y}, alongX(10, 20, 30)));
  expect(states(await log(page), 'edgeWide')[0]).toBe('failed');
  expect((await readTouchMoves(page)).some(Boolean)).toBe(false);
  if (driver.engine === 'chromium') {
    // Outside the band the author's horizontal scroll goes ahead.
    await clearLog(page);
    await driver.play(drag({x: 100, y}, {x: 20, y}, 10));
    expect(states(await log(page), 'edgeWide')[0]).toBe('failed');
    expect(
      await page.evaluate(
        () => document.getElementById('edgeWide')?.scrollLeft ?? 0,
      ),
    ).toBeGreaterThan(20);
  }
});

test('under RTL the leading band is the right one: 362 px begins at 15 px leftward on the strip, and a leading pan fails a touch at 361 px (FR18, DEC-13)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  await scrollToCenter(page, 'edgeZoneRtl');
  const zone = await center(page, 'edgeZoneRtl');
  await driver.play(travel({x: 363, y: zone.y}, alongX(-5, -10, -14)));
  expect(states(await log(page), 'edgeZoneRtl')).not.toContain('began');
  await clearLog(page);
  await driver.play(travel({x: 363, y: zone.y}, alongX(-5, -10, -15)));
  expect(states(await log(page), 'edgeZoneRtl')[0]).toBe('began');
  await scrollToCenter(page, 'edgeWideRtl');
  const wide = await center(page, 'edgeWideRtl');
  await clearLog(page);
  await driver.play(travel({x: 361, y: wide.y}, alongX(-10, -20)));
  expect(states(await log(page), 'edgeWideRtl')[0]).toBe('failed');
  await clearLog(page);
  await driver.play(travel({x: 362, y: wide.y}, alongX(-3, -6, -10)));
  expect(states(await log(page), 'edgeWideRtl')[0]).toBe('began');
});

test('a scroll under a held press takes it only once the finger is 10 px from where it landed: a still finger, 9 px and (7, 7) keep it, 10 px and (8, 8) lose it (FR20)', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const row = await center(page, 'scrollRow');
  const finger = (offset: Point): Finger => ({
    x: row.x + offset.x,
    y: row.y + offset.y,
    id: 1,
  });
  const cases: ReadonlyArray<{
    name: string;
    path: ReadonlyArray<Point>;
    kept: boolean;
  }> = [
    // Sub-pixel jitter where the engine takes it (WebKit's command rounds to
    // whole pixels, so there the finger is still).
    {
      name: 'still',
      path: [
        {x: 0.3, y: -0.3},
        {x: -0.3, y: 0.3},
        {x: 0.3, y: 0},
      ],
      kept: true,
    },
    {name: '9 px', path: alongX(3, 6, 9), kept: true},
    {
      name: '(7, 7)',
      path: [
        {x: 3, y: 3},
        {x: 7, y: 7},
      ],
      kept: true,
    },
    {name: '10 px', path: alongX(3, 6, 10), kept: false},
    {
      name: '(8, 8)',
      path: [
        {x: 4, y: 4},
        {x: 8, y: 8},
      ],
      kept: false,
    },
  ];
  for (const {name, path: offsets, kept} of cases) {
    await page.evaluate(() => {
      (document.getElementById('scroller') as HTMLElement).scrollTop = 0;
    });
    await clearLog(page);
    // Chromium holds back the moves inside its own touch slop, so a finger
    // held there is still to the page: it first goes past the slop, and the
    // page sees every move after that.
    const excursion: Point[] =
      driver.engine === 'chromium' ? [{x: 20, y: 20}] : [];
    const steps: Step[] = [{t: 0, down: [finger({x: 0, y: 0})]}];
    [...excursion, ...offsets].forEach((offset, index) => {
      steps.push({t: (index + 1) * 16, down: [finger(offset)]});
    });
    await driver.play(steps);
    // The finger rests at its offset while the scroller scrolls under it.
    await page.evaluate(() => {
      (document.getElementById('scroller') as HTMLElement).scrollTop += 40;
    });
    await page.waitForTimeout(100);
    await driver.play([{t: 0, down: []}]);
    const pressed = states(await log(page), 'scrollRow');
    expect(pressed[0], name).toBe('began');
    if (kept) {
      expect(pressed, name).not.toContain('cancelled');
      expect(pressed.at(-1), name).toBe('ended');
    } else {
      expect(pressed.at(-1), name).toBe('cancelled');
    }
  }
});

/** The page-level listener counts now, by type. */
async function pageListenerCounts(page: Page): Promise<Map<string, number>> {
  return new Map(await page.evaluate(() => [...window.__pageListeners]));
}

/**
 * The page-level listener types gesture work uses that are added beyond
 * `baseline`: the engine and the test runner keep listeners of their own.
 */
async function addedPageListeners(
  page: Page,
  baseline: Map<string, number>,
): Promise<string[]> {
  return [...(await pageListenerCounts(page))]
    .filter(
      ([type, count]) =>
        count > (baseline.get(type) ?? 0) &&
        /^(touch|pointer|click$|blur$|scroll$|contextmenu$|visibilitychange$)/.test(
          type,
        ),
    )
    .map(([type]) => type)
    .sort();
}

test.describe('under a fine primary pointer (spec:AST-094 FR43, FR24)', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a mouse drag begins a pan at 10 px on its axis and ends it at the lift; the click after it reaches no page handler', async ({
    page,
    browserName,
  }) => {
    await open(page, browserName);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const start = await center(page, 'hpan');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 9, start.y);
    expect(states(await log(page), 'hpan')).not.toContain('began');
    await page.mouse.move(start.x + 10, start.y);
    expect(states(await log(page), 'hpan')[0]).toBe('began');
    await page.mouse.up();
    const entries = await log(page);
    expect(states(entries, 'hpan').slice(-2)).toEqual(['ended', 'possible']);
    expect(entries.some(entry => entry.name.startsWith('click:'))).toBe(false);
  });

  test('a mouse tap recognizes a tap, and the right button starts nothing', async ({
    page,
    browserName,
  }) => {
    await open(page, browserName);
    const at = await center(page, 'tapper');
    await page.mouse.click(at.x, at.y, {button: 'right'});
    expect(states(await log(page), 'tap')).toEqual([]);
    await page.mouse.click(at.x, at.y);
    expect(states(await log(page), 'tap')).toContain('ended');
  });

  test('the page carries no gesture listener between presses: a press adds them, and they go after it', async ({
    page,
    browserName,
  }) => {
    await open(page, browserName);
    // Attaching every gesture of the page added no page-level listener.
    expect(await page.evaluate(() => window.__attachListeners)).toEqual([]);
    // A press that nothing claims (a pan pressed and lifted in place).
    const start = await center(page, 'hpan');
    await page.mouse.move(start.x, start.y);
    const idle = await pageListenerCounts(page);
    await page.mouse.down();
    expect(await addedPageListeners(page, idle)).toEqual(
      expect.arrayContaining(['pointercancel', 'pointermove', 'pointerup']),
    );
    await page.mouse.up();
    await page.waitForTimeout(50);
    expect(await addedPageListeners(page, idle)).toEqual([]);
    // A right click adds none.
    await page.mouse.click(start.x, start.y, {button: 'right'});
    expect(await addedPageListeners(page, idle)).toEqual([]);
    // After a claimed drag at most the click guard's listener stays, until
    // the click it swallows or the end of its window, then nothing: a
    // release-armed swallower is press work (FR24). A second drag leaves
    // nothing either.
    for (let drag = 0; drag < 2; drag++) {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 40, start.y, {steps: 4});
      await page.mouse.up();
      await page.waitForTimeout(50);
      expect(
        (await addedPageListeners(page, idle)).filter(type => type !== 'click'),
      ).toEqual([]);
      await page.waitForTimeout(1100);
      expect(await addedPageListeners(page, idle)).toEqual([]);
    }
  });

  test('a pen drag begins a pan at 10 px like a mouse; the pen’s barrel button starts nothing', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'no pen input in WebKit’s driver');
    await open(page, browserName);
    const cdp = await page.context().newCDPSession(page);
    const pen = async (
      type: 'mousePressed' | 'mouseMoved' | 'mouseReleased',
      x: number,
      y: number,
      button: 'left' | 'right' | 'none',
    ) =>
      cdp.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button,
        buttons:
          type === 'mouseReleased' || button === 'none'
            ? 0
            : button === 'left'
              ? 1
              : 2,
        clickCount: type === 'mouseMoved' ? 0 : 1,
        pointerType: 'pen',
      });
    const start = await center(page, 'hpan');
    await pen('mousePressed', start.x, start.y, 'right');
    await pen('mouseMoved', start.x + 30, start.y, 'right');
    await pen('mouseReleased', start.x + 30, start.y, 'right');
    expect(states(await log(page), 'hpan')).toEqual([]);
    await pen('mousePressed', start.x, start.y, 'left');
    await pen('mouseMoved', start.x + 9, start.y, 'left');
    expect(states(await log(page), 'hpan')).not.toContain('began');
    await pen('mouseMoved', start.x + 10, start.y, 'left');
    expect(states(await log(page), 'hpan')[0]).toBe('began');
    await pen('mouseReleased', start.x + 10, start.y, 'left');
    expect(states(await log(page), 'hpan').slice(-2)).toEqual([
      'ended',
      'possible',
    ]);
  });
});

test.describe('where the primary pointer is fine', () => {
  test.use({hasTouch: false, isMobile: false});
  test('a scroll-edge pan takes a trackpad scroll only at the top of the page that scrolls it, pulling the content down; mid-page the page scrolls (spec:AST-094 FR43, FR19)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    await page.goto('about:blank');
    await page.setContent(
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin: 0"></body>',
    );
    await page.addScriptTag({content: bareBundle});
    await page.evaluate(() => {
      const {host, PanGestureRecognizer} = window.__api;
      document.body.innerHTML =
        '<div id="content" style="height: 3000px; width: 300px">content</div>';
      const pull = new PanGestureRecognizer({
        direction: 'vertical',
        scrollEdge: true,
        allowedPointerTypes: [],
        allowedScrollTypes: ['continuous'],
      });
      pull.addTransitionListener((_recognizer, _from, to) =>
        window.__wheelLog.push(`pull:${to}`),
      );
      host.attach(document.getElementById('content') as HTMLElement, pull);
    });
    const driver = await webInputDriver(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    const at = {x: 100, y: 200};
    // Mid-page, a scroll up is the page's.
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(100);
    for (let step = 0; step < 4; step += 1) {
      await driver.wheel({...at, dy: -16});
    }
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(400);
    expect(await page.evaluate(() => window.__wheelLog)).toEqual([]);
    // At the top, scrolling down is the page's too.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    await driver.wheel({...at, dy: 16});
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__wheelLog)).toEqual([]);
    // At the top, pulling the content down: the pan's, and the page holds.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    for (let step = 0; step < 4; step += 1) {
      await driver.wheel({...at, dy: -16});
    }
    await page.waitForTimeout(250);
    const pull = await page.evaluate(() => window.__wheelLog);
    expect(pull[0]).toBe('pull:began');
    expect(pull).toContain('pull:ended');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('a wheel gesture stays with the pan that took it when the pan moves its element from under a still cursor, as a browser latches a scroller (spec:AST-094 FR43)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    await page.goto('about:blank');
    await page.setContent(
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
    );
    await page.addScriptTag({content: bareBundle});
    await page.evaluate(() => {
      const {host, PanGestureRecognizer} = window.__api;
      document.body.innerHTML =
        '<div id="wrapper" style="height: 120px; width: 400px"><div id="card" style="height: 120px; width: 60px; background: #ccc">card</div></div><div style="height: 10px; width: 3000px"></div>';
      const card = document.getElementById('card') as HTMLElement;
      const pan = new PanGestureRecognizer({
        direction: 'horizontal',
        allowedScrollTypes: ['continuous'],
      });
      // The card follows the pan, as a swipe would move it.
      pan.addTransitionListener((_recognizer, _from, to) => {
        card.style.transform = `translateX(${pan.translation().x}px)`;
        window.__wheelLog.push(`pan:${to}:${Math.round(pan.translation().x)}`);
      });
      host.attach(card, pan);
    });
    const driver = await webInputDriver(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    const card = await center(page, 'card');
    // Six 16 px steps at a still cursor: the card leaves it after two.
    for (let step = 0; step < 6; step += 1) {
      await driver.wheel({...card, dx: 16});
    }
    await page.waitForTimeout(250);
    const pan = await page.evaluate(() =>
      window.__wheelLog.filter(entry => entry.startsWith('pan:')),
    );
    const moved = pan.filter(entry => entry.startsWith('pan:changed:'));
    // Every step after the first moved the card, and none scrolled the page.
    expect(moved).toHaveLength(5);
    expect(pan.slice(-2).map(entry => entry.split(':')[1])).toEqual([
      'ended',
      'possible',
    ]);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  });

  /** A page with a horizontal pan that takes only a trackpad's scroll; its moves land on `window.__wheelLog`. */
  async function trackpadPanPage(page: Page) {
    await page.goto('about:blank');
    await page.setContent(
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
    );
    await page.addScriptTag({content: bareBundle});
    await page.evaluate(() => {
      const {host, PanGestureRecognizer} = window.__api;
      document.body.innerHTML =
        '<div id="card" style="height: 120px; width: 300px; background: #ccc">card</div>';
      const pan = new PanGestureRecognizer({
        direction: 'horizontal',
        allowedPointerTypes: [],
        allowedScrollTypes: ['continuous'],
      });
      pan.addTransitionListener((_recognizer, _from, to) => {
        window.__wheelLog.push(
          `pan:${to}:${pan.translation().x.toFixed(2)}:${Math.round(pan.velocity().x)}`,
        );
      });
      host.attach(document.getElementById('card') as HTMLElement, pan);
    });
  }

  /** The pan's log entries after `deltas`, one wheel each, and a quiet 300 ms. */
  async function trackpadRun(page: Page, deltas: number[]) {
    const driver = await webInputDriver(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    const at = await center(page, 'card');
    for (const dx of deltas) {
      await driver.wheel({...at, dx});
    }
    await page.waitForTimeout(300);
    const log = await page.evaluate(() =>
      window.__wheelLog.filter(entry => entry.startsWith('pan:')),
    );
    const moves = log
      .filter(entry => /^pan:(changed|ended):/.test(entry))
      .map(entry => Number(entry.split(':')[2]));
    return {log, moves};
  }

  test("keeps a trackpad pan moving at the fingers' speed through the splitter's undecided stretch and lets it go at the lift still moving: no stall (spec:AST-094 FR43)", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    await trackpadPanPage(page);
    // Four steady wheels, four shrinking ones (the lift is read at the
    // fourth), then momentum.
    const {log, moves} = await trackpadRun(
      page,
      [12, 12, 12, 12, 11, 10, 9, 8, 7, 6, 5, 4],
    );
    const ended = log.filter(entry => entry.startsWith('pan:ended:'));
    expect(ended).toHaveLength(1);
    // The fingers' travel at their last steady wheel is -38 (48 px past the
    // 10 px hysteresis); the pan moved on past it through the shrinking
    // wheels, at least a wheel and a half's worth, never stepping back.
    for (const [i, x] of moves.entries()) {
      if (i > 0) {
        expect(x).toBeLessThanOrEqual(moves[i - 1]);
      }
    }
    expect(moves.at(-1)).toBeLessThan(-38 - 18);
    // Let go still moving, and the momentum after it moved nothing.
    expect(Math.abs(Number(ended[0].split(':')[3]))).toBeGreaterThan(100);
    expect(
      log.slice(log.indexOf(ended[0]) + 1).map(entry => entry.split(':')[1]),
    ).toEqual(['possible']);
  });

  test('absorbs what the undecided stretch showed when the fingers carry on: never a step back, and the pan ends on their travel (spec:AST-094 FR43)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    await trackpadPanPage(page);
    const deltas = [12, 12, 12, 12, 11, 10, 12, 12, 12, 12, 12, 12];
    const {moves} = await trackpadRun(page, deltas);
    for (const [i, x] of moves.entries()) {
      if (i > 0) {
        expect(x).toBeLessThanOrEqual(moves[i - 1]);
      }
    }
    const travel = deltas.reduce((sum, delta) => sum + delta, 0) - 10;
    expect(moves.at(-1)).toBeCloseTo(-travel, 1);
  });

  test("a pan that takes a trackpad's scroll follows a real trackpad scroll along its axis and keeps the page still, never a mouse wheel's notches, which scroll the page; a wheel across it scrolls the page, and a pinch follows a ctrl-wheel (spec:AST-094 FR43, DEC-24)", async ({
    page,
    browserName,
  }) => {
    await page.goto('about:blank');
    await page.setContent(
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
    );
    await page.addScriptTag({content: bareBundle});
    await page.evaluate(() => {
      const {host, PanGestureRecognizer, PinchGestureRecognizer} = window.__api;
      document.body.innerHTML =
        '<div id="strip" style="height: 120px; width: 300px">strip</div><div id="photo" style="height: 120px; width: 300px">photo</div><div style="height: 3000px; width: 3000px"></div>';
      const pan = new PanGestureRecognizer({
        direction: 'horizontal',
        allowedScrollTypes: ['continuous'],
      });
      pan.addTransitionListener((_recognizer, _from, to) =>
        window.__wheelLog.push(`pan:${to}:${Math.round(pan.translation().x)}`),
      );
      host.attach(document.getElementById('strip') as HTMLElement, pan);
      const pinch = new PinchGestureRecognizer();
      pinch.addTransitionListener((_recognizer, _from, to) =>
        window.__wheelLog.push(`pinch:${to}:${pinch.scale.toFixed(2)}`),
      );
      host.attach(document.getElementById('photo') as HTMLElement, pinch);
    });
    const driver = await webInputDriver(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    const strip = await center(page, 'strip');
    for (let step = 0; step < 6; step += 1) {
      await driver.wheel({...strip, dx: 8});
    }
    await page.waitForTimeout(250);
    const pan = await page.evaluate(() =>
      window.__wheelLog.filter(entry => entry.startsWith('pan:')),
    );
    if (browserName === 'chromium') {
      // Chromium's driver sends a mouse wheel's notches (wheelDeltaX -120
      // whatever the delta): a pan never takes them, and they scroll the page.
      expect(pan).toEqual([]);
      expect(await page.evaluate(() => window.scrollX)).toBeGreaterThan(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
    } else {
      // WebKit's sends a trackpad's precise deltas, which the pan follows.
      expect(pan[0]).toMatch(/^pan:began:/);
      expect(pan.some(entry => entry.startsWith('pan:ended:'))).toBe(true);
      // The content moves the way the fingers do: a scroll right drags it left.
      const moved = pan.filter(entry => entry.startsWith('pan:changed:'));
      expect(Number(moved.at(-1)?.split(':')[2])).toBeLessThan(0);
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
    }
    // Across the pan's axis the wheel is the page's.
    await driver.wheel({...strip, dy: 60});
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const photo = await center(page, 'photo');
    for (let step = 0; step < 5; step += 1) {
      await driver.wheel({...photo, dy: -10, ctrl: true});
    }
    await page.waitForTimeout(250);
    const pinch = await page.evaluate(() =>
      window.__wheelLog.filter(entry => entry.startsWith('pinch:')),
    );
    expect(pinch[0]).toMatch(/^pinch:began:/);
    expect(pinch.some(entry => entry.startsWith('pinch:ended:'))).toBe(true);
    expect(
      Math.max(...pinch.map(entry => Number(entry.split(':')[2]))),
    ).toBeGreaterThan(1);
  });

  test("the host registers no page touch listener while idle and warns for nothing, though the page attaches recognizers: an element keeps only a claiming recognizer's blocking touchmove; a mouse drag pans (spec:AST-094 FR43, FR24, FR19)", async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on('console', message => {
      if (message.type() === 'warning') {
        warnings.push(message.text());
      }
    });
    await page.goto('about:blank');
    await page.setContent(
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
    );
    await page.addScriptTag({content: bundle});
    const seen = await page.evaluate(() => ({
      isCoarse: matchMedia('(pointer: coarse)').matches,
      page: window.__pageTouchListenersAtLoad,
      elements: window.__listeners.map(
        entry => `${entry.id}:${entry.type}:${String(entry.passive)}`,
      ),
      // What the host would write: none of it, in any engine's spelling.
      styles: ['hpan', 'presser', 'slider', 'card'].map(id => {
        const style = document.getElementById(id)?.style;
        return ['touch-action', '-webkit-user-select', '-webkit-touch-callout']
          .map(property => style?.getPropertyValue(property) ?? 'missing')
          .join('|');
      }),
    }));
    expect(seen.isCoarse).toBe(false);
    expect(seen.page).toEqual([]);
    // Only the elements whose recognizer claims a moving finger carry a
    // touch listener: the blocking touchmove, which FR24 counts outside the
    // one-listener budget, so a touchscreen laptop's finger claims as on a
    // phone (FR19). A kept press gets its own only during a press.
    expect(seen.elements).toEqual(
      [
        'hpan',
        'presser',
        'pinchable',
        'sheetBody',
        'card',
        'authorNone',
        'authorPanY',
        'authorPinchZoom',
        'authorPanXY',
        'inlinePanXY',
        'edgeZone',
        'edgeWide',
        'edgeZoneRtl',
        'edgeWideRtl',
        'slider',
        'switchRow',
        'onePan',
      ].map(id => `${id}:touchmove:false`),
    );
    expect(seen.styles).toEqual(['||', '||', '||', '||']);
    // Gestures attach for every pointer: nothing to warn about.
    expect(
      warnings.filter(text => text.includes('primary pointer is fine')),
    ).toEqual([]);
    // A real mouse drag pans the horizontal pan.
    const box = await page.locator('#hpan').boundingBox();
    if (box == null) {
      throw new Error('no box for #hpan');
    }
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 20, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, y, {steps: 8});
    await page.mouse.up();
    const hpan = await page.evaluate(() =>
      window.__gestures
        .filter(entry => entry.name === 'hpan')
        .map(entry => entry.state),
    );
    expect(hpan[0]).toBe('began');
    expect(hpan).toContain('ended');
  });
});

/**
 * A page with a scroller of rows and a tap recognizer on one row; every
 * transition of the tap goes to `window.__taps`.
 */
async function openTapInScroller(page: Page, engine: string): Promise<Driver> {
  const driver = await openBare(page, engine);
  await page.evaluate(() => {
    const {host, TapGestureRecognizer} = window.__api;
    document.body.innerHTML = `
      <div id="list" style="height: 300px; overflow-y: auto; overscroll-behavior: contain">
        <div id="row" style="height: 80px; background: #cfc">row</div>
        <div style="height: 1200px">more rows</div>
      </div>`;
    const taps: string[] = [];
    (window as unknown as {__taps: string[]}).__taps = taps;
    const tap = new TapGestureRecognizer({name: 'tap'});
    tap.addTransitionListener((_current, _from, to) => taps.push(to));
    host.attach(document.getElementById('row') as HTMLElement, tap);
  });
  return driver;
}

test('a still finger with sub-pixel jitter over a scroll view keeps its tap and scrolls nothing (spec:AST-094 FR18–FR22)', async ({
  page,
  browserName,
}) => {
  const driver = await openTapInScroller(page, browserName);
  const at = await center(page, 'row');
  // A resting fingertip: a few tenths of a pixel back and forth.
  const jitter = [
    [0.3, 0.2],
    [-0.2, 0.4],
    [0.4, -0.3],
    [-0.3, -0.2],
    [0.2, 0.3],
    [0, 0],
  ];
  const steps: Step[] = [{t: 0, down: [{...at, id: 1}]}];
  jitter.forEach(([dx, dy], i) =>
    steps.push({
      t: (i + 1) * 16,
      down: [{x: at.x + dx, y: at.y + dy, id: 1}],
    }),
  );
  steps.push({t: (jitter.length + 1) * 16, down: []});
  await driver.play(steps);
  await page.waitForTimeout(100);
  const taps = await page.evaluate(
    () => (window as unknown as {__taps: string[]}).__taps,
  );
  expect(taps).toContain('ended');
  expect(await scrollTop(page, 'list')).toBe(0);
});

for (const stop of [
  {
    label: "an app's window-capture stopPropagation",
    install: 'window' as const,
  },
  {
    label:
      "a document-capture stopImmediatePropagation registered before core's",
    install: 'document' as const,
  },
]) {
  test(`a tap is still recognized under ${stop.label}, since the recognizers hear touches on the window's capture phase`, async ({
    page,
    browserName,
  }) => {
    const driver = await openBare(page, browserName);
    await page.evaluate(install => {
      // The app's stop comes first, before any recognizer attaches.
      for (const type of ['touchstart', 'touchmove', 'touchend']) {
        if (install === 'window') {
          window.addEventListener(type, event => event.stopPropagation(), {
            capture: true,
          });
        } else {
          document.addEventListener(
            type,
            event => event.stopImmediatePropagation(),
            {capture: true},
          );
        }
      }
      const {host, TapGestureRecognizer} = window.__api;
      document.body.innerHTML =
        '<div id="row" style="height: 80px; background: #cfc">row</div>';
      const taps: string[] = [];
      (window as unknown as {__taps: string[]}).__taps = taps;
      const tap = new TapGestureRecognizer({name: 'tap'});
      tap.addTransitionListener((_current, _from, to) => taps.push(to));
      host.attach(document.getElementById('row') as HTMLElement, tap);
    }, stop.install);
    const at = await center(page, 'row');
    await driver.play([
      {t: 0, down: [{...at, id: 1}]},
      {t: 60, down: []},
    ]);
    await page.waitForTimeout(100);
    const taps = await page.evaluate(
      () => (window as unknown as {__taps: string[]}).__taps,
    );
    expect(taps).toContain('ended');
  });
}

for (const travel of [
  {dx: 0, dy: 9, label: '9 px straight', keeps: true},
  {dx: 0, dy: 10, label: '10 px straight', keeps: false},
  {dx: 7, dy: 7, label: '(7, 7), 9.9 px diagonally', keeps: true},
  {dx: 8, dy: 8, label: '(8, 8), 11.3 px diagonally', keeps: false},
]) {
  test(`a finger moved ${travel.label} over a scroll view ${travel.keeps ? 'keeps its tap and scrolls nothing' : 'is a tap or a scroll, never both'} (spec:AST-094 FR18–FR22)`, async ({
    page,
    browserName,
  }) => {
    const driver = await openTapInScroller(page, browserName);
    await logTouchMoves(page);
    const at = await center(page, 'row');
    await driver.play(drag(at, {x: at.x + travel.dx, y: at.y + travel.dy}, 6));
    await page.waitForTimeout(100);
    const taps = await page.evaluate(
      () => (window as unknown as {__taps: string[]}).__taps,
    );
    const scrolled = (await scrollTop(page, 'list')) > 0;
    if (travel.keeps) {
      // Under 10 px of travel: a tap, and no scroll took the touch.
      expect(taps).toContain('ended');
      expect(scrolled).toBe(false);
    } else {
      // From 10 px the browser may scroll (WebKit on a phone starts at 10;
      // Chromium waits longer): if it does, the scroll takes the touch and
      // there is no tap; if it does not, the tap stands.
      expect(scrolled && taps.includes('ended')).toBe(false);
    }
    // A tap never claims a moving touch: no touchmove is cancelled, so the
    // browser's scroll is never blocked.
    expect((await readTouchMoves(page)).some(Boolean)).toBe(false);
  });
}

/**
 * A screen-edge pan on a strip along the left edge as wide as its band
 * (40.2 px, which lays out at 40.203), over a horizontal scroller that
 * fills the page; every
 * transition of the pan goes to `window.__edge`.
 */
async function openEdgePan(page: Page, engine: string): Promise<Driver> {
  const driver = await openBare(page, engine);
  await page.evaluate(() => {
    const {host, ScreenEdgePanGestureRecognizer} = window.__api;
    document.body.innerHTML = `
      <div id="hscroll" style="height: 300px; overflow-x: auto; overscroll-behavior: contain">
        <div style="width: 3000px; height: 300px; background: linear-gradient(90deg, #eef, #cce)">wide</div>
      </div>
      <div id="edge" style="position: fixed; left: 0; top: 0; width: 40.2px; height: 300px"></div>`;
    const edges: string[] = [];
    (window as unknown as {__edge: string[]}).__edge = edges;
    const pan = new ScreenEdgePanGestureRecognizer({
      name: 'edge',
      edges: ['leading'],
    });
    pan.addTransitionListener((_current, _from, to) => edges.push(to));
    host.attach(document.getElementById('edge') as HTMLElement, pan);
  });
  return driver;
}

for (const run of [
  {travel: 14, begins: false},
  {travel: 15, begins: true},
]) {
  test(`a screen-edge pan landing 40 px from the edge ${run.begins ? 'claims at' : 'has not claimed at'} ${run.travel} px of travel (spec:AST-094 FR18–FR22)`, async ({
    page,
    browserName,
  }) => {
    const driver = await openEdgePan(page, browserName);
    await logTouchMoves(page);
    await driver.play(
      drag({x: 40, y: 150}, {x: 40 + run.travel, y: 150}, 7, false),
    );
    await page.waitForTimeout(100);
    const edges = await page.evaluate(
      () => (window as unknown as {__edge: string[]}).__edge,
    );
    expect(edges.includes('began')).toBe(run.begins);
    await driver.play([{t: 0, down: []}]);
  });
}

test('a touch landing 41 px from the edge is outside the band: the edge pan never begins, and the horizontal scroll it starts is not blocked (spec:AST-094 FR18–FR22)', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'needs native scrolling from injected touches (Mobile Safari on the simulator)',
  );
  const driver = await openEdgePan(page, browserName);
  await page.evaluate(() => {
    (document.getElementById('hscroll') as HTMLElement).scrollLeft = 600;
  });
  await logTouchMoves(page);
  await driver.play(drag({x: 41, y: 150}, {x: 201, y: 150}, 12));
  await page.waitForTimeout(300);
  const edges = await page.evaluate(
    () => (window as unknown as {__edge: string[]}).__edge,
  );
  expect(edges).not.toContain('began');
  expect((await readTouchMoves(page)).some(Boolean)).toBe(false);
  expect(
    await page.evaluate(
      () => (document.getElementById('hscroll') as HTMLElement).scrollLeft,
    ),
  ).toBeLessThan(600);
});

/** A watcher's transition, with how far the list had scrolled then. */
interface WatchTransition {
  to: string;
  scrollTop: number;
}

test('a watcher follows a touch the browser scrolls with to the lift, and cancels none of its moves (spec:AST-094 FR20)', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'needs native scrolling from injected touches (Mobile Safari on the simulator)',
  );
  const driver = await openBare(page, browserName);
  await page.evaluate(() => {
    const {host, PanGestureRecognizer} = window.__api;
    document.body.innerHTML = `
      <div id="list" style="height: 300px; overflow-y: auto">
        <div id="row" style="height: 80px; background: #cfc">row</div>
        <div style="height: 1200px">more rows</div>
      </div>`;
    const list = document.getElementById('list') as HTMLElement;
    const states: WatchTransition[] = [];
    (window as unknown as {__watch: WatchTransition[]}).__watch = states;
    const watcher = new PanGestureRecognizer({
      name: 'watch',
      direction: 'vertical',
      claimsTouches: false,
    });
    // Each transition with how far the list had scrolled then.
    watcher.addTransitionListener((_current, _from, to) =>
      states.push({to, scrollTop: list.scrollTop}),
    );
    host.attach(document.getElementById('list') as HTMLElement, watcher, {
      manageStyle: false,
    });
  });
  await logTouchMoves(page);
  const at = await center(page, 'row');
  await driver.play(drag(at, {x: at.x, y: at.y - 120}, 30));
  await page.waitForTimeout(100);
  const states = await page.evaluate(
    () =>
      (
        window as unknown as {
          __watch: WatchTransition[];
        }
      ).__watch,
  );
  // The browser scrolled the list: the watcher took nothing from it.
  expect(await scrollTop(page, 'list')).toBeGreaterThan(20);
  expect((await readTouchMoves(page)).some(Boolean)).toBe(false);
  // And it followed the scroll from its start to the lift: it still
  // reported moves once the browser had taken the touch and was scrolling.
  expect(states.map(entry => entry.to)).toContain('began');
  expect(
    states.some(entry => entry.to === 'changed' && entry.scrollTop > 0),
  ).toBe(true);
  // It ended there, then the arena reset it to possible, as UIKit resets a
  // recognizer after it ends.
  expect(states.slice(-2).map(entry => entry.to)).toEqual([
    'ended',
    'possible',
  ]);
});
