// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file privateAttributes/reducedMotion.stylex.ts
 * @input Whether a theme reduces motion for everyone
 * @output reducedMotionMarkProps and setRootReducedMotionMark, which write the
 *   mark, themeReducesMotion, which reads it, ThemeReducesMotionContext, the
 *   same fact for a hook that holds no element, and the script readers' rule:
 *   reducesMotion(element) and useReducesMotion(), the person's setting or a
 *   theme's 'always'. It loads no animator, theme or StyleX module, so a
 *   reader on every page adds almost nothing at first load.
 * @position Owner module of the private reduced-motion attribute: the only
 *   file that writes its name. Theme marks its root, and the root theme marks
 *   `<html>`; the animator, reducedMotionFade and the layout glide read it as
 *   the person's Reduce Motion setting. No package entry exports it.
 */

import {use} from 'react';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {watchMediaQuery} from '../utils/coarsePointer';
import {createSharedContext} from '../utils/sharedContext';

const REDUCED_MOTION = 'data-astryx-reduced-motion';
const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

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

/**
 * Whether motion is reduced for `element`: the person's Reduce Motion setting,
 * or a theme's `reducedMotion: 'always'` mark on the element or an ancestor,
 * `<html>` included for the root theme. Script code that holds an element
 * decides Reduce Motion here.
 */
export function reducesMotion(element?: Element | null): boolean {
  // The setting is read in the element's own window, so a frame's element
  // follows that frame.
  const view =
    element?.ownerDocument?.defaultView ??
    (typeof window === 'undefined' ? null : window);
  return (
    view?.matchMedia?.(REDUCE_MOTION_QUERY).matches === true ||
    themeReducesMotion(element)
  );
}

/**
 * Calls `listener` when the person's Reduce Motion setting changes in
 * `view`, with whether it is on. Returns the stop. For code that must act
 * when the setting ends while something is open; a theme's mark does not
 * change while the element is mounted.
 */
export function watchReduceMotionSetting(
  view: Window | null | undefined,
  listener: (isOn: boolean) => void,
): () => void {
  return watchMediaQuery(view, REDUCE_MOTION_QUERY, listener);
}

/**
 * The hook form of `reducesMotion`, for a hook that holds no element: the
 * person's Reduce Motion setting, followed live, or a theme above the caller
 * with `reducedMotion: 'always'`.
 */
export function useReducesMotion(): boolean {
  const prefersReducedMotion = useMediaQuery(REDUCE_MOTION_QUERY);
  return prefersReducedMotion || use(ThemeReducesMotionContext);
}
