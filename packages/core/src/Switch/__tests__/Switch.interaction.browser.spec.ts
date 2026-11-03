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
} from '@playwright/test';
import {
  castStoryboard,
  animationStoryboard,
  blockMainThread,
  busyWindowProof,
  compareCurve,
  cubicBezier,
  countBetween,
  drag,
  freezeTimers,
  holdAnimations,
  installTimerGate,
  markElement,
  openStory,
  releaseAnimations,
  seekAnimations,
  springStep,
  startScreencast,
  tap,
  thawTimers,
  timeline,
  touchDriver,
  touchStoryboard,
  traceRendering,
  trackMarker,
  waitForAnimation,
  waitForRest,
  withStorybook,
  writeEvidence,
  type CastFrame,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {press} from '../../motion/uikit/timing';
import {BROWSER_CLICK_WAIT_MS} from '../../utils/browserClickWait';
import {CLICK_GUARD_WINDOW_MS} from '../../utils/clickGuard';

const storybook = withStorybook(test);

// UISwitch on iOS 26.2 (motion/uikit/switch.ts), restated here as the oracle.
const TRAVEL = {response: 0.3, dampingFraction: 1};
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
/** The shared press release (motion/uikit/timing.ts `press`), ms. */
const PRESS_RELEASE_MS = press.highlightOutMs;
const pressReleaseEase = cubicBezier(...press.highlightOutCurve);
/** The press layer's opacity t ms into the release, 1 → 0. */
const pressReleaseAt = (t: number) =>
  1 - pressReleaseEase(Math.min(1, Math.max(0, t / PRESS_RELEASE_MS)));

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
  }: {
    direction?: 'ltr' | 'rtl';
    /** More Storybook globals, e.g. `theme:probe`. */
    globals?: string[];
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
    const held = await holdAnimations(page, row);
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
      expect(animation.durationMs).toBe(PRESS_RELEASE_MS);
    }
    // The lift's settle started at the lift's touch event, a frame or two
    // before the attribute's change started the release. So seek on the
    // release's own clock.
    const samples: {t: number; value: number}[] = [];
    for (const t of timeline(PRESS_RELEASE_MS)) {
      await seekAnimations(page, t + css[0].offsetMs);
      samples.push({t, value: (await pressLayer(page)) ?? 0});
    }
    await restoreHeldRates(page);
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    const comparison = compareCurve(samples, pressReleaseAt, 0.005);
    await writeEvidence(
      'curves/switch-press-release',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {
            releaseMs: PRESS_RELEASE_MS,
            curve: press.highlightOutCurve,
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

  test('the press layers’ release follows the theme’s tempo, and Reduce Motion never lengthens it', async ({
    page,
  }) => {
    // The shared release scales its clock by the theme's tempo, up to 1.5;
    // under Reduce Motion a tempo may shorten it, never lengthen it.
    const releaseMsUnder = async (
      reducedMotion: 'reduce' | 'no-preference',
    ): Promise<number[]> => {
      await page.emulateMedia({reducedMotion});
      const {driver, center} = await openSwitch(page);
      await page.evaluate(() =>
        document.documentElement.style.setProperty(
          '--_astryx-motion-tempo',
          '1.5',
        ),
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
      const css = (await holdAnimations(page, row)).filter(
        a => a.kind === 'CSSAnimation',
      );
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
      ['no-preference', PRESS_RELEASE_MS * 1.5],
      ['reduce', PRESS_RELEASE_MS],
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

  /**
   * Resolves once the thumb's travel is on screen: its newest `translate`
   * animation running, started, and one frame into its curve. A page-side
   * wait, so a loaded machine starts what follows at the same point of the
   * travel, not at a fixed time after the tap.
   */
  async function travelOnScreen(page: Page, rest?: number): Promise<void> {
    await page.waitForFunction(
      rest => {
        const thumb = document.querySelector<HTMLElement>(
          '#storybook-root .astryx-switch-thumb',
        )!;
        // The travel shows on screen: the thumb is 1 px or more off its rest.
        if (rest != null) {
          const box = thumb.getBoundingClientRect();
          if (Math.abs(box.left + box.width / 2 - rest) < 1) {
            return false;
          }
        }
        return document
          .querySelector<HTMLElement>('#storybook-root .astryx-switch-thumb')!
          .getAnimations()
          .some(
            a =>
              a.playState === 'running' &&
              !a.pending &&
              Number(a.currentTime ?? 0) >= 16 &&
              (a.effect as KeyframeEffect)
                .getKeyframes()
                .some(k => 'translate' in k),
          );
      },
      rest ?? null,
      {polling: 'raf'},
    );
  }

  /** P14's two taps: the second lands once the first one's travel is on screen. */
  async function secondTapMidTravel(
    page: Page,
    driver: TouchDriver,
    center: {x: number; y: number},
  ): Promise<void> {
    const finger = {id: 0, ...center};
    const rest = await page.evaluate(() => {
      const box = document
        .querySelector<HTMLElement>('#storybook-root .astryx-switch-thumb')!
        .getBoundingClientRect();
      return box.left + box.width / 2;
    });
    // Each tap is the browser's click (WebKit's comes only from its own tap
    // path).
    if (driver.engine === 'webkit') {
      await driver.tap(center);
      await travelOnScreen(page, rest);
      await driver.tap(center);
    } else {
      await driver.play([
        {t: 0, fingers: [finger]},
        {t: 40, fingers: []},
      ]);
      await travelOnScreen(page, rest);
      await driver.play([
        {t: 0, fingers: [finger]},
        {t: 30, fingers: []},
      ]);
    }
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
  ): Promise<{stop: () => Promise<[number, number][]>}> {
    if (browserName !== 'chromium') {
      await recordThumbCenters(page);
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
      stop: async () => {
        const tracked = await trackMarker(page, await cast.stop());
        const shown = tracked.filter(
          (f): f is typeof f & {box: NonNullable<typeof f.box>} =>
            f.box != null && f.box.width > 0 && f.box.height > 0,
        );
        // Present and painted first: the marked thumb in the frames, with a
        // box.
        expect(shown.length).toBeGreaterThan(10);
        return shown.map(f => [f.t, f.box.x + f.box.width / 2]);
      },
    };
  }

  function expectCaughtWithoutAJump(samples: [number, number][]): void {
    const xs = samples.map(([, x]) => x);
    const farthest = Math.max(...xs) - xs[0];
    // It turned around mid-travel, short of the on end...
    expect(farthest).toBeGreaterThan(1);
    expect(farthest).toBeLessThan(TRAVEL_PX - 1);
    // ...from where it was: no frame moves it more than a few px. Each step is
    // measured against the time its frames span. So a frame read late, two
    // vsyncs of motion in one sample, is not a jump.
    const FRAME_MS = 1000 / 60;
    const perFrame = samples
      .slice(1)
      .map(
        ([time, x], i) =>
          (Math.abs(x - samples[i][1]) * FRAME_MS) /
          Math.max(time - samples[i][0], FRAME_MS),
      );
    expect(Math.max(...perFrame), JSON.stringify(samples)).toBeLessThan(4);
  }

  test('P14 · a second tap mid-travel catches the thumb where it is and sends it back, without a jump', async ({
    page,
    browserName,
  }) => {
    const {driver, input, thumb, center} = await openSwitch(page);
    const record = await recordCatch(page, thumb, browserName);
    await secondTapMidTravel(page, driver, center);
    await waitForSwitchRest(page, thumb);
    const samples = await record.stop();
    await expect(input).not.toBeChecked();
    expect(await thumbOffset(page)).toBeCloseTo(0, 0);
    expectCaughtWithoutAJump(samples);
  });

  test('P14 · with frames read late (one frame in three) the catch still shows no jump', async ({
    page,
    browserName,
  }) => {
    const {driver, input, thumb, center} = await openSwitch(page);
    const record = await recordCatch(page, thumb, browserName);
    await secondTapMidTravel(page, driver, center);
    await waitForSwitchRest(page, thumb);
    const samples = await record.stop();
    await expect(input).not.toBeChecked();
    expect(await thumbOffset(page)).toBeCloseTo(0, 0);
    expectCaughtWithoutAJump(samples.filter((_, index) => index % 3 === 0));
  });

  test('P14 · a second tap whose lift the page handles late (its main thread busy for 100 ms) catches the thumb where the screen shows it, without a jump (spec:AST-094 FR6)', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frame evidence is Chromium-only in Playwright (WebKit: checked on the iOS simulator instead)',
    );
    const {driver, input, thumb, center} = await openSwitch(page);
    await markElement(thumb, {size: 6, inset: 2});
    // The page blocks at the second touch's start, so that touch's lift waits
    // for the block. The switch handles the lift about 70 ms after it
    // happened, while the compositor keeps the first travel moving.
    await page.evaluate(() => {
      const w = window as unknown as {__block?: {from: number; to: number}};
      let starts = 0;
      addEventListener(
        'touchstart',
        () => {
          starts += 1;
          if (starts !== 2) {
            return;
          }
          // In the touch's own dispatch, after the switch's listeners (they
          // were added first): a task queued here can run after the lift.
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
    const cast = await startScreencast(page);
    await secondTapMidTravel(page, driver, center);
    await waitForSwitchRest(page, thumb);
    const castFrames = await cast.stop();
    await expect(input).not.toBeChecked();
    const block = await page.evaluate(
      () =>
        (window as unknown as {__block?: {from: number; to: number}}).__block,
    );
    expect(block, 'the page was busy when the lift came').toBeDefined();
    const tracked = await trackMarker(page, castFrames);
    // Present and painted first: the marked thumb in the frames, with a box.
    const shown = tracked.filter(
      (f): f is typeof f & {box: NonNullable<typeof f.box>} =>
        f.box != null && f.box.width > 0 && f.box.height > 0,
    );
    expect(shown.length).toBeGreaterThan(10);
    const samples = shown.map(
      f => [f.t, f.box.x + f.box.width / 2] as [number, number],
    );
    const xs = samples.map(([, x]) => x);
    const farthest = Math.max(...xs) - xs[0];
    // It turned around mid-travel, short of the on end...
    expect(farthest).toBeGreaterThan(1);
    expect(farthest).toBeLessThan(TRAVEL_PX - 1);
    // ...from the place the screen showed when the late lift was handled. No
    // presented frame moves it more than a few px from the one before,
    // measured against the time the two frames span.
    const FRAME_MS = 1000 / 60;
    const perFrame = samples
      .slice(1)
      .map(
        ([time, x], i) =>
          (Math.abs(x - samples[i][1]) * FRAME_MS) /
          Math.max(time - samples[i][0], FRAME_MS),
      );
    expect(Math.max(...perFrame), JSON.stringify(samples)).toBeLessThan(4);
  });

  test('a tap whose first frame the page commits late (its main thread busy for 100 ms after the lift) starts the travel from rest on that frame, not partway into its curve', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frame evidence is Chromium-only in Playwright (WebKit: checked on the iOS simulator instead)',
    );
    const {driver, input, thumb, center} = await openSwitch(page);
    await markElement(thumb, {size: 6, inset: 2});
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
    const tracked = await trackMarker(page, castFrames);
    // Present and painted first: the marked thumb in the frames, with a box.
    const shown = tracked.filter(
      (f): f is typeof f & {box: NonNullable<typeof f.box>} =>
        f.box != null && f.box.width > 0 && f.box.height > 0,
    );
    expect(shown.length).toBeGreaterThan(10);
    const samples = shown.map(
      f => [f.t, f.box.x + f.box.width / 2] as [number, number],
    );
    const xs = samples.map(([, x]) => x);
    // It travelled from the off rest to the on rest (the frames place the
    // marker to the whole px)...
    expect(Math.abs(xs.at(-1)! - xs[0] - (onLeft - offLeft))).toBeLessThan(1.5);
    // ...from rest: no presented frame moves it more than a few px from the
    // one before, measured against the time the two frames span.
    const FRAME_MS = 1000 / 60;
    const perFrame = samples
      .slice(1)
      .map(
        ([time, x], i) =>
          (Math.abs(x - samples[i][1]) * FRAME_MS) /
          Math.max(time - samples[i][0], FRAME_MS),
      );
    expect(Math.max(...perFrame), JSON.stringify(samples)).toBeLessThan(4);
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
    const {thumb} = await openSwitch(page);
    // The travel and the track color, from a programmatic change: the thumb
    // starts at rest, as UISwitch's `setOn(_:animated:)` does.
    await openStory(page, storybook(), 'core-switch--controlled-update');
    await page.getByRole('button', {name: 'Turn on remotely'}).click();
    await waitForAnimation(thumb);
    await holdAnimations(page, page.locator('#storybook-root .astryx-switch'));
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
      'screencast frame evidence is Chromium-only in Playwright (WebKit: checked on the iOS simulator instead)',
    );
    const {driver, input, thumb, center} = await openSwitch(page);
    await markElement(thumb, {size: 6, inset: 2});
    // The block starts in the page once the travel is one frame into its
    // curve, from a task queued in that frame. So it holds the same part of
    // the travel whatever the page's own timing. The lift starts at
    // touch-down, and a round trip from here would start the block late.
    await page.evaluate(() => {
      const w = window as unknown as {
        __block?: {from: number; to: number; spins: number};
        __travel?: {from: number; to: number};
      };
      const input = document.querySelector('#storybook-root [role="switch"]')!;
      const thumb = document.querySelector<HTMLElement>(
        '#storybook-root .astryx-switch-thumb',
      )!;
      const onScreen = () =>
        thumb
          .getAnimations()
          .filter(
            a =>
              a.playState === 'running' &&
              !a.pending &&
              Number(a.currentTime ?? 0) >= 16 &&
              (a.effect as KeyframeEffect)
                .getKeyframes()
                .some(k => 'translate' in k),
          )
          .at(-1);
      const whenOnScreen = (run: () => void) => {
        const tick = () => {
          if (onScreen() == null) {
            requestAnimationFrame(tick);
          } else {
            setTimeout(run, 0);
          }
        };
        requestAnimationFrame(tick);
      };
      input.addEventListener(
        'change',
        () =>
          whenOnScreen(() => {
            const travel = onScreen();
            if (travel?.startTime != null) {
              const effect = travel.effect as KeyframeEffect;
              const from = performance.timeOrigin + Number(travel.startTime);
              const ends = effect
                .getKeyframes()
                .map(k => k.computedOffset)
                .filter(o => o < 1);
              w.__travel = {
                from,
                to:
                  from +
                  Number(effect.getComputedTiming().activeDuration) *
                    Math.max(...ends),
              };
            }
            const from = performance.timeOrigin + performance.now();
            const end = performance.now() + 700;
            let spins = 0;
            while (performance.now() < end) {
              spins++;
            }
            w.__block = {
              from,
              to: performance.timeOrigin + performance.now(),
              spins,
            };
          }),
        {once: true},
      );
    });
    const cast = await startScreencast(page);
    await driver.play(tap(center, {holdMs: 50}));
    await expect(input).toBeChecked();
    await page.waitForFunction(
      () => (window as unknown as {__block?: unknown}).__block != null,
    );
    const {block, travel} = await page.evaluate(() => {
      const w = window as unknown as {
        __block: {from: number; to: number; spins: number};
        __travel: {from: number; to: number};
      };
      return {block: w.__block, travel: w.__travel};
    });
    expect(travel, 'the travel was running when the block began').toBeDefined();
    await page.waitForTimeout(150);
    const castFrames = await cast.stop();
    const tracked = await trackMarker(page, castFrames);
    const proof = busyWindowProof(
      tracked,
      {from: block.from, to: Math.min(block.to, travel.to)},
      // The screencast places the marker to the whole px. On UISwitch's 0.3 s
      // spring, the 13 px travel moves under 1 px per frame once 4.3 px remain
      // (110 ms). From there a frame can show no change while the thumb moves,
      // so it is judged until then.
      {axis: 'x', settledWithin: 4.5},
    );
    await writeEvidence(
      'busy-main-thread/switch-toggle',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {
            block,
            travel,
            proof,
            frames: tracked.map(f => ({
              t: +(f.t - block.from).toFixed(1),
              x: f.box?.x ?? null,
              w: f.box?.width ?? null,
            })),
          },
          null,
          1,
        ),
      },
      testInfo,
    );
    expect(proof.monotonic).toBe(true);
    // The travel is 13 px: past its first half it moves less than a
    // screencast pixel per frame, so not every frame changes...
    expect(proof.changed).toBeGreaterThanOrEqual(Math.floor(proof.frames / 2));
    // ...but most of it happened while the main thread was held.
    const held = tracked.filter(
      f => f.t >= block.from && f.t <= block.to && f.box != null,
    );
    expect(held.at(-1)!.box!.x - held[0].box!.x).toBeGreaterThanOrEqual(8);
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
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frame evidence is Chromium-only in Playwright (WebKit: checked on the iOS simulator instead)',
    );
    const {driver, input, onLayer, center} = await openSwitch(page);
    // Hide the thumb (its animations still run) so the whole track shows
    // its colour.
    await page.addStyleTag({
      content: '#storybook-root .astryx-switch-thumb { visibility: hidden }',
    });
    const box = await page
      .locator('#storybook-root .astryx-switch')
      .first()
      .boundingBox();
    if (box == null) {
      throw new Error('no track');
    }
    const cast = await startScreencast(page);
    await driver.play(tap(center, {holdMs: 50}));
    await expect(input).toBeChecked();
    await waitForAnimation(onLayer, {minProgressMs: 16});
    const block = await blockMainThread(page, 700);
    await page.waitForTimeout(150);
    const castFrames = await cast.stop();
    const luma = await sampleLuma(page, castFrames, {
      x: box.x + 4,
      y: box.y + 4,
      width: box.width - 8,
      height: box.height - 8,
    });
    await writeEvidence(
      'busy-main-thread/switch-track-colour',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {
            block,
            frames: luma.map(f => ({
              t: +(f.t - block.from).toFixed(1),
              luma: +f.luma.toFixed(1),
            })),
          },
          null,
          1,
        ),
      },
      testInfo,
    );
    const off = luma[0].luma;
    const on = luma.at(-1)!.luma;
    const held = luma.filter(
      f => f.t >= block.from + 20 && f.t <= block.to - 20,
    );
    expect(held.length).toBeGreaterThan(20);
    // Most of the fade happened while the main thread was held.
    expect(held[0].luma - held.at(-1)!.luma).toBeGreaterThan(0.5 * (off - on));
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
      const {driver, thumb, center} = await openSwitch(page);
      await installTimerGate(page);
      const clip = page.locator('#storybook-root .astryx-switch');
      await driver.play(tap(center, {holdMs: 50}));
      await waitForAnimation(thumb);
      await freezeTimers(page);
      const {storyboard} = await animationStoryboard(page, {
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
