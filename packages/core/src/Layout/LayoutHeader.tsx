// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayoutHeader.tsx
 * @input Uses React StyleX
 * @output Exports LayoutHeader component and LayoutHeaderProps
 * @position Top bar / header area for Layout. Use for page titles, app bars,
 *   toolbar areas, or any fixed-height content at the top of a layout.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Layout/Layout.doc.mjs
 * - /packages/core/src/Layout/LayoutHeader.doc.mjs
 * - /apps/storybook/stories/Layout.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Layout/ (showcase blocks)
 */

import type {AriaRole, ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import {use} from 'react';
import * as stylex from '@stylexjs/stylex';
import {layoutHeaderMarker} from './layoutEdges.stylex';
import {LayoutDividerContext} from './LayoutDividerContext';
import {colorVars, spacingVars} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import type {SizeValue, SpacingStep} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {
  paddingStyles,
  paddingBlockEndStyles,
  containerPaddingInlineVarStyles,
  containerPaddingBlockStartVarStyles,
  containerPaddingBlockEndVarStyles,
} from './padding.stylex';

const styles = stylex.create({
  // Outer shell: owns border/divider and sizing. No padding — that lives on inner.
  header: {
    flexShrink: 0,
  },
  // Inner wrapper: owns padding and optional content-width constraint.
  // When --layout-content-width is not set, maxWidth defaults to 'none' (inert).
  inner: {
    boxSizing: 'border-box',
    maxWidth: 'var(--layout-content-width, none)',
    marginInline: 'auto',
    // Default: outer padding on edges that touch container, inner on interior edges
    paddingInlineStart: `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
    paddingInlineEnd: `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
    paddingBlockStart: `var(--layout-padding-own-outer-y, var(--layout-padding-outer-y, ${spacingVars['--spacing-4']}))`,
    paddingBlockEnd: `var(--layout-padding-inner-y, ${spacingVars['--spacing-4']})`,
    '--container-padding-inline-start': `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
    '--container-padding-inline-end': `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
    '--container-padding-block-start': `var(--layout-padding-own-outer-y, var(--layout-padding-outer-y, ${spacingVars['--spacing-4']}))`,
    '--container-padding-block-end': `var(--layout-padding-inner-y, ${spacingVars['--spacing-4']})`,
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
  divider: {
    borderBlockEndWidth: 1,
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: colorVars['--color-border'],
  },
});

// Dynamic styles for sizing props
const dynamicStyles = stylex.create({
  sizing: (height: SizeValue | null) => ({
    height,
  }),
});

export interface LayoutHeaderProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Content to render inside the header.
   */
  children?: ReactNode;

  /**
   * Adds a themed border at the bottom edge.
   * When false, spacing collapse is applied automatically for seamless visual flow.
   * When not set, falls back to the parent Layout's `defaultHasDividers`, then `false`.
   * @default false
   */
  hasDivider?: boolean;

  /**
   * Height of the header.
   * Numbers are treated as pixels, strings are used as-is.
   */
  height?: SizeValue;

  /**
   * Internal padding of the header using the spacing scale.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   * Overrides the default padding from the layout container.
   */
  padding?: SpacingStep;

  /**
   * Block-end (bottom) padding override. Takes precedence over `padding` on
   * that edge only; the block-start edge and both inline edges are left alone.
   * `paddingBlockEnd={0}` docks the last child on the header's bottom edge, so
   * a tab strip's underline meets `hasDivider` with no hand-written margin.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  paddingBlockEnd?: SpacingStep;

  /**
   * Accessible label for the landmark.
   * Required when role is set and multiple landmarks of the same type exist.
   */
  label?: string;

  /**
   * ARIA landmark role for accessibility.
   * Use 'banner' only for site-wide headers (not in nested layouts).
   */
  role?: AriaRole;
}

/**
 * Top bar / header for Layout. Use for page titles, app bars, or toolbars.
 * Renders in the header slot with optional divider and padding control.
 *
 * Already provides its own padding — don't add padding to children.
 * Use `padding={0}` if your content manages its own padding (e.g. TopNav).
 *
 * @example
 * ```
 * <LayoutContainer variant="card">
 *   <Layout
 *     header={<LayoutHeader hasDivider>Page Title</LayoutHeader>}
 *     content={<LayoutContent>...</LayoutContent>}
 *   />
 * </LayoutContainer>
 * ```
 */
export function LayoutHeader({
  children,
  hasDivider,
  height,
  label,
  padding,
  paddingBlockEnd,
  role,
  xstyle,
  className,
  style,
  ref,
  ...props
}: LayoutHeaderProps) {
  const dividerCtx = use(LayoutDividerContext);
  const resolvedHasDivider =
    hasDivider ?? dividerCtx?.defaultHasDividers ?? false;
  const isZeroPadding = padding === 0;

  return (
    <div
      ref={ref}
      role={role}
      aria-label={label}
      data-divider={resolvedHasDivider || undefined}
      {...mergeProps(
        themeProps('layout-header'),
        stylex.props(
          layoutHeaderMarker,
          styles.header,
          dynamicStyles.sizing(height ?? null),

          resolvedHasDivider && styles.divider,
          xstyle,
        ),
        className,
        style,
      )}
      {...props}>
      <div
        {...stylex.props(
          styles.inner,
          isZeroPadding && styles.fullBleed,
          padding != null && paddingStyles[padding],
          padding != null && containerPaddingInlineVarStyles[padding],
          padding != null && containerPaddingBlockStartVarStyles[padding],
          padding != null && containerPaddingBlockEndVarStyles[padding],
          // Per-edge override last so it wins over `padding` on its own edge.
          // The container var moves with it so bleed children compensate
          // against the padding actually applied, not the one asked for.
          paddingBlockEnd != null && paddingBlockEndStyles[paddingBlockEnd],
          paddingBlockEnd != null &&
            containerPaddingBlockEndVarStyles[paddingBlockEnd],
        )}>
        {children}
      </div>
    </div>
  );
}

LayoutHeader.displayName = 'LayoutHeader';
