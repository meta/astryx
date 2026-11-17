// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file browserClickWait.ts
 * @input An element a tap's lift released on, and the control that acts on
 *   its click
 * @output BROWSER_CLICK_WAIT_MS, awaitBrowserClick, clickForLift and
 *   clickAndReport
 * @position The one wait for the browser's click after a tap, shared by
 *   Switch/useSwitchTouch.ts and SegmentedControl/useSegmentedTouchTracking.ts.
 *   It swallows nothing: utils/clickGuard.ts is the one guard for a late click.
 *
 * SYNC: When modified, update browserClickWait.test.ts.
 */

import {armClickGuard, withoutClickGuard} from './clickGuard';
import {subscribeInput} from './inputStream';

/**
 * How long a tap's lift waits for the browser's own click, ms. The browser
 * sends that click with the lift when the page has no double-tap delay. The
 * wait runs out for a lift that the browser does not count as a click, such
 * as a hold. It also runs out when a busy main thread holds the click back.
 */
export const BROWSER_CLICK_WAIT_MS = 300;

/** What a control does when the browser's click comes, or does not. */
export interface BrowserClickWaitHandlers {
  /** The browser's click ran its handlers. `isCancelled`: one cancelled it. */
  readonly onClicked: (isCancelled: boolean) => void;
  /** No browser click came in time. */
  readonly onNoClick: () => void;
}

/**
 * Waits for the browser's own click inside `target` after a tap's lift. That
 * click is the activation: `onClicked` runs once its handlers have run. With
 * no click in time, `onNoClick` runs. The returned call ends the wait at once
 * and leaves no listener or timer behind.
 */
export function awaitBrowserClick(
  target: Element,
  {onClicked, onNoClick}: BrowserClickWaitHandlers,
): () => void {
  const view = target.ownerDocument.defaultView;
  if (view == null) {
    // A document with no window gets no click: the wait runs out at once.
    let isEnded = false;
    queueMicrotask(() => {
      if (!isEnded) {
        onNoClick();
      }
    });
    return () => {
      isEnded = true;
    };
  }
  let isDone = false;
  let report: number | null = null;
  let timer: number | null = null;
  let stopListening: (() => void) | null = null;
  const stop = () => {
    isDone = true;
    stopListening?.();
    stopListening = null;
    if (timer != null) {
      view.clearTimeout(timer);
      timer = null;
    }
  };
  stopListening = subscribeInput(view, 'click', event => {
    if (
      isDone ||
      !event.isTrusted ||
      !target.contains(event.target as Node | null)
    ) {
      return;
    }
    stop();
    // After every handler has run: was it cancelled?
    report = view.setTimeout(() => {
      report = null;
      onClicked(event.defaultPrevented);
    }, 0);
  });
  timer = view.setTimeout(() => {
    if (isDone) {
      return;
    }
    stop();
    onNoClick();
  }, BROWSER_CLICK_WAIT_MS);
  return () => {
    stop();
    if (report != null) {
      view.clearTimeout(report);
      report = null;
    }
  };
}

/**
 * Click `element` (its own `click()`, so its activation behavior and every
 * handler run as for any click) and report whether a handler cancelled it.
 * The event is read from a capture listener that exists only for the call.
 */
export function clickAndReport(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  let clicked: Event | null = null;
  const grab = (event: Event) => {
    if (clicked == null && event.target === element) {
      clicked = event;
    }
  };
  view?.addEventListener('click', grab, true);
  try {
    element.click();
  } finally {
    view?.removeEventListener('click', grab, true);
  }
  return (clicked as Event | null)?.defaultPrevented === true;
}

/**
 * Clicks `element` for a lift the control decided itself, and reports
 * whether a handler cancelled the click. The shared click guard swallows the
 * browser's own click for the same lift, if it comes later, so the lift
 * activates once.
 */
export function clickForLift(element: HTMLElement): boolean {
  armClickGuard(element.ownerDocument);
  return withoutClickGuard(() => clickAndReport(element));
}
