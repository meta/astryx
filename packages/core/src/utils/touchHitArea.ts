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
import {distanceTo, INTERACTIVE_SELECTOR} from './hitArea';
import {subscribeInput} from './inputStream';
import {isElement} from './nodeType';
import {isCoarsePointer} from './coarsePointer';
import {isGrownHitInput} from '../privateAttributes/grownHitInput.stylex';
import {closestFieldFrame} from '../privateAttributes/fieldFrame.stylex';

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
 * The element whose box a target shows. A marked grown hit input, such as
 * Switch's, paints nothing and covers its parent: the person sees the parent.
 */
function shownBy(target: Element): Element {
  return (isGrownHitInput(target) ? target.parentElement : null) ?? target;
}

// An entry that renders as a field. A checkbox, radio, file or submit input
// is not one.
const ENTRY = `:is(textarea, select, [contenteditable="true"], input:not([type]), ${'text search email url tel password number date time datetime-local month week color'
  .split(' ')
  .map(type => `input[type="${type}"]`)
  .join()})`;

/**
 * The entry a tap on a marked field box gives the tap to: its entry nearest
 * the finger, or the box itself when it holds none, as a field's description
 * or a file input's drop zone, whose own click forwards the tap.
 */
function entryOf(frame: Element, x: number, y: number): Element {
  let entry = frame;
  let nearest = Infinity;
  for (const candidate of frame.querySelectorAll(ENTRY)) {
    const distance = distanceTo(candidate.getBoundingClientRect(), x, y);
    if (distance < nearest) {
      entry = candidate;
      nearest = distance;
    }
  }
  return entry;
}

/**
 * Where a tap on `host`'s band at (x, y) goes, or null for the host: a visible
 * box under the finger, else the nearest box in empty space. It reads boxes
 * only when the finger is outside the host's, up to the host's own container
 * (what paints below, such as the page under a layer, is not beside it), in
 * one layout flush.
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
    // the finger. A field's marked frame is its entry's visible box.
    const control = element.closest(INTERACTIVE_SELECTOR);
    const frame = control == null ? closestFieldFrame(element) : null;
    const target = control ?? (frame && entryOf(frame, x, y));
    if (target == null || isOwn(host, target) || frame?.contains(host)) {
      continue;
    }
    const shown = frame ?? shownBy(target);
    const distance = distanceTo(shown.getBoundingClientRect(), x, y);
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

// A select and the inputs whose native tap opens a picker.
const PICKER =
  /^(select-one|select-multiple|date|datetime-local|month|week|time|color)$/;

/**
 * Gives a tap to `target` as a native tap does, inside the same click, so the
 * user gesture holds. `click()` runs a button's, link's, label's, checkbox's
 * or submit's activation. A focusable target also takes the focus, so a text
 * field raises the keyboard and the band's control keeps none, and a picker
 * opens.
 */
function activate(target: HTMLElement): void {
  if (target.tabIndex >= 0 || target.isContentEditable) {
    target.focus({preventScroll: true});
  }
  target.click();
  if (PICKER.test((target as HTMLInputElement).type ?? '')) {
    try {
      (target as HTMLInputElement).showPicker();
    } catch {
      // The browser refuses the picker; the focus has already moved.
    }
  }
}

/**
 * Checks each finger's tap on `host` until the returned function runs. The
 * press reads nothing, so a scroll it starts never waits. At the click,
 * `targetUnderFinger` may send the tap on; a keyboard or assistive-technology
 * click (detail 0) goes through.
 */
function checkTaps(host: Element, ownsDescendantTouches: boolean): () => void {
  const view = host.ownerDocument.defaultView;
  if (view == null) {
    return () => {};
  }
  let endPress: (() => void) | null = null;
  const stopPresses = subscribeInput(view, 'pointerdown', press => {
    const {target, clientX, clientY} = press;
    // The band, and so the check, exists while the primary pointer is coarse,
    // for a finger, a pen and a mouse alike.
    if (
      !isCoarsePointer(view) ||
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
        activate(target);
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
 * `BAND_ON_DESCENDANT`), whose taps the press check routes. Keep `options`
 * stable, as a module constant.
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
