// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionCrossFade.ts
 * @input An element, a Reduced Motion fade (reducedMotion.ts), the change
 *   that moves the element, and the box that clips it
 * @output playReducedMotionCrossFade and its handle
 * @position Motion foundation, beside reducedMotion.ts's dip, for a change
 *   that a component cross-fades itself instead of through the animator. Lab
 *   reaches it through internal/touch.ts.
 *
 * A copy of the element as it shows now fades out where it is, and the
 * element changes at once and fades in. The two fades run together, so the
 * element's area shows the old state, the new one or both on every frame. A
 * dip fades out, lands and fades back in, so the area goes blank between the
 * two. The copy is inert and hidden from assistive technology
 * (transientCopy.ts). It is laid next to the box that clips the element,
 * never inside a scroll container. So a scroll that the change makes does not
 * move it.
 */

import {ENTRANCE_OPACITY_FLOOR} from './opacityFloor';
import type {ReducedMotionFade} from './reducedMotion';
import {inertCopy, isCopyable, placeOver} from './transientCopy';

export interface ReducedMotionCrossFade {
  /** Ends the cross-fade at once: the copy goes, and the element shows. */
  cancel(): void;
  /** Resolves true once both fades end, or false when cancelled. */
  readonly finished: Promise<boolean>;
}

/** The properties that place or fade an element: the copy's rect has them. */
const PLACING_PROPERTIES = ['translate', 'transform', 'scale', 'rotate'];

/**
 * Plays `fade` as a cross-fade of `element`, with `land` as the change. `clip`
 * is the box that clips the element, such as its scroll container, or null
 * when only the viewport clips it. Returns null when the element cannot be
 * copied (too large, or not laid out): the caller then plays its own form,
 * such as a dip.
 */
export function playReducedMotionCrossFade(
  element: HTMLElement,
  fade: ReducedMotionFade,
  land: () => void,
  clip: HTMLElement | null = null,
): ReducedMotionCrossFade | null {
  const anchor = clip ?? element;
  const host = anchor.parentElement;
  if (fade.duration <= 0) {
    land();
    return {cancel() {}, finished: Promise.resolve(true)};
  }
  const rect = element.getBoundingClientRect();
  if (host == null || rect.width === 0 || rect.height === 0) {
    return null;
  }
  const copy = isCopyable(element) ? inertCopy(element) : null;
  if (copy == null) {
    return null;
  }
  const shown = Number.parseFloat(getComputedStyle(element).opacity);
  const opacity = Number.isFinite(shown) ? shown : 1;
  // The copy's rect already places it: a transform it copied would move it
  // a second time.
  for (const property of PLACING_PROPERTIES) {
    copy.style.setProperty(property, 'none');
  }
  copy.style.setProperty('pointer-events', 'none');
  placeOver(copy, host, rect, anchor.nextSibling);
  if (clip != null) {
    clipTo(copy, clip);
  }
  land();
  // Both fades start in this task, on the same frame, with the same easing.
  // So the two opacities add up to the old one on every frame.
  const fadeIn = element.animate(
    [{opacity: ENTRANCE_OPACITY_FLOOR, easing: fade.easing}, {opacity}],
    {duration: fade.duration, fill: 'backwards'},
  );
  const fadeOut = copy.animate([{opacity, easing: fade.easing}, {opacity: 0}], {
    duration: fade.duration,
    fill: 'forwards',
  });
  let isDone = false;
  let settle: (done: boolean) => void = () => {};
  const finished = new Promise<boolean>(resolve => {
    settle = resolve;
  });
  const end = (done: boolean) => {
    if (isDone) {
      return;
    }
    isDone = true;
    copy.remove();
    settle(done);
  };
  Promise.all([fadeIn.finished, fadeOut.finished]).then(
    () => end(true),
    // A cancelled fade rejects `finished`; `cancel` has ended it.
    () => {},
  );
  return {
    cancel() {
      if (isDone) {
        return;
      }
      fadeIn.cancel();
      fadeOut.cancel();
      end(false);
    },
    finished,
  };
}

/**
 * Clips `copy` to `clip`'s visible box: its padding box, inside the borders
 * and scroll bars. Laid outside `clip`, the copy is no longer clipped by it.
 */
function clipTo(copy: HTMLElement, clip: HTMLElement): void {
  const clipRect = clip.getBoundingClientRect();
  const top = clipRect.top + clip.clientTop;
  const left = clipRect.left + clip.clientLeft;
  const bottom = top + clip.clientHeight;
  const right = left + clip.clientWidth;
  const box = copy.getBoundingClientRect();
  // The inset is in the copy's own pixels: a scaled host draws them larger.
  const scale =
    copy.offsetWidth > 0 && box.width > 0 ? box.width / copy.offsetWidth : 1;
  const inset = [
    top - box.top,
    box.right - right,
    box.bottom - bottom,
    left - box.left,
  ].map(value => `${Math.max(0, value) / scale}px`);
  copy.style.setProperty('clip-path', `inset(${inset.join(' ')})`);
}
