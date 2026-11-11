// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchHitArea.ts
 * @input Whether an element takes taps, the window's input stream and the
 *   geometry of utils/hitArea.ts
 * @output `useTouchHitArea`: at a tap's click, it gives a tap on the band to
 *   a target whose box is under or nearer the finger
 * @position Core-internal hook for the coarse-only 44 px target, whose band
 *   is CSS (internal/touchHitArea.stylex.ts). It reads layout only at a click
 *   and keeps no module state, so copies of Core share nothing here.
 *   SYNC: internal/touchHitArea.stylex.ts and touchHitArea.test.tsx.
 */

import {useCallback, type RefCallback} from 'react';
import {distanceTo, INTERACTIVE_SELECTOR, type HitRect} from './hitArea';
import {subscribeInput} from './inputStream';
import {isElement} from './nodeType';
import {isGrownHitInput} from '../privateAttributes/grownHitInput.stylex';

/** How a host's band relates to its content. */
export interface TouchHitAreaOptions {
  /**
   * Whether a press that lands on a descendant is the element's, whatever lies
   * under the finger: on for a host that draws the band on itself, such as a
   * list row with a swipe panel; off for a host whose band is on a descendant,
   * such as Button's content wrapper or Switch's grown input.
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
 * The box a target shows. A marked grown hit input, such as Switch's, paints
 * nothing: the person sees its parent's box.
 */
function visibleBox(target: Element): HitRect {
  const box = target.getBoundingClientRect();
  const parent = target.parentElement;
  if (parent == null || !isGrownHitInput(target)) {
    return box;
  }
  const clip = parent.getBoundingClientRect();
  return {
    left: Math.max(box.left, clip.left),
    top: Math.max(box.top, clip.top),
    right: Math.min(box.right, clip.right),
    bottom: Math.min(box.bottom, clip.bottom),
  };
}

/**
 * Where a tap on `host`'s band at (x, y) goes, or null for the host itself. A
 * visible box under the finger wins; the band only claims empty space. In
 * empty space where bands overlap, the target whose box is nearest the finger
 * wins. It reads the host's box, and only when the press is outside it, the
 * elements under the finger and their targets' boxes, up to the host's own
 * container: what paints below that, such as the page under a layer, is not
 * beside the host. One layout flush serves every read.
 */
function targetUnderFinger(
  host: Element,
  x: number,
  y: number,
): HTMLElement | null {
  let nearestDistance = distanceTo(host.getBoundingClientRect(), x, y);
  if (nearestDistance === 0) {
    return null;
  }
  let nearest: HTMLElement | null = null;
  for (const element of host.ownerDocument.elementsFromPoint?.(x, y) ?? []) {
    if (host.contains(element)) {
      continue;
    }
    if (element.contains(host)) {
      break;
    }
    // The browser also lists an element whose band, not its box, is under
    // the finger.
    const target = element.closest(INTERACTIVE_SELECTOR);
    if (target == null || isOwn(host, target)) {
      continue;
    }
    const distance = distanceTo(visibleBox(target), x, y);
    if (distance === 0) {
      return target as HTMLElement;
    }
    if (distance < nearestDistance) {
      nearest = target as HTMLElement;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * Checks each finger's tap on `host` until the returned function runs. The
 * press notes where the finger landed and reads nothing, so a scroll that it
 * starts never waits. When the tap began on the band over another target's
 * visible box, or in empty space nearer another target's box, its click goes
 * to that target. A keyboard or assistive-technology click (detail 0) goes
 * through.
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
 * `BAND_ON_DESCENDANT`). Under a finger, a tap on the band over another
 * target's visible box acts on that target; in empty space, it acts on the
 * target whose box is nearest, the element when no other is nearer. Keep
 * `options` stable, as a module constant.
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
