// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MetadataListItem.tsx
 * @input Uses React, ReactNode, StyleXStyles, theme tokens, MetadataListContext
 * @output Exports MetadataListItem component, MetadataListItemProps type
 * @position Core implementation; consumed by MetadataList, index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/MetadataList/MetadataList.doc.mjs
 * - /packages/core/src/MetadataList/MetadataList.test.tsx
 * - /packages/core/src/MetadataList/index.ts
 * - /apps/storybook/stories/MetadataList.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/MetadataList/ (showcase blocks)
 */

import {use, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import {MetadataListContext} from './MetadataListContext';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {isRenderable} from '../utils/isRenderable';
import {themeProps} from '../utils/themeProps';

// =============================================================================
// Types
// =============================================================================

export interface MetadataListItemProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Content value for this metadata item.
   */
  children: ReactNode;
  /**
   * Icon rendered before the label text.
   */
  icon?: ReactNode;
  /**
   * Label text for this metadata item.
   */
  label: string;
  /**
   * Test ID for testing frameworks.
   */
  'data-testid'?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  // Label (dt) — inline (side-by-side with value)
  label: {
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    margin: 0,
    padding: 0,
    minHeight: 24,
    wordBreak: 'break-word',
  },
  // Value (dd) — inline
  value: {
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    margin: 0,
    padding: 0,
    minHeight: 24,
    wordBreak: 'break-word',
  },
  // Stacked layout wrapper (label on top)
  stackedWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
  },
  // Stacked label
  stackedLabel: {
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    margin: 0,
    padding: 0,
  },
  stackedValue: {
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    margin: 0,
    padding: 0,
    wordBreak: 'break-word',
  },
  iconWrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    color: colorVars['--color-text-secondary'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * A single labeled metadata value within an MetadataList.
 *
 * Renders a `<dt>` / `<dd>` pair. Layout (side-by-side or stacked) is
 * determined by the parent MetadataList's label configuration.
 *
 * @example
 * ```
 * <MetadataListItem label="Status">Active</MetadataListItem>
 * <MetadataListItem label="Created" icon={<CalendarIcon />}>
 *   January 1, 2023
 * </MetadataListItem>
 * ```
 */
export function MetadataListItem({
  children,
  icon,
  label,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ref,
  ...rest
}: MetadataListItemProps) {
  const ctx = use(MetadataListContext);
  const labelPosition = ctx?.labelConfig.position ?? 'start';
  const isStacked =
    labelPosition === 'top' || ctx?.orientation === 'horizontal';

  const labelContent = (
    <>
      {isRenderable(icon) && (
        <span {...stylex.props(styles.iconWrapper)}>{icon}</span>
      )}
      {label}
    </>
  );

  // Stacked layout: label above content, wrapped in a div
  if (isStacked) {
    return (
      <div
        ref={ref}
        data-testid={testId}
        {...mergeProps(
          themeProps('metadata-list-item'),
          stylex.props(styles.stackedWrapper, xstyle),
          className,
          style,
        )}
        {...rest}>
        <dt {...stylex.props(styles.stackedLabel)}>{labelContent}</dt>
        <dd {...stylex.props(styles.stackedValue)}>{children}</dd>
      </div>
    );
  }

  // Inline layout: dt and dd are direct grid children
  return (
    <>
      <dt
        ref={ref}
        data-testid={testId ? `${testId}-label` : undefined}
        {...mergeProps(
          themeProps('metadata-list-item'),
          stylex.props(styles.label, xstyle),
          className,
          style,
        )}
        {...rest}>
        {labelContent}
      </dt>
      <dd
        data-testid={testId ? `${testId}-value` : undefined}
        {...stylex.props(styles.value)}>
        {children}
      </dd>
    </>
  );
}

MetadataListItem.displayName = 'MetadataListItem';
