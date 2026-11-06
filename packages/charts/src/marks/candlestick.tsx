// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/candlestick.tsx
 * @output Candlestick (OHLC) series. Renders on both band and linear/time x
 *   scales; candles missing any OHLC field are skipped rather than drawn to 0.
 */

import type {SeriesDef, ResolvedPoint, SeriesContext} from '../types';
import {xPixel, isBandScale} from '../utils';

export interface CandlestickOptions {
  open: string;
  high: string;
  low: string;
  close: string;
  upColor?: string;
  downColor?: string;
}

/** Read a datum field as a finite number, or NaN when missing/non-numeric. */
function readNumber(d: Record<string, unknown>, key: string): number {
  const v = d[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
}

/**
 * Pixel width of one candle body. On a band scale this is the bandwidth; on a
 * linear/time scale it's derived from the smallest gap between adjacent points
 * (falling back to a modest width when there's only one point).
 */
function candleSlot(resolved: ResolvedPoint[], ctx: SeriesContext): number {
  const {xScale, width} = ctx;
  if (isBandScale(xScale)) {
    return xScale.bandwidth();
  }
  const xs = resolved
    .map(p => p.px)
    .filter(x => Number.isFinite(x))
    .sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > 0 && gap < minGap) {
      minGap = gap;
    }
  }
  return Number.isFinite(minGap) ? minGap : Math.min(width, 40);
}

export function candlestick(options: CandlestickOptions): SeriesDef {
  // Keep the semantic success/error defaults. CSS-capable dataVars consumers
  // use Core's data CSS variables (astryx.css in prebuilt mode); Canvas and other
  // non-CSS paths need resolveThemeToken() or useTheme().token() concrete colors.
  const upColor = options.upColor ?? 'var(--color-success)';
  const downColor = options.downColor ?? 'var(--color-error)';

  return {
    type: 'candlestick',
    key: `ohlc-${options.close}`,
    dataKeys: [options.open, options.high, options.low, options.close],
    layout: {},

    resolve(ctx) {
      const {data, xKey, xScale, yScale} = ctx;
      const points: ResolvedPoint[] = [];
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const close = readNumber(d, options.close);
        points.push({
          px: xPixel(d, xKey, xScale),
          py: yScale(close),
          py0: yScale(0),
          dataIndex: i,
        });
      }
      return points;
    },

    render(resolved, ctx) {
      const {data, yScale} = ctx;
      const bodyWidth = Math.max(1, candleSlot(resolved, ctx) * 0.6);

      return (
        <g>
          {resolved.map(p => {
            const d = data[p.dataIndex];
            const o = readNumber(d, options.open);
            const c = readNumber(d, options.close);
            const h = readNumber(d, options.high);
            const l = readNumber(d, options.low);
            // Drop candles missing any OHLC field (or an unplaceable x) — a gap
            // reads more honestly than a full-height candle anchored at 0.
            if (
              !Number.isFinite(p.px) ||
              !Number.isFinite(o) ||
              !Number.isFinite(c) ||
              !Number.isFinite(h) ||
              !Number.isFinite(l)
            ) {
              return null;
            }
            const col = c >= o ? upColor : downColor;
            const bodyTop = yScale(Math.max(o, c));
            const bodyHeight = Math.max(1, Math.abs(yScale(o) - yScale(c)));
            return (
              <g key={p.dataIndex}>
                <line
                  x1={p.px}
                  x2={p.px}
                  y1={yScale(h)}
                  y2={yScale(l)}
                  stroke={col}
                  strokeWidth={1}
                />
                <rect
                  x={p.px - bodyWidth / 2}
                  y={bodyTop}
                  width={bodyWidth}
                  height={bodyHeight}
                  fill={col}
                />
              </g>
            );
          })}
        </g>
      );
    },
  };
}
