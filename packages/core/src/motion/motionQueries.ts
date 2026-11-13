// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motionQueries.ts
 * @input The window's media queries
 * @output `defaultPrefersReducedMotion` and `defaultIsCoarsePointer`, read at
 *   the moment of the call
 * @position Shared by the animator and the reduced-motion policy. It holds no
 *   motion code, so a component that reads the policy statically does not
 *   pull in the deferred touch runtime
 */

/**
 * Whether the user asked for reduced motion (`prefers-reduced-motion:
 * reduce`), read at the moment of the call: the preference the animator uses
 * by default for its Reduce Motion substitution. A component does not read
 * it to pick a curve of its own; `animator.reducedMotion()` or
 * `reducedMotionFade()` gives the policy's answer. False without a window
 * (server rendering).
 */
export function defaultPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Whether the primary pointer is coarse: `(pointer: coarse)`. */
export function defaultIsCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}
