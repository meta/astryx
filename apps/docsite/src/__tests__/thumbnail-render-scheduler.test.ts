// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests completion-aware template thumbnail scheduling.
 * @input Stubs browser idle callbacks and schedules cancellable async render jobs.
 * @output Verifies idle activation, completion serialization, failures, and cancellation.
 * @position Unit coverage for the template gallery's interaction-first scheduler.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const idleDeadline: IdleDeadline = {
  didTimeout: false,
  timeRemaining: () => 50,
};

let idleCallbacks: IdleRequestCallback[];
let timerCallbacks: Array<() => void>;

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  idleCallbacks = [];
  timerCallbacks = [];
  vi.stubGlobal('window', {
    requestIdleCallback: vi.fn((callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    }),
    cancelIdleCallback: vi.fn(),
    setTimeout: vi.fn((callback: () => void) => {
      timerCallbacks.push(callback);
      return timerCallbacks.length;
    }),
    clearTimeout: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scheduleThumbnailRender', () => {
  it('waits for one thumbnail to finish before scheduling the next idle turn', async () => {
    const {scheduleThumbnailRender} =
      await import('../components/thumbnailRenderScheduler');
    const activated: string[] = [];
    let finishFirst: (() => void) | undefined;

    scheduleThumbnailRender(
      () =>
        new Promise<void>(resolve => {
          activated.push('first');
          finishFirst = resolve;
        }),
    );
    scheduleThumbnailRender(() => activated.push('second'));

    expect(idleCallbacks).toHaveLength(1);
    expect(window.requestIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
    );
    idleCallbacks.shift()?.(idleDeadline);
    expect(activated).toEqual(['first']);
    expect(idleCallbacks).toHaveLength(0);

    finishFirst?.();
    await flushMicrotasks();
    expect(idleCallbacks).toHaveLength(1);

    idleCallbacks.shift()?.(idleDeadline);
    expect(activated).toEqual(['first', 'second']);
    await flushMicrotasks();
    expect(idleCallbacks).toHaveLength(0);
  });

  it('continues after a thumbnail activation fails', async () => {
    const {scheduleThumbnailRender} =
      await import('../components/thumbnailRenderScheduler');
    const activated: string[] = [];

    scheduleThumbnailRender(() => {
      throw new Error('preview failed');
    });
    scheduleThumbnailRender(() => activated.push('second'));

    idleCallbacks.shift()?.(idleDeadline);
    await flushMicrotasks();
    expect(idleCallbacks).toHaveLength(1);
    idleCallbacks.shift()?.(idleDeadline);
    expect(activated).toEqual(['second']);
  });

  it('starts exactly one activation when the starvation timer wins', async () => {
    const {scheduleThumbnailRender} =
      await import('../components/thumbnailRenderScheduler');
    const activated: string[] = [];

    scheduleThumbnailRender(() => activated.push('first'));

    expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    timerCallbacks.shift()?.();
    expect(activated).toEqual(['first']);
    await flushMicrotasks();

    idleCallbacks.shift()?.(idleDeadline);
    expect(activated).toEqual(['first']);
  });

  it('uses a timer fallback when requestIdleCallback is unavailable', async () => {
    vi.resetModules();
    const timeoutCallbacks: Array<() => void> = [];
    const setTimeout = vi.fn((callback: () => void) => {
      timeoutCallbacks.push(callback);
      return timeoutCallbacks.length;
    });
    vi.stubGlobal('window', {setTimeout, clearTimeout: vi.fn()});
    const {scheduleThumbnailRender} =
      await import('../components/thumbnailRenderScheduler');
    const activated: string[] = [];

    scheduleThumbnailRender(() => activated.push('fallback'));

    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
    expect(activated).toEqual([]);
    timeoutCallbacks.shift()?.();
    expect(activated).toEqual(['fallback']);
    await flushMicrotasks();
  });

  it('skips consecutive cancelled jobs without delaying the next thumbnail', async () => {
    const {scheduleThumbnailRender} =
      await import('../components/thumbnailRenderScheduler');
    const activated: string[] = [];

    const cancelFirst = scheduleThumbnailRender(() => activated.push('first'));
    const cancelSecond = scheduleThumbnailRender(() =>
      activated.push('second'),
    );
    scheduleThumbnailRender(() => activated.push('third'));
    cancelFirst();
    cancelSecond();

    idleCallbacks.shift()?.(idleDeadline);
    expect(activated).toEqual(['third']);
    await flushMicrotasks();
    expect(idleCallbacks).toHaveLength(0);
  });
});
