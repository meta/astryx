// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file hitArea.ts
 * @input A target's rect and its neighbours' rects (or, for a live control,
 *   the element and the page around it)
 * @output The touch hit area: how far a target may grow toward 44 px on each
 *   side without taking a tap that is nearer a neighbour. `clampedHitInsets`
 *   and `resolveHitTarget` answer from rects; `watchHitArea` keeps a control's
 *   insets live where the primary pointer is coarse
 * @position Core-internal utility, not exported from `@astryxdesign/core/utils`.
 *   Groups that measure their actions at press start pass `resolveHitTarget`;
 *   a standalone control writes `watchHitArea`'s insets to an invisible
 *   coarse-only hit layer
 *
 * A finger needs a 44 × 44 px target, but a control may not grow on a phone,
 * and its hit area must never take a neighbour's taps. Each side grows toward
 * the minimum size and stops at half the gap to the nearest neighbour on that
 * side (0 when they touch), so two neighbours' areas meet in the middle and a
 * tap always goes to the nearer target. CSS cannot see where the neighbours
 * are, so a live control measures: only where the primary pointer is coarse,
 * only while on screen, and every control pending a measurement in one read
 * pass per frame (all reads, then all writes). Until the first pass the
 * insets are 0, so first paint and server rendering never overlap anything.
 */

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

/**
 * How far `target` may grow on each side: toward `minSize` on each axis,
 * centered, and on each side no further than half the gap to a neighbour it
 * would reach. A neighbour apart on both axes (diagonal) stops the side with
 * the larger gap, which keeps the most area and is the side the neighbour
 * stops too, so the two areas never overlap. A neighbour overlapping the
 * target (an ancestor, an overlay) is not beside it and stops nothing.
 */
export function clampedHitInsets(
  target: HitRect,
  neighbours: ReadonlyArray<HitRect>,
  minSize: number = MIN_TOUCH_TARGET,
): HitInsets {
  const growX = Math.max(0, (minSize - (target.right - target.left)) / 2);
  const growY = Math.max(0, (minSize - (target.bottom - target.top)) / 2);
  if (growX === 0 && growY === 0) {
    return NO_HIT_INSETS;
  }
  const insets = {top: growY, right: growX, bottom: growY, left: growX};
  // Nearest first, so a far neighbour is judged against the area its nearer
  // ones left.
  const beside = neighbours
    .map(rect => ({rect, gap: gaps(target, rect)}))
    .filter(({gap}) => gap.x >= 0 || gap.y >= 0)
    .sort((a, b) => Math.max(a.gap.x, a.gap.y) - Math.max(b.gap.x, b.gap.y));
  for (const {rect, gap} of beside) {
    // The neighbour's half of the gap: a tap there is nearer the neighbour.
    const neighbourHalf = grown(rect, {
      top: Math.max(0, gap.y) / 2,
      right: Math.max(0, gap.x) / 2,
      bottom: Math.max(0, gap.y) / 2,
      left: Math.max(0, gap.x) / 2,
    });
    if (!intersects(grown(target, insets), neighbourHalf)) {
      continue;
    }
    if (gap.x >= gap.y) {
      const half = gap.x / 2;
      if (rect.left >= target.right) {
        insets.right = Math.min(insets.right, half);
      } else {
        insets.left = Math.min(insets.left, half);
      }
    } else {
      const half = gap.y / 2;
      if (rect.top >= target.bottom) {
        insets.bottom = Math.min(insets.bottom, half);
      } else {
        insets.top = Math.min(insets.top, half);
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
 * Which of `rects` a touch at (x, y) is for: the one whose clamped hit area
 * holds the point; where areas still meet (their targets overlap), the target
 * nearest the point, then the one whose center is nearest; -1 where none
 * holds it. For a group that measures its actions at
 * press start.
 */
export function resolveHitTarget(
  x: number,
  y: number,
  rects: ReadonlyArray<HitRect>,
  minSize: number = MIN_TOUCH_TARGET,
): number {
  let found = -1;
  let foundDistance = Infinity;
  rects.forEach((rect, index) => {
    const others = rects.filter((_, other) => other !== index);
    const area = grown(rect, clampedHitInsets(rect, others, minSize));
    if (!contains(area, x, y)) {
      return;
    }
    // Inside two overlapping targets, the nearer center decides.
    const distance =
      distanceTo(rect, x, y) * 1e6 +
      Math.hypot(
        x - (rect.left + rect.right) / 2,
        y - (rect.top + rect.bottom) / 2,
      );
    if (distance < foundDistance) {
      found = index;
      foundDistance = distance;
    }
  });
  return found;
}

/** Sets `HIT_INSET_PROPERTIES` on `element`. */
export function writeHitInsets(element: HTMLElement, insets: HitInsets): void {
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    element.style.setProperty(HIT_INSET_PROPERTIES[side], `${insets[side]}px`);
  }
}

// --- Live controls -----------------------------------------------------------

/** What a touch can land on: the neighbours a hit area must not take from. */
const INTERACTIVE = [
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
  '[role="option"]',
  '[role="slider"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const TOUCH_QUERY = '(pointer: coarse)';

interface Watch {
  readonly element: Element;
  readonly minSize: number;
  readonly onInsets: (insets: HitInsets) => void;
  isVisible: boolean;
  last: HitInsets;
}

const watches = new Map<Element, Set<Watch>>();
const pending = new Set<Watch>();
let frame: number | null = null;
let visibility: IntersectionObserver | null = null;
let resize: ResizeObserver | null = null;
let pointer: MediaQueryList | null = null;
let isCoarse = false;

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

/** One pass: every pending control's reads, then every write. */
function measure(): void {
  frame = null;
  const due = [...pending].filter(watch => watch.isVisible);
  pending.clear();
  if (!isCoarse || due.length === 0) {
    return;
  }
  const doc = due[0].element.ownerDocument;
  // Reads: the page's interactive elements once for the whole pass.
  const candidates = [...doc.querySelectorAll(INTERACTIVE)].map(element => ({
    element,
    rect: plainRect(element),
  }));
  const results = due.map(watch => {
    const target = plainRect(watch.element);
    const reach = Math.max(0, watch.minSize / 2);
    const band = grown(target, {
      top: reach,
      right: reach,
      bottom: reach,
      left: reach,
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
    return {watch, insets: clampedHitInsets(target, neighbours, watch.minSize)};
  });
  // Writes.
  for (const {watch, insets} of results) {
    deliver(watch, insets);
  }
}

function schedule(watch: Watch): void {
  if (!isCoarse) {
    return;
  }
  pending.add(watch);
  if (frame == null && typeof requestAnimationFrame === 'function') {
    frame = requestAnimationFrame(measure);
  }
}

function eachWatch(element: Element, visit: (watch: Watch) => void): void {
  for (const watch of watches.get(element) ?? []) {
    visit(watch);
  }
}

function onPointerChange(): void {
  const next = pointer?.matches ?? false;
  if (next === isCoarse) {
    return;
  }
  isCoarse = next;
  for (const set of watches.values()) {
    for (const watch of set) {
      if (isCoarse) {
        schedule(watch);
      } else {
        pending.delete(watch);
        deliver(watch, NO_HIT_INSETS);
      }
    }
  }
}

function onWindowResize(): void {
  for (const set of watches.values()) {
    for (const watch of set) {
      schedule(watch);
    }
  }
}

function start(view: Window): void {
  pointer = view.matchMedia?.(TOUCH_QUERY) ?? null;
  isCoarse = pointer?.matches ?? false;
  pointer?.addEventListener('change', onPointerChange);
  view.addEventListener('resize', onWindowResize);
  if (typeof IntersectionObserver === 'function') {
    visibility = new IntersectionObserver(entries => {
      for (const entry of entries) {
        eachWatch(entry.target, watch => {
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
        for (const set of watches.values()) {
          for (const watch of set) {
            if (
              watch.element === entry.target ||
              watch.element.parentElement === entry.target
            ) {
              schedule(watch);
            }
          }
        }
      }
    });
  }
}

function stop(view: Window): void {
  pointer?.removeEventListener('change', onPointerChange);
  view.removeEventListener('resize', onWindowResize);
  visibility?.disconnect();
  resize?.disconnect();
  if (frame != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frame);
  }
  frame = null;
  pointer = null;
  visibility = null;
  resize = null;
  isCoarse = false;
  pending.clear();
}

/**
 * Keeps `element`'s hit insets live until the returned function runs:
 * `onInsets` hears each change (typically `writeHitInsets` on the control).
 * Where the primary pointer is not coarse the insets are 0 and nothing is
 * measured; where it is, the element is measured while on screen, on resize
 * (its own, its parent's, the window's), all in the shared per-frame pass.
 */
export function watchHitArea(
  element: Element,
  onInsets: (insets: HitInsets) => void,
  minSize: number = MIN_TOUCH_TARGET,
): () => void {
  const view = element.ownerDocument.defaultView;
  if (view == null) {
    return () => {};
  }
  if (watches.size === 0) {
    start(view);
  }
  const watch: Watch = {
    element,
    minSize,
    onInsets,
    // Without IntersectionObserver every control counts as on screen.
    isVisible: visibility == null,
    last: NO_HIT_INSETS,
  };
  let set = watches.get(element);
  if (set == null) {
    set = new Set();
    watches.set(element, set);
    visibility?.observe(element);
    resize?.observe(element);
    if (element.parentElement != null) {
      resize?.observe(element.parentElement);
    }
  }
  set.add(watch);
  if (watch.isVisible) {
    schedule(watch);
  }
  return () => {
    const own = watches.get(element);
    if (own == null || !own.delete(watch)) {
      return;
    }
    pending.delete(watch);
    if (own.size === 0) {
      watches.delete(element);
      visibility?.unobserve(element);
      resize?.unobserve(element);
      const parent = element.parentElement;
      const parentShared = [...watches.keys()].some(
        other => other.parentElement === parent,
      );
      if (parent != null && !parentShared) {
        resize?.unobserve(parent);
      }
    }
    if (watches.size === 0) {
      stop(view);
    }
  };
}
