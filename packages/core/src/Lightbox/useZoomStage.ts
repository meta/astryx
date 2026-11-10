// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useZoomStage.ts
 * @input The zoom core (useZoomCore.ts), the stage element ref and the
 *   element the recognizers attach to: the stage, or a gallery's track. Also
 *   whether the gestures and the touch presentation are on, the current
 *   item's key, the drag to close, and tap and drag callbacks
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

import {useMemo, useRef, useState, type RefObject} from 'react';
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
import {resolveMotion} from '../motion/resolveMotion';
import {springs} from '../motion/uikit/springs';
import {zoomMedia} from '../motion/uikit/zoomMedia';
import {
  IDENTITY,
  dismissCommits,
  dismissExitY,
  dismissTransform,
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

/**
 * Set on the stage while a drag to dismiss moves the photo, until it settles.
 * A stage that only hugs the photo then lets the moved photo draw outside it.
 */
export const ZOOM_DISMISSING_ATTRIBUTE = 'data-zoom-dismissing';

export interface UseZoomStageOptions {
  /** The stage: the box the photo is fitted and centred in, clipping it. */
  stageRef: RefObject<HTMLElement | null>;
  /** Where the recognizers attach: the stage by default, a pager's track. */
  surfaceRef?: RefObject<HTMLElement | null>;
  /** The gestures are on (zoom is on), for every pointer. */
  isEnabled: boolean;
  /** Changes when another item shows: a drag to dismiss in progress ends. */
  itemKey: unknown;
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
  /** Drag to dismiss, as Photos has it; none without. */
  dismiss?: ZoomStageDismiss;
}

/**
 * Photos' drag to dismiss. A one-finger drag that starts downward on a photo
 * at its fitted size carries it. Its centre follows the finger, and it
 * shrinks with the travel. The release dismisses or springs back. The owner
 * fades its backdrop and controls by the travel and closes once the photo
 * has left.
 */
export interface ZoomStageDismiss {
  /** Whether a drag can dismiss now (an image, in the touch presentation). */
  isEnabled: boolean;
  /** Each move of the drag: its downward travel, pt. */
  onDrag: (travel: number) => void;
  /**
   * The release: whether it dismisses, so the photo leaves, or springs back,
   * and whether a finger released it. Under reduced motion a finger's
   * release cross-fades. A mouse's, a trackpad's or a pen's cross-fades on a
   * coarse primary pointer.
   */
  onRelease: (dismisses: boolean, touch: boolean) => void;
  /** The dismissed photo has left the stage. */
  onDismissed: () => void;
}

/** The touch layer's additions to the core's API. */
export interface ZoomStageWithTouch extends ZoomStage {
  /** A dismissed photo back at its fitted size at once (the viewer opens again). */
  reset(): void;
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
 * - with `dismiss`, a pan that begins only downward on a photo at its fitted
 *   size: Photos' drag to dismiss. One finger, a mouse's or a pen's drag, or
 *   a trackpad's scroll drives it. The photo's centre follows the pointer, and
 *   it shrinks by the travel. A release moving up, or back at the start,
 *   springs back on `springs.settle`. Any other sends it on down on the
 *   dismissal's measured spring and reports it once it has left. A dismissed
 *   photo is not caught.
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
): ZoomStageWithTouch {
  const {
    animator,
    geometryRef,
    targetRef,
    measure,
    toStage,
    current,
    write,
    setTarget,
    setZoomed,
    setAtFit,
    settleTo,
    isMoving,
    isAtEdgeOf,
  } = core;
  const pinchRef = useRef<PinchSession | null>(null);
  const panRef = useRef<PanSession | null>(null);
  /** A drag to dismiss in progress: the geometry it started from. */
  const dismissRef = useRef<ZoomGeometry | null>(null);
  /** A dismissed photo is leaving: nothing catches it. */
  const leavingRef = useRef(false);
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
  // A drag to dismiss starts downward on a photo at its fitted size.
  const dismissShouldBeginRef = useRef<(pan: PanGestureRecognizer) => boolean>(
    () => false,
  );
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
    isMovingRef.current = () => !leavingRef.current && isMoving();
    dismissShouldBeginRef.current = pan => {
      if (options.dismiss?.isEnabled !== true || leavingRef.current) {
        return false;
      }
      // Where the photo is going: one zooming in is not dismissed.
      const geometry = measure();
      if (geometry == null || isZoomed(geometry, targetRef.current)) {
        return false;
      }
      const {x, y} = pan.totalTranslation();
      return y > 0 && y >= Math.abs(x);
    };
  });

  // Whether a finger began each gesture, read from its first touch as it
  // begins. Under reduced motion a finger's release cross-fades. A mouse's, a
  // trackpad's or a pen's release completes at once where the primary pointer
  // is fine.
  const fingerRef = useRef({pinch: false, catch: false, dismiss: false});
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
    const dismissPan = new PanGestureRecognizer({
      name: 'Lightbox.dismissPan',
      maximumNumberOfTouches: 1,
      allowedPointerTypes: EVERY_POINTER,
      allowedScrollTypes: ['continuous'],
      shouldBegin: recognizer => dismissShouldBeginRef.current(recognizer),
    });
    pinch.recognizeSimultaneouslyWith(pan);
    tap.requireToFail(doubleTap);
    for (const other of [pinch, pan, doubleTap, tap, dismissPan]) {
      touchDown.recognizeSimultaneouslyWith(other);
    }
    return {pinch, pan, doubleTap, tap, touchDown, dismissPan};
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

  useGestureRecognizer(
    surfaceRef,
    () => recognizers.dismissPan,
    pan => {
      const dismiss = options.dismiss;
      if (pan.state === 'began') {
        fingerRef.current.dismiss =
          pan.trackedTouches[0]?.pointerType === 'touch';
        const geometry = measure();
        if (geometry == null || dismiss == null) {
          return;
        }
        animator.stop();
        options.onDragStart?.();
        dismissRef.current = geometry;
        options.stageRef.current?.setAttribute(ZOOM_DISMISSING_ATTRIBUTE, '');
      }
      const geometry = dismissRef.current;
      if (geometry == null) {
        return;
      }
      const translation = pan.translation();
      if (pan.state === 'began' || pan.state === 'changed') {
        write(dismissTransform(geometry, translation.x, translation.y));
        dismiss?.onDrag(Math.max(0, translation.y));
        return;
      }
      // Ended or cancelled.
      dismissRef.current = null;
      // The release rule and the motion read the shared filter's velocity at
      // the lift, at rest after a silent hold.
      const velocity = pan.velocity();
      const dismisses =
        pan.state === 'ended' && dismissCommits(translation.y, velocity.y);
      dismiss?.onRelease(dismisses, fingerRef.current.dismiss);
      const shown = current();
      if (dismisses) {
        leavingRef.current = true;
        // No thumbnail to return to, so straight on down on the dismissal's
        // position spring, from the release velocity, until it leaves the
        // screen. A stage that only hugs the photo sits above its bottom. The
        // screen's bottom is in stage px, from the pan's first measure.
        const view = options.stageRef.current?.ownerDocument.defaultView;
        const y = dismissExitY(
          geometry,
          shown,
          view != null
            ? toStage({x: 0, y: view.innerHeight}).y
            : geometry.height,
        );
        setTarget({...shown, y});
        const handle = animator.animate(
          {x: shown.x, y},
          {
            spring: zoomMedia.dismiss.dismissPositionSpring,
            velocity: {x: velocity.x, y: velocity.y},
          },
          {crossfadeAs: 'exit', touchRelease: fingerRef.current.dismiss},
        );
        void handle.finished.then(() => {
          if (leavingRef.current) {
            dismiss?.onDismissed();
          }
        });
        return;
      }
      setTarget(IDENTITY);
      // A cancelled drag's return is not an exit, so it plays the shared
      // settle spring, read where the stage is, from the release velocity.
      const settle = resolveMotion(options.stageRef.current, springs.settle);
      const position = animator.animate(
        {x: 0, y: 0},
        {spring: settle, velocity: {x: velocity.x, y: velocity.y}},
        {touchRelease: fingerRef.current.dismiss},
      );
      const size = animator.animate(
        {scale: 1},
        {spring: settle},
        {touchRelease: fingerRef.current.dismiss},
      );
      // Back in its box: the stage clips again, unless another drag began,
      // and the photo is at its fitted size again once both springs land.
      void Promise.all([position.finished, size.finished]).then(
        ([moved, sized]) => {
          if (dismissRef.current == null && !leavingRef.current) {
            options.stageRef.current?.removeAttribute(
              ZOOM_DISMISSING_ATTRIBUTE,
            );
            if (moved && sized) {
              setAtFit(true);
            }
          }
        },
      );
    },
    {isEnabled: options.dismiss?.isEnabled === true, manageStyle: false},
  );

  // Another item: a drag to dismiss in progress ends, and the stage clips its
  // photo again. The core puts the photo back at the fitted size.
  const {stageRef} = options;
  useIsomorphicLayoutEffect(() => {
    dismissRef.current = null;
    leavingRef.current = false;
    stageRef.current?.removeAttribute(ZOOM_DISMISSING_ATTRIBUTE);
  }, [options.itemKey, stageRef]);

  const api = core.api;
  return useMemo(
    () => ({
      ...api,
      reset: () => {
        if (!leavingRef.current) {
          return;
        }
        leavingRef.current = false;
        dismissRef.current = null;
        animator.stop();
        animator.set({x: 0, y: 0, scale: 1, opacity: 1});
        setTarget(IDENTITY);
        setAtFit(true);
        stageRef.current?.removeAttribute(ZOOM_DISMISSING_ATTRIBUTE);
      },
    }),
    [animator, api, setAtFit, setTarget, stageRef],
  );
}
