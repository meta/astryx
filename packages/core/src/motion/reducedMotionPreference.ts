// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionPreference.ts
 * @input The person's Reduce Motion setting, and the theme around an element
 * @output prefersReducedMotion, and the media read it starts from
 * @position The one Reduce Motion predicate. The animator, the Reduced Motion
 *   policy (reducedMotion.ts) and lazy motion glue call it. It imports no
 *   motion code, so glue in a static bundle reads it without the animator.
 */

import {themeReducesMotion} from '../privateAttributes/reducedMotion.stylex';

/**
 * Whether the user asked for reduced motion (`prefers-reduced-motion:
 * reduce`), read at the moment of the call. False without a window (server
 * rendering).
 */
export function mediaPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Whether Reduce Motion applies to `element`: the person's setting, or a
 * theme around it that reduces motion for everyone.
 */
export function prefersReducedMotion(element?: Element | null): boolean {
  return mediaPrefersReducedMotion() || themeReducesMotion(element);
}
