// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.ts
 * @input The DOM (layout rectangles, computed style), Web Animations, the
 *   internal `springs.settle` motion role (motion/roles.ts) and the Reduce Motion
 *   cross-fade clock (uikit/timing.ts)
 * @output Exports `createAnimatedLayout` and the opaque `AnimatedLayout`
 *   handle, `reportLayoutChange`, `playLayoutChange`, `holdLayoutExit` /
 *   `releaseLayoutExit`, the in-place swap (`holdLayoutSwap` /
 *   `playLayoutSwap`), the edge reveal's two-state form (`holdLayoutEdge` /
 *   `playLayoutEdge`), `playLayoutFrames` and `applyLayoutChangeTransition`:
 *   the one module that produces the size-change glide and the edge reveal
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
 *   old place to the new one, sampled from `springs.settle` into linear
 *   keyframes and corrected for a scaled ancestor. An element already gliding
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
 * - The changed element plays its own entrance on the same spring, started in
 *   the same frame (`playLayoutChange`), or its exit: kept where it is while
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

import {motionRole} from './roles';
import {
  inertCopy,
  isCopyable,
  paintedBackground,
  placeOver,
  visiblePartCopy,
  wrapText,
} from './transientCopy';
import {isSpring} from './roleValue';
import {solveSpring, toSpring, type SpringDescription} from './spring';
import {registerSpringsTable, SETTLE_SPRING} from './uikit/springs';
import {reducedMotionCrossFade} from './uikit/timing';

/** The shared motion role (`spec:AST-105` FR4). */
const ROLE_ID = 'springs.settle';
/** Below this many pixels a shift is not worth a move. */
const MIN_SHIFT_PX = 0.5;
/** The touch cross-fade's cap (`design:reduced-motion` DR2). */
const CROSS_FADE_CAP_MS = 200;
/** Keyframes per second the spring is sampled at. */
const SAMPLES_PER_SECOND = 60;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/** How a change plays under the reader's settings. */
type LayoutMotion =
  | {readonly kind: 'spring'; readonly progress: SpringProgress}
  | {
      readonly kind: 'fade';
      readonly durationMs: number;
      readonly easing: string;
    }
  | {readonly kind: 'instant'};

/** The settle spring as remaining distance (1 → 0) over its duration. */
interface SpringProgress {
  readonly durationMs: number;
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
 * `springs.settle` from the internal role registry: one shared value for the
 * glide, the changed element and the indicator. Motion roles are internal
 * (`spec:AST-094` DEC-11): no theme, scope or custom property changes it.
 */
function settleSpring(): SpringDescription {
  registerSpringsTable();
  const value = motionRole(ROLE_ID)?.value;
  return isSpring(value) ? value : SETTLE_SPRING;
}

function springProgress(description: SpringDescription): SpringProgress {
  const curve = solveSpring(toSpring(description), {from: 1, to: 0});
  const durationMs = Math.max(1, curve.settleTime(0.001) * 1000);
  return {
    durationMs,
    remaining: t => (t >= durationMs ? 0 : curve.value(t / 1000)),
  };
}

/** The motion a change in `area` plays now. */
function layoutMotion(area: Element): LayoutMotion {
  if (matches(area, '(prefers-reduced-motion: reduce)')) {
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
  return {kind: 'spring', progress: springProgress(settleSpring())};
}

/** Linear keyframes over `durationMs`, one per frame, from `frame(t ms)`. */
function sampleOver(
  durationMs: number,
  frame: (t: number) => Keyframe,
): Keyframe[] {
  const count = Math.max(
    2,
    Math.ceil((durationMs / 1000) * SAMPLES_PER_SECOND) + 1,
  );
  const keyframes: Keyframe[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i / (count - 1);
    keyframes.push({...frame(offset * durationMs), offset});
  }
  return keyframes;
}

/** Linear keyframes sampled from the spring, one per frame. */
function sampleKeyframes(
  progress: SpringProgress,
  frame: (remaining: number) => Keyframe,
): Keyframe[] {
  return sampleOver(progress.durationMs, t => frame(progress.remaining(t)));
}

/** The spring as a CSS `linear()` easing, for a CSS transition. */
function linearEasing(progress: SpringProgress): string {
  const stops: string[] = [];
  const count = 24;
  for (let i = 0; i <= count; i++) {
    const fraction = i / count;
    const value = 1 - progress.remaining(fraction * progress.durationMs);
    stops.push(`${round(value)} ${round(fraction * 100)}%`);
  }
  return `linear(${stops.join(', ')})`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

/**
 * Play `keyframes` on `element`. Every option here (linear easing over sampled
 * keyframes, replace composition) is one any Web Animations engine takes, so
 * a failure means no Web Animations at all: the change then lands at once.
 */
function safeAnimate(
  element: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
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
  // Started on the document timeline's current time, not on the next frame:
  // a retargeted glide keeps moving through the frame it is replaced in, and
  // every animation of one change shares the same start.
  const now = element.ownerDocument.timeline?.currentTime;
  if (now != null) {
    animation.startTime = now;
  }
  return animation;
}

/** Every animation this module started, so it can tell the app's apart. */
const ours = new WeakSet<Animation>();

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

/** A glide an element is playing, so a new change can retarget it. */
interface Glide {
  readonly animation: Animation;
  readonly offsetAt: OffsetCurve;
  readonly durationMs: number;
}

const glides = new WeakMap<Element, Glide>();

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

const AREA = Symbol('astryx.animatedLayout.area');

/**
 * The opaque handle `useAnimatedLayout` returns (`spec:AST-105` FR1): no
 * public members. A component that receives it reports its size changes to
 * the handle's container, the area the glide stays inside.
 */
export interface AnimatedLayout {
  readonly [AREA]: () => Element | null;
}

/** A handle over `area` (the container element, read when a change runs). */
export function createAnimatedLayout(
  area: () => Element | null,
): AnimatedLayout {
  // Not enumerable and frozen: the handle shows no fields to a caller.
  return Object.freeze(
    Object.defineProperty({}, AREA, {value: area}),
  ) as AnimatedLayout;
}

function areaOf(handle: AnimatedLayout, element: Element): Element | null {
  const area = handle[AREA]();
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
}

const batches = new Map<Element, Batch>();

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
  const visible = visibleRect(batch.area);
  // Every running glide stops first and every new place is read before any
  // glide starts, so no reading includes another's new motion.
  const entries: {
    readonly element: Element;
    readonly before: DOMRect;
    readonly carried: OffsetCurve;
    readonly carriedMs: number;
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
    if (running != null) {
      const time = Number(running.animation.currentTime);
      const elapsed = Number.isFinite(time) ? Math.max(0, time) : 0;
      if (elapsed < running.durationMs) {
        carried = t => running.offsetAt(elapsed + t);
        carriedMs = running.durationMs - elapsed;
      }
      running.animation.cancel();
      glides.delete(element);
    }
    entries.push({element, before, carried, carriedMs});
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
    const {element, before, carried, carriedMs} = entry;
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
      safeAnimate(element, [{opacity: 0}, {opacity: 1}], {
        duration: motion.durationMs,
        easing: motion.easing,
      });
      continue;
    }
    if (entry.isMovedByApp === true) {
      // The app moves it itself: it takes its final place at once
      // (`spec:AST-105` Coverage).
      continue;
    }
    // Where it shows now, against its new place, in its own px; the part the
    // carried glide does not cover is the new move.
    const scale = entry.scale ?? {x: 1, y: 1};
    const now = carried(0);
    const moveX = dx / scale.x - now.x;
    const moveY = dy / scale.y - now.y;
    const {progress} = motion;
    const offsetAt: OffsetCurve = t => {
      const remaining = progress.remaining(t);
      const carry = carried(t);
      return {x: carry.x + moveX * remaining, y: carry.y + moveY * remaining};
    };
    const durationMs = Math.max(progress.durationMs, carriedMs);
    // One replace-composited `translate`: the compositor runs it (INV12).
    const animation = safeAnimate(
      element,
      sampleOver(durationMs, t => {
        const offset = offsetAt(t);
        return {translate: `${offset.x}px ${offset.y}px`};
      }),
      {duration: durationMs, easing: 'linear'},
    );
    if (animation != null) {
      const glide: Glide = {animation, offsetAt, durationMs};
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
        // After every layout effect of this commit, before paint.
        queueMicrotask(() => flush(batch));
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
}

/** Each element's running one-state reveal or conceal. */
const edgeMotions = new WeakMap<Element, EdgeMotion>();

/**
 * What a one-state motion an adopter stopped (`releaseLayoutExit`) showed,
 * and the timeline time it stopped at: a reveal started in the same frame,
 * the reversal that stopped it, starts there.
 */
const stoppedShown = new WeakMap<
  Element,
  {readonly fraction: number; readonly at: number}
>();

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
    return fraction;
  }
  const stopped = stoppedShown.get(element);
  stoppedShown.delete(element);
  if (stopped != null && stopped.at === timelineNow(element)) {
    return stopped.fraction;
  }
  return atRest;
}

/** Records `animation` as `element`'s running one-state motion. */
function trackEdgeMotion(
  element: Element,
  animation: Animation,
  shownAt: (t: number) => number,
): EdgeMotion {
  const motion: EdgeMotion = {animation, shownAt};
  edgeMotions.set(element, motion);
  animation.addEventListener?.('finish', () => {
    if (edgeMotions.get(element) === motion) {
      edgeMotions.delete(element);
    }
  });
  return motion;
}

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
  onRide: (hidden: (t: number) => number) => void,
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
    const durationMs = Math.max(glide.durationMs, own?.durationMs ?? 0);
    // The neighbour's offset from its place relative to the element's,
    // towards the edge's side.
    const sign = isEnd ? 1 : -1;
    const hidden = (t: number): number => {
      const offset = glide.offsetAt(t);
      const moved = own?.offsetAt(t) ?? {x: 0, y: 0};
      return hiddenAt(
        sign *
          (edge.startsWith('inline')
            ? (rtl ? -1 : 1) * (offset.x - moved.x)
            : offset.y - moved.y),
      );
    };
    effect.setKeyframes(sampleOver(durationMs, t => frame(hidden(t))));
    effect.updateTiming?.({duration: durationMs});
    onRide(hidden);
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
    hidden => ({
      opacity: 1 - hidden / extent,
      clipPath: pxClip(edge, hidden, rtl),
    }),
    hiddenAt => {
      motion.shownAt = t => 1 - hiddenAt(t) / extent;
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
  if (motion.kind === 'fade') {
    return safeAnimate(element, [{opacity: from}, {opacity: 1}], {
      duration: motion.durationMs,
      easing: motion.easing,
    });
  }
  const {progress} = motion;
  const rtl = edge.startsWith('inline') && isRtl(element);
  const animation = safeAnimate(
    element,
    sampleKeyframes(progress, remaining => {
      const hidden = (1 - from) * remaining;
      return {opacity: 1 - hidden, clipPath: fractionClip(edge, hidden, rtl)};
    }),
    {duration: progress.durationMs, easing: 'linear'},
  );
  if (animation != null) {
    const tracked = trackEdgeMotion(
      element,
      animation,
      t => 1 - (1 - from) * progress.remaining(t),
    );
    rideEdge(element, area, edge, rtl, tracked, false);
  }
  return animation;
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
const exits = new WeakMap<Element, Animation | null>();

/** What an exit replaced on its element, so a release puts back exactly it. */
interface Replaced {
  readonly inert: boolean;
  readonly styles: ReadonlyArray<readonly [string, string, string]>;
}
const replaced = new WeakMap<Element, Replaced>();

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
  let animation: Animation | null;
  if (motion.kind === 'fade') {
    animation = safeAnimate(element, [{opacity: from}, {opacity: 0}], {
      duration: motion.durationMs,
      easing: motion.easing,
      fill: 'forwards',
    });
  } else {
    const {progress} = motion;
    animation = safeAnimate(
      element,
      sampleKeyframes(progress, remaining => {
        const shown = from * remaining;
        return {opacity: shown, clipPath: fractionClip(edge, 1 - shown, rtl)};
      }),
      {duration: progress.durationMs, easing: 'linear', fill: 'forwards'},
    );
    if (animation != null) {
      const tracked = trackEdgeMotion(
        element,
        animation,
        t => from * progress.remaining(t),
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
  /** The copy paints above its neighbours, in the background it shows. */
  readonly isOpaque?: boolean;
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
  placeOver(copy, how.host, swap.rect);
  if (how.isOpaque === true) {
    copy.style.zIndex = '1';
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
    copyText != null && motion.kind === 'spring' ? wrapText(copy) : [];
  // Each part as a function of time: its frame, or the copy's with its ride.
  const parts: [Element, (p: number, ride: LayoutRide) => Keyframe][] = [];
  if (motion.kind === 'spring') {
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
      const now = glide.offsetAt(t);
      const start = glide.offsetAt(0);
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
  const area = handle?.[AREA]() ?? null;
  const motion = area == null ? null : layoutMotion(area);
  if (motion == null || motion.kind === 'instant') {
    return () => {};
  }
  const animations: Animation[] = [];
  for (const {element, frames: shape} of parts) {
    const animation =
      motion.kind === 'spring'
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
          )
        : safeAnimate(element, [{opacity: 0}, {opacity: 1}], {
            duration: motion.durationMs,
            easing: motion.easing,
          });
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
  const startedAt = now();
  const durationMs =
    motion.kind === 'spring' ? motion.progress.durationMs : motion.durationMs;
  const shown = (): {extent: number; progress: number} | null => {
    const elapsed = now() - startedAt;
    if (elapsed >= durationMs) {
      return null;
    }
    const progress =
      motion.kind === 'spring' ? 1 - motion.progress.remaining(elapsed) : 0;
    let extent = from + (to - from) * progress;
    if (rides && rideWith != null) {
      // The edge is the ridden element's: read it where it shows.
      const ridden = rideWith.getBoundingClientRect();
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
    const restore =
      raised == null
        ? null
        : {position: raised.style.position, zIndex: raised.style.zIndex};
    if (raised != null) {
      if (getComputedStyle(raised).position === 'static') {
        raised.style.position = 'relative';
      }
      raised.style.zIndex = '2';
    }
    const end = playLayoutSwap(
      {...swap, rect: at},
      {
        host,
        isOpaque: true,
        copy: (p, ride) => ({
          clipPath: clip(extentOfBox(before) - extentAt(p, ride)),
          opacity: copyOpacity(p),
        }),
        copyText: own.copyText,
        rideWith: rideSpec,
        onEnd: () => {
          if (raised != null && restore != null) {
            raised.style.position = restore.position;
            raised.style.zIndex = restore.zIndex;
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

const resizeReveals = new WeakMap<Element, ResizeReveal>();

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
 * Holds `element` at `extent` own px along `edge`'s axis while it conceals to
 * `keep`, freeing the difference by the margin on that edge's side, so what
 * lies beyond the edge stays where the new size puts it. Returns what puts
 * back every value it set, or null when no margin frees it (the content on
 * that side did not stay put), having set nothing.
 */
function holdExtent(
  element: HTMLElement,
  area: Element,
  edge: LayoutEdge,
  extent: number,
  keep: number,
): (() => void) | null {
  const axis = edge.startsWith('inline') ? 'inline' : 'block';
  const margin = `margin-${edge}`;
  const properties = [...HOLD_PROPERTIES[axis], margin];
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
 * and clipped down to its new extent; the hold goes when the motion ends. The
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
  let measured: {shown: number; box: number; rect: DOMRect} | null = null;
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
        const running = resizeReveals.get(element);
        const elapsed = Number(running?.animation?.currentTime);
        const rect = element.getBoundingClientRect();
        measured =
          running == null
            ? {
                shown: extentOf(element, edge),
                box: extentOf(element, edge),
                rect,
              }
            : {
                shown: running.shownAt(Number.isFinite(elapsed) ? elapsed : 0),
                box: running.box,
                rect,
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
      if (motion.kind === 'fade') {
        if (!isConceal) {
          safeAnimate(element, [{opacity: 0}, {opacity: 1}], {
            duration: motion.durationMs,
            easing: motion.easing,
          });
        }
        return;
      }
      const {progress} = motion;
      const rtl = edge.startsWith('inline') && isRtl(element);
      // The box the clip works in: the new one for a reveal; for a conceal,
      // the one it was laid out at, held while it runs.
      const box = isConceal ? Math.max(before.box, before.shown) : after;
      const restore = isConceal
        ? holdExtent(element, area, edge, box, after)
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
 * glide: its CSS transition takes the spring as a `linear()` easing, and an
 * immediate change under Reduce Motion. Without a handle the inline values are
 * cleared, so the component's own transition applies. An engine without
 * `linear()` drops that value and keeps the component's easing.
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
    element.style.removeProperty('transition-duration');
    element.style.removeProperty('transition-timing-function');
    return;
  }
  const motion = layoutMotion(area);
  if (motion.kind !== 'spring') {
    element.style.setProperty('transition-duration', '0s');
    element.style.removeProperty('transition-timing-function');
    return;
  }
  element.style.setProperty(
    'transition-duration',
    `${Math.round(motion.progress.durationMs)}ms`,
  );
  element.style.setProperty(
    'transition-timing-function',
    linearEasing(motion.progress),
  );
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
 * @internal The motion a change in `area` plays, for tests and for SideNav's
 * rail motion, which plays on the same clock (`component:SideNav` FR6).
 */
export function layoutMotionFor(area: Element): LayoutMotion {
  return layoutMotion(area);
}
