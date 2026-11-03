// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizeGesture.ts
 * @input A handle element, a resize model (its state, and a gesture's start,
 *   move, end and cancel), and the handle's axis, reversal and disabled state
 * @output createResizeGesture: the window splitter's input in one place: a
 *   pointer drag that holds its pointer, the arrow keys, Home, End and Enter,
 *   and a double-click collapse; and the body's drag cursor
 * @position Internal to the Resizable family. ResizeHandle forwards its React
 *   events to it. No React, and no DOM work on import
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
   * The region's own collapse and expand. They restore the size it had before
   * it collapsed, as the APG window splitter's Enter does. Without them a
   * toggle is a resize gesture to the minimum.
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
   * Ends a drag in flight as cancelled, for a handle that goes away mid-drag.
   * It releases the pointer and the body's drag cursor, and tells the region
   * that the gesture is over.
   */
  interrupt(): void;
}

/**
 * Drag feedback lives on the page's `<body>`, not on the handle. During a
 * drag the pointer moves over whatever the panels contain, and the resize
 * cursor must hold there.
 */
function applyBodyDragStyles(isHorizontal: boolean): void {
  document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
  document.body.style.userSelect = 'none';
}

function clearBodyDragStyles(): void {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

/**
 * The snap point `count` points away from the region's current size in
 * `direction` (+1 grows, -1 shrinks). A point beyond the minimum or the
 * maximum counts as that bound. When fewer points remain, the nearest end
 * point serves, or the current size when the region is already there.
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

function step(model: ResizeGestureModel, delta: number): void {
  model.start();
  model.move(delta);
  model.end();
}

/**
 * Collapse an open pane, or restore a collapsed one to the size it had before
 * it collapsed, with the region's own collapse and expand. A region without
 * them falls back to a resize gesture to the minimum. That gesture cannot
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
 * The window splitter's input for one handle. A drag takes pointer capture
 * on the element the press landed on. The rest of the gesture then goes to
 * that element. Without capture, the browser hit-tests each move, and an
 * embedded frame under the pointer takes the drag.
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
    if (ending != null) {
      clearBodyDragStyles();
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
      // An element from another document (an iframe, a popup) is not an
      // instance of this page's Element, so test for the capture API itself.
      const current = event.currentTarget as Element | null;
      const target =
        typeof current?.setPointerCapture === 'function' ? current : null;
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
      applyBodyDragStyles(isHorizontal);
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
    // ends without a resize end. The implicit release after every pointerup
    // or pointercancel also fires lostpointercapture. By then the drag is
    // already cleared, and this is a no-op.
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
            // A collapsed pane answers only the grow arrow. It opens one step
            // above its minimum, the value the separator announces while
            // collapsed. If the collapse threshold is larger, it opens there.
            // A bare step would stay below the threshold and leave the pane
            // closed. The shrink arrow is a no-op.
            if (grows(event.key)) {
              step(model, Math.max(state.minPx + keyStep, state.collapsedSize));
            }
            break;
          }
          if (state.snaps.length > 0) {
            // With snap points the region rests only on a point, so a pixel
            // step would snap straight back. The arrow moves to the adjacent
            // point in its direction instead, two points with Shift, within
            // the bounds.
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
          // Only a configured maximum is the region's own limit. The reported
          // stand-in for an unbounded region is where the pane could reach,
          // not where End may move it.
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
