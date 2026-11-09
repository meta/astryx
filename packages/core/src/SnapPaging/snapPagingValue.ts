// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file snapPagingValue.ts
 * @input A scrolling row of snap items
 * @output The `SnapPaging` value, the calls Carousel makes on it
 *   (`isSnapPaging`, `attachSnapPaging`, `moveSnapPaging`,
 *   `moveHeldSnapPaging`), where a held row is shown, and stops
 * @position Carousel's only link to snap paging. It imports no pager code,
 *   so a Carousel without `hasSnap={useSnapPaging()}` bundles none
 */

import {isRtlElement} from '../hooks/isRtlElement';
import {realmValue, sharedKey} from '../utils/sharedRealm';

/** Options of `useSnapPaging`. */
export interface SnapPagingOptions {
  /**
   * What one flick moves. `'view'`: one view, landing on the item start edge
   * nearest one viewport on. `'item'`: one item.
   * @default 'view'
   */
  readonly pages?: 'view' | 'item';
}

/**
 * Configured snap paging. Make it with `useSnapPaging`, and pass it to
 * Carousel's `hasSnap`.
 */
export interface SnapPaging {
  /**
   * A brand that is never present, so the paging types of the package and a
   * swizzled copy match.
   */
  readonly '@astryxdesign/core/snap-paging/v1'?: never;
}

/** The paging attached to one row. */
export interface SnapPagingAttachment {
  readonly detach: () => void;
  readonly move: (target: (at: number, end: number) => number) => void;
  readonly moveHeld: (target: (at: number, end: number) => number) => boolean;
}

/**
 * Where a row the paging holds is shown: its offset toward the end, and the
 * travel it was taken over with.
 */
export interface HeldRow {
  readonly offset: number;
  readonly travel: number;
}

/** Hears a held row on each frame of the hold, and null at the hand-back. */
export type HeldRowListener = (held: HeldRow | null) => void;

type Attach = (
  element: HTMLElement,
  onHeld?: HeldRowListener,
) => SnapPagingAttachment;

interface SnapPagingValue {
  readonly attach: Attach;
}

// Registered, so a swizzled Carousel accepts the package's paging value.
const values = realmValue(
  sharedKey('snap-paging/values', 1),
  () => new WeakSet<object>(),
);
// Each attached row's paging, for Carousel's own scroll calls.
const attachments = new WeakMap<HTMLElement, SnapPagingAttachment>();

/** A `SnapPaging` value that attaches with `attach`. */
export function makeSnapPaging(attach: Attach): SnapPaging {
  const value: SnapPagingValue = {attach};
  values.add(value);
  return value as unknown as SnapPaging;
}

/** Whether `value` came from `useSnapPaging`. */
export function isSnapPaging(value: unknown): value is SnapPaging {
  return typeof value === 'object' && value !== null && values.has(value);
}

/**
 * Attaches snap paging to `element`; the returned function detaches it.
 * `onHeld` hears where the row is shown while the paging holds it.
 */
export function attachSnapPaging(
  value: SnapPaging,
  element: HTMLElement,
  onHeld?: HeldRowListener,
): () => void {
  const attachment = (value as unknown as SnapPagingValue).attach(
    element,
    onHeld,
  );
  attachments.set(element, attachment);
  return () => {
    attachments.delete(element);
    attachment.detach();
  };
}

/**
 * Moves the row through the paging to `target(shown, end)`, an offset toward
 * the end, and takes the row over first when it is at rest. `end` is its
 * travel. False when no paging is attached.
 */
export function moveSnapPaging(
  element: HTMLElement,
  target: (shown: number, end: number) => number,
): boolean {
  const attachment = attachments.get(element);
  if (attachment == null) {
    return false;
  }
  attachment.move(target);
  return true;
}

/**
 * Moves a row the paging holds to `target(shown, end)`, an offset toward the
 * end. `end` is its travel when taken over. False when it is not held.
 */
export function moveHeldSnapPaging(
  element: HTMLElement,
  target: (shown: number, end: number) => number,
): boolean {
  return attachments.get(element)?.moveHeld(target) ?? false;
}

/** The stop nearest `at`, or `at` itself when the row has no stops. */
export function nearestStop(stops: ReadonlyArray<number>, at: number): number {
  return stops.reduce(
    (best, stop) => (Math.abs(stop - at) < Math.abs(best - at) ? stop : best),
    stops[0] ?? at,
  );
}

/**
 * The scale a scaled ancestor gives the row's rects: the rect's width over the
 * row's layout width. Scroll offsets do not have it.
 */
export function rowScale(element: HTMLElement, box: DOMRect): number {
  return element.offsetWidth > 0 && box.width > 0
    ? box.width / element.offsetWidth
    : 1;
}

/** A row's pages: one stop each, and the items whose stops native snap skips. */
export interface SnapPages {
  readonly stops: number[];
  readonly skipped: Element[];
}

/**
 * The row's stops, one per page (`snapPages`). Read from the items' rects,
 * with the position `shown` added back.
 */
export function snapStops(
  element: HTMLElement,
  shown: number,
  end: number,
): number[] {
  return snapPages(element, shown, end).stops;
}

/**
 * The row's stops, one per page. Stops closer than half a pixel are one stop.
 * The end's page is the page that the end rounds to. So a stop within half
 * its preceding step of the end is that page, which rests where the row
 * ends. Native snap skips the items of that stop (`skipped`).
 */
export function snapPages(
  element: HTMLElement,
  shown: number,
  end: number,
): SnapPages {
  const stops: number[] = [];
  const owners: Element[][] = [];
  for (const {item, stop} of itemStops(element, shown, end)) {
    if (stops.length === 0 || stop > stops[stops.length - 1] + 0.5) {
      stops.push(stop);
      owners.push([item]);
    } else {
      owners[owners.length - 1].push(item);
    }
  }
  const n = stops.length;
  if (
    n >= 3 &&
    stops[n - 1] >= end - 0.5 &&
    stops[n - 1] - stops[n - 2] < (stops[n - 2] - stops[n - 3]) / 2
  ) {
    stops.splice(n - 2, 1);
    return {stops, skipped: owners[n - 2]};
  }
  return {stops: n > 0 ? stops : [0], skipped: []};
}

function itemStops(
  element: HTMLElement,
  shown: number,
  end: number,
): {item: Element; stop: number}[] {
  const rtl = isRtlElement(element);
  const box = element.getBoundingClientRect();
  const scale = rowScale(element, box);
  const border = rtl
    ? element.offsetWidth - element.clientWidth - element.clientLeft
    : element.clientLeft;
  const style = getComputedStyle(element);
  const padding =
    Number.parseFloat(
      rtl ? style.scrollPaddingRight : style.scrollPaddingLeft,
    ) || 0;
  return Array.from(element.children, item => {
    const rect = item.getBoundingClientRect();
    const fromEdge =
      (rtl ? box.right - rect.right : rect.left - box.left) / scale;
    return {
      item,
      stop: Math.min(Math.max(fromEdge - border + shown - padding, 0), end),
    };
  });
}
