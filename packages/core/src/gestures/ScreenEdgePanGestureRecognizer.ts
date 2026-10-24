// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScreenEdgePanGestureRecognizer.ts
 * @input Touches from a GestureArena; the viewport size and writing
 *   direction from its environment
 * @output Exports ScreenEdgePanGestureRecognizer
 *   (UIScreenEdgePanGestureRecognizer), its options and edge type
 * @position Continuous recognizer of packages/core/src/gestures, a pan that
 *   only starts from a band at the edge of the viewport
 *
 * A touch that lands outside every requested band fails at once, so a
 * recognizer that requires this one to fail is not held up by a touch in the
 * middle of the screen. Inside a band, the pan begins on movement away from
 * that edge. `leading` and `trailing` resolve against the view's writing
 * direction when the touch lands: under RTL the leading edge is the right
 * one, as the interactive pop gesture's is.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import type {NativeTouchBehavior} from './GestureRecognizer';
import {
  PanGestureRecognizer,
  type PanGestureRecognizerOptions,
} from './PanGestureRecognizer';
import type {GestureEventContext, GestureTouch} from './types';

export type ScreenEdge =
  'left' | 'right' | 'top' | 'bottom' | 'leading' | 'trailing';

export interface ScreenEdgePanGestureRecognizerOptions extends Omit<
  PanGestureRecognizerOptions,
  'direction'
> {
  /** The edges a touch may start from. @default ['leading'] */
  edges?: ReadonlyArray<ScreenEdge>;
  /** Width of the band at each edge, px. */
  edgeRegion?: number;
}

export class ScreenEdgePanGestureRecognizer extends PanGestureRecognizer {
  edges: ReadonlyArray<ScreenEdge>;
  edgeRegion: number;
  /** The physical edge the current gesture started from. */
  activeEdge: 'left' | 'right' | 'top' | 'bottom' | null = null;

  constructor(options: ScreenEdgePanGestureRecognizerOptions = {}) {
    super({
      maximumNumberOfTouches: 1,
      hysteresis: UIKIT_GESTURES.screenEdgePan.hysteresis.value,
      ...options,
    });
    this.edges = options.edges ?? ['leading'];
    this.edgeRegion =
      options.edgeRegion ?? UIKIT_GESTURES.screenEdgePan.edgeRegion.value;
  }

  /** The browser keeps the axis along the edges. */
  override get nativeTouchBehavior(): NativeTouchBehavior {
    const horizontal = this.edges.some(
      edge => edge !== 'top' && edge !== 'bottom',
    );
    const vertical = this.edges.some(
      edge => edge === 'top' || edge === 'bottom',
    );
    return {
      panX: !horizontal,
      panY: !vertical,
      pinchZoom: true,
      doubleTapZoom: false,
    };
  }

  protected override touchesBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.numberOfTouches === touches.length) {
      const edge = this.edgeAt(touches[0]);
      if (edge == null) {
        this.setState('failed');
        return;
      }
      this.activeEdge = edge;
      this.direction =
        edge === 'left'
          ? 'right'
          : edge === 'right'
            ? 'left'
            : edge === 'top'
              ? 'down'
              : 'up';
    }
    super.touchesBegan(touches, event);
  }

  protected override reset(): void {
    super.reset();
    this.activeEdge = null;
  }

  private edgeAt(
    touch: GestureTouch,
  ): 'left' | 'right' | 'top' | 'bottom' | null {
    const {width, height} = this.environment.viewportSize();
    const isRtl = this.environment.isRtl(this.view);
    for (const edge of this.edges) {
      const physical =
        edge === 'leading'
          ? isRtl
            ? 'right'
            : 'left'
          : edge === 'trailing'
            ? isRtl
              ? 'left'
              : 'right'
            : edge;
      const inBand =
        physical === 'left'
          ? touch.startX <= this.edgeRegion
          : physical === 'right'
            ? touch.startX >= width - this.edgeRegion
            : physical === 'top'
              ? touch.startY <= this.edgeRegion
              : touch.startY >= height - this.edgeRegion;
      if (inBand) {
        return physical;
      }
    }
    return null;
  }
}
