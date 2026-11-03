// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControl.interaction.browser.spec.ts
 * @input The built SegmentedControl stories, real touch and mouse input, and
 *   the interaction harness
 * @output Browser proofs for the touch layer: the slide on UIKit's spring,
 *   the hand-back, Reduce Motion, a blocked main thread, the press, the drag,
 *   the commit at the lift, scrolling, text selection and a mouse
 * @position Browser layer of useSegmentedSelectionMotion.ts; the unit layers
 *   are useSegmentedSelectionMotion.test.ts and motion/uikit/segmented.test.ts
 *
 * The oracles come from the harness (`springStep`, `cubicBezier`). They share
 * no code with the code under test.
 */

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  animationStoryboard,
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  compareCurve,
  countBetween,
  freezeTimers,
  installLongTaskLog,
  installTimerGate,
  MARKER_RGB,
  openStory,
  readLongTasks,
  releaseAnimations,
  springStep,
  startScreencast,
  thawTimers,
  timeline,
  touchDriver,
  traceRendering,
  trackMarker,
  tap as touchTap,
  drag as touchDrag,
  touchStoryboard,
  toTouchEvents,
  waitForAnimation,
  webInputDriver,
  withStorybook,
  writeEvidence,
  PEN_SKIP,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** UIKit's slide, from the constants table (motion/uikit/segmented.ts). */
const SLIDE = {response: 0.4, dampingFraction: 0.85} as const;
/** How far past the end segments the lens follows a finger. */
const DRAG_OVERSHOOT = 11;
/** design:reduced-motion DR2: a cross-fade, opacity only, 200 ms or less. */
const RM_MAX_FADE_MS = 200;

interface SegmentBox {
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Control {
  driver: TouchDriver;
  /**
   * The radiogroup. Its ::before is the lens; under Reduced Motion its
   * ::after shows the surface that fades out.
   */
  group: Locator;
  segment: (value: string) => Locator;
  boxes: () => Promise<SegmentBox[]>;
  tapSegment: (value: string) => Promise<void>;
}

async function openControl(
  page: Page,
  storyId = 'core-segmentedcontrol--default',
  groupName = 'View mode',
  {
    direction,
  }: {
    direction?: 'rtl';
  } = {},
): Promise<Control> {
  await installLongTaskLog(page);
  if (direction == null) {
    await openStory(page, storybook(), storyId);
  } else {
    // Storybook's highlight module reads every element's style on each DOM
    // insertion. openStory turns it off, and this navigation does too. So
    // frame and long-task proofs measure only the control.
    await page.addInitScript(() => {
      (
        globalThis as unknown as {__STORYBOOK_HIGHLIGHT_INITIALIZED?: boolean}
      ).__STORYBOOK_HIGHLIGHT_INITIALIZED = true;
    });
    // Storybook's direction toolbar (a global, not an arg).
    await page.goto(
      `${storybook()}/iframe.html?id=${storyId}&viewMode=story&globals=direction:${direction}`,
    );
    await page.locator('#storybook-root > *').first().waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
  }
  const driver = await touchDriver(page);
  const group = page.getByRole('radiogroup', {name: groupName, exact: true});
  await expect(group).toBeVisible();
  const segment = (value: string) => group.locator(`[data-value="${value}"]`);
  // Boxes in the track's padding-box coordinates, the lens's own space.
  const boxes = async () =>
    group.evaluate(track => {
      const trackRect = track.getBoundingClientRect();
      return [...track.querySelectorAll<HTMLElement>('[role="radio"]')].map(
        element => {
          const rect = element.getBoundingClientRect();
          return {
            value: element.dataset.value ?? '',
            x: rect.left - trackRect.left - track.clientLeft,
            y: rect.top - trackRect.top - track.clientTop,
            width: rect.width,
            height: rect.height,
          };
        },
      );
    });
  const tapSegment = async (value: string) => {
    const box = await segment(value).boundingBox();
    if (box == null) {
      throw new Error(`no segment ${value}`);
    }
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  };
  return {driver, group, segment, boxes, tapSegment};
}

/** One of the radiogroup's two layers: the lens or the ::after. */
type Layer = '::before' | '::after';

/**
 * A layer's presented geometry, as computed now. The layer lays out on a box
 * and scales around its center. So `center` is its layout center plus its
 * translate, and `x` is its presented left edge.
 */
async function readLayer(
  group: Locator,
  layer: Layer = '::before',
): Promise<{
  visible: boolean;
  opacity: number;
  x: number;
  center: number;
  width: number;
  height: number;
  sx: number;
  sy: number;
}> {
  return group.evaluate((element, pseudo) => {
    const style = getComputedStyle(element, pseudo);
    const [sx, sy = sx] =
      style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
    const translate =
      style.translate === 'none' ? 0 : parseFloat(style.translate);
    const width = parseFloat(style.width) * sx;
    const center =
      parseFloat(style.left) + parseFloat(style.width) / 2 + translate;
    return {
      visible: style.visibility === 'visible',
      opacity: Number(style.opacity),
      x: center - width / 2,
      center,
      width,
      height: parseFloat(style.height) * sy,
      sx,
      sy,
    };
  }, layer);
}

/** Resolves once the lens is hidden again: the surface handed back. */
async function expectLensHidden(
  control: Control,
  timeout = 3000,
): Promise<void> {
  await expect
    .poll(async () => (await readLayer(control.group)).visible, {timeout})
    .toBe(false);
}

/**
 * The lens's running animations (the radiogroup's ::before), described as
 * the harness's `waitForAnimation` describes an element's.
 */
async function waitForLens(
  control: Control,
  {
    minProgressMs = 1,
    timeout = 5000,
  }: {minProgressMs?: number; timeout?: number} = {},
): Promise<{from: number; to: number; durationMs: number; easing: string}[]> {
  // Installs the harness's curve-end reader and waits for the control to move.
  await waitForAnimation(control.group, {minProgressMs, timeout});
  const deadline = Date.now() + timeout;
  for (;;) {
    const found = await control.group.evaluate((group, minProgress) => {
      const curveEnd = (
        window as unknown as {__harnessCurveEnd: (a: Animation) => number}
      ).__harnessCurveEnd;
      return group
        .getAnimations({subtree: true})
        .filter(a => {
          const effect = a.effect as KeyframeEffect | null;
          return (
            effect?.target === group &&
            effect.pseudoElement === '::before' &&
            a.playState === 'running' &&
            a.startTime != null &&
            Number(a.currentTime ?? 0) >= minProgress
          );
        })
        .map(a => {
          const effect = a.effect as KeyframeEffect;
          const timing = effect.getComputedTiming();
          const startedAt = performance.timeOrigin + Number(a.startTime);
          return {
            from: startedAt + (timing.delay ?? 0),
            to: startedAt + curveEnd(a),
            durationMs: Number(timing.duration ?? 0),
            easing: effect.getTiming().easing ?? 'linear',
          };
        });
    }, minProgressMs);
    if (found.length > 0) {
      return found;
    }
    if (Date.now() > deadline) {
      throw new Error('waitForLens: no lens animation started');
    }
    await new Promise(resolve => setTimeout(resolve, 4));
  }
}

/**
 * Pauses the running animations of both radiogroup pseudo-elements, the lens
 * and its shadow, into the harness's held set. Then `releaseAnimations` moves
 * exactly them. A pseudo-element has no inline style, so the animator holds
 * each value with a finished, filling animation. Every running animation
 * overrides those, so they are left alone.
 */
async function holdLens(
  control: Control,
): Promise<{easing: string; durationMs: number; pseudo: string}[]> {
  return control.group.evaluate(group => {
    const held = group.getAnimations({subtree: true}).filter(a => {
      const effect = a.effect as KeyframeEffect | null;
      return (
        effect?.target === group &&
        effect.pseudoElement != null &&
        a.playState !== 'finished'
      );
    });
    for (const animation of held) {
      animation.pause();
    }
    (window as unknown as {__harnessHeld: Animation[]}).__harnessHeld = held;
    return held.map(a => ({
      easing: String((a.effect as KeyframeEffect).getTiming().easing),
      durationMs: Number(a.effect?.getComputedTiming().duration ?? 0),
      pseudo: String((a.effect as KeyframeEffect).pseudoElement),
    }));
  });
}

/**
 * The lens's presented geometry at each held time. `x` is its translate, the
 * center's offset from its layout box's center. `center` is in the track's
 * coordinates, beside its presented size.
 */
async function sampleLens(
  group: Locator,
  times: ReadonlyArray<number>,
): Promise<
  {
    t: number;
    x: number;
    center: number;
    width: number;
    height: number;
    visible: boolean;
  }[]
> {
  return group.evaluate((element, ts) => {
    const held =
      (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ?? [];
    const base = getComputedStyle(element, '::before');
    const left = parseFloat(base.left);
    const width = parseFloat(base.width);
    const height = parseFloat(base.height);
    return ts.map(t => {
      for (const animation of held) {
        const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
        animation.currentTime = Math.min(t, end - 0.5);
      }
      const style = getComputedStyle(element, '::before');
      const x = style.translate === 'none' ? 0 : parseFloat(style.translate);
      const [sx, sy = sx] =
        style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
      return {
        t,
        x,
        center: left + width / 2 + x,
        width: width * sx,
        height: height * sy,
        visible: style.visibility === 'visible',
      };
    });
  }, times);
}

const centerOf = (box: SegmentBox) => box.x + box.width / 2;

/**
 * Records each moment a control's lens hands its surface back and hides
 * again, on the page's clock (epoch ms). The animator's keyframes hold the end
 * state for a few seconds past the curve. So an animation's end time does not
 * mark the end of the slide; the hand-back does.
 */
async function recordHandBacks(page: Page): Promise<() => Promise<number[]>> {
  await page.evaluate(() => {
    const times: number[] = [];
    (window as unknown as {__handBacks: number[]}).__handBacks = times;
    const shown = (group: HTMLElement) =>
      group.style.getPropertyValue('--_segmented-lens-visibility') ===
      'visible';
    for (const group of document.querySelectorAll<HTMLElement>(
      '[role="radiogroup"]',
    )) {
      let visible = shown(group);
      new MutationObserver(() => {
        const now = shown(group);
        if (visible && !now) {
          times.push(performance.timeOrigin + performance.now());
        }
        visible = now;
      }).observe(group, {attributes: true, attributeFilter: ['style']});
    }
  });
  return async () =>
    page.evaluate(
      () => (window as unknown as {__handBacks: number[]}).__handBacks,
    );
}

/**
 * Paints the lens in the harness's marker color, then lets a frame show it.
 * The lens has no element to carry the marker chip, so the frames find it by
 * its color.
 */
async function paintLensMarker(control: Control): Promise<void> {
  await control.group.evaluate((group, rgb) => {
    group.style.setProperty(
      '--_segmented-lens-background-color',
      `rgb(${rgb.join(', ')})`,
    );
    group.style.setProperty('--_segmented-lens-background-image', 'none');
  }, MARKER_RGB);
  await control.group.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

/** The box of one segment; a missing segment is a broken story, not a pass. */
function boxOf(boxes: ReadonlyArray<SegmentBox>, value: string): SegmentBox {
  const box = boxes.find(b => b.value === value);
  if (box == null) {
    throw new Error(`no segment "${value}" in ${JSON.stringify(boxes)}`);
  }
  return box;
}

test('a tap slides the selected surface to the new segment on UIKit’s spring, at its resting size', async ({
  page,
}, testInfo) => {
  const control = await openControl(page);
  // Under a finger the segments leave the change to this motion: no CSS
  // transition runs a second, main-thread version of it.
  for (const value of ['grid', 'list', 'table']) {
    await expect(control.segment(value)).toHaveCSS(
      'transition-property',
      'none',
    );
  }
  const from = boxOf(await control.boxes(), 'grid');
  // Hold the clock still, and hold each lens animation at its birth. Then a
  // slow engine cannot reach the hold after the slide moved on.
  await installTimerGate(page);
  await holdLensAnimationsAtBirth(page);
  await control.tapSegment('table');
  await freezeTimers(page);
  const held = await page.evaluate(() => {
    (window as unknown as {__restoreAnimate: () => void}).__restoreAnimate();
    return (
      window as unknown as {__harnessHeld: Animation[]}
    ).__harnessHeld.map(
      a => (a.effect as KeyframeEffect).getComputedTiming().easing,
    );
  });
  // Baked curves: the lens's translate and scale; nothing on the ::after (no
  // lift, so no shadow).
  expect(held.length).toBeGreaterThanOrEqual(2);
  expect(held.every(easing => easing === 'linear')).toBe(true);
  const samples = await sampleLens(control.group, timeline(600));
  await releaseAnimations(page);
  await thawTimers(page);
  // The value commits at the lift, as UISegmentedControl's valueChanged does.
  await expect(control.segment('table')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // Where Table is once its title has its new weight: where the lens aims.
  const to = boxOf(await control.boxes(), 'table');
  expect(samples.every(s => s.visible)).toBe(true);
  // The center travels on the slide spring...
  const center = compareCurve(
    samples.map(s => ({t: s.t, value: s.center})),
    t =>
      centerOf(from) + (centerOf(to) - centerOf(from)) * springStep(SLIDE, t),
    0.25,
  );
  // ...and the width follows Grid's to Table's on the same spring; nothing
  // lifts it (a pressed thumb's lift is a theme's, none by default).
  const width = compareCurve(
    samples.map(s => ({t: s.t, value: s.width})),
    t => from.width + (to.width - from.width) * springStep(SLIDE, t),
    0.25,
  );
  const height = compareCurve(
    samples.map(s => ({t: s.t, value: s.height})),
    () => to.height,
    0.25,
  );
  await writeEvidence(
    'curves/segmented-slide',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {from, to, held, samples, center, width, height},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(center.maxError, JSON.stringify(center.worst)).toBeLessThanOrEqual(
    0.25,
  );
  expect(width.maxError, JSON.stringify(width.worst)).toBeLessThanOrEqual(0.25);
  expect(height.maxError, JSON.stringify(height.worst)).toBeLessThanOrEqual(
    0.25,
  );
  // It lands and hands back.
  await expectLensHidden(control);
});

test('the surface lands exactly where the segment paints it', async ({
  page,
}) => {
  const control = await openControl(page);
  // The surfaces are compared, not the titles. Text over a composited layer,
  // such as the lens, loses subpixel antialiasing where the platform uses it.
  // It gets it back at the hand-back. A desktop Linux runner does this;
  // phones antialias text in grayscale either way.
  await page.addStyleTag({
    content: '[role="radiogroup"] * { color: transparent !important; }',
  });
  // Gate timers: the hand-back runs from the slide's completion timer, which
  // must wait while the landed frame is photographed.
  await installTimerGate(page);
  await control.tapSegment('list');
  await waitForLens(control);
  await freezeTimers(page);
  // The slide runs its course on the compositor. With the timers held, the
  // hand-back waits. So this is the slide's last frame: the lens carries the
  // surface, and the segment's own is hidden.
  await page.waitForTimeout(1500);
  const landed = await control.group.screenshot({animations: 'allow'});
  expect(
    await control.segment('list').evaluate(el => el.style.backgroundColor),
  ).toBe('transparent');
  await thawTimers(page);
  await expectLensHidden(control);
  expect(
    await control.segment('list').evaluate(el => el.getAttribute('style')),
  ).toBeFalsy();
  const rest = await control.group.screenshot({animations: 'allow'});
  const a = PNG.sync.read(landed);
  const b = PNG.sync.read(rest);
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  // The hand-back is invisible: the pixels match before and after it, except
  // for the surface's outline. Each engine snaps that outline to device
  // pixels its own way for a composited layer and a segment's background.
  // They differ by at most two device pixels.
  const edges = await control.group.evaluate(group => {
    const ratio = window.devicePixelRatio || 1;
    const host = group.getBoundingClientRect();
    const segment = group.querySelector('[data-value="list"]');
    if (segment == null) {
      throw new Error('no List segment');
    }
    const box = segment.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(segment).borderTopLeftRadius);
    return {
      left: (box.left - host.left) * ratio,
      right: (box.right - host.left) * ratio,
      top: (box.top - host.top) * ratio,
      bottom: (box.bottom - host.top) * ratio,
      radius: (Number.isFinite(radius) ? radius : 0) * ratio,
    };
  });
  const nearEdge = (x: number, y: number) => {
    const halfWidth = (edges.right - edges.left) / 2;
    const halfHeight = (edges.bottom - edges.top) / 2;
    const r = Math.min(edges.radius, halfWidth, halfHeight);
    const qx = Math.abs(x - (edges.left + halfWidth)) - (halfWidth - r);
    const qy = Math.abs(y - (edges.top + halfHeight)) - (halfHeight - r);
    const distance =
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
      Math.min(Math.max(qx, qy), 0) -
      r;
    return Math.abs(distance) < 2;
  };
  let differing = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const delta = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
      );
      if (delta > 10 && !nearEdge(x + 0.5, y + 0.5)) {
        differing++;
      }
    }
  }
  expect(differing).toBe(0);
});

test('the titles switch at once with the selection: no second copy of a title is ever mounted', async ({
  page,
}) => {
  const control = await openControl(page);
  const elements = await control.group.evaluate(
    group => group.querySelectorAll('*').length,
  );
  await control.tapSegment('table');
  await waitForLens(control);
  // Mid-slide, as many elements as at rest, and nothing animates Table's
  // title's weight or color: it already shows its selected rendering. (Its
  // opacity comes back from the press's dim.)
  expect(
    await control.group.evaluate(group => group.querySelectorAll('*').length),
  ).toBe(elements);
  expect(
    await control.segment('table').evaluate(element =>
      element
        .getAnimations({subtree: true})
        .flatMap(a =>
          (a.effect as KeyframeEffect)
            .getKeyframes()
            .flatMap(k => Object.keys(k)),
        )
        .filter(key => key === 'color' || key === 'fontWeight'),
    ),
  ).toEqual([]);
});

test('a second tap mid-flight retargets from what is on screen, keeping its velocity', async ({
  page,
}) => {
  const control = await openControl(page);
  await control.tapSegment('table');
  await waitForLens(control, {minProgressMs: 60});
  const describe = async () =>
    control.group.evaluate(async group => {
      const animations = group.getAnimations({subtree: true}).filter(a => {
        const effect = a.effect as KeyframeEffect;
        return (
          effect.target === group &&
          effect.pseudoElement === '::before' &&
          a.playState === 'running' &&
          effect.getKeyframes().length > 2 &&
          'translate' in (effect.getKeyframes()[0] ?? {})
        );
      });
      animations.reverse();
      // A call starts when the browser commits it: wait for its start time.
      await Promise.all(animations.map(async a => a.ready));
      // The lens's layout box: its center is the reference `x` is measured
      // from (it moves when the destination changes).
      const style = getComputedStyle(group, '::before');
      const origin = parseFloat(style.left) + parseFloat(style.width) / 2;
      return animations.map(a => ({
        startTime: a.startTime as number,
        duration: Number(a.effect?.getComputedTiming().duration),
        keyframes: (a.effect as KeyframeEffect).getKeyframes().map(k => ({
          offset: k.computedOffset,
          x: origin + parseFloat(String(k.translate)),
        })),
      }))[0];
    });
  const first = await describe();
  await control.tapSegment('list');
  await expect(control.segment('list')).toHaveAttribute('aria-checked', 'true');
  const second = await describe();
  expect(second.startTime).toBeGreaterThan(first.startTime);
  // The first curve, read where the second one starts.
  const at = (
    curve: typeof first,
    time: number,
  ): {value: number; slope: number} => {
    const offset = (time - curve.startTime) / curve.duration;
    const k = curve.keyframes;
    for (let i = 0; i + 1 < k.length; i++) {
      if (offset <= k[i + 1].offset) {
        const span = k[i + 1].offset - k[i].offset;
        const f = span === 0 ? 0 : (offset - k[i].offset) / span;
        return {
          value: k[i].x + (k[i + 1].x - k[i].x) * f,
          slope:
            span === 0 ? 0 : (k[i + 1].x - k[i].x) / (span * curve.duration),
        };
      }
    }
    return {value: k[k.length - 1].x, slope: 0};
  };
  const old = at(first, second.startTime);
  const fresh = at(second, second.startTime + 0.001);
  // No jump at the retarget: at most the travel of 2 ms. The animator's clock
  // and the document timeline can disagree by a fraction of a frame.
  expect(Math.abs(fresh.value - old.value)).toBeLessThan(
    Math.max(0.5, Math.abs(old.slope) * 2),
  );
  // ...and the velocity carries over (px/ms, within 10 %). It is read on both
  // curves at the instant the second one starts. The browser draws straight
  // lines between keyframes. So a segment's slope is the curve's velocity at
  // the segment's middle, not at its ends. Comparing two segments' slopes
  // directly would compare velocities half a segment apart. Those differ by
  // the spring's acceleration over that span.
  const velocityAt = (curve: typeof first, time: number): number => {
    const k = curve.keyframes;
    const middles: {t: number; v: number}[] = [];
    for (let i = 0; i + 1 < k.length; i++) {
      const span = k[i + 1].offset - k[i].offset;
      if (span > 0) {
        middles.push({
          t:
            curve.startTime +
            ((k[i].offset + k[i + 1].offset) / 2) * curve.duration,
          v: (k[i + 1].x - k[i].x) / (span * curve.duration),
        });
      }
    }
    // Between the two middles around `time`; before the first one (the second
    // curve at its own start), extrapolated from the first two.
    const next = middles.findIndex(middle => middle.t >= time);
    const j = next === -1 ? middles.length - 1 : Math.max(next, 1);
    const a = middles[j - 1];
    const b = middles[j];
    return a.v + ((b.v - a.v) * (time - a.t)) / (b.t - a.t);
  };
  const before = velocityAt(first, second.startTime);
  const after = velocityAt(second, second.startTime);
  expect(
    Math.abs(after - before),
    JSON.stringify({before, after}),
  ).toBeLessThan(Math.abs(before) * 0.1 + 0.02);
  // It lands on the second segment's center.
  const list = boxOf(await control.boxes(), 'list');
  expect(second.keyframes.at(-1)?.x).toBeCloseTo(centerOf(list), 1);
});

test('a change mid-flight paints no press over the lens on the segment it leaves', async ({
  page,
}) => {
  const control = await openControl(page);
  await control.tapSegment('table');
  // The app changes the selection while the lens is still on its way and the
  // tap on Table still fades. A second touch would end that fade itself.
  const paint = await control.group.evaluate(async group => {
    const segment = (value: string): HTMLElement => {
      const element = group.querySelector<HTMLElement>(
        `[data-value="${value}"]`,
      );
      if (element == null) {
        throw new Error(`no segment ${value}`);
      }
      return element;
    };
    segment('list').click();
    // The layout effect that retargets has run once the frame is drawn.
    await new Promise(resolve => requestAnimationFrame(resolve));
    const table = segment('table');
    const style = getComputedStyle(table);
    return {
      press: table.getAttribute('data-astryx-press'),
      image: style.backgroundImage,
      color: style.backgroundColor,
      lensVisible: getComputedStyle(group, '::before').visibility === 'visible',
    };
  });
  await expect(control.segment('list')).toHaveAttribute('aria-checked', 'true');
  expect(paint.press, 'the tap on Table is still fading').not.toBeNull();
  expect(paint.lensVisible).toBe(true);
  // Table paints nothing of its own until the lens lands: its press would
  // cover the lens, which sits under the segments' backgrounds.
  expect(paint.image).toBe('none');
  expect(paint.color).toBe('rgba(0, 0, 0, 0)');
  // Once the lens lands, Table gets its own styles back.
  await expectLensHidden(control);
  await expect
    .poll(async () =>
      control.segment('table').evaluate(element => element.style.cssText),
    )
    .toBe('');
});

test('an arrow key and a programmatic change slide the selection too', async ({
  page,
}) => {
  const control = await openControl(
    page,
    'core-segmentedcontrol--selection-motion',
    'Period',
  );
  // An arrow key on the focused segment: selection follows focus.
  await control.segment('day').focus();
  await page.keyboard.press('ArrowRight');
  await expect(control.segment('week')).toHaveAttribute('aria-checked', 'true');
  const [keyed] = await waitForLens(control);
  expect(keyed.easing).toBe('linear');
  await releaseAnimations(page, {finish: true});
  // A change made by the app (the button sets the value from outside).
  const button = page.getByRole('button', {name: 'Next period'});
  const box = await button.boundingBox();
  if (box == null) {
    throw new Error('no button');
  }
  await control.driver.tap({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  await expect(control.segment('month')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const animations = await waitForLens(control);
  expect(animations.length).toBeGreaterThan(0);
});

test('Reduce Motion (design:reduced-motion): no travel or scale; the old surface fades out where it is as the new one fades in, opacity only, in 200 ms or less', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const control = await openControl(page);
  // Grid as it rests before the tap, where the surface fades out. Table once
  // its title has its new weight, where the lens fades in.
  const grid = boxOf(await control.boxes(), 'grid');
  const {samples, titleFades} = await sampleReducedMotionChange(page, control);
  const boxes = await control.boxes();
  const table = boxOf(boxes, 'table');
  // Over in 200 ms or less (DR2); the titles switch at once.
  const fadeEnd = fadeEndOf(samples);
  expect(fadeEnd).toBeGreaterThan(0);
  expect(fadeEnd).toBeLessThanOrEqual(RM_MAX_FADE_MS);
  expect(samples[samples.length - 1].entering?.opacity).toBe(1);
  // No title cross-fades; the pressed title's dim fades on the same clock.
  for (const duration of titleFades) {
    expect(duration).toBeLessThanOrEqual(RM_MAX_FADE_MS);
  }
  for (const {t, entering, leaving} of samples) {
    const label = JSON.stringify({t, entering, leaving});
    expect(entering, label).not.toBeNull();
    // The new surface: at Table from the first frame, full size; only its
    // opacity changes (DR1).
    expect(Math.abs((entering?.x ?? 0) - table.x), label).toBeLessThan(0.5);
    expect(Math.abs((entering?.width ?? 0) - table.width), label).toBeLessThan(
      0.5,
    );
    expect(entering?.sx, label).toBe(1);
    expect(entering?.sy, label).toBe(1);
    // The old surface, while it shows: at Grid, full size.
    if (leaving != null && leaving.opacity > 0.001) {
      expect(Math.abs(leaving.x - grid.x), label).toBeLessThan(0.5);
      expect(Math.abs(leaving.width - grid.width), label).toBeLessThan(0.5);
      expect(leaving.sx, label).toBe(1);
      // One surface's worth of paint between the two.
      expect(
        Math.abs((entering?.opacity ?? 0) + leaving.opacity - 1),
        label,
      ).toBeLessThan(0.02);
    }
  }
  expect(samples[0].leaving?.opacity ?? 0).toBeGreaterThan(0.9);
  expect(samples[0].entering?.opacity ?? 1).toBeLessThan(0.1);
  // Then the segment paints its own surface again, and the leaving surface
  // is gone.
  await expectLensHidden(control);
  expect((await readLayer(control.group, '::after')).visible).toBe(false);
  await expect(control.segment('table')).not.toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
});

test('Reduce Motion: a theme’s durations cannot lengthen the fade or bring back travel (design:reduced-motion DR4)', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const control = await openControl(page);
  // A theme's motion is its duration scale; a slow one changes nothing here.
  await page.evaluate(() => {
    const root = document.documentElement.style;
    for (const name of ['fast', 'medium', 'slow']) {
      for (const suffix of ['', '-min', '-max']) {
        root.setProperty(`--duration-${name}${suffix}`, '1200ms');
      }
    }
  });
  const {samples, titleFades} = await sampleReducedMotionChange(page, control);
  const fadeEnd = fadeEndOf(samples);
  expect(fadeEnd).toBeGreaterThan(0);
  expect(fadeEnd).toBeLessThanOrEqual(RM_MAX_FADE_MS);
  // No visible surface ever moves, scales or resizes.
  const first = samples[0];
  for (const {t, entering, leaving} of samples) {
    const label = JSON.stringify({t, entering, leaving});
    expect(entering?.x, label).toBe(first.entering?.x);
    expect(entering?.width, label).toBe(first.entering?.width);
    expect(entering?.sx, label).toBe(1);
    if (leaving != null && leaving.opacity > 0.001) {
      expect(leaving.x, label).toBe(first.leaving?.x);
      expect(leaving.sx, label).toBe(1);
    }
  }
  // No title cross-fades; the pressed title's dim fades on the same clock.
  for (const duration of titleFades) {
    expect(duration).toBeLessThanOrEqual(RM_MAX_FADE_MS);
  }
});

interface SurfaceSample {
  opacity: number;
  sx: number;
  sy: number;
  x: number;
  width: number;
}

/**
 * Taps Table under Reduced Motion, with the lens's animations held from their
 * birth. It reads both surfaces every 8 ms of their animations: the lens
 * fading in and the ::after fading out. It also reads the title fades'
 * durations.
 */
async function sampleReducedMotionChange(
  page: Page,
  control: Control,
  act: () => Promise<unknown> = async () => control.tapSegment('table'),
): Promise<{
  samples: {
    t: number;
    entering: SurfaceSample | null;
    leaving: SurfaceSample | null;
  }[];
  titleFades: number[];
}> {
  await installTimerGate(page);
  await holdLensAnimationsAtBirth(page);
  await act();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as {__harnessHeld: Animation[]}).__harnessHeld
            .length,
      ),
    )
    .toBeGreaterThan(1);
  await freezeTimers(page);
  await page.evaluate(() => {
    (window as unknown as {__restoreAnimate: () => void}).__restoreAnimate();
  });
  const samples = await control.group.evaluate(group => {
    const held = (window as unknown as {__harnessHeld: Animation[]})
      .__harnessHeld;
    const read = (pseudo: '::before' | '::after') => {
      const style = getComputedStyle(group, pseudo);
      if (style.visibility !== 'visible') {
        return null;
      }
      const [sx, sy = sx] =
        style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
      return {
        opacity: Number(style.opacity),
        sx,
        sy,
        x:
          (parseFloat(style.left) || 0) +
          (style.translate === 'none' ? 0 : parseFloat(style.translate)),
        width: parseFloat(style.width),
      };
    };
    const out = [];
    for (let t = 0; t <= 1000; t += 8) {
      for (const animation of held) {
        const animationEnd = Number(
          animation.effect?.getComputedTiming().endTime ?? 0,
        );
        animation.currentTime = Math.min(t, Math.max(0, animationEnd - 0.5));
      }
      out.push({
        t,
        entering: read('::before'),
        leaving: read('::after'),
      });
    }
    return out;
  });
  const titleFades = await control.group.evaluate(group =>
    [...group.querySelectorAll('[data-astryx-segment-title]')].flatMap(
      element =>
        element
          .getAnimations()
          .map(a => Number(a.effect?.getComputedTiming().duration)),
    ),
  );
  await releaseAnimations(page);
  await thawTimers(page);
  return {samples, titleFades};
}

/** The last sampled time either surface's opacity is still on its way. */
function fadeEndOf(
  samples: {
    t: number;
    entering: SurfaceSample | null;
    leaving: SurfaceSample | null;
  }[],
): number {
  const last = samples[samples.length - 1];
  return Math.max(
    0,
    ...samples
      .filter(
        ({entering, leaving}) =>
          Math.abs((entering?.opacity ?? 0) - (last.entering?.opacity ?? 0)) >
            0.002 ||
          Math.abs((leaving?.opacity ?? 0) - (last.leaving?.opacity ?? 0)) >
            0.002,
      )
      .map(({t}) => t),
  );
}

/**
 * Pauses every animation started on the lens (the radiogroup's pseudo-elements
 * it) the moment it is created, into the harness's held set;
 * `__restoreAnimate` puts `Element.animate` back.
 */
async function holdLensAnimationsAtBirth(page: Page): Promise<void> {
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    const held: Animation[] = [];
    const w = window as unknown as {
      __harnessHeld: Animation[];
      __restoreAnimate: () => void;
    };
    w.__harnessHeld = held;
    w.__restoreAnimate = () => {
      Element.prototype.animate = original;
    };
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element['animate']>
    ): Animation {
      const animation = original.apply(this, args);
      const [, options] = args;
      if (
        this.getAttribute('role') === 'radiogroup' &&
        typeof options === 'object' &&
        options?.pseudoElement != null
      ) {
        animation.pause();
        held.push(animation);
      }
      return animation;
    };
  });
}

test('with a mouse a click slides the selection from the old segment to the new one, on the theme’s duration, as every change does', async ({
  browser,
}) => {
  const {context, group, lensShown} = await openWithMouse(browser);
  try {
    expect(await lensShown()).toBe(false);
    await expect(group.locator('[data-value="list"]')).toHaveCSS(
      'transition-property',
      'color, background-color, box-shadow',
    );
    // From the click on, the page reads the lens's first running translate
    // animation on each frame. It notes where the animation starts and ends,
    // and how long it runs.
    await group.evaluate(element => {
      const w = window as unknown as {
        __slide: {from: number; to: number; durationMs: number} | null;
      };
      w.__slide = null;
      const read = () => {
        for (const animation of element.getAnimations({subtree: true})) {
          const effect = animation.effect as KeyframeEffect | null;
          if (
            effect?.target !== element ||
            effect.pseudoElement !== '::before'
          ) {
            continue;
          }
          const frames = effect
            .getKeyframes()
            .filter(frame => typeof frame.translate === 'string');
          if (frames.length < 2) {
            continue;
          }
          // The animator holds the last value after the curve ends: the
          // curve's own length runs to the first frame at the end value.
          const values = frames.map(frame =>
            parseFloat(String(frame.translate)),
          );
          const to = values[values.length - 1];
          const firstAtEnd = frames.find(
            (frame, i) => Math.abs(values[i] - to) < 0.01,
          );
          w.__slide = {
            from: values[0],
            to,
            durationMs:
              (firstAtEnd?.computedOffset ?? 1) *
              Number(effect.getComputedTiming().duration ?? 0),
          };
          return;
        }
        requestAnimationFrame(read);
      };
      element.addEventListener('click', () => requestAnimationFrame(read), {
        capture: true,
        once: true,
      });
    });
    const themeMs = await group
      .locator('[data-value="table"]')
      .evaluate(
        segment =>
          parseFloat(getComputedStyle(segment).transitionDuration) * 1000,
      );
    await group.locator('[data-value="table"]').click();
    await expect(group.locator('[data-value="table"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const slide = await group.page().waitForFunction(
      () =>
        (
          window as unknown as {
            __slide: {from: number; to: number; durationMs: number} | null;
          }
        ).__slide,
      undefined,
      {timeout: 3000},
    );
    const {from, to, durationMs} = (await slide.jsonValue()) as {
      from: number;
      to: number;
      durationMs: number;
    };
    // Where the segments sit. A title's weight change moves them by a pixel
    // or so, so the start is checked to within 3 px.
    const centers = await group.evaluate(element => {
      const of = (value: string) => {
        const box = element
          .querySelector(`[data-value="${value}"]`)!
          .getBoundingClientRect();
        return box.left + box.width / 2;
      };
      return {grid: of('grid'), table: of('table')};
    });
    // It starts on the old segment and ends on the new one.
    expect(
      Math.abs(from - (centers.grid - centers.table)),
      JSON.stringify({from, centers}),
    ).toBeLessThan(3);
    expect(to).toBeCloseTo(0, 1);
    // The theme's duration, as the segments' own transition reads it.
    expect(themeMs).toBeGreaterThan(0);
    expect(Math.abs(durationMs - themeMs), String(durationMs)).toBeLessThan(25);
    // The lens hands the surface back once it settles.
    await expect.poll(lensShown, {timeout: 3000}).toBe(false);
  } finally {
    await context.close();
  }
});

test('the slide plays UISegmentedControl’s measured spring, an internal motion role: no theme setting retunes it', async ({
  page,
}) => {
  const control = await openControl(page);
  // Neither the variable a theme role once had nor a slow duration scale
  // changes the slide.
  await page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty('--motion-segmented-control-selection-spring', '0.25s 0');
    for (const name of ['fast', 'medium', 'slow']) {
      root.setProperty(`--duration-${name}`, '1200ms');
    }
  });
  const from = boxOf(await control.boxes(), 'grid');
  await control.tapSegment('table');
  await waitForLens(control);
  await holdLens(control);
  const samples = await sampleLens(control.group, timeline(400));
  await releaseAnimations(page);
  // Where Table is once its title has its new weight: where the lens aims.
  const to = boxOf(await control.boxes(), 'table');
  const fit = compareCurve(
    samples.map(sample => ({t: sample.t, value: sample.center})),
    t =>
      centerOf(from) + (centerOf(to) - centerOf(from)) * springStep(SLIDE, t),
    0.25,
  );
  expect(fit.maxError, JSON.stringify(fit.worst)).toBeLessThanOrEqual(0.25);
  // ...not the spring the variable names.
  const variable = {response: 0.25, dampingFraction: 1} as const;
  const other = compareCurve(
    samples.map(sample => ({t: sample.t, value: sample.center})),
    t =>
      centerOf(from) +
      (centerOf(to) - centerOf(from)) * springStep(variable, t),
    0.25,
  );
  expect(other.maxError).toBeGreaterThan(5);
});

test('RTL: the surface slides toward the tapped segment', async ({page}) => {
  const control = await openControl(
    page,
    'core-segmentedcontrol--default',
    'View mode',
    {direction: 'rtl'},
  );
  const grid = boxOf(await control.boxes(), 'grid');
  await control.tapSegment('table');
  await waitForLens(control);
  await holdLens(control);
  const [start, end] = await sampleLens(control.group, [0, 2000]);
  // Where Table is once its title has its new weight.
  const table = boxOf(await control.boxes(), 'table');
  // The first segment is on the right in RTL.
  expect(grid.x).toBeGreaterThan(table.x);
  expect(start.center).toBeCloseTo(centerOf(grid), 1);
  expect(end.center).toBeCloseTo(centerOf(table), 1);
  // On screen, not only in the numbers: held at its last frame, the lens
  // covers the tapped segment exactly (its box in viewport pixels).
  const [lensBox, tableBox] = await Promise.all([
    control.group.evaluate(group => {
      const style = getComputedStyle(group, '::before');
      const host = group.getBoundingClientRect();
      const translate =
        style.translate === 'none' ? 0 : parseFloat(style.translate);
      const [sx, sy = sx] =
        style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
      const width = parseFloat(style.width);
      const height = parseFloat(style.height);
      const left = host.left + group.clientLeft + parseFloat(style.left);
      const top = host.top + group.clientTop + parseFloat(style.top);
      return {
        x: left + width / 2 + translate - (width * sx) / 2,
        y: top + height / 2 - (height * sy) / 2,
        width: width * sx,
        height: height * sy,
      };
    }),
    control.segment('table').boundingBox(),
  ]);
  await releaseAnimations(page);
  expect(tableBox).not.toBeNull();
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(
      Math.abs(lensBox[key] - (tableBox?.[key] ?? NaN)),
      `${key}: ${JSON.stringify({lensBox, tableBox})}`,
    ).toBeLessThan(0.5);
  }
});

test('Reduce Motion: the lens still follows the finger through a drag (direct movement), and only the lift cross-fades (design:reduced-motion)', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const control = await openControl(page);
  const grid = boxOf(await control.boxes(), 'grid');
  const tableAtRest = boxOf(await control.boxes(), 'table');
  const tableCenter = tableAtRest.x + tableAtRest.width / 2;
  const selections = await recordSelections(control.group);
  const held: {visible: boolean; center: number}[] = [];
  let liftAt = 0;
  const {samples} = await sampleReducedMotionChange(page, control, async () => {
    const played = await control.driver.play(
      touchDrag(
        await clientCenter(control, 'grid'),
        await clientCenter(control, 'table'),
        {durationMs: 400, restMs: 100},
      ),
      {
        onEvent: async step => {
          if (step.type === 'touchMove') {
            const now = await presentedNow(control);
            held.push({visible: now.visible, center: now.center});
          }
        },
      },
    );
    liftAt = played.find(event => event.type === 'touchEnd')?.dispatchedAt ?? 0;
  });
  // Once the pan claims the drag and binds the lens, the lens stays on screen
  // and goes where the finger goes, at once. It ends on Table, where the
  // finger rests.
  const bound = held.findIndex(sample => sample.visible);
  expect(bound, JSON.stringify(held)).toBeGreaterThanOrEqual(0);
  const following = held.slice(bound);
  expect(following.length).toBeGreaterThan(5);
  expect(
    following.every(sample => sample.visible),
    JSON.stringify(held),
  ).toBe(true);
  for (let i = 1; i < following.length; i++) {
    expect(following[i].center).toBeGreaterThanOrEqual(
      following[i - 1].center - 0.5,
    );
  }
  expect(
    Math.abs(following[following.length - 1].center - tableCenter),
  ).toBeLessThan(1);
  // The segment under the finger at the lift, once.
  const changes = await selections();
  expect(changes.map(change => change.value)).toEqual(['table']);
  expect(changes[0].at).toBeGreaterThanOrEqual(liftAt - 5);
  // Then it cross-fades in 200 ms or less (DR1, DR2). The lens fades in on
  // Table, full size and still, where Table sits with its new title weight.
  // The ::after fades out where the lens was at the lift: on Table's center,
  // at the width it carried from Grid.
  const table = boxOf(await control.boxes(), 'table');
  const fadeEnd = fadeEndOf(samples);
  expect(fadeEnd).toBeGreaterThan(0);
  expect(fadeEnd).toBeLessThanOrEqual(RM_MAX_FADE_MS);
  for (const {t, entering, leaving} of samples) {
    const label = JSON.stringify({t, entering, leaving});
    expect(Math.abs((entering?.x ?? 0) - table.x), label).toBeLessThan(0.5);
    expect(entering?.sx, label).toBe(1);
    if (leaving != null && leaving.opacity > 0.001) {
      expect(
        Math.abs(leaving.x - (tableCenter - grid.width / 2)),
        label,
      ).toBeLessThan(1);
      expect(leaving.sx, label).toBe(1);
    }
  }
  await expectLensHidden(control);
});

test('the slide keeps advancing every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright (WebKit is recorded on the iOS simulator)',
  );
  const control = await openControl(page);
  const cast = await startScreencast(page);
  await control.tapSegment('table');
  // Running and composited before the block.
  const [slide] = await waitForLens(control, {minProgressMs: 16});
  // The lens has no element to carry the harness's marker chip: paint the
  // lens itself in the marker colour for the frames to find it.
  await paintLensMarker(control);
  const block = await blockMainThread(page, 500);
  await page.waitForTimeout(250);
  const castFrames = await cast.stop();
  const tracked = await trackMarker(page, castFrames);
  const proof = busyWindowProof(
    tracked,
    {from: block.from, to: Math.min(block.to, slide.to)},
    {axis: 'x', settledWithin: 1},
  );
  await writeEvidence(
    'busy-main-thread/segmented-slide',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          slide,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - block.from).toFixed(1),
            x: f.box?.x ?? null,
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'segmented-slide-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: Math.min(block.to, slide.to) + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({x: tracked.find(f => f.t === t)?.box?.x ?? -1}),
  });
  await film.write(testInfo, {block, slide});
  expect(proof.frames).toBeGreaterThanOrEqual(proof.expectedFrames - 2);
  expect(proof.changed).toBeGreaterThanOrEqual(proof.frames - 3);
});

test('the slide does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  await openControl(page, 'core-segmentedcontrol--selection-motion', 'Period');
  // A change the app makes, by a DOM click on the story's button. It slides
  // the same way, with no press model, focus ring or keyboard hint.
  const next = page.getByRole('button', {name: 'Next period'});
  // The story's two controls share the value, so both slide; each lands (and
  // hands its surface back) on its own clock.
  const groups = page.getByRole('radiogroup');
  await expect(groups).toHaveCount(2);
  const handBacks = await recordHandBacks(page);
  let start = 0;
  const started = Date.now();
  const trace = await traceRendering(page, async () => {
    await next.evaluate(button => (button as HTMLButtonElement).click());
    const slides = await Promise.all(
      [0, 1].map(async i => (await waitForAnimation(groups.nth(i)))[0]),
    );
    start = Math.max(...slides.map(slide => slide.from));
    // Wait in the test runner, not in the page. Polling the page forces its
    // own style and layout work into the measured window.
    await new Promise(resolve => setTimeout(resolve, 1500));
  });
  const landed = await handBacks();
  expect(landed).toHaveLength(2);
  // The steady part of the slides: their first frame commits the selection
  // and the first hand-back ends it.
  const during = countBetween(trace, start + 50, Math.min(...landed) - 50);
  expect(Math.min(...landed) - start).toBeGreaterThan(500);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  // No long task once the slides run. The click's own task ends at their
  // first frame: React renders the story, and the motion starts both slides.
  // That task is the change's work, not the slides', and its length follows
  // the machine's load.
  const sinceSlides = (tasks: ReadonlyArray<{start: number}>) =>
    tasks.filter(task => task.start >= start);
  expect(sinceSlides(trace.longTasks)).toEqual([]);
  expect(
    sinceSlides(await readLongTasks(page, {from: started, to: Date.now()})),
  ).toEqual([]);
});

test('assistive technology sees the same radios: the lens is decoration with no element', async ({
  page,
}) => {
  const control = await openControl(page);
  await control.tapSegment('list');
  await expect(control.group).toMatchAriaSnapshot(`
    - radiogroup "View mode":
      - radio "Grid"
      - radio "List" [checked]
      - radio "Table"
  `);
});

test(
  'storyboard: tap to slide, and a second tap mid-flight',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const control = await openControl(page);
    await installTimerGate(page);
    const measure = async () => {
      const [sample] = await control.group.evaluate(element => {
        const style = getComputedStyle(element, '::before');
        const x = style.translate === 'none' ? 0 : parseFloat(style.translate);
        return [
          {
            x: parseFloat(style.left) + parseFloat(style.width) / 2 + x,
            scaleX: style.scale === 'none' ? 1 : parseFloat(style.scale),
            visible: style.visibility === 'visible',
          },
        ];
      });
      return sample;
    };
    await control.tapSegment('table');
    await waitForLens(control);
    await freezeTimers(page);
    const {storyboard: slideBoard} = await animationStoryboard(page, {
      name: 'segmented-tap-slide',
      times: timeline(700),
      clip: control.group,
      scope: control.group,
      measure,
      columns: 8,
      cellScale: 1,
    });
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    await slideBoard.write(testInfo);
    const xs = slideBoard.frames.map(f => f.data.x as number);
    const boxes = await control.boxes();
    const table = boxOf(boxes, 'table');
    // The center rises to the destination's, overshoots a little, settles.
    expect(xs.at(-1)).toBeCloseTo(centerOf(table), 0);
    expect(Math.max(...xs)).toBeGreaterThan(centerOf(table));
    expect(Math.max(...xs) - centerOf(table)).toBeLessThan(2);

    // A second tap 80 ms into a slide back to the first segment.
    await control.tapSegment('grid');
    await waitForLens(control, {minProgressMs: 80});
    await control.tapSegment('list');
    await waitForLens(control);
    await freezeTimers(page);
    const {storyboard: retargetBoard} = await animationStoryboard(page, {
      name: 'segmented-retarget',
      times: timeline(700),
      clip: control.group,
      scope: control.group,
      measure,
      columns: 8,
      cellScale: 1,
    });
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    await retargetBoard.write(testInfo);
    const retargetXs = retargetBoard.frames.map(f => f.data.x as number);
    // Where List is now: the titles' weights changed with the selection.
    const list = boxOf(await control.boxes(), 'list');
    expect(retargetXs.at(-1)).toBeCloseTo(centerOf(list), 0);
    // Continuous: no frame-to-frame jump larger than the fastest frame of a
    // fresh slide would make.
    for (let i = 1; i < retargetXs.length; i++) {
      expect(Math.abs(retargetXs[i] - retargetXs[i - 1])).toBeLessThan(25);
    }
  },
);

/** Records each selection change (value, epoch ms on the page's clock). */
async function recordSelections(
  group: Locator,
): Promise<() => Promise<{value: string; at: number}[]>> {
  await group.evaluate(track => {
    const changes: {value: string; at: number}[] = [];
    (window as unknown as {__selections: typeof changes}).__selections =
      changes;
    new MutationObserver(records => {
      for (const record of records) {
        const element = record.target as HTMLElement;
        if (element.getAttribute('aria-checked') === 'true') {
          changes.push({
            value: element.dataset.value ?? '',
            at: performance.timeOrigin + performance.now(),
          });
        }
      }
    }).observe(track, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-checked'],
    });
  });
  return async () =>
    group.evaluate(
      () =>
        (window as unknown as {__selections: {value: string; at: number}[]})
          .__selections,
    );
}

/** The lens's presented center and size right now (no hold). */
async function presentedNow(control: Control) {
  return control.group.evaluate(element => {
    const style = getComputedStyle(element, '::before');
    const x = style.translate === 'none' ? 0 : parseFloat(style.translate);
    const [sx, sy = sx] =
      style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
    return {
      center: parseFloat(style.left) + parseFloat(style.width) / 2 + x,
      width: parseFloat(style.width) * sx,
      height: parseFloat(style.height) * sy,
      visible: style.visibility === 'visible',
    };
  });
}

/** A segment's center in client coordinates. */
async function clientCenter(control: Control, value: string) {
  const box = await control.segment(value).boundingBox();
  if (box == null) {
    throw new Error(`no segment ${value}`);
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

test('holding the selected segment lifts nothing by default (a theme’s pressed-thumb lift turns it on): no lens and no shadow; letting go changes nothing', async ({
  page,
}) => {
  const control = await openControl(page);
  const selections = await recordSelections(control.group);
  // Every time the radiogroup's style shows a pseudo-element layer.
  await control.group.evaluate(group => {
    const shown: string[] = [];
    (window as unknown as {__layersShown: string[]}).__layersShown = shown;
    new MutationObserver(() => {
      const lens = group.style.getPropertyValue('--_segmented-lens-visibility');
      const after = group.style.getPropertyValue(
        '--_segmented-after-visibility',
      );
      if (lens !== '' || after !== '') {
        shown.push(`lens=${lens} after=${after}`);
      }
    }).observe(group, {attributes: true, attributeFilter: ['style']});
  });
  await control.driver.play(
    touchTap(await clientCenter(control, 'grid'), {holdMs: 700}),
  );
  expect(
    await page.evaluate(
      () => (window as unknown as {__layersShown: string[]}).__layersShown,
    ),
  ).toEqual([]);
  // The selected segment kept painting its own surface throughout.
  expect(
    await control
      .segment('grid')
      .evaluate(element =>
        (element as HTMLElement).style.getPropertyValue('background-color'),
      ),
  ).toBe('');
  expect(await selections()).toEqual([]);
});

test('a drag from the selected segment carries the lens and commits once, at the lift', async ({
  page,
}) => {
  const control = await openControl(page);
  const boxes = await control.boxes();
  const selections = await recordSelections(control.group);
  const from = await clientCenter(control, 'grid');
  const to = await clientCenter(control, 'table');
  const midDrag: {finger: number; lens: number; width: number; at: number}[] =
    [];
  const played = await control.driver.play(
    touchDrag(from, to, {durationMs: 600, restMs: 200}),
    {
      onEvent: async (step, index) => {
        if (step.type === 'touchMove' && index % 6 === 0) {
          const now = await presentedNow(control);
          midDrag.push({
            finger: step.changed[0].x,
            lens: now.center,
            width: now.width,
            at: Date.now(),
          });
        }
      },
    },
  );
  const lift = played.find(event => event.type === 'touchEnd');
  const changes = await selections();
  expect(changes.map(change => change.value)).toEqual(['table']);
  // Not before the finger let go.
  expect(changes[0].at).toBeGreaterThanOrEqual((lift?.dispatchedAt ?? 0) - 5);
  // The lens followed the finger at its resting size (trailing it on the
  // tracking spring, by less than the width of a segment).
  const trackLeft = (await control.group.boundingBox())?.x ?? 0;
  for (const sample of midDrag.slice(2)) {
    // Nothing lifts it: its width stays a segment's.
    expect(sample.width).toBeLessThan(boxOf(boxes, 'grid').width + 12);
    const lag = sample.finger - trackLeft - sample.lens;
    expect(lag).toBeGreaterThan(-2);
    expect(lag).toBeLessThan(40);
  }
  await expectLensHidden(control);
});

test('letting go between segments commits the one nearest the finger', async ({
  page,
}) => {
  for (const [progress, expected] of [
    [0.4, 'grid'],
    [0.6, 'list'],
  ] as const) {
    const control = await openControl(page);
    const selections = await recordSelections(control.group);
    const from = await clientCenter(control, 'grid');
    const list = await clientCenter(control, 'list');
    const to = {x: from.x + (list.x - from.x) * progress, y: from.y};
    await control.driver.play(
      touchDrag(from, to, {durationMs: 300, restMs: 200}),
    );
    await expectLensHidden(control);
    await expect(control.segment(expected)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect((await selections()).map(change => change.value)).toEqual(
      expected === 'grid' ? [] : [expected],
    );
  }
});

test('past the end segment the lens stops 11 pt beyond its center, and letting go out there selects nothing (a press that slides off cancels: spec:AST-020 FR9, DEC-5)', async ({
  page,
}) => {
  const control = await openControl(page);
  const table = boxOf(await control.boxes(), 'table');
  const from = await clientCenter(control, 'grid');
  const end = await control.segment('table').boundingBox();
  if (end == null) {
    throw new Error('no table segment');
  }
  const script = touchDrag(
    from,
    {x: end.x + end.width + 60, y: from.y},
    {durationMs: 500, restMs: 700},
  );
  const lastMove = toTouchEvents(script).length - 2;
  let resting: {center: number} | null = null;
  await control.driver.play(script, {
    onEvent: async (_step, index) => {
      if (index === lastMove) {
        // The finger rests 60 pt past the control; the chase settles.
        await page.waitForTimeout(450);
        resting = await presentedNow(control);
      }
    },
  });
  expect(resting).not.toBeNull();
  const center = (resting as unknown as {center: number}).center;
  expect(Math.abs(center - (centerOf(table) + DRAG_OVERSHOOT))).toBeLessThan(
    1.5,
  );
  // The finger let go 60 pt outside the control: nothing is selected, and
  // the lens goes back to the selected segment.
  await expectLensHidden(control);
  await expect(control.segment('grid')).toHaveAttribute('aria-checked', 'true');
  await expect(control.segment('table')).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

test('a drag that leaves the control and lets go below it selects nothing: a press that slides off cancels (spec:AST-020 FR9, DEC-5)', async ({
  page,
}) => {
  const control = await openControl(page);
  const selections = await recordSelections(control.group);
  const from = await clientCenter(control, 'grid');
  const table = await clientCenter(control, 'table');
  const group = await control.group.boundingBox();
  if (group == null) {
    throw new Error('no radiogroup');
  }
  // Sideways onto Table first (the drag claims the finger), then down and
  // off the control, and let go 40 pt below it.
  const below = {x: table.x, y: group.y + group.height + 40};
  const sideways = touchDrag(from, table, {durationMs: 400}).slice(0, -1);
  const lastT = sideways[sideways.length - 1].t;
  const off = touchDrag(table, below, {durationMs: 300, restMs: 200})
    .slice(1)
    .map(frame => ({...frame, t: frame.t + lastT}));
  await control.driver.play([...sideways, ...off]);
  await expectLensHidden(control);
  await expect(control.segment('grid')).toHaveAttribute('aria-checked', 'true');
  expect(await selections()).toEqual([]);
});

test('a drag that starts on another segment leaves the lens alone and commits where it lets go', async ({
  page,
}) => {
  const control = await openControl(page);
  const selections = await recordSelections(control.group);
  const from = await clientCenter(control, 'list');
  const to = await clientCenter(control, 'table');
  const visibleDuringDrag: boolean[] = [];
  await control.driver.play(
    touchDrag(from, to, {durationMs: 400, restMs: 100}),
    {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          visibleDuringDrag.push((await presentedNow(control)).visible);
        }
      },
    },
  );
  expect(visibleDuringDrag.length).toBeGreaterThan(5);
  expect(visibleDuringDrag.every(visible => !visible)).toBe(true);
  // Lift position wins, as in UIKit.
  expect((await selections()).map(change => change.value)).toEqual(['table']);
});

/** The pressed segment's paint, read where its press marker changes. */
interface PressRecord {
  readonly press: string | null;
  readonly image: string;
  readonly opacity: string;
  readonly title: string;
}

test('a finger on an unselected segment shows the shared pressed overlay and dims nothing; the lift commits it', async ({
  page,
}) => {
  const control = await openControl(page);
  const list = control.segment('list');
  // The press paint lasts only while the finger is down, so the page records
  // it as it changes. A poll from the test can miss that window, because
  // WebKit's input commands and the test's reads share one channel.
  await list.evaluate(element => {
    const records: PressRecord[] = [];
    (window as unknown as {__pressRecords: PressRecord[]}).__pressRecords =
      records;
    new MutationObserver(() => {
      records.push({
        press: element.getAttribute('data-astryx-press'),
        image: getComputedStyle(element).backgroundImage,
        opacity: getComputedStyle(element).opacity,
        title: getComputedStyle(
          element.querySelector('[data-astryx-segment-title]') as Element,
        ).opacity,
      });
    }).observe(element, {
      attributes: true,
      attributeFilter: ['data-astryx-press'],
    });
  });
  await control.driver.play(
    touchTap(await clientCenter(control, 'list'), {holdMs: 400}),
  );
  const records = await page.evaluate(
    () => (window as unknown as {__pressRecords: PressRecord[]}).__pressRecords,
  );
  // The shared press paint, as everywhere under a finger. The press
  // controller marks the segment once it believes the press, and the shared
  // overlay paints it.
  const held = records.find(record => record.press === 'on');
  expect(held, JSON.stringify(records)).toBeDefined();
  // While the controller paints, the overlay is its image layer.
  expect(held?.image).toContain('gradient');
  // Nothing dims: not the segment, not its title.
  expect({opacity: held?.opacity, title: held?.title}).toEqual({
    opacity: '1',
    title: '1',
  });
  await expect(list).toHaveAttribute('aria-checked', 'true');
  await expect(list).toHaveCSS('opacity', '1');
  await expect(list).not.toHaveAttribute('data-pressed');
});

test('during a drag the selected face follows the lens as a colour, with no weight swap mid-drag, and the commit keeps it as shown', async ({
  page,
}) => {
  const control = await openControl(page);
  const read = async (value: string) =>
    control
      .segment(value)
      .locator('[data-astryx-segment-title]')
      .evaluate(element => {
        const style = getComputedStyle(element);
        return {weight: style.fontWeight, color: style.color};
      });
  const selected = await read('grid');
  const unselected = await read('list');
  expect(selected.color).not.toBe(unselected.color);
  const boxes = await control.boxes();
  const list = boxOf(boxes, 'list');
  const table = boxOf(boxes, 'table');
  const groupBox = await control.group.boundingBox();
  const seen: {
    finger: number;
    grid: {weight: string; color: string};
    list: {weight: string; color: string};
    table: {weight: string; color: string};
  }[] = [];
  await control.driver.play(
    touchDrag(
      await clientCenter(control, 'grid'),
      await clientCenter(control, 'table'),
      {durationMs: 600, restMs: 300},
    ),
    {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          seen.push({
            finger: step.changed[0].x - (groupBox?.x ?? 0),
            grid: await read('grid'),
            list: await read('list'),
            table: await read('table'),
          });
        }
      },
    },
  );
  expect(seen.length).toBeGreaterThan(5);
  // No title changes weight mid-drag: the segments never reflow under it.
  for (const s of seen) {
    expect(s.grid.weight).toBe(selected.weight);
    expect(s.list.weight).toBe(unselected.weight);
    expect(s.table.weight).toBe(unselected.weight);
  }
  // The face trails the finger with the lens, never ahead of it.
  const gapMiddle = (list.x + list.width + table.x) / 2;
  for (const s of seen.filter(s => s.finger < gapMiddle - 1)) {
    expect(s.table.color, `finger at ${s.finger}`).toBe(unselected.color);
  }
  expect(seen.at(-1)?.table.color).toBe(selected.color);
  await expect(control.segment('table')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // The commit takes the face over: no borrowed style is left.
  expect(
    await control.group.evaluate(group =>
      [...group.querySelectorAll<HTMLElement>('[data-astryx-segment-title]')]
        .map(title => title.style.cssText)
        .join(''),
    ),
  ).toBe('');
  expect((await read('table')).weight).toBe(selected.weight);
});

test('a slow ±3 px dither across a boundary changes the selected face at most once', async ({
  page,
}) => {
  const control = await openControl(page);
  const colorOf = async (value: string) =>
    control
      .segment(value)
      .locator('[data-astryx-segment-title]')
      .evaluate(element => getComputedStyle(element).color);
  const selectedColor = await colorOf('grid');
  const faced = async () => {
    for (const value of ['list', 'grid', 'table']) {
      if (value !== 'grid' && (await colorOf(value)) === selectedColor) {
        return value;
      }
    }
    return 'grid';
  };
  const boxes = await control.boxes();
  const grid = boxOf(boxes, 'grid');
  const list = boxOf(boxes, 'list');
  const groupBox = await control.group.boundingBox();
  const y = (groupBox?.y ?? 0) + (groupBox?.height ?? 0) / 2;
  const boundary = (groupBox?.x ?? 0) + (grid.x + grid.width + list.x) / 2;
  const start = await clientCenter(control, 'grid');
  // Held on Grid, carried to the boundary, then dithered ±3 px, 70 ms a step.
  const script = [
    {t: 0, fingers: [{id: 0, x: start.x, y}]},
    {t: 300, fingers: [{id: 0, x: boundary, y}]},
    ...Array.from({length: 24}, (_, i) => ({
      t: 700 + i * 70,
      fingers: [{id: 0, x: boundary + (i % 2 === 0 ? 3 : -3), y}],
    })),
    {t: 700 + 24 * 70 + 50, fingers: []},
  ];
  const faces: string[] = [];
  await control.driver.play(script, {
    onEvent: async step => {
      if (step.type === 'touchMove' && step.t >= 700) {
        faces.push(await faced());
      }
    },
  });
  const changes = faces.filter((face, i) => i > 0 && face !== faces[i - 1]);
  expect(changes.length, faces.join(' ')).toBeLessThanOrEqual(1);
});

test('a drag held just past a boundary: at the lift the selected colour snaps to the segment nearest the finger, which it commits', async ({
  page,
}) => {
  const control = await openControl(page);
  const boxes = await control.boxes();
  const grid = boxOf(boxes, 'grid');
  const list = boxOf(boxes, 'list');
  const groupBox = await control.group.boundingBox();
  const y = (groupBox?.y ?? 0) + (groupBox?.height ?? 0) / 2;
  const boundary = (groupBox?.x ?? 0) + (grid.x + grid.width + list.x) / 2;
  const start = await clientCenter(control, 'grid');
  const selections = await recordSelections(control.group);
  // Held on Grid, carried 3 px past the boundary, rested, lifted.
  await control.driver.play([
    {t: 0, fingers: [{id: 0, x: start.x, y}]},
    {t: 300, fingers: [{id: 0, x: boundary - 10, y}]},
    {t: 400, fingers: [{id: 0, x: boundary + 3, y}]},
    {t: 900, fingers: []},
  ]);
  // The hysteresis kept the colour on Grid while held; the lift commits List,
  // the nearest, and the colour snaps there with the selection.
  await expect(control.segment('list')).toHaveAttribute('aria-checked', 'true');
  // The gesture ends when the lens hands its surface back.
  await expectLensHidden(control);
  expect((await selections()).map(change => change.value)).toEqual(['list']);
});

test('a tap’s commit is the browser’s own click (spec:AST-094 FR11)', async ({
  page,
}) => {
  const control = await openControl(page);
  await control.segment('table').evaluate(element => {
    const w = window as unknown as {__trusted: boolean[]};
    w.__trusted = [];
    element.addEventListener(
      'click',
      event => w.__trusted.push(event.isTrusted),
      {
        capture: true,
      },
    );
  });
  // The engine's tap path. Playwright's WebKit makes the browser's click only
  // from its tap gesture, not from a raw touch sequence. The harness README
  // lists this limit. Chromium's touch input clicks either way.
  await control.driver.tap(await clientCenter(control, 'table'));
  await expect(control.segment('table')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // The lens hands back only after the commit's click, so no click comes
  // after it.
  await expectLensHidden(control);
  expect(
    await page.evaluate(
      () => (window as unknown as {__trusted: boolean[]}).__trusted,
    ),
  ).toEqual([true]);
});

/**
 * Counts the clicks that reach a segment. With `veto`, it prevents them as an
 * item's consumer `onClick` would, with `event.preventDefault()`. The item's
 * own handler honors that.
 */
async function watchClicks(
  control: Control,
  value: string,
  {veto = false}: {veto?: boolean} = {},
): Promise<() => Promise<number>> {
  await control.segment(value).evaluate((element, shouldVeto) => {
    const counter = {count: 0};
    (element as unknown as {__clicks: typeof counter}).__clicks = counter;
    element.addEventListener(
      'click',
      event => {
        counter.count++;
        if (shouldVeto) {
          event.preventDefault();
        }
      },
      {capture: true},
    );
  }, veto);
  return async () =>
    control
      .segment(value)
      .evaluate(
        element =>
          (element as unknown as {__clicks: {count: number}}).__clicks.count,
      );
}

test('a tap commits through the item’s click: its onClick runs once and can veto with preventDefault()', async ({
  page,
}) => {
  const control = await openControl(page);
  const clicks = await watchClicks(control, 'table');
  const selections = await recordSelections(control.group);
  await control.driver.play(
    touchTap(await clientCenter(control, 'table'), {holdMs: 80}),
  );
  await expect(control.segment('table')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // Once: the browser's own click for the touch selects nothing again. The
  // lens hands back only after the commit's click.
  await expectLensHidden(control);
  expect(await clicks()).toBe(1);
  expect((await selections()).map(change => change.value)).toEqual(['table']);
});

test('a tap whose browser click comes late (a busy main thread) runs the item’s click once', async ({
  page,
}) => {
  const control = await openControl(page);
  const clicks = await watchClicks(control, 'table');
  const selections = await recordSelections(control.group);
  // Counts the browser's own clicks where the window first sees them, before
  // any listener of the control.
  await page.evaluate(() => {
    const w = window as unknown as {__browserClicks: number};
    w.__browserClicks = 0;
    window.addEventListener(
      'click',
      event => {
        if (event.isTrusted) {
          w.__browserClicks++;
        }
      },
      {capture: true},
    );
  });
  // The lift arms a 300 ms wait for the browser's click. Block the main
  // thread for 450 ms right after it. Then the browser's click for this tap
  // comes only after the wait ran out.
  await page.evaluate(() => {
    const original = window.setTimeout;
    const patched = (
      handler: TimerHandler,
      ms?: number,
      ...rest: unknown[]
    ): number => {
      const id = original(handler, ms, ...rest);
      if (ms === 300) {
        window.setTimeout = original;
        const end = performance.now() + 450;
        while (performance.now() < end) {
          // busy: the main thread is blocked
        }
      }
      return id;
    };
    window.setTimeout = patched as typeof window.setTimeout;
  });
  await control.driver.tap(await clientCenter(control, 'table'));
  await expect(control.segment('table')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // The browser's late click has come, and the control swallowed it.
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as {__browserClicks: number}).__browserClicks,
      ),
    )
    .toBe(1);
  expect(await clicks()).toBe(1);
  expect((await selections()).map(change => change.value)).toEqual(['table']);
});

test('a vetoed tap selects nothing, and the lens goes back to the selection', async ({
  page,
}) => {
  const control = await openControl(page);
  const vetoedClicks = await watchClicks(control, 'table', {veto: true});
  const selections = await recordSelections(control.group);
  await control.driver.play(
    touchTap(await clientCenter(control, 'table'), {holdMs: 80}),
  );
  // The vetoed click ends the gesture.
  await expect.poll(vetoedClicks).toBe(1);
  expect(await selections()).toEqual([]);
  await expect(control.segment('grid')).toHaveAttribute('aria-checked', 'true');
  // The lens settles back on Grid and hands its surface back.
  await expectLensHidden(control);
  expect(
    await control.group.evaluate(group =>
      [...group.querySelectorAll<HTMLElement>('[role="radio"]')]
        .map(segment => segment.style.cssText)
        .join(''),
    ),
  ).toBe('');
});

test('a parent that adopts the value 200 ms later gets no bounce: the lens keeps going and lands there', async ({
  page,
}) => {
  const control = await openControl(page);
  // The story's parent adopts a value at once, but this one waits 200 ms
  // after the click. The commit's own click goes unheard, and nobody vetoes
  // it. A later programmatic click delivers the value.
  await control.segment('table').evaluate(segment => {
    const lens: number[] = [];
    (window as unknown as {__lens: number[]}).__lens = lens;
    const group = segment.closest('[role="radiogroup"]') as HTMLElement;
    const sample = () => {
      const style = getComputedStyle(group, '::before');
      if (style.visibility === 'visible') {
        const translate =
          style.translate === 'none' ? 0 : parseFloat(style.translate);
        lens.push(
          parseFloat(style.left) + parseFloat(style.width) / 2 + translate,
        );
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    const hold = (event: Event) => {
      if ((event as MouseEvent).detail === 0) {
        return;
      }
      event.stopImmediatePropagation();
      segment.removeEventListener('click', hold, true);
      setTimeout(() => {
        (segment as HTMLElement).click();
      }, 200);
    };
    segment.addEventListener('click', hold, true);
  });
  await control.tapSegment('table');
  await expect(control.segment('table')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expectLensHidden(control);
  const centers = await page.evaluate(
    () => (window as unknown as {__lens: number[]}).__lens,
  );
  expect(centers.length).toBeGreaterThan(10);
  // Every presented frame heads for Table: never back toward Grid (beyond
  // the spring's own overshoot of about a pixel at the end).
  let highest = -Infinity;
  for (const center of centers) {
    expect(center, JSON.stringify(centers)).toBeGreaterThan(highest - 2);
    highest = Math.max(highest, center);
  }
});

test('with focus already in the group, a vetoed finger tap still selects nothing: the focus move before its click selects nothing', async ({
  page,
}) => {
  const control = await openControl(page);
  // Focus is in the group already, as after a key press or an earlier tap.
  await control.segment('grid').focus();
  const vetoedClicks = await watchClicks(control, 'table', {veto: true});
  const selections = await recordSelections(control.group);
  await control.driver.play(
    touchTap(await clientCenter(control, 'table'), {holdMs: 80}),
  );
  // The vetoed click ends the gesture.
  await expect.poll(vetoedClicks).toBe(1);
  if (control.driver.engine === 'chromium') {
    // Chromium moved focus to the tapped segment before its click: the case
    // under test happened.
    expect(
      await control
        .segment('table')
        .evaluate(segment => segment === document.activeElement),
    ).toBe(true);
  }
  expect(await selections()).toEqual([]);
  await expect(control.segment('grid')).toHaveAttribute('aria-checked', 'true');
  await expectLensHidden(control);
});

test('with focus already in the group, a vetoed tap whose click comes late still selects nothing', async ({
  page,
}) => {
  const control = await openControl(page);
  await control.segment('grid').focus();
  const vetoedClicks = await watchClicks(control, 'table', {veto: true});
  const selections = await recordSelections(control.group);
  await page.evaluate(() => {
    const w = window as unknown as {__trusted: number};
    w.__trusted = 0;
    window.addEventListener(
      'click',
      event => {
        if (event.isTrusted) {
          w.__trusted++;
        }
      },
      {capture: true},
    );
    // The wait for the browser's click runs out before the browser's tap
    // arrives, as under load. Chromium runs a queued tap before a due timer,
    // so the page ends the 300 ms wait in a microtask instead.
    const original = window.setTimeout;
    const patched = (
      handler: TimerHandler,
      ms?: number,
      ...rest: unknown[]
    ): number => {
      if (ms === 300 && typeof handler === 'function') {
        window.setTimeout = original;
        queueMicrotask(() => {
          handler();
        });
        return 0;
      }
      return original(handler, ms, ...rest);
    };
    window.setTimeout = patched as typeof window.setTimeout;
  });
  await control.driver.play(
    touchTap(await clientCenter(control, 'table'), {holdMs: 80}),
  );
  await expect.poll(vetoedClicks).toBe(1);
  if (control.driver.engine === 'chromium') {
    // The late tap came: its focus move, then its click, which is swallowed.
    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as unknown as {__trusted: number}).__trusted,
        ),
      )
      .toBe(1);
    expect(
      await control
        .segment('table')
        .evaluate(segment => segment === document.activeElement),
    ).toBe(true);
  }
  expect(await vetoedClicks()).toBe(1);
  expect(await selections()).toEqual([]);
  await expect(control.segment('grid')).toHaveAttribute('aria-checked', 'true');
});

test('an arrow key pressed while a held press waits for its click still selects the segment it moves focus to', async ({
  page,
}) => {
  const control = await openControl(page);
  await control.segment('grid').focus();
  const selections = await recordSelections(control.group);
  // A hold, which WebKit answers with no click: the wait for it runs on.
  await control.driver.play(
    touchTap(await clientCenter(control, 'table'), {holdMs: 600}),
  );
  await page.keyboard.press('ArrowRight');
  const focused = await page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.dataset.value,
  );
  // The arrow's own move selects: right away, whether the hold's commit came
  // before it (Chromium's click) or comes after it (WebKit's direct click).
  expect(focused).toBeDefined();
  await expect
    .poll(async () => (await selections()).map(change => change.value))
    .toContain(focused);
  await expectLensHidden(control);
});

test('with focus already in the group, a vetoed click from a mouse, a pen or the keyboard selects nothing', async ({
  browser,
}) => {
  const {context, page, group, centerOf} = await openWithMouse(browser);
  try {
    const selections = await recordSelections(group);
    const table = group.locator('[data-value="table"]');
    await table.evaluate(segment => {
      const w = window as unknown as {__vetoed: number};
      w.__vetoed = 0;
      segment.addEventListener(
        'click',
        event => {
          w.__vetoed++;
          event.preventDefault();
        },
        {capture: true},
      );
    });
    const vetoed = async () =>
      page.evaluate(() => (window as unknown as {__vetoed: number}).__vetoed);
    // A mouse: focus moves at the press, inside the group.
    await group.locator('[data-value="grid"]').focus();
    const at = await centerOf('table');
    await page.mouse.click(at.x, at.y);
    await expect.poll(vetoed).toBe(1);
    // A pen, where the engine has one.
    const driver = await webInputDriver(page);
    if (driver.pens) {
      await group.locator('[data-value="grid"]').focus();
      await driver.pen([{x: at.x, y: at.y, t: 0}]);
      await expect.poll(vetoed).toBe(2);
    }
    // The keyboard: Space on the focused segment, focused from outside.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await table.focus();
    await page.keyboard.press('Space');
    await expect.poll(vetoed).toBe(driver.pens ? 3 : 2);
    expect(await selections()).toEqual([]);
    await expect(group.locator('[data-value="grid"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  } finally {
    await context.close();
  }
});

test('a drag commits through the destination item’s click too: its onClick runs once, and a veto keeps the selection', async ({
  page,
}) => {
  const control = await openControl(page);
  const clicks = await watchClicks(control, 'table');
  const selections = await recordSelections(control.group);
  const from = await clientCenter(control, 'grid');
  const to = await clientCenter(control, 'table');
  await control.driver.play(
    touchDrag(from, to, {durationMs: 400, restMs: 100}),
  );
  await expect.poll(clicks).toBe(1);
  // The gesture ends when the lens hands its surface back.
  await expectLensHidden(control);
  expect(await clicks()).toBe(1);
  expect((await selections()).map(change => change.value)).toEqual(['table']);
  // Back to Grid, then a vetoed drag to List.
  await control.driver.play(
    touchTap(await clientCenter(control, 'grid'), {holdMs: 80}),
  );
  await expect(control.segment('grid')).toHaveAttribute('aria-checked', 'true');
  await expectLensHidden(control);
  const vetoedClicks = await watchClicks(control, 'list', {veto: true});
  const vetoed = await recordSelections(control.group);
  await control.driver.play(
    touchDrag(
      await clientCenter(control, 'grid'),
      await clientCenter(control, 'list'),
      {durationMs: 300, restMs: 100},
    ),
  );
  // The vetoed click ends the gesture.
  await expect.poll(vetoedClicks).toBe(1);
  expect(await vetoed()).toEqual([]);
  await expect(control.segment('grid')).toHaveAttribute('aria-checked', 'true');
  await expectLensHidden(control);
});

/** A desktop context: a mouse, no touch, a fine primary pointer. */
async function openWithMouse(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  group: Locator;
  centerOf: (value: string) => Promise<{x: number; y: number}>;
  lensShown: () => Promise<boolean>;
}> {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 1024, height: 768},
  });
  const page = await context.newPage();
  await openStory(page, storybook(), 'core-segmentedcontrol--default');
  // This context's pointer is fine (a context without touch can still match
  // a coarse one).
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  const group = page.getByRole('radiogroup', {name: 'View mode', exact: true});
  await expect(group).toBeVisible();
  const centerOf = async (value: string) => {
    const rect = await group.locator(`[data-value="${value}"]`).boundingBox();
    if (rect == null) {
      throw new Error(`no segment ${value}`);
    }
    return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
  };
  // The motion shows the lens through the radiogroup's own custom property.
  const lensShown = async () =>
    group.evaluate(
      element =>
        element.style.getPropertyValue('--_segmented-lens-visibility') ===
        'visible',
    );
  return {context, page, group, centerOf, lensShown};
}

test('with a mouse a drag from the selected segment carries the selection and commits where it lifts, as every pointer does (spec:AST-094 FR43)', async ({
  browser,
}) => {
  const {context, page, group, centerOf, lensShown} =
    await openWithMouse(browser);
  try {
    const selections = await recordSelections(group);
    const from = await centerOf('grid');
    const to = await centerOf('table');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 12});
    // Held: the lens is on the pointer, and nothing is committed before the
    // lift.
    expect(await lensShown()).toBe(true);
    await expect(group.locator('[data-value="grid"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.mouse.up();
    await expect(group.locator('[data-value="table"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect((await selections()).map(change => change.value)).toEqual(['table']);
    // The lens hands back once it settles.
    await expect.poll(lensShown, {timeout: 3000}).toBe(false);
    await expect(group.locator('[data-value="list"]')).toHaveCSS(
      'transition-property',
      'color, background-color, box-shadow',
    );
    // A click still selects.
    await group.locator('[data-value="list"]').click();
    await expect(group.locator('[data-value="list"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  } finally {
    await context.close();
  }
});

test('with a mouse a drag that starts on another segment carries no lens and commits only where it lifts, focus already in the group or not; the selection then slides there', async ({
  browser,
}) => {
  const {context, page, group, centerOf, lensShown} =
    await openWithMouse(browser);
  try {
    // A click on the selected segment first: focus is in the group, so the
    // press below moves focus within it, which must select nothing.
    await group.locator('[data-value="grid"]').click();
    const selections = await recordSelections(group);
    const from = await centerOf('list');
    const to = await centerOf('table');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 12});
    expect(await lensShown()).toBe(false);
    // Nothing is committed before the lift.
    await expect(group.locator('[data-value="grid"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.mouse.up();
    await expect(group.locator('[data-value="table"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect((await selections()).map(change => change.value)).toEqual(['table']);
    // The change slides as every change does, then hands the surface back.
    await expect.poll(lensShown, {timeout: 3000}).toBe(false);
  } finally {
    await context.close();
  }
});

test('with a mouse a drag that leaves the control and lets go there selects nothing: a press that slides off cancels (spec:AST-020 FR9, DEC-5)', async ({
  browser,
}) => {
  const {context, page, group, centerOf, lensShown} =
    await openWithMouse(browser);
  try {
    const selections = await recordSelections(group);
    const from = await centerOf('grid');
    const to = await centerOf('table');
    const box = await group.boundingBox();
    if (box == null) {
      throw new Error('no radiogroup');
    }
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 12});
    // Down and off the control, then let go 40 px below it.
    await page.mouse.move(to.x, box.y + box.height + 40, {steps: 6});
    await page.mouse.up();
    await expect.poll(lensShown, {timeout: 3000}).toBe(false);
    await expect(group.locator('[data-value="grid"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await selections()).toEqual([]);
  } finally {
    await context.close();
  }
});

test('with a mouse or a pen under Reduce Motion, a drag’s release lands the selection at once, with no fade (design:reduced-motion DR3)', async ({
  browser,
}) => {
  const {context, page, group, centerOf, lensShown} =
    await openWithMouse(browser);
  try {
    await page.emulateMedia({reducedMotion: 'reduce'});
    // Samples the lens (::before) and the leaving surface (::after) on every
    // frame until stopped: a fade shows a part-way lens or a visible ::after.
    const startSampling = async () =>
      group.evaluate(element => {
        const w = window as unknown as {
          __fadeFrames: string[];
          __stop: boolean;
        };
        w.__fadeFrames = [];
        w.__stop = false;
        const sample = () => {
          const lens = getComputedStyle(element, '::before');
          const after = getComputedStyle(element, '::after');
          if (lens.visibility === 'visible' && Number(lens.opacity) < 0.999) {
            w.__fadeFrames.push(`lens ${lens.opacity}`);
          }
          if (after.visibility === 'visible' && Number(after.opacity) > 0.001) {
            w.__fadeFrames.push(`after ${after.opacity}`);
          }
          if (!w.__stop) {
            requestAnimationFrame(sample);
          }
        };
        requestAnimationFrame(sample);
      });
    const stopSampling = async () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __fadeFrames: string[];
          __stop: boolean;
        };
        w.__stop = true;
        return w.__fadeFrames;
      });
    // A mouse: from Grid to Table.
    const grid = await centerOf('grid');
    const table = await centerOf('table');
    await page.mouse.move(grid.x, grid.y);
    await page.mouse.down();
    await page.mouse.move(table.x, table.y, {steps: 12});
    expect(await lensShown()).toBe(true);
    await startSampling();
    await page.mouse.up();
    await expect(group.locator('[data-value="table"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect.poll(lensShown, {timeout: 3000}).toBe(false);
    expect(await stopSampling()).toEqual([]);
    // A pen, where the engine has one: back from Table to Grid.
    const driver = await webInputDriver(page);
    if (driver.pens) {
      await startSampling();
      await driver.pen(
        Array.from({length: 13}, (_, i) => ({
          x: table.x + ((grid.x - table.x) * i) / 12,
          y: table.y,
          t: i * 25,
        })),
      );
      await expect(group.locator('[data-value="grid"]')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect.poll(lensShown, {timeout: 3000}).toBe(false);
      expect(await stopSampling()).toEqual([]);
    }
  } finally {
    await context.close();
  }
});

test('with a pen a drag from the selected segment carries the selection and commits where it lifts (spec:AST-094 FR43)', async ({
  browser,
}) => {
  const {context, page, group, centerOf} = await openWithMouse(browser);
  try {
    const driver = await webInputDriver(page);
    test.skip(!driver.pens, PEN_SKIP);
    const selections = await recordSelections(group);
    const from = await centerOf('grid');
    const to = await centerOf('table');
    const points = Array.from({length: 13}, (_, i) => ({
      x: from.x + ((to.x - from.x) * i) / 12,
      y: from.y,
      t: i * 25,
    }));
    await driver.pen(points);
    await expect(group.locator('[data-value="table"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect((await selections()).map(change => change.value)).toEqual(['table']);
  } finally {
    await context.close();
  }
});

test('the track keeps vertical scrolling and takes horizontal drags', async ({
  page,
}) => {
  const control = await openControl(page);
  await expect(control.group).toHaveCSS('touch-action', 'pan-y pinch-zoom');
});

test('a held finger selects no text on the control; letting go gives selection back', async ({
  page,
}) => {
  const control = await openControl(page);
  const userSelect = async () =>
    control.group.evaluate(element => {
      const style = getComputedStyle(element) as CSSStyleDeclaration & {
        webkitUserSelect?: string;
      };
      return style.userSelect || style.webkitUserSelect;
    });
  // Whether a selection that starts on the held segment is refused now.
  // Outside iOS WebKit, the gesture host's lock cancels `selectstart` and
  // writes no style. So nothing repaints at the touch-down or the lift
  // (`spec:AST-094` FR41). iOS WebKit fires no `selectstart` for a long
  // press. There the lock is `user-select` and the callout, which the
  // simulator recordings cover.
  const refusesSelection = async () =>
    control.segment('list').evaluate(element => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
  // At rest the titles are as selectable as anywhere else on the page.
  const atRest = await userSelect();
  expect(atRest).not.toBe('none');
  expect(await refusesSelection()).toBe(false);
  const playing = control.driver.play(
    touchTap(await clientCenter(control, 'list'), {holdMs: 600}),
  );
  await expect.poll(refusesSelection).toBe(true);
  expect(await userSelect()).toBe(atRest);
  await playing;
  await expect.poll(refusesSelection).toBe(false);
  expect(await userSelect()).toBe(atRest);
});

/** Makes the story page scroll: the control sits in a scroller. */
async function makePageScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.height = '2000px';
    document.body.append(spacer);
  });
}

/** Records whether each `touchmove` was cancelled (read after every listener). */
async function recordTouchMoves(page: Page): Promise<() => Promise<boolean[]>> {
  await page.evaluate(() => {
    const moves: boolean[] = [];
    (window as unknown as {__moves: boolean[]}).__moves = moves;
    window.addEventListener(
      'touchmove',
      event => {
        moves.push(event.defaultPrevented);
      },
      {passive: true},
    );
  });
  return async () =>
    page.evaluate(() => (window as unknown as {__moves: boolean[]}).__moves);
}

/** Records, on the page's clock, each time the lens is shown or hidden. */
async function recordProxyVisibility(
  control: Control,
): Promise<() => Promise<{visible: boolean; at: number}[]>> {
  await control.group.evaluate(element => {
    const changes: {visible: boolean; at: number}[] = [];
    (window as unknown as {__lens: typeof changes}).__lens = changes;
    // The radiogroup's style also carries the gesture host's text-selection
    // lock and the animator's promotion: only a change of the lens counts.
    const shown = () =>
      getComputedStyle(element, '::before').visibility === 'visible';
    let visible = shown();
    new MutationObserver(() => {
      const now = shown();
      if (now !== visible) {
        visible = now;
        changes.push({visible, at: performance.timeOrigin + performance.now()});
      }
    }).observe(element, {attributes: true, attributeFilter: ['style']});
  });
  return async () =>
    control.group.evaluate(
      () =>
        (window as unknown as {__lens: {visible: boolean; at: number}[]})
          .__lens,
    );
}

test('a vertical drag that starts on the control scrolls the page and lifts nothing', async ({
  page,
}) => {
  const control = await openControl(page);
  await makePageScroll(page);
  const selections = await recordSelections(control.group);
  const moves = await recordTouchMoves(page);
  const shown = await recordProxyVisibility(control);
  const start = await clientCenter(control, 'grid');
  await control.driver.play(
    touchDrag(start, {x: start.x + 4, y: start.y - 140}, {durationMs: 300}),
  );
  // The page kept every move: nothing cancelled them...
  const cancelled = await moves();
  expect(cancelled.length).toBeGreaterThan(0);
  expect(cancelled.some(Boolean)).toBe(false);
  if (control.driver.engine === 'chromium') {
    // ...and Chromium scrolled it natively.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(60);
  }
  // A flick inside a scroller presses nothing: no lift, no change.
  await page.waitForTimeout(300);
  expect(await shown()).toEqual([]);
  expect(await selections()).toEqual([]);
});

test('RTL: a drag carries the lens toward the finger and commits once, at the lift', async ({
  page,
}) => {
  const control = await openControl(
    page,
    'core-segmentedcontrol--default',
    'View mode',
    {direction: 'rtl'},
  );
  const boxes = await control.boxes();
  // The first segment is on the right in RTL.
  expect(boxOf(boxes, 'grid').x).toBeGreaterThan(boxOf(boxes, 'table').x);
  const selections = await recordSelections(control.group);
  const from = await clientCenter(control, 'grid');
  const to = await clientCenter(control, 'table');
  const midDrag: {finger: number; lens: number; width: number; at: number}[] =
    [];
  const played = await control.driver.play(
    touchDrag(from, to, {durationMs: 600, restMs: 200}),
    {
      onEvent: async (step, index) => {
        if (step.type === 'touchMove' && index % 6 === 0) {
          const now = await presentedNow(control);
          midDrag.push({
            finger: step.changed[0].x,
            lens: now.center,
            width: now.width,
            at: Date.now(),
          });
        }
      },
    },
  );
  const lift = played.find(event => event.type === 'touchEnd');
  const changes = await selections();
  expect(changes.map(change => change.value)).toEqual(['table']);
  expect(changes[0].at).toBeGreaterThanOrEqual((lift?.dispatchedAt ?? 0) - 5);
  // Trailing the finger from the right as it moves left, at its resting
  // size.
  const trackLeft = (await control.group.boundingBox())?.x ?? 0;
  expect(midDrag.length).toBeGreaterThan(3);
  for (const sample of midDrag.slice(2)) {
    // Nothing lifts it: its width stays a segment's.
    expect(sample.width).toBeLessThan(boxOf(boxes, 'grid').width + 12);
    const lag = sample.lens - (sample.finger - trackLeft);
    expect(lag).toBeGreaterThan(-2);
    expect(lag).toBeLessThan(40);
  }
  await expectLensHidden(control);
});

test(
  'storyboard: hold the selected segment, drag it, let go',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const control = await openControl(page);
    const box = await control.group.boundingBox();
    if (box == null) {
      throw new Error('no control');
    }
    const from = await clientCenter(control, 'grid');
    const to = await clientCenter(control, 'table');
    const board = await touchStoryboard(
      page,
      control.driver,
      touchDrag(from, to, {durationMs: 600, holdMs: 350, restMs: 250, hz: 20}),
      {
        name: 'segmented-hold-drag-release',
        clip: {
          x: box.x - 12,
          y: box.y - 14,
          width: box.width + 24,
          height: box.height + 28,
        },
        measure: async () => presentedNow(control),
        columns: 4,
        cellScale: 1,
      },
    );
    await board.write(testInfo);
    // Nothing lifts while the finger holds the selected segment: the lens
    // appears only once the drag moves it, at the resting size.
    const rest = boxOf(await control.boxes(), 'grid').width;
    const held = board.frames.filter(frame =>
      frame.label.startsWith('touchStart'),
    );
    for (const frame of held) {
      const data = frame.data as {width: number; visible: boolean};
      expect(data.visible, frame.label).toBe(false);
    }
    // Carried the whole way: the selected face moving to the title under the
    // finger reflows the titles, and the lens stays with the finger.
    const dragged = board.frames.filter(
      frame => frame.label.startsWith('touchMove') && frame.t >= 450,
    );
    expect(dragged.length).toBeGreaterThan(5);
    for (const frame of dragged) {
      const data = frame.data as {width: number; visible: boolean};
      expect(data.visible, frame.label).toBe(true);
      expect(data.width, frame.label).toBeLessThan(rest + 12);
    }
  },
);
