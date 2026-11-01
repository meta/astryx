// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Divider.tsx
 * @input Uses React, stylex, spacing and color tokens
 * @output Exports Divider component and DividerProps
 * @position Divider component; provides visual separation with optional label
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Divider/Divider.doc.mjs
 * - /packages/core/src/Divider/Divider.test.tsx
 * - /apps/storybook/stories/Divider.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Divider/ (showcase blocks)
 */

import {useId, type ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';

import {
  colorVars,
  spacingVars,
  typeScaleVars,
  borderVars,
} from '../theme/tokens.stylex';
import {isRenderable} from '../utils/isRenderable';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';
import type {DividerVariantMap} from './index';

/**
 * Divider variant type. Extensible via module augmentation of DividerVariantMap.
 */
export type DividerVariant = keyof DividerVariantMap;

export interface DividerProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Orientation of the divider.
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';

  /**
   * Optional label to display centered on the divider.
   * Numeric zero is preserved; null, booleans, and empty strings render no label.
   * Rendered with small, secondary text styling.
   */
  label?: ReactNode;

  /**
   * Visual weight of the divider line.
   * - 'subtle': Uses --color-border (default)
   * - 'strong': Uses --color-border-emphasized
   * @default 'subtle'
   */
  variant?: DividerVariant;

  /**
   * Makes the divider escape its parent's container padding.
   * Uses negative margins to extend to the container edges.
   * @default false
   */
  isFullBleed?: boolean;
}

const baseStyles = stylex.create({
  horizontal: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  vertical: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
  },
});

const lineStyles = stylex.create({
  horizontalLine: {
    height: borderVars['--border-width'],
    flexGrow: 1,
    flexShrink: 1,
  },
  verticalLine: {
    width: borderVars['--border-width'],
    flexGrow: 1,
    flexShrink: 1,
  },
  subtle: {
    backgroundColor: colorVars['--color-border'],
  },
  strong: {
    backgroundColor: colorVars['--color-border-emphasized'],
  },
});

const labelStyles = stylex.create({
  label: {
    flexShrink: 0,
    paddingInline: spacingVars['--spacing-3'],
    // Small secondary text styling
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
  },
  verticalLabel: {
    paddingInline: 0,
    paddingBlock: spacingVars['--spacing-3'],
  },
});

const fullBleedStyles = stylex.create({
  horizontal: {
    marginInlineStart: 'calc(-1 * var(--container-padding-inline-start, 0px))',
    marginInlineEnd: 'calc(-1 * var(--container-padding-inline-end, 0px))',
    width:
      'calc(100% + var(--container-padding-inline-start, 0px) + var(--container-padding-inline-end, 0px))',
  },
  vertical: {
    marginBlockStart: 'calc(-1 * var(--container-padding-block-start, 0px))',
    marginBlockEnd: 'calc(-1 * var(--container-padding-block-end, 0px))',
    height:
      'calc(100% + var(--container-padding-block-start, 0px) + var(--container-padding-block-end, 0px))',
  },
});

/**
 * Divider component for visual separation of content.
 *
 * Provides horizontal and vertical dividers with optional labels.
 * Uses Astryx design tokens for colors and spacing.
 *
 * @example
 * ```
 * <Divider label="or" />
 * ```
 */
export function Divider({
  orientation = 'horizontal',
  label,
  variant = 'subtle',
  isFullBleed = false,
  xstyle,
  className,
  style,
  ref,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...props
}: DividerProps) {
  const isHorizontal = orientation === 'horizontal';
  const hasLabel = isRenderable(label);
  const labelId = useId();

  // A separator does not derive its accessible name from its content, so the
  // rendered label must be referenced explicitly via aria-labelledby to be
  // exposed as the separator's name (WCAG 1.3.1). An explicit aria-label or
  // aria-labelledby from the consumer takes precedence.
  const resolvedLabelledBy =
    ariaLabelledBy ?? (hasLabel && ariaLabel == null ? labelId : undefined);

  return (
    <div
      ref={ref}
      {...props}
      role="separator"
      aria-orientation={orientation}
      aria-label={ariaLabel}
      aria-labelledby={resolvedLabelledBy}
      {...mergeProps(
        themeProps('divider', {variant, orientation}),
        stylex.props(
          isHorizontal ? baseStyles.horizontal : baseStyles.vertical,
          isFullBleed &&
            (isHorizontal
              ? fullBleedStyles.horizontal
              : fullBleedStyles.vertical),
          xstyle,
        ),
        className,
        style,
      )}>
      <div
        {...stylex.props(
          isHorizontal ? lineStyles.horizontalLine : lineStyles.verticalLine,
          lineStyles[variant],
        )}
      />
      {hasLabel && (
        <div
          id={labelId}
          {...stylex.props(
            labelStyles.label,
            !isHorizontal && labelStyles.verticalLabel,
          )}>
          {label}
        </div>
      )}
      {hasLabel && (
        <div
          {...stylex.props(
            isHorizontal ? lineStyles.horizontalLine : lineStyles.verticalLine,
            lineStyles[variant],
          )}
        />
      )}
    </div>
  );
}

Divider.displayName = 'Divider';
