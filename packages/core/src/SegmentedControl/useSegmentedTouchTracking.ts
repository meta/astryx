// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSegmentedTouchTracking.ts
 * @input The radiogroup element, the selection motion controller and whether
 *   the control is enabled
 * @output useSegmentedTouchTracking (a press of any pointer, landing to
 *   lift, and its ClickWait), and segmentTargetAt, measureSegments and
 *   liftTargetAt, the segment a pointer counts for
 * @position Internal to SegmentedControl; drives useSegmentedSelectionMotion.ts
 *
 * SYNC: When modified, update:
 * - /packages/core/src/SegmentedControl/useSegmentedSelectionMotion.ts
 * - /packages/core/src/SegmentedControl/__tests__/SegmentedControl.interaction.browser.spec.ts
 */

import {useRef, useState, type RefObject} from 'react';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {usePressTracker} from '../gestures/usePressTracker';
import {
  createActionGroupTracker,
  type ActionGroupTarget,
  type ActionGroupTracker,
} from '../hooks/actionGroupTracker';
import {lockSelection} from '../gestures/selectionLock';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {awaitBrowserClick, clickForLift} from '../utils/browserClickWait';
import {
  SEGMENT_SELECTOR,
  type SegmentedSelectionMotion,
} from './useSegmentedSelectionMotion';

/**
 * A tap's click still to come. Until it runs, a focus move the tap causes
 * selects nothing. A key press, the next press or a cancel ends the wait.
 */
export interface ClickWait {
  readonly isAwaiting: () => boolean;
  readonly end: () => void;
}

/** A ref to nothing: hooks given it attach nothing. */
const DETACHED: RefObject<HTMLElement | null> = {current: null};

/** The control's box as measured when the finger landed: viewport px. */
export interface ControlBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A segment as measured when the finger landed: its viewport span, px. */
export interface SegmentSpan {
  readonly element: HTMLElement;
  readonly left: number;
  readonly right: number;
}

/** Every segment of `track`, disabled ones included, measured once. */
export function measureSegments(track: HTMLElement): SegmentSpan[] {
  return Array.from(
    track.querySelectorAll<HTMLElement>(SEGMENT_SELECTOR),
    element => {
      const rect = element.getBoundingClientRect();
      return {element, left: rect.left, right: rect.right};
    },
  );
}

function isDisabled(element: HTMLElement): boolean {
  return (
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  );
}

/**
 * The segment a finger at viewport `x` counts for: the one under it, else the
 * nearest. A gap between two segments splits at its middle, as UIKit's
 * segments share an edge. Past the ends, the end segment counts. The result is
 * null when that segment is disabled.
 */
export function segmentTargetAt(
  x: number,
  segments: ReadonlyArray<SegmentSpan>,
): HTMLElement | null {
  let best: SegmentSpan | null = null;
  let distance = Infinity;
  for (const segment of segments) {
    const d = Math.max(segment.left - x, 0, x - segment.right);
    if (d < distance) {
      distance = d;
      best = segment;
    }
  }
  return best != null && !isDisabled(best.element) ? best.element : null;
}

/**
 * The segment a lift at viewport (`x`, `y`) commits: inside the control's
 * `bounds`, the one `segmentTargetAt` counts it for; outside them, none. A
 * press that slides off cancels, because the control selects rather than
 * toggles: a second press would not undo it.
 */
export function liftTargetAt(
  x: number,
  y: number,
  bounds: ControlBounds,
  segments: ReadonlyArray<SegmentSpan>,
): HTMLElement | null {
  if (
    x < bounds.left ||
    x > bounds.right ||
    y < bounds.top ||
    y > bounds.bottom
  ) {
    return null;
  }
  return segmentTargetAt(x, segments);
}

const NO_BOUNDS: ControlBounds = {left: 0, top: 0, right: -1, bottom: -1};

/**
 * Tracks a press on the control as UIKit's segmented control does. The press
 * tracker reports the press from landing to lift. It never claims the
 * pointer, so a vertical drag still scrolls the page. A horizontal pan
 * carries the lens. It claims the pointer only past its slop, and the lift
 * still ends the press.
 *
 * The lift decides the segment, wherever the press began. Inside the control,
 * the segment under the pointer counts, else the nearest one. Outside the
 * control, nothing counts.
 *
 * A tap gets the browser's own click. A drag gets no click from the browser,
 * so the tracker clicks the segment at the lift. Either way the item's
 * `onClick` runs once and can cancel the selection. A mouse and a pen are
 * tracked as a finger is. Keyboard and assistive technology keep the click.
 */
export function useSegmentedTouchTracking(
  trackRef: RefObject<HTMLElement | null>,
  motion: SegmentedSelectionMotion,
  isEnabled: boolean,
): ClickWait {
  /** The horizontal pan began for this touch: it is a drag, not a tap. */
  const isDraggingRef = useRef(false);
  /** The segments as the finger found them (disabled ones too). */
  const segmentsRef = useRef<SegmentSpan[]>([]);
  /** The control's box as the finger found it: a lift outside it cancels. */
  const boundsRef = useRef<ControlBounds>(NO_BOUNDS);
  const trackerRef = useRef<ActionGroupTracker | null>(null);
  const tracker = (trackerRef.current ??= createActionGroupTracker(() => ({
    roots: () => [trackRef.current],
    itemSelector: SEGMENT_SELECTOR,
    highlightExpansion: 0,
    // The press controller writes the shared press paint on the touched
    // segment, as everywhere under a finger. The tracker paints nothing of its
    // own. A held lens shows the selected face.
    paintsHighlight: false,
    resolveTarget: (
      x: number,
      y: number,
      _targets: ReadonlyArray<ActionGroupTarget>,
    ) => liftTargetAt(x, y, boundsRef.current, segmentsRef.current),
    onActivated: (item, cancelled) => {
      const track = trackRef.current;
      const value = item.dataset.value;
      if (track != null && value != null) {
        motion.clicked(track, value, cancelled);
      }
    },
    swallowsNativeClick: true,
  })));
  /** Click waits still running: an unmount ends them. */
  const pendingClicksRef = useRef<Set<() => void>>(new Set());
  /**
   * A tap lifted and its click has not run. After a direct click, the
   * browser's late copy can still move focus, so the wait then lasts until the
   * next key or press.
   */
  const clickToComeRef = useRef(false);
  const [clickWait] = useState<ClickWait>(() => ({
    isAwaiting: () => clickToComeRef.current,
    end: () => {
      clickToComeRef.current = false;
    },
  }));
  // Ends the tracker's window listeners and any click wait on unmount.
  useIsomorphicLayoutEffect(() => {
    const pendingClicks = pendingClicksRef.current;
    return () => {
      tracker.dispose();
      clickWait.end();
      for (const end of [...pendingClicks]) {
        end();
      }
    };
  }, [tracker, clickWait]);

  // Every pointer type is tracked. A disabled control attaches nothing.
  const attachRef = isEnabled ? trackRef : DETACHED;
  usePressTracker(attachRef, {
    isEnabled: () => isEnabled,
    onControlEvent: (event, touch) => {
      const track = trackRef.current;
      if (track == null) {
        return;
      }
      switch (event) {
        case 'touchDown': {
          clickWait.end();
          isDraggingRef.current = false;
          segmentsRef.current = measureSegments(track);
          const rect = track.getBoundingClientRect();
          boundsRef.current = {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          };
          tracker.begin(touch.x, touch.y);
          motion.begin(track, tracker.beganOn, touch.pointerType === 'touch');
          break;
        }
        case 'touchUpInside':
        case 'touchUpOutside': {
          // The lift decides, wherever the press began. A lift outside the
          // control commits nothing.
          tracker.move(touch.x, touch.y);
          const lifted = tracker.highlighted;
          const isTap =
            event === 'touchUpInside' &&
            !isDraggingRef.current &&
            lifted != null &&
            lifted === tracker.beganOn;
          const value = motion.release(lifted);
          if (value != null && isTap && lifted != null) {
            // A tap: the browser's own click commits it.
            tracker.cancel();
            clickToComeRef.current = true;
            const pending = pendingClicksRef.current;
            const endWait = awaitBrowserClick(lifted, {
              onClicked: isCancelled => {
                pending.delete(endWait);
                clickWait.end();
                motion.clicked(track, value, isCancelled);
              },
              onNoClick: () => {
                pending.delete(endWait);
                motion.clicked(track, value, clickForLift(lifted));
              },
            });
            pending.add(endWait);
          } else if (value != null) {
            // No click comes from the browser for a drag: the segment's own
            // click, inside the lift's event; its onClick may veto it.
            tracker.end();
          } else {
            tracker.cancel();
          }
          break;
        }
        case 'touchCancel':
          clickWait.end();
          tracker.cancel();
          motion.cancel();
          break;
        case 'touchDragInside':
        case 'touchDragOutside':
        case 'touchDragEnter':
        case 'touchDragExit':
          // The horizontal pan carries the lens.
          break;
      }
    },
  });
  useGestureRecognizer(
    attachRef,
    () =>
      new PanGestureRecognizer({
        name: 'segmented-control-drag',
        direction: 'horizontal',
        cancelsTouchesInView: false,
        // No title is selectable under a held finger, as in UIKit. A hold on
        // the track does something: a drag carries the lens and commits where
        // it lifts. So this recognizer brings the lock, and the host turns off
        // text selection and the callout on the track while a finger is down.
        selectionLock: lockSelection,
      }),
    recognizer => {
      if (recognizer.state === 'began') {
        isDraggingRef.current = true;
      }
      if (recognizer.state === 'began' || recognizer.state === 'changed') {
        const {x, y} = recognizer.location();
        // The lens chases the finger, then the tracker moves the highlight.
        motion.drag(x);
        tracker.move(x, y);
      }
    },
    {isEnabled},
  );
  return clickWait;
}
