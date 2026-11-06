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
import {CATEGORICAL_TOKENS, type TokenResolver} from '@astryxdesign/charts';
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
      // Same slot order as the compositional charts — one shared list.
      category: CATEGORICAL_TOKENS.map(name => token(name)),
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
): CompileOptions {
  const theme = buildVegaLiteConfig(token);
  return {
    ...compileOptions,
    config: compileOptions?.config
      ? mergeVegaLiteConfig(theme, compileOptions.config)
      : theme,
  };
}
