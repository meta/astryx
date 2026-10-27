// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gestures.browser.spec.ts
 * @input The gesture fixture bundled with esbuild, a phone-sized touch
 *   screen, and real engine touch input: Chromium through CDP with explicit
 *   timestamps, WebKit through its own input command (real-time pacing)
 * @output Browser proof of the negotiation the unit tests cannot see:
 *   touch-action per element, touchmove cancelled exactly while a recognizer
 *   owns the finger, native scrolling untouched otherwise, click suppression
 *   with no ghost click, a drag that began as a scroll staying the browser's, pinch-zoom
 *   left to the browser, a second finger that never breaks the first,
 *   timing taken from event timestamps under a blocked main thread, nothing
 *   attached where the primary pointer is fine or a recognizer is disabled,
 *   and a held finger's selection lock only where the hold takes the touch
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
  // Pans (the cards' and the switch's drag too), a long press, a pinch and
  // the sheet's pan can take a moving touch; a tap-only element and a press
  // consumer never wait.
  expect(new Set(blocking)).toEqual(
    new Set([
      'hpan',
      'presser',
      'pinchable',
      'sheetBody',
      'slider',
      'switchRow',
      'card',
      'switchRow',
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

test('where the primary pointer is fine, the host writes no touch-action and registers no touch listener (spec:AST-094 FR19, FR24)', async ({
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
      host.attach(
        document.getElementById('drag') as HTMLElement,
        new PanGestureRecognizer({direction: 'horizontal'}),
      );
      host.attach(
        document.getElementById('hold') as HTMLElement,
        new LongPressGestureRecognizer(),
      );
    });
    expect(await footprint(page, 'drag')).toEqual({
      touchAction: '',
      pageTouchListeners: 0,
    });
    expect((await footprint(page, 'hold')).touchAction).toBe('');
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
      edges: ['left'],
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
    const states: string[] = [];
    (window as unknown as {__watch: string[]}).__watch = states;
    const watcher = new PanGestureRecognizer({
      name: 'watch',
      direction: 'vertical',
      claimsTouches: false,
    });
    watcher.addTransitionListener((_current, _from, to) => states.push(to));
    host.attach(document.getElementById('list') as HTMLElement, watcher, {
      manageStyle: false,
    });
  });
  await logTouchMoves(page);
  const at = await center(page, 'row');
  await driver.play(drag(at, {x: at.x, y: at.y - 120}, 30));
  await page.waitForTimeout(100);
  const states = await page.evaluate(
    () => (window as unknown as {__watch: string[]}).__watch,
  );
  // The browser scrolled the list: the watcher took nothing from it.
  expect(await scrollTop(page, 'list')).toBeGreaterThan(20);
  expect((await readTouchMoves(page)).some(Boolean)).toBe(false);
  // And it followed the scroll from its start to the lift.
  expect(states).toContain('began');
  expect(states.at(-1)).toBe('ended');
});
