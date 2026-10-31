// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizeGesture.ts
 * @input A handle element, a resize model (its state, and a gesture's start,
 *   move, end and cancel), and the handle's axis, reversal and disabled state
 * @output createResizeGesture: the window splitter's input in one place, for
 *   createResizable and ResizeHandle alike: a pointer drag that holds its
 *   pointer, the arrow keys, Home, End and Enter, and a double-click collapse;
 *   and the body's drag cursor
 * @position Internal to the Resizable family. createResizable listens with it
 *   on a plain element; ResizeHandle forwards its React events to it. No React,
 *   and no DOM work on import
 */

import type {ResizableDirection} from './resizableModel';

/** Pixels an arrow key moves the separator; Shift moves it further. */
export const KEYBOARD_STEP = 10;
export const KEYBOARD_LARGE_STEP = 50;

/** What a gesture reads from its region when an input arrives. */
export interface ResizeGestureState {
  /** The region's size in px, 0 while collapsed. */
  readonly size: number;
  readonly isCollapsed: boolean;
  readonly minPx: number;
  /** The configured maximum, Infinity when the region has none. */
  readonly maxPx: number;
  readonly snaps: ReadonlyArray<number>;
  readonly collapsedSize: number;
  readonly collapsible: boolean;
}

/** The region a gesture resizes. */
export interface ResizeGestureModel {
  state(): ResizeGestureState;
  /** A gesture begins: the region holds its basis until it ends. */
  start(): void;
  /** The gesture has moved `delta` px from where it began. */
  move(delta: number): void;
  /** The gesture ends as completed. */
  end(): void;
  /** The gesture ends without completing. */
  cancel(): void;
  /**
   * The region's own collapse and expand, which restore the size it had
   * before it collapsed (APG window splitter: Enter "restores the splitter to
   * its previous position"). Without them a toggle is a resize gesture to the
   * minimum.
   */
  collapse?: () => void;
  expand?: () => void;
}

/** The handle's configuration, read at each input. */
export interface ResizeGestureConfig {
  readonly direction: ResizableDirection;
  readonly isReversed: boolean;
  readonly isDisabled: boolean;
}

/** The fields of a pointer event the gesture reads (native or React). */
export interface ResizeGesturePointerEvent {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly currentTarget: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}

/** The fields of a key event the gesture reads (native or React). */
export interface ResizeGestureKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  preventDefault(): void;
}

export interface ResizeGesture {
  pointerDown(event: ResizeGesturePointerEvent): void;
  pointerMove(event: ResizeGesturePointerEvent): void;
  pointerUp(event: ResizeGesturePointerEvent): void;
  /** A `pointercancel` or a `lostpointercapture`. */
  pointerCancel(event: ResizeGesturePointerEvent): void;
  keyDown(event: ResizeGestureKeyEvent): void;
  doubleClick(): void;
  /** Whether a pointer drag is in flight. */
  readonly isDragging: boolean;
  /**
   * Ends a drag in flight as cancelled, for a handle that goes away mid-drag:
   * its pointer and the body's drag cursor are released, and the region hears
   * that the gesture is over.
   */
  interrupt(): void;
}

/**
 * Drag feedback lives on `<body>`, not on the handle: the pointer spends the
 * drag off the handle, over whatever the panels contain, and the resize cursor
 * has to hold there.
 */
function applyBodyDragStyles(
  ownerDocument: Document,
  isHorizontal: boolean,
): void {
  ownerDocument.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
  ownerDocument.body.style.userSelect = 'none';
}

function clearBodyDragStyles(ownerDocument: Document): void {
  ownerDocument.body.style.cursor = '';
  ownerDocument.body.style.userSelect = '';
}

/**
 * The snap point `count` points away from the region's current size in
 * `direction` (+1 grows, -1 shrinks). A point beyond the minimum or the
 * maximum counts as that bound; the nearest end point serves when fewer
 * remain, and the current size when it is already there.
 */
function adjacentSnapPoint(
  state: ResizeGestureState,
  direction: 1 | -1,
  count: number,
): number {
  const points = [
    ...new Set(
      state.snaps.map(p => Math.min(state.maxPx, Math.max(state.minPx, p))),
    ),
  ].sort((a, b) => a - b);
  const {size} = state;
  const ahead =
    direction > 0
      ? points.filter(p => p > size)
      : points.filter(p => p < size).reverse();
  if (ahead.length === 0) {
    return size;
  }
  return ahead[Math.min(count, ahead.length) - 1];
}

/** One step of a gesture: start, move by `delta`, end. */
function step(model: ResizeGestureModel, delta: number): void {
  model.start();
  model.move(delta);
  model.end();
}

/**
 * Collapse an open pane, or restore a collapsed one to the size it had before
 * it collapsed, with the region's own collapse and expand. A region without
 * them falls back to a resize gesture to the minimum, which also cannot
 * reopen a pane whose minimum sits below its collapse threshold.
 */
function toggleCollapse(model: ResizeGestureModel): void {
  const state = model.state();
  if (model.collapse != null && model.expand != null) {
    if (state.isCollapsed) {
      model.expand();
    } else {
      model.collapse();
    }
    return;
  }
  step(model, state.isCollapsed ? state.minPx : -state.size);
}

/**
 * The window splitter's input for one handle. Dragging takes pointer capture
 * on the element the press landed on, so the rest of the gesture is delivered
 * to it instead of being hit-tested against whatever the pointer is over: a
 * region holding an embedded frame otherwise loses the drag the moment the
 * pointer crosses the frame.
 */
export function createResizeGesture(
  getHandle: () => Element | null,
  model: ResizeGestureModel,
  getConfig: () => ResizeGestureConfig,
  onDraggingChange?: (isDragging: boolean) => void,
): ResizeGesture {
  let drag: {
    pointerId: number;
    startPos: number;
    rtl: number;
    target: Element | null;
  } | null = null;

  const rtlMultiplier = (): number => {
    const handle = getHandle();
    if (handle == null) {
      return 1;
    }
    const view = handle.ownerDocument.defaultView;
    return view?.getComputedStyle(handle).direction === 'rtl' ? -1 : 1;
  };

  const clearDrag = () => {
    const ending = drag;
    drag = null;
    const target = ending?.target;
    if (
      ending != null &&
      target != null &&
      target.hasPointerCapture?.(ending.pointerId) === true
    ) {
      target.releasePointerCapture(ending.pointerId);
    }
    const ownerDocument = (target ?? getHandle())?.ownerDocument;
    if (ownerDocument != null) {
      clearBodyDragStyles(ownerDocument);
    }
    onDraggingChange?.(false);
  };

  return {
    get isDragging() {
      return drag != null;
    },

    pointerDown(event) {
      const config = getConfig();
      if (config.isDisabled || drag != null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const target =
        event.currentTarget instanceof Element ? event.currentTarget : null;
      // Take the pointer for the whole gesture. Without capture the browser
      // re-hit-tests every move, so a frame anywhere under the drag path
      // swallows the rest of it into the guest document.
      target?.setPointerCapture?.(event.pointerId);
      const isHorizontal = config.direction === 'horizontal';
      drag = {
        pointerId: event.pointerId,
        startPos: isHorizontal ? event.clientX : event.clientY,
        rtl: isHorizontal ? rtlMultiplier() : 1,
        target,
      };
      onDraggingChange?.(true);
      model.start();
      const ownerDocument = (target ?? getHandle())?.ownerDocument;
      if (ownerDocument != null) {
        applyBodyDragStyles(ownerDocument, isHorizontal);
      }
    },

    pointerMove(event) {
      if (drag == null || drag.pointerId !== event.pointerId) {
        return;
      }
      const config = getConfig();
      const position =
        config.direction === 'horizontal' ? event.clientX : event.clientY;
      const sign = config.isReversed ? -1 : 1;
      model.move((position - drag.startPos) * drag.rtl * sign);
    },

    pointerUp(event) {
      if (drag?.pointerId !== event.pointerId) {
        return;
      }
      clearDrag();
      model.end();
    },

    // Serves pointercancel and lostpointercapture alike: an interrupted drag
    // ends without signalling a resize end. lostpointercapture also fires on
    // the implicit release after every pointerup or pointercancel, by which
    // point the drag is already cleared and this is a no-op.
    pointerCancel(event) {
      if (drag?.pointerId !== event.pointerId) {
        return;
      }
      clearDrag();
      model.cancel();
    },

    interrupt() {
      if (drag == null) {
        return;
      }
      clearDrag();
      model.cancel();
    },

    keyDown(event) {
      const config = getConfig();
      if (config.isDisabled) {
        return;
      }
      const state = model.state();
      const isHorizontal = config.direction === 'horizontal';
      const sign = config.isReversed ? -1 : 1;
      const keyStep = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
      const rtl = isHorizontal ? rtlMultiplier() : 1;

      // The pane's grow direction on this key: ArrowRight/Down grow unless the
      // layout is reversed or, on the inline axis, right-to-left.
      const grows = (key: string) =>
        (key === 'ArrowRight' || key === 'ArrowDown'
          ? 1
          : key === 'ArrowLeft' || key === 'ArrowUp'
            ? -1
            : 0) *
          (isHorizontal ? rtl : 1) *
          sign >
        0;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowUp': {
          event.preventDefault();
          if (state.isCollapsed) {
            // A collapsed pane answers only the grow arrow: it opens one step
            // above its minimum, the value the separator announces while
            // collapsed, or at the collapse threshold when that is larger (APG
            // window splitter: the arrow moves the separator from where it
            // is; a bare step would stay below the threshold and leave it in
            // place). The shrink arrow is a no-op.
            if (grows(event.key)) {
              step(model, Math.max(state.minPx + keyStep, state.collapsedSize));
            }
            break;
          }
          if (state.snaps.length > 0) {
            // With snap points the region can rest only on a point, so a
            // pixel step would snap straight back; the arrow moves to the
            // adjacent point in its direction instead (Shift, two points),
            // staying within the bounds.
            step(
              model,
              adjacentSnapPoint(
                state,
                grows(event.key) ? 1 : -1,
                event.shiftKey ? 2 : 1,
              ) - state.size,
            );
            break;
          }
          const direction =
            event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
          step(model, direction * keyStep * (isHorizontal ? rtl : 1) * sign);
          break;
        }
        case 'Home': {
          event.preventDefault();
          step(model, state.minPx - state.size);
          break;
        }
        case 'End': {
          event.preventDefault();
          // Only a configured maximum is the region's own limit; the reported
          // stand-in for an unbounded region is where the pane could reach,
          // not where End may safely move it.
          if (state.maxPx !== Infinity) {
            step(model, state.maxPx - state.size);
          }
          break;
        }
        case 'Enter': {
          event.preventDefault();
          if (state.collapsible) {
            toggleCollapse(model);
          }
          break;
        }
      }
    },

    doubleClick() {
      if (getConfig().isDisabled || !model.state().collapsible) {
        return;
      }
      toggleCollapse(model);
    },
  };
}

// =============================================================================
// A factory bound to a ResizeHandle
// =============================================================================

/** A ResizeHandle's own props that shape the input of the region it renders. */
export interface ResizeHandleConfig {
  readonly isReversed: boolean;
  readonly isDisabled: boolean;
}

/** What a ResizeHandle renders from the factory bound to it. */
export interface ResizeHandleView {
  readonly size: number;
  readonly isCollapsed: boolean;
  readonly minPx: number;
  /** The maximum the handle reports, or undefined when there is none. */
  readonly effectiveMaxPx: number | undefined;
  readonly isDragging: boolean;
  readonly direction: ResizableDirection;
  readonly isReversed: boolean;
  readonly isDisabled: boolean;
}

/**
 * A factory driving a handle that ResizeHandle renders. ResizeHandle renders
 * the separator's attributes and look from `read()`, and forwards its React
 * events to `gesture`, so a caller's `onKeyDown` runs before the handle's own
 * key handling (component:Resizable FR7); the factory adds no listener or
 * attribute of its own to that element.
 */
export interface ResizeHandleBinding {
  readonly gesture: ResizeGesture;
  /** The current view, the same object until something in it changes. */
  read(): ResizeHandleView;
  /**
   * The handle's own `isReversed` and `isDisabled`, or null when it lets go.
   * Either the handle or the factory's options reverses or disables the
   * handle; the view reports the result.
   */
  configure(config: ResizeHandleConfig | null): void;
  /** Calls `listener` after every change to `read()`. */
  subscribe(listener: () => void): () => void;
}

/** A ResizeHandle's claim on its element: the factory bound to it, if any. */
export interface ResizeHandleClaim {
  get(): ResizeHandleBinding | null;
  set(binding: ResizeHandleBinding | null): void;
  subscribe(listener: () => void): () => void;
}

export function createResizeHandleClaim(): ResizeHandleClaim {
  let binding: ResizeHandleBinding | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => binding,
    set(next) {
      if (next === binding) {
        return;
      }
      binding = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const claims = new WeakMap<Element, ResizeHandleClaim>();

/** ResizeHandle marks the element it renders as its own. */
export function claimResizeHandle(
  element: Element,
  claim: ResizeHandleClaim,
): void {
  claims.set(element, claim);
}

/** ResizeHandle lets go of its element; a factory bound to it is unbound. */
export function releaseResizeHandle(
  element: Element,
  claim: ResizeHandleClaim,
): void {
  if (claims.get(element) === claim) {
    claims.delete(element);
    claim.set(null);
  }
}

/**
 * Binds a factory to `element` when ResizeHandle renders it, returning the
 * function that unbinds it; null for any other element, which the factory
 * then drives itself.
 */
export function bindResizeHandle(
  element: Element,
  binding: ResizeHandleBinding,
): (() => void) | null {
  const claim = claims.get(element);
  if (claim == null) {
    return null;
  }
  claim.set(binding);
  return () => {
    if (claim.get() === binding) {
      claim.set(null);
    }
  };
}

/** Whether ResizeHandle renders `element`. */
export function isClaimedResizeHandle(element: Element): boolean {
  return claims.has(element);
}
