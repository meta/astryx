// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file reducedMotionContext.ts
 * @input React
 * @output ThemeReducesMotionContext: whether the nearest theme, or any theme
 *   above it, has `reducedMotion: 'always'`
 * @position Theme; Theme.tsx provides it and useReducesMotion reads it for a
 *   hook that holds no element
 */

import {createContext} from 'react';

/**
 * True under a theme with `reducedMotion: 'always'` and under every theme
 * nested in one: the mark only adds, so a nested `'system'` theme cannot take
 * it away. The DOM carries the same fact as the mark, which
 * code that holds an element reads instead.
 */
export const ThemeReducesMotionContext = createContext(false);
ThemeReducesMotionContext.displayName = 'ThemeReducesMotionContext';
