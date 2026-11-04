// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/reducedMotion.stylex.ts
 * @input Whether a theme reduces motion for everyone
 * @output reducedMotionMarkProps and setRootReducedMotionMark, which write the
 *   mark, and themeReducesMotion, which reads it
 * @position Owner module of the private reduced-motion attribute: the only
 *   file that writes its name. Theme marks its root, and the root theme marks
 *   `<html>`; the animator, reducedMotionFade and the layout glide read it as
 *   the person's Reduce Motion setting. No package entry exports it.
 */

const REDUCED_MOTION = 'data-astryx-reduced-motion';

/** Spread on a theme's root when the theme reduces motion for everyone. */
export function reducedMotionMarkProps(
  isMarked: boolean,
): Readonly<Record<string, string>> {
  return isMarked ? {[REDUCED_MOTION]: ''} : {};
}

/**
 * Marks or unmarks `<html>` for the root theme, so a layer portaled outside
 * the theme's root reads the mark too.
 */
export function setRootReducedMotionMark(
  root: HTMLElement,
  isMarked: boolean,
): void {
  if (isMarked) {
    root.setAttribute(REDUCED_MOTION, '');
  } else {
    root.removeAttribute(REDUCED_MOTION);
  }
}

/**
 * Whether the theme `element` is in reduces motion for everyone: its root,
 * or `<html>` for the root theme, carries the mark.
 */
export function themeReducesMotion(
  element: Element | null | undefined,
): boolean {
  return element?.closest?.(`[${REDUCED_MOTION}]`) != null;
}
