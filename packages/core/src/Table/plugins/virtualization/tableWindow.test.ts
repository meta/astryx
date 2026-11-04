// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableWindow.test.ts
 * @input The production fixed-pitch range and anchor engine
 * @output Mutation-sensitive range, gap, guard and anchor assertions
 * @position Colocated private Table virtualization tests
 */
import {describe, it} from 'vitest';
import assert from 'node:assert/strict';
import {calculateTableWindow, reconcileTableAnchor} from './tableWindow';

const defaults = {
  rowCount: 100,
  rowHeight: 20,
  viewportHeight: 100,
  scrollTop: 0,
  bodyOffset: 0,
  isMeasured: true,
};
const rows = (plan: NonNullable<ReturnType<typeof calculateTableWindow>>) =>
  plan.segments.flatMap(segment =>
    segment.type === 'rows'
      ? Array.from(
          {length: segment.end - segment.start},
          (_, i) => segment.start + i,
        )
      : [],
  );

describe('fixed Table window', () => {
  it('seeds SSR and first-client rows identically without rendering all data', () => {
    const plan = calculateTableWindow({
      ...defaults,
      isMeasured: false,
      scrollTop: 800,
    })!;
    assert.deepEqual(rows(plan), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(plan.segments, [
      {type: 'rows', start: 0, end: 9},
      {type: 'gap', start: 9, end: 100, height: 1820},
    ]);
  });
  it('intersects partial rows, then overscans four per side', () => {
    const plan = calculateTableWindow({...defaults, scrollTop: 210})!;
    assert.deepEqual(
      rows(plan),
      Array.from({length: 14}, (_, i) => i + 6),
    );
    assert.equal(plan.firstVisibleIndex, 10);
    assert.equal(plan.offset, 10);
  });
  it('accounts for body origin and a partially available body viewport', () => {
    assert.deepEqual(
      rows(calculateTableWindow({...defaults, bodyOffset: 80})!),
      [0, 1, 2, 3, 4],
    );
    assert.deepEqual(
      rows(
        calculateTableWindow({...defaults, bodyOffset: 80, scrollTop: 100})!,
      ),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
  });
  it('retains exactly one high focused row in logical order with truthful gaps', () => {
    const plan = calculateTableWindow({
      ...defaults,
      scrollTop: 400,
      focusIndex: 80,
    })!;
    assert.deepEqual(rows(plan), [
      ...Array.from({length: 13}, (_, i) => 16 + i),
      80,
    ]);
    assert.equal(plan.segments.filter(s => s.type === 'gap').length, 3);
    assert.equal(
      plan.segments.reduce(
        (height, s) =>
          height + (s.type === 'gap' ? s.height : (s.end - s.start) * 20),
        0,
      ),
      2000,
    );
    assert.equal(new Set(rows(plan)).size, rows(plan).length);
  });
  it('does not duplicate focus within or adjacent to the ordinary range', () => {
    const plan = calculateTableWindow({
      ...defaults,
      scrollTop: 400,
      focusIndex: 28,
    })!;
    assert.equal(plan.segments.filter(s => s.type === 'rows').length, 1);
    assert.deepEqual(
      rows(plan),
      Array.from({length: 13}, (_, i) => 16 + i),
    );
    assert.equal(
      calculateTableWindow({
        ...defaults,
        scrollTop: 400,
        focusIndex: 29,
      })!.segments.filter(s => s.type === 'rows').length,
      1,
    );
  });
  it('clamps negative and stale end scrolls and supports fractional pitch', () => {
    assert.deepEqual(
      rows(calculateTableWindow({...defaults, scrollTop: -100})!),
      rows(calculateTableWindow(defaults)!),
    );
    assert.deepEqual(
      rows(calculateTableWindow({...defaults, scrollTop: 1e9})!),
      [91, 92, 93, 94, 95, 96, 97, 98, 99],
    );
    const plan = calculateTableWindow({
      ...defaults,
      rowHeight: 12.5,
      viewportHeight: 31.25,
      scrollTop: 131.25,
    })!;
    assert.equal(plan.firstVisibleIndex, 10);
    assert.equal(plan.offset, 6.25);
  });
  it('returns no data or gaps for empty and bounds a short table', () => {
    assert.deepEqual(
      calculateTableWindow({...defaults, rowCount: 0})!.segments,
      [],
    );
    assert.deepEqual(
      rows(calculateTableWindow({...defaults, rowCount: 3})!),
      [0, 1, 2],
    );
  });
  it('rejects invalid arithmetic rather than compressing or fabricating an engine limit', () => {
    for (const rowHeight of [0, -1, NaN, Infinity, Number.MIN_VALUE]) {
      assert.equal(calculateTableWindow({...defaults, rowHeight}), null);
    }
    for (const viewportHeight of [0, -1, NaN, Infinity]) {
      assert.equal(calculateTableWindow({...defaults, viewportHeight}), null);
    }
    for (const rowCount of [
      -1,
      0.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      assert.equal(calculateTableWindow({...defaults, rowCount}), null);
    }
    assert.equal(calculateTableWindow({...defaults, scrollTop: NaN}), null);
    assert.equal(
      calculateTableWindow({...defaults, bodyOffset: Infinity}),
      null,
    );
    assert.equal(
      calculateTableWindow({...defaults, rowCount: 100, rowHeight: 1e308}),
      null,
    );
    assert.equal(
      calculateTableWindow({
        ...defaults,
        rowCount: 1,
        rowHeight: 1e308,
        bodyOffset: 1e308,
      }),
      null,
    );
    assert.ok(
      calculateTableWindow({...defaults, rowCount: 1e6, rowHeight: 40}),
    );
  });
  it('preserves ordered coverage, gap extent and mounted bounds across fractional/end cases', () => {
    for (const rowCount of [0, 1, 9, 100, 100000]) {
      for (const rowHeight of [12.5, 20, 48]) {
        for (const viewportHeight of [1, 100, 240, 1000]) {
          for (const scrollTop of [
            0,
            1,
            100,
            rowCount * rowHeight,
            rowCount * rowHeight * 10,
          ]) {
            for (const focusIndex of [
              0,
              Math.floor(rowCount / 2),
              rowCount - 1,
            ]) {
              const plan = calculateTableWindow({
                rowCount,
                rowHeight,
                viewportHeight,
                scrollTop,
                bodyOffset: 37,
                isMeasured: true,
                focusIndex,
              })!;
              const indices = rows(plan);
              assert.equal(new Set(indices).size, indices.length);
              assert.ok(
                indices.every(
                  (value, index) => index === 0 || indices[index - 1] < value,
                ),
              );
              assert.ok(
                indices.length <=
                  Math.ceil(viewportHeight / rowHeight) + 1 + 8 + 1,
              );
              assert.ok(
                plan.segments.filter(segment => segment.type === 'gap')
                  .length <= 3,
              );
              let end = 0;
              let height = 0;
              for (const segment of plan.segments) {
                assert.equal(segment.start, end);
                assert.ok(segment.end > segment.start);
                end = segment.end;
                height +=
                  segment.type === 'gap'
                    ? segment.height
                    : (segment.end - segment.start) * rowHeight;
              }
              assert.equal(end, rowCount);
              assert.equal(height, rowCount * rowHeight);
            }
          }
        }
      }
    }
  });
  it('bounds work at 100k without iterating offscreen rows', () => {
    const plan = calculateTableWindow({
      ...defaults,
      rowCount: 100000,
      scrollTop: 1000010,
      focusIndex: 99999,
    })!;
    assert.ok(rows(plan).length <= Math.ceil(100 / 20) + 1 + 8 + 1);
    assert.ok(plan.segments.length <= 5);
  });
});

describe('first-visible-key anchoring', () => {
  const options = {
    previousKeys: ['a', 'b', 'c', 'd'],
    keys: ['x', 'a', 'b', 'c', 'd'],
    firstVisibleIndex: 1,
    offset: 5,
    rowHeight: 20,
    viewportHeight: 20,
    bodyOffset: 10,
  };
  it('anchors the visible key and fraction, not focus or tail', () => {
    assert.equal(reconcileTableAnchor(options), 55);
    assert.equal(
      reconcileTableAnchor({...options, keys: ['a', 'b', 'c', 'd', 'e']}),
      35,
    );
  });
  it('chooses surviving successor, predecessor, then start when anchor disappears', () => {
    assert.equal(reconcileTableAnchor({...options, keys: ['d', 'c']}), 30);
    assert.equal(reconcileTableAnchor({...options, keys: ['a']}), 10);
    assert.equal(reconcileTableAnchor({...options, keys: ['x', 'y']}), 10);
  });
  it('preserves canonical number/string distinctions and clamps the new extent', () => {
    assert.equal(
      reconcileTableAnchor({
        ...options,
        previousKeys: [0, '0', 1],
        keys: ['0', 0, 1],
        firstVisibleIndex: 1,
      }),
      15,
    );
    assert.equal(
      reconcileTableAnchor({...options, keys: ['b'], viewportHeight: 100}),
      0,
    );
  });
});
