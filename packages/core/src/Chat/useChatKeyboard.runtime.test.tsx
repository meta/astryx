// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useChatKeyboard.runtime.test.tsx
 * @input vitest, Testing Library, ChatLayout alone on the page, the shared
 *   touch loader with its frame and idle callbacks under test control, a
 *   stand-in CSS.supports for WebKit on iOS
 * @output Tests that ChatLayout, under a finger, schedules the touch
 *   runtime's load, so UIKit's keyboard schedule registers on a page with no
 *   other touch component, and that under a fine pointer it schedules nothing
 * @position Unit tests for Chat/useChatKeyboard.ts and utils/touchRuntime.ts
 *   together; useChatKeyboard.test.tsx covers the ride itself
 */

import {act, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ChatLayout} from './ChatLayout';
import {
  keyboardProfileOf,
  registerUIKitKeyboardSchedule,
} from '../keyboard/keyboardLayoutGuide';
import {
  __resetTouchRuntimeForTest,
  getTouchRuntime,
} from '../utils/touchRuntime';

/** Lets the runtime module's `import()` settle. */
async function settleImport(): Promise<void> {
  await vi.dynamicImportSettled();
  await act(async () => {
    await Promise.resolve();
  });
}

describe('ChatLayout alone on a page in Safari on iOS', () => {
  let frames: FrameRequestCallback[];
  let idle: IdleRequestCallback[];

  const stubPointer = (pointer: 'coarse' | 'fine') => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === `(pointer: ${pointer})`,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  };

  beforeEach(() => {
    __resetTouchRuntimeForTest();
    // No other component on the page has loaded the runtime.
    registerUIKitKeyboardSchedule(null);
    vi.useFakeTimers();
    frames = [];
    idle = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    window.requestIdleCallback = vi.fn(callback => {
      idle.push(callback);
      return idle.length;
    });
    // WebKit on iOS is the one engine with -webkit-touch-callout.
    vi.stubGlobal('CSS', {
      supports: (property: string, value: string) =>
        property === '-webkit-touch-callout' && value === 'none',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  function renderLayout() {
    return render(
      <ChatLayout composer={<textarea aria-label="Message" />}>
        <p>Hello</p>
      </ChatLayout>,
    );
  }

  it('schedules the touch runtime under a finger, so UIKit’s keyboard schedule registers', async () => {
    stubPointer('coarse');
    renderLayout();
    expect(keyboardProfileOf(window)).toBeNull();

    // The loader waits for first paint, then for idle.
    paint();
    expect(idle).toHaveLength(1);
    idle[0]({didTimeout: false, timeRemaining: () => 50});
    await settleImport();

    expect(getTouchRuntime()).not.toBeNull();
    expect(keyboardProfileOf(window)).toBe('uikit');
  });

  it('schedules nothing under a fine pointer', async () => {
    stubPointer('fine');
    renderLayout();
    paint();
    await settleImport();
    expect(idle).toHaveLength(0);
    expect(getTouchRuntime()).toBeNull();
    expect(keyboardProfileOf(window)).toBeNull();
  });
});
