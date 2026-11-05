// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartAxis.tsx (v2)
 * @input Chart context scales, axis presentation props, and grapheme-safe text utilities
 * @output Renders an axis (top, right, bottom, left) using the chart's scales
 * @position Child of Chart v2; reads scales from chart context
 *
 * The axis edge line and tick marks are independently toggleable so callers
 * can compose: line-only, line + ticks, or line + ticks + grid (paired with
 * `<ChartGrid>`). To stay consistent with most charts, the bottom axis
 * draws its edge line by default and other positions don't.
 *
 * Labels use d3's native tick formatter for continuous scales by default (clean
 * numbers/dates) unless a `tickFormat` is supplied, and are auto-thinned to the
 * available width (horizontal) or height (vertical) to avoid overlap.
 *
 * Ticks use CSS transitions for smooth sliding during streaming updates.
 */

import {useCallback, useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {characterCount, truncateCharacters} from '@astryxdesign/core/utils';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {useChart} from './ChartContext';
import {isBandScale} from './utils';
import type {ScaleLinear, ScaleTime} from 'd3-scale';

export interface ChartAxisProps {
  /** Which edge to render the axis on */
  position: 'top' | 'right' | 'bottom' | 'left';
  /** Number of ticks (approximate — d3 decides final count) */
  tickCount?: number;
  /** Maximum number of tick labels to show. Labels are evenly skipped when exceeded. */
  maxTicks?: number;
  /** Custom tick formatter */
  tickFormat?: (value: unknown) => string;
  /** Truncate labels to this many user-perceived characters (appends "\u2026"). */
  truncate?: number;
  /** Enable smooth transitions for streaming (default: true) */
  animated?: boolean;
  /**
   * Show the axis edge line. Defaults to `true` for `position="bottom"`,
   * `false` otherwise. Forced to `true` when `showTicks` is enabled.
   * Pair with `<ChartGrid vertical />` and pass `showAxisLine` on the
   * corresponding side axis to keep the visual edge grounded.
   */
  showAxisLine?: boolean;
  /** Show perpendicular tick marks at each tick label. Default: `false`. */
  showTicks?: boolean;
}

const styles = stylex.create({
  axisLine: {
    stroke: colorVars['--color-text-primary'],
    strokeWidth: 1,
  },
  tickMark: {
    stroke: colorVars['--color-text-primary'],
    strokeWidth: 1,
  },
});

const TICK_SIZE = 6;

/**
 * Chart axis. Always draws tick labels; the axis edge line and tick marks
 * are independently toggleable. Pair with `<ChartGrid>` for grid lines.
 *
 * @example
 * ```
 * <ChartAxis position="bottom" />               // edge line + labels
 * <ChartAxis position="left" />                 // labels only (no edge line)
 * <ChartAxis position="left" showAxisLine showTicks />
 * ```
 */
export function ChartAxis({
  position,
  tickCount = 5,
  maxTicks,
  tickFormat,
  truncate,
  animated = true,
  showAxisLine = position === 'bottom',
  showTicks = false,
}: ChartAxisProps) {
  // Tick marks need an axis line to anchor against; force it on when ticks
  // are enabled so the two visuals stay coherent.
  const renderAxisLine = showAxisLine || showTicks;
  const {width, height, xScale, yScale, yBandScale} = useChart();

  const isHorizontal = position === 'top' || position === 'bottom';
  // A categorical y-axis (e.g. heatmap rows) is exposed as `yBandScale`; prefer
  // it over the linear `yScale` so a left/right axis renders the row categories
  // (days) aligned to each band instead of meaningless value ticks.
  const scale = isHorizontal ? xScale : (yBandScale ?? yScale);

  // Sanitize the tick count before it reaches d3. `.ticks()` targets ~N ticks
  // and allocates an array that large, so a huge N throws `RangeError: Invalid
  // array length` and crashes the render; a non-finite or negative N would
  // otherwise blank the axis. Clamp to a sane integer (0 still means "no
  // ticks") and fall back to the default for invalid input. Shared by tick
  // generation and the auto formatter so the two stay in sync.
  const safeTickCount =
    Number.isFinite(tickCount) && tickCount >= 0
      ? Math.min(Math.floor(tickCount), 1000)
      : 5;

  // Default label formatter. For continuous (linear/time) scales, use d3's own
  // tick formatter so numbers get sensible precision (no floating-point dust
  // like "0.30000000000000004") and dates render as calendar labels instead of
  // `String(Date)`. Band scales keep their category strings.
  const autoFormat = useMemo<((v: unknown) => string) | null>(() => {
    if (tickFormat || isBandScale(scale)) {
      return null;
    }
    const continuous = scale as
      ScaleLinear<number, number> | ScaleTime<number, number>;
    const fmt = continuous.tickFormat(safeTickCount);
    return (v: unknown) => fmt(v as number & Date);
  }, [tickFormat, scale, safeTickCount]);

  const format = useCallback(
    (value: unknown): string => {
      const str = (tickFormat ?? autoFormat ?? String)(value);
      if (!truncate) {
        return str;
      }
      const shortened = truncateCharacters(str, truncate, '');
      return shortened === str ? str : shortened + '\u2026';
    },
    [tickFormat, autoFormat, truncate],
  );

  const ticks = useMemo(() => {
    // Format each generated tick once so density and rendering share the same
    // grapheme-safe label instead of repeating consumer formatting/segmentation.
    let allTicks: {value: unknown; offset: number; label: string}[];
    if (isBandScale(scale)) {
      allTicks = scale.domain().map(d => ({
        value: d,
        offset: (scale(d) ?? 0) + scale.bandwidth() / 2,
        label: format(d),
      }));
    } else {
      const linearScale = scale as
        ScaleLinear<number, number> | ScaleTime<number, number>;
      allTicks = linearScale.ticks(safeTickCount).map(d => ({
        value: d,
        offset: linearScale(d as number & Date),
        label: format(d),
      }));
    }

    // Cap label count to avoid overlap. An explicit `maxTicks` always wins.
    // Otherwise derive a cap from the available space and label size so dense
    // axes don't smear into an unreadable blur: width ÷ widest-label for
    // horizontal (e.g. 30 daily categories), height ÷ line-height for vertical
    // (e.g. a categorical y-axis on a horizontal bar chart). Labels are then
    // evenly skipped down to the cap.
    let cap = maxTicks;
    if (cap == null && allTicks.length > 1) {
      if (isHorizontal && width > 0) {
        const widestChars = allTicks.reduce(
          (m, tick) => Math.max(m, characterCount(tick.label)),
          1,
        );
        const approxLabelPx = widestChars * 7 + 16;
        cap = Math.max(1, Math.floor(width / approxLabelPx));
      } else if (!isHorizontal && height > 0) {
        // ~12px glyph + breathing room keeps stacked labels from touching.
        cap = Math.max(1, Math.floor(height / 18));
      }
    }
    if (cap && allTicks.length > cap) {
      const step = Math.ceil(allTicks.length / cap);
      allTicks = allTicks.filter((_, i) => i % step === 0);
    }

    return allTicks;
  }, [scale, safeTickCount, maxTicks, isHorizontal, width, height, format]);

  const transform =
    position === 'bottom'
      ? `translate(0,${height})`
      : position === 'right'
        ? `translate(${width},0)`
        : undefined;

  // For the bottom axis, draw the axis line at y=0 when the domain spans
  // negative values (so the axis line still represents zero, not the chart edge).
  const axisLineY = (() => {
    // Categorical y (e.g. heatmap rows): there is no meaningful zero, and the
    // linear yScale is degenerate — anchor the bottom edge line to the plot edge
    // so it frames the grid instead of cutting across the cells.
    if (position !== 'bottom' || yBandScale) {
      return 0;
    }
    const domain = yScale.domain();
    if (domain[0] < 0 && domain[1] > 0) {
      return yScale(0) - height;
    }
    return 0;
  })();

  const tickTransition = animated
    ? 'transform 150ms linear, opacity 150ms ease'
    : undefined;

  return (
    <g transform={transform} role="group" aria-label={`${position} axis`}>
      {renderAxisLine && (
        <line
          x1={0}
          x2={isHorizontal ? width : 0}
          y1={isHorizontal ? axisLineY : 0}
          y2={isHorizontal ? axisLineY : height}
          {...stylex.props(styles.axisLine)}
        />
      )}
      {ticks.map(({value, offset, label}) => {
        // Key off the raw tick value, not the formatted label: distinct ticks
        // can format (or truncate) to the same string and would collide as keys.
        const key = String(value);
        const isVisible = isHorizontal
          ? offset >= -10 && offset <= width + 10
          : offset >= -10 && offset <= height + 10;

        if (isHorizontal) {
          const y = position === 'bottom' ? TICK_SIZE : -TICK_SIZE;
          return (
            <g
              key={key}
              style={{
                transform: `translateX(${offset}px)`,
                transition: tickTransition,
                opacity: isVisible ? 1 : 0,
              }}>
              {showTicks && <line y2={y} {...stylex.props(styles.tickMark)} />}
              <text
                y={position === 'bottom' ? TICK_SIZE + 12 : -(TICK_SIZE + 4)}
                textAnchor="middle"
                fill="var(--color-text-secondary)"
                fontSize={12}>
                {label}
              </text>
            </g>
          );
        }
        // Vertical axis
        const x = position === 'left' ? -TICK_SIZE : TICK_SIZE;
        return (
          <g
            key={key}
            style={{
              transform: `translateY(${offset}px)`,
              transition: tickTransition,
              opacity: isVisible ? 1 : 0,
            }}>
            {showTicks && <line x2={x} {...stylex.props(styles.tickMark)} />}
            <text
              x={position === 'left' ? -(TICK_SIZE + 4) : TICK_SIZE + 4}
              dy="0.32em"
              textAnchor={position === 'left' ? 'end' : 'start'}
              fill="var(--color-text-secondary)"
              fontSize={12}>
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
