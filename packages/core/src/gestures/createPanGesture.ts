// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createPanGesture.ts
 * @input An element and a pan listener
 * @output Exports createPanGesture and its types: the public pan factory
 * @position Public face of packages/core/src/gestures. It reports a drag as
 *   values and hands out no recognizer; `usePanGesture` is its React layer.
 *   Importing it does no DOM work.
 * SYNC: When modified, update ../hooks/usePanGesture.ts, its .doc.mjs,
 * createPan.ts and __tests__/createPanGesture.test.tsx.
 */

import {createPan} from './createPan';

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
