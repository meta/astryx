// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ItemSwipeActions.interaction.browser.spec.ts
 * @input The built "Swipe Actions" Item story, real touch input (Chromium
 *   CDP / WebKit's input command), the interaction harness and the UIKit
 *   constants table (motion/uikit/swipeActions.ts)
 * @output Interaction and animation proofs for a row's swipe actions. A held
 *   row stays under the finger, one for one, until the lift.
 *   The settle after a held release is UIKit's spring, frame by frame as the
 *   gesture writes it. The panel's window, track and entries are drawn in step
 *   with the row at every frame. A flick hands the row's velocity to the
 *   settle. A finger that lands on a settling row catches it without a jump. A
 *   close a blocked main thread holds back starts from where the row was. The
 *   drag and the settle do no Layout or Paint per frame. A tap on a resting
 *   row's own content closes it and clicks nothing, and a scroll that starts on
 *   it closes it. A full swipe confirms on the finger and fires: the row runs
 *   ahead, and the outermost entry covers the space. One that backs out closes,
 *   with the entries pinned or riding at every frame. Storyboards. Under Reduce
 *   Motion a release, that tap, a confirm and a back-out land with no travel,
 *   at the bottom of an opacity dip.
 * @position Interaction proofs of Item's swipeActions, in the shape of
 *   BottomSheetDetent.interaction.browser.spec.ts, the harness exemplar. The
 *   gesture writes the row's travel as a custom property on its root every
 *   frame, and each part's transform reads it. So curves are read from a log of
 *   the frames it writes, and positions from each part's computed `transform`
 *   and its settle's `translate`. The swipe reads each touch's pointer, the
 *   same on every device. The project's touchscreen gives Chromium and WebKit a
 *   phone's: a coarse primary pointer.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  blockMainThread,
  busyWindowProof,
  compareCurve,
  CONTROL_RGB,
  countBetween,
  drag,
  flick,
  installLongTaskLog,
  markElement,
  openStory,
  PEN_SKIP,
  readLongTasks,
  springStep,
  startBusyControl,
  startScreencast,
  tap,
  toTouchEvents,
  touchDriver,
  touchStoryboard,
  traceRendering,
  trackMarker,
  type TouchDriver,
  waitForRest,
  webInputDriver,
  WHEEL_SKIP,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';
import {swipeActions} from '../../motion/uikit/swipeActions';

const storybook = withStorybook(test);

/**
 * The tracking and settle spring, as Core Animation renders it. It is
 * overdamped on paper (mass 2, stiffness 200, damping 100), and critically
 * damped in effect at ω₀ = √(stiffness ÷ mass).
 */
const OMEGA = Math.sqrt(
  swipeActions.settle.stiffness / swipeActions.settle.mass,
);
const SPRING = {response: (2 * Math.PI) / OMEGA, dampingFraction: 1};

interface OpenRow {
  driver: TouchDriver;
  row: Locator;
  panel: Locator;
  track: Locator;
  entries: Locator;
  /** The row's resting box. */
  rest: {x: number; y: number; width: number; height: number};
  /** Where a finger lands to drag toward the trailing side (leftward). */
  start: {x: number; y: number};
}

async function openRow(page: Page): Promise<OpenRow> {
  await installLongTaskLog(page);
  await openStory(page, storybook(), 'core-item--swipe-actions');
  const driver = await touchDriver(page);
  const row = page.locator('.astryx-item').first();
  const panel = row.locator('[data-swipe-panel="trailing"]');
  // The gesture arrives with the swipe layer.
  await expect(panel).toBeAttached();
  const track = panel.locator(':scope > div').first();
  // The entries are the track's children, each its own moving element.
  const entries = track;
  const rest = await row.boundingBox();
  if (rest == null) {
    throw new Error('no row');
  }
  return {
    driver,
    row,
    panel,
    track,
    entries,
    rest,
    start: {x: rest.x + rest.width - 24, y: rest.y + rest.height / 2},
  };
}

/** How far the row opens: the entries' widths together, read as the row reads them (`offsetWidth`). */
const openWidthOf = async (track: Locator) =>
  track.evaluate(node =>
    Array.from(node.children).reduce(
      (width, entry) => width + (entry as HTMLElement).offsetWidth,
      0,
    ),
  );

/**
 * The x an element is drawn at: its computed transform's, plus its
 * `translate`, which a settle on the compositor animates (0 at none).
 */
const xOf = async (locator: Locator) =>
  locator.evaluate(node => {
    // A settle's own `translate`, read off its animation at the document
    // timeline's time. That time holds still for the whole task, so every part
    // reads the same instant. WebKit samples a computed style when read.
    const animated = (el: Element) => {
      let offset = 0;
      for (const animation of el.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        const progress = effect?.getComputedTiming().progress;
        const frames = effect?.getKeyframes() ?? [];
        if (progress == null || !frames.some(f => f.translate != null)) {
          continue;
        }
        let i = 0;
        while (
          i < frames.length - 2 &&
          frames[i + 1].computedOffset <= progress
        ) {
          i += 1;
        }
        const a = frames[i];
        const b = frames[i + 1] ?? a;
        const span = b.computedOffset - a.computedOffset;
        const t = span > 0 ? (progress - a.computedOffset) / span : 0;
        const from = parseFloat(String(a.translate));
        offset += from + (parseFloat(String(b.translate)) - from) * t;
      }
      return offset;
    };
    return (
      new DOMMatrixReadOnly(getComputedStyle(node).transform).m41 +
      animated(node)
    );
  });

/** One travel the gesture wrote on the row, and how the engine drew it. */
interface Frame {
  /** The frame it was written for: the document timeline's time (ms). */
  t: number;
  /** When it was written (ms, `performance.now()`). */
  at: number;
  /** The travel (physical px). */
  x: number;
  /** The row's opacity then (Reduce Motion's dip). */
  opacity: number;
  /** Where the row and each part of the trailing panel were drawn then. */
  parts: {root: number; panel: number; track: number; entries: number};
}

/**
 * Logs the row at every frame the page draws. It records the travel, read as
 * drawn at the frame's time (the document timeline's), and the row's opacity.
 * It also records where the engine draws the row and each part of the trailing
 * panel. A drag draws the travel into a custom property on the root. A settle
 * holds its end there and animates each part's `translate` on the compositor.
 * So a part's x is its transform's plus its `translate`. Only frames whose
 * travel changed are kept: the frames the travel moved in.
 */
async function recordFrames(row: Locator): Promise<void> {
  await row.evaluate(node => {
    const frames: unknown[] = [];
    // A settle's own `translate`, read off its animation at the document
    // timeline's time. That time holds still for the whole task, so every part
    // reads the same instant. WebKit samples a computed style when read.
    const animated = (el: Element) => {
      let offset = 0;
      for (const animation of el.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        const progress = effect?.getComputedTiming().progress;
        const frames = effect?.getKeyframes() ?? [];
        if (progress == null || !frames.some(f => f.translate != null)) {
          continue;
        }
        let i = 0;
        while (
          i < frames.length - 2 &&
          frames[i + 1].computedOffset <= progress
        ) {
          i += 1;
        }
        const a = frames[i];
        const b = frames[i + 1] ?? a;
        const span = b.computedOffset - a.computedOffset;
        const t = span > 0 ? (progress - a.computedOffset) / span : 0;
        const from = parseFloat(String(a.translate));
        offset += from + (parseFloat(String(b.translate)) - from) * t;
      }
      return offset;
    };
    const x = (el: Element | null) =>
      el == null
        ? Number.NaN
        : new DOMMatrixReadOnly(getComputedStyle(el).transform).m41 +
          animated(el);
    const panel = node.querySelector('[data-swipe-panel="trailing"]');
    const track = panel?.firstElementChild ?? null;
    // Every frame the page draws, travel or not: what a judgment per frame
    // counts against.
    const drawn: number[] = [];
    let last = Number.NaN;
    const sample = () => {
      // One time for the frame, whether it shows a new travel or not.
      const at = performance.now();
      drawn.push(at);
      const style = getComputedStyle(node);
      const travel =
        parseFloat(style.getPropertyValue('--_item-swipe-travel') || '0') +
        animated(node);
      if (travel !== last) {
        last = travel;
        frames.push({
          t: Number(document.timeline.currentTime),
          at,
          x: travel,
          opacity: Number(style.opacity),
          parts: {
            root: x(node),
            panel: x(panel),
            track: x(track),
            entries: x(track?.firstElementChild ?? null),
          },
        });
      }
      if (frames.length < 5000) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
    Object.assign(window, {__swipeFrames: frames, __swipeDrawn: drawn});
  });
}

/** When the page drew each frame since `recordFrames` (`performance.now()` ms). */
const framesDrawnOf = async (page: Page): Promise<number[]> =>
  page.evaluate(
    () => (window as unknown as {__swipeDrawn: number[]}).__swipeDrawn,
  );

const framesOf = async (page: Page): Promise<Frame[]> =>
  page.evaluate(
    () => (window as unknown as {__swipeFrames: Frame[]}).__swipeFrames,
  );

/** Records when the finger first lifts (its pointerup or its touchend). */
/**
 * Records when the finger lifts: its first lift event and its last. A finger's
 * pointerup comes before its touchend, and the gesture host releases on
 * whichever it reads first.
 */
async function recordLift(page: Page): Promise<void> {
  await page.evaluate(() => {
    const lift = {first: Number.NaN, last: Number.NaN};
    const onLift = () => {
      const now = performance.now();
      if (Number.isNaN(lift.first)) {
        lift.first = now;
      }
      lift.last = now;
    };
    addEventListener('pointerup', onLift, {capture: true});
    addEventListener('touchend', onLift, {capture: true});
    Object.assign(window, {__swipeLift: lift});
  });
}

/** When the finger lifted: its first lift event and its last. */
const liftsOf = async (page: Page): Promise<{first: number; last: number}> =>
  page.evaluate(
    () =>
      (window as unknown as {__swipeLift: {first: number; last: number}})
        .__swipeLift,
  );

/** When the finger first lifted. */
const liftOf = async (page: Page): Promise<number> =>
  (await liftsOf(page)).first;

/**
 * The frames the gesture wrote once the finger had lifted: the settle's. They
 * count from the finger's last lift event, so no frame of the drag is one of
 * them, whichever event the host released on. If the host released on the
 * first, a frame between the two is left out.
 */
const settleOf = async (page: Page): Promise<Frame[]> => {
  const {last} = await liftsOf(page);
  expect(Number.isNaN(last)).toBe(false);
  return (await framesOf(page)).filter(frame => frame.at >= last);
};

/**
 * A slow drag by `dx` (negative: toward the trailing side) that comes to rest
 * before the lift. The finger creeps a tenth of a pixel a frame for its last 20
 * frames. So UIKit's velocity filter, which never decays on its own, reads
 * nearly zero, and the row has caught up with the finger when it lifts.
 */
/** The page's clock now (ms, `performance.now()`). */
const nowOf = async (page: Page): Promise<number> =>
  page.evaluate(() => performance.now());

/**
 * Starts logging the travel animations the row asks for: the curves baked into
 * keyframes. Each keeps the start time the browser or the animator gave it,
 * from before a cancel or a finish clears it. A retarget cancels the curve it
 * replaces. A drag's curve animates the travel's custom property. A settle's
 * animates the root's `translate` toward the end the property already holds, so
 * its travel is that end plus the `translate`.
 */
async function watchTravelCurves(row: Locator): Promise<void> {
  await row.evaluate(node => {
    const curves: {
      animation: Animation;
      start: number | null;
      end: number | null;
    }[] = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const animation = animate.call(this, keyframes, options);
      const isTravel =
        Array.isArray(keyframes) &&
        keyframes.some(frame => frame['--_item-swipe-travel'] != null);
      const isSettle =
        Array.isArray(keyframes) &&
        keyframes.some(frame => frame.translate != null);
      if (this === node && (isTravel || isSettle)) {
        const entry = {
          animation,
          start: null as number | null,
          // A settle's travel: the end the custom property holds, plus the
          // `translate` of each keyframe.
          end: isSettle
            ? parseFloat(
                getComputedStyle(node).getPropertyValue(
                  '--_item-swipe-travel',
                ) || '0',
              )
            : null,
        };
        const keep = () => {
          if (entry.start == null && animation.startTime != null) {
            entry.start = Number(animation.startTime);
          }
        };
        const cancel = animation.cancel.bind(animation);
        animation.cancel = () => {
          keep();
          cancel();
        };
        animation.addEventListener('finish', keep);
        curves.push(entry);
      }
      return animation;
    };
    Object.assign(window, {__swipeCurves: curves});
  });
}

/**
 * The travel curves the row played, each as its start time (ms, document
 * timeline) and its keyframes ({time after start in ms, travel px}).
 */
const travelCurvesOf = async (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __swipeCurves: {
          animation: Animation;
          start: number | null;
          end: number | null;
        }[];
      }
    ).__swipeCurves
      .map(({animation, start, end}) => {
        const effect = animation.effect as KeyframeEffect;
        const duration = Number(effect.getTiming().duration);
        return {
          start:
            start ??
            (animation.startTime == null ? null : Number(animation.startTime)),
          frames: effect.getKeyframes().map(frame => ({
            t: frame.computedOffset * duration,
            x:
              end == null
                ? parseFloat(String(frame['--_item-swipe-travel']))
                : end + parseFloat(String(frame.translate)),
          })),
        };
      })
      // A curve cancelled before the browser started it never played.
      .filter(
        (curve): curve is {start: number; frames: {t: number; x: number}[]} =>
          curve.start != null,
      ),
  );

/** A baked curve's value at `t` ms after its start (linear between keyframes). */
function curveAt(frames: {t: number; x: number}[], t: number): number {
  if (t <= frames[0].t) {
    return frames[0].x;
  }
  for (let i = 1; i < frames.length; i += 1) {
    if (t <= frames[i].t) {
      const a = frames[i - 1];
      const b = frames[i];
      return b.t === a.t ? b.x : a.x + ((b.x - a.x) * (t - a.t)) / (b.t - a.t);
    }
  }
  return frames[frames.length - 1].x;
}

/**
 * Fits the critically damped family x(s) = target + (A + B·s)·e^(−ωs) to a
 * baked curve's keyframes by least squares. Here s is in seconds from the
 * curve's start. Returns the fitted curve's velocity (px/s) at `atMs`.
 */
function fittedVelocity(
  frames: {t: number; x: number}[],
  target: number,
  atMs: number,
): number {
  let saa = 0;
  let sab = 0;
  let sbb = 0;
  let sya = 0;
  let syb = 0;
  for (const {t, x} of frames) {
    const sec = t / 1000;
    const a = Math.exp(-OMEGA * sec);
    const b = sec * a;
    const y = x - target;
    saa += a * a;
    sab += a * b;
    sbb += b * b;
    sya += y * a;
    syb += y * b;
  }
  const det = saa * sbb - sab * sab;
  const A = (sya * sbb - syb * sab) / det;
  const B = (syb * saa - sya * sab) / det;
  const sec = atMs / 1000;
  return (B - OMEGA * (A + B * sec)) * Math.exp(-OMEGA * sec);
}

/** An opacity animation the row asked for (its Reduce Motion dip). */
interface Fade {
  /** When it was asked for (ms, `performance.now()`). */
  at: number;
  from: number;
  to: number;
  /**
   * How long its curve runs, ms: to the first keyframe at its end value (the
   * animator holds the end a while after the curve).
   */
  ms: number;
  /** Whether it moves anything: a dip never does. */
  moves: boolean;
}

/**
 * Starts logging the row's frames and the opacity animations the row asks for.
 * It logs what the page requested, not frames sampled at the page's frame rate.
 * So a dip on a page that draws few frames is still seen whole.
 */
async function watchCrossFade(page: Page, row: Locator): Promise<void> {
  await recordFrames(row);
  await recordLift(page);
  await row.evaluate(node => {
    const fades: unknown[] = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      if (this === node && Array.isArray(keyframes)) {
        const withOpacity = keyframes.filter(frame => frame.opacity != null);
        if (withOpacity.length > 0) {
          const duration =
            typeof options === 'number' ? options : Number(options?.duration);
          const end = Number(withOpacity[withOpacity.length - 1].opacity);
          const count = withOpacity.length;
          // Where the curve ends: the first keyframe at the end value, at its
          // offset (or its place among evenly spaced keyframes).
          const first = withOpacity.findIndex(
            frame => Number(frame.opacity) === end,
          );
          const offsetOf = (index: number) =>
            withOpacity[index].offset ?? (count > 1 ? index / (count - 1) : 1);
          fades.push({
            at: performance.now(),
            from: Number(withOpacity[0].opacity),
            to: end,
            ms: duration * offsetOf(first),
            moves: keyframes.some(
              frame =>
                frame.transform != null ||
                frame.translate != null ||
                frame['--_item-swipe-travel' as keyof Keyframe] != null,
            ),
          });
        }
      }
      return animate.call(this, keyframes, options);
    };
    Object.assign(window, {__swipeFades: fades});
  });
}

/**
 * Checks the `nth` dip of the row (from 0) since `since` (the page's clock),
 * with `watchCrossFade` logging. Under Reduce Motion that is an opacity-only
 * cross-fade of the row, out to transparent and back within 200 ms, with no
 * travel. The gesture writes the travel once, in one step, between the two
 * halves, while the row is transparent. Then the row is at `to`, fully opaque.
 */
async function expectCrossFadeSince(
  page: Page,
  row: Locator,
  to: number,
  since: number,
  nth = 0,
): Promise<void> {
  await waitForRest(row);
  const fades = (
    await page.evaluate(
      () => (window as unknown as {__swipeFades: Fade[]}).__swipeFades,
    )
  ).filter(fade => fade.at >= since - 1);
  // The dips: each out to transparent, then back, opacity only, within
  // 200 ms.
  const dips: [Fade, Fade][] = [];
  const near = (value: number, to: number) => Math.abs(value - to) < 0.01;
  for (let i = 0; i + 1 < fades.length; i += 1) {
    if (
      near(fades[i].from, 1) &&
      near(fades[i].to, 0) &&
      near(fades[i + 1].from, 0) &&
      near(fades[i + 1].to, 1)
    ) {
      dips.push([fades[i], fades[i + 1]]);
      i += 1;
    }
  }
  expect(dips.length, JSON.stringify(fades)).toBeGreaterThan(nth);
  const [out, back] = dips[nth];
  expect(out.moves || back.moves).toBe(false);
  expect(out.ms + back.ms).toBeLessThanOrEqual(200);
  // The travel lands in one write between the two halves, with nothing showing.
  // The write that starts the fade back in comes right after it. While the row
  // is still visible, it stays where the dip found it. The one write while it
  // is mostly transparent is the landing.
  const allFrames = await framesOf(page);
  const during = allFrames.filter(
    frame => frame.at >= out.at && frame.at <= back.at + 50,
  );
  const landing = during.filter(frame => frame.opacity < 0.5);
  expect(
    landing.length,
    JSON.stringify({
      out,
      back,
      near: allFrames
        .filter(frame => frame.at >= out.at - 300 && frame.at <= back.at + 300)
        .map(({t, at, x, opacity}) => ({t, at, x, opacity})),
    }),
  ).toBe(1);
  expect(landing[0].x).toBeCloseTo(to, 0);
  const shown = during.filter(frame => frame.opacity >= 0.5);
  expect(
    shown.every(
      frame => frame.at < landing[0].at && Math.abs(frame.x - shown[0].x) < 0.5,
    ),
    JSON.stringify(during),
  ).toBe(true);
  // Not before the row was transparent: the fade out had run its course
  // (give or take the frame that shows the change).
  expect(landing[0].at).toBeGreaterThanOrEqual(out.at + out.ms - 20);
  expect(await xOf(row)).toBeCloseTo(to, 0);
  expect(
    await row.evaluate(node => Number(getComputedStyle(node).opacity)),
  ).toBe(1);
}

/** `expectCrossFadeSince` for a change `act` starts with a lift. */
async function expectCrossFade(
  page: Page,
  row: Locator,
  to: number,
  act: () => Promise<void>,
): Promise<void> {
  await watchCrossFade(page, row);
  await act();
  await expectCrossFadeSince(page, row, to, await liftOf(page));
}

function heldDrag(from: {x: number; y: number}, dx: number) {
  const moving = drag(
    from,
    {x: from.x + dx, y: from.y},
    {durationMs: 400, hz: 60},
  );
  const lift = moving[moving.length - 1];
  const last = moving[moving.length - 2];
  const frames = moving.slice(0, -1);
  for (let i = 1; i <= 20; i += 1) {
    frames.push({
      t: last.t + i * (1000 / 60),
      fingers: [{id: 0, x: from.x + dx + (Math.sign(dx) * i) / 10, y: from.y}],
    });
  }
  // Hold still a while longer, so the tracking spring has settled too.
  frames.push({t: frames[frames.length - 1].t + 900, fingers: lift.fingers});
  return frames;
}

test("a held row stays under the finger: at every frame from the claim to the lift, the row's travel is the finger's travel since touch-down", async ({
  page,
  browserName,
}) => {
  const {driver, row, entries, start} = await openRow(page);
  expect(await openWidthOf(entries)).toBeGreaterThan(0);
  const dx = 140;
  const script = drag(
    start,
    {x: start.x - dx, y: start.y},
    // The finger then rests 0.6 s before the lift: a spring that followed it
    // would still be catching up there.
    {durationMs: 400, hz: 60, restMs: 600},
  );
  await recordFrames(row);
  await recordLift(page);
  // Where the finger is, as the page handles each of its moves.
  await page.evaluate(() => {
    const moves: {at: number; x: number}[] = [];
    addEventListener(
      'touchmove',
      event => {
        moves.push({
          at: performance.now(),
          x: event.touches[0]?.clientX ?? Number.NaN,
        });
      },
      {capture: true, passive: true},
    );
    Object.assign(window, {__swipeMoves: moves});
  });
  const started = Date.now();
  await driver.play(script);
  const lift = await liftOf(page);
  await waitForRest(row);
  const moves = await page.evaluate(
    () =>
      (window as unknown as {__swipeMoves: {at: number; x: number}[]})
        .__swipeMoves,
  );
  expect(moves.length).toBeGreaterThan(2);
  // The row's travel is toward the trailing side (negative x). From the row's
  // claim on the touch, each frame the page drew up to the lift is read against
  // the finger's latest move. The row handles a move before this listener sees
  // it. So it catches up within the claiming move's frame.
  const travel = (x: number) => Math.max(0, start.x - x);
  const frames = await framesOf(page);
  const held = frames
    .filter(frame => frame.at < lift)
    .map(frame => ({
      finger: travel(
        moves.filter(move => move.at <= frame.at).at(-1)?.x ?? start.x,
      ),
      row: -frame.x,
    }))
    .filter(sample => sample.finger >= swipeActions.claim);
  expect(held.length, JSON.stringify(frames)).toBeGreaterThan(5);
  expect(
    held.filter(sample => Math.abs(sample.finger - sample.row) > 1),
    JSON.stringify(held),
  ).toEqual([]);
  // No long task on the page while it tracked: the Long Tasks API is
  // Chromium-only, so WebKit runs the rest of the case.
  if (browserName === 'chromium') {
    expect(await readLongTasks(page, {from: started, to: Date.now()})).toEqual(
      [],
    );
  }
});

test("past the confirm point a lead grows to the confirmation offset on UIKit's tracking spring and the row keeps it, while its base stays at the finger's travel, frame by frame", async ({
  page,
}) => {
  const opened = await openRow(page);
  const {driver, row, rest} = opened;
  // Two entries: a full swipe confirms only from the open row, so the drag
  // starts on its content there.
  const openWidth = await restOpen(opened);
  const start = {x: opened.start.x - openWidth, y: opened.start.y};
  const confirmAt = confirmPointOf(openWidth, rest.width);
  const confirmedOffset = rest.width - swipeActions.confirmInset;
  // A slow drag to 40 px past the confirm point on UIKit's measure, held 0.6
  // s, then lifted.
  const reach = confirmAt + 40 - openWidth + swipeActions.hysteresis;
  const script = drag(
    start,
    {x: start.x - reach, y: start.y},
    {durationMs: 1400, hz: 60, restMs: 600},
  );
  await recordFrames(row);
  await recordLift(page);
  await page.evaluate(() => {
    const moves: {at: number; x: number}[] = [];
    addEventListener(
      'touchmove',
      event => {
        moves.push({
          at: performance.now(),
          x: event.touches[0]?.clientX ?? Number.NaN,
        });
      },
      {capture: true, passive: true},
    );
    Object.assign(window, {__swipeMoves: moves});
  });
  await driver.play(script);
  const lift = await liftOf(page);
  const moves = await page.evaluate(
    () =>
      (window as unknown as {__swipeMoves: {at: number; x: number}[]})
        .__swipeMoves,
  );
  // At each frame before the lift, the base is the open width plus the finger's
  // travel since touch-down. The swipe is the same on UIKit's measure. The lead
  // is how far past its base the row is drawn.
  const samples = (await framesOf(page))
    .filter(frame => frame.at < lift)
    .map(frame => {
      const x = moves.filter(move => move.at <= frame.at).at(-1)?.x;
      const travel = x == null ? 0 : start.x - x;
      return {
        at: frame.at,
        swipe: openWidth + travel - swipeActions.hysteresis,
        base: openWidth + Math.max(0, travel),
        row: -frame.x,
      };
    })
    .filter(sample => sample.base >= openWidth + swipeActions.claim);
  const before = samples.filter(sample => sample.swipe < confirmAt);
  const after = samples.filter(sample => sample.swipe >= confirmAt);
  expect(before.length, JSON.stringify(samples)).toBeGreaterThan(5);
  expect(after.length, JSON.stringify(samples)).toBeGreaterThan(5);
  // Short of the confirm point there is no lead: the row is at its base.
  expect(
    before.filter(sample => Math.abs(sample.row - sample.base) > 1),
    JSON.stringify(before),
  ).toEqual([]);
  // Past it the lead only grows, and it ends where the base at the confirm
  // put the confirmation offset.
  const leads = after.map(sample => sample.row - sample.base);
  expect(
    leads.every((lead, i) => i === 0 || lead >= leads[i - 1] - 0.5),
    JSON.stringify(leads),
  ).toBe(true);
  expect(
    Math.abs((leads.at(-1) ?? 0) - (confirmedOffset - after[0].base)),
    JSON.stringify(leads),
  ).toBeLessThan(3);
  // The lead grows on UIKit's tracking spring from rest. A frame's lead puts
  // the frame at one point of that curve, so the frame names when the lead
  // began. Between 10 % and 70 % of the lead, every frame names one start,
  // within two frames. A jump, or another curve, does not.
  const finalLead = leads.at(-1) ?? 0;
  const msAtProgress = (progress: number) => {
    let low = 0;
    let high = 2000;
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      if (springStep(SPRING, middle) < progress) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return (low + high) / 2;
  };
  const began = after
    .map((sample, i) => ({at: sample.at, progress: leads[i] / finalLead}))
    .filter(({progress}) => progress >= 0.1 && progress <= 0.7)
    .map(({at, progress}) => at - msAtProgress(progress));
  expect(began.length, JSON.stringify(leads)).toBeGreaterThanOrEqual(6);
  expect(
    Math.max(...began) - Math.min(...began),
    JSON.stringify(began),
  ).toBeLessThanOrEqual(34);
});

test('the settle after a held release is UIKit’s spring, frame by frame, with the panel in step', async ({
  page,
}, testInfo) => {
  const {driver, row, entries, start} = await openRow(page);
  const openWidth = await openWidthOf(entries);
  // The panel is there, with entries that have widths.
  expect(await entries.locator(':scope > *').count()).toBeGreaterThan(0);
  expect(openWidth).toBeGreaterThan(0);
  await recordFrames(row);
  await recordLift(page);
  await watchTravelCurves(row);
  // 105 px of swipe, held: past half the panel, so the row settles open.
  await driver.play(heldDrag(start, -130));
  await waitForRest(row);
  const samples = await settleOf(page);
  expect(samples.length).toBeGreaterThan(2);
  // Released at rest (the tracking spring had settled), the settle is the last
  // curve the row played. It runs from the row's place at zero velocity toward
  // the open width. Its keyframes are UIKit's spring from there, to a quarter
  // of a pixel.
  const settle = (await travelCurvesOf(page)).at(-1);
  expect(settle).toBeDefined();
  const frames = settle?.frames ?? [];
  const from = frames[0]?.x ?? Number.NaN;
  const to = -openWidth;
  const expected = (t: number) => from + (to - from) * springStep(SPRING, t);
  const keyframes = compareCurve(
    frames.map(({t, x}) => ({t, value: x})),
    expected,
    0.25,
  );
  // Every frame the page drew shows that curve, at its own time to within half
  // a frame (8 ms). A frame's time is the timeline's, and a busy page dates its
  // frames with that much slack.
  const offCurve = samples.filter(({t, x}) => {
    const at = t - (settle?.start ?? 0);
    const a = curveAt(frames, at - 8);
    const b = curveAt(frames, at + 8);
    return x < Math.min(a, b) - 0.25 || x > Math.max(a, b) + 0.25;
  });
  await writeEvidence(
    'curves/item-swipe-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          spring: SPRING,
          openWidth,
          from,
          start: settle?.start,
          keyframes,
          offCurve,
          samples,
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(
    keyframes.maxError,
    JSON.stringify(keyframes.worst),
  ).toBeLessThanOrEqual(0.25);
  expect(offCurve, JSON.stringify(offCurve)).toEqual([]);
  expect(samples.at(-1)?.x).toBeCloseTo(to, 0);
  // Every part is drawn from that one travel. The row moves by it, the window
  // cancels the row, the track moves with it, and the entries stay pinned.
  const pinned = samples[0].parts.track + samples[0].parts.entries;
  for (const {x, parts} of samples) {
    expect(Math.abs(parts.root - x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(parts.root + parts.panel)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(parts.track - parts.root)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(parts.track + parts.entries - pinned)).toBeLessThanOrEqual(
      0.01,
    );
  }
  // And the page drew it frame by frame. That is judged against the frames the
  // page drew during the settle (its animation-frame times), not a count at 60
  // Hz. A loaded page draws fewer, so it needs at least 4 to judge. Each of
  // them shows a new travel, on the curve (above).
  const first = samples[0].at;
  const last = samples.at(-1)?.at ?? first;
  const drawn = (await framesDrawnOf(page)).filter(
    at => at >= first && at <= last,
  );
  expect(
    drawn.length,
    'frames the page drew during the settle',
  ).toBeGreaterThanOrEqual(4);
  expect(samples.length, 'frames of the settle that showed a new travel').toBe(
    drawn.length,
  );
});

test('a flick hands the row’s velocity, the finger’s, to the settle', async ({
  page,
}) => {
  // A quick throw toward the trailing side: about 55 px of swipe, short of half
  // the panel, still moving at 1000 px/s when it lifts. The release goes the
  // way it moves, so the row opens. The row moved with the finger, so the
  // settle starts at the finger's velocity, not from rest.
  const {driver, row, entries, start} = await openRow(page);
  const openWidth = await openWidthOf(entries);
  expect(openWidth).toBeGreaterThan(0);
  await watchTravelCurves(row);
  await driver.play(
    flick(start, {velocity: {x: -1000, y: 0}, durationMs: 80, hz: 120}),
  );
  await waitForRest(row);
  expect(await xOf(row)).toBeCloseTo(-openWidth, 0);
  // The settle is the last curve the row played, toward the open width. It is
  // read back from the animation itself, not from frames, so a busy page that
  // draws few of them changes nothing.
  const settle = (await travelCurvesOf(page)).at(-1);
  if (settle == null) {
    throw new Error('no settle curve');
  }
  expect(settle.frames.at(-1)?.x).toBeCloseTo(-openWidth, 0);
  // Its starting velocity in px/s, read off the spring fitted to its keyframes
  // (UIKit's critically damped one). It is about the finger's 1000 px/s toward
  // the open side; from rest it would be 0.
  const v0 = fittedVelocity(settle.frames, -openWidth, 0);
  expect(v0, JSON.stringify({v0})).toBeLessThan(-700);
  expect(v0, JSON.stringify({v0})).toBeGreaterThan(-1300);
  // And the settle is UIKit's spring from there: no keyframe off the
  // critically damped curve from that place and velocity.
  const from = settle.frames[0].x;
  const target = -openWidth;
  const expected = (t: number) => {
    const s = t / 1000;
    return (
      target +
      (from - target + (v0 + OMEGA * (from - target)) * s) *
        Math.exp(-OMEGA * s)
    );
  };
  const worst = Math.max(
    ...settle.frames
      .filter(frame => frame.t < 1500)
      .map(frame => Math.abs(frame.x - expected(frame.t))),
  );
  expect(worst).toBeLessThan(0.5);
});

test('with the row open, a drag that starts on Delete itself and drags on past the confirm point fires Delete, and the row leaves', async ({
  page,
}) => {
  const opened = await openRow(page);
  const {driver, rest, panel} = opened;
  const openWidth = await restOpen(opened);
  const rows = page.locator('.astryx-item');
  const before = await rows.count();
  const box = await panel.getByRole('button', {name: 'Delete'}).boundingBox();
  if (box == null) {
    throw new Error('no Delete');
  }
  // The finger lands on Delete, the outermost entry, not on the row's content.
  const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  const confirmAt = confirmPointOf(openWidth, rest.width);
  await driver.play(
    drag(
      from,
      {
        x: from.x - (confirmAt + swipeActions.hysteresis + 20 - openWidth),
        y: from.y,
      },
      {durationMs: 900, hz: 60, restMs: 300},
    ),
  );
  await expect(rows).toHaveCount(before - 1);
});

test('with the row open, a drag that lands on Delete fires it past the confirm point even when a scroll starts closing the row first (spec:AST-057 DEC-9)', async ({
  page,
}) => {
  const opened = await openRow(page);
  const {driver, rest, panel} = opened;
  const openWidth = await restOpen(opened);
  const rows = page.locator('.astryx-item');
  const before = await rows.count();
  const box = await panel.getByRole('button', {name: 'Delete'}).boundingBox();
  if (box == null) {
    throw new Error('no Delete');
  }
  const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  // The page scrolls while the finger rests on Delete, before the drag
  // claims it, as a finger's first drift can scroll a phone's page. The
  // scroll starts the row's close.
  await page.evaluate(() => {
    document.addEventListener(
      'touchstart',
      () => {
        setTimeout(() => document.dispatchEvent(new Event('scroll')), 30);
      },
      {once: true, capture: true},
    );
  });
  // Far enough to pass the confirm point from wherever the drag catches the
  // closing row.
  const confirmAt = confirmPointOf(openWidth, rest.width);
  await driver.play(
    drag(
      from,
      {x: from.x - (confirmAt + swipeActions.hysteresis + 20), y: from.y},
      {durationMs: 1100, hz: 60, holdMs: 150, restMs: 300},
    ),
  );
  await expect(rows).toHaveCount(before - 1);
});

test('a release settles on the compositor: the row keeps moving through a 1 s main-thread block (spec:AST-094 FR5)', async ({
  page,
}) => {
  const {driver, row, entries, start} = await openRow(page);
  const openWidth = await openWidthOf(entries);
  expect(openWidth).toBeGreaterThan(0);
  // The marker rides the row's end content, clear of the control's top strip.
  // A marker at the row's start would leave the list's inline clip as the row
  // opens toward the inline start.
  await markElement(row.getByText(/Archive · Delete/), {inset: 4});
  await startBusyControl(page);
  const cast = await startScreencast(page);
  await driver.play(
    flick(start, {velocity: {x: -1000, y: 0}, durationMs: 80, hz: 120}),
  );
  // Then the page blocks itself once an animation on the row has run 40 ms:
  // the settle the lift started. The drag's tracking curve is one animation
  // the moves retarget, so a block armed before the lift fires in the drag.
  const busy = await blockMainThread(page, 1000, {
    during: row,
    minProgressMs: 40,
  });
  await waitForRest(row);
  const frames = await cast.stop();
  const tracked = await trackMarker(page, frames);
  const control = await trackMarker(page, frames, {rgb: CONTROL_RGB});
  // It is judged against what the compositor presented in the same window.
  // The row moved on every frame the control moved, until it was within two of
  // the cast's steps of its end. A slower tail moves under one step a frame. A
  // settle drawn only from the main thread freezes there.
  const proof = busyWindowProof(tracked, busy, {
    axis: 'x',
    settledWithinSteps: 2,
    control,
  });
  test
    .info()
    .annotations.push({type: 'busy window', description: proof.summary});
  expect(busy.spanMs).toBeGreaterThanOrEqual(1000);
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  expect(await xOf(row)).toBeCloseTo(-openWidth, 0);
});

test('under Reduce Motion a held release lands open with no travel: the row steps there at the bottom of an opacity dip', async ({
  page,
}) => {
  // Under Reduce Motion the finger's own drag is direct manipulation. But what
  // its release starts never travels or springs, and cross-fades.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, row, entries, start} = await openRow(page);
  const openWidth = await openWidthOf(entries);
  expect(openWidth).toBeGreaterThan(0);
  await expectCrossFade(page, row, -openWidth, async () => {
    await driver.play(heldDrag(start, -130));
  });
});

test('a close the main thread holds back plays from its start after the block, skipping no travel', async ({
  page,
}) => {
  const {driver, row, entries, start} = await openRow(page);
  const openWidth = await openWidthOf(entries);
  expect(openWidth).toBeGreaterThan(0);
  await driver.play(heldDrag(start, -130));
  await waitForRest(row);
  await recordFrames(row);
  // The task that closes the row then blocks for 800 ms, as a frame held back
  // does (iOS holds them during a smooth scroll). The block listens where React
  // does, on the story's root, after it. The row's Escape stops the event
  // there, and the close is asked for first, in the same task.
  await page.evaluate(() => {
    const block = {start: Number.NaN, end: Number.NaN};
    Object.assign(window, {__swipeBlock: block});
    const root = document.getElementById('storybook-root');
    if (root == null) {
      throw new Error('no story root');
    }
    root.addEventListener(
      'keydown',
      () => {
        block.start = performance.now();
        const until = block.start + 800;
        while (performance.now() < until) {
          // Busy: the frame that would start the close is held back.
        }
        block.end = performance.now();
      },
      {once: true},
    );
  });
  await entries.getByRole('button').first().focus();
  await watchTravelCurves(row);
  await page.keyboard.press('Escape');
  await waitForRest(row);
  const block = await page.evaluate(
    () =>
      (window as unknown as {__swipeBlock: {start: number; end: number}})
        .__swipeBlock,
  );
  expect(block.end - block.start).toBeGreaterThanOrEqual(800);
  const frames = (await framesOf(page)).filter(
    frame => frame.at >= block.start,
  );
  expect(frames.length).toBeGreaterThan(2);
  // The close is the last curve the row played, read back from the
  // animation itself: it starts after the block, not at the keydown...
  const close = (await travelCurvesOf(page)).at(-1);
  expect(close).toBeDefined();
  expect(close?.start ?? Number.NaN).toBeGreaterThanOrEqual(block.end - 1);
  // ...from where the row rested, at rest, on UIKit's settle spring toward
  // 0, to a quarter of a pixel...
  const from = -openWidth;
  const keyframes = compareCurve(
    (close?.frames ?? []).map(({t, x}) => ({t, value: x})),
    t => from * (1 - springStep(SPRING, t)),
    0.25,
  );
  expect(
    keyframes.maxError,
    JSON.stringify(keyframes.worst),
  ).toBeLessThanOrEqual(0.25);
  // ...and every frame the page drew after the block shows that curve, at its
  // own time to within half a frame (8 ms). No travel is skipped.
  const offCurve = frames
    .filter(frame => frame.at >= block.end)
    .filter(({t, x}) => {
      const at = t - (close?.start ?? 0);
      const a = curveAt(close?.frames ?? [], at - 8);
      const b = curveAt(close?.frames ?? [], at + 8);
      return x < Math.min(a, b) - 0.25 || x > Math.max(a, b) + 0.25;
    });
  expect(
    offCurve,
    JSON.stringify({start: close?.start, block, offCurve}),
  ).toEqual([]);
  expect(await xOf(row)).toBeCloseTo(0, 0);
});

test('a finger that lands on a settling row catches it where it is', async ({
  page,
}) => {
  const {driver, row, entries, start} = await openRow(page);
  expect(await openWidthOf(entries)).toBeGreaterThan(0);
  await recordFrames(row);
  await driver.play(
    flick(start, {velocity: {x: -1000, y: 0}, durationMs: 80, hz: 120}),
  );
  // The settle is under way.
  await expect.poll(async () => xOf(row)).toBeLessThan(-10);
  const caught = await nowOf(page);
  // A second touch lands on the moving row and drags it back toward closed.
  const from = {x: start.x - 80, y: start.y};
  await driver.play(
    drag(from, {x: from.x + 120, y: from.y}, {durationMs: 300, hz: 60}),
  );
  await waitForRest(row);
  const frames = (await framesOf(page)).filter(frame => frame.at >= caught);
  expect(frames.length).toBeGreaterThan(2);
  // The row is caught from where it was: no frame jumps. Between any two frames
  // the page drew, it moves no faster than the settle itself did (about 1000
  // px/s). There is slack: 2.1 px a millisecond, 35 px a frame at 60 Hz.
  const speeds = frames
    .slice(1)
    .map(
      (frame, i) =>
        Math.abs(frame.x - frames[i].x) / Math.max(1, frame.t - frames[i].t),
    );
  expect(Math.max(...speeds), JSON.stringify(frames)).toBeLessThan(2.1);
});

/** A held drag on `open`'s row past half its panel: it rests open. Resolves with the open width. */
async function restOpen({driver, row, entries, start}: OpenRow) {
  const openWidth = await openWidthOf(entries);
  // The panel is there, with entries that have widths.
  expect(openWidth).toBeGreaterThan(0);
  await driver.play(heldDrag(start, -130));
  await expect.poll(async () => xOf(row)).toBeCloseTo(-openWidth, 0);
  return openWidth;
}

/**
 * A tap through the engine's own tap path where clicks are concerned. WebKit's
 * Linux build synthesises a click only from its tap gesture, not from injected
 * touch events. The gesture system's browser tests note the same.
 */
async function engineTap(
  page: Page,
  browserName: string,
  driver: TouchDriver,
  at: {x: number; y: number},
) {
  if (browserName === 'webkit') {
    await page.touchscreen.tap(Math.round(at.x), Math.round(at.y));
  } else {
    await driver.play(tap(at));
  }
}

/**
 * Records every press paint (`data-astryx-press`) written on `row` or inside
 * it from now on; returns how many there have been.
 */
async function recordPresses(row: Locator) {
  await row.evaluate(node => {
    const log: string[] = [];
    Object.assign(window, {__rowPresses: log});
    new MutationObserver(records => {
      for (const record of records) {
        const value = (record.target as Element).getAttribute(
          'data-astryx-press',
        );
        if (value != null) {
          log.push(value);
        }
      }
    }).observe(node, {
      attributes: true,
      attributeFilter: ['data-astryx-press'],
      subtree: true,
    });
  });
  return async () =>
    row
      .page()
      .evaluate(
        () =>
          (window as unknown as {__rowPresses: string[]}).__rowPresses.length,
      );
}

/** Counts the clicks that reach `row` (capture, before the row's own handlers). */
async function countClicks(row: Locator) {
  await row.evaluate(node => {
    const counter = {clicks: 0};
    Object.assign(window, {__rowClicks: counter});
    node.addEventListener(
      'click',
      () => {
        counter.clicks += 1;
      },
      true,
    );
  });
  return async () =>
    row
      .page()
      .evaluate(
        () =>
          (window as unknown as {__rowClicks: {clicks: number}}).__rowClicks
            .clicks,
      );
}

test('a tap on the resting row’s own content closes it, with no press paint, and no click reaches the row', async ({
  page,
  browserName,
}) => {
  const open = await openRow(page);
  const {driver, row, rest} = open;
  await restOpen(open);
  const clicks = await countClicks(row);
  const presses = await recordPresses(row);
  // On the row's own content, clear of the open panel at its trailing end.
  const content = {x: rest.x + 60, y: rest.y + rest.height / 2};
  await engineTap(page, browserName, driver, content);
  await expect.poll(async () => xOf(row)).toBeCloseTo(0, 0);
  await waitForRest(row);
  expect(await clicks()).toBe(0);
  // UIKit's cell never sees that touch: nothing highlighted the row.
  expect(await presses()).toBe(0);
  // The same tap on the closed row is the row's own, and paints its press.
  await engineTap(page, browserName, driver, content);
  await expect.poll(clicks).toBe(1);
  await expect.poll(presses).toBeGreaterThan(0);
});

test('Enter on the open row’s focused content activates the row and leaves it open, as a screen reader’s activation does (spec:AST-057 AR3)', async ({
  page,
}) => {
  const open = await openRow(page);
  const {row} = open;
  const openWidth = await restOpen(open);
  const clicks = await countClicks(row);
  // The row's own primary: its first button outside the swipe panels.
  const primary = row.locator('button:not([data-swipe-panel] *)').first();
  await primary.focus();
  await page.keyboard.press('Enter');
  await expect.poll(clicks).toBe(1);
  // Only a touch tap on the content closes the row. A click with no touch
  // before it, the keyboard's or VoiceOver's and TalkBack's, leaves the row
  // open.
  await waitForRest(row);
  expect(await xOf(row)).toBeCloseTo(-openWidth, 0);
});

test('under Reduce Motion a tap on the resting row’s content closes it with no travel, at the bottom of an opacity dip', async ({
  page,
  browserName,
}) => {
  // Under Reduce Motion, on a coarse primary pointer, a close cross-fades,
  // opacity only.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const open = await openRow(page);
  const {driver, row, rest} = open;
  await restOpen(open);
  await waitForRest(row);
  const content = {x: rest.x + 60, y: rest.y + rest.height / 2};
  await expectCrossFade(page, row, 0, async () => {
    await engineTap(page, browserName, driver, content);
  });
});

test('a scroll that starts on the resting row closes it', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit’s Linux build cannot scroll from injected touches; Mobile Safari on the simulator covers it',
  );
  await openStory(page, storybook(), 'core-item--swipe-actions');
  const driver = await touchDriver(page);
  // A row low on the page, and room below the list to scroll into.
  await page.evaluate(() => {
    document.body.style.minHeight = '3000px';
  });
  const row = page.locator('.astryx-item').nth(4);
  await expect(row.locator('[data-swipe-panel="trailing"]')).toBeAttached();
  const entries = row.locator('[data-swipe-panel="trailing"] > div');
  const rest = await row.boundingBox();
  if (rest == null) {
    throw new Error('no row');
  }
  await restOpen({
    driver,
    row,
    entries,
    panel: row.locator('[data-swipe-panel="trailing"]'),
    track: row.locator('[data-swipe-panel="trailing"] > div'),
    rest,
    start: {x: rest.x + rest.width - 24, y: rest.y + rest.height / 2},
  });
  // Up from the row's own content: the page scrolls, and the row closes.
  const from = {x: rest.x + 60, y: rest.y + rest.height / 2};
  await driver.play(
    drag(from, {x: from.x, y: from.y - 200}, {durationMs: 300, hz: 60}),
  );
  await expect
    .poll(async () => page.evaluate(() => scrollY))
    .toBeGreaterThan(50);
  await expect.poll(async () => xOf(row)).toBeCloseTo(0, 0);
});

/**
 * Where each part of the trailing side is drawn now. The root and the outermost
 * entry (its pin and slide toward the row) are read by their computed
 * transforms. The other entries are read by their opacity, and the track's
 * cover fill (its `::before`) by its opacity.
 */
const drawnOf = async (row: Locator) =>
  row.evaluate(node => {
    const track = node.querySelector(
      '[data-swipe-panel="trailing"]',
    )?.firstElementChild;
    const entries = Array.from(track?.children ?? []);
    const inner = entries[0];
    const outer = entries[entries.length - 1];
    const x = (el: Element | undefined) =>
      el == null
        ? Number.NaN
        : new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
    return {
      root: x(node),
      outer: x(outer),
      inner:
        inner == null ? Number.NaN : Number(getComputedStyle(inner).opacity),
      fill:
        track == null
          ? Number.NaN
          : Number(getComputedStyle(track, '::before').opacity),
    };
  });

/** The swipe at which the story's first row confirms a full swipe. */
function confirmPointOf(openWidth: number, rowWidth: number) {
  const confirmAt = rowWidth - swipeActions.confirmInset;
  return openWidth + (confirmAt - openWidth) * swipeActions.confirmFraction;
}

test('a full swipe from the open row confirms on the finger: the row runs ahead to the confirmation offset, the outermost entry covers the space, and the release fires it', async ({
  page,
}) => {
  const opened = await openRow(page);
  const {driver, row, entries, rest} = opened;
  const rows = page.locator('.astryx-item');
  const before = await rows.count();
  const outerWidth = await entries.evaluate(
    node =>
      (node.lastElementChild as HTMLElement).getBoundingClientRect().width,
  );
  // Two entries: a full swipe confirms only from the open row, so the drag
  // starts on its content there.
  const openWidth = await restOpen(opened);
  const start = {x: opened.start.x - openWidth, y: opened.start.y};
  const confirmAt = confirmPointOf(openWidth, rest.width);
  const confirmedOffset = rest.width - swipeActions.confirmInset;
  // A slow drag to 40 px of swipe past the confirm point, held, then lifted.
  // The swipe counts from the open width, plus the finger's travel past the
  // pan's 25 px.
  const reach = confirmAt + 40 - openWidth + swipeActions.hysteresis;
  const script = drag(
    start,
    {x: start.x - reach, y: start.y},
    {durationMs: 1400, hz: 60, restMs: 500},
  );
  const moves = toTouchEvents(script).filter(e => e.type === 'touchMove');
  const seen: {
    short?: Awaited<ReturnType<typeof drawnOf>>;
    past?: Awaited<ReturnType<typeof drawnOf>>;
  } = {};
  let index = 0;
  await driver.play(script, {
    onEvent: async step => {
      if (step.type !== 'touchMove') {
        return;
      }
      const swipe =
        openWidth + start.x - step.fingers[0].x - swipeActions.hysteresis;
      index += 1;
      if (seen.short == null && swipe >= confirmAt - 12) {
        seen.short = await drawnOf(row);
      }
      if (index === moves.length) {
        // The finger held there until every spring has come to rest.
        await waitForRest(row);
        seen.past = await drawnOf(row);
      }
    },
  });
  // Short of the confirm point the row is at the finger's travel, 25 px past
  // the swipe on UIKit's measure. The entries look as they always do.
  const {short, past} = seen;
  expect(short).toBeDefined();
  expect(short?.root).toBeGreaterThan(-(confirmAt + swipeActions.hysteresis));
  expect(short?.outer).toBeCloseTo(0, 1);
  expect(short?.inner).toBeCloseTo(1, 2);
  expect(short?.fill).toBeCloseTo(0, 2);
  // Past it, the row ran ahead to the confirmation offset and kept that lead.
  // 40 px more of the finger put it about 40 px past the offset, less part of
  // one move's step, where the confirm fell. The outermost entry has slid past
  // the others to the row's edge, and the others hide under its cover at once.
  expect(past?.root).toBeLessThanOrEqual(-(confirmedOffset + 37));
  expect(past?.root).toBeGreaterThanOrEqual(-(confirmedOffset + 40.5));
  expect(past?.outer).toBeCloseTo(-(openWidth - outerWidth), 0);
  expect(past?.inner).toBeCloseTo(0, 2);
  // Under them the track shows the outermost entry's colour.
  expect(past?.fill).toBeCloseTo(1, 2);
  // Lifted there: Delete fires and the story removes the row.
  await expect(rows).toHaveCount(before - 1);
});

test('backing out of a full swipe confirmed from the open row closes the row and fires nothing; the entries stay pinned below the open width and ride the row above it, frame by frame', async ({
  page,
}) => {
  const opened = await openRow(page);
  const {driver, row, rest} = opened;
  const rows = page.locator('.astryx-item');
  const before = await rows.count();
  const openWidth = await restOpen(opened);
  const start = {x: opened.start.x - openWidth, y: opened.start.y};
  const confirmAt = confirmPointOf(openWidth, rest.width);
  await recordFrames(row);
  await recordLift(page);
  // From the open row out past the confirm point, then back to 200 px of swipe,
  // held still, then lifted. 200 px is past the open width and short of the
  // confirm point.
  const h = swipeActions.hysteresis;
  const out = drag(
    start,
    {x: start.x - (confirmAt + 40 + h - openWidth), y: start.y},
    {durationMs: 900, hz: 60},
  ).slice(0, -1);
  const last = out[out.length - 1];
  const back = drag(
    last.fingers[0],
    {x: start.x - (200 + h - openWidth), y: start.y},
    {durationMs: 500, hz: 60, restMs: 600},
  ).map(frame => ({...frame, t: frame.t + last.t + 16}));
  await driver.play([...out, ...back.slice(1)]);
  // A swipe that confirmed and backed out closes, whatever its position.
  await waitForRest(row);
  const samples = (await settleOf(page)).map(frame => frame.parts);
  // The settle crosses the open width. Above it the entries ride the row, and
  // below it they are pinned at the outer edge. That holds at every frame the
  // page drew, with a frame on each side at least.
  let crossed = 0;
  for (const part of samples) {
    const travel = -part.root;
    if (travel > openWidth + 0.5) {
      expect(part.entries).toBeCloseTo(0, 0);
    } else if (travel < openWidth - 0.5) {
      crossed += 1;
      expect(part.track + part.entries).toBeCloseTo(-openWidth, 0);
    }
  }
  expect(samples[0].root).toBeLessThan(-openWidth);
  expect(crossed).toBeGreaterThan(0);
  await expect.poll(async () => xOf(row)).toBeCloseTo(0, 0);
  await expect(rows).toHaveCount(before);
});

test('under Reduce Motion a full swipe confirms with no travel: the row steps to the confirmation offset at the bottom of an opacity dip', async ({
  page,
}) => {
  // Under Reduce Motion the finger's drag is direct manipulation. But a confirm
  // is a change of state, so the row cross-fades to it.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const opened = await openRow(page);
  const {driver, row, rest} = opened;
  // From the open row: two entries confirm a full swipe only there.
  const openWidth = await restOpen(opened);
  const start = {x: opened.start.x - openWidth, y: opened.start.y};
  const confirmAt = confirmPointOf(openWidth, rest.width);
  const confirmedOffset = rest.width - swipeActions.confirmInset;
  const h = swipeActions.hysteresis;
  const script = drag(
    start,
    {x: start.x - (confirmAt + h + 4 - openWidth), y: start.y},
    {durationMs: 900, hz: 60, restMs: 300},
  );
  await watchCrossFade(page, row);
  let checked = false;
  await driver.play(script, {
    onEvent: async step => {
      const swipe = openWidth + start.x - (step.fingers[0]?.x ?? start.x) - h;
      if (!checked && step.type === 'touchMove' && swipe >= confirmAt) {
        // The move that confirms: the row is now fading out, to land at the
        // confirmation offset while transparent and fade back in. The first
        // dip of the drag (before it, the drag is direct manipulation).
        checked = true;
        await expectCrossFadeSince(page, row, -confirmedOffset, 0);
      }
    },
  });
  expect(checked).toBe(true);
});

test('under Reduce Motion backing out of a confirmed full swipe returns to the finger with no travel, at the bottom of an opacity dip', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const opened = await openRow(page);
  const {driver, row, rest} = opened;
  const openWidth = await restOpen(opened);
  const start = {x: opened.start.x - openWidth, y: opened.start.y};
  const confirmAt = confirmPointOf(openWidth, rest.width);
  const h = swipeActions.hysteresis;
  // From the open row out past the confirm point, held there while the
  // confirm's cross-fade plays out, then back short of it, held, and lifted.
  // The way back is 39 px, not 40, so no move lands exactly on the confirm
  // point. The moves straddle it by half a pixel or more. So the move that
  // backs out is the same for the row and for this test, whatever rounding each
  // one's sum carries.
  const out = drag(
    start,
    {x: start.x - (confirmAt + h + 20 - openWidth), y: start.y},
    {durationMs: 900, hz: 60, restMs: 400},
  ).slice(0, -1);
  const last = out[out.length - 1];
  const back = drag(
    last.fingers[0],
    {x: start.x - (confirmAt + h - 19 - openWidth), y: start.y},
    {durationMs: 300, hz: 60, restMs: 300},
  ).map(frame => ({...frame, t: frame.t + last.t + 16}));
  await watchCrossFade(page, row);
  let confirmed = false;
  let checked = false;
  await driver.play([...out, ...back.slice(1)], {
    onEvent: async step => {
      if (step.type !== 'touchMove' || checked) {
        return;
      }
      const swipe = openWidth + start.x - (step.fingers[0]?.x ?? start.x) - h;
      if (swipe >= confirmAt) {
        confirmed = true;
      } else if (confirmed) {
        // The move that backs out: the row fades out, lands under the
        // finger, at its travel since touch-down, while transparent, and fades
        // back in. The drag's second dip (its first was the confirm's).
        checked = true;
        await expectCrossFadeSince(page, row, -(swipe + h), 0, 1);
      }
    },
  });
  expect(checked).toBe(true);
  // Lifted backed out: the row closes and fires nothing.
  await expect.poll(async () => xOf(row)).toBeCloseTo(0, 0);
});

test(
  'storyboard: a full swipe confirms, the row runs ahead and the outermost entry covers the space',
  {tag: '@storyboard'},
  async ({page, browserName}) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frames are Chromium-only in Playwright',
    );
    const opened = await openRow(page);
    const {driver, row, rest} = opened;
    // From the open row: two entries confirm a full swipe only there.
    const openWidth = await restOpen(opened);
    const start = {x: opened.start.x - openWidth, y: opened.start.y};
    const confirmAt = confirmPointOf(openWidth, rest.width);
    await markElement(row, {mode: 'outline'});
    const cast = await startScreencast(page);
    const began = Date.now();
    await driver.play(
      drag(
        start,
        {
          x: start.x - (confirmAt + 30 + swipeActions.hysteresis - openWidth),
          y: start.y,
        },
        {durationMs: 1200, hz: 60, restMs: 400},
      ),
    );
    await waitForRest(row);
    const castFrames = await cast.stop();
    const tracked = await trackMarker(page, castFrames);
    // The trace: the row's edge runs out to the confirmation offset, ahead
    // of the finger, and on out of the list as Delete fires.
    const rights = tracked
      .filter(f => f.t >= began && f.box != null)
      .map(f => (f.box?.x as number) + (f.box?.width as number));
    expect(Math.min(...rights)).toBeLessThan(
      rest.x + rest.width - (rest.width - swipeActions.confirmInset) + 1,
    );
  },
);

test(
  'storyboard: a full swipe that backs out undoes the look and closes the row',
  {tag: '@storyboard'},
  async ({page, browserName}) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frames are Chromium-only in Playwright',
    );
    const opened = await openRow(page);
    const {driver, row, rest} = opened;
    const openWidth = await restOpen(opened);
    const start = {x: opened.start.x - openWidth, y: opened.start.y};
    const confirmAt = confirmPointOf(openWidth, rest.width);
    const h = swipeActions.hysteresis;
    const out = drag(
      start,
      {x: start.x - (confirmAt + 40 + h - openWidth), y: start.y},
      {durationMs: 900, hz: 60},
    ).slice(0, -1);
    const last = out[out.length - 1];
    const back = drag(
      last.fingers[0],
      {x: start.x - (200 + h - openWidth), y: start.y},
      {durationMs: 600, hz: 60, restMs: 400},
    ).map(frame => ({...frame, t: frame.t + last.t + 16}));
    await markElement(row, {mode: 'outline'});
    const cast = await startScreencast(page);
    const began = Date.now();
    await driver.play([...out, ...back.slice(1)]);
    await waitForRest(row);
    const castFrames = await cast.stop();
    const tracked = await trackMarker(page, castFrames);
    // The trace: out to the confirmation offset, back with the finger, then
    // home on the release. The row comes to the offset itself, and screencast
    // boxes are whole pixels. So its closest frame reads that pixel or the
    // next: a frame between keyframes sits up to a quarter pixel short.
    const rights = tracked
      .filter(f => f.t >= began && f.box != null)
      .map(f => (f.box?.x as number) + (f.box?.width as number));
    expect(Math.min(...rights)).toBeLessThanOrEqual(
      rest.x + swipeActions.confirmInset + 1,
    );
    expect(rights.at(-1)).toBeCloseTo(rest.x + rest.width, 0);
  },
);

test('the drag and the settle do no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, row, start} = await openRow(page);
  await recordFrames(row);
  await recordLift(page);
  let dragWindow = {from: 0, to: 0};
  const trace = await traceRendering(page, async () => {
    const begun = Date.now();
    await driver.play(heldDrag(start, -130));
    dragWindow = {from: begun + 250, to: begun + 450};
    // The trace runs until the settle, which writes the travel every frame,
    // has ended.
    await waitForRest(row);
  });
  const settle = await settleOf(page);
  // A window from the settle's first frame to its last.
  expect(settle.length).toBeGreaterThan(1);
  const origin = await page.evaluate(() => performance.timeOrigin);
  // The steady part of the drag (after the claim) and of the settle. Their
  // first and last frames may commit, and the row lands (one render) when the
  // settle ends.
  const during = countBetween(
    trace,
    origin + settle[0].t + 50,
    origin + (settle.at(-1)?.t ?? 0) - 50,
  );
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  const dragging = countBetween(trace, dragWindow.from, dragWindow.to);
  expect(dragging.Layout ?? 0, JSON.stringify(dragging)).toBe(0);
  expect(trace.longTasks).toEqual([]);
});

test(
  'storyboard: drag the row open and let it settle',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, row, start, rest} = await openRow(page);
    const clip = {
      x: 0,
      y: Math.max(0, rest.y - 8),
      width: page.viewportSize()?.width ?? 402,
      height: rest.height + 16,
    };
    await recordFrames(row);
    await recordLift(page);
    const measure = async () => ({x: await xOf(row)});
    const dragBoard = await touchStoryboard(
      page,
      driver,
      drag(
        start,
        {x: start.x - 130, y: start.y},
        {durationMs: 200, hz: 30, restMs: 150},
      ),
      {
        name: 'item-swipe-drag',
        clip,
        measure,
        columns: 4,
        cellScale: 0.6,
      },
    );
    await waitForRest(row);
    await dragBoard.write(testInfo);
    const settle = await settleOf(page);
    // The film is the evidence; that the page draws every frame of it is
    // the settle proof's claim.
    expect(settle.length).toBeGreaterThan(1);
    // The trace is the assertion; the sheets are the evidence.
    const dragXs = dragBoard.frames.map(f => f.data.x as number);
    expect(dragXs.every((x, i) => i === 0 || x <= dragXs[i - 1] + 0.5)).toBe(
      true,
    );
    expect(settle.at(-1)?.x).toBeLessThan(-60);
  },
);

test(
  'storyboard: a short drag springs back',
  {tag: '@storyboard'},
  async ({page}) => {
    const {driver, row, rest} = await openRow(page);
    await recordFrames(row);
    await recordLift(page);
    // 30 px toward the leading side, come to rest: short of half the panel,
    // so the row springs back.
    await driver.play(
      heldDrag({x: rest.x + 24, y: rest.y + rest.height / 2}, 30),
    );
    await waitForRest(row);
    const settle = await settleOf(page);
    // The film is the evidence; that the page draws every frame of it is
    // the settle proof's claim.
    expect(settle.length).toBeGreaterThan(1);
    const xs = settle.map(frame => frame.x);
    expect(xs[0]).toBeGreaterThan(20);
    expect(xs.every((x, i) => i === 0 || x <= xs[i - 1] + 0.5)).toBe(true);
    expect(xs.at(-1)).toBeCloseTo(0, 0);
  },
);

test(
  'storyboard: a tap on the open row’s content closes it',
  {tag: '@storyboard'},
  async ({page, browserName}) => {
    const open = await openRow(page);
    const {driver, row, rest} = open;
    await restOpen(open);
    await waitForRest(row);
    await recordFrames(row);
    await recordLift(page);
    await engineTap(page, browserName, driver, {
      x: rest.x + 60,
      y: rest.y + rest.height / 2,
    });
    await waitForRest(row);
    const settle = await settleOf(page);
    // The film is the evidence; that the page draws every frame of it is
    // the settle proof's claim.
    expect(settle.length).toBeGreaterThan(1);
    const xs = settle.map(frame => frame.x);
    // From open to closed without a step back: the settle spring, from rest.
    expect(xs[0]).toBeLessThan(-100);
    expect(xs.every((x, i) => i === 0 || x >= xs[i - 1] - 0.5)).toBe(true);
    expect(xs.at(-1)).toBeCloseTo(0, 0);
  },
);

test(
  'storyboard: a flick opens the row and a finger catches it mid-settle',
  {tag: '@storyboard'},
  async ({page, browserName}) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frames are Chromium-only in Playwright',
    );
    const {driver, row, start} = await openRow(page);
    await markElement(row, {mode: 'outline'});
    const cast = await startScreencast(page);
    const began = Date.now();
    await driver.play(
      flick(start, {velocity: {x: -1000, y: 0}, durationMs: 80, hz: 120}),
    );
    // The settle is under way.
    await expect.poll(async () => xOf(row)).toBeLessThan(-10);
    const from = {x: start.x - 80, y: start.y};
    await driver.play(
      drag(from, {x: from.x + 120, y: from.y}, {durationMs: 300, hz: 60}),
    );
    await waitForRest(row);
    const castFrames = await cast.stop();
    const tracked = await trackMarker(page, castFrames);
    // The trace is the assertion: no frame jumps across the catch.
    const xs = tracked
      .filter(f => f.t >= began && f.box != null)
      .map(f => f.box?.x as number);
    const steps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
    expect(xs.length).toBeGreaterThan(10);
    expect(Math.max(...steps)).toBeLessThan(35);
  },
);

/**
 * Chromium's synthetic wheel (CDP `mouseWheel`) carries a fixed `wheelDelta`,
 * whatever its deltas. The gesture system reads that as a mouse wheel's, since
 * a trackpad's carries three times its delta. So a trackpad case runs in
 * WebKit, whose synthetic wheel carries a trackpad's.
 */
const TRACKPAD_SKIP =
  "Chromium's synthetic wheel carries a fixed wheelDelta, read as a mouse wheel's: trackpad cases run in WebKit";
/**
 * WebKit's synthetic wheel carries a trackpad's `wheelDelta` (three times its
 * deltas), which the gesture system reads as a trackpad's scroll. So a mouse
 * wheel's case runs in Chromium.
 */
const NOTCH_SKIP =
  "WebKit's synthetic wheel carries a trackpad's wheelDelta, read as a trackpad's scroll: mouse-wheel cases run in Chromium";

/** A desktop row: its story, the input driver, and where a wheel lands on it. */
async function openDesktopRow(page: Page) {
  await openStory(page, storybook(), 'core-item--swipe-actions');
  const driver = await webInputDriver(page);
  const rows = page.locator('.astryx-item');
  const row = rows.first();
  const panel = row.locator('[data-swipe-panel="trailing"]');
  await expect(panel).toBeAttached();
  const openWidth = await openWidthOf(panel.locator(':scope > div').first());
  expect(openWidth).toBeGreaterThan(0);
  const rest = await row.boundingBox();
  if (rest == null) {
    throw new Error('no row');
  }
  expect(rest.width).toBeGreaterThan(0);
  const at = {x: rest.x + rest.width / 2, y: rest.y + rest.height / 2};
  return {driver, rows, row, panel, openWidth, rest, at};
}

/** The travel the drag draws the row at now (physical px). */
const travelOf = async (row: Locator) =>
  row.evaluate(node =>
    parseFloat(
      getComputedStyle(node).getPropertyValue('--_item-swipe-travel') || '0',
    ),
  );

/** Logs every wheel the page receives (its time and horizontal delta). */
async function recordWheels(page: Page): Promise<void> {
  await page.evaluate(() => {
    const wheels: {at: number; dx: number}[] = [];
    addEventListener(
      'wheel',
      event => {
        wheels.push({at: performance.now(), dx: event.deltaX});
      },
      {capture: true, passive: true},
    );
    Object.assign(window, {__swipeWheels: wheels});
  });
}

const wheelsOf = async (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {__swipeWheels: {at: number; dx: number}[]})
        .__swipeWheels,
  );

test.describe('under a trackpad or a mouse wheel (a desktop context)', () => {
  // A desktop context: no touchscreen, a fine primary pointer, and real wheel
  // input in both engines (WebKit's mobile emulation has none).
  test.use({hasTouch: false, isMobile: false});

  test('a trackpad’s horizontal scroll opens a row, and a vertical one leaves it shut (spec:AST-094 FR43, spec:AST-057 FR4, DEC-7)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    const {driver, rows, row, panel, openWidth, at} =
      await openDesktopRow(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    // A scroll toward the inline end drags the content toward the inline
    // start, as two fingers do: the trailing side uncovers.
    for (let i = 0; i < 12; i += 1) {
      await driver.wheel({...at, dx: 8});
    }
    await expect.poll(async () => xOf(row)).toBeCloseTo(-openWidth, 0);
    await expect(panel).not.toHaveAttribute('inert', '');
    // A vertical scroll over another row is the page's: that row stays shut.
    const other = rows.nth(1);
    const box = await other.boundingBox();
    if (box == null) {
      throw new Error('no second row');
    }
    for (let i = 0; i < 6; i += 1) {
      await driver.wheel({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        dy: 12,
      });
    }
    await waitForRest(other);
    expect(await xOf(other)).toBeCloseTo(0, 0);
  });

  test('a trackpad’s swipe moves the row one for one with the fingers from its first event past the pan’s 8 px start (spec:AST-094 FR43)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    const {driver, row, at} = await openDesktopRow(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    // After each wheel, where the row is drawn: the fingers' travel past the
    // pan's 8 px start, at once, with nothing trailing behind them.
    const seen: {scroll: number; travel: number}[] = [];
    for (let i = 1; i <= 12; i += 1) {
      await driver.wheel({...at, dx: 8});
      seen.push({scroll: 8 * i, travel: await travelOf(row)});
    }
    expect(seen.at(-1)?.travel).toBeLessThan(-40);
    for (const {scroll, travel} of seen) {
      expect(travel, JSON.stringify(seen)).toBeCloseTo(
        -Math.max(0, scroll - 8),
        0,
      );
    }
  });

  test('a trackpad’s release settles from the fingers’ last move at their speed: the row never stops before it settles (spec:AST-094 FR43, FR36)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    const {driver, row, panel, openWidth, at} = await openDesktopRow(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    await recordFrames(row);
    await recordWheels(page);
    // The fingers move 96 px in 12 px wheels and lift: momentum follows,
    // shrinking. Past half the open width and slower than a flick, the
    // release settles the row open.
    const fingers = Array.from({length: 8}, () => 12);
    const momentum = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    for (const dx of [...fingers, ...momentum]) {
      await driver.wheel({...at, dx});
    }
    await expect.poll(async () => xOf(row)).toBeCloseTo(-openWidth, 0);
    await expect(panel).not.toHaveAttribute('inert', '');
    const wheels = await wheelsOf(page);
    expect(wheels.length).toBe(fingers.length + momentum.length);
    const lastFinger = wheels[fingers.length - 1];
    const beforeIt = wheels[fingers.length - 2];
    // The fingers' speed at their last move, px/s.
    const speed = (1000 * 12) / Math.max(1, lastFinger.at - beforeIt.at);
    // From the fingers' last move until the row is close to the open width, the
    // row keeps moving toward it. No frame-to-frame stretch is slower than a
    // third of the fingers' speed, as a stop and a restart would be.
    const frames = (await framesOf(page)).filter(
      frame => frame.at >= lastFinger.at && -frame.x < openWidth - 10,
    );
    expect(frames.length, JSON.stringify(frames)).toBeGreaterThan(2);
    const speeds = frames
      .slice(1)
      .map(
        (frame, i) =>
          (1000 * -(frame.x - frames[i].x)) /
          Math.max(1, frame.t - frames[i].t),
      );
    expect(
      Math.min(...speeds),
      JSON.stringify({speed, speeds}),
    ).toBeGreaterThan(speed / 3);
  });

  test('within one gesture an open row only closes, never passing rest to its other side (spec:AST-094 FR43)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    const {driver, row, at} = await openDesktopRow(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    const leading = row.locator('[data-swipe-panel="leading"]');
    await expect(leading).toBeAttached();
    await recordFrames(row);
    // Open the trailing side, then, in the same gesture, back 240 px: past
    // rest by 152 px.
    for (let i = 0; i < 12; i += 1) {
      await driver.wheel({...at, dx: 8});
    }
    expect(await travelOf(row)).toBeLessThan(-40);
    for (let i = 0; i < 30; i += 1) {
      await driver.wheel({...at, dx: -8});
    }
    await waitForRest(row);
    const frames = await framesOf(page);
    expect(frames.length).toBeGreaterThan(2);
    // Never toward the leading side, at any frame; the row rests closed.
    expect(Math.max(...frames.map(frame => frame.x))).toBeLessThanOrEqual(0.5);
    expect(await xOf(row)).toBeCloseTo(0, 0);
    await expect(leading).toHaveAttribute('inert', '');
  });

  test('a long trackpad swipe from the open row fires the outermost action (spec:AST-094 FR43, spec:AST-057 FR5)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    const {driver, rows, row, openWidth, at} = await openDesktopRow(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    const before = await rows.count();
    expect(before).toBeGreaterThan(1);
    // Two entries: a full swipe fires only from the open row.
    for (let i = 0; i < 12; i += 1) {
      await driver.wheel({...at, dx: 8});
    }
    await expect.poll(async () => xOf(row)).toBeCloseTo(-openWidth, 0);
    for (let i = 0; i < 30; i += 1) {
      await driver.wheel({...at, dx: 16});
    }
    // The story removes the row its outermost trailing action fires on.
    await expect(rows).toHaveCount(before - 1);
  });

  test('a fast trackpad flick from an open row settles it open: speed alone never fires an action (spec:AST-057 FR5, spec:AST-094 FR43)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    const {driver, rows, row, openWidth, at} = await openDesktopRow(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    const before = await rows.count();
    for (let i = 0; i < 12; i += 1) {
      await driver.wheel({...at, dx: 8});
    }
    await expect.poll(async () => xOf(row)).toBeCloseTo(-openWidth, 0);
    await waitForRest(row);
    // A fast flick on toward the full swipe, short of its confirm point, and
    // its momentum: faster than the flick speed (1008 px/s).
    for (const dx of [40, 40, 40, 30, 22, 16, 11, 7, 4, 2, 1]) {
      await driver.wheel({...at, dx});
    }
    // The release comes once the wheel's gesture has ended.
    await expect.poll(async () => xOf(row)).toBeCloseTo(-openWidth, 0);
    await waitForRest(row);
    await expect(rows).toHaveCount(before);
  });

  test('a mouse wheel’s horizontal notch never swipes a row: the page keeps it (spec:AST-094 FR43, spec:AST-057 DEC-7)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', NOTCH_SKIP);
    const {driver, row, panel, at} = await openDesktopRow(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    // How many wheels something took from the page.
    await page.evaluate(() => {
      const taken = {count: 0};
      Object.assign(window, {__wheelTaken: taken});
      addEventListener(
        'wheel',
        event => {
          if (event.defaultPrevented) {
            taken.count += 1;
          }
        },
        {passive: true},
      );
    });
    for (let i = 0; i < 3; i += 1) {
      await driver.wheel({...at, dx: 100});
    }
    await waitForRest(row);
    expect(await xOf(row)).toBeCloseTo(0, 0);
    await expect(panel).toHaveAttribute('inert', '');
    expect(
      await page.evaluate(
        () =>
          (window as unknown as {__wheelTaken: {count: number}}).__wheelTaken
            .count,
      ),
    ).toBe(0);
  });

  test('a pen’s sideways drag opens a row as a finger does, and the page selects no text (spec:AST-057 FR4)', async ({
    page,
  }) => {
    const {driver, row, panel, openWidth, rest} = await openDesktopRow(page);
    test.skip(!driver.pens, PEN_SKIP);
    const y = rest.y + rest.height / 2;
    const from = rest.x + rest.width - 24;
    // Toward the inline start, past the swipe's 25 px and past half the panel.
    // Then held still before the lift, so the release reads no fling.
    const points = [
      ...Array.from({length: 13}, (_, i) => ({
        t: i * 16,
        x: from - (i * (openWidth + 25)) / 12,
        y,
      })),
      ...Array.from({length: 12}, (_, i) => ({
        t: 208 + i * 16,
        x: from - (openWidth + 25),
        y,
      })),
    ];
    await driver.pen(points);
    await expect.poll(async () => xOf(row)).toBeCloseTo(-openWidth, 0);
    await expect(panel).not.toHaveAttribute('inert', '');
    expect(await page.evaluate(() => String(getSelection()))).toBe('');
  });

  test('under Reduce Motion a trackpad’s release lands the row at once on a fine pointer, with no fade (design:reduced-motion DR3, spec:AST-094 FR43)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {driver, row, openWidth, at} = await openDesktopRow(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    await watchCrossFade(page, row);
    for (let i = 0; i < 12; i += 1) {
      await driver.wheel({...at, dx: 8});
    }
    await expect.poll(async () => xOf(row)).toBeCloseTo(-openWidth, 0);
    await waitForRest(row);
    // No opacity animation on the row: the release landed at once.
    expect(
      await page.evaluate(
        () => (window as unknown as {__swipeFades: Fade[]}).__swipeFades,
      ),
    ).toEqual([]);
  });

  test('a mouse click on the content of a row a trackpad opened reaches the row, and the row stays open: only a touch tap closes it (spec:AST-057 FR7)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_SKIP);
    const {driver, row, panel, openWidth, at} = await openDesktopRow(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    for (let i = 0; i < 12; i += 1) {
      await driver.wheel({...at, dx: 8});
    }
    await expect.poll(async () => xOf(row)).toBeCloseTo(-openWidth, 0);
    // Count the clicks that reach the row.
    await row.evaluate(node => {
      const counted = node as HTMLElement & {clicks?: number};
      counted.clicks = 0;
      node.addEventListener('click', () => {
        counted.clicks = (counted.clicks ?? 0) + 1;
      });
    });
    // The row's content is still under the middle of where the row rested.
    await page.mouse.click(at.x - openWidth, at.y);
    await expect
      .poll(async () =>
        row.evaluate(node => (node as HTMLElement & {clicks?: number}).clicks),
      )
      .toBe(1);
    await page.waitForTimeout(400);
    expect(await xOf(row)).toBeCloseTo(-openWidth, 0);
    await expect(panel).not.toHaveAttribute('inert', '');
  });
});
