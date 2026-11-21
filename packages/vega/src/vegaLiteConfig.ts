// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vegaLiteConfig.ts
 * @input Astryx theme tokens via useTheme
 * @output Predefined Vega-Lite Config object for Astryx-themed charts, plus the
 *   compile-options merge that applies it
 * @position Utility module; consumed by VegaChart and exported standalone
 *
 * Ported from the internal Astryx data-viz config — structural config only.
 * Colors are wired through Astryx data tokens (see domainTokens/dataTokens.ts).
 * The categorical palette and the token-resolver type come from
 * `@astryxdesign/charts`, so this package and the compositional charts share
 * one source of truth instead of two lists that can drift apart.
 *
 * SYNC: When modified, update this header and /packages/vega/README.md
 */

import {mergeConfig} from 'vega';
import type {Config as VegaLiteConfig} from 'vega-lite';
import {
  getChartColorsFromResolver,
  type TokenResolver,
} from '@astryxdesign/charts';
import type {CompileOptions} from './types';

// ---------------------------------------------------------------------------
// Constants (ported from XDSDataVizVegaLiteConstants)
// ---------------------------------------------------------------------------

/** Default stroke width for line marks */
export const DEFAULT_STROKE_WIDTH = 2;

/** Default point size for point marks */
export const DEFAULT_POINT_SIZE = 64;

/** Default legend orientation */
export const DEFAULT_LEGEND_ORIENT = 'right' as const;

/** Offset between legend and chart area */
export const LEGEND_OFFSET = 16;

/** Offset between title and chart area */
export const TITLE_OFFSET = 16;

// ---------------------------------------------------------------------------
// Config builder
// ---------------------------------------------------------------------------

/**
 * Build a Vega-Lite `Config` object themed with Astryx tokens.
 *
 * Call this inside a component that has access to `useXDSTheme()`:
 *
 * ```
 * const { token } = useXDSTheme();
 * const config = buildVegaLiteConfig(token);
 * ```
 *
 * The returned config sets axis styles, legend layout, line/point mark
 * defaults, title typography, and view chrome — everything except color
 * scales (which are set via `range` using the Astryx data-viz tokens).
 */
export function buildVegaLiteConfig(token: TokenResolver): VegaLiteConfig {
  return {
    axis: {
      domainColor: token('--color-icon-primary'),
      domainWidth: 0.5,
      gridColor: token('--color-background-muted'),
      labelColor: token('--color-text-secondary'),
      labelFont: token('--font-family-body'),
      labelFontSize: 12,
      labelLineHeight: 16,
      labelPadding: 8,
      tickCount: 5,
      ticks: false,
      title: null,
    },

    axisX: {
      grid: false,
    },

    axisXQuantitative: {
      domain: true,
    },

    axisY: {
      domain: false,
    },

    axisYQuantitative: {
      grid: true,
      gridWidth: 0.5,
    },

    background: token('--color-background-card'),

    legend: {
      labelColor: token('--color-text-secondary'),
      labelFont: token('--font-family-body'),
      labelFontSize: 12,
      labelPadding: 8,
      offset: LEGEND_OFFSET,
      orient: DEFAULT_LEGEND_ORIENT,
      rowPadding: 12,
      title: null,
      titleColor: token('--color-text-secondary'),
      titleFont: token('--font-family-heading'),
      titleFontSize: 16,
    },

    line: {
      strokeCap: 'round',
      strokeJoin: 'round',
      strokeWidth: DEFAULT_STROKE_WIDTH,
    },

    padding: 16,

    point: {
      shape: 'circle',
      size: DEFAULT_POINT_SIZE,
      fill: token('--color-background-card'),
    },

    range: {
      // The compositional charts' palette, in their slot order. Ten slots, the
      // same range Vega used before; Vega cycles the range for more series.
      category: getChartColorsFromResolver(token).categorical(10),
      diverging: [
        token('--color-data-blue-5'),
        token('--color-data-blue-4'),
        token('--color-data-blue-3'),
        token('--color-data-blue-2'),
        token('--color-data-blue-1'),
        token('--color-data-gray-1'),
        token('--color-data-red-1'),
        token('--color-data-red-2'),
        token('--color-data-red-3'),
        token('--color-data-red-4'),
        token('--color-data-red-5'),
      ],
      heatmap: [
        token('--color-data-blue-1'),
        token('--color-data-blue-2'),
        token('--color-data-blue-3'),
        token('--color-data-blue-4'),
        token('--color-data-blue-5'),
      ],
      ordinal: [
        token('--color-data-blue-5'),
        token('--color-data-blue-4'),
        token('--color-data-blue-3'),
        token('--color-data-blue-2'),
        token('--color-data-blue-1'),
      ],
      ramp: [
        token('--color-data-blue-1'),
        token('--color-data-blue-2'),
        token('--color-data-blue-3'),
        token('--color-data-blue-4'),
        token('--color-data-blue-5'),
      ],
    },

    scale: {
      bandPaddingInner: 0.1,
    },

    text: {
      color: token('--color-text-primary'),
    },

    title: {
      anchor: 'start',
      color: token('--color-text-primary'),
      subtitleFontWeight: 'normal',
      subtitleColor: token('--color-text-secondary'),
      offset: TITLE_OFFSET,
    },

    view: {
      stroke: null,
    },
  } satisfies VegaLiteConfig;
}

// ---------------------------------------------------------------------------
// Compile options
// ---------------------------------------------------------------------------

/**
 * `mergeConfig` is a generic recursive merge of plain config objects where the
 * later argument wins — the same helper vega-lite itself uses to fold
 * `opt.config` into a spec's own `config`. Vega types it against *Vega*'s
 * `Config`, whose `signals` shape differs from Vega-Lite's, so it is retyped
 * here for the Vega-Lite config we actually pass it.
 */
const mergeVegaLiteConfig = mergeConfig as unknown as (
  ...configs: VegaLiteConfig[]
) => VegaLiteConfig;

type AxisOrient = 'top' | 'bottom' | 'left' | 'right';
type AxisChannel = 'x' | 'y';

const ORIENT_BLOCK: Record<AxisOrient, string> = {
  top: 'axisTop',
  bottom: 'axisBottom',
  left: 'axisLeft',
  right: 'axisRight',
};

const CHANNEL_BLOCK: Record<AxisChannel, string> = {x: 'axisX', y: 'axisY'};

/** The theme's per-axis blocks, by channel and by whether they are quantitative only. */
const THEME_AXIS_BLOCKS = [
  {key: 'axisX', channel: 'x', isQuantitative: false},
  {key: 'axisY', channel: 'y', isQuantitative: false},
  {key: 'axisXQuantitative', channel: 'x', isQuantitative: true},
  {key: 'axisYQuantitative', channel: 'y', isQuantitative: true},
] as const;

/**
 * The orients at which the spec draws an x or y axis, each with the field
 * types of the axes drawn there. An encoding without an axis orient draws x
 * at the bottom and y at the left, and `axis: null` draws none. Every view of
 * a layered or composed spec counts. Inline data is not walked, so a spec
 * with many rows costs nothing here.
 */
function drawnAxes(
  spec: unknown,
): Record<AxisChannel, Map<AxisOrient, Set<string>>> {
  const drawn = {x: new Map(), y: new Map()} as Record<
    AxisChannel,
    Map<AxisOrient, Set<string>>
  >;
  const seen = new WeakSet<object>();
  const stack: unknown[] = [spec];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object' || seen.has(node)) {
      continue;
    }
    seen.add(node);
    const encoding = (node as {encoding?: unknown}).encoding;
    if (encoding !== null && typeof encoding === 'object') {
      for (const channel of ['x', 'y'] as const) {
        const def = (encoding as Record<string, unknown>)[channel];
        if (def === null || typeof def !== 'object') {
          continue;
        }
        const {axis, type} = def as {
          axis?: {orient?: AxisOrient} | null;
          type?: string;
        };
        if (axis === null) {
          continue;
        }
        const orient = axis?.orient ?? (channel === 'x' ? 'bottom' : 'left');
        const types = drawn[channel].get(orient) ?? new Set<string>();
        types.add(type ?? 'quantitative');
        drawn[channel].set(orient, types);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'data' && key !== 'datasets') {
        stack.push(value);
      }
    }
  }
  for (const channel of ['x', 'y'] as const) {
    if (drawn[channel].size === 0) {
      drawn[channel].set(
        channel === 'x' ? 'bottom' : 'left',
        new Set(['quantitative']),
      );
    }
  }
  return drawn;
}

/**
 * The theme config with its per-axis values moved out of the way of the
 * caller's and the spec's own axis keys. Vega-Lite resolves `axis`, then the
 * orient blocks, then `axisX` and `axisY`, then the type blocks such as
 * `axisQuantitative`, then the channel-and-type blocks. A theme per-axis
 * value would outrank a key set in an earlier block. So a value set for every
 * axis of the theme block is left out. A value set in the orient blocks of
 * only some of the orients the chart draws moves to the orient blocks of the
 * others, so those axes keep it. A quantitative-only value moves only to an
 * orient whose axes are all quantitative.
 */
function withoutOverriddenAxisValues(
  theme: VegaLiteConfig,
  overrides: ReadonlyArray<VegaLiteConfig | undefined>,
  spec: unknown,
): VegaLiteConfig {
  const setIn = (name: string) =>
    new Set(
      overrides.flatMap(config =>
        Object.keys(
          (config as Record<string, object | undefined> | undefined)?.[name] ??
            {},
        ),
      ),
    );
  const drawn = drawnAxes(spec);
  const result: Record<string, Record<string, unknown> | unknown> = {
    ...theme,
  };
  for (const {key, channel, isQuantitative} of THEME_AXIS_BLOCKS) {
    const block = (
      theme as Record<string, Record<string, unknown> | undefined>
    )[key];
    if (!block) {
      continue;
    }
    // Vega ranks the orient blocks above `axisX` and `axisY`, so a value
    // moved to an orient block would outrank a key set there.
    const everywhere = new Set([
      ...setIn('axis'),
      ...setIn(CHANNEL_BLOCK[channel]),
      ...(isQuantitative ? setIn('axisQuantitative') : []),
    ]);
    const orients = [...drawn[channel].entries()].filter(
      ([, types]) => !isQuantitative || types.has('quantitative'),
    );
    const kept: Record<string, unknown> = {};
    for (const [prop, value] of Object.entries(block)) {
      const setAt = orients.filter(([orient]) =>
        setIn(ORIENT_BLOCK[orient]).has(prop),
      );
      if (!everywhere.has(prop) && setAt.length === 0) {
        kept[prop] = value;
        continue;
      }
      if (everywhere.has(prop)) {
        continue;
      }
      for (const [orient, types] of orients) {
        const isSetHere = setAt.some(([setOrient]) => setOrient === orient);
        const isExact =
          !isQuantitative || [...types].every(type => type === 'quantitative');
        if (!isSetHere && isExact) {
          const name = ORIENT_BLOCK[orient];
          result[name] = {
            ...((result[name] as Record<string, unknown> | undefined) ?? {}),
            [prop]: value,
          };
        }
      }
    }
    result[key] = kept;
  }
  return result as VegaLiteConfig;
}

/**
 * Layer the Astryx theme underneath a caller's Vega-Lite compile options.
 *
 * The themed config is the **base**; anything the caller passed in
 * `compileOptions.config` is merged on top and wins, key by key
 * (`vega`'s `mergeConfig`, so a partial override like `{axis: {grid: true}}`
 * only replaces that key rather than the whole `axis` block). A spec's own
 * inline `config` still wins over both — that is vega-lite's own precedence,
 * which compiles `mergeConfig(opt.config, spec.config)`.
 *
 * Pure and React-free, so `VegaChart`'s theming is testable without a DOM.
 *
 * @example
 * ```
 * const {token} = useTheme();
 * compile(spec, withAstryxConfig(token, compileOptions, spec));
 * ```
 */
export function withAstryxConfig(
  token: TokenResolver,
  compileOptions?: CompileOptions,
  spec?: {config?: VegaLiteConfig},
): CompileOptions {
  const theme = withoutOverriddenAxisValues(
    buildVegaLiteConfig(token),
    [compileOptions?.config as VegaLiteConfig | undefined, spec?.config],
    spec,
  );
  return {
    ...compileOptions,
    config: compileOptions?.config
      ? mergeVegaLiteConfig(theme, compileOptions.config)
      : theme,
  };
}
