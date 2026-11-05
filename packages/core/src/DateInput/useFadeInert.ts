// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file useFadeInert.ts
 * @input Whether the month/year wheels are open, and the two panels the
 *   month/year toggle cross-fades (the calendar and the wheels)
 * @output Exports `useFadeInert`: which panel is `inert`, whether the
 *   toggle's cross-fade runs, and the toggle's focus hand-off
 * @position Internal hook of TouchDateField.tsx and TouchDateTimeField.tsx
 *
 * Under a finger, the panels swap `inert` when the outgoing panel's exit
 * ends. With a mouse they swap it with the toggle. The toggle's handler calls
 * `followFocus`, so focus leaves the outgoing panel in the toggle's commit.
 */

import {useCallback, useRef, useState, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The properties that carry a panel's exit. The layer on top fades its
 * `opacity`. The layer beneath holds `visibility` as long, then takes `hidden`.
 */
const EXIT_PROPERTIES = new Set(['opacity', 'visibility']);

/** Whether the panel's own exit transition is running. */
function isExiting(element: Element): boolean {
  if (typeof element.getAnimations !== 'function') {
    return false;
  }
  return element
    .getAnimations()
    .some(animation =>
      EXIT_PROPERTIES.has(
        (animation as {transitionProperty?: string}).transitionProperty ?? '',
      ),
    );
}

/**
 * `inert` is inherited, so flipping it restyles a panel's whole subtree;
 * here both flips wait for the cross-fade to end, when nothing on screen
 * moves. Meanwhile the caller's `aria-hidden` keeps assistive technology out
 * of the outgoing panel. The caller's shield keeps touches off both, as a
 * UIKit view animation does.
 */
export function useFadeInert(
  isWheelOpen: boolean,
  calendarRef: RefObject<HTMLElement | null>,
  wheelsRef: RefObject<HTMLElement | null>,
  /**
   * Under a finger: wait for the fade. With a mouse the panels swap `inert`
   * with the toggle, so a click right after it lands.
   */
  isDeferred: boolean,
): {
  isCalendarInert: boolean;
  isWheelsInert: boolean;
  isFading: boolean;
  followFocus: (next: boolean) => void;
} {
  // `settled`: the toggle state whose exit has ended. `focusedFor`: the
  // toggle state whose incoming panel took focus, and so is live early.
  const [{settled, focusedFor}, setFade] = useState<{
    settled: boolean;
    focusedFor: boolean | null;
  }>({settled: isWheelOpen, focusedFor: null});
  // With a mouse the panels swap `inert` with the toggle. So `settled`
  // follows `isWheelOpen` during render, React's pattern for state that
  // tracks a prop, and the toggle costs one commit.
  if (!isDeferred && settled !== isWheelOpen) {
    setFade({settled: isWheelOpen, focusedFor: null});
  }
  const isFading = settled !== isWheelOpen;

  // Synchronizes with the outgoing panel's exit: the swap of `inert` lands on
  // its end. Nothing here reads style in the toggle's commit, which would
  // resolve the fade's start there. The exit's own events end it. Two frames
  // later, a panel with no exit running settles at once.
  useIsomorphicLayoutEffect(() => {
    if (!isFading) {
      return;
    }
    const outgoing = (isWheelOpen ? calendarRef : wheelsRef).current;
    if (outgoing == null || typeof outgoing.getAnimations !== 'function') {
      // With no outgoing panel, or no Web Animations, no exit can run.
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- whether an exit can run is known only from the committed panel (its Web Animations support), which render cannot read
      setFade({settled: isWheelOpen, focusedFor: null});
      return;
    }
    const incoming = (isWheelOpen ? wheelsRef : calendarRef).current;
    const panels = [outgoing, incoming].filter(
      (panel): panel is HTMLElement => panel != null,
    );
    let frame = 0;
    // One frame after the cross-fade's end, so the restyle lands after its
    // last frame is on screen rather than holding that frame back.
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setFade({settled: isWheelOpen, focusedFor: null}),
      );
    };
    // The cross-fade ends when either panel's own transition ends. The layer
    // beneath may have none: it stays visible, covered.
    const onEnd = (event: Event) => {
      if (
        panels.includes(event.target as HTMLElement) &&
        EXIT_PROPERTIES.has((event as TransitionEvent).propertyName)
      ) {
        settle();
      }
    };
    for (const panel of panels) {
      panel.addEventListener('transitionend', onEnd);
      panel.addEventListener('transitioncancel', onEnd);
    }
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (!panels.some(isExiting)) {
          // No transition runs on either panel (one is not rendered, say).
          setFade({settled: isWheelOpen, focusedFor: null});
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      for (const panel of panels) {
        panel.removeEventListener('transitionend', onEnd);
        panel.removeEventListener('transitioncancel', onEnd);
      }
    };
  }, [isFading, isWheelOpen, calendarRef, wheelsRef]);

  const pendingFocusRef = useRef<HTMLElement | null>(null);
  /**
   * The toggle's event handler calls this before it changes the state, with
   * the state it sets. Focus inside the outgoing panel then moves to the
   * incoming one in the toggle's commit, never staying in a fading panel.
   */
  const followFocus = useCallback(
    (next: boolean) => {
      const outgoing = (next ? calendarRef : wheelsRef).current;
      const incoming = (next ? wheelsRef : calendarRef).current;
      const active = outgoing?.ownerDocument.activeElement ?? null;
      if (
        outgoing == null ||
        incoming == null ||
        active == null ||
        !outgoing.contains(active)
      ) {
        return;
      }
      pendingFocusRef.current = incoming;
      // The incoming panel goes live with the toggle: focus cannot land in an
      // inert one.
      setFade(fade => ({...fade, focusedFor: next}));
    },
    [calendarRef, wheelsRef],
  );
  // Synchronizes with the document's focus: the incoming panel takes it once
  // it is live.
  useIsomorphicLayoutEffect(() => {
    const incoming = pendingFocusRef.current;
    if (incoming == null || incoming.inert) {
      return;
    }
    pendingFocusRef.current = null;
    const target = incoming.querySelector<HTMLElement>(FOCUSABLE) ?? incoming;
    target.focus({preventScroll: true});
  });

  if (!isDeferred) {
    return {
      isCalendarInert: isWheelOpen,
      isWheelsInert: !isWheelOpen,
      isFading: false,
      followFocus,
    };
  }
  const isIncomingLive = isFading && focusedFor === isWheelOpen;
  return {
    isCalendarInert: isFading
      ? settled && !(isIncomingLive && !isWheelOpen)
      : isWheelOpen,
    isWheelsInert: isFading
      ? !settled && !(isIncomingLive && isWheelOpen)
      : !isWheelOpen,
    isFading,
    followFocus,
  };
}
