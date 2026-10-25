// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayoutContent.tsx
 * @input Uses React StyleX, LayoutSlotsContext
 * @output Exports LayoutContent component and LayoutContentProps
 * @position Scrollable main content area for Layout. Wraps the primary body content
 *   with automatic scroll containment and context-aware padding.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Layout/Layout.doc.mjs
 * - /apps/storybook/stories/Layout.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Layout/ (showcase blocks)
 */

import type {AriaRole, ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import {use} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import {LayoutSlotsContext} from './LayoutSlotsContext';
import {mergeProps} from '../utils';
import type {SpacingStep} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {
  paddingStyles,
  containerPaddingInlineVarStyles,
  containerPaddingBlockStartVarStyles,
  containerPaddingBlockEndVarStyles,
} from './padding.stylex';

const styles = stylex.create({
  content: {
    boxSizing: 'border-box',
    height: '100%',
    flex: 1,
    minHeight: 0,
    overflow: 'clip',
    // Default: inner padding on all sides (will be overridden by position-specific styles)
    paddingInlineStart: `var(--layout-padding-inner-x, ${spacingVars['--spacing-4']})`,
    paddingInlineEnd: `var(--layout-padding-inner-x, ${spacingVars['--spacing-4']})`,
    // A header or footer without a divider collapses the adjacent padding
    // for a seamless visual flow: Layout's middle row sets these to 0px then
    // (see Layout.tsx `middle`).
    paddingBlockStart: `var(--_layout-flush-block-start, var(--layout-padding-inner-y, ${spacingVars['--spacing-4']}))`,
    paddingBlockEnd: `var(--_layout-flush-block-end, var(--layout-padding-inner-y, ${spacingVars['--spacing-4']}))`,
    // Publish container padding vars for bleed children (Table, Divider, etc.)
    '--container-padding-inline-start': `var(--layout-padding-inner-x, ${spacingVars['--spacing-4']})`,
    '--container-padding-inline-end': `var(--layout-padding-inner-x, ${spacingVars['--spacing-4']})`,
    '--container-padding-block-start': `var(--layout-padding-inner-y, ${spacingVars['--spacing-4']})`,
    '--container-padding-block-end': `var(--layout-padding-inner-y, ${spacingVars['--spacing-4']})`,
  },
  // When no start panel: outer-x on left edge
  noStart: {
    paddingInlineStart: `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
    '--container-padding-inline-start': `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
    '--container-padding-inline-end': `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
  },
  // When no end panel: outer-x on right edge
  noEnd: {
    paddingInlineEnd: `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
  },
  // When no header: outer-y on top
  noHeader: {
    paddingBlockStart: `var(--layout-padding-own-outer-y, var(--layout-padding-outer-y, ${spacingVars['--spacing-4']}))`,
    '--container-padding-block-start': `var(--layout-padding-own-outer-y, var(--layout-padding-outer-y, ${spacingVars['--spacing-4']}))`,
  },
  // When no footer: outer-y on bottom
  noFooter: {
    paddingBlockEnd: `var(--layout-padding-own-outer-y, var(--layout-padding-outer-y, ${spacingVars['--spacing-4']}))`,
    '--container-padding-block-end': `var(--layout-padding-own-outer-y, var(--layout-padding-outer-y, ${spacingVars['--spacing-4']}))`,
  },
  scrollable: {
    overflow: 'auto',
  },
  // Keep LayoutContent as the scroll and padding owner. These styles only add
  // the gutter needed to align its direct children to contentWidth.
  constrainedNoPanelsStart: {
    paddingInlineStart:
      'max(var(--container-padding-inline-start, 0px), calc((100cqi - var(--layout-alignment-width)) / 2 + var(--container-padding-inline-start, 0px)))',
  },
  constrainedNoPanelsEnd: {
    paddingInlineEnd:
      'max(var(--container-padding-inline-end, 0px), calc((100cqi - var(--layout-alignment-width)) / 2 + var(--container-padding-inline-end, 0px)))',
  },
  // A one-panel middle query box excludes the panel-side centered gutter, so
  // its full difference from contentWidth is the missing opposite-side gutter.
  constrainedSingleStartPanel: {
    paddingInlineEnd:
      'max(var(--container-padding-inline-end, 0px), calc(100cqi - var(--layout-alignment-width) + var(--container-padding-inline-end, 0px)))',
  },
  constrainedSingleEndPanel: {
    paddingInlineStart:
      'max(var(--container-padding-inline-start, 0px), calc(100cqi - var(--layout-alignment-width) + var(--container-padding-inline-start, 0px)))',
  },
  fullBleed: {
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    paddingBlockStart: 0,
    paddingBlockEnd: 0,
    '--container-padding-inline-start': '0px',
    '--container-padding-inline-end': '0px',
    '--container-padding-block-start': '0px',
    '--container-padding-block-end': '0px',
  },
});

export interface LayoutContentProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Content to render inside the content area.
   */
  children?: ReactNode;

  /**
   * Internal padding of the content area using the spacing scale.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   * Overrides the default padding from the layout container.
   */
  padding?: SpacingStep;

  /**
   * Enables scrollable overflow for the content area.
   * Set to false for auto-height layouts where sticky positioning
   * needs to work with parent containers.
   * @default true
   */
  isScrollable?: boolean;

  /**
   * Accessible label for the landmark.
   * Required when role is set and multiple landmarks of the same type exist.
   */
  label?: string;

  /**
   * ARIA landmark role for accessibility.
   * Use 'main' only for the primary content area of the page (not in nested layouts).
   */
  role?: AriaRole;
}

/**
 * Scrollable main content area for Layout. Wraps the primary body content
 * with automatic scroll containment and context-aware padding.
 *
 * Already provides its own padding and scroll — don't add padding or overflow
 * to children. Use `padding={0}` if you need edge-to-edge content.
 *
 * @example
 * ```
 * <LayoutContainer variant="card">
 *   <Layout
 *     header={<LayoutHeader>Title</LayoutHeader>}
 *     content={<LayoutContent>Main body content</LayoutContent>}
 *   />
 * </LayoutContainer>
 * <LayoutContainer variant="card">
 *   <Layout
 *     content={
 *       <LayoutContent padding={0}>
 *         <Table />
 *       </LayoutContent>
 *     }
 *   />
 * </LayoutContainer>
 * <LayoutContainer variant="card">
 *   <Layout
 *     content={
 *       <LayoutContent isScrollable={false}>
 *         <StickyElement />
 *       </LayoutContent>
 *     }
 *   />
 * </LayoutContainer>
 * ```
 */
export function LayoutContent({
  children,
  isScrollable = true,
  padding,
  label,
  role,
  xstyle,
  className,
  style,
  ref,
  ...props
}: LayoutContentProps) {
  const {hasHeader, hasFooter, hasStart, hasEnd} = use(LayoutSlotsContext);

  const isZeroPadding = padding === 0;

  return (
    <div
      ref={ref}
      role={role}
      aria-label={label}
      {...mergeProps(
        themeProps('layout-content'),
        stylex.props(
          styles.content,
          // Outer padding on container edges (unless content is full bleed)
          !hasStart && !isZeroPadding && padding == null && styles.noStart,
          !hasEnd && !isZeroPadding && padding == null && styles.noEnd,
          !hasHeader && !isZeroPadding && padding == null && styles.noHeader,
          !hasFooter && !isZeroPadding && padding == null && styles.noFooter,
          isScrollable && styles.scrollable,
          isZeroPadding && styles.fullBleed,
          padding != null && paddingStyles[padding],
          padding != null && containerPaddingInlineVarStyles[padding],
          padding != null && containerPaddingBlockStartVarStyles[padding],
          padding != null && containerPaddingBlockEndVarStyles[padding],
          !hasStart &&
            !hasEnd &&
            !isZeroPadding &&
            styles.constrainedNoPanelsStart,
          !hasStart &&
            !hasEnd &&
            !isZeroPadding &&
            styles.constrainedNoPanelsEnd,
          hasStart &&
            !hasEnd &&
            !isZeroPadding &&
            styles.constrainedSingleStartPanel,
          !hasStart &&
            hasEnd &&
            !isZeroPadding &&
            styles.constrainedSingleEndPanel,
          xstyle,
        ),
        className,
        style,
      )}
      {...props}>
      {children}
    </div>
  );
}

LayoutContent.displayName = 'LayoutContent';
