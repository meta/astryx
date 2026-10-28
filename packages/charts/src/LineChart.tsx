// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LineChart.tsx
 * @input Data rows, an x field, one or more y fields, and presentation options
 * @output Ready-to-use line chart — Chart root with line marks, axes, legend, and tooltip
 * @position Composed component; delegates scales, layout, and interaction to Chart
 *
 * @example
 * ```
 * <LineChart
 *   data={monthlyRevenue}
 *   xKey="month"
 *   yKeys={['revenue', 'trend']}
 *   title="Revenue vs trend"
 * />
 * ```
 */

'use client';

import type {Ref, ReactNode} from 'react';
import {useMemo} from 'react';
import type {BaseProps} from '@astryxdesign/core';
import {Chart} from './Chart';
import type {ChartMargin, YBaseline} from './types';
import type {ChartLegendProps} from './ChartLegend';
import type {ChartTooltipProps} from './ChartTooltip';
import {ChartAxis} from './ChartAxis';
import {ChartGrid} from './ChartGrid';
import {line} from './marks';

export interface LineChartProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root chart container. */
  ref?: Ref<HTMLDivElement>;
  /** Rows to visualize. Each row holds the x field and one value per y key. */
  data: Record<string, unknown>[];
  /** Field name read from each data row for the shared x scale. */
  xKey: string;
  /** Value fields, one line series each. Pass a single string for one series. */
  yKeys: string | string[];
  /** Human-readable series labels, keyed by y field. Falls back to the key. */
  labels?: Record<string, string>;
  /** Static series colors, one per y key. Omitted entries use the theme palette. */
  colors?: (string | undefined)[];
  /** Line interpolation between points. @default 'monotone' */
  curve?: 'linear' | 'monotone' | 'natural' | 'step';
  /** Stroke width in CSS pixels. @default 2 */
  strokeWidth?: number;
  /** Draw a dot at each data point. @default false */
  dots?: boolean;
  /** Chart height in CSS pixels. @default 300 */
  height?: number;
  /** Partial plot inset override in CSS pixels. */
  margin?: Partial<ChartMargin>;
  /** How the y-domain is derived when `yDomain` is not set. @default 'auto' */
  yBaseline?: YBaseline;
  /** Explicit y-domain [min, max]. Authoritative — disables baseline/headroom. */
  yDomain?: [number, number];
  /** Explicit x-domain [min, max] for numeric/linear x. */
  xDomain?: [number, number];
  /** Show the derived legend. @default true when more than one series */
  legend?: boolean | ChartLegendProps;
  /** Show the grouped pointer tooltip. @default true */
  tooltip?: boolean | Omit<ChartTooltipProps, 'series'>;
  /** Visible chart heading and accessible name for the chart image. */
  title?: string;
  /** Visible supporting text and accessible description for the chart image. */
  subtitle?: string;
  /** Additional SVG content rendered after the built-in tooltip. */
  children?: ReactNode;
}

/**
 * A ready-to-use line chart for one or more value series over a shared x
 * field. Builds one `line()` mark per y key and renders them in a `Chart`
 * with bottom/left axes, a grid, a legend, and a grouped hover tooltip.
 * Series without an explicit color take successive theme palette slots from
 * the chart root, so hover swatches, legend keys, and strokes always agree.
 */
export function LineChart({
  data,
  xKey,
  yKeys,
  labels,
  colors,
  curve = 'monotone',
  strokeWidth = 2,
  dots = false,
  height = 300,
  margin,
  yBaseline,
  yDomain,
  xDomain,
  legend,
  tooltip = true,
  title,
  subtitle,
  children,
  ref,
  xstyle,
  className,
  style,
  ...rest
}: LineChartProps) {
  const keys = useMemo(() => (Array.isArray(yKeys) ? yKeys : [yKeys]), [yKeys]);

  const series = useMemo(
    () =>
      keys.map((key, i) =>
        line(key, {
          label: labels?.[key] ?? key,
          color: colors?.[i],
          curve,
          strokeWidth,
          dots,
        }),
      ),
    [keys, labels, colors, curve, strokeWidth, dots],
  );

  return (
    <Chart
      ref={ref}
      data={data}
      xKey={xKey}
      series={series}
      height={height}
      margin={margin}
      yBaseline={yBaseline}
      yDomain={yDomain}
      xDomain={xDomain}
      grid={<ChartGrid horizontal />}
      axes={
        <>
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
        </>
      }
      legend={legend ?? keys.length > 1}
      tooltip={tooltip}
      title={title}
      subtitle={subtitle}
      xstyle={xstyle}
      className={className}
      style={style}
      {...rest}>
      {children}
    </Chart>
  );
}

LineChart.displayName = 'LineChart';
