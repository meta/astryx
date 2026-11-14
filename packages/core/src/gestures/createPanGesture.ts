// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createPanGesture.ts
 * @input An element and a pan listener; from Core, the recognizer's own options
 * @output Exports createPanGesture and its types: the public pan factory. Also
 *   createPan and its types: the pan under it, with the options only Core
 *   passes. No package entry exports createPan.
 * @position Public face of packages/core/src/gestures. It reports a drag as
 *   values and hands out no recognizer; `usePanGesture` is its React layer. A
 *   Core component whose drag needs more than the public options uses
 *   createPan. Importing it does no DOM work.
 * SYNC: When modified, update ../hooks/usePanGesture.ts, its .doc.mjs and
 * __tests__/createPanGesture.test.tsx.
 */

import {getGestureHost} from './GestureHost';
import {
  PanGestureRecognizer,
  type PanGestureRecognizerOptions,
} from './PanGestureRecognizer';
import type {PointerKind, Point} from './types';

/** Where a drag is: it began, moved, ended at the release, or was cancelled. */
export type PanState = 'began' | 'changed' | 'ended' | 'cancelled';

/** What drives a drag: a pointer's kind, or a trackpad's scroll. */
export type PanInput = PointerKind | 'scroll';

/** One report of a drag. */
export interface PanEvent {
  state: PanState;
  /** Movement since the drag began, px: the claim's travel is not part of it. */
  translation: Point;
  /** Movement since the touch began, px, the claim's travel included. */
  totalTranslation: Point;
  /**
   * Velocity in px/s. At `ended` it is the release velocity, 0 when the
   * contact rested before lifting; at `cancelled` it is 0.
   */
  velocity: Point;
  /** What drives the drag. */
  input: PanInput;
}

/** Options of `createPan`. */
export interface PanOptions {
  /** Limit the drag to one axis: a drag along the other is not reported, and that component reads 0. */
  axis?: 'x' | 'y';
  /** Called as the drag begins, changes, ends, or is cancelled. */
  onPan: (event: PanEvent) => void;
  /**
   * The recognizer's own options: which pointers and scrolls start the drag,
   * its claim distance, how many touches, a gate on its begin. Defaults are
   * the recognizer's: every pointer, and no scroll.
   */
  recognizer?: Omit<PanGestureRecognizerOptions, 'direction'>;
}

/** What `createPan` returns. */
export interface Pan {
  /** Remove every listener the pan added; a drag in progress is cancelled. */
  destroy(): void;
}

const ZERO = {x: 0, y: 0};

/** Report drags on `element` as values, with the recognizer's options. */
export function createPan(element: Element, options: PanOptions): Pan {
  const {axis, onPan} = options;
  const recognizer = new PanGestureRecognizer({
    name: 'pan',
    ...options.recognizer,
    direction: axis === 'x' ? 'horizontal' : axis === 'y' ? 'vertical' : 'any',
  });
  const along = (point: Point) =>
    axis === 'x'
      ? {x: point.x, y: 0}
      : axis === 'y'
        ? {x: 0, y: point.y}
        : {x: point.x, y: point.y};
  let input: PanInput = 'touch';
  recognizer.addListener(() => {
    const state = recognizer.state;
    if (
      state !== 'began' &&
      state !== 'changed' &&
      state !== 'ended' &&
      state !== 'cancelled'
    ) {
      return;
    }
    if (state === 'began') {
      const touch = recognizer.trackedTouches[0];
      input =
        touch == null
          ? 'touch'
          : touch.scrollType != null
            ? 'scroll'
            : touch.pointerType;
    }
    onPan({
      state,
      translation: along(recognizer.translation()),
      totalTranslation: along(recognizer.totalTranslation()),
      velocity:
        state === 'cancelled' ? {...ZERO} : along(recognizer.velocity()),
      input,
    });
  });
  let detach: (() => void) | null = getGestureHost(
    element.ownerDocument,
  ).attach(element, recognizer);
  return {
    destroy() {
      const current = detach;
      detach = null;
      current?.();
    },
  };
}

/** Where a drag is: it began, moved, ended at the release, or was cancelled. */
export type PanGestureState = 'began' | 'changed' | 'ended' | 'cancelled';

export interface PanGestureEvent {
  state: PanGestureState;
  /**
   * Movement since the drag began, in CSS px. The travel the drag needed to
   * begin is not part of it, so an element that follows it does not jump.
   */
  translation: {x: number; y: number};
  /**
   * Velocity in px/s. At `ended` it is the release velocity, 0 when the
   * finger rested before lifting; at `cancelled` it is 0.
   */
  velocity: {x: number; y: number};
}

export interface PanGestureOptions {
  /** Limit the drag to one axis: a drag along the other is not reported, and that component reads 0. */
  axis?: 'x' | 'y';
  /** Called as the drag begins, changes, ends, or is cancelled. */
  onPan: (event: PanGestureEvent) => void;
}

export interface PanGesture {
  /** Remove every listener the pan added; a drag in progress is cancelled. */
  destroy(): void;
}

/**
 * Report drags on `element` as values. The drag claims its touch at UIKit's
 * 10 pt, as `UIPanGestureRecognizer` does, so a tap stays a tap. The pan sets
 * the element's `touch-action` for the axis.
 * @example
 * ```
 * const pan = createPanGesture(card, {
 *   axis: 'x',
 *   onPan: ({state, translation}) => {
 *     card.style.translate = state === 'changed' ? `${translation.x}px` : '';
 *   },
 * });
 * // Later:
 * pan.destroy();
 * ```
 */
export function createPanGesture(
  element: Element,
  options: PanGestureOptions,
): PanGesture {
  const {axis, onPan} = options;
  // totalTranslation and input stay internal.
  return createPan(element, {
    axis,
    onPan: ({state, translation, velocity}) => {
      onPan({state, translation, velocity});
    },
  });
}
