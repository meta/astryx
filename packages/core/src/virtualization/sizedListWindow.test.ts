// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sizedListWindow.test.ts
 * @input The sized window over fixed and measured offset models
 * @output Proof that a fixed model reproduces the fixed-pitch window exactly,
 *   and range, gap and offset assertions for measured items
 * @position Colocated tests for the list-windowing module's sized window
 */
import {describe, expect, it} from 'vitest';
import {fixedItemSizes, measuredItemSizes} from './itemSizes';
import {calculateListWindow} from './listWindow';
import {calculateSizedListWindow} from './sizedListWindow';

describe('calculateSizedListWindow', () => {
  it('reproduces the fixed-pitch window exactly with a fixed model and a four-row overscan', () => {
    let compared = 0;
    for (const rowHeight of [20, 33, 48]) {
      for (const rowCount of [0, 1, 5, 100, 10_000]) {
        for (const viewportHeight of [100, 480]) {
          for (const startOffset of [0, 40]) {
            for (const isMeasured of [true, false]) {
              for (const focusIndex of [undefined, 0, 3, 9_999]) {
                const total = rowCount * rowHeight;
                for (const scrollTop of [
                  -50,
                  0,
                  7,
                  rowHeight * 3 + 5,
                  total / 2,
                  total - viewportHeight,
                  total + 200,
                ]) {
                  for (const scrollHeight of [
                    undefined,
                    total + startOffset + 300,
                  ]) {
                    const common = {
                      viewportHeight,
                      scrollTop,
                      scrollHeight,
                      startOffset,
                      isMeasured,
                      focusIndex,
                    };
                    const fixed = calculateListWindow({
                      ...common,
                      rowCount,
                      rowHeight,
                    });
                    const sized = calculateSizedListWindow({
                      ...common,
                      sizes: fixedItemSizes(rowCount, rowHeight),
                      overscanBefore: 4 * rowHeight,
                      overscanAfter: 4 * rowHeight,
                    });
                    expect(sized).toEqual(fixed);
                    compared++;
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(5_000);
  });

  it('places measured items by their own sizes and estimates the rest', () => {
    // Items 0-9 measured at 30 px, the rest estimated at 20 px.
    const measured = new Map(
      Array.from({length: 10}, (_, index) => [index, 30] as const),
    );
    const sizes = measuredItemSizes(100, 20, measured);
    expect(sizes.total).toBe(10 * 30 + 90 * 20);
    expect(sizes.offsetOf(10)).toBe(300);
    expect(sizes.indexAt(299)).toBe(9);
    expect(sizes.indexAt(300)).toBe(10);
    const plan = calculateSizedListWindow({
      sizes,
      viewportHeight: 100,
      scrollTop: 305,
      startOffset: 0,
      isMeasured: true,
      overscanBefore: 60,
      overscanAfter: 40,
    });
    expect(plan).toMatchObject({firstVisibleIndex: 10, offset: 5});
    // 60 px before item 10 is items 8 and 9; 40 px past the scrollport's
    // bottom (405) reaches 445, inside item 17.
    expect(plan?.start).toBe(8);
    expect(plan?.end).toBe(18);
    expect(plan?.segments).toEqual([
      {type: 'gap', start: 0, end: 8, height: 240},
      {type: 'rows', start: 8, end: 18},
      {type: 'gap', start: 18, end: 100, height: 82 * 20},
    ]);
  });

  it('sets the overscan before and after the scrollport separately', () => {
    const sizes = fixedItemSizes(1_000, 20);
    const plan = calculateSizedListWindow({
      sizes,
      viewportHeight: 200,
      scrollTop: 2_000,
      startOffset: 0,
      isMeasured: true,
      overscanBefore: 0,
      overscanAfter: 100,
    });
    expect(plan).toMatchObject({start: 100, end: 115});
  });

  it('refuses inputs that cannot form a finite window', () => {
    const base = {
      sizes: fixedItemSizes(10, 20),
      viewportHeight: 100,
      scrollTop: 0,
      startOffset: 0,
      isMeasured: true,
      overscanBefore: 0,
      overscanAfter: 0,
    };
    expect(calculateSizedListWindow({...base, viewportHeight: 0})).toBeNull();
    expect(calculateSizedListWindow({...base, overscanAfter: -1})).toBeNull();
    expect(
      calculateSizedListWindow({...base, overscanBefore: Number.NaN}),
    ).toBeNull();
  });
});
