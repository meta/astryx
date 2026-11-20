// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadialChart.tsx
 * @output Root radial chart container — spider, pie, donut
 * @position Parent component; all radial marks read from its context
 *
 * Owns the radial coordinate space: center, radius, angle/radius scales.
 * Same Tier 1 guarantee as Chart — all children map through the same context.
 *
 * Accessibility: the svg is exposed as a named image (role="img" + aria-label,
 * overridable via `label`), and small datasets are mirrored in a visually
 * hidden data table (slices in pie mode, axis values in spider mode).
 */

import * as stylex from '@stylexjs/stylex';
import {
  type ReactNode,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from 'react';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {RadialProvider} from './RadialContext';
import type {RadialMode} from './types';

export interface RadialChartProps {
  /** The dataset */
  data: Record<string, unknown>[];
  /** Chart height in pixels. Width is responsive. */
  height?: number;
  /**
   * Spider mode: array of axis keys (each key is a dimension).
   * When provided, the chart operates in spider mode.
   */
  axes?: string[];
  /**
   * Pie/donut mode: data key containing the numeric value for each slice.
   * When provided (without axes), the chart operates in pie mode.
   */
  valueKey?: string;
  /**
   * Pie/donut mode: data key for the slice label.
   */
  labelKey?: string;
  /**
   * Inner radius as a fraction of outer radius (0-1).
   * 0 = full pie/spider, 0.6 = donut. Default: 0.
   */
  innerRadius?: number;
  /**
   * Padding between pie slices in radians. Default: 0.02.
   */
  padAngle?: number;
  /** Chart contents */
  /**
   * Enable touch interaction mode — blocks scroll on mobile.
   */
  interactive?: boolean;
  /**
   * Accessible name for the chart, announced by screen readers (the svg is
   * exposed as `role="img"`). Defaults to an English description derived from
   * the mode and keys (e.g. "Radar chart of speed, handling" or
   * "Pie chart of revenue") — pass a localized string to override.
   */
  label?: string;
  children: ReactNode;
}

/**
 * Maximum number of data points (rows × axes in spider mode, slices in pie
 * mode) for which the visually hidden data-table fallback is rendered. Beyond
 * this a table is more noise than signal, so larger charts are name-only.
 */
const MAX_TABLE_POINTS = 100;

const styles = stylex.create({
  interactive: {
    touchAction: 'none',
  },
});

/**
 * Row header for a spider-mode table row: the first string field in the row
 * (the same heuristic RadialArea uses to match its `dataKey`), else the index.
 */
function spiderRowHeader(row: Record<string, unknown>, index: number): string {
  const name = Object.values(row).find(v => typeof v === 'string');
  return typeof name === 'string' ? name : `Series ${index + 1}`;
}

/**
 * Root radial chart container. Computes angular/radial scales and provides
 * them to children via context.
 *
 * @example
 * ```
 * <RadialChart data={data} axes={['speed', 'handling', 'comfort']} height={400}>
 *   <RadialGrid rings={5} />
 *   <RadialArea dataKey="modelA" color={colors[0]} />
 *   <RadialAxis />
 * </RadialChart>
 * <RadialChart data={data} valueKey="revenue" labelKey="region" height={400}>
 *   <RadialSlice />
 * </RadialChart>
 * <RadialChart data={data} valueKey="revenue" labelKey="region" innerRadius={0.6} height={400}>
 *   <RadialSlice />
 * </RadialChart>
 * ```
 */
export function RadialChart({
  data,
  height = 400,
  axes,
  valueKey,
  labelKey,
  innerRadius: innerRadiusFraction = 0,
  padAngle = 0.02,
  interactive = false,
  label,
  children,
}: RadialChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const size = Math.min(containerWidth, height);
  const cx = containerWidth / 2;
  const cy = height / 2;
  const outerRadius = size / 2 - 40; // leave room for labels
  const innerRadiusPx = outerRadius * innerRadiusFraction;

  const mode: RadialMode = axes ? 'spider' : 'pie';

  // Spider: compute axis angles and domains
  const spiderCtx = useMemo(() => {
    if (!axes || axes.length === 0) {
      return {};
    }

    const angleByAxis = new Map<string, number>();
    const step = (2 * Math.PI) / axes.length;
    axes.forEach((key, i) => {
      // Start from top (-PI/2) and go clockwise
      angleByAxis.set(key, -Math.PI / 2 + step * i);
    });

    // Compute domain per axis
    const axisDomains = new Map<string, [number, number]>();
    for (const key of axes) {
      let min = Infinity;
      let max = -Infinity;
      for (const d of data) {
        const v = d[key];
        if (typeof v === 'number') {
          if (v < min) {
            min = v;
          }
          if (v > max) {
            max = v;
          }
        }
      }
      // Include 0 as floor
      if (min > 0) {
        min = 0;
      }
      axisDomains.set(key, [min, max]);
    }

    const radiusScale = (t: number) =>
      innerRadiusPx + t * (outerRadius - innerRadiusPx);

    return {axes, angleByAxis, radiusScale, axisDomains};
  }, [axes, data, outerRadius, innerRadiusPx]);

  // Pie: compute slices
  const pieCtx = useMemo(() => {
    if (!valueKey) {
      return {};
    }

    const total = data.reduce((sum, d) => {
      const v = d[valueKey];
      return sum + (typeof v === 'number' ? v : 0);
    }, 0);

    if (total === 0) {
      return {slices: []};
    }

    const totalPad = padAngle * data.length;
    const available = 2 * Math.PI - totalPad;
    let currentAngle = -Math.PI / 2; // start from top

    const slices = data.map(d => {
      const v = typeof d[valueKey] === 'number' ? (d[valueKey] as number) : 0;
      const percentage = v / total;
      const sweep = percentage * available;
      const slice = {
        key: labelKey ? String(d[labelKey]) : String(v),
        value: v,
        startAngle: currentAngle,
        endAngle: currentAngle + sweep,
        percentage,
      };
      currentAngle += sweep + padAngle;
      return slice;
    });

    return {slices};
  }, [data, valueKey, labelKey, padAngle]);

  const ctx = useMemo(
    () => ({
      cx,
      cy,
      radius: outerRadius,
      innerRadius: innerRadiusPx,
      data,
      mode,
      interactive,
      ...spiderCtx,
      ...pieCtx,
    }),
    [
      cx,
      cy,
      outerRadius,
      innerRadiusPx,
      data,
      mode,
      interactive,
      spiderCtx,
      pieCtx,
    ],
  );

  const accessibleLabel =
    label ??
    (mode === 'spider'
      ? `Radar chart of ${(axes ?? []).join(', ')}`
      : `Pie chart of ${valueKey ?? 'values'}`);

  const slices = pieCtx.slices ?? [];
  const showPieTable =
    mode === 'pie' && slices.length > 0 && slices.length <= MAX_TABLE_POINTS;
  const showSpiderTable =
    mode === 'spider' &&
    axes != null &&
    axes.length > 0 &&
    data.length > 0 &&
    data.length * axes.length <= MAX_TABLE_POINTS;

  return (
    <div
      ref={containerRef}
      {...stylex.props(interactive && styles.interactive)}
      style={{width: '100%'}}>
      {containerWidth > 0 && (
        <svg
          role="img"
          aria-label={accessibleLabel}
          width={containerWidth}
          height={height}>
          <RadialProvider value={ctx}>{children}</RadialProvider>
        </svg>
      )}
      {showPieTable && (
        <VisuallyHidden as="div">
          <table>
            <caption>{`${accessibleLabel} data`}</caption>
            <thead>
              <tr>
                <th scope="col">{labelKey ?? 'Label'}</th>
                <th scope="col">{valueKey}</th>
                <th scope="col">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((slice, i) => (
                <tr key={i}>
                  <th scope="row">{slice.key}</th>
                  <td>{String(slice.value)}</td>
                  <td>{`${(slice.percentage * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </VisuallyHidden>
      )}
      {showSpiderTable && (
        <VisuallyHidden as="div">
          <table>
            <caption>{`${accessibleLabel} data`}</caption>
            <thead>
              <tr>
                <th scope="col">Series</th>
                {axes.map(key => (
                  <th key={key} scope="col">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <th scope="row">{spiderRowHeader(row, i)}</th>
                  {axes.map(key => (
                    <td key={key}>
                      {row[key] == null ? '' : String(row[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </VisuallyHidden>
      )}
    </div>
  );
}
