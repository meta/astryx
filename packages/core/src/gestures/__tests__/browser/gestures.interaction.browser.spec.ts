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
 *   left to the browser, a second finger that never breaks the first, and
 *   timing taken from event timestamps under a blocked main thread
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

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture.ts'),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
  });
  bundle = result.outputFiles[0].text;
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
  // Pans (the cards' and the screen-edge pans' too), long presses, a pinch
  // and the sheet's pan can take a moving touch; a tap-only element and a
  // press consumer never wait.
  expect(new Set(blocking)).toEqual(
    new Set([
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
    // After a claimed drag only the click swallower stays, for 1 s.
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y, {steps: 4});
    await page.mouse.up();
    await page.waitForTimeout(50);
    expect(await addedPageListeners(page, idle)).toEqual(['click']);
    await page.waitForTimeout(1100);
    expect(await addedPageListeners(page, idle)).toEqual([]);
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
