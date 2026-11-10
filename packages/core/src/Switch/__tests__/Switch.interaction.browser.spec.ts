// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Switch.interaction.browser.spec.ts
 * @input The built Switch stories, real touch input (Chromium CDP / WebKit's
 *   input command) and @astryxdesign/interaction-harness
 * @output Interaction and animation proofs of Switch's touch presentation
 *   against UISwitch on iOS 26.2, one named case per path (P1–P14), and
 *   storyboards of a tap and of a drag
 * @position The browser layer of Switch's touch tests; the pure model is
 *   switchTouch.test.ts. Runs on the phone profile (coarse pointer); a mouse
 *   context keeps the desktop switch.
 *
 * SYNC: useSwitchTouch.ts, switchTouch.ts, motion/uikit/switch.ts.
 */

import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  BUSY_PROOF_LOOKAROUND_MS,
  castStoryboard,
  animationStoryboard,
  armHold,
  blockMainThread,
  compareCurve,
  cubicBezier,
  countBetween,
  advanceFrozenPage,
  drag,
  freezePageOn,
  freezeTimers,
  holdAnimations,
  installPageFreeze,
  installTimerGate,
  markElement,
  openStory,
  releaseAnimations,
  seekAnimations,
  springStep,
  startBusyControl,
  startScreencast,
  tap,
  thawPage,
  thawTimers,
  timeline,
  touchDriver,
  touchStoryboard,
  traceRendering,
  trackControl,
  trackMarker,
  waitForRest,
  withStorybook,
  writeEvidence,
  pageTimesOnControls,
  pooledBusyProof,
  FrameStarvationError,
  trackBrightness,
  type BusyRun,
  type CastFrame,
  type TouchDriver,
  type TrackedFrame,
  CONTROL_SIDE,
  holdInputUntil,
  LiftPlacementError,
  requireFrames,
} from '@astryxdesign/interaction-harness';
import {BROWSER_CLICK_WAIT_MS} from '../../utils/browserClickWait';
import {CLICK_GUARD_WINDOW_MS} from '../../utils/clickGuard';
import {PROMOTION_LINGER_MS} from '../../motion/animator';

import {WEBKIT_LATE_STAMPS} from './Switch.webkitLateStamps.fixture';

/** How close to its end colour the fade is when its block ends: the cast's noise, red units. */
const FADE_SETTLED = 6;
/** Where judging the fade stops, red units from its end (see its proof). */
const FADE_TAIL = 16;
/** The track-colour proof's pool (`pooledBusyProof`) options. */
const FADE_PROOF = {
  axis: 'x',
  settledWithin: FADE_TAIL,
  minRunFrames: 2,
  minJudgedRuns: 2,
} as const;
/**
 * How long the toggle proof blocks the main thread, ms. The travel rests
 * about 330 ms into the block, so its last frames in the block show it at rest.
 */
const TOGGLE_BLOCK_MS = 400;
/**
 * Where judging the toggle's travel stops, px from rest: the harness's
 * two-step tail rule on the sub-pixel read's 0.05 px steps (see its proof).
 */
const TOGGLE_TAIL = 0.4;

const storybook = withStorybook(test);

// UISwitch on iOS 26.2 (motion/uikit/switch.ts), restated here as the oracle.
const TRAVEL = {response: 0.3, dampingFraction: 1};
/** A finger's drag; a lift is a drag step of its own. */
const TRACKING = {response: 0.36, dampingFraction: 1};
const WELL_ON = {response: 0.68, dampingFraction: 1};
/** The md track is 40 × 24. */
const TRACK = {width: 40, height: 24};
/** The md thumb, a circle at the size a mouse sees: 16 off, 20 on (Switch FR13). */
const THUMB_OFF = 16;
const THUMB_ON = 20;
/** The off thumb's inset in the track, on every side. */
const INSET = (TRACK.height - THUMB_OFF) / 2;
/** How far the thumb's center travels: each circle centered in the track's height at its end. */
const TRAVEL_PX = TRACK.width - TRACK.height;
/** The flip rule: the track minus the thumb past where the finger landed. */
const FLIP_DISTANCE = TRACK.width - THUMB_OFF;
const FLIP_FROM_ON = TRACK.width - THUMB_ON;
/** The lift grows the thumb into half the gap on each side (switchTouch.ts). */
const LIFT_SCALE = 1 + INSET / THUMB_OFF;
/**
 * design:reduced-motion DR2: under reduced motion a touch change is an
 * opacity-only cross-fade of this many ms or less.
 */
const REDUCED_FADE_MAX_MS = 200;
/** The release's clock and curve: the theme's exit motion tokens. */
interface Exit {
  readonly ms: number;
  readonly curve: readonly [number, number, number, number];
  readonly ease: (t: number) => number;
}

/** Reads `--duration-exit` and `--ease-exit` where the press paints. */
async function exitOf(surface: Locator): Promise<Exit> {
  const {ms, curve} = await surface.evaluate(el => {
    const style = getComputedStyle(el);
    const time = style.getPropertyValue('--duration-exit').trim();
    const points = (
      style.getPropertyValue('--ease-exit').match(/-?\d*\.?\d+/g) ?? []
    ).map(Number);
    return {
      ms: time.endsWith('ms') ? parseFloat(time) : parseFloat(time) * 1000,
      curve: points,
    };
  });
  const points = curve as unknown as Exit['curve'];
  return {ms, curve: points, ease: cubicBezier(...points)};
}

/** The layer's opacity t ms into the release: the strength, 1 → 0. */
const strengthAt = (exit: Exit, t: number) =>
  1 - exit.ease(Math.min(1, Math.max(0, t / exit.ms)));

interface ChangeSample {
  t: number;
  /** The thumb's scale as presented. */
  scale: number;
  /**
   * The thumb's center from the track's left edge (each state has its own
   * circle size, so the center is where it is).
   */
  left: number;
  /** How opaque the thumb shows. */
  opacity: number;
  /** How far the colour shows on (see presented()). */
  on: number;
  /** The track's own fill. */
  fill: string;
}

/**
 * Samples the first switch every frame for `ms` while `act` runs.
 */
async function sampleChange(
  page: Page,
  act: () => Promise<void>,
  ms = 700,
): Promise<ChangeSample[]> {
  await page.evaluate(duration => {
    const w = window as unknown as {__change: unknown[]};
    const track = document.querySelector<HTMLElement>(
      '#storybook-root .astryx-switch',
    )!;
    const thumb = document.querySelector<HTMLElement>(
      '#storybook-root .astryx-switch-thumb',
    )!;
    const input = document.querySelector<HTMLInputElement>(
      '#storybook-root [role="switch"]',
    )!;
    const scaleOf = (element: Element) => {
      const scale = getComputedStyle(element).scale;
      return scale === 'none' ? 1 : Number(scale.split(' ')[0]);
    };
    w.__change = [];
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start;
      const faded = Number(getComputedStyle(track, '::after').opacity);
      w.__change.push({
        t,
        scale: scaleOf(thumb),
        left:
          (thumb.getBoundingClientRect().left +
            thumb.getBoundingClientRect().right) /
            2 -
          track.getBoundingClientRect().left,
        opacity: Number(getComputedStyle(thumb).opacity),
        on: input.checked ? 1 - faded : faded,
        fill: getComputedStyle(track).backgroundColor,
      });
      if (t < duration) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(
    () => (window as unknown as {__change: ChangeSample[]}).__change,
  );
}

/**
 * Holds the press's release from the task that starts it: a microtask after
 * the row's attribute turns `fading`, before any timer or frame runs. The
 * page's gated timers freeze, so nothing removes the attribute. The release's
 * CSS animations are created there and held at their start, so a loaded
 * machine cannot play them out before the test reads them.
 */
async function holdReleaseWhenFading(page: Page): Promise<void> {
  await page.evaluate(() => {
    const row = document.querySelector(
      '#storybook-root [data-astryx-pressable]',
    )!;
    const gate = (window as unknown as {__harnessTimerGate: {frozen: boolean}})
      .__harnessTimerGate;
    const observer = new MutationObserver(() => {
      if (row.getAttribute('data-astryx-press') !== 'fading') {
        return;
      }
      gate.frozen = true;
      observer.disconnect();
      for (const animation of row.getAnimations({subtree: true})) {
        if (animation instanceof CSSAnimation) {
          animation.playbackRate = 0;
        }
      }
    });
    observer.observe(row, {attributeFilter: ['data-astryx-press']});
  });
}

/**
 * Gives the held release animations their rate back before the release.
 * The hold set it to 0, and an animation at rate 0 cannot finish. They stay
 * paused, so nothing moves.
 */
async function restoreHeldRates(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.playbackRate === 0) {
        animation.playbackRate = 1;
      }
    }
  });
}

/**
 * Resolves after a timer of `ms` queued now on the page. The switch queued
 * its own timer at the release, before this one. With the same delay, this
 * one runs after it, however late the page runs.
 */
async function afterPageTimer(page: Page, ms: number): Promise<void> {
  await page.evaluate(async delay => {
    await new Promise<void>(resolve => {
      setTimeout(resolve, delay);
    });
  }, ms);
}

/**
 * design:reduced-motion DR1 and DR2: the change scales nothing, never shows
 * the thumb between its two places, fades (opacity), and is done within the
 * cross-fade's bound.
 */
function expectCrossFade(samples: ChangeSample[]): void {
  const first = samples[0];
  const last = samples.at(-1)!;
  expect(Math.abs(last.left - first.left)).toBeGreaterThan(4);
  for (const sample of samples) {
    expect(Math.abs(sample.scale - 1), JSON.stringify(sample)).toBeLessThan(
      0.01,
    );
    if (sample.opacity > 0.1) {
      const atAnEnd = Math.min(
        Math.abs(sample.left - first.left),
        Math.abs(sample.left - last.left),
      );
      expect(atAnEnd, JSON.stringify(sample)).toBeLessThan(0.75);
    }
  }
  // A fade, not a jump: some frame shows the thumb or the colour part-way.
  expect(
    samples.some(
      s => (s.opacity > 0.1 && s.opacity < 0.9) || (s.on > 0.1 && s.on < 0.9),
    ),
  ).toBe(true);
  // Each fade, the thumb's and the colour's, lasts the bound or less. The
  // colour starts at the release and the thumb at the commit. A busy page can
  // start them frames apart, so each is measured on its own. Both samples of
  // a span lie inside its fade, so a frame read late cannot lengthen it.
  const spanOf = (fading: (s: ChangeSample) => boolean) => {
    const inside = samples.filter(fading);
    return inside.length === 0 ? 0 : inside.at(-1)!.t - inside[0].t;
  };
  const thumbFading = (s: ChangeSample) => s.opacity < 0.98;
  const colourFading = (s: ChangeSample) =>
    Math.abs(s.on - first.on) > 0.02 && Math.abs(s.on - last.on) > 0.02;
  // Present first: the change shows on screen.
  expect(samples.some(s => thumbFading(s) || colourFading(s))).toBe(true);
  expect(spanOf(thumbFading)).toBeLessThanOrEqual(REDUCED_FADE_MAX_MS);
  expect(spanOf(colourFading)).toBeLessThanOrEqual(REDUCED_FADE_MAX_MS);
}

interface OpenSwitch {
  driver: TouchDriver;
  input: Locator;
  thumb: Locator;
  onLayer: Locator;
  /** The thumb's center at rest, client px. */
  center: {x: number; y: number};
}

/** Waits for the switch's measured hit insets (utils/hitArea, a frame after mount). */
async function waitForHitArea(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const surface = document.querySelector<HTMLElement>(
      '#storybook-root [role="switch"]',
    )?.parentElement;
    return (
      surface?.style.getPropertyValue('--astryx-hit-inset-top') !== '' &&
      surface?.style.getPropertyValue('--astryx-hit-inset-top') != null
    );
  });
}

async function openSwitch(
  page: Page,
  storyId = 'core-switch--default',
  {
    direction = 'ltr',
    globals = [],
    belowControls = false,
  }: {
    direction?: 'ltr' | 'rtl';
    /** More Storybook globals, e.g. `theme:probe`. */
    globals?: string[];
    /**
     * Moves the switch below the busy controls' strips (the top
     * `2 * CONTROL_SIDE + 4` px), so a control never crosses its marker.
     */
    belowControls?: boolean;
  } = {},
): Promise<OpenSwitch> {
  const allGlobals = [
    ...(direction === 'rtl' ? ['direction:rtl'] : []),
    ...globals,
  ];
  if (allGlobals.length === 0) {
    await openStory(page, storybook(), storyId);
  } else {
    // Storybook's globals apply from the story's first render (the direction
    // global wraps it in `dir="rtl"`, so the switch mounts right to left).
    await page.goto(
      `${storybook()}/iframe.html?id=${storyId}&viewMode=story&globals=${allGlobals.join(';')}`,
    );
    await page
      .locator('#storybook-root > *')
      .first()
      .waitFor({state: 'attached'});
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
  }
  if (belowControls) {
    await page.addStyleTag({
      content: `#storybook-root { padding-top: ${2 * CONTROL_SIDE + 16}px !important; }`,
    });
    await page.evaluate(
      async () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }
  const driver = await touchDriver(page);
  const root = page.locator('#storybook-root');
  const input = root.getByRole('switch').first();
  const thumb = root.locator('.astryx-switch-thumb').first();
  // The track: its ::after is the colour fade, its ::before the press.
  const onLayer = root.locator('.astryx-switch').first();
  // Under a finger the thumb itself moves and lifts.
  const box = await thumb.boundingBox();
  if (box == null) {
    throw new Error('no thumb');
  }
  return {
    driver,
    input,
    thumb,
    onLayer,
    center: {x: box.x + box.width / 2, y: box.y + box.height / 2},
  };
}

interface Presented {
  scaleX: number;
  scaleY: number;
  on: number;
  fill: number;
}

/**
 * A tap the browser turns into its own click. Chromium synthesises the click
 * from the scripted touch. WebKit synthesises one only from its tap path,
 * which has no hold.
 */
async function tapForClick(
  driver: TouchDriver,
  at: {x: number; y: number},
  holdMs = 50,
): Promise<void> {
  if (driver.engine === 'webkit') {
    await driver.tap(at);
  } else {
    await driver.play(tap(at, {holdMs}));
  }
}

/**
 * The opacity of the first track's press layer (its ::before), or null when
 * the track has none (at rest).
 */
async function pressLayer(
  page: Page,
  part: 'track' | 'thumb' = 'track',
): Promise<number | null> {
  return page.evaluate(which => {
    const track = document.querySelector<HTMLElement>(
      which === 'track'
        ? '#storybook-root .astryx-switch'
        : '#storybook-root .astryx-switch-thumb',
    )!;
    const layer = getComputedStyle(track, '::before');
    return layer.content === 'none' || layer.content === 'normal'
      ? null
      : Number(layer.opacity);
  }, part);
}

/** The press state the row's press feedback shows (`data-astryx-press`). */
async function pressState(page: Page, index = 0): Promise<string | null> {
  return page.evaluate(i => {
    const inputs = document.querySelectorAll('#storybook-root [role="switch"]');
    const row = inputs[i]?.closest('[data-astryx-pressable]');
    return row?.getAttribute('data-astryx-press') ?? null;
  }, index);
}

/**
 * The switch at rest: the thumb still, and the track's colour fade (its
 * ::after, which waitForRest does not read) finished too.
 */
async function waitForSwitchRest(page: Page, thumb: Locator): Promise<void> {
  await waitForRest(thumb);
  await page.waitForFunction(() =>
    document
      .querySelector('#storybook-root .astryx-switch')!
      .getAnimations({subtree: true})
      .every(animation => animation.playState !== 'running'),
  );
}

/** The thumb's scale and the track's color, as presented. */
async function presented(page: Page): Promise<Presented> {
  return page.evaluate(() => {
    const thumb = document.querySelector<HTMLElement>(
      '#storybook-root .astryx-switch-thumb',
    )!;
    // The fade layer over the track shows the other side's fill. How far the
    // colour shows on is its opacity while off, and its complement while on.
    const fade = document.querySelector<HTMLElement>(
      '#storybook-root .astryx-switch',
    )!;
    const input = document.querySelector<HTMLInputElement>(
      '#storybook-root [role="switch"]',
    )!;
    const faded = Number(getComputedStyle(fade, '::after').opacity);
    const scale = getComputedStyle(thumb).scale;
    const [sx, sy = sx] = (scale === 'none' ? '1' : scale)
      .split(' ')
      .map(Number);
    return {
      scaleX: sx,
      scaleY: sy,
      on: input.checked ? 1 - faded : faded,
      fill: Number(getComputedStyle(thumb).opacity),
    };
  });
}

/**
 * The thumb's offset from the track's start edge, exact: its center (a scale
 * about the center does not move it) less half its unscaled width.
 */
async function thumbOffset(page: Page): Promise<number> {
  // The thumb's center from the inline-start rest's: 0 off, TRAVEL_PX on (in
  // LTR). The center, since each state has its own circle size.
  return page.evaluate(height => {
    const box = document.querySelector<HTMLElement>(
      '#storybook-root .astryx-switch-thumb',
    )!;
    const rect = box.getBoundingClientRect();
    const track = box.parentElement!.getBoundingClientRect();
    return rect.left + rect.width / 2 - track.left - height / 2;
  }, TRACK.height);
}

/**
 * The thumb's travel: the newest animation of its `translate`, from its start
 * to the end of its motion, epoch ms.
 */
async function travelAnimation(
  page: Page,
): Promise<{from: number; to: number}> {
  for (let attempt = 0; attempt < 500; attempt++) {
    const found = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>(
        '#storybook-root .astryx-switch-thumb',
      )!;
      const travel = box
        .getAnimations()
        .filter(
          a =>
            a.playState === 'running' &&
            (a.effect as KeyframeEffect)
              .getKeyframes()
              .some(k => 'translate' in k),
        )
        .at(-1);
      if (travel == null || travel.startTime == null) {
        return null;
      }
      const from = performance.timeOrigin + Number(travel.startTime);
      // The animator's keyframes end with a hold of the end state: the
      // motion ends at the last keyframe before it.
      const effect = travel.effect as KeyframeEffect;
      const offsets = effect
        .getKeyframes()
        .map(k => k.computedOffset)
        .filter(o => o < 1);
      return {
        from,
        to:
          from +
          Number(effect.getComputedTiming().activeDuration) *
            Math.max(...offsets),
      };
    });
    if (found != null) {
      return found;
    }
    await page.waitForTimeout(4);
  }
  throw new Error('the thumb never travelled');
}

/** The probe theme paints every state of the `switch` target its own fill. */
const PROBE_THEME = 'astryxTheme:probe';

/**
 * The track's fill off and on as a theme paints it under a mouse: what a
 * finger has to show too.
 */
async function mouseFills(
  browser: Browser,
  globals: string[],
): Promise<{off: string; on: string}> {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    deviceScaleFactor: 1,
    viewport: {width: 480, height: 320},
  });
  try {
    const page = await context.newPage();
    await page.goto(
      `${storybook()}/iframe.html?id=core-switch--default&viewMode=story&globals=${globals.join(';')}`,
    );
    const input = page.locator('#storybook-root').getByRole('switch').first();
    await input.waitFor({state: 'attached'});
    const fill = async () => {
      // Off the switch (no hover tint), after the track's own transition.
      await page.mouse.move(1, 1);
      await page.waitForTimeout(400);
      return page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector('#storybook-root .astryx-switch')!,
          ).backgroundColor,
      );
    };
    const off = await fill();
    await input.click({force: true});
    await expect(input).toBeChecked();
    return {off, on: await fill()};
  } finally {
    await context.close();
  }
}

/**
 * The colour a finger sees on the track: the fade layer's while it is
 * opaque, the track's own fill while it is clear.
 */
async function visibleFill(page: Page): Promise<string> {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>(
      '#storybook-root .astryx-switch',
    )!;
    const fade = getComputedStyle(track, '::after');
    return Number(fade.opacity) > 0.5
      ? fade.backgroundColor
      : getComputedStyle(track).backgroundColor;
  });
}

test.describe('Switch touch presentation (UISwitch, iOS 26.2), under a finger', () => {
  test('a theme’s `switch` fill shows under a finger, off and on: the track keeps the theme’s fill and the fade layer only crossfades', async ({
    page,
    browser,
  }) => {
    const expected = await mouseFills(browser, [PROBE_THEME]);
    expect(expected.on).not.toBe(expected.off);
    const {driver, input, thumb, center} = await openSwitch(
      page,
      'core-switch--default',
      {globals: [PROBE_THEME]},
    );
    expect(await visibleFill(page)).toBe(expected.off);
    await driver.play(tap(center));
    await expect(input).toBeChecked();
    await waitForSwitchRest(page, thumb);
    // The well spring (0.68 s on) has settled.
    await page.waitForTimeout(900);
    expect(await visibleFill(page)).toBe(expected.on);
  });

  test('a page of switches holds no compositing layer at rest, and a toggled switch gives its layers back once it rests', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'The count reads Chromium’s layer tree through the DevTools protocol.',
    );
    const cdp = await page.context().newCDPSession(page);
    let layers = 0;
    cdp.on('LayerTree.layerTreeDidChange', event => {
      if (event.layers != null) {
        layers = event.layers.length;
      }
    });
    await cdp.send('LayerTree.enable');
    const {driver, input, thumb, center} = await openSwitch(
      page,
      'core-switch--in-scrolling-list',
    );
    // The tree after a wait and two frames, so it holds what they drew.
    const count = async (waitMs: number) => {
      await page.waitForTimeout(waitMs);
      await page.evaluate(
        async () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      return layers;
    };
    const atRest = await count(PROMOTION_LINGER_MS + 200);
    const wasOn = await input.isChecked();
    await driver.play(tap(center));
    await expect(input).toBeChecked({checked: !wasOn});
    await waitForSwitchRest(page, thumb);
    // The fade and the shadow's settle end within a second of the thumb.
    const afterToggle = await count(1000 + PROMOTION_LINGER_MS);
    // The same page without its switches: what they add.
    await page.evaluate(() =>
      document.querySelector('#storybook-root > div')?.replaceChildren(),
    );
    const bare = await count(300);
    expect(
      atRest - bare,
      `24 switches at rest hold ${atRest - bare} layers`,
    ).toBe(0);
    expect(
      afterToggle - bare,
      `the toggled switch holds ${afterToggle - bare} layers after it rests`,
    ).toBe(0);
  });

  test('a toggle promotes its fade, its travel and its shadow by their first frame, and drops them only after they rest', async ({
    page,
  }) => {
    const {driver, input, center} = await openSwitch(page);
    await page.evaluate(() => {
      const track = document.querySelector(
        '#storybook-root .astryx-switch',
      ) as HTMLElement;
      const thumb = document.querySelector(
        '#storybook-root .astryx-switch-thumb',
      ) as HTMLElement;
      // A curve the element or pseudo-element moves on: a hold lasts 1 ms.
      const moves = (
        element: HTMLElement,
        pseudo: string | null,
        property: string,
      ) =>
        element.getAnimations({subtree: true}).some(animation => {
          const effect = animation.effect as KeyframeEffect;
          return (
            effect.target === element &&
            (effect.pseudoElement ?? null) === pseudo &&
            Number(effect.getTiming().duration) > 1 &&
            effect.getKeyframes().some(frame => property in frame)
          );
        });
      const w = window as unknown as {
        __promotion: {
          t: number;
          fade?: string;
          travel?: string;
          shadow?: string;
        }[];
      };
      w.__promotion = [];
      const start = performance.now();
      const tick = () => {
        w.__promotion.push({
          t: performance.now() - start,
          fade: moves(track, '::after', 'opacity')
            ? getComputedStyle(track, '::after').willChange
            : undefined,
          travel: moves(thumb, null, 'translate')
            ? getComputedStyle(thumb).willChange
            : undefined,
          shadow: moves(thumb, '::after', 'opacity')
            ? getComputedStyle(thumb, '::after').willChange
            : undefined,
        });
        if (performance.now() - start < 3000) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
    await driver.play(tap(center));
    await expect(input).toBeChecked();
    await page.waitForFunction(
      () =>
        ((window as unknown as {__promotion: {t: number}[]}).__promotion.at(-1)
          ?.t ?? 0) >= 3000,
    );
    const frames = await page.evaluate(
      () =>
        (
          window as unknown as {
            __promotion: {
              t: number;
              fade?: string;
              travel?: string;
              shadow?: string;
            }[];
          }
        ).__promotion,
    );
    for (const [kind, property] of [
      ['fade', 'opacity'],
      ['travel', 'translate'],
      ['shadow', 'opacity'],
    ] as const) {
      const moving = frames.filter(frame => frame[kind] != null);
      expect(moving.length, `the ${kind} moved on no frame`).toBeGreaterThan(0);
      // From its first frame to its last, it has a layer.
      for (const frame of moving) {
        expect(
          frame[kind],
          `the ${kind} at ${Math.round(frame.t)} ms`,
        ).toContain(property);
      }
      // At the end it rests: no curve, so no layer.
      expect(
        frames[frames.length - 1][kind],
        `the ${kind} at the end`,
      ).toBeUndefined();
    }
    const resting = await page.evaluate(() => {
      const track = document.querySelector(
        '#storybook-root .astryx-switch',
      ) as HTMLElement;
      const thumb = document.querySelector(
        '#storybook-root .astryx-switch-thumb',
      ) as HTMLElement;
      return [
        getComputedStyle(track, '::after').willChange,
        getComputedStyle(thumb).willChange,
        getComputedStyle(thumb, '::after').willChange,
      ];
    });
    expect(
      resting,
      'will-change at rest: the track’s ::after, the thumb, its ::after',
    ).toEqual(['auto', 'auto', 'auto']);
  });

  test('P1 · a tap toggles at the release: the thumb travels and the track turns on, and the lift settles back', async ({
    page,
  }) => {
    const {driver, input, thumb, center} = await openSwitch(page);
    await expect(input).not.toBeChecked();
    expect(await thumbOffset(page)).toBeCloseTo(0, 0);
    await driver.play(tap(center, {holdMs: 50}));
    await expect(input).toBeChecked();
    await waitForSwitchRest(page, thumb);
    const rest = await presented(page);
    expect(rest.scaleX).toBeCloseTo(1, 2);
    expect(rest.on).toBeCloseTo(1, 2);
    expect(rest.fill).toBeCloseTo(1, 2);
    expect(await thumbOffset(page)).toBeCloseTo(TRAVEL_PX, 0);
  });

  test('P2 · a hold lifts the thumb inside the track and shows the pressed overlay, and the release toggles', async ({
    page,
  }) => {
    const {driver, input, center} = await openSwitch(page);
    const script = tap(center, {holdMs: 700});
    let held: Presented | null = null;
    let press: string | null = null;
    let layer: number | null = null;
    let thumbLayer: number | null = null;
    await driver.play(script, {
      onEvent: async step => {
        if (step.type === 'touchStart') {
          await page.waitForTimeout(500);
          held = await presented(page);
          press = await pressState(page);
          layer = await pressLayer(page);
          thumbLayer = await pressLayer(page, 'thumb');
        }
      },
    });
    expect(held).not.toBeNull();
    // The thumb grows into half the gap around it and keeps its fill. The row
    // is pressed, and the track's press layer (its ::before, under the thumb)
    // shows the pressed overlay in full.
    expect(held!.scaleX).toBeCloseTo(LIFT_SCALE, 2);
    expect(held!.scaleY).toBeCloseTo(LIFT_SCALE, 2);
    expect(held!.fill).toBeCloseTo(1, 2);
    expect(press).toBe('on');
    expect(layer).toBeCloseTo(1, 2);
    // The thumb paints it too (design:user-states DR1: track and thumb).
    expect(thumbLayer).toBeCloseTo(1, 2);
    await expect(input).toBeChecked();
    // Released: the layer is gone once its fade ends.
    await expect.poll(async () => pressLayer(page, 'thumb')).toBeNull();
  });

  for (const direction of ['ltr', 'rtl'] as const) {
    test(`a lifted thumb dragged far past either end stays inside the track (${direction})`, async ({
      page,
    }) => {
      const {driver, center} = await openSwitch(page, 'core-switch--default', {
        direction,
      });
      const toEnd = direction === 'ltr' ? 1 : -1;
      const boxes: {thumbs: number; thumb: DOMRect; track: DOMRect}[] = [];
      const read = async () =>
        page.evaluate(() => {
          const thumbs = document.querySelectorAll<HTMLElement>(
            '#storybook-root .astryx-switch-thumb',
          );
          const thumb = thumbs[0];
          const toJSON = (r: DOMRect) => r.toJSON() as DOMRect;
          return {
            thumbs: thumbs.length,
            thumb: toJSON(thumb.getBoundingClientRect()),
            track: toJSON(thumb.parentElement!.getBoundingClientRect()),
          };
        });
      // Held, then 160 px past the inline end, then 160 px past the inline
      // start, the finger resting at each so the thumb settles there.
      const far = 160;
      const out = {x: center.x + toEnd * far, y: center.y};
      const back = {x: center.x - toEnd * far, y: center.y};
      const script = [
        ...drag(center, out, {durationMs: 400, holdMs: 300}).slice(0, -1),
        ...drag(out, back, {durationMs: 600, restMs: 300})
          .slice(1)
          .map(frame => ({...frame, t: frame.t + 1200})),
      ];
      await driver.play(script, {
        onEvent: async step => {
          if (step.type === 'touchMove') {
            boxes.push(await read());
          }
        },
      });
      expect(boxes.length).toBeGreaterThan(10);
      // Present and painted first: one thumb in every read, with a box, on a
      // track at its own size. So the bounds below hold for a real thumb.
      for (const {thumbs, thumb, track} of boxes) {
        expect(thumbs).toBe(1);
        expect(thumb.width).toBeGreaterThan(0);
        expect(thumb.height).toBeGreaterThan(0);
        expect(track.width).toBeCloseTo(TRACK.width, 1);
        expect(track.height).toBeCloseTo(TRACK.height, 1);
      }
      for (const {thumb, track} of boxes) {
        expect(thumb.left).toBeGreaterThanOrEqual(track.left - 0.01);
        expect(thumb.right).toBeLessThanOrEqual(track.right + 0.01);
        expect(thumb.top).toBeGreaterThanOrEqual(track.top - 0.01);
        expect(thumb.bottom).toBeLessThanOrEqual(track.bottom + 0.01);
      }
      // It did reach both ends.
      const centers = boxes.map(
        b => (b.thumb.left + b.thumb.right) / 2 - b.track.left,
      );
      expect(Math.min(...centers)).toBeLessThan(TRACK.height / 2 + 0.5);
      expect(Math.max(...centers)).toBeGreaterThan(
        TRACK.width - TRACK.height / 2 - 0.5,
      );
    });
  }

  test('a tap activates the switch through the browser’s own click (spec:AST-094 FR11)', async ({
    page,
  }) => {
    const {driver, input, center} = await openSwitch(page);
    await page.evaluate(() => {
      const w = window as unknown as {__clicks: boolean[]};
      w.__clicks = [];
      document
        .querySelector('#storybook-root [role="switch"]')!
        .addEventListener('click', event => w.__clicks.push(event.isTrusted));
    });
    await tapForClick(driver, center);
    await expect(input).toBeChecked();
    const clicks = await page.evaluate(
      () => (window as unknown as {__clicks: boolean[]}).__clicks,
    );
    expect(clicks).toEqual([true]);
  });

  test('under a finger the thumb is the circle a mouse sees, at each state’s size (Switch FR13)', async ({
    page,
  }) => {
    const {driver, input, thumb, center} = await openSwitch(page);
    const read = async () =>
      page.evaluate(() => {
        const t = document.querySelector<HTMLElement>(
          '#storybook-root .astryx-switch-thumb',
        )!;
        const style = getComputedStyle(t);
        return {
          width: parseFloat(style.width),
          height: parseFloat(style.height),
          radius: style.borderTopLeftRadius,
        };
      });
    // Off: the md thumb is 16 × 16, as with a mouse.
    expect(await read()).toEqual({
      width: THUMB_OFF,
      height: THUMB_OFF,
      radius: expect.stringMatching(/px$/),
    });
    await driver.play(tap(center, {holdMs: 50}));
    await expect(input).toBeChecked();
    await waitForSwitchRest(page, thumb);
    // On: 20 × 20, as with a mouse; the touch layer moves it, never reshapes it.
    const on = await read();
    expect(on.width).toBe(THUMB_ON);
    expect(on.height).toBe(THUMB_ON);
  });

  test('under a coarse pointer the switch’s hit area grows to 44 × 44 px, centered on the track, with nothing visible added', async ({
    page,
  }) => {
    const {driver, input, center} = await openSwitch(page);
    await waitForHitArea(page);
    const boxes = await page.evaluate(() => {
      const i = document.querySelector<HTMLElement>(
        '#storybook-root [role="switch"]',
      )!;
      const k = document.querySelector<HTMLElement>(
        '#storybook-root .astryx-switch',
      )!;
      const r = i.getBoundingClientRect();
      const t = k.getBoundingClientRect();
      return {
        hit: {
          width: r.width,
          height: r.height,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
        },
        track: {
          width: t.width,
          height: t.height,
          cx: t.left + t.width / 2,
          cy: t.top + t.height / 2,
        },
        opacity: getComputedStyle(i).opacity,
      };
    });
    expect(boxes.hit.width).toBeGreaterThanOrEqual(44);
    expect(boxes.hit.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(boxes.hit.cx - boxes.track.cx)).toBeLessThan(0.5);
    expect(Math.abs(boxes.hit.cy - boxes.track.cy)).toBeLessThan(0.5);
    // Nothing visible changes: the track keeps its size and the input stays
    // invisible.
    expect(boxes.track).toMatchObject({
      width: TRACK.width,
      height: TRACK.height,
    });
    expect(boxes.opacity).toBe('0');
    // A tap 18 px above the thumb's center, outside the 24 px track but
    // inside the hit area, toggles the switch.
    await tapForClick(driver, {x: center.x, y: center.y - 18});
    await expect(input).toBeChecked();
  });

  test('under a coarse pointer the hit area stops halfway to a link beside it: a tap on the link is the link’s, a tap nearer the switch toggles it', async ({
    page,
  }) => {
    const {driver, input} = await openSwitch(
      page,
      'core-switch--beside-a-link',
    );
    await waitForHitArea(page);
    const boxes = await page.evaluate(() => {
      const i = document.querySelector<HTMLElement>(
        '#storybook-root [role="switch"]',
      )!;
      const surface = i.parentElement!;
      const link = document.querySelector<HTMLElement>('#storybook-root a')!;
      const box = (e: HTMLElement) => {
        const r = e.getBoundingClientRect();
        return {left: r.left, right: r.right, top: r.top, bottom: r.bottom};
      };
      return {
        switches: document.querySelectorAll('#storybook-root [role="switch"]')
          .length,
        links: document.querySelectorAll('#storybook-root a').length,
        hit: box(i),
        switch: box(surface),
        link: box(link),
      };
    });
    // Present and painted first: one switch and one link, each with a box.
    expect(boxes.switches).toBe(1);
    expect(boxes.links).toBe(1);
    for (const b of [boxes.switch, boxes.link]) {
      expect(b.right - b.left).toBeGreaterThan(0);
      expect(b.bottom - b.top).toBeGreaterThan(0);
    }
    const gap = boxes.link.left - boxes.switch.right;
    expect(gap).toBeGreaterThan(0);
    // The right side stops at half the gap; the other sides grow to 44 px.
    expect(boxes.hit.right).toBeCloseTo(boxes.switch.right + gap / 2, 0);
    expect(boxes.hit.bottom - boxes.hit.top).toBeCloseTo(44, 0);
    const y = (boxes.switch.top + boxes.switch.bottom) / 2;
    // 2 px inside the link: the link's. A tap in the gap is the engine's to
    // adjust: WebKit moves it to the nearest target that takes taps.
    await tapForClick(driver, {x: boxes.link.left + 2, y});
    await expect(input).not.toBeChecked();
    await expect(page).toHaveURL(/#wifi-details$/);
    // 1.5 px from the switch: the switch's.
    await tapForClick(driver, {x: boxes.switch.right + 1.5, y});
    await expect(input).toBeChecked();
  });

  test('the touch press is a layer on the track, absent at rest, released on the shared release’s clock and curve on the compositor', async ({
    page,
  }, testInfo) => {
    const {driver, center} = await openSwitch(page);
    // At rest the track has no press layer: it exists only while the row is
    // pressed or releasing.
    expect(await pressLayer(page)).toBeNull();
    // Gate the page's timers before the press, so the release timer (which
    // removes the attribute when the clock runs out) holds while seeking.
    await installTimerGate(page);
    await holdReleaseWhenFading(page);
    // Hold each CSS animation of the row from its start, in the page. A
    // loaded machine can reach the hold below after the release has ended.
    // Its keyframes and timing are untouched; the curve is read by seeking.
    await page.evaluate(() => {
      const row = document.querySelector(
        '#storybook-root [data-astryx-pressable]',
      )!;
      row.addEventListener(
        'animationstart',
        event => {
          for (const animation of (event.target as Element).getAnimations({
            subtree: false,
          })) {
            if (
              animation instanceof CSSAnimation &&
              animation.animationName ===
                (event as AnimationEvent).animationName
            ) {
              animation.playbackRate = 0;
            }
          }
        },
        {capture: true},
      );
    });
    await driver.play(tap(center, {holdMs: 400}));
    expect(await pressState(page)).toBe('fading');
    await freezeTimers(page);
    const row = page.locator('#storybook-root [data-astryx-pressable]').first();
    const exit = await exitOf(row);
    const held = await holdAnimations(page, row, {
      judges: [
        {
          target: page.locator('#storybook-root .astryx-switch').first(),
          property: 'opacity',
          pseudoElement: '::before',
        },
        {
          target: page.locator('#storybook-root .astryx-switch-thumb').first(),
          property: 'opacity',
          pseudoElement: '::before',
        },
      ],
    });
    // One CSS animation per press layer runs the release, the track's and
    // the thumb's (design:user-states DR1), each its opacity on the shared
    // release's clock. The row's strength has no release of its own under a finger (no
    // main-thread fade), and the lift and travel are the animator's.
    const css = held.filter(a => a.kind === 'CSSAnimation');
    expect(
      css.map(a => (a.target ?? '').split('.')[1]).sort(),
      JSON.stringify(held),
    ).toEqual(['astryx-switch', 'astryx-switch-thumb']);
    for (const animation of css) {
      expect(animation.durationMs).toBe(exit.ms);
    }
    // The lift's settle started at the lift's touch event, a frame or two
    // before the attribute's change started the release. So seek on the
    // release's own clock.
    const samples: {t: number; value: number}[] = [];
    for (const t of timeline(exit.ms)) {
      await seekAnimations(page, t + css[0].offsetMs);
      samples.push({t, value: (await pressLayer(page)) ?? 0});
    }
    await restoreHeldRates(page);
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    const comparison = compareCurve(samples, t => strengthAt(exit, t), 0.005);
    await writeEvidence(
      'curves/switch-press-release',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {
            releaseMs: exit.ms,
            curve: exit.curve,
            held,
            samples,
            comparison,
          },
          null,
          2,
        ),
      },
      testInfo,
    );
    expect(samples[0].value).toBeCloseTo(1, 2);
    expect(
      comparison.maxError,
      JSON.stringify(comparison.worst),
    ).toBeLessThanOrEqual(0.005);
    await expect.poll(async () => pressState(page)).toBeNull();
    expect(await pressLayer(page)).toBeNull();
  });

  test('the press layers’ release plays the theme’s exit duration, no longer than DR2’s bound under Reduce Motion', async ({
    page,
  }) => {
    // The shared release plays `--duration-exit` (spec:AST-094 FR5); under
    // Reduce Motion it is no longer than design:reduced-motion DR2's bound.
    const releaseMsUnder = async (
      reducedMotion: 'reduce' | 'no-preference',
    ): Promise<number[]> => {
      await page.emulateMedia({reducedMotion});
      const {driver, center} = await openSwitch(page);
      // On the pressable itself: a theme root nearer than the document
      // declares its own exit duration.
      await page.evaluate(() =>
        document
          .querySelector<HTMLElement>(
            '#storybook-root [data-astryx-pressable]',
          )!
          .style.setProperty('--duration-exit', '333ms'),
      );
      // Hold the release timer and each release animation from its start, so
      // a loaded machine still reads them before the clock runs out.
      await installTimerGate(page);
      await holdReleaseWhenFading(page);
      await page.evaluate(() => {
        document
          .querySelector('#storybook-root [data-astryx-pressable]')!
          .addEventListener(
            'animationstart',
            event => {
              for (const animation of (event.target as Element).getAnimations({
                subtree: false,
              })) {
                if (animation instanceof CSSAnimation) {
                  animation.playbackRate = 0;
                }
              }
            },
            {capture: true},
          );
      });
      await driver.play(tap(center, {holdMs: 400}));
      expect(await pressState(page)).toBe('fading');
      await freezeTimers(page);
      const row = page
        .locator('#storybook-root [data-astryx-pressable]')
        .first();
      const css = (
        await holdAnimations(page, row, {
          judges: [
            {
              target: page.locator('#storybook-root .astryx-switch').first(),
              property: 'opacity',
              pseudoElement: '::before',
            },
            {
              target: page
                .locator('#storybook-root .astryx-switch-thumb')
                .first(),
              property: 'opacity',
              pseudoElement: '::before',
            },
          ],
        })
      ).filter(a => a.kind === 'CSSAnimation');
      // Present first: the track's layer and the thumb's.
      expect(css.map(a => (a.target ?? '').split('.')[1]).sort()).toEqual([
        'astryx-switch',
        'astryx-switch-thumb',
      ]);
      await restoreHeldRates(page);
      await releaseAnimations(page, {finish: true});
      await thawTimers(page);
      return css.map(a => a.durationMs);
    };
    for (const [reducedMotion, releaseMs] of [
      ['no-preference', 333],
      ['reduce', REDUCED_FADE_MAX_MS],
    ] as const) {
      const durations = await releaseMsUnder(reducedMotion);
      for (const durationMs of durations) {
        expect(
          durationMs,
          `${reducedMotion}: ${durations.join(', ')}`,
        ).toBeCloseTo(releaseMs, 6);
      }
    }
  });

  /**
   * The element under a held finger, read 300 ms into a 600 ms hold and
   * again after the lift. It records its role, how it selects text, and
   * whether an inline lock is on it.
   */
  interface HeldHit {
    role: string | null;
    userSelect: string;
    locked: boolean;
  }
  async function hitDuringHold(
    page: Page,
    driver: TouchDriver,
    at: {x: number; y: number},
  ): Promise<{during: HeldHit | null; after: HeldHit | null}> {
    const read = async () =>
      page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (el == null) {
          return null;
        }
        const style = getComputedStyle(el);
        return {
          role: el.getAttribute('role'),
          userSelect:
            style.getPropertyValue('-webkit-user-select') || style.userSelect,
          locked:
            el.style.getPropertyValue('user-select') === 'none' ||
            el.style.getPropertyValue('-webkit-user-select') === 'none',
        };
      }, at);
    let during: HeldHit | null = null;
    await driver.play(tap(at, {holdMs: 600}), {
      onEvent: async step => {
        if (step.type === 'touchStart') {
          await page.waitForTimeout(300);
          during = await read();
        }
      },
    });
    // The lock lets go when the contact ends; read it after the release's
    // click wait, on the page's own timers.
    await afterPageTimer(page, BROWSER_CLICK_WAIT_MS);
    return {during, after: await read()};
  }

  test('P2 · a long press on the label selects natively, a tap selects nothing, and no press leaves selection suppressed (spec:AST-094 FR41)', async ({
    page,
  }) => {
    // The Switch defines no hold action. So, like a checkbox row's label, its
    // label keeps the browser's long-press selection. A tap activates and
    // never selects, and any suppression lasts only for its press.
    const {driver, input, center} = await openSwitch(page);
    const label = page
      .locator('#storybook-root')
      .getByText('Enable notifications', {exact: true});
    const box = await label.boundingBox();
    if (box == null) {
      throw new Error('no label');
    }
    const onLabel = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    const onText = await hitDuringHold(page, driver, onLabel);
    expect(onText.during).not.toBeNull();
    expect(onText.during?.userSelect).not.toBe('none');
    expect(onText.during?.locked).toBe(false);
    expect(onText.after?.locked).toBe(false);
    // A hold on the switch suppresses nothing past its press.
    const onSwitch = await hitDuringHold(page, driver, center);
    expect(onSwitch.after?.locked).toBe(false);
    // A tap activates and selects nothing.
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const wasOn = await input.isChecked();
    await driver.play(tap(center));
    await expect(input).toBeChecked({checked: !wasOn});
    expect(
      await page.evaluate(() => window.getSelection()?.toString() ?? ''),
    ).toBe('');
  });

  test('P3 · a drag flips once the finger is the track minus the thumb past where it landed, and the release commits it', async ({
    page,
  }) => {
    const {driver, input, onLayer, center} = await openSwitch(page);
    const script = drag(
      center,
      {x: center.x + FLIP_DISTANCE + 6, y: center.y},
      {durationMs: 600, holdMs: 300, restMs: 200},
    );
    const onAt: {dx: number; on: number; press: string | null}[] = [];
    await driver.play(script, {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          onAt.push({
            dx: step.fingers[0].x - center.x,
            on: Number(
              await onLayer.evaluate(
                el => getComputedStyle(el, '::after').opacity,
              ),
            ),
            press: await pressState(page),
          });
        }
      },
    });
    // The pressed overlay stays on through the whole drag (design:user-states
    // DR1: during a hold or drag).
    expect(onAt.length).toBeGreaterThan(3);
    expect(onAt.every(s => s.press === 'on')).toBe(true);
    // The track turned on during the drag, only after the flip distance.
    const before = onAt.filter(s => s.dx < FLIP_DISTANCE - 0.5);
    expect(before.every(s => s.on < 0.01)).toBe(true);
    expect(onAt.at(-1)!.on).toBeGreaterThan(0.1);
    await expect(input).toBeChecked();
  });

  for (const direction of ['ltr', 'rtl'] as const) {
    test(`a press slid off and lifted outside toggles, as UISwitch's does (AST-020 FR9/DEC-5, ${direction})`, async ({
      page,
    }) => {
      // Held, slid 160 px toward the off end (no flip), lifted outside: it
      // toggles.
      {
        const {driver, input, thumb, center} = await openSwitch(
          page,
          undefined,
          {
            direction,
          },
        );
        const sign = direction === 'rtl' ? 1 : -1;
        await driver.play(
          drag(
            center,
            {x: center.x + sign * 160, y: center.y},
            {durationMs: 300, holdMs: 300, restMs: 100},
          ),
        );
        await waitForSwitchRest(page, thumb);
        await expect(input).toBeChecked();
      }
      // Held, flipped by a drag 160 px toward the on end, lifted outside: it
      // commits the side it shows.
      {
        const {driver, input, thumb, center} = await openSwitch(
          page,
          undefined,
          {
            direction,
          },
        );
        const sign = direction === 'rtl' ? -1 : 1;
        await driver.play(
          drag(
            center,
            {x: center.x + sign * 160, y: center.y},
            {durationMs: 300, holdMs: 300, restMs: 100},
          ),
        );
        await waitForSwitchRest(page, thumb);
        await expect(input).toBeChecked();
      }
    });
  }

  test('P4 · a drag past the flip and back to where it landed commits nothing', async ({
    page,
  }) => {
    const {driver, input, thumb, center} = await openSwitch(page);
    const out = {x: center.x + FLIP_DISTANCE + 6, y: center.y};
    const script = [
      ...drag(center, out, {durationMs: 400, holdMs: 300}).slice(0, -1),
      ...drag(
        out,
        {x: center.x - 4, y: center.y},
        {durationMs: 400, restMs: 200},
      )
        .slice(1)
        .map(frame => ({...frame, t: frame.t + 700})),
    ];
    await driver.play(script);
    await waitForSwitchRest(page, thumb);
    await expect(input).not.toBeChecked();
    expect(await thumbOffset(page)).toBeCloseTo(0, 0);
  });

  test('P5 · a drag shorter than the flip distance toggles at the release, like a tap', async ({
    page,
  }) => {
    const {driver, input, center} = await openSwitch(page);
    await driver.play(
      drag(
        center,
        {x: center.x + FLIP_DISTANCE - 4, y: center.y},
        {durationMs: 300, holdMs: 200, restMs: 150},
      ),
    );
    await expect(input).toBeChecked();
  });

  test('P6 · a quick swipe toward the side it is already on toggles it', async ({
    page,
  }) => {
    const {driver, input, center} = await openSwitch(page);
    await driver.play(
      drag(center, {x: center.x - 30, y: center.y}, {durationMs: 80}),
    );
    await expect(input).toBeChecked();
  });

  test('P7 · a vertical pan that starts on the switch scrolls the page, shows no press, and changes nothing', async ({
    page,
  }) => {
    const {driver, input, thumb, center} = await openSwitch(
      page,
      'core-switch--in-scrolling-list',
    );
    test.skip(
      !driver.drivesNativeGestures,
      'injected touches do not scroll natively in this engine (checked on the iOS simulator instead)',
    );
    // The page scrolls the document: it is the scroll view, so the press
    // waits UIScrollView's content delay and the scroll takes the touch
    // first. UIKit shows no press for a scroll (iOS 26.2, in a table).
    const presses: (string | null)[] = [];
    await driver.play(
      drag(center, {x: center.x, y: center.y - 300}, {durationMs: 300}),
      {
        onEvent: async step => {
          if (step.type === 'touchMove' || step.type === 'touchEnd') {
            presses.push(await pressState(page));
          }
        },
      },
    );
    expect(presses.length).toBeGreaterThan(3);
    expect(presses).not.toContain('on');
    await waitForSwitchRest(page, thumb);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    // The first row starts on and stays on.
    await expect(input).toBeChecked();
    const rest = await presented(page);
    expect(rest.scaleX).toBeCloseTo(1, 2);
    expect(rest.on).toBeCloseTo(1, 2);
  });

  test('P7 · on a page that scrolls, a press waits UIScrollView’s content delay before it shows', async ({
    page,
  }) => {
    // The document is the page's scroll view, as a table is UIKit's. The
    // press waits the content delay, so a scroll takes the touch first. In a
    // table UIKit's press shows ~200 ms after touch-down.
    const {driver, center} = await openSwitch(
      page,
      'core-switch--in-scrolling-list',
    );
    const presses: {at: number; press: string | null}[] = [];
    await driver.play(tap(center, {holdMs: 450}), {
      onEvent: async step => {
        if (step.type === 'touchStart') {
          await page.waitForTimeout(60);
          presses.push({at: 60, press: await pressState(page)});
          await page.waitForTimeout(300);
          presses.push({at: 360, press: await pressState(page)});
        }
      },
    });
    expect(presses).toHaveLength(2);
    expect(presses[0].press).not.toBe('on');
    expect(presses[1].press).toBe('on');
  });

  test('two switches tapped 0.2 s apart leave the page selectable: no page-wide selection lock', async ({
    page,
  }) => {
    const {driver} = await openSwitch(page, 'core-switch--in-scrolling-list');
    const centers = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '#storybook-root .astryx-switch-thumb',
        ),
      )
        .slice(0, 2)
        .map(thumb => {
          const rect = thumb.getBoundingClientRect();
          return {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          };
        }),
    );
    await driver.play(tap(centers[0]));
    await page.waitForTimeout(200);
    await driver.play(tap(centers[1]));
    // Past the last lift's click wait and the shared click guard's window.
    await afterPageTimer(page, BROWSER_CLICK_WAIT_MS + CLICK_GUARD_WINDOW_MS);
    const root = await page.evaluate(() => {
      const html = document.documentElement;
      return {
        inline:
          html.style.getPropertyValue('user-select') +
          html.style.getPropertyValue('-webkit-user-select'),
        computed:
          getComputedStyle(html).getPropertyValue('-webkit-user-select') ||
          getComputedStyle(html).userSelect,
      };
    });
    expect(root.inline).toBe('');
    expect(root.computed).not.toBe('none');
  });

  test('P8 · a held switch in a scrolling list yields a vertical drag to the page: it scrolls and the switch changes nothing (spec:AST-094 FR20)', async ({
    page,
  }) => {
    const {driver, input, thumb, center} = await openSwitch(
      page,
      'core-switch--in-scrolling-list',
    );
    test.skip(
      !driver.drivesNativeGestures,
      'injected touches do not scroll natively in this engine (checked on the iOS simulator instead)',
    );
    // Held 300 ms, then dragged up 200 px: the page scrolls and the switch
    // yields. UISwitch in a table cell would keep the touch.
    await driver.play(
      drag(
        center,
        {x: center.x, y: center.y - 200},
        {durationMs: 300, holdMs: 300},
      ),
    );
    await waitForSwitchRest(page, thumb);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(100);
    await expect(input).toBeChecked();
    const rest = await presented(page);
    expect(rest.scaleX).toBeCloseTo(1, 2);
    expect(rest.on).toBeCloseTo(1, 2);
  });

  test('P9 · a horizontal drag in a scrolling list flips the switch and never scrolls the page', async ({
    page,
  }) => {
    const {driver, input, center} = await openSwitch(
      page,
      'core-switch--in-scrolling-list',
    );
    // The first row starts on: dragging left past the flip distance turns
    // it off, whichever way a held touch is handled.
    await driver.play(
      drag(
        center,
        {x: center.x - FLIP_FROM_ON - 6, y: center.y},
        {durationMs: 400, holdMs: 200, restMs: 150},
      ),
    );
    await expect(input).not.toBeChecked();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('P11 · a mouse click on a touch device toggles once, through the native checkbox', async ({
    page,
  }) => {
    const {input} = await openSwitch(page);
    // A touch device (a coarse primary pointer), clicked with a mouse.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);
    await input.click({force: true});
    await expect(input).toBeChecked();
  });

  test('P11 · under a mouse with Reduce Motion a click changes at once (design:reduced-motion DR3)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 480, height: 320},
      screen: {width: 480, height: 320},
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await openStory(page, storybook(), 'core-switch--default');
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const input = page.locator('#storybook-root').getByRole('switch').first();
      const samples = await sampleChange(page, async () => {
        await input.click();
        // Off the switch: no hover tint on the fill.
        await page.mouse.move(1, 1);
      });
      await expect(input).toBeChecked();
      const last = samples.at(-1)!;
      const changed = samples.findIndex(
        s => Math.abs(s.left - samples[0].left) > 0.5,
      );
      expect(changed).toBeGreaterThan(0);
      for (const sample of samples.slice(changed)) {
        expect(
          Math.abs(sample.left - last.left),
          JSON.stringify(sample),
        ).toBeLessThan(0.5);
        expect(sample.opacity).toBeCloseTo(1, 2);
        expect(sample.scale).toBeCloseTo(1, 2);
      }
    } finally {
      await context.close();
    }
  });

  test('P11 · under a mouse the switch keeps its desktop look: the track’s fill and padding, the thumb’s size and slide', async ({
    browser,
  }) => {
    // A context with no touch screen: the primary pointer is not coarse. A
    // headless box reports no pointer at all. So no touch presentation rule
    // applies, and the switch must look as it always has. Contexts made here
    // inherit the project's phone options unless they are named.
    const context = await browser.newContext({
      viewport: {width: 480, height: 320},
      screen: {width: 480, height: 320},
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      await openStory(page, storybook(), 'core-switch--default');
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const read = async () =>
        page.evaluate(() => {
          const track = document.querySelector<HTMLElement>(
            '#storybook-root .astryx-switch',
          );
          const thumb = track?.querySelector<HTMLElement>(
            '.astryx-switch-thumb',
          );
          if (track == null || thumb == null) {
            throw new Error('the switch has no track or thumb');
          }
          const t = getComputedStyle(track);
          const box = thumb.getBoundingClientRect();
          return {
            fill: t.backgroundColor,
            padding: t.paddingTop,
            fade: t.transitionDuration,
            size: [box.width, box.height],
            slide: getComputedStyle(thumb).transitionProperty,
            // The fade layer (the track's ::after) exists only under a
            // finger, and the thumb sits directly in the track (no wrapper).
            layer: getComputedStyle(track, '::after').display,
            direct: thumb.parentElement === track,
            children: track.children.length,
          };
        });
      const off = await read();
      expect(off.fill).not.toBe('rgba(0, 0, 0, 0)');
      expect(off.padding).toBe('4px');
      expect(off.fade).not.toBe('0s');
      expect(off.size).toEqual([16, 16]);
      expect(off.slide).toBe('transform, width, height');
      expect(off.layer).toBe('none');
      expect(off.direct).toBe(true);
      expect(off.children).toBe(1);

      const input = page.locator('#storybook-root').getByRole('switch');
      await input.click({force: true});
      await expect(input).toBeChecked();
      // The thumb slides and grows over the theme's fast duration.
      await page.waitForTimeout(500);
      const on = await read();
      expect(on.fill).not.toBe('rgba(0, 0, 0, 0)');
      expect(on.fill).not.toBe(off.fill);
      expect(on.size).toEqual([20, 20]);
    } finally {
      await context.close();
    }
  });

  test('a held switch opens no context menu, as UISwitch shows none: the gesture host cancels it while the press is held', async ({
    page,
  }) => {
    const {driver, input, center} = await openSwitch(page);
    const opensMenu = async () =>
      page.evaluate(({x, y}) => {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        });
        document.elementFromPoint(x, y)!.dispatchEvent(event);
        return !event.defaultPrevented;
      }, center);
    expect(await opensMenu()).toBe(true);
    let whileHeld: boolean | null = null;
    await driver.play(tap(center, {holdMs: 600}), {
      onEvent: async step => {
        if (step.type === 'touchStart') {
          await expect.poll(async () => pressState(page)).toBe('on');
          whileHeld = await opensMenu();
        }
      },
    });
    expect(whileHeld).toBe(false);
    // The hold still toggles the switch at the release.
    await expect(input).toBeChecked();
  });

  test('P12 · with Reduce Motion a tap cross-fades the change: no lift, no travel, opacity only, within 200 ms (design:reduced-motion DR1, DR2)', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {driver, input, center} = await openSwitch(page);
    const samples = await sampleChange(page, async () => {
      await tapForClick(driver, center);
    });
    await expect(input).toBeChecked();
    expectCrossFade(samples);
    // It lands at the on end, not a travel past it (iOS 26.2 simulator).
    expect(await thumbOffset(page)).toBeCloseTo(TRAVEL_PX, 0);
  });

  test('P12 · with Reduce Motion a programmatic change cross-fades too (design:reduced-motion DR2)', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openSwitch(page, 'core-switch--controlled-update');
    const samples = await sampleChange(page, async () => {
      await page.getByRole('button', {name: 'Turn on remotely'}).click();
    });
    expectCrossFade(samples);
    expect(await thumbOffset(page)).toBeCloseTo(TRAVEL_PX, 0);
  });

  test('P12 · with Reduce Motion a drag still moves the thumb under the finger, unlifted (direct manipulation)', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {driver, input, center} = await openSwitch(page);
    const samples = await sampleChange(page, async () => {
      await driver.play(
        drag(
          center,
          {x: center.x + FLIP_DISTANCE + 6, y: center.y},
          {durationMs: 400, holdMs: 200, restMs: 100},
        ),
      );
    });
    await expect(input).toBeChecked();
    for (const sample of samples) {
      expect(Math.abs(sample.scale - 1), JSON.stringify(sample)).toBeLessThan(
        0.01,
      );
    }
    // It followed the finger part of the way before the release.
    const start = samples[0].left;
    expect(
      samples.some(s => s.opacity > 0.9 && s.left > start + 6 && s.on < 0.9),
    ).toBe(true);
  });

  test('P13 · RTL: the off thumb rests at the right, and a tap carries it to the left end and turns the track on', async ({
    page,
  }) => {
    const {driver, input, thumb, center} = await openSwitch(
      page,
      'core-switch--default',
      {direction: 'rtl'},
    );
    expect(await input.evaluate(el => getComputedStyle(el).direction)).toBe(
      'rtl',
    );
    expect(await thumbOffset(page)).toBeCloseTo(TRAVEL_PX, 0);
    await driver.play(tap(center, {holdMs: 50}));
    await expect(input).toBeChecked();
    await waitForSwitchRest(page, thumb);
    expect(await thumbOffset(page)).toBeCloseTo(0, 0);
    expect((await presented(page)).on).toBeCloseTo(1, 2);
  });

  test('P13 · RTL: a drag toward the left flips the switch during the drag; a drag toward the right never flips and toggles at the release', async ({
    page,
  }) => {
    // Toward the left: the track turns on once the finger has travelled the
    // flip distance, before the lift.
    {
      const {driver, input, onLayer, center} = await openSwitch(
        page,
        'core-switch--default',
        {direction: 'rtl'},
      );
      const onAt: {dx: number; on: number}[] = [];
      await driver.play(
        drag(
          center,
          {x: center.x - FLIP_DISTANCE - 6, y: center.y},
          {durationMs: 600, holdMs: 300, restMs: 200},
        ),
        {
          onEvent: async step => {
            if (step.type === 'touchMove') {
              onAt.push({
                dx: center.x - step.fingers[0].x,
                on: Number(
                  await onLayer.evaluate(
                    el => getComputedStyle(el, '::after').opacity,
                  ),
                ),
              });
            }
          },
        },
      );
      const before = onAt.filter(s => s.dx < FLIP_DISTANCE - 0.5);
      expect(before.every(s => s.on < 0.01)).toBe(true);
      expect(onAt.at(-1)!.on).toBeGreaterThan(0.1);
      await expect(input).toBeChecked();
    }
    // Toward the right, the side an off switch already is on: no flip
    // during the drag, and the lift toggles like a tap.
    {
      const {driver, input, onLayer, center} = await openSwitch(
        page,
        'core-switch--default',
        {direction: 'rtl'},
      );
      const ons: number[] = [];
      await driver.play(
        drag(
          center,
          {x: center.x + 30, y: center.y},
          {durationMs: 600, holdMs: 300, restMs: 200},
        ),
        {
          onEvent: async step => {
            if (step.type === 'touchMove') {
              ons.push(
                Number(
                  await onLayer.evaluate(
                    el => getComputedStyle(el, '::after').opacity,
                  ),
                ),
              );
            }
          },
        },
      );
      expect(ons.every(on => on < 0.01)).toBe(true);
      await expect(input).toBeChecked();
    }
  });

  /**
   * Records the thumb's on-screen center on animation frames, from the next
   * frame on, with the frame's timestamp: `[ms, px]`. `everyNthFrame` reads
   * only one frame in that many, as a loaded machine reads frames late or
   * misses them while the compositor keeps the thumb moving.
   */
  async function recordThumbCenters(
    page: Page,
    {everyNthFrame = 1}: {everyNthFrame?: number} = {},
  ): Promise<void> {
    await page.evaluate(nth => {
      const box = document.querySelector<HTMLElement>(
        '#storybook-root .astryx-switch-thumb',
      )!;
      const record = window as unknown as {__thumbXs: [number, number][]};
      record.__thumbXs = [];
      let frame = 0;
      const loop = (time: number) => {
        if (frame++ % nth === 0) {
          const rect = box.getBoundingClientRect();
          record.__thumbXs.push([time, rect.left + rect.width / 2]);
        }
        if (record.__thumbXs.length < 240) {
          requestAnimationFrame(loop);
        }
      };
      requestAnimationFrame(loop);
    }, everyNthFrame);
  }

  /** How far into the first travel a frozen catch's second tap lands, ms. */
  const CATCH_AT_MS = 60;

  /**
   * A frozen catch, page ms. `at` is the freeze's instant on the scene's
   * clock. `frozenAt`, `readAt` and `thawedAt` are real times: the freeze, a
   * read before the scene moves on, and the thaw. The scene runs
   * `offsetBefore` behind real time before the freeze, and `offsetAfter`
   * after the thaw.
   */
  interface FrozenCatch {
    at: number;
    frozenAt: number;
    readAt: number;
    thawedAt: number;
    offsetBefore: number;
    offsetAfter: number;
  }

  /**
   * P14's two taps. The second lands at a point of the scene's own time. The
   * scene stops in the first lift's own task, before the switch hears it, so
   * the travel starts held at its start. The scene then moves on
   * `CATCH_AT_MS`, takes the second tap frozen, and thaws. Sent from here
   * once the travel shows, a loaded runner's tap can land after the 0.3 s
   * travel ends. A frozen catch needs `installPageFreeze` before the story
   * loads, then `installTimerGate`.
   */
  async function secondTapMidTravel(
    page: Page,
    driver: TouchDriver,
    center: {x: number; y: number},
    input: Locator,
  ): Promise<FrozenCatch> {
    const finger = {id: 0, ...center};
    /** The thumb's center as the page draws it now, px. */
    const thumbCenter = async () =>
      page.evaluate(() => {
        const box = document
          .querySelector<HTMLElement>('#storybook-root .astryx-switch-thumb')!
          .getBoundingClientRect();
        return box.left + box.width / 2;
      });
    // Each tap is the browser's click (WebKit's comes only from its own tap
    // path).
    const tapWith = async (liftMs: number) => {
      if (driver.engine === 'webkit') {
        await driver.tap(center);
      } else {
        await driver.play([
          {t: 0, fingers: [finger]},
          {t: liftMs, fingers: []},
        ]);
      }
    };
    /** The freeze's own clock readings, in the page. */
    const readFreeze = async () =>
      page.evaluate(() => {
        const freeze = (
          window as unknown as {
            __harnessFreeze: {realNow(): number; offset: number};
          }
        ).__harnessFreeze;
        return {
          now: performance.now(),
          real: freeze.realNow(),
          offset: freeze.offset,
        };
      });
    await freezePageOn(page, 'pointerup');
    await tapWith(40);
    await expect(input).toBeChecked();
    const atFreeze = await readFreeze();
    await advanceFrozenPage(page, CATCH_AT_MS);
    const drawn = await thumbCenter();
    await tapWith(30);
    await expect(input).not.toBeChecked();
    // The return starts where the frozen scene drew the thumb. The frames
    // cannot show this alone: a slow thaw lets the tap's own frame replace
    // the drawn one.
    expect(
      Math.abs((await thumbCenter()) - drawn),
      'the catch starts at the drawn thumb',
    ).toBeLessThan(1);
    await thawPage(page);
    const {offset} = await readFreeze();
    return {
      at: atFreeze.now,
      frozenAt: atFreeze.now + atFreeze.offset,
      readAt: atFreeze.real,
      thawedAt: atFreeze.now + CATCH_AT_MS + offset,
      offsetBefore: atFreeze.offset,
      offsetAfter: offset,
    };
  }

  /**
   * Chromium's catch frames on the scene's clock. The cast stamps real time
   * and sends no frame while the scene stands still. So on its stamps, the
   * first frame after the thaw sits the whole frozen span after the frozen
   * one. A jump there would read as that span's slow motion. Of the frames
   * sent after the read, while frozen, the last one shows the caught thumb.
   * That is the scene's move on, or the tap's return, which starts there
   * (`secondTapMidTravel` checks it). It takes the freeze's instant plus
   * `CATCH_AT_MS`.
   */
  function onSceneClock(
    samples: [number, number][],
    {at, frozenAt, readAt, thawedAt, offsetBefore, offsetAfter}: FrozenCatch,
    timeOrigin: number,
  ): [number, number][] {
    const timed = samples.map(([t, x]) => [t - timeOrigin, x] as const);
    const frozen = timed.filter(([t]) => t >= readAt && t < thawedAt);
    // Present: the cast shows the caught thumb while the scene stands still.
    expect(frozen.length, 'a frame of the frozen catch').toBeGreaterThan(0);
    return [
      ...timed
        .filter(([t]) => t < frozenAt)
        .map(([t, x]): [number, number] => [t - offsetBefore, x]),
      [at + CATCH_AT_MS, frozen[frozen.length - 1][1]],
      ...timed
        .filter(([t]) => t >= thawedAt)
        .map(([t, x]): [number, number] => [t - offsetAfter, x]),
    ];
  }

  /**
   * Records the thumb's center through a catch, `[ms, px]`. Chromium's
   * samples are the frames the compositor presents (a screencast and a
   * marker on the thumb). A starved main thread runs its frame callbacks
   * late, with the frame's old time. A read there can stamp a later picture
   * with an earlier time. WebKit's are its animation frames.
   */
  async function recordCatch(
    page: Page,
    thumb: Locator,
    browserName: string,
  ): Promise<{
    stop: (scene: FrozenCatch | null) => Promise<[number, number][]>;
  }> {
    if (browserName !== 'chromium') {
      // Frame callbacks read the page's clock and wait out a freeze, so these
      // samples are on the scene's clock already. The first one is the thumb
      // at rest: a freeze that lands before it would hold it until the thaw.
      await recordThumbCenters(page);
      await page.waitForFunction(
        () =>
          (window as unknown as {__thumbXs: [number, number][]}).__thumbXs
            .length > 0,
      );
      return {
        stop: async () =>
          page.evaluate(
            () =>
              (window as unknown as {__thumbXs: [number, number][]}).__thumbXs,
          ),
      };
    }
    await markElement(thumb, {size: 6, inset: 2});
    const cast = await startScreencast(page);
    return {
      stop: async scene => {
        const tracked = await trackMarker(page, await cast.stop());
        const shown = tracked.filter(
          (f): f is typeof f & {box: NonNullable<typeof f.box>} =>
            f.box != null && f.box.width > 0 && f.box.height > 0,
        );
        // Present and painted first: the marked thumb in the frames, with a
        // box.
        expect(shown.length).toBeGreaterThan(10);
        const samples = shown.map((f): [number, number] => [
          f.t,
          f.box.x + f.box.width / 2,
        ]);
        return scene == null
          ? samples
          : onSceneClock(
              samples,
              scene,
              await page.evaluate(() => performance.timeOrigin),
            );
      },
    };
  }

  function expectCaughtWithoutAJump(
    samples: [number, number][],
    read: [number, number][] = samples,
  ): void {
    const xs = samples.map(([, x]) => x);
    const farthest = Math.max(...xs) - xs[0];
    // It turned around mid-travel, short of the on end...
    expect(farthest).toBeGreaterThan(1);
    expect(farthest).toBeLessThan(TRAVEL_PX - 1);
    // ...from where it was: no frame moves it more than a few px. Each step is
    // measured against the time its frames span. So a frame read late, two
    // vsyncs of motion in one sample, is not a jump.
    const FRAME_MS = 1000 / 60;
    const perFrame = read
      .slice(1)
      .map(
        ([time, x], i) =>
          (Math.abs(x - read[i][1]) * FRAME_MS) /
          Math.max(time - read[i][0], FRAME_MS),
      );
    expect(Math.max(...perFrame), JSON.stringify(read)).toBeLessThan(4);
  }

  test('P14 · a second tap mid-travel catches the thumb where it is and sends it back, without a jump', async ({
    page,
    browserName,
  }) => {
    await installPageFreeze(page);
    const {driver, input, thumb, center} = await openSwitch(page);
    await installTimerGate(page);
    const record = await recordCatch(page, thumb, browserName);
    const scene = await secondTapMidTravel(page, driver, center, input);
    await waitForSwitchRest(page, thumb);
    const samples = await record.stop(scene);
    await expect(input).not.toBeChecked();
    expect(await thumbOffset(page)).toBeCloseTo(0, 0);
    expectCaughtWithoutAJump(samples);
  });

  test('P14 · with frames read late (one frame in three) the catch still shows no jump', async ({
    page,
    browserName,
  }) => {
    await installPageFreeze(page);
    const {driver, input, thumb, center} = await openSwitch(page);
    await installTimerGate(page);
    const record = await recordCatch(page, thumb, browserName);
    const scene = await secondTapMidTravel(page, driver, center, input);
    await waitForSwitchRest(page, thumb);
    const samples = await record.stop(scene);
    await expect(input).not.toBeChecked();
    expect(await thumbOffset(page)).toBeCloseTo(0, 0);
    // The turn is part of the scene, so every frame reads it. A frame in three
    // can miss it. Only the jump check reads one frame in three.
    expectCaughtWithoutAJump(
      samples,
      samples.filter((_, index) => index % 3 === 0),
    );
  });

  /** The side of the marker on the thumb, px (`markElement`). */
  const MARKER_PX = 6;

  /** The inset that centres the marker on the off thumb (16 px). */
  const MARKER_CENTRE_PX = (THUMB_OFF - MARKER_PX) / 2;

  /**
   * The narrowest box a whole marker can show, px. When the value changes,
   * the thumb's scale carries its old size, down to `THUMB_OFF / THUMB_ON`.
   * At a subpixel offset, the pixel at each edge is only partly covered. A
   * narrower box is a torn frame: the cast caught the marker half drawn.
   */
  const WHOLE_MARKER_PX = Math.ceil((MARKER_PX * THUMB_OFF) / THUMB_ON) - 2;

  /** One 60 Hz frame, ms. */
  const FRAME_60_MS = 1000 / 60;

  /**
   * A translate curve of the thumb, page ms. `made` is when it was made,
   * `start` when the browser started it, and `end` when it stopped. `frames`
   * are its keyframes, `[ms, x px from the rest of the side the switch was
   * on]`.
   */
  interface ThumbCurve {
    made: number;
    start: number | null;
    end: number | null;
    frames: [number, number][];
  }

  /** The thumb's curves, and when the page saw the second lift, page ms. */
  interface ThumbRecord {
    armed: boolean;
    lift: number | null;
    curves: ThumbCurve[];
  }

  /** A critically damped spring fitted to a curve's keyframes, x in px. */
  interface SpringFit {
    start: number;
    residual: number;
    x(at: number): number;
    v(at: number): number;
  }

  /** A frame that no curve the page made shows at that frame's time. */
  class UnprescribedFrameError extends Error {
    override name = 'UnprescribedFrameError';
  }

  /** A curve's keyframes, `[ms, x]`, at `ms`, as the browser plays them. */
  function keyframeAt(frames: number[][], ms: number): number {
    if (ms <= frames[0][0]) {
      return frames[0][1];
    }
    for (let i = 1; i < frames.length; i++) {
      const [[m0, x0], [m1, x1]] = [frames[i - 1], frames[i]];
      if (ms <= m1) {
        return m1 > m0 ? x0 + ((x1 - x0) * (ms - m0)) / (m1 - m0) : x1;
      }
    }
    return frames[frames.length - 1][1];
  }

  /**
   * Fits `spring` (critically damped) toward `target` to `frames`, timed from
   * `start`, page ms. x − target = (a + b·t)·e^(−ωt) is linear in a and b.
   */
  function fitSpring(
    frames: number[][],
    spring: {response: number},
    target: number,
    start: number,
  ): SpringFit {
    const omega = (2 * Math.PI) / spring.response;
    let [s11, s12, s22, y1, y2] = [0, 0, 0, 0, 0];
    for (const [ms, x] of frames) {
      const t = ms / 1000;
      const e = Math.exp(-omega * t);
      s11 += e * e;
      s12 += t * e * e;
      s22 += t * t * e * e;
      y1 += e * (x - target);
      y2 += t * e * (x - target);
    }
    const det = s11 * s22 - s12 * s12;
    const a = (y1 * s22 - y2 * s12) / det;
    const b = (s11 * y2 - s12 * y1) / det;
    const x = (at: number) => {
      const t = Math.max(0, at - start) / 1000;
      return target + (a + b * t) * Math.exp(-omega * t);
    };
    const v = (at: number) => {
      const t = Math.max(0, at - start) / 1000;
      return (b - omega * (a + b * t)) * Math.exp(-omega * t);
    };
    return {
      start,
      x,
      v,
      residual: Math.max(
        ...frames.map(([ms, value]) => Math.abs(x(start + ms) - value)),
      ),
    };
  }

  /** How long after the thaw the page handles the second lift, ms. */
  const LATE_LIFT_MS = 100;
  /**
   * How far the page's wall clock and the test's can differ, ms. Both read
   * the system clock.
   */
  const CLOCK_SKEW_MS = 5;

  /**
   * Starts the two busy-window controls, half a leg apart. It resolves with
   * each one's start on the page clock, epoch ms.
   */
  async function startControls(page: Page): Promise<[number, number]> {
    const first = await startBusyControl(page);
    const ahead = await startBusyControl(page, {ahead: true});
    return [first.start, ahead.start];
  }

  /**
   * The thumb's center in each presented frame, on the page clock, `[ms,
   * px]`. The two controls time each frame by the compositor's own
   * progress, so a late or bunched cast stamp moves nothing. Only frames
   * with a whole marker count, and the run logs how many it drops.
   */
  /**
   * A frame on the page clock: its time, the marker's x, and how many torn
   * frames were dropped just before it.
   */
  type ClockedFrame = [ms: number, px: number, dropsBefore: number];

  async function thumbOnControlClock(
    page: Page,
    castFrames: Parameters<typeof trackMarker>[1],
    starts: [number, number],
  ): Promise<ClockedFrame[]> {
    const pageTime = pageTimesOnControls(await trackControl(page, castFrames), {
      ahead: await trackControl(page, castFrames, {ahead: true}),
      controlStarts: starts,
    });
    const tracked = await trackMarker(page, castFrames);
    const shown = tracked.filter(
      (f): f is typeof f & {box: NonNullable<typeof f.box>} =>
        f.box != null && f.box.width > 0 && f.box.height > 0,
    );
    // Cast frames come in the order the compositor presented them.
    const clocked: ClockedFrame[] = [];
    let dropped = 0;
    let dropsBefore = 0;
    for (const f of [...shown].sort((a, b) => a.t - b.t)) {
      if (f.box.width < WHOLE_MARKER_PX || f.box.height < WHOLE_MARKER_PX) {
        dropped += 1;
        dropsBefore += 1;
        continue;
      }
      const at = pageTime.get(f.t);
      if (at != null) {
        clocked.push([at, f.box.x + f.box.width / 2, dropsBefore]);
        dropsBefore = 0;
      }
    }
    clocked.sort((a, b) => a[0] - b[0]);
    const gaps = clocked.slice(1).map(([at], i) => at - clocked[i][0]);
    test.info().annotations.push({
      type: 'torn marker frames',
      description: `${dropped} of ${shown.length} frames show a marker box under ${WHOLE_MARKER_PX} px; ${clocked.filter(([, , drops]) => drops > 0).length} steps span one; the longest gap is ${(Math.max(0, ...gaps) / FRAME_60_MS).toFixed(1)} frames`,
    });
    return clocked;
  }

  /**
   * Each presented frame's step from the one before, in px per 60 Hz frame. A
   * frame that comes late spans more time, so its step counts per frame. A
   * step across dropped frames counts as the whole move over them, since a
   * skip inside them would show only in part.
   */
  function frameSteps(samples: ReadonlyArray<ClockedFrame>): number[] {
    return samples
      .slice(1)
      .map(
        ([time, x, drops], i) =>
          ((drops + 1) * Math.abs(x - samples[i][1]) * FRAME_60_MS) /
          Math.max(time - samples[i][0], FRAME_60_MS),
      );
  }

  test('P14 · a second tap whose lift the page handles 100 ms after the thaw turns the thumb back from where the screen stands, and every frame shows a curve the page made (spec:AST-094 FR6)', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frame evidence is Chromium-only in Playwright (WebKit: checked on the iOS simulator instead)',
    );
    // The page notes every translate curve of the thumb: when it was made,
    // when the browser started it, and its keyframes. It notes the second
    // lift too. The marks use the page's clocks from before the freeze and the
    // timer gate replaced them, so they read real time from `origin`.
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      const startTime = Object.getOwnPropertyDescriptor(
        Animation.prototype,
        'startTime',
      );
      const startOf = startTime?.get;
      // A start the page sets is noted when it is set: a curve can end before
      // a later frame reads it.
      const recorded = new WeakMap<Animation, ThumbCurve>();
      if (startTime?.get != null && startTime.set != null) {
        const {get, set} = startTime;
        Object.defineProperty(Animation.prototype, 'startTime', {
          configurable: true,
          get(this: Animation): number | null {
            return get.call(this) as number | null;
          },
          set(this: Animation, value: number | null) {
            set.call(this, value);
            const curve = recorded.get(this);
            if (curve != null && value != null) {
              curve.start = value;
            }
          },
        });
      }
      const now = performance.now.bind(performance);
      const frame = requestAnimationFrame.bind(window);
      const w = window as unknown as {__thumb?: ThumbRecord};
      const record: ThumbRecord = {armed: false, lift: null, curves: []};
      w.__thumb = record;
      const onLift = () => {
        if (record.armed && record.lift == null) {
          record.lift = now();
        }
      };
      addEventListener('pointerup', onLift, {capture: true, passive: true});
      addEventListener('touchend', onLift, {capture: true, passive: true});
      Element.prototype.animate = function (keyframes, options) {
        const animation = animate.call(this, keyframes, options);
        if (
          !this.classList.contains('astryx-switch-thumb') ||
          !Array.isArray(keyframes) ||
          !keyframes.some(k => 'translate' in k)
        ) {
          return animation;
        }
        const effect = animation.effect as KeyframeEffect;
        const duration = Number(effect.getTiming().duration);
        const curve: ThumbCurve = {
          made: now(),
          start: null,
          end: null,
          frames: effect
            .getKeyframes()
            .map(k => [
              k.computedOffset * duration,
              Number.parseFloat(String(k.translate)),
            ]),
        };
        record.curves.push(curve);
        recorded.set(animation, curve);
        const readStart = (left: number) =>
          frame(() => {
            const at = startOf?.call(animation);
            if (at != null) {
              curve.start = Number(at);
            } else if (left > 0) {
              readStart(left - 1);
            }
          });
        readStart(60);
        animation.ready.then(
          () => {
            const at = startOf?.call(animation);
            if (at != null) {
              curve.start ??= Number(at);
            }
          },
          () => {},
        );
        const ended = () => {
          curve.end ??= now();
        };
        animation.addEventListener('cancel', ended);
        animation.addEventListener('finish', ended);
        return animation;
      };
    });
    await installPageFreeze(page);
    const {driver, input, thumb, center} = await openSwitch(page, undefined, {
      belowControls: true,
    });
    await installTimerGate(page);
    // The marker sits on the thumb's transform origin in both widths: 16 px
    // off and 20 px on. So the lift's scale and the width change at the catch
    // do not move it.
    await markElement(thumb, {size: MARKER_PX});
    await page.addStyleTag({
      content: `#storybook-root .astryx-switch-thumb [data-harness-marker-chip] { left: calc(50% - ${MARKER_PX / 2}px) !important; top: calc(50% - ${MARKER_PX / 2}px) !important; }`,
    });
    const controls = await startControls(page);
    const cast = await startScreencast(page);
    // The scene freezes at the first lift, where the travel starts. The second
    // finger goes down while the scene stands still. The hold then keeps the
    // page busy, and the second lift waits, until 100 ms after the first frame
    // the page draws unfrozen. Meanwhile the compositor moves the travel on.
    // Only the lift's one event races the hold.
    await freezePageOn(page, 'pointerup');
    await driver.play([
      {t: 0, fingers: [{id: 0, ...center}]},
      {t: 40, fingers: []},
    ]);
    await expect(input).toBeChecked();
    const second = await driver.press(center);
    const hold = await holdInputUntil(page, {afterResumeMs: LATE_LIFT_MS});
    await page.evaluate(() => {
      const record = (window as unknown as {__thumb?: ThumbRecord}).__thumb;
      if (record != null) {
        record.armed = true;
      }
    });
    const beforeThaw = Date.now();
    await thawPage(page);
    await hold.resumed();
    const afterResume = Date.now();
    await second.lift();
    const held = await hold.landed();
    await expect(input).not.toBeChecked();
    await waitForSwitchRest(page, thumb);
    const castFrames = await cast.stop();
    // The hold's marks are on the page's clock, which stands still while the
    // page is frozen: the real time less the frozen span. The cast stamps the
    // real time.
    const {origin, frozenMs} = await page.evaluate(() => ({
      origin: performance.timeOrigin,
      frozenMs: (window as unknown as {__harnessFreeze: {offset: number}})
        .__harnessFreeze.offset,
    }));
    const realAt = (pageMs: number) => origin + pageMs + frozenMs;
    const resumeAt = realAt(held.resumeMs);
    // The resume came after the thaw began and before the test heard of it.
    // On another clock it would sit the frozen span off.
    expect(
      resumeAt,
      `the hold's resume, between the thaw at ${beforeThaw} and its answer at ${afterResume}`,
    ).toBeGreaterThanOrEqual(beforeThaw - CLOCK_SKEW_MS);
    expect(resumeAt).toBeLessThanOrEqual(afterResume + CLOCK_SKEW_MS);
    // The marker's centre in whole marker frames, as the control clock reads it.
    const shown = (await trackMarker(page, castFrames)).flatMap(frame =>
      frame.box == null ||
      frame.box.width < WHOLE_MARKER_PX ||
      frame.box.height < WHOLE_MARKER_PX
        ? []
        : [{t: frame.t, x: frame.box.x + frame.box.width / 2}],
    );
    // The lift reaches the switch mid-travel: after the thumb has moved 1 px,
    // and before it ends. Else the catch proves nothing about a moving thumb.
    const rest = shown[0].x;
    const movedAt = shown.find(frame => frame.x - rest > 1)?.t;
    const endedAt = shown.find(frame => frame.x - rest >= TRAVEL_PX - 1)?.t;
    const liftAt = realAt(held.releasedMs);
    if (movedAt == null || liftAt <= movedAt) {
      throw new LiftPlacementError(
        'the held lift reached the switch before its thumb moved 1 px',
        {liftAt, movedAt: movedAt ?? null},
      );
    }
    if (endedAt != null && liftAt >= endedAt) {
      throw new LiftPlacementError(
        'the held lift reached the switch after its travel ended',
        {liftAt, endedAt},
      );
    }
    // The frames after the thaw, on the real clock: the controls stood still
    // with the scene, so their origins move by the frozen span.
    const samples = await thumbOnControlClock(
      page,
      castFrames.filter(frame => frame.t >= resumeAt - FRAME_60_MS),
      [controls[0] + frozenMs, controls[1] + frozenMs],
    );
    // The frames from the travel's start to its return's end, or the run
    // fails as starved.
    requireFrames(
      samples.map(([t, x]) => ({t, x})),
      {
        min: 10,
        during: 'the travel and its catch',
        where: frame => frame.t >= movedAt - FRAME_60_MS,
      },
    );
    // A retarget starts at the frame that commits it, from the value on
    // screen there (spec:AST-094 FR6). The proof reads the curves the page
    // made and checks every presented frame against them.
    const thumbRecord = await page.evaluate(
      () => (window as unknown as {__thumb?: ThumbRecord}).__thumb,
    );
    if (thumbRecord?.lift == null) {
      throw new Error('the page saw no second lift');
    }
    const liftMark = thumbRecord.lift;
    const travelCurve = thumbRecord.curves
      .filter(curve => curve.made < liftMark && curve.start != null)
      .at(-1);
    if (travelCurve?.start == null) {
      throw new Error('the travel has no started curve');
    }
    const after = thumbRecord.curves.filter(curve => curve.made >= liftMark);
    // The page's marks come after the held lift on the real clock. A mark on
    // the frozen page clock reads the frozen span earlier.
    expect(
      origin + (after[0]?.made ?? Number.POSITIVE_INFINITY),
      'the first curve after the lift comes after the held lift on the real clock',
    ).toBeGreaterThan(liftAt - CLOCK_SKEW_MS);
    const liftPage = liftAt - origin;
    // A curve read from the rest of the side the switch was on, x px from the
    // on side's rest at `at`, page ms. Before its start it shows its first
    // keyframe.
    interface ShownCurve {
      start: number;
      end: number | null;
      x(at: number): number;
    }
    const asShown = (
      curve: ThumbCurve,
      startsAt: number,
      shift: number,
    ): ShownCurve => {
      const frames = curve.frames.map(([ms, x]) => [ms, x + shift]);
      return {
        start: startsAt,
        end: curve.end,
        x: at => keyframeAt(frames, at - startsAt),
      };
    };
    const travelShift =
      Math.abs(
        travelCurve.frames[travelCurve.frames.length - 1][1] - TRAVEL_PX,
      ) < 0.5
        ? -TRAVEL_PX
        : 0;
    const travelFit = fitSpring(
      travelCurve.frames
        .filter(([ms]) => ms < 2000)
        .map(([ms, x]) => [ms, x + travelShift]),
      TRAVEL,
      0,
      travelCurve.start,
    );
    expect(travelFit.residual, 'the travel plays TRAVEL').toBeLessThan(0.5);
    // The curves the browser started after the lift, in the order they were
    // made. A curve read from the other side's rest takes the reading that
    // meets the curve before it.
    const sequence: ShownCurve[] = [
      asShown(travelCurve, travelCurve.start, travelShift),
    ];
    const turns: {curve: ThumbCurve; shift: number}[] = [];
    for (const curve of after) {
      if (curve.start == null) {
        continue;
      }
      const startsAt = curve.start;
      const before = sequence[sequence.length - 1];
      const shift = [0, -TRAVEL_PX].reduce((a, b) =>
        Math.abs(curve.frames[0][1] + b - before.x(startsAt)) <
        Math.abs(curve.frames[0][1] + a - before.x(startsAt))
          ? b
          : a,
      );
      expect(
        startsAt,
        'a curve after the lift starts after the held lift',
      ).toBeGreaterThan(liftPage - CLOCK_SKEW_MS);
      sequence.push(asShown(curve, startsAt, shift));
      turns.push({curve, shift});
    }
    if (turns.length === 0) {
      throw new Error('the late lift sent the travel back on no new curve');
    }
    // Each presented frame shows the newest curve the compositor has, at the
    // frame's own time. That is the travel, a curve started after the lift,
    // or the off side's rest after the last one ends. The curves replace one
    // another only in order.
    const lastEnd = sequence[sequence.length - 1].end;
    const showsAt: number[] = [];
    let index = 0;
    for (const [t, x] of samples) {
      const at = t - origin;
      const onX = x - rest - TRAVEL_PX;
      const valueOf = (i: number) =>
        i < sequence.length ? sequence[i].x(at) : -TRAVEL_PX;
      const candidates = [...Array(sequence.length + 1).keys()].filter(
        i =>
          i >= index &&
          (i === 0 ||
            (i === sequence.length
              ? lastEnd != null && at >= lastEnd - FRAME_60_MS
              : sequence[i].start <= at + 1)),
      );
      const match = candidates.find(i => Math.abs(valueOf(i) - onX) <= 1);
      if (match == null) {
        throw new UnprescribedFrameError(
          `the frame at ${at.toFixed(1)} ms shows ${onX} px, which no curve the page made shows then: ${candidates.map(i => valueOf(i).toFixed(2)).join(', ')} px`,
        );
      }
      index = match;
      showsAt.push(match);
    }
    // Each turn back that the frames show starts within 1 px of the newest
    // curve the browser started before it. It plays TRACKING or TRAVEL, to
    // the off side.
    for (let i = 1; i < sequence.length; i++) {
      if (!showsAt.includes(i)) {
        continue;
      }
      expect(
        Math.abs(
          sequence[i].x(sequence[i].start) -
            sequence[i - 1].x(sequence[i].start),
        ),
        'a turn back starts where the screen stood',
      ).toBeLessThanOrEqual(1);
      const {curve, shift} = turns[i - 1];
      const frames = curve.frames
        .filter(([ms]) => ms < 2000)
        .map(([ms, x]) => [ms, x + shift]);
      expect(
        Math.abs(frames[frames.length - 1][1] + TRAVEL_PX),
        'a curve after the lift turns the thumb back to the off side',
      ).toBeLessThan(0.5);
      const residual = Math.min(
        ...[TRACKING, TRAVEL].map(
          spring =>
            fitSpring(frames, spring, -TRAVEL_PX, sequence[i].start).residual,
        ),
      );
      expect(residual, 'the turn back plays TRACKING or TRAVEL').toBeLessThan(
        0.5,
      );
    }
    const farthest = Math.max(...samples.map(([, x]) => x)) - rest;
    test.info().annotations.push({
      type: 'turn back',
      description: `${turns.length} curve(s) started after the lift; the thumb reached ${farthest} px; the largest frame step ${Math.max(...frameSteps(samples)).toFixed(2)} px`,
    });
    // It turned around mid-travel.
    expect(farthest).toBeGreaterThan(1);
  });

  test('a tap whose first frame the page commits late (its main thread busy for 100 ms after the lift) starts the travel from rest on that frame, not partway into its curve', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frame evidence is Chromium-only in Playwright (WebKit: checked on the iOS simulator instead)',
    );
    const {driver, input, thumb, center} = await openSwitch(page, undefined, {
      belowControls: true,
    });
    // The marker sits at the thumb's centre, so the thumb's scale does not
    // move it.
    await markElement(thumb, {size: MARKER_PX, inset: MARKER_CENTRE_PX});
    // The page blocks in the lift's own dispatch, after the switch's
    // listeners have started the travel. The frame that first shows the
    // travel comes about 100 ms after the switch asked for it. As Core
    // Animation starts an animation at its commit, a block before that frame
    // delays the motion instead of skipping into it.
    await page.evaluate(() => {
      const w = window as unknown as {__block?: {from: number; to: number}};
      addEventListener(
        'touchend',
        () => {
          if (w.__block != null) {
            return;
          }
          const from = performance.timeOrigin + performance.now();
          const end = performance.now() + 100;
          while (performance.now() < end) {
            // the page's main thread is busy
          }
          w.__block = {from, to: performance.timeOrigin + performance.now()};
        },
        {capture: true, passive: true},
      );
    });
    // The marker sits at the thumb's inline start. At rest it moves with the
    // thumb's left edge, since each state has its own thumb size.
    const restLeft = async () =>
      thumb.evaluate(element => element.getBoundingClientRect().left);
    const offLeft = await restLeft();
    const controls = await startControls(page);
    const cast = await startScreencast(page);
    await driver.play(tap(center, {holdMs: 40}));
    await expect(input).toBeChecked();
    await waitForSwitchRest(page, thumb);
    const castFrames = await cast.stop();
    const onLeft = await restLeft();
    const block = await page.evaluate(
      () =>
        (window as unknown as {__block?: {from: number; to: number}}).__block,
    );
    expect(block, 'the page was busy after the lift').toBeDefined();
    const samples = await thumbOnControlClock(page, castFrames, controls);
    expect(samples.length).toBeGreaterThan(10);
    const xs = samples.map(([, x]) => x);
    // It travelled from the off rest to the on rest (the frames place the
    // marker to the whole px)...
    expect(Math.abs(xs.at(-1)! - xs[0] - (onLeft - offLeft))).toBeLessThan(1.5);
    // ...from rest: no presented frame moves it more than a few px from the
    // one before, on the compositor's clock.
    expect(
      Math.max(...frameSteps(samples)),
      JSON.stringify(samples),
    ).toBeLessThan(4);
  });

  test('a disabled or busy switch stays inert under a finger', async ({
    page,
  }) => {
    for (const storyId of ['core-switch--disabled', 'core-switch--loading']) {
      const {driver, input, center} = await openSwitch(page, storyId);
      const wasOn = await input.isChecked();
      let held: Presented | null = null;
      await driver.play(tap(center, {holdMs: 400}), {
        onEvent: async step => {
          if (step.type === 'touchStart') {
            await page.waitForTimeout(250);
            held = await presented(page);
          }
        },
      });
      expect(held!.scaleX, storyId).toBe(1);
      expect(await input.isChecked(), storyId).toBe(wasOn);
    }
  });

  test('the travel and the track colour follow the UIKit springs, sampled frame by frame', async ({
    page,
  }, testInfo) => {
    await openSwitch(page);
    // The travel and the track color, from a programmatic change: the thumb
    // starts at rest, as UISwitch's `setOn(_:animated:)` does.
    await openStory(page, storybook(), 'core-switch--controlled-update');
    const hold = await armHold(
      page,
      page.locator('#storybook-root .astryx-switch'),
      {
        judges: {
          target: page.locator('#storybook-root .astryx-switch-thumb'),
          property: 'translate',
        },
        newOnly: true,
      },
    );
    await page.getByRole('button', {name: 'Turn on remotely'}).click();
    await hold.held();
    const travelSamples = await sampleThumb(page, timeline(500));
    await releaseAnimations(page);
    const travelResult = compareCurve(
      travelSamples.map(s => ({t: s.t, value: s.x})),
      t => -TRAVEL_PX * (1 - springStep(TRAVEL, t)),
      0.15,
    );
    const wellResult = compareCurve(
      travelSamples.map(s => ({t: s.t, value: s.on})),
      t => springStep(WELL_ON, t),
      0.01,
    );
    await writeEvidence(
      'curves/switch',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {travelSamples, travelResult, wellResult},
          null,
          1,
        ),
      },
      testInfo,
    );
    expect(
      travelResult.maxError,
      JSON.stringify(travelResult.worst),
    ).toBeLessThanOrEqual(0.15);
    expect(
      wellResult.maxError,
      JSON.stringify(wellResult.worst),
    ).toBeLessThanOrEqual(0.01);
  });

  test('P10 · the toggle keeps advancing every frame while the main thread is blocked', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      "WebKit's JPEG cast holds color in 2 by 2 pixel blocks, so it cannot read the thumb's sub-pixel travel",
    );
    const {driver, input, thumb, center} = await openSwitch(page, undefined, {
      belowControls: true,
    });
    // The marker sits on the thumb's transform origin, its centre, at either
    // width (16 px off, 20 px on). So neither the lift nor the width change at
    // the value change moves the marker's centre, and the proof reads that.
    await markElement(thumb, {size: 6});
    await page.addStyleTag({
      content:
        '#storybook-root .astryx-switch-thumb [data-harness-marker-chip] { left: calc(50% - 3px) !important; top: calc(50% - 3px) !important }',
    });
    // The harness's busy-window control: a box the compositor moves along the
    // top edge, in the same screencast. Each travel is judged against what the
    // compositor presented in its block, not against a frame rate. Under a CPU
    // quota the compositor presents fewer frames in a block, the control's too.
    const control = await startBusyControl(page);
    // A travel lasts 0.3 s, so one block leaves few frames to judge. The proof
    // pools four runs, on and off twice, and judges them as one longer window.
    // On a loaded machine a run can be starved; the others still count, and
    // each direction keeps at least one judged run.
    const runs: BusyRun[] = [];
    const evidence: unknown[] = [];
    const directions = [true, false, true, false];
    const landings: {inBlock: boolean; gap: number}[] = [];
    for (const on of directions) {
      const cast = await startScreencast(page);
      // The page waits for the travel one frame into its curve, not for the
      // lift's scale, and blocks from a task queued in that frame. So the
      // block holds the same part of the travel whatever the page's timing.
      const held = blockMainThread(page, TOGGLE_BLOCK_MS, {
        during: thumb,
        property: 'translate',
      });
      await driver.play(tap(center, {holdMs: 50}));
      if (on) {
        await expect(input).toBeChecked();
      } else {
        await expect(input).not.toBeChecked();
      }
      const block = await held;
      const travel = block.animation;
      if (travel == null) {
        throw new Error('the block caught no forward travel');
      }
      // The landing compares the block's last frame with one after it. The
      // busy control keeps the cast drawing. Frames reach the test late under
      // load, so wait 150 ms and two more frames, for a second at most.
      const seen = cast.frameCount();
      await page.waitForTimeout(150);
      for (
        let waited = 150;
        cast.frameCount() < seen + 2 && waited < 1000;
        waited += 16
      ) {
        await page.waitForTimeout(16);
      }
      const castFrames = await cast.stop();
      // Only the frames the proof reads are decoded.
      const read = castFrames.filter(
        f =>
          f.t >= block.from - BUSY_PROOF_LOOKAROUND_MS &&
          f.t <= block.to + BUSY_PROOF_LOOKAROUND_MS,
      );
      const tracked = (await trackMarker(page, read, {subpixel: true})).map(
        f =>
          f.box == null
            ? f
            : {...f, box: {...f.box, x: f.box.x + f.box.width / 2}},
      );
      runs.push({
        tracked,
        control: await trackControl(page, read),
        window: {from: block.from, to: Math.min(block.to, travel.to)},
      });
      evidence.push({
        on,
        block,
        travel,
        frames: tracked.map(f => ({
          t: +(f.t - block.from).toFixed(1),
          x: f.box?.x ?? null,
          w: f.box?.width ?? null,
        })),
      });
      // It lands while the thread is still blocked: the last frame the block
      // presented shows the thumb at the rest it keeps.
      const shown = tracked.filter(f => f.box != null);
      const rest = shown.at(-1);
      if (rest?.box == null || rest.t <= block.to) {
        throw new FrameStarvationError({
          during: 'the thumb rested after the block',
          frames: 0,
          min: 1,
          longestGapMs: Math.max(
            0,
            ...read.slice(1).map((frame, i) => frame.t - read[i].t),
          ),
        });
      }
      const last = shown.filter(f => f.t < block.to).at(-1);
      landings.push({
        inBlock: (last?.t ?? 0) > block.from,
        gap: Math.abs((last?.box?.x ?? 0) - rest.box.x),
      });
    }
    await control.remove();
    // The read places the marker under a pixel, in 0.05 px steps. The
    // harness's tail rule stops judging once the travel moves under two steps
    // a frame. On UISwitch's 0.3 s spring, the thumb's 16 px travel does so
    // 0.39 px from rest, 268 ms in. One presented frame cannot show the travel moving,
    // so a run whose control moved on fewer than two frames is too little to
    // judge. At least two runs must count.
    const proof = pooledBusyProof(runs, {
      axis: 'x',
      settledWithin: TOGGLE_TAIL,
      minRunFrames: 2,
      minJudgedRuns: 2,
    });
    await writeEvidence(
      'busy-main-thread/switch-toggle',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {runs: evidence, summary: proof.summary},
          null,
          1,
        ),
      },
      testInfo,
    );
    test.info().annotations.push({
      type: 'busy window',
      description: proof.summary,
    });
    // The travel moves on every frame the control moves on, and in each run
    // it stalls no longer than the control.
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    // The proof claims the travel both ways, so a run each way is judged.
    const judged = directions.filter((_, i) => proof.judged[i]);
    expect(
      judged.includes(true) && judged.includes(false),
      `the judged runs cover both directions. ${proof.summary}`,
    ).toBe(true);
    proof.runs.forEach((run, i) => {
      // A run the pool leaves out is named in the summary and never passes.
      if (!proof.judged[i] || run == null) {
        return;
      }
      // It never steps back...
      expect(run.monotonic, `run ${i + 1}: ${run.summary}`).toBe(true);
      // ...it lands inside its block...
      expect(
        landings[i].inBlock,
        `run ${i + 1}: the block presented a frame. ${run.summary}`,
      ).toBe(true);
      expect(
        landings[i].gap,
        `run ${i + 1}: the block's last frame shows the thumb ${landings[i].gap.toFixed(2)} px from its rest, past the ${TOGGLE_TAIL} px tail. ${run.summary}`,
      ).toBeLessThan(TOGGLE_TAIL);
      // ...and each run's own block shows it at a new position.
      const read = run.control;
      const moved = (read?.movedWith ?? 0) - (read?.belowStep ?? 0);
      expect(
        moved,
        `run ${i + 1}: the travel showed a new position on ${moved} frames in its block. ${run.summary}`,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  test('P10 · the touch press keeps fading out on every frame while the main thread is blocked', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frame evidence is Chromium-only in Playwright (WebKit: checked on the iOS simulator instead)',
    );
    const {driver, input, onLayer, center} = await openSwitch(page);
    // A long exit duration on the pressable, so the block spans enough
    // delivered frames to judge whatever the theme's own value is.
    await page.evaluate(() =>
      document
        .querySelector<HTMLElement>('#storybook-root [data-astryx-pressable]')!
        .style.setProperty('--duration-exit', '400ms'),
    );
    // Only the press layer may change the probe. The thumb is hidden, though
    // its animations still run, and the colour fade is off. The value stays
    // off: every click is stopped before it reaches the input.
    await page.addStyleTag({
      content:
        '#storybook-root .astryx-switch-thumb { visibility: hidden } #storybook-root .astryx-switch::after { display: none !important }',
    });
    await page.evaluate(() => {
      window.addEventListener(
        'click',
        event => {
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        true,
      );
    });
    const box = await onLayer.boundingBox();
    if (box == null) {
      throw new Error('no track');
    }
    const probe = {
      x: box.x + box.width / 2 - 2,
      y: box.y + box.height / 2 - 2,
      width: 4,
      height: 4,
    };
    const cast = await startScreencast(page);
    await driver.play(tap(center, {holdMs: 400}));
    expect(await pressState(page)).toBe('fading');
    // The release is the press layer's CSS animation (the track's ::before);
    // the lift and the travel are the animator's. Block once it has run a
    // frame.
    const release = await page.evaluate(
      async () =>
        new Promise<{from: number; to: number}>(resolve => {
          const track = document.querySelector<HTMLElement>(
            '#storybook-root .astryx-switch',
          )!;
          const poll = () => {
            const layer = track
              .getAnimations({subtree: true})
              .find(
                animation =>
                  animation instanceof CSSAnimation &&
                  (animation.effect as KeyframeEffect | null)?.pseudoElement ===
                    '::before',
              );
            const at = Number(layer?.currentTime ?? 0);
            if (layer?.startTime != null && at >= 16) {
              const from = performance.timeOrigin + Number(layer.startTime);
              const timing = layer.effect!.getComputedTiming();
              resolve({from, to: from + Number(timing.activeDuration)});
              return;
            }
            requestAnimationFrame(poll);
          };
          poll();
        }),
    );
    const block = await blockMainThread(page, 700);
    await page.waitForTimeout(150);
    const frames = await cast.stop();
    await expect(input).not.toBeChecked();
    const lumas = await sampleLuma(page, frames, probe);
    const rest = lumas[0].luma;
    const pressed = Math.min(
      ...lumas.filter(p => p.t < release.from).map(p => p.luma),
    );
    const strength = (v: number) => (rest - v) / (rest - pressed);
    const end = Math.min(block.to, release.to) - 10;
    const during = lumas.filter(p => p.t > block.from && p.t <= end);
    const strengths = during.map(p => ({
      t: +(p.t - block.from).toFixed(1),
      strength: +strength(p.luma).toFixed(3),
    }));
    const intervals = during
      .map((p, i) => (i === 0 ? p.t - block.from : p.t - during[i - 1].t))
      .filter(dt => dt > 0);
    const longestGap = Math.max(
      end - (during.at(-1)?.t ?? block.from),
      ...intervals,
    );
    // The screencast's own delivered cadence: stalls are judged against it,
    // never against a frame rate.
    const sorted = [...intervals].sort((a, b) => a - b);
    const cadence = sorted[Math.floor(sorted.length / 2)] ?? Infinity;
    await writeEvidence(
      'busy-main-thread/switch-press-release',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {block, release, rest, pressed, strengths},
          null,
          1,
        ),
      },
      testInfo,
    );
    const film = await castStoryboard(page, frames, {
      name: 'switch-press-release-busy-main-thread',
      zero: block.from,
      from: release.from - 40,
      to: release.to + 40,
      columns: 6,
      cellScale: 0.45,
      data: t => {
        const p = lumas.find(f => f.t === t);
        return {strength: p == null ? -1 : +strength(p.luma).toFixed(3)};
      },
    });
    await film.write(testInfo, {block, release});
    // The press showed, and its release kept stepping on every frame of the
    // block, never backing up, to well below where it started.
    expect(rest - pressed).toBeGreaterThan(5);
    // Enough delivered frames to judge, and no stall longer than three of
    // them.
    expect(during.length, JSON.stringify(strengths)).toBeGreaterThanOrEqual(5);
    expect(longestGap).toBeLessThanOrEqual(3 * cadence);
    for (let i = 1; i < strengths.length; i++) {
      expect(strengths[i].strength).toBeLessThanOrEqual(
        strengths[i - 1].strength + 0.02,
      );
    }
    const last = strengths.at(-1);
    expect(last).toBeDefined();
    expect(strengths[0].strength).toBeGreaterThan((last?.strength ?? 1) + 0.2);
  });

  test('P10 · the track colour keeps fading in while the main thread is blocked', async ({
    page,
  }, testInfo) => {
    const {
      driver,
      input,
      center,
      onLayer: track,
    } = await openSwitch(page, undefined, {belowControls: true});
    // Hide the thumb and the press layer (their animations still run), so
    // the probe reads the colour fade alone. The track then rests before the
    // fade, and a fade that reaches the screen late is judged from there.
    await page.addStyleTag({
      content:
        '#storybook-root .astryx-switch-thumb, #storybook-root .astryx-switch::before { visibility: hidden }',
    });
    const box = await page
      .locator('#storybook-root .astryx-switch')
      .first()
      .boundingBox();
    if (box == null) {
      throw new Error('no track');
    }
    // The track's colour on a flat part of it, away from its rounded ends:
    // JPEG noise on an edge reads as change.
    const probe = {x: box.x + box.width / 2 - 4, y: box.y + box.height / 2 - 4};
    const starts = await startControls(page);
    // A fade gives few frames in one block. The proof pools two runs, in and
    // then out, and judges them as one longer window.
    const runs: BusyRun[] = [];
    const evidence: unknown[] = [];
    const landings: {inBlock: boolean; gap: number}[] = [];
    for (const on of [true, false]) {
      const cast = await startScreencast(page);
      // The page waits for the track's own fade one frame into its curve, and
      // blocks from a task queued in that frame. A round trip from here would
      // start it late on a loaded runner, after most of the fade.
      const held = blockMainThread(page, 700, {
        during: track,
        pseudoElement: '::after',
      });
      await driver.play(tap(center, {holdMs: 50}));
      if (on) {
        await expect(input).toBeChecked();
      } else {
        await expect(input).not.toBeChecked();
      }
      const block = await held;
      const fade = block.animation;
      if (fade == null) {
        throw new Error('the block caught no forward fade');
      }
      // The landing compares the block's last frame with one after it. The
      // busy control keeps the cast drawing. Frames reach the test late under
      // load, so wait 150 ms and two more frames, for a second at most.
      const seen = cast.frameCount();
      await page.waitForTimeout(150);
      for (
        let waited = 150;
        cast.frameCount() < seen + 2 && waited < 1000;
        waited += 16
      ) {
        await page.waitForTimeout(16);
      }
      const castFrames = await cast.stop();
      // Only the frames the proof reads are decoded.
      const read = castFrames.filter(
        f =>
          f.t >= block.from - BUSY_PROOF_LOOKAROUND_MS &&
          f.t <= block.to + BUSY_PROOF_LOOKAROUND_MS,
      );
      // The red channel's mean in an 8 px square: a scalar on x. With both
      // controls, a WebKit proof judges each frame at its time on the
      // controls' clock, at display rate.
      const control = await trackControl(page, read);
      const ahead = await trackControl(page, read, {ahead: true});
      const colour = await trackBrightness(page, read, {...probe, size: 8});
      runs.push({
        tracked: colour,
        control,
        ahead,
        controlStarts: starts,
        window: {from: block.from, to: Math.min(block.to, fade.to)},
      });
      // The landing reads each frame at its own time on the controls' clock.
      // A frame with no reading there is left out of it.
      const pageTime = pageTimesOnControls(control, {
        ahead,
        controlStarts: starts,
      });
      const tracked = colour
        .flatMap(frame => {
          const at = pageTime.get(frame.t);
          return at == null ? [] : [{...frame, t: at}];
        })
        .sort((a, b) => a.t - b.t);
      evidence.push({
        on,
        block,
        fade,
        frames: tracked.map(f => ({
          t: +(f.t - block.from).toFixed(1),
          red: +(f.box?.x ?? 0).toFixed(1),
        })),
      });
      // It lands while the thread is still blocked: the last frame the block
      // presented shows the colour the track keeps.
      const rest = tracked.at(-1);
      if (rest?.box == null || rest.t <= block.to) {
        throw new FrameStarvationError({
          during: 'the track rested after the block',
          frames: 0,
          min: 1,
          longestGapMs: Math.max(
            0,
            ...read.slice(1).map((frame, i) => frame.t - read[i].t),
          ),
        });
      }
      const last = tracked.filter(f => f.t < block.to).at(-1);
      landings.push({
        inBlock: (last?.t ?? 0) > block.from,
        gap: Math.abs((last?.box?.x ?? 0) - rest.box.x),
      });
    }
    // The harness's tail rule for a curve, on a brightness channel: judging
    // stops once the fade moves under two levels a frame. A loaded cast can
    // then show no change between two frames. On the well springs, critically
    // damped over the track's 166-level red span, that is 16 levels from rest
    // for wellOn and 9 for wellOff. The pool takes one bound, the larger.
    const proof = pooledBusyProof(runs, FADE_PROOF);
    await writeEvidence(
      'busy-main-thread/switch-track-colour',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {runs: evidence, summary: proof.summary},
          null,
          1,
        ),
      },
      testInfo,
    );
    test.info().annotations.push({
      type: 'busy window',
      description: proof.summary,
    });
    // The colour changes on every frame the control moves on, and in each run
    // it stalls no longer than the control.
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    // Each judged run lands inside its block.
    proof.runs.forEach((run, i) => {
      if (!proof.judged[i] || run == null) {
        return;
      }
      expect(
        landings[i].inBlock,
        `run ${i + 1}: the block presented a frame. ${run.summary}`,
      ).toBe(true);
      expect(
        landings[i].gap,
        `run ${i + 1}: the block's last frame shows the colour ${landings[i].gap.toFixed(1)} levels from its end. ${run.summary}`,
      ).toBeLessThan(FADE_SETTLED);
    });
    proof.runs.forEach((run, i) => {
      if (!proof.judged[i] || run == null) {
        return;
      }
      expect(run.monotonic, `run ${i + 1}: ${run.summary}`).toBe(true);
      const read = run.control;
      const moved = (read?.movedWith ?? 0) - (read?.belowStep ?? 0);
      expect(
        moved,
        `run ${i + 1}: the colour showed a new value on ${moved} frames in its block. ${run.summary}`,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  test("P10 · on two WebKit casts that stamped frames late, the track colour proof judges each frame at its time on the control's clock, at display rate", () => {
    WEBKIT_LATE_STAMPS.forEach((recorded, cast) => {
      // Tagged as WebKit's frames, the harness dates them. The cast recorded
      // one control and not its start, so the harness counts from the origin
      // its stamps agree with.
      const runs = (engine?: 'webkit'): BusyRun[] =>
        recorded.map(run => ({
          tracked: run.colour.map(([t, red]) => ({
            t,
            box: {x: red, y: 0, width: 1, height: 1},
            pixels: 1,
            ...(engine == null ? {} : {engine}),
          })),
          control: run.control.map(([t, x]) => ({
            t,
            box:
              x == null
                ? null
                : {x, y: 0, width: CONTROL_SIDE, height: CONTROL_SIDE},
            pixels: x == null ? 0 : CONTROL_SIDE * CONTROL_SIDE,
            ...(engine == null ? {} : {engine}),
          })),
          window: run.window,
        }));
      // By the cast's stamps, as each run was judged live: it fails.
      expect(
        pooledBusyProof(runs(), FADE_PROOF).verdict.failures,
        `cast ${cast + 1}, by its stamps`,
      ).not.toEqual([]);
      // At each frame's own time on the control's clock, every frame kept, it
      // still fails. A frame drawn 6 to 9 ms after the one before shows no
      // step of the fade's slow tail.
      const onReadings = runs().map(run => {
        const pageTime = pageTimesOnControls(run.control);
        const timed = (frames: ReadonlyArray<TrackedFrame>): TrackedFrame[] =>
          frames
            .flatMap(frame => {
              const at = pageTime.get(frame.t);
              return at == null ? [] : [{...frame, t: at}];
            })
            .sort((a, b) => a.t - b.t);
        return {
          ...run,
          tracked: timed(run.tracked),
          control: timed(run.control),
        };
      });
      expect(
        pooledBusyProof(onReadings, FADE_PROOF).verdict.failures,
        `cast ${cast + 1}, on the control's clock`,
      ).not.toEqual([]);
      const proof = pooledBusyProof(runs('webkit'), FADE_PROOF);
      expect(
        proof.verdict.failures,
        `cast ${cast + 1}, dated by the harness: ${proof.summary}`,
      ).toEqual([]);
    });
  });

  test('P10 · a change does no Layout or Paint per frame', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
    // A programmatic change, so the trace holds the switch's own motion: a
    // press also paints the shared press overlay, the press feedback's.
    const {input, thumb} = await openSwitch(
      page,
      'core-switch--controlled-update',
    );
    let travel = {from: 0, to: 0};
    const trace = await traceRendering(page, async () => {
      await page.evaluate(() => {
        // The change's own task: the click, React's commit and the switch's
        // setValue all run in it. A message posted at its start is handled
        // by the first task after it.
        const record = window as unknown as {__changeTaskMs?: number};
        const start = performance.now();
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          record.__changeTaskMs = performance.now() - start;
          channel.port1.close();
        };
        channel.port2.postMessage(null);
        Array.from(document.querySelectorAll('button'))
          .find(button => button.textContent?.includes('Turn on remotely'))!
          .click();
      });
      await expect(input).toBeChecked();
      travel = await travelAnimation(page);
      await waitForSwitchRest(page, thumb);
    });
    // The steady part of the travel, while the thumb settles and the track
    // color rises too: the value's commit comes before it.
    const steady = {from: travel.from + 50, to: travel.to - 50};
    const during = countBetween(trace, steady.from, steady.to);
    expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
    expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
    // No long task while it runs either. The change's own task comes before
    // it, and is measured below.
    expect(
      trace.longTasks.filter(
        task =>
          task.start < steady.to && task.start + task.durationMs > steady.from,
      ),
      JSON.stringify(trace.longTasks),
    ).toEqual([]);
    await test.step('measured, not asserted: the first change’s own task after load', async () => {
      // The first change runs the switch's and the animator's code for the
      // first time: tens of ms on a slow CPU. The pull request states the
      // numbers. Reported with the run, never judged against a bound.
      const changeTaskMs = await page.evaluate(
        () => (window as unknown as {__changeTaskMs?: number}).__changeTaskMs,
      );
      // Present first: the change's task was measured.
      expect(changeTaskMs).toBeGreaterThan(0);
      const before = trace.longTasks.filter(task => task.start < steady.from);
      testInfo.annotations.push({
        type: 'first change task (ms)',
        description: `${changeTaskMs!.toFixed(1)}; long tasks before the travel: ${JSON.stringify(before.map(task => Math.round(task.durationMs)))}`,
      });
      await writeEvidence(
        'perf/switch-first-change-task',
        {
          [`${testInfo.project.name}.json`]: JSON.stringify(
            {changeTaskMs, longTasksBeforeTravel: before, travel},
            null,
            1,
          ),
        },
        testInfo,
      );
    });
  });

  test(
    'storyboard: tap — travel',
    {tag: '@storyboard'},
    async ({page}, testInfo) => {
      const {driver, center, thumb} = await openSwitch(page);
      await installTimerGate(page);
      const clip = page.locator('#storybook-root .astryx-switch');
      // The press starts two animations. The release starts its travel with
      // several others at once, so a count of 3 holds at the release.
      const hold = await armHold(page, clip, {
        judges: {target: thumb, property: 'translate'},
        count: 3,
        newOnly: true,
      });
      await driver.play(tap(center, {holdMs: 50}));
      const held = await hold.held();
      await freezeTimers(page);
      const {storyboard} = await animationStoryboard(page, {
        held,
        name: 'switch-tap',
        // The motion: the track colour settles last, about 1.2 s after the
        // release.
        times: timeline(1250),
        clip: {...(await clipAround(clip))},
        measure: async () => ({
          ...(await presented(page)),
          offset: await thumbOffset(page),
        }),
        columns: 8,
        cellScale: 2,
      });
      await releaseAnimations(page, {finish: true});
      await thawTimers(page);
      await storyboard.write(testInfo);
      const offsets = storyboard.frames.map(f => f.data.offset as number);
      expect(offsets.at(-1)).toBeCloseTo(TRAVEL_PX, 0);
      // Critically damped travel: never past the on end.
      expect(Math.max(...offsets)).toBeLessThanOrEqual(TRAVEL_PX + 0.1);
    },
  );

  test(
    'storyboard: hold, drag across, release',
    {tag: '@storyboard'},
    async ({page}, testInfo) => {
      const {driver, center} = await openSwitch(page);
      const clip = page.locator('#storybook-root .astryx-switch');
      const board = await touchStoryboard(
        page,
        driver,
        drag(
          center,
          {x: center.x + FLIP_DISTANCE + 8, y: center.y},
          {durationMs: 400, hz: 20, holdMs: 300, restMs: 100},
        ),
        {
          name: 'switch-hold-drag',
          clip: {...(await clipAround(clip))},
          measure: async () => ({
            ...(await presented(page)),
            offset: await thumbOffset(page),
          }),
          columns: 6,
          cellScale: 2,
        },
      );
      await board.write(testInfo);
      const ons = board.frames.map(f => f.data.on as number);
      // Off until the flip, then the track color rises. It is waited for in
      // the page: a loaded machine can take the last frame before it shows.
      expect(ons[0]).toBeCloseTo(0, 2);
      await expect
        .poll(async () => (await presented(page)).on)
        .toBeGreaterThan(0.05);
    },
  );
});

/**
 * The mean luma of a box (CSS px) in each screencast frame, decoded in a
 * scratch page like the harness's marker tracking.
 */
async function sampleLuma(
  page: Page,
  frames: ReadonlyArray<CastFrame>,
  region: {x: number; y: number; width: number; height: number},
): Promise<{t: number; luma: number}[]> {
  const scratch = await page.context().newPage();
  try {
    const out: {t: number; luma: number}[] = [];
    for (let i = 0; i < frames.length; i += 12) {
      const batch = frames.slice(i, i + 12);
      const values = await scratch.evaluate(
        async ({items, box}) => {
          const result: number[] = [];
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
              Math.round(box.x * scale),
              Math.round(box.y * scale),
              Math.max(1, Math.round(box.width * scale)),
              Math.max(1, Math.round(box.height * scale)),
            );
            let sum = 0;
            for (let o = 0; o < data.length; o += 4) {
              sum +=
                0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
            }
            result.push(sum / (data.length / 4));
          }
          return result;
        },
        {
          items: batch.map(f => ({
            data: f.data,
            format: f.format,
            viewportWidth: f.viewportWidth,
          })),
          box: region,
        },
      );
      values.forEach((luma, k) => out.push({t: batch[k].t, luma}));
    }
    return out;
  } finally {
    await scratch.close();
  }
}

/** The track with room for the lifted thumb around it. */
async function clipAround(track: Locator) {
  const box = await track.boundingBox();
  if (box == null) {
    throw new Error('no track');
  }
  return {
    x: box.x - 12,
    y: box.y - 10,
    width: box.width + 24,
    height: box.height + 20,
  };
}

/** Seek the held animations and read the thumb's x delta, scale and the track color. */
async function sampleThumb(
  page: Page,
  times: ReadonlyArray<number>,
): Promise<
  {
    t: number;
    x: number;
    scaleX: number;
    fill: number;
    on: number;
    boxOpacity: number;
  }[]
> {
  return page.evaluate(
    ts => {
      const held =
        (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ??
        [];
      const thumb = document.querySelector<HTMLElement>(
        '#storybook-root .astryx-switch-thumb',
      )!;
      // The thumb itself moves and lifts.
      const box = thumb;
      // The fade layer shows the other side's fill (see presented()).
      const fade = document.querySelector<HTMLElement>(
        '#storybook-root .astryx-switch',
      )!;
      const input = document.querySelector<HTMLInputElement>(
        '#storybook-root [role="switch"]',
      )!;
      const start = Math.min(...held.map(a => Number(a.startTime ?? 0)));
      return ts.map(t => {
        for (const animation of held) {
          const end = Number(
            animation.effect?.getComputedTiming().endTime ?? Infinity,
          );
          const offset = Number(animation.startTime ?? start) - start;
          animation.currentTime = Math.max(0, Math.min(t - offset, end - 0.5));
        }
        const style = getComputedStyle(box);
        const translate = style.translate === 'none' ? '0px' : style.translate;
        const scale = style.scale === 'none' ? '1' : style.scale;
        return {
          t,
          x: parseFloat(translate),
          scaleX: Number(scale.split(' ')[0]),
          fill: Number(getComputedStyle(thumb).opacity),
          on: input.checked
            ? 1 - Number(getComputedStyle(fade, '::after').opacity)
            : Number(getComputedStyle(fade, '::after').opacity),
          boxOpacity: Number(style.opacity),
        };
      });
    },
    [...times],
  );
}
