// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartTooltip.tsx
 * @output Grouped chart tooltip — shows all series values at the hovered x-position.
 *         Composable: drop into `<Chart tooltip>` or render directly inside a chart
 *         to take full control of props.
 * @position Reads from ChartContext — must render inside an <Chart>.
 *
 * @example
 * ```
 * // Default — declarative on Chart
 * <Chart tooltip />
 *
 * // Custom render function via Chart prop
 * <Chart tooltip={{render: (x, rows) => <MyCard x={x} rows={rows} />}} />
 *
 * // Composable — drop into the chart's children for full control
 * <Chart>
 *   <ChartTooltip
 *     series={series}
 *     hoverIndicator={false}
 *     placement="top"
 *   />
 * </Chart>
 * ```
 */

'use client';

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {useChart} from './ChartContext';
import {
  deriveTooltipSeriesValues,
  shouldRenderHoverDot,
  type TooltipSeriesValue,
} from './tooltip';
import {DefaultTooltipContent, useTooltipCard} from './tooltipCard';
import type {SeriesDef, ChartPointerEvent} from './types';
import {isBandScale, xPixel} from './utils';

export type ChartTooltipPlacement = 'auto' | 'right' | 'left' | 'top';

export interface ChartTooltipProps {
  /**
   * Series definitions — used to map the hovered datum to per-series rows.
   * When rendered via `<Chart tooltip />`, Chart injects this automatically.
   * When composing directly, pass the same `series` array you gave Chart.
   */
  series?: readonly SeriesDef[];
  /**
   * Custom render function. Receives the x-value and one row per visible series.
   * Returning `null` hides the card while still rendering the band highlight + dots.
   */
  render?: (xValue: unknown, seriesValues: TooltipSeriesValue[]) => ReactNode;
  /**
   * Whether to draw a hover indicator at the focused x-position.
   * Picks the right shape automatically:
   * - **band-highlight rect** when the chart includes bar series on a band scale
   * - **vertical crosshair line** for line / area / dot charts
   *
   * Default: `true`.
   */
  hoverIndicator?: boolean;
  /**
   * Whether to draw a hover dot at each series' point (skipped for bars).
   * Default: `true`.
   */
  showHoverDots?: boolean;
  /**
   * Card placement relative to the hovered point:
   * - `'auto'` (default): right of the point, flips to left if it would overflow
   * - `'right'` / `'left'` / `'top'`: pinned position
   */
  placement?: ChartTooltipPlacement;
}

const styles = stylex.create({
  crosshair: {
    stroke: colorVars['--color-text-primary'],
    strokeWidth: 1,
  },
});

/**
 * Composable grouped tooltip for Chart.
 *
 * Subscribes to the chart's pointer event stream and only re-renders when the
 * hovered data index changes (not on every pointer move). Card coordinates retain
 * their previous state when the resolved point and browser geometry are unchanged.
 */
export function ChartTooltip({
  series = [],
  render,
  hoverIndicator = true,
  showHoverDots = true,
  placement = 'auto',
}: ChartTooltipProps) {
  const {
    data,
    xKey,
    resolved,
    onPointer,
    svgRef,
    margin,
    xScale,
    width,
    height,
  } = useChart();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const lastPointerEventRef = useRef<ChartPointerEvent | null>(null);
  const {
    cardRef,
    hide: hideLayer,
    place: placeCard,
    renderCard,
    show: showLayer,
  } = useTooltipCard();
  // Whether the card is currently suppressed (no content, or a custom `render`
  // opted out by returning null). Start closed; once present content opens the
  // Layer, a content-bearing index change keeps it open while React swaps the
  // content. positionCard also reads this so a same-index pointer move cannot
  // re-reveal a suppressed card before the visibility effect confirms content.
  const cardHiddenRef = useRef(true);

  // Stable Set of resolved series keys — used by deriveTooltipSeriesValues.
  // Recomputed only when the resolved map identity changes (per layout pass).
  const resolvedKeys = useMemo(() => new Set(resolved.keys()), [resolved]);

  // ─── Card positioning ──────────────────────────────────────────────────
  // Layer owns top-layer promotion. Pointer moves update coordinates only when
  // the hovered point or browser geometry changes, so moves within one point do
  // not force a React commit.
  const positionCard = useCallback(
    (e: ChartPointerEvent) => {
      if (!cardRef.current) {
        return;
      }
      if (!svgRef.current || !e.nearest || cardHiddenRef.current) {
        hideLayer();
        return;
      }

      showLayer();
      // The card top is at the plot's top edge, beside the hovered x.
      placeCard({px: e.nearest.px, py: 0}, {placement});
    },
    [cardRef, svgRef, placement, hideLayer, showLayer, placeCard],
  );

  // ─── Subscribe to pointer events ───────────────────────────────────────
  useEffect(() => {
    let currentIndex: number | null = null;
    const unsub = onPointer((e: ChartPointerEvent) => {
      lastPointerEventRef.current = e;
      const newIndex = e.nearest?.dataIndex ?? null;
      if (newIndex !== currentIndex) {
        currentIndex = newIndex;
        // Keep a closed/suppressed card closed until React resolves content.
        // Do not preemptively close an already-visible card for another index:
        // the visibility effect closes absent content after commit, while
        // content-bearing transitions keep the same Layer continuously open.
        if (newIndex == null) {
          cardHiddenRef.current = true;
        }
        setHoveredIndex(newIndex);
      }
      positionCard(e);
    });
    return unsub;
  }, [onPointer, positionCard]);

  // ─── Derived data ──────────────────────────────────────────────────────
  const datum = hoveredIndex != null ? data[hoveredIndex] : undefined;
  const xValue = datum?.[xKey];

  const seriesValues = useMemo(
    () => deriveTooltipSeriesValues(series, datum, resolvedKeys),
    [series, datum, resolvedKeys],
  );

  // Hover dots — read from the resolved map at the hovered index.
  const dots = useMemo(() => {
    if (!showHoverDots || hoveredIndex == null) {
      return null;
    }
    const elements: ReactNode[] = [];
    for (const s of series) {
      if (!shouldRenderHoverDot(s.type)) {
        continue;
      }
      const points = s._uid ? resolved.get(s._uid) : undefined;
      const point = points?.find(p => p.dataIndex === hoveredIndex);
      // A resolved point exists at every index, but its coordinates are NaN when
      // this series' value here is missing/non-finite (the mark itself filters
      // these at render time — mirror that so we never emit cx/cy="NaN").
      if (!point || !Number.isFinite(point.px) || !Number.isFinite(point.py)) {
        continue;
      }
      elements.push(
        <circle
          key={s._uid}
          cx={point.px}
          cy={point.py}
          r={4}
          fill="var(--color-background-surface)"
          stroke={
            s.color ?? s._resolvedColor ?? 'var(--color-border-emphasized)'
          }
          strokeWidth={2}
          pointerEvents="none"
        />,
      );
    }
    return elements;
  }, [showHoverDots, hoveredIndex, series, resolved]);

  // Hover indicator — band-highlight rect for bar charts, vertical crosshair
  // line for line/area charts. Same source-of-truth (hoveredIndex), distinct
  // visual idioms picked automatically based on the series mix.
  const hoverIndicatorElement = useMemo(() => {
    if (!hoverIndicator || hoveredIndex == null) {
      return null;
    }
    const hoveredDatum = data[hoveredIndex];
    const xv = hoveredDatum?.[xKey];
    if (hoveredDatum == null || xv == null) {
      return null;
    }
    const hasBars = series.some(s => s.type === 'bar');

    // Bar charts on a band scale → soft column highlight.
    if (hasBars && isBandScale(xScale)) {
      const x = xScale(String(xv)) ?? 0;
      const bw = xScale.bandwidth();
      const pad = 8;
      const rectX = Math.max(0, x - pad);
      const rectRight = Math.min(width, x + bw + pad);
      const rectWidth = rectRight - rectX;
      const topPad = Math.min(pad, margin.top);
      return (
        <rect
          x={rectX}
          y={-topPad}
          width={rectWidth}
          height={height + topPad}
          fill="currentColor"
          opacity={0.06}
          rx={4}
          pointerEvents="none"
        />
      );
    }

    // Line / area / dot charts → vertical crosshair through the point
    // (band-center or linear position, resolved by the shared helper).
    const px = xPixel(hoveredDatum, xKey, xScale);
    // xPixel returns NaN for a non-finite x on a linear scale; skip rather than
    // emit x1/x2="NaN". (The band branch above is always finite via `?? 0`.)
    if (!Number.isFinite(px)) {
      return null;
    }
    return (
      <line
        x1={px}
        x2={px}
        y1={0}
        y2={height}
        {...stylex.props(styles.crosshair)}
        pointerEvents="none"
      />
    );
  }, [
    hoverIndicator,
    hoveredIndex,
    series,
    xScale,
    data,
    xKey,
    width,
    height,
    margin.top,
  ]);

  // Render props are ordinary React content. Resolve them once per commit so a
  // custom renderer is not invoked separately by the visibility synchronizer.
  // Keep it browser-only: the layer has no portal target during SSR.
  const cardContent =
    typeof document === 'undefined' ||
    hoveredIndex == null ||
    datum == null ? null : render ? (
      render(xValue, seriesValues)
    ) : (
      <DefaultTooltipContent xValue={xValue} rows={seriesValues} />
    );
  const isCardHidden =
    hoveredIndex == null ||
    datum == null ||
    (render != null && cardContent == null);

  // Synchronize the shared Layer's native Popover state after React commits the
  // new card body. The second positioning pass measures that final body; later
  // moves within the same data point usually resolve to the existing state.
  useEffect(() => {
    cardHiddenRef.current = isCardHidden;
    if (isCardHidden) {
      hideLayer();
      return;
    }

    const pointerEvent = lastPointerEventRef.current;
    if (pointerEvent) {
      positionCard(pointerEvent);
    }
  }, [
    isCardHidden,
    hoveredIndex,
    xValue,
    seriesValues,
    render,
    hideLayer,
    positionCard,
  ]);

  // ─── Render ────────────────────────────────────────────────────────────
  if (typeof document === 'undefined') {
    // SSR: no DOM portal target; band highlight + dots still render in SVG.
    return (
      <>
        {hoverIndicatorElement}
        {dots}
      </>
    );
  }

  return (
    <>
      {hoverIndicatorElement}
      {dots}
      {renderCard(cardContent, isCardHidden)}
    </>
  );
}
