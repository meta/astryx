// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {LAYER_SIDE_CASES} from './__tests__/layerEntranceSide.fixture';
import {
  LAYER_ENTER_ORIGIN_PROPERTY,
  LAYER_ENTER_X_PROPERTY,
  LAYER_ENTER_Y_PROPERTY,
  layerEntranceSide,
  readLayerEntranceSide,
  writeLayerEntranceSide,
} from './layerEntranceSide';

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

// A 100 x 32 trigger at (300, 400).
const trigger = box(300, 400, 100, 32);

describe('layerEntranceSide', () => {
  it.each(LAYER_SIDE_CASES)(
    'a layer $name steps and scales from its meeting point',
    ({layer, trigger: anchor, step, origin}) => {
      expect(layerEntranceSide(layer, anchor)).toEqual({
        x: step.x,
        y: step.y,
        originX: origin.x,
        originY: origin.y,
      });
    },
  );

  it('gives nothing for a layer without size', () => {
    expect(layerEntranceSide(box(250, 436, 0, 150), trigger)).toBeNull();
  });
});

describe('readLayerEntranceSide and writeLayerEntranceSide', () => {
  const place = (
    element: HTMLElement,
    rect: ReturnType<typeof box>,
    reads: string[],
    name: string,
  ) => {
    element.getBoundingClientRect = () => {
      reads.push(name);
      return {
        ...rect,
        x: rect.left,
        y: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        toJSON: () => rect,
      };
    };
  };

  it('reads the anchor before the layer, then writes the side, and writes initial without one', () => {
    const layer = document.createElement('div');
    const anchor = document.createElement('button');
    document.body.append(layer, anchor);
    const reads: string[] = [];
    place(anchor, trigger, reads, 'anchor');
    place(layer, box(300, 246, 200, 150), reads, 'layer');

    const side = readLayerEntranceSide(layer, anchor);
    expect(reads).toEqual(['anchor', 'layer']);
    writeLayerEntranceSide(layer, side);
    expect(layer.style.getPropertyValue(LAYER_ENTER_X_PROPERTY)).toBe('0');
    expect(layer.style.getPropertyValue(LAYER_ENTER_Y_PROPERTY)).toBe('1');
    expect(layer.style.getPropertyValue(LAYER_ENTER_ORIGIN_PROPERTY)).toBe(
      '50px 150px',
    );

    writeLayerEntranceSide(layer, null);
    for (const property of [
      LAYER_ENTER_X_PROPERTY,
      LAYER_ENTER_Y_PROPERTY,
      LAYER_ENTER_ORIGIN_PROPERTY,
    ]) {
      expect(layer.style.getPropertyValue(property)).toBe('initial');
    }
    layer.remove();
    anchor.remove();
  });
});
