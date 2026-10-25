// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gestures.browser.spec.ts
 * @input The gesture fixture bundled with esbuild, a phone-sized touch
 *   screen, and real engine touch input: Chromium through CDP with explicit
 *   timestamps, WebKit through its own input command (real-time pacing)
 * @output Browser proof of the negotiation the unit tests cannot see:
 *   touch-action per element, touchmove cancelled exactly while a recognizer
 *   owns the finger, native scrolling untouched otherwise, click suppression
 *   with no ghost click, scroll handoff at the content's edge, pinch-zoom
 *   left to the browser, a second finger that never breaks the first, and
 *   timing taken from event timestamps under a blocked main thread
 * @position Browser tests of packages/core/src/gestures (see
 *   playwright.config.ts beside this file). WebKit's Linux build cannot
 *   scroll, fling or pinch-zoom from injected touches, and synthesises a
 *   click only from its tap gesture; the checks that need those run in
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
  handoff?: boolean;
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
  // Pans (the cards' too), a long press, a pinch and the sheet's pan can take
  // a moving touch; a tap-only element and a press consumer never wait.
  expect(new Set(blocking)).toEqual(
    new Set([
      'hpan',
      'presser',
      'pinchable',
      'sheetBody',
      'slider',
      'card',
      'cardLate',
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

test('a held finger turns text selection off on a press-tracked control and on a pan that asks, until it lifts; a mouse and other pans keep it', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const selection = async (id: string) =>
    page.evaluate(target => {
      const style = getComputedStyle(
        document.getElementById(target) ?? document.body,
      );
      return (
        style.getPropertyValue('-webkit-user-select') ||
        style.getPropertyValue('user-select')
      );
    }, id);
  const held: Record<string, string[]> = {};
  for (const id of ['passive', 'slider', 'hpan']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    const at = await center(page, id);
    const before = await selection(id);
    await driver.play([{t: 0, down: [{id: 1, ...at}]}]);
    const during = await selection(id);
    await driver.play([{t: 0, down: []}]);
    held[id] = [before, during, await selection(id)];
  }
  // The engine's own value otherwise: Chromium computes `auto`, WebKit `text`.
  const free = held.hpan[0];
  expect(free).not.toBe('none');
  expect(held.passive).toEqual([free, 'none', free]);
  expect(held.slider).toEqual([free, 'none', free]);
  expect(held.hpan).toEqual([free, free, free]);

  const at = await center(page, 'passive');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  const withMouse = await selection('passive');
  await page.mouse.up();
  expect(withMouse).toBe(free);
});

test('a held finger on a checkbox inside a press-tracked row turns its selection off too: WebKit makes every input selectable', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const selection = async () =>
    page.evaluate(() => {
      const style = getComputedStyle(
        document.getElementById('check') ?? document.body,
      );
      return (
        style.getPropertyValue('-webkit-user-select') ||
        style.getPropertyValue('user-select')
      );
    });
  await page.locator('#check').scrollIntoViewIfNeeded();
  const at = await center(page, 'check');
  const before = await selection();
  await driver.play([{t: 0, down: [{id: 1, ...at}]}]);
  const during = await selection();
  await driver.play([{t: 0, down: []}]);
  expect([before, during, await selection()]).toEqual([before, 'none', before]);
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

test('scroll handoff: at the top the pull is the sheet’s at once', async ({
  page,
  browserName,
}) => {
  const driver = await open(page, browserName);
  const start = await center(page, 'sheetBody');
  await driver.play(drag(start, {x: start.x, y: start.y + 96}));
  const entries = await log(page);
  const sheet = entries.filter(entry => entry.name === 'sheet');
  expect(sheet[0]?.state).toBe('began');
  expect(sheet[0]?.handoff).toBe(false);
  expect(
    sheet.filter(entry => entry.state === 'changed').at(-1)?.y,
  ).toBeCloseTo(96 - 10, 0);
  expect(await scrollTop(page, 'sheetBody')).toBe(0);
});

test('scroll handoff: mid-content the browser scrolls first and the sheet takes the rest', async ({
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
  expect(await scrollTop(page, 'sheetBody')).toBe(0);
  expect(sheet[0]?.state).toBe('began');
  expect(sheet[0]?.handoff).toBe(true);
  // The content took the first 60 px (and the browser its touch slop); the
  // sheet got the rest of the finger's travel.
  const final = sheet.filter(entry => entry.state === 'changed').at(-1)?.y ?? 0;
  expect(final).toBeGreaterThan(200 - 60 - 24);
  expect(final).toBeLessThanOrEqual(200 - 60 + 1);
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
