// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file listLayoutUpdates.ts
 * @input A List's element, its `animatedLayout` handle and the one
 *   size-change module (motion/animatedLayout.ts)
 * @output `useListLayoutUpdates`, which reports each row inserted, removed or
 *   moved between two renders to the handle, and `keepPresentation`, for a
 *   row that leaves the list
 * @position Internal. List calls it with its `animatedLayout` prop.
 *
 * SYNC: When modified, update List/List.tsx, List/ListItem.tsx and
 * List/__tests__/ListUpdates.interaction.browser.spec.ts.
 */

// - The module exits only rows it measured, so `measure` reports each row in
//   view. It also reports the last row, so content after the list glides when
//   no row is in view.
// - The module's walk reads rows only within its band around the visible
//   part, so a long list's far rows are never read. With one row in view and
//   the last row far from it, an insert above the last row moves it at once.
// - Of two rows that cross, the one with the longer glide rides above. The
//   list's surface is behind it, as an opaque UIKit cell passes over its
//   neighbors.
// - A row without an `itemKey` has no identity, so its own change lands at
//   once. It still glides when a keyed row's change moves it.

import {useCallback, useRef, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  holdLayoutExit,
  landLayoutGlideSideways,
  playLayoutChange,
  reportLayoutChange,
  type AnimatedLayout,
  type LayoutChange,
} from '../motion/animatedLayout';
import {itemKeyOf} from '../privateAttributes/itemKey.stylex';
import {isLeaving, markLeaving} from '../privateAttributes/leaving.stylex';
import {markTravelling} from '../privateAttributes/travelling.stylex';

/**
 * The rows each list reported for the commit in progress, the only rows that
 * can exit. A row that leaves keeps what it showed on screen for its exit
 * (`keepPresentation`) only when its list reported it.
 */
const reportedRows = new WeakMap<Element, ReadonlySet<Element>>();

/** Whether `row`'s list reported it for the commit in progress. */
export function isReportedRow(row: Element): boolean {
  const list = row.parentElement;
  return list != null && (reportedRows.get(list)?.has(row) ?? false);
}

/** Moves under half a pixel are layout noise, not updates. */
const MIN_MOVE_PX = 0.5;

/** What `measure` saw, for the layout effect of the same commit. */
interface Measured {
  /** Every keyed row, by its key, in order. */
  readonly rows: ReadonlyMap<string, HTMLElement>;
  readonly order: ReadonlyArray<string>;
  /**
   * Where each row near the visible part was (its top), the indices from
   * `near[0]` to `near[1]` of `order`: only those can glide in view.
   */
  readonly tops: ReadonlyMap<string, number>;
  readonly near: readonly [number, number] | null;
  /** The rows reported to the module, the only ones whose exit it holds. */
  readonly reported: ReadonlySet<HTMLElement>;
  readonly changes: ReadonlyArray<LayoutChange>;
  /** Near rows with a translation of their own, read before the commit. */
  readonly translations: ReadonlyArray<Translation>;
  /** The list's keyed and leaving rows before the commit, in order. */
  readonly sequence: ReadonlyArray<HTMLElement>;
}

/**
 * The first and last indices of `rows` whose box meets the vertical span from
 * `start` to `end`, in viewport pixels, or null when none does. Rows sit in
 * order down the list, so halving finds them by reading a few rows' places,
 * never every row's.
 */
function rowsMeeting(
  rows: ReadonlyArray<HTMLElement>,
  start: number,
  end: number,
): readonly [number, number] | null {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (rows[middle].getBoundingClientRect().bottom > start) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  const first = low;
  high = rows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (rows[middle].getBoundingClientRect().top < end) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const last = low - 1;
  return first <= last ? [first, last] : null;
}

/**
 * The list's rows that have an item key, by it, in order. A row without one
 * has no identity to match across renders: its own insertion, removal or
 * move is never reported, and changes at once.
 */
function keyedRows(list: HTMLElement): Map<string, HTMLElement> {
  const rows = new Map<string, HTMLElement>();
  for (const child of list.children) {
    if (!(child instanceof HTMLElement) || isLeaving(child)) {
      continue;
    }
    const key = itemKeyOf(child);
    if (key != null) {
      rows.set(key, child);
    }
  }
  return rows;
}

/**
 * The inline styles that a leaving row and its parts showed as they left,
 * such as a swipe's travel. `keepPresentation` records them, and the row's
 * exit writes them back.
 */
const keptStyles = new WeakMap<
  HTMLElement,
  ReadonlyArray<readonly [HTMLElement | SVGElement, string]>
>();

/**
 * Records what the Web Animations running on `row` and its parts present (a
 * swipe's travel, on the compositor) as inline styles. A removed row is
 * detached from the document, which drops those animations. Its exit puts it
 * back and writes the record, so it shows what was on screen when it left.
 * ListItem calls it as React detaches the row, while the row is still in the
 * document. React also detaches the ref of a row that stays, when the ref
 * changes. So nothing stays written. Animations on pseudo-elements, or that
 * cannot write their values, are left alone.
 */
export function keepPresentation(row: HTMLElement): void {
  if (typeof row.getAnimations !== 'function') {
    return;
  }
  const parts = [row, ...row.querySelectorAll<HTMLElement | SVGElement>('*')];
  const before = parts.map(part => part.getAttribute('style'));
  // commitStyles is the only way to read what an animation presents. It
  // writes the values into the target's style, so each part gets its own
  // style back once the values are read.
  for (const animation of row.getAnimations({subtree: true})) {
    try {
      animation.commitStyles();
    } catch {
      // A pseudo-element's or an unrendered target's animation: nothing to
      // keep.
    }
  }
  // The parts' owners clean up after the row does, and may reset its style.
  // A swipe gives its row back its own translation. The record keeps it.
  const styled: (readonly [HTMLElement | SVGElement, string])[] = [];
  parts.forEach((part, index) => {
    if (part.style.length > 0) {
      styled.push([part, part.style.cssText]);
    }
    const style = before[index];
    if (part.getAttribute('style') !== style) {
      if (style == null) {
        part.removeAttribute('style');
      } else {
        // Through the CSSOM, which a strict Content Security Policy allows.
        part.style.cssText = style;
      }
    }
  });
  keptStyles.set(row, styled);
}

/**
 * The rows of `list` in order: its keyed rows and the rows still leaving. Each
 * leaving row's place is counted against the keyed rows around it.
 */
function rowSequence(list: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];
  for (const child of list.children) {
    if (
      child instanceof HTMLElement &&
      (isLeaving(child) || itemKeyOf(child) != null)
    ) {
      rows.push(child);
    }
  }
  return rows;
}

/**
 * Marks a row that left as leaving. The exit makes it inert. Until then it is
 * hidden from assistive technology, so no later commit counts it as a row.
 */
function markLeavingRow(element: HTMLElement): void {
  markLeaving(element);
  element.setAttribute('aria-hidden', 'true');
}

/**
 * After a row that left is back in the document, its parts' animations would
 * apply again over what they showed as it left. This stops them, so it shows
 * what was on screen.
 */
function showAsItLeft(element: HTMLElement): void {
  if (typeof element.getAnimations === 'function') {
    for (const animation of element.getAnimations({subtree: true})) {
      animation.cancel();
    }
  }
  for (const [part, cssText] of keptStyles.get(element) ?? []) {
    part.style.cssText = cssText;
  }
  keptStyles.delete(element);
}

/**
 * Puts `rows` right before `anchor`, or at the list's end when it is null, in
 * their order. A row already in its place stays where it is.
 */
function placeBefore(
  list: HTMLElement,
  rows: ReadonlyArray<HTMLElement>,
  anchor: HTMLElement | null,
): void {
  let next = anchor;
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    const before =
      next == null ? list.lastElementChild : next.previousElementSibling;
    if (before !== row) {
      list.insertBefore(row, next);
    }
    next = row;
  }
}

/** What `readTranslation` reads off a row, before anything is written. */
interface Translation {
  readonly view: Window & typeof globalThis;
  readonly row: HTMLElement;
  readonly x: number;
  readonly y: number;
  readonly children: ReadonlyArray<HTMLElement | SVGElement>;
  readonly transforms: ReadonlyArray<string>;
}

/**
 * Reads a row's own translation, such as a swipe's, and its children's
 * transforms before the commit. Returns null when the row has none.
 */
function readTranslation(row: HTMLElement): Translation | null {
  const view = row.ownerDocument.defaultView;
  if (view == null || typeof view.DOMMatrix !== 'function') {
    return null;
  }
  const transform = view.getComputedStyle(row).transform;
  if (transform === '' || transform === 'none') {
    return null;
  }
  const own = new view.DOMMatrix(transform);
  if (
    !own.is2D ||
    own.a !== 1 ||
    own.b !== 0 ||
    own.c !== 0 ||
    own.d !== 1 ||
    (own.e === 0 && own.f === 0)
  ) {
    return null;
  }
  const children = [...row.children].filter(
    (child): child is HTMLElement | SVGElement =>
      child instanceof view.HTMLElement || child instanceof view.SVGElement,
  );
  return {
    view,
    row,
    x: own.e,
    y: own.f,
    children,
    // A translation composes the same way whatever a child's transform
    // origin.
    transforms: children.map(child => view.getComputedStyle(child).transform),
  };
}

/**
 * Moves a row's own translation onto its children. The row's box then lies
 * where the row lies in the list, while it shows the same thing. A row that
 * leaves exits on that box, in view. Its exit's clip keeps the action that
 * a swipe uncovered and cuts the content that the swipe carried away. With
 * the translation on the row, a row that a swipe carried out of the list's
 * box would lie out of view.
 */
function settleTranslation({
  view,
  row,
  x,
  y,
  children,
  transforms,
}: Translation): void {
  row.style.setProperty('transform', 'none');
  children.forEach((child, index) => {
    const current = transforms[index];
    const shift = new view.DOMMatrix().translate(x, y);
    const moved =
      current === '' || current === 'none'
        ? shift
        : shift.multiply(new view.DOMMatrix(current));
    child.style.setProperty('transform', moved.toString());
  });
}

/**
 * Marks each row that crosses another on the longer of the two glides, for
 * the length of its glide, so it rides above. It reads the glides once the
 * module has started them, after the commit's layout effects. It marks the
 * rows then too, after the module has read the commit's layout. One pass each
 * way over the rows near the visible part, in their old order, finds the rows
 * that cross any other. Only those are compared, so a removal or an insert,
 * which crosses nothing, costs the two passes.
 */
function markCrossings(
  measured: Measured,
  now: ReadonlyMap<string, HTMLElement>,
): void {
  const {near, order, tops} = measured;
  if (near == null) {
    return;
  }
  const rows: {element: HTMLElement; from: number; to: number}[] = [];
  for (let index = near[0]; index <= near[1]; index++) {
    const key = order[index];
    const from = tops.get(key);
    const element = now.get(key);
    if (from != null && element != null) {
      rows.push({element, from, to: element.getBoundingClientRect().top});
    }
  }
  // A row crosses another when an earlier row ends below it, or a later row
  // ends above it.
  const crosses = rows.map(() => false);
  let lowest = -Infinity;
  for (let index = 0; index < rows.length; index++) {
    crosses[index] = lowest > rows[index].to;
    lowest = Math.max(lowest, rows[index].to);
  }
  let highest = Infinity;
  for (let index = rows.length - 1; index >= 0; index--) {
    crosses[index] ||= highest < rows[index].to;
    highest = Math.min(highest, rows[index].to);
  }
  const crossing = rows.filter((_, index) => crosses[index]);
  const raised = new Set<HTMLElement>();
  for (let a = 0; a < crossing.length; a++) {
    for (let b = a + 1; b < crossing.length; b++) {
      const upper = crossing[a];
      const lower = crossing[b];
      if (upper.to > lower.to) {
        // On a tie, the row gliding up rides above.
        const rider =
          Math.abs(upper.to - upper.from) > Math.abs(lower.to - lower.from)
            ? upper
            : lower;
        if (Math.abs(rider.to - rider.from) >= MIN_MOVE_PX) {
          raised.add(rider.element);
        }
      }
    }
  }
  const travelling = [...raised];
  if (travelling.length === 0) {
    return;
  }
  // After the module's own microtask has read the layout and started the
  // glides. A mark set before that read would make it lay the page out again.
  queueMicrotask(() => {
    for (const element of travelling) {
      const glide =
        typeof element.getAnimations === 'function'
          ? element.getAnimations().at(-1)
          : undefined;
      if (glide != null) {
        const end = markTravelling(element);
        glide.finished.then(end, end);
      }
    }
  });
}

/**
 * Reports the list's row changes to `animatedLayout`. Returns the callback
 * that measures them, which LayoutChangeSnapshot calls before each commit.
 * Its layout effect plays them after the commit.
 */
export function useListLayoutUpdates(
  listRef: RefObject<HTMLElement | null>,
  animatedLayout: AnimatedLayout | undefined,
): () => void {
  const measuredRef = useRef<Measured | null>(null);
  const measure = useCallback(() => {
    measuredRef.current = null;
    const list = listRef.current;
    if (list == null || animatedLayout == null) {
      return;
    }
    const rows = keyedRows(list);
    if (rows.size === 0) {
      // No keyed row yet: the list's last child, or the list while it is
      // empty, stands in. A first keyed row then enters, and the content
      // after the list glides.
      const last = list.lastElementChild;
      const target = last instanceof HTMLElement ? last : list;
      const change = reportLayoutChange(animatedLayout, () => target);
      change.measureBefore();
      measuredRef.current = {
        rows,
        order: [],
        tops: new Map(),
        near: null,
        reported: new Set([target]),
        changes: [change],
        translations: [],
        sequence: rowSequence(list),
      };
      reportedRows.set(list, measuredRef.current.reported);
      return;
    }
    const order = [...rows.keys()];
    const elements = [...rows.values()];
    const height = list.ownerDocument.defaultView?.innerHeight ?? 0;
    // The rows near the visible part (a viewport's height above and below
    // it): only they can glide in view, so only their places are read.
    const near = rowsMeeting(elements, -height, 2 * height);
    const translations: Translation[] = [];
    const tops = new Map<string, number>();
    if (near != null) {
      // One pass reads every near row's translation and place. A row's place
      // is its box without its own translation. The measurement writes
      // nothing, so no read here lays the page out again.
      for (let index = near[0]; index <= near[1]; index++) {
        const translation = readTranslation(elements[index]);
        const {top} = elements[index].getBoundingClientRect();
        tops.set(order[index], top - (translation?.y ?? 0));
        if (translation != null) {
          translations.push(translation);
        }
      }
    }
    // The module exits only rows it measured, so every row in view is
    // reported. The last row is reported too, so content after the list
    // glides when no row is in view.
    const shown = rowsMeeting(elements, 0, height);
    const targets: HTMLElement[] = [];
    if (shown != null) {
      for (let index = shown[0]; index <= shown[1]; index++) {
        targets.push(elements[index]);
      }
    }
    if (shown == null || shown[1] !== elements.length - 1) {
      targets.push(elements[elements.length - 1]);
    }
    const changes = targets.map(target => {
      const change = reportLayoutChange(animatedLayout, () => target);
      change.measureBefore();
      return change;
    });
    measuredRef.current = {
      rows,
      order,
      tops,
      near,
      reported: new Set(targets),
      changes,
      translations,
      sequence: rowSequence(list),
    };
    reportedRows.set(list, measuredRef.current.reported);
  }, [animatedLayout, listRef]);

  // Syncs with external systems. One is the shared size-change module's batch
  // for the handle's area, measured before this commit, which this plays. The
  // other is the rows reported for the commit, which a leaving row reads as
  // it unmounts, before this runs.
  useIsomorphicLayoutEffect(() => {
    const measured = measuredRef.current;
    measuredRef.current = null;
    const list = listRef.current;
    if (list != null) {
      reportedRows.delete(list);
    }
    if (measured == null || list == null || animatedLayout == null) {
      return;
    }
    const now = keyedRows(list);
    const order = [...now.keys()];
    if (
      order.length === measured.order.length &&
      order.every((key, index) => key === measured.order[index])
    ) {
      // The same rows in the same order: nothing to play (the measurement
      // is dropped by the next frame).
      return;
    }
    // Each row that left, and each row still leaving, keeps its place: after
    // as many staying rows as came before it. React moves only its own rows,
    // so this also keeps a leaving row in place when the rows around it move.
    const current = [...now.values()];
    const staying = new Set(current);
    const places = new Map<HTMLElement | null, HTMLElement[]>();
    const leaving: HTMLElement[] = [];
    let before = 0;
    for (const element of measured.sequence) {
      if (staying.has(element)) {
        before += 1;
        continue;
      }
      if (!isLeaving(element)) {
        // Only a row the module measured can exit; any other went with the
        // commit (it was out of view).
        if (!measured.reported.has(element)) {
          continue;
        }
        markLeavingRow(element);
        leaving.push(element);
      }
      const anchor = current[before] ?? null;
      places.set(anchor, [...(places.get(anchor) ?? []), element]);
    }
    for (const [anchor, rows] of places) {
      placeBefore(list, rows, anchor);
    }
    for (const element of leaving) {
      showAsItLeft(element);
    }
    for (const change of measured.changes) {
      change.animate();
    }
    // A row that leaves exits on its own box, in view: its translation moves
    // onto its children before its exit starts. The commit has already
    // changed the layout, so this costs no layout of its own.
    const settled: HTMLElement[] = [];
    for (const translation of measured.translations) {
      if (leaving.includes(translation.row)) {
        settleTranslation(translation);
        settled.push(translation.row);
      }
    }
    if (settled.length > 0) {
      // The module read the row's old place with the translation on it, so
      // its glide adds that translation to the row's move in the list. The
      // row already shows where it showed, so before the frame paints, the
      // glide keeps only its move in the list.
      queueMicrotask(() => {
        for (const row of settled) {
          landLayoutGlideSideways(row);
        }
      });
    }
    for (const element of leaving) {
      if (!holdLayoutExit(animatedLayout, element, () => element.remove())) {
        // An exit the module does not hold (out of view, Reduce Motion with
        // a fine pointer): the row goes now, before this frame paints.
        element.remove();
      }
    }
    // A row that appeared in view enters (the module plays an entrance only
    // in view): the rows in view are found by halving again.
    const height = list.ownerDocument.defaultView?.innerHeight ?? 0;
    const shown = rowsMeeting(current, 0, height);
    if (shown != null) {
      for (let index = shown[0]; index <= shown[1]; index++) {
        const element = current[index];
        const key = itemKeyOf(element);
        if (key != null && !measured.rows.has(key)) {
          playLayoutChange(animatedLayout, element);
        }
      }
    }
    markCrossings(measured, now);
  });

  return measure;
}
