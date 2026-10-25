// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Skeleton.tsx
 * @input Uses React, StyleX keyframes and tokens
 * @output Exports Skeleton component, SkeletonProps, SkeletonRadius types
 * @position Core implementation of skeleton loading placeholder
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Skeleton/Skeleton.doc.mjs
 * - /packages/core/src/Skeleton/index.ts
 * - /apps/storybook/stories/Skeleton.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Skeleton/ (showcase blocks)
 */

import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {colorVars, radiusVars, durationVars} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';

// =============================================================================
// Animation Timing Constants
// =============================================================================

/**
 * Initial delay before animation starts (ms).
 * Prevents flash of animation for fast-loading content.
 */
const DELAY_TIME = 1000;

/**
 * Stagger increment between sequential skeleton elements (ms).
 * Creates a wave effect when multiple skeletons are used together.
 */
const STAGGER_TIME = 100;

// =============================================================================
// Animation Keyframes
// =============================================================================

/**
 * The pulse climbs from 0.25 to 0.925 opacity in ten equal steps, then plays
 * back down (`alternate`). The steps are written out as holds joined by
 * 0.01% ramps, with a linear timing function, rather than produced by a
 * `steps()` timing function: WebKit never runs a `steps()` animation on the
 * compositor, so Safari would repaint the pulse on the main thread and freeze
 * it whenever a script runs. These keyframes give the same values at the same
 * times, which every engine can animate off the main thread.
 */
const skeletonFade = stylex.keyframes({
  '0%': {opacity: 0.25},
  '9.99%': {opacity: 0.25},
  '10%': {opacity: 0.325},
  '19.99%': {opacity: 0.325},
  '20%': {opacity: 0.4},
  '29.99%': {opacity: 0.4},
  '30%': {opacity: 0.475},
  '39.99%': {opacity: 0.475},
  '40%': {opacity: 0.55},
  '49.99%': {opacity: 0.55},
  '50%': {opacity: 0.625},
  '59.99%': {opacity: 0.625},
  '60%': {opacity: 0.7},
  '69.99%': {opacity: 0.7},
  '70%': {opacity: 0.775},
  '79.99%': {opacity: 0.775},
  '80%': {opacity: 0.85},
  '89.99%': {opacity: 0.85},
  '90%': {opacity: 0.925},
  '100%': {opacity: 0.925},
});

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    backgroundColor: {
      default: colorVars['--color-skeleton'],
      '@media (prefers-contrast: more)': `color-mix(in srgb, ${colorVars['--color-skeleton']}, ${colorVars['--color-text-primary']} 30%)`,
      // Forced colors (Windows High Contrast) strips painted backgrounds,
      // which would make the placeholder invisible. GrayText is a system
      // color, so it survives forcing and keeps the placeholder visible
      // (WCAG 1.4.11). Listed after prefers-contrast so it wins when both
      // media features are active.
      '@media (forced-colors: active)': 'GrayText',
    },
    opacity: {
      default: 0.25,
      // The resting 0.25 opacity would render GrayText nearly invisible on
      // Canvas; full opacity keeps the static placeholder perceivable (the
      // fade animation still pulses when motion is allowed).
      '@media (forced-colors: active)': 1,
    },
  },
  animate: {
    animationDirection: 'alternate',
    animationDuration: durationVars['--duration-medium-max'],
    animationIterationCount: 'infinite',
    // Disable the pulse under reduced-motion; the static placeholder still
    // reads as loading (complex-20).
    animationName: {
      default: skeletonFade,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    // Linear between the keyframes' holds; see skeletonFade.
    animationTimingFunction: 'linear',
  },
});

const radiusStyles = stylex.create({
  // Numeric scale names (preferred)
  none: {
    borderRadius: 0,
  },
  0: {
    borderRadius: radiusVars['--radius-none'],
  },
  1: {
    borderRadius: radiusVars['--radius-inner'],
  },
  2: {
    borderRadius: radiusVars['--radius-element'],
  },
  3: {
    borderRadius: radiusVars['--radius-container'],
  },
  4: {
    borderRadius: radiusVars['--radius-container'],
  },
  rounded: {
    borderRadius: radiusVars['--radius-full'],
  },
});

const dynamicStyles = stylex.create({
  animationDelay: (index: number) => ({
    animationDelay: `${DELAY_TIME + STAGGER_TIME * index}ms`,
  }),
  dimensions: (width: number | string, height: number | string) => ({
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }),
});

// =============================================================================
// Types
// =============================================================================

export type SkeletonRadius = keyof typeof radiusStyles;

// =============================================================================
// Component
// =============================================================================

export interface SkeletonProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Width of the skeleton.
   * Accepts a number (pixels) or string (any CSS value).
   * @default '100%'
   */
  width?: number | string;
  /**
   * Height of the skeleton.
   * Accepts a number (pixels) or string (any CSS value).
   * @default '100%'
   */
  height?: number | string;
  /**
   * Border radius of the skeleton, using design token scale.
   * - 'none': No border radius (sharp corners)
   * - 0: radius-0 token (0px)
   * - 1: radius-1 token (4px)
   * - 2: radius-2 token (8px)
   * - 3: radius-3 token (12px, default)
   * - 4: radius-4 token (16px)
   * - 'rounded': Fully rounded (for avatars, pills)
   * @default 3
   */
  radius?: SkeletonRadius;
  /**
   * Index for staggered animation timing.
   * Use sequential indices (0, 1, 2, ...) for multiple skeletons
   * to create a wave effect.
   * @default 0
   */
  index?: number;
  /**
   * Test ID for testing purposes.
   */
  'data-testid'?: string;
}

/**
 * A placeholder shape that indicates content is loading.
 * Renders a pulsing block with configurable width, height, and border radius.
 * Use the `index` prop to stagger animation timing across multiple skeletons.
 *
 * @example
 * ```
 * <Skeleton width={200} height={20} />
 * <Skeleton width={40} height={40} radius="rounded" />
 * <Skeleton width={300} height={16} index={0} />
 * <Skeleton width={280} height={16} index={1} />
 * ```
 */
export function Skeleton({
  width = '100%',
  height = '100%',
  radius: radiusProp = 3,
  index = 0,
  'data-testid': testId,
  xstyle,
  className,
  style,
  ref,
  ...props
}: SkeletonProps) {
  return (
    <div
      ref={ref}
      // Purely decorative loading placeholder — hide from assistive tech so it
      // isn't announced as empty content. The surrounding region should convey
      // the loading/busy state (e.g. aria-busy) (complex-20). Consumers can
      // override via props if a specific skeleton must be exposed.
      aria-hidden="true"
      data-testid={testId}
      {...mergeProps(
        themeProps('skeleton'),
        stylex.props(
          styles.root,
          styles.animate,
          radiusStyles[radiusProp],
          dynamicStyles.dimensions(width, height),
          dynamicStyles.animationDelay(index),
          xstyle,
        ),
        className,
        style,
      )}
      {...props}
    />
  );
}

Skeleton.displayName = 'Skeleton';
