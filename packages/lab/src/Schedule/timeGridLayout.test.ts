// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {layoutTimedEvents, type TimedEventInterval} from './timeGridLayout';

interface Item {
  id: string;
}

function interval(
  id: string,
  visibleStart: number,
  visibleEnd: number,
): TimedEventInterval<Item> {
  return {event: {id}, visibleStart, visibleEnd};
}

function placementsById(intervals: ReadonlyArray<TimedEventInterval<Item>>) {
  return Object.fromEntries(
    layoutTimedEvents(intervals, 8 * 60, 18 * 60).map(placement => [
      placement.event.id,
      {
        top: placement.top,
        height: placement.height,
        columnStart: placement.columnStart,
        columnSpan: placement.columnSpan,
        columnCount: placement.columnCount,
      },
    ]),
  );
}

describe('layoutTimedEvents', () => {
  it('gives a lone event the whole column', () => {
    expect(placementsById([interval('a', 9 * 60, 10 * 60)])).toEqual({
      a: {top: 10, height: 10, columnStart: 0, columnSpan: 1, columnCount: 1},
    });
  });

  it('splits an exact tie into two equal columns ordered by id', () => {
    const placements = placementsById([
      interval('tie-b', 9 * 60, 10 * 60),
      interval('tie-a', 9 * 60, 10 * 60),
    ]);
    expect(placements['tie-a']).toMatchObject({
      columnStart: 0,
      columnSpan: 1,
      columnCount: 2,
    });
    expect(placements['tie-b']).toMatchObject({
      columnStart: 1,
      columnSpan: 1,
      columnCount: 2,
    });
  });

  it('places three and five simultaneous events side by side', () => {
    const three = placementsById([
      interval('1', 13 * 60, 14 * 60),
      interval('2', 13 * 60, 14 * 60),
      interval('3', 13 * 60, 14 * 60),
    ]);
    expect(
      Object.values(three)
        .map(p => p.columnStart)
        .sort(),
    ).toEqual([0, 1, 2]);
    expect(Object.values(three).every(p => p.columnCount === 3)).toBe(true);
    expect(Object.values(three).every(p => p.columnSpan === 1)).toBe(true);

    const five = placementsById(
      ['1', '2', '3', '4', '5'].map(id => interval(id, 10 * 60, 11 * 60)),
    );
    expect(
      Object.values(five)
        .map(p => p.columnStart)
        .sort(),
    ).toEqual([0, 1, 2, 3, 4]);
    expect(Object.values(five).every(p => p.columnCount === 5)).toBe(true);
  });

  it('is independent of input order', () => {
    const items = [
      interval('standup', 9 * 60, 10 * 60),
      interval('design-sync', 9 * 60 + 30, 10 * 60 + 30),
      interval('retro', 10 * 60, 11 * 60),
      interval('workshop', 13 * 60, 16 * 60),
      interval('coffee', 14 * 60, 14 * 60 + 30),
      interval('tie-a', 12 * 60, 12 * 60 + 30),
      interval('tie-b', 12 * 60, 12 * 60 + 30),
    ];
    const forward = placementsById(items);
    const reversed = placementsById([...items].reverse());
    const shuffled = placementsById([
      items[4],
      items[6],
      items[0],
      items[3],
      items[2],
      items[5],
      items[1],
    ]);
    expect(reversed).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it('keeps a chain in one cluster and lets its ends share a column', () => {
    const placements = placementsById([
      interval('standup', 9 * 60, 10 * 60),
      interval('design-sync', 9 * 60 + 30, 10 * 60 + 30),
      interval('retro', 10 * 60, 11 * 60),
    ]);
    // Standup and Retro never meet, so Retro reuses Standup's column; the
    // cluster is two columns wide because Design sync overlaps both.
    expect(placements.standup).toMatchObject({
      columnStart: 0,
      columnSpan: 1,
      columnCount: 2,
    });
    expect(placements['design-sync']).toMatchObject({
      columnStart: 1,
      columnSpan: 1,
      columnCount: 2,
    });
    expect(placements.retro).toMatchObject({
      columnStart: 0,
      columnSpan: 1,
      columnCount: 2,
    });
  });

  it('lays a contained event beside its container instead of over it', () => {
    const placements = placementsById([
      interval('coffee', 10 * 60, 10 * 60 + 30),
      interval('workshop', 9 * 60, 12 * 60),
    ]);
    expect(placements.workshop).toMatchObject({
      columnStart: 0,
      columnSpan: 1,
      columnCount: 2,
    });
    expect(placements.coffee).toMatchObject({
      columnStart: 1,
      columnSpan: 1,
      columnCount: 2,
    });
  });

  it('widens a block into following columns nothing occupies during its minutes', () => {
    const placements = placementsById([
      interval('a', 9 * 60, 10 * 60),
      interval('b', 9 * 60, 10 * 60),
      interval('c', 9 * 60 + 30, 11 * 60),
      interval('d', 10 * 60, 11 * 60),
    ]);
    // d starts as a ends, so it takes column 0; column 1 (b) is free during
    // its minutes, column 2 (c) is not, so it spans two of the three tracks.
    expect(placements.a).toMatchObject({
      columnStart: 0,
      columnSpan: 1,
      columnCount: 3,
    });
    expect(placements.b).toMatchObject({
      columnStart: 1,
      columnSpan: 1,
      columnCount: 3,
    });
    expect(placements.c).toMatchObject({
      columnStart: 2,
      columnSpan: 1,
      columnCount: 3,
    });
    expect(placements.d).toMatchObject({
      columnStart: 0,
      columnSpan: 2,
      columnCount: 3,
    });
  });

  it('starts a new cluster once every earlier event has ended', () => {
    const placements = placementsById([
      interval('morning-a', 9 * 60, 10 * 60),
      interval('morning-b', 9 * 60, 10 * 60),
      interval('afternoon', 15 * 60, 16 * 60),
    ]);
    expect(placements.afternoon).toMatchObject({
      columnStart: 0,
      columnSpan: 1,
      columnCount: 1,
    });
  });

  it('never lets two blocks in a cluster occupy the same track at the same time', () => {
    const items = Array.from({length: 12}, (_, index) =>
      interval(`e${index}`, 9 * 60 + index * 20, 9 * 60 + index * 20 + 50),
    );
    const placements = layoutTimedEvents(items, 8 * 60, 18 * 60);
    for (const a of placements) {
      for (const b of placements) {
        if (a === b) {
          continue;
        }
        const aStart = a.top;
        const aEnd = a.top + a.height;
        const bStart = b.top;
        const bEnd = b.top + b.height;
        const timeOverlap = aStart < bEnd && bStart < aEnd;
        const aColEnd = a.columnStart + a.columnSpan;
        const bColEnd = b.columnStart + b.columnSpan;
        const columnOverlap =
          a.columnStart < bColEnd && b.columnStart < aColEnd;
        expect(timeOverlap && columnOverlap).toBe(false);
      }
    }
  });
});
