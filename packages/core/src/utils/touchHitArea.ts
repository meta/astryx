// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchHitArea.ts
 * @input Whether an element takes taps, the window's input stream and the
 *   geometry of utils/hitArea.ts
 * @output `useTouchHitArea`, a callback ref that gives a tap on its element's
 *   touch band to another target when the finger is on that target's box
 * @position Core-internal hook for the coarse-only 44 px target. The band is
 *   CSS (`touchHitAreaStyles`, internal/touchHitArea.stylex.ts). This module
 *   reads layout only at a tap's click: the pressed control, and what lies
 *   under the finger when the finger is outside the control's box. It keeps no
 *   state in module scope, so copies of Core share nothing here.
 *
 * SYNC: When modified, update internal/touchHitArea.stylex.ts and
 * touchHitArea.test.tsx.
 */

import {useCallback, type RefCallback} from 'react';
import {INTERACTIVE_SELECTOR} from './hitArea';
import {subscribeInput} from './inputStream';
import {isElement} from './nodeType';

/** How a host's band relates to its content. */
export interface TouchHitAreaOptions {
  /**
   * Whether a press that the browser hit-tests onto a descendant is the
   * element's, whatever lies under the finger. Leave it on for a host that draws
   * the band on itself and whose content can paint past its box, such as a
   * list row with a swipe panel. Turn it off for a host whose band is on a
   * descendant, such as Button's content wrapper or Switch's grown input.
   * @default true
   */
  readonly ownsDescendantTouches?: boolean;
}

const NO_OPTIONS: TouchHitAreaOptions = {};

/** For a host whose band is on a descendant. */
export const BAND_ON_DESCENDANT: TouchHitAreaOptions = {
  ownsDescendantTouches: false,
};

/** Whether `candidate` is the host, part of it, or its own label. */
function isOwn(host: Element, candidate: Element): boolean {
  if (candidate.contains(host) || host.contains(candidate)) {
    return true;
  }
  const control = (candidate as HTMLLabelElement).control;
  return control != null && host.contains(control);
}

/** Whether `element`'s own box holds the point (x, y). */
function contains(element: Element, x: number, y: number): boolean {
  const box = element.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/**
 * The other target whose visible box is under the finger at (x, y), or null.
 * A visible box under the finger wins; the band only claims empty space. It
 * reads the host's box, and only when the press is outside it, the elements
 * under the finger, up to the host's own container: what paints below that,
 * such as the page under a layer, is not beside the host. One layout flush
 * serves every read.
 */
function targetUnderFinger(
  host: Element,
  x: number,
  y: number,
): HTMLElement | null {
  if (contains(host, x, y)) {
    return null;
  }
  for (const element of host.ownerDocument.elementsFromPoint?.(x, y) ?? []) {
    if (host.contains(element)) {
      continue;
    }
    if (element.contains(host)) {
      return null;
    }
    // The browser also lists an element whose band, not its box, is under
    // the finger.
    const target = element.closest(INTERACTIVE_SELECTOR);
    if (target != null && !isOwn(host, target) && contains(target, x, y)) {
      return target as HTMLElement;
    }
  }
  return null;
}

/**
 * Checks each finger's tap on `host` until the returned function runs. The
 * press notes where the finger landed and reads nothing, so a scroll that it
 * starts never waits. When the tap began on the band over another target's
 * visible box, its click goes to that target, as it does without the band. A
 * keyboard or assistive-technology click (detail 0) goes through.
 */
function checkTaps(host: Element, ownsDescendantTouches: boolean): () => void {
  const view = host.ownerDocument.defaultView;
  if (view == null) {
    return () => {};
  }
  let endPress: (() => void) | null = null;
  const stopPresses = subscribeInput(view, 'pointerdown', press => {
    const {target, clientX, clientY} = press;
    if (
      press.pointerType !== 'touch' ||
      !isElement(target) ||
      !host.contains(target) ||
      (ownsDescendantTouches && target !== host)
    ) {
      return;
    }
    const onClick = (click: MouseEvent): void => {
      end();
      if (
        click.detail === 0 ||
        !isElement(click.target) ||
        !host.contains(click.target)
      ) {
        return;
      }
      const target = targetUnderFinger(host, clientX, clientY);
      if (target != null) {
        click.preventDefault();
        click.stopPropagation();
        target.click();
      }
    };
    const stopClick = subscribeInput(view, 'click', onClick, {cancels: true});
    // Any later press ends this one. This press has already reached the
    // window's listeners, so only a later press does.
    const stopNextPress = subscribeInput(view, 'pointerdown', () => end());
    const end = (): void => {
      stopClick();
      stopNextPress();
      if (endPress === end) {
        endPress = null;
      }
    };
    endPress = end;
  });
  return () => {
    stopPresses();
    endPress?.();
  };
}

/**
 * A callback ref for an element that takes taps (`enabled`) and draws a touch
 * band (`touchHitAreaStyles.layer`, or `band` on a descendant with
 * `BAND_ON_DESCENDANT`). Under a finger, a tap on the band over empty space
 * acts on the element; over another target's visible box, it acts on that
 * target. Keep `options` stable, as a module constant.
 *
 * @example
 * ```
 * const hitAreaRef = useTouchHitArea(isInteractive && !isDisabled);
 * <li ref={hitAreaRef} {...stylex.props(isInteractive && touchHitAreaStyles.layer)} />
 * ```
 */
export function useTouchHitArea(
  enabled: boolean,
  options: TouchHitAreaOptions = NO_OPTIONS,
): RefCallback<HTMLElement> {
  // Syncs with an external system: the window's input stream, which hears a
  // finger's press on the element. The ref's cleanup stops listening.
  return useCallback(
    (element: HTMLElement | null) => {
      if (!enabled || element == null) {
        return undefined;
      }
      return checkTaps(element, options.ownsDescendantTouches ?? true);
    },
    [enabled, options],
  );
}
