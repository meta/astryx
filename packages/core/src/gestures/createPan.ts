// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createPan.ts
 * @input An element, a pan listener, and the recognizer's own options
 * @output Exports createPan and its types: the pan under the public
 *   `createPanGesture`, with the options only Core passes
 * @position Internal to core (`spec:AST-107` FR4): `createPanGesture` is its
 *   public face, and a Core component whose drag needs more than the public
 *   options (which pointers start it, the claim distance, a begin gate, what
 *   drove it) uses it directly, a known public-API gap
 *   (`architecture:react-component-runtime` INV13).
 *
 * Under it is a `PanGestureRecognizer` on the document's gesture host, so the
 * drag claims its touch at the recognizer's claim distance and the host
 * writes the element's `touch-action` for the axis. `translation` is the
 * recognizer's own: the travel the drag needed to begin is not part of it;
 * `totalTranslation` counts from where the touch began, the claim included.
 * A trackpad's scroll drives it as a finger does where the recognizer allows
 * continuous scrolls (`spec:AST-094` FR43); `input` says which drove it.
 * Importing this module does no DOM work.
 * SYNC: When modified, update createPanGesture.ts.
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
   * the recognizer's (every pointer, a trackpad's scroll).
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
