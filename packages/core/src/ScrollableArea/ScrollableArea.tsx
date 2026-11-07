// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ScrollableArea.tsx
 * @input Logical scroll intent, accessible name, overscroll policy, viewport sizing, content padding, and content
 * @output Native scroll viewport with an observed real content box
 * @position Reference composition over useScrollableArea
 *
 * SYNC: When modified, update:
 * - /packages/core/src/ScrollableArea/ScrollableArea.test.tsx
 * - /packages/core/src/ScrollableArea/ScrollableArea.doc.mjs
 * - /apps/storybook/stories/ScrollableArea.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/ScrollableArea/ (showcase blocks)
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {
  paddingStyles,
  paddingInlineStyles,
  paddingInlineStartStyles,
  paddingInlineEndStyles,
  paddingBlockStyles,
  paddingBlockStartStyles,
  paddingBlockEndStyles,
  containerPaddingInlineVarStyles,
  containerPaddingInlineStartVarStyles,
  containerPaddingInlineEndVarStyles,
  containerPaddingBlockStartVarStyles,
  containerPaddingBlockEndVarStyles,
} from '../Layout/padding.stylex';
import type {SizeValue, SpacingStep} from '../utils/types';
import {
  useScrollableArea,
  type ScrollAxis,
  type ScrollOverscroll,
  type ScrollStickyContainment,
} from '../hooks/useScrollableArea';
import {colorVars} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
  viewport: {
    boxSizing: 'border-box',
    maxInlineSize: '100%',
    maxBlockSize: '100%',
    WebkitOverflowScrolling: 'touch',
    scrollbarColor: {
      default: `${colorVars['--color-neutral']} transparent`,
      // Touch screens keep the platform's own scroll indicator, which iOS
      // shows only while scrolling, as UIScrollView does. A custom colour
      // turns it into a faint bar that also shows in the gap a pull opens.
      '@media (pointer: coarse)': 'auto',
      '@media (forced-colors: active)': 'auto',
    },
    scrollbarWidth: 'auto',
    scrollbarGutter: 'auto',
    // Chromium can resolve CSS-only stuck/edge presentation for descendants.
    // Unsupported engines keep the hook state as the behavior source of truth.
    containerType: {
      default: null,
      '@supports (container-type: scroll-state)': 'scroll-state',
    },
  },
  fullBleed: {
    marginInlineStart: 'calc(-1 * var(--container-padding-inline-start, 0px))',
    marginInlineEnd: 'calc(-1 * var(--container-padding-inline-end, 0px))',
    maxInlineSize:
      'calc(100% + var(--container-padding-inline-start, 0px) + var(--container-padding-inline-end, 0px))',
    marginBlockStart: {
      default: null,
      ':first-child': 'calc(-1 * var(--container-padding-block-start, 0px))',
    },
    marginBlockEnd: {
      default: null,
      ':last-child': 'calc(-1 * var(--container-padding-block-end, 0px))',
    },
  },
  content: {
    boxSizing: 'border-box',
    minInlineSize: '100%',
    minBlockSize: '100%',
  },
  contentWithInlineOverflow: {
    inlineSize: 'max-content',
  },
});

const dynamicStyles = stylex.create({
  sizing: (
    width: SizeValue | null,
    height: SizeValue | null,
    maxWidth: SizeValue | null,
    minHeight: SizeValue | null,
  ) => ({width, height, maxWidth, minHeight}),
});

export type ScrollableAreaStickyContainment = ScrollStickyContainment;

export interface ScrollableAreaProps extends Omit<
  BaseProps<HTMLDivElement>,
  'aria-label' | 'children' | 'role' | 'tabIndex'
> {
  /** Content rendered inside the observed content box. */
  children?: ReactNode;
  /** Logical axis or axes where scrolling is allowed. @default 'block' */
  axis?: ScrollAxis;
  /** Accessible name used when an effective viewport enters the tab order. */
  label: string;
  /** Semantics for the named scroll viewport. @default 'group' */
  role?: 'group' | 'region';
  /** Whether effective axes pass scroll gestures to ancestors at an edge. @default 'allow' */
  overscroll?: ScrollOverscroll;
  /** Width of the viewport; numbers are interpreted as pixels. */
  width?: SizeValue;
  /** Height of the viewport; numbers are interpreted as pixels. */
  height?: SizeValue;
  /** Maximum width of the viewport. */
  maxWidth?: SizeValue;
  /** Minimum height of the viewport. */
  minHeight?: SizeValue;
  /** Whether a fitting viewport deliberately remains a Sticky containing boundary. @default 'whenScrollable' */
  stickyContainment?: ScrollableAreaStickyContainment;
  /** Content padding using the shared spacing scale. @default 0 */
  padding?: SpacingStep;
  /** Logical inline-axis content padding; overrides `padding` on that axis. */
  paddingInline?: SpacingStep;
  /** Logical inline-start content padding; overrides broader padding values. */
  paddingInlineStart?: SpacingStep;
  /** Logical inline-end content padding; overrides broader padding values. */
  paddingInlineEnd?: SpacingStep;
  /** Logical block-axis content padding; overrides `padding` on that axis. */
  paddingBlock?: SpacingStep;
  /** Logical block-start content padding; overrides broader padding values. */
  paddingBlockStart?: SpacingStep;
  /** Logical block-end content padding; overrides broader padding values. */
  paddingBlockEnd?: SpacingStep;
  /** Let the viewport escape inherited container padding. @default false */
  isFullBleed?: boolean;
  /** Ref connected to the native scroll viewport. */
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * A native scroll viewport with axis-aware accessibility and chaining.
 *
 * The root is the viewport. Its single child is a normal block content box with
 * a 100% minimum size; children participate in that box rather than directly in
 * viewport flex/grid layout. Inline scrolling gives the box max-content inline
 * sizing, and its minimum block size deliberately does not create a definite
 * percentage-height basis. Use the hook on owned structure when those formatting
 * semantics must stay unchanged. Native scrolling and platform scrollbars remain
 * authoritative.
 *
 * @example
 * ```
 * <ScrollableArea axis="block" label="Activity history">
 *   <ActivityList />
 * </ScrollableArea>
 * ```
 */
export function ScrollableArea({
  children,
  axis = 'block',
  label,
  role = 'group',
  overscroll = 'allow',
  width,
  height,
  maxWidth,
  minHeight,
  stickyContainment = 'whenScrollable',
  padding = 0,
  paddingInline,
  paddingInlineStart,
  paddingInlineEnd,
  paddingBlock,
  paddingBlockStart,
  paddingBlockEnd,
  isFullBleed = false,
  ref,
  xstyle,
  className,
  style,
  ...props
}: ScrollableAreaProps) {
  const {getViewportProps, getContentProps} = useScrollableArea({
    axis,
    keyboardAccess: {owner: 'viewport', label, role},
    overscroll,
    stickyContainment,
  });

  const mergedViewportProps = mergeProps(
    themeProps('scrollable-area', {axis}),
    stylex.props(
      styles.viewport,
      isFullBleed && styles.fullBleed,
      focusOutlineStyles.focusVisible,
      dynamicStyles.sizing(
        width ?? null,
        height ?? null,
        maxWidth ?? null,
        minHeight ?? null,
      ),
      xstyle,
    ),
    className,
    style,
  );
  const viewportProps = getViewportProps<HTMLDivElement>({
    ...props,
    ref,
    ...mergedViewportProps,
  });

  return (
    <div {...viewportProps}>
      <div
        {...getContentProps<HTMLDivElement>({
          ...stylex.props(
            styles.content,
            axis !== 'block' && styles.contentWithInlineOverflow,
            paddingStyles[padding],
            containerPaddingInlineVarStyles[padding],
            containerPaddingBlockStartVarStyles[padding],
            containerPaddingBlockEndVarStyles[padding],
            paddingInline != null && paddingInlineStyles[paddingInline],
            paddingInline != null &&
              containerPaddingInlineVarStyles[paddingInline],
            paddingBlock != null && paddingBlockStyles[paddingBlock],
            paddingBlock != null &&
              containerPaddingBlockStartVarStyles[paddingBlock],
            paddingBlock != null &&
              containerPaddingBlockEndVarStyles[paddingBlock],
            paddingInlineStart != null &&
              paddingInlineStartStyles[paddingInlineStart],
            paddingInlineStart != null &&
              containerPaddingInlineStartVarStyles[paddingInlineStart],
            paddingInlineEnd != null &&
              paddingInlineEndStyles[paddingInlineEnd],
            paddingInlineEnd != null &&
              containerPaddingInlineEndVarStyles[paddingInlineEnd],
            paddingBlockStart != null &&
              paddingBlockStartStyles[paddingBlockStart],
            paddingBlockStart != null &&
              containerPaddingBlockStartVarStyles[paddingBlockStart],
            paddingBlockEnd != null && paddingBlockEndStyles[paddingBlockEnd],
            paddingBlockEnd != null &&
              containerPaddingBlockEndVarStyles[paddingBlockEnd],
          ),
        })}>
        {children}
      </div>
    </div>
  );
}

ScrollableArea.displayName = 'ScrollableArea';
