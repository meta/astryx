// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file trace.restyleSources.test.ts
 * @input Synthetic main-thread trace events (no browser)
 * @output A counted style recalculation gets the number of elements it
 *   restyled and every style invalidation since the previous one, with the
 *   node and the reason. A recalculation outside the window is not explained.
 *   A trace that kept no events fails by name.
 * @position Unit test of ./trace's restyleSources
 */

import {describe, expect, it} from 'vitest';
import {
  restyleSources,
  type RenderingTrace,
  type TimedTraceEvent,
} from './trace';

/** A main-thread event at `ms` (epoch ms equals trace ms here). */
function at(
  ms: number,
  name: string,
  {
    data,
    elementCount,
  }: {data?: Record<string, unknown>; elementCount?: number} = {},
): TimedTraceEvent {
  const args: Record<string, unknown> = {
    ...(data == null ? {} : {data}),
    ...(elementCount == null ? {} : {elementCount}),
  };
  return {
    name,
    cat: 'devtools.timeline',
    ph: 'X',
    ts: ms * 1000,
    pid: 1,
    tid: 1,
    ...(Object.keys(args).length === 0 ? {} : {args}),
    t: ms,
  };
}

function traceOf(mainThread?: TimedTraceEvent[]): RenderingTrace {
  return {
    counts: {},
    layout: 0,
    paint: 0,
    styleRecalc: 0,
    prePaint: 0,
    durationMs: 0,
    longTasks: [],
    stretchedTasks: [],
    devtoolsTasks: [],
    events: [],
    window: {from: 0, to: 1000},
    ...(mainThread == null ? {} : {mainThread}),
  };
}

describe('restyleSources', () => {
  // Two moves of a drag. The first writes the sheet's transform; the second
  // writes an inherited custom property on the dialog, which restyles the
  // whole sheet below it.
  const drag = [
    at(10, 'StyleRecalcInvalidationTracking', {
      data: {
        reason: 'Inline CSS style declaration was mutated',
        nodeName: 'DIV',
      },
    }),
    at(12, 'UpdateLayoutTree', {elementCount: 2}),
    at(26, 'StyleRecalcInvalidationTracking', {
      data: {
        reason: 'Inline CSS style declaration was mutated',
        nodeName: 'DIALOG',
      },
    }),
    at(27, 'StyleRecalcInvalidationTracking', {
      data: {reason: 'Animation', nodeName: '::backdrop'},
    }),
    at(29, 'UpdateLayoutTree', {elementCount: 51}),
  ];

  it('gives each recalculation its element count and the invalidations since the previous one', () => {
    expect(restyleSources(traceOf(drag), 0, 100)).toEqual([
      {
        t: 12,
        elements: 2,
        invalidations: [
          'StyleRecalcInvalidationTracking[Inline CSS style declaration was mutated DIV]',
        ],
      },
      {
        t: 29,
        elements: 51,
        invalidations: [
          'StyleRecalcInvalidationTracking[Inline CSS style declaration was mutated DIALOG]',
          'StyleRecalcInvalidationTracking[Animation ::backdrop]',
        ],
      },
    ]);
  });

  it('explains only the recalculations inside the window', () => {
    expect(restyleSources(traceOf(drag), 20, 100).map(r => r.t)).toEqual([29]);
  });

  it('fails by name on a trace that kept no events', () => {
    expect(() => restyleSources(traceOf(), 0, 100)).toThrow(
      /restyleSources: the trace kept no events/,
    );
  });
});
