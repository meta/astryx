// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Chart.tsx (v2)
 * @input Data, scale configuration, series definitions, optional chrome, and root DOM props
 * @output Root chart — coordinates layout, rendering, and events
 * @position Top-level; delegates everything to series configs and interaction slots
 *
 * The chart root has ZERO knowledge of mark types. It:
 *   1. Runs the layout engine (scales + stacking + grouping)
 *   2. Calls each series' resolve() and render() methods
 *   3. Provides a single event layer for interaction children
 *
 * Accessibility: the svg is exposed as a named image (role="img"; `title` or a
 * derived default as aria-label), and small datasets are mirrored in a
 * visually hidden data table for screen reader users.
 */

'use client';

import {
  type ReactNode,
  type Ref,
  useId,
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import type {SeriesDef, YBaseline} from './types';
import type {ChartContext, ChartMargin, ChartPointerEvent} from './types';
import {computeLayout} from './layout';
import {ChartProvider} from './ChartContext';
import {
  Text,
  VStack,
  HStack,
  VisuallyHidden,
  useLocale,
  useTranslator,
  type BaseProps,
} from '@astryxdesign/core';
import {useMergedRefs} from '@astryxdesign/core/hooks';
import {mergeProps} from '@astryxdesign/core/utils';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import {ChartLegend, type ChartLegendProps} from './ChartLegend';
import {deriveLegendItems} from './legend';
import {ChartTooltip, type ChartTooltipProps} from './ChartTooltip';
import {useChartColors} from './useChartColors';
import {formatList} from './formatters';
import {isUtilityMarkType} from './types';

export interface ChartProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root chart container. */
  ref?: Ref<HTMLDivElement>;
  /** Rows to visualize. Each row may contain the x field and one or more series fields. */
  data: Record<string, unknown>[];
  /** Field name read from each data row for the shared x scale. */
  xKey: string;
  /** Mark definitions rendered against the chart's shared scales. */
  series: SeriesDef[];
  /** Chart height in CSS pixels. Non-finite and negative values resolve to 0. @default 300 */
  height?: number;
  /** Partial plot inset override in CSS pixels. */
  margin?: Partial<ChartMargin>;
  /** How the y-domain is derived when `yDomain` is not set. @default 'auto' */
  yBaseline?: YBaseline;
  /** Explicit y-domain [min, max]. Authoritative — disables baseline/headroom. */
  yDomain?: [number, number];
  /**
   * Explicit x-domain [min, max] for numeric/linear x. Honored even when `data`
   * is empty (stable streaming window). Ignored for categorical (band) scales.
   */
  xDomain?: [number, number];
  /** Grid content rendered behind the series, normally `ChartGrid`. */
  grid?: ReactNode;
  /** Axis content rendered after the series, normally one or more `ChartAxis` elements. */
  axes?: ReactNode;
  /** Show the derived legend, or configure its items and layout. @default false */
  legend?: boolean | ChartLegendProps;
  /** Show the grouped pointer tooltip, or configure its presentation. @default false */
  tooltip?: boolean | Omit<ChartTooltipProps, 'series'>;
  /** Interaction overlays rendered above the pointer-capture layer. */
  interactions?: ReactNode;
  /** Additional SVG content rendered after the built-in tooltip. */
  children?: ReactNode;
  /** Visible chart heading and accessible name for the SVG image. */
  title?: string;
  /** Visible supporting text and accessible description for the SVG image. */
  subtitle?: string;
}

const DEFAULT_MARGIN: ChartMargin = {top: 24, right: 24, bottom: 32, left: 48};

/**
 * Maximum number of data points (rows × data keys) for which the visually
 * hidden data-table fallback is rendered. Beyond this a table is more noise
 * than signal for screen reader users, so larger charts are name-only.
 */
const MAX_TABLE_POINTS = 100;

/** Stringify a cell value for the hidden data table. */
function tableCell(value: unknown): string {
  return value == null ? '' : String(value);
}

const styles = stylex.create({
  container: {
    width: '100%',
  },
  title: {
    marginBlockEnd: spacingVars['--spacing-4'],
  },
  chartArea: {
    flex: 1,
    minWidth: 0,
    overflow: 'clip',
  },
});

/**
 * Renders several series against one responsive x/y coordinate system.
 *
 * @example
 * ```
 * <Chart
 *   data={monthlyRevenue}
 *   xKey="month"
 *   series={[bar('revenue'), line('trend')]}
 *   title="Monthly revenue"
 *   grid={<ChartGrid horizontal />}
 *   axes={<><ChartAxis position="bottom" /><ChartAxis position="left" /></>}
 *   legend
 *   tooltip
 * />
 * ```
 */
export function Chart({
  data,
  xKey,
  series,
  height = 300,
  margin: marginOverride,
  yBaseline,
  yDomain,
  xDomain,
  grid,
  axes,
  legend,
  tooltip,
  interactions,
  children,
  title,
  subtitle,
  ref,
  xstyle,
  className,
  style,
  ...rest
}: ChartProps) {
  const chartId = useId();
  const descId = `${chartId}-desc`;
  // useId() can contain ':' which is invalid in an SVG url(#id) reference.
  const clipId = `plot-${chartId.replace(/:/g, '')}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const mergedContainerRef = useMergedRefs(containerRef, ref);
  const svgRef = useRef<SVGSVGElement>(null);
  const t = useTranslator();
  const locale = useLocale();
  const [containerWidth, setContainerWidth] = useState(0);
  const pointerHandlers = useRef<Set<(e: ChartPointerEvent) => void>>(
    new Set(),
  );

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

  const margin = useMemo(
    () => ({...DEFAULT_MARGIN, ...marginOverride}),
    [marginOverride],
  );
  // Clamp plot dimensions to finite, non-negative values. layout.ts hardens
  // against NaN in the *data*, but a non-finite `height` prop or margin override
  // would still collapse every scale range — and the clipPath/event-rect
  // geometry — into NaN. `containerWidth` is always finite (from ResizeObserver).
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  const rawInnerWidth = containerWidth - margin.left - margin.right;
  const rawInnerHeight = safeHeight - margin.top - margin.bottom;
  const innerWidth = Number.isFinite(rawInnerWidth)
    ? Math.max(0, rawInnerWidth)
    : 0;
  const innerHeight = Number.isFinite(rawInnerHeight)
    ? Math.max(0, rawInnerHeight)
    : 0;

  // ─── Color assignment ─────────────────────────────────────────────────
  // Give every primary series that doesn't supply a static color (auto-colored
  // or accessor-colored) a distinct color from the theme's categorical palette.
  // Utility marks (band/errorBar/referenceLine) don't consume palette slots.
  // Assigned during render (like the layout pass annotates `_uid`) so the first
  // paint is already colored; intentionally not a `useMemo` — it mutates the
  // caller's series defs, and useMemo is allowed to drop its cached result.
  const chartColors = useChartColors();
  const needsColor = series.filter(
    s => !isUtilityMarkType(s.type) && s.color == null,
  );
  const palette = chartColors.categorical(Math.max(needsColor.length, 1));
  for (let i = 0; i < needsColor.length; i++) {
    needsColor[i]._resolvedColor = palette[i % palette.length];
  }

  // ─── Layout pass ──────────────────────────────────────────────────────
  const layout = useMemo(
    () =>
      computeLayout({
        data,
        xKey,
        series,
        width: innerWidth,
        height: innerHeight,
        yBaseline,
        yDomain,
        xDomain,
      }),
    [data, xKey, series, innerWidth, innerHeight, yBaseline, yDomain, xDomain],
  );

  const seriesCtx = useMemo(
    () => ({
      data,
      xKey,
      xScale: layout.xScale,
      yScale: layout.yScale,
      yBandScale: layout.yBandScale,
      width: innerWidth,
      height: innerHeight,
    }),
    [data, xKey, layout, innerWidth, innerHeight],
  );

  // ─── Event dispatch ───────────────────────────────────────────────────
  const onPointer = useCallback((handler: (e: ChartPointerEvent) => void) => {
    pointerHandlers.current.add(handler);
    return () => {
      pointerHandlers.current.delete(handler);
    };
  }, []);

  const dispatch = useCallback((e: ChartPointerEvent) => {
    for (const handler of pointerHandlers.current) {
      handler(e);
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      const point = svg.createSVGPoint();
      point.x = e.clientX;
      point.y = e.clientY;
      const ctm = e.currentTarget.getScreenCTM()?.inverse();
      if (!ctm) {
        return;
      }
      const cursor = point.matrixTransform(ctm);

      // Find nearest point by x-distance only (full vertical column is the hover zone)
      let nearest: ChartPointerEvent['nearest'] = null;
      let bestXDist = Infinity;
      for (const [seriesKey, points] of layout.resolved) {
        for (const p of points) {
          const xDist = Math.abs(p.px - cursor.x);
          if (xDist < bestXDist) {
            bestXDist = xDist;
            nearest = {...p, seriesKey};
          }
        }
      }
      dispatch({x: cursor.x, y: cursor.y, nearest, active: e.buttons > 0});
    },
    [layout.resolved, dispatch],
  );

  const handlePointerLeave = useCallback(() => {
    dispatch({x: -1, y: -1, nearest: null, active: false});
  }, [dispatch]);

  // ─── Context for interactions + v1 chrome ─────────────────────────────
  const ctx: ChartContext = useMemo(
    () => ({
      width: innerWidth,
      height: innerHeight,
      margin,
      data,
      xKey,
      xScale: layout.xScale,
      yScale: layout.yScale,
      yBandScale: layout.yBandScale,
      resolved: layout.resolved,
      onPointer,
      svgRef,
    }),
    [innerWidth, innerHeight, margin, data, xKey, layout, onPointer],
  );

  // ─── Accessibility ─────────────────────────────────────────────────────
  // The svg is exposed as a named image. `title` (when given) is the name;
  // otherwise a localized default is derived from the primary series + x key.
  const primarySeries = series.filter(s => !isUtilityMarkType(s.type));
  const accessibleLabel =
    title ??
    (primarySeries.length > 0
      ? t('@astryx.chart.labelWithSeries', {
          series: formatList(
            primarySeries.map(s => s.label ?? s.key),
            locale,
          ),
          xKey,
        })
      : t('@astryx.chart.label'));
  const tableKeys = Array.from(new Set(primarySeries.flatMap(s => s.dataKeys)));
  const showDataTable =
    data.length > 0 &&
    tableKeys.length > 0 &&
    data.length * tableKeys.length <= MAX_TABLE_POINTS;

  // ─── Legend ────────────────────────────────────────────────────────────
  const legendConfig = legend === true ? {} : legend || null;

  const legendElement = legendConfig ? (
    <ChartLegend
      items={legendConfig.items ?? deriveLegendItems(series)}
      position={legendConfig.position}
      alignment={legendConfig.alignment}
    />
  ) : null;

  const legendPosition = legendConfig?.position ?? 'bottom';
  const isLegendHorizontal =
    legendPosition === 'start' || legendPosition === 'end';

  // ─── Render ───────────────────────────────────────────────────────────
  if (containerWidth === 0) {
    return (
      <div
        ref={mergedContainerRef}
        {...mergeProps(
          stylex.props(styles.container, xstyle),
          {style: {height: safeHeight}},
          className,
          style,
        )}
        {...rest}
      />
    );
  }

  return (
    <div
      ref={mergedContainerRef}
      {...mergeProps(stylex.props(styles.container, xstyle), className, style)}
      {...rest}>
      {(title || subtitle) && (
        <div {...stylex.props(styles.title)}>
          {title && (
            <Text type="body" weight="semibold" display="block">
              {title}
            </Text>
          )}
          {subtitle && (
            <Text type="supporting" display="block">
              {subtitle}
            </Text>
          )}
        </div>
      )}
      <ChartProvider value={ctx}>
        {legendConfig == null ? (
          renderSvg()
        ) : isLegendHorizontal ? (
          <HStack gap={4}>
            {legendPosition === 'start' && legendElement}
            <div {...stylex.props(styles.chartArea)}>{renderSvg()}</div>
            {legendPosition === 'end' && legendElement}
          </HStack>
        ) : (
          <VStack gap={4}>
            {legendPosition === 'top' && legendElement}
            {renderSvg()}
            {legendPosition === 'bottom' && legendElement}
          </VStack>
        )}
      </ChartProvider>
      {renderDataTable()}
    </div>
  );

  function renderSvg() {
    return (
      <svg
        ref={svgRef}
        role="img"
        width="100%"
        height={safeHeight}
        aria-label={accessibleLabel}
        aria-describedby={subtitle ? descId : undefined}>
        {title && <title>{title}</title>}
        {subtitle && <desc id={descId}>{subtitle}</desc>}
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={innerWidth} height={innerHeight} />
          </clipPath>
        </defs>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* 1. Grid */}
          {grid}

          {/* 2. Marks — each series renders itself. Clipped to the plot area so
              curve overshoot (monotone/natural) can't escape into the margins. */}
          <g clipPath={`url(#${clipId})`}>
            {series.map(s => {
              const resolved = s._uid ? layout.resolved.get(s._uid) : undefined;
              if (!resolved) {
                return null;
              }
              return <g key={s._uid}>{s.render(resolved, seriesCtx)}</g>;
            })}
          </g>

          {/* 3. Axes */}
          {axes}

          {/* 4. Event capture + interactions */}
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          />
          {interactions}

          {/* 5. Tooltip — declarative shortcut. For full control, render
              <ChartTooltip> directly via the `children` slot. */}
          {tooltip && (
            <ChartTooltip
              series={series}
              {...(tooltip === true ? {} : tooltip)}
            />
          )}

          {/* 6. Escape hatch */}
          {children}
        </g>
      </svg>
    );
  }

  function renderDataTable() {
    if (!showDataTable) {
      return null;
    }
    return (
      <VisuallyHidden as="div">
        <table>
          <caption>
            {t('@astryx.chart.dataTableCaption', {label: accessibleLabel})}
          </caption>
          <thead>
            <tr>
              <th scope="col">{xKey}</th>
              {tableKeys.map(key => (
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
                {tableKeys.map(key => (
                  <td key={key}>{tableCell(d[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    );
  }
}

Chart.displayName = 'Chart';
