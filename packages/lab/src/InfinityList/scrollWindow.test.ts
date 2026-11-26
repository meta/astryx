// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  coversViewport,
  endPosition,
  jumpToItem,
  movePosition,
  positionAtFraction,
  readScrollWindow,
  scrollFraction,
} from './scrollWindow';

const geometry = {
  itemCount: 1_000_000_000,
  itemHeight: 32,
  viewportHeight: 320,
};

describe('InfinityList logical position', () => {
  it('retains fractional input at a distant index in both directions', () => {
    const initial = jumpToItem(geometry, 750_000_003);
    const forward = movePosition(geometry, initial, 32.25);
    expect(forward).toEqual({index: 750_000_004, offset: 0.25});
    expect(movePosition(geometry, forward, -32.5)).toEqual({
      index: 750_000_002,
      offset: 31.75,
    });
  });

  it('clamps only at the actual list ends, including a partial last viewport', () => {
    const partial = {...geometry, viewportHeight: 310};
    const start = jumpToItem(partial, 0);
    expect(movePosition(partial, start, -1e15)).toEqual(start);
    expect(movePosition(partial, start, 1e15)).toEqual({
      index: partial.itemCount - 10,
      offset: 10,
    });
    expect(readScrollWindow(partial, endPosition(partial)).end).toBe(
      partial.itemCount,
    );
    expect(movePosition(partial, start, Infinity)).toBe(start);
  });

  it('retains the mounted range until a visible item would leave it', () => {
    const initial = jumpToItem(geometry, 750_000_003);
    const range = readScrollWindow(geometry, initial);
    expect(range).toEqual({start: initial.index - 4, end: initial.index + 14});
    expect(
      coversViewport(geometry, movePosition(geometry, initial, 128), range),
    ).toBe(true);
    const next = movePosition(geometry, initial, 128.25);
    expect(coversViewport(geometry, next, range)).toBe(false);
    expect(
      coversViewport(geometry, next, readScrollWindow(geometry, next)),
    ).toBe(true);
  });

  it('maps scrollbar endpoints to the logical endpoints', () => {
    const end = endPosition(geometry);
    expect(positionAtFraction(geometry, -0.5)).toEqual({index: 0, offset: 0});
    expect(positionAtFraction(geometry, 1.5)).toEqual(end);
    expect(scrollFraction(geometry, end)).toBe(1);
    expect(
      scrollFraction(geometry, positionAtFraction(geometry, 0.25)),
    ).toBeCloseTo(0.25);
  });

  it('handles empty and fitting lists', () => {
    for (const itemCount of [0, 3]) {
      const model = {...geometry, itemCount};
      const position = movePosition(model, jumpToItem(model, 42), 120);
      expect(position).toEqual({index: 0, offset: 0});
      expect(readScrollWindow(model, position)).toEqual({
        start: 0,
        end: itemCount,
      });
    }
  });
});
