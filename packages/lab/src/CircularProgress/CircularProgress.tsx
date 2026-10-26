// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CircularProgress.tsx
 * @input Uses React, useId, stylex, SVG, color/spacing/duration/ease tokens
 * @output Exports CircularProgress component, CircularProgressProps, CircularProgressSize, CircularProgressVariant types
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/CircularProgress/CircularProgress.doc.mjs (props table, features, implementation notes)
 * - /packages/lab/src/CircularProgress/CircularProgress.test.tsx (tests for new/changed behavior)
 * - /packages/lab/src/CircularProgress/index.ts (exports if types change)
 * - /apps/storybook/stories/CircularProgress.stories.tsx (storybook stories)
 */

import {useId, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  colorVars,
  durationVars,
  easeVars,
  fontWeightVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps} from '@astryxdesign/core/utils';
import type {BaseProps} from '@astryxdesign/core';
import {themeProps} from '@astryxdesign/core/utils';

/**
 * Extensible variant map for CircularProgress.
 *
 * Theme packages can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/lab' {
 *   interface CircularProgressVariantMap {
 *     'brand': true;
 *   }
 * }
 * ```
 */
export interface CircularProgressVariantMap {
  accent: true;
  success: true;
  warning: true;
  error: true;
  neutral: true;
}

export type CircularProgressVariant = keyof CircularProgressVariantMap;

export type CircularProgressSize = 'sm' | 'md' | 'lg';

const SIZE_CONFIG = {
  sm: {diameter: 32, strokeWidth: 3},
  md: {diameter: 48, strokeWidth: 4},
  lg: {diameter: 64, strokeWidth: 5},
} as const;

export interface CircularProgressProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Current value of the circular progress.
   * Ignored when `isIndeterminate` is true.
   */
  value?: number;
  /**
   * Maximum value.
   * @default 100
   */
  max?: number;
  /**
   * Accessible label for the progress indicator. Required for a11y.
   */
  label: string;
  /**
   * When true, the label is visually hidden but remains accessible to screen readers.
   * @default true
   */
  isLabelHidden?: boolean;
  /**
   * When true, displays the formatted value (e.g. "75%") in the center of
   * the ring. Ignored when `isIndeterminate` is true or when `children`
   * provide custom center content.
   * @default false
   */
  hasValueLabel?: boolean;
  /**
   * Custom formatter for the value label.
   * @default (value, max) => `${Math.round((value / max) * 100)}%`
   */
  formatValueLabel?: (value: number, max: number) => string;
  /**
   * Content displayed in the center of the ring.
   * Typically a percentage string, icon, or custom content.
   * Takes precedence over `hasValueLabel`.
   */
  children?: ReactNode;
  /**
   * Diameter of the circular progress.
   * - 'sm': 32px
   * - 'md': 48px
   * - 'lg': 64px
   * @default 'md'
   */
  size?: CircularProgressSize;
  /**
   * Visual style variant mapped to semantic color tokens.
   * @default 'accent'
   */
  variant?: CircularProgressVariant;
  /**
   * When true, renders an animated indeterminate progress indicator.
   * Use when the progress amount is unknown (e.g. loading, processing).
   * The `value` and `hasValueLabel` props are ignored in this mode.
   * Respects `prefers-reduced-motion` by slowing the animation.
   * @default false
   */
  isIndeterminate?: boolean;
  /**
   * When true, the circular progress is visually disabled — the ring and
   * text use disabled colors. Use for canceled or inactive operations.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Test ID for testing utilities.
   */
  'data-testid'?: string;
}

// =============================================================================
// Indeterminate animation
// =============================================================================

const indeterminateRotation = stylex.keyframes({
  '0%': {transform: 'rotate(0deg)'},
  '100%': {transform: 'rotate(360deg)'},
});

// SVG dash percentages scale with the square viewport. A 300% gap exceeds every
// ring circumference; shifting the 2% + 300% pattern by 302% closes the loop.
const indeterminateDash = stylex.keyframes({
  '0%': {
    strokeDasharray: '2%, 300%',
    strokeDashoffset: '0%',
  },
  '50%': {
    strokeDasharray: '175%, 300%',
    strokeDashoffset: '-68%',
  },
  '100%': {
    strokeDasharray: '2%, 300%',
    strokeDashoffset: '-302%',
  },
});

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  rootWithLabel: {
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
  },
  svg: {
    display: 'block',
    transform: 'rotate(-90deg)',
  },
  svgIndeterminate: {
    display: 'block',
    animationName: indeterminateRotation,
    animationDuration: {
      default: '2s',
      '@media (prefers-reduced-motion: reduce)': '4s',
    },
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
  track: {
    fill: 'none',
    stroke: colorVars['--color-track'],
  },
  fill: {
    fill: 'none',
    strokeLinecap: 'round',
    transitionProperty: 'stroke-dashoffset',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  fillIndeterminate: {
    fill: 'none',
    strokeLinecap: 'round',
    animationName: indeterminateDash,
    animationDuration: {
      default: '1.5s',
      '@media (prefers-reduced-motion: reduce)': '3s',
    },
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  children: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  label: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
  },
  labelDisabled: {
    color: colorVars['--color-text-disabled'],
  },
  valueLabel: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
  valueLabelDisabled: {
    color: colorVars['--color-text-disabled'],
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  ringWrapper: {
    position: 'relative',
    display: 'inline-flex',
  },
});

const variantStyles = stylex.create({
  accent: {
    stroke: colorVars['--color-accent'],
  },
  success: {
    stroke: colorVars['--color-text-success'],
  },
  warning: {
    stroke: colorVars['--color-text-warning'],
  },
  error: {
    stroke: colorVars['--color-text-error'],
  },
  neutral: {
    stroke: colorVars['--color-text-disabled'],
  },
  disabled: {
    stroke: colorVars['--color-text-disabled'],
  },
});

const trackVariantStyles = stylex.create({
  accent: {
    stroke: colorVars['--color-accent-muted'],
  },
  success: {
    stroke: colorVars['--color-success-muted'],
  },
  warning: {
    stroke: colorVars['--color-warning-muted'],
  },
  error: {
    stroke: colorVars['--color-error-muted'],
  },
  neutral: {
    stroke: colorVars['--color-track'],
  },
});

function defaultFormatValueLabel(value: number, max: number): string {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `${pct}%`;
}

/**
 * A circular/radial progress indicator that shows completion as a ring.
 *
 * In determinate mode, displays a known value as an arc fill.
 * In indeterminate mode, shows an animated spinning indicator.
 * Supports center content via children for labels, percentages, or icons,
 * or an automatic formatted value label via `hasValueLabel`.
 *
 * @example
 * ```
 * <CircularProgress value={75} label="Upload progress" hasValueLabel />
 * <CircularProgress isIndeterminate label="Loading..." />
 * <CircularProgress value={3.2} max={5} label="Disk usage" hasValueLabel
 *   formatValueLabel={(v, m) => `${v} GB / ${m} GB`} />
 * <CircularProgress value={30} label="Canceled" isDisabled hasValueLabel />
 * ```
 */
export function CircularProgress({
  value = 0,
  max = 100,
  label,
  isLabelHidden = true,
  hasValueLabel = false,
  formatValueLabel = defaultFormatValueLabel,
  children,
  size = 'md',
  variant = 'accent',
  isIndeterminate = false,
  isDisabled = false,
  xstyle,
  className,
  style,
  'data-testid': dataTestId,
  ref,
  ...rest
}: CircularProgressProps) {
  const labelId = useId();
  const {diameter, strokeWidth} = SIZE_CONFIG[size];
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // A non-finite value or max (e.g. a NaN from an upstream `loaded / total`
  // with total 0) would otherwise leak into aria-valuenow, the value label,
  // and the arc geometry as the string "NaN". Treat it as empty progress,
  // matching the max=0 handling below.
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMax = Number.isFinite(max) ? max : 0;
  const clampedValue = Math.min(Math.max(0, safeValue), safeMax);
  const percentage = safeMax > 0 ? clampedValue / safeMax : 0;
  const dashoffset = circumference * (1 - percentage);
  const valueText = formatValueLabel(clampedValue, safeMax);

  const center = diameter / 2;

  const showLabel = !isLabelHidden;
  const showValueLabel = hasValueLabel && !isIndeterminate;
  const centerContent =
    children != null ? children : showValueLabel ? valueText : null;

  const fillVariant = isDisabled ? 'disabled' : variant;
  const trackVariant = isDisabled ? 'neutral' : variant;

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('circular-progress', {variant, size}),
        stylex.props(styles.root, showLabel && styles.rootWithLabel, xstyle),
        className,
        style,
      )}
      data-testid={dataTestId}
      {...rest}>
      <span
        id={labelId}
        {...stylex.props(
          showLabel ? styles.label : styles.visuallyHidden,
          showLabel && isDisabled && styles.labelDisabled,
        )}>
        {label}
      </span>

      <div {...stylex.props(styles.ringWrapper)}>
        <svg
          role="progressbar"
          aria-labelledby={labelId}
          aria-valuenow={isIndeterminate ? undefined : clampedValue}
          aria-valuemin={isIndeterminate ? undefined : 0}
          aria-valuemax={isIndeterminate ? undefined : safeMax}
          aria-valuetext={isIndeterminate ? undefined : valueText}
          width={diameter}
          height={diameter}
          viewBox={`0 0 ${diameter} ${diameter}`}
          {...stylex.props(
            isIndeterminate ? styles.svgIndeterminate : styles.svg,
          )}>
          <circle
            {...mergeProps(
              themeProps('circular-progress-track'),
              stylex.props(styles.track, trackVariantStyles[trackVariant]),
            )}
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
          />
          {isIndeterminate ? (
            <circle
              {...mergeProps(
                themeProps('circular-progress-fill', {variant: fillVariant}),
                stylex.props(
                  styles.fillIndeterminate,
                  variantStyles[fillVariant],
                ),
              )}
              cx={center}
              cy={center}
              r={radius}
              strokeWidth={strokeWidth}
            />
          ) : (
            <circle
              {...mergeProps(
                themeProps('circular-progress-fill', {variant: fillVariant}),
                stylex.props(styles.fill, variantStyles[fillVariant]),
              )}
              cx={center}
              cy={center}
              r={radius}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
            />
          )}
        </svg>

        {centerContent != null && (
          <div {...stylex.props(styles.children)}>
            {children != null ? (
              children
            ) : (
              <span
                {...stylex.props(
                  styles.valueLabel,
                  isDisabled && styles.valueLabelDisabled,
                )}>
                {valueText}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

CircularProgress.displayName = 'CircularProgress';
