// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sticky.tsx
 * @input Uses React, StyleX, CSS position: sticky
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
    position: 'sticky',
  },
  axisVertical: {
    top: 0,
  },
  axisHorizontal: {
    insetInlineStart: 0,
  },
  axisBoth: {
    top: 0,
    insetInlineStart: 0,
  },
});

const dynamicStyles = stylex.create({
  top: (offset: number) => ({top: offset}),
  insetInlineEnd: (offset: number) => ({insetInlineEnd: offset}),
  bottom: (offset: number) => ({bottom: offset}),
  insetInlineStart: (offset: number) => ({insetInlineStart: offset}),
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

  /** Offset from the inline end when `axis` includes horizontal positioning. */
  offsetInlineEnd?: number;

  /** Offset from the bottom edge when `axis` includes vertical positioning. */
  offsetBottom?: number;

  /** Offset from the inline start when `axis` includes horizontal positioning. */
  offsetInlineStart?: number;

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
 * Keeps an element attached to the nearest scroll container while it scrolls.
 *
 * StyleX styles passed through `xstyle` can customize the root element.
 *
 * @example
 * ```
 * <Sticky axis="vertical" offsetTop={0}>
 *   <Header />
 * </Sticky>
 *
 * <Sticky axis="both" offsetInlineStart={24} offsetTop={64}>
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
  offsetInlineEnd,
  offsetBottom,
  offsetInlineStart,
  isEnabled = true,
  className,
  style,
  xstyle,
  ref,
  'data-testid': testId,
  ...restProps
}: StickyProps) {
  const axisStyles =
    axis === 'vertical'
      ? styles.axisVertical
      : axis === 'horizontal'
        ? styles.axisHorizontal
        : styles.axisBoth;
  const hasVerticalAxis = axis === 'vertical' || axis === 'both';
  const hasHorizontalAxis = axis === 'horizontal' || axis === 'both';
  const stickyStylexProps = stylex.props(
    styles.sticky,
    isEnabled ? axisStyles : null,
    isEnabled && hasVerticalAxis && offsetTop !== undefined
      ? dynamicStyles.top(offsetTop)
      : null,
    isEnabled && hasHorizontalAxis && offsetInlineEnd !== undefined
      ? dynamicStyles.insetInlineEnd(offsetInlineEnd)
      : null,
    isEnabled && hasVerticalAxis && offsetBottom !== undefined
      ? dynamicStyles.bottom(offsetBottom)
      : null,
    isEnabled && hasHorizontalAxis && offsetInlineStart !== undefined
      ? dynamicStyles.insetInlineStart(offsetInlineStart)
      : null,
    xstyle,
  );

  // Merge with any additional props
  const finalStyle: React.CSSProperties = {
    ...style,
    ...(isEnabled ? {} : {position: 'static'}), // override to static when disabled
  };

  return (
    <div
      ref={ref}
      data-testid={testId}
      {...mergeProps(stickyStylexProps, className, finalStyle)}
      {...restProps}>
      {children}
    </div>
  );
}

// =============================================================================
// Display Name
// =============================================================================

Sticky.displayName = 'Sticky';
