// Copyright (c) Meta Platforms, Inc. and affiliates.

export {Chart, type ChartProps} from './Chart';
export {ChartAxis, type ChartAxisProps} from './ChartAxis';
export {ChartGrid, type ChartGridProps} from './ChartGrid';
export {
  ChartLegend,
  type ChartLegendProps,
  type LegendPosition,
  type LegendAlignment,
} from './ChartLegend';
export {type LegendItem} from './legend';
export {
  ChartSwatch,
  swatchVariantForType,
  type ChartSwatchProps,
  type ChartSwatchVariant,
} from './ChartSwatch';
export {
  ChartTooltip,
  type ChartTooltipProps,
  type ChartTooltipPlacement,
} from './ChartTooltip';
export {type TooltipSeriesValue} from './tooltip';
export {
  bar,
  line,
  dot,
  area,
  band,
  candlestick,
  errorBar,
  referenceLine,
  dotGL,
  dotGLInteractive,
  heatmapGL,
  streamGL,
} from './marks';
export type {
  BarOptions,
  LineOptions,
  DotOptions,
  AreaOptions,
  BandOptions,
  CandlestickOptions,
  ErrorBarOptions,
  ReferenceLineOptions,
  DotGLOptions,
  DotGLInteractiveOptions,
  HeatmapGLOptions,
  StreamGLOptions,
  StreamGLHandle,
} from './marks';
export {useChart} from './ChartContext';
export type {
  SeriesDef,
  ChartContext,
  ChartPointerEvent,
  ResolvedPoint,
  ResolvedPositions,
  SeriesContext,
  ChartMargin,
  ChartScale,
  YBaseline,
  ColorAccessor,
} from './types';

// Color palette — theme-aware data-visualization colors
export {useChartColors} from './useChartColors';
export {
  getChartColors,
  getChartColorsFromResolver,
  type ChartColorsAPI,
  type SequentialHue,
  type TokenResolver,
} from './getChartColors';

// Tick / value formatters
export {
  compactNumber,
  currency,
  percent,
  shortDate,
  monthYear,
} from './formatters';

// Scale utilities
export {isBandScale, xPixel} from './utils';
