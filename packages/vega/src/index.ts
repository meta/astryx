// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input All public exports for @astryxdesign/vega
 * @output Public API surface for the Astryx Vega wrapper package
 * @position Barrel export; entry point for consumers of @astryxdesign/vega
 *
 * SYNC: When modified, update /packages/vega/README.md
 */

/**
 * @file index.ts
 * @input All public exports for @astryxdesign/vega
 * @output Public API surface for the Astryx Vega wrapper package
 * @position Barrel export; entry point for consumers of @astryxdesign/vega
 *
 * SYNC: When modified, update /packages/vega/README.md
 */

export {VegaChart} from './VegaChart';
export {parseSchema} from './schema';
export {
  buildVegaLiteConfig,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_POINT_SIZE,
  DEFAULT_LEGEND_ORIENT,
  LEGEND_OFFSET,
  TITLE_OFFSET,
} from './vegaLiteConfig';
export type {
  VegaChartProps,
  AnySpec,
  ViewData,
  VegaSpec,
  VegaLiteSpec,
  CompileOptions,
  ParseOptions,
  Config,
  ViewOptions,
  LoggerInterface,
} from './types';
export type {SchemaLibrary, SchemaResult} from './schema';
