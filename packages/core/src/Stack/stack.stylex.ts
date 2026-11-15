// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stack.stylex.ts
 * @input Uses @stylexjs/stylex, spacing from theme
 * @output StyleX utility for stack (flex container) styling
 * @position Layout utility; used by HStack, VStack components
 *
 * SYNC: When modified, update /packages/core/src/Stack/Stack.doc.mjs
 */

import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {SpacingStep} from '../utils/types';

const alignItemsStyles = stylex.create({
  center: {
    alignItems: 'center',
  },
  end: {
    alignItems: 'flex-end',
  },
  start: {
    alignItems: 'flex-start',
  },
  stretch: {
    alignItems: 'stretch',
  },
});

/**
 * Cross-axis alignment options for stack items.
 * - For HStack: vertical alignment
 * - For VStack: horizontal alignment
 */
export type StackCrossAlignment = keyof typeof alignItemsStyles;

const justifyContentStyles = stylex.create({
  start: {
    justifyContent: 'flex-start',
  },
  center: {
    justifyContent: 'center',
  },
  end: {
    justifyContent: 'flex-end',
  },
  between: {
    justifyContent: 'space-between',
  },
  around: {
    justifyContent: 'space-around',
  },
  evenly: {
    justifyContent: 'space-evenly',
  },
});

/**
 * Main-axis alignment options for stack items.
 * - For HStack: horizontal alignment
 * - For VStack: vertical alignment
 */
export type StackMainAlignment = keyof typeof justifyContentStyles;

const directionStyles = stylex.create({
  horizontal: {
    flexDirection: 'row',
  },
  vertical: {
    flexDirection: 'column',
  },
});

/**
 * Stack direction.
 * - `horizontal`: Items flow along the inline axis, right to left in RTL (HStack)
 * - `vertical`: Items flow top-to-bottom (VStack)
 */
export type StackDirection = keyof typeof directionStyles;

const wrapStyles = stylex.create({
  nowrap: {
    flexWrap: 'nowrap',
  },
  wrap: {
    flexWrap: 'wrap',
  },
  'wrap-reverse': {
    flexWrap: 'wrap-reverse',
  },
});

/**
 * Flex wrap behavior.
 * - `nowrap`: Items stay on one line (default)
 * - `wrap`: Items wrap to next line
 * - `wrap-reverse`: Items wrap to previous line
 */
export type StackWrap = keyof typeof wrapStyles;

const baseStyles = stylex.create({
  stack: {
    display: 'flex',
  },
});

/**
 * Gap styles using spacing tokens from the theme.
 * Keys are numeric SpacingStep values.
 */
const gapStyles = stylex.create({
  0: {
    columnGap: spacingVars['--spacing-0'],
    rowGap: spacingVars['--spacing-0'],
  },
  0.5: {
    columnGap: spacingVars['--spacing-0-5'],
    rowGap: spacingVars['--spacing-0-5'],
  },
  1: {
    columnGap: spacingVars['--spacing-1'],
    rowGap: spacingVars['--spacing-1'],
  },
  1.5: {
    columnGap: spacingVars['--spacing-1-5'],
    rowGap: spacingVars['--spacing-1-5'],
  },
  2: {
    columnGap: spacingVars['--spacing-2'],
    rowGap: spacingVars['--spacing-2'],
  },
  3: {
    columnGap: spacingVars['--spacing-3'],
    rowGap: spacingVars['--spacing-3'],
  },
  4: {
    columnGap: spacingVars['--spacing-4'],
    rowGap: spacingVars['--spacing-4'],
  },
  5: {
    columnGap: spacingVars['--spacing-5'],
    rowGap: spacingVars['--spacing-5'],
  },
  6: {
    columnGap: spacingVars['--spacing-6'],
    rowGap: spacingVars['--spacing-6'],
  },
  8: {
    columnGap: spacingVars['--spacing-8'],
    rowGap: spacingVars['--spacing-8'],
  },
  10: {
    columnGap: spacingVars['--spacing-10'],
    rowGap: spacingVars['--spacing-10'],
  },
});

export {type SpacingStep};

export interface StackOptions {
  /**
   * Position of items along the cross-axis.
   * - For HStack: vertical alignment
   * - For VStack: horizontal alignment
   */
  crossAlign?: StackCrossAlignment;

  /**
   * Direction of the stack.
   */
  direction: StackDirection;

  /**
   * Spacing between items.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  gap?: SpacingStep;

  /**
   * Position of items along the main-axis.
   * - For HStack: horizontal alignment
   * - For VStack: vertical alignment
   */
  mainAlign?: StackMainAlignment;

  /**
   * Whether items should wrap to the next line.
   * - `nowrap`: Items stay on one line (default)
   * - `wrap`: Items wrap to next line
   * - `wrap-reverse`: Items wrap to previous line
   * @default 'nowrap'
   */
  wrap?: StackWrap;
}

/**
 * StyleX utility to add stack (flex container) styles to any element.
 *
 * @example
 * ```
 * import { stack } from '@astryxdesign/core/Layout';
 * import * as stylex from '@stylexjs/stylex';
 *
 * // Horizontal stack with numeric gap
 * <div {...stylex.props(...stack({ direction: 'horizontal', gap: 2 }))}>
 *   <Child />
 *   <Child />
 * </div>
 *
 * // Vertical stack with centered items
 * <div {...stylex.props(...stack({ direction: 'vertical', crossAlign: 'center' }))}>
 *   <Child />
 *   <Child />
 * </div>
 *
 * // Wrapping horizontal stack with larger gap
 * <div {...stylex.props(...stack({ direction: 'horizontal', gap: 4, wrap: 'wrap' }))}>
 *   <Child />
 *   <Child />
 *   <Child />
 * </div>
 * ```
 */
export function stack({
  crossAlign,
  direction,
  gap,
  mainAlign,
  wrap,
}: StackOptions) {
  return [
    baseStyles.stack,
    directionStyles[direction],
    gap != null && gapStyles[gap],
    crossAlign != null && alignItemsStyles[crossAlign],
    mainAlign != null && justifyContentStyles[mainAlign],
    wrap != null && wrapStyles[wrap],
  ] as const;
}
