// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayoutFooter.tsx
 * @input Uses React StyleX
 * @output Exports LayoutFooter component and LayoutFooterProps
 * @position Bottom bar / footer area for Layout. Use for action bars,
 *   pagination, status bars, or any fixed-height content at the bottom of a layout.
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
import {layoutFooterMarker} from './layoutEdges.stylex';
import {LayoutDividerContext} from './LayoutDividerContext';
import {colorVars, spacingVars} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import type {SizeValue, SpacingStep} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {
  paddingStyles,
  containerPaddingInlineVarStyles,
  containerPaddingBlockStartVarStyles,
  containerPaddingBlockEndVarStyles,
} from './padding.stylex';

const styles = stylex.create({
  // Outer shell: owns border/divider and sizing. No padding — that lives on inner.
  footer: {
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
    paddingBlockStart: `var(--layout-padding-inner-y, ${spacingVars['--spacing-4']})`,
    paddingBlockEnd: `var(--layout-padding-own-outer-y, var(--layout-padding-outer-y, ${spacingVars['--spacing-4']}))`,
    '--container-padding-inline-start': `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
    '--container-padding-inline-end': `var(--layout-padding-own-outer-x, var(--layout-padding-outer-x, ${spacingVars['--spacing-4']}))`,
    '--container-padding-block-start': `var(--layout-padding-inner-y, ${spacingVars['--spacing-4']})`,
    '--container-padding-block-end': `var(--layout-padding-own-outer-y, var(--layout-padding-outer-y, ${spacingVars['--spacing-4']}))`,
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
    borderBlockStartWidth: 1,
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: colorVars['--color-border'],
  },
});

// Dynamic styles for sizing props
const dynamicStyles = stylex.create({
  sizing: (height: SizeValue | null) => ({
    height,
  }),
});

export interface LayoutFooterProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Content to render inside the footer.
   */
  children?: ReactNode;

  /**
   * Adds a themed border at the top edge.
   * When false, spacing collapse is applied automatically for seamless visual flow.
   * When not set, falls back to the parent Layout's `defaultHasDividers`, then `false`.
   * @default false
   */
  hasDivider?: boolean;

  /**
   * Height of the footer.
   * Numbers are treated as pixels, strings are used as-is.
   */
  height?: SizeValue;

  /**
   * Internal padding of the footer using the spacing scale.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   * Overrides the default padding from the layout container.
   */
  padding?: SpacingStep;

  /**
   * Accessible label for the landmark.
   * Required when role is set and multiple landmarks of the same type exist.
   */
  label?: string;

  /**
   * ARIA landmark role for accessibility.
   * Use 'contentinfo' only for site-wide footers (not in nested layouts).
   */
  role?: AriaRole;
}

/**
 * Bottom bar / footer for Layout. Use for action bars, pagination, or status bars.
 * Renders in the footer slot with optional divider and padding control.
 *
 * Already provides its own padding — don't add padding to children.
 * Use `padding={0}` if your content manages its own padding.
 *
 * @example
 * ```
 * <LayoutContainer variant="card">
 *   <Layout
 *     content={<LayoutContent>...</LayoutContent>}
 *     footer={<LayoutFooter hasDivider>Actions</LayoutFooter>}
 *   />
 * </LayoutContainer>
 * ```
 */
export function LayoutFooter({
  children,
  hasDivider,
  height,
  label,
  padding,
  role,
  xstyle,
  className,
  style,
  ref,
  ...props
}: LayoutFooterProps) {
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
        themeProps('layout-footer'),
        stylex.props(
          layoutFooterMarker,
          styles.footer,
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
        )}>
        {children}
      </div>
    </div>
  );
}

LayoutFooter.displayName = 'LayoutFooter';
