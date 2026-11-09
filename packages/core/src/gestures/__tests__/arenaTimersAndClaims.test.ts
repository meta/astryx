// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file arenaTimersAndClaims.test.ts
 * @input Uses vitest, GestureArena, the tap, long-press and pan recognizers
 * @output Checks a late timer against queued input, cancelling an idle
 *   recognizer, and the claim a waiting recognition takes
 * @position Test for packages/core/src/gestures/GestureArena.ts
 */

import {describe, expect, it} from 'vitest';
import {GestureArena, type GestureClock} from '../GestureArena';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {createHarness} from './harness';

/** A clock whose timers run one task at a time, as an event loop does. */
class TaskClock implements GestureClock {
  time = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, {at: number; run: () => void}>();
  now(): number {
    return this.time;
  }
  setTimeout(run: () => void, delay: number): number {
    const id = this.nextId++;
    this.tasks.set(id, {at: this.time + delay, run});
    return id;
  }
  clearTimeout(id: number): void {
    this.tasks.delete(id);
  }
  /** Run the earliest task due by `time`, if any. */
  runTask(time: number): void {
    this.time = time;
    const due = [...this.tasks.entries()]
      .filter(([, task]) => task.at <= time)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (due != null) {
      this.tasks.delete(due[0]);
      due[1].run();
    }
  }
}

function pressArena(): {
  clock: TaskClock;
  arena: GestureArena;
  press: LongPressGestureRecognizer;
  log: string[];
} {
  const clock = new TaskClock();
  const log: string[] = [];
  const arena: GestureArena = new GestureArena({
    clock,
    onTransition: (recognizer, _from, to) =>
      log.push(`${recognizer.name}:${to}@${arena.now()}`),
  });
  const press = new LongPressGestureRecognizer({name: 'press'});
  arena.began([
    {
      id: 1,
      x: 0,
      y: 0,
      time: 0,
      pointerType: 'touch',
      target: null,
      scroll: null,
      recognizers: [press],
      consumer: null,
    },
  ]);
  return {clock, arena, press, log};
}

describe('a timer that fires late', () => {
  it('lets a lift queued before its deadline run first', () => {
    const {clock, arena, log} = pressArena();
    // A long task held the main thread from 100 to 800 ms; the finger
    // lifted at 300. The timer task runs first, then the queued lift.
    clock.runTask(800);
    arena.ended([{id: 1, x: 0, y: 0, time: 300}]);
    clock.runTask(800);
    expect(log.some(entry => entry.startsWith('press:began'))).toBe(false);
  });

  it('keeps the timestamps of queued moves', () => {
    const {clock, arena, log} = pressArena();
    clock.runTask(800);
    // The finger travelled 40 px at 300 ms: past the allowable movement.
    arena.moved([{id: 1, x: 40, y: 0, time: 300}]);
    clock.runTask(800);
    expect(log.some(entry => entry.startsWith('press:began'))).toBe(false);
    expect(log).toContain('press:failed@300');
    arena.ended([{id: 1, x: 40, y: 0, time: 820}]);
  });

  it('still fires on its deadline when nothing was queued', () => {
    const {clock, arena, log} = pressArena();
    clock.runTask(800);
    clock.runTask(800);
    expect(log).toContain('press:began@500');
    arena.ended([{id: 1, x: 0, y: 0, time: 820}]);
  });
});

describe('cancelling an idle recognizer', () => {
  it('leaves it possible, so its next touch counts', () => {
    const h = createHarness();
    const tap = new TapGestureRecognizer({name: 'tap'});
    // Never touched.
    tap.cancel();
    expect(tap.state).toBe('possible');
    h.finger(1)
      .down(10, 10, 0, {recognizers: [tap]})
      .up(50);
    expect(h.log).toContain('tap:ended@50');
    // Touched before, idle now.
    tap.cancel();
    expect(tap.state).toBe('possible');
    h.finger(2)
      .down(10, 10, 1000, {recognizers: [tap]})
      .up(1050);
    expect(h.log).toContain('tap:ended@1050');
  });
});

describe('a waiting recognition that fails', () => {
  it('gives its claimed touches back', () => {
    const h = createHarness();
    const tap = new TapGestureRecognizer({name: 'tap'});
    const pan = new PanGestureRecognizer({name: 'pan'});
    pan.requireToFail(tap);
    const finger = h
      .finger(1)
      .down(0, 0, 0, {recognizers: [pan, tap]})
      .move(20, 0, 16);
    // The pan recognized but waits for the tap to fail, holding the touch.
    expect(h.arena.isClaimed(1)).toBe(true);
    pan.setEnabled(false);
    expect(pan.state).toBe('failed');
    expect(h.arena.isClaimed(1)).toBe(false);
    finger.up(40);
  });
});
