// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAlertMotion.ts
 * @input Whether the alert is open, whether it runs the touch motion, the
 *   motion animator, the theme's timing tokens and the layer runtime's input
 *   hold (Layer/inputHold)
 * @output Exports useAlertMotion and AlertMotion: when the Dialog is presented
 *   (it stays open while the alert leaves), and the callback ref that puts
 *   the animators and the input hold on the dialog
 * @position Internal hook of AlertDialog: the touch presentation's motion
 *
 * SYNC: When modified, update useAlertMotion.test.tsx and
 * __tests__/AlertDialog.motion.interaction.browser.spec.ts
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  createMotionEngine,
  type Animator,
  type MotionCurve,
  type MotionHandle,
} from '../motion/animator';
import {mapProgress, mapRange} from '../motion/progress';
import {
  easedProgress,
  readThemeTiming,
  type ThemeTimingTokens,
} from '../motion/themeTiming';
import {holdInput} from '../Layer/inputHold';

/**
 * The presentation plays the theme's entrance easing over its duration step
 * for UIKit's measured 404 ms alert present. A tap opens an alert, and a tap
 * has no velocity, so no spring plays.
 */
const ALERT_ENTRANCE_TOKENS: ThemeTimingTokens = {
  duration: '--duration-medium-max',
  easing: '--ease-entrance',
};

/** The dismissal plays the exit duration and easing that every overlay shares. */
const ALERT_EXIT_TOKENS: ThemeTimingTokens = {
  duration: '--duration-exit',
  easing: '--ease-exit',
};

/** iOS's alert starts at 1.2 times its size. */
const PRESENT_SCALE_FROM = 1.2;

/** A dialog that misses its exit's end still closes this long after it. */
const EXIT_BACKSTOP_MS = 100;

/** A theme timing that does not resolve plays no motion. */
function timingOn(
  element: Element | null,
  tokens: ThemeTimingTokens,
): MotionCurve {
  return (
    (element == null ? null : readThemeTiming(element, tokens)) ??
    easedProgress(0, x => x)
  );
}

/**
 * The 1.2 start, never wider than the viewport: a wide alert would otherwise
 * start past the screen's edges. One layout read, as the alert opens.
 */
function presentScaleFrom(element: HTMLElement | null): number {
  const width = element?.offsetWidth ?? 0;
  const viewport = element?.ownerDocument.documentElement.clientWidth ?? 0;
  return width > 0 && viewport > 0
    ? Math.max(1, Math.min(PRESENT_SCALE_FROM, viewport / width))
    : PRESENT_SCALE_FROM;
}

function between(progress: MotionCurve, from: number, to: number): MotionCurve {
  // Unclamped, so an easing that overshoots carries the value with it.
  return mapProgress(progress, mapRange([0, 1], [from, to], {clamp: false}));
}

/**
 * Fades the alert and its dimming to `opacity` from the values on screen, on
 * `progress`. The scale keeps its own curve if it still moves.
 */
function fadeFromHere(
  panel: Animator,
  backdrop: Animator,
  opacity: number,
  progress: MotionCurve,
): MotionHandle {
  backdrop.play({opacity: between(progress, backdrop.get('opacity'), opacity)});
  return panel.play({
    opacity: between(progress, panel.get('opacity'), opacity),
  });
}

/**
 * Presents the alert and its dimming from their start values on one curve.
 * From rest and with no start time, the browser starts both at the frame that
 * commits them, the frame that first shows the dialog. Under reduced motion
 * the animator plays its own opacity-only cross-fade instead.
 */
function present(
  panel: Animator,
  backdrop: Animator,
  scaleFrom: number,
  progress: MotionCurve,
): MotionHandle {
  const handle = panel.play({
    opacity: between(progress, 0, 1),
    scale: between(progress, scaleFrom, 1),
  });
  backdrop.play({opacity: between(progress, 0, 1)});
  return handle;
}

type Status = 'hidden' | 'open' | 'leaving';

export interface AlertMotionOptions {
  /** The caller's open state. */
  isOpen: boolean;
  /** Run the touch motion (under a finger: a coarse primary pointer). */
  isEnabled: boolean;
}

export interface AlertMotion {
  /** Whether the Dialog is open: true while the alert is shown or leaving. */
  readonly isPresented: boolean;
  /** True while the motion drives the dialog (its theme entrance is off). */
  readonly isDriving: boolean;
  /** Callback ref for the dialog element. */
  readonly ref: (element: HTMLElement | null) => void;
}

export function useAlertMotion({
  isOpen,
  isEnabled,
}: AlertMotionOptions): AlertMotion {
  // The alert stays presented while it leaves. This is set during render, so
  // the Dialog never commits a close before the exit ends.
  const [isLeaving, setIsLeaving] = useState(false);
  const [lastIsOpen, setLastIsOpen] = useState(isOpen);
  if (lastIsOpen !== isOpen) {
    setLastIsOpen(isOpen);
    setIsLeaving(!isOpen && isEnabled);
  }
  const isPresented = isOpen || isLeaving;

  const [animators] = useState(() => ({
    panel: createMotionEngine(null),
    backdrop: createMotionEngine(null, {
      pseudoElement: '::backdrop',
      base: {opacity: 1},
    }),
  }));
  // Whether the motion drives the dialog, as of the last commit.
  const isEnabledRef = useRef(isEnabled);

  // The animators hold the dialog only while the motion drives it, so a mouse
  // presentation keeps its own styles. The callback is stable, so a caller's
  // changing ref does not attach them again on every render.
  const elementRef = useRef<HTMLElement | null>(null);
  const ref = useCallback(
    (node: HTMLElement | null) => {
      elementRef.current = node;
      const target = isEnabledRef.current ? node : null;
      animators.panel.attach(target);
      animators.backdrop.attach(target);
    },
    [animators],
  );
  // Effect: syncs the motion animators' element with the pointer that drives
  // the alert. A finger attaches them, and a mouse gets the dialog back at rest.
  useIsomorphicLayoutEffect(() => {
    isEnabledRef.current = isEnabled;
    const {panel, backdrop} = animators;
    if (isEnabled) {
      panel.attach(elementRef.current);
      backdrop.attach(elementRef.current);
      return;
    }
    // A mouse took over from a finger: the theme's styles show again.
    if (panel.element != null) {
      panel.set({opacity: 1, scale: 1});
      backdrop.set({opacity: 1});
    }
    panel.attach(null);
    backdrop.attach(null);
  }, [animators, isEnabled]);

  // Hidden even when mounted open, so a first render that is open presents
  // like any other opening.
  const statusRef = useRef<Status>('hidden');
  // Only the exit in flight may hide the dialog when it ends.
  const exitRef = useRef<MotionHandle | null>(null);
  const exitMsRef = useRef(0);
  const releaseHoldRef = useRef<(() => void) | null>(null);
  // The action that the dismissal's hold took focus from. A reopen during the
  // exit gives focus back to it.
  const blurredByDismissalRef = useRef<HTMLElement | null>(null);
  // Effect: releases the input hold on the dialog at unmount, so the alert
  // goes at once. The alert counts as hidden again, because StrictMode runs
  // every cleanup once and then every effect: the replay must present it
  // again and place its hold.
  useEffect(
    () => () => {
      releaseHoldRef.current?.();
      releaseHoldRef.current = null;
      statusRef.current = 'hidden';
      exitRef.current = null;
      blurredByDismissalRef.current = null;
    },
    [],
  );

  // Effect: syncs the dialog's animations and its input hold with the alert's
  // state: hidden, open or leaving.
  useEffect(() => {
    const was = statusRef.current;
    const now: Status = !isPresented ? 'hidden' : isOpen ? 'open' : 'leaving';
    statusRef.current = now;
    if (!isEnabled || was === now) {
      return;
    }
    const {panel, backdrop} = animators;
    const element = elementRef.current;
    // One hold at a time on the alert: a new transition replaces the last.
    const hold = (until: PromiseLike<unknown>, scope: 'viewport' | 'layer') => {
      releaseHoldRef.current?.();
      releaseHoldRef.current =
        element == null ? null : holdInput(element, {until, scope});
    };
    if (now === 'open' && was === 'hidden') {
      // The Dialog opened its modal in this flush, before this effect, and
      // nothing has painted it yet. A finger's or a pen's input waits until
      // the alert has entered. Keys and assistive technology stay live.
      const scaleFrom = presentScaleFrom(element);
      panel.set({opacity: 0, scale: scaleFrom});
      backdrop.set({opacity: 0});
      const handle = present(
        panel,
        backdrop,
        scaleFrom,
        timingOn(element, ALERT_ENTRANCE_TOKENS),
      );
      hold(handle.finished, 'viewport');
      return;
    }
    if (now === 'open' && was === 'leaving') {
      // Reopened during the exit: it fades back from where it is.
      exitRef.current = null;
      const handle = fadeFromHere(
        panel,
        backdrop,
        1,
        timingOn(element, ALERT_ENTRANCE_TOKENS),
      );
      hold(handle.finished, 'viewport');
      // The dismissal's hold is released and the content is live again. The
      // action it took focus from gets focus back, unless focus went
      // somewhere else meanwhile.
      const blurred = blurredByDismissalRef.current;
      blurredByDismissalRef.current = null;
      const doc = element?.ownerDocument;
      if (
        blurred?.isConnected === true &&
        doc != null &&
        (doc.activeElement == null || doc.activeElement === doc.body)
      ) {
        blurred.focus({preventScroll: true});
      }
      return;
    }
    if (now === 'leaving') {
      // During the dismissal no input reaches the alert: its content is inert
      // and the hold's shield catches every touch.
      const progress = timingOn(element, ALERT_EXIT_TOKENS);
      exitMsRef.current = progress.duration * 1000;
      const handle = fadeFromHere(panel, backdrop, 0, progress);
      const focused = element?.ownerDocument.activeElement;
      blurredByDismissalRef.current =
        focused instanceof HTMLElement &&
        focused !== element &&
        element?.contains(focused) === true
          ? focused
          : null;
      hold(handle.finished, 'layer');
      exitRef.current = handle;
      void handle.finished.then(isDone => {
        if (isDone && exitRef.current === handle) {
          exitRef.current = null;
          setIsLeaving(false);
        }
      });
      return;
    }
    // Hidden: the exit ended and the Dialog closed its modal.
    exitRef.current = null;
    blurredByDismissalRef.current = null;
    releaseHoldRef.current?.();
    releaseHoldRef.current = null;
  }, [animators, isEnabled, isOpen, isPresented]);

  // Effect: a timer that hides the dialog once the exit has had its time,
  // when the exit's end is never reported (animations off, a detached
  // element). An unmount during the exit removes the dialog at once, and the
  // ref detaches the animators.
  useEffect(() => {
    if (!isLeaving) {
      return;
    }
    const backstop = setTimeout(() => {
      exitRef.current = null;
      setIsLeaving(false);
    }, exitMsRef.current + EXIT_BACKSTOP_MS);
    return () => clearTimeout(backstop);
  }, [isLeaving]);

  return {isPresented, isDriving: isEnabled, ref};
}
