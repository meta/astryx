// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Stat.tsx
 * @input Uses React, StyleX, and Astryx core theme tokens/utilities
 * @output Exports Stat component, StatProps, StatDelta, StatDeltaDirection,
 *   StatDeltaSentiment, StatSize types
 * @position Lab implementation; consumed by packages/lab/src/index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Stat/Stat.doc.mjs (props table, features, implementation notes)
 * - /packages/lab/src/Stat/Stat.test.tsx (tests for new/changed behavior)
 * - /packages/lab/src/Stat/index.ts (exports if types change)
 * - /apps/storybook/stories/Stat.stories.tsx (examples)
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  fontWeightVars,
  spacingVars,
  textSizeVars,
  typeScaleVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import type {BaseProps} from '@astryxdesign/core';
import {mergeProps} from '@astryxdesign/core/utils';
import {themeProps} from '@astryxdesign/core/utils';

/**
 * Base styles
 */
const styles = stylex.create({
  base: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacingVars['--spacing-1'],
    minWidth: 0,
  },
  label: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacingVars['--spacing-2'],
    minWidth: 0,
  },
  value: {
    fontFamily: typographyVars['--font-family-heading'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    lineHeight: typeScaleVars['--text-heading-2-leading'],
    color: colorVars['--color-text-primary'],
    fontVariantNumeric: 'tabular-nums',
  },
  delta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  deltaGlyph: {
    flexShrink: 0,
  },
  description: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
  },
  media: {
    marginTop: spacingVars['--spacing-1'],
    alignSelf: 'stretch',
    minWidth: 0,
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
});

/**
 * Value font-size per size variant
 */
const sizeStyles = stylex.create({
  sm: {
    fontSize: textSizeVars['--font-size-xl'],
  },
  md: {
    fontSize: textSizeVars['--font-size-2xl'],
  },
  lg: {
    fontSize: textSizeVars['--font-size-3xl'],
  },
});

/**
 * Delta color per resolved sentiment
 */
const sentimentStyles = stylex.create({
  positive: {
    color: colorVars['--color-text-success'],
  },
  negative: {
    color: colorVars['--color-text-error'],
  },
  neutral: {
    color: colorVars['--color-text-secondary'],
  },
});

/** Trend direction of a delta; picks the glyph (up/down arrow, flat dash). */
export type StatDeltaDirection = 'up' | 'down' | 'flat';

/** Color tone of a delta; overrides the default direction mapping. */
export type StatDeltaSentiment = 'positive' | 'negative' | 'neutral';

/** Size variant controlling the value's font size. */
export type StatSize = 'sm' | 'md' | 'lg';

/**
 * Change indicator rendered next to the value: a direction glyph plus
 * colored, pre-formatted change text.
 */
export interface StatDelta {
  /** Pre-formatted change text, e.g. "+12.4%" or "-8 ms". */
  value: string;
  /** Trend direction. Picks the glyph and the default sentiment. */
  direction: StatDeltaDirection;
  /**
   * Overrides the direction-to-color mapping for inverted metrics where
   * down is good (error rate, latency): up maps to positive, down to
   * negative, flat to neutral by default.
   */
  sentiment?: StatDeltaSentiment;
}

/** Default direction-to-sentiment mapping (up=good, down=bad). */
const DIRECTION_SENTIMENT: Record<StatDeltaDirection, StatDeltaSentiment> = {
  up: 'positive',
  down: 'negative',
  flat: 'neutral',
};

/** Screen-reader text announced after the delta value. */
const DIRECTION_TEXT: Record<StatDeltaDirection, string> = {
  up: 'trending up',
  down: 'trending down',
  flat: 'flat',
};

/** Inline glyph paths (12x12 viewBox): up-right arrow, down-right arrow, dash. */
const DELTA_GLYPH_PATHS: Record<StatDeltaDirection, string> = {
  up: 'M3.5 8.5L8.5 3.5M8.5 3.5H4.75M8.5 3.5V7.25',
  down: 'M3.5 3.5L8.5 8.5M8.5 8.5H4.75M8.5 8.5V4.75',
  flat: 'M2.5 6H9.5',
};

export interface StatProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Metric name shown above the value, e.g. "Total requests".
   */
  label: string;
  /**
   * The headline metric. Rendered large with tabular numerals so digits
   * keep a fixed width. Pass a pre-formatted string like "1.2M".
   */
  value: ReactNode;
  /**
   * Change indicator rendered next to the value: an up/down/flat glyph
   * plus colored text. `sentiment` overrides the direction color mapping
   * for inverted metrics like error rate.
   */
  delta?: StatDelta;
  /**
   * Muted supporting line under the value, e.g. "vs. previous 30 days".
   */
  description?: string;
  /**
   * Trend slot rendered below the text content, e.g. a sparkline or mini
   * chart. Stat does not render a chart itself.
   */
  media?: ReactNode;
  /**
   * Size variant controlling the value's font size.
   * @default 'md'
   */
  size?: StatSize;
}

/**
 * A KPI/metric display: label, large tabular-nums value, optional
 * sentiment-aware delta, supporting description, and a trend media slot.
 *
 * The delta's color follows its direction (up=success, down=error,
 * flat=secondary) unless `sentiment` overrides it — use that for inverted
 * metrics where a drop is good (error rate, latency, churn).
 *
 * Styles use Astryx theme tokens via StyleX.
 * Wrap your app in `<Theme>` to apply a theme.
 *
 * @example
 * ```
 * <Stat label="Total requests" value="2.4M" delta={{value: '+12.4%', direction: 'up'}} />
 * <Stat
 *   label="Error rate"
 *   value="0.42%"
 *   delta={{value: '-0.08%', direction: 'down', sentiment: 'positive'}}
 *   description="vs. previous 30 days"
 * />
 * <Stat label="Active users" value="18,204" size="lg" media={<Sparkline />} />
 * ```
 */
export function Stat({
  label,
  value,
  delta,
  description,
  media,
  size = 'md',
  xstyle,
  className,
  style,
  ref,
  ...props
}: StatProps) {
  const sentiment =
    delta == null
      ? null
      : (delta.sentiment ?? DIRECTION_SENTIMENT[delta.direction]);

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('stat', {size}),
        stylex.props(styles.base, xstyle),
        className,
        style,
      )}
      {...props}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.valueRow)}>
        <span {...stylex.props(styles.value, sizeStyles[size])}>{value}</span>
        {delta != null && sentiment != null ? (
          <span
            data-sentiment={sentiment}
            {...stylex.props(styles.delta, sentimentStyles[sentiment])}>
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              width={12}
              height={12}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...stylex.props(styles.deltaGlyph)}>
              <path d={DELTA_GLYPH_PATHS[delta.direction]} />
            </svg>
            {delta.value}
            <span {...stylex.props(styles.srOnly)}>
              ({DIRECTION_TEXT[delta.direction]})
            </span>
          </span>
        ) : null}
      </span>
      {description != null ? (
        <span {...stylex.props(styles.description)}>{description}</span>
      ) : null}
      {media != null ? (
        <div {...stylex.props(styles.media)}>{media}</div>
      ) : null}
    </div>
  );
}

Stat.displayName = 'Stat';
