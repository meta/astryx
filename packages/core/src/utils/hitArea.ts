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
 * pass per frame (all reads, then all writes), up to a 4 ms budget, the rest
 * carried to the next frame. Until the first pass the
 * insets are 0, so first paint and server rendering never overlap anything.
 */

import {observeContent} from './sharedMutationObserver';

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
 * How far `target` may grow on each side: toward `minSize` on each axis,
 * centered, and on each side no further than half the gap to a neighbour.
 * A neighbour counts when either one, at full growth toward `minSize`, would
 * reach into the other's half of the gap, or their full areas would meet; it
 * stops the side facing it, or,
 * for a neighbour apart on both axes (diagonal), the side with the larger gap.
 * That decision rests on the two rects alone, so the neighbour decides the
 * same about this target and the two areas never overlap. A neighbour
 * overlapping the target (an ancestor, an overlay) is not beside it and stops
 * nothing.
 */
export function clampedHitInsets(
  target: HitRect,
  neighbours: ReadonlyArray<HitRect>,
  minSize: number = MIN_TOUCH_TARGET,
): HitInsets {
  const full = growth(target, minSize);
  if (full.top === 0 && full.left === 0) {
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

const PASSIVE_CAPTURE = {capture: true, passive: true} as const;

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

interface Watch {
  readonly element: Element;
  readonly minSize: number;
  readonly onInsets: (insets: HitInsets) => void;
  isVisible: boolean;
  last: HitInsets;
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
let pointer: MediaQueryList | null = null;
let visibility: IntersectionObserver | null = null;
let resize: ResizeObserver | null = null;
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
 * The page's interactive elements and their rects: one read. A watched
 * control counts by its own box, never by a part inside it (its invisible
 * input is grown by its hit area, which must not shrink a neighbour's).
 */
function readCandidates(doc: Document): Candidate[] {
  const seen = new Set<Element>();
  const candidates: Candidate[] = [];
  for (const found of doc.querySelectorAll(INTERACTIVE)) {
    const element = watchedOwner(found) ?? found;
    if (!seen.has(element)) {
      seen.add(element);
      candidates.push({element, rect: plainRect(element)});
    }
  }
  return candidates;
}

/** A control's rect and clamped insets, from candidates already read. */
function measureOne(
  watch: Watch,
  candidates: ReadonlyArray<Candidate>,
): {target: HitRect; insets: HitInsets; neighbours: HitRect[]} {
  const target = plainRect(watch.element);
  // Two targets each growing up to half the minimum reach each other from a
  // minimum apart.
  const reach = Math.max(0, watch.minSize);
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
  return {
    target,
    insets: clampedHitInsets(target, neighbours, watch.minSize),
    neighbours,
  };
}

/** One pass: every pending control's reads, then every write. */
function measure(): void {
  frame = null;
  const due = [...pending].filter(watch => watch.isVisible);
  pending.clear();
  if (!isCoarse || due.length === 0) {
    return;
  }
  // Reads: the page's interactive elements once for the whole pass.
  const candidates = readCandidates(due[0].element.ownerDocument);
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
  if (frame == null && typeof requestAnimationFrame === 'function') {
    frame = requestAnimationFrame(measure);
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
 * At a touch's start, re-measure the control it landed on, at once: if the
 * touch is outside the fresh area (a neighbour moved nearer since the last
 * measurement), the control's click is swallowed. The tap then does
 * nothing rather than toggle the wrong control; nothing is re-sent to the
 * neighbour, and the next tap uses the fresh insets.
 */
function onPress(event: Event): void {
  // One listener for every watched control, on the document: a control, a
  // row or a handle carries none of its own (a list's listeners stay the
  // list's, spec:AST-103 FR5). The innermost watched element the press
  // lands in is the one it is for.
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
  // A swallower left from a touch that sent no click goes with the next one.
  entry.disarm?.();
  const press = event;
  if (!isCoarse || press.pointerType !== 'touch') {
    return;
  }
  const candidates = readCandidates(element.ownerDocument);
  const x = press.clientX;
  const y = press.clientY;
  // The touch is the control's unless a neighbour is nearer it: inside the
  // fresh area too (a corner beside an offset or diagonal neighbour), and
  // a few px past it, where a browser's own touch adjustment reaches.
  let isNearerNeighbour = false;
  for (const watch of entry.watches) {
    const {target, insets, neighbours} = measureOne(watch, candidates);
    deliver(watch, insets);
    const own = distanceTo(target, x, y);
    isNearerNeighbour ||= neighbours.some(rect => distanceTo(rect, x, y) < own);
  }
  if (isNearerNeighbour) {
    const swallow = (click: Event) => {
      disarm();
      // A keyboard or assistive-technology activation (detail 0) is never
      // this touch's click: it goes through.
      if ((click as MouseEvent).detail === 0) {
        return;
      }
      click.preventDefault();
      click.stopPropagation();
    };
    const doc = element.ownerDocument;
    const disarm = () => {
      element.removeEventListener('click', swallow, true);
      element.removeEventListener('pointercancel', disarm, true);
      doc.removeEventListener('pointerdown', onNextPress, PASSIVE_CAPTURE);
      if (entry.disarm === disarm) {
        entry.disarm = null;
      }
    };
    // Any next press, here or elsewhere (the control's own label), ends it.
    const onNextPress = () => disarm();
    element.addEventListener('click', swallow, true);
    // A touch the browser takes (a scroll) sends no click.
    element.addEventListener('pointercancel', disarm, true);
    // Registered after this press's own dispatch has passed the document.
    doc.addEventListener('pointerdown', onNextPress, PASSIVE_CAPTURE);
    entry.disarm = disarm;
  }
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
 * Everything that watches the page for hit areas: on only while the primary
 * pointer is coarse, so a mouse page runs no observer, timer or listener for
 * them (`spec:AST-094` FR24).
 */
function startObserving(): void {
  if (view == null) {
    return;
  }
  view.addEventListener('resize', scheduleAll);
  view.document.addEventListener('pointerdown', onPress, PASSIVE_CAPTURE);
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
  view?.document.removeEventListener('pointerdown', onPress, PASSIVE_CAPTURE);
  visibility?.disconnect();
  resize?.disconnect();
  visibility = null;
  resize = null;
  scopeTimers.forEach(timer => clearTimeout(timer));
  scopeTimers.clear();
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
 * Where the primary pointer is not coarse the insets are 0 and nothing but
 * the pointer query is listened to; where it is, the element is measured
 * while on screen, on resize (its own, its parent's, the window's) and once
 * its parent's text and children settle after a change, all in the shared
 * per-frame pass, and re-measured at once when a touch starts on it.
 */
export function watchHitArea(
  element: Element,
  onInsets: (insets: HitInsets) => void,
  {minSize = MIN_TOUCH_TARGET}: WatchHitAreaOptions = {},
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
    onInsets,
    isVisible: isCoarse && visibility == null,
    last: NO_HIT_INSETS,
  };
  let entry = watched.get(element);
  if (entry == null) {
    entry = {watches: new Set(), release: null, disarm: null};
    watched.set(element, entry);
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
