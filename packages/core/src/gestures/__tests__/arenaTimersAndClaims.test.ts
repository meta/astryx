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
import type {PointerKind} from '../types';
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

function pressArena(pointerType: PointerKind = 'touch'): {
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
      pointerType,
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

  it('still fires on its deadline when nothing was queued, once the wait for queued input ends', () => {
    const {clock, arena, log} = pressArena();
    // 300 ms late: the deadline waits 50 ms for input still queued.
    clock.runTask(800);
    clock.runTask(800);
    expect(log.some(entry => entry.startsWith('press:began'))).toBe(false);
    clock.runTask(850);
    expect(log).toContain('press:began@500');
    arena.ended([{id: 1, x: 0, y: 0, time: 870}]);
  });

  it('waits more than one task for input queued behind the block: a drift that comes after the next task still fails the press', () => {
    const {clock, arena, log} = pressArena();
    // The timer task runs at 800, and so does the next task. The finger's
    // drift from 300 ms reaches the page at 816, as Chromium sends touch
    // moves with the next frame.
    clock.runTask(800);
    clock.runTask(800);
    clock.time = 816;
    arena.moved([{id: 1, x: 40, y: 0, time: 300}]);
    clock.runTask(850);
    expect(log.some(entry => entry.startsWith('press:began'))).toBe(false);
    expect(log).toContain('press:failed@300');
    arena.ended([{id: 1, x: 40, y: 0, time: 870}]);
  });

  it('keeps an on-time deadline waiting while input from before it still comes late', () => {
    const {clock, arena, log} = pressArena();
    // A move from 400 ms reaches the page at 470, 70 ms late, inside the
    // press's tolerance. The deadline at 500 waits 50 ms past that move.
    clock.time = 470;
    arena.moved([{id: 1, x: 2, y: 0, time: 400}]);
    clock.runTask(500);
    expect(log.some(entry => entry.startsWith('press:began'))).toBe(false);
    clock.runTask(550);
    expect(log).toContain('press:began@500');
    arena.ended([{id: 1, x: 2, y: 0, time: 570}]);
  });

  it('ends the wait at the first input stamped at or past the deadline', () => {
    const {clock, arena, log} = pressArena();
    clock.runTask(800);
    clock.time = 820;
    arena.moved([{id: 1, x: 1, y: 0, time: 820}]);
    expect(log).toContain('press:began@500');
    arena.ended([{id: 1, x: 1, y: 0, time: 840}]);
  });

  it('ends the wait when its own timer runs late with nothing queued, with no second wait', () => {
    const {clock, arena, log} = pressArena();
    // The deadline's timer runs late: it waits until 850.
    clock.runTask(800);
    // That wait's own timer runs 50 ms late behind another block. No input
    // from before the deadline came late, so the deadline runs now.
    clock.runTask(900);
    expect(log).toContain('press:began@500');
    arena.ended([{id: 1, x: 0, y: 0, time: 920}]);
  });

  it('keeps the one-task yield for a mouse: its late deadline runs after the next task, with no wait', () => {
    const {clock, arena, log} = pressArena('mouse');
    clock.runTask(800);
    expect(log.some(entry => entry.startsWith('press:began'))).toBe(false);
    clock.runTask(800);
    expect(log).toContain('press:began@500');
    arena.ended([{id: 1, x: 0, y: 0, time: 820}]);
  });

  it('waits for a pen’s late deadline as for a finger’s', () => {
    const {clock, arena, log} = pressArena('pen');
    clock.runTask(800);
    clock.runTask(800);
    expect(log.some(entry => entry.startsWith('press:began'))).toBe(false);
    clock.runTask(850);
    expect(log).toContain('press:began@500');
    arena.ended([{id: 1, x: 0, y: 0, time: 870}]);
  });

  it('runs a deadline that came due during a wait just after it, with no second wait', () => {
    const clock = new TaskClock();
    const log: string[] = [];
    const arena: GestureArena = new GestureArena({
      clock,
      onTransition: (recognizer, _from, to) =>
        log.push(`${recognizer.name}:${to}@${arena.now()}`),
    });
    const first = new LongPressGestureRecognizer({
      name: 'first',
      minimumPressDuration: 500,
    });
    const second = new LongPressGestureRecognizer({
      name: 'second',
      minimumPressDuration: 600,
    });
    arena.began([
      {
        id: 1,
        x: 0,
        y: 0,
        time: 0,
        pointerType: 'touch',
        target: null,
        scroll: null,
        recognizers: [first],
        consumer: null,
      },
      {
        id: 2,
        x: 100,
        y: 0,
        time: 0,
        pointerType: 'touch',
        target: null,
        scroll: null,
        recognizers: [second],
        consumer: null,
      },
    ]);
    // Both deadlines ran late behind one block. The first waits 50 ms; the
    // second comes due during that wait, so it runs as the wait ends.
    clock.runTask(900);
    clock.runTask(950);
    clock.runTask(950);
    clock.runTask(950);
    expect(log).toContain('first:began@500');
    expect(log).toContain('second:began@600');
    arena.ended([
      {id: 1, x: 0, y: 0, time: 970},
      {id: 2, x: 100, y: 0, time: 970},
    ]);
  });
});

describe('a coalesced move whose samples straddle a deadline', () => {
  it('delivers the samples stamped before the deadline first: a drift among them fails the press', () => {
    const {clock, arena, log} = pressArena();
    // One move reaches the page at 520 with the sample it coalesced: the
    // finger drifted 40 px at 480, before the press's deadline at 500.
    clock.time = 520;
    arena.moved([
      {id: 1, x: 40, y: 0, time: 520, history: [{x: 40, y: 0, time: 480}]},
    ]);
    expect(log.some(entry => entry.startsWith('press:began'))).toBe(false);
    expect(log).toContain('press:failed@480');
    arena.ended([{id: 1, x: 40, y: 0, time: 540}]);
  });

  it('runs the deadline before the samples stamped at or after it', () => {
    const {clock, arena, log} = pressArena();
    clock.time = 520;
    arena.moved([
      {id: 1, x: 1, y: 0, time: 520, history: [{x: 1, y: 0, time: 480}]},
    ]);
    expect(log).toContain('press:began@500');
    arena.ended([{id: 1, x: 1, y: 0, time: 540}]);
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
