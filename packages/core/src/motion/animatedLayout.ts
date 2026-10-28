// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.ts
 * @input The DOM (layout rectangles, computed style), Web Animations, the
 *   internal `springs.settle` motion role (motion/roles.ts) and the Reduce Motion
 *   cross-fade clock (uikit/timing.ts)
 * @output Exports `createAnimatedLayout` and the opaque `AnimatedLayout`
 *   handle, `reportLayoutChange`, `playLayoutChange`, `holdLayoutExit` /
 *   `releaseLayoutExit`, the in-place swap (`holdLayoutSwap` /
 *   `playLayoutSwap`), `playLayoutFrames` and `applyLayoutChangeTransition`:
 *   the one module
 *   that produces the
 *   size-change glide `spec:AST-105` defines
 *   (`architecture:react-component-runtime` INV12)
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
 *   new move are summed into one new glide, velocity included. Nothing
 *   animates height, and nothing scrolls the area.
 * - A measurement no commit claims by the next frame is dropped.
 * - The changed element plays its own entrance on the same spring, started in
 *   the same frame (`playLayoutChange`), or its exit: kept where it is while
 *   it gives up its space and conceals (`holdLayoutExit`). A disclosure's
 *   indicator turns on the same motion (`applyLayoutChangeTransition`).
 * - A swap holds old content as one transient copy, inert and hidden from
 *   assistive technology, while new content enters in its place, on the same
 *   motion, and removes it when the swap ends (`holdLayoutSwap`,
 *   `playLayoutSwap`; `spec:AST-105` FR8). The caller shapes the frames over
 *   the swap's progress and, riding a gliding element, how far it has moved,
 *   so every part keeps to that glide; under Reduce Motion with a coarse
 *   pointer only opacity changes.
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
    entry.after = entry.element.getBoundingClientRect();
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
            batch.before.set(candidate, rect);
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

/**
 * The changed element's own animation, on the same motion as the content
 * after it: content that appears reveals downward from its top edge. Plays
 * only with a handle, inside its area and in the area's visible part.
 * Returns the entrance it started, or null when it played none.
 */
export function playLayoutChange(
  handle: AnimatedLayout | null | undefined,
  element: Element,
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
  if (motion.kind === 'fade') {
    return safeAnimate(element, [{opacity: 0}, {opacity: 1}], {
      duration: motion.durationMs,
      easing: motion.easing,
    });
  }
  return safeAnimate(
    element,
    sampleKeyframes(motion.progress, remaining => ({
      opacity: 1 - remaining,
      clipPath: `inset(0 0 ${round(remaining * 100)}% 0)`,
    })),
    {duration: motion.progress.durationMs, easing: 'linear'},
  );
}

/** The inline properties an exit sets, so a release removes exactly them. */
const EXIT_PROPERTIES = [
  'margin-block-end',
  'margin-inline-end',
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
function giveUpSpace(element: HTMLElement, area: Element): boolean {
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
  const property = isRow ? 'margin-inline-end' : 'margin-block-end';
  const size = isRow ? element.offsetWidth : element.offsetHeight;
  const next = nextInFlow(element, area);
  if (next == null) {
    // Nothing after it in the area to land anywhere.
    element.style.setProperty(property, `${-size}px`);
    return true;
  }
  const own = element.style.getPropertyValue(property);
  const ownPriority = element.style.getPropertyPriority(property);
  const axis = isRow ? 'inline' : 'block';
  // The content after its container must land too: a flex-row item that
  // sets its row's height moves what follows the row.
  const afterParent =
    element.parentElement == null || element.parentElement === area
      ? null
      : nextInFlow(element.parentElement, area);
  const checked = afterParent == null ? [next] : [next, afterParent];
  // The element's scale, read in the layout the caller's visibility check
  // already laid out.
  const scale = scaleOf(element, element.getBoundingClientRect());
  // Where the content after it goes once it is hidden, read with it taken
  // out of flow (not `display: none`, which would restart the CSS animations
  // inside it).
  const position = element.style.getPropertyValue('position');
  const positionPriority = element.style.getPropertyPriority('position');
  element.style.setProperty('position', 'absolute', 'important');
  const targets = checked.map(box => placeOf(box, rtl));
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
  const guess = placeOf(next, rtl)[axis];
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
  if (!giveUpSpace(element, area)) {
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
  const animation =
    motion.kind === 'fade'
      ? safeAnimate(element, [{opacity: 1}, {opacity: 0}], {
          duration: motion.durationMs,
          easing: motion.easing,
          fill: 'forwards',
        })
      : safeAnimate(
          element,
          sampleKeyframes(motion.progress, remaining => ({
            opacity: remaining,
            clipPath: `inset(0 0 ${round((1 - remaining) * 100)}% 0)`,
          })),
          {
            duration: motion.progress.durationMs,
            easing: 'linear',
            fill: 'forwards',
          },
        );
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
