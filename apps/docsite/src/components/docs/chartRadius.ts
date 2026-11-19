// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Bound corner radius without changing a chart mark's dimensions. */
export function boundedChartRadius(
  radius: number,
  width: number,
  height: number,
): number {
  if (![radius, width, height].every(Number.isFinite)) {
    return 0;
  }
  return Math.floor(
    Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2)),
  );
}
