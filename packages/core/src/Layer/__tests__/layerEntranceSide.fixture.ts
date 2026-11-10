// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerEntranceSide.fixture.ts
 * @input Nothing: plain boxes
 * @output `LAYER_SIDE_CASES`, layer and trigger boxes with the one expected
 *   side and meeting point for each. The pointer entrance and Popover's touch
 *   growth must agree on every case.
 * @position Shared fixture of layerEntranceSide.test.ts and
 *   popoverSurfaceMotion.test.ts; test-only
 */

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LayerSideCase {
  readonly name: string;
  readonly layer: Box;
  readonly trigger: Box;
  /** The entrance's step toward the trigger on each axis. */
  readonly step: {readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1};
  /** Where the layer meets its trigger, in px from the layer's top-left. */
  readonly origin: {readonly x: number; readonly y: number};
  /**
   * The axis along which Popover's touch growth lengthens. `null` for a
   * layer over its trigger's center: it has no side, so it only scales.
   */
  readonly touchAxis: 'x' | 'y' | null;
}

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

// A 100 x 32 trigger at (300, 400): its center is (350, 416).
const trigger = box(300, 400, 100, 32);

export const LAYER_SIDE_CASES: ReadonlyArray<LayerSideCase> = [
  {
    name: 'below its trigger',
    layer: box(250, 436, 200, 150),
    trigger,
    step: {x: 0, y: -1},
    origin: {x: 100, y: 0},
    touchAxis: 'y',
  },
  {
    name: 'above its trigger, as after a flip',
    layer: box(300, 246, 200, 150),
    trigger,
    step: {x: 0, y: 1},
    origin: {x: 50, y: 150},
    touchAxis: 'y',
  },
  {
    name: 'to the right, a few pixels over its trigger',
    layer: box(396, 400, 160, 200),
    trigger,
    step: {x: -1, y: 0},
    origin: {x: 0, y: 16},
    touchAxis: 'x',
  },
  {
    name: 'to the left of its trigger',
    layer: box(136, 300, 160, 200),
    trigger,
    step: {x: 1, y: 0},
    origin: {x: 160, y: 116},
    touchAxis: 'x',
  },
  {
    name: 'below, with its trigger\u2019s center past its left edge',
    layer: box(380, 436, 200, 150),
    trigger,
    step: {x: 0, y: -1},
    origin: {x: 0, y: 0},
    touchAxis: 'y',
  },
  {
    name: 'below, with its trigger\u2019s center past its right edge',
    layer: box(100, 436, 200, 150),
    trigger,
    step: {x: 0, y: -1},
    origin: {x: 200, y: 0},
    touchAxis: 'y',
  },
  {
    name: 'over its trigger\u2019s center',
    layer: box(275, 386, 250, 168),
    trigger,
    step: {x: 0, y: 0},
    origin: {x: 75, y: 30},
    touchAxis: null,
  },
  {
    name: 'a list over its selected option, centered on its trigger',
    layer: box(300, 300, 160, 240),
    trigger,
    step: {x: 0, y: 0},
    origin: {x: 50, y: 116},
    touchAxis: null,
  },
];
