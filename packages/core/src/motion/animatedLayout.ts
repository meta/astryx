// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.ts
 * @input The DOM (layout rectangles, computed style) and Web Animations. The
 *   theme's move curve and duration (themeTiming.ts), the Reduce Motion
 *   cross-fade clock (uikit/timing.ts) and the block measure (frameBlock.ts)
 * @output Exports `createAnimatedLayout`, the opaque `AnimatedLayout` handle,
 *   `reportLayoutChange`, `playLayoutChange` and `layoutStartFor`. It also
 *   exports the exit hold (`holdLayoutExit`, `releaseLayoutExit`), the
 *   in-place swap (`holdLayoutSwap`, `playLayoutSwap`), the edge reveal's
 *   two-state form (`holdLayoutEdge`, `playLayoutEdge`), `playLayoutFrames`
 *   and `applyLayoutChangeTransition`. It exports `glideOf` and the glide
 *   landings (`landLayoutGlide`, `landLayoutGlideSideways`) too. It is the one
 *   module that produces the size-change glide and the edge reveal
 *   `spec:AST-105` defines (`architecture:react-component-runtime` INV12)
 * @position Motion foundation, internal to core. A handle comes from the
 *   public `useAnimatedLayout` hook; a component that takes it reports its
 *   size changes through this module.
 *
 * How it works:
 * - `measureBefore()` runs before the change commits: from the changed
 *   element it walks up to the handle's container and, at each level,
 *   records the rectangles of the element siblings after it and before it (a
 *   centered, end-aligned or space-between row, or `order`, moves those too),
 *   through `parentElement`, `nextElementSibling` and
 *   `previousElementSibling`, descending only into an element with
 *   `display: contents` (it has no box). Each level's walk stops at the first
 *   sibling outside the band a change can move content into view from: the
 *   area's visible part plus one viewport, or the changed element's size if
 *   larger, above and below. So its cost grows with depth plus the siblings
 *   near the visible part, never with a list's length.
 * - `animate()` runs after the commit (a layout effect). Every change in the
 *   same area reported in one frame is measured together after the commit,
 *   once, in a microtask, so each element moves once, by its total change.
 * - An element moves only when its rectangle changed and it is in the area's
 *   visible part, before or after. Absolute, fixed, top-layer, hidden and
 *   zero-size elements are skipped (an absolute child rides with its moving
 *   parent); a stuck sticky element does not change rectangle, so it stays.
 * - The move is a compositor-only `translate` (replace composition) from the
 *   old place to the new one. Its linear keyframes sample the theme's move
 *   curve, corrected for a scaled ancestor. An element already gliding
 *   keeps that motion and adds the new move: the rest of its curve and the
 *   new move are summed into one new glide, velocity included. Its place
 *   before the change is read on the clock of every glide that carries it,
 *   its own and its gliding ancestors' in the area (the box with each applied
 *   `translate` taken out, plus each glide's offset at its current time), and
 *   so is its place after the change, where only the glides the change leaves
 *   running remain: the new glide starts where the old one is drawn, and a
 *   glide the change leaves running cancels out of the move. Nothing
 *   animates height, and nothing scrolls the area.
 * - A measurement no commit claims by the next frame is dropped.
 * - The changed element plays its own entrance on the same curve, started in
 *   the same frame (`playLayoutChange`). Or it exits, kept where it is while
 *   it gives up its space and conceals (`holdLayoutExit`). Both are FR9's
 *   edge reveal: from its block-end edge by default, or from the block-start
 *   or an inline edge it is given. Once the content on that edge's side
 *   glides, the edge rides that glide, frame by frame, so the two never part;
 *   a reversal (a close while it opens) starts from what the element shows.
 *   A disclosure's indicator turns on the same motion
 *   (`applyLayoutChangeTransition`).
 * - A swap holds old content as one transient copy, inert and hidden from
 *   assistive technology, while new content enters in its place, on the same
 *   motion, and removes it when the swap ends (`holdLayoutSwap`,
 *   `playLayoutSwap`; `spec:AST-105` FR8). The caller shapes the frames over
 *   the swap's progress and, riding a gliding element, how far it has moved,
 *   so every part keeps to that glide; under Reduce Motion with a coarse
 *   pointer only opacity changes.
 * - FR9's two-state form holds an element's old state as the swap's copy
 *   while its edge rides a gliding element, such as a rail beside its
 *   content (`holdLayoutEdge`, `playLayoutEdge`): the larger state is
 *   clipped on that edge, from the extent the element shows, and the caller
 *   adds only its own fades.
 * - Frames on elements the page renders can play on the same motion with no
 *   copy (`playLayoutFrames`), such as a surface reaching over a gap a glide
 *   opens, and are released when the motion ends.
 * - Every pointer (`spec:AST-105` FR5). Under Reduce Motion nothing travels
 *   (`design:reduced-motion` DR1–DR3): a cross-fade under a coarse primary
 *   pointer, an immediate change otherwise.
 * - Without a handle nothing happens: the component keeps its jump
 *   (`spec:AST-105` FR2).
 */

import {LATE_START_MS} from './frameBlock';
import {linearEasing, sampleCount} from './linearEasing';
import {
  sharedKey,
  sharedMap,
  sharedState,
  sharedWeakMap,
  sharedWeakSet,
} from '../utils/sharedRealm';
import {paintedBackground} from './inertClone';
import {
  inertCopy,
  isCopyable,
  placeOver,
  visiblePartCopy,
  wrapText,
} from './transientCopy';
import {readThemeTiming, readThemeTokenText} from './themeTiming';
import {
  settlingDuration,
  solveSpring,
  toSpring,
  type SpringDescription,
} from './spring';
import {themeReducesMotion} from '../privateAttributes/reducedMotion.stylex';
import {reducedMotionCrossFade} from './uikit/timing';
import {
  batchPresented,
  clearPresentedResolve,
  registerPresentedOffset,
  writePresentedResolve,
} from './presentation';

/** Below this many pixels a shift is not worth a move. */
const MIN_SHIFT_PX = 0.5;
/** The touch cross-fade's cap (`design:reduced-motion` DR2). */
const CROSS_FADE_CAP_MS = 200;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/** How a change plays under the reader's settings. */
type LayoutMotion =
  | {readonly kind: 'glide'; readonly progress: GlideProgress}
  | {
      readonly kind: 'fade';
      readonly durationMs: number;
      readonly easing: string;
    }
  | {readonly kind: 'instant'};

/** The move curve as remaining distance (1 → 0) over its duration. */
export interface GlideProgress {
  readonly durationMs: number;
  /** The move curve's CSS text, as read where the area is. */
  readonly easing: string;
  /** Remaining fraction of the move at `t` ms. */
  remaining(t: number): number;
}

function matches(element: Element, query: string): boolean {
  const view = element.ownerDocument.defaultView;
  return (
    typeof view?.matchMedia === 'function' && view.matchMedia(query).matches
  );
}

/**
 * The theme's move curve over its medium duration where `area` is:
 * one value for the glide, the changed element and the indicator. The tokens
 * carry the theme's `character` and `tempo`. Null when the duration is zero
 * or the browser plays no such easing, and then the change lands at once.
 */
function glideProgress(area: Element): GlideProgress | null {
  const curve = readThemeTiming(area, {
    duration: '--duration-medium',
    easing: '--ease-move',
  });
  const easing = readThemeTokenText(area, '--ease-move');
  if (curve == null || easing == null) {
    return null;
  }
  const durationMs = curve.duration * 1000;
  return {
    durationMs,
    easing,
    remaining: t => (t >= durationMs ? 0 : 1 - curve.at(t / 1000)),
  };
}

// A glide a gesture's release asks for, for the changes in one area.
const releaseGlides = sharedWeakMap<Element, GlideProgress>(
  'motion/animated-layout/release-glides',
  1,
);

/**
 * Times the changes `area` and what it holds play in the next frame by
 * `progress`, not the theme's move curve. A release settles on its spring.
 * Reduce Motion still wins.
 */
export function glideNextChange(area: Element, progress: GlideProgress): void {
  releaseGlides.set(area, progress);
  const view = area.ownerDocument.defaultView;
  view?.requestAnimationFrame(() => {
    view.requestAnimationFrame(() => releaseGlides.delete(area));
  });
}

/**
 * `spring` from rest toward the end, released at `velocity` (fractions of
 * the move per second, toward the end), as a glide's progress.
 */
export function springGlide(
  spring: SpringDescription,
  velocity: number,
): GlideProgress {
  const physics = toSpring(spring);
  const curve = solveSpring(physics, {from: 0, to: 1, velocity});
  const durationMs =
    settlingDuration(physics, {initialVelocity: velocity}) * 1000;
  const remaining = (t: number) =>
    t >= durationMs ? 0 : 1 - curve.value(t / 1000);
  return {
    durationMs,
    easing: linearEasing(durationMs, t => 1 - remaining(t)),
    remaining,
  };
}

function releaseGlideFor(area: Element): GlideProgress | undefined {
  for (let at: Element | null = area; at != null; at = at.parentElement) {
    const progress = releaseGlides.get(at);
    if (progress != null) {
      return progress;
    }
  }
  return undefined;
}

/** The motion a change in `area` plays now. */
function layoutMotion(area: Element): LayoutMotion {
  if (
    matches(area, '(prefers-reduced-motion: reduce)') ||
    themeReducesMotion(area)
  ) {
    if (!matches(area, '(pointer: coarse)')) {
      return {kind: 'instant'};
    }
    const [x1, y1, x2, y2] = reducedMotionCrossFade.curve;
    return {
      kind: 'fade',
      durationMs: Math.min(
        CROSS_FADE_CAP_MS,
        reducedMotionCrossFade.durationMs,
      ),
      easing: `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`,
    };
  }
  const progress = releaseGlideFor(area) ?? glideProgress(area);
  return progress == null ? {kind: 'instant'} : {kind: 'glide', progress};
}

/** Linear keyframes over `durationMs`, one per frame, from `frame(t ms)`. */
function sampleOver(
  durationMs: number,
  frame: (t: number) => Keyframe,
): Keyframe[] {
  const count = sampleCount(durationMs);
  const keyframes: Keyframe[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i / (count - 1);
    keyframes.push({...frame(offset * durationMs), offset});
  }
  return keyframes;
}

/** Linear keyframes sampled from the move curve, one per frame. */
function sampleKeyframes(
  progress: GlideProgress,
  frame: (remaining: number) => Keyframe,
): Keyframe[] {
  return sampleOver(progress.durationMs, t => frame(progress.remaining(t)));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

/** The glide each element reports now, so that only its end clears it. */
const presentedGlides = sharedWeakMap<Element, object>(
  'motion/animated-layout/presented-glides',
  1,
);

/** A glide's report in the presented hit-test registry. */
interface GlideReport {
  readonly element: Element;
  /** Removes the report. A second call does nothing. */
  readonly remove: () => void;
}

const glideReports = sharedState(
  'motion/animated-layout/glide-reports',
  1,
  () => new Set<GlideReport>(),
);

/** The reports of ended glides, removed together in a later task. */
const endedReports = sharedState(
  'motion/animated-layout/ended-reports',
  1,
  (): GlideReport[] => [],
);

/**
 * Removes the reports of ended glides with one notice to the registry's
 * watchers. A glide in a closed window or out of its document never ends, so
 * its report goes here too.
 */
function removeEndedReports(): void {
  if (endedReports.length === 0) {
    return;
  }
  batchPresented(() => {
    for (const report of endedReports.splice(0)) {
      report.remove();
    }
    for (const report of [...glideReports]) {
      const {element} = report;
      if (!element.isConnected || element.ownerDocument.defaultView == null) {
        report.remove();
      }
    }
  });
}

/** Each keyframe's `translate` in px at its offset, or null if one has none. */
function translatesOf(
  keyframes: Keyframe[],
): {at: number; x: number; y: number}[] | null {
  const points: {at: number; x: number; y: number}[] = [];
  for (const [index, frame] of keyframes.entries()) {
    const match = /^(-?[\d.e+-]+)px (-?[\d.e+-]+)px$/.exec(
      String(frame.translate ?? ''),
    );
    if (match == null) {
      return null;
    }
    points.push({
      at: frame.offset ?? index / Math.max(1, keyframes.length - 1),
      x: Number(match[1]),
      y: Number(match[2]),
    });
  }
  return points.length > 0 ? points : null;
}

/** How near its end, px or percent, an animated value counts as there. */
const SETTLED_PX = 0.5;

/** How near its end an animated value with no unit, an opacity, counts. */
const SETTLED_RATIO = 0.005;

/** Keyframe members that time a keyframe rather than style it. */
const KEYFRAME_TIMING = new Set([
  'offset',
  'computedOffset',
  'easing',
  'composite',
]);

type KeyframeValue = string | number | null | undefined;

/** Whether a CSS value is within the settle tolerance of `end`. */
function isNearEnd(value: KeyframeValue, end: KeyframeValue): boolean {
  const numbers = (text: KeyframeValue) => [
    ...String(text ?? '').matchAll(/(-?\d*\.?\d+(?:e[+-]?\d+)?)([a-z%]*)/gi),
  ];
  const ats = numbers(value);
  const ends = numbers(end);
  return (
    ats.length === ends.length &&
    ats.every(([, at, unit], index) => {
      const tolerance = ['px', '%'].includes(unit.toLowerCase())
        ? SETTLED_PX
        : SETTLED_RATIO;
      return Math.abs(Number(at) - Number(ends[index][1])) <= tolerance;
    })
  );
}

/**
 * The offset from which linear `keyframes` stay near their last one, or null
 * when only the last one is.
 */
function settledOffset(keyframes: ReadonlyArray<Keyframe>): number | null {
  const last = keyframes[keyframes.length - 1];
  if (last == null) {
    return null;
  }
  const styles = Object.keys(last).filter(key => !KEYFRAME_TIMING.has(key));
  let from: number | null = null;
  for (let index = keyframes.length - 2; index >= 0; index -= 1) {
    const frame = keyframes[index];
    if (!styles.every(key => isNearEnd(frame[key], last[key]))) {
      break;
    }
    from = frame.offset ?? index / (keyframes.length - 1);
  }
  return from;
}

/**
 * When an animation's sampled linear frames come within reach of their end,
 * ms, or null. An eased two-keyframe fade, the Reduce Motion one, has none:
 * WebKit draws its end values at its end.
 */
function settleTime(
  keyframes: ReadonlyArray<Keyframe>,
  timing: KeyframeAnimationOptions,
): number | null {
  const duration = Number(timing.duration);
  const fraction =
    (timing.easing ?? 'linear') === 'linear' ? settledOffset(keyframes) : null;
  return fraction == null || !(duration > 0)
    ? null
    : (timing.delay ?? 0) + fraction * duration;
}

interface Settling {
  readonly element: Element;
  /** Reads one frame; true once it needs no more frames. */
  readonly frame: () => boolean;
}

/** Each window's motions that have not settled yet, read once a frame. */
const settling = sharedWeakMap<Window, Set<Settling>>(
  'motion/animated-layout/settling',
  1,
);

/**
 * Reads `entry` in each frame until it is done or its element leaves its
 * document. One frame loop per window runs while any motion waits. Returns
 * the stop.
 */
function watchSettle(view: Window, entry: Settling): () => void {
  if (typeof view.requestAnimationFrame !== 'function') {
    return () => {};
  }
  let waiting = settling.get(view);
  if (waiting == null) {
    const entries = new Set<Settling>();
    waiting = entries;
    settling.set(view, entries);
    const frame = () => {
      for (const next of entries) {
        if (!next.element.isConnected || next.frame()) {
          entries.delete(next);
        }
      }
      if (entries.size === 0) {
        settling.delete(view);
        return;
      }
      view.requestAnimationFrame(frame);
    };
    view.requestAnimationFrame(frame);
  }
  const entries = waiting;
  entries.add(entry);
  return () => {
    entries.delete(entry);
  };
}

/** Each running animation's retime, for a ride that replaces its frames. */
const settleRetimes = sharedWeakMap<
  Animation,
  (keyframes: ReadonlyArray<Keyframe>, durationMs: number) => void
>('motion/animated-layout/settle-retimes', 1);

/**
 * WebKit can draw a compositor animation's last frame with the values it last
 * resolved for the element (presentation.ts). Every frame of a long task over
 * its end can show them too. It resolved them at the start or at a later
 * style write. One resolve once the animation is drawn near its end makes that
 * frame its end. `onResolve` hears it, for a reported glide's hit test.
 * Review condition: re-measure on each WebKit release, and remove these
 * resolves once WebKit draws an ended compositor animation at its final
 * values.
 */
function settleAnimation(
  element: Element,
  animation: Animation,
  keyframes: ReadonlyArray<Keyframe>,
  options: KeyframeAnimationOptions,
  onResolve?: () => void,
): void {
  const view = element.ownerDocument.defaultView;
  if (view == null || !('style' in element)) {
    return;
  }
  const styled = element as Element & ElementCSSInlineStyle;
  let at = settleTime(keyframes, options);
  let isWritten = false;
  settleRetimes.set(animation, (next, durationMs) => {
    at = settleTime(next, {...options, duration: durationMs});
  });
  const stop = watchSettle(view, {
    element,
    frame: () => {
      if (at == null) {
        return true;
      }
      // The engine's own time when it has one; otherwise the clock against
      // the settle's moment, which a subtraction would round short of.
      const isSettled =
        animation.currentTime != null
          ? Number(animation.currentTime) >= at
          : animation.startTime != null &&
            view.performance.now() >= Number(animation.startTime) + at;
      if (!isSettled) {
        return false;
      }
      writePresentedResolve(styled);
      isWritten = true;
      onResolve?.();
      return true;
    },
  });
  // A reported glide's report clears its write; any other clears at its end.
  const end = () => {
    stop();
    settleRetimes.delete(animation);
    if (isWritten && onResolve == null) {
      clearPresentedResolve(styled);
    }
  };
  animation.addEventListener?.('finish', end);
  animation.addEventListener?.('cancel', end);
}

/** Retimes `animation`'s settle after a ride replaced its frames. */
function retimeSettle(
  animation: Animation,
  keyframes: ReadonlyArray<Keyframe>,
  durationMs: number,
): void {
  settleRetimes.get(animation)?.(keyframes, durationMs);
}

/** Each indicator's settle, stopped when the next change retimes it. */
const transitionSettles = sharedWeakMap<Element, () => void>(
  'motion/animated-layout/transition-settles',
  1,
);

/**
 * An indicator's CSS transition runs on the compositor too, so it resolves
 * once as it settles. Its time is read from the page's clock from now, when
 * the change starts it: reading the transition itself would flush style.
 */
function settleTransition(
  element: HTMLElement | SVGElement,
  progress: GlideProgress,
): void {
  transitionSettles.get(element)?.();
  transitionSettles.delete(element);
  const view = element.ownerDocument.defaultView;
  const {durationMs} = progress;
  // The first sample from which its curve stays near its end.
  const count = sampleCount(durationMs);
  let settled: number | null = null;
  for (let index = count - 2; index >= 0; index -= 1) {
    const at = (index / (count - 1)) * durationMs;
    if (Math.abs(progress.remaining(at)) > SETTLED_RATIO) {
      break;
    }
    settled = at;
  }
  if (view == null || settled == null || !(durationMs > 0)) {
    return;
  }
  // Its moments on the clock, so a frame that lands on one counts: a
  // subtraction from the frame's time can round short of it.
  const start = view.performance.now();
  const settleAt = start + settled;
  const endAt = start + durationMs;
  let isWritten = false;
  const stop = watchSettle(view, {
    element,
    frame: () => {
      const now = view.performance.now();
      if (!isWritten && now >= settleAt) {
        writePresentedResolve(element);
        isWritten = true;
      }
      if (now < endAt) {
        return false;
      }
      clear();
      return true;
    },
  });
  const clear = () => {
    transitionSettles.delete(element);
    if (isWritten) {
      clearPresentedResolve(element);
      isWritten = false;
    }
  };
  transitionSettles.set(element, () => {
    stop();
    clear();
  });
}

/**
 * Reports `element` to the presented hit-test registry while its `translate`
 * glide runs. iOS WebKit hit-tests the element where the glide started. So
 * the gesture host resolves it at touch-down and lands the touch on what is
 * drawn. `scale` is its ancestors' scale. An inert element, such as a swap's
 * copy or a closing element, takes no touch, so it is not reported.
 */
function presentGlide(
  element: Element,
  animation: Animation,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  scale: {readonly x: number; readonly y: number},
): (() => void) | undefined {
  const view = element.ownerDocument.defaultView;
  const durationMs = Number(options.duration);
  const points =
    (options.easing ?? 'linear') === 'linear' && options.delay == null
      ? translatesOf(keyframes)
      : null;
  if (
    view == null ||
    points == null ||
    !(durationMs > 0) ||
    !('style' in element) ||
    element.closest('[inert]') != null
  ) {
    return undefined;
  }
  const styled = element as Element & ElementCSSInlineStyle;
  const now = () => view.performance.now();
  // The translate drawn at `time`: the keyframes are linear between samples.
  const drawnAt = (time: number) => {
    const start = animation.startTime;
    const progress =
      start == null
        ? 0
        : Math.min(1, Math.max(0, (time - Number(start)) / durationMs));
    let next = 1;
    while (next < points.length - 1 && points[next].at < progress) {
      next += 1;
    }
    const from = points[next - 1] ?? points[0];
    const to = points[next] ?? from;
    const span = to.at - from.at;
    const part =
      span > 0 ? Math.min(1, Math.max(0, (progress - from.at) / span)) : 1;
    return {
      x: (from.x + (to.x - from.x) * part) * scale.x,
      y: (from.y + (to.y - from.y) * part) * scale.y,
    };
  };
  let hitTested = drawnAt(now());
  let isEnded = false;
  let isRemoved = false;
  const glide = {};
  presentedGlides.set(element, glide);
  const unregister = registerPresentedOffset(element, {
    // At its end the engine hit-tests the element at its layout again.
    offset: (time = now()) => {
      if (isEnded) {
        return {x: 0, y: 0};
      }
      const drawn = drawnAt(time);
      return {x: drawn.x - hitTested.x, y: drawn.y - hitTested.y};
    },
    resolve: () => {
      if (!isEnded) {
        writePresentedResolve(styled);
        hitTested = drawnAt(now());
      }
    },
  });
  const report: GlideReport = {
    element,
    remove: () => {
      if (isRemoved) {
        return;
      }
      isRemoved = true;
      glideReports.delete(report);
      unregister();
      if (presentedGlides.get(element) === glide) {
        presentedGlides.delete(element);
        clearPresentedResolve(styled);
      }
    },
  };
  glideReports.add(report);
  const end = () => {
    if (isEnded) {
      return;
    }
    isEnded = true;
    endedReports.push(report);
    // This module's own timer: a closed frame's timer never fires. The glides
    // of one change end in one frame, so the first task removes them all.
    setTimeout(removeEndedReports, 0);
  };
  animation.addEventListener?.('finish', end);
  animation.addEventListener?.('cancel', end);
  // Its settle's resolve moves where the engine hit-tests it, as a touch's.
  return () => {
    if (!isEnded && presentedGlides.get(element) === glide) {
      hitTested = drawnAt(now());
    }
  };
}

/**
 * Play `keyframes` on `element`. Every option here (linear easing over sampled
 * keyframes, replace composition) is one any Web Animations engine takes, so
 * a failure means no Web Animations at all: the change then lands at once.
 * `scale` is the element's ancestors' scale, for a `translate` glide.
 */
function safeAnimate(
  element: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  change?: ChangeStart,
  scale: {readonly x: number; readonly y: number} = {x: 1, y: 1},
): Animation | null {
  if (typeof (element as HTMLElement).animate !== 'function') {
    return null;
  }
  let animation: Animation;
  try {
    animation = (element as HTMLElement).animate(keyframes, options);
  } catch {
    return null;
  }
  ours.add(animation);
  // The animation starts on the document timeline's current time, not on the
  // next frame. So a retargeted glide keeps moving through the frame it is
  // replaced in. After a block since that frame, Chromium's timeline still
  // reads the frame before the block. A motion started there would skip into
  // its curve, or past all of it. So it starts at the moment of the change
  // instead, and the block delays the motion (startFor). Every animation of
  // one change, in one document, shares that start.
  const doc = element.ownerDocument;
  const now = doc.timeline?.currentTime;
  if (now != null) {
    // The start of the change it is part of, captured when that change made
    // its first animation (changeStartOf); otherwise the document's.
    const start =
      change != null && change.frame === Number(now)
        ? change
        : startFor(doc, Number(now));
    start.last = clockOf(doc);
    animation.startTime = start.at;
    if (start.at !== Number(now)) {
      // Started after the frame time the timeline still reads: until the
      // timeline gets there it shows its first keyframe, not the element at
      // rest.
      const fill = animation.effect?.getTiming().fill;
      animation.effect?.updateTiming({
        fill: fill === 'forwards' || fill === 'both' ? 'both' : 'backwards',
      });
    }
  }
  const onResolve =
    options.pseudoElement == null
      ? presentGlide(element, animation, keyframes, options, scale)
      : undefined;
  settleAnimation(element, animation, keyframes, options, onResolve);
  return animation;
}

/**
 * The start a change's animations share. It is the timeline's frame time,
 * unless a block ran more than LATE_START_MS past that frame before the first
 * of them was made. Then they start at the moment the first of them is made.
 * The frame time is from before the block, so a motion started on it would
 * skip into its curve, or past all of it. Chromium holds the timeline at the
 * frame before a long task once anything in the task reads it.
 */
interface ChangeStart {
  /** The frame time the timeline read. */
  readonly frame: number;
  /** When the change's animations start. */
  readonly at: number;
  /** When the last of them was made, on the document's clock. */
  last: number;
}

/**
 * Each document's change start: an iframe or a Picture-in-Picture window
 * keeps its own clock, with its own origin and frames.
 */
const changeStarts = sharedWeakMap<Document, ChangeStart>(
  'motion/animated-layout/change-starts',
  1,
);

/** The clock of the document whose timeline a start is read on. */
function clockOf(doc: Document): number {
  return (doc.defaultView?.performance ?? performance).now();
}

/**
 * The start the current change's animations share. A change keeps one start
 * from its first animation through the flush of its glides and the parts that
 * ride them. That holds however long the work between them runs, such as the
 * rest of a commit or a slow swap. The start holds while the timeline reads
 * the same frame: through the task that made it and the microtasks after it.
 * A change that begins after a block takes a start of its own (beginChange).
 */
function startFor(doc: Document, frame: number): ChangeStart {
  const now = clockOf(doc);
  const held = changeStarts.get(doc);
  if (held != null && held.frame === frame) {
    held.last = now;
    return held;
  }
  const start: ChangeStart = {
    frame,
    at: now - frame <= LATE_START_MS ? frame : now,
    last: now,
  };
  changeStarts.set(doc, start);
  // Let go in a later task: every microtask of this one, where the glides
  // flush and the parts riding them play, has run by then.
  const view = doc.defaultView;
  (view?.setTimeout ?? setTimeout)(() => {
    if (changeStarts.get(doc) === start) {
      changeStarts.delete(doc);
    }
  }, 0);
  return start;
}

/**
 * A change begins as its "before" is read. After a block since the last
 * animation of the change before it, it takes a start of its own. So a change
 * made after a block that follows an earlier layout motion still plays.
 * Changes made together, with no block between them, share one start.
 */
function beginChange(doc: Document): void {
  const held = changeStarts.get(doc);
  if (held != null && clockOf(doc) - held.last > LATE_START_MS) {
    changeStarts.delete(doc);
  }
}

/**
 * When the animations of the layout change being made start. Code that
 * follows the change on its own clock reads it, such as a rail's width or a
 * swap's fade. It is the document timeline's current time. After a block
 * since that frame, it is the moment the change made its first animation.
 * Until the timeline reaches it, the change has not started.
 */
export function layoutStartFor(document: Document): number {
  const now = document.timeline?.currentTime;
  return now == null ? 0 : startFor(document, Number(now)).at;
}

/**
 * Where `element` shows at the timeline's time `at`: its layout box, moved by
 * its glide's offset then. After a block, WebKit evaluates a running
 * translate on the live clock. The timeline still reads the frame before the
 * block, as every glide here does, so the evaluated box would sit ahead.
 * Glides write px; a translate in percent is not ours, so the box stays.
 */
function shownBoxAt(element: Element, at: number): DOMRect {
  const box = element.getBoundingClientRect();
  const glide = glides.get(element);
  const startTime = glide?.animation.startTime;
  if (glide == null || startTime == null) {
    return box;
  }
  const translate =
    element.ownerDocument.defaultView?.getComputedStyle(element).translate ??
    '';
  if (translate.includes('%')) {
    return box;
  }
  const [appliedX = 0, appliedY = 0] = numbersIn(translate);
  const offset = glide.offsetAt(Math.max(0, at - Number(startTime)));
  return new DOMRect(
    box.x + (offset.x - appliedX) * glide.scale.x,
    box.y + (offset.y - appliedY) * glide.scale.y,
    box.width,
    box.height,
  );
}

/** Every animation this module started, so it can tell the app's apart. */
const ours = sharedWeakSet<Animation>('motion/animated-layout/ours', 1);

const TRANSFORM_PROPERTIES = ['transform', 'translate', 'rotate', 'scale'];

/** The numbers in a CSS value, units dropped. */
function numbersIn(value: string): number[] {
  return (value.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? []).map(
    Number,
  );
}

/**
 * Whether a transform value leaves the element where it is: nothing at all
 * (a swipe's `translate3d(0, 0, 0)` at rest, a button's `scale(1)`, computed
 * as `matrix(1, 0, 0, 1, 0, 0)`), or a scale in place (a pressed button's
 * `scale(0.98)`). A glide's `translate` composes with either; a translation,
 * rotation or skew of its own is the app moving the element.
 */
function staysInPlace(property: string, value: string): boolean {
  if (value === 'none') {
    // No transform at all (a keyframe a press's own transition starts from).
    return true;
  }
  if (property === 'scale') {
    return true;
  }
  if (value.includes('var(')) {
    // An unresolved custom property in an app's own keyframes: its value is
    // unknown here, so the app moves the element.
    return false;
  }
  if (property === 'translate') {
    return numbersIn(value).every(n => n === 0);
  }
  if (property === 'rotate') {
    // An angle, after an optional axis: only the angle matters.
    const numbers = numbersIn(value);
    return numbers.length > 0 && numbers[numbers.length - 1] === 0;
  }
  // A list of transform functions, as computed (`matrix()`, `matrix3d()`)
  // or as written.
  const functions = [...value.matchAll(/([a-z0-9]+)\(([^)]*)\)/gi)];
  return (
    functions.length > 0 &&
    functions.every(([, name, args]) => {
      const numbers = numbersIn(args);
      const fn = name.toLowerCase();
      if (fn === 'matrix') {
        // a b c d e f: no skew, rotation or translation.
        return (
          numbers.length === 6 &&
          [1, 2, 4, 5].every(index => numbers[index] === 0)
        );
      }
      if (fn === 'matrix3d') {
        // Only the diagonal: a scale, nothing else.
        return (
          numbers.length === 16 &&
          numbers.every((n, index) => index % 5 === 0 || n === 0)
        );
      }
      if (fn === 'rotate3d') {
        return numbers[3] === 0;
      }
      if (fn.startsWith('scale')) {
        return true;
      }
      if (
        fn.startsWith('translate') ||
        fn.startsWith('rotate') ||
        fn.startsWith('skew')
      ) {
        return numbers.every(n => n === 0);
      }
      return false;
    })
  );
}

/**
 * Whether the app moves `element` itself: its own `transform`, `translate`
 * or `rotate`, or a running animation of one this module did not start. A
 * value that leaves it in place (nothing, or a scale) is not a move.
 */
function movedByApp(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (
    style != null &&
    TRANSFORM_PROPERTIES.some(property => {
      const value = style.getPropertyValue(property);
      return value !== '' && value !== 'none' && !staysInPlace(property, value);
    })
  ) {
    return true;
  }
  if (typeof element.getAnimations !== 'function') {
    return false;
  }
  return element.getAnimations().some(animation => {
    if (ours.has(animation)) {
      return false;
    }
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect)) {
      return false;
    }
    return effect
      .getKeyframes()
      .some(frame =>
        TRANSFORM_PROPERTIES.some(
          property =>
            property in frame &&
            !staysInPlace(property, String(frame[property])),
        ),
      );
  });
}

/** An offset in the element's own px, as a function of ms into a glide. */
type OffsetCurve = (t: number) => {readonly x: number; readonly y: number};

const AT_REST: OffsetCurve = () => ({x: 0, y: 0});

/**
 * `curve` as the browser draws it from `sampleOver`'s keyframes: a straight
 * line between each two. A new glide then starts where the old one shows.
 */
function drawnCurve(durationMs: number, curve: OffsetCurve): OffsetCurve {
  const count = sampleCount(durationMs);
  const points = Array.from({length: count}, (_, i) =>
    curve((i / (count - 1)) * durationMs),
  );
  return t => {
    const at = Math.min(Math.max(t / durationMs, 0), 1) * (count - 1);
    const i = Math.min(Math.floor(at), count - 2);
    const f = at - i;
    const a = points[i];
    const b = points[i + 1];
    return {x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f};
  };
}

/** A glide an element is playing, so a new change can retarget it. */
interface Glide {
  readonly animation: Animation;
  readonly offsetAt: OffsetCurve;
  readonly durationMs: number;
  /**
   * The offset where the element showed when its old place was read. After a
   * block the glide starts further on, where the compositor has it.
   */
  readonly shownBefore: {readonly x: number; readonly y: number};
  /** Its ancestors' scale: page px per px of its own offset. */
  readonly scale: {readonly x: number; readonly y: number};
}

const glides = sharedWeakMap<Element, Glide>(
  'motion/animated-layout/glides',
  1,
);

/**
 * The glide `element` is playing now, if any. For an adopter that draws
 * something with each moving element (a table row's divider): it finds what
 * moves without reading the DOM.
 */
export function glideOf(element: Element): Animation | null {
  return glides.get(element)?.animation ?? null;
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

// A registered key, so a swizzled copy of this module reads a package handle.
const AREA = sharedKey('animated-layout/area', 1);

/**
 * The opaque handle `useAnimatedLayout` returns. A component that receives it
 * reports its size changes to the handle's container, the area the glide
 * stays inside.
 */
export interface AnimatedLayout {
  /**
   * A brand that is never present, so the handle types of the package and a
   * swizzled copy match.
   */
  readonly '@astryxdesign/core/animated-layout/v1'?: never;
}

/** The container a handle reads, or null for a value that is not a handle. */
function readArea(handle: AnimatedLayout): Element | null {
  const read = (handle as {readonly [AREA]?: unknown})[AREA];
  return typeof read === 'function' ? (read as () => Element | null)() : null;
}

/** A handle over `area` (the container element, read when a change runs). */
export function createAnimatedLayout(
  area: () => Element | null,
): AnimatedLayout {
  // Not enumerable and frozen: the handle shows no fields to a caller.
  return Object.freeze(Object.defineProperty({}, AREA, {value: area}));
}

function areaOf(handle: AnimatedLayout, element: Element): Element | null {
  const area = readArea(handle);
  return area != null && area !== element && area.contains(element)
    ? area
    : null;
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/**
 * Whether `element` takes part: in flow, rendered, not in the top layer.
 * `display: contents` is handled by the caller.
 */
function takesPart(element: Element, style: CSSStyleDeclaration): boolean {
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.position === 'absolute' ||
    style.position === 'fixed'
  ) {
    return false;
  }
  try {
    if (element.matches(':popover-open, :modal')) {
      return false;
    }
  } catch {
    // An engine without these pseudo-classes has no top layer to skip.
  }
  return true;
}

/**
 * The band of the page a change can move content into or out of view: the
 * area's visible part, extended above and below by one viewport or by the
 * size of every element changing in the frame, whichever is larger (a
 * collapse pulls content up by at most its size, and changes in one frame
 * add up). Content outside it before the change stays outside it, so the
 * walk stops there.
 */
interface Band {
  /** Its top edge, in client px. */
  readonly start: number;
  /** Its bottom edge, in client px. */
  readonly end: number;
}

function bandFor(visible: DOMRect, reach: number): Band {
  return {start: visible.top - reach, end: visible.bottom + reach};
}

/**
 * What one frame's walks read, kept so a level two changes share, or a walk
 * repeated when the band grows, reads each element once.
 */
interface WalkCache {
  readonly rects: Map<Element, DOMRect>;
  /** Whether the element takes part, or `contents` for a boxless element. */
  readonly parts: Map<Element, boolean | 'contents'>;
}

function partOf(element: Element, cache: WalkCache): boolean | 'contents' {
  let part = cache.parts.get(element);
  if (part === undefined) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    part =
      style == null
        ? false
        : style.display === 'contents'
          ? 'contents'
          : takesPart(element, style);
    cache.parts.set(element, part);
  }
  return part;
}

/**
 * Whether a container lays its children out across the block direction, so
 * DOM order does not run down the page: multi-column, a wrapping column flex
 * box, or a grid that flows by column. The band says nothing about where its
 * later children sit, so a walk there runs through the level.
 */
function flowsAcross(container: Element | null): boolean {
  if (container == null) {
    return false;
  }
  const style =
    container.ownerDocument.defaultView?.getComputedStyle(container);
  if (style == null) {
    return false;
  }
  const count = style.getPropertyValue('column-count');
  const width = style.getPropertyValue('column-width');
  return (
    (count !== '' && count !== 'auto') ||
    (width !== '' && width !== 'auto') ||
    (style.display.includes('flex') &&
      style.flexDirection.startsWith('column') &&
      style.flexWrap.startsWith('wrap')) ||
    (style.display.includes('grid') &&
      style.getPropertyValue('grid-auto-flow').startsWith('column'))
  );
}

/**
 * The box a sticky element sticks to: its nearest scrolling ancestor's, or
 * the viewport.
 */
function scrollportOf(element: Element): {start: number; end: number} {
  const view = element.ownerDocument.defaultView;
  for (
    let node = element.parentElement;
    node != null && node !== element.ownerDocument.documentElement;
    node = node.parentElement
  ) {
    const overflow = view?.getComputedStyle(node).overflowY ?? 'visible';
    if (
      node === element.ownerDocument.body &&
      view?.getComputedStyle(element.ownerDocument.documentElement)
        .overflowY === 'visible'
    ) {
      // The body's overflow applies to the viewport while the root's is
      // visible: the body is no scroller of its own.
      continue;
    }
    if (overflow !== 'visible' && overflow !== 'clip') {
      const box = node.getBoundingClientRect();
      return {
        start: box.top + node.clientTop,
        end: box.top + node.clientTop + node.clientHeight,
      };
    }
  }
  return {start: 0, end: view?.innerHeight ?? 0};
}

/**
 * Whether a sticky element is stuck: resting against its scrollport's edge
 * at its inset. A stuck element takes its final place; an unstuck one is in
 * flow.
 */
function isStuck(element: Element, cache: WalkCache): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.position !== 'sticky') {
    return false;
  }
  const rect = rectOf(element, cache);
  const edge = scrollportOf(element);
  const top = Number.parseFloat(style.top);
  const bottom = Number.parseFloat(style.bottom);
  return (
    (Number.isFinite(top) && Math.abs(rect.top - (edge.start + top)) < 1) ||
    (Number.isFinite(bottom) && Math.abs(rect.bottom - (edge.end - bottom)) < 1)
  );
}

/**
 * `rect`, a box read before a change or after it (in the flush, once the
 * glides the change retargets have stopped), with every running glide that
 * carries the element put back on its glide's own clock: its own and those of
 * its ancestors inside `area`. A glide the change retargets is read on its
 * clock before the change and is gone after it; one the change leaves running
 * (a card inside an absolutely positioned panel, which the change takes no
 * ancestors from) is read on the same clock in both places, so it cancels out
 * of the move. A box read samples a running `translate`
 * wherever the engine evaluates it, and WebKit evaluates it at the moment of
 * the read, while a glide's offset, and the glide a change retargets it into,
 * run on the timeline's frame time: from the box alone, a change made `n` ms
 * into a frame started the new glide `n` ms of motion ahead of the one drawn
 * (up to about 3 px on a slow frame), and a row inside a gliding card took up
 * the card's difference. The box is read between two readings of every
 * carrier's applied `translate` that agree: WebKit samples a running
 * animation at the moment of each read, in steps of about a millisecond, so
 * a box read between two equal readings is of that same sample, while the
 * walk's earlier box read, or one read across a step, is of another. Taken
 * out of that
 * box (each scaled by its node's ancestors, as its glide is), the `translate`s
 * leave the element's place with no glide, and each glide's offset at its
 * current time goes back in. A glide replaces any `translate` of the app's
 * own while it runs, so each applied value is the glide's alone. Where the
 * engine reports no applied `translate` at all (an environment without
 * individual transform properties), the box is taken as it is.
 */
/**
 * How many times `onGlideClock` reads a box and the applied translates around
 * it to take all of them from one sample: it bounds the reads for one
 * consistent snapshot (WebKit's samples step about once a millisecond, and a
 * second reading lands inside one step), not a retry around a result.
 */
const SAMPLE_READS = 3;

function onGlideClock(element: Element, rect: DOMRect, area: Element): DOMRect {
  const carriers: {node: Element; glide: Glide; time: number}[] = [];
  for (
    let node: Element | null = element;
    node != null && node !== area;
    node = node.parentElement
  ) {
    const glide = glides.get(node);
    const time = Number(glide?.animation.currentTime);
    if (glide != null && Number.isFinite(time)) {
      carriers.push({node, glide, time});
    }
  }
  if (carriers.length === 0) {
    return rect;
  }
  const view = element.ownerDocument.defaultView;
  const appliedNow = () =>
    carriers.map(({node}) => view?.getComputedStyle(node).translate);
  let applied = appliedNow();
  if (applied.some(translate => translate == null || translate === '')) {
    return rect;
  }
  let box = element.getBoundingClientRect();
  for (let read = 0; read < SAMPLE_READS; read++) {
    const again = appliedNow();
    if (again.every((translate, index) => translate === applied[index])) {
      break;
    }
    applied = again;
    box = element.getBoundingClientRect();
  }
  let dx = 0;
  let dy = 0;
  carriers.forEach(({node, glide, time}, index) => {
    const [appliedX = 0, appliedY = 0] = numbersIn(applied[index] as string);
    const offset = glide.offsetAt(
      Math.min(Math.max(0, time), glide.durationMs),
    );
    const scale = scaleOf(
      node,
      node === element ? box : node.getBoundingClientRect(),
      ownScaleOf(node),
    );
    dx += (offset.x - appliedX) * scale.x;
    dy += (offset.y - appliedY) * scale.y;
  });
  return new DOMRect(box.x + dx, box.y + dy, box.width, box.height);
}

function rectOf(element: Element, cache: WalkCache): DOMRect {
  let rect = cache.rects.get(element);
  if (rect === undefined) {
    rect = element.getBoundingClientRect();
    cache.rects.set(element, rect);
  }
  return rect;
}

/**
 * The elements a change can move, each with its rectangle before the change:
 * the changed element's ancestors up to the area (a centered column moves
 * the card around the change), and at each of their levels the siblings
 * after and before (a centered, end-aligned or space-between row, or
 * `order`, moves those too). A `display: contents` element has no box: its
 * children stand in its place, walked in the same direction. At each level
 * the walk stops at the first sibling outside `band`, so its cost grows with
 * depth plus the siblings near the visible part, never with the length of a
 * list; where the area opts out of scroll anchoring (`walksToBand`), the walk
 * after a change above the band goes on to the band, a cost that grows with
 * that distance. Inside a positioned, stuck sticky or top-layer ancestor only the
 * content after the change is taken.
 */
function collectCandidates(
  changed: Element,
  area: Element,
  band: Band,
  cache: WalkCache,
  walksToBand: boolean,
  ancestors: Set<Element>,
  befores: Set<Element>,
): Map<Element, DOMRect> {
  const out = new Map<Element, DOMRect>();
  /** Takes `element`; returns false once it lies outside the band. */
  /** The current level runs through its siblings, ignoring the band. */
  let runsThrough = false;
  const take = (element: Element, isAfter: boolean): boolean => {
    const part = partOf(element, cache);
    if (part === 'contents') {
      for (
        let child = isAfter
          ? element.firstElementChild
          : element.lastElementChild;
        child != null;
        child = isAfter
          ? child.nextElementSibling
          : child.previousElementSibling
      ) {
        if (!take(child, isAfter)) {
          return false;
        }
      }
      return true;
    }
    if (!part) {
      return true;
    }
    const rect = rectOf(element, cache);
    if (runsThrough) {
      out.set(element, rect);
      return true;
    }
    if (rect.top > band.end) {
      return false;
    }
    if (rect.bottom < band.start) {
      // Above the band. Where the scroller opts out of scroll anchoring, the
      // content after a change above the band shifts the rows in view, so
      // the walk after it goes on to the band; with anchoring, it stops.
      return isAfter && walksToBand;
    }
    out.set(element, rect);
    if (!isAfter) {
      befores.add(element);
    }
    return true;
  };
  // The change's chain up to the area, and from where it is inside a
  // positioned, stuck sticky or top-layer ancestor: that ancestor takes its final
  // place, so inside it only the content after the change moves; the
  // ancestors and the siblings before the change stay with it.
  const chain: Element[] = [];
  for (
    let node: Element | null = changed;
    node != null && node !== area;
    node = node.parentElement
  ) {
    chain.push(node);
  }
  // The levels below this index are inside a positioned ancestor.
  let positionedFrom = 0;
  for (let index = chain.length - 1; index > 0; index -= 1) {
    if (partOf(chain[index], cache) === false || isStuck(chain[index], cache)) {
      positionedFrom = index;
      break;
    }
  }
  for (const [level, node] of chain.entries()) {
    runsThrough = flowsAcross(node.parentElement);
    if (
      node !== changed &&
      level > positionedFrom &&
      partOf(node, cache) === true
    ) {
      // An ancestor of the change in flow: where its layout moves it (a
      // centered column), it glides, and what is inside moves only by its own
      // change. A positioned, stuck sticky or top-layer ancestor, and every
      // ancestor inside it, takes its final place.
      out.set(node, rectOf(node, cache));
      ancestors.add(node);
    }
    for (
      let sibling = node.nextElementSibling;
      sibling != null && take(sibling, true);
      sibling = sibling.nextElementSibling
    ) {
      // The siblings after it, until one lies past the band.
    }
    if (level < positionedFrom) {
      continue;
    }
    for (
      let sibling = node.previousElementSibling;
      sibling != null && take(sibling, false);
      sibling = sibling.previousElementSibling
    ) {
      // The siblings before it, until one lies before the band.
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Batches: every change in one area in one frame moves together
// ---------------------------------------------------------------------------

interface Batch {
  readonly area: Element;
  readonly changed: Set<Element>;
  readonly before: Map<Element, DOMRect>;
  /** What each changed element's walk found, so a dropped change moves none. */
  readonly candidates: Map<Element, Element[]>;
  /** The changed elements' sizes before the change, added up. */
  changedSize: number;
  /** How far past the visible part the walks reach (0 before the first). */
  reach: number;
  /** The area's visible part, read once per frame. */
  visible: DOMRect | null;
  /** Whether the area opts out of scroll anchoring, read once per frame. */
  walksToBand: boolean | null;
  /** The change's ancestors among the candidates. */
  readonly ancestors: Set<Element>;
  /** The siblings before the change among the candidates. */
  readonly befores: Set<Element>;
  /**
   * Where the area's content sat before the change, read once per frame: the
   * area's place in view less its scroll offset, so a scroll of the area, an
   * outer scroller or the page shows up as a change of it.
   */
  originBefore: {readonly x: number; readonly y: number} | null;
  readonly cache: WalkCache;
  scheduled: boolean;
  /** Called after every reading and before any glide starts. */
  readonly beforeMove: ((candidates: ReadonlyArray<Element>) => void)[];
  /**
   * The start the change's animations share, taken by its first one: its
   * entrance, or its glides at the flush. A change begun after a block,
   * before this one flushes, takes its own and leaves this one's.
   */
  start: ChangeStart | null;
}

const batches = sharedMap<Element, Batch>('motion/animated-layout/batches', 1);

function batchFor(area: Element): Batch {
  let batch = batches.get(area);
  if (batch == null) {
    const created: Batch = {
      area,
      changed: new Set(),
      before: new Map(),
      candidates: new Map(),
      changedSize: 0,
      reach: 0,
      visible: null,
      walksToBand: null,
      ancestors: new Set(),
      befores: new Set(),
      originBefore: null,
      cache: {rects: new Map(), parts: new Map()},
      scheduled: false,
      beforeMove: [],
      start: null,
    };
    batches.set(area, created);
    // A measurement no commit claims by the next frame (a controlled owner
    // refused the change) is dropped, so it never moves rows later and holds
    // no elements.
    const view = area.ownerDocument.defaultView;
    const drop = () => {
      if (batches.get(area) === created && !created.scheduled) {
        batches.delete(area);
      }
    };
    if (typeof view?.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(drop);
    } else {
      setTimeout(drop, 16);
    }
    batch = created;
  }
  return batch;
}

/**
 * The start `batch`'s change shares: taken by its first animation, from the
 * document's (startFor), and kept with the batch through its flush.
 */
function changeStartOf(batch: Batch): ChangeStart | undefined {
  const doc = batch.area.ownerDocument;
  const now = doc.timeline?.currentTime;
  if (now == null) {
    return undefined;
  }
  if (batch.start == null || batch.start.frame !== Number(now)) {
    batch.start = startFor(doc, Number(now));
  }
  return batch.start;
}

/**
 * The start of the change being made in `area`, captured now for animations
 * made later in the task, such as the parts riding a glide. It is its batch's
 * when one is open there, otherwise the document's.
 */
function changeStartIn(
  area: Element | null | undefined,
  doc: Document,
): ChangeStart | undefined {
  const batch = area == null ? undefined : batches.get(area);
  if (batch != null) {
    return changeStartOf(batch);
  }
  const now = doc.timeline?.currentTime;
  return now == null ? undefined : startFor(doc, Number(now));
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return (
    a.width > 0 &&
    a.height > 0 &&
    a.right > b.left &&
    a.left < b.right &&
    a.bottom > b.top &&
    a.top < b.bottom
  );
}

/** The part of the area the person can see: its box within the viewport. */
/** Where the area's scrolled content starts, in client px. */
function originOf(area: Element): {x: number; y: number} {
  const box = area.getBoundingClientRect();
  return {x: box.left - area.scrollLeft, y: box.top - area.scrollTop};
}

function visibleRect(area: Element): DOMRect {
  const box = area.getBoundingClientRect();
  const view = area.ownerDocument.defaultView;
  const width = view?.innerWidth ?? box.right;
  const height = view?.innerHeight ?? box.bottom;
  const left = Math.max(box.left, 0);
  const top = Math.max(box.top, 0);
  return new DOMRect(
    left,
    top,
    Math.max(0, Math.min(box.right, width) - left),
    Math.max(0, Math.min(box.bottom, height) - top),
  );
}

/** The element's rendered scale against its layout size (a scaled ancestor). */
function scaleOf(
  element: Element,
  rect: DOMRect,
  own: {readonly x: number; readonly y: number} = {x: 1, y: 1},
): {x: number; y: number} {
  const html = element as HTMLElement;
  const x =
    html.offsetWidth > 0 && rect.width > 0
      ? rect.width / html.offsetWidth / own.x
      : 1;
  const y =
    html.offsetHeight > 0 && rect.height > 0
      ? rect.height / html.offsetHeight / own.y
      : 1;
  // Subpixel rounding makes an unscaled element read a hair off 1; only a
  // real scale is corrected.
  return {
    x: Math.abs(x - 1) < 0.01 ? 1 : x || 1,
    y: Math.abs(y - 1) < 0.01 ? 1 : y || 1,
  };
}

/**
 * The scale an element's own `scale` and `transform` give it, on each axis
 * (a follower that keeps one in place, `staysInPlace`). A glide's `translate`
 * does not go through them: the individual transform properties apply
 * `translate` first, in the parent's space.
 */
function ownScaleOf(element: Element): {x: number; y: number} {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style == null) {
    return {x: 1, y: 1};
  }
  let x = 1;
  let y = 1;
  const scale = style.getPropertyValue('scale');
  if (scale !== '' && scale !== 'none') {
    const [sx = 1, sy = sx] = numbersIn(scale);
    // Its size, not its direction: a negative scale flips the element in
    // place, and its measured box stays positive.
    x *= Math.abs(sx);
    y *= Math.abs(sy);
  }
  // The computed transform is a matrix: its first column's length is the
  // scale on x, its second's on y.
  const matrix = /^matrix(3d)?\(([^)]*)\)/.exec(
    style.getPropertyValue('transform'),
  );
  if (matrix != null) {
    const m = numbersIn(matrix[2]);
    const [a = 1, b = 0, c = 0, d = 1] =
      matrix[1] == null ? m : [m[0], m[1], m[4], m[5]];
    x *= Math.hypot(a, b);
    y *= Math.hypot(c, d);
  }
  return {x: x || 1, y: y || 1};
}

function flush(batch: Batch): void {
  batches.delete(batch.area);
  const notify = (candidates: ReadonlyArray<Element>) => {
    for (const callback of batch.beforeMove) {
      callback(candidates);
    }
  };
  // What each change's walk measured before it: an element added by the
  // change has no old place, and one it removed is gone.
  const followers = new Set<Element>();
  for (const changed of batch.changed) {
    for (const element of batch.candidates.get(changed) ?? []) {
      if (element.isConnected) {
        followers.add(element);
      }
    }
  }
  if (followers.size === 0) {
    notify([]);
    return;
  }
  const motion = layoutMotion(batch.area);
  if (motion.kind === 'instant') {
    notify([]);
    return;
  }
  // The change's own start, taken by its entrance when it played one, even
  // when another change has begun since.
  const change = changeStartOf(batch);
  const visible = visibleRect(batch.area);
  // Every running glide stops first and every new place is read before any
  // glide starts, so no reading includes another's new motion.
  const entries: {
    readonly element: Element;
    readonly before: DOMRect;
    readonly carried: OffsetCurve;
    readonly carriedMs: number;
    /** The running glide's offset inside `before`, read on the held frame. */
    readonly held: {readonly x: number; readonly y: number};
    after?: DOMRect;
    rawX?: number;
    rawY?: number;
    isMovedByApp?: boolean;
    scale?: {x: number; y: number};
  }[] = [];
  for (const element of followers) {
    const before = batch.before.get(element);
    if (before == null || (before.width === 0 && before.height === 0)) {
      // Added by the change, or not rendered before it: it has no old place.
      // A changed element an earlier change displaced does have one, and
      // moves with its row while it plays its own entrance or exit.
      continue;
    }
    // An element already gliding keeps that motion and adds the new move: the
    // running glide stops (so its rectangle is its new layout place) and the
    // rest of its curve carries into the one new glide, velocity included,
    // summed with the new move.
    const running = glides.get(element);
    let carried = AT_REST;
    let carriedMs = 0;
    let held = AT_REST(0);
    if (running != null) {
      const time = Number(running.animation.currentTime);
      const elapsed = Number.isFinite(time) ? Math.max(0, time) : 0;
      if (elapsed < running.durationMs) {
        held = running.offsetAt(elapsed);
      }
      // The new glide starts at the change's start. After a block, the
      // compositor kept this glide moving past the held frame until then.
      const {startTime} = running.animation;
      const shownAt =
        change != null && startTime != null
          ? Math.max(elapsed, change.at - Number(startTime))
          : elapsed;
      if (shownAt < running.durationMs) {
        carried = t => running.offsetAt(shownAt + t);
        carriedMs = running.durationMs - shownAt;
      }
      running.animation.cancel();
      glides.delete(element);
    }
    entries.push({element, before, carried, carriedMs, held});
  }
  // Every reading (places, transforms, scales) before any glide starts: a
  // glide started between two readings would make the next one lay the page
  // out again, once per element (on a long page, the whole cost).
  const byElement = new Map<Element, (typeof entries)[number]>();
  // An ancestor of the change, and a sibling before it, move by their layout
  // change alone: when scroll anchoring re-scrolls the area, an outer
  // scroller or the page (a change above the visible part), or the area
  // itself moves as its content grows (a dialog re-centered), their place in
  // view shifts by that while their place in the area stays.
  const origin = originOf(batch.area);
  const scrolledX = origin.x - (batch.originBefore?.x ?? origin.x);
  const scrolledY = origin.y - (batch.originBefore?.y ?? origin.y);
  // Netted only where that makes the move smaller: an element the browser
  // kept in place (scroll anchoring for another change in the same frame)
  // stays where it is.
  const nearer = (raw: number, shift: number) =>
    Math.abs(raw + shift) < Math.abs(raw) ? raw + shift : raw;
  for (const entry of entries) {
    // On the same clocks as the place before the change: only the glides this
    // change does not retarget still run here (a card inside an absolutely
    // positioned panel keeps its glide while the row in it moves), so each
    // reads the same in both places and cancels out of the move.
    entry.after = onGlideClock(
      entry.element,
      entry.element.getBoundingClientRect(),
      batch.area,
    );
    // The move is the inline-start edge's, by the container's direction (it
    // decides where the element sits): in a right-to-left container an
    // element that narrows keeps its left edge and moves its right one.
    const container = entry.element.parentElement ?? entry.element;
    const isRtl =
      container.ownerDocument.defaultView?.getComputedStyle(container)
        .direction === 'rtl';
    const rawX = isRtl
      ? entry.before.right - entry.after.right
      : entry.before.left - entry.after.left;
    const rawY = entry.before.top - entry.after.top;
    // The siblings before the change stay with the ancestors around them.
    const isAncestor =
      batch.ancestors.has(entry.element) || batch.befores.has(entry.element);
    entry.rawX = isAncestor ? nearer(rawX, scrolledX) : rawX;
    entry.rawY = isAncestor ? nearer(rawY, scrolledY) : rawY;
    byElement.set(entry.element, entry);
  }
  for (const entry of entries) {
    const after = entry.after as DOMRect;
    if (intersects(entry.before, visible) || intersects(after, visible)) {
      entry.isMovedByApp = movedByApp(entry.element);
      // Only its ancestors' scale is corrected: its own scale or transform
      // (a press's scale) does not apply to the glide's `translate`.
      entry.scale = scaleOf(entry.element, after, ownScaleOf(entry.element));
    }
  }
  // An adopter's own readings join them here, before any glide starts.
  notify(entries.map(entry => entry.element));
  for (const entry of entries) {
    const {element, before, carried, carriedMs, held} = entry;
    const after = entry.after as DOMRect;
    // Nested changes compose: an element inside another moving element moves
    // only by its own change, whatever order the changes were reported in.
    let dx = entry.rawX ?? 0;
    let dy = entry.rawY ?? 0;
    for (
      let ancestor = element.parentElement;
      ancestor != null && ancestor !== batch.area;
      ancestor = ancestor.parentElement
    ) {
      const moving = byElement.get(ancestor);
      if (moving != null) {
        dx -= moving.rawX ?? 0;
        dy -= moving.rawY ?? 0;
        break;
      }
    }
    if (Math.abs(dx) < MIN_SHIFT_PX && Math.abs(dy) < MIN_SHIFT_PX) {
      continue;
    }
    if (!intersects(before, visible) && !intersects(after, visible)) {
      // Outside the visible part before and after: it lands silently.
      continue;
    }
    if (motion.kind === 'fade') {
      safeAnimate(
        element,
        [{opacity: 0}, {opacity: 1}],
        {duration: motion.durationMs, easing: motion.easing},
        change,
      );
      continue;
    }
    if (entry.isMovedByApp === true) {
      // The app moves it itself: it takes its final place at once
      // (`spec:AST-105` Coverage).
      continue;
    }
    // Where it showed before the change, against its new place, in its own
    // px. The part the glide's offset then does not cover is the new move.
    const scale = entry.scale ?? {x: 1, y: 1};
    const moveX = dx / scale.x - held.x;
    const moveY = dy / scale.y - held.y;
    const {progress} = motion;
    const durationMs = Math.max(progress.durationMs, carriedMs);
    const offsetAt = drawnCurve(durationMs, t => {
      const remaining = progress.remaining(t);
      const carry = carried(t);
      return {x: carry.x + moveX * remaining, y: carry.y + moveY * remaining};
    });
    // One replace-composited `translate`: the compositor runs it (INV12).
    const animation = safeAnimate(
      element,
      sampleOver(durationMs, t => {
        const offset = offsetAt(t);
        return {translate: `${offset.x}px ${offset.y}px`};
      }),
      {duration: durationMs, easing: 'linear'},
      change,
      scale,
    );
    if (animation != null) {
      const glide: Glide = {
        animation,
        offsetAt,
        durationMs,
        shownBefore: {x: dx / scale.x, y: dy / scale.y},
        scale,
      };
      glides.set(element, glide);
      animation.addEventListener?.('finish', () => {
        if (glides.get(element) === glide) {
          glides.delete(element);
        }
      });
    }
  }
}

type Target = {readonly current: Element | null} | (() => Element | null);

function resolve(target: Target): Element | null {
  return typeof target === 'function' ? target() : target.current;
}

export interface LayoutChange {
  /** Before the change commits (in the event handler that causes it). */
  measureBefore(): void;
  /**
   * After it commits (a layout effect). Returns whether the change was
   * measured: an unmeasured change (an owner set the state directly) moves
   * nothing, and the component plays no entrance for it either.
   *
   * `beforeMove`, when given, runs once the new places are read and before
   * any glide starts, with the elements the glide may move: whatever the
   * component reads from the layout for the glide, it reads there, so the page
   * is not laid out again (`playLayoutChange` included).
   */
  animate(beforeMove?: (candidates: ReadonlyArray<Element>) => void): boolean;
}

/**
 * Report a size change of `target` to the handle's area. Call
 * `measureBefore()` before the change commits and `animate()` after it; the
 * content after `target`, up to the area, glides from its old place.
 * Changes in one area in one frame move together. Without a handle, or
 * outside its container, nothing moves.
 */
export function reportLayoutChange(
  handle: AnimatedLayout | null | undefined,
  target: Target,
): LayoutChange {
  return {
    measureBefore() {
      const element = resolve(target);
      if (element == null || handle == null) {
        return;
      }
      const area = areaOf(handle, element);
      if (area == null) {
        return;
      }
      beginChange(element.ownerDocument);
      const batch = batchFor(area);
      if (batch.changed.has(element)) {
        return;
      }
      batch.changed.add(element);
      batch.changedSize += rectOf(element, batch.cache).height;
      batch.visible ??= visibleRect(area);
      batch.originBefore ??= originOf(area);
      batch.walksToBand ??=
        area.ownerDocument.defaultView
          ?.getComputedStyle(area)
          .getPropertyValue('overflow-anchor') === 'none';
      // Changes in one frame add up: every change's walk reaches the band
      // their summed size can pull into view. When that outgrows the band
      // walked so far, the band at least doubles and every change is walked
      // again (from the cache), so a frame of many changes re-walks a few
      // times, not once per change.
      const needed = Math.max(batch.visible.height, batch.changedSize);
      const walks = needed > batch.reach ? [...batch.changed] : [element];
      if (needed > batch.reach) {
        batch.reach = Math.max(needed, batch.reach * 2);
      }
      const band = bandFor(batch.visible, batch.reach);
      for (const changed of walks) {
        const candidates = collectCandidates(
          changed,
          area,
          band,
          batch.cache,
          batch.walksToBand,
          batch.ancestors,
          batch.befores,
        );
        for (const [candidate, rect] of candidates) {
          if (!batch.before.has(candidate)) {
            batch.before.set(candidate, onGlideClock(candidate, rect, area));
          }
        }
        batch.candidates.set(changed, [...candidates.keys()]);
      }
    },
    animate(beforeMove) {
      const element = resolve(target);
      if (element == null || handle == null) {
        return false;
      }
      const area = areaOf(handle, element);
      const batch = area == null ? undefined : batches.get(area);
      if (batch == null || !batch.changed.has(element)) {
        return false;
      }
      if (beforeMove != null) {
        batch.beforeMove.push(beforeMove);
      }
      if (!batch.scheduled) {
        batch.scheduled = true;
        // After every layout effect of this commit, before paint, with one
        // registry notice for all the glides it starts.
        queueMicrotask(() => batchPresented(() => flush(batch)));
      }
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// The edge reveal (`spec:AST-105` FR9)
// ---------------------------------------------------------------------------

/**
 * The edge an element reveals from or conceals to (`spec:AST-105` FR9): its
 * block-end edge by default, or its block-start, inline-start or inline-end
 * edge, such as a panel collapsing beside content. An inline edge follows
 * the element's direction.
 */
export type LayoutEdge =
  'block-end' | 'block-start' | 'inline-start' | 'inline-end';

/** Whether `element` lays its inline axis out right to left. */
function isRtl(element: Element): boolean {
  return (
    element.ownerDocument.defaultView?.getComputedStyle(element).direction ===
    'rtl'
  );
}

/**
 * The `clip-path` that hides `side` of an element from `edge`: `inset()`'s
 * sides are physical (top, right, bottom, left), so an inline edge is
 * mirrored right to left. `zero` is how the other three are written.
 */
function edgeClip(
  edge: LayoutEdge,
  side: string,
  zero: string,
  rtl: boolean,
): string {
  const sides = [zero, zero, zero, zero];
  const index =
    edge === 'block-start'
      ? 0
      : edge === 'block-end'
        ? 2
        : (edge === 'inline-end') !== rtl
          ? 1
          : 3;
  sides[index] = side;
  return `inset(${sides.join(' ')})`;
}

/** A hidden fraction of the element, as a percentage clip on `edge`. */
function fractionClip(edge: LayoutEdge, hidden: number, rtl: boolean): string {
  return edgeClip(edge, `${round(hidden * 100)}%`, '0', rtl);
}

/** A hidden length of the element, in its own px, as a clip on `edge`. */
function pxClip(edge: LayoutEdge, hidden: number, rtl: boolean): string {
  return edgeClip(edge, `${hidden}px`, '0px', rtl);
}

/**
 * The element's size along `edge`'s axis, in its own px (a scaled ancestor
 * divided out), read from the layout the caller already laid out.
 */
function extentOf(element: Element, edge: LayoutEdge): number {
  const rect = element.getBoundingClientRect();
  const scale = scaleOf(element, rect);
  return edge.startsWith('inline')
    ? rect.width / scale.x
    : rect.height / scale.y;
}

/** The parts that slide, and the still clip that holds them while they do. */
interface Sliding {
  readonly parts: ReadonlyArray<Element>;
  /** Each part's ancestors' scale: page px per px of its own offset. */
  readonly scales: ReadonlyArray<{readonly x: number; readonly y: number}>;
  readonly clip: string;
}

/**
 * The parts that slide inside an element revealed or concealed from a block
 * edge by `extent` px. They are its child elements that the band can show:
 * the area's visible part plus one viewport, or `extent` if larger, above and
 * below. A part past the band cannot come into view while it moves, so it
 * stays. The walk stops at the first child below the band, so its cost grows
 * with the changed size, never with the length of a list. A translation
 * cannot move text on its own, so an element with text of its own keeps the
 * clip (null).
 */
function slidingParts(
  element: Element,
  edge: LayoutEdge,
  area: Element,
  extent: number,
): Sliding | null {
  if (!edge.startsWith('block') || !(extent > 0)) {
    return null;
  }
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  // A box the element paints itself would show whole from the first frame
  // under a still clip, so such an element keeps the moving clip. So does one
  // with a generated box, which stays still while its parts slide.
  if (
    view == null ||
    style == null ||
    paintsOwnBox(style) ||
    ['::before', '::after'].some(pseudo => {
      const {content} = view.getComputedStyle(element, pseudo);
      return content !== '' && content !== 'none' && content !== 'normal';
    })
  ) {
    return null;
  }
  const visible = visibleRect(area);
  const band = bandFor(visible, Math.max(view.innerHeight, extent));
  const parts: Element[] = [];
  const scales: {x: number; y: number}[] = [];
  for (let node = element.firstChild; node != null; node = node.nextSibling) {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? '').trim() !== '') {
        return null;
      }
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }
    // A translation moves neither an inline box nor a boxless one.
    const {display} = view.getComputedStyle(node as Element);
    if (display === 'inline' || display === 'contents') {
      return null;
    }
    // Each part's place, read once per reveal, before anything moves.
    const box = (node as Element).getBoundingClientRect();
    if (box.top > band.end) {
      break;
    }
    if (box.bottom >= band.start) {
      // A part an earlier change still glides keeps that glide, which a slide
      // would hide and then show again. The element keeps the moving clip.
      if (glides.has(node as Element)) {
        return null;
      }
      parts.push(node as Element);
      scales.push(scaleOf(node as Element, box, ownScaleOf(node as Element)));
    }
  }
  if (parts.length === 0) {
    return null;
  }
  // The parts come in from one side. The clip holds them inside the content
  // box there, off what the content before the element draws into its padding.
  const inner = (side: 'top' | 'bottom') =>
    (Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0) +
    (Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0);
  return {
    parts,
    scales,
    clip:
      edge === 'block-end'
        ? `inset(${inner('top')}px 0px 0px 0px)`
        : `inset(0px 0px ${inner('bottom')}px 0px)`,
  };
}

/**
 * Whether a style paints a box of its own: a fill, a border, a shadow, an
 * outline or a filter.
 */
function paintsOwnBox(style: CSSStyleDeclaration): boolean {
  const isClear = (color: string) =>
    color === '' || color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color);
  return (
    !isClear(style.backgroundColor) ||
    (style.backgroundImage !== '' && style.backgroundImage !== 'none') ||
    ['Top', 'Right', 'Bottom', 'Left'].some(
      side =>
        style.getPropertyValue(`border-${side.toLowerCase()}-style`) !==
          'none' &&
        Number.parseFloat(
          style.getPropertyValue(`border-${side.toLowerCase()}-width`),
        ) > 0,
    ) ||
    (style.boxShadow !== '' && style.boxShadow !== 'none') ||
    (style.borderImageSource !== '' && style.borderImageSource !== 'none') ||
    (style.filter !== '' && style.filter !== 'none') ||
    (style.outlineStyle !== '' &&
      style.outlineStyle !== 'none' &&
      Number.parseFloat(style.outlineWidth) > 0)
  );
}

/**
 * Where the parts sit when the element hides `hidden` px from `edge`. They
 * move that far towards it, so their far edge meets the content that rides
 * the same edge.
 */
function slideFrame(edge: LayoutEdge, hidden: number): Keyframe {
  return {translate: `0px ${edge === 'block-end' ? -hidden : hidden}px`};
}

/**
 * Clips `element` with `clip` while its parts slide, and returns what puts
 * its own `clip-path` back. The clip does not move, so it stays in step with
 * the parts and the content beside them on every engine.
 */
function holdSlideClip(element: Element, clip: string): () => void {
  const {style} = element as HTMLElement;
  const value = style.getPropertyValue('clip-path');
  const priority = style.getPropertyPriority('clip-path');
  style.setProperty('clip-path', clip);
  return () => {
    if (value === '') {
      style.removeProperty('clip-path');
    } else {
      style.setProperty('clip-path', value, priority);
    }
  };
}

/**
 * The last element before `element` in the area that takes part in layout:
 * its previous sibling, or its nearest ancestor's below the area (the mirror
 * of `nextInFlow`, for a start edge).
 */
function previousInFlow(element: Element, area: Element): Element | null {
  const view = element.ownerDocument.defaultView;
  const lastBox = (from: Element): Element | null => {
    const style = view?.getComputedStyle(from);
    if (style == null) {
      return from;
    }
    if (style.display === 'contents') {
      for (
        let child = from.lastElementChild;
        child != null;
        child = child.previousElementSibling
      ) {
        const box = lastBox(child);
        if (box != null) {
          return box;
        }
      }
      return null;
    }
    return takesPart(from, style) ? from : null;
  };
  let node: Element | null = element;
  while (node != null && node !== area) {
    for (
      let sibling = node.previousElementSibling;
      sibling != null;
      sibling = sibling.previousElementSibling
    ) {
      const box = lastBox(sibling);
      if (box != null) {
        return box;
      }
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * The glide that moves `neighbour`: its own, or that of its nearest gliding
 * ancestor below the area that does not also hold `element` (one that holds
 * both moves the two together, so the edge does not ride it).
 */
function glideMoving(
  neighbour: Element,
  element: Element,
  area: Element,
): Glide | null {
  for (
    let node: Element | null = neighbour;
    node != null && node !== area && !node.contains(element);
    node = node.parentElement
  ) {
    const glide = glides.get(node);
    if (glide != null) {
      return glide;
    }
  }
  return null;
}

/** A one-state reveal or conceal running on an element. */
interface EdgeMotion {
  readonly animation: Animation;
  /** The fraction of the element it shows `t` ms in (1: all of it). */
  shownAt: (t: number) => number;
  /** The parts that slide under the element's clip, and their motions. */
  readonly slides: ReadonlyArray<Animation>;
  /** Puts back what the motion set on the element, once. */
  readonly release: () => void;
}

/** Each element's running one-state reveal or conceal. */
const edgeMotions = sharedWeakMap<Element, EdgeMotion>(
  'motion/animated-layout/edge-motions',
  1,
);

/**
 * What a one-state motion an adopter stopped (`releaseLayoutExit`) showed,
 * and the timeline time it stopped at: a reveal started in the same frame,
 * the reversal that stopped it, starts there.
 */
const stoppedShown = sharedWeakMap<
  Element,
  {readonly fraction: number; readonly at: number}
>('motion/animated-layout/stopped-shown', 1);

function timelineNow(element: Element): number {
  return Number(element.ownerDocument.timeline?.currentTime ?? Number.NaN);
}

/** What `motion` shows now, by its animation's own clock. */
function shownNow(motion: EdgeMotion): number {
  const time = Number(motion.animation.currentTime);
  return motion.shownAt(Number.isFinite(time) ? Math.max(0, time) : 0);
}

/**
 * What `element` shows as a reveal or conceal starts: where the one-state
 * motion this one reverses had got to (it stops there), or `atRest`, all of
 * it for a conceal and nothing for a reveal.
 */
function shownAtStart(element: Element, atRest: number): number {
  const running = edgeMotions.get(element);
  if (running != null) {
    edgeMotions.delete(element);
    const fraction = shownNow(running);
    running.animation.cancel();
    stopSlides(running);
    return fraction;
  }
  const stopped = stoppedShown.get(element);
  stoppedShown.delete(element);
  if (stopped != null && stopped.at === timelineNow(element)) {
    return stopped.fraction;
  }
  return atRest;
}

/** Stops `motion`'s sliding parts and puts back the element's clip, once. */
function stopSlides(motion: EdgeMotion): void {
  motion.release();
}

/** Records `animation` as `element`'s running one-state motion. */
function trackEdgeMotion(
  element: Element,
  animation: Animation,
  shownAt: (t: number) => number,
  slides: ReadonlyArray<Animation> = [],
  release: () => void = () => {},
  isHeldToRelease = false,
): EdgeMotion {
  let isReleased = false;
  const motion: EdgeMotion = {
    animation,
    shownAt,
    slides,
    release: () => {
      if (!isReleased) {
        isReleased = true;
        for (const slide of slides) {
          stopGlideOf(slide);
        }
        release();
      }
    },
  };
  edgeMotions.set(element, motion);
  if (isHeldToRelease) {
    heldSlides.set(element, motion);
  }
  // A reveal's parts have landed at its end. An exit's parts hold where they
  // end until `releaseLayoutExit`.
  animation.addEventListener?.('finish', () => {
    if (edgeMotions.get(element) === motion) {
      edgeMotions.delete(element);
      if (!isHeldToRelease) {
        motion.release();
      }
    }
  });
  return motion;
}

/** Each exit's motion, whose parts hold their slides until its release. */
const heldSlides = sharedWeakMap<Element, EdgeMotion>(
  'motion/animated-layout/held-slides',
  1,
);

/**
 * After this commit's glides start (the batch flushes in a microtask queued
 * before this one), before the frame paints: once the content on `edge`'s
 * side glides, the moving edge rides that glide, frame by frame, so the two
 * never part, a reversal included (the glide carries its running motion).
 * `hiddenAt` turns that content's offset towards the edge's side into the
 * length the element hides; `frame` turns that length into a keyframe.
 * Without that glide (nothing on that side in the area, or nothing that
 * moves) the motion keeps its own curve. The animation is kept, its frames
 * replaced; `onRide` hears the ridden hidden length over time.
 */
function rideNeighbour(
  element: Element,
  area: Element,
  edge: LayoutEdge,
  rtl: boolean,
  animation: Animation,
  isCurrent: () => boolean,
  hiddenAt: (towards: number) => number,
  frame: (hidden: number) => Keyframe,
  onRide: (hidden: (t: number) => number, durationMs: number) => void,
): void {
  const effect = animation.effect as KeyframeEffect | null;
  if (effect == null || typeof effect.setKeyframes !== 'function') {
    return;
  }
  queueMicrotask(() => {
    if (!isCurrent()) {
      return;
    }
    const isEnd = edge.endsWith('end');
    const neighbour = isEnd
      ? nextInFlow(element, area)
      : previousInFlow(element, area);
    const glide =
      neighbour == null ? null : glideMoving(neighbour, element, area);
    if (neighbour == null || glide == null) {
      return;
    }
    // A glide that moves the element itself in the same batch, short of what
    // it shares with the neighbour (an item above them closing): the edge
    // rides the neighbour's offset from the element, not from the page.
    const own = glideMoving(element, neighbour, area);
    // Each glide is read on its own clock. A glide an earlier change started,
    // such as a part's slide, is already some way in.
    const glideAt = startedBefore(glide, animation);
    const ownAt = own == null ? 0 : startedBefore(own, animation);
    const durationMs = Math.max(
      glide.durationMs - glideAt,
      own == null ? 0 : own.durationMs - ownAt,
    );
    // The neighbour's offset from its place relative to the element's,
    // towards the edge's side.
    const sign = isEnd ? 1 : -1;
    const hidden = (t: number): number => {
      const offset = glide.offsetAt(glideAt + t);
      const moved = own?.offsetAt(ownAt + t) ?? {x: 0, y: 0};
      return hiddenAt(
        sign *
          (edge.startsWith('inline')
            ? (rtl ? -1 : 1) * (offset.x - moved.x)
            : offset.y - moved.y),
      );
    };
    const frames = sampleOver(durationMs, t => frame(hidden(t)));
    effect.setKeyframes(frames);
    effect.updateTiming?.({duration: durationMs});
    retimeSettle(animation, frames, durationMs);
    onRide(hidden, durationMs);
  });
}

/**
 * The one-state reveal or conceal rides the content on its edge's side: the
 * element shows what lies between its fixed edge and that content, a reveal
 * less by however far the content still is from its place towards it, a
 * conceal all of it less however far the content has come, fading with what
 * it hides.
 */
function rideEdge(
  element: Element,
  area: Element,
  edge: LayoutEdge,
  rtl: boolean,
  motion: EdgeMotion,
  isConceal: boolean,
): void {
  const extent = extentOf(element, edge);
  if (!(extent > 0)) {
    return;
  }
  rideNeighbour(
    element,
    area,
    edge,
    rtl,
    motion.animation,
    () => edgeMotions.get(element) === motion,
    towards =>
      Math.min(extent, Math.max(0, isConceal ? extent - towards : -towards)),
    hidden =>
      motion.slides.length > 0
        ? {opacity: 1 - hidden / extent}
        : {opacity: 1 - hidden / extent, clipPath: pxClip(edge, hidden, rtl)},
    (hiddenAt, durationMs) => {
      motion.shownAt = t => 1 - hiddenAt(t) / extent;
      // The parts ride the same frames, so their edge and the content's move
      // on one clock.
      for (const slide of motion.slides) {
        const effect = slide.effect as KeyframeEffect | null;
        const frames = sampleOver(durationMs, t =>
          slideFrame(edge, hiddenAt(t)),
        );
        effect?.setKeyframes?.(frames);
        effect?.updateTiming?.({duration: durationMs});
        retimeSettle(slide, frames, durationMs);
      }
    },
  );
}

/**
 * The changed element's own animation, on the same motion as the content
 * after it (`spec:AST-105` FR4): content that appears reveals from its
 * block-end edge downward, or from the `edge` it is given (FR9), and its edge
 * rides the glide of the content on that side once it starts. A reveal that
 * reverses a running conceal (an adopter opens it again mid-exit, after
 * `releaseLayoutExit`) starts from what the element shows. Plays only with a
 * handle, inside its area and in the area's visible part. Returns the
 * entrance it started, or null when it played none.
 */
export function playLayoutChange(
  handle: AnimatedLayout | null | undefined,
  element: Element,
  {edge = 'block-end'}: {edge?: LayoutEdge} = {},
): Animation | null {
  if (handle == null) {
    return null;
  }
  const area = areaOf(handle, element);
  if (area == null) {
    return null;
  }
  if (!intersects(element.getBoundingClientRect(), visibleRect(area))) {
    return null;
  }
  const motion = layoutMotion(area);
  if (motion.kind === 'instant') {
    return null;
  }
  const from = shownAtStart(element, 0);
  // The start of the change it enters with, which its glides then share.
  const batch = batches.get(area);
  const change =
    batch != null &&
    [...batch.changed].some(
      changed => changed === element || changed.contains(element),
    )
      ? changeStartOf(batch)
      : undefined;
  if (motion.kind === 'fade') {
    return safeAnimate(
      element,
      [{opacity: from}, {opacity: 1}],
      {duration: motion.durationMs, easing: motion.easing},
      change,
    );
  }
  const {progress} = motion;
  const rtl = edge.startsWith('inline') && isRtl(element);
  // A block edge's parts slide in under the element's clip, on the frames the
  // content after them glides on. A clip that moved would be painted on its
  // own clock in WebKit, and the edge would part from that content.
  const extent = edge.startsWith('block') ? extentOf(element, edge) : 0;
  const sliding = slidingParts(element, edge, area, extent);
  const partMotions = slideParts(sliding, progress, change, remaining =>
    slideFrame(edge, (1 - from) * remaining * extent),
  );
  const animation = safeAnimate(
    element,
    sampleKeyframes(progress, remaining => {
      const hidden = (1 - from) * remaining;
      return partMotions.length > 0
        ? {opacity: 1 - hidden}
        : {opacity: 1 - hidden, clipPath: fractionClip(edge, hidden, rtl)};
    }),
    {duration: progress.durationMs, easing: 'linear'},
    change,
  );
  if (animation == null) {
    for (const part of partMotions) {
      part.cancel();
    }
  } else {
    const tracked = trackEdgeMotion(
      element,
      animation,
      t => 1 - (1 - from) * progress.remaining(t),
      partMotions,
      partMotions.length > 0 && sliding != null
        ? holdSlideClip(element, sliding.clip)
        : undefined,
    );
    rideEdge(element, area, edge, rtl, tracked, false);
  }
  return animation;
}

/**
 * Plays each part's slide on the change's start, sampled like the glide.
 * `frame` turns the share of the motion still to come into a keyframe.
 */
function slideParts(
  sliding: Sliding | null,
  progress: GlideProgress,
  change: ChangeStart | undefined,
  frame: (remaining: number) => Keyframe,
  fill?: FillMode,
): Animation[] {
  const motions: Animation[] = [];
  for (const [index, part] of (sliding?.parts ?? []).entries()) {
    const motion = safeAnimate(
      part,
      sampleKeyframes(progress, frame),
      {duration: progress.durationMs, easing: 'linear', fill},
      change,
    );
    if (motion != null) {
      motions.push(motion);
      // A slide is the part's glide. A later change in the area then carries
      // its rest into the part's next glide, as it carries any glide.
      const glide: Glide = {
        animation: motion,
        offsetAt: t => drawnOffset(motion, t),
        // A ride retimes the slide, so its length is read off the slide.
        get durationMs() {
          return liveDuration(motion, progress.durationMs);
        },
        // The part showed at its place when the parts were read.
        shownBefore: {x: 0, y: 0},
        scale: sliding?.scales[index] ?? {x: 1, y: 1},
      };
      glides.set(part, glide);
      slideTargets.set(motion, part);
      // An exit's slide then holds its end until the release. The element is
      // inert and has given up its space by then.
      motion.addEventListener?.('finish', () => {
        if (glides.get(part) === glide) {
          glides.delete(part);
        }
      });
    }
  }
  return motions;
}

/**
 * The offset `animation` draws `t` ms in, read off its keyframes, a straight
 * line between each two. A slide that rides another glide reads that glide's
 * frames, so this follows it.
 */
function drawnOffset(
  animation: Animation,
  t: number,
): {readonly x: number; readonly y: number} {
  const effect = animation.effect as KeyframeEffect | null;
  if (effect == null || typeof effect.getKeyframes !== 'function') {
    return {x: 0, y: 0};
  }
  const frames = effect.getKeyframes();
  const duration = Number(effect.getTiming().duration);
  const at = duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 1;
  const offsetOf = (frame: ComputedKeyframe | undefined) => {
    const [x = 0, y = 0] = numbersIn(String(frame?.translate ?? ''));
    return {x, y, offset: frame?.computedOffset ?? 0};
  };
  let from = offsetOf(frames[0]);
  let to = offsetOf(frames[frames.length - 1]);
  for (const frame of frames) {
    const point = offsetOf(frame);
    if (point.offset <= at) {
      from = point;
    }
    if (point.offset >= at) {
      to = point;
      break;
    }
  }
  const span = to.offset - from.offset;
  const k = span > 0 ? (at - from.offset) / span : 0;
  return {x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k};
}

/** How many ms before `animation` started `glide` started: 0 in one change. */
function startedBefore(glide: Glide, animation: Animation): number {
  const shift = Number(animation.startTime) - Number(glide.animation.startTime);
  return Number.isFinite(shift) ? Math.max(0, shift) : 0;
}

/** `animation`'s length now, in ms, or `fallback` if it has none. */
function liveDuration(animation: Animation, fallback: number): number {
  const effect = animation.effect as KeyframeEffect | null;
  const duration = Number(effect?.getTiming?.().duration);
  return duration > 0 ? duration : fallback;
}

/** Each part's slide, by its motion: a stopped slide is no glide. */
const slideTargets = sharedWeakMap<Animation, Element>(
  'motion/animated-layout/slide-targets',
  1,
);

/** Cancels a part's slide, and forgets it as the part's glide. */
function stopGlideOf(animation: Animation): void {
  const part = slideTargets.get(animation);
  if (part != null && glides.get(part)?.animation === animation) {
    glides.delete(part);
  }
  animation.cancel();
}

/** The inline properties an exit sets, so a release removes exactly them. */
const EXIT_PROPERTIES = [
  'margin-block-end',
  'margin-inline-end',
  'margin-block-start',
  'margin-inline-start',
  'pointer-events',
] as const;

/**
 * The first element after `element` in the area that takes part in layout:
 * its next sibling, or its nearest ancestor's below the area. A wrapper's
 * edge is not used: a negative end margin can collapse through it.
 */
function nextInFlow(element: Element, area: Element): Element | null {
  const view = element.ownerDocument.defaultView;
  // The first box at or inside `from` (a `display: contents` element has
  // none of its own: its children stand in its place).
  const firstBox = (from: Element): Element | null => {
    const style = view?.getComputedStyle(from);
    if (style == null) {
      return from;
    }
    if (style.display === 'contents') {
      for (
        let child = from.firstElementChild;
        child != null;
        child = child.nextElementSibling
      ) {
        const box = firstBox(child);
        if (box != null) {
          return box;
        }
      }
      return null;
    }
    return takesPart(from, style) ? from : null;
  };
  let node: Element | null = element;
  while (node != null && node !== area) {
    for (
      let sibling = node.nextElementSibling;
      sibling != null;
      sibling = sibling.nextElementSibling
    ) {
      const box = firstBox(sibling);
      if (box != null) {
        return box;
      }
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * An element's place: its block start, and its inline start (RTL read right
 * to left).
 */
function placeOf(
  element: Element,
  rtl: boolean,
): {block: number; inline: number} {
  const rect = element.getBoundingClientRect();
  return {block: rect.top, inline: rtl ? -rect.right : rect.left};
}

/**
 * Keeps `element` where it is, in flow (so it scrolls and clips with its
 * container), while the content after it takes the place it takes once the
 * element is hidden: a negative end margin measured against that content,
 * so a gap or collapsing margins come out exact. Returns false, setting
 * nothing, when no margin reaches that place.
 */
function giveUpSpace(
  element: HTMLElement,
  area: Element,
  edge: LayoutEdge = 'block-end',
): boolean {
  const view = element.ownerDocument.defaultView;
  const parent =
    element.parentElement == null
      ? undefined
      : view?.getComputedStyle(element.parentElement);
  const isRow =
    parent != null &&
    parent.display.includes('flex') &&
    parent.flexDirection.startsWith('row');
  const rtl = view?.getComputedStyle(element).direction === 'rtl';
  // The default block-end exit frees its space at its end, on the axis its
  // container lays it out on; an exit by another edge frees it on that
  // edge's side, so the element stays where it shows and the content beyond
  // that edge moves (FR9).
  const isStart = edge.endsWith('start');
  const property =
    edge === 'block-end'
      ? isRow
        ? 'margin-inline-end'
        : 'margin-block-end'
      : `margin-${edge}`;
  const isInline = property.includes('inline');
  const size = isInline ? element.offsetWidth : element.offsetHeight;
  const next = nextInFlow(element, area);
  if (next == null && !isStart) {
    // Nothing after it in the area to land anywhere.
    element.style.setProperty(property, `${-size}px`);
    return true;
  }
  const own = element.style.getPropertyValue(property);
  const ownPriority = element.style.getPropertyPriority(property);
  const axis = isInline ? 'inline' : 'block';
  // The content after its container must land too: a flex-row item that
  // sets its row's height moves what follows the row.
  const afterParent =
    element.parentElement == null || element.parentElement === area
      ? null
      : nextInFlow(element.parentElement, area);
  // By a start edge, what lies before it lands too, and the element itself
  // stays where it shows.
  const before = isStart ? previousInFlow(element, area) : null;
  const checked = [next, afterParent, before, isStart ? element : null].filter(
    (box): box is Element => box != null,
  );
  if (checked.length === 0) {
    return false;
  }
  // The element's scale, read in the layout the caller's visibility check
  // already laid out.
  const scale = scaleOf(element, element.getBoundingClientRect());
  // Where the content after it goes once it is hidden, read with it taken
  // out of flow (not `display: none`, which would restart the CSS animations
  // inside it).
  const position = element.style.getPropertyValue('position');
  const positionPriority = element.style.getPropertyPriority('position');
  const shown = isStart ? placeOf(element, rtl) : null;
  element.style.setProperty('position', 'absolute', 'important');
  const targets = checked.map(box =>
    box === element && shown != null ? shown : placeOf(box, rtl),
  );
  const target = targets[0];
  if (position === '') {
    element.style.removeProperty('position');
  } else {
    element.style.setProperty('position', position, positionPriority);
  }
  // The reading is in screen px, the margin in the element's own: under a
  // scaled ancestor a distance is divided by the scale on this axis.
  const perPx = isRow ? scale.x : scale.y;
  // A first guess (its box), then one correction from the measured result:
  // a gap, a collapsed margin or the element's own margins.
  element.style.setProperty(property, `${-size}px`);
  const guess = placeOf(checked[0], rtl)[axis];
  const correction = (target[axis] - guess) / perPx;
  element.style.setProperty(property, `${-size + correction}px`);
  // Everything checked must land on both axes: a flex-row item that sets
  // its row's height frees no block space with an inline margin.
  const missed = checked.some((box, index) => {
    const landed = placeOf(box, rtl);
    return (
      Math.abs(landed.block - targets[index].block) > 1 ||
      Math.abs(landed.inline - targets[index].inline) > 1
    );
  });
  if (missed) {
    if (own === '') {
      element.style.removeProperty(property);
    } else {
      element.style.setProperty(property, own, ownPriority);
    }
    return false;
  }
  return true;
}

/** Exits holding an element back, so a release can stop one. */
const exits = sharedWeakMap<Element, Animation | null>(
  'motion/animated-layout/exits',
  1,
);

/** What an exit replaced on its element, so a release puts back exactly it. */
interface Replaced {
  readonly inert: boolean;
  readonly styles: ReadonlyArray<readonly [string, string, string]>;
}
const replaced = sharedWeakMap<Element, Replaced>(
  'motion/animated-layout/replaced',
  1,
);

/**
 * The changed element's exit (`spec:AST-105` FR4): content that disappears
 * keeps its place on screen but gives up its space (a negative end margin
 * measured against the layout without it, so the content after it glides up
 * at once to exactly where it ends, and it still scrolls and clips with its
 * container), is inert (no focus, no pointer, nothing read), conceals upward
 * from its bottom edge on the same motion, and then `done` runs, when the
 * component hides or unmounts it. Under Reduce Motion with a coarse primary pointer it
 * fades instead. Call it in the layout effect of the commit that closes the
 * element, after the change's `animate()` reported it measured, in the same
 * task: the glide reads the layout once the element has given up its space.
 *
 * It conceals to its block-end edge by default, or to the `edge` it is given
 * (`spec:AST-105` FR9), and its edge rides the glide of the content on that
 * side once it starts; a conceal that reverses a running reveal (a close
 * while it opens) starts from what the element shows.
 *
 * Returns false, holding nothing, when the exit lands at once: no handle, a
 * close no change in the area measured, outside the area or its visible part,
 * Reduce Motion with a fine pointer, or a layout no end margin can free (a
 * grid track and its gap, a flex-row item that sets its row's height); in
 * that last case the content after it takes its final place at once too.
 * The component then hides the element itself.
 */
export function holdLayoutExit(
  handle: AnimatedLayout | null | undefined,
  element: HTMLElement,
  done: () => void,
  {edge = 'block-end'}: {edge?: LayoutEdge} = {},
): boolean {
  if (handle == null) {
    return false;
  }
  const area = areaOf(handle, element);
  if (
    area == null ||
    !intersects(element.getBoundingClientRect(), visibleRect(area))
  ) {
    return false;
  }
  // Only a measured close exits: the content after it glides into its place.
  const batch = batches.get(area);
  if (
    batch == null ||
    ![...batch.changed].some(
      changed => changed === element || changed.contains(element),
    )
  ) {
    return false;
  }
  const motion = layoutMotion(area);
  if (motion.kind === 'instant') {
    return false;
  }
  releaseLayoutExit(element);
  const prior: Replaced = {
    inert: element.hasAttribute('inert'),
    styles: EXIT_PROPERTIES.map(
      property =>
        [
          property,
          element.style.getPropertyValue(property),
          element.style.getPropertyPriority(property),
        ] as const,
    ),
  };
  if (!giveUpSpace(element, area, edge)) {
    // A layout no end margin can free (a grid track and its gap, a flex-row
    // item that sets its row's height): it hides at once, and the content
    // after it takes its final place at once (`spec:AST-105` out of
    // coverage).
    for (const changed of [...batch.changed]) {
      if (changed === element || changed.contains(element)) {
        batch.changed.delete(changed);
      }
    }
    return false;
  }
  replaced.set(element, prior);
  // Out of reach while it conceals: no focus, no pointer, nothing read.
  element.setAttribute('inert', '');
  element.style.setProperty('pointer-events', 'none');
  // A close while it opens: the reveal stops where it shows, and this starts
  // there.
  const from = shownAtStart(element, 1);
  const rtl = edge.startsWith('inline') && isRtl(element);
  // The start of the change it exits with, which its glides then share.
  const change = changeStartOf(batch);
  let animation: Animation | null;
  if (motion.kind === 'fade') {
    animation = safeAnimate(
      element,
      [{opacity: from}, {opacity: 0}],
      {duration: motion.durationMs, easing: motion.easing, fill: 'forwards'},
      change,
    );
  } else {
    const {progress} = motion;
    // As in a reveal, a block edge's parts slide out under its clip.
    const extent = edge.startsWith('block') ? extentOf(element, edge) : 0;
    const sliding = slidingParts(element, edge, area, extent);
    const partMotions = slideParts(
      sliding,
      progress,
      change,
      remaining => slideFrame(edge, (1 - from * remaining) * extent),
      'forwards',
    );
    animation = safeAnimate(
      element,
      sampleKeyframes(progress, remaining => {
        const shown = from * remaining;
        return partMotions.length > 0
          ? {opacity: shown}
          : {opacity: shown, clipPath: fractionClip(edge, 1 - shown, rtl)};
      }),
      {duration: progress.durationMs, easing: 'linear', fill: 'forwards'},
      change,
    );
    if (animation == null) {
      for (const part of partMotions) {
        part.cancel();
      }
    } else {
      const tracked = trackEdgeMotion(
        element,
        animation,
        t => from * progress.remaining(t),
        partMotions,
        partMotions.length > 0 && sliding != null
          ? holdSlideClip(element, sliding.clip)
          : undefined,
        true,
      );
      rideEdge(element, area, edge, rtl, tracked, true);
    }
  }
  exits.set(element, animation);
  if (animation == null) {
    // No Web Animations: nothing to wait for.
    done();
    return true;
  }
  animation.addEventListener?.('finish', () => {
    if (exits.get(element) === animation) {
      done();
    }
  });
  return true;
}

/**
 * Puts an element `holdLayoutExit` held back: stops its exit and puts back
 * what the exit replaced (its `inert` and inline values as they were). Called
 * once the component has hidden the element, or when the element opens again
 * mid-exit.
 */
export function releaseLayoutExit(element: HTMLElement): void {
  if (!exits.has(element)) {
    return;
  }
  // What the exit showed as it stopped: a reveal in the same frame (opened
  // again mid-exit) starts there.
  const running = edgeMotions.get(element);
  if (running != null) {
    edgeMotions.delete(element);
    stoppedShown.set(element, {
      fraction: shownNow(running),
      at: timelineNow(element),
    });
    stopSlides(running);
  }
  const held = heldSlides.get(element);
  heldSlides.delete(element);
  if (held != null) {
    stopSlides(held);
  }
  exits.get(element)?.cancel();
  exits.delete(element);
  const prior = replaced.get(element);
  replaced.delete(element);
  if (prior?.inert !== true) {
    element.removeAttribute('inert');
  }
  for (const [property, value, priority] of prior?.styles ?? []) {
    if (value === '') {
      element.style.removeProperty(property);
    } else {
      element.style.setProperty(property, value, priority);
    }
  }
}

// ---------------------------------------------------------------------------
// The in-place swap
// ---------------------------------------------------------------------------

/**
 * Old content held as one transient copy while new content enters in its
 * place (`spec:AST-105` FR8): inert, hidden from assistive technology, and
 * removed when the swap ends (`architecture:component-style-authoring` INV7).
 */
export interface LayoutSwap {
  readonly area: Element;
  readonly copy: HTMLElement;
  /** Where the old content showed, in viewport coordinates. */
  readonly rect: DOMRect;
}

/** How far a ridden element has moved since the swap began. */
export interface LayoutRide {
  readonly x: number;
  readonly y: number;
}

/**
 * How a swap plays, as frames over its progress (0 → 1) and, with
 * `rideWith`, the ridden element's travel so far.
 */
export interface LayoutSwapMotion {
  /** The box the copy is laid out in, over the old content's place. */
  readonly host: Element;
  /** The copy's frames while it travels. */
  readonly copy: (p: number, ride: LayoutRide) => Keyframe;
  /** Its text's opacity, on its own curve, when that differs from the copy's. */
  readonly copyText?: (p: number) => number;
  /**
   * The copy paints in the background it shows, above its neighbours: at
   * `z-index: 1` as the host's last child, or at `copyBefore`'s level.
   */
  readonly isOpaque?: boolean;
  /**
   * Place the copy just before this child of the host, at that child's
   * level in the paint order, with no `z-index` of its own. Without it the
   * opaque copy is the host's last child at `z-index: 1`.
   */
  readonly copyBefore?: Element;
  /**
   * An element the glide moves, such as the column the old content sat in.
   * Every part plays over its glide, frame by frame, and is told how far it
   * has moved; the copy rides it unless `isCopyMoved` is false. Without a
   * glide (it lands silently) the ride is the whole `travel` at once (its
   * old place less its new).
   */
  readonly rideWith?: {
    readonly element: Element;
    readonly travel: LayoutRide;
    readonly isCopyMoved?: boolean;
  };
  /** Called once when the swap ends, however it ends. */
  readonly onEnd?: () => void;
  /** Elements the page already renders, entering with the swap. */
  readonly incoming: ReadonlyArray<{
    readonly element: Element;
    readonly frames: (p: number, ride: LayoutRide) => Keyframe;
  }>;
}

const NO_RIDE: LayoutRide = {x: 0, y: 0};

/**
 * Before a change commits: hold `element`'s old content as one transient copy
 * (`spec:AST-105` FR8). With `isVisiblePart`, the copy is the element's
 * visible part, its content scrolled as it was (a scroll container). Returns
 * null without a handle, outside its area, under an immediate change, or for
 * content too large to copy.
 */
export function holdLayoutSwap(
  handle: AnimatedLayout | null | undefined,
  element: HTMLElement,
  {isVisiblePart = false}: {isVisiblePart?: boolean} = {},
): LayoutSwap | null {
  if (handle == null || typeof element.animate !== 'function') {
    return null;
  }
  const area = areaOf(handle, element);
  if (
    area == null ||
    layoutMotion(area).kind === 'instant' ||
    !isCopyable(element)
  ) {
    return null;
  }
  beginChange(element.ownerDocument);
  const box = element.getBoundingClientRect();
  if (!isVisiblePart) {
    const copy = inertCopy(element);
    return copy == null ? null : {area, copy, rect: box};
  }
  const part = visiblePartCopy(element);
  return part == null ? null : {area, ...part};
}

/**
 * After the change commits, before paint: the copy leaves while the incoming
 * elements enter, on FR4's one motion, every part started on the same
 * timeline time. Under Reduce Motion with a coarse pointer, only opacity
 * changes (`design:reduced-motion` DR2). Returns what ends the swap at once;
 * it also ends when its motion does, and the copy is removed.
 */
export function playLayoutSwap(
  swap: LayoutSwap,
  how: LayoutSwapMotion,
): () => void {
  const motion = layoutMotion(swap.area);
  if (motion.kind === 'instant') {
    return () => {};
  }
  const {copy} = swap;
  // Captured now: the parts riding a glide play a microtask later, on the
  // start of the change they are part of.
  const change = changeStartIn(swap.area, copy.ownerDocument);
  placeOver(copy, how.host, swap.rect, how.copyBefore ?? null);
  if (how.isOpaque === true) {
    if (how.copyBefore == null) {
      copy.style.zIndex = '1';
    }
    copy.style.backgroundColor = paintedBackground(copy);
  }
  const animations: Animation[] = [];
  let isDone = false;
  const end = () => {
    if (isDone) {
      return;
    }
    isDone = true;
    animations.forEach(animation => animation.cancel());
    copy.remove();
    how.onEnd?.();
  };
  const {copyText, rideWith} = how;
  const fadedText =
    copyText != null && motion.kind === 'glide' ? wrapText(copy) : [];
  // Each part as a function of time: its frame, or the copy's with its ride.
  const parts: [Element, (p: number, ride: LayoutRide) => Keyframe][] = [];
  if (motion.kind === 'glide') {
    const moves = rideWith != null && rideWith.isCopyMoved !== false;
    parts.push([
      copy,
      (p, ride) => ({
        ...how.copy(p, ride),
        ...(moves ? {translate: `${ride.x}px ${ride.y}px`} : null),
      }),
    ]);
    for (const span of fadedText) {
      parts.push([span, p => ({opacity: copyText?.(p) ?? 1})]);
    }
    for (const {element, frames} of how.incoming) {
      parts.push([element, frames]);
    }
  } else {
    // Reduce Motion with a coarse pointer: only opacity changes.
    parts.push([copy, p => ({opacity: 1 - p})]);
    for (const {element} of how.incoming) {
      parts.push([element, p => ({opacity: p})]);
    }
  }
  const playAll = (
    durationMs: number,
    progressAt: (t: number) => number,
    rideAt: (t: number) => LayoutRide,
    options: KeyframeAnimationOptions,
    sample: (shape: (t: number) => Keyframe) => Keyframe[],
  ) => {
    for (const [element, shape] of parts) {
      const animation = safeAnimate(
        element,
        sample(t => shape(progressAt(t), rideAt(t))),
        {duration: durationMs, fill: 'both', ...options},
        change,
      );
      if (animation != null) {
        animations.push(animation);
      }
    }
    if (animations.length === 0) {
      end();
    } else {
      // Every part runs on one clock, so the first to finish ends them all.
      animations[0].addEventListener?.('finish', end);
    }
  };
  if (motion.kind === 'fade') {
    playAll(
      motion.durationMs,
      t => (t <= 0 ? 0 : 1),
      () => NO_RIDE,
      {easing: motion.easing},
      shape => [shape(0), shape(motion.durationMs)],
    );
    return end;
  }
  const {progress} = motion;
  const progressAt = (t: number) => 1 - progress.remaining(t);
  if (rideWith == null) {
    playAll(
      progress.durationMs,
      progressAt,
      () => NO_RIDE,
      {easing: 'linear'},
      shape => sampleOver(progress.durationMs, shape),
    );
    return end;
  }
  // After this commit's glides start (the batch flushes in a microtask queued
  // before this one), before the frame paints: every part plays over the
  // ridden element's glide, told how far it has moved from where it showed.
  queueMicrotask(() => {
    if (isDone) {
      return;
    }
    const glide = glides.get(rideWith.element);
    const durationMs = glide?.durationMs ?? progress.durationMs;
    const rideAt = (t: number): LayoutRide => {
      if (glide == null) {
        return {x: -rideWith.travel.x, y: -rideWith.travel.y};
      }
      // The parts were read where the ridden element showed then. After a
      // block it has moved on by the glide's start, so they move with it.
      const now = glide.offsetAt(t);
      const start = glide.shownBefore;
      return {x: now.x - start.x, y: now.y - start.y};
    };
    playAll(durationMs, progressAt, rideAt, {easing: 'linear'}, shape =>
      sampleOver(durationMs, shape),
    );
  });
  return end;
}

/**
 * After a change commits, before paint: elements the page already renders
 * play frames over the change's progress on FR4's one motion, with no copy,
 * such as a surface reaching over a gap a glide opens. Under Reduce Motion
 * with a coarse pointer, only opacity changes; under an immediate change,
 * nothing plays. Returns what ends them at once.
 */
export function playLayoutFrames(
  handle: AnimatedLayout | null | undefined,
  parts: LayoutSwapMotion['incoming'],
): () => void {
  const area = handle == null ? null : readArea(handle);
  const motion = area == null ? null : layoutMotion(area);
  if (area == null || motion == null || motion.kind === 'instant') {
    return () => {};
  }
  const change = changeStartIn(area, area.ownerDocument);
  const animations: Animation[] = [];
  for (const {element, frames: shape} of parts) {
    const animation =
      motion.kind === 'glide'
        ? safeAnimate(
            element,
            sampleKeyframes(motion.progress, remaining =>
              shape(1 - remaining, NO_RIDE),
            ),
            {
              duration: motion.progress.durationMs,
              easing: 'linear',
              fill: 'both',
            },
            change,
          )
        : safeAnimate(
            element,
            [{opacity: 0}, {opacity: 1}],
            {duration: motion.durationMs, easing: motion.easing},
            change,
          );
    if (animation != null) {
      animations.push(animation);
    }
  }
  // Held through the motion, then released: every part shares one clock, so
  // the first to finish ends them all and each element shows its own styles.
  const end = () => animations.forEach(animation => animation.cancel());
  animations[0]?.addEventListener?.('finish', end);
  return end;
}

// ---------------------------------------------------------------------------
// The edge reveal's two-state form (`spec:AST-105` FR9)
// ---------------------------------------------------------------------------

/**
 * An element's old state, held before a change commits for FR9's two-state
 * edge reveal.
 */
export interface LayoutEdgeHold {
  readonly element: HTMLElement;
  /** Where it showed, in viewport coordinates. */
  readonly rect: DOMRect;
  /**
   * Its size along the edge's axis as it shows: what a running reveal shows
   * mid-motion, or its box.
   */
  readonly extent: number;
  /** Its old state as one transient copy, or null when it cannot be held. */
  readonly swap: LayoutSwap | null;
}

/** A playing two-state edge reveal. */
export interface LayoutEdgeMotion {
  /** Ends it at once (a new change, an unmount). */
  end(): void;
  /**
   * What it shows now: its extent along the edge's axis and the motion's
   * progress (0 → 1), or null once it has settled.
   */
  shown(): {readonly extent: number; readonly progress: number} | null;
}

/** What the caller adds to a two-state edge reveal: only its own fades. */
export interface LayoutEdgeParts {
  /** The old state's copy's opacity over the progress (1 when absent). */
  readonly copyOpacity?: (p: number) => number;
  /** Its text's opacity, on its own curve, when that differs from the copy's. */
  readonly copyText?: (p: number) => number;
  /** Parts the page renders, playing with the reveal (the new state's text). */
  readonly incoming?: ReadonlyArray<{
    readonly element: Element;
    readonly frames: (p: number) => Keyframe;
  }>;
}

const SETTLED: LayoutEdgeMotion = {end: () => {}, shown: () => null};

/**
 * Before a change commits: hold `element`'s old state for FR9's two-state edge
 * reveal, its box and the extent it shows along `edge`'s axis (`shown`, from a
 * running reveal, or its box), and its old state as one transient copy (null
 * when it cannot be copied, or under an immediate change). Returns null
 * without the element or without Web Animations.
 */
export function holdLayoutEdge(
  handle: AnimatedLayout | null | undefined,
  element: HTMLElement | null,
  {
    edge = 'block-end',
    shown = null,
  }: {edge?: LayoutEdge; shown?: number | null} = {},
): LayoutEdgeHold | null {
  if (element == null || typeof element.animate !== 'function') {
    return null;
  }
  beginChange(element.ownerDocument);
  const rect = element.getBoundingClientRect();
  return {
    element,
    rect,
    extent: shown ?? (edge.startsWith('inline') ? rect.width : rect.height),
    swap: holdLayoutSwap(handle, element),
  };
}

/**
 * After the change commits, before paint: FR9's two-state edge reveal, on
 * FR4's one motion. The state that is larger along `edge`'s axis is clipped
 * on that edge, from the extent the element showed to the new one: a conceal
 * covers the old state, held as the swap's copy, with the element raised
 * above it; a reveal opens the element, under the old state. With
 * `rideWith`, an element the glide moves after that edge (a rail's content
 * column), the edge rides its glide, frame by frame, so the two never part,
 * also when this reverses a running reveal; without it the edge follows the
 * motion's curve. `parts` gives the caller's own fades, told whether the edge
 * conceals and the element as it is now. Under Reduce Motion it follows
 * `design:reduced-motion`: opacity only under a coarse primary pointer (DR2),
 * an immediate change otherwise (DR3). `current` is the element after the
 * commit, when it remounted.
 */
export function playLayoutEdge(
  hold: LayoutEdgeHold,
  current: HTMLElement | null,
  handle: AnimatedLayout,
  {
    edge = 'block-end',
    rideWith = null,
    parts,
  }: {
    edge?: LayoutEdge;
    rideWith?: Element | null;
    parts?: (isConceal: boolean, element: HTMLElement) => LayoutEdgeParts;
  } = {},
): LayoutEdgeMotion {
  const {rect: before, swap, extent: from} = hold;
  const element = current?.isConnected === true ? current : hold.element;
  if (!element.isConnected) {
    return SETTLED;
  }
  const motion = layoutMotion(element);
  const next = element.getBoundingClientRect();
  const isInline = edge.startsWith('inline');
  const extentOfBox = (box: DOMRect) => (isInline ? box.width : box.height);
  const to = extentOfBox(next);
  if (motion.kind === 'instant' || Math.abs(to - from) < 0.5) {
    return SETTLED;
  }
  const isConceal = to < from;
  const isEnd = edge.endsWith('end');
  const rtl = isInline && isRtl(element);
  // The row that holds the element and the ridden element, or its parent.
  const host =
    rideWith?.parentElement != null && rideWith.parentElement.contains(element)
      ? rideWith.parentElement
      : element.parentElement;
  // Riding needs the swap: its frames carry the ridden element's travel.
  // Without one (old state that cannot be copied) the edge follows the
  // motion's curve.
  const rides =
    host != null &&
    rideWith != null &&
    rideWith.parentElement === host &&
    swap != null;
  // The ridden element's travel so far, towards the edge's side.
  const sign = isEnd ? 1 : -1;
  const towards = (ride: LayoutRide) =>
    sign * (isInline ? (rtl ? -ride.x : ride.x) : ride.y);
  const extentAt = (p: number, ride: LayoutRide) =>
    rides ? from + towards(ride) : from + (to - from) * p;
  const clip = (hidden: number) => pxClip(edge, hidden, rtl);
  const now = () => Number(element.ownerDocument.timeline?.currentTime ?? 0);
  // The start this change's animations share, which after a block is later
  // than the frame time the timeline still reads (startFor).
  const startedAt =
    changeStartIn(areaOf(handle, element), element.ownerDocument)?.at ?? 0;
  const durationMs =
    motion.kind === 'glide' ? motion.progress.durationMs : motion.durationMs;
  const progressAt = (ms: number) =>
    motion.kind === 'glide'
      ? 1 - motion.progress.remaining(Math.min(ms, durationMs))
      : 0;
  const shown = (): {extent: number; progress: number} | null => {
    const elapsed = Math.max(0, now() - startedAt);
    if (elapsed >= durationMs) {
      return null;
    }
    // The fades are read at the change's start, where the glide it retargets
    // carries on. The extent stays on the timeline's frame, the frame a ride
    // is measured from.
    const progress = progressAt(
      Math.max(elapsed, layoutStartFor(element.ownerDocument) - startedAt),
    );
    let extent = from + (to - from) * progressAt(elapsed);
    if (rides && rideWith != null) {
      // The edge is the ridden element's: read it where it shows, on the
      // timeline's clock.
      const ridden = shownBoxAt(rideWith, now());
      const own = element.getBoundingClientRect();
      extent = !isInline
        ? isEnd
          ? ridden.top - own.top
          : own.bottom - ridden.bottom
        : isEnd !== rtl
          ? ridden.left - own.left
          : own.right - ridden.right;
    }
    return {extent, progress};
  };
  // The ride, when the ridden element does not glide: its whole travel at
  // once, physical (its old place less its new).
  const travel = sign * (from - to);
  const rideSpec =
    rides && rideWith != null
      ? {
          element: rideWith,
          travel: isInline
            ? {x: rtl ? -travel : travel, y: 0}
            : {x: 0, y: travel},
          isCopyMoved: false,
        }
      : undefined;
  // The copy keeps the element's fixed edge (the one opposite `edge`) where
  // the element is now, so it meets the element wherever it sits.
  const fixedAtStart = isEnd !== (isInline && rtl);
  const at = new DOMRect(
    isInline && !fixedAtStart ? next.right - before.width : next.left,
    !isInline && !isEnd ? next.bottom - before.height : next.top,
    before.width,
    before.height,
  );
  const own = parts?.(isConceal, element) ?? {};
  const copyOpacity = own.copyOpacity ?? (() => 1);

  if (isConceal) {
    // A conceal covers the old state, held by the swap, from the extent it
    // shows down to the new one; the element, raised above it, shows through.
    if (swap == null || host == null) {
      return SETTLED;
    }
    let raised: HTMLElement | null = element;
    while (raised != null && raised.parentElement !== host) {
      raised = raised.parentElement;
    }
    const restore = raised == null ? null : {position: raised.style.position};
    // The copy paints at the element's own level: just before it in the
    // host, with no z-index, so page content stacks against the pair as it
    // does against the element alone. The element, positioned, paints above
    // the copy by tree order.
    if (raised != null && getComputedStyle(raised).position === 'static') {
      raised.style.position = 'relative';
    }
    const end = playLayoutSwap(
      {...swap, rect: at},
      {
        host,
        isOpaque: true,
        copyBefore: raised ?? undefined,
        copy: (p, ride) => ({
          clipPath: clip(extentOfBox(before) - extentAt(p, ride)),
          opacity: copyOpacity(p),
        }),
        copyText: own.copyText,
        rideWith: rideSpec,
        onEnd: () => {
          if (raised != null && restore != null) {
            raised.style.position = restore.position;
          }
        },
        incoming: own.incoming ?? [],
      },
    );
    return {end, shown};
  }

  // A reveal opens the element from the extent it showed, under the old
  // state held by the same swap.
  const incoming = [
    {
      element,
      frames: (p: number, ride: LayoutRide) => ({
        clipPath: clip(to - extentAt(p, ride)),
      }),
    },
    ...(own.incoming ?? []),
  ];
  const end =
    swap != null && host != null
      ? playLayoutSwap(
          {...swap, rect: at},
          {
            host,
            isOpaque: true,
            copy: p => ({opacity: copyOpacity(p)}),
            copyText: own.copyText,
            rideWith: rideSpec,
            incoming,
          },
        )
      : playLayoutFrames(handle, incoming);
  return {end, shown};
}

// ---------------------------------------------------------------------------
// The edge reveal of a resized element (`spec:AST-105` FR9, no copy)
// ---------------------------------------------------------------------------

/** A resized element's edge reveal, reported around its change. */
export interface LayoutEdgeReport {
  /** Before the change commits: measures the element and what moves. */
  measureBefore(): void;
  /**
   * After the new size is applied, before paint: the element reveals or
   * conceals by its edge, from the extent it showed to its new one, and the
   * content beside it glides on the same motion.
   */
  animate(): void;
  /** Ends a running reveal or conceal at once, removing what it holds. */
  cancel(): void;
}

/** A running edge reveal of a resized element. */
interface ResizeReveal {
  readonly animation: Animation | null;
  /** The extent it shows `t` ms in, in its own px. */
  shownAt: (t: number) => number;
  /** Its extent along the edge's axis as laid out, held or not. */
  readonly box: number;
  /** Ends it, putting back what it replaced. */
  release(): void;
}

const resizeReveals = sharedWeakMap<Element, ResizeReveal>(
  'motion/animated-layout/resize-reveals',
  1,
);

/** The inline properties a size hold sets, by axis. */
const HOLD_PROPERTIES = {
  inline: [
    'inline-size',
    'min-inline-size',
    'max-inline-size',
    'flex-basis',
    'flex-grow',
    'flex-shrink',
  ],
  block: [
    'block-size',
    'min-block-size',
    'max-block-size',
    'flex-basis',
    'flex-grow',
    'flex-shrink',
  ],
} as const;

/**
 * The inside of an element as it was laid out: its padding along an axis, its
 * overflow and its scroll offset. A size change can change them in the same
 * commit, as a LayoutPanel at width 0 drops its padding and stops scrolling.
 */
interface LaidOutInside {
  /** Its padding at the axis's start and end. */
  readonly gutters: readonly [string, string];
  /** Its overflow across and down. */
  readonly overflow: readonly [string, string];
  /** Its scroll offset across and down. */
  readonly scroll: readonly [number, number];
}

function insideOf(
  element: HTMLElement,
  axis: 'inline' | 'block',
): LaidOutInside {
  const style = getComputedStyle(element);
  return {
    gutters: [
      style.getPropertyValue(`padding-${axis}-start`),
      style.getPropertyValue(`padding-${axis}-end`),
    ],
    overflow: [
      style.getPropertyValue('overflow-x'),
      style.getPropertyValue('overflow-y'),
    ],
    scroll: [element.scrollLeft, element.scrollTop],
  };
}

function restoreScroll(element: HTMLElement, inside: LaidOutInside): void {
  const [across, down] = inside.scroll;
  if (element.scrollLeft !== across) {
    element.scrollLeft = across;
  }
  if (element.scrollTop !== down) {
    element.scrollTop = down;
  }
}

/**
 * Holds `element` at `extent` own px along `edge`'s axis while it conceals to
 * `keep`, freeing the difference by the margin on that edge's side, so what
 * lies beyond the edge stays where the new size puts it. Its padding,
 * overflow and scroll offset stay as `inside` measured them, so nothing in it
 * moves while it is clipped. Returns what puts back every value it set.
 * When no margin frees it, as the content on that side did not stay put, it
 * sets nothing and returns null.
 */
function holdExtent(
  element: HTMLElement,
  area: Element,
  edge: LayoutEdge,
  extent: number,
  keep: number,
  inside: LaidOutInside,
): (() => void) | null {
  const axis = edge.startsWith('inline') ? 'inline' : 'block';
  const margin = `margin-${edge}`;
  const insideProperties = [
    [`padding-${axis}-start`, inside.gutters[0]],
    [`padding-${axis}-end`, inside.gutters[1]],
    ['overflow-x', inside.overflow[0]],
    ['overflow-y', inside.overflow[1]],
  ] as const;
  const properties = [
    ...HOLD_PROPERTIES[axis],
    margin,
    ...insideProperties.map(([property]) => property),
  ];
  const prior = properties.map(
    property =>
      [
        property,
        element.style.getPropertyValue(property),
        element.style.getPropertyPriority(property),
      ] as const,
  );
  const restore = () => {
    for (const [property, value, priority] of prior) {
      if (value === '') {
        element.style.removeProperty(property);
      } else {
        element.style.setProperty(property, value, priority);
      }
    }
  };
  const isEnd = edge.endsWith('end');
  const rtl = axis === 'inline' && isRtl(element);
  const beyond = isEnd
    ? nextInFlow(element, area)
    : previousInFlow(element, area);
  const before = beyond == null ? null : placeOf(beyond, rtl);
  const size = `${extent}px`;
  element.style.setProperty(`${axis}-size`, size, 'important');
  element.style.setProperty(`min-${axis}-size`, size, 'important');
  element.style.setProperty(`max-${axis}-size`, size, 'important');
  element.style.setProperty('flex-basis', 'auto', 'important');
  element.style.setProperty('flex-grow', '0', 'important');
  element.style.setProperty('flex-shrink', '0', 'important');
  for (const [property, value] of insideProperties) {
    if (value !== '') {
      element.style.setProperty(property, value, 'important');
    }
  }
  element.style.setProperty(margin, `${keep - extent}px`, 'important');
  if (beyond != null && before != null) {
    // One correction from the measured result (a gap, the element's own
    // margin), then everything beyond the edge must be where it was.
    const landed = placeOf(beyond, rtl);
    const scale = scaleOf(element, element.getBoundingClientRect());
    const perPx = axis === 'inline' ? scale.x : scale.y;
    const sign = isEnd ? 1 : -1;
    const drift = (landed[axis] - before[axis]) * sign;
    if (Math.abs(drift) > 0.5) {
      element.style.setProperty(
        margin,
        `${keep - extent - drift / perPx}px`,
        'important',
      );
    }
    const settled = placeOf(beyond, rtl);
    if (
      Math.abs(settled.block - before.block) > 1 ||
      Math.abs(settled.inline - before.inline) > 1
    ) {
      restore();
      return null;
    }
  }
  restoreScroll(element, inside);
  return restore;
}

/**
 * Reports a resized element's edge reveal (`spec:AST-105` FR9) with no copy:
 * a resize controller's pane collapsing or opening beside the content it
 * shares a row with (`component:Resizable` FR8, `component:LayoutPanel`
 * FR7). Measure before the change commits and animate after the
 * new size is applied, as `reportLayoutChange` does; the content beside the
 * element glides through that report. A larger extent reveals by `edge` from
 * the extent the element showed. A smaller one conceals: the element is held
 * at the extent it was laid out at, the difference freed by the margin on
 * that edge's side so the content beyond it stays where the new size puts it,
 * and clipped down to its new extent; the hold goes when the motion ends.
 * Its padding, overflow and scroll offset stay as laid out while it is held,
 * so nothing inside it jumps when the new size changes them. The
 * moving edge rides the glide of the content on that side, frame by frame,
 * and a change made while it runs starts from the extent it shows. It slides:
 * nothing fades. Under Reduce Motion with a coarse primary pointer a reveal
 * fades in and a conceal lands at once (`design:reduced-motion` DR2); with a
 * fine one every change lands at once (DR3).
 */
export function reportLayoutEdge(
  handle: AnimatedLayout | null | undefined,
  getElement: () => HTMLElement | null,
  {edge = 'block-end'}: {edge?: LayoutEdge} = {},
): LayoutEdgeReport {
  const report = reportLayoutChange(handle, getElement);
  /**
   * What the element showed, its laid-out extent and its box, before the
   * change.
   */
  let measured: {
    shown: number;
    box: number;
    rect: DOMRect;
    inside: LaidOutInside;
  } | null = null;
  const axis = edge.startsWith('inline') ? 'inline' : 'block';
  const release = (element: HTMLElement | null) => {
    if (element == null) {
      return;
    }
    resizeReveals.get(element)?.release();
  };
  return {
    measureBefore() {
      const element = getElement();
      measured = null;
      if (element != null) {
        beginChange(element.ownerDocument);
        const running = resizeReveals.get(element);
        const elapsed = Number(running?.animation?.currentTime);
        const rect = element.getBoundingClientRect();
        // A running conceal holds the inside as it was laid out.
        const inside = insideOf(element, axis);
        measured =
          running == null
            ? {
                shown: extentOf(element, edge),
                box: extentOf(element, edge),
                rect,
                inside,
              }
            : {
                shown: running.shownAt(
                  Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0,
                ),
                box: running.box,
                rect,
                inside,
              };
        running?.release();
      }
      report.measureBefore();
    },
    animate() {
      report.animate();
      const element = getElement();
      const before = measured;
      measured = null;
      if (handle == null || element == null || before == null) {
        return;
      }
      // A conceal released to reverse can drop the scroll offset.
      restoreScroll(element, before.inside);
      const area = areaOf(handle, element);
      if (area == null) {
        return;
      }
      const after = extentOf(element, edge);
      if (Math.abs(after - before.shown) < 0.5) {
        return;
      }
      // In the area's visible part before or after: a pane collapsing to
      // nothing has no box after.
      const visible = visibleRect(area);
      if (
        !intersects(element.getBoundingClientRect(), visible) &&
        !intersects(before.rect, visible)
      ) {
        return;
      }
      const motion = layoutMotion(area);
      if (motion.kind === 'instant') {
        return;
      }
      const isConceal = after < before.shown;
      const change = changeStartIn(area, element.ownerDocument);
      if (motion.kind === 'fade') {
        if (!isConceal) {
          safeAnimate(
            element,
            [{opacity: 0}, {opacity: 1}],
            {duration: motion.durationMs, easing: motion.easing},
            change,
          );
        }
        return;
      }
      const {progress} = motion;
      const rtl = edge.startsWith('inline') && isRtl(element);
      // The box the clip works in: the new one for a reveal; for a conceal,
      // the one it was laid out at, held while it runs.
      const box = isConceal ? Math.max(before.box, before.shown) : after;
      const restore = isConceal
        ? holdExtent(element, area, edge, box, after, before.inside)
        : () => {};
      if (restore == null) {
        return;
      }
      // Hidden at the start and at the end, in the box's own px.
      const from = box - before.shown;
      const to = box - after;
      const curve = (t: number) => to + (from - to) * progress.remaining(t);
      const animation = safeAnimate(
        element,
        sampleOver(progress.durationMs, t => ({
          clipPath: pxClip(edge, curve(t), rtl),
        })),
        {duration: progress.durationMs, easing: 'linear'},
        change,
      );
      const reveal: ResizeReveal = {
        animation,
        shownAt: t => box - curve(t),
        box,
        release: () => {
          if (resizeReveals.get(element) !== reveal) {
            return;
          }
          resizeReveals.delete(element);
          animation?.cancel();
          restore();
        },
      };
      if (animation == null) {
        restore();
        return;
      }
      resizeReveals.set(element, reveal);
      animation.addEventListener?.('finish', reveal.release);
      rideNeighbour(
        element,
        area,
        edge,
        rtl,
        animation,
        () => resizeReveals.get(element) === reveal,
        // Anywhere in its box: the content beside it may carry a running
        // motion past where this one starts or ends, and the edge follows.
        towards =>
          Math.min(box, Math.max(0, isConceal ? to - towards : -towards)),
        hidden => ({clipPath: pxClip(edge, hidden, rtl)}),
        hiddenAt => {
          reveal.shownAt = t => box - hiddenAt(t);
        },
      );
    },
    cancel() {
      measured = null;
      release(getElement());
    },
  };
}

/**
 * A disclosure's indicator (its chevron) turns on the same motion as the
 * glide. Its CSS transition takes the theme's move curve and duration as the
 * glide reads them where the area is, and is immediate under Reduce Motion.
 * Without a handle the inline values are cleared, so the component's own
 * transition applies.
 */
export function applyLayoutChangeTransition(
  handle: AnimatedLayout | null | undefined,
  element: HTMLElement | SVGElement | null,
): void {
  if (element == null) {
    return;
  }
  const area = handle == null ? null : areaOf(handle, element);
  if (area == null) {
    transitionSettles.get(element)?.();
    element.style.removeProperty('transition-duration');
    element.style.removeProperty('transition-timing-function');
    return;
  }
  const motion = layoutMotion(area);
  if (motion.kind !== 'glide') {
    transitionSettles.get(element)?.();
    element.style.setProperty('transition-duration', '0s');
    element.style.removeProperty('transition-timing-function');
    return;
  }
  // Values, not the tokens: a theme scope between the area and the indicator
  // would retime a token that the indicator reads where it is.
  const ms = Math.round(motion.progress.durationMs * 1000) / 1000;
  element.style.setProperty('transition-duration', `${ms}ms`);
  element.style.setProperty(
    'transition-timing-function',
    motion.progress.easing,
  );
  settleTransition(element, motion.progress);
}

/**
 * Lands `element`'s running glide at once: it takes its layout place, and a
 * later change starts from there (a change its caller lands rather than
 * animates, such as a rail that snaps).
 */
export function landLayoutGlide(element: Element): void {
  const glide = glides.get(element);
  if (glide != null) {
    glides.delete(element);
    glide.animation.cancel();
  }
}

/**
 * Lands the sideways part of `element`'s running glide at once and keeps its
 * vertical move. It changes the glide's frames, and what a later change
 * carries from it, together. It is for an adopter that moves the element's
 * own sideways translation onto its children between the two reads. A list
 * row that a swipe left open is one.
 */
export function landLayoutGlideSideways(element: Element): void {
  const glide = glides.get(element);
  const effect = glide?.animation.effect as KeyframeEffect | null | undefined;
  if (
    glide == null ||
    effect == null ||
    typeof effect.setKeyframes !== 'function'
  ) {
    return;
  }
  effect.setKeyframes(
    effect.getKeyframes().map(({computedOffset: _, translate, ...frame}) => {
      const [, y = '0px'] = String(translate ?? '').split(/\s+/);
      return {...frame, translate: `0px ${y}`};
    }),
  );
  const vertical: Glide = {
    animation: glide.animation,
    offsetAt: t => ({x: 0, y: glide.offsetAt(t).y}),
    get durationMs() {
      return glide.durationMs;
    },
    shownBefore: {x: 0, y: glide.shownBefore.y},
    scale: glide.scale,
  };
  glides.set(element, vertical);
  glide.animation.addEventListener?.('finish', () => {
    if (glides.get(element) === vertical) {
      glides.delete(element);
    }
  });
}

/**
 * @internal The motion a change in `area` plays, for tests and for SideNav's
 * rail motion, which plays on the same clock (`component:SideNav` FR6).
 */
export function layoutMotionFor(area: Element): LayoutMotion {
  return layoutMotion(area);
}
