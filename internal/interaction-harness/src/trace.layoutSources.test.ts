// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file trace.layoutSources.test.ts
 * @input Synthetic main-thread trace events (no browser)
 * @output A counted Layout gets the steps of the task that ran it. It also
 *   gets every invalidation since the previous Layout, each with the steps of
 *   its task.
 *   A Layout outside the window is not explained. No step ends in a line and
 *   a column. A trace that kept no events fails by name.
 * @position Unit test of ./trace's layoutSources
 */

import {describe, expect, it} from 'vitest';
import {
  layoutSources,
  type RenderingTrace,
  type TimedTraceEvent,
} from './trace';

/** A main-thread event at `ms` (epoch ms equals trace ms here). */
function at(
  ms: number,
  name: string,
  {durMs, data}: {durMs?: number; data?: Record<string, unknown>} = {},
): TimedTraceEvent {
  return {
    name,
    cat: 'devtools.timeline',
    ph: 'X',
    ts: ms * 1000,
    ...(durMs == null ? {} : {dur: durMs * 1000}),
    pid: 1,
    tid: 1,
    ...(data == null ? {} : {args: {data}}),
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

describe('layoutSources', () => {
  // A timer writes a style; the next frame lays out.
  const timer = [
    at(100, 'RunTask', {durMs: 2}),
    at(100.1, 'TimerFire'),
    at(100.2, 'FunctionCall', {
      data: {
        functionName: 'move',
        url: 'https://x/a.js',
        lineNumber: 4,
        columnNumber: 2,
      },
    }),
    at(100.3, 'ScheduleStyleRecalculation'),
  ];
  const frame = [
    at(116, 'RunTask', {durMs: 3}),
    at(116.1, 'BeginMainThreadFrame'),
    at(116.2, 'UpdateLayoutTree'),
    at(116.3, 'InvalidateLayout'),
    at(116.4, 'Layout'),
  ];

  it('names the task that ran the Layout and each invalidation before it', () => {
    const sources = layoutSources(traceOf([...timer, ...frame]), 110, 120);
    expect(sources).toEqual([
      {
        t: 116.4,
        task: ['BeginMainThreadFrame', 'UpdateLayoutTree'],
        invalidations: [
          {
            t: 100.3,
            what: 'ScheduleStyleRecalculation',
            task: ['TimerFire', 'FunctionCall[move a.js:4:2]'],
          },
          {
            t: 116.3,
            what: 'InvalidateLayout',
            task: ['BeginMainThreadFrame', 'UpdateLayoutTree'],
          },
        ],
      },
    ]);
  });

  it('starts the invalidations after the previous Layout, and explains only the window', () => {
    const earlier = [
      at(50, 'RunTask', {durMs: 2}),
      at(50.1, 'InvalidateLayout', {
        data: {reason: 'Style changed', nodeName: 'DIV'},
      }),
      at(50.2, 'Layout'),
    ];
    const sources = layoutSources(
      traceOf([...earlier, ...timer, ...frame]),
      110,
      120,
    );
    expect(sources.map(s => s.invalidations.map(i => i.t))).toEqual([
      [100.3, 116.3],
    ]);
    expect(layoutSources(traceOf([...earlier]), 0, 60)).toEqual([
      {
        t: 50.2,
        task: [],
        invalidations: [
          {t: 50.1, what: 'InvalidateLayout[Style changed DIV]', task: []},
        ],
      },
    ]);
  });

  it('writes no step that ends in a line and a column, which reads as a stack frame', () => {
    const steps = layoutSources(traceOf([...timer, ...frame]), 110, 120)
      .flatMap(s => [...s.task, ...s.invalidations.flatMap(i => i.task)])
      .filter(step => step.includes('a.js'));
    expect(steps).toEqual(['FunctionCall[move a.js:4:2]']);
    expect(steps.some(step => /:\d+:\d+\)?$/.test(step))).toBe(false);
  });

  it('fails by name when the trace kept no events', () => {
    expect(() => layoutSources(traceOf(), 0, 1)).toThrow(
      'layoutSources: the trace kept no events',
    );
  });
});
