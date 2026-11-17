// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @output Core types for the v2 chart architecture
 * @position Foundation — consumed by layout, renderers, and interactions
 */

import type {ReactNode} from 'react';
import type {ScaleLinear, ScaleBand} from 'd3-scale';

export type ChartScale = ScaleLinear<number, number> | ScaleBand<string>;

/**
 * A color for a mark: either a constant CSS color/token, or an accessor that
 * returns a color per datum (for per-element coloring, e.g. positive/negative).
 */
export type ColorAccessor =
  string | ((datum: Record<string, unknown>, index: number) => string);

/**
 * Fallback series color used when a mark has neither an explicit color nor a
 * palette color assigned by the chart root. Keeps `--color-accent` as its
 * semantic fallback. CSS-capable code can also use the public `dataVars` group;
 * Core's prebuilt stylesheet defines its `--color-data-*` custom properties.
 * Canvas and other non-CSS paths need concrete colors from resolveThemeToken()
 * or useTheme().token(). The chart root normally assigns a resolved palette
 * color, so this is only a last-resort fallback.
 */
export const DEFAULT_SERIES_COLOR = 'var(--color-accent)';

/**
 * Controls how the y-axis domain is derived when no explicit `yDomain` is given:
 * - `'auto'` (default) — bar/area marks pin an honest zero baseline; continuous-
 *   only charts (line/dot/…) get a little headroom so points don't touch edges.
 * - `'zero'` — symmetric around zero (good for +/- data like profit/loss).
 * - `'data'` — tight fit to the data extent (no zero forcing, no headroom).
 */
export type YBaseline = 'auto' | 'zero' | 'data';

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Resolved pixel position for a single data point in a series */
export interface ResolvedPoint {
  /** Pixel x in plot area coordinates */
  px: number;
  /** Pixel y in plot area coordinates (top of mark) */
  py: number;
  /** Pixel y baseline (bottom of mark) — differs from py when stacked */
  py0: number;
  /** Index into the data array */
  dataIndex: number;
}

/** Context passed to resolve() and render() on each series */
export interface SeriesContext {
  data: Record<string, unknown>[];
  xKey: string;
  xScale: ChartScale;
  yScale: ScaleLinear<number, number>;
  /**
   * Categorical y band scale for row-based marks (e.g. heatmap). Present only
   * when a series declares `layout.yBandKey`; in that case the y-axis is
   * categorical and the linear `yScale` is unused/degenerate.
   */
  yBandScale?: ScaleBand<string>;
  /** Width of the plot area */
  width: number;
  /** Height of the plot area */
  height: number;
}

/**
 * The standardized shape every mark helper returns.
 * Each mark type is self-contained: it knows how to resolve positions
 * and how to render itself. The chart root just iterates and calls.
 *
 * A SeriesDef instance is single-use: the layout/render pass annotates it in
 * place (`_uid`, `_isTopOfStack`, `_resolvedColor`), so a given def must belong
 * to exactly one <Chart>. Build a fresh series array per chart rather than
 * sharing the same mark objects across charts.
 */
export interface SeriesDef {
  /** Mark type identifier */
  readonly type: string;
  /**
   * Semantic key for this series — typically the dataKey. Used as a
   * human-readable label fallback and for stack/group coordination. It is NOT
   * guaranteed unique (two series can share a dataKey), so it must never be
   * used as a Map key or React key — use `_uid` for identity instead.
   */
  readonly key: string;
  /** Data keys this series reads from — used to compute y domain */
  readonly dataKeys: string[];
  /**
   * Collision-free per-instance identity, assigned by the layout pass from the
   * series' position in the `series` array. This is the key used for the
   * resolved map, React keys, and tooltip/hover lookups. Never set it yourself.
   */
  _uid?: string;
  /** Whether this series is the topmost in its stack (set during layout) */
  _isTopOfStack?: boolean;
  /** Static color for legend display. Undefined if color is dynamic (accessor function). */
  readonly color?: string;
  /**
   * Palette color assigned by the chart root for series that don't supply a
   * static color (auto-colored or accessor-colored). Used as the render fallback
   * and the legend/tooltip representative color. Never set it yourself.
   */
  _resolvedColor?: string;
  /** Human-readable label for legend. Falls back to key if not provided. */
  readonly label?: string;
  /** Layout hints the chart root uses for cross-series coordination */
  readonly layout: {
    /** Stack group — series with same stack accumulate */
    stack?: string;
    /** Bar group — series with same group subdivide bandwidth */
    group?: string;
    /** Whether this series contributes to y-domain zero inclusion */
    includeZero?: boolean;
    /**
     * When set, the chart's y-axis is a band scale built from this data key's
     * unique values (categorical rows, e.g. a heatmap's days) rather than a
     * linear value scale. The layout pass exposes it to marks and the axis as
     * `yBandScale`, so a left `<ChartAxis>` renders the categories aligned to
     * each row. A heatmap should also declare `dataKeys: []` so it doesn't feed
     * the (now unused) linear y-domain.
     */
    yBandKey?: string;
  };
  /**
   * Resolve pixel positions for each data point.
   * Called by the chart root during the layout pass.
   * Receives pre-computed stack offsets if stacked.
   */
  resolve(
    ctx: SeriesContext,
    stackOffsets?: {y0: number; y1: number}[],
    groupInfo?: {index: number; count: number},
  ): ResolvedPoint[];
  /**
   * Render the mark given resolved positions.
   * Called by the chart root during the render pass.
   * Returns SVG elements (or manages its own canvas for WebGL).
   */
  render(resolved: ResolvedPoint[], ctx: SeriesContext): ReactNode;
}

/** Resolved positions for all series */
export type ResolvedPositions = Map<string, ResolvedPoint[]>;

/** Pointer event normalized to plot-area coordinates */
export interface ChartPointerEvent {
  x: number;
  y: number;
  nearest: (ResolvedPoint & {seriesKey: string}) | null;
  active: boolean;
}

/** Context provided by Chart to interaction children */
export interface ChartContext {
  width: number;
  height: number;
  margin: ChartMargin;
  data: Record<string, unknown>[];
  xKey: string;
  xScale: ChartScale;
  yScale: ScaleLinear<number, number>;
  /**
   * Categorical y band scale (e.g. heatmap rows), present when a series declares
   * `layout.yBandKey`. Chrome that renders the y-axis (`ChartAxis`) should
   * prefer this over the linear `yScale` when it exists.
   */
  yBandScale?: ScaleBand<string>;
  resolved: Map<string, ResolvedPoint[]>;
  onPointer: (handler: (e: ChartPointerEvent) => void) => () => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

/**
 * Series mark types that are utility / annotation marks rather than primary
 * data. They're skipped from chrome surfaces (legend, tooltip rows) since
 * they don't represent values the user is comparing.
 */
export const UTILITY_MARK_TYPES: ReadonlySet<string> = new Set([
  'referenceLine',
  'errorBar',
  'band',
]);

/** True if the series type is a utility / annotation mark. */
export function isUtilityMarkType(type: string): boolean {
  return UTILITY_MARK_TYPES.has(type);
}
