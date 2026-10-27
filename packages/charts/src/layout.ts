// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layout.ts
 * @output Computes scales, stacking, grouping, then delegates to each series.resolve()
 * @position Called by Chart root — the single layout pass
 *
 * The layout engine does NOT know about specific mark types.
 * It handles cross-series coordination (scales, stacking, grouping)
 * then calls each series' own resolve() method.
 */

import {scaleLinear, scaleBand} from 'd3-scale';
import {stack as d3Stack, stackOrderNone, stackOffsetNone} from 'd3-shape';
import type {
  SeriesDef,
  ChartScale,
  ResolvedPoint,
  SeriesContext,
  YBaseline,
} from './types';

/**
 * Fraction of the data range added as padding above/below for continuous-only
 * charts (no bar/area zero baseline), so endpoints and curve overshoot don't
 * glue to the plot edges.
 */
const CONTINUOUS_HEADROOM = 0.08;

export interface LayoutInput {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesDef[];
  width: number;
  height: number;
  /** How the y-domain is derived when `yDomain` is not provided. Default 'auto'. */
  yBaseline?: YBaseline;
  /** Explicit y-domain [min, max]. Authoritative — no baseline/headroom/nice(). */
  yDomain?: [number, number];
  /**
   * Explicit x-domain [min, max] for numeric/linear x. Authoritative and honored
   * even when `data` is empty (stable streaming window). Ignored for band scales.
   */
  xDomain?: [number, number];
}

export interface LayoutResult {
  xScale: ChartScale;
  yScale: ReturnType<typeof scaleLinear<number, number>>;
  /**
   * Categorical y band scale, built when a series declares `layout.yBandKey`
   * (e.g. a heatmap's rows). When present the y-axis is categorical and the
   * linear `yScale` is unused.
   */
  yBandScale?: ReturnType<typeof scaleBand<string>>;
  resolved: Map<string, ResolvedPoint[]>;
}

/** True only when both ends of an explicit domain are usable finite numbers. */
function isFiniteDomain(domain: [number, number]): boolean {
  return Number.isFinite(domain[0]) && Number.isFinite(domain[1]);
}

/**
 * Finite [min, max] of a numeric column, robust to the two failure modes of
 * `Math.min(...arr)` / `Math.max(...arr)`: a NaN/Infinity poisoning the result,
 * and a call-stack overflow when spreading a very large array (GL marks push
 * hundreds of thousands of points). Empty or degenerate (all-equal) extents are
 * expanded so the resulting scale never collapses onto a single pixel.
 */
function finiteExtent(nums: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of nums) {
    if (Number.isFinite(v)) {
      if (v < lo) {
        lo = v;
      }
      if (v > hi) {
        hi = v;
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return [0, 1];
  }
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.5 || 1;
    return [lo - pad, hi + pad];
  }
  return [lo, hi];
}

export function computeLayout({
  data,
  xKey,
  series,
  width,
  height,
  yBaseline,
  yDomain,
  xDomain,
}: LayoutInput): LayoutResult {
  // A categorical y-axis (heatmap) means BOTH axes are categorical: columns
  // should tile the plot edge-to-edge just like the rows. Drop the bar-style
  // outer padding on the x band scale for these charts so the grid meets the
  // x/y axis lines flush on every side (no asymmetric gap).
  const yBandKey = series.find(s => s.layout.yBandKey != null)?.layout.yBandKey;
  const isCategoricalGrid = yBandKey != null;

  // ─── 1. X scale ──────────────────────────────────────────────────────
  const xValues = data.map(d => d[xKey]);
  const isNumericX =
    xValues.length > 0 && xValues.every(v => typeof v === 'number');

  let xScale: ChartScale;
  if (xDomain && isFiniteDomain(xDomain) && (isNumericX || data.length === 0)) {
    // Explicit domain is authoritative (no .nice()) — enables a stable
    // streaming window and a valid scale even when `data` is empty. Trusted
    // only when finite; a NaN/Infinity domain would collapse the scale.
    // Ignored for categorical x, as documented: a linear scale over string
    // categories would resolve every mark to NaN and draw nothing.
    xScale = scaleLinear().domain(xDomain).range([0, width]);
  } else if (isNumericX) {
    // NaN passes `typeof === 'number'`, so derive the extent defensively.
    const [lo, hi] = finiteExtent(xValues as number[]);
    xScale = scaleLinear().domain([lo, hi]).range([0, width]).nice();
  } else {
    xScale = scaleBand<string>()
      .domain(xValues.map(String))
      .range([0, width])
      .padding(isCategoricalGrid ? 0 : 0.2);
  }

  // ─── 2. Y domain from all series dataKeys ────────────────────────────
  // One pass collects the union of data keys, whether any mark wants a zero
  // baseline, and the stack groupings. `stackGroups` is reused verbatim by the
  // stacking pass below (§3) — previously these groups were built twice.
  const allKeys = new Set<string>();
  let includeZero = false;
  const stackGroups = new Map<string, string[]>();
  for (const s of series) {
    for (const k of s.dataKeys) {
      allKeys.add(k);
    }
    if (s.layout.includeZero) {
      includeZero = true;
    }
    const primaryKey = s.dataKeys[0];
    if (s.layout.stack && primaryKey != null) {
      const group = stackGroups.get(s.layout.stack) ?? [];
      group.push(primaryKey);
      stackGroups.set(s.layout.stack, group);
    }
  }

  let yMin = Infinity,
    yMax = -Infinity;

  // Stacked series contribute the full extent of their running cumulative — every
  // layer boundary, not just the net total — mirroring the d3 stackOffsetNone pass
  // in §3 that actually draws them. The 0 baseline is included because stacks are
  // drawn from it. Tracking only the total would let the drawn bars/areas escape
  // the scale: a mixed-sign stack whose interior peaks exceed the net total, or a
  // 'data'-baseline stack whose bars start at 0 (below the smallest positive
  // total), would render outside the y-domain and be clipped. `Number.isFinite`
  // (not `typeof === 'number'`) keeps a stray NaN/Infinity from corrupting the
  // domain into a NaN/Infinity scale; a non-finite layer carries the baseline
  // forward (contributes nothing new) exactly as stackOffsetNone does.
  const stackedKeys = new Set<string>();
  for (const [, keys] of stackGroups) {
    for (const k of keys) {
      stackedKeys.add(k);
    }
    for (const d of data) {
      let acc = 0;
      if (acc < yMin) {
        yMin = acc;
      }
      if (acc > yMax) {
        yMax = acc;
      }
      for (const k of keys) {
        const v = d[k];
        if (Number.isFinite(v)) {
          acc += v as number;
          if (acc < yMin) {
            yMin = acc;
          }
          if (acc > yMax) {
            yMax = acc;
          }
        }
      }
    }
  }

  // Non-stacked series contribute their individual finite values.
  for (const d of data) {
    for (const k of allKeys) {
      if (stackedKeys.has(k)) {
        continue;
      } // already handled above
      const v = d[k];
      if (Number.isFinite(v)) {
        const n = v as number;
        if (n < yMin) {
          yMin = n;
        }
        if (n > yMax) {
          yMax = n;
        }
      }
    }
  }

  // ─── Resolve the final y-domain ──────────────────────────────────────
  let yDomainFinal: [number, number];
  let applyNice = true;

  if (yDomain && isFiniteDomain(yDomain)) {
    // Caller owns the exact domain (e.g. zoom/streaming). No baseline,
    // headroom, or .nice() — rounding here would cause visual ratcheting.
    // Trusted only when finite; a NaN/Infinity domain falls through to auto.
    yDomainFinal = yDomain;
    applyNice = false;
  } else {
    // Degenerate: no finite values (empty data / all non-numeric).
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      yMin = 0;
      yMax = 1;
    }
    // Degenerate: zero range (single point / all-equal) — expand so the mark
    // is visible and ticks are sane.
    if (yMin === yMax) {
      const pad = Math.abs(yMin) * 0.5 || 1;
      yMin -= pad;
      yMax += pad;
    }

    const mode: YBaseline = yBaseline ?? 'auto';
    if (mode === 'zero') {
      const abs = Math.max(Math.abs(yMin), Math.abs(yMax));
      yMin = -abs;
      yMax = abs;
    } else if (mode === 'data') {
      // Tight fit — no zero forcing, no headroom.
    } else {
      // 'auto': bar/area marks pin an honest zero baseline; continuous-only
      // charts get headroom so endpoints/overshoot don't glue to the edges.
      if (includeZero) {
        if (yMin > 0) {
          yMin = 0;
        }
        if (yMax < 0) {
          yMax = 0;
        }
      } else {
        const pad = (yMax - yMin || 1) * CONTINUOUS_HEADROOM;
        yMin -= pad;
        yMax += pad;
      }
    }
    yDomainFinal = [yMin, yMax];
  }

  const yScaleBase = scaleLinear().domain(yDomainFinal).range([height, 0]);
  const yScale = applyNice ? yScaleBase.nice() : yScaleBase;

  // ─── 2b. Categorical y band scale ────────────────────────────────────
  // If any series declares a `yBandKey` (e.g. a heatmap's rows), the y-axis is
  // categorical: build one band scale over that key's unique values so the
  // marks and the left axis share the same row layout. The linear yScale above
  // is left in place but goes unused for these charts.
  // No band padding: heatmap rows should tile the full plot height edge-to-edge
  // (the mark's own `cellGap` draws the thin grid lines between cells). Padding
  // here would inset the grid and leave a sliver at the top/bottom.
  let yBandScale: ReturnType<typeof scaleBand<string>> | undefined;
  if (yBandKey != null) {
    const cats = [...new Set(data.map(d => String(d[yBandKey])))];
    yBandScale = scaleBand<string>().domain(cats).range([0, height]).padding(0);
  }

  // ─── 3. Stacking ─────────────────────────────────────────────────────
  // Reuses `stackGroups` collected during the domain pass (§2).
  const stackedData = new Map<string, {y0: number; y1: number}[]>();
  for (const [, keys] of stackGroups) {
    const stackGen = d3Stack<Record<string, unknown>>()
      .keys(keys)
      .order(stackOrderNone)
      .offset(stackOffsetNone);
    const stacked = stackGen(data);
    for (const layer of stacked) {
      stackedData.set(
        layer.key,
        layer.map(d => ({y0: d[0], y1: d[1]})),
      );
    }
  }

  // ─── 4. Bar grouping ─────────────────────────────────────────────────
  // Bars can be grouped (side-by-side) whether or not they are stacked.
  // For grouped stacks, each unique stack group name within the same bar
  // group gets its own sub-band. For ungrouped non-stacked bars with a
  // group key, each series gets its own sub-band.
  const barGroups = new Map<string, string[]>();
  for (const s of series) {
    if (s.type === 'bar' && s.layout.group) {
      const group = barGroups.get(s.layout.group) ?? [];
      // For grouped stacks: use the stack name as the group slot identifier
      // so all series in the same stack share one slot.
      const slotKey = s.layout.stack ?? s.key;
      if (!group.includes(slotKey)) {
        group.push(slotKey);
      }
      barGroups.set(s.layout.group, group);
    }
  }

  // ─── 5. Resolve each series ──────────────────────────────────────────
  const ctx: SeriesContext = {
    data,
    xKey,
    xScale,
    yScale,
    yBandScale,
    width,
    height,
  };
  const resolved = new Map<string, ResolvedPoint[]>();

  // Determine which series is the topmost in each stack group
  const stackTopKeys = new Set<string>();
  for (const [, keys] of stackGroups) {
    // Last key in the stack group is rendered on top
    if (keys.length > 0) {
      stackTopKeys.add(keys[keys.length - 1]);
    }
  }

  for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex++) {
    const s = series[seriesIndex];
    // Assign a collision-free identity from array position. Two series sharing
    // a dataKey (and thus `key`) still get distinct uids, so neither the
    // resolved map nor React keys silently drop one of them.
    s._uid = `${seriesIndex}:${s.key}`;
    const stackOffsets = stackedData.get(s.dataKeys[0]);

    // Mark whether this series is the topmost in its stack
    if (s.layout.stack) {
      s._isTopOfStack = stackTopKeys.has(s.dataKeys[0]);
    } else {
      s._isTopOfStack = true;
    }

    let groupInfo: {index: number; count: number} | undefined;
    if (s.layout.group) {
      const groupKeys = barGroups.get(s.layout.group);
      if (groupKeys) {
        // For grouped stacks, the slot key is the stack name
        const slotKey = s.layout.stack ?? s.key;
        groupInfo = {
          index: groupKeys.indexOf(slotKey),
          count: groupKeys.length,
        };
      }
    }

    const points = s.resolve(ctx, stackOffsets, groupInfo);
    resolved.set(s._uid, points);
  }

  return {xScale, yScale, yBandScale, resolved};
}
