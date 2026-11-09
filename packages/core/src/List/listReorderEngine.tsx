// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file listReorderEngine.tsx
 * @input A List's element and its reorderable object's options, through
 *   List/listReorderContext.ts. Also the reorder model (List/reorderModel.ts),
 *   the touch layer (List/ListReorderTouch.ts) and the row moves of
 *   utils/rowMotion.ts. Also the edge autoscroll, the touch presentation,
 *   the shared announcer, and the anchored hint that Core's keyboard hints
 *   share (hooks/anchoredHint.tsx)
 * @output `listReorderEngine`, the machinery a reorderable object carries:
 *   the reorder session of a List, its Host and its handle. A drag from a
 *   handle leaves the rows in place. The row dims where it is, and a preview
 *   of it follows the pointer. An insertion line marks where it would land,
 *   and the list autoscrolls near the scroll edges. The drop reports the move
 *   once and the rows rearrange. The dragged row glides from where its
 *   preview was. A cancelled drag restores everything at once. Activating a
 *   handle without a drag turns on reorder mode for its row. Each arrow
 *   moves it a place at once, with one report, and announces its place and
 *   neighbours. Escape or another activation ends the mode, keeping the moves.
 *   While the mode is on, a hint anchored to the handle shows the moves and
 *   Done as buttons that do what the keys do
 * @position Internal to the reorder. Only createReorderable imports it, so a
 *   List without `reorderable` loads none of it. ListReorderHandle drives it
 *   from each row's handle
 *
 * The drag's look follows the reorder design. The surrounding rows stay
 * still until the drop, and the source is dimmed in place. A preview follows
 * the pointer one to one, its centre stopping at the scroll view's edges. An
 * accent insertion line, shared by pointer and keyboard, marks the candidate
 * position. UIKit's edit-mode reorder (iOS 26.2, measured) supplies the
 * clocks. They are the hold, the rows' glide to their new places after the
 * drop, and autoscroll. Autoscroll is a 20 ms timer whose step grows with how
 * far the preview's edge is past the scroll edge. With a mouse (the theme's
 * presentation) or Reduce Motion, the rows jump to their new places.
 *
 * HOW IT RUNS. Everything after the drag begins is imperative: no React
 * render and no layout read until the drop, but one. After a scroll the
 * engine did not cause, a later frame reads the scroller's offset once,
 * before it writes. The begin reads each row's
 * layout once. Each move writes one `translate` on the preview, through the
 * shared per-element animator's `set`. A position change writes one on the
 * insertion line. The list root carries `data-astryx-reordering` from the
 * begin until the commit that applies the drop. So the List's layout updates
 * (List/listLayoutUpdates.ts) leave that commit to the reorder. After it,
 * each row's old layout place is put back with an inverse offset that glides
 * to 0. For the dragged row, that is where its preview was dropped. The
 * commit reads every row before its first write, so it lays out once. If
 * `onReorder` does not commit a new order by the end of the task, nothing
 * moves. Reorder mode reports each key's move at once. Once it commits,
 * under a finger's presentation, the rows slide to their new places. The
 * listeners are the list's, not each row's. There is one pointerdown
 * listener for a mouse, and for a pen where the primary pointer is fine.
 * There is one hold recognizer for a finger, and for a pen where the primary
 * pointer is coarse. It receives only the touches that begin on this list's
 * handles. A row moves when it holds a handle registered here with
 * its item key. The others keep their places, and those at either end bound
 * the rest. What runs only on a touch screen is in ListReorderTouch.ts,
 * imported here alone.
 *
 * SYNC: When modified, update List/listReorderContext.ts, List/List.tsx,
 * List/ListReorderHandle.tsx and List/ListReorderTouch.ts.
 */

import {
  useRef,
  useSyncExternalStore,
  type Key,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  useAnnounce,
  type AnnounceFn,
  type AnnouncePoliteness,
} from '../hooks/useAnnounce';
import type {TranslatorFn} from '../i18n/useTranslator';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/List/listReorderEngine.generated';
import {useLayer} from '../Layer/useLayer';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {Kbd} from '../Kbd/Kbd';
import {anchoredHintStyles, renderAnchoredHint} from '../hooks/anchoredHint';
import {spacingVars} from '../theme/tokens.stylex';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import type {LongPressGestureRecognizer} from '../gestures/LongPressGestureRecognizer';
import {VelocityTracker} from '../gestures/VelocityTracker';
import {inertClone, paintedBackground} from '../motion/inertClone';
import {reorder} from '../motion/uikit/reorder';
import {
  animatorFor,
  isMoving,
  motionNow,
  motionOf,
  releaseMotion,
} from '../utils/rowMotion';
import {edgeAutoscroll, type EdgeAutoscroll} from '../utils/edgeAutoscroll';
import {subscribeInput} from '../utils/inputStream';
import {nearestScroller} from '../utils/scrollingAncestor';
import {useTouchPresentation} from '../utils/touchPresentation';
import {useTouchHitArea} from '../utils/touchHitArea';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {createDevWarnings, devWarn} from '../utils/devWarning';
import {observeMutations} from '../utils/sharedMutationObserver';
import {isLeaving, markLeaving} from '../privateAttributes/leaving.stylex';
import {
  closestReorderHandle,
  reorderHandlesIn,
} from '../privateAttributes/listReorder.stylex';
import {
  clearReorderSource,
  markReorderSource,
} from '../privateAttributes/reorderSource.stylex';
import {markReorderPreview} from '../privateAttributes/reorderPreview.stylex';
import {
  hideReorderLine,
  showReorderLine,
} from '../privateAttributes/reorderLine.stylex';
import {
  clearReordering,
  isReordering,
  markReordering,
} from '../privateAttributes/reordering.stylex';
import {
  INSERTION_LINE_THICKNESS,
  ListReorderHandle,
  ListReorderRowName,
  reorderListStyle,
  reorderRowStyle,
} from './ListReorderHandle';
import {attachTouchHold, touchMotion} from './ListReorderTouch';
import type {
  ListReorderContextValue,
  ListReorderEngine,
  ListReorderOptions,
  ListReorderSession,
} from './listReorderContext';
import {
  autoscrollStep,
  clampTop,
  dropPosition,
  type ReorderGeometry,
} from './reorderModel';

registerEnglishFallback(english);

/**
 * A mouse's travel, in px, before its press drags the row: below it the
 * press stays a click. A mouse shifts a pixel or two under the press of the
 * button itself. The date wheel's mouse drag uses the same value
 * (DateInput/usePointerDragScroll.ts `DRAG_SLOP`); a test keeps them equal.
 */
export const MOUSE_DRAG_SLOP = 4;

/** Moves under half a pixel are layout noise. */
const MIN_MOVE_PX = 0.5;

/**
 * How long after `start` the handle takes back the focus that the UI hands
 * back, in ms. A menu restores its trigger's focus as it closes, within a
 * task or two. No person moves the focus that fast.
 */
const START_FOCUS_CLAIM_MS = 150;

/**
 * The sessions each reorderable object (by its options) is mounted on, in
 * the order they mounted: `start` uses the last.
 */
const sessionsByOptions = new WeakMap<
  ListReorderOptions,
  ListReorderController[]
>();

/** Records `controller` as mounted with `options`; returns the removal. */
function mountSession(
  options: ListReorderOptions,
  controller: ListReorderController,
): () => void {
  const sessions = sessionsByOptions.get(options) ?? [];
  sessionsByOptions.set(options, [
    ...sessions.filter(session => session !== controller),
    controller,
  ]);
  return () => {
    const rest = (sessionsByOptions.get(options) ?? []).filter(
      session => session !== controller,
    );
    if (rest.length > 0) {
      sessionsByOptions.set(options, rest);
    } else {
      sessionsByOptions.delete(options);
    }
  };
}

/**
 * Where a row's `y` is on screen at `at`: its shared animator's value, which
 * the drag writes directly (`set`) as well as through springs.
 */
function shownY(element: HTMLElement, at: number): number {
  return animatorFor(element).get('y', at);
}

/**
 * Puts a row at rest at 0 at once. A row already at rest there takes no
 * write. The animator's `set` reads the row's style back after its write, so
 * one `set` per row forces a style pass per row.
 */
function settleAtRest(
  element: HTMLElement,
  value: number,
  moving: boolean,
): void {
  if (value !== 0 || moving) {
    animatorFor(element).set({y: 0});
  }
  releaseMotion(element, 'translate');
}

/**
 * Whether the row's label element names it: it shows text, or holds an icon
 * or image with an accessible name of its own.
 */
function namesRow(element: HTMLElement | null): boolean {
  if (element == null) {
    return false;
  }
  return (
    (element.textContent ?? '').trim() !== '' ||
    element.querySelector(
      '[aria-label]:not([aria-label=""]), [aria-labelledby], img[alt]:not([alt=""])',
    ) != null
  );
}

/** What a label element's change that can rename its row looks like. */
const LABEL_WATCH: MutationObserverInit = {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['aria-label', 'aria-labelledby', 'alt'],
};

/**
 * What names a handle besides its own text, as the list last showed it. Its
 * row's 1-based place among the list's rows, and whether Item's label element
 * shows a name. Each is null until the session reads it.
 */
export interface ListReorderHandleName {
  readonly position: number | null;
  readonly labelNamesRow: boolean | null;
}

const UNREAD_NAME: ListReorderHandleName = {
  position: null,
  labelNamesRow: null,
};

/**
 * The list's rows: its element children. A removed row put back for its exit
 * holds no place in the order, so it is left out (`markLeaving`).
 */
function rowsOf(list: HTMLElement): HTMLElement[] {
  return Array.from(list.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !isLeaving(child),
  );
}

/**
 * Which rows bound the drop range: the rows that cannot move at either end
 * of the list, each run of them. One in the middle is passed like any other
 * row; it only has no handle.
 */
function boundsOf(movable: ReadonlyArray<boolean>): boolean[] {
  const bounds = movable.map(() => false);
  for (let index = 0; index < movable.length && !movable[index]; index += 1) {
    bounds[index] = true;
  }
  for (
    let index = movable.length - 1;
    index >= 0 && !movable[index];
    index -= 1
  ) {
    bounds[index] = true;
  }
  return bounds;
}

/**
 * The temporary reduced emphasis the dragged row and its preview share:
 * the same item, moving, and
 * not raised.
 */
const MOVING_OPACITY = '0.6';

/**
 * An element the drag draws over the list: no row to the list's order or
 * its layout updates (`markLeaving`), inert and hidden from assistive
 * technology.
 */
function overlay(element: HTMLElement): HTMLElement {
  markLeaving(element);
  element.setAttribute('aria-hidden', 'true');
  element.inert = true;
  Object.assign(element.style, {
    position: 'absolute',
    margin: '0',
    pointerEvents: 'none',
    zIndex: '2',
    translate: '0px 0px',
  });
  return element;
}

/**
 * A copy of `row` that takes no part in the page (`inertClone`). It has no
 * ids, names or form, so a copied checked radio leaves the row's checked. A
 * row holding a canvas that reads back empty is not copied: its bare box is.
 */
function previewCopyOf(row: HTMLElement): HTMLElement {
  const copy = inertClone(row);
  if (copy != null) {
    return copy;
  }
  const box = row.cloneNode(false) as HTMLElement;
  for (const name of ['id', 'data-testid', 'name', 'for', 'autofocus']) {
    box.removeAttribute(name);
  }
  return box;
}

/**
 * Makes `preview`, a copy of the dragged row, its preview at its place, with
 * the same reduced emphasis as the row and no elevation. It only writes.
 */
function previewOf(
  preview: HTMLElement,
  top: number,
  span: LineSpan,
  background: string | null,
) {
  markReorderPreview(preview);
  overlay(preview);
  Object.assign(preview.style, {
    top: `${top}px`,
    insetInlineStart: `${span.start}px`,
    inlineSize: `${span.size}px`,
    boxSizing: 'border-box',
    boxShadow: 'none',
    opacity: MOVING_OPACITY,
    // It moves by translate from its first move. With its own will-change,
    // its animator reads no stylesheet to keep one.
    willChange: 'translate',
  });
  if (background != null) {
    preview.style.backgroundColor = background;
  }
  return preview;
}

/** The list's custom properties that place its insertion line. */
const LINE_Y = '--astryx-reorder-line-y';
const LINE_START = '--astryx-reorder-line-start';
const LINE_SIZE = '--astryx-reorder-line-size';

/**
 * Where the insertion line runs across a row, in list coordinates: its
 * inline start and its size.
 */
interface LineSpan {
  readonly start: number;
  readonly size: number;
}

/**
 * An extent that starts `left` px from the list's left edge, as an inline
 * start and size. In right-to-left, the start counts from the right edge.
 */
function inlineSpanOf(left: number, size: number, list: HTMLElement): LineSpan {
  const isRtl = getComputedStyle(list).direction === 'rtl';
  return {start: isRtl ? list.clientWidth - left - size : left, size};
}

/**
 * The span of `row` in `list`'s coordinates, read before anything in the
 * frame writes a style. The list may not be the row's offset parent yet.
 */
function lineSpanOf(row: HTMLElement, list: HTMLElement): LineSpan {
  return inlineSpanOf(layoutLeft(row, list), row.offsetWidth, list);
}

/**
 * The preview's span: `row`'s, from the list's padding edge, where the
 * preview sits once the list is positioned. Read before the drag writes.
 */
function previewSpanOf(row: HTMLElement, list: HTMLElement): LineSpan {
  const border = row.offsetParent === list ? 0 : list.clientLeft;
  return inlineSpanOf(layoutLeft(row, list) - border, row.offsetWidth, list);
}

/**
 * Shows the list's insertion line (its pseudo-element, reorderListStyle)
 * across `span`, centred on `center` in list coordinates. It only writes, so
 * a crossing lays nothing out.
 */
function showLine(list: HTMLElement, span: LineSpan, center: number): void {
  list.style.setProperty(LINE_START, `${span.start}px`);
  list.style.setProperty(LINE_SIZE, `${span.size}px`);
  list.style.setProperty(LINE_Y, `${center - INSERTION_LINE_THICKNESS / 2}px`);
  showReorderLine(list);
}

/** Hides the list's insertion line and clears what placed it. */
function hideLine(list: HTMLElement): void {
  hideReorderLine(list);
  for (const property of [LINE_Y, LINE_START, LINE_SIZE]) {
    list.style.removeProperty(property);
  }
}

/**
 * Where the insertion line's centre sits for the dragged row at `position`.
 * It sits in the gap before the row it would land above, or after the one it
 * would land below. Null at its own place: nothing moves.
 */
function lineCenter(
  geometry: ReorderGeometry,
  dragged: number,
  position: number,
): number | null {
  if (position === dragged) {
    return null;
  }
  const target = geometry.rows[position];
  return position < dragged
    ? target.top - geometry.gap / 2
    : target.top + target.height + geometry.gap / 2;
}

/** A row's layout top inside the list (transforms ignored). */
function layoutTop(row: HTMLElement, list: HTMLElement): number {
  const base = row.offsetParent === list ? 0 : list.offsetTop;
  return row.offsetTop - base;
}

/** A row's layout left inside the list (transforms ignored). */
function layoutLeft(row: HTMLElement, list: HTMLElement): number {
  const base = row.offsetParent === list ? 0 : list.offsetLeft;
  return row.offsetLeft - base;
}

function isTransparent(color: string): boolean {
  return (
    color === '' ||
    color === 'transparent' ||
    /^rgba\(.*,\s*0\)$/.test(color) ||
    /\/\s*0\)$/.test(color)
  );
}

/** The element autoscroll writes to and its visible band in the viewport. */
interface Scroller {
  readonly element: Element;
  top: number;
  bottom: number;
  readonly max: number;
  position: number;
}

function scrollerOf(list: HTMLElement): Scroller {
  const doc = list.ownerDocument;
  const element = nearestScroller(list);
  if (element !== (doc.scrollingElement ?? doc.documentElement)) {
    const rect = element.getBoundingClientRect();
    const top = rect.top + element.clientTop;
    return {
      element,
      top,
      bottom: top + element.clientHeight,
      max: element.scrollHeight - element.clientHeight,
      position: element.scrollTop,
    };
  }
  const view = doc.defaultView;
  const height = view?.innerHeight ?? element.clientHeight;
  return {
    element,
    top: 0,
    bottom: height,
    max: Math.max(0, element.scrollHeight - height),
    position: element.scrollTop,
  };
}

/** A drag in progress, from the pick-up to the drop. */
interface DragSession {
  readonly list: HTMLElement;
  /** The rows in order at the begin. */
  readonly rows: ReadonlyArray<HTMLElement>;
  /** Their layout tops at the begin, for the commit's rebase. */
  readonly tops: ReadonlyArray<number>;
  readonly geometry: ReorderGeometry;
  readonly dragged: number;
  /** The dragged row's span, where the insertion line runs. */
  readonly lineSpan: LineSpan;
  position: number;
  /** The offset each row is moving to. */
  readonly offsets: number[];
  /** The list's layout origin in the viewport at the begin. */
  readonly origin: number;
  /** The finger's distance from the dragged row's top. */
  readonly grabOffset: number;
  readonly scroller: Scroller;
  /**
   * How far the list has moved up on screen since the begin. Autoscroll moves
   * it, and so does any scroll of its scroller or of one around it.
   */
  scrolled: number;
  lastY: number;
  /** The edge autoscroll's timer, on UIKit's 20 ms clock. */
  readonly edge: EdgeAutoscroll;
  /** Points per tick of the running autoscroll; 0 when none. */
  step: number;
  /** The dragged row's inline stacking before the drag. */
  readonly restore: RowRestore;
  /** The copy of the dragged row that follows the pointer. */
  readonly preview: HTMLElement;
  /** The preview's offset from its row's place, as last written. */
  previewOffset: number;
  /**
   * A scroll the engine did not cause moved the scroller since its offset
   * was last read (`syncScroll`).
   */
  scrollStale: boolean;
  /** The engine's own scroll still waits for its scroll event. */
  ownScroll: boolean;
  /** The engine wrote since the last frame that renders its writes. */
  wrote: boolean;
  /** A fold waits for a later frame (`foldInFrame`). */
  foldArmed: boolean;
  /** Stops watching the scroller's scroll events. */
  stopScrollWatch: () => void;
}

/** The inline values a drag overrides until its rows rest. */
interface RowRestore {
  /** The dragged row's stacking and background. */
  readonly zIndex: string;
  readonly backgroundColor: string;
  /** The dragged row's opacity, dimmed while the drag runs. */
  readonly opacity: string;
  /**
   * The dragged row's counter increment, off while its preview counts for it
   * (a numbered list's number).
   */
  readonly counterIncrement: string;
  /** The list's position, made a containing block for the overlays. */
  readonly listPosition: string;
  /** The session's rows, whose identity offsets go once they rest. */
  readonly rows: ReadonlyArray<HTMLElement>;
}

/** A drop reported through `onReorder`, waiting for its commit. */
interface PendingDrop {
  readonly list: HTMLElement;
  readonly rows: ReadonlyArray<HTMLElement>;
  readonly tops: ReadonlyArray<number>;
  readonly dragged: number;
  /** Where the preview was at the drop: the dragged row glides from there. */
  readonly droppedTop: number;
  /**
   * The release's y velocity, px/s: the dragged row's glide starts at it.
   */
  readonly velocity: number;
  readonly restore: RowRestore;
}

/** A reorder mode move, reported and waiting for its commit. */
interface PendingMove {
  readonly list: HTMLElement;
  readonly rows: ReadonlyArray<HTMLElement>;
  /** The rows' layout tops before it, for the slide to their new places. */
  readonly tops: ReadonlyArray<number>;
}

/**
 * What a move announces. `landed` plays once the consumer commits it, with
 * the row at `to` in the DOM. `kept` plays if the consumer keeps the order
 * instead. A screen reader never hears a move that did not happen.
 */
interface PendingAnnouncement {
  readonly row: HTMLElement;
  readonly to: number;
  /** Read as the move lands, so it names the rows as they are named then. */
  readonly landed: () => string;
  readonly kept: string;
  readonly politeness: AnnouncePoliteness | undefined;
}

/** The strings the controller announces, from the translator. */
interface ReorderMessages {
  /**
   * A row's place in reorder mode: its name, place and count. Also the names
   * of the rows before and after it, null at the top or the end.
   */
  place: (
    label: string,
    position: number,
    total: number,
    previous: string | null,
    next: string | null,
  ) => string;
  /** A reorder mode move refused by the row that stays where it would go. */
  refused: (label: string) => string;
  /** A row's name when it shows no text: its place. */
  itemAt: (position: number) => string;
  /** Reorder mode ended: the row's name and its place. */
  modeDone: (label: string, position: number, total: number) => string;
  pickedUp: (position: number, total: number) => string;
  dropped: (position: number, total: number) => string;
  cancelled: (position: number, total: number) => string;
}

function messagesFrom(t: TranslatorFn): ReorderMessages {
  return {
    place: (label, position, total, previous, next) =>
      previous == null
        ? t('@astryx.list.reorderPlaceTop', {label, position, total, next})
        : next == null
          ? t('@astryx.list.reorderPlaceEnd', {
              label,
              position,
              total,
              previous,
            })
          : t('@astryx.list.reorderPlace', {
              label,
              position,
              total,
              previous,
              next,
            }),
    refused: label => t('@astryx.list.reorderRefused', {label}),
    itemAt: position => t('@astryx.list.reorderItemAt', {position}),
    modeDone: (label, position, total) =>
      t('@astryx.list.reorderModeDone', {label, position, total}),
    pickedUp: (position, total) =>
      t('@astryx.list.reorderPickedUp', {position, total}),
    dropped: (position, total) =>
      t('@astryx.list.reorderDropped', {position, total}),
    cancelled: (position, total) =>
      t('@astryx.list.reorderCancelled', {position, total}),
  };
}

/** What a gesture listener hands the controller. */
export interface ReorderGestureEvent {
  readonly state: 'began' | 'changed' | 'ended' | 'cancelled';
  /** The finger's (or pointer's) y in the viewport. */
  readonly y: number;
  /**
   * At a release, the finger's (or pointer's) y velocity in px/s, which the
   * dropped row's glide starts at.
   */
  readonly velocity?: number;
}

/** A long press's state as a reorder gesture's; null while it waits. */
function gestureStateOf(
  recognizer: LongPressGestureRecognizer,
): ReorderGestureEvent['state'] | null {
  switch (recognizer.state) {
    case 'began':
    case 'changed':
    case 'ended':
    case 'cancelled':
      return recognizer.state;
    case 'failed':
      return 'cancelled';
    case 'possible':
      return null;
  }
}

/**
 * The reorder session of one List. One instance per List; its listeners are
 * on the list, and every handle in it reports its keys here.
 */
export class ListReorderController implements ListReorderSession {
  readonly Host = ListReorderHost;
  readonly Handle = ListReorderHandle;
  readonly RowName = ListReorderRowName;
  readonly rowStyle = reorderRowStyle;
  readonly listStyle = reorderListStyle;
  options: ListReorderOptions | null = null;
  announce: AnnounceFn = () => {};
  messages: ReorderMessages | null = null;
  /** Whether rows move on springs (`'uikit'`) or jump (`'theme'`). */
  presentation: 'uikit' | 'theme' = 'theme';
  /** Each of this list's handles, with its row's item key. */
  private readonly keys = new Map<Element, Key>();
  /**
   * The names the announcements give rows: each handle's (its row's label
   * text) and each handle-less row's own.
   */
  private readonly names = new Map<Element, string>();
  /**
   * For each handle: the id of Item's label element, when that element names
   * the row. Also whether the handle is named some other way.
   */
  private readonly handleLabels = new Map<
    Element,
    {labelId: string | null; isNamed: boolean}
  >();
  /** Each handle's place and label naming, as the list last showed them. */
  private readonly handleNames = new Map<Element, ListReorderHandleName>();
  private readonly nameListeners = new Set<() => void>();
  /**
   * The list's rows and the label elements, watched through Core's shared
   * mutation observer while the list is up, with each registration's release.
   */
  private namesWatch: {
    list: HTMLElement;
    unwatchRows: () => void;
    labels: Map<Element, () => void>;
  } | null = null;
  private namesQueued = false;
  /** The handles already warned for being named after their place. */
  private readonly warnedNameless = new WeakSet<Element>();
  private namelessCount = 0;
  /** The handle whose row is in reorder mode, if any. */
  private modeHandle: HTMLElement | null = null;
  private readonly modeListeners = new Set<() => void>();
  /** Reorder mode's hint, while it shows: focus in it keeps the mode. */
  private hintElement: HTMLElement | null = null;
  /** The handle whose press became a drag, until its click is read. */
  private draggedHandle: Element | null = null;
  /** A reorder mode move, whose rows slide once it commits (under a finger). */
  private committedMove: PendingMove | null = null;
  private moveFallback: ReturnType<typeof setTimeout> | null = null;
  /**
   * Reorder mode's insertion line: after a key move it marks the edge the
   * row came in through, at its new place, until the mode ends.
   */
  private modeLine: {list: HTMLElement; listPosition: string} | null = null;
  /** The direction of the last key move in reorder mode, for its line. */
  private lastStep: -1 | 1 | null = null;
  /**
   * Until when the handle takes back the focus the UI that started the mode
   * with `start` hands back (a menu that closes restores its trigger's).
   */
  private claimFocusUntil = 0;
  private session: DragSession | null = null;
  private pending: PendingDrop | null = null;
  private fallback: ReturnType<typeof setTimeout> | null = null;
  /** The row whose handle keeps focus across a reorder mode move's commit. */
  private focusRow: HTMLElement | null = null;
  /** A move's announcement, waiting for its commit. */
  private announcement: PendingAnnouncement | null = null;
  private announcementFallback: ReturnType<typeof setTimeout> | null = null;
  /** Ends the mouse press in progress, if any, without reporting it. */
  private endMouse: (() => void) | null = null;
  /** This session's development warnings, each given once. */
  private readonly warn = createDevWarnings();

  constructor(
    private readonly getList: () => HTMLElement | null,
    readonly hintId: string,
  ) {}

  /** The List's latest options, announcer, strings and presentation. */
  configure(options: {
    options: ListReorderOptions;
    announce: AnnounceFn;
    messages: ReorderMessages;
    presentation: 'uikit' | 'theme';
  }): void {
    this.options = options.options;
    this.announce = options.announce;
    this.messages = options.messages;
    this.presentation = options.presentation;
  }

  private get animates(): boolean {
    return this.presentation === 'uikit';
  }

  /**
   * Whether a pointer drags from a handle without a hold: a mouse, or a pen
   * where the primary pointer is fine. A finger, and a pen where the primary
   * pointer is coarse, keep the hold. The touch presentation is the coarse
   * primary pointer.
   */
  private dragsAtOnce(pointerType: string): boolean {
    return (
      pointerType === 'mouse' ||
      (pointerType === 'pen' && this.presentation !== 'uikit')
    );
  }

  /**
   * Records a row's handle and the row's item key (ListItem `itemKey`);
   * returns the removal. A row moves only with a handle recorded here. Its
   * name is recorded apart, so a new name leaves the row in reorder mode.
   */
  registerHandle(handle: Element | null, key: Key): () => void {
    if (handle == null) {
      return () => {};
    }
    this.keys.set(handle, key);
    return () => {
      if (this.keys.get(handle) === key) {
        this.keys.delete(handle);
        if (this.modeHandle === handle) {
          this.setMode(null);
        }
      }
    };
  }

  /** Records the name of a row, or of its handle; returns the removal. */
  registerName(row: Element | null, name: string): () => void {
    if (row == null) {
      return () => {};
    }
    this.names.set(row, name);
    return () => {
      if (this.names.get(row) === name) {
        this.names.delete(row);
      }
    };
  }

  /**
   * Records how `handle` is named besides its place: by Item's label element
   * `labelId`, or otherwise (`isNamed`). Returns the removal.
   */
  registerHandleLabel(
    handle: Element | null,
    labelId: string | null,
    isNamed: boolean,
  ): () => void {
    if (handle == null) {
      return () => {};
    }
    const label = {labelId, isNamed};
    this.handleLabels.set(handle, label);
    this.queueNames();
    return () => {
      if (this.handleLabels.get(handle) === label) {
        this.handleLabels.delete(handle);
        this.queueNames();
      }
    };
  }

  /** `handle`'s place and label naming, as the list last showed them. */
  handleNameOf(handle: Element | null): ListReorderHandleName {
    return (
      (handle == null ? null : this.handleNames.get(handle)) ?? UNREAD_NAME
    );
  }

  /** Calls `listener` when a handle's place or label naming changes. */
  subscribeHandleNames = (listener: () => void): (() => void) => {
    this.nameListeners.add(listener);
    return () => {
      this.nameListeners.delete(listener);
    };
  };

  /**
   * Watches the list's rows and the handles' label elements through Core's
   * shared mutation observer. A row's place, and whether its label names it,
   * come from the DOM. Returns the release.
   */
  attachNames(): () => void {
    const list = this.getList();
    if (list == null) {
      return () => {};
    }
    const watch = {
      list,
      unwatchRows: observeMutations(
        list,
        {childList: true},
        this.onNamesMutation,
      ),
      labels: new Map<Element, () => void>(),
    };
    this.namesWatch = watch;
    this.refreshNames();
    return () => {
      watch.unwatchRows();
      for (const unwatch of watch.labels.values()) {
        unwatch();
      }
      watch.labels.clear();
      if (this.namesWatch === watch) {
        this.namesWatch = null;
      }
    };
  }

  private readonly onNamesMutation = (): void => {
    this.refreshNames();
  };

  /** Reads the names once the current commit is done, for every handle. */
  private queueNames(): void {
    if (this.namesQueued) {
      return;
    }
    this.namesQueued = true;
    queueMicrotask(() => {
      this.namesQueued = false;
      this.refreshNames();
    });
  }

  /**
   * Reads each handle's place and label naming from the DOM. Only a change
   * reaches the handles. A handle named after its place warns, once.
   */
  private refreshNames(): void {
    const list = this.getList();
    if (list == null) {
      return;
    }
    const places = new Map(rowsOf(list).map((row, index) => [row, index + 1]));
    const watch = this.namesWatch;
    // The List renders a new element when its numbering turns on or off (an
    // `ol` or a `ul`). Its remounted handles refresh the names, which moves
    // the watch onto it.
    if (watch != null && watch.list !== list) {
      watch.unwatchRows();
      watch.list = list;
      watch.unwatchRows = observeMutations(
        list,
        {childList: true},
        this.onNamesMutation,
      );
    }
    const watched = new Set<Element>();
    let changed = false;
    for (const handle of this.keys.keys()) {
      const label = this.handleLabels.get(handle);
      const element =
        label?.labelId == null
          ? null
          : list.ownerDocument.getElementById(label.labelId);
      if (element != null && watch != null) {
        watched.add(element);
        if (!watch.labels.has(element)) {
          watch.labels.set(
            element,
            observeMutations(element, LABEL_WATCH, this.onNamesMutation),
          );
        }
      }
      const labelNamesRow = label?.labelId == null ? null : namesRow(element);
      const byPlace =
        label != null &&
        (label.labelId != null ? labelNamesRow === false : !label.isNamed);
      // Only a handle named after its place keeps it, so a reorder leaves
      // the handles named some other way alone.
      const row = byPlace ? this.rowOf(handle) : null;
      const position = row == null ? null : (places.get(row) ?? null);
      const previous = this.handleNames.get(handle);
      if (
        previous?.position !== position ||
        previous?.labelNamesRow !== labelNamesRow
      ) {
        this.handleNames.set(handle, {position, labelNamesRow});
        changed = true;
      }
      if (byPlace && position != null && !this.warnedNameless.has(handle)) {
        // Named after its place only: a person hears "Reorder item 3" with
        // nothing to tell the rows apart.
        this.warnedNameless.add(handle);
        this.namelessCount += 1;
        this.warn(
          'ListItem',
          'A reorderable row has no accessible name, so its reorder handle is ' +
            'named after its place ("Reorder item N"). Give the row a text ' +
            'label or an aria-label.',
          `nameless-row-${this.namelessCount}`,
        );
      }
    }
    for (const handle of this.handleNames.keys()) {
      if (!this.keys.has(handle)) {
        this.handleNames.delete(handle);
        changed = true;
      }
    }
    for (const [element, unwatch] of watch?.labels ?? []) {
      if (!watched.has(element)) {
        unwatch();
        watch?.labels.delete(element);
      }
    }
    if (changed) {
      for (const listener of [...this.nameListeners]) {
        listener();
      }
    }
  }

  /** What the announcements call the row at `index`. */
  private nameOf(row: HTMLElement, index: number): string {
    const handle = this.handleIn(row);
    const name =
      (handle == null ? null : this.names.get(handle)) ??
      this.names.get(row) ??
      '';
    return name !== '' ? name : (this.messages?.itemAt(index + 1) ?? '');
  }

  // --- Reorder mode ----------------------------------------------------

  /** Whether `handle`'s row is in reorder mode: its `aria-pressed`. */
  isInMode(handle: Element | null): boolean {
    return handle != null && this.modeHandle === handle;
  }

  /** Calls `listener` when reorder mode starts, moves or ends. */
  subscribeMode = (listener: () => void): (() => void) => {
    this.modeListeners.add(listener);
    return () => {
      this.modeListeners.delete(listener);
    };
  };

  /** The handle whose row is in reorder mode, if any. */
  get modeTarget(): HTMLElement | null {
    return this.modeHandle;
  }

  private setMode(handle: HTMLElement | null): void {
    if (this.modeHandle === handle) {
      return;
    }
    this.modeHandle = handle;
    this.lastStep = null;
    this.clearModeLine();
    const list = this.getList();
    if (handle != null && list != null) {
      this.placeModeLine(list);
    }
    for (const listener of [...this.modeListeners]) {
      listener();
    }
  }

  /**
   * A handle was activated without a drag (a click, Space or Enter): its row
   * enters reorder mode, or leaves it.
   */
  toggleMode(handle: HTMLElement | null): void {
    if (handle == null || this.session != null) {
      return;
    }
    if (this.modeHandle === handle) {
      this.endMode();
      return;
    }
    if (this.handleOf(handle) === handle) {
      this.setMode(handle);
      // The arrows go to the handle (a click does not focus a button in
      // every browser).
      if (handle.ownerDocument.activeElement !== handle) {
        handle.focus({preventScroll: true});
      }
    }
  }

  /**
   * Ends reorder mode, keeping its moves, and announces where the row is
   * ("Done, Milk at position 3 of 5"). Escape, another activation of the
   * handle, the hint's Done, or a drag ends it so. Focus that a screen
   * reader moved into the hint goes back to the handle. The row leaving ends
   * it without a word.
   */
  endMode(): void {
    const handle = this.modeHandle;
    const list = this.getList();
    const row = this.rowOf(handle);
    const active = handle?.ownerDocument.activeElement;
    if (
      handle != null &&
      active != null &&
      this.hintElement?.contains(active)
    ) {
      handle.focus({preventScroll: true});
    }
    this.setMode(null);
    if (list == null || row == null) {
      return;
    }
    const rows = rowsOf(list);
    const index = rows.indexOf(row);
    this.announce(
      this.messages?.modeDone(
        this.nameOf(row, index),
        index + 1,
        rows.length,
      ) ?? '',
    );
  }

  /** Records reorder mode's hint element (null once it goes). */
  setHintElement(element: HTMLElement | null): void {
    this.hintElement = element;
  }

  /**
   * Reorder mode for the item with `key`, started from the app's own UI. The
   * focus moves to its handle, which scrolls into view, as activating it
   * does. Returns whether an item with that key can move here.
   */
  startByKey(key: Key): boolean {
    if (this.session != null) {
      return true;
    }
    for (const [handle, handleKey] of this.keys) {
      if (
        handleKey === key &&
        handle instanceof HTMLElement &&
        this.handleOf(handle) === handle
      ) {
        this.setMode(handle);
        handle.focus({preventScroll: true});
        this.rowOf(handle)?.scrollIntoView?.({
          block: 'nearest',
          inline: 'nearest',
        });
        this.claimFocusUntil = performance.now() + START_FOCUS_CLAIM_MS;
        return true;
      }
    }
    return false;
  }

  /**
   * Whether `handle`'s latest press dragged its row; reading it clears it.
   * A press that dragged does not toggle reorder mode with its click.
   */
  takeDrag(handle: Element | null): boolean {
    const dragged = handle != null && this.draggedHandle === handle;
    this.draggedHandle = null;
    return dragged;
  }

  /** This list's handle in `row`, if it has one: a nested list's are its own. */
  private handleIn(row: HTMLElement): Element | null {
    for (const handle of reorderHandlesIn(row)) {
      if (this.keys.has(handle)) {
        return handle;
      }
    }
    return null;
  }

  /** The item key `row` reports its moves with; none for a row that stays. */
  private keyOf(row: HTMLElement): Key | undefined {
    const handle = this.handleIn(row);
    return handle == null ? undefined : this.keys.get(handle);
  }

  // --- Listeners ---------------------------------------------------------

  /**
   * The handle `target` is in, if it is one of this list's and takes
   * gestures; a nested reorderable list's handles are that list's.
   */
  private handleOf(target: unknown): HTMLElement | null {
    const list = this.getList();
    if (list == null || !(target instanceof Element)) {
      return null;
    }
    const handle = closestReorderHandle(target);
    return handle != null &&
      this.keys.has(handle) &&
      list.contains(handle) &&
      handle.getAttribute('aria-disabled') !== 'true'
      ? handle
      : null;
  }

  /**
   * Lets a mouse, or a pen where the primary pointer is fine, drag rows by
   * their handles without a hold. There is one pointerdown listener on the
   * list. While a press is down, its move and lift listeners sit there too.
   * The press is the handle's until it lifts, through pointer capture. It
   * drags the row once it has moved MOUSE_DRAG_SLOP from where it pressed.
   * Returns the detach.
   */
  attachMouse(): () => void {
    const list = this.getList();
    if (list == null) {
      return () => {};
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!this.dragsAtOnce(event.pointerType) || event.button !== 0) {
        return;
      }
      const handle = this.handleOf(event.target);
      if (handle == null) {
        return;
      }
      this.endMouse?.();
      this.draggedHandle = null;
      const {pointerId, clientX: x, clientY: y} = event;
      let isDragging = false;
      // The pointer's velocity, for the glide a release hands it to.
      const velocity = new VelocityTracker();
      velocity.add(x, y, event.timeStamp);
      const end = () => {
        list.removeEventListener('pointermove', onMove);
        list.removeEventListener('pointerup', onUp);
        list.removeEventListener('pointercancel', onCancel);
        list.removeEventListener('lostpointercapture', onCancel);
        if (handle.hasPointerCapture?.(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
        if (this.endMouse === end) {
          this.endMouse = null;
        }
      };
      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) {
          return;
        }
        velocity.add(move.clientX, move.clientY, move.timeStamp);
        if (!isDragging) {
          if (
            Math.hypot(move.clientX - x, move.clientY - y) < MOUSE_DRAG_SLOP
          ) {
            return;
          }
          isDragging = true;
          this.draggedHandle = handle;
          this.gesture(this.rowOf(handle), {state: 'began', y});
        }
        this.gesture(null, {state: 'changed', y: move.clientY});
      };
      const onUp = (up: PointerEvent) => {
        if (up.pointerId !== pointerId) {
          return;
        }
        end();
        if (isDragging) {
          velocity.add(up.clientX, up.clientY, up.timeStamp);
          this.gesture(null, {
            state: 'ended',
            y: up.clientY,
            velocity: velocity.velocity(up.timeStamp).y,
          });
        }
      };
      const onCancel = (cancel: PointerEvent) => {
        if (cancel.pointerId !== pointerId) {
          return;
        }
        end();
        if (isDragging) {
          this.gesture(null, {state: 'cancelled', y: cancel.clientY});
        }
      };
      list.addEventListener('pointermove', onMove);
      list.addEventListener('pointerup', onUp);
      list.addEventListener('pointercancel', onCancel);
      list.addEventListener('lostpointercapture', onCancel);
      handle.setPointerCapture?.(pointerId);
      this.endMouse = end;
    };
    list.addEventListener('pointerdown', onPointerDown);
    return () => {
      this.endMouse?.();
      list.removeEventListener('pointerdown', onPointerDown);
    };
  }

  /**
   * Lets a finger held still on a handle pick up its row, under every primary
   * pointer, and a pen where the primary pointer is coarse. One recognizer on
   * the list receives only the touches that begin on its handles. Returns the
   * detach.
   */
  attachTouch(isCoarsePointer: boolean): () => void {
    const list = this.getList();
    if (list == null) {
      return () => {};
    }
    let held: HTMLElement | null = null;
    // The finger's velocity, for the glide a release hands it to.
    const velocity = new VelocityTracker();
    return attachTouchHold(
      list,
      isCoarsePointer ? ['touch', 'pen'] : ['touch'],
      target => {
        const handle = this.handleOf(target);
        if (handle != null) {
          held = handle;
        }
        return handle != null;
      },
      recognizer => {
        const state = gestureStateOf(recognizer);
        if (state === 'began') {
          this.draggedHandle = held;
          velocity.reset();
        }
        // One sample per event, at the event's time.
        const touch = recognizer.trackedTouches[0];
        if (touch != null && state != null && state !== 'cancelled') {
          velocity.add(touch.x, touch.y, touch.time);
        }
        if (state != null) {
          this.gesture(state === 'began' ? this.rowOf(held) : null, {
            state,
            y: recognizer.location().y,
            velocity:
              state === 'ended' && touch != null
                ? velocity.velocity(touch.time).y
                : undefined,
          });
        }
      },
      target => this.handleOf(target) != null,
    );
  }

  // --- Pointer drags ---------------------------------------------------

  /** A gesture from a handle: begin, track, drop or cancel the drag. */
  gesture(row: HTMLElement | null, event: ReorderGestureEvent): void {
    switch (event.state) {
      case 'began':
        if (row != null) {
          this.begin(row, event.y);
        }
        break;
      case 'changed':
        this.track(event.y);
        break;
      case 'ended':
        this.drop(event.velocity ?? 0);
        break;
      case 'cancelled':
        this.cancel();
        break;
    }
  }

  /**
   * `handle` stopped taking gestures: its row is disabled or no longer
   * reorderable, or the handle is gone. A drag it started goes home, and its
   * reorder mode ends. The session owns that end, since a recognizer turned
   * off mid-gesture reports nothing.
   */
  release(handle: Element | null): void {
    if (handle == null) {
      return;
    }
    if (this.session != null && this.draggedHandle === handle) {
      this.endMouse?.();
      this.cancel();
    }
    if (this.modeHandle === handle) {
      this.setMode(null);
    }
  }

  /** Picks up `row` under a pointer at `y`. Returns whether it did. */
  private begin(row: HTMLElement, y: number): boolean {
    const list = this.getList();
    if (list == null || this.session != null) {
      return false;
    }
    // A drag ends reorder mode, keeping its moves, and says so.
    if (this.modeHandle != null) {
      this.endMode();
    }
    // A drop still waiting for its commit is settled where it is.
    this.flushPending();
    const rows = rowsOf(list);
    const dragged = rows.indexOf(row);
    const movable = rows.map(element => this.handleIn(element) != null);
    if (dragged < 0 || !movable[dragged]) {
      return false;
    }
    const at = motionNow();
    const tops = rows.map(element => layoutTop(element, list));
    const heights = rows.map(element => element.offsetHeight);
    const lineSpan = lineSpanOf(row, list);
    const previewSpan = previewSpanOf(row, list);
    const isStatic = getComputedStyle(list).position === 'static';
    const bounds = boundsOf(movable);
    const geometry: ReorderGeometry = {
      rows: rows.map((element, index) => ({
        top: tops[index],
        height: heights[index],
        isFixed: bounds[index],
      })),
      gap: rows.length > 1 ? Math.max(0, tops[1] - tops[0] - heights[0]) : 0,
    };
    // The list's layout origin in the viewport, from the dragged row's box
    // without the offset it may still be moving by.
    const shown = shownY(row, at);
    const origin = row.getBoundingClientRect().top - shown - tops[dragged];
    const scroller = scrollerOf(list);
    // Every row gets an identity offset for the session. Otherwise a row's
    // first offset changes how it paints in the middle of the drag, with a
    // layout and a paint. With one in place, neither a move nor a slide lays
    // out or paints. `will-change` would make each slide's start repaint its
    // row. The dragged row goes above its neighbours.
    const restore: RowRestore = {
      zIndex: row.style.zIndex,
      backgroundColor: row.style.backgroundColor,
      opacity: row.style.opacity,
      counterIncrement: row.style.counterIncrement,
      listPosition: list.style.position,
      rows,
    };
    // The rows stay where they are until the drop. The dragged row is dimmed
    // in its place, and a preview of it follows the pointer. An insertion line
    // marks where it would land. The preview has a background, as the row
    // does. A row without its own takes the surface's behind the list.
    const background = isTransparent(getComputedStyle(row).backgroundColor)
      ? paintedBackground(list)
      : null;
    // The copy reads the row's styles, so it is made before the first write.
    const copy = previewCopyOf(row);
    for (const element of rows) {
      if (element.style.translate === '') {
        element.style.translate = '0px 0px';
      }
    }
    if (isStatic) {
      list.style.position = 'relative';
    }
    const preview = previewOf(copy, tops[dragged], previewSpan, background);
    // Right before its source, the preview counts for it. So in a numbered
    // list it reads the source's number. Every other row keeps its place
    // among its siblings, and the last row keeps :last-child.
    row.before(preview);
    row.style.counterIncrement = 'none';
    markReorderSource(row);
    row.style.opacity = MOVING_OPACITY;
    markReordering(list);
    const session: DragSession = {
      list,
      rows,
      tops,
      geometry,
      dragged,
      lineSpan,
      position: dragged,
      offsets: rows.map((element, index) =>
        index === dragged ? 0 : shownY(element, at),
      ),
      origin,
      grabOffset: y - (origin + tops[dragged] + shown),
      scroller,
      scrolled: 0,
      lastY: y,
      edge: edgeAutoscroll({
        intervalMs: reorder.autoscroll.tickMs,
        // UIKit's run-loop timer: a late fire catches up one tick, and a
        // longer stall is skipped. Engines fire a 20 ms interval every 20 to
        // 25 ms.
        catchUp: true,
        now: motionNow,
        step: () => this.edgeStep(session),
        apply: delta => this.scrollBy(session, delta),
      }),
      step: 0,
      restore,
      preview,
      previewOffset: 0,
      scrollStale: false,
      ownScroll: false,
      wrote: true,
      foldArmed: false,
      stopScrollWatch: () => {},
    };
    this.session = session;
    session.stopScrollWatch = this.watchScroll(session);
    // Rows still sliding from an earlier drag go to their places.
    this.moveTo(dragged);
    this.track(y);
    this.announce(
      this.messages?.pickedUp(dragged + 1, rows.length) ?? '',
      'polite',
    );
    return true;
  }

  /** The dragged row's top in the viewport for the finger at `y`. */
  private draggedTop(session: DragSession, y: number): number {
    const {geometry, dragged, scroller} = session;
    const row = geometry.rows[dragged];
    const first = geometry.rows[0];
    const last = geometry.rows[geometry.rows.length - 1];
    const origin = session.origin - session.scrolled;
    return clampTop(y - session.grabOffset, row.height, {
      scrollTop: scroller.top,
      scrollBottom: scroller.bottom,
      listTop: origin + first.top,
      listBottom: origin + last.top + last.height,
    });
  }

  private track(y: number): void {
    const session = this.session;
    if (session == null) {
      return;
    }
    if (session.scrollStale) {
      this.syncScroll(session);
    }
    session.lastY = y;
    session.wrote = true;
    const {geometry, dragged} = session;
    const row = geometry.rows[dragged];
    const origin = session.origin - session.scrolled;
    const top = this.draggedTop(session, y);
    const offset = top - (origin + row.top);
    // The preview starts at its row's place, with no offset. Only a new
    // offset goes to its animator: writing none would read its style back.
    if (offset !== session.previewOffset) {
      session.previewOffset = offset;
      animatorFor(session.preview).set({y: offset});
    }
    const position = dropPosition(
      geometry,
      dragged,
      top + row.height / 2 - origin,
    );
    if (position !== session.position) {
      this.moveTo(position);
    }
    this.autoscroll(top, row.height);
  }

  /** Puts the insertion line where the dragged row would land at `position`. */
  private moveTo(position: number): void {
    const session = this.session;
    if (session == null) {
      return;
    }
    session.position = position;
    const center = lineCenter(session.geometry, session.dragged, position);
    if (center == null) {
      hideLine(session.list);
    } else {
      showLine(session.list, session.lineSpan, center);
    }
    // A pointer drag announces its pick-up and its drop, not each place it
    // passes: announcing each crossed position is noisy.
  }

  /**
   * Points per tick for the dragged row at `top`: positive down, negative
   * up. It is 0 when neither edge is near or the content cannot move that
   * way.
   */
  private stepFor(session: DragSession, top: number, height: number): number {
    const {scroller} = session;
    let step = 0;
    if (scroller.position < scroller.max) {
      step = autoscrollStep(top + height - scroller.bottom);
    }
    if (step === 0 && scroller.position > 0) {
      step = -autoscrollStep(scroller.top - top);
    }
    return step;
  }

  /** Starts or stops the edge autoscroll for the row at `top`. */
  private autoscroll(top: number, height: number): void {
    const session = this.session;
    if (session == null) {
      return;
    }
    session.step = Math.abs(this.stepFor(session, top, height));
    session.edge.update();
  }

  /** The autoscroll's next step for the finger where it last was. */
  private edgeStep(session: DragSession): number {
    if (this.session !== session) {
      return 0;
    }
    if (session.scrollStale) {
      this.syncScroll(session);
    }
    const {geometry, dragged} = session;
    const top = this.draggedTop(session, session.lastY);
    return this.stepFor(session, top, geometry.rows[dragged].height);
  }

  /**
   * One autoscroll step: the content moves by `delta` (inside its range) and
   * the row stays under the finger. Returns how far the content moved.
   */
  private scrollBy(session: DragSession, delta: number): number {
    if (this.session !== session) {
      return 0;
    }
    const {scroller} = session;
    const next = Math.min(scroller.max, Math.max(0, scroller.position + delta));
    const moved = next - scroller.position;
    if (moved === 0) {
      return 0;
    }
    scroller.element.scrollTop = next;
    session.scrolled += moved;
    scroller.position = next;
    // Its scroll event comes in the next frame, before that frame's
    // callbacks. A write that moves nothing sends none.
    session.ownScroll = true;
    requestAnimationFrame(() => {
      session.ownScroll = false;
    });
    this.track(session.lastY);
    return moved;
  }

  /**
   * Watches the scroller for a scroll the engine did not cause, such as a
   * wheel or a key. A later frame folds it in (`armFold`).
   */
  private watchScroll(session: DragSession): () => void {
    const doc = session.list.ownerDocument;
    const view = doc.defaultView;
    if (view == null) {
      return () => {};
    }
    const {element} = session.scroller;
    const page = doc.scrollingElement ?? doc.documentElement;
    // The page's own scroll is reported on the document.
    const own = element === page ? doc : element;
    // A scroll around the list's scroller can move it on screen too, as when
    // a wheel at the end of a box scrolls the page.
    const isAround = (target: EventTarget) =>
      own !== doc &&
      (target === doc ||
        (target instanceof Element &&
          target !== element &&
          target.contains(element)));
    return subscribeInput(view, 'scroll', event => {
      const {target} = event;
      if (
        target == null ||
        this.session !== session ||
        (target !== own && !isAround(target))
      ) {
        return;
      }
      if (target === own && session.ownScroll) {
        session.ownScroll = false;
        return;
      }
      session.scrollStale = true;
      this.armFold(session);
    });
  }

  /**
   * Folds a scroll into the drag in the next frame without a move or a tick.
   * The writes made so far render first, so its one read forces no layout.
   */
  private armFold(session: DragSession): void {
    if (session.foldArmed) {
      return;
    }
    session.foldArmed = true;
    requestAnimationFrame(() => {
      // Everything written so far renders after this frame's callbacks.
      session.wrote = false;
      requestAnimationFrame(() => this.foldInFrame(session));
    });
  }

  private foldInFrame(session: DragSession): void {
    session.foldArmed = false;
    if (this.session !== session || !session.scrollStale) {
      return;
    }
    if (session.wrote) {
      // The engine wrote in this frame, so the read waits another frame.
      session.wrote = false;
      session.foldArmed = true;
      requestAnimationFrame(() => this.foldInFrame(session));
      return;
    }
    this.track(session.lastY);
  }

  /**
   * Reads the scroller's offset once and adds what a scroll the engine did
   * not cause moved to the drag. It runs before any write in its frame or
   * task.
   */
  private syncScroll(session: DragSession): void {
    session.scrollStale = false;
    const {scroller} = session;
    const {element} = scroller;
    const position = element.scrollTop;
    session.scrolled += position - scroller.position;
    scroller.position = position;
    const doc = element.ownerDocument;
    if (element === (doc.scrollingElement ?? doc.documentElement)) {
      return;
    }
    // An outer scroll moves the scroller on screen by the change in its
    // measured top. A fixed or stuck scroller does not move. The list moves
    // with its scroller.
    const top = element.getBoundingClientRect().top + element.clientTop;
    const moved = scroller.top - top;
    session.scrolled += moved;
    scroller.top = top;
    scroller.bottom -= moved;
  }

  private stopAutoscroll(session: DragSession): void {
    session.edge.stop();
    session.step = 0;
  }

  /**
   * The drop: the move is reported, and on its commit the row glides into
   * its place, starting at the release's y `velocity` in px/s.
   */
  private drop(velocity: number): void {
    const session = this.session;
    if (session == null) {
      return;
    }
    if (session.scrollStale) {
      this.track(session.lastY);
    }
    this.session = null;
    this.stopAutoscroll(session);
    session.stopScrollWatch();
    const {geometry, dragged, position, rows, list} = session;
    const element = rows[dragged];
    // Where the preview is now: on the commit the dragged row glides from
    // there into its new place, and the rows it passed to theirs.
    const droppedTop =
      geometry.rows[dragged].top + shownY(session.preview, motionNow());
    this.clearOverlays(session);
    const dropped = this.messages?.dropped(position + 1, rows.length) ?? '';
    const key = this.keyOf(element);
    const options = this.options;
    if (position === dragged || options == null || key == null) {
      if (position === dragged) {
        this.announce(dropped, 'polite');
        clearReordering(list);
        this.restWhenDone(element, session.restore);
      } else {
        this.springBack(list, rows, dragged, session.restore);
      }
      return;
    }
    this.announceWhenCommitted({
      row: element,
      to: position,
      landed: () => dropped,
      kept: this.messages?.cancelled(dragged + 1, rows.length) ?? '',
      politeness: 'polite',
    });
    this.pending = {
      list,
      rows,
      tops: session.tops,
      dragged,
      droppedTop,
      velocity,
      restore: session.restore,
    };
    options.onReorder({key, to: position});
    // A consumer that does not apply the move by the end of the task gets
    // its rows back where they were.
    this.fallback = setTimeout(() => {
      this.fallback = null;
      this.refuse();
    }, 0);
  }

  /**
   * The drag ends where it started: the browser took the touch (a pinch, a
   * scroll), or the handle left. Every row goes home and nothing is
   * reported.
   */
  cancel(): void {
    const session = this.session;
    if (session == null) {
      return;
    }
    this.session = null;
    this.stopAutoscroll(session);
    session.stopScrollWatch();
    // Nothing moved: the preview and the line go and the row is itself again
    // at once.
    this.clearOverlays(session);
    this.springBack(
      session.list,
      session.rows,
      session.dragged,
      session.restore,
    );
    this.announce(
      this.messages?.cancelled(session.dragged + 1, session.rows.length) ?? '',
    );
  }

  /** Takes the preview and the line away and undims the dragged row. */
  private clearOverlays(session: DragSession): void {
    session.preview.remove();
    hideLine(session.list);
    const row = session.rows[session.dragged];
    clearReorderSource(row);
    row.style.opacity = session.restore.opacity;
    row.style.counterIncrement = session.restore.counterIncrement;
    session.list.style.position = session.restore.listPosition;
  }

  private springBack(
    list: HTMLElement,
    rows: ReadonlyArray<HTMLElement>,
    dragged: number,
    restore: RowRestore,
  ): void {
    const at = motionNow();
    const away = rows.filter(
      element =>
        Math.abs(shownY(element, at)) >= MIN_MOVE_PX || isMoving(element),
    );
    // The spring is read once, before the first write.
    const spring =
      this.animates && away.length > 0 ? touchMotion.glideBase(list) : null;
    for (const element of away) {
      if (spring == null) {
        animatorFor(element).set({y: 0});
        releaseMotion(element, 'translate');
        continue;
      }
      // A row still in a drop's or a key move's glide goes on home. It plays
      // the shared settle role from where it is shown, at the speed it has.
      touchMotion.home(element, spring, at, false);
    }
    clearReordering(list);
    this.restWhenDone(rows[dragged], restore);
  }

  /** `onReorder` applied no new order: the rows return to their places. */
  private refuse(): void {
    const pending = this.pending;
    if (pending == null) {
      return;
    }
    const current = rowsOf(pending.list);
    if (!sameOrder(current, pending.rows)) {
      // The commit came but its layout effect has not run yet.
      return;
    }
    this.pending = null;
    this.springBack(
      pending.list,
      pending.rows,
      pending.dragged,
      pending.restore,
    );
  }

  /** Clears the dragged row's stacking once its motion has come to rest. */
  private restWhenDone(element: HTMLElement, restore: RowRestore): void {
    const settle = () => {
      if (this.session?.rows[this.session.dragged] === element) {
        return;
      }
      const running = motionOf(element, 'y');
      if (running != null) {
        // The drop's spring, or the rebase that continues it.
        void running.handle.finished.then(settle);
        return;
      }
      element.style.zIndex = restore.zIndex;
      element.style.backgroundColor = restore.backgroundColor;
      // Identity offsets go; a row still moving keeps its own.
      for (const row of restore.rows) {
        releaseMotion(row, 'translate');
      }
    };
    settle();
  }

  private flushPending(): void {
    if (this.pending == null) {
      return;
    }
    if (this.fallback != null) {
      clearTimeout(this.fallback);
      this.fallback = null;
    }
    this.refuse();
    this.pending = null;
  }

  // --- Commits ---------------------------------------------------------

  ownsCommit(): boolean {
    const list = this.getList();
    return list != null && isReordering(list);
  }

  commit(): void {
    const list = this.getList();
    if (list == null) {
      return;
    }
    if (
      this.keys.size === 0 &&
      this.options != null &&
      this.options.isReorderable == null &&
      list.children.length > 0
    ) {
      this.warn(
        'List',
        '`reorderable` is set, but no ListItem has an `itemKey`: give each ' +
          'row the key its moves report.',
      );
    }
    const session = this.session;
    if (session != null && !sameOrder(rowsOf(list), session.rows)) {
      // The rows changed under the drag.
      this.cancel();
    }
    const pending = this.pending;
    if (pending != null && !sameOrder(rowsOf(list), pending.rows)) {
      this.pending = null;
      if (this.fallback != null) {
        clearTimeout(this.fallback);
        this.fallback = null;
      }
      this.rebase(pending);
    }
    const announcement = this.announcement;
    if (
      announcement != null &&
      rowsOf(list).indexOf(announcement.row) === announcement.to
    ) {
      this.announcement = null;
      if (this.announcementFallback != null) {
        clearTimeout(this.announcementFallback);
        this.announcementFallback = null;
      }
      this.announce(announcement.landed(), announcement.politeness);
    }
    const move = this.committedMove;
    let slide: (() => void) | null = null;
    if (move != null && !sameOrder(rowsOf(list), move.rows)) {
      this.committedMove = null;
      if (this.moveFallback != null) {
        clearTimeout(this.moveFallback);
        this.moveFallback = null;
      }
      slide = this.slideCommitted(move);
    }
    // A reorder mode move has landed (or nothing waits): its handle keeps
    // the focus, and the insertion line marks the row's new place. Their
    // reads come before the slide's first write, so a move lays out once.
    if (this.announcement == null) {
      const placeLine = this.measureModeLine(list);
      this.restoreFocus();
      slide?.();
      placeLine();
    } else {
      slide?.();
    }
  }

  /**
   * A reorder mode move landed: each row slides from its old place to its new
   * one. Measures the slides, and returns the writes that start them.
   */
  private slideCommitted(move: PendingMove): () => void {
    const {list} = move;
    const at = motionNow();
    const shifts = move.rows.map((element, index) =>
      element.parentElement === list
        ? move.tops[index] - layoutTop(element, list)
        : 0,
    );
    const spring = shifts.some(shift => Math.abs(shift) >= MIN_MOVE_PX)
      ? touchMotion.glideBase(list)
      : null;
    return () => {
      for (const [index, element] of move.rows.entries()) {
        const shift = shifts[index];
        if (spring == null || Math.abs(shift) < MIN_MOVE_PX) {
          continue;
        }
        // A row still sliding from the previous move goes on from where it
        // is shown, as a drop's rows do.
        touchMotion.follow(element, shift, spring, at);
      }
      clearReordering(list);
    };
  }

  private rebase(pending: PendingDrop): void {
    const {list} = pending;
    const at = motionNow();
    // Every read comes before the first write, so the drop lays out once.
    const rows = pending.rows.map((element, index) => {
      if (element.parentElement !== list) {
        return null;
      }
      // The dragged row glides from where its preview was dropped, the rows
      // it passed from their old places.
      const from =
        index === pending.dragged ? pending.droppedTop : pending.tops[index];
      return {
        element,
        index,
        shift: from - layoutTop(element, list),
        value: shownY(element, at),
        moving: isMoving(element),
      };
    });
    // A row at rest where the drop leaves it settles there. A row the layout
    // moved glides from its old place.
    const settles = (row: {shift: number; value: number; moving: boolean}) =>
      Math.abs(row.value + row.shift) < MIN_MOVE_PX && !row.moving;
    const glides = (row: {shift: number; value: number; moving: boolean}) =>
      !settles(row) && Math.abs(row.shift) >= MIN_MOVE_PX;
    const spring =
      this.animates && rows.some(row => row != null && glides(row))
        ? touchMotion.glideBase(list)
        : null;
    for (const row of rows) {
      if (row == null) {
        continue;
      }
      const {element, index, shift, value, moving} = row;
      if (settles(row)) {
        settleAtRest(element, value, moving);
        continue;
      }
      if (!glides(row)) {
        continue;
      }
      if (spring != null && index === pending.dragged) {
        // The dragged row glides from where its preview was dropped into its
        // new layout place, starting at the release's velocity.
        touchMotion.glide(element, shift, spring, at, pending.velocity);
      } else if (spring != null) {
        // Every other row's place after the drop is its new layout place. So
        // its running glide goes on to 0 from the shifted value. Otherwise the
        // glide starts from rest.
        touchMotion.follow(element, shift, spring, at);
      } else {
        settleAtRest(element, value, moving);
      }
    }
    clearReordering(list);
    this.restWhenDone(pending.rows[pending.dragged], pending.restore);
  }

  /**
   * Reorder mode's insertion line, shared with the pointer drag's. It marks
   * the row's place for the whole mode. It sits at the edge the row came in
   * through on its last key move. That is the gap above it after a move up,
   * and below it after a move down. Before a move, it sits in the gap above
   * the row.
   */
  private placeModeLine(list: HTMLElement): void {
    this.measureModeLine(list)();
  }

  /**
   * Reads where reorder mode's insertion line goes, and returns the writes
   * that place it there.
   */
  private measureModeLine(list: HTMLElement): () => void {
    const row = this.rowOf(this.modeHandle);
    if (row == null) {
      return () => this.clearModeLine();
    }
    const step = this.lastStep ?? -1;
    const rows = rowsOf(list);
    const index = rows.indexOf(row);
    const top = layoutTop(row, list);
    const bottom = top + row.offsetHeight;
    const neighbour = rows[index + step];
    const gap =
      neighbour == null
        ? 0
        : step < 0
          ? Math.max(
              0,
              top - (layoutTop(neighbour, list) + neighbour.offsetHeight),
            )
          : Math.max(0, layoutTop(neighbour, list) - bottom);
    const center = step < 0 ? top - gap / 2 : bottom + gap / 2;
    const span = lineSpanOf(row, list);
    const isNewList = this.modeLine?.list !== list;
    const isStatic = isNewList && getComputedStyle(list).position === 'static';
    return () => {
      if (isNewList) {
        this.clearModeLine();
        const listPosition = list.style.position;
        if (isStatic) {
          list.style.position = 'relative';
        }
        this.modeLine = {list, listPosition};
      }
      showLine(list, span, center);
    };
  }

  private clearModeLine(): void {
    const modeLine = this.modeLine;
    if (modeLine == null) {
      return;
    }
    this.modeLine = null;
    hideLine(modeLine.list);
    modeLine.list.style.position = modeLine.listPosition;
  }

  /**
   * The row that holds `element` (a handle): the list's child that contains
   * it, whatever its tag. Null outside the list.
   */
  rowOf(element: Element | null): HTMLElement | null {
    const list = this.getList();
    let node = element;
    while (node != null && node.parentElement !== list) {
      node = node.parentElement;
    }
    return list != null && node instanceof HTMLElement ? node : null;
  }

  // --- Keys ------------------------------------------------------------

  /**
   * A handle's key in reorder mode: the arrows move its
   * row a place at once, and Escape ends the mode, keeping the moves. Space
   * and Enter toggle the mode through the handle's click.
   */
  keyDown(handle: HTMLElement | null, event: KeyboardEvent): void {
    // A modified key is a browser or assistive-technology shortcut.
    if (
      handle == null ||
      handle !== this.modeHandle ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.endMode();
        return;
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault();
        this.step(handle, event.key === 'ArrowUp' ? -1 : 1);
        return;
      default:
        return;
    }
  }

  /**
   * Reorder mode's move. The row whose handle is in the mode goes a place up
   * (`-1`) or down (`1`) at once, with one report. It is announced with its
   * place and neighbours once it lands. Under a finger's presentation, the
   * rows then slide to their new places, as a UIKit table moves a row. A move
   * into a row that stays at either end is refused and announced. One past
   * the list's end does nothing.
   */
  step(handle: HTMLElement | null, delta: -1 | 1): void {
    const list = this.getList();
    const options = this.options;
    const row = this.rowOf(handle);
    const key = row == null ? undefined : this.keyOf(row);
    if (
      list == null ||
      options == null ||
      row == null ||
      key == null ||
      handle !== this.modeHandle ||
      this.session != null
    ) {
      return;
    }
    const rows = rowsOf(list);
    const index = rows.indexOf(row);
    const to = index + delta;
    if (to < 0 || to >= rows.length) {
      return;
    }
    if (boundsOf(rows.map(element => this.handleIn(element) != null))[to]) {
      this.announce(this.messages?.refused(this.nameOf(rows[to], to)) ?? '');
      return;
    }
    this.focusRow = row;
    this.lastStep = delta;
    this.announceWhenCommitted({
      row,
      to,
      landed: () => this.placeIn(rowsOf(list), to),
      kept: this.placeIn(rows, index),
      politeness: undefined,
    });
    if (this.animates) {
      this.committedMove = {
        list,
        rows,
        tops: rows.map(element => layoutTop(element, list)),
      };
      // The List's layout updates leave this commit to the reorder.
      markReordering(list);
      if (this.moveFallback != null) {
        clearTimeout(this.moveFallback);
      }
      // The caller kept the order: nothing slides.
      this.moveFallback = setTimeout(() => {
        this.moveFallback = null;
        if (this.committedMove != null) {
          this.committedMove = null;
          if (this.session == null && this.pending == null) {
            clearReordering(list);
          }
        }
      }, 0);
    }
    options.onReorder({key, to});
  }

  /** What reorder mode announces for the row at `at` in `order`. */
  private placeIn(order: ReadonlyArray<HTMLElement>, at: number): string {
    const name = (index: number) => this.nameOf(order[index], index);
    return (
      this.messages?.place(
        name(at),
        at + 1,
        order.length,
        at > 0 ? name(at - 1) : null,
        at < order.length - 1 ? name(at + 1) : null,
      ) ?? ''
    );
  }

  /**
   * Announces a move once it commits; if the consumer keeps the order by the
   * end of the task, announces that the row stayed instead.
   */
  private announceWhenCommitted(announcement: PendingAnnouncement): void {
    this.announcement = announcement;
    if (this.announcementFallback != null) {
      clearTimeout(this.announcementFallback);
    }
    this.announcementFallback = setTimeout(() => {
      this.announcementFallback = null;
      const pending = this.announcement;
      if (pending != null) {
        this.announcement = null;
        this.announce(pending.kept, pending.politeness);
      }
      this.restoreFocus();
    }, 0);
  }

  /**
   * A handle lost focus to `next`. Its row stays in reorder mode. When the UI
   * that started the mode hands its focus back at once, the handle takes it
   * again.
   */
  blur(handle: HTMLElement | null, next: EventTarget | null): void {
    // Focus a screen reader moves into the mode's hint keeps the mode.
    if (next instanceof Node && this.hintElement?.contains(next)) {
      return;
    }
    // The UI that started the mode handing its focus back (a closing menu
    // restoring its trigger's) at once: the handle takes it again.
    if (
      handle != null &&
      handle === this.modeHandle &&
      performance.now() < this.claimFocusUntil
    ) {
      setTimeout(() => {
        if (this.modeHandle === handle) {
          handle.focus({preventScroll: true});
        }
      }, 0);
      return;
    }
    // Focus leaving the handle does not end reorder mode: its exits are
    // Escape, Done, the handle again and its row going. Back on the handle,
    // its arrows move the row again.
  }

  /**
   * After a reorder mode move: the handle has the focus again (the commit
   * may have moved its element) and its row scrolls into view.
   */
  private restoreFocus(): void {
    const row = this.focusRow;
    if (row == null) {
      return;
    }
    this.focusRow = null;
    const handle = this.handleIn(row);
    const active = row.ownerDocument.activeElement;
    // The scroll reads layout, so it comes before the focus changes styles.
    if (handle === this.modeHandle) {
      row.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
    }
    // Focus that went elsewhere meanwhile stays there; focus in the hint
    // (a screen reader's) goes back to the handle.
    if (
      handle instanceof HTMLElement &&
      handle === this.modeHandle &&
      (active == null ||
        active === row.ownerDocument.body ||
        this.hintElement?.contains(active) === true)
    ) {
      handle.focus({preventScroll: true});
    }
  }

  dispose(): void {
    this.endMouse?.();
    this.setMode(null);
    // A drag in progress goes home.
    this.cancel();
    if (this.moveFallback != null) {
      clearTimeout(this.moveFallback);
      this.moveFallback = null;
    }
    this.committedMove = null;
    if (this.fallback != null) {
      clearTimeout(this.fallback);
      this.fallback = null;
    }
    this.pending = null;
    if (this.announcementFallback != null) {
      clearTimeout(this.announcementFallback);
      this.announcementFallback = null;
    }
    this.announcement = null;
  }
}

function sameOrder(
  a: ReadonlyArray<HTMLElement>,
  b: ReadonlyArray<HTMLElement>,
): boolean {
  return (
    a.length === b.length && a.every((element, index) => element === b[index])
  );
}

/**
 * Renders beside a reorderable List's rows. It keeps its session's options,
 * strings and presentation current, and attaches the list's listeners. The
 * touch hold attaches under every primary pointer. It also renders the
 * handles' instructions.
 */
function ListReorderHost({reorder}: {reorder: ListReorderContextValue}) {
  const {options} = reorder;
  const controller = reorder.session as ListReorderController;
  const announce = useAnnounce();
  const t = useComponentTranslator();
  // UIKit's motion under a finger (one touch model on every touch device);
  // with a mouse, rows take their places at once.
  const isTouch = useTouchPresentation().isTouch;
  // Syncs the reorder session, which lives outside React, with this render's
  // options, strings and presentation.
  useIsomorphicLayoutEffect(() => {
    controller.configure({
      options,
      announce,
      messages: messagesFrom(t),
      presentation: isTouch ? 'uikit' : 'theme',
    });
  });
  // The list's own pointer listeners, on its DOM element.
  useIsomorphicLayoutEffect(() => controller.attachMouse(), [controller]);
  // Syncs the handles' names with the list's rows and their label elements
  // in the DOM, through the session's observer.
  useIsomorphicLayoutEffect(() => controller.attachNames(), [controller]);
  // The owner's options, for an object a Lab collection adapted from the
  // owner's.
  const startedBy = options.startedBy ?? options;
  // Registers this list in the sessions the object's `start` searches, a
  // registry outside React.
  useIsomorphicLayoutEffect(
    () => mountSession(startedBy, controller),
    [startedBy, controller],
  );
  // The List stopped reordering, or unmounted: a drag goes home.
  useIsomorphicLayoutEffect(() => () => controller.dispose(), [controller]);
  // The gesture host's hold recognizer on the list. It takes a finger under
  // every primary pointer, and a pen where the primary pointer is coarse.
  useIsomorphicLayoutEffect(
    () => controller.attachTouch(isTouch),
    [controller, isTouch],
  );
  return (
    <>
      <span id={controller.hintId} hidden>
        {t('@astryx.list.reorderHint')}
      </span>
      <ListReorderModeHint controller={controller} />
    </>
  );
}

const hintStyles = stylex.create({
  // A glyph or Done: the hint's text, with nothing of a button's own, the
  // same size under every pointer. A finger's 44 px target is the shared
  // touch hit layer, which stops short of a neighbouring target.
  button: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  done: {
    paddingInline: spacingVars['--spacing-1'],
  },
});

/**
 * One of the hint's buttons: it never takes the focus from the handle (a
 * press does not move it), and does what its key does.
 */
function HintButton({
  label,
  onPress,
  isText = false,
  children,
}: {
  label?: string;
  onPress: () => void;
  isText?: boolean;
  children: ReactNode;
}) {
  // A finger's target: the shared touch hit area grows the button's hit
  // layer where the primary pointer is coarse.
  const hitAreaRef = useTouchHitArea(true);
  return (
    <button
      ref={hitAreaRef}
      type="button"
      tabIndex={-1}
      aria-label={label}
      onPointerDown={event => event.preventDefault()}
      onMouseDown={event => event.preventDefault()}
      onClick={onPress}
      {...focusOutlineProps.focusVisible([
        hintStyles.button,
        isText && hintStyles.done,
        touchHitAreaStyles.layer,
      ])}>
      {children}
    </button>
  );
}

/**
 * Reorder mode's hint. It is anchored below the start of the handle whose
 * row is in the mode, in Core's keyboard hint's layer and theme roles. It
 * shows the moves for the list's axis and Done until the mode ends. Each
 * move is a button that does what its key does, with the same announcement,
 * and the focus stays on the handle. Done ends the mode as Escape does. So
 * a pointer or a finger can reorder by tapping the handle, the moves, then
 * Done.
 */
function ListReorderModeHint({
  controller,
}: {
  controller: ListReorderController;
}): ReactNode {
  const t = useComponentTranslator();
  const target = useSyncExternalStore(
    controller.subscribeMode,
    () => controller.modeTarget,
    () => null,
  );
  const layer = useLayer({mode: 'context'});
  // The latest layer handle, for the effect below, which re-runs only when
  // the mode's row changes.
  const layerRef = useRef(layer);
  // Syncs the hint effect's layer handle with the committed one, before that
  // effect reads it.
  useIsomorphicLayoutEffect(() => {
    layerRef.current = layer;
  });
  const hintRef = useRef<HTMLElement | null>(null);
  // External system: the hint's popover in the top layer (useLayer),
  // anchored to the handle of the row in reorder mode. Shown while that row
  // is in the mode; hidden and unanchored when the mode ends or moves on.
  useIsomorphicLayoutEffect(() => {
    if (target == null) {
      return undefined;
    }
    const shown = layerRef.current;
    shown.ref(target);
    shown.show();
    return () => {
      shown.hide();
      shown.ref(null);
    };
  }, [target]);
  // The shared dismissal stack. While the hint is up, an Escape that reaches
  // the stack, with the focus in the hint, ends reorder mode. A layer below
  // it, such as a Dialog, stays open. The handle claims its own Escape first.
  useLayerDismissal({
    isActive: target != null,
    onDismiss: () => controller.endMode(),
    getContainer: () => hintRef.current,
  });
  return renderAnchoredHint(
    layer,
    target == null ? null : (
      <span
        ref={element => {
          hintRef.current = element;
          controller.setHintElement(element);
        }}
        {...stylex.props(anchoredHintStyles.keys)}>
        <HintButton
          label={t('@astryx.list.reorderMoveUp')}
          onPress={() => controller.step(target, -1)}>
          <Kbd keys="up" aria-hidden />
        </HintButton>
        <HintButton
          label={t('@astryx.list.reorderMoveDown')}
          onPress={() => controller.step(target, 1)}>
          <Kbd keys="down" aria-hidden />
        </HintButton>
        <HintButton isText onPress={() => controller.endMode()}>
          {t('@astryx.list.reorderDone')}
        </HintButton>
      </span>
    ),
    {isInteractive: true},
  );
}

/** The machinery a reorderable object carries (createReorderable). */
export const listReorderEngine: ListReorderEngine = {
  createSession: (getList, hintId) =>
    new ListReorderController(getList, hintId),
  start: (options, key) => {
    const sessions = sessionsByOptions.get(options) ?? [];
    if (sessions.length > 1) {
      devWarn(
        'createReorderable',
        '`start` was called on an object passed to more than one ' +
          'collection: it starts reorder mode in the one mounted last.',
      );
    }
    const session = sessions.at(-1);
    if (session == null || !session.startByKey(key)) {
      devWarn(
        'createReorderable',
        `\`start(${String(key)})\` found no mounted item with ` +
          'that key that can be reordered, so it did nothing.',
      );
    }
  },
};
