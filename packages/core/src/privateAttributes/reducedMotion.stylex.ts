// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/reducedMotion.stylex.ts
 * @input Whether a theme reduces motion for everyone
 * @output reducedMotionMarkProps and setRootReducedMotionMark, which write the
 *   mark, themeReducesMotion, which reads it, and ThemeReducesMotionContext,
 *   the same fact for a hook that holds no element
 * @position Owner module of the private reduced-motion attribute: the only
 *   file that writes its name. Theme marks its root, and the root theme marks
 *   `<html>`; the animator, reducedMotionFade and the layout glide read it as
 *   the person's Reduce Motion setting. No package entry exports it.
 */

import {createSharedContext} from '../utils/sharedContext';

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

/**
 * True under a theme with `reducedMotion: 'always'` and under every theme
 * nested in one: the mark only adds, so a nested theme does not take it away.
 * Theme provides it beside the DOM mark; useReducesMotion reads it for a hook
 * that holds no element. It lives here, beside the mark, so the motion
 * foundation reads it without loading a theme or a StyleX module.
 */
export const ThemeReducesMotionContext = createSharedContext<boolean>(
  'ThemeReducesMotionContext',
  1,
  false,
);
ThemeReducesMotionContext.displayName = 'ThemeReducesMotionContext';
