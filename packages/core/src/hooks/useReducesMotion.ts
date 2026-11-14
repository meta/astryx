// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useReducesMotion.ts
 * @input The person's Reduce Motion setting (live), ThemeReducesMotionContext
 * @output useReducesMotion, whether motion is reduced for the calling component
 * @position Hooks; the hook form of motion/reducedMotion.ts's reducesMotion,
 *   for a hook that holds no element
 */

import {use} from 'react';
import {ThemeReducesMotionContext} from '../theme/reducedMotionContext';
import {useMediaQuery} from './useMediaQuery';

/**
 * Whether motion is reduced for the calling component: the person's Reduce
 * Motion setting, followed live, or a theme above it with
 * `reducedMotion: 'always'`. The same rule as
 * `reducesMotion(element)`, read from the theme tree for a hook that holds no
 * element.
 */
export function useReducesMotion(): boolean {
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  );
  const themeReducesMotion = use(ThemeReducesMotionContext);
  return prefersReducedMotion || themeReducesMotion;
}
