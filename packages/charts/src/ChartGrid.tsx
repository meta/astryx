// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartGrid.tsx (v2)
 * @input Chart context scales and dimensions, guide visibility, and tick density
 * @output Grid lines behind chart marks
 * @position Child of Chart v2; reads scales from chart context
 */

import {useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {useChart} from './ChartContext';
import {isBandScale} from './utils';
import type {ScaleLinear, ScaleTime} from 'd3-scale';

export interface ChartGridProps {
  /** Show horizontal grid lines. Default: `true`. */
  horizontal?: boolean;
  /** Show vertical grid lines. Default: `false`. */
  vertical?: boolean;
  /**
   * Approximate number of grid lines per axis. Match your `<ChartAxis>`
   * `tickCount` so grid lines and tick labels land on the same values.
   * Default: `5`.
   */
  tickCount?: number;
}

const styles = stylex.create({
  gridLine: {
    stroke: colorVars['--color-border-emphasized'],
    strokeWidth: 1,
  },
});

/**
 * Grid lines behind chart marks.
 *
 * Pair with `<ChartAxis>` so users always see an axis line beside the
 * grid — the components are designed to be used together.
 *
 * @example
 * ```
 * <ChartGrid />                 // horizontal grid lines (default)
 * <ChartGrid horizontal vertical />
 * ```
 */
export function ChartGrid({
  horizontal = true,
  vertical = false,
  tickCount = 5,
}: ChartGridProps) {
  const {width, height, xScale, yScale} = useChart();

  // Sanitize the tick count before it reaches d3's `.ticks()`: it targets ~N
  // ticks and allocates an array that large, so a huge N throws `RangeError:
  // Invalid array length` and crashes the render, while a non-finite or
  // negative N would misbehave. Clamp to a sane integer (0 still means "no
  // lines") and fall back to the default for invalid input.
  const safeTickCount =
    Number.isFinite(tickCount) && tickCount >= 0
      ? Math.min(Math.floor(tickCount), 1000)
      : 5;

  // Skip the y=0 line when emphasizing it via the axis. Without this we'd
  // double-draw on top of the axis line. Each line carries its tick `value`,
  // used as a stable React key — the pixel position can be NaN/duplicated for
  // degenerate (zero-range / unmeasured) scales and would collide as a key.
  const hLines = useMemo(() => {
    if (!horizontal) {
      return [];
    }
    return yScale
      .ticks(safeTickCount)
      .filter(tick => tick !== 0)
      .map(tick => ({value: tick, pos: yScale(tick)}));
  }, [horizontal, yScale, safeTickCount]);

  const vLines = useMemo(() => {
    if (!vertical) {
      return [];
    }
    if (isBandScale(xScale)) {
      return xScale
        .domain()
        .map(d => ({value: d, pos: (xScale(d) ?? 0) + xScale.bandwidth() / 2}));
    }
    const linear = xScale as
      ScaleLinear<number, number> | ScaleTime<number, number>;
    return linear
      .ticks(safeTickCount)
      .map(d => ({value: String(d), pos: linear(d as number & Date)}));
  }, [vertical, xScale, safeTickCount]);

  return (
    <g>
      {hLines.map(({value, pos}) => (
        <line
          key={`h-${value}`}
          x1={0}
          x2={width}
          y1={pos}
          y2={pos}
          {...stylex.props(styles.gridLine)}
        />
      ))}
      {vLines.map(({value, pos}) => (
        <line
          key={`v-${value}`}
          x1={pos}
          x2={pos}
          y1={0}
          y2={height}
          {...stylex.props(styles.gridLine)}
        />
      ))}
    </g>
  );
}
