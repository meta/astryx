// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartCandlestick.tsx
 * @input Chart context plus public StyleX data variables and optional colors
 * @output Renders candlestick/box-whisker marks for OHLC or statistical data
 * @position Child of Chart; reads scales from context
 *
 * Two variants:
 * - `'default'` — filled body with whiskers (traditional candlestick/box plot)
 * - `'bar'` — OHLC bar — vertical line with open/close ticks
 */

import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {useChart} from './ChartContext';
import {isBandScale} from './utils';

export interface ChartCandlestickProps {
  /** Data key for the high/max value (top of whisker) */
  high: string;
  /** Data key for the low/min value (bottom of whisker) */
  low: string;
  /** Data key for the open/Q1 value (bottom of body) */
  open: string;
  /** Data key for the close/Q3 value (top of body) */
  close: string;
  /**
   * Visual variant:
   * - `'default'` — filled body with whiskers
   * - `'bar'` — OHLC bar — vertical range line, left tick at open, right tick at close
   */
  variant?: 'default' | 'bar';
  /** Color when close >= open (bullish / positive) */
  upColor?: string;
  /** Color when close < open (bearish / negative) */
  downColor?: string;
  /** Fixed color — overrides up/down logic. Use for box plots. */
  color?: string;
  /** Body width as fraction of band width (default: 0.6) */
  bodyWidth?: number;
  /** Stroke width for whiskers and bar lines */
  strokeWidth?: number;
  /** Corner radius on body (default variant only) */
  radius?: number;
}

/**
 * Candlestick / box-whisker marks.
 *
 * @example
 * ```
 * <ChartCandlestick
 *   high="high" low="low" open="open" close="close"
 *   upColor={useChartColors().semantic.positive}
 *   downColor={useChartColors().semantic.negative}
 * />
 * <ChartCandlestick
 *   variant="bar"
 *   high="max" low="min" open="q1" close="median"
 *   color={useChartColors().categorical(1)[0]}
 * />
 * ```
 */
export function ChartCandlestick({
  high,
  low,
  open,
  close,
  variant = 'default',
  upColor,
  downColor,
  color,
  bodyWidth = 0.6,
  strokeWidth = 1.5,
  radius = 2,
}: ChartCandlestickProps) {
  const {data, xKey, xScale, yScale} = useChart();

  if (!isBandScale(xScale)) {
    return null;
  }
  const bw = xScale.bandwidth();

  return (
    <g>
      {data.map((d, i) => {
        const xVal = xScale(String(d[xKey]));
        if (xVal == null) {
          return null;
        }

        const hVal = typeof d[high] === 'number' ? (d[high] as number) : 0;
        const lVal = typeof d[low] === 'number' ? (d[low] as number) : 0;
        const oVal = typeof d[open] === 'number' ? (d[open] as number) : 0;
        const cVal = typeof d[close] === 'number' ? (d[close] as number) : 0;

        const isUp = cVal >= oVal;
        const fill =
          color ??
          (isUp
            ? (upColor ?? dataVars['--color-data-categorical-green'])
            : (downColor ?? dataVars['--color-data-categorical-red']));
        const centerX = xVal + bw / 2;

        const yHigh = yScale(hVal);
        const yLow = yScale(lVal);
        const yOpen = yScale(oVal);
        const yClose = yScale(cVal);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyBot = Math.max(yOpen, yClose);

        if (variant === 'bar') {
          // OHLC bar: vertical line (high→low), left tick at open, right tick at close
          const tickLen = bw * bodyWidth * 0.4;
          return (
            <g key={i}>
              {/* Vertical range line: high to low */}
              <line
                x1={centerX}
                x2={centerX}
                y1={yHigh}
                y2={yLow}
                stroke={fill}
                strokeWidth={strokeWidth}
              />
              {/* Open tick — extends left */}
              <line
                x1={centerX - tickLen}
                x2={centerX}
                y1={yOpen}
                y2={yOpen}
                stroke={fill}
                strokeWidth={strokeWidth}
              />
              {/* Close tick — extends right */}
              <line
                x1={centerX}
                x2={centerX + tickLen}
                y1={yClose}
                y2={yClose}
                stroke={fill}
                strokeWidth={strokeWidth}
              />
            </g>
          );
        }

        // Default variant: filled body with whiskers
        const bodyW = bw * bodyWidth;
        const bodyX = centerX - bodyW / 2;
        const bodyH = Math.max(1, bodyBot - bodyTop);

        return (
          <g key={i}>
            <line
              x1={centerX}
              x2={centerX}
              y1={yHigh}
              y2={bodyTop}
              stroke={fill}
              strokeWidth={strokeWidth}
            />
            <line
              x1={centerX}
              x2={centerX}
              y1={bodyBot}
              y2={yLow}
              stroke={fill}
              strokeWidth={strokeWidth}
            />
            <rect
              x={bodyX}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={fill}
              rx={radius}
              ry={radius}
            />
          </g>
        );
      })}
    </g>
  );
}
