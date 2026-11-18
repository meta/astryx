// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSegmentedTouchTracking.ts
 * @input The radiogroup element, the selection motion controller and whether
 *   the control is enabled
 * @output useSegmentedTouchTracking (a press of any pointer, landing to
 *   lift, and its ClickWait), and segmentTargetAt, measureSegments,
 *   measureLiftArea and liftTargetAt, the segment a pointer counts for
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
import {HIT_INSET_PROPERTIES, type HitInsets} from '../utils/hitArea';
import {armClickGuard} from '../utils/clickGuard';
import {cancelPress} from '../utils/pressFeedback';
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

/**
 * Whether no segment has a width: the control has no layout, as in a unit
 * test's DOM. A single collapsed segment does not count.
 */
function hasNoLayout(segments: ReadonlyArray<SegmentSpan>): boolean {
  return segments.every(({left, right}) => right - left <= 0);
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
 * The segment a lift at viewport (`x`, `y`) commits: inside any box of the
 * control's lift `area`, the one `segmentTargetAt` counts it for; outside
 * them, none. The tracker counts a held pointer on the control's center line,
 * so a press never lands outside.
 */
export function liftTargetAt(
  x: number,
  y: number,
  area: ReadonlyArray<ControlBounds>,
  segments: ReadonlyArray<SegmentSpan>,
): HTMLElement | null {
  const isInside = area.some(
    box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom,
  );
  return isInside ? segmentTargetAt(x, segments) : null;
}

const NO_AREA: ReadonlyArray<ControlBounds> = [];

/** A measured hit inset on `element`, px (0 when none is written). */
function hitInset(element: HTMLElement, side: keyof HitInsets): number {
  const value = Number.parseFloat(
    element.style.getPropertyValue(HIT_INSET_PROPERTIES[side]),
  );
  return Number.isFinite(value) ? value : 0;
}

/**
 * The boxes a lift may commit in: the control's own box, and each segment's
 * box grown by its own touch hit band (utils/hitArea), so a tap on a band
 * selects its segment. Each band is kept apart: a band a neighbor clamped
 * stays clamped, though another segment's band reaches further. Under a fine
 * pointer no band is written, and the segments sit inside the control's box.
 */
export function measureLiftArea(
  track: HTMLElement,
  segments: ReadonlyArray<SegmentSpan>,
): ReadonlyArray<ControlBounds> {
  const {left, top, right, bottom} = track.getBoundingClientRect();
  return [
    {left, top, right, bottom},
    ...segments.map(({element}) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left - hitInset(element, 'left'),
        top: box.top - hitInset(element, 'top'),
        right: box.right + hitInset(element, 'right'),
        bottom: box.bottom + hitInset(element, 'bottom'),
      };
    }),
  ];
}

/**
 * Tracks a press on the control as UIKit's segmented control does. The press
 * tracker reports the press from landing to lift. It never claims the
 * pointer, so a vertical drag still scrolls the page. A horizontal pan
 * carries the lens. It claims the pointer only past its slop, and the lift
 * still ends the press.
 *
 * The lift decides the segment, wherever the press began. The pointer counts
 * on the control's center line, clamped to its ends, so a drift off the
 * control keeps choosing by its horizontal position. Only a cancel commits
 * nothing: the browser takes the pointer, or Escape. The highlight then
 * returns to the selected segment at once.
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
  /** The press began on the selected segment, so the lens shows it. */
  const isLensPressRef = useRef(false);
  /** Escape cancelled this press: the rest of it changes nothing. */
  const isCancelledRef = useRef(false);
  /** The segments as the finger found them (disabled ones too). */
  const segmentsRef = useRef<SegmentSpan[]>([]);
  /** The lift area as the finger found it. */
  const areaRef = useRef<ReadonlyArray<ControlBounds>>(NO_AREA);
  const trackerRef = useRef<ActionGroupTracker | null>(null);
  const tracker = (trackerRef.current ??= createActionGroupTracker(() => ({
    roots: () => [trackRef.current],
    itemSelector: SEGMENT_SELECTOR,
    highlightExpansion: 0,
    tracksAlong: 'x',
    // The press controller paints the touched segment, as everywhere under a
    // finger. Once a press from another segment drags, the tracker paints the
    // segment it would commit. A held lens shows the selected face instead.
    paintsHighlight: item =>
      isDraggingRef.current &&
      !isLensPressRef.current &&
      item.getAttribute('aria-checked') !== 'true',
    onCancel: () => {
      isCancelledRef.current = true;
      clickWait.end();
      for (const {element} of segmentsRef.current) {
        cancelPress(element);
      }
      motion.cancel();
    },
    resolveTarget: (
      x: number,
      y: number,
      _targets: ReadonlyArray<ActionGroupTarget>,
    ) => liftTargetAt(x, y, areaRef.current, segmentsRef.current),
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
    onHighlightChange: isHighlighted => {
      if (isHighlighted) {
        motion.highlighted();
      }
    },
    onControlEvent: (event, touch) => {
      const track = trackRef.current;
      if (track == null) {
        return;
      }
      switch (event) {
        case 'touchDown': {
          clickWait.end();
          isDraggingRef.current = false;
          isCancelledRef.current = false;
          segmentsRef.current = measureSegments(track);
          areaRef.current = measureLiftArea(track, segmentsRef.current);
          tracker.begin(touch.x, touch.y);
          isLensPressRef.current =
            tracker.beganOn?.getAttribute('aria-checked') === 'true';
          motion.begin(track, tracker.beganOn, touch.pointerType === 'touch');
          break;
        }
        case 'touchUpInside':
        case 'touchUpOutside': {
          if (isCancelledRef.current) {
            // The browser's own click for this lift still comes when it ends
            // on the segment the press began on. The guard takes it.
            armClickGuard(track.ownerDocument);
            break;
          }
          if (hasNoLayout(segmentsRef.current)) {
            // Without layout the lift names no segment. The click on the
            // segment the press reached selects it, as under a fine pointer.
            tracker.cancel();
            motion.cancel();
            break;
          }
          // The lift decides, wherever the press began.
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
      if (isCancelledRef.current) {
        return;
      }
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
