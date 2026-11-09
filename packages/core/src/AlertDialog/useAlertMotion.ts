// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAlertMotion.ts
 * @input Uses React, the settled-open and hydration hooks, the Layer input
 *   hold and modal outlet registry, the alert's exit copy, alertController,
 *   utils/focusReturn and utils/nodeType
 * @output Exports useAlertMotion, AlertMotion, AlertMotionOptions, AlertLook
 *   and SCALE_FROM_PROPERTY
 * @position Internal hook of AlertDialog; the touch presentation's motion.
 *   AlertDialog's styles play it on the theme's dialog entrance and exit.
 *
 * SYNC: When modified, update useAlertMotion.test.tsx and
 * __tests__/AlertDialog.motion.interaction.browser.spec.ts
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {useIsHydrating} from '../hooks/useIsHydrating';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useSettledOpen} from '../hooks/useSettledOpen';
import {holdInput} from '../Layer/inputHold';
import type {TakenLayerExitCopy} from '../Layer/layerExitCopy';
import {notifyTopLayerEntry} from '../Layer/modalOutlet';
import {alertController} from '../motion/uikit/alert';
import {
  clearAlertClosing,
  fadeAlertClosing,
  holdAlertClosing,
} from '../privateAttributes/alertClosing.stylex';
import {takeAlertExitCopy} from '../privateAttributes/alertExit.stylex';
import {returnFocusForLastInput} from '../utils/focusReturn';
import {isHTMLElement} from '../utils/nodeType';

/**
 * A fade whose end is never reported still ends this long after its length,
 * counted from its start.
 */
const EXIT_BACKSTOP_MS = 100;

/**
 * If no frame has started the fade this long after the close, the fade starts
 * then. A hidden page gets no frames, so the backstop ends its close.
 */
const EXIT_START_LIMIT_MS = 1000;

/** One frame at 60 Hz, ms. */
const FRAME_MS = 1000 / 60;

/** Carries the presentation's starting scale to AlertDialog's keyframes. */
export const SCALE_FROM_PROPERTY = '--_alert-scale-from';

/**
 * UIKit's 1.2 start, never wider than the viewport: an alert wider than
 * UIKit's 320 pt would otherwise start past the screen's edges. One layout
 * read, as the alert opens.
 */
function presentScaleFrom(element: HTMLElement): number {
  const {scaleFrom} = alertController.present;
  const width = element.offsetWidth;
  const viewport = element.ownerDocument.documentElement.clientWidth;
  return width > 0 && viewport > 0
    ? Math.max(1, Math.min(scaleFrom, viewport / width))
    : scaleFrom;
}

/** When the last of `animations` ends, in ms from its start; 0 for none. */
function lengthOf(animations: ReadonlyArray<Animation>): number {
  return Math.max(
    0,
    ...animations.map(animation =>
      Number(animation.effect?.getComputedTiming().endTime ?? 0),
    ),
  );
}

/** Settles when every animation has ended or was cancelled. */
async function allEnded(animations: ReadonlyArray<Animation>): Promise<void> {
  await Promise.all(
    animations.map(async animation =>
      animation.finished.catch(() => animation),
    ),
  );
}

/** The touch style the alert takes: its entrance, or settled when it opens at rest. */
export type AlertLook = 'none' | 'entrance' | 'settled';

export interface AlertMotionOptions {
  /** The caller's open state. */
  isOpen: boolean;
  /** Take UIKit's look (under a finger: a coarse primary pointer). */
  isEnabled: boolean;
  /** The exit copy's inline style, which plays its fade. */
  exitCopyStyle: Readonly<Record<string, string>>;
}

export interface AlertMotion {
  /** Which touch style AlertDialog applies. */
  readonly look: AlertLook;
  /** Callback ref for the dialog element. */
  readonly ref: (element: HTMLElement | null) => void;
  /**
   * For a LayoutChangeSnapshot of the open state: takes the exit copy in the
   * commit that closes the alert, before that commit changes the DOM.
   */
  readonly beforeOpenChange: (wasOpen: boolean) => void;
}

/**
 * Plays the alert's touch motion. Under a finger the alert closes in the
 * commit that closes it, and a copy of it fades out with the dimming. Until
 * the fade ends the page is inert and its input is held.
 */
export function useAlertMotion({
  isOpen,
  isEnabled,
  exitCopyStyle,
}: AlertMotionOptions): AlertMotion {
  const [isReopened, setIsReopened] = useState(false);
  const [lastIsOpen, setLastIsOpen] = useState(isOpen);
  if (lastIsOpen !== isOpen) {
    setLastIsOpen(isOpen);
    setIsReopened(false);
  }
  // An alert open in the server markup was there on page load: after
  // hydration it opens at rest, as Dialog does, and later opens enter.
  const isHydrating = useIsHydrating();
  const [settledOpen] = useSettledOpen(isOpen, isOpen && !isHydrating, false);
  const look: AlertLook = !isEnabled
    ? 'none'
    : isReopened || (settledOpen && isOpen)
      ? 'settled'
      : 'entrance';

  const elementRef = useRef<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
  }, []);

  // What had focus as the alert opened, and in the alert as it closed.
  const openerRef = useRef<HTMLElement | null>(null);
  const blurredRef = useRef<HTMLElement | null>(null);
  // The exit copy, from the commit that closes the alert to its layout effect.
  const exitCopyRef = useRef<TakenLayerExitCopy | null>(null);
  // Whether a reopen cut the last fade short.
  const isCutShortRef = useRef(false);

  const wasOpenRef = useRef(false);
  // Synchronizes the dialog's touch entrance with an opening: its start
  // scale. Dialog styles an open dialog in this commit, before its effect
  // shows the modal. So the box and the entrance exist before the first
  // paint. A reopen that cut the fade short opens at rest instead.
  useIsomorphicLayoutEffect(() => {
    const opened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    const element = elementRef.current;
    if (!opened || element == null) {
      return;
    }
    // Dialog moves focus into the alert in a later effect.
    const focused = element.ownerDocument.activeElement;
    openerRef.current = isHTMLElement(focused) ? focused : null;
    const wasCutShort = isCutShortRef.current;
    isCutShortRef.current = false;
    if (!isEnabled) {
      return;
    }
    if (wasCutShort) {
      setIsReopened(true);
      return;
    }
    element.style.setProperty(
      SCALE_FROM_PROPERTY,
      String(presentScaleFrom(element)),
    );
  }, [isEnabled, isOpen]);

  // Dialog shows only an open dialog, so the copy is taken before the close
  // commit changes the DOM. The page's style is still clean then, so the
  // copy's reads cost no style recalc. Its writes go to the copy alone, which
  // stays out of the document until the layout effect places it.
  const beforeOpenChange = useCallback(
    (wasOpen: boolean) => {
      const element = elementRef.current;
      if (element == null) {
        return;
      }
      if (!wasOpen) {
        clearAlertClosing(element);
        return;
      }
      if (!isEnabled) {
        return;
      }
      const focused = element.ownerDocument.activeElement;
      blurredRef.current =
        isHTMLElement(focused) &&
        focused !== element &&
        element.contains(focused)
          ? focused
          : null;
      // Held first, so the copy's own reads apply the hold while the dimming
      // still shows. The copy keeps it until its fade starts.
      holdAlertClosing(element);
      const taken = takeAlertExitCopy(element);
      if (taken == null) {
        return;
      }
      for (const [property, value] of Object.entries(exitCopyStyle)) {
        taken.copy.style.setProperty(property, value);
      }
      // The fade waits at its start until a frame has shown the copy.
      taken.copy.style.setProperty('animation-play-state', 'paused');
      exitCopyRef.current = taken;
    },
    [exitCopyStyle, isEnabled],
  );

  // Synchronizes the page with the exit copy's fade. The Dialog closed in
  // this commit, and a toast it held went back to the page. Until the fade
  // ends the page is inert, global hosts such as the toast viewport aside,
  // and the hold's shield takes every press. Then focus returns to the
  // opener. The fade's end runs no render: it only lets go.
  useIsomorphicLayoutEffect(() => {
    const taken = exitCopyRef.current;
    exitCopyRef.current = null;
    const element = elementRef.current;
    if (isOpen || taken == null || element == null) {
      return;
    }
    const {copy} = taken;
    const doc = element.ownerDocument;
    // The page's writes come first: the hold's marks and shield, then the
    // copy, then the toast back on top. The copy then takes its style once,
    // and the fade's one read costs one recalc for all of them. The opener
    // goes inert before Dialog's passive close effect runs. Its focus return
    // and the browser's then reach an inert opener and do nothing, so focus
    // stays off the page.
    let resolveEnded = () => {};
    const ended = new Promise<void>(resolve => {
      resolveEnded = resolve;
    });
    const release = holdInput(doc.body, {until: ended, scope: 'layer'});
    taken.place();
    notifyTopLayerEntry();
    const fade =
      typeof copy.getAnimations === 'function'
        ? copy.getAnimations({subtree: true})
        : [];
    const length = lengthOf(fade);
    if (length <= 0) {
      // An exit of 0 ms, which a theme may set: the close is immediate, and
      // Dialog returns focus as it closes.
      release();
      copy.remove();
      resolveEnded();
      return;
    }
    const opener = openerRef.current;
    const returnFocus = () => {
      const active = doc.activeElement;
      if (
        opener?.isConnected === true &&
        (active == null || active === doc.body)
      ) {
        returnFocusForLastInput(opener);
      }
    };
    let isPlaying = true;
    let isStarted = false;
    const view = doc.defaultView;
    let startFrame = 0;
    // When the first frame that shows the copy runs its callbacks.
    let shownAt = 0;
    let startLimit: ReturnType<typeof setTimeout> | undefined = undefined;
    let backstop: ReturnType<typeof setTimeout> | undefined = undefined;
    const stop = () => {
      isPlaying = false;
      view?.cancelAnimationFrame(startFrame);
      clearTimeout(startLimit);
      clearTimeout(backstop);
      release();
      copy.remove();
    };
    const end = () => {
      if (isPlaying) {
        stop();
        returnFocus();
      }
    };
    void ended.then(end);
    const play = () => {
      if (isStarted) {
        return;
      }
      isStarted = true;
      view?.cancelAnimationFrame(startFrame);
      clearTimeout(startLimit);
      copy.style.removeProperty('animation-play-state');
      fadeAlertClosing(copy);
      // The dimming's fade starts only now, so the end waits for it too.
      const playing = copy.getAnimations({subtree: true});
      if (view != null) {
        // The frame that first showed the copy showed the fade's start, so
        // the fade counts from that frame. It counts from at most one frame
        // ago, read from the clock: after a main-thread block, a frame's time
        // is old.
        const start = Math.max(shownAt, view.performance.now() - FRAME_MS);
        for (const animation of playing) {
          animation.startTime = start;
        }
      }
      void Promise.all([allEnded(fade), allEnded(playing)]).then(resolveEnded);
      // A fade whose end is never reported (a page that disables animations)
      // still ends once its length has passed, counted from its start.
      backstop = setTimeout(end, length + EXIT_BACKSTOP_MS);
    };
    // The fade waits until a frame has shown the copy at rest, which is the
    // fade's start on screen, and plays from the next frame. WebKit can start
    // a new layer's animation before the layer's first paint, and a busy
    // frame then skips into the fade. The dimming has no animation until
    // then. WebKit applies a change to a dimming's inherited play state late,
    // but a change to its mark at once.
    if (view == null) {
      play();
    } else {
      startLimit = setTimeout(play, EXIT_START_LIMIT_MS);
      startFrame = view.requestAnimationFrame(() => {
        shownAt = view.performance.now();
        startFrame = view.requestAnimationFrame(play);
      });
    }
    return () => {
      isCutShortRef.current = isPlaying;
      if (isPlaying) {
        stop();
        // After the commit: a reopen has moved focus into the alert by then,
        // and an unmount leaves it on the page.
        queueMicrotask(returnFocus);
      }
    };
  }, [isOpen]);

  // Synchronizes focus with a reopen that cut the fade short. The action that
  // had focus as the alert closed takes it back from Dialog's initial focus,
  // unless focus has moved out of the alert since.
  useEffect(() => {
    if (!isReopened) {
      return;
    }
    const blurred = blurredRef.current;
    blurredRef.current = null;
    const element = elementRef.current;
    if (blurred?.isConnected !== true || element == null) {
      return;
    }
    const doc = blurred.ownerDocument;
    const active = doc.activeElement;
    if (active == null || active === doc.body || element.contains(active)) {
      blurred.focus({preventScroll: true});
    }
  }, [isReopened]);

  return {look, ref, beforeOpenChange};
}
