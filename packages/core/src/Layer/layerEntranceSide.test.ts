// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  LAYER_ENTER_ORIGIN_PROPERTY,
  LAYER_ENTER_X_PROPERTY,
  LAYER_ENTER_Y_PROPERTY,
  layerEntranceSide,
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
  it('starts a layer below its trigger one step up, from its top edge', () => {
    expect(layerEntranceSide(box(250, 436, 200, 150), trigger)).toEqual({
      x: 0,
      y: -1,
      originX: 50,
      originY: 0,
    });
  });

  it('starts a layer above its trigger one step down, from its bottom edge', () => {
    expect(layerEntranceSide(box(300, 246, 200, 150), trigger)).toEqual({
      x: 0,
      y: 1,
      originX: 25,
      originY: 100,
    });
  });

  it('starts a layer to the right one step left, even over a few pixels of its trigger', () => {
    expect(layerEntranceSide(box(396, 400, 160, 200), trigger)).toEqual({
      x: -1,
      y: 0,
      originX: 0,
      originY: 8,
    });
  });

  it('starts a layer to the left one step right, from its right edge', () => {
    expect(layerEntranceSide(box(136, 300, 160, 200), trigger)).toEqual({
      x: 1,
      y: 0,
      originX: 100,
      originY: 58,
    });
  });

  it('keeps the origin on the facing edge when the trigger center is past the layer', () => {
    expect(layerEntranceSide(box(380, 436, 200, 150), trigger)).toMatchObject({
      originX: 0,
      originY: 0,
    });
    expect(layerEntranceSide(box(100, 436, 200, 150), trigger)).toMatchObject({
      originX: 100,
    });
  });

  it('scales a layer over its trigger about the trigger center, without a step', () => {
    expect(layerEntranceSide(box(275, 386, 250, 168), trigger)).toEqual({
      x: 0,
      y: 0,
      originX: 30,
      originY: 17.857,
    });
  });

  it('gives nothing for a layer without size', () => {
    expect(layerEntranceSide(box(250, 436, 0, 150), trigger)).toBeNull();
  });
});

describe('writeLayerEntranceSide', () => {
  const place = (element: HTMLElement, rect: ReturnType<typeof box>) => {
    element.getBoundingClientRect = () => ({
      ...rect,
      x: rect.left,
      y: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      toJSON: () => rect,
    });
  };

  it('writes the side the layer landed on, and initial without one', () => {
    const layer = document.createElement('div');
    const anchor = document.createElement('button');
    document.body.append(layer, anchor);
    place(anchor, trigger);
    place(layer, box(300, 246, 200, 150));

    writeLayerEntranceSide(layer, anchor);
    expect(layer.style.getPropertyValue(LAYER_ENTER_X_PROPERTY)).toBe('0');
    expect(layer.style.getPropertyValue(LAYER_ENTER_Y_PROPERTY)).toBe('1');
    expect(layer.style.getPropertyValue(LAYER_ENTER_ORIGIN_PROPERTY)).toBe(
      '25% 100%',
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
