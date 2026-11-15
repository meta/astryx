// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sticky.tsx
 * @input Uses React, StyleX, CSS position: sticky, prefers-reduced-motion
 * @output Exports Sticky component and StickyProps type
 * @position Core implementation of sticky positioning component
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Sticky/Sticky.doc.mjs
 * - /packages/core/src/Sticky/__tests__/Sticky.test.tsx
 * - /packages/core/src/index.ts
 * - /apps/storybook/stories/Sticky.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Sticky/ (showcase blocks)
 */

import * as stylex from '@stylexjs/stylex';
import {mergeProps} from '../utils/mergeProps';
import type {BaseProps} from '../BaseProps';

// =============================================================================
// StyleX Styles
// =============================================================================

const styles = stylex.create({
  sticky: {
    // Core sticky positioning
    position: 'sticky',
  },
  stickyAxisVertical: {
    top: 0,
  },
  stickyAxisHorizontal: {
    insetInlineStart: 0,
  },
  stickyAxisBoth: {
    top: 0,
    insetInlineStart: 0,
  },
  stickyEnabled: {
    // Ensure the sticky behavior is applied
    position: 'sticky',
  },
  // Reduced motion: disable sticky positioning when user prefers reduced motion
  // Using the standard codebase pattern: media query within stylex.create
  stickyReducedMotion: {
    '@media (prefers-reduced-motion: reduce)': {
      position: 'static',
    },
  },
});

// =============================================================================
// Types
// =============================================================================

export type StickyAxis = 'both' | 'horizontal' | 'vertical';

export interface StickyProps extends BaseProps<HTMLDivElement> {
  /**
   * The child element to stick to the viewport
   */
  children: React.ReactNode;

  /**
   * Which axis to stick the element
   * - 'both': sticks on both vertical and horizontal axes
   * - 'vertical': sticks only vertically (default)
   * - 'horizontal': sticks only horizontally
   * @default 'vertical'
   */
  axis?: StickyAxis;

  /**
   * Offset from the top edge of the container
   * @default 0
   */
  offsetTop?: number;

  /**
   * Offset from the right edge of the container
   * @default 0
   */
  offsetRight?: number;

  /**
   * Offset from the bottom edge of the container
   * @default 0
   */
  offsetBottom?: number;

  /**
   * Offset from the left edge of the container
   * @default 0
   */
  offsetLeft?: number;

  /**
   * Whether the sticky effect is enabled
   * @default true
   */
  isEnabled?: boolean;

  /**
   * Custom className applied to the root element
   */
  className?: string;

  /**
   * Additional inline styles
   */
  style?: React.CSSProperties;

  /**
   * Ref forwarded to the root element
   */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * Test ID for the root element
   */
  'data-testid'?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * A sticky component that fixes an element to the viewport during scrolling.
 * Provides StyleX theming support, and reduced motion awareness.
 *
 * @example
 * ```
 * <Sticky axis="vertical" offsetTop={0}>
 *   <Header />
 * </Sticky>
 *
 * <Sticky axis="vertical" offsetLeft={24} offsetTop={64}>
 *   <Sidebar />
 * </Sticky>
 *
 * <Sticky isEnabled={false}>
 *   <AdBanner />
 * </Sticky>
 * ```
 */
export function Sticky({
  children,
  axis = 'vertical',
  offsetTop = 0,
  offsetRight = 0,
  offsetBottom = 0,
  offsetLeft = 0,
  isEnabled = true,
  className,
  style,
  ref,
  'data-testid': testId,
  ...restProps
}: StickyProps) {
  // Determine the sticky axis styles based on the axis prop
  const axisStyles = stylex.props(
    styles['stickyAxis' + axis.charAt(0).toUpperCase() + axis.slice(1)],
  );

  // Build the stylex props for the root element
  const stickyStylexProps = stylex.props(
    styles.sticky,
    axisStyles,
    isEnabled ? styles.stickyEnabled : {},
    stylex.props(styles.stickyReducedMotion),
  );

  // Merge with any additional props
  const finalStyle = {
    ...style,
    ...(isEnabled ? {} : {position: 'static'}), // override to static when disabled
  };

  return (
    <div
      ref={ref}
      data-testid={testId}
      {...mergeProps(stickyStylexProps, className, finalStyle, restProps)}>
      {children}
    </div>
  );
}

// =============================================================================
// Display Name
// =============================================================================

Sticky.displayName = 'Sticky';
