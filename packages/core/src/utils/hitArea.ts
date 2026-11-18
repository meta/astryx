// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file hitArea.ts
 * @input A target's rect and its neighbours' rects (or, for a live control,
 *   the element and the page around it)
 * @output The touch hit area: how far a target may grow toward 44 px on each
 *   side without taking a tap that is nearer a neighbour. `clampedHitInsets`
 *   and `resolveHitTarget` answer from rects. `watchHitArea` keeps a control's
 *   insets live where the primary pointer is coarse. `groupGrowth` sizes a
 *   group's box from its edge members, and shrinks a side the members do not
 *   reach. `INTERACTIVE_SELECTOR` names what a touch can land on
 * @position Core-internal utility, not exported from `@astryxdesign/core/utils`.
 *   Groups that measure their actions at press start pass `resolveHitTarget`;
 *   a standalone control writes `watchHitArea`'s insets to an invisible
 *   coarse-only hit layer
 *
 */

// A finger needs a 44 × 44 px target, but a control may not grow on a phone,
// and its hit area must never take a neighbor's taps. Each side grows toward
// the minimum and stops at half the gap to the nearest neighbor on that side,
// so a tap always goes to the nearer target. CSS cannot see the neighbors, so a
// live control measures: only under a coarse primary pointer (AST-094), only on
// screen, and in one read pass per frame within a 4 ms budget. Until the first
// pass the insets are 0, so first paint never overlaps anything.
// The insets are lengths in the control's own box, so a pass measures in its
// layout px. A layer that opens from a smaller scale then keeps the insets of
// the size it settles at.

import {subscribeInput} from './inputStream';
import {isElement} from './nodeType';
import {sharedState} from './sharedRealm';
import {
  flushMutations,
  observeContent,
  observeMutations,
} from './sharedMutationObserver';

/** A rect in client pixels. */
export interface HitRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** How far a hit area extends past its target on each side, px. */
export interface HitInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** The smallest touch target, px (Apple's 44 pt). */
export const MIN_TOUCH_TARGET = 44;

/** No growth: the hit area is the target. */
export const NO_HIT_INSETS: HitInsets = {top: 0, right: 0, bottom: 0, left: 0};

/**
 * The custom properties `writeHitInsets` sets, in px, for a coarse-only hit
 * layer to read (`inset: calc(var(--astryx-hit-inset-top, 0px) * -1) ...`).
 */
export const HIT_INSET_PROPERTIES = {
  top: '--astryx-hit-inset-top',
  right: '--astryx-hit-inset-right',
  bottom: '--astryx-hit-inset-bottom',
  left: '--astryx-hit-inset-left',
} as const;

/**
 * The gap between two rects along each axis: positive where they are apart on
 * that axis, negative where their projections overlap.
 */
function gaps(a: HitRect, b: HitRect): {x: number; y: number} {
  return {
    x: Math.max(b.left - a.right, a.left - b.right),
    y: Math.max(b.top - a.bottom, a.top - b.bottom),
  };
}

function grown(rect: HitRect, insets: HitInsets): HitRect {
  return {
    left: rect.left - insets.left,
    top: rect.top - insets.top,
    right: rect.right + insets.right,
    bottom: rect.bottom + insets.bottom,
  };
}

function intersects(a: HitRect, b: HitRect): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

/** How far `rect` grows toward `minSize` on each axis, centered, unclamped. */
function growth(rect: HitRect, minSize: number): HitInsets {
  const x = Math.max(0, (minSize - (rect.right - rect.left)) / 2);
  const y = Math.max(0, (minSize - (rect.bottom - rect.top)) / 2);
  return {top: y, right: x, bottom: y, left: x};
}

/**
 * How far a group's box grows on each side before any neighbour stops it: as
 * far as its members on that edge grow toward `minSize`. So an end member's
 * target reaches past the group, as a lone control's would. A side that
 * reaches past its edge member shrinks to that member's grown edge, a
 * negative growth. So a box wider than its members covers only their targets.
 */
export function groupGrowth(
  group: HitRect,
  members: ReadonlyArray<HitRect>,
  minSize: number = MIN_TOUCH_TARGET,
): HitInsets {
  if (members.length === 0) {
    return NO_HIT_INSETS;
  }
  const insets = {
    top: -Infinity,
    right: -Infinity,
    bottom: -Infinity,
    left: -Infinity,
  };
  for (const member of members) {
    const own = growth(member, minSize);
    insets.top = Math.max(insets.top, own.top - (member.top - group.top));
    insets.right = Math.max(
      insets.right,
      own.right - (group.right - member.right),
    );
    insets.bottom = Math.max(
      insets.bottom,
      own.bottom - (group.bottom - member.bottom),
    );
    insets.left = Math.max(insets.left, own.left - (member.left - group.left));
  }
  return insets;
}

/**
 * How far `target` may grow on each side: toward `minSize` on each axis,
 * centered, and on each side no further than half the gap to a neighbour.
 * A neighbour counts when either one, at full growth toward `minSize`, would
 * reach into the other's half of the gap, or their full areas would meet; it
 * stops the side facing it, or,
 * for a neighbour apart on both axes (diagonal), the side with the larger gap.
 * `full` replaces the centered growth, as `groupGrowth` gives a group's box.
 * That decision rests on the two rects alone, so the neighbour decides the
 * same about this target and the two areas never overlap. A neighbour
 * overlapping the target (an ancestor, an overlay) is not beside it and stops
 * nothing.
 */
export function clampedHitInsets(
  target: HitRect,
  neighbours: ReadonlyArray<HitRect>,
  minSize: number = MIN_TOUCH_TARGET,
  full: HitInsets = growth(target, minSize),
): HitInsets {
  if (
    full.top === 0 &&
    full.right === 0 &&
    full.bottom === 0 &&
    full.left === 0
  ) {
    return NO_HIT_INSETS;
  }
  const insets = {...full};
  for (const rect of neighbours) {
    const gap = gaps(target, rect);
    if (gap.x < 0 && gap.y < 0) {
      continue;
    }
    // Each one's half of the gap: a tap there is nearer that one.
    const half = {
      top: Math.max(0, gap.y) / 2,
      right: Math.max(0, gap.x) / 2,
      bottom: Math.max(0, gap.y) / 2,
      left: Math.max(0, gap.x) / 2,
    };
    // Either one, at full growth, would reach into the other's half, or
    // their full areas would meet (a wide and a tall target, diagonally).
    const reach = grown(target, full);
    const neighbourReach = grown(rect, growth(rect, minSize));
    const crosses =
      intersects(reach, grown(rect, half)) ||
      intersects(neighbourReach, grown(target, half)) ||
      intersects(reach, neighbourReach);
    if (!crosses) {
      continue;
    }
    if (gap.x >= gap.y) {
      if (rect.left >= target.right) {
        insets.right = Math.min(insets.right, half.right);
      } else {
        insets.left = Math.min(insets.left, half.left);
      }
    } else {
      if (rect.top >= target.bottom) {
        insets.bottom = Math.min(insets.bottom, half.bottom);
      } else {
        insets.top = Math.min(insets.top, half.top);
      }
    }
  }
  return insets;
}

function contains(rect: HitRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function distanceTo(rect: HitRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Which of `rects` a touch at (x, y) is for: the nearest target (inside two
 * overlapping targets, the one whose center is nearer), when the touch is
 * within that target's growth toward `minSize`; -1 otherwise. Being nearest,
 * it is on that target's side of every midpoint, corners included. For a
 * group that measures its actions at press start.
 */
export function resolveHitTarget(
  x: number,
  y: number,
  rects: ReadonlyArray<HitRect>,
  minSize: number = MIN_TOUCH_TARGET,
): number {
  let nearest = -1;
  let nearestDistance = Infinity;
  rects.forEach((rect, index) => {
    const distance =
      distanceTo(rect, x, y) * 1e6 +
      Math.hypot(
        x - (rect.left + rect.right) / 2,
        y - (rect.top + rect.bottom) / 2,
      );
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  if (nearest === -1) {
    return -1;
  }
  const rect = rects[nearest];
  return contains(grown(rect, growth(rect, minSize)), x, y) ? nearest : -1;
}

/** Sets `HIT_INSET_PROPERTIES` on `element`. */
export function writeHitInsets(element: HTMLElement, insets: HitInsets): void {
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    element.style.setProperty(HIT_INSET_PROPERTIES[side], `${insets[side]}px`);
  }
}

// --- Live controls -----------------------------------------------------------

/** What a touch can land on: the neighbours a hit area must not take from. */
export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'label[for]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="treeitem"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '[role="option"]',
  '[role="slider"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const TOUCH_QUERY = '(pointer: coarse)';

/**
 * How long one frame's pass may spend on controls, ms, after its one read of
 * the page: a page appearing with hundreds of controls spreads over a few
 * frames instead of one long task.
 */
const FRAME_BUDGET_MS = 4;

/**
 * How long a control's parent must stay still after a text or child change
 * before its controls re-measure, ms: a label or link beside a control can
 * move without resizing the control or its parent.
 */
const CONTENT_SETTLE_MS = 100;

/**
 * How long the page must go without a scroll event before a pass runs, ms,
 * where the browser sends no `scrollend`.
 */
const SCROLL_STILL_MS = 150;

const PASSIVE_CAPTURE = {capture: true, passive: true} as const;

/**
 * The mutations that can change which elements `INTERACTIVE_SELECTOR`
 * matches: elements added, removed or moved, and the attributes it reads.
 */
const CANDIDATE_MUTATIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: [
    'href',
    'type',
    'for',
    'contenteditable',
    'role',
    'tabindex',
  ],
};

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

interface Watch {
  readonly element: Element;
  readonly minSize: number;
  readonly ownsDescendantTouches: boolean;
  readonly growth?: (
    target: HitRect,
    toLayout: (rect: HitRect) => HitRect,
  ) => HitInsets;
  readonly checkAtPress: boolean;
  readonly onInsets: (insets: HitInsets) => void;
  isVisible: boolean;
  last: HitInsets;
  /** The ancestor animations the watch waits out before a pass reads it. */
  readonly heldBy: Set<Animation>;
}

/** Each watched element: its watches, and what observes it while coarse. */
interface Watched {
  readonly watches: Set<Watch>;
  /** Undoes the element's observation; null while the pointer is fine. */
  release: (() => void) | null;
  /** The armed one-shot click swallower, if a touch was nearer a neighbour. */
  disarm: (() => void) | null;
}

const watched = new Map<Element, Watched>();
const pending = new Set<Watch>();
const observedSizes = new WeakMap<Element, string>();
const scopeTimers = new Map<Element, ReturnType<typeof setTimeout>>();
let frame: number | null = null;
let view: Window | null = null;
/** The document the shared press listener is on, while it is on one. */
let pressDocument: Document | null = null;
let pointer: MediaQueryList | null = null;
let visibility: IntersectionObserver | null = null;
let resize: ResizeObserver | null = null;
let isCoarse = false;
/**
 * The page's interactive elements. An added subtree, an attribute change or
 * a watch change updates them, and a read drops the elements that left the
 * page. So the page is matched only once.
 */
let interactive: Set<Element> | null = null;
let interactiveDocument: Document | null = null;
let stopInteractiveWatch: (() => void) | null = null;
/**
 * The page's scroll gate, one for every copy of Core. It knows whether the
 * page is scrolling, from a scroll to its end or a still beat. Each copy that
 * observes adds what it runs as the scroll ends.
 */
const scrollGate = sharedState('utils/hit-area/scroll-gate', 1, () => ({
  isScrolling: false,
  timer: undefined as ReturnType<typeof setTimeout> | undefined,
  stop: null as (() => void) | null,
  onEnd: new Set<() => void>(),
}));

function stopWatchingInteractive(): void {
  stopInteractiveWatch?.();
  stopInteractiveWatch = null;
  interactiveDocument = null;
  interactive = null;
}

function sameInsets(a: HitInsets, b: HitInsets): boolean {
  return (
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.left === b.left
  );
}

function deliver(watch: Watch, insets: HitInsets): void {
  if (sameInsets(watch.last, insets)) {
    return;
  }
  watch.last = insets;
  watch.onInsets(insets);
}

/** Whether `candidate` is the control itself, or part of it. */
function isOwn(watch: Watch, candidate: Element): boolean {
  const {element} = watch;
  if (
    candidate === element ||
    candidate.contains(element) ||
    element.contains(candidate)
  ) {
    return true;
  }
  // The control's own <label for> toggles it: not a neighbour.
  const control = (candidate as HTMLLabelElement).control;
  return control != null && element.contains(control);
}

/**
 * An element's client rect as a plain object: the pass compares every control
 * with every candidate, and a DOMRect's getters cost far more than fields.
 */
function plainRect(element: Element): HitRect {
  const {left, top, right, bottom} = element.getBoundingClientRect();
  return {left, top, right, bottom};
}

/** A box that the transforms around it leave at its layout size. */
const UNSCALED = {x: 1, y: 1} as const;

/** One axis of a box's scale on screen: its client size over its layout size. */
function axisScale(onScreen: number, layout: number): number {
  if (!(layout > 0) || !(onScreen > 0)) {
    return 1;
  }
  const scale = onScreen / layout;
  // Within rounding of 1 the box is at its layout size: no change to the rects.
  return Math.abs(scale - 1) < 1e-3 ? 1 : scale;
}

/**
 * How far the transforms around `element` scale its box on screen, per axis.
 * A layer that opens from a smaller scale scales every rect inside it, while
 * the layout box keeps the size the layer settles at. Only a scale is
 * expected: a rotated or skewed box would read as a larger scale.
 */
function screenScale(
  element: Element,
  onScreen: HitRect,
): {x: number; y: number} {
  // The offset size is the layout size in whole pixels, unaffected by
  // transforms, and costs no style resolution. A box with none, such as an SVG
  // element or a jsdom box, reads as unscaled.
  const box = element as Partial<HTMLElement>;
  const offsetWidth = box.offsetWidth ?? 0;
  const offsetHeight = box.offsetHeight ?? 0;
  if (offsetWidth === 0 || offsetHeight === 0) {
    return UNSCALED;
  }
  // Within a pixel of its layout size the box reads as unscaled, which bounds
  // the inset error at about a pixel. Only a box that a transform shrinks or
  // grows reads its exact size from the computed style.
  if (
    Math.abs(onScreen.right - onScreen.left - offsetWidth) <= 1 &&
    Math.abs(onScreen.bottom - onScreen.top - offsetHeight) <= 1
  ) {
    return UNSCALED;
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style == null || !style.width.endsWith('px')) {
    return UNSCALED;
  }
  const px = (value: string) => Number.parseFloat(value) || 0;
  const isContentBox = style.boxSizing !== 'border-box';
  const width =
    px(style.width) +
    (isContentBox
      ? px(style.paddingLeft) +
        px(style.paddingRight) +
        px(style.borderLeftWidth) +
        px(style.borderRightWidth)
      : 0);
  const height =
    px(style.height) +
    (isContentBox
      ? px(style.paddingTop) +
        px(style.paddingBottom) +
        px(style.borderTopWidth) +
        px(style.borderBottomWidth)
      : 0);
  return {
    x: axisScale(onScreen.right - onScreen.left, width),
    y: axisScale(onScreen.bottom - onScreen.top, height),
  };
}

/**
 * `rect` in the layout px of the box at `origin`: its offset from `origin`,
 * divided by that box's scale on screen.
 */
function inLayout(
  rect: HitRect,
  origin: HitRect,
  scale: {x: number; y: number},
): HitRect {
  if (scale.x === 1 && scale.y === 1) {
    return rect;
  }
  return {
    left: origin.left + (rect.left - origin.left) / scale.x,
    top: origin.top + (rect.top - origin.top) / scale.y,
    right: origin.left + (rect.right - origin.left) / scale.x,
    bottom: origin.top + (rect.bottom - origin.top) / scale.y,
  };
}

interface Candidate {
  readonly element: Element;
  readonly rect: HitRect;
}

/** The watched element `element` belongs to, if any (itself included). */
function watchedOwner(element: Element): Element | null {
  for (
    let node: Element | null = element;
    node != null;
    node = node.parentElement
  ) {
    if (watched.has(node)) {
      return node;
    }
  }
  return null;
}

/**
 * The page's interactive elements. A watched control counts by its own box,
 * never by a part inside it (its invisible input is grown by its hit area,
 * which must not shrink a neighbour's).
 */
function interactiveElements(doc: Document): Element[] {
  if (typeof MutationObserver === 'undefined') {
    // Nothing reports a change, so nothing is kept.
    interactive = null;
  } else if (interactiveDocument !== doc) {
    stopWatchingInteractive();
    interactiveDocument = doc;
    stopInteractiveWatch = observeMutations(
      doc,
      CANDIDATE_MUTATIONS,
      updateInteractive,
    );
  } else {
    // A mutation earlier in this task is not delivered yet.
    flushMutations(CANDIDATE_MUTATIONS);
  }
  if (interactive != null) {
    // A removed element leaves the list here, at the next read.
    for (const element of interactive) {
      if (!element.isConnected) {
        interactive.delete(element);
      }
    }
    return [...interactive];
  }
  const elements = new Set<Element>();
  addMatches(elements, doc);
  interactive = elements;
  return [...elements];
}

/** Adds the interactive elements in `root`, each as its watched owner. */
function addMatches(kept: Set<Element>, root: Document | Element): void {
  if (isElement(root) && root.matches(INTERACTIVE_SELECTOR)) {
    kept.add(watchedOwner(root) ?? root);
  }
  for (const found of root.querySelectorAll(INTERACTIVE_SELECTOR)) {
    kept.add(watchedOwner(found) ?? found);
  }
}

/**
 * Keeps the list current from one batch of mutations: an added subtree is
 * matched alone, and an element that the selector stops matching leaves.
 */
function updateInteractive(records: ReadonlyArray<MutationRecord>): void {
  const kept = interactive;
  if (kept == null) {
    return;
  }
  for (const record of records) {
    if (record.type !== 'attributes') {
      record.addedNodes.forEach(node => {
        if (isElement(node)) {
          addMatches(kept, node);
        }
      });
      continue;
    }
    const {target} = record;
    if (!isElement(target)) {
      continue;
    }
    if (target.matches(INTERACTIVE_SELECTOR)) {
      kept.add(watchedOwner(target) ?? target);
    } else if (!watched.has(target)) {
      kept.delete(target);
    }
  }
}

/** Whether a watched element counts by its own box for anything in it. */
function ownsAMatch(owner: Element): boolean {
  if (owner.matches(INTERACTIVE_SELECTOR)) {
    return true;
  }
  for (const found of owner.querySelectorAll(INTERACTIVE_SELECTOR)) {
    if (watchedOwner(found) === owner) {
      return true;
    }
  }
  return false;
}

/** A newly watched element: what it holds now counts by its box. */
function regroup(element: Element): void {
  const kept = interactive;
  if (kept == null) {
    return;
  }
  for (const found of element.querySelectorAll(INTERACTIVE_SELECTOR)) {
    kept.delete(found);
  }
  addMatches(kept, element);
  // An outer watch that counted only for what `element` holds stops counting.
  const outer =
    element.parentElement == null ? null : watchedOwner(element.parentElement);
  if (outer != null && kept.has(outer) && !ownsAMatch(outer)) {
    kept.delete(outer);
  }
}

/** An element no longer watched: what it held counts by its own box again. */
function ungroup(element: Element): void {
  const kept = interactive;
  if (kept == null) {
    return;
  }
  kept.delete(element);
  addMatches(kept, element);
}

/** The page's interactive elements and their rects: one read. */
function readCandidates(doc: Document): Candidate[] {
  return interactiveElements(doc).map(element => ({
    element,
    rect: plainRect(element),
  }));
}

/** A control's rect and clamped insets, from candidates already read. */
function measureOne(
  watch: Watch,
  candidates: ReadonlyArray<Candidate>,
): {target: HitRect; insets: HitInsets; neighbours: HitRect[]} {
  const target = plainRect(watch.element);
  const scale = screenScale(watch.element, target);
  // Two targets each growing up to half the minimum reach each other from a
  // minimum apart.
  const reach = Math.max(0, watch.minSize);
  const band = grown(target, {
    top: reach * scale.y,
    right: reach * scale.x,
    bottom: reach * scale.y,
    left: reach * scale.x,
  });
  const neighbours = candidates
    .filter(
      ({element, rect}) =>
        rect.right > rect.left &&
        rect.bottom > rect.top &&
        intersects(band, rect) &&
        !isOwn(watch, element),
    )
    .map(({rect}) => rect);
  return {
    target,
    // The insets are in the control's layout px. The returned rects stay in
    // screen px for a touch's distance checks. A neighbour maps by the
    // control's scale, as if it is in the same layer. A neighbour outside that
    // layer then reads farther away. A touch compares screen distances, so it
    // still counts that neighbour.
    insets: clampedHitInsets(
      inLayout(target, target, scale),
      neighbours.map(rect => inLayout(rect, target, scale)),
      watch.minSize,
      watch.growth?.(inLayout(target, target, scale), rect =>
        inLayout(rect, target, scale),
      ),
    ),
    neighbours,
  };
}

/**
 * The finite animations running or held in `root` and its subtree. An endless
 * one, such as a spinner, moves nothing that comes to rest. Core pauses an
 * animation only inside a gesture, and the gesture ends it. So a watch that a
 * paused animation holds is released.
 */
export function settlingAnimations(root: Element | Document): Animation[] {
  if (typeof root.getAnimations !== 'function') {
    return [];
  }
  const animations = isElement(root)
    ? root.getAnimations({subtree: true})
    : root.getAnimations();
  return animations.filter(animation => {
    if (animation.playState !== 'running' && animation.playState !== 'paused') {
      return false;
    }
    const end = animation.effect?.getComputedTiming().endTime;
    return typeof end === 'number' && Number.isFinite(end);
  });
}

/** The properties whose animation moves or resizes a box on screen. */
const BOX_MOTION =
  /^(transform|translate|scale|rotate|offset[A-Z]\w*|inset\w*|top|right|bottom|left|(min|max)?(Width|Height|width|height|BlockSize|InlineSize)|blockSize|inlineSize|margin\w*|padding\w*)$/;

/**
 * Whether an animation can move or resize a box on screen. Its keyframes'
 * properties tell: a fade or a color change moves nothing.
 */
function movesBoxes(animation: Animation): boolean {
  const effect = animation.effect as KeyframeEffect | null;
  if (typeof effect?.getKeyframes !== 'function') {
    return true;
  }
  return effect
    .getKeyframes()
    .some(frame => Object.keys(frame).some(key => BOX_MOTION.test(key)));
}

/**
 * The animations in `doc` that move boxes now: running and finite, on a
 * property that moves or resizes a box. A paused one holds still, which an
 * app can leave paused, and a fade or a tint moves nothing. The pass and the
 * click's check read the same motion.
 */
function movingAnimations(doc: Document): Animation[] {
  return settlingAnimations(doc).filter(
    animation => animation.playState === 'running' && movesBoxes(animation),
  );
}

/** Runs `then` once each animation has finished or been cancelled. */
export function whenSettled(
  animations: ReadonlyArray<Animation>,
  then: () => void,
): void {
  void Promise.allSettled(
    animations.map(async animation => animation.finished),
  ).then(then);
}

/**
 * Whether a running animation on an ancestor holds the watch back. It moves
 * the control, so a read now takes a box in motion. The watch is measured
 * once each such animation ends. The control's own motion, such as a press's
 * scale, is its owner's to wait out.
 */
function isHeldBack(watch: Watch, moving: ReadonlyArray<Animation>): boolean {
  let isHeld = false;
  for (const animation of moving) {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    if (
      target == null ||
      target === watch.element ||
      !target.contains(watch.element)
    ) {
      continue;
    }
    isHeld = true;
    if (!watch.heldBy.has(animation)) {
      watch.heldBy.add(animation);
      whenSettled([animation], () => {
        watch.heldBy.delete(animation);
        if (watch.isVisible && watched.get(watch.element)?.watches.has(watch)) {
          schedule(watch);
        }
      });
    }
  }
  return isHeld;
}

/** One pass: every pending control's reads, then every write. */
function measure(): void {
  frame = null;
  if (scrollGate.isScrolling) {
    // The pending watches wait: the scroll's end asks for the frame.
    return;
  }
  const visible = [...pending].filter(watch => watch.isVisible);
  pending.clear();
  if (!isCoarse || visible.length === 0) {
    return;
  }
  const doc = visible[0].element.ownerDocument;
  const moving = movingAnimations(doc);
  const due = visible.filter(watch => !isHeldBack(watch, moving));
  if (due.length === 0) {
    return;
  }
  // Reads: the page's interactive elements once for the whole pass.
  const candidates = readCandidates(doc);
  // The budget is for the controls: the page read above is once a frame.
  const started = now();
  const results: {watch: Watch; insets: HitInsets}[] = [];
  for (const watch of due) {
    // At least one control a frame; past the budget the rest wait for the
    // next frame, their insets still 0 (safe) until measured.
    if (results.length > 0 && now() - started > FRAME_BUDGET_MS) {
      pending.add(watch);
      continue;
    }
    results.push({watch, insets: measureOne(watch, candidates).insets});
  }
  // Writes.
  for (const {watch, insets} of results) {
    deliver(watch, insets);
  }
  if (pending.size > 0) {
    requestFrame();
  }
}

function requestFrame(): void {
  if (
    frame == null &&
    !scrollGate.isScrolling &&
    typeof requestAnimationFrame === 'function'
  ) {
    frame = requestAnimationFrame(measure);
  }
}

function onScroll(): void {
  scrollGate.isScrolling = true;
  if (scrollGate.timer !== undefined) {
    clearTimeout(scrollGate.timer);
  }
  scrollGate.timer = setTimeout(endScroll, SCROLL_STILL_MS);
}

function endScroll(): void {
  if (scrollGate.timer !== undefined) {
    clearTimeout(scrollGate.timer);
    scrollGate.timer = undefined;
  }
  if (!scrollGate.isScrolling) {
    return;
  }
  scrollGate.isScrolling = false;
  for (const resume of [...scrollGate.onEnd]) {
    resume();
  }
}

/** This copy's pass, once the page's scroll ends. */
function resumeAfterScroll(): void {
  if (pending.size > 0) {
    requestFrame();
  }
}

function schedule(watch: Watch): void {
  if (!isCoarse) {
    return;
  }
  pending.add(watch);
  requestFrame();
}

function scheduleAll(): void {
  for (const entry of watched.values()) {
    entry.watches.forEach(schedule);
  }
}

/**
 * At a touch's start, arm a check on the control it landed on. The touch's
 * click re-measures the control, or the press does while an animation moves
 * it. If a neighbour moved nearer since the last measurement, the click is
 * swallowed: the tap does nothing rather than toggle the wrong control.
 * Nothing is re-sent to the neighbour, and the next tap uses the fresh
 * insets. A watch whose owner reads its own targets when a press begins skips
 * this (`checkAtPress`).
 */
function onPress(event: Event): void {
  // One listener on the document for every watched control, so a control, row
  // or handle has none of its own (AST-103 FR5). The innermost watched element
  // that the press lands in is the one it is for.
  for (
    let node: Element | null =
      event.target instanceof Element ? event.target : null;
    node != null;
    node = node.parentElement
  ) {
    if (watched.has(node)) {
      checkPress(node, event as PointerEvent);
      return;
    }
  }
}

function checkPress(element: Element, event: PointerEvent): void {
  const entry = watched.get(element);
  if (entry == null) {
    return;
  }
  // A check left from a touch that sent no click goes with the next one.
  entry.disarm?.();
  if (!isCoarse || event.pointerType !== 'touch') {
    return;
  }
  const checked = [...entry.watches].filter(watch => watch.checkAtPress);
  if (checked.length === 0) {
    return;
  }
  const press = {x: event.clientX, y: event.clientY, target: event.target};
  // A control that an ancestor animation moves is measured now. By its
  // click, its box is no longer where the finger landed.
  const isMoving = checked.some(watch => watch.heldBy.size > 0);
  const isNearerAtPress =
    isMoving &&
    isNearerNeighbour(
      element,
      entry,
      checked,
      press,
      readCandidates(element.ownerDocument),
    );
  if (isMoving && !isNearerAtPress) {
    return;
  }
  // A control at rest reads no layout at the press, so a scroll it starts
  // never waits on a read. Its click comes only once the touch is a tap, and
  // measures then.
  const check = (click: Event) => {
    disarm();
    // A keyboard or assistive-technology activation (detail 0) is never
    // this touch's click: it goes through.
    if ((click as MouseEvent).detail === 0) {
      return;
    }
    if (isNearerAtPress || isNearerAtClick(element, entry, checked, press)) {
      click.preventDefault();
      click.stopPropagation();
    }
  };
  const doc = element.ownerDocument;
  let stopNextPress: (() => void) | null = null;
  const disarm = () => {
    element.removeEventListener('click', check, true);
    element.removeEventListener('pointercancel', disarm, true);
    stopNextPress?.();
    stopNextPress = null;
    if (entry.disarm === disarm) {
      entry.disarm = null;
    }
  };
  element.addEventListener('click', check, true);
  // A touch the browser takes (a scroll) sends no click.
  element.addEventListener('pointercancel', disarm, true);
  // Any next press, here or elsewhere (the control's own label), ends it.
  // This press has already passed the window, so only a later press does.
  const pageView = doc.defaultView;
  if (pageView != null) {
    stopNextPress = subscribeInput(pageView, 'pointerdown', disarm);
  }
  entry.disarm = disarm;
}

/**
 * The control's box on screen without its own scale transform, such as a
 * press's. The scale is about the box's center, so the center stays.
 */
function withoutOwnScale(element: Element, onScreen: HitRect): HitRect {
  const transform =
    element.ownerDocument.defaultView?.getComputedStyle(element).transform;
  const scale = /^matrix\(([^,]+),[^,]+,[^,]+,([^,]+),/.exec(transform ?? '');
  if (scale == null) {
    return onScreen;
  }
  const scaleX = Number.parseFloat(scale[1]);
  const scaleY = Number.parseFloat(scale[2]);
  if (!(scaleX > 0) || !(scaleY > 0)) {
    return onScreen;
  }
  const centerX = (onScreen.left + onScreen.right) / 2;
  const centerY = (onScreen.top + onScreen.bottom) / 2;
  const halfWidth = (onScreen.right - onScreen.left) / scaleX / 2;
  const halfHeight = (onScreen.bottom - onScreen.top) / scaleY / 2;
  return {
    left: centerX - halfWidth,
    top: centerY - halfHeight,
    right: centerX + halfWidth,
    bottom: centerY + halfHeight,
  };
}

/** Measures the watch in a pass once the control's own motion has ended. */
function scheduleAtRest(watch: Watch): void {
  const {element} = watch;
  const moving = settlingAnimations(element);
  if (moving.length === 0) {
    schedule(watch);
    return;
  }
  whenSettled(moving, () => {
    if (watched.get(element)?.watches.has(watch)) {
      schedule(watch);
    }
  });
}

/**
 * Whether a fresh measurement puts the press nearer a neighbour than the
 * control. A press on content that the control paints past its box is the
 * control's.
 */
function isNearerNeighbour(
  element: Element,
  entry: Watched,
  checked: ReadonlyArray<Watch>,
  press: {x: number; y: number; target: EventTarget | null},
  candidates: ReadonlyArray<Candidate>,
): boolean {
  // The touch is the control's unless a neighbour is nearer it: inside the
  // fresh area too (a corner beside an offset or diagonal neighbour), and
  // a few px past it, where a browser's own touch adjustment reaches.
  let isNearer = false;
  for (const watch of checked) {
    const {target, insets, neighbours} = measureOne(watch, candidates);
    const own = distanceTo(
      withoutOwnScale(watch.element, target),
      press.x,
      press.y,
    );
    isNearer ||= neighbours.some(
      rect => distanceTo(rect, press.x, press.y) < own,
    );
    // The press still scales the control, so these insets read a scaled box.
    // A pass after the press's motion ends takes the insets instead.
    if (!sameInsets(watch.last, insets)) {
      scheduleAtRest(watch);
    }
  }
  // A watch can own its descendants' touches. Then a press that the browser
  // hit-tests onto a descendant lands on content the element paints, even
  // past its own box. A swipe panel's entry beside a moved row is such
  // content. That touch is the element's.
  const isOnOwnContent =
    [...entry.watches].some(watch => watch.ownsDescendantTouches) &&
    press.target instanceof Node &&
    press.target !== element &&
    element.contains(press.target);
  return isNearer && !isOnOwnContent;
}

/**
 * Whether a fresh measurement at a touch's click puts the press nearer a
 * neighbour than the control.
 */
function isNearerAtClick(
  element: Element,
  entry: Watched,
  checked: ReadonlyArray<Watch>,
  press: {x: number; y: number; target: EventTarget | null},
): boolean {
  const doc = element.ownerDocument;
  // The touch landed before its click. An animation that the press did not
  // see may have moved the control or a neighbour since. Its fresh box is
  // not the one the finger landed on. The control's click then goes through,
  // as the browser's hit test took it, and a moving neighbour is left out.
  const moving = movingAnimations(doc);
  const isMoved = (node: Element, isOwnMotionCounted: boolean) =>
    moving.some(animation => {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      return (
        target != null &&
        target.contains(node) &&
        (isOwnMotionCounted || target !== node)
      );
    });
  if (isMoved(element, false)) {
    return false;
  }
  const candidates = readCandidates(doc).filter(
    candidate => !isMoved(candidate.element, true),
  );
  return isNearerNeighbour(element, entry, checked, press, candidates);
}

function onScopeChange(scope: Element): void {
  const timer = scopeTimers.get(scope);
  if (timer != null) {
    clearTimeout(timer);
  }
  scopeTimers.set(
    scope,
    setTimeout(() => {
      scopeTimers.delete(scope);
      for (const [element, entry] of watched) {
        if (element.parentElement === scope) {
          entry.watches.forEach(schedule);
        }
      }
    }, CONTENT_SETTLE_MS),
  );
}

/** Starts observing one element; only while the pointer is coarse. */
function observe(element: Element, entry: Watched): void {
  const parent = element.parentElement;
  visibility?.observe(element);
  resize?.observe(element);
  if (parent != null) {
    resize?.observe(parent);
  }
  const stopScope =
    parent == null ? null : observeContent(parent, () => onScopeChange(parent));
  entry.release = () => {
    visibility?.unobserve(element);
    resize?.unobserve(element);
    const parentShared = [...watched.keys()].some(
      other => other !== element && other.parentElement === parent,
    );
    if (parent != null && !parentShared) {
      resize?.unobserve(parent);
      const timer = scopeTimers.get(parent);
      if (timer != null) {
        clearTimeout(timer);
        scopeTimers.delete(parent);
      }
    }
    stopScope?.();
    entry.disarm?.();
  };
}

/**
 * Everything that watches the page for hit areas is on only while the
 * primary pointer is coarse, so a mouse page runs no observer, timer or
 * listener for them.
 */
function startObserving(): void {
  if (view == null) {
    return;
  }
  view.addEventListener('resize', scheduleAll);
  // The first copy to observe listens for the page; the others share it.
  if (scrollGate.stop == null) {
    const stopScroll = subscribeInput(view, 'scroll', onScroll);
    const stopScrollEnd = subscribeInput(view, 'scrollend', endScroll);
    scrollGate.stop = () => {
      stopScroll();
      stopScrollEnd();
    };
  }
  scrollGate.onEnd.add(resumeAfterScroll);
  pressDocument = view.document;
  pressDocument.addEventListener('pointerdown', onPress, PASSIVE_CAPTURE);
  if (typeof IntersectionObserver === 'function') {
    visibility = new IntersectionObserver(entries => {
      for (const entry of entries) {
        watched.get(entry.target)?.watches.forEach(watch => {
          watch.isVisible = entry.isIntersecting;
          if (watch.isVisible) {
            schedule(watch);
          } else {
            pending.delete(watch);
          }
        });
      }
    });
  }
  if (typeof ResizeObserver === 'function') {
    resize = new ResizeObserver(entries => {
      for (const entry of entries) {
        // The first notice of an element is its observation, not a resize:
        // the control's first measurement is already pending.
        const {width, height} = entry.contentRect;
        const size = `${width}x${height}`;
        const last = observedSizes.get(entry.target);
        observedSizes.set(entry.target, size);
        if (last === undefined || last === size) {
          continue;
        }
        for (const [element, item] of watched) {
          if (
            element === entry.target ||
            element.parentElement === entry.target
          ) {
            item.watches.forEach(schedule);
          }
        }
      }
    });
  }
  for (const [element, entry] of watched) {
    // Without IntersectionObserver every control counts as on screen.
    entry.watches.forEach(watch => {
      watch.isVisible = visibility == null;
    });
    observe(element, entry);
    if (visibility == null) {
      entry.watches.forEach(schedule);
    }
  }
}

function stopObserving(): void {
  for (const entry of watched.values()) {
    entry.release?.();
    entry.release = null;
  }
  view?.removeEventListener('resize', scheduleAll);
  scrollGate.onEnd.delete(resumeAfterScroll);
  // The last copy to stop observing ends the page's listening.
  if (scrollGate.onEnd.size === 0) {
    scrollGate.stop?.();
    scrollGate.stop = null;
    if (scrollGate.timer !== undefined) {
      clearTimeout(scrollGate.timer);
      scrollGate.timer = undefined;
    }
    scrollGate.isScrolling = false;
  }
  // The listener leaves the document it went on. A window can close first, as
  // a removed iframe's, and then it has no document to read.
  pressDocument?.removeEventListener('pointerdown', onPress, PASSIVE_CAPTURE);
  pressDocument = null;
  visibility?.disconnect();
  resize?.disconnect();
  visibility = null;
  resize = null;
  scopeTimers.forEach(timer => clearTimeout(timer));
  scopeTimers.clear();
  stopWatchingInteractive();
  if (frame != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frame);
  }
  frame = null;
  pending.clear();
}

function onPointerChange(): void {
  const next = pointer?.matches ?? false;
  if (next === isCoarse) {
    return;
  }
  isCoarse = next;
  if (isCoarse) {
    startObserving();
    return;
  }
  stopObserving();
  for (const entry of watched.values()) {
    entry.watches.forEach(watch => deliver(watch, NO_HIT_INSETS));
  }
}

/** Options of `watchHitArea`. */
export interface WatchHitAreaOptions {
  /** The size to grow toward, px. @default 44 */
  readonly minSize?: number;
  /**
   * A touch that the browser hit-tests onto a descendant is the element's,
   * however near a neighbour is. Set it for a host whose content can paint
   * past its box, such as a list row with a swipe panel. A control whose
   * grown input is its descendant leaves it off. @default false
   */
  readonly ownsDescendantTouches?: boolean;
  /**
   * How far the control grows on each side before any neighbour stops it,
   * read in the measure pass. A group passes `groupGrowth` of its members.
   * It gets the control's box in layout px, and `toLayout` maps a rect the
   * owner reads into the same px.
   * @default toward `minSize` on each axis, centered
   */
  readonly growth?: (
    target: HitRect,
    toLayout: (rect: HitRect) => HitRect,
  ) => HitInsets;
  /**
   * Whether a finger's press on the control re-measures it against every
   * interactive element on the page, at the press's click. An owner that reads
   * its own targets when a press begins, such as a group's tracker, turns it
   * off.
   * @default true
   */
  readonly checkAtPress?: boolean;
}

/**
 * Stops every watch and forgets them, for tests: no observer, listener or
 * answer outlives a test that left a watch behind.
 */
export function resetHitAreaForTests(): void {
  stopObserving();
  for (const entry of watched.values()) {
    entry.disarm?.();
  }
  watched.clear();
  pending.clear();
  pointer?.removeEventListener('change', onPointerChange);
  pointer = null;
  view = null;
  isCoarse = false;
}

/**
 * Keeps `element`'s hit insets live until the returned function runs:
 * `onInsets` hears each change (typically `writeHitInsets` on the control).
 * Where the primary pointer is not coarse, the insets are 0, and only the
 * pointer query is listened to. Where it is, the shared per-frame pass
 * measures the element while it is on screen. It measures again on a resize
 * of the element, its parent or the window, and once its parent's text and
 * children settle after a change. The click of a touch that lands on the
 * element measures it again.
 */
export function watchHitArea(
  element: Element,
  onInsets: (insets: HitInsets) => void,
  {
    minSize = MIN_TOUCH_TARGET,
    ownsDescendantTouches = false,
    growth: growthOf,
    checkAtPress = true,
  }: WatchHitAreaOptions = {},
): () => void {
  const owner = element.ownerDocument.defaultView;
  if (owner == null) {
    return () => {};
  }
  view = owner;
  // Read the pointer query at every watch, not only the first: an
  // environment that replaces matchMedia (a test) must not leave a stale
  // answer behind from a watch that never stopped.
  const query = owner.matchMedia?.(TOUCH_QUERY) ?? null;
  if (query !== pointer) {
    pointer?.removeEventListener('change', onPointerChange);
    pointer = query;
    pointer?.addEventListener('change', onPointerChange);
  }
  onPointerChange();
  const watch: Watch = {
    element,
    minSize,
    ownsDescendantTouches,
    growth: growthOf,
    checkAtPress,
    onInsets,
    isVisible: isCoarse && visibility == null,
    last: NO_HIT_INSETS,
    heldBy: new Set(),
  };
  let entry = watched.get(element);
  if (entry == null) {
    entry = {watches: new Set(), release: null, disarm: null};
    watched.set(element, entry);
    regroup(element);
    entry.watches.add(watch);
    if (isCoarse) {
      observe(element, entry);
    }
  } else {
    // Another watch of an observed element: as visible as the first.
    watch.isVisible = [...entry.watches][0]?.isVisible ?? watch.isVisible;
    entry.watches.add(watch);
  }
  if (watch.isVisible) {
    schedule(watch);
  }
  return () => {
    const own = watched.get(element);
    if (own == null || !own.watches.delete(watch)) {
      return;
    }
    pending.delete(watch);
    if (own.watches.size === 0) {
      own.release?.();
      watched.delete(element);
      ungroup(element);
    }
    if (watched.size === 0) {
      stopObserving();
      pointer?.removeEventListener('change', onPointerChange);
      pointer = null;
      view = null;
      isCoarse = false;
    }
  };
}
