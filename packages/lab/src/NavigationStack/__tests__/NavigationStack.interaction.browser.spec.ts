// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavigationStack.interaction.browser.spec.ts
 * @input The built "Lab/NavigationStack" stories on the harness's phone, real
 *   touch input (Chromium CDP / WebKit's input command) and the interaction
 *   harness
 * @output Proofs that NavigationStack moves like UINavigationController on
 *   iOS 26.2. They cover the push spring, the parallax, both back swipes and
 *   their release, and a blocked main thread. They also cover Reduce Motion,
 *   and write storyboards of a push and of a released swipe.
 * @position Interaction proof for lab NavigationStack (NavigationStack.tsx,
 *   navigationTransition.ts)
 */

import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  advanceFrozenPage,
  animationStoryboard,
  armHold,
  armInputRun,
  blockMainThread,
  BusyWindowTooLateError,
  busyWindowProof,
  castStoryboard,
  CONTROL_RGB,
  countBetween,
  drag,
  flick,
  FRAME_STARVATION_MS,
  FrameStarvationError,
  freezePageOn,
  freezePageWhen,
  holdAnimations,
  installPageFreeze,
  installTimerGate,
  MARKER_RGB,
  openStory,
  releaseAnimations,
  sampleCurve,
  sampleRects,
  seekAnimations,
  startBusyControl,
  startScreencast,
  thawPage,
  toTouchEvents,
  touchArrivalsFrom,
  touchDriver,
  touchPacingFault,
  touchPlayError,
  touchStoryboard,
  traceRendering,
  trackMarker,
  trackMarkers,
  waitForRest,
  watchAnimations,
  withStorybook,
  writeEvidence,
  type BlockedWindow,
  type TouchDriver,
  type TrackedFrame,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** UIKit's push spring on iOS 26.2: critically damped, response 0.3 s. */
const OMEGA = (2 * Math.PI) / 0.3;
/** Its starting speed, widths per second. */
const PUSH_VELOCITY = 8.773;

interface Stack {
  driver: TouchDriver;
  stack: Locator;
  width: number;
  left: number;
  /** The bar title of the screen on top. */
  topTitle: () => Promise<string | null>;
}

/**
 * A page under a real mouse: no touch and no mobile viewport, so script and
 * CSS both read a fine pointer. (The phone project's own page stays coarse
 * for CSS whatever script is told.) Close its context when done.
 */
async function newFinePage(browser: Browser) {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 402, height: 714},
  });
  return {context, page: await context.newPage()};
}

/**
 * Opens a story. `standalone` makes the page a home-screen web app
 * (`navigator.standalone`), where no browser back swipe owns the screen
 * edge, so the stack's own edge swipe runs. `pointer: 'mouse'` needs a page
 * from `newFinePage`, and fails before any check if the page reads coarse.
 */
async function openStack(
  page: Page,
  story: 'settings' | 'pushed' | 'carousel' | 'declines-pops' | 'large-title',
  {
    standalone = false,
    pointer = 'touch',
  }: {standalone?: boolean; pointer?: 'touch' | 'mouse'} = {},
) {
  // One touch model: touch behaviour keys on a coarse primary pointer, on
  // every engine. Under a finger, script reads coarse whatever the engine
  // emulates (the input is the emulated finger); under a mouse the page
  // itself is fine (newFinePage).
  if (pointer === 'touch') {
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query.replace(/\s/g, '') === '(pointer:coarse)'
          ? matchMedia('(min-width: 0px)')
          : matchMedia(query);
    });
  }
  if (standalone) {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', {
        configurable: true,
        get: () => true,
      });
    });
  }
  await openStory(page, storybook(), `lab-navigationstack--${story}`);
  if (pointer === 'mouse') {
    expect(
      await page.evaluate(
        () =>
          matchMedia('(pointer: fine)').matches &&
          !matchMedia('(pointer: coarse)').matches,
      ),
      'a page under a mouse reads a fine pointer (newFinePage)',
    ).toBe(true);
  }
  const driver = await touchDriver(page);
  const stack = page.getByTestId('navigation-stack');
  await expect(stack).toBeVisible();
  const box = await stack.boundingBox();
  if (box == null) {
    throw new Error('no stack');
  }
  return {
    driver,
    stack,
    width: box.width,
    left: box.x,
    topTitle: async () =>
      page.evaluate(() => {
        const top = document.querySelector('[data-navigation-top]');
        const key = top?.getAttribute('data-navigation-screen');
        const bars = [...document.querySelectorAll('h2')];
        // The top screen's bar title is the one not inert.
        const live = bars.find(h => h.closest('[inert]') == null);
        return key == null ? null : (live?.textContent ?? null);
      }),
  } satisfies Stack;
}

/** A card's presented translateX, px (the animator drives `translate`). */
const translateX = async (card: Locator) =>
  card.evaluate(element => {
    const value = getComputedStyle(element).translate;
    return value === 'none' ? 0 : parseFloat(value);
  });

const card = (page: Page, key: string) =>
  page.locator(`[data-navigation-screen="${key}"]`);

/** One frame of `traceBars`: each screen's card and bar x, the back button. */
interface BarFrame {
  t: number;
  cards: Record<string, number>;
  bars: Record<string, number>;
  /** Effective opacity (own times every ancestor's) of the back button. */
  back: {platter: number; chevron: number} | null;
  /** Whether an animation drives a card or a bar in this frame. */
  animating: boolean;
}

/**
 * Installs the page's reader of each card's and bar's x relative to the
 * stack and the back button's effective opacities. A layer's x is its
 * computed `translate`: the cards and bars sit at the stack's leading edge,
 * checked here. So a read needs no layout. Under load, WebKit can evaluate
 * two layers that share one clock at two times in one frame, as far apart as
 * their reads. This holds for boxes and translates alike. So each card is
 * read right before its bar. `animating` says which reads an animation
 * drives.
 */
async function installBarReader(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {__readBarFrame: (t: number) => unknown};
    const stack = document.querySelector('[data-testid="navigation-stack"]');
    const effective = (element: Element) => {
      let opacity = 1;
      for (
        let node: Element | null = element;
        node != null && node !== document.documentElement;
        node = node.parentElement
      ) {
        opacity *= Number(getComputedStyle(node).opacity);
      }
      return opacity;
    };
    const translateX = (element: Element) => {
      const value = getComputedStyle(element).translate;
      return value === 'none' ? 0 : parseFloat(value);
    };
    const readLayers = () => {
      const cards: Record<string, number> = {};
      const bars: Record<string, number> = {};
      for (const card of document.querySelectorAll(
        '[data-navigation-screen]',
      )) {
        const key = card.getAttribute('data-navigation-screen');
        if (key == null) {
          continue;
        }
        cards[key] = translateX(card);
        const keyBars = document.querySelectorAll(
          `[data-navigation-bar="${CSS.escape(key)}"]`,
        );
        const bar = keyBars.item(keyBars.length - 1);
        if (bar != null) {
          bars[key] = translateX(bar);
        }
      }
      for (const bar of document.querySelectorAll('[data-navigation-bar]')) {
        const key = bar.getAttribute('data-navigation-bar');
        if (key != null && !(key in cards)) {
          bars[key] = translateX(bar);
        }
      }
      return {cards, bars};
    };
    // A layer at rest sits at the stack's edge: its box is its translate.
    const left = stack?.getBoundingClientRect().left ?? 0;
    for (const element of document.querySelectorAll(
      '[data-navigation-screen], [data-navigation-bar]',
    )) {
      if (element.getAnimations().length > 0) {
        continue;
      }
      const offset =
        element.getBoundingClientRect().left - left - translateX(element);
      if (Math.abs(offset) > 0.5) {
        throw new Error(`a layer sits ${offset} px from the stack's edge`);
      }
    }
    w.__readBarFrame = t => {
      const button = document.querySelector('[data-navigation-back]');
      const chevron = button?.firstElementChild ?? null;
      return {
        t,
        ...readLayers(),
        back:
          button == null || chevron == null
            ? null
            : {platter: effective(button), chevron: effective(chevron)},
        animating: [
          ...document.querySelectorAll(
            '[data-navigation-screen], [data-navigation-bar]',
          ),
        ].some(element =>
          element.getAnimations().some(a => a.playState === 'running'),
        ),
      };
    };
  });
}

/**
 * Starts sampling the layers every frame (`installBarReader`). The returned
 * function stops and returns the frames.
 */
async function traceBars(page: Page): Promise<() => Promise<BarFrame[]>> {
  await installBarReader(page);
  await page.evaluate(() => {
    const w = window as unknown as {
      __bars: unknown[];
      __barsStop: boolean;
      __readBarFrame: (t: number) => unknown;
    };
    w.__bars = [];
    w.__barsStop = false;
    const t0 = performance.now();
    const tick = () => {
      w.__bars.push(w.__readBarFrame(performance.now() - t0));
      if (!w.__barsStop) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  return async () =>
    page.evaluate(() => {
      const w = window as unknown as {__bars: unknown[]; __barsStop: boolean};
      w.__barsStop = true;
      return w.__bars;
    }) as Promise<BarFrame[]>;
}

/**
 * The layers read once (`installBarReader`), labelled with the held
 * timeline time `t`: every held animation sits at `t`, whenever each read
 * runs.
 */
async function readBarsAt(page: Page, t: number): Promise<BarFrame> {
  return page.evaluate(
    ms =>
      (
        window as unknown as {__readBarFrame: (t: number) => unknown}
      ).__readBarFrame(ms),
    t,
  ) as Promise<BarFrame>;
}

/** The bar `installBarReader` reads for `key`: the last one marked with it. */
const bar = (page: Page, key: string) =>
  page.locator(`[data-navigation-bar="${key}"]`).last();

/**
 * The time (ms) at which the screens' push or pop spring (critically damped,
 * 0.3 s, starting at navigation.pushVelocity widths/s) reaches `progress`.
 * This is the screens' own clock, read from where a card is. So a check keyed
 * to it holds however late an engine shows the first frame.
 */
const screensClock = (progress: number) => {
  const omega = (2 * Math.PI) / 0.3;
  const at = (s: number) =>
    1 - (1 + (omega - 8.773) * s) * Math.exp(-omega * s);
  let lo = 0;
  let hi = 2;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < progress) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return ((lo + hi) / 2) * 1000;
};

/** Critically damped from rest: progress of a spring of `response` s. */
const crit = (response: number, ms: number) => {
  if (ms <= 0) {
    return 0;
  }
  const u = ((2 * Math.PI) / response) * (ms / 1000);
  return 1 - (1 + u) * Math.exp(-u);
};

/** One scene time of a push: where the incoming card and the cut stand. */
interface CutSample {
  /** The incoming card's leading edge, px. */
  cardEdge: number;
  /** How far the covered bar's cut is from that edge, px. */
  gap: number;
}

/** The scene times `cutAcrossPush` reads, ms after the push starts. */
const CUT_TIMES = [16, 50, 90, 130, 180, 240, 300, 380];

/**
 * Runs `push`, then reads the incoming card's leading edge and the covered
 * bar's cut from their rendered boxes at each of `CUT_TIMES`. The scene
 * freezes while the push runs, so nothing moves or retires. Each read moves
 * every animation of the push to one scene time first. Mid-flight, WebKit can
 * report one moving layer a frame late; at a held time it cannot. A freeze
 * that lands late on a busy machine still reads the whole flight. The page
 * needs `installPageFreeze` before it loads and `installTimerGate` after.
 */
async function cutAcrossPush(
  page: Page,
  push: () => Promise<void>,
  {
    covered,
    incoming,
    direction,
  }: {covered: string; incoming: string; direction: 'ltr' | 'rtl'},
): Promise<CutSample[]> {
  // Armed before the push, so the scene freezes while it runs.
  const frozen = freezePageWhen(
    page,
    key =>
      document
        .querySelector(`[data-navigation-screen="${key}"]`)
        ?.getAnimations()
        .some(animation => animation.playState === 'running') === true,
    incoming,
  );
  await push();
  await frozen;
  try {
    return await page.evaluate(
      ([coveredKey, incomingKey, dir, times]) => {
        const stack = document.querySelector(
          '[data-testid="navigation-stack"]',
        );
        const cardElement = document.querySelector(
          `[data-navigation-screen="${incomingKey}"]`,
        );
        const cutElement = document.querySelector(
          `[data-navigation-bar="${coveredKey}"]`,
        )?.firstElementChild;
        if (stack == null || cardElement == null || cutElement == null) {
          return [];
        }
        const runs = document.getAnimations().filter(animation => {
          const target =
            animation.effect instanceof KeyframeEffect
              ? animation.effect.target
              : null;
          return (
            target != null &&
            stack.contains(target) &&
            animation.startTime != null
          );
        });
        // Read once: a held run's start follows its current time.
        const starts = runs.map(animation => Number(animation.startTime));
        const heldAt = runs.map(animation => animation.currentTime);
        // Scene times count from the incoming card's own start, whatever
        // else in the stack animates (a row's press feedback).
        const cardRun = runs.findIndex(
          animation =>
            animation.effect instanceof KeyframeEffect &&
            animation.effect.target === cardElement,
        );
        if (cardRun < 0) {
          return [];
        }
        const origin = starts[cardRun];
        const samples = times.map(t => {
          runs.forEach((animation, index) => {
            animation.currentTime = Math.max(0, origin + t - starts[index]);
          });
          const cardBox = cardElement.getBoundingClientRect();
          const cutBox = cutElement.getBoundingClientRect();
          // The cut's trailing edge meets the card's leading edge.
          const cardEdge = dir === 'rtl' ? cardBox.right : cardBox.left;
          const cutEdge = dir === 'rtl' ? cutBox.left : cutBox.right;
          return {cardEdge, gap: Math.abs(cutEdge - cardEdge)};
        });
        // Back where the freeze held them, so the thaw plays on from there.
        runs.forEach((animation, index) => {
          animation.currentTime = heldAt[index];
        });
        return samples;
      },
      [covered, incoming, direction, CUT_TIMES] as const,
    );
  } finally {
    await thawPage(page);
  }
}

/**
 * The samples span the flight, and at every one the cut stays on the card's
 * leading edge.
 */
function expectCutOnCardEdge(samples: CutSample[], width: number) {
  const trace = JSON.stringify(samples);
  expect(samples.length, trace).toBeGreaterThanOrEqual(5);
  const travel = Math.abs(
    samples[0].cardEdge - samples[samples.length - 1].cardEdge,
  );
  expect(travel, trace).toBeGreaterThan(width * 0.5);
  for (const sample of samples) {
    expect(sample.gap, trace).toBeLessThan(2);
  }
}

const rowCenter = async (page: Page, name: string) => {
  const box = await page.getByRole('button', {name}).first().boundingBox();
  if (box == null) {
    throw new Error(`no row ${name}`);
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
};

/** The events a touch play's page receives, pointer events included. */
const TOUCH_INPUT_TYPES = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
];

test('a push follows UIKit’s push spring, the card underneath at 0.3 of its speed', async ({
  page,
}, testInfo) => {
  const {driver, stack, width} = await openStack(page, 'settings');
  const top = card(page, 'screen-General');
  const under = card(page, 'root');
  // The push moves both cards at once: with a count of 2, the row's own
  // release fade cannot trigger the hold alone.
  const hold = await armHold(page, stack, {
    judges: [
      {target: top, property: 'translate'},
      {target: under, property: 'translate'},
    ],
    count: 2,
    newOnly: true,
  });
  await driver.tap(await rowCenter(page, 'General'));
  await hold.held();

  const times = Array.from({length: 31}, (_, i) => i * 16.667);
  const samples: {t: number; top: number; under: number; analytic: number}[] =
    [];
  for (const t of times) {
    await page.evaluate(ms => {
      const held =
        (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ??
        [];
      for (const animation of held) {
        const end = Number(
          animation.effect?.getComputedTiming().endTime ?? Infinity,
        );
        animation.currentTime = Math.min(ms, end - 0.5);
      }
    }, t);
    const s = t / 1000;
    // x(t) = (x0 + (v0 + ω·x0)·t)·e^(−ωt), from x0 = W at v0 = −8.773 W/s.
    const analytic =
      (width + (-PUSH_VELOCITY * width + OMEGA * width) * s) *
      Math.exp(-OMEGA * s);
    samples.push({
      t: +t.toFixed(1),
      top: await translateX(top),
      under: await translateX(under),
      analytic,
    });
  }
  await releaseAnimations(page, {finish: true});
  await writeEvidence(
    'curves/navigationstack-push',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {width, samples},
        null,
        1,
      ),
    },
    testInfo,
  );

  for (const sample of samples) {
    expect(
      Math.abs(sample.top - sample.analytic),
      JSON.stringify(sample),
    ).toBeLessThan(0.5);
    // The card underneath: x = −0.3 W · (1 − p), p = top / W.
    expect(sample.under).toBeCloseTo(
      -0.3 * width * (1 - sample.top / width),
      0,
    );
  }
  // It starts fast (UIKit's starting velocity, not from rest) and lands.
  expect(samples[1].top).toBeLessThan(width * 0.92);
  expect(samples.at(-1)?.top ?? Infinity).toBeLessThan(0.5);
});

test('a push’s bar: the new bar slides in with its screen, the covered one rides its parallax, the chevron fades in a beat later', async ({
  page,
}) => {
  const {driver, stack, width} = await openStack(page, 'settings');
  await installBarReader(page);
  // Every layer of the push is held, then read at one timeline time. A busy
  // runner can draw too few live frames to see the push at all.
  const hold = await armHold(page, stack, {
    judges: [
      {target: card(page, 'screen-General'), property: 'translate'},
      {target: card(page, 'root'), property: 'translate'},
      {target: bar(page, 'screen-General'), property: 'translate'},
      {target: bar(page, 'root'), property: 'translate'},
      {
        target: page.locator('[data-navigation-back] > *').first(),
        property: 'opacity',
      },
    ],
    count: 5,
    newOnly: true,
  });
  await driver.tap(await rowCenter(page, 'General'));
  await hold.held();
  const frames: BarFrame[] = [];
  for (let i = 0; i <= 36; i++) {
    frames.push(await readBarsAt(page, await seekAnimations(page, i * 16.667)));
  }
  await releaseAnimations(page, {finish: true});
  // The push is over once its screen is at rest.
  await waitForRest(card(page, 'screen-General'));
  const during = frames.filter(f => (f.cards['screen-General'] ?? 0) > 0.5);
  // The held course shows the pushed screen moving, in enough samples to
  // judge.
  expect(
    during.length,
    JSON.stringify(frames.map(f => [f.t, f.cards])),
  ).toBeGreaterThanOrEqual(6);
  for (const f of during) {
    // UIKit's bar copy is part of its screen: it moves with the card (one
    // clock and spring). It stays within 1 % of the width, as engines sample
    // rects.
    expect(
      Math.abs(f.bars['screen-General'] - f.cards['screen-General']),
      JSON.stringify(f),
    ).toBeLessThan(width * 0.01);
    expect(
      Math.abs(f.bars.root - f.cards.root),
      JSON.stringify(f),
    ).toBeLessThan(width * 0.01);
    // The glass platter is there from the first frame.
    expect(f.back?.platter ?? 0, JSON.stringify(f)).toBeGreaterThan(0.99);
  }
  // The chevron (springs.navigationBackButton 0.4 s) starts 60 ms after the
  // screens start moving (navigation.backChevronPushDelayMs), on their
  // clock: read it from where the pushed card is.
  for (const f of during) {
    const ms = screensClock(1 - f.cards['screen-General'] / width);
    const expected = crit(0.4, ms - 60);
    expect(
      Math.abs((f.back?.chevron ?? 0) - expected),
      JSON.stringify({ms: Math.round(ms), ...f.back, expected}),
    ).toBeLessThan(0.1);
  }
});

test('the back swipe from the leading edge tracks the finger and pops past half', async ({
  page,
}) => {
  const {driver, width, left, topTitle} = await openStack(page, 'pushed', {
    standalone: true,
  });
  expect(await topTitle()).toBe('About');
  const top = card(page, 'screen-About');
  const y = 400;
  const travel: {finger: number; card: number}[] = [];
  const script = drag(
    {x: left + 4, y},
    {x: left + width * 0.65, y},
    {durationMs: 600, restMs: 150},
  );
  await driver.play(script, {
    onEvent: async step => {
      const finger = step.fingers[0]?.x;
      if (finger != null) {
        travel.push({finger: finger - (left + 4), card: await translateX(top)});
      }
    },
  });
  await waitForRest(card(page, 'screen-General'));
  await expect.poll(topTitle).toBe('General');
  await expect(top).toHaveCount(0);

  // The edge pan is attached to the whole stack, an element reaching beyond
  // the edge band. So an in-band touch decides at the shared 10 px claim
  // distance. Once it has begun, the card is the finger's travel past that
  // point: 1:1.
  const tracking = travel.filter(t => t.card > 1 && t.finger < width * 0.6);
  expect(tracking.length).toBeGreaterThan(5);
  for (const t of tracking) {
    expect(Math.abs(t.card - (t.finger - 10))).toBeLessThan(2);
  }
});

test('a slow back swipe released short of half springs back', async ({
  page,
}) => {
  const {driver, width, left, topTitle} = await openStack(page, 'pushed', {
    standalone: true,
  });
  const top = card(page, 'screen-About');
  // A slow approach: little velocity at the lift, so p + 0.35·v stays short.
  await driver.play(
    drag(
      {x: left + 4, y: 400},
      {x: left + width * 0.32, y: 400},
      {
        durationMs: 2000,
        hz: 60,
      },
    ),
  );
  await waitForRest(top);
  expect(await topTitle()).toBe('About');
  expect(Math.abs(await translateX(top))).toBeLessThan(0.5);
});

test('moving back before the lift cancels the pop', async ({page}) => {
  const {driver, width, left, topTitle} = await openStack(page, 'pushed', {
    standalone: true,
  });
  const top = card(page, 'screen-About');
  const out = [
    ...drag(
      {x: left + 4, y: 400},
      {x: left + width * 0.45, y: 400},
      {
        durationMs: 450,
      },
    ),
  ];
  // Continue the same finger back 40 px before lifting.
  const lift = out.pop();
  const last = out[out.length - 1];
  const x0 = last.fingers[0].x;
  for (let i = 1; i <= 8; i++) {
    out.push({t: last.t + i * 16.7, fingers: [{id: 0, x: x0 - i * 5, y: 400}]});
  }
  out.push({t: (lift?.t ?? last.t) + 8 * 16.7 + 4, fingers: []});
  await driver.play(out);
  await waitForRest(top);
  expect(await topTitle()).toBe('About');
});

/**
 * The pan's release velocity, px/s, by Core's rule, from the moves the page
 * received (their own timestamps). It is 0.2 times the newest interval's
 * velocity plus 0.8 times the previous one's. It is 0 when the finger was
 * still for longer than 40 ms before the lift.
 */
function releaseVelocity(
  moves: readonly {t: number; x: number}[],
  upAt: number,
): number {
  const moved = moves.filter(
    (move, i) =>
      i === 0 || (move.x !== moves[i - 1].x && move.t > moves[i - 1].t),
  );
  const last = moved[moved.length - 1];
  if (moved.length < 2 || upAt - last.t > 40) {
    return 0;
  }
  const interval = (i: number) =>
    (moved[i].x - moved[i - 1].x) / ((moved[i].t - moved[i - 1].t) / 1000);
  const n = moved.length - 1;
  return n === 1 ? interval(1) : 0.2 * interval(n) + 0.8 * interval(n - 1);
}

test('brought back past its start, the screen follows with resistance, then springs back as UIKit’s does', async ({
  page,
}) => {
  // UIKit lab, iOS 26.2 simulator: past its start the screen follows the
  // finger at 0.71 of its travel. A release there returns it on a damped
  // spring (ω 16.5 rad/s, ζ 0.81) from the finger's velocity, never past
  // rest. A real-time touch driver delivers moves when it can, so the
  // velocity is judged against the moves the page received.
  const {driver, width, left} = await openStack(page, 'pushed', {
    standalone: true,
  });
  const top = card(page, 'screen-About');
  const start = {x: left + 4, y: 400};
  const far = left + width * 0.4;
  // In the page: each touch move as the page received it, and where the
  // screen stood after the stack handled it (at the window, bubbling).
  await page.evaluate(() => {
    const w = window as unknown as {
      __moves: {t: number; x: number}[];
      __pairs: {finger: number; x: number}[];
      __upAt: number | null;
    };
    w.__moves = [];
    w.__pairs = [];
    w.__upAt = null;
    const element = document.querySelector<HTMLElement>(
      '[data-navigation-screen="screen-About"]',
    );
    const read = () => {
      const x = parseFloat(
        element == null ? '' : getComputedStyle(element).translate,
      );
      return Number.isFinite(x) ? x : 0;
    };
    for (const type of ['pointerdown', 'pointermove'] as const) {
      addEventListener(
        type,
        event => {
          if (event.pointerType === 'touch') {
            w.__moves.push({t: event.timeStamp, x: event.clientX});
          }
        },
        {capture: true},
      );
    }
    addEventListener(
      'pointerup',
      event => {
        if (event.pointerType === 'touch') {
          w.__upAt = event.timeStamp;
        }
      },
      {capture: true},
    );
    addEventListener('touchmove', event => {
      const touch = event.touches[0];
      if (touch != null) {
        w.__pairs.push({finger: touch.clientX, x: read()});
      }
    });
  });
  const reset = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __moves: unknown[];
        __pairs: unknown[];
        __upAt: number | null;
      };
      w.__moves = [];
      w.__pairs = [];
      w.__upAt = null;
    });
  const recorded = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __moves: {t: number; x: number}[];
        __pairs: {finger: number; x: number}[];
        __upAt: number | null;
      };
      return {moves: w.__moves, pairs: w.__pairs, upAt: w.__upAt};
    });
  // The drag out, without its lift.
  const out = (to: number, durationMs: number) => {
    const frames = [...drag(start, {x: to, y: 400}, {durationMs})];
    frames.pop();
    return frames;
  };

  // Where the screen's start is in finger coordinates: the swipe begins
  // after its threshold, so the screen sits that far behind the finger.
  // A slow swipe to a quarter, held still, then lifted (it springs back).
  const near = left + width * 0.25;
  const hold = out(near, 900);
  const held = hold[hold.length - 1];
  for (let i = 1; i <= 8; i++) {
    hold.push({t: held.t + i * 16.7, fingers: [{id: 0, x: near, y: 400}]});
  }
  hold.push({t: held.t + 8 * 16.7 + 4, fingers: []});
  await driver.play(hold);
  await waitForRest(top);
  const calibration = await recorded();
  expect(calibration.pairs.length, 'moves reached the stack').toBeGreaterThan(
    0,
  );
  const offset =
    near - Math.max(...calibration.pairs.map(pair => pair.x)) - start.x;
  const origin = start.x + offset;

  // The measured path: back past the start at ~310 px/s, lifted 10.7 px of
  // finger after the screen crossed it.
  await reset();
  const frames = out(far, 450);
  const last = frames[frames.length - 1];
  const from = last.fingers[0].x;
  const liftX = origin - 10.7;
  const steps = Math.ceil((from - liftX) / 5.2);
  for (let i = 1; i <= steps; i++) {
    frames.push({
      t: last.t + i * 16.7,
      fingers: [{id: 0, x: Math.max(liftX, from - i * 5.2), y: 400}],
    });
  }
  frames.push({t: last.t + steps * 16.7 + 4, fingers: []});
  await driver.play(frames);
  // The return, held where it runs and read every 2 ms from its start.
  const heldAnimations = await holdAnimations(page, top, {
    judges: {target: top, property: 'translate'},
  });
  const returnIndex = await top.evaluate(element =>
    (
      (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ?? []
    ).findIndex(animation => {
      const effect = animation.effect as KeyframeEffect | null;
      return (
        effect?.target === element &&
        effect.pseudoElement == null &&
        effect
          .getKeyframes()
          .some(frame => 'translate' in frame || 'transform' in frame)
      );
    }),
  );
  const returned = heldAnimations.find(item => item.index === returnIndex);
  expect(returned, 'the release starts the return').toBeDefined();
  const times = Array.from(
    {length: 201},
    (_, i) => (returned?.offsetMs ?? 0) + i * 2,
  );
  const xs = (await sampleCurve(top, times)).map(
    sample => sample.transform.translateX,
  );
  await releaseAnimations(page);
  const {moves, pairs, upAt} = await recorded();

  // Past its start, the screen followed the finger at 0.71 of its travel.
  const past = pairs
    .map(pair => ({d: pair.finger - origin, x: pair.x}))
    .filter(pair => pair.d < -2);
  const slope =
    past.reduce((sum, pair) => sum + pair.d * pair.x, 0) /
    past.reduce((sum, pair) => sum + pair.d * pair.d, 0);
  // UIKit's damped spring from where the screen stood at the lift, with the
  // velocity fitted to the curve (it enters linearly).
  const omega = (2 * Math.PI) / 0.381;
  const zeta = 0.81;
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  const x0 = xs[0];
  const at = (i: number) => {
    const t = (i * 2) / 1000;
    const decay = Math.exp(-zeta * omega * t);
    return {
      rest:
        decay *
        (x0 * Math.cos(damped * t) +
          ((zeta * omega * x0) / damped) * Math.sin(damped * t)),
      perVelocity: (decay * Math.sin(damped * t)) / damped,
    };
  };
  const v0 =
    xs.reduce((sum, x, i) => sum + (x - at(i).rest) * at(i).perVelocity, 0) /
    xs.reduce((sum, _, i) => sum + at(i).perVelocity ** 2, 0);
  const off = Math.max(
    ...xs.map((x, i) => Math.abs(x - (at(i).rest + v0 * at(i).perVelocity))),
  );
  const expected = releaseVelocity(moves, upAt ?? Infinity);
  const detail = JSON.stringify({
    offset,
    past,
    slope,
    x0,
    v0,
    expected,
    off,
    moves: moves.slice(-6).map(move => [Math.round(move.t), move.x]),
    upAt,
    xs: xs.filter((_, i) => i % 10 === 0).map(x => Math.round(x * 10) / 10),
  });
  // Present: moves past the start, a lift, and a return from behind rest.
  expect(past.length, detail).toBeGreaterThanOrEqual(2);
  expect(upAt, detail).not.toBeNull();
  expect(x0, detail).toBeLessThan(-2);
  expect(slope, detail).toBeGreaterThan(0.71 - 0.08);
  expect(slope, detail).toBeLessThan(0.71 + 0.08);
  // The return is UIKit's spring to within half a pixel, from the velocity
  // the received moves give by Core's rule.
  expect(off, detail).toBeLessThan(0.5);
  expect(v0 / expected, detail).toBeGreaterThan(0.85);
  expect(v0 / expected, detail).toBeLessThan(1.15);
  // Never past rest, and at rest once it ends.
  expect(Math.max(...xs), detail).toBeLessThan(0.5);
  await waitForRest(top);
  expect(Math.abs(await translateX(top))).toBeLessThan(0.5);
});

test('a fast swipe that rests before the lift springs back: a still finger never flicks', async ({
  page,
}) => {
  // The pan's release velocity reads 0 once the finger has rested, so the
  // release decides by its travel alone, short of half.
  const {driver, width, left, topTitle} = await openStack(page, 'pushed', {
    standalone: true,
  });
  const top = card(page, 'screen-About');
  await driver.play(
    drag(
      {x: left + 4, y: 400},
      {x: left + width * 0.42, y: 400},
      {
        durationMs: 400,
        restMs: 300,
      },
    ),
  );
  await waitForRest(top);
  expect(await topTitle()).toBe('About');
  expect(Math.abs(await translateX(top))).toBeLessThan(0.5);
});

/**
 * A flick from near the leading edge. Given `busyLiftMs`, a page pointerup
 * listener works that long, as a busy app's: WebKit stamps the lift's
 * touchend after it. The pop must finish.
 */
async function flickFromTheEdge(page: Page, busyLiftMs?: number) {
  const {driver, left, topTitle} = await openStack(page, 'pushed', {
    standalone: true,
  });
  if (busyLiftMs != null) {
    await page.evaluate(spin => {
      addEventListener('pointerup', () => {
        const end = performance.now() + spin;
        while (performance.now() < end) {
          // The listener's own work.
        }
      });
    }, busyLiftMs);
  }
  // ~60 px of travel at ~1200 px/s: p + 0.35·v is well past half.
  const script = flick({x: left + 6, y: 400}, {velocity: {x: 1200, y: 0}});
  // With the page's frames, so a starved runner's late move reads as such.
  const run = await armInputRun(page, TOUCH_INPUT_TYPES, {frames: true});
  // The page reads the release from when the moves arrive: pace on spacing.
  await driver.play(script, {pacing: 'spacing'});
  await waitForRest(card(page, 'screen-General'));
  try {
    await expect.poll(topTitle).toBe('General');
  } catch (error) {
    // A starved runner delivers the moves late, so the page reads a release
    // far from the script's. Past half of it, the run did not deliver the
    // flick this test describes. It fails by name. It is the page's when its
    // own listeners held a move. It is the starved runner's when the page drew
    // no frame across the late gap.
    const record = await run.evaluate(recorded => {
      recorded.stop();
      return {
        eventTypes: recorded.eventTypes.slice(),
        pointerTypes: recorded.pointerTypes.slice(),
        stamps: recorded.stamps.slice(),
        handledAt: recorded.handledAt.slice(),
        frames: recorded.frames.slice(),
      };
    });
    const steps = toTouchEvents(script);
    const arrivals = touchArrivalsFrom(record);
    const fault = touchPacingFault(steps, arrivals, 0.5);
    if (fault != null) {
      throw touchPlayError(steps, arrivals, fault, [], record.frames);
    }
    throw error;
  }
}

test('a flick from near the edge finishes the pop', async ({page}) => {
  await flickFromTheEdge(page);
});

test('a flick from near the edge finishes the pop when a page pointerup listener holds its lift', async ({
  page,
}) => {
  await flickFromTheEdge(page, 50);
});

test('in a browser tab the leading screen edge stays the browser’s', async ({
  page,
}) => {
  // Not a home-screen app: a swipe from the edge band is the browser's back
  // swipe, so the stack neither tracks nor pops.
  const {driver, width, left, topTitle} = await openStack(page, 'pushed');
  const top = card(page, 'screen-About');
  let moved = 0;
  await driver.play(
    drag(
      {x: left + 4, y: 400},
      {x: left + width * 0.7, y: 400},
      {
        durationMs: 400,
        restMs: 120,
      },
    ),
    {
      onEvent: async () => {
        moved = Math.max(moved, Math.abs(await translateX(top)));
      },
    },
  );
  await page.waitForTimeout(300);
  expect(moved).toBe(0);
  expect(await topTitle()).toBe('About');
});

test('a sideways drag in the content pops (iOS 26’s full-width back swipe)', async ({
  page,
}) => {
  const {driver, width, left, topTitle} = await openStack(page, 'pushed');
  await driver.play(
    drag(
      {x: left + width * 0.3, y: 500},
      {x: left + width * 0.98, y: 500},
      {
        durationMs: 500,
        restMs: 150,
      },
    ),
  );
  await waitForRest(card(page, 'screen-General'));
  await expect.poll(topTitle).toBe('General');
});

/**
 * Marks screen `key`'s card as it mounts, with the chip `markElement` draws.
 * The marker then paints in the push's first frame, before a block that the
 * page starts a frame later.
 */
async function markScreenOnMount(page: Page, key: string, inset: number) {
  await page.evaluate(
    ({screen, offset, rgb}) => {
      const selector = `[data-navigation-screen="${screen}"]`;
      const observer = new MutationObserver(() => {
        const element = document.querySelector<HTMLElement>(selector);
        if (element == null) {
          return;
        }
        observer.disconnect();
        if (getComputedStyle(element).position === 'static') {
          element.style.position = 'relative';
        }
        const chip = document.createElement('div');
        chip.setAttribute('aria-hidden', 'true');
        chip.style.cssText = `position:absolute;top:${offset}px;left:${offset}px;width:16px;height:16px;background:rgb(${rgb.join(',')});z-index:2147483647;pointer-events:none;`;
        element.append(chip);
      });
      observer.observe(document.body, {childList: true, subtree: true});
    },
    {screen: key, offset: inset, rgb: [...MARKER_RGB]},
  );
}

/**
 * Blocks the main thread from inside a push from the root, for `ms`. Call it
 * before the action and await it after. The page then waits from before the
 * push, and blocks once the covered screen's bar has run a frame. That bar
 * rides the push from its first frame, and nothing else animates in it. So
 * the row's own release fade cannot start the block before the push.
 */
function blockDuringPush(page: Page, ms: number) {
  return blockMainThread(page, ms, {
    during: page.locator('[data-navigation-bar="root"]'),
    minProgressMs: 16,
  });
}

test('a push keeps advancing every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright (WebKit: the iOS simulator)',
  );
  const {driver} = await openStack(page, 'settings');
  const top = card(page, 'screen-General');
  // The compositor's own pace on this machine, from the same screencast.
  await startBusyControl(page);
  const cast = await startScreencast(page);
  const watch = await watchAnimations(top);
  // Below the bar, which overlays the screens.
  await markScreenOnMount(page, 'screen-General', 60);
  const row = await rowCenter(page, 'General');
  const blocked = blockDuringPush(page, 600);
  await driver.tap(row);
  const block = await blocked;
  const [push] = await watch.started({minProgressMs: 16});
  await page.waitForTimeout(150);
  const castFrames = await cast.stop();
  const [tracked, control] = await trackMarkers(page, castFrames, {
    colors: [MARKER_RGB, CONTROL_RGB],
  });
  const proof = busyWindowProof(
    tracked,
    {from: block.from, to: Math.min(block.to, push.to)},
    // The screencast resolves whole CSS pixels at both ends of the spring's
    // sub-pixel tail. The last frame can round one pixel away from a tail
    // frame that is still within a pixel of rest. So "settled" is 2 px.
    {axis: 'x', settledWithin: 2, control},
  );
  await writeEvidence(
    'busy-main-thread/navigationstack-push',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {block, push, proof},
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'navigationstack-push-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: Math.min(block.to, push.to) + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({x: tracked.find(f => f.t === t)?.box?.x ?? -1}),
  });
  await film.write(testInfo, {block, push});
  // The harness verdict judges each frame the control moved on (a stall,
  // the frames that moved, a window with nothing to judge). The test asserts
  // no absolute frame interval or count here.
  expect(proof.verdict.failures, proof.summary).toEqual([]);
});

// With a mouse the bars are opaque: the incoming one covers the old title.
// Under a finger iOS 26's bars are clear (NavigationStackScrollEdge's proofs)
// and the incoming screen cuts the old title instead (the next test).
test('with a mouse, the incoming bar covers the old title while the main thread is blocked', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright (WebKit: the iOS simulator rig)',
  );
  const {context, page} = await newFinePage(browser);
  try {
    await openStack(page, 'settings', {pointer: 'mouse'});
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    // A marker at the trailing end of the root's title: the pushed screen's
    // opaque bar slides over it on the compositor.
    await page.locator('[data-navigation-bar="root"] h2').evaluate(title => {
      const element = title as HTMLElement;
      element.style.position = 'relative';
      const chip = document.createElement('div');
      chip.setAttribute('aria-hidden', 'true');
      chip.style.cssText =
        'position:absolute;top:4px;right:0;width:10px;height:10px;background:rgb(255,0,255);pointer-events:none;';
      element.append(chip);
    });
    const cast = await startScreencast(page);
    const row = await rowCenter(page, 'General');
    // The block outlasts the push, whose spring is at rest by about 0.45 s.
    const blocked = blockDuringPush(page, 900);
    await page.mouse.click(row.x, row.y);
    const block = await blocked;
    await page.waitForTimeout(150);
    const frames = await cast.stop();
    const tracked = await trackMarker(page, frames);
    const trace = JSON.stringify(
      tracked.map(f => [Math.round(f.t - block.from), f.box?.x ?? null]),
    );
    const during = titleFramesInBlock(tracked, block);
    // Seen while blocked, then covered before the block ends.
    expect(
      during.some(f => f.box != null),
      trace,
    ).toBe(true);
    expect(during.at(-1)?.box ?? null, trace).toBeNull();
  } finally {
    await context.close();
  }
});

/**
 * The screencast frames inside the block, once the block has caught the
 * title. A block cannot begin before the push's first frame, and a page that
 * is starved of frames begins it late. When the push had already covered the
 * title, the window holds nothing to judge, and the run fails by name. A
 * frame by the block's start shows the title gone, or the block's first frame
 * does, within `FRAME_STARVATION_MS`. A push that froze presents no frame that
 * early, so it fails on the assertion. The numbers come from the frames.
 */
function titleFramesInBlock(
  tracked: readonly TrackedFrame[],
  block: BlockedWindow,
): TrackedFrame[] {
  const during = tracked.filter(f => f.t > block.from && f.t < block.to - 20);
  const lastSeen = tracked.filter(f => f.box != null).at(-1);
  const firstInBlock = tracked.find(f => f.t > block.from);
  const goneAtStart =
    lastSeen != null &&
    lastSeen.t <= block.from &&
    (tracked.some(
      f => f.box == null && f.t > lastSeen.t && f.t <= block.from,
    ) ||
      (firstInBlock?.box === null &&
        firstInBlock.t - block.from <= FRAME_STARVATION_MS));
  if (!during.some(f => f.box != null) && lastSeen != null && goneAtStart) {
    // The title rides the covered bar, so its first move is the push's
    // first frame.
    const restX = tracked.find(f => f.box != null)?.box?.x ?? 0;
    const moved =
      tracked.find(f => f.box == null || Math.abs(f.box.x - restX) >= 1) ??
      lastSeen;
    const pushBeforeBlockMs = block.from - moved.t;
    const lastSeenBeforeBlockMs = block.from - lastSeen.t;
    const pushFrame =
      pushBeforeBlockMs >= 0
        ? `${pushBeforeBlockMs.toFixed(0)} ms before`
        : `${(-pushBeforeBlockMs).toFixed(0)} ms after`;
    throw new BusyWindowTooLateError(
      `the push's first frame came ${pushFrame} the block began, and the title was last seen ${lastSeenBeforeBlockMs.toFixed(0)} ms before it: the push had covered the title by the block's first frame, so the block holds nothing to judge`,
      {pushBeforeBlockMs, lastSeenBeforeBlockMs},
    );
  }
  return during;
}

/**
 * How much of bar `key` its clip box shows inside the stack. It is a
 * fraction of the stack's width, rounded to 0.01: 0 cut away, 1 whole.
 */
async function readCut(page: Page, key: string) {
  return page.evaluate(k => {
    const stack = document
      .querySelector('[data-testid="navigation-stack"]')
      ?.getBoundingClientRect();
    const box = document
      .querySelector(`[data-navigation-bar="${k}"]`)
      ?.firstElementChild?.getBoundingClientRect();
    if (stack == null || box == null) {
      return {shown: -1};
    }
    const shown =
      Math.max(
        0,
        Math.min(box.right, stack.right) - Math.max(box.left, stack.left),
      ) / stack.width;
    return {shown: Math.round(shown * 100) / 100};
  }, key);
}

// Under a finger iOS 26's bars are clear, and the bar a card covers is cut
// at that card's leading edge. So the incoming screen still hides the title
// it slides over, even while the main thread is blocked.
test('under a finger, the incoming screen cuts the old title while the main thread is blocked', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright (WebKit: the iOS simulator)',
  );
  const {driver} = await openStack(page, 'settings');
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  await page.locator('[data-navigation-bar="root"] h2').evaluate(title => {
    const element = title as HTMLElement;
    element.style.position = 'relative';
    const chip = document.createElement('div');
    chip.setAttribute('aria-hidden', 'true');
    chip.style.cssText =
      'position:absolute;top:4px;right:0;width:10px;height:10px;background:rgb(255,0,255);pointer-events:none;';
    element.append(chip);
  });
  const cast = await startScreencast(page);
  const row = await rowCenter(page, 'General');
  // The block outlasts the push, whose spring is at rest by about 0.45 s.
  const blocked = blockDuringPush(page, 900);
  await driver.tap(row);
  const block = await blocked;
  await page.waitForTimeout(150);
  const frames = await cast.stop();
  const tracked = await trackMarker(page, frames);
  const trace = JSON.stringify(
    tracked.map(f => [Math.round(f.t - block.from), f.box?.x ?? null]),
  );
  const during = titleFramesInBlock(tracked, block);
  // Seen while blocked, then cut before the block ends.
  expect(
    during.some(f => f.box != null),
    trace,
  ).toBe(true);
  expect(during.at(-1)?.box ?? null, trace).toBeNull();
});

test('under a finger the cut rides the incoming card’s leading edge', async ({
  page,
}) => {
  // The page clock a freeze needs, installed before the story loads.
  await installPageFreeze(page);
  const {driver, width} = await openStack(page, 'settings');
  await installTimerGate(page);
  const row = await rowCenter(page, 'General');
  // Through the push the root's bar shows only left of the incoming card:
  // the cut and the card's edge move on one spring.
  const samples = await cutAcrossPush(page, () => driver.tap(row), {
    covered: 'root',
    incoming: 'screen-General',
    direction: 'ltr',
  });
  expectCutOnCardEdge(samples, width);
  await waitForRest(card(page, 'screen-General'));
  expect(await readCut(page, 'root')).toEqual({shown: 0});
  expect(await readCut(page, 'screen-General')).toEqual({shown: 1});
});

test('under a finger in a right-to-left stack, the cut mirrors', async ({
  page,
}) => {
  await installPageFreeze(page);
  const {driver, width} = await openStack(page, 'settings');
  await installTimerGate(page);
  await page
    .getByTestId('navigation-stack')
    .evaluate(element => element.setAttribute('dir', 'rtl'));
  const row = await rowCenter(page, 'General');
  // The incoming card enters from the left: the root's bar shows only right
  // of the card's leading edge.
  const samples = await cutAcrossPush(page, () => driver.tap(row), {
    covered: 'root',
    incoming: 'screen-General',
    direction: 'rtl',
  });
  expectCutOnCardEdge(samples, width);
  await waitForRest(card(page, 'screen-General'));
  expect(await readCut(page, 'root')).toEqual({shown: 0});
  expect(await readCut(page, 'screen-General')).toEqual({shown: 1});
});

test('a pointer that turns fine after a push leaves the revealed bar whole', async ({
  page,
}) => {
  // A tablet that picks up a trackpad. The push runs under a finger, which
  // cuts the root's bar away. Then the pointer is fine and Back pops at once.
  const {driver} = await openStack(page, 'settings');
  await driver.tap(await rowCenter(page, 'General'));
  await waitForRest(card(page, 'screen-General'));
  expect(await readCut(page, 'root')).toEqual({shown: 0});
  await page.evaluate(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.replace(/\s/g, '') === '(pointer:coarse)'
        ? matchMedia('(max-width: 0px)')
        : matchMedia(query);
  });
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  await page.locator('[data-navigation-back]').click();
  await expect(card(page, 'screen-General')).toHaveCount(0);
  await waitForRest(card(page, 'root'));
  expect(await readCut(page, 'root')).toEqual({shown: 1});
});

test('a pointer that turns coarse while a screen is covered cuts the covered bar away', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Only Chromium turns the primary pointer coarse mid-test (touch emulation).',
  );
  // A tablet that loses its mouse. The push runs under a mouse, so the root's
  // bar stays whole under the opaque top bar. Then the pointer turns coarse:
  // the bars clear, and the covered bar is cut away at once.
  const {context, page} = await newFinePage(browser);
  try {
    await openStack(page, 'settings', {pointer: 'mouse'});
    const row = await rowCenter(page, 'General');
    await page.mouse.click(row.x, row.y);
    await waitForRest(card(page, 'screen-General'));
    // The root's bar is there and laid out, and whole at the parallax.
    const title = page.locator('[data-navigation-bar="root"] h2');
    expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
    expect((await readCut(page, 'root')).shown).toBeGreaterThan(0.5);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    await expect
      .poll(() => page.evaluate(() => matchMedia('(pointer: coarse)').matches))
      .toBe(true);
    await expect.poll(() => readCut(page, 'root')).toEqual({shown: 0});
    expect(await readCut(page, 'screen-General')).toEqual({shown: 1});
  } finally {
    await context.close();
  }
});

test('under a finger, a pop that reveals a screen two levels down leaves its bar cut away', async ({
  page,
}) => {
  // The story opens two screens deep, so the root's bar mounts under General
  // only once the pop is over.
  await openStack(page, 'pushed');
  await page.locator('[data-navigation-back]').click();
  await expect(card(page, 'screen-About')).toHaveCount(0);
  await waitForRest(card(page, 'screen-General'));
  // The root's bar is there and laid out, so its cut is a real reading.
  await expect(page.locator('[data-navigation-bar="root"]')).toHaveCount(1);
  const box = await page
    .locator('[data-navigation-bar="root"] h2')
    .boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(await readCut(page, 'root')).toEqual({shown: 0});
  expect(await readCut(page, 'screen-General')).toEqual({shown: 1});
});

test('under a finger, Back reveals the covered bar whole', async ({page}) => {
  const {driver} = await openStack(page, 'settings');
  await driver.tap(await rowCenter(page, 'General'));
  await waitForRest(card(page, 'screen-General'));
  expect(await readCut(page, 'root')).toEqual({shown: 0});
  const back = await page.locator('[data-navigation-back]').boundingBox();
  if (back == null) {
    throw new Error('no back button');
  }
  await driver.tap({x: back.x + back.width / 2, y: back.y + back.height / 2});
  await expect(card(page, 'screen-General')).toHaveCount(0);
  await waitForRest(card(page, 'root'));
  expect(await readCut(page, 'root')).toEqual({shown: 1});
});

test('under a mouse a drag across the content pops, as a finger’s does', async ({
  browser,
}) => {
  // Gestures attach for every pointer: a mouse drag across the content is
  // the content swipe, tracked and released as a finger's. The edge swipe
  // stays a finger's (the screen-edge pan's default).
  const {context, page} = await newFinePage(browser);
  try {
    const {left, width} = await openStack(page, 'pushed', {
      standalone: true,
      pointer: 'mouse',
    });
    const top = card(page, 'screen-About');
    await page.mouse.move(left + width * 0.3, 400);
    await page.mouse.down();
    await page.mouse.move(left + width * 0.95, 400, {steps: 30});
    await page.mouse.up();
    await expect(top).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('a finger swipes back on an engine that is not iOS WebKit (one touch model)', async ({
  page,
}) => {
  const {driver, left, width} = await openStack(page, 'pushed');
  // Neither Playwright engine implements -webkit-touch-callout (iOS WebKit
  // only): the swipe does not depend on it.
  expect(
    await page.evaluate(() => CSS.supports('-webkit-touch-callout', 'none')),
  ).toBe(false);
  await driver.play(
    drag(
      {x: left + width * 0.3, y: 420},
      {x: left + width * 0.9, y: 420},
      {durationMs: 300},
    ),
  );
  await expect(card(page, 'screen-About')).toHaveCount(0);
});

test.describe('the bars ride with their screens, as UIKit’s', () => {
  test('a programmatic pop rides the revealed bar in from its parallax and the leaving one out', async ({
    page,
  }) => {
    const {driver, stack, width} = await openStack(page, 'settings');
    await driver.tap(await rowCenter(page, 'General'));
    await waitForRest(card(page, 'screen-General'));
    await installBarReader(page);
    // The pointer comes to rest on the button first, so the hold cannot take
    // a hover run in place of the pop.
    const back = page.locator('[data-navigation-back]');
    await back.hover();
    await waitForRest(back);
    // Every layer of the pop is held, then read at one timeline time. Two
    // reads in one live frame can fall on two engine times on a busy runner.
    // A split read looks like layers out of step.
    const hold = await armHold(page, stack, {
      judges: [
        {target: card(page, 'screen-General'), property: 'translate'},
        {target: card(page, 'root'), property: 'translate'},
        {target: bar(page, 'screen-General'), property: 'translate'},
        {target: bar(page, 'root'), property: 'translate'},
        {target: back.locator(':scope > *').first(), property: 'opacity'},
      ],
      count: 5,
      newOnly: true,
    });
    await back.click();
    await hold.held();
    const frames: BarFrame[] = [];
    for (let i = 0; i <= 36; i++) {
      frames.push(
        await readBarsAt(page, await seekAnimations(page, i * 16.667)),
      );
    }
    await releaseAnimations(page, {finish: true});
    // The pop is over once its back button leaves, within the 900 ms the
    // live trace gave it.
    await expect(back).toHaveCount(0, {timeout: 900});
    const moving = frames.filter(
      f =>
        f.cards['screen-General'] != null &&
        f.cards['screen-General'] > 0.5 &&
        f.cards.root < -0.5,
    );
    // The held course shows both screens moving, in enough samples to judge.
    expect(
      moving.length,
      JSON.stringify(frames.map(f => [f.t, f.cards])),
    ).toBeGreaterThanOrEqual(6);
    for (const f of moving) {
      expect(
        Math.abs(f.bars['screen-General'] - f.cards['screen-General']),
        JSON.stringify(f),
      ).toBeLessThan(width * 0.01);
      expect(
        Math.abs(f.bars.root - f.cards.root),
        JSON.stringify(f),
      ).toBeLessThan(width * 0.01);
      // The chevron fades out at once on the 0.4 s spring, on the screens'
      // clock; the platter stays until the screen has left.
      const ms = screensClock(f.cards['screen-General'] / width);
      expect(f.back?.platter ?? 0, JSON.stringify(f)).toBeGreaterThan(0.99);
      expect(
        Math.abs((f.back?.chevron ?? 0) - (1 - crit(0.4, ms))),
        JSON.stringify({ms: Math.round(ms), ...f.back}),
      ).toBeLessThan(0.1);
    }
  });

  test('a back swipe holds the revealed bar still while the top one follows the finger', async ({
    page,
  }) => {
    const {driver, width, left} = await openStack(page, 'pushed');
    const stop = await traceBars(page);
    await driver.play(
      drag(
        {x: left + width * 0.3, y: 420},
        {x: left + width * 0.7, y: 420},
        {durationMs: 1000, restMs: 300},
      ),
    );
    await page.waitForTimeout(1200);
    const frames = await stop();
    const swiping = frames.filter(f => (f.cards['screen-About'] ?? 0) > 0.5);
    expect(swiping.filter(f => !f.animating).length).toBeGreaterThan(10);
    for (const f of swiping) {
      // Within a pixel while the finger drives both layers. Through the
      // release's spring back, the other bar proofs' 1 % of the width. In a
      // late frame WebKit evaluates two layers on one clock about a
      // millisecond apart.
      expect(
        Math.abs(f.bars['screen-About'] - f.cards['screen-About']),
        JSON.stringify(f),
      ).toBeLessThan(f.animating ? width * 0.01 : 1);
      // UIKit's revealed title stays centred while its screen slides in.
      expect(
        Math.abs(f.bars['screen-General']),
        JSON.stringify(f),
      ).toBeLessThan(0.5);
      // The back button does not follow a finger: full opacity throughout.
      expect(f.back?.chevron ?? 0, JSON.stringify(f)).toBeGreaterThan(0.99);
    }
  });

  test('with a mouse, each bar is opaque and stacks over the one it covers', async ({
    browser,
  }) => {
    const {context, page} = await newFinePage(browser);
    try {
      await openStack(page, 'settings', {pointer: 'mouse'});
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const row = await rowCenter(page, 'General');
      await page.mouse.click(row.x, row.y);
      await waitForRest(card(page, 'screen-General'));
      const bars = await page.evaluate(() =>
        [...document.querySelectorAll('[data-navigation-bar]')].map(bar => ({
          key: bar.getAttribute('data-navigation-bar'),
          // Each layer paints its opaque background on its own element.
          background: getComputedStyle(
            bar.querySelector('[data-navigation-bar-background]') ?? bar,
          ).backgroundColor,
        })),
      );
      expect(bars.map(bar => bar.key)).toEqual(['root', 'screen-General']);
      for (const bar of bars) {
        // An rgb() colour has no alpha; rgba(…, 0) would let the title show.
        expect(bar.background, JSON.stringify(bar)).toMatch(/^rgb\(/);
      }
    } finally {
      await context.close();
    }
  });

  test('under a finger each bar is clear, and the covered one cut away at rest', async ({
    page,
  }) => {
    const {driver} = await openStack(page, 'settings');
    await driver.tap(await rowCenter(page, 'General'));
    await waitForRest(card(page, 'screen-General'));
    const bars = await page.evaluate(() =>
      [...document.querySelectorAll('[data-navigation-bar-background]')].map(
        background => getComputedStyle(background).backgroundColor,
      ),
    );
    expect(bars).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
    // iOS 26 cuts the covered screen's bar at the top card's leading edge.
    // At rest nothing of it shows, and the top bar is whole.
    expect(await readCut(page, 'root')).toEqual({shown: 0});
    expect(await readCut(page, 'screen-General')).toEqual({shown: 1});
  });

  test('the covered bar’s dimming ends above the bar’s hairline', async ({
    page,
  }) => {
    const {driver} = await openStack(page, 'settings');
    await driver.tap(await rowCenter(page, 'General'));
    await waitForRest(card(page, 'screen-General'));
    // The hairline is the bar's bottom pixel, which the layers' backgrounds
    // leave uncovered. Each layer's dimming sits in its cut row.
    const layers = await page.evaluate(() =>
      [...document.querySelectorAll('[data-navigation-bar]')].map(bar => ({
        key: bar.getAttribute('data-navigation-bar'),
        bottom: bar.getBoundingClientRect().bottom,
        dimBottom:
          bar
            .querySelector('[data-navigation-bar-dim]')
            ?.getBoundingClientRect().bottom ?? NaN,
      })),
    );
    expect(layers.map(layer => layer.key)).toEqual(['root', 'screen-General']);
    for (const layer of layers) {
      expect(layer.dimBottom, JSON.stringify(layer)).toBeLessThanOrEqual(
        layer.bottom - 1 + 0.01,
      );
    }
  });
});

test.describe('edge cases', () => {
  test('a keyboard Back returns focus to the row that pushed', async ({
    browser,
  }) => {
    const {context, page} = await newFinePage(browser);
    try {
      await openStack(page, 'settings', {pointer: 'mouse'});
      const general = page.getByRole('button', {name: 'General'}).first();
      await general.focus();
      await page.keyboard.press('Enter');
      await waitForRest(card(page, 'screen-General'));
      await page.locator('[data-navigation-back]').focus();
      await page.keyboard.press('Enter');
      await expect(card(page, 'screen-General')).toHaveCount(0);
      await waitForRest(card(page, 'root'));
      // Focus is on the General row itself, not left on the page body.
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const active = document.activeElement;
            return active == null || active === document.body
              ? 'body'
              : (active
                  .closest('li, button, [role="button"]')
                  ?.textContent?.trim() ?? active.tagName);
          }),
        )
        .toBe('General');
    } finally {
      await context.close();
    }
  });

  test('a click on a row’s text returns focus to the row after Back', async ({
    browser,
  }) => {
    const {context, page} = await newFinePage(browser);
    try {
      await openStack(page, 'settings', {pointer: 'mouse'});
      // The press lands on the row's label, inside its button.
      await page
        .getByRole('button', {name: 'General'})
        .first()
        .getByText('General', {exact: true})
        .click();
      await waitForRest(card(page, 'screen-General'));
      await page.locator('[data-navigation-back]').click();
      await expect(card(page, 'screen-General')).toHaveCount(0);
      await waitForRest(card(page, 'root'));
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const active = document.activeElement;
            return active == null || active === document.body
              ? 'body'
              : (active
                  .closest('li, button, [role="button"]')
                  ?.textContent?.trim() ?? active.tagName);
          }),
        )
        .toBe('General');
    } finally {
      await context.close();
    }
  });

  test('inside the content swipe’s dead zone the screen holds still', async ({
    page,
  }) => {
    const {driver, width, left} = await openStack(page, 'pushed');
    const top = card(page, 'screen-About');
    const from = {x: left + width * 0.3, y: 500};
    // Past the pan's claim, short of the 27 px the content swipe moves at.
    const frames = [
      ...drag(from, {x: from.x + 20, y: from.y}, {durationMs: 300}),
    ];
    const lift = frames.pop();
    const held = frames[frames.length - 1];
    for (let i = 1; i <= 4; i++) {
      frames.push({
        t: held.t + i * 16.7,
        fingers: [{id: 0, x: from.x + 20, y: from.y}],
      });
    }
    // The lift comes after the hold; from there the screen rests again.
    if (lift != null) {
      frames.push({...lift, t: held.t + 5 * 16.7});
    }
    const xs: number[] = [];
    await driver.play(frames, {
      onEvent: async () => {
        xs.push(await translateX(top));
      },
    });
    await waitForRest(top);
    expect(xs.length, JSON.stringify(xs)).toBeGreaterThan(5);
    // Never against the finger: a screen pulled back would read below 0.
    expect(Math.min(...xs), JSON.stringify(xs)).toBeGreaterThan(-0.5);
  });

  test('after the writing direction changes, the content swipe pops the new way', async ({
    page,
  }) => {
    const {driver, width, left, topTitle} = await openStack(page, 'pushed');
    // The stack turns right-to-left while mounted.
    const stack = page.getByTestId('navigation-stack');
    await stack.evaluate(element => element.setAttribute('dir', 'rtl'));
    expect(
      await stack.evaluate(element => getComputedStyle(element).direction),
    ).toBe('rtl');
    await driver.play(
      drag(
        {x: left + width * 0.7, y: 500},
        {x: left + width * 0.02, y: 500},
        {durationMs: 500, restMs: 150},
      ),
    );
    await waitForRest(card(page, 'screen-General'));
    await expect.poll(topTitle).toBe('General');
  });

  test('in a browser tab a mouse drag from the leading edge band still pops', async ({
    browser,
  }) => {
    // Only a finger's swipe from the band is the browser's back swipe.
    const {context, page} = await newFinePage(browser);
    try {
      const {left, width} = await openStack(page, 'pushed', {
        pointer: 'mouse',
      });
      const top = card(page, 'screen-About');
      await page.mouse.move(left + 4, 400);
      await page.mouse.down();
      await page.mouse.move(left + width * 0.95, 400, {steps: 30});
      await page.mouse.up();
      await expect(top).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('after a keyboard push the focused title shows the focus indicator', async ({
    browser,
  }) => {
    const {context, page} = await newFinePage(browser);
    try {
      await openStack(page, 'settings', {pointer: 'mouse'});
      await page.getByRole('button', {name: 'General'}).first().focus();
      await page.keyboard.press('Enter');
      await waitForRest(card(page, 'screen-General'));
      const title = page.locator('[data-navigation-bar="screen-General"] h2');
      await expect(title).toBeFocused();
      const ring = await title.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          visible: element.matches(':focus-visible'),
          outline: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
          shadow: style.boxShadow,
        };
      });
      expect(ring.visible).toBe(true);
      // An outline or a ring shadow: something shows where focus is.
      expect(
        (ring.outline !== 'none' && ring.width > 0) || ring.shadow !== 'none',
        JSON.stringify(ring),
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('after a tap push the focused title shows no focus ring', async ({
    page,
  }) => {
    const {driver} = await openStack(page, 'settings');
    await driver.tap(await rowCenter(page, 'General'));
    await waitForRest(card(page, 'screen-General'));
    const title = page.locator('[data-navigation-bar="screen-General"] h2');
    await expect(title).toBeFocused();
    // Programmatic focus after pointer input keeps the pointer's modality:
    // no ring.
    expect(
      await title.evaluate(element => element.matches(':focus-visible')),
    ).toBe(false);
  });

  test('after a pop the screen underneath keeps its content and its bar', async ({
    page,
  }) => {
    const {driver} = await openStack(page, 'pushed');
    await page.locator('[data-navigation-back]').click();
    await waitForRest(card(page, 'screen-General'));
    await expect(card(page, 'screen-About')).toHaveCount(0);
    // General is on top; the root lies under it, ready for a back swipe.
    const root = await card(page, 'root').evaluate(
      element => getComputedStyle(element).contentVisibility,
    );
    expect(root).not.toBe('hidden');
    await expect(page.locator('[data-navigation-bar="root"]')).toHaveCount(1);
    void driver;
  });

  test('a push during a running push slides the new screen in', async ({
    page,
  }) => {
    const {driver, width} = await openStack(page, 'settings');
    await driver.tap(await rowCenter(page, 'General'));
    await page.waitForTimeout(80);
    const stop = await traceBars(page);
    const about = await page
      .locator('[data-navigation-screen="screen-General"]')
      .getByRole('button', {name: 'About'})
      .boundingBox();
    if (about == null) {
      throw new Error('no About row');
    }
    await driver.tap({
      x: about.x + about.width / 2,
      y: about.y + about.height / 2,
    });
    await page.waitForTimeout(700);
    const frames = await stop();
    const firstAt = frames.findIndex(f => f.cards['screen-About'] != null);
    const first = firstAt >= 0 ? frames[firstAt] : undefined;
    // A lone push starts the card off screen: so does one that interrupts.
    // Its first frame shows that, unless the page drew none for a while as
    // the push began: such a run fails by name.
    const gapMs = firstAt > 0 ? frames[firstAt].t - frames[firstAt - 1].t : 0;
    if (
      firstAt >= 0 &&
      (first?.cards['screen-About'] ?? 0) <= width * 0.5 &&
      gapMs > FRAME_STARVATION_MS
    ) {
      throw new FrameStarvationError({
        during: 'the interrupting push’s card was still off screen',
        frames: 0,
        min: 1,
        longestGapMs: gapMs,
      });
    }
    expect(
      first?.cards['screen-About'] ?? 0,
      JSON.stringify(first),
    ).toBeGreaterThan(width * 0.5);
    // Under a finger both end at rest. The screen below is cut away, so the
    // root's bar is no longer rendered, and the top bar is whole.
    await waitForRest(card(page, 'screen-About'));
    expect(await page.locator('[data-navigation-bar="root"]').count()).toBe(0);
    expect(await readCut(page, 'screen-General')).toEqual({shown: 0});
    expect(await readCut(page, 'screen-About')).toEqual({shown: 1});
  });

  test('a sideways drag on a strip that can still scroll scrolls it instead of popping', async ({
    page,
    browserName,
  }) => {
    const {driver} = await openStack(page, 'carousel');
    const strip = page.getByTestId('carousel');
    await strip.evaluate(element => {
      element.scrollLeft = 300;
    });
    const box = await strip.boundingBox();
    if (box == null) {
      throw new Error('no strip');
    }
    await driver.play(
      drag(
        {x: box.x + 40, y: box.y + box.height / 2},
        {x: box.x + 200, y: box.y + box.height / 2},
        {durationMs: 400, restMs: 100},
      ),
    );
    await page.waitForTimeout(800);
    // Desktop WebKit does not scroll for an emulated touch drag; Chromium
    // does, so there the strip's own scroll shows too.
    if (browserName === 'chromium') {
      expect(await strip.evaluate(element => element.scrollLeft)).toBeLessThan(
        250,
      );
    }
    await expect(card(page, 'screen-General')).toHaveCount(1);
    expect(await translateX(card(page, 'screen-General'))).toBe(0);
  });

  test('a released swipe the app declines springs back', async ({page}) => {
    const {driver, width, left} = await openStack(page, 'declines-pops');
    await driver.play(
      drag(
        {x: left + width * 0.2, y: 420},
        {x: left + width * 0.8, y: 420},
        {durationMs: 300},
      ),
    );
    await page.waitForTimeout(900);
    await expect(card(page, 'screen-General')).toHaveCount(1);
    expect(
      Math.abs(await translateX(card(page, 'screen-General'))),
    ).toBeLessThan(0.5);
  });

  test('a screen contains overscroll only while it overflows', async ({
    page,
  }) => {
    await openStack(page, 'settings');
    // The screen's scroller (under the overlaid bar) is the card's child.
    const contain = async () =>
      card(page, 'root').evaluate(
        element =>
          getComputedStyle(element.firstElementChild ?? element)
            .overscrollBehaviorY,
      );
    // Four rows in a full-height stack: nothing to scroll, so a scroll
    // chains to the page as usual.
    expect(await contain()).toBe('auto');
    await page.setViewportSize({width: 400, height: 200});
    await expect.poll(contain).toBe('contain');
  });

  test('a large title that grows re-measures its screen', async ({page}) => {
    await openStack(page, 'large-title');
    const root = card(page, 'root');
    const contain = async () =>
      root.evaluate(
        element =>
          getComputedStyle(element.firstElementChild ?? element)
            .overscrollBehaviorY,
      );
    // A viewport just taller than the screen's content: nothing to scroll.
    const contentHeight = await root.evaluate(
      element => (element.firstElementChild as HTMLElement).scrollHeight,
    );
    await page.setViewportSize({width: 400, height: contentHeight + 40});
    await expect.poll(contain).toBe('auto');
    // A font load, the resize and the stack's release of its motion hints
    // each start a measurement of their own. Let them end first, so that only
    // the title can start the next one.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector('[style*="will-change"]') == null,
        ),
      )
      .toBe(true);
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          let frames = 5;
          const tick = () => {
            frames -= 1;
            if (frames === 0) {
              resolve();
            } else {
              requestAnimationFrame(tick);
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(await contain()).toBe('auto');
    // A taller line makes the title taller, with no font to load. No box but
    // the title's own changes size, and the screen now overflows.
    await root
      .locator('h1')
      .evaluate(title => title.style.setProperty('line-height', '400px'));
    await expect.poll(contain).toBe('contain');
  });
});

test('a push does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  await openStack(page, 'settings');
  const top = card(page, 'screen-General');
  // A programmatic click: a finger's press would add the row's own press
  // fade, which is not the push.
  const row = page.getByRole('button', {name: 'General'}).first();
  // The story's own first motion leaves its layers promoted for the
  // animator's linger (half a second after it ends). Demoting one is a style
  // pass and a Layout of its own. The root bar title's landed about 400 ms
  // into a push started at once, at the window's edge. Start the push once
  // none is left.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelectorAll('[style*="will-change"]').length,
      ),
    )
    .toBe(0);
  let push = {from: 0, to: 0};
  const trace = await traceRendering(page, async () => {
    // The page notes the push's own readiness. `started` is the frame after
    // every animation of the push runs on the compositor. The one-off work
    // that creates their layers comes before it. `landing` is the last frame
    // before the first of them ends. A loaded machine moves both.
    await page.evaluate(() => {
      const stack = document.querySelector('[data-testid="navigation-stack"]');
      const epoch = (t: number) => performance.timeOrigin + t;
      (
        window as unknown as {
          pushMotion?: Promise<{started: number; landing: number}>;
        }
      ).pushMotion = new Promise(resolve => {
        const waitForStart = () => {
          const running = (stack?.getAnimations({subtree: true}) ?? []).filter(
            animation => animation.playState === 'running',
          );
          if (running.length === 0) {
            requestAnimationFrame(waitForStart);
            return;
          }
          void Promise.all(running.map(animation => animation.ready)).then(() =>
            requestAnimationFrame(first => {
              const started = epoch(first);
              let landing = started;
              let ended = false;
              void Promise.race(
                running.map(animation =>
                  animation.finished.catch(() => undefined),
                ),
              ).then(() => {
                ended = true;
              });
              const step = (now: number) => {
                if (ended) {
                  resolve({started, landing});
                  return;
                }
                landing = epoch(now);
                requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            }),
          );
        };
        requestAnimationFrame(waitForStart);
      });
    });
    const watch = await watchAnimations(top);
    await row.evaluate(element => (element as HTMLElement).click());
    [push] = await watch.started();
    await waitForRest(top);
  });
  const motion = await page.evaluate(
    () =>
      (
        window as unknown as {
          pushMotion: Promise<{started: number; landing: number}>;
        }
      ).pushMotion,
  );
  // The motion itself, from its running frames to its landing (focus moves
  // to the new title after it, and may paint).
  const from = Math.max(push.from + 80, motion.started);
  const to = motion.landing;
  const during = countBetween(trace, from, to);
  const when = trace.events
    .filter(e => e.name === 'Layout' || e.name === 'Paint')
    .map(e => `${e.name}@${Math.round(e.t - push.from)}`);
  const detail = JSON.stringify({push, motion, during, when});
  // Present: a window of frames the page rendered.
  expect(to - from, detail).toBeGreaterThanOrEqual(100);
  expect(during.PrePaint ?? 0, detail).toBeGreaterThan(0);
  expect(during.Layout ?? 0, detail).toBe(0);
  expect(during.Paint ?? 0, detail).toBe(0);
});

test.describe('with Reduce Motion', () => {
  test('a push never dims the covered screen', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {driver} = await openStack(page, 'settings');
    const dimmed = await page.evaluate(() => {
      const w = window as unknown as {__dim: number[]; __dimStop: boolean};
      w.__dim = [];
      w.__dimStop = false;
      const dim = document.querySelector(
        '[data-navigation-screen="root"]',
      )?.lastElementChild;
      const tick = () => {
        if (dim != null) {
          w.__dim.push(Number(getComputedStyle(dim).opacity));
        }
        if (!w.__dimStop) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
      return dim != null;
    });
    expect(dimmed).toBe(true);
    await driver.tap(await rowCenter(page, 'General'));
    await page.waitForTimeout(800);
    const samples = await page.evaluate(() => {
      const w = window as unknown as {__dim: number[]; __dimStop: boolean};
      w.__dimStop = true;
      return w.__dim;
    });
    expect(samples.length).toBeGreaterThan(10);
    // UIKit's cross-fade has no dimming: the 10 % shade belongs to the slide.
    expect(Math.max(...samples), JSON.stringify(samples)).toBeLessThan(0.01);
  });

  test('under a mouse a push completes at once', async ({browser}) => {
    const {context, page} = await newFinePage(browser);
    try {
      await page.emulateMedia({reducedMotion: 'reduce'});
      await openStack(page, 'settings', {pointer: 'mouse'});
      await page.getByRole('button', {name: 'General'}).first().click();
      const top = card(page, 'screen-General');
      await expect(top).toHaveCount(1);
      // A fine pointer changes at once.
      const first = await top.evaluate(
        element =>
          new Promise<{x: string; opacity: number}>(resolve =>
            requestAnimationFrame(() =>
              resolve({
                x: getComputedStyle(element).translate,
                opacity: Number(getComputedStyle(element).opacity),
              }),
            ),
          ),
      );
      expect(first.x === 'none' || parseFloat(first.x) === 0).toBe(true);
      expect(first.opacity).toBe(1);
    } finally {
      await context.close();
    }
  });

  test('a push cross-fades in place instead of sliding', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await installPageFreeze(page);
    const {driver} = await openStack(page, 'settings');
    await installTimerGate(page);
    const top = card(page, 'screen-General');
    // Frozen in the tap's own task, the fade starts held at its start. The
    // scene then moves halfway into the 200 ms fade on its own clock.
    await freezePageOn(page, 'touchend');
    await driver.tap(await rowCenter(page, 'General'));
    await advanceFrozenPage(page, 100);
    const midway = await top.evaluate(element => ({
      x: getComputedStyle(element).translate,
      opacity: Number(getComputedStyle(element).opacity),
    }));
    await thawPage(page);
    await waitForRest(top);
    // No travel: the incoming screen is already where it lands, halfway
    // faded in.
    expect(midway.x === 'none' || parseFloat(midway.x) === 0).toBe(true);
    expect(midway.opacity).toBeCloseTo(0.5, 1);
    expect(await translateX(top)).toBe(0);
  });
});

test('a large title scrolls under the bar, which then shows the title; scrolling back hides it again', async ({
  page,
}) => {
  await openStack(page, 'large-title');
  const rootCard = card(page, 'root');
  const barText = page.locator('[data-navigation-bar="root"] h2');
  await expect(
    page.getByRole('heading', {level: 1, name: 'Settings'}),
  ).toBeVisible();
  // The title's offset inside its bar, which the rise moves.
  const read = async () =>
    barText.evaluate(element => ({
      opacity: Number(getComputedStyle(element).opacity),
      top:
        element.getBoundingClientRect().top -
        (element.parentElement as HTMLElement).getBoundingClientRect().top,
    }));
  const hidden = await read();
  expect(hidden.opacity).toBe(0);

  // Scrolled under the bar (the scroll itself is the browser's): the bar's
  // title rises into place as it fades in.
  await rootCard.evaluate(element =>
    (element.firstElementChild as HTMLElement).scrollTo({top: 300}),
  );
  await expect
    .poll(async () => (await read()).opacity, {timeout: 3000})
    .toBe(1);
  // It rose 15 px into place (navigation.inlineTitleRise).
  expect(hidden.top - (await read()).top).toBeCloseTo(15, 0);
  await expect(barText).not.toHaveAttribute('aria-hidden');

  await rootCard.evaluate(element =>
    (element.firstElementChild as HTMLElement).scrollTo({top: 0}),
  );
  await expect
    .poll(async () => (await read()).opacity, {timeout: 3000})
    .toBe(0);
  await expect(barText).toHaveAttribute('aria-hidden', 'true');
});

test('a pushed large title rides in with its screen', async ({page}) => {
  const {driver} = await openStack(page, 'large-title');
  const top = card(page, 'screen-General');
  const watch = await watchAnimations(top);
  await driver.tap(await rowCenter(page, 'General'));
  await watch.started();
  await waitForRest(top);
  // The pushed screen here is inline; the root's large title stays with the
  // root card, under it and to the left.
  const rootTitle = page.getByRole('heading', {level: 1, name: 'Settings'});
  const box = await rootTitle.boundingBox();
  const rootBox = await card(page, 'root').boundingBox();
  expect(box && rootBox && Math.abs(box.x - rootBox.x)).toBeLessThan(2);
});

/**
 * Mean luminance (0–255) of a CSS-px box in each screencast frame, decoded
 * in a scratch page (like trackMarker).
 */
async function boxLuminance(
  page: Page,
  frames: Awaited<
    ReturnType<Awaited<ReturnType<typeof startScreencast>>['stop']>
  >,
  box: {x: number; y: number; width: number; height: number},
): Promise<{t: number; luminance: number}[]> {
  const scratch = await page.context().newPage();
  try {
    const out: {t: number; luminance: number}[] = [];
    for (let i = 0; i < frames.length; i += 12) {
      const batch = frames.slice(i, i + 12);
      const values = await scratch.evaluate(
        async ({items, rect}) => {
          const results: number[] = [];
          for (const item of items) {
            const blob = await (
              await fetch(`data:image/${item.format};base64,${item.data}`)
            ).blob();
            const bitmap = await createImageBitmap(blob);
            const scale = bitmap.width / item.viewportWidth;
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            if (context == null) {
              throw new Error('no 2d context');
            }
            context.drawImage(bitmap, 0, 0);
            const {data} = context.getImageData(
              Math.round(rect.x * scale),
              Math.round(rect.y * scale),
              Math.max(1, Math.round(rect.width * scale)),
              Math.max(1, Math.round(rect.height * scale)),
            );
            let sum = 0;
            for (let o = 0; o < data.length; o += 4) {
              sum +=
                0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
            }
            results.push(sum / (data.length / 4));
          }
          return results;
        },
        {items: batch, rect: box},
      );
      batch.forEach((frame, k) => out.push({t: frame.t, luminance: values[k]}));
    }
    return out;
  } finally {
    await scratch.close();
  }
}

test('a back swipe carries the large titles: each rides its own screen', async ({
  page,
}) => {
  const {driver, width, left} = await openStack(page, 'large-title');
  const top = card(page, 'screen-General');
  const watch = await watchAnimations(top);
  await driver.tap(await rowCenter(page, 'General'));
  await watch.started();
  await waitForRest(top);
  await expect(
    page.getByRole('heading', {level: 1, name: 'Settings'}),
  ).toBeVisible();
  // All four boxes from one task in the page: separate reads let the swipe
  // move a card between a title's read and its card's.
  const read = () =>
    page.evaluate(stackWidth => {
      const x = (selector: string) =>
        document.querySelector(selector)?.getBoundingClientRect().x ?? NaN;
      const topCardX = x('[data-navigation-screen="screen-General"]');
      return {
        root:
          x('[data-navigation-screen="root"] h1') -
          x('[data-navigation-screen="root"]'),
        top: x('[data-navigation-bar="screen-General"] h2') - topCardX,
        p: (Number.isFinite(topCardX) ? topCardX : 0) / stackWidth,
      };
    }, width);
  const rest = await read();
  const samples: Awaited<ReturnType<typeof read>>[] = [];
  // A slow sideways drag in the content (iOS 26's back swipe), released
  // short of half so it springs back.
  await driver.play(
    drag(
      {x: left + 80, y: 420},
      {x: left + 80 + width * 0.3, y: 420},
      {durationMs: 1500, hz: 60},
    ),
    {
      onEvent: async () => {
        samples.push(await read());
      },
    },
  );
  const moving = samples.filter(sample => sample.p > 0.05);
  expect(moving.length).toBeGreaterThan(5);
  for (const sample of moving) {
    const at = JSON.stringify({sample, rest});
    // The root's large title rides the root card (its parallax), the pushed
    // screen's title rides the top card.
    expect(Math.abs(sample.root - rest.root), at).toBeLessThan(1.5);
    expect(Math.abs(sample.top - rest.top), at).toBeLessThan(1.5);
  }
  await waitForRest(top);
});

test('under Reduce Motion the bar title cross-fades in place, without the rise', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await openStack(page, 'large-title');
  const barText = page.locator('[data-navigation-bar="root"] h2');
  await card(page, 'root').evaluate(element =>
    (element.firstElementChild as HTMLElement).scrollTo({top: 300}),
  );
  const samples = await sampleRects(barText, 900);
  await expect
    .poll(async () =>
      barText.evaluate(e => Number(getComputedStyle(e).opacity)),
    )
    .toBe(1);
  // Where the shown title rests (hidden, it sits 15 px lower for the rise).
  const rest = await barText.boundingBox();
  const fading = samples.filter(
    sample => sample.opacity > 0.05 && sample.opacity < 0.95,
  );
  // A fade, not a jump…
  expect(fading.length, JSON.stringify(samples)).toBeGreaterThan(2);
  // …in place: every visible frame is already at the resting position.
  for (const sample of samples.filter(item => item.opacity > 0.05)) {
    expect(
      Math.abs((sample.box?.y ?? NaN) - (rest?.y ?? NaN)),
      JSON.stringify(samples),
    ).toBeLessThan(0.5);
  }
});

/** The bar title's opacity, every frame for `ms`. */
async function sampleTitleOpacity(page: Page, bar: string, ms: number) {
  return page.evaluate(
    ({bar, ms}) =>
      new Promise<number[]>(resolve => {
        const samples: number[] = [];
        const start = performance.now();
        const tick = () => {
          const title = document.querySelector(
            `[data-navigation-bar="${bar}"] h2`,
          );
          samples.push(
            title == null ? NaN : Number(getComputedStyle(title).opacity),
          );
          if (performance.now() - start < ms) {
            requestAnimationFrame(tick);
          } else {
            resolve(samples);
          }
        };
        requestAnimationFrame(tick);
      }),
    {bar, ms},
  );
}

test('popping back to a large title two levels down shows it without the bar title', async ({
  page,
}) => {
  const {driver} = await openStack(page, 'large-title');
  await driver.tap(await rowCenter(page, 'General'));
  await waitForRest(card(page, 'screen-General'));
  await driver.tap(await rowCenter(page, 'About'));
  await waitForRest(card(page, 'screen-About'));
  // The root is two levels down now (not rendered); Done returns to it.
  await driver.tap(await rowCenter(page, 'Done'));
  const samples = await sampleTitleOpacity(page, 'root', 500);
  // Its large title never scrolled: the bar's title stays hidden throughout.
  expect(Math.max(...samples), JSON.stringify(samples)).toBeLessThan(0.05);
});

test('a large-title screen pushed again starts with its large title, not the bar’s', async ({
  page,
}) => {
  const {driver} = await openStack(page, 'large-title');
  await driver.tap(await rowCenter(page, 'Display'));
  await waitForRest(card(page, 'screen-Display'));
  await card(page, 'screen-Display').evaluate(element =>
    (element.firstElementChild as HTMLElement).scrollTo({top: 300}),
  );
  await expect
    .poll(() =>
      page
        .locator('[data-navigation-bar="screen-Display"] h2')
        .evaluate(e => Number(getComputedStyle(e).opacity)),
    )
    .toBe(1);
  await page.locator('[data-navigation-back]').last().click();
  await expect(card(page, 'screen-Display')).toHaveCount(0);

  // Mounted again, the card starts at the top with its large title showing.
  await driver.tap(await rowCenter(page, 'Display'));
  const samples = await sampleTitleOpacity(page, 'screen-Display', 400);
  expect(Math.max(...samples), JSON.stringify(samples)).toBeLessThan(0.05);
});

test('the bar title’s handover keeps running while the main thread is blocked', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright (WebKit: the iOS simulator)',
  );
  await openStack(page, 'large-title');
  const barText = page.locator('[data-navigation-bar="root"] h2');
  const box = await barText.boundingBox();
  expect(box).not.toBeNull();
  await startBusyControl(page);
  const cast = await startScreencast(page);
  const watch = await watchAnimations(barText);
  await card(page, 'root').evaluate(element =>
    (element.firstElementChild as HTMLElement).scrollTo({top: 300}),
  );
  const [fade] = await watch.started({minProgressMs: 16});
  const block = await blockMainThread(page, 600, {
    during: barText,
    minProgressMs: 16,
  });
  await page.waitForTimeout(150);
  const frames = await cast.stop();
  // The title's rest place only: it fades in there throughout. A box that
  // also covers the 15 px it rises from sees the text leave one part as it
  // enters the other. So its mean can stand still while the title moves.
  const region = {
    x: box?.x ?? 0,
    y: box?.y ?? 0,
    width: box?.width ?? 0,
    height: box?.height ?? 0,
  };
  const series = await boxLuminance(page, frames, region);
  const control = await trackMarker(page, frames, {rgb: CONTROL_RGB});
  const controlX = new Map(control.map(f => [f.t, f.box?.x ?? null]));
  // The check judges the frames the compositor presented while blocked,
  // those the control moved on. The title keeps changing (fading in) on each
  // of them until it is nearly at rest.
  const end = Math.min(block.to, fade.from + 350);
  const judged = series.flatMap((item, i) => {
    const before = series[i - 1];
    const x = controlX.get(item.t) ?? null;
    const previousX = before == null ? null : (controlX.get(before.t) ?? null);
    return before != null &&
      item.t >= block.from &&
      item.t <= end &&
      x != null &&
      previousX != null &&
      x !== previousX
      ? [{t: item.t, step: Math.abs(item.luminance - before.luminance)}]
      : [];
  });
  const detail = JSON.stringify({block, fade, judged});
  expect(judged.length, detail).toBeGreaterThan(5);
  const changed = judged.filter(item => item.step > 0.05).length;
  expect(changed, detail).toBeGreaterThanOrEqual(judged.length - 2);
});

test('storyboard: a push', {tag: '@storyboard'}, async ({page}, testInfo) => {
  const {driver, stack, width} = await openStack(page, 'settings');
  const top = card(page, 'screen-General');
  // The push moves both cards at once: with a count of 2, the row's own
  // release fade cannot trigger the hold alone.
  const hold = await armHold(page, stack, {
    judges: [
      {target: top, property: 'translate'},
      {target: card(page, 'root'), property: 'translate'},
    ],
    count: 2,
    newOnly: true,
  });
  await driver.tap(await rowCenter(page, 'General'));
  const held = await hold.held();
  const viewport = page.viewportSize() ?? {width: 402, height: 714};
  const {storyboard} = await animationStoryboard(page, {
    held,
    name: 'navigationstack-push',
    clip: {x: 0, y: 0, width: viewport.width, height: viewport.height},
    // The spring is at rest by ~0.45 s; the animator holds end states after.
    times: Array.from({length: 28}, (_, i) => i * 16.667),
    measure: async () => ({
      top: await translateX(top),
      under: await translateX(card(page, 'root')),
    }),
    columns: 8,
    cellScale: 0.35,
  });
  await releaseAnimations(page, {finish: true});
  await storyboard.write(testInfo);
  const frames = storyboard.frames.map(
    f => f.data as {top: number; under: number},
  );
  expect(frames[0].top).toBeCloseTo(width, 0);
  expect(
    frames.every((f, i) => i === 0 || f.top <= frames[i - 1].top + 0.5),
    JSON.stringify(frames.map(f => Math.round(f.top))),
  ).toBe(true);
  expect(frames.at(-1)?.top ?? Infinity).toBeLessThan(1);
});

test(
  'storyboard: a back swipe released past half',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, width, left, topTitle} = await openStack(page, 'pushed', {
      standalone: true,
    });
    const top = card(page, 'screen-About');
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const storyboard = await touchStoryboard(
      page,
      driver,
      drag(
        {x: left + 4, y: 400},
        {x: left + width * 0.65, y: 400},
        {
          durationMs: 300,
          hz: 30,
          restMs: 120,
        },
      ),
      {
        name: 'navigationstack-edge-pop',
        clip: {x: 0, y: 0, width: viewport.width, height: viewport.height},
        measure: async () => ({top: await translateX(top)}),
        columns: 6,
        cellScale: 0.4,
      },
    );
    await storyboard.write(testInfo);
    await expect.poll(topTitle).toBe('General');
    const frames = storyboard.frames.map(f => f.data as {top: number});
    expect(Math.max(...frames.map(f => f.top))).toBeGreaterThan(width * 0.5);
  },
);
