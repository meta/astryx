// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file edgeAutoscroll.test.ts
 * @input edgeAutoscroll with fake timers and a fake clock
 * @output The timer's rules: idle until a step, an immediate first tick when
 *   asked, one step per tick, stopping when the step is 0 or an edge stops
 *   the content, restarting on the next update with no latch, no restart
 *   while running, and the interval's clock kept when asked (a late timer
 *   catches up one tick, a stall is skipped)
 * @position Tests for utils/edgeAutoscroll.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {edgeAutoscroll} from './edgeAutoscroll';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A scroller from 0 to `max` that records each step it is asked for. */
function scroller(max = 1000) {
  const state = {position: 0, steps: [] as number[]};
  const apply = (delta: number) => {
    state.steps.push(delta);
    const next = Math.min(max, Math.max(0, state.position + delta));
    const moved = next - state.position;
    state.position = next;
    return moved;
  };
  return {state, apply};
}

describe('edgeAutoscroll', () => {
  it('stays idle until update finds a step, then steps once per interval', () => {
    let step = 0;
    const {state, apply} = scroller();
    const autoscroll = edgeAutoscroll({
      intervalMs: 20,
      step: () => step,
      apply,
    });
    autoscroll.update();
    vi.advanceTimersByTime(100);
    expect(autoscroll.isRunning).toBe(false);
    expect(state.steps).toEqual([]);
    step = 3;
    autoscroll.update();
    expect(state.steps).toEqual([]);
    vi.advanceTimersByTime(60);
    expect(state.steps).toEqual([3, 3, 3]);
    expect(state.position).toBe(9);
  });

  it('ticks at once when asked to', () => {
    const {state, apply} = scroller();
    const autoscroll = edgeAutoscroll({
      intervalMs: 16,
      immediate: true,
      step: () => 6,
      apply,
    });
    autoscroll.update();
    expect(state.steps).toEqual([6]);
    vi.advanceTimersByTime(16);
    expect(state.steps).toEqual([6, 6]);
  });

  it('reads the step at every tick and stops when it turns 0', () => {
    let step = 2;
    const {state, apply} = scroller();
    const autoscroll = edgeAutoscroll({
      intervalMs: 20,
      step: () => step,
      apply,
    });
    autoscroll.update();
    vi.advanceTimersByTime(20);
    step = -4;
    vi.advanceTimersByTime(20);
    step = 0;
    vi.advanceTimersByTime(20);
    expect(state.steps).toEqual([2, -4]);
    expect(autoscroll.isRunning).toBe(false);
  });

  it('stops at an edge, and starts again on the next update, the other way too', () => {
    let step = 6;
    const {state, apply} = scroller(10);
    const autoscroll = edgeAutoscroll({
      intervalMs: 16,
      step: () => step,
      apply,
    });
    autoscroll.update();
    vi.advanceTimersByTime(16 * 3);
    // 6, then 4 to the end, then nothing moved: stopped.
    expect(state.steps).toEqual([6, 6, 6]);
    expect(state.position).toBe(10);
    expect(autoscroll.isRunning).toBe(false);
    vi.advanceTimersByTime(100);
    expect(state.steps).toHaveLength(3);
    step = -6;
    autoscroll.update();
    vi.advanceTimersByTime(16);
    expect(state.position).toBe(4);
    expect(autoscroll.isRunning).toBe(true);
  });

  it('keeps its timer through an update while it runs', () => {
    const {state, apply} = scroller();
    const autoscroll = edgeAutoscroll({
      intervalMs: 20,
      immediate: true,
      step: () => 1,
      apply,
    });
    autoscroll.update();
    vi.advanceTimersByTime(10);
    autoscroll.update();
    autoscroll.update();
    expect(state.steps).toEqual([1]);
    vi.advanceTimersByTime(10);
    expect(state.steps).toEqual([1, 1]);
  });

  it('keeps to its clock when asked: a late timer catches up one tick, a stall is skipped', () => {
    let clock = 0;
    const {state, apply} = scroller();
    const autoscroll = edgeAutoscroll({
      intervalMs: 20,
      catchUp: true,
      now: () => clock,
      step: () => 2,
      apply,
    });
    autoscroll.update();
    // On time.
    clock = 20;
    vi.advanceTimersByTime(20);
    expect(state.steps).toEqual([2]);
    // The next fire comes 25 ms late: two ticks were due by then.
    clock = 65;
    vi.advanceTimersByTime(20);
    expect(state.steps).toEqual([2, 4]);
    // A 200 ms stall: at most one tick of catch-up, the rest skipped.
    clock = 265;
    vi.advanceTimersByTime(20);
    expect(state.steps).toEqual([2, 4, 4]);
    clock = 280;
    vi.advanceTimersByTime(20);
    expect(state.steps).toEqual([2, 4, 4, 2]);
  });

  it('catches up on the same clock when it also ticked at once', () => {
    let clock = 0;
    const {state, apply} = scroller();
    const autoscroll = edgeAutoscroll({
      intervalMs: 20,
      immediate: true,
      catchUp: true,
      now: () => clock,
      step: () => 2,
      apply,
    });
    autoscroll.update();
    // The tick at once is not one of the interval's ticks.
    expect(state.steps).toEqual([2]);
    clock = 20;
    vi.advanceTimersByTime(20);
    expect(state.steps).toEqual([2, 2]);
    // The next fire comes 25 ms late: two ticks were due by then.
    clock = 65;
    vi.advanceTimersByTime(20);
    expect(state.steps).toEqual([2, 2, 4]);
  });

  it('stops on stop()', () => {
    const {state, apply} = scroller();
    const autoscroll = edgeAutoscroll({intervalMs: 20, step: () => 1, apply});
    autoscroll.update();
    vi.advanceTimersByTime(20);
    autoscroll.stop();
    vi.advanceTimersByTime(100);
    expect(state.steps).toEqual([1]);
    expect(autoscroll.isRunning).toBe(false);
  });
});
