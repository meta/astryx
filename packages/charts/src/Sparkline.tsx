// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sparkline.tsx
 * @input A value list plus fill, color, and size options
 * @output Compact label-free trend graphic — Chart root with one line/area mark
 * @position Composed component; delegates scales and layout to Chart
 *
 * @example
 * ```
 * <Sparkline data={[4, 7, 5, 9, 6, 11]} title="Requests over the last hour" />
 * ```
 */

'use client';

import type {Ref} from 'react';
import {useMemo} from 'react';
import type {BaseProps} from '@astryxdesign/core';
import {Chart} from './Chart';
import type {YBaseline} from './types';
import type {ChartTooltipProps} from './ChartTooltip';
import {area, line} from './marks';

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
  /** Accessible name for the chart image. */
  title?: string;
}

/**
 * A compact trend graphic with no axes, grid, or legend. Renders one
 * line — optionally with an area fill — inside a `Chart` with a tight
 * margin so it fits inline in tables, metric tiles, and list rows.
 * Give it a `title` so assistive technology announces what the trend shows.
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
  const rows = useMemo(
    () => data.map((value, index) => ({index, value})),
    [data],
  );

  const series = useMemo(
    () =>
      fill
        ? [area('value', {color, curve, opacity: 0.25, strokeWidth})]
        : [line('value', {color, curve, strokeWidth})],
    [fill, color, curve, strokeWidth],
  );

  return (
    <Chart
      ref={ref}
      data={rows}
      xKey="index"
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
