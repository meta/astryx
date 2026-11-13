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

/** The theme's per-axis blocks. Vega-Lite applies each one over `axis`. */
/**
 * For each per-axis block the theme sets, the axis blocks that Vega-Lite
 * resolves before it for the same axes. Vega-Lite resolves `axis`, then the
 * orient blocks, then `axisX` and `axisY`, then the type blocks such as
 * `axisQuantitative`, then the channel-and-type blocks such as
 * `axisYQuantitative`. The orient blocks are matched as by default: x at
 * the bottom or top, y at the left or right.
 */
const EARLIER_AXIS_BLOCKS = {
  axisX: ['axis', 'axisBottom', 'axisTop'],
  axisY: ['axis', 'axisLeft', 'axisRight'],
  axisXQuantitative: [
    'axis',
    'axisBottom',
    'axisTop',
    'axisX',
    'axisQuantitative',
  ],
  axisYQuantitative: [
    'axis',
    'axisLeft',
    'axisRight',
    'axisY',
    'axisQuantitative',
  ],
} as const;

/**
 * The theme config without each per-axis value that the caller or the spec
 * sets in an axis block Vega-Lite resolves earlier for the same axes. The
 * later theme block would otherwise outrank it: a themed
 * `axisYQuantitative.grid` would win over a caller's `axisY.grid`.
 */
function withoutOverriddenAxisValues(
  theme: VegaLiteConfig,
  overrides: ReadonlyArray<VegaLiteConfig | undefined>,
): VegaLiteConfig {
  const result: Record<string, unknown> = {...theme};
  for (const [key, earlier] of Object.entries(EARLIER_AXIS_BLOCKS)) {
    const block = theme[key as keyof typeof EARLIER_AXIS_BLOCKS];
    if (!block) {
      continue;
    }
    const setProps = new Set(
      overrides.flatMap(config =>
        earlier.flatMap(name =>
          Object.keys(
            (config as Record<string, object | undefined> | undefined)?.[
              name
            ] ?? {},
          ),
        ),
      ),
    );
    if (setProps.size > 0) {
      result[key] = Object.fromEntries(
        Object.entries(block).filter(([prop]) => !setProps.has(prop)),
      );
    }
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
 * compile(spec, withAstryxConfig(token, compileOptions));
 * ```
 */
export function withAstryxConfig(
  token: TokenResolver,
  compileOptions?: CompileOptions,
  specConfig?: VegaLiteConfig,
): CompileOptions {
  const theme = withoutOverriddenAxisValues(buildVegaLiteConfig(token), [
    compileOptions?.config as VegaLiteConfig | undefined,
    specConfig,
  ]);
  return {
    ...compileOptions,
    config: compileOptions?.config
      ? mergeVegaLiteConfig(theme, compileOptions.config)
      : theme,
  };
}
