// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchHitArea.ts
 * @input Whether an element takes taps, the window's input stream and the
 *   geometry of utils/hitArea.ts
 * @output `useTouchHitArea`, a callback ref that lets a tap on its element's
 *   touch band act only when no neighbour is nearer the finger
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
import {distanceTo, INTERACTIVE_SELECTOR} from './hitArea';
import {subscribeInput} from './inputStream';
import {isElement} from './nodeType';

/** How a host's band relates to its content. */
export interface TouchHitAreaOptions {
  /**
   * Whether a press that the browser hit-tests onto a descendant is the
   * element's, however near a neighbour is. Leave it on for a host that draws
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

/**
 * Whether a neighbour is nearer the press at (x, y) than `host`. It reads the
 * host's box, and only when the press is outside it, the interactive elements
 * under the finger, up to the host's own container: what paints below that,
 * such as the page under a layer, is not beside the host. One layout flush
 * serves every read.
 */
function isNearerNeighbour(host: Element, x: number, y: number): boolean {
  const own = distanceTo(host.getBoundingClientRect(), x, y);
  if (own === 0) {
    return false;
  }
  for (const element of host.ownerDocument.elementsFromPoint?.(x, y) ?? []) {
    if (host.contains(element)) {
      continue;
    }
    if (element.contains(host)) {
      return false;
    }
    const neighbour = element.closest(INTERACTIVE_SELECTOR);
    if (
      neighbour != null &&
      !isOwn(host, neighbour) &&
      distanceTo(neighbour.getBoundingClientRect(), x, y) < own
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks each finger's tap on `host` until the returned function runs. The
 * press notes where the finger landed and reads nothing, so a scroll that it
 * starts never waits. The tap's click then cancels itself when it began on the
 * band and a neighbour is nearer the finger: nothing acts, and the person taps
 * again. A keyboard or assistive-technology click (detail 0) goes through.
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
        click.detail !== 0 &&
        isElement(click.target) &&
        host.contains(click.target) &&
        isNearerNeighbour(host, clientX, clientY)
      ) {
        click.preventDefault();
        click.stopPropagation();
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
 * `BAND_ON_DESCENDANT`). Under a finger, a tap on the band acts only when no
 * neighbour is nearer the finger. Keep `options` stable, as a module constant.
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
