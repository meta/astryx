// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Chart.tsx
 * @output Root chart container — sets up SVG, scales, and context
 * @position Parent component; all chart marks/axes/interactions are children
 *
 * Handles the d3 margin convention: outer SVG at full size, inner <g> translated
 * by margins. Children receive scales and dimensions via context.
 *
 * Accessibility: the svg is exposed as a named image (role="img" + aria-label,
 * overridable via `label`), and small datasets are mirrored in a visually
 * hidden data table so screen reader users can read the underlying values.
 */

import {
  type CSSProperties,
  type ReactNode,
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import {scaleLinear, scaleBand} from 'd3-scale';
import type {ScaleLinear} from 'd3-scale';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {isBandScale} from './utils';
import {ChartProvider} from './ChartContext';
import type {ChartMargin, ChartScale} from './types';

/**
 * Controls how the y-axis domain is computed:
 * - `'auto'` — includes 0 when all values are positive (default, bar-friendly)
 * - `'zero'` — symmetric range centered on 0 (good for +/- data)
 * - `'data'` — tight fit to data extent only (no forced zero)
 */
export type YBaseline = 'auto' | 'zero' | 'data';

export interface ChartProps {
  /** The dataset — array of objects with consistent keys */
  data: Record<string, unknown>[];
  /**
   * Key for the x-axis domain values.
   * String values produce a band scale; numeric values produce a linear scale.
   */
  xKey: string;
  /**
   * Key(s) for the y-axis domain values.
   * Used to compute the y-domain across all series.
   */
  yKeys: string[];
  /** Chart height in pixels. Width is responsive (fills container). */
  height?: number;
  /** Override default margins */
  margin?: Partial<ChartMargin>;
  /**
   * How the y-axis domain is computed.
   * - `'auto'` — includes 0 when all values are positive (default)
   * - `'zero'` — symmetric around 0 (use for profit/loss, sentiment, etc.)
   * - `'data'` — tight fit to data extent
   */
  yBaseline?: YBaseline;
  /**
   * Explicit y-axis domain [min, max].
   * When provided, this is the y-axis range. Data outside it is not clipped
   * visually but will extend beyond the chart area.
   */
  yDomain?: [number, number];
  /**
   * Explicit x-axis domain [min, max] for linear/time scales.
   * When provided, this is the x-axis range — the chart renders exactly
   * this window. Use for streaming charts where the range shifts over time.
   * Ignored for band (categorical) scales.
   */
  xDomain?: [number, number];
  /**
   * Set touch-action on the chart container. Use 'none' when interactive
   * components (brush, zoom, crosshair) are present to prevent scroll
   * interference on mobile.
   */
  interactive?: boolean;
  /**
   * Accessible name for the chart, announced by screen readers (the svg is
   * exposed as `role="img"`). Defaults to an English description derived from
   * the keys (e.g. "Chart of revenue by month") — pass a localized string to
   * override.
   */
  label?: string;
  /** Chart contents — axes, marks, tooltips */
  children: ReactNode;
}

const DEFAULT_MARGIN: ChartMargin = {top: 16, right: 16, bottom: 32, left: 48};

/**
 * Maximum number of data points (rows × series) for which the visually hidden
 * data-table fallback is rendered. Beyond this a table is more noise than
 * signal for screen reader users, so larger charts are name-only.
 */
const MAX_TABLE_POINTS = 100;

/** Stringify a cell value for the hidden data table. */
function tableCell(value: unknown): string {
  return value == null ? '' : String(value);
}

/**
 * Root chart container. Computes scales from data and provides them to children.
 *
 * @example
 * ```
 * <Chart data={data} xKey="month" yKeys={['revenue']} height={300}>
 *   <ChartAxis position="bottom" />
 *   <ChartAxis position="left" />
 *   <ChartBar dataKey="revenue" color={useChartColors().categorical(1)[0]} />
 * </Chart>
 * ```
 */
export function Chart({
  data,
  xKey,
  yKeys,
  height = 300,
  margin: marginOverride,
  yBaseline = 'auto',
  yDomain: yDomainProp,
  xDomain: xDomainProp,
  interactive = false,
  label,
  children,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const attachContainer = useCallback((container: HTMLDivElement) => {
    containerRef.current = container;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      containerRef.current = null;
    };
  }, []);

  // Block scroll/zoom on the container when interactive.
  // Must be non-passive to actually prevent default on touch events.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !interactive) {
      return;
    }
    const prevent = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', prevent, {passive: false});
    el.addEventListener('touchmove', prevent, {passive: false});
    return () => {
      el.removeEventListener('touchstart', prevent);
      el.removeEventListener('touchmove', prevent);
    };
  }, [interactive]);

  const margin = useMemo(
    () => ({...DEFAULT_MARGIN, ...marginOverride}),
    [marginOverride],
  );

  const innerWidth = Math.max(0, containerWidth - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const xScale = useMemo((): ChartScale => {
    const xValues = data.map(d => d[xKey]);
    const isNumeric = xValues.every(v => typeof v === 'number');

    if (isNumeric) {
      if (xDomainProp) {
        // Explicit domain is authoritative — use as-is
        return scaleLinear().domain(xDomainProp).range([0, innerWidth]);
      }
      // Auto-compute from data
      const nums = xValues as number[];
      let min = Infinity;
      let max = -Infinity;
      for (const n of nums) {
        if (n < min) {
          min = n;
        }
        if (n > max) {
          max = n;
        }
      }
      return scaleLinear().domain([min, max]).range([0, innerWidth]).nice();
    }

    // Categorical — xDomain doesn't apply to band scales
    return scaleBand<string>()
      .domain(xValues.map(String))
      .range([0, innerWidth])
      .padding(0.2);
  }, [data, xKey, innerWidth, xDomainProp]);

  const yScale = useMemo((): ScaleLinear<number, number> => {
    if (yDomainProp) {
      // Explicit domain is authoritative — use as-is.
      // No baseline adjustment, no .nice(). The caller owns the domain
      // (e.g. zoom/pan controls) and rounding would cause ratcheting.
      return scaleLinear().domain(yDomainProp).range([innerHeight, 0]);
    }

    // Auto-compute from data
    let min = Infinity;
    let max = -Infinity;
    for (const d of data) {
      for (const key of yKeys) {
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
    }

    if (yBaseline === 'zero') {
      const abs = Math.max(Math.abs(min), Math.abs(max));
      min = -abs;
      max = abs;
    } else if (yBaseline === 'auto') {
      if (min > 0) {
        min = 0;
      }
      if (max < 0) {
        max = 0;
      }
    }

    return scaleLinear().domain([min, max]).range([innerHeight, 0]).nice();
  }, [data, yKeys, innerHeight, yBaseline, yDomainProp]);

  const pixelToData = useCallback(
    (px: number, py: number) => {
      const y = yScale.invert(py);
      let x: number | string;
      if (isBandScale(xScale)) {
        const domain = xScale.domain();
        const step = xScale.step();
        const idx = Math.min(
          domain.length - 1,
          Math.max(0, Math.floor(px / step)),
        );
        x = domain[idx];
      } else {
        x = (xScale as ScaleLinear<number, number>).invert(px);
      }
      return {x, y, px, py};
    },
    [xScale, yScale],
  );

  const pointerToData = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) {
        return {x: null, y: 0, px: 0, py: 0};
      }
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      // Transform to the inner <g> coordinate space (accounts for margins)
      const gEl = svg.querySelector('g');
      const ctm = gEl?.getScreenCTM?.()?.inverse();
      const local = ctm ? pt.matrixTransform(ctm) : {x: 0, y: 0};
      return pixelToData(local.x, local.y);
    },
    [pixelToData],
  );

  const ctx = useMemo(
    () => ({
      width: innerWidth,
      height: innerHeight,
      margin,
      xKey,
      data,
      xScale,
      yScale,
      svgRef,
      pointerToData,
      pixelToData,
    }),
    [
      innerWidth,
      innerHeight,
      margin,
      xKey,
      data,
      xScale,
      yScale,
      pointerToData,
      pixelToData,
    ],
  );

  const containerStyle: CSSProperties = {
    width: '100%',
    touchAction: interactive ? 'none' : undefined,
    userSelect: interactive ? 'none' : undefined,
  };

  const accessibleLabel = label ?? `Chart of ${yKeys.join(', ')} by ${xKey}`;
  const showDataTable =
    data.length > 0 &&
    data.length * Math.max(yKeys.length, 1) <= MAX_TABLE_POINTS;

  return (
    <div ref={attachContainer} style={containerStyle}>
      {containerWidth > 0 && (
        <svg
          ref={svgRef}
          role="img"
          aria-label={accessibleLabel}
          width={containerWidth}
          height={height}
          style={interactive ? {touchAction: 'none'} : undefined}>
          <defs>
            <clipPath id="astryx-chart-plot">
              <rect x={0} y={0} width={innerWidth} height={innerHeight} />
            </clipPath>
          </defs>
          <g transform={`translate(${margin.left},${margin.top})`}>
            <ChartProvider value={ctx}>{children}</ChartProvider>
          </g>
        </svg>
      )}
      {showDataTable && (
        <VisuallyHidden as="div">
          <table>
            <caption>{`${accessibleLabel} data`}</caption>
            <thead>
              <tr>
                <th scope="col">{xKey}</th>
                {yKeys.map(key => (
                  <th key={key} scope="col">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  <th scope="row">{tableCell(d[xKey])}</th>
                  {yKeys.map(key => (
                    <td key={key}>{tableCell(d[key])}</td>
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
