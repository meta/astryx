// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sparkline.tsx
 * @input A value list plus fill, color, and size options
 * @output Compact label-free trend graphic — Chart root with one line/area mark
 * @position Composed component; delegates scales and layout to Chart
 */

'use client';

import type {Ref} from 'react';
import {useMemo} from 'react';
import type {BaseProps} from '@astryxdesign/core';
import {useTranslator} from '@astryxdesign/core';
import {Chart} from './Chart';
import type {YBaseline} from './types';
import type {ChartTooltipProps} from './ChartTooltip';
import {area} from './marks/area';
import {line} from './marks/line';

const SPARKLINE_MARGIN = {top: 2, right: 2, bottom: 2, left: 2};

export interface SparklineProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root chart container. */
  ref?: Ref<HTMLDivElement>;
  /** Values plotted left to right in order. */
  data: number[];
  /** Fill the area under the line. @default true */
  fill?: boolean;
  /** Static stroke/fill color. Omitted entries use the theme palette. */
  color?: string;
  /** Line interpolation between points. @default 'monotone' */
  curve?: 'linear' | 'monotone' | 'natural' | 'step';
  /** Stroke width in CSS pixels. @default 1.5 */
  strokeWidth?: number;
  /** Chart height in CSS pixels. @default 32 */
  height?: number;
  /** How the y-domain is derived. @default 'data' (tight fit, no baseline) */
  yBaseline?: YBaseline;
  /** Show the pointer tooltip. @default false */
  tooltip?: boolean | Omit<ChartTooltipProps, 'series'>;
  /** Accessible name for the chart image. Paints a visible heading above the plot, so only set it when the layout has room. */
  title?: string;
}

/**
 * A compact trend graphic with no axes, grid, or legend. Renders one
 * line — optionally with an area fill — inside a `Chart` with a tight
 * margin so it fits inline in tables, metric tiles, and list rows.
 * Give it a `title` so assistive technology announces what the trend shows.
 *
 * @example
 * ```
 * <Sparkline data={[4, 7, 5, 9, 6, 11]} title="Requests over the last hour" />
 * ```
 */
export function Sparkline({
  data,
  fill = true,
  color,
  curve = 'monotone',
  strokeWidth = 1.5,
  height = 32,
  yBaseline = 'data',
  tooltip = false,
  title,
  ref,
  xstyle,
  className,
  style,
  ...rest
}: SparklineProps) {
  const t = useTranslator();
  const rows = useMemo(
    () => data.map((value, index) => ({index: index + 1, value})),
    [data],
  );

  // The synthetic row keys are user-facing (accessible name, data table),
  // so both names resolve through the catalog.
  const valueLabel = t('@astryx.chart.sparklineValueLabel');
  const positionLabel = t('@astryx.chart.sparklinePositionLabel');
  const series = useMemo(
    () =>
      fill
        ? [
            area('value', {
              color,
              curve,
              opacity: 0.25,
              strokeWidth,
              label: valueLabel,
            }),
          ]
        : [line('value', {color, curve, strokeWidth, label: valueLabel})],
    [fill, color, curve, strokeWidth, valueLabel],
  );

  return (
    <Chart
      ref={ref}
      data={rows}
      xKey="index"
      xLabel={positionLabel}
      series={series}
      height={height}
      margin={SPARKLINE_MARGIN}
      yBaseline={yBaseline}
      tooltip={tooltip}
      title={title}
      xstyle={xstyle}
      className={className}
      style={style}
      {...rest}
    />
  );
}

Sparkline.displayName = 'Sparkline';
