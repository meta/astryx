// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file moduleLoader.test.ts
 * @input createModuleLoader with an import that fails once, then loads; and
 *   afterNextPaint
 * @output Tests that `load` keeps the behaviour its existing callers use (one
 *   shared import, a failure not kept, the module once loaded), that a failed
 *   tryLoad reports the failure and resolves false, that the next one asks
 *   again, and that a completed load tells its subscribers; and that the
 *   after-paint wait runs a frame, then the task that frame queues, in the
 *   window it is given (with the global window, the wait Text's
 *   truncation-tooltip preload and cut-text loader always ran)
 * @position Unit test of utils/moduleLoader
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {afterNextPaint, createModuleLoader} from './moduleLoader';

describe('createModuleLoader', () => {
  it('keeps load as its existing callers use it: one shared import, a failure not kept, the module once loaded', async () => {
    const importModule = vi
      .fn<() => Promise<{value: number}>>()
      .mockRejectedValueOnce(new Error('The network dropped the chunk.'))
      .mockResolvedValue({value: 2});
    const loader = createModuleLoader(importModule);

    await expect(loader.load()).rejects.toThrow(
      'The network dropped the chunk.',
    );
    expect(loader.loaded()).toBeNull();

    const [first, second] = await Promise.all([loader.load(), loader.load()]);
    expect(first).toBe(second);
    expect(importModule).toHaveBeenCalledTimes(2);
    expect(loader.loaded()).toEqual({value: 2});
    await loader.load();
    expect(importModule).toHaveBeenCalledTimes(2);
  });

  it('reports a failed tryLoad, asks again on the next one, and tells subscribers when it loads', async () => {
    const importModule = vi
      .fn<() => Promise<{value: number}>>()
      .mockRejectedValueOnce(new Error('The network dropped the chunk.'))
      .mockResolvedValue({value: 1});
    const onLoadFailure = vi.fn();
    const loader = createModuleLoader(importModule, {onLoadFailure});
    const listener = vi.fn();
    const unsubscribe = loader.subscribe(listener);

    await expect(loader.tryLoad()).resolves.toBe(false);
    expect(onLoadFailure).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    expect(loader.loaded()).toBeNull();

    await expect(loader.tryLoad()).resolves.toBe(true);
    expect(importModule).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loader.loaded()).toEqual({value: 1});

    unsubscribe();
    await loader.tryLoad();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

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
