// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file listReorderEngine.tsx
 * @input A List's element and its reorderable object's options
 *   (reorderable/createReorderable.ts, through List/listReorderContext.ts),
 *   the reorder model (List/reorderModel.ts), the reorder's touch layer
 *   (List/ListReorderTouch.ts: the hold and UIKit's motion), the row moves
 *   of utils/rowMotion.ts, the shared edge autoscroll
 *   (utils/edgeAutoscroll.ts), the touch presentation
 *   (utils/touchPresentation.ts), the shared announcer, and the anchored hint
 *   Core's keyboard hints share (hooks/anchoredHint.tsx)
 * @output `listReorderEngine`, the machinery a reorderable object carries:
 *   the reorder session of a List, its Host and its handle. A drag from a
 *   handle leaves the rows in place: the row dims where it is, a preview of
 *   it follows the pointer, an insertion line marks where it would land, and
 *   the list autoscrolls near the scroll edges; the drop reports the move
 *   once and the rows rearrange, the dragged one gliding from where its
 *   preview was. A cancelled drag restores everything at once. Activating a handle without
 *   a drag (a click, Space or Enter) turns on reorder mode for its row: each
 *   arrow moves it a place at once (one report each), announced with its
 *   place and neighbours, and Escape or another activation ends the mode,
 *   keeping the moves. While the mode is on, a hint anchored to the handle
 *   shows the moves and Done as buttons that do what the keys do
 * @position Internal to the reorder (spec:AST-103): only createReorderable
 *   imports it, so a List without `reorderable` loads none of it (FR2);
 *   ListReorderHandle drives it from each row's handle
 *
 * The drag's look is design:ordered-collection-reordering's: the surrounding
 * rows stay still until the drop, the source is dimmed in place, a preview
 * follows the pointer one to one (its centre stopping at the scroll view's
 * edges) and an accent insertion line, shared by pointer and keyboard,
 * marks the candidate position. UIKit's edit-mode reorder (iOS 26.2,
 * measured) supplies the clocks: the hold, the rows' glide to their new
 * places on the table spring after the drop, and autoscroll, a 20 ms timer
 * whose step grows with how far the preview's edge is past the scroll edge.
 * With a mouse (the theme's presentation) or Reduce Motion the rows jump to
 * their new places.
 *
 * HOW IT RUNS. Everything after the drag begins is imperative: no React
 * render and no layout read until the drop. The begin reads each row's
 * layout once; each move writes one `translate` on the preview (the shared
 * per-element animator's `set`), and a position change writes one on the
 * insertion line. The list root carries
 * `data-astryx-reordering` from the begin until the commit that applies the
 * drop, so the List's update motion (useListUpdateMotion) leaves that commit
 * to the reorder: after it, each row's old layout place (the dragged row's,
 * where its preview was dropped) is put back with an inverse offset that
 * glides to 0. If `onReorder` does not commit a new order by the end of the
 * task, nothing has moved and nothing does. Reorder mode (spec:AST-103 FR4)
 * reports each key's move at once; once it commits, under a finger's
 * presentation, the rows slide from their old places to their new ones.
 * The listeners are the list's, not each row's (FR5): one pointerdown
 * listener for a mouse and, where the primary pointer is coarse, one hold
 * recognizer that receives only the touches that begin on this list's
 * handles. A row moves when it holds a handle registered here (with its
 * item key); the others keep their places, and those at either end bound
 * the rest. What runs only on a touch screen (the hold, the springs) is in
 * ListReorderTouch.ts, imported here alone.
 *
 * SYNC: When modified, update List/listReorderContext.ts, List/List.tsx,
 * List/ListReorderHandle.tsx, List/ListReorderTouch.ts and
 * List/__tests__/ListReorder.interaction.browser.spec.ts.
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
import {useTranslator, type TranslatorFn} from '../i18n/useTranslator';
import {useLayer} from '../Layer/useLayer';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {Kbd} from '../Kbd';
import {anchoredHintStyles, renderAnchoredHint} from '../hooks/anchoredHint';
import {colorVars, fontWeightVars, spacingVars} from '../theme/tokens.stylex';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import type {LongPressGestureRecognizer} from '../gestures/LongPressGestureRecognizer';
import {VelocityTracker} from '../gestures/VelocityTracker';
import {reorder} from '../motion/uikit/reorder';
import {
  animatorFor,
  isMoving,
  motionNow,
  motionOf,
  releaseMotion,
} from '../utils/rowMotion';
import {edgeAutoscroll, type EdgeAutoscroll} from '../utils/edgeAutoscroll';
import {useTouchPresentation} from '../utils/touchPresentation';
import {watchHitArea, writeHitInsets} from '../utils/hitArea';
import {devWarn} from '../utils/devWarning';
import {GHOST_ATTRIBUTE} from './useListUpdateMotion';
import {
  INSERTION_LINE_THICKNESS,
  ListReorderHandle,
  ListReorderRowName,
  reorderListStyle,
  reorderRowStyle,
} from './ListReorderHandle';
import {attachTouchHold, touchMotion} from './ListReorderTouch';
import {
  HANDLE_ATTRIBUTE,
  REORDERING_ATTRIBUTE,
  type ListReorderContextValue,
  type ListReorderEngine,
  type ListReorderOptions,
  type ListReorderSession,
} from './listReorderContext';
import {
  autoscrollStep,
  clampTop,
  dropPosition,
  type ReorderGeometry,
} from './reorderModel';

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
 * How long after `start` the handle takes back the focus the UI that
 * started the mode hands back, in ms: a menu restores its trigger's focus
 * as it closes, within a task or two; no person moves the focus that fast.
 */
const START_FOCUS_CLAIM_MS = 150;

/**
 * The sessions each reorderable object (by its options) is mounted on, in
 * the order they mounted: `start` uses the last (spec:AST-103 FR1, FR4a).
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
 * The list's rows: its element children, without the ghost of a removed row
 * still collapsing (the update motion's, `GHOST_ATTRIBUTE`), which holds no
 * place in the order.
 */
function rowsOf(list: HTMLElement): HTMLElement[] {
  return Array.from(list.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.hasAttribute(GHOST_ATTRIBUTE),
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

/** Marks the dragged row, dimmed in its place while the drag runs. */
export const SOURCE_ATTRIBUTE = 'data-astryx-reorder-source';
/** Marks the preview of the dragged row that follows the pointer. */
export const PREVIEW_ATTRIBUTE = 'data-astryx-reorder-preview';
/** Marks the insertion line at the drop position. */
export const LINE_ATTRIBUTE = 'data-astryx-reorder-line';

/**
 * The temporary reduced emphasis the dragged row and its preview share
 * (design:ordered-collection-reordering DR2): the same item, moving, and
 * not raised.
 */
const MOVING_OPACITY = '0.6';
/** The insertion line's thickness, px. */

/**
 * An element the drag draws over the list: a ghost to the list's order and
 * its update motion, inert and hidden from assistive technology.
 */
function overlay(element: HTMLElement, marker: string): HTMLElement {
  element.setAttribute(marker, '');
  element.setAttribute(GHOST_ATTRIBUTE, '');
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
 * The preview: a copy of `row` at its place, with the same reduced emphasis
 * as the row and no elevation (DR2).
 */
function previewOf(row: HTMLElement, top: number, background: string | null) {
  const preview = row.cloneNode(true) as HTMLElement;
  preview.removeAttribute('id');
  for (const element of preview.querySelectorAll('[id]')) {
    element.removeAttribute('id');
  }
  overlay(preview, PREVIEW_ATTRIBUTE);
  Object.assign(preview.style, {
    top: `${top}px`,
    insetInlineStart: `${row.offsetLeft}px`,
    inlineSize: `${row.offsetWidth}px`,
    boxSizing: 'border-box',
    boxShadow: 'none',
    opacity: MOVING_OPACITY,
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
 * Shows the list's insertion line (its pseudo-element, reorderListStyle)
 * across `row`'s width, centred on `center` in list coordinates.
 */
function showLine(list: HTMLElement, row: HTMLElement, center: number): void {
  list.style.setProperty(LINE_START, `${row.offsetLeft}px`);
  list.style.setProperty(LINE_SIZE, `${row.offsetWidth}px`);
  list.style.setProperty(LINE_Y, `${center - INSERTION_LINE_THICKNESS / 2}px`);
  list.setAttribute(LINE_ATTRIBUTE, '');
}

/** Hides the list's insertion line and clears what placed it. */
function hideLine(list: HTMLElement): void {
  list.removeAttribute(LINE_ATTRIBUTE);
  for (const property of [LINE_Y, LINE_START, LINE_SIZE]) {
    list.style.removeProperty(property);
  }
}

/**
 * Where the insertion line's centre sits for the dragged row at `position`:
 * in the gap before the row it would land above, or after the one it would
 * land below. Null at its own place: nothing moves.
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

function isScrollContainer(element: HTMLElement): boolean {
  const {overflowY} = getComputedStyle(element);
  return (
    (overflowY === 'auto' || overflowY === 'scroll') &&
    element.scrollHeight > element.clientHeight
  );
}

function isTransparent(color: string): boolean {
  return (
    color === '' ||
    color === 'transparent' ||
    /^rgba\(.*,\s*0\)$/.test(color) ||
    /\/\s*0\)$/.test(color)
  );
}

/**
 * The background a row is drawn on: the nearest opaque background behind
 * the list, else the page's canvas.
 */
function surfaceColor(list: HTMLElement): string {
  for (
    let node: HTMLElement | null = list;
    node != null;
    node = node.parentElement
  ) {
    const color = getComputedStyle(node).backgroundColor;
    if (!isTransparent(color)) {
      return color;
    }
  }
  return 'Canvas';
}

/** The element autoscroll writes to and its visible band in the viewport. */
interface Scroller {
  readonly element: Element;
  readonly top: number;
  readonly bottom: number;
  readonly max: number;
  position: number;
}

function scrollerOf(list: HTMLElement): Scroller {
  for (
    let node = list.parentElement;
    node != null && node !== node.ownerDocument.body;
    node = node.parentElement
  ) {
    if (isScrollContainer(node)) {
      const rect = node.getBoundingClientRect();
      const top = rect.top + node.clientTop;
      return {
        element: node,
        top,
        bottom: top + node.clientHeight,
        max: node.scrollHeight - node.clientHeight,
        position: node.scrollTop,
      };
    }
  }
  const doc = list.ownerDocument;
  const element = doc.scrollingElement ?? doc.documentElement;
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
  position: number;
  /** The offset each row is moving to. */
  readonly offsets: number[];
  /** The list's layout origin in the viewport at the begin. */
  readonly origin: number;
  /** The finger's distance from the dragged row's top. */
  readonly grabOffset: number;
  readonly scroller: Scroller;
  /** How far autoscroll has moved the content since the begin. */
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
   * The release's y velocity, px/s: the dragged row's glide starts at it
   * (spec:AST-094 FR6, FR38).
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
 * What a move announces: `landed` once the consumer commits it (the row is at
 * `to` in the DOM), `kept` if the consumer keeps the order instead. A screen
 * reader never hears a move that did not happen.
 */
interface PendingAnnouncement {
  readonly row: HTMLElement;
  readonly to: number;
  readonly landed: string;
  readonly kept: string;
  readonly politeness: AnnouncePoliteness | undefined;
}

/** The strings the controller announces, from the translator. */
interface ReorderMessages {
  /**
   * A row's place in reorder mode: its name, place and count, and the names
   * of the rows before and after it (null at the top or the end).
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
   * dropped row's glide starts at (spec:AST-094 FR6, FR38).
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
   * A reorder mode move between its report and its commit: the commit may
   * move the handle's element, and the blur that causes keeps the mode.
   */
  private isMovingByKey = false;
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
  /** Whether a list whose rows have no item key has been warned about. */
  private warnedUnkeyed = false;

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
   * Records a row's handle, the row's item key (ListItem `itemKey`) and its
   * name; returns the removal. A row moves only with a handle recorded here.
   */
  registerHandle(handle: Element | null, key: Key, name: string): () => void {
    if (handle == null) {
      return () => {};
    }
    this.keys.set(handle, key);
    this.names.set(handle, name);
    return () => {
      if (this.keys.get(handle) === key) {
        this.keys.delete(handle);
        this.names.delete(handle);
        if (this.modeHandle === handle) {
          this.setMode(null);
        }
      }
    };
  }

  /** Records the name of a row without a handle; returns the removal. */
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
    for (const listener of [...this.modeListeners]) {
      listener();
    }
  }

  /**
   * A handle was activated without a drag (a click, Space or Enter): its row
   * enters reorder mode, or leaves it (spec:AST-103 FR4).
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
   * ("Done, Milk at position 3 of 5"): Escape, another activation of the
   * handle, or the hint's Done. Focus that a screen reader moved into the
   * hint goes back to the handle. A blur, a drag or the row leaving ends it
   * without a word.
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
   * Reorder mode for the item with `key`, started from the app's own UI
   * (spec:AST-103 FR4a): the focus moves to its handle, which scrolls into
   * view, as activating it does. Returns whether an item with that key can
   * move here.
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
    for (const handle of row.querySelectorAll(`[${HANDLE_ATTRIBUTE}]`)) {
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
    const handle = target.closest<HTMLElement>(`[${HANDLE_ATTRIBUTE}]`);
    return handle != null &&
      this.keys.has(handle) &&
      list.contains(handle) &&
      handle.getAttribute('aria-disabled') !== 'true'
      ? handle
      : null;
  }

  /**
   * Lets a mouse drag rows by their handles: one pointerdown listener on the
   * list, and while a press is down its move and lift listeners there too.
   * The press is the handle's until it lifts (pointer capture), and drags
   * the row once it has moved MOUSE_DRAG_SLOP, from where it pressed.
   * Returns the detach.
   */
  attachMouse(): () => void {
    const list = this.getList();
    if (list == null) {
      return () => {};
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) {
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
   * Lets a finger held still on a handle pick up its row: one recognizer on
   * the list, which receives only the touches that begin on its handles.
   * Attached only where the primary pointer is coarse (spec:AST-094 FR19).
   * Returns the detach.
   */
  attachTouch(): () => void {
    const list = this.getList();
    if (list == null) {
      return () => {};
    }
    let held: HTMLElement | null = null;
    // The finger's velocity, for the glide a release hands it to.
    const velocity = new VelocityTracker();
    return attachTouchHold(
      list,
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
   * The handle in `row` stopped taking gestures (its row disabled or no
   * longer reorderable, the handle gone): a drag of that row goes home. The
   * session owns that end, since a recognizer turned off mid-gesture reports
   * nothing.
   */
  release(row: HTMLElement | null): void {
    const session = this.session;
    if (
      session != null &&
      row != null &&
      session.rows[session.dragged] === row
    ) {
      this.endMouse?.();
      this.cancel();
    }
    if (row != null && this.rowOf(this.modeHandle) === row) {
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
    // Every row gets an identity offset for the session: a row's first offset
    // would otherwise change how it paints in the middle of the drag (a
    // layout and a paint); with one in place, neither a move nor a slide lays
    // out or paints. (`will-change` would make each slide's start repaint its
    // row.) The dragged row goes above its neighbours.
    const restore: RowRestore = {
      zIndex: row.style.zIndex,
      backgroundColor: row.style.backgroundColor,
      opacity: row.style.opacity,
      counterIncrement: row.style.counterIncrement,
      listPosition: list.style.position,
      rows,
    };
    // The rows stay where they are until the drop
    // (design:ordered-collection-reordering): the dragged row is dimmed in
    // its place, a preview of it follows the pointer, and an insertion line
    // marks where it would land. The preview has a background, as the row
    // does: a row without its own takes the surface's behind the list.
    const background = isTransparent(getComputedStyle(row).backgroundColor)
      ? surfaceColor(list)
      : null;
    for (const element of rows) {
      if (element.style.translate === '') {
        element.style.translate = '0px 0px';
      }
    }
    if (getComputedStyle(list).position === 'static') {
      list.style.position = 'relative';
    }
    const preview = previewOf(row, tops[dragged], background);
    // Right before its source: the preview counts for it, so in a numbered
    // list it reads the source's number, and every other row keeps its place
    // among its siblings (the last row its :last-child).
    row.before(preview);
    row.style.counterIncrement = 'none';
    row.setAttribute(SOURCE_ATTRIBUTE, '');
    row.style.opacity = MOVING_OPACITY;
    list.setAttribute(REORDERING_ATTRIBUTE, '');
    const session: DragSession = {
      list,
      rows,
      tops,
      geometry,
      dragged,
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
        // UIKit's run-loop timer: a late fire (engines fire a 20 ms interval
        // every 20 to 25 ms) catches up one tick, a longer stall is skipped.
        catchUp: true,
        now: motionNow,
        step: () => this.edgeStep(session),
        apply: delta => this.scrollBy(session, delta),
      }),
      step: 0,
      restore,
      preview,
    };
    this.session = session;
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
    session.lastY = y;
    const {geometry, dragged} = session;
    const row = geometry.rows[dragged];
    const origin = session.origin - session.scrolled;
    const top = this.draggedTop(session, y);
    animatorFor(session.preview).set({y: top - (origin + row.top)});
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
      showLine(session.list, session.rows[session.dragged], center);
    }
    // A pointer drag announces its pick-up and its drop, not each place it
    // passes: announcing each crossed position is noisy.
  }

  /**
   * Points per tick for the dragged row at `top`: positive down, negative
   * up, 0 when neither edge is near or the content cannot move that way.
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
    this.track(session.lastY);
    return moved;
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
    this.session = null;
    this.stopAutoscroll(session);
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
        list.removeAttribute(REORDERING_ATTRIBUTE);
        this.restWhenDone(element, session.restore);
      } else {
        this.springBack(list, rows, dragged, session.restore);
      }
      return;
    }
    this.announceWhenCommitted({
      row: element,
      to: position,
      landed: dropped,
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
    // Nothing moved: the preview and the line go and the row is itself again
    // at once (design:ordered-collection-reordering).
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
    row.removeAttribute(SOURCE_ATTRIBUTE);
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
    for (const element of rows) {
      const value = shownY(element, at);
      if (Math.abs(value) < MIN_MOVE_PX && !isMoving(element)) {
        continue;
      }
      if (!this.animates) {
        animatorFor(element).set({y: 0});
        releaseMotion(element, 'translate');
        continue;
      }
      // A row still gliding (a drop's or a key move's glide) goes on home on
      // the shared settle role from where it is shown, at the speed it has
      // (spec:AST-094 FR4, FR6).
      touchMotion.home(element, touchMotion.glideBase(list), at, false);
    }
    list.removeAttribute(REORDERING_ATTRIBUTE);
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

  commit(): void {
    const list = this.getList();
    if (list == null) {
      return;
    }
    if (
      !this.warnedUnkeyed &&
      this.keys.size === 0 &&
      this.options != null &&
      this.options.isReorderable == null &&
      list.children.length > 0
    ) {
      this.warnedUnkeyed = true;
      devWarn(
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
      this.announce(announcement.landed, announcement.politeness);
    }
    const move = this.committedMove;
    if (move != null && !sameOrder(rowsOf(list), move.rows)) {
      this.committedMove = null;
      if (this.moveFallback != null) {
        clearTimeout(this.moveFallback);
        this.moveFallback = null;
      }
      this.slideCommitted(move);
    }
    // A reorder mode move has landed (or nothing waits): its handle keeps
    // the focus, and the insertion line marks the row's new place.
    if (this.announcement == null) {
      this.restoreFocus();
      this.placeModeLine(list);
    }
  }

  /** A reorder mode move landed: each row slides from its old place to its new one. */
  private slideCommitted(move: PendingMove): void {
    const {list} = move;
    const at = motionNow();
    for (const [index, element] of move.rows.entries()) {
      if (element.parentElement !== list) {
        continue;
      }
      const shift = move.tops[index] - layoutTop(element, list);
      if (Math.abs(shift) < MIN_MOVE_PX) {
        continue;
      }
      // A row still sliding from the previous move goes on from where it is
      // shown, as a drop's rows do.
      touchMotion.follow(element, shift, touchMotion.glideBase(list), at);
    }
    list.removeAttribute(REORDERING_ATTRIBUTE);
  }

  private rebase(pending: PendingDrop): void {
    const {list} = pending;
    const at = motionNow();
    for (const [index, element] of pending.rows.entries()) {
      if (element.parentElement !== list) {
        continue;
      }
      // The dragged row glides from where its preview was dropped, the rows
      // it passed from their old places.
      const from =
        index === pending.dragged ? pending.droppedTop : pending.tops[index];
      const shift = from - layoutTop(element, list);
      const value = shownY(element, at);
      if (Math.abs(value + shift) < MIN_MOVE_PX && !isMoving(element)) {
        animatorFor(element).set({y: 0});
        releaseMotion(element, 'translate');
        continue;
      }
      if (Math.abs(shift) < MIN_MOVE_PX) {
        continue;
      }
      if (this.animates && index === pending.dragged) {
        // The dragged row glides from where its preview was dropped into its
        // new layout place, starting at the release's velocity
        // (spec:AST-094 FR6, FR38).
        touchMotion.glide(
          element,
          shift,
          touchMotion.glideBase(list),
          at,
          pending.velocity,
        );
      } else if (this.animates) {
        // Every other row's place after the drop is its new layout place, so
        // its running spring (a row's glide) goes on to 0 from the shifted
        // value, or the glide starts from rest.
        touchMotion.follow(element, shift, touchMotion.glideBase(list), at);
      } else {
        animatorFor(element).set({y: 0});
        releaseMotion(element, 'translate');
      }
    }
    list.removeAttribute(REORDERING_ATTRIBUTE);
    this.restWhenDone(pending.rows[pending.dragged], pending.restore);
  }

  /**
   * Reorder mode's insertion line, at the edge the mode's row came in
   * through on its last key move (the gap above it after a move up, below
   * it after a move down), shared with the pointer drag's
   * (design:ordered-collection-reordering). None before a move.
   */
  private placeModeLine(list: HTMLElement): void {
    const row = this.rowOf(this.modeHandle);
    if (row == null || this.lastStep == null) {
      this.clearModeLine();
      return;
    }
    const rows = rowsOf(list);
    const index = rows.indexOf(row);
    const top = layoutTop(row, list);
    const bottom = top + row.offsetHeight;
    const neighbour = rows[index + this.lastStep];
    const gap =
      neighbour == null
        ? 0
        : this.lastStep < 0
          ? Math.max(
              0,
              top - (layoutTop(neighbour, list) + neighbour.offsetHeight),
            )
          : Math.max(0, layoutTop(neighbour, list) - bottom);
    const center = this.lastStep < 0 ? top - gap / 2 : bottom + gap / 2;
    if (this.modeLine?.list !== list) {
      this.clearModeLine();
      const listPosition = list.style.position;
      if (getComputedStyle(list).position === 'static') {
        list.style.position = 'relative';
      }
      this.modeLine = {list, listPosition};
    }
    showLine(list, row, center);
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

  /** The 1-based place of the row that holds `element`, or null. */
  positionOf(element: Element | null): number | null {
    const list = this.getList();
    const row = this.rowOf(element);
    return list == null || row == null ? null : rowsOf(list).indexOf(row) + 1;
  }

  // --- Keys ------------------------------------------------------------

  /**
   * A handle's key in reorder mode (spec:AST-103 FR4): the arrows move its
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
   * Reorder mode's move: the row whose handle is in the mode goes a place up
   * (`-1`) or down (`1`) at once, with one report, announced with its place
   * and neighbours once it lands. Under a finger's presentation the rows
   * then slide to their new places, as a UIKit table moves a row. A move
   * into a row that stays at either end is refused and announced; one past
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
    const order = rows.filter(element => element !== row);
    order.splice(to, 0, row);
    this.focusRow = row;
    this.isMovingByKey = true;
    this.lastStep = delta;
    this.announceWhenCommitted({
      row,
      to,
      landed: this.placeIn(order, to),
      kept: this.placeIn(rows, index),
      politeness: undefined,
    });
    if (this.animates) {
      this.committedMove = {
        list,
        rows,
        tops: rows.map(element => layoutTop(element, list)),
      };
      // The List's update motion leaves this commit to the reorder.
      list.setAttribute(REORDERING_ATTRIBUTE, '');
      if (this.moveFallback != null) {
        clearTimeout(this.moveFallback);
      }
      // The caller kept the order: nothing slides.
      this.moveFallback = setTimeout(() => {
        this.moveFallback = null;
        if (this.committedMove != null) {
          this.committedMove = null;
          if (this.session == null && this.pending == null) {
            list.removeAttribute(REORDERING_ATTRIBUTE);
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
   * A handle lost focus to `next`: its row leaves reorder mode, keeping its
   * moves, unless a move's commit is moving its element (focus going
   * nowhere while it does).
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
    // Escape, Done, the handle again and its row going (spec:AST-103 FR4,
    // FR4a). Back on the handle, its arrows move the row again.
  }

  /**
   * After a reorder mode move: the handle has the focus again (the commit
   * may have moved its element) and its row scrolls into view.
   */
  private restoreFocus(): void {
    this.isMovingByKey = false;
    const row = this.focusRow;
    if (row == null) {
      return;
    }
    this.focusRow = null;
    const handle = this.handleIn(row);
    const active = row.ownerDocument.activeElement;
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
    if (handle === this.modeHandle) {
      row.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
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
 * Beside a reorderable List's rows: keeps its session's options, strings
 * and presentation current, attaches the list's listeners (the touch hold
 * only where the primary pointer is coarse), and renders the handles'
 * instructions.
 */
function ListReorderHost({reorder}: {reorder: ListReorderContextValue}) {
  const {options} = reorder;
  const controller = reorder.session as ListReorderController;
  const announce = useAnnounce();
  const t = useTranslator();
  // UIKit's motion under a finger (one touch model on every touch device);
  // with a mouse, rows take their places at once.
  const isTouch = useTouchPresentation().isTouch;
  useIsomorphicLayoutEffect(() => {
    controller.configure({
      options,
      announce,
      messages: messagesFrom(t),
      presentation: isTouch ? 'uikit' : 'theme',
    });
  });
  useIsomorphicLayoutEffect(() => controller.attachMouse(), [controller]);
  // Where the object's `start` finds this list.
  useIsomorphicLayoutEffect(
    () => mountSession(options, controller),
    [options, controller],
  );
  // The List stopped reordering, or unmounted: a drag goes home.
  useIsomorphicLayoutEffect(() => () => controller.dispose(), [controller]);
  useIsomorphicLayoutEffect(
    () => (isTouch ? controller.attachTouch() : undefined),
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
  // same size under every pointer. A finger's 44 px target is the invisible
  // hit layer below, grown by the insets the hit area writes where the
  // primary pointer is coarse, each side capped at half the gap to a
  // neighbouring target (utils/hitArea.ts), so it never covers one.
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
    // SYNC: utils/hitArea.ts HIT_INSET_PROPERTIES (StyleX reads no
    // imported value).
    '::after': {
      content: '""',
      position: 'absolute',
      inset:
        'calc(var(--astryx-hit-inset-top, 0px) * -1) calc(var(--astryx-hit-inset-right, 0px) * -1) calc(var(--astryx-hit-inset-bottom, 0px) * -1) calc(var(--astryx-hit-inset-left, 0px) * -1)',
    },
  },
  done: {
    paddingInline: spacingVars['--spacing-1'],
    color: colorVars['--color-text-primary'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
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
  const ref = useRef<HTMLButtonElement | null>(null);
  // A finger's target: the hit area watches the button where the primary
  // pointer is coarse and writes how far its hit layer may grow.
  useIsomorphicLayoutEffect(() => {
    const button = ref.current;
    if (button == null) {
      return undefined;
    }
    return watchHitArea(button, insets => writeHitInsets(button, insets));
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      aria-label={label}
      onPointerDown={event => event.preventDefault()}
      onMouseDown={event => event.preventDefault()}
      onClick={onPress}
      {...focusOutlineProps.focusVisible([
        hintStyles.button,
        isText && hintStyles.done,
      ])}>
      {children}
    </button>
  );
}

/**
 * Reorder mode's hint (spec:AST-103 FR4): anchored below the start of the
 * handle whose row is in the mode, in Core's keyboard hint's layer and
 * theme roles, it shows the moves for the list's axis and Done until the
 * mode ends. Each move is a button that does what its key does, with the
 * same announcement and the focus left on the handle, and Done ends the
 * mode as Escape does, so a pointer or a finger can reorder by tapping the
 * handle, the moves, then Done.
 */
function ListReorderModeHint({
  controller,
}: {
  controller: ListReorderController;
}): ReactNode {
  const t = useTranslator();
  const target = useSyncExternalStore(
    controller.subscribeMode,
    () => controller.modeTarget,
    () => null,
  );
  const layer = useLayer({mode: 'context'});
  const layerRef = useRef(layer);
  const hintRef = useRef<HTMLElement | null>(null);
  // No external system: keeps the latest layer handle for the effect below,
  // which re-runs only when the mode's row changes. Idempotent.
  useIsomorphicLayoutEffect(() => {
    layerRef.current = layer;
  });
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
  // The shared dismissal stack (family:overlay-dismissal): while the hint is
  // up, an Escape that reaches the stack, with the focus in the hint, ends
  // reorder mode instead of closing a layer below it such as a Dialog. The
  // handle claims its own Escape first.
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
