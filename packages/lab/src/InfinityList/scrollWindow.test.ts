// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {jumpToItem, readScrollWindow, updateScrollWindow} from './scrollWindow';

const geometry = {
  itemCount: 1_000_000_000,
  itemHeight: 32,
  viewportHeight: 320,
};

describe('InfinityList scroll window', () => {
  it('jumps to a distant item without a large DOM extent', () => {
    const index = 750_000_003;
    const position = jumpToItem(geometry, index);
    const window = readScrollWindow(geometry, position);

    expect(window.firstVisibleIndex).toBe(index);
    expect(window.start).toBe(index - 4);
    expect(window.end).toBe(index + 14);
    expect(window.height).toBeLessThanOrEqual(1_000_000);
  });

  it('keeps the last item visible when jumping to the end', () => {
    const position = jumpToItem(geometry, geometry.itemCount - 1);
    const window = readScrollWindow(geometry, position);

    expect(window.firstVisibleIndex).toBe(geometry.itemCount - 10);
    expect(window.end).toBe(geometry.itemCount);
  });

  it('repositions the native scroll range without moving the logical item', () => {
    const initial = jumpToItem(geometry, 0);
    const forward = updateScrollWindow(geometry, initial, 999_000.5);
    expect(forward.bandStart).toBeGreaterThan(initial.bandStart);
    expect(forward.bandStart * 32 + forward.scrollTop).toBe(999_000.5);

    const backward = updateScrollWindow(geometry, forward, 128.25);
    expect(backward.bandStart).toBeLessThan(forward.bandStart);
    expect(backward.bandStart * 32 + backward.scrollTop).toBe(
      forward.bandStart * 32 + 128.25,
    );
  });

  it('does not move the native scroll range for a list that fits', () => {
    const short = {...geometry, itemCount: 3};
    const initial = jumpToItem(short, 2);
    const position = updateScrollWindow(short, initial, 20);
    expect(position).toBe(initial);
    expect(readScrollWindow(short, position)).toMatchObject({
      firstVisibleIndex: 0,
      start: 0,
      end: 3,
      height: 96,
    });
  });

  it('renders no items for an empty list', () => {
    const empty = {...geometry, itemCount: 0};
    const window = readScrollWindow(empty, jumpToItem(empty, 42));
    expect(window).toMatchObject({start: 0, end: 0, height: 0});
  });
});
