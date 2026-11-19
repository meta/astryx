// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/dot.tsx
 * @output Dot/scatter series — self-contained resolve + render
 *
 * Points with missing / non-finite values are skipped rather than plotted at the
 * baseline. Optional `dodge` spreads coincident points horizontally, ignoring
 * non-finite ones so a single missing value can't collapse a whole dodge group.
 */

import type {SeriesDef, ResolvedPoint, ColorAccessor} from '../types';
import {pointFill} from '../markColor';
import {xPixel} from '../utils';

export type {ColorAccessor};

export interface DotOptions {
  color?: ColorAccessor;
  radius?: number;
  opacity?: number;
  dodge?: boolean;
  label?: string;
}

export function dot(dataKey: string, options: DotOptions = {}): SeriesDef {
  const color = options.color;
  const radius =
    typeof options.radius === 'number' && Number.isFinite(options.radius)
      ? Math.max(0, options.radius)
      : 4;
  const opacity =
    typeof options.opacity === 'number' && Number.isFinite(options.opacity)
      ? Math.min(1, Math.max(0, options.opacity))
      : 0.8;
  const dodge = options.dodge ?? false;

  const seriesDef: SeriesDef = {
    type: 'dot',
    key: dataKey,
    dataKeys: [dataKey],
    color: typeof color === 'string' ? color : undefined,
    label: options.label ?? dataKey,
    layout: {xOverhang: radius},

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

      if (dodge) {
        // Spread points that land on the same x (e.g. dots over band categories)
        // horizontally so they don't overlap, centered on the original x.
        const groups = new Map<number, ResolvedPoint[]>();
        for (const p of points) {
          // Only points render() will actually draw (finite px AND py) join a
          // dodge group; a missing y-value must not reserve a slot and knock the
          // visible points off-center.
          if (!Number.isFinite(p.px) || !Number.isFinite(p.py)) {
            continue;
          }
          const key = Math.round(p.px);
          const group = groups.get(key) ?? [];
          group.push(p);
          groups.set(key, group);
        }
        const spacing = radius * 2 + 1;
        for (const group of groups.values()) {
          if (group.length < 2) {
            continue;
          }
          const mid = (group.length - 1) / 2;
          group.forEach((p, idx) => {
            p.px += (idx - mid) * spacing;
          });
        }
      }

      return points;
    },

    render(resolved, ctx) {
      const {data} = ctx;
      return (
        <g>
          {resolved.map(p => {
            const d = data[p.dataIndex];
            if (!d || !Number.isFinite(p.px) || !Number.isFinite(p.py)) {
              return null;
            }
            const fill = pointFill(seriesDef, color, d, p.dataIndex);
            return (
              <circle
                key={p.dataIndex}
                cx={p.px}
                cy={p.py}
                r={radius}
                fill={fill}
                opacity={opacity}
              />
            );
          })}
        </g>
      );
    },
  };

  return seriesDef;
}
