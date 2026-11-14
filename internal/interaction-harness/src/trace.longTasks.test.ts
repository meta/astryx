// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file trace.longTasks.test.ts
 * @input Synthetic main-thread trace events (no browser)
 * @output A long task keeps its wall time and its thread time apart. A task
 *   without a thread clock reads at its wall time. The harness's own read goes
 *   to `devtoolsTasks`, a page script's task to `longTasks` when its thread ran
 *   longer than 50 ms, else to `stretchedTasks`. A task of 50 ms or less is no
 *   long task.
 * @position Unit test of ./trace's longTasksOf
 */

import {describe, expect, it} from 'vitest';
import {HARNESS_READ, longTasksOf, type TraceEvent} from './trace';

/** Trace time (µs) to epoch ms: a fixed origin, so the start is easy to read. */
const toEpochMs = (ts: number) => 1_000_000 + ts / 1000;

function task(ts: number, durMs: number, tdurMs?: number): TraceEvent {
  return {
    name: 'RunTask',
    cat: 'toplevel',
    ph: 'X',
    ts,
    dur: durMs * 1000,
    ...(tdurMs == null ? {} : {tdur: tdurMs * 1000}),
    pid: 1,
    tid: 1,
  };
}

function inside(ts: number, name: string, args?: TraceEvent['args']) {
  return {name, cat: 'devtools.timeline', ph: 'X', ts, pid: 1, tid: 1, args};
}

describe('longTasksOf', () => {
  it("keeps a page task's thread time apart from its wall time", () => {
    const events = [task(1000, 80, 60), inside(2000, 'FunctionCall')];
    expect(longTasksOf(events, toEpochMs)).toEqual({
      longTasks: [{start: 1_000_001, durationMs: 80, threadMs: 60}],
      devtoolsTasks: [],
      stretchedTasks: [],
    });
  });

  it('sets apart a task only the wall clock stretched past 50 ms', () => {
    // A busy machine kept the main thread off the CPU for most of the task:
    // 51 ms of wall time, 11.5 ms of its own.
    const events = [task(1000, 51, 11.5), inside(2000, 'FunctionCall')];
    expect(longTasksOf(events, toEpochMs)).toEqual({
      longTasks: [],
      devtoolsTasks: [],
      stretchedTasks: [{start: 1_000_001, durationMs: 51, threadMs: 11.5}],
    });
  });

  it('reads a task with no thread clock at its wall time', () => {
    const events = [task(0, 60), inside(500, 'EventDispatch')];
    expect(longTasksOf(events, toEpochMs).longTasks).toEqual([
      {start: 1_000_000, durationMs: 60, threadMs: 60},
    ]);
  });

  it("puts the harness's own read in devtoolsTasks, with its thread time", () => {
    const events = [
      task(0, 120, 118),
      inside(100, 'Receive mojo message', {
        chrome_mojo_event_info: {
          mojo_interface_tag: 'blink.mojom.DevToolsSession',
        },
      }),
      inside(200, 'TimeStamp', {data: {message: HARNESS_READ}}),
    ];
    expect(longTasksOf(events, toEpochMs)).toEqual({
      longTasks: [],
      devtoolsTasks: [{start: 1_000_000, durationMs: 120, threadMs: 118}],
      stretchedTasks: [],
    });
  });

  it('counts no task of 50 ms or less', () => {
    const events = [task(0, 50, 50), inside(100, 'FunctionCall')];
    expect(longTasksOf(events, toEpochMs).longTasks).toEqual([]);
  });
});
