// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MetricTile.tsx
 * @input Label, headline value, optional delta/description, and a trend slot
 * @output KPI tile — label, large tabular value, sentiment-aware delta, trend graphic
 * @position Composed dashboard primitive; pair with Sparkline via the `trend` slot
 *
 * @example
 * ```
 * <MetricTile
 *   label="Total requests"
 *   value="2.4M"
 *   delta={{value: '+12.4%', direction: 'up'}}
 *   description="vs. previous 30 days"
 *   trend={<Sparkline data={[4, 7, 5, 9, 6, 11]} />}
 * />
 * ```
 */

'use client';

import type {Ref, ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {useTranslator} from '@astryxdesign/core';
import {mergeProps} from '@astryxdesign/core/utils';
import {themeProps} from '@astryxdesign/core/utils';
import {
  colorVars,
  fontWeightVars,
  spacingVars,
  textSizeVars,
  typeScaleVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

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
  trend: {
    marginTop: spacingVars['--spacing-1'],
    alignSelf: 'stretch',
    minWidth: 0,
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    paddingTop: 0,
    paddingBottom: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    marginBlockStart: '-1px',
    marginBlockEnd: 0,
    marginInlineStart: 0,
    marginInlineEnd: 0,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
});

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

/** Trend direction of a delta; picks the glyph (arrow up/down, flat dash). */
export type MetricTileDeltaDirection = 'up' | 'down' | 'flat';

/** Color tone of a delta; overrides the default direction mapping. */
export type MetricTileDeltaSentiment = 'positive' | 'negative' | 'neutral';

/** Size variant controlling the value's font size. */
export type MetricTileSize = 'sm' | 'md' | 'lg';

/**
 * Change indicator rendered next to the value: a direction glyph plus
 * colored, pre-formatted change text.
 */
export interface MetricTileDelta {
  /** Pre-formatted change text, e.g. "+12.4%" or "-8 ms". */
  value: string;
  /** Trend direction. Picks the glyph and the default sentiment. */
  direction: MetricTileDeltaDirection;
  /**
   * Overrides the direction-to-color mapping for inverted metrics where
   * down is good (error rate, latency): up maps to positive, down to
   * negative, flat to neutral by default.
   */
  sentiment?: MetricTileDeltaSentiment;
}

/** Default direction-to-sentiment mapping (up=good, down=bad). */
const DIRECTION_SENTIMENT: Record<
  MetricTileDeltaDirection,
  MetricTileDeltaSentiment
> = {
  up: 'positive',
  down: 'negative',
  flat: 'neutral',
};

/** Catalog keys for the screen-reader text announced after the delta value. */
const DIRECTION_MESSAGE_KEYS: Record<
  MetricTileDeltaDirection,
  | '@astryx.chart.deltaTrendingUp'
  | '@astryx.chart.deltaTrendingDown'
  | '@astryx.chart.deltaFlat'
> = {
  up: '@astryx.chart.deltaTrendingUp',
  down: '@astryx.chart.deltaTrendingDown',
  flat: '@astryx.chart.deltaFlat',
};

/** Inline glyph paths (12x12 viewBox): up-right arrow, down-right arrow, dash. */
const DELTA_GLYPH_PATHS: Record<MetricTileDeltaDirection, string> = {
  up: 'M3.5 8.5L8.5 3.5M8.5 3.5H4.75M8.5 3.5V7.25',
  down: 'M3.5 3.5L8.5 8.5M8.5 8.5H4.75M8.5 8.5V4.75',
  flat: 'M2.5 6H9.5',
};

export interface MetricTileProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element. */
  ref?: Ref<HTMLDivElement>;
  /** Metric name shown above the value, e.g. "Total requests". */
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
  delta?: MetricTileDelta;
  /** Muted supporting line under the value, e.g. "vs. previous 30 days". */
  description?: string;
  /**
   * Trend graphic rendered below the text content, e.g. a Sparkline.
   * MetricTile does not render a chart itself.
   */
  trend?: ReactNode;
  /** Size variant controlling the value's font size. @default 'md' */
  size?: MetricTileSize;
}

/**
 * A KPI/metric tile: label, large tabular-nums value, optional
 * sentiment-aware delta, supporting description, and a trend slot for a
 * Sparkline or mini chart.
 *
 * The delta's color follows its direction (up=success, down=error,
 * flat=secondary) unless `sentiment` overrides it — use that for inverted
 * metrics where a drop is good (error rate, latency, churn).
 */
export function MetricTile({
  label,
  value,
  delta,
  description,
  trend,
  size = 'md',
  xstyle,
  className,
  style,
  ref,
  ...props
}: MetricTileProps) {
  const sentiment =
    delta == null
      ? null
      : (delta.sentiment ?? DIRECTION_SENTIMENT[delta.direction]);
  const t = useTranslator();

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('metric-tile', {size}),
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
              ({t(DIRECTION_MESSAGE_KEYS[delta.direction])})
            </span>
          </span>
        ) : null}
      </span>
      {description != null ? (
        <span {...stylex.props(styles.description)}>{description}</span>
      ) : null}
      {trend != null ? (
        <div {...stylex.props(styles.trend)}>{trend}</div>
      ) : null}
    </div>
  );
}

MetricTile.displayName = 'MetricTile';
