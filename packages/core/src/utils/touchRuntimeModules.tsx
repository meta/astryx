// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchRuntimeModules.tsx
 * @input The shared touch modules: the animator, and the touch parts of
 *   SegmentedControl, Switch, Toast, Popover, action groups, Lightbox's
 *   pager and zoom, and the date and time wheels, which use the animator and
 *   the gesture host
 * @output `touchRuntime`, the one object the touch loader publishes
 * @position Loaded only through `import()` in utils/touchRuntime.ts. No
 *   other module imports this file
 */

import {useEffect, useRef, type RefObject} from 'react';
import {animatorFor, createMotionEngine} from '../motion/animator';
import {lockSelection} from '../gestures/selectionLock';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useCommittedRefInto} from '../hooks/useCommittedRef';
import {
  useSegmentedSelectionMotion,
  type SegmentedSelection,
} from '../SegmentedControl/useSegmentedSelectionMotion';
import {
  useSwitchTouch,
  type SwitchTouchOptions,
  type SwitchTouchParts,
} from '../Switch/useSwitchTouch';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {createPopoverSurfaceMotion} from '../Popover/popoverSurfaceMotion';
import type {ToastSwipeClaimProps} from '../Toast/useToastGesture';
import {
  useActionGroupTracking,
  type ActionGroupTrackingOptions,
} from '../hooks/useActionGroupTracking';
import {usePager, type UsePagerOptions} from '../hooks/usePager';
import {
  useSliderTouch,
  type UseSliderTouchOptions,
} from '../Slider/useSliderTouch';
import {usePressTracker} from '../gestures/usePressTracker';
import {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';
import {useZoomCore, type UseZoomCoreOptions} from '../Lightbox/useZoomCore';
import {
  useZoomStage,
  type UseZoomStageOptions,
  type ZoomStageWithTouch,
} from '../Lightbox/useZoomStage';

interface SegmentedMotionProps {
  readonly trackRef: RefObject<HTMLElement | null>;
  readonly value: string;
  readonly isPresenting: boolean;
  readonly isTracking: boolean;
  /** Holds the motion's selection state while this part is mounted. */
  readonly selectionRef: RefObject<SegmentedSelection | null>;
}

/**
 * SegmentedControl's selection motion and press tracking. It renders
 * nothing. It mounts once the runtime has loaded, so the first press it
 * tracks is the first one after the load.
 */
function SegmentedMotion({
  trackRef,
  value,
  isPresenting,
  isTracking,
  selectionRef,
}: SegmentedMotionProps): null {
  const {selection, attachTrack} = useSegmentedSelectionMotion(
    trackRef,
    value,
    isPresenting,
    isTracking,
  );
  // Syncs the motion's animators with the radiogroup node.
  useIsomorphicLayoutEffect(() => {
    const detach = attachTrack(trackRef.current);
    return typeof detach === 'function' ? detach : undefined;
  }, [attachTrack, trackRef]);
  useCommittedRefInto(selectionRef, selection);
  return null;
}

interface SwitchTouchProps {
  readonly parts: SwitchTouchParts;
  readonly options: SwitchTouchOptions;
}

/**
 * Switch's touch presentation: the thumb drag and its springs. It renders
 * nothing. It mounts once the runtime has loaded.
 */
function SwitchTouch({parts, options}: SwitchTouchProps): null {
  useSwitchTouch(parts, options);
  return null;
}

/**
 * A toast's claim on a finger's touch: the gesture host's one-way pan, which
 * claims the touch and never begins. It renders nothing. It mounts once the
 * runtime has loaded, so the first touch it claims is the first one after
 * the load.
 */
function ToastSwipeClaim({
  rootRef,
  direction,
  isEnabled,
  shouldReceive,
  onClaim,
}: ToastSwipeClaimProps): null {
  const shouldReceiveRef = useRef(shouldReceive);
  // Syncs the pan's touch filter with the toast's newest one.
  useIsomorphicLayoutEffect(() => {
    shouldReceiveRef.current = shouldReceive;
  });
  const claim = useGestureRecognizer(
    rootRef,
    () =>
      new PanGestureRecognizer({
        name: 'toast-swipe',
        direction: direction === 1 ? 'down' : 'up',
        firstMoveDecides: true,
        maximumNumberOfTouches: 1,
        hysteresis: Number.POSITIVE_INFINITY,
        cancelsTouchesInView: false,
        shouldReceiveTouch: (_recognizer, touch) =>
          touch.pointerType === 'touch' &&
          shouldReceiveRef.current(touch.target as EventTarget),
      }),
    undefined,
    {isEnabled, manageStyle: false},
  );
  // Syncs the gesture host's pan with the edge this toast dismisses toward.
  useEffect(() => {
    claim.setDirection(direction === 1 ? 'down' : 'up');
  }, [claim, direction]);
  // Syncs the toast's swipe with this part's pan.
  useIsomorphicLayoutEffect(() => {
    onClaim(claim);
    return () => onClaim(null);
  }, [claim, onClaim]);
  return null;
}

interface ActionGroupTrackingProps {
  readonly groupRef: RefObject<HTMLElement | null>;
  readonly options: ActionGroupTrackingOptions;
}

/**
 * An action group's press tracking: a held finger or pen slides across its
 * actions. It renders nothing. It mounts once the runtime has loaded, so the
 * first press it tracks is the first one after the load.
 */
function ActionGroupTracking({
  groupRef,
  options,
}: ActionGroupTrackingProps): null {
  useActionGroupTracking(groupRef, options);
  return null;
}

/**
 * Lightbox's pager: it drags and springs the gallery's track between pages.
 * It renders nothing. It mounts once the runtime has loaded and takes the
 * track from the page it rests on.
 */
function LightboxPager(options: UsePagerOptions): null {
  usePager(options);
  return null;
}

interface LightboxTouchProps {
  readonly zoom: UseZoomCoreOptions;
  readonly stage: UseZoomStageOptions;
  /** Holds the zoom stage while this part is mounted. */
  readonly stageRef: RefObject<ZoomStageWithTouch | null>;
  /** The current item's content, which the stage zooms. */
  readonly contentElementRef: RefObject<HTMLElement | null>;
  readonly captionToggleRef: RefObject<HTMLElement | null>;
  /** A finger's tap on a gallery's stage without zoom. */
  readonly backdropTap: {
    readonly targetRef: RefObject<HTMLElement | null>;
    readonly isEnabled: boolean;
    readonly onTap: (x: number, y: number) => void;
  };
}

/**
 * Lightbox's zoom stage and touch gestures: zoom for every pointer and the
 * keyboard, the drag to dismiss, a finger's tap beside the media, and the
 * caption toggle's press feedback. It renders nothing. It mounts once the
 * runtime has loaded, also in a Lightbox that is already open.
 */
function LightboxTouch({
  zoom: zoomOptions,
  stage: stageOptions,
  stageRef,
  contentElementRef,
  captionToggleRef,
  backdropTap,
}: LightboxTouchProps): null {
  const zoom = useZoomCore(zoomOptions);
  const stage = useZoomStage(zoom, stageOptions);
  useCommittedRefInto(stageRef, stage);
  const {contentRef} = stage;
  // Syncs the stage with the content the Lightbox already shows.
  useIsomorphicLayoutEffect(() => {
    contentRef(contentElementRef.current);
  }, [contentRef, contentElementRef]);
  usePressTracker(captionToggleRef);
  const onTapRef = useRef(backdropTap.onTap);
  useCommittedRefInto(onTapRef, backdropTap.onTap);
  useGestureRecognizer(
    backdropTap.targetRef,
    () =>
      new TapGestureRecognizer({
        name: 'lightbox-backdrop-tap',
        allowedPointerTypes: ['touch'],
      }),
    tap => {
      if (tap.state === 'ended') {
        const {x, y} = tap.location();
        onTapRef.current(x, y);
      }
    },
    {isEnabled: backdropTap.isEnabled, manageStyle: false},
  );
  return null;
}

interface WheelGesturesProps {
  readonly columnRef: RefObject<HTMLElement | null>;
  readonly isActive: boolean;
  /** A touch landed on the wheel, at its event time. */
  readonly onTouchDown: (time: number) => void;
  readonly onPan: (pan: PanGestureRecognizer) => void;
  /** The pan failed: a touch that never dragged lifted. */
  readonly onPanFailed: () => void;
  readonly onTap: (tap: TapGestureRecognizer) => void;
}

/**
 * A date or time wheel's drag, catch and tap: a finger or a trackpad turns the
 * rows, and a tap on a row turns the wheel onto it. It renders nothing. It
 * mounts once the runtime has loaded, so the first touch it tracks is the
 * first one after the load.
 */
function WheelGestures({
  columnRef,
  isActive,
  onTouchDown,
  onPan,
  onPanFailed,
  onTap,
}: WheelGesturesProps): null {
  const handlersRef = useRef({onTouchDown, onPan, onPanFailed, onTap});
  useCommittedRefInto(handlersRef, {onTouchDown, onPan, onPanFailed, onTap});
  const pan = useGestureRecognizer(
    columnRef,
    () =>
      new PanGestureRecognizer({
        name: 'wheel-pan',
        direction: 'vertical',
        // A trackpad's two-finger scroll drives the pan as a finger does. A
        // mouse wheel's notches never reach the pan.
        allowedScrollTypes: ['continuous'],
        // A held finger on the wheel never starts text selection or the
        // callout.
        selectionLock: lockSelection,
        shouldReceiveTouch: (_pan, touch) => {
          handlersRef.current.onTouchDown(touch.time);
          return true;
        },
      }),
    recognizer => handlersRef.current.onPan(recognizer),
    {isEnabled: isActive},
  );
  // Syncs the wheel's catch with the pan's failure.
  useEffect(
    () =>
      pan.addTransitionListener((_pan, _from, to) => {
        if (to === 'failed') {
          handlersRef.current.onPanFailed();
        }
      }),
    [pan],
  );
  useGestureRecognizer(
    columnRef,
    () => new TapGestureRecognizer({name: 'wheel-tap'}),
    recognizer => handlersRef.current.onTap(recognizer),
    {isEnabled: isActive},
  );
  return null;
}

/**
 * A Slider's touch tracking: the thumbs' pans, the track's tap, the lift and
 * the coast. It renders nothing. It mounts once the runtime has loaded, so
 * the first press it tracks is the first one after the load.
 */
function SliderTouch(options: UseSliderTouchOptions): null {
  useSliderTouch(options);
  return null;
}

/** What the touch loader publishes once the page has loaded it. */
export const touchRuntime = {
  ActionGroupTracking,
  animatorFor,
  createMotionEngine,
  createPopoverSurfaceMotion,
  LightboxPager,
  LightboxTouch,
  SegmentedMotion,
  SliderTouch,
  SwitchTouch,
  ToastSwipeClaim,
  WheelGestures,
} as const;

export type TouchRuntime = typeof touchRuntime;
