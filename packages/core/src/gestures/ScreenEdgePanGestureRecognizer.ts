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
 *
 * Attach it to the edge zone: a thin element along the edge, no wider than
 * `edgeRegion` across it. There a pan from one edge takes the axis across
 * the edge from the browser, which has nothing to scroll in so thin a band,
 * so the pan still decides at its 15 px hysteresis; on any wider view it
 * leaves the browser every touch behavior, so the author's scrolling there
 * is untouched (spec:AST-094 FR18).
 */

import {UIKIT_SCREEN_EDGE_PAN} from '../motion/uikit/gestures';
import {ALL_NATIVE_TOUCH, type NativeTouchBehavior} from './GestureRecognizer';
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

/** Whether a pan from `edge` runs along the horizontal axis. */
function isAcrossHorizontal(edge: ScreenEdge): boolean {
  return edge !== 'top' && edge !== 'bottom';
}

export class ScreenEdgePanGestureRecognizer extends PanGestureRecognizer {
  edges: ReadonlyArray<ScreenEdge>;
  edgeRegion: number;
  /** The physical edge the current gesture started from. */
  activeEdge: 'left' | 'right' | 'top' | 'bottom' | null = null;

  constructor(options: ScreenEdgePanGestureRecognizerOptions = {}) {
    super({
      maximumNumberOfTouches: 1,
      hysteresis: UIKIT_SCREEN_EDGE_PAN.hysteresis.value,
      ...options,
    });
    this.edges = options.edges ?? ['leading'];
    this.edgeRegion =
      options.edgeRegion ?? UIKIT_SCREEN_EDGE_PAN.edgeRegion.value;
  }

  /**
   * A pan from one edge takes the axis across that edge, but only in the
   * edge zone, a view no wider than `edgeRegion` across the edge; on a wider
   * view it leaves the browser every touch behavior, as a one-way pan does
   * (spec:AST-094 FR18). Pans from several edges keep the browser the axis
   * along them.
   */
  override get nativeTouchBehavior(): NativeTouchBehavior {
    if (this.edges.length === 1) {
      const across = isAcrossHorizontal(this.edges[0]) ? 'x' : 'y';
      return this.isEdgeZone(across)
        ? {
            panX: across !== 'x',
            panY: across !== 'y',
            pinchZoom: true,
            doubleTapZoom: false,
          }
        : ALL_NATIVE_TOUCH;
    }
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

  /**
   * Whether the view is the edge zone: no wider than `edgeRegion` along the
   * axis across its edge. A view that cannot be measured is not.
   */
  private isEdgeZone(across: 'x' | 'y'): boolean {
    const size = this.environment.viewSize?.(this.view);
    if (size == null) {
      return false;
    }
    const extent = across === 'x' ? size.width : size.height;
    return extent > 0 && extent <= this.edgeRegion;
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
