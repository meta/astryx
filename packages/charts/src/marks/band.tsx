// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/band.tsx
 * @output Band (confidence interval) series — area between upper/lower bounds.
 *   Non-numeric/NaN bounds break the area into gaps instead of collapsing to a
 *   false zero baseline.
 */

import {area as d3Area, curveLinear} from 'd3-shape';
import {
  DEFAULT_SERIES_COLOR,
  type SeriesDef,
  type ResolvedPoint,
} from '../types';
import {xPixel} from '../utils';

export interface BandOptions {
  upper: string;
  lower: string;
  color?: string;
  opacity?: number;
}

export function band(options: BandOptions): SeriesDef {
  const color = options.color ?? DEFAULT_SERIES_COLOR;
  const opacity = options.opacity ?? 0.15;

  return {
    type: 'band',
    key: `band-${options.upper}-${options.lower}`,
    dataKeys: [options.upper, options.lower],
    layout: {},

    resolve(ctx) {
      const {data, xKey, xScale, yScale} = ctx;
      const points: ResolvedPoint[] = [];
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        // NaN for missing/non-numeric bounds so render() can gap the area
        // rather than draw a spike down to the axis.
        const upperVal = d[options.upper];
        const lowerVal = d[options.lower];
        const upper =
          typeof upperVal === 'number' && Number.isFinite(upperVal)
            ? upperVal
            : NaN;
        const lower =
          typeof lowerVal === 'number' && Number.isFinite(lowerVal)
            ? lowerVal
            : NaN;
        points.push({
          px: xPixel(d, xKey, xScale),
          py: yScale(upper),
          py0: yScale(lower),
          dataIndex: i,
        });
      }
      return points;
    },

    render(resolved) {
      if (resolved.length === 0) {
        return null;
      }
      const areaGen = d3Area<ResolvedPoint>()
        .defined(
          d =>
            Number.isFinite(d.px) &&
            Number.isFinite(d.py) &&
            Number.isFinite(d.py0),
        )
        .x(d => d.px)
        .y0(d => d.py0)
        .y1(d => d.py)
        .curve(curveLinear);
      const pathD = areaGen(resolved) ?? '';
      if (!pathD) {
        return null;
      }
      return (
        <path d={pathD} fill={color} fillOpacity={opacity} stroke="none" />
      );
    },
  };
}
