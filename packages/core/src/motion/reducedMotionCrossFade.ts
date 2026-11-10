// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionCrossFade.ts
 * @input An element, a Reduced Motion fade (reducedMotion.ts), the change
 *   that moves the element, and the scroll container that clips it
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
 * (transientCopy.ts). In a scroll container, the copy is the container's
 * visible part. So what the element draws outside its own box there, such as
 * an indicator above a list, fades out with it.
 */

import {ENTRANCE_OPACITY_FLOOR} from './opacityFloor';
import type {ReducedMotionFade} from './reducedMotion';
import {
  inertCopy,
  isCopyable,
  placeOver,
  visiblePartCopy,
} from './transientCopy';

export interface ReducedMotionCrossFade {
  /** Ends the cross-fade at once: the copy goes, and the element shows. */
  cancel(): void;
  /** Resolves true once both fades end, or false when cancelled. */
  readonly finished: Promise<boolean>;
}

/**
 * The properties that place an element. The copy's rect already includes
 * them.
 */
const PLACING_PROPERTIES = ['translate', 'transform', 'scale', 'rotate'];

/**
 * Plays `fade` as a cross-fade of `element`, with `land` as the change. `clip`
 * is the scroll container that clips the element, or null when only the
 * viewport clips it. Returns null when nothing can be copied (too large, or
 * not laid out): the caller then plays its own form, such as a dip.
 */
export function playReducedMotionCrossFade(
  element: HTMLElement,
  fade: ReducedMotionFade,
  land: () => void,
  clip: HTMLElement | null = null,
): ReducedMotionCrossFade | null {
  if (fade.duration <= 0) {
    land();
    return {cancel() {}, finished: Promise.resolve(true)};
  }
  const source = clip ?? element;
  const host = source.parentElement;
  if (host == null || !isCopyable(source)) {
    return null;
  }
  // Every read comes before the first write, so laying the copy out costs
  // one layout.
  const shown = Number.parseFloat(getComputedStyle(element).opacity);
  const opacity = Number.isFinite(shown) ? shown : 1;
  const part = clip == null ? wholeCopy(element) : visiblePartCopy(clip);
  if (part == null || part.rect.width === 0 || part.rect.height === 0) {
    return null;
  }
  const {copy, rect} = part;
  copy.style.setProperty('pointer-events', 'none');
  placeOver(copy, host, rect, source.nextSibling);
  land();
  // Both fades start in this task with one easing. So the content shows at
  // 0.75 or more on every frame.
  const fadeIn = element.animate(
    [{opacity: ENTRANCE_OPACITY_FLOOR, easing: fade.easing}, {opacity}],
    {duration: fade.duration, fill: 'backwards'},
  );
  // A holder of the visible part starts opaque: the element's copy inside it
  // keeps the element's own opacity. A whole copy fades from that opacity.
  const fadeOut = copy.animate(
    [{opacity: clip == null ? opacity : 1, easing: fade.easing}, {opacity: 0}],
    {duration: fade.duration, fill: 'forwards'},
  );
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

/** `element` copied whole, and where it shows, in viewport coordinates. */
function wholeCopy(
  element: HTMLElement,
): {copy: HTMLElement; rect: DOMRect} | null {
  const rect = element.getBoundingClientRect();
  const copy = inertCopy(element);
  if (copy == null) {
    return null;
  }
  // A transform the copy kept would move it a second time.
  for (const property of PLACING_PROPERTIES) {
    copy.style.setProperty(property, 'none');
  }
  return {copy, rect};
}
