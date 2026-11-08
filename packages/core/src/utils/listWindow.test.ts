// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listWindow.test.ts
 * @input The fixed-pitch range and anchor calculation
 * @output Range, gap, guard and anchor assertions
 * @position Colocated tests for the private list-windowing module
 */
import {describe, it} from 'vitest';
import assert from 'node:assert/strict';
import {calculateListWindow, reconcileListAnchor} from './listWindow';

const defaults = {
  rowCount: 100,
  rowHeight: 20,
  viewportHeight: 100,
  scrollTop: 0,
  startOffset: 0,
  isMeasured: true,
};
const rows = (plan: NonNullable<ReturnType<typeof calculateListWindow>>) =>
  plan.segments.flatMap(segment =>
    segment.type === 'rows'
      ? Array.from(
          {length: segment.end - segment.start},
          (_, i) => segment.start + i,
        )
      : [],
  );

describe('fixed-pitch list window', () => {
  it('seeds SSR and first-client rows identically without rendering all data', () => {
    const plan = calculateListWindow({
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
    const plan = calculateListWindow({...defaults, scrollTop: 210})!;
    assert.deepEqual(
      rows(plan),
      Array.from({length: 14}, (_, i) => i + 6),
    );
    assert.equal(plan.firstVisibleIndex, 10);
    assert.equal(plan.offset, 10);
  });
  it('reports the negative distance to the first row while the leading content shows', () => {
    const plan = calculateListWindow({
      ...defaults,
      startOffset: 40,
      scrollTop: 25,
    })!;
    assert.equal(plan.firstVisibleIndex, 0);
    assert.equal(plan.offset, -15);
    assert.equal(
      calculateListWindow({...defaults, startOffset: 40})!.offset,
      -40,
    );
  });
  it('accounts for the start offset and a partly visible list', () => {
    assert.deepEqual(
      rows(calculateListWindow({...defaults, startOffset: 80})!),
      [0, 1, 2, 3, 4],
    );
    assert.deepEqual(
      rows(
        calculateListWindow({...defaults, startOffset: 80, scrollTop: 100})!,
      ),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
  });
  it('retains exactly one high focused row in logical order with truthful gaps', () => {
    const plan = calculateListWindow({
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
    const plan = calculateListWindow({
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
      calculateListWindow({
        ...defaults,
        scrollTop: 400,
        focusIndex: 29,
      })!.segments.filter(s => s.type === 'rows').length,
      1,
    );
  });
  it('clamps negative and stale end scrolls and supports fractional pitch', () => {
    assert.deepEqual(
      rows(calculateListWindow({...defaults, scrollTop: -100})!),
      rows(calculateListWindow(defaults)!),
    );
    assert.deepEqual(
      rows(calculateListWindow({...defaults, scrollTop: 1e9})!),
      [91, 92, 93, 94, 95, 96, 97, 98, 99],
    );
    const plan = calculateListWindow({
      ...defaults,
      rowHeight: 12.5,
      viewportHeight: 31.25,
      scrollTop: 131.25,
    })!;
    assert.equal(plan.firstVisibleIndex, 10);
    assert.equal(plan.offset, 6.25);
  });
  it('returns no rows or gaps for an empty list and bounds a short one', () => {
    assert.deepEqual(
      calculateListWindow({...defaults, rowCount: 0})!.segments,
      [],
    );
    assert.deepEqual(
      rows(calculateListWindow({...defaults, rowCount: 3})!),
      [0, 1, 2],
    );
  });
  it('rejects invalid arithmetic rather than compressing or fabricating an engine limit', () => {
    for (const rowHeight of [0, -1, NaN, Infinity, Number.MIN_VALUE]) {
      assert.equal(calculateListWindow({...defaults, rowHeight}), null);
    }
    for (const viewportHeight of [0, -1, NaN, Infinity]) {
      assert.equal(calculateListWindow({...defaults, viewportHeight}), null);
    }
    for (const rowCount of [
      -1,
      0.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      assert.equal(calculateListWindow({...defaults, rowCount}), null);
    }
    assert.equal(calculateListWindow({...defaults, scrollTop: NaN}), null);
    assert.equal(
      calculateListWindow({...defaults, startOffset: Infinity}),
      null,
    );
    assert.equal(
      calculateListWindow({...defaults, rowCount: 100, rowHeight: 1e308}),
      null,
    );
    assert.equal(
      calculateListWindow({
        ...defaults,
        rowCount: 1,
        rowHeight: 1e308,
        startOffset: 1e308,
      }),
      null,
    );
    assert.ok(calculateListWindow({...defaults, rowCount: 1e6, rowHeight: 40}));
  });
  it('clamps scrolling to a larger scroll height and rejects an invalid one', () => {
    const base = {...defaults, rowCount: 10, scrollTop: 250};
    const rowsOnly = calculateListWindow(base);
    const withTrailing = calculateListWindow({...base, scrollHeight: 300});
    assert.ok(rowsOnly && withTrailing);
    assert.ok(withTrailing.firstVisibleIndex > rowsOnly.firstVisibleIndex);
    assert.equal(calculateListWindow({...base, scrollHeight: -1}), null);
    assert.equal(
      calculateListWindow({...base, scrollHeight: Number.NaN}),
      null,
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
              const plan = calculateListWindow({
                rowCount,
                rowHeight,
                viewportHeight,
                scrollTop,
                startOffset: 37,
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
    const plan = calculateListWindow({
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
    startOffset: 10,
  };
  it('anchors the visible key and fraction, not focus or tail', () => {
    assert.equal(reconcileListAnchor(options), 55);
    assert.equal(
      reconcileListAnchor({...options, keys: ['a', 'b', 'c', 'd', 'e']}),
      35,
    );
  });
  it('chooses surviving successor, predecessor, then start when anchor disappears', () => {
    assert.equal(reconcileListAnchor({...options, keys: ['d', 'c']}), 30);
    assert.equal(reconcileListAnchor({...options, keys: ['a']}), 10);
    // Headroom above the start fallback shows the predecessor is chosen.
    assert.equal(
      reconcileListAnchor({...options, keys: ['z', 'a'], viewportHeight: 1}),
      35,
    );
    assert.equal(reconcileListAnchor({...options, keys: ['x', 'y']}), 10);
  });
  it('preserves canonical number/string distinctions and clamps the new extent', () => {
    assert.equal(
      reconcileListAnchor({
        ...options,
        previousKeys: [0, '0', 1],
        keys: ['0', 0, 1],
        firstVisibleIndex: 1,
      }),
      15,
    );
    assert.equal(
      reconcileListAnchor({...options, keys: ['b'], viewportHeight: 100}),
      0,
    );
  });
  it('keeps a scroll position inside the leading content after rows change', () => {
    const top = {
      ...options,
      previousKeys: ['a', 'b'],
      keys: ['a', 'b', 'c'],
      firstVisibleIndex: 0,
      startOffset: 40,
    };
    assert.equal(reconcileListAnchor({...top, offset: -40}), 0);
    assert.equal(reconcileListAnchor({...top, offset: -15}), 25);
    assert.equal(
      reconcileListAnchor({...top, keys: ['x', 'a', 'b'], offset: -15}),
      45,
    );
  });
  it('keeps a leading-content position when no key survives and sends a row position to the first row', () => {
    const replaced = {
      ...options,
      previousKeys: ['a', 'b'],
      keys: ['x', 'y', 'z'],
      firstVisibleIndex: 0,
      startOffset: 40,
    };
    assert.equal(reconcileListAnchor({...replaced, offset: -40}), 0);
    assert.equal(reconcileListAnchor({...replaced, offset: -15}), 25);
    assert.equal(reconcileListAnchor({...replaced, offset: 10}), 40);
  });
  it('clamps to trailing content and reads a supplied key index', () => {
    const short = {
      ...options,
      previousKeys: ['a', 'b'],
      keys: ['a', 'b'],
      firstVisibleIndex: 1,
    };
    assert.equal(reconcileListAnchor(short), 30);
    assert.equal(
      reconcileListAnchor({...short, trailingContentHeight: 20}),
      35,
    );
    assert.equal(
      reconcileListAnchor({
        ...short,
        trailingContentHeight: 100,
        keyIndices: new Map([['b', 3]]),
      }),
      75,
    );
  });
});
