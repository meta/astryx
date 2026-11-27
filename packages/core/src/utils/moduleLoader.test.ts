// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file moduleLoader.test.ts
 * @input afterNextPaint from moduleLoader.ts
 * @output Proves the after-paint wait runs a frame, then the task that frame
 *   queues, in the window it is given; with the global window it is the wait
 *   Text's truncation-tooltip preload and cut-text loader always ran
 * @position Unit test for the shared after-paint wait
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {afterNextPaint} from './moduleLoader';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('afterNextPaint', () => {
  it("waits for the given window's next frame, then the task that frame queues", async () => {
    const frames: (() => void)[] = [];
    const tasks: {callback: () => void; delay: number | undefined}[] = [];
    const view = {
      requestAnimationFrame: (callback: () => void) => frames.push(callback),
      setTimeout: (callback: () => void, delay?: number) =>
        tasks.push({callback, delay}),
    } as unknown as Window;
    let isDone = false;
    const paint = afterNextPaint(view).then(() => {
      isDone = true;
    });
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    expect(tasks).toHaveLength(0);
    frames[0]?.();
    expect(tasks).toEqual([{callback: expect.any(Function), delay: 0}]);
    await Promise.resolve();
    expect(isDone).toBe(false);
    tasks[0]?.callback();
    await paint;
    expect(isDone).toBe(true);
  });

  it('with the global window, waits for its next frame and then a 0 ms task, as the inline waits it replaces did', async () => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'setTimeout', 'clearTimeout'],
    });
    const frame = vi.spyOn(window, 'requestAnimationFrame');
    const task = vi.spyOn(window, 'setTimeout');
    let isDone = false;
    const paint = afterNextPaint(window).then(() => {
      isDone = true;
    });
    await Promise.resolve();
    expect(frame).toHaveBeenCalledTimes(1);
    expect(task).not.toHaveBeenCalled();
    expect(isDone).toBe(false);
    vi.advanceTimersToNextFrame();
    expect(task).toHaveBeenCalledWith(expect.any(Function), 0);
    await vi.runOnlyPendingTimersAsync();
    await paint;
    expect(isDone).toBe(true);
  });
});
