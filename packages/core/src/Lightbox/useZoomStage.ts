// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useZoomStage.ts
 * @input The zoom core (useZoomCore.ts), the stage element ref and the
 *   element the recognizers attach to: the stage, or a gallery's track. Also
 *   whether the gestures and the touch presentation are on, and tap and drag
 *   callbacks
 * @output Exports `useZoomStage`: Lightbox's gestures, those of a zooming
 *   UIScrollView for every pointer, on top of the core, whose API it returns
 * @position Lightbox's gesture module, internal, with one import site
 *   (Lightbox.tsx). It builds on the gesture recognizers and the core's
 *   animator; the geometry is in zoomStage.ts.
 *
 * SYNC: When modified, update useZoomCore.ts, zoomStage.ts, Lightbox.tsx,
 * __tests__/LightboxZoom.interaction.browser.spec.ts and
 * __tests__/LightboxPaging.interaction.browser.spec.ts.
 */

import {useRef, useState, type RefObject} from 'react';
import type {GestureRecognizer} from '../gestures/GestureRecognizer';
import {LongPressGestureRecognizer} from '../gestures/LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {PinchGestureRecognizer} from '../gestures/PinchGestureRecognizer';
import {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';
import type {Point} from '../gestures/types';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {UIKIT_PAN} from '../motion/uikit/gestures';
import {coast as coastCurves} from '../motion/coast';
import {decayRestDistance} from '../motion/decay';
import {
  doubleTapTarget,
  draggedTransform,
  isZoomed,
  overshootScale,
  pinchScaleFor,
  rawForDragged,
  releaseTarget,
  restRange,
  transformKeepingPoint,
  type StagePoint,
  type ZoomGeometry,
  type ZoomTransform,
} from './zoomStage';
import {
  ZOOM_DRAGGING_ATTRIBUTE,
  type ZoomCore,
  type ZoomStage,
} from './useZoomCore';

export {ZOOM_DRAGGING_ATTRIBUTE, type ZoomStage};

export interface UseZoomStageOptions {
  /** The stage: the box the photo is fitted and centred in, clipping it. */
  stageRef: RefObject<HTMLElement | null>;
  /** Where the recognizers attach: the stage by default, a pager's track. */
  surfaceRef?: RefObject<HTMLElement | null>;
  /** The gestures are on (zoom is on), for every pointer. */
  isEnabled: boolean;
  /**
   * A finger's single tap landed off the photo, at this client point. It
   * landed on the stage, or on the surface around it, such as a gallery
   * page's empty strip.
   */
  onTapOutside?: (location: Point) => void;
  /** A pan began (a release over the backdrop must not close). */
  onDragStart?: () => void;
  /**
   * The touch presentation is on. A pan's give past the edges and its coast
   * belong to it. Otherwise a drag or a trackpad's scroll pans 1:1, and it
   * stops at the edges and at the release.
   */
  isTouchPresentation?: boolean;
  /**
   * Whether a pinch, or a two-finger pan, may begin, from the recognizer's
   * tracked touches. False leaves the fingers to the page's zoom.
   */
  shouldBeginPinch?: (recognizer: GestureRecognizer) => boolean;
  /**
   * An outer pager takes a one-finger drag that heads past the zoomed photo's
   * edge. Without one, the pan begins there and gives past the edge.
   */
  hasOuterPager?: boolean;
}

interface PinchSession {
  readonly start: ZoomTransform;
  /** The pinch's own scale the start corresponds to (past a limit, more). */
  readonly startPinchScale: number;
  readonly anchor: StagePoint;
  centroid: StagePoint;
}

interface PanSession {
  /** The pointer-travel transform when the session started. */
  readonly raw: ZoomTransform;
  readonly translation: Point;
  /** It gives past the edges and coasts at the release. */
  readonly hasGive: boolean;
}

const EVERY_POINTER = ['touch', 'pen', 'mouse'] as const;
/** Fingers only: a pen does not pinch. A ctrl-wheel pinches too. */
const PINCH_POINTERS = ['touch'] as const;
/** Fingers only: a mouse's or a pen's double-click is the browser's. */
const DOUBLE_TAP_POINTERS = ['touch'] as const;
/** A mouse's or a pen's click beside the photo is the browser's `click`. */
const TAP_POINTERS = ['touch'] as const;

/**
 * Lightbox's zoom gestures. They take every pointer: a mouse, a pen and a
 * finger alike. The pinch is the fingers', and a ctrl-wheel pinches too. The
 * pan also takes a trackpad's scroll; a mouse wheel's notches never pan. The
 * keyboard is the core's.
 *
 * Tracking writes the photo's `translate` and `scale` once per input event,
 * with no React render and no layout read after a gesture begins. Every
 * release and double tap runs on the compositor as baked keyframes. A press
 * on a moving photo takes it from its presentation value.
 *
 * The recognizers sit on the stage or a gallery's track, as UIScrollView
 * arranges its own.
 * - pinch, with the pan, so two fingers zoom and move at once. A finger left
 *   down after the pinch keeps panning.
 * - pan: one or two fingers, a mouse's or a pen's drag, or a trackpad's
 *   scroll. It moves a zoomed photo. In the touch presentation, its release
 *   carries a scroll view's velocity. With two fingers down it begins when
 *   the pinch may. With one, it begins on a zoomed photo. Where an outer
 *   pager takes the drag, it begins only short of the photo's edge on the
 *   side the drag heads to. UIKit's paging scroll view does the same.
 *   Elsewhere it gives past that edge.
 * - double tap, a finger's: it fills the viewer, at least 2×, and keeps the
 *   point in place. When zoomed it goes back to the fitted size. A mouse's or
 *   a pen's double-click is the browser's `dblclick` (the core's
 *   `doubleClickAt`).
 * - single tap, which waits for a finger's double tap to fail. A tap outside
 *   the photo is reported, and Lightbox closes on it. A mouse's or a pen's
 *   click ends it at once.
 * - a zero-duration press beside them all, UIKit's touch-down idiom. A press
 *   on a moving photo stops it where it shows, and a lift with no drag lets
 *   it settle. It claims only a press on a moving photo, so a still one
 *   leaves the press to an outer pager's own catch.
 *
 * The stage's `touch-action` is the caller's (none while zoom is on), since a
 * disabled recognizer would still claim it.
 *
 * It follows UIKit's measured behavior (motion/uikit/zoomMedia.ts). Inside the
 * limits the zoom follows the pinch 1:1. The content point under the centroid
 * stays under it, past the limits too. No scale momentum follows the lift.
 * Past a limit, the return springs from the pinch's velocity, anchored at
 * the last centroid. In the touch presentation, a zoomed pan coasts and bounces like a
 * scroll view. A two-finger tap does nothing.
 */
export function useZoomStage(
  core: ZoomCore,
  options: UseZoomStageOptions,
): ZoomStage {
  const {
    animator,
    geometryRef,
    measure,
    toStage,
    current,
    write,
    setTarget,
    setZoomed,
    settleTo,
    isMoving,
    isAtEdgeOf,
  } = core;
  const pinchRef = useRef<PinchSession | null>(null);
  const panRef = useRef<PanSession | null>(null);
  /** A touch stopped a moving photo; a pan or pinch has since taken over. */
  const caughtRef = useRef(false);
  const draggedSinceCatchRef = useRef(false);
  /** A pan gives past the edges and coasts only in the touch presentation. */
  const hasGive = () => options.isTouchPresentation === true;

  /**
   * A zoomed pan's release: UIScrollView's coast, bouncing at the edges.
   */
  const coast = (geometry: ZoomGeometry, velocity: Point) => {
    const from = current();
    // Under Reduce Motion too, a coast keeps its momentum and its settle at
    // an edge. That is the person's own movement, and iOS keeps decelerating
    // scrolls under Reduce Motion. The animator's policy leaves `decay` alone.
    const range = restRange(geometry, from.scale);
    const vx = range.x.min === range.x.max ? 0 : velocity.x;
    const vy = range.y.min === range.y.max ? 0 : velocity.y;
    const rest = (value: number, v: number, {min, max}: typeof range.x) =>
      Math.min(max, Math.max(min, value + decayRestDistance(v)));
    setTarget({
      x: rest(from.x, vx, range.x),
      y: rest(from.y, vy, range.y),
      scale: from.scale,
    });
    setZoomed(isZoomed(geometry, from));
    animator.decay(
      coastCurves(animator, {x: vx, y: vy}, {bounds: {x: range.x, y: range.y}}),
    );
  };

  // The pan begins with two fingers down when a pinch may, or on a zoomed
  // photo. Where an outer pager takes the drag, it begins only short of the
  // photo's edge on the side the drag heads to. UIScrollView's pan in a
  // paging scroll view does the same, and the pager takes the rest.
  const panShouldBeginRef = useRef<(pan: PanGestureRecognizer) => boolean>(
    () => true,
  );
  const isMovingRef = useRef(isMoving);
  const pinchShouldBeginRef = useRef<
    (recognizer: GestureRecognizer) => boolean
  >(() => true);
  const {shouldBeginPinch, hasOuterPager = false} = options;
  useIsomorphicLayoutEffect(() => {
    pinchShouldBeginRef.current = shouldBeginPinch ?? (() => true);
    panShouldBeginRef.current = pan => {
      if (pan.numberOfTouches > 1) {
        return pinchShouldBeginRef.current(pan);
      }
      const geometry = measure();
      if (geometry == null || !isZoomed(geometry, current())) {
        return false;
      }
      const {x, y} = pan.totalTranslation();
      return !(
        hasOuterPager &&
        Math.abs(x) >= Math.abs(y) &&
        isAtEdgeOf(geometry, x < 0 ? 'left' : 'right')
      );
    };
    isMovingRef.current = isMoving;
  });

  // Whether a finger began each gesture, read from its first touch as it
  // begins. Under reduced motion a finger's release cross-fades. A mouse's, a
  // trackpad's or a pen's release completes at once where the primary pointer
  // is fine.
  const fingerRef = useRef({pinch: false, catch: false});
  const [recognizers] = useState(() => {
    const pinch = new PinchGestureRecognizer({
      name: 'Lightbox.zoomPinch',
      allowedPointerTypes: PINCH_POINTERS,
      shouldBegin: recognizer => pinchShouldBeginRef.current(recognizer),
    });
    // A zoomed photo is a scroll view: its coast reads the pan's scroll-view
    // release (`scrollVelocity()`), so it coasts as far as UIKit's.
    const pan = new PanGestureRecognizer({
      name: 'Lightbox.zoomPan',
      maximumNumberOfTouches: 2,
      allowedPointerTypes: EVERY_POINTER,
      allowedScrollTypes: ['continuous'],
      shouldBegin: recognizer => panShouldBeginRef.current(recognizer),
      // A mouse's or a pen's drag on a zoomed photo pans from its first move.
      // A finger keeps UIKit's begin threshold, which tells a tap from a pan.
      hysteresis: touch =>
        touch.pointerType !== 'touch' &&
        geometryRef.current != null &&
        isZoomed(geometryRef.current, current())
          ? 0
          : UIKIT_PAN.hysteresis.value,
    });
    // A finger's double tap. A mouse's or a pen's double-click is the
    // browser's `dblclick`, which keeps the system's double-click speed.
    const doubleTap = new TapGestureRecognizer({
      name: 'lightbox-zoom-double-tap',
      numberOfTapsRequired: 2,
      allowedPointerTypes: DOUBLE_TAP_POINTERS,
    });
    const tap = new TapGestureRecognizer({
      name: 'lightbox-zoom-tap',
      allowedPointerTypes: TAP_POINTERS,
    });
    const touchDown = new LongPressGestureRecognizer({
      name: 'lightbox-zoom-touch-down',
      minimumPressDuration: 0,
      allowableMovement: Number.POSITIVE_INFINITY,
      cancelsTouchesInView: false,
      delaysTouchesEnded: false,
      allowedPointerTypes: EVERY_POINTER,
      // Only a moving photo is caught, so a still one leaves the touch to
      // everyone else (an outer pager's own catch).
      shouldBegin: () => isMovingRef.current(),
    });
    pinch.recognizeSimultaneouslyWith(pan);
    tap.requireToFail(doubleTap);
    for (const other of [pinch, pan, doubleTap, tap]) {
      touchDown.recognizeSimultaneouslyWith(other);
    }
    return {pinch, pan, doubleTap, tap, touchDown};
  });

  const recognizerOptions = {isEnabled: options.isEnabled, manageStyle: false};
  const surfaceRef = options.surfaceRef ?? options.stageRef;

  useGestureRecognizer(
    surfaceRef,
    () => recognizers.pinch,
    pinch => {
      if (pinch.state === 'began') {
        fingerRef.current.pinch =
          pinch.trackedTouches[0]?.pointerType === 'touch';
        const geometry = measure();
        if (geometry == null) {
          return;
        }
        draggedSinceCatchRef.current = true;
        animator.stop();
        const start = current();
        const anchor = toStage(pinch.focalPoint());
        pinchRef.current = {
          start,
          startPinchScale: pinchScaleFor(geometry, start.scale),
          anchor,
          centroid: anchor,
        };
      }
      const session = pinchRef.current;
      const geometry = geometryRef.current;
      const isMoving = pinch.state === 'began' || pinch.state === 'changed';
      if (!isMoving) {
        // The session ends with the pinch, even one that outlived its photo:
        // a session left behind would block every later pan.
        pinchRef.current = null;
      }
      if (session == null || geometry == null) {
        return;
      }
      if (isMoving) {
        session.centroid = toStage(pinch.focalPoint());
        const shown = overshootScale(
          geometry,
          session.startPinchScale * pinch.scale,
        );
        write(
          transformKeepingPoint(
            geometry,
            session.start,
            session.anchor,
            session.centroid,
            shown,
          ),
        );
        return;
      }
      // Ended (a finger lifted) or cancelled (the browser took the touches).
      const shown = current();
      const target = releaseTarget(geometry, shown, session.centroid);
      if (target !== shown) {
        // Past a limit: the return springs from the photo's scale velocity
        // at the lift, anchored at the last centroid. A finger still down
        // rests until it lands again.
        panRef.current = null;
        // The photo's scale per second at the lift: the pinch's, through the
        // give past the limit. A cancelled pinch starts the return at rest.
        const raw = session.startPinchScale * pinch.scale;
        const step = raw * 1e-4;
        const give =
          (overshootScale(geometry, raw + step) -
            overshootScale(geometry, raw - step)) /
          (2 * step);
        settleTo(geometry, target, {
          touchRelease: fingerRef.current.pinch,
          scaleVelocity:
            pinch.state === 'ended'
              ? give * session.startPinchScale * pinch.velocity
              : 0,
        });
        return;
      }
      const pan = recognizers.pan;
      if (pan.state === 'began' || pan.state === 'changed') {
        // The finger left down keeps panning from here, without a jump.
        const give = hasGive();
        panRef.current = {
          raw: rawForDragged(geometry, shown),
          translation: give ? pan.translation() : pan.totalTranslation(),
          hasGive: give,
        };
        setZoomed(isZoomed(geometry, shown));
        return;
      }
      coast(geometry, {x: 0, y: 0});
    },
    recognizerOptions,
  );

  useGestureRecognizer(
    surfaceRef,
    () => recognizers.pan,
    pan => {
      const stage = options.stageRef.current;
      if (pan.state === 'began') {
        const geometry = measure();
        if (geometry == null) {
          return;
        }
        draggedSinceCatchRef.current = true;
        animator.stop();
        options.onDragStart?.();
        const shown = current();
        if (isZoomed(geometry, shown)) {
          stage?.setAttribute(ZOOM_DRAGGING_ATTRIBUTE, '');
        }
        // The translation already leaves out the begin threshold's travel,
        // and what the finger moved past it shows at once, as in UIKit.
        // Without give, the photo follows the pointer's whole travel from the
        // press, so it catches up the threshold's travel at once.
        panRef.current = {
          raw: rawForDragged(geometry, shown),
          translation: {x: 0, y: 0},
          hasGive: hasGive(),
        };
      }
      if (pan.state === 'began' || pan.state === 'changed') {
        const session = panRef.current;
        const geometry = geometryRef.current;
        if (pinchRef.current != null || session == null || geometry == null) {
          return;
        }
        const translation = session.hasGive
          ? pan.translation()
          : pan.totalTranslation();
        const raw = {
          x: session.raw.x + translation.x - session.translation.x,
          y: session.raw.y + translation.y - session.translation.y,
          scale: session.raw.scale,
        };
        if (session.hasGive) {
          write(draggedTransform(geometry, raw));
          return;
        }
        const range = restRange(geometry, raw.scale);
        write({
          x: Math.min(range.x.max, Math.max(range.x.min, raw.x)),
          y: Math.min(range.y.max, Math.max(range.y.min, raw.y)),
          scale: raw.scale,
        });
        return;
      }
      stage?.removeAttribute(ZOOM_DRAGGING_ATTRIBUTE);
      const session = panRef.current;
      panRef.current = null;
      const geometry = geometryRef.current;
      if (pinchRef.current != null || session == null || geometry == null) {
        return;
      }
      // The release carries the shared filter's velocity at the lift: a scroll
      // view's, at rest after a silent hold.
      coast(
        geometry,
        pan.state === 'ended' && session.hasGive
          ? pan.scrollVelocity()
          : {x: 0, y: 0},
      );
    },
    recognizerOptions,
  );

  useGestureRecognizer(
    surfaceRef,
    () => recognizers.touchDown,
    touchDown => {
      if (touchDown.state === 'began') {
        fingerRef.current.catch =
          touchDown.trackedTouches[0]?.pointerType === 'touch';
        // It only begins on a moving photo: stopped where it shows, at the
        // presentation value from the curve.
        draggedSinceCatchRef.current = false;
        caughtRef.current = true;
        const shown = current();
        animator.stop();
        setTarget(shown);
        return;
      }
      if (touchDown.state === 'changed') {
        return;
      }
      // Lifted, or taken. With no drag since the catch, the photo settles from
      // where it was stopped. It goes back inside the stage, or back to a zoom
      // limit it passed.
      const caught = caughtRef.current;
      caughtRef.current = false;
      const geometry = geometryRef.current ?? measure();
      if (!caught || draggedSinceCatchRef.current || geometry == null) {
        return;
      }
      const shown = current();
      const limit = releaseTarget(geometry, shown, {
        x: geometry.width / 2,
        y: geometry.height / 2,
      });
      if (limit !== shown) {
        settleTo(geometry, limit, {
          touchRelease: fingerRef.current.catch,
        });
        return;
      }
      coast(geometry, {x: 0, y: 0});
    },
    recognizerOptions,
  );

  useGestureRecognizer(
    surfaceRef,
    () => recognizers.doubleTap,
    doubleTap => {
      if (doubleTap.state !== 'ended') {
        return;
      }
      const geometry = measure();
      if (geometry == null) {
        return;
      }
      // A finger's double tap fills the viewer, at least 2×, and keeps the
      // tapped point in place. It plays the same spring as every zoom, from
      // rest.
      const point = toStage(doubleTap.location());
      settleTo(geometry, doubleTapTarget(geometry, current(), point));
    },
    recognizerOptions,
  );

  useGestureRecognizer(
    surfaceRef,
    () => recognizers.tap,
    tap => {
      if (tap.state !== 'ended') {
        return;
      }
      const geometry = measure();
      if (geometry == null) {
        return;
      }
      const point = toStage(tap.location());
      const {x, y, scale} = current();
      const left = geometry.fit.x + x;
      const top = geometry.fit.y + y;
      const onPhoto =
        point.x >= left &&
        point.x <= left + geometry.fit.width * scale &&
        point.y >= top &&
        point.y <= top + geometry.fit.height * scale;
      if (!onPhoto) {
        options.onTapOutside?.(tap.location());
      }
    },
    recognizerOptions,
  );

  return core.api;
}
