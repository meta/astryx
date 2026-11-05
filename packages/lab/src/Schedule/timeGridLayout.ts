// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file timeGridLayout.ts
 * @input Timed events already clipped to a day column's visible minutes
 * @output Deterministic side-by-side placement: vertical extent as a share of
 *   the visible minutes, and a column start and span inside each overlap cluster
 * @position Pure layout model for the time grid; no DOM, no dates, no styling
 *
 * Two events share a cluster when their minutes intersect directly or through a
 * chain of intersecting events. Inside a cluster every event takes the first
 * column whose last occupant has ended, then widens into the following columns
 * that nothing occupies during its own minutes. Ordering is by start, then
 * longer first, then `id`, so the same events produce the same layout in any
 * input order and nothing depends on paint order.
 */

export interface TimedEventInterval<Event extends {id: string}> {
  event: Event;
  /** Minutes since the start of the day, after clipping to the visible window. */
  visibleStart: number;
  visibleEnd: number;
}

export interface TimedEventPlacement<Event extends {id: string}> {
  event: Event;
  /** Block-axis offset as a percentage of the visible minutes. */
  top: number;
  /** Block-axis size as a percentage of the visible minutes. */
  height: number;
  /** Zero-based column inside the event's overlap cluster. */
  columnStart: number;
  /** Columns the block widens across, including its own. */
  columnSpan: number;
  /** Columns in the event's overlap cluster. */
  columnCount: number;
}

function compareIntervals<Event extends {id: string}>(
  a: TimedEventInterval<Event>,
  b: TimedEventInterval<Event>,
): number {
  if (a.visibleStart !== b.visibleStart) {
    return a.visibleStart - b.visibleStart;
  }
  if (a.visibleEnd !== b.visibleEnd) {
    return b.visibleEnd - a.visibleEnd;
  }
  return a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0;
}

function overlaps<Event extends {id: string}>(
  a: TimedEventInterval<Event>,
  b: TimedEventInterval<Event>,
): boolean {
  return a.visibleStart < b.visibleEnd && b.visibleStart < a.visibleEnd;
}

export function layoutTimedEvents<Event extends {id: string}>(
  intervals: ReadonlyArray<TimedEventInterval<Event>>,
  minMinute: number,
  maxMinute: number,
): TimedEventPlacement<Event>[] {
  const totalMinutes = Math.max(1, maxMinute - minMinute);
  const sorted = [...intervals].sort(compareIntervals);

  const clusters: TimedEventInterval<Event>[][] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  for (const interval of sorted) {
    const current = clusters[clusters.length - 1];
    if (current == null || interval.visibleStart >= clusterEnd) {
      clusters.push([interval]);
      clusterEnd = interval.visibleEnd;
    } else {
      current.push(interval);
      clusterEnd = Math.max(clusterEnd, interval.visibleEnd);
    }
  }

  const placements: TimedEventPlacement<Event>[] = [];
  for (const cluster of clusters) {
    const columns: TimedEventInterval<Event>[][] = [];
    const columnOf = new Map<TimedEventInterval<Event>, number>();
    for (const interval of cluster) {
      let column = columns.findIndex(occupants => {
        const last = occupants[occupants.length - 1];
        return last.visibleEnd <= interval.visibleStart;
      });
      if (column < 0) {
        column = columns.length;
        columns.push([]);
      }
      columns[column].push(interval);
      columnOf.set(interval, column);
    }

    for (const interval of cluster) {
      const columnStart = columnOf.get(interval) ?? 0;
      let columnSpan = 1;
      for (let next = columnStart + 1; next < columns.length; next += 1) {
        if (columns[next].some(occupant => overlaps(occupant, interval))) {
          break;
        }
        columnSpan += 1;
      }
      placements.push({
        event: interval.event,
        top: ((interval.visibleStart - minMinute) / totalMinutes) * 100,
        height:
          ((interval.visibleEnd - interval.visibleStart) / totalMinutes) * 100,
        columnStart,
        columnSpan,
        columnCount: columns.length,
      });
    }
  }

  return placements;
}
