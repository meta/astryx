// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';
/**
 * @file useEntryAnimation.ts
 * @input Uses React, StyleX, theme tokens, useIsHydrating
 * @output Exports useEntryAnimation hook for mount-only entry animations
 * @position Hook utility; consumed by FieldStatus and available to consumers
 *
 * It animates only an element that mounts after the first page paint.
 * Server-rendered elements hydrate without the entry style and never play it
 * (spec:AST-013 FR13).
 */

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {durationVars, easeVars, spacingVars} from '../theme/tokens.stylex';
import {useIsHydrating} from './useIsHydrating';

// Track whether the initial page paint has completed, so elements a
// client-only root renders on page load do not animate; only dynamically
// inserted ones should. Server-rendered elements are covered by
// useIsHydrating instead: hydration can run after this flag turns true.
let initialPaintComplete = false;
if (typeof window !== 'undefined') {
  requestAnimationFrame(() => {
    initialPaintComplete = true;
  });
}

const slideDown = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translateY(calc(-1 * ${spacingVars['--spacing-2']}))`,
  },
  to: {opacity: 1, transform: 'translateY(0)'},
});

const slideUp = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translateY(${spacingVars['--spacing-2']})`,
  },
  to: {opacity: 1, transform: 'translateY(0)'},
});

const fadeIn = stylex.keyframes({
  from: {opacity: 0},
  to: {opacity: 1},
});

const scaleIn = stylex.keyframes({
  from: {opacity: 0, transform: 'scale(0.95)'},
  to: {opacity: 1, transform: 'scale(1)'},
});

const styles = stylex.create({
  slideDown: {
    animationName: {
      default: slideDown,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    animationDuration: durationVars['--duration-fast-max'],
    animationTimingFunction: easeVars['--ease-standard'],
    animationFillMode: 'backwards',
  },
  slideUp: {
    animationName: {
      default: slideUp,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    animationDuration: durationVars['--duration-fast-max'],
    animationTimingFunction: easeVars['--ease-standard'],
    animationFillMode: 'backwards',
  },
  fadeIn: {
    animationName: {
      default: fadeIn,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    animationDuration: durationVars['--duration-fast-max'],
    animationTimingFunction: easeVars['--ease-standard'],
    animationFillMode: 'backwards',
  },
  scaleIn: {
    animationName: {
      default: scaleIn,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    animationDuration: durationVars['--duration-fast-max'],
    animationTimingFunction: easeVars['--ease-standard'],
    animationFillMode: 'backwards',
  },
});

export type EntryAnimationPreset =
  'slideDown' | 'slideUp' | 'fadeIn' | 'scaleIn';

/**
 * Returns a StyleX style for animating an element on mount.
 *
 * Only animates when the element is dynamically inserted after the initial
 * page paint. Elements rendered on page load, including server-rendered
 * elements while they hydrate, are not animated.
 *
 * @example
 * ```
 * const entryStyle = useEntryAnimation('slideDown');
 * <div {...stylex.props(entryStyle)}>Animated content</div>
 * ```
 */
export function useEntryAnimation(
  preset: EntryAnimationPreset = 'slideDown',
): StyleXStyles | null {
  const isHydrating = useIsHydrating();
  // Captured once: a hydrated element must not start animating when React
  // re-renders it with the client snapshot after hydration.
  const [animate] = useState(() => !isHydrating && initialPaintComplete);
  return animate ? styles[preset] : null;
}
