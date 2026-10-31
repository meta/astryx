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
 * direction: under RTL the leading edge is the right one, as the
 * interactive pop gesture's is.
 *
 * Attach it to the edge zone: an element that lies within the band at its
 * edge. There the pan takes the horizontal axis from the browser, which has
 * nothing to scroll in so thin a band, so a touch in the band decides at
 * UIKit's 15 px screen-edge hysteresis. On any other view, whose
 * `touch-action` cannot claim per touch, it leaves the browser every touch
 * behavior, so the author's scrolling there is untouched, and a touch in the
 * band decides at FR19's 10 px like every other claim (spec:AST-094 FR18,
 * DEC-22). The edges' physical sides and the edge zone are measured once,
 * together, and serve both the element's `touch-action` and the touch-down
 * decision; the host reports a layout change (layoutChanged), and a changed
 * answer is announced (onTouchBehaviorChange) so `touch-action` follows it
 * (FR19). The writing direction is read again at each touch-down: a view
 * switched to RTL in place, with no resize, is measured again there and the
 * change announced, so a `leading` back swipe follows the new leading edge
 * (`design:bidirectionality` DR13). That touch landed under the touch-action
 * from before, so it decides at FR19's 10 px unless that one claimed the
 * axis.
 */

import {UIKIT_PAN, UIKIT_SCREEN_EDGE_PAN} from '../motion/uikit/gestures';
import {ALL_NATIVE_TOUCH, type NativeTouchBehavior} from './GestureRecognizer';
import {
  PanGestureRecognizer,
  type PanGestureRecognizerOptions,
} from './PanGestureRecognizer';
import type {GestureEventContext, GestureTouch} from './types';

/**
 * How far past `edgeRegion` a view still counts as the edge zone, px: layout
 * snaps sizes to 1/64 px, so a strip authored at the region measures a hair
 * wider; half a pixel takes that and nothing a pixel wider.
 */
const EDGE_ZONE_TOLERANCE = 0.5;

/**
 * An edge by writing direction: under RTL the leading edge is the right one.
 * Top and bottom edges land with their first user.
 */
export type ScreenEdge = 'leading' | 'trailing';

/** A physical horizontal edge of the viewport. */
type PhysicalEdge = 'left' | 'right';

/**
 * What the pan measures of its view, once until a layout change: the
 * writing direction it read, the physical sides its edges resolve to under
 * that direction, and the sides whose band the view lies within.
 */
interface EdgeLayout {
  readonly isRtl: boolean;
  readonly watched: ReadonlyArray<PhysicalEdge>;
  readonly zone: ReadonlySet<PhysicalEdge>;
}

/**
 * A screen-edge pan is a finger's: it takes no `allowedPointerTypes`
 * (`spec:AST-094` FR43).
 */
export interface ScreenEdgePanGestureRecognizerOptions extends Omit<
  PanGestureRecognizerOptions,
  'direction' | 'allowedPointerTypes'
> {
  /** The edges a touch may start from. @default ['leading'] */
  edges?: ReadonlyArray<ScreenEdge>;
  /** Width of the band at each edge, px. */
  edgeRegion?: number;
}

export class ScreenEdgePanGestureRecognizer extends PanGestureRecognizer {
  override get kind(): PanGestureRecognizer['kind'] {
    return 'screenEdgePan';
  }

  edges: ReadonlyArray<ScreenEdge>;
  edgeRegion: number;
  /** The physical edge the current gesture started from. */
  activeEdge: PhysicalEdge | null = null;
  /**
   * @internal Set by the host while attached: called when the edge-zone
   * answer changes, so the element's `touch-action` follows it
   * (spec:AST-094 FR19, DEC-22).
   */
  onTouchBehaviorChange: (() => void) | null = null;
  /** The hysteresis where the pan takes its axis (UIKit's 15 px). */
  private readonly edgeHysteresis: number;
  /** What the pan measured of its view (see EdgeLayout), until a layout change. */
  private layout: EdgeLayout | null = null;

  constructor(options: ScreenEdgePanGestureRecognizerOptions = {}) {
    super({
      maximumNumberOfTouches: 1,
      hysteresis: UIKIT_SCREEN_EDGE_PAN.hysteresis.value,
      ...options,
      // A finger's only: under a mouse, a trackpad or a pen the screen-edge
      // pan stays off (`spec:AST-094` FR43), whatever a caller passes.
      allowedPointerTypes: ['touch'],
    });
    this.edges = options.edges ?? ['leading'];
    this.edgeRegion =
      options.edgeRegion ?? UIKIT_SCREEN_EDGE_PAN.edgeRegion.value;
    this.edgeHysteresis = this.hysteresis;
  }

  /**
   * The pan takes the horizontal axis only in its edge zone, a view within
   * the band of an edge it watches; elsewhere it leaves the browser every
   * touch behavior, so the author's scrolling is untouched (spec:AST-094
   * FR18), never claiming across a whole wider element.
   */
  override get nativeTouchBehavior(): NativeTouchBehavior {
    const {watched, zone} = this.measured();
    if (!watched.some(edge => zone.has(edge))) {
      return ALL_NATIVE_TOUCH;
    }
    return {
      panX: false,
      panY: true,
      pinchZoom: true,
      doubleTapZoom: false,
    };
  }

  /**
   * @internal Whether the edge zone depends on the viewport's width: the pan
   * watches the right side, whose band moves with the viewport, so the host
   * reports a viewport resize to it as well as its own box's (FR19, FR24).
   */
  get watchesViewport(): boolean {
    return this.measured().watched.includes('right');
  }

  /**
   * @internal The view's box may have changed (a resize): its edges' sides
   * and the edge zone are measured again, and a changed answer calls
   * onTouchBehaviorChange.
   */
  layoutChanged(): void {
    const before = this.layout;
    this.layout = null;
    const after = this.measured();
    if (
      before == null ||
      before.watched.join() !== after.watched.join() ||
      before.zone.size !== after.zone.size ||
      [...after.zone].some(edge => !before.zone.has(edge))
    ) {
      this.onTouchBehaviorChange?.();
    }
  }

  protected override touchesBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.numberOfTouches === touches.length) {
      // The touch-action the browser applies to this touch was derived from
      // the layout in force as it landed: whether that claimed the axis.
      const inForce = this.measured();
      const claimedAxis = inForce.watched.some(side => inForce.zone.has(side));
      // A direction switched in place (no resize) moves the leading edge:
      // measure again, and announce it so touch-action follows for the next
      // touch (DR13).
      if (inForce.isRtl !== this.environment.isRtl(this.view)) {
        this.layoutChanged();
      }
      const edge = this.edgeAt(touches[0]);
      if (edge == null) {
        this.setState('failed');
        return;
      }
      this.activeEdge = edge;
      // On an element within the band, which takes the axis across the edge,
      // a touch decides at UIKit's 15 px; on any other, which leaves the
      // browser that axis, at FR19's 10 px, before the browser commits to a
      // scroll (spec:AST-094 FR18, DEC-22). The answer is the one this
      // touch's touch-action was derived from: a touch that measured again
      // decides at 10 px unless the layout in force claimed the axis.
      const offZone = !claimedAxis || !this.measured().zone.has(edge);
      this.hysteresis = offZone
        ? Math.min(this.edgeHysteresis, UIKIT_PAN.hysteresis.value)
        : this.edgeHysteresis;
      this.direction = edge === 'left' ? 'right' : 'left';
    }
    super.touchesBegan(touches, event);
  }

  /**
   * The physical sides the pan's edges resolve to under the view's writing
   * direction, and the sides whose band the view lies within, measured
   * together once until a layout change: the view starts at that side and
   * reaches no farther than `edgeRegion` from it, within layout's rounding
   * (a strip authored at the 40.2 px region lays out at 40.203 px, on
   * 1/64 px). A view that cannot be measured lies within none.
   */
  private measured(): EdgeLayout {
    if (this.layout != null) {
      return this.layout;
    }
    const isRtl = this.environment.isRtl(this.view);
    const watched = this.edges.map(edge =>
      (edge === 'leading') !== isRtl ? 'left' : 'right',
    );
    const zone = new Set<PhysicalEdge>();
    const rect = this.environment.viewRect?.(this.view);
    if (rect != null && rect.width > 0) {
      const {width} = this.environment.viewportSize();
      const right = rect.left + rect.width;
      const band = this.edgeRegion + EDGE_ZONE_TOLERANCE;
      if (rect.left >= -EDGE_ZONE_TOLERANCE && right <= band) {
        zone.add('left');
      }
      if (rect.left >= width - band && right <= width + EDGE_ZONE_TOLERANCE) {
        zone.add('right');
      }
    }
    this.layout = {isRtl, watched, zone};
    return this.layout;
  }

  protected override reset(): void {
    super.reset();
    this.activeEdge = null;
  }

  private edgeAt(touch: GestureTouch): PhysicalEdge | null {
    const {width} = this.environment.viewportSize();
    for (const physical of this.measured().watched) {
      const inBand =
        physical === 'left'
          ? touch.startX <= this.edgeRegion
          : touch.startX >= width - this.edgeRegion;
      if (inBand) {
        return physical;
      }
    }
    return null;
  }
}
