// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/area.tsx
 * @output Area series — fill under line with stacking + gradient support
 *
 * Missing / non-finite values (including gaps in a stacked baseline) become
 * holes via d3's `.defined()` rather than collapsing to zero. Each gradient
 * fill takes its id from `useId()`. The id is unique on the page, so an area
 * never paints another area's gradient.
 */

import {
  area as d3Area,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  curveStep,
} from 'd3-shape';
import {line as d3Line} from 'd3-shape';
import {useId} from 'react';
import type {SeriesDef, ResolvedPoint} from '../types';
import {seriesFill} from '../markColor';
import {xPixel} from '../utils';

/** An area's fill, through a gradient whose id is unique on the page. */
function GradientFill({
  pathD,
  color,
  opacity,
}: {
  pathD: string;
  color: string;
  opacity: number;
}) {
  // useId() can contain ':', which an SVG url(#id) reference cannot hold.
  const gradientId = `area-grad-${useId().replace(/:/g, '')}`;
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={opacity} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={pathD}
        fill={`url(#${gradientId})`}
        fillOpacity={1}
        stroke="none"
      />
    </>
  );
}

const CURVES = {
  linear: curveLinear,
  monotone: curveMonotoneX,
  natural: curveNatural,
  step: curveStep,
} as const;

export interface AreaOptions {
  color?: string;
  opacity?: number;
  /** How points join. Default `'linear'`: straight segments. */
  curve?: keyof typeof CURVES;
  stack?: string;
  gradient?: boolean;
  stroke?: boolean;
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
  const curve = options.curve ?? 'linear';
  const gradient = options.gradient ?? false;
  const stroke = options.stroke ?? true;

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
      const curveFactory = CURVES[curve] ?? curveLinear;

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

      const fillColor = seriesFill(seriesDef, color);

      return (
        <g>
          {gradient ? (
            <GradientFill pathD={pathD} color={fillColor} opacity={opacity} />
          ) : (
            <path
              d={pathD}
              fill={fillColor}
              fillOpacity={opacity}
              stroke="none"
            />
          )}
          {stroke && (
            <path d={strokeD} fill="none" stroke={fillColor} strokeWidth={2} />
          )}
        </g>
      );
    },
  };

  return seriesDef;
}
