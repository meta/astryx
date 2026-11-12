// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  LAYER_ENTER_GAP_PROPERTY,
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
  it('starts a layer below its trigger one step up, from its top edge', () => {
    expect(layerEntranceSide(box(250, 436, 200, 150), trigger)).toEqual({
      x: 0,
      y: -1,
      originX: 100,
      originY: 0,
      gap: 4,
    });
  });

  it('starts a layer above its trigger one step down, from its bottom edge', () => {
    expect(layerEntranceSide(box(300, 246, 200, 150), trigger)).toEqual({
      x: 0,
      y: 1,
      originX: 50,
      originY: 150,
      gap: 4,
    });
  });

  it('gives a layer to the right over a few pixels of its trigger a side and no room', () => {
    expect(layerEntranceSide(box(396, 400, 160, 200), trigger)).toEqual({
      x: -1,
      y: 0,
      originX: 0,
      originY: 16,
      gap: 0,
    });
  });

  it('starts a layer to the left one step right, from its right edge', () => {
    expect(layerEntranceSide(box(136, 300, 160, 200), trigger)).toEqual({
      x: 1,
      y: 0,
      originX: 160,
      originY: 116,
      gap: 4,
    });
  });

  it('keeps the origin on the facing edge when the trigger center is past the layer', () => {
    expect(layerEntranceSide(box(380, 436, 200, 150), trigger)).toMatchObject({
      originX: 0,
      originY: 0,
    });
    expect(layerEntranceSide(box(100, 436, 200, 150), trigger)).toMatchObject({
      originX: 200,
    });
  });

  it('scales a layer over its trigger about the trigger center, without a step', () => {
    expect(layerEntranceSide(box(275, 386, 250, 168), trigger)).toEqual({
      x: 0,
      y: 0,
      originX: 75,
      originY: 30,
      gap: 0,
    });
  });

  it('caps the step at the room between a layer and its trigger', () => {
    // A tall tooltip 4 px beside its trigger: an 8 px step would start it
    // over the trigger.
    expect(layerEntranceSide(box(404, 200, 240, 400), trigger)).toMatchObject({
      x: -1,
      gap: 4,
    });
    expect(layerEntranceSide(box(420, 400, 160, 200), trigger)).toMatchObject({
      x: -1,
      gap: 20,
    });
  });

  it('gives a layer flush against its trigger no room, and a point anchor no gap', () => {
    expect(layerEntranceSide(box(250, 432, 200, 150), trigger)).toMatchObject({
      y: -1,
      gap: 0,
    });
    // A menu at the pointer: its cursor anchor is a point.
    expect(
      layerEntranceSide(box(316, 416, 160, 200), box(316, 416, 0, 0)),
    ).toMatchObject({gap: null});
    expect(
      layerEntranceSide(box(316, 417, 160, 200), box(316, 416, 1, 1)),
    ).toMatchObject({gap: null});
  });

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
    expect(layer.style.getPropertyValue(LAYER_ENTER_GAP_PROPERTY)).toBe('4px');

    // Flush against a sized anchor, the layer takes no step.
    writeLayerEntranceSide(layer, {...side!, gap: 0});
    expect(layer.style.getPropertyValue(LAYER_ENTER_GAP_PROPERTY)).toBe('0px');
    // Room that floors to 0 px is no room.
    writeLayerEntranceSide(layer, {...side!, gap: 0.0004});
    expect(layer.style.getPropertyValue(LAYER_ENTER_GAP_PROPERTY)).toBe('0px');
    // At a point, as a menu at the pointer, the layer takes the whole step.
    writeLayerEntranceSide(layer, {...side!, gap: null});
    expect(layer.style.getPropertyValue(LAYER_ENTER_GAP_PROPERTY)).toBe(
      'initial',
    );

    writeLayerEntranceSide(layer, null);
    for (const property of [
      LAYER_ENTER_X_PROPERTY,
      LAYER_ENTER_Y_PROPERTY,
      LAYER_ENTER_ORIGIN_PROPERTY,
      LAYER_ENTER_GAP_PROPERTY,
    ]) {
      expect(layer.style.getPropertyValue(property)).toBe('initial');
    }
    layer.remove();
    anchor.remove();
  });
});
