// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/area.tsx
 * @output Area series — fill under line with stacking + gradient support
 *
 * Missing / non-finite values (including gaps in a stacked baseline) become
 * holes via d3's `.defined()` rather than collapsing to zero. The gradient id is
 * salted with the series' collision-free `_uid` so overlapping areas over the
 * same dataKey never share (and steal) each other's fill.
 */

import {
  area as d3Area,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  curveStep,
} from 'd3-shape';
import {line as d3Line} from 'd3-shape';
import type {SeriesDef, ResolvedPoint} from '../types';
import {seriesFill} from '../markColor';
import {xPixel} from '../utils';

const CURVES = {
  linear: curveLinear,
  monotone: curveMonotoneX,
  natural: curveNatural,
  step: curveStep,
} as const;

export interface AreaOptions {
  color?: string;
  opacity?: number;
  curve?: keyof typeof CURVES;
  stack?: string;
  gradient?: boolean;
  stroke?: boolean;
  /** Width of the top-edge stroke path. Defaults to 2. */
  strokeWidth?: number;
  label?: string;
}

/** Both edges of an area point must be finite for the span to be drawable. */
function isFinitePoint(p: ResolvedPoint): boolean {
  return (
    Number.isFinite(p.px) && Number.isFinite(p.py) && Number.isFinite(p.py0)
  );
}

export function area(dataKey: string, options: AreaOptions = {}): SeriesDef {
  const color = options.color;
  const opacity =
    typeof options.opacity === 'number' && Number.isFinite(options.opacity)
      ? Math.min(1, Math.max(0, options.opacity))
      : 0.3;
  const curve = options.curve ?? 'monotone';
  const gradient = options.gradient ?? false;
  const stroke = options.stroke ?? true;
  const strokeWidth =
    typeof options.strokeWidth === 'number' &&
    Number.isFinite(options.strokeWidth) &&
    options.strokeWidth > 0
      ? options.strokeWidth
      : 2;

  const seriesDef: SeriesDef = {
    type: 'area',
    key: dataKey,
    dataKeys: [dataKey],
    color,
    label: options.label ?? dataKey,
    layout: {stack: options.stack, includeZero: true},

    resolve(ctx, stackOffsets) {
      const {data, xKey, xScale, yScale} = ctx;
      const points: ResolvedPoint[] = [];
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        let py: number, py0: number;
        if (stackOffsets) {
          const offset = stackOffsets[i];
          py = offset ? yScale(offset.y1) : NaN;
          py0 = offset ? yScale(offset.y0) : NaN;
        } else {
          const raw = d[dataKey];
          const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : NaN;
          py = yScale(v);
          py0 = yScale(0);
        }
        points.push({px: xPixel(d, xKey, xScale), py, py0, dataIndex: i});
      }
      return points;
    },

    render(resolved) {
      if (resolved.length === 0) {
        return null;
      }
      const curveFactory = CURVES[curve] ?? curveMonotoneX;

      const areaGen = d3Area<ResolvedPoint>()
        .defined(isFinitePoint)
        .x(d => d.px)
        .y0(d => d.py0)
        .y1(d => d.py)
        .curve(curveFactory);
      const pathD = areaGen(resolved) ?? '';

      const lineGen = d3Line<ResolvedPoint>()
        .defined(isFinitePoint)
        .x(d => d.px)
        .y(d => d.py)
        .curve(curveFactory);
      const strokeD = lineGen(resolved) ?? '';

      // Unique per series instance so two areas over the same dataKey don't
      // share a gradient id (which would make one steal the other's fill).
      const gradientId = `area-grad-${(seriesDef._uid ?? dataKey).replace(
        /[^a-zA-Z0-9_-]/g,
        '-',
      )}`;
      const fillColor = seriesFill(seriesDef, color);

      return (
        <g>
          {gradient && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillColor} stopOpacity={opacity} />
                <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          <path
            d={pathD}
            fill={gradient ? `url(#${gradientId})` : fillColor}
            fillOpacity={gradient ? 1 : opacity}
            stroke="none"
          />
          {stroke && (
            <path
              d={strokeD}
              fill="none"
              stroke={fillColor}
              strokeWidth={strokeWidth}
            />
          )}
        </g>
      );
    },
  };

  return seriesDef;
}
