// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

describe('sharedResizeObserver', () => {
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockUnobserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;
  let capturedCallback: ResizeObserverCallback;
  let constructorCalls: number;

  beforeEach(() => {
    mockObserve = vi.fn();
    mockUnobserve = vi.fn();
    mockDisconnect = vi.fn();
    constructorCalls = 0;

    global.ResizeObserver = vi.fn(function (cb: ResizeObserverCallback) {
      constructorCalls++;
      capturedCallback = cb;
      return {
        observe: mockObserve,
        unobserve: mockUnobserve,
        disconnect: mockDisconnect,
      };
    }) as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('creates a single ResizeObserver for multiple elements', async () => {
    const {observeResize, unobserveResize} =
      await import('./sharedResizeObserver');

    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeResize(el1, vi.fn());
    observeResize(el2, vi.fn());

    expect(constructorCalls).toBe(1);
    expect(mockObserve).toHaveBeenCalledTimes(2);
    expect(mockObserve).toHaveBeenCalledWith(el1);
    expect(mockObserve).toHaveBeenCalledWith(el2);

    unobserveResize(el1);
    unobserveResize(el2);
  });

  it('fires callback synchronously on registration', async () => {
    const {observeResize, unobserveResize} =
      await import('./sharedResizeObserver');

    const el = document.createElement('div');
    const cb = vi.fn();

    observeResize(el, cb);

    // Callback should have fired once immediately with a synthetic entry
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({target: el}));

    unobserveResize(el);
  });

  it('dispatches resize entries to the correct callbacks', async () => {
    const {observeResize, unobserveResize} =
      await import('./sharedResizeObserver');

    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    observeResize(el1, cb1);
    observeResize(el2, cb2);

    // Reset counts from the initial synchronous fire
    cb1.mockClear();
    cb2.mockClear();

    // Simulate observer firing for el1 only
    capturedCallback(
      [{target: el1} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();

    // Simulate observer firing for el2
    capturedCallback(
      [{target: el2} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(cb2).toHaveBeenCalledTimes(1);

    unobserveResize(el1);
    unobserveResize(el2);
  });

  it('destroys the observer when the last element is unobserved', async () => {
    const {observeResize, unobserveResize} =
      await import('./sharedResizeObserver');

    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeResize(el1, vi.fn());
    observeResize(el2, vi.fn());

    unobserveResize(el1);
    expect(mockDisconnect).not.toHaveBeenCalled();

    unobserveResize(el2);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('recreates observer after full teardown', async () => {
    const {observeResize, unobserveResize} =
      await import('./sharedResizeObserver');

    const el1 = document.createElement('div');
    observeResize(el1, vi.fn());
    unobserveResize(el1);
    expect(constructorCalls).toBe(1);

    const el2 = document.createElement('div');
    observeResize(el2, vi.fn());
    expect(constructorCalls).toBe(2);

    unobserveResize(el2);
  });

  it('keeps every callback registered on one element', async () => {
    const {observeResize, unobserveResize} =
      await import('./sharedResizeObserver');

    // Two hooks observing the same node is ordinary — a resizable region's
    // container is also what `useOverflow` or a `TabList` root watches. This
    // map used to hold one callback per element, so whichever registered first
    // silently stopped receiving resizes.
    const el = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    observeResize(el, cb1);
    observeResize(el, cb2);
    cb1.mockClear();
    cb2.mockClear();

    capturedCallback(
      [{target: el} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    unobserveResize(el);
  });

  it('unsubscribing one observer leaves its peers observing', async () => {
    const {observeResize} = await import('./sharedResizeObserver');

    // The other half of the same bug: one hook unmounting must not blind the
    // others still mounted on the element it shared.
    const el = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsubscribe = observeResize(el, cb1);
    observeResize(el, cb2);
    unsubscribe();
    cb1.mockClear();
    cb2.mockClear();

    capturedCallback(
      [{target: el} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
    // Still observed while anyone is listening.
    expect(mockUnobserve).not.toHaveBeenCalledWith(el);
  });

  it('keeps duplicate callback registrations independently subscribed', async () => {
    const {observeResize} = await import('./sharedResizeObserver');

    const el = document.createElement('div');
    const callback = vi.fn();
    const unsubscribeFirst = observeResize(el, callback);
    const unsubscribeSecond = observeResize(el, callback);
    callback.mockClear();

    unsubscribeFirst();
    unsubscribeFirst();
    capturedCallback(
      [{target: el} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(mockUnobserve).not.toHaveBeenCalledWith(el);

    callback.mockClear();
    unsubscribeSecond();
    capturedCallback(
      [{target: el} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(callback).not.toHaveBeenCalled();
    expect(mockUnobserve).toHaveBeenCalledWith(el);
  });

  it('releases the element once its last observer unsubscribes', async () => {
    const {observeResize} = await import('./sharedResizeObserver');

    const el = document.createElement('div');
    const off1 = observeResize(el, vi.fn());
    const off2 = observeResize(el, vi.fn());

    off1();
    expect(mockUnobserve).not.toHaveBeenCalledWith(el);
    off2();
    expect(mockUnobserve).toHaveBeenCalledWith(el);
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('a callback may unsubscribe while the batch is dispatching', async () => {
    const {observeResize} = await import('./sharedResizeObserver');

    // Dispatch iterates a copy: mutating the live set mid-iteration would skip
    // the neighbour that had not been called yet.
    const el = document.createElement('div');
    const cb2 = vi.fn();
    const off1: {current: (() => void) | null} = {current: null};
    const cb1 = vi.fn(() => off1.current?.());

    off1.current = observeResize(el, cb1);
    observeResize(el, cb2);
    cb1.mockClear();
    cb2.mockClear();

    capturedCallback(
      [{target: el} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('still drops the whole element when no callback is named', async () => {
    const {observeResize, unobserveResize} =
      await import('./sharedResizeObserver');

    // Back-compat for a caller that owns its element outright.
    const el = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    observeResize(el, cb1);
    observeResize(el, cb2);
    unobserveResize(el);
    cb1.mockClear();
    cb2.mockClear();

    capturedCallback(
      [{target: el} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });
});
