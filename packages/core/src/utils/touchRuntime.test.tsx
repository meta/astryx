// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchRuntime.test.tsx
 * @input The shared touch loader, with the frame, timer and idle callbacks
 *   under test control
 * @output Tests that the page loads the touch runtime once, after first
 *   paint at idle or by the cap, and that an input never starts the load
 *   (`architecture:react-component-runtime` INV13, `spec:AST-080` DEC-5)
 * @position Testing; the static graph check is in touchRuntime.boundary.test.ts
 */

import {act, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  __resetTouchRuntimeForTest,
  getTouchRuntime,
  LOAD_CAP_MS,
  useTouchRuntime,
} from './touchRuntime';

function Reader({onRender}: {onRender: (loaded: boolean) => void}) {
  onRender(useTouchRuntime() != null);
  return null;
}

/** Lets the runtime module's `import()` settle. */
async function settleImport(): Promise<void> {
  await vi.dynamicImportSettled();
  await act(async () => {
    await Promise.resolve();
  });
}

describe('shared touch loader', () => {
  let frames: FrameRequestCallback[];
  let idle: {callback: IdleRequestCallback; timeout?: number}[];

  beforeEach(() => {
    __resetTouchRuntimeForTest();
    vi.useFakeTimers();
    frames = [];
    idle = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    window.requestIdleCallback = vi.fn((callback, options) => {
      idle.push({callback, timeout: options?.timeout});
      return idle.length;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // @ts-expect-error -- jsdom has no requestIdleCallback of its own.
    delete window.requestIdleCallback;
    __resetTouchRuntimeForTest();
  });

  function paint(): void {
    const pending = frames.splice(0);
    for (const callback of pending) {
      callback(performance.now());
    }
    vi.advanceTimersByTime(0);
  }

  it('waits for first paint, then idle within the cap, and loads once', async () => {
    const seen: boolean[] = [];
    render(
      <>
        <Reader onRender={loaded => seen.push(loaded)} />
        <Reader onRender={loaded => seen.push(loaded)} />
      </>,
    );
    expect(getTouchRuntime()).toBeNull();
    // One schedule for the page, however many readers mount.
    expect(frames).toHaveLength(1);
    expect(idle).toHaveLength(0);

    paint();
    expect(idle).toHaveLength(1);
    expect(idle[0].timeout).toBe(LOAD_CAP_MS);
    expect(getTouchRuntime()).toBeNull();

    idle[0].callback({didTimeout: false, timeRemaining: () => 50});
    await settleImport();
    expect(getTouchRuntime()).not.toBeNull();
    // Both readers render with the runtime once it has loaded.
    expect(seen.slice(-2)).toEqual([true, true]);

    // A later mount reads the loaded runtime and schedules nothing.
    render(<Reader onRender={loaded => seen.push(loaded)} />);
    expect(seen.at(-1)).toBe(true);
    expect(frames).toHaveLength(0);
    expect(idle).toHaveLength(1);
  });

  it('never starts or hurries the load on an input', async () => {
    render(<Reader onRender={() => {}} />);
    for (const type of ['pointerdown', 'touchstart', 'keydown', 'focusin']) {
      document.body.dispatchEvent(new Event(type, {bubbles: true}));
    }
    await settleImport();
    expect(getTouchRuntime()).toBeNull();
    expect(idle).toHaveLength(0);

    paint();
    document.body.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    await settleImport();
    expect(getTouchRuntime()).toBeNull();
    expect(idle).toHaveLength(1);
  });

  it('starts the load after a timer when the browser has no idle callback', async () => {
    vi.useRealTimers();
    // @ts-expect-error -- this browser has none.
    delete window.requestIdleCallback;
    render(<Reader onRender={() => {}} />);
    for (const callback of frames.splice(0)) {
      callback(performance.now());
    }
    await vi.waitFor(() => {
      expect(getTouchRuntime()).not.toBeNull();
    });
  });
});
