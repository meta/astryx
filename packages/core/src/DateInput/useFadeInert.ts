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

import {useCallback, useEffect, useRef, useState, type RefObject} from 'react';
import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

/** A month grid's tab stop: one day in each pane that has one. */
const TAB_STOP = '[tabindex="0"]';

/**
 * The tab stop of the month in view. The mouse calendar gives every mounted
 * month a tab stop, and the months beside the shown one sit outside the
 * panel's box.
 */
function shownTabStop(panel: HTMLElement): HTMLElement | null {
  const box = panel.getBoundingClientRect();
  const stops = panel.querySelectorAll<HTMLElement>(TAB_STOP);
  for (const stop of stops) {
    const rect = stop.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
      return stop;
    }
  }
  return stops[0] ?? null;
}

/**
 * Frames the hand-off tries for before it gives up: about half a second,
 * longer than the toggle's fade.
 */
const FOCUS_FRAMES = 30;

/**
 * The properties that carry a panel's exit. The layer on top fades its
 * `opacity`. The layer beneath holds `visibility` as long, then takes `hidden`.
 */
const EXIT_PROPERTIES = new Set(['opacity', 'visibility']);

/** Whether a transition of `property` runs on the element itself. */
function isRunning(element: Element, property: string): boolean {
  if (typeof element.getAnimations !== 'function') {
    return false;
  }
  return element
    .getAnimations()
    .some(
      animation =>
        animation.playState === 'running' &&
        (animation as {transitionProperty?: string}).transitionProperty ===
          property,
    );
}

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
    // beneath may have none: it stays visible, covered. Only a transition
    // that runs after the toggle counts. One already running ends on its own
    // clock. The wheels' warm-up turns their `visibility` on, and a toggle
    // soon after would otherwise settle at its end.
    const started = new Set<string>();
    const keyOf = (event: Event) => {
      const index = panels.indexOf(event.target as HTMLElement);
      const property = (event as TransitionEvent).propertyName;
      return index >= 0 && EXIT_PROPERTIES.has(property)
        ? `${index}:${property}`
        : null;
    };
    const onRun = (event: Event) => {
      const key = keyOf(event);
      if (key != null) {
        started.add(key);
      }
    };
    // A cancel whose property runs again at once is a replacement, not an
    // end: the replacement's own end ends the fade.
    const isReplaced = (event: Event) =>
      event.type === 'transitioncancel' &&
      isRunning(
        event.target as Element,
        (event as TransitionEvent).propertyName,
      );
    const onEnd = (event: Event) => {
      const key = keyOf(event);
      if (key != null && started.has(key) && !isReplaced(event)) {
        settle();
      }
    };
    for (const panel of panels) {
      panel.addEventListener('transitionrun', onRun);
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
        panel.removeEventListener('transitionrun', onRun);
        panel.removeEventListener('transitionend', onEnd);
        panel.removeEventListener('transitioncancel', onEnd);
      }
    };
  }, [isFading, isWheelOpen, calendarRef, wheelsRef]);

  // The incoming panel, and the element that held focus at the hand-off.
  const pendingFocusRef = useRef<{incoming: HTMLElement; from: Element} | null>(
    null,
  );
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
      pendingFocusRef.current = {incoming, from: active};
      // The incoming panel goes live with the toggle: focus cannot land in an
      // inert one.
      setFade(fade => ({...fade, focusedFor: next}));
    },
    [calendarRef, wheelsRef],
  );
  const focusFrameRef = useRef(0);
  // Synchronizes with the document's focus: the incoming panel takes it once
  // it is live and can take focus. A panel that a `visibility` transition
  // shows takes focus only once that transition starts, so it retries.
  useIsomorphicLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending == null || pending.incoming.inert) {
      return;
    }
    pendingFocusRef.current = null;
    const {incoming, from} = pending;
    const target =
      shownTabStop(incoming) ??
      incoming.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      incoming;
    cancelAnimationFrame(focusFrameRef.current);
    let frames = 0;
    const tryFocus = () => {
      const document = target.ownerDocument;
      target.focus({preventScroll: true});
      frames += 1;
      // It retries only while focus is still where the hand-off found it, or
      // has fallen to the page. A tap or Tab elsewhere ends the hand-off.
      const active = document.activeElement;
      const isWaiting =
        active == null || active === document.body || active === from;
      if (isWaiting && target.isConnected && frames < FOCUS_FRAMES) {
        focusFrameRef.current = requestAnimationFrame(tryFocus);
      }
    };
    tryFocus();
  });
  // Synchronizes with the frame clock: a pending retry ends with the hook.
  useEffect(() => () => cancelAnimationFrame(focusFrameRef.current), []);

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
