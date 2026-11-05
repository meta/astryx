// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/line.tsx
 * @output Line series — self-contained resolve + render
 *
 * Missing / non-finite values become gaps (via d3's `.defined()`) instead of a
 * misleading drop to the baseline, and per-point dots are only drawn where the
 * point is finite.
 */

import {
  line as d3Line,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  curveStep,
} from 'd3-shape';
import type {SeriesDef, ResolvedPoint} from '../types';
import {seriesFill} from '../markColor';
import {resolveStrokeWidth} from './strokeWidth';
import {xPixel} from '../utils';

const CURVES = {
  linear: curveLinear,
  monotone: curveMonotoneX,
  natural: curveNatural,
  step: curveStep,
} as const;
export type CurveType = keyof typeof CURVES;

export interface LineOptions {
  color?: string;
  curve?: CurveType;
  strokeWidth?: number;
  dots?: boolean;
  label?: string;
}

/** A point is drawable only when both of its plotted coordinates are finite. */
function isFinitePoint(p: ResolvedPoint): boolean {
  return Number.isFinite(p.px) && Number.isFinite(p.py);
}

export function line(dataKey: string, options: LineOptions = {}): SeriesDef {
  const color = options.color;
  const curve = options.curve ?? 'monotone';
  const strokeWidth = resolveStrokeWidth(options.strokeWidth);
  const dots = options.dots ?? false;

  const seriesDef: SeriesDef = {
    type: 'line',
    key: dataKey,
    dataKeys: [dataKey],
    color,
    label: options.label ?? dataKey,
    layout: {},

    resolve(ctx) {
      const {data, xKey, xScale, yScale} = ctx;
      const points: ResolvedPoint[] = [];
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const raw = d[dataKey];
        const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : NaN;
        points.push({
          px: xPixel(d, xKey, xScale),
          py: yScale(v),
          py0: yScale(0),
          dataIndex: i,
        });
      }
      return points;
    },

    render(resolved) {
      if (resolved.length === 0) {
        return null;
      }
      const curveFactory = CURVES[curve] ?? curveMonotoneX;
      const pathGen = d3Line<ResolvedPoint>()
        .defined(isFinitePoint)
        .x(d => d.px)
        .y(d => d.py)
        .curve(curveFactory);

      const pathD = pathGen(resolved) ?? '';
      const strokeColor = seriesFill(seriesDef, color);
      return (
        <g>
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
          {dots &&
            resolved
              .filter(isFinitePoint)
              .map(p => (
                <circle
                  key={p.dataIndex}
                  cx={p.px}
                  cy={p.py}
                  r={3}
                  fill={strokeColor}
                />
              ))}
        </g>
      );
    },
  };

  return seriesDef;
}
