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
 * is untouched (spec:AST-094 FR18), and decides at 10 px, before the browser
 * commits to a scroll (FR19). A pan from several edges claims each axis only
 * in the zone of the edges it watches on that axis.
 */

import {UIKIT_PAN, UIKIT_SCREEN_EDGE_PAN} from '../motion/uikit/gestures';
import {ALL_NATIVE_TOUCH, type NativeTouchBehavior} from './GestureRecognizer';

/**
 * How far past `edgeRegion` a view still counts as the edge zone, px: layout
 * snaps sizes to 1/64 px, so a strip authored at the region measures a hair
 * wider; half a pixel takes that and nothing a pixel wider.
 */
const EDGE_ZONE_TOLERANCE = 0.5;
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
  /** The hysteresis where the pan takes its axis (UIKit's 15 px). */
  private readonly edgeHysteresis: number;

  constructor(options: ScreenEdgePanGestureRecognizerOptions = {}) {
    super({
      maximumNumberOfTouches: 1,
      hysteresis: UIKIT_SCREEN_EDGE_PAN.hysteresis.value,
      ...options,
    });
    this.edges = options.edges ?? ['leading'];
    this.edgeRegion =
      options.edgeRegion ?? UIKIT_SCREEN_EDGE_PAN.edgeRegion.value;
    this.edgeHysteresis = this.hysteresis;
  }

  /**
   * The pan takes the axis across its edges only in their edge zone, a view
   * no wider than `edgeRegion` across them; elsewhere it leaves the browser
   * every touch behavior, so the author's scrolling is untouched
   * (spec:AST-094 FR18). A pan from several edges takes each axis only in the
   * zone of the edges it watches on that axis, never across a whole wider
   * element.
   */
  override get nativeTouchBehavior(): NativeTouchBehavior {
    const takesX = this.edges.some(isAcrossHorizontal) && this.isEdgeZone('x');
    const takesY =
      this.edges.some(edge => !isAcrossHorizontal(edge)) &&
      this.isEdgeZone('y');
    if (!takesX && !takesY) {
      return ALL_NATIVE_TOUCH;
    }
    return {
      panX: !takesX,
      panY: !takesY,
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
      // Off its edge's zone the pan leaves the browser that axis, so it
      // decides within the 10 px the browser waits before it commits to a
      // scroll (spec:AST-094 FR19); where it takes the axis, at UIKit's 15.
      const offZone = !this.isEdgeZone(
        edge === 'left' || edge === 'right' ? 'x' : 'y',
      );
      this.hysteresis = offZone
        ? Math.min(this.edgeHysteresis, UIKIT_PAN.hysteresis.value)
        : this.edgeHysteresis;
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
   * axis across its edge, within layout's rounding (a strip authored at the
   * 40.2 px region lays out at 40.203 px, on 1/64 px). A view that cannot be
   * measured is not.
   */
  private isEdgeZone(across: 'x' | 'y'): boolean {
    const size = this.environment.viewSize?.(this.view);
    if (size == null) {
      return false;
    }
    const extent = across === 'x' ? size.width : size.height;
    return extent > 0 && extent <= this.edgeRegion + EDGE_ZONE_TOLERANCE;
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
