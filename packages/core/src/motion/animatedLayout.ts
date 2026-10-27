// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.ts
 * @input The DOM (layout rectangles, computed style), Web Animations, the
 *   internal `springs.settle` motion role (motion/roles.ts) and the Reduce Motion
 *   cross-fade clock (uikit/timing.ts)
 * @output Exports `createAnimatedLayout` and the opaque `AnimatedLayout`
 *   handle, `reportLayoutChange`, `playLayoutChange` and `holdLayoutExit` /
 *   `releaseLayoutExit`: the one module that produces the
 *   size-change glide `spec:AST-105` defines
 *   (`architecture:react-component-runtime` INV12)
 * @position Motion foundation, internal to core. A handle comes from the
 *   public `useAnimatedLayout` hook; a component that takes it reports its
 *   size changes through this module.
 *
 * How it works:
 * - `measureBefore()` runs before the change commits: from the changed
 *   element it walks up to the handle's container and, at each level,
 *   records the rectangle of every following element sibling, through
 *   `parentElement` and `nextElementSibling`, descending only into an element
 *   with `display: contents` (it has no box).
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
 *   it gives up its space and conceals (`holdLayoutExit`).
 * - Every pointer (`spec:AST-105` FR5). Under Reduce Motion nothing travels
 *   (`design:reduced-motion` DR1–DR3): a cross-fade under a coarse primary
 *   pointer, an immediate change otherwise.
 * - Without a handle nothing happens: the component keeps its jump
 *   (`spec:AST-105` FR2).
 */

import {motionRole} from './roles';
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

/**
 * Whether the app moves `element` itself: its own `transform`, `translate`,
 * `rotate` or `scale`, or a running animation of one this module did not
 * start.
 */
function movedByApp(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (
    style != null &&
    TRANSFORM_PROPERTIES.some(property => {
      const value = style.getPropertyValue(property);
      return value !== '' && value !== 'none';
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
      .some(frame => TRANSFORM_PROPERTIES.some(property => property in frame));
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
 * The elements that can shift when `changed` changes size: at each ancestor
 * level up to `area`, every following element sibling. `display: contents` is
 * replaced by its children.
 */
function collectFollowers(changed: Element, area: Element): Element[] {
  const view = changed.ownerDocument.defaultView;
  const out: Element[] = [];
  const take = (element: Element) => {
    const style = view?.getComputedStyle(element);
    if (style == null) {
      return;
    }
    if (style.display === 'contents') {
      for (
        let child = element.firstElementChild;
        child != null;
        child = child.nextElementSibling
      ) {
        take(child);
      }
      return;
    }
    if (takesPart(element, style)) {
      out.push(element);
    }
  };
  for (
    let node: Element | null = changed;
    node != null && node !== area;
    node = node.parentElement
  ) {
    for (
      let sibling = node.nextElementSibling;
      sibling != null;
      sibling = sibling.nextElementSibling
    ) {
      take(sibling);
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
  scheduled: boolean;
}

const batches = new Map<Element, Batch>();

function batchFor(area: Element): Batch {
  let batch = batches.get(area);
  if (batch == null) {
    const created: Batch = {
      area,
      changed: new Set(),
      before: new Map(),
      scheduled: false,
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
function scaleOf(element: Element, rect: DOMRect): {x: number; y: number} {
  const html = element as HTMLElement;
  const x =
    html.offsetWidth > 0 && rect.width > 0 ? rect.width / html.offsetWidth : 1;
  const y =
    html.offsetHeight > 0 && rect.height > 0
      ? rect.height / html.offsetHeight
      : 1;
  // Subpixel rounding makes an unscaled element read a hair off 1; only a
  // real scale is corrected.
  return {
    x: Math.abs(x - 1) < 0.01 ? 1 : x || 1,
    y: Math.abs(y - 1) < 0.01 ? 1 : y || 1,
  };
}

function flush(batch: Batch): void {
  batches.delete(batch.area);
  const followers = new Set<Element>();
  for (const changed of batch.changed) {
    if (!changed.isConnected) {
      continue;
    }
    for (const element of collectFollowers(changed, batch.area)) {
      followers.add(element);
    }
  }
  if (followers.size === 0) {
    return;
  }
  const motion = layoutMotion(batch.area);
  if (motion.kind === 'instant') {
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
  const byElement = new Map<Element, (typeof entries)[number]>();
  for (const entry of entries) {
    entry.after = entry.element.getBoundingClientRect();
    entry.rawX = entry.before.left - entry.after.left;
    entry.rawY = entry.before.top - entry.after.top;
    byElement.set(entry.element, entry);
  }
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
    if (movedByApp(element)) {
      // The app moves it itself: it takes its final place at once
      // (`spec:AST-105` Coverage).
      continue;
    }
    // Where it shows now, against its new place, in its own px; the part the
    // carried glide does not cover is the new move.
    const scale = scaleOf(element, after);
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
   */
  animate(): boolean;
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
      batch.changed.add(element);
      for (const follower of collectFollowers(element, area)) {
        if (!batch.before.has(follower)) {
          batch.before.set(follower, follower.getBoundingClientRect());
        }
      }
    },
    animate() {
      const element = resolve(target);
      if (element == null || handle == null) {
        return false;
      }
      const area = areaOf(handle, element);
      const batch = area == null ? undefined : batches.get(area);
      if (batch == null || !batch.changed.has(element)) {
        return false;
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
 */
export function playLayoutChange(
  handle: AnimatedLayout | null | undefined,
  element: Element,
): void {
  if (handle == null) {
    return;
  }
  const area = areaOf(handle, element);
  if (area == null) {
    return;
  }
  if (!intersects(element.getBoundingClientRect(), visibleRect(area))) {
    return;
  }
  const motion = layoutMotion(area);
  if (motion.kind === 'instant') {
    return;
  }
  if (motion.kind === 'fade') {
    safeAnimate(element, [{opacity: 0}, {opacity: 1}], {
      duration: motion.durationMs,
      easing: motion.easing,
    });
    return;
  }
  safeAnimate(
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
  // A first guess (its box), then one correction from the measured result:
  // a gap, a collapsed margin or the element's own margins.
  element.style.setProperty(property, `${-size}px`);
  const guess = placeOf(next, rtl)[axis];
  // The reading is in screen px, the margin in the element's own: under a
  // scaled ancestor the correction is divided by the scale on this axis.
  const scale = scaleOf(element, element.getBoundingClientRect());
  const correction = (target[axis] - guess) / (isRow ? scale.x : scale.y);
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

/** @internal For tests: the motion a change in `area` plays. */
export function layoutMotionFor(area: Element): LayoutMotion {
  return layoutMotion(area);
}
