// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useClipboard.test.tsx
 * @input Uses vitest, @testing-library/react, useClipboard hook
 * @output Unit tests for the useClipboard copy behavior
 * @position Testing; validates useClipboard.ts
 *
 * SYNC: When useClipboard.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, renderHook, waitFor} from '@testing-library/react';
import {useClipboard, useClipboardCopy} from './useClipboard';
import {__resetLiveRegionsForTest} from './useAnnounce';

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}

describe('useClipboard', () => {
  beforeEach(() => {
    // jsdom does not implement the async Clipboard API.
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockResolvedValue(undefined)},
    });
  });

  afterEach(() => {
    __resetLiveRegionsForTest();
    vi.restoreAllMocks();
  });

  it('writes the given text to the clipboard and resolves true', async () => {
    const {result} = renderHook(() => useClipboard());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('hello world');
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
    expect(outcome).toBe(true);
  });

  it('flips isCopied to true after a successful copy', async () => {
    const {result} = renderHook(() => useClipboard());
    expect(result.current.isCopied).toBe(false);
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.isCopied).toBe(true);
  });

  it('reverts isCopied after resetAfterMs', async () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useClipboard({resetAfterMs: 1000}));
      await act(async () => {
        await result.current.copy('x');
      });
      expect(result.current.isCopied).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.isCopied).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps isCopied true for the full window after a rapid re-copy', async () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useClipboard({resetAfterMs: 2000}));
      await act(async () => {
        await result.current.copy('x');
      });
      expect(result.current.isCopied).toBe(true);

      // Re-copy partway through the window.
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      await act(async () => {
        await result.current.copy('x');
      });

      // 600ms after the second copy (2.1s after the first): the first copy's
      // timer must not have reverted it early.
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(result.current.isCopied).toBe(true);

      // It resets 2s after the most recent copy.
      act(() => {
        vi.advanceTimersByTime(1400);
      });
      expect(result.current.isCopied).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces the configured message to a polite live region', async () => {
    const {result} = renderHook(() => useClipboard({announce: 'Copied'}));
    await act(async () => {
      await result.current.copy('x');
    });
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('Copied');
    });
  });

  it('does not announce when no announce message is configured', async () => {
    const {result} = renderHook(() => useClipboard());
    await act(async () => {
      await result.current.copy('x');
    });
    // No announce option → no live region is ever created.
    expect(politeRegion()).toBeNull();
  });

  it('is a silent no-op that resolves false when the clipboard rejects', async () => {
    (
      navigator.clipboard.writeText as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('denied'));
    const {result} = renderHook(() => useClipboard({announce: 'Copied'}));
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('x');
    });
    expect(outcome).toBe(false);
    expect(result.current.isCopied).toBe(false);
    expect(politeRegion()).toBeNull();
  });

  it('clears a pending reset timer on unmount', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const {result, unmount} = renderHook(() => useClipboard());
      await act(async () => {
        await result.current.copy('x');
      });
      unmount();
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useClipboardCopy (internal)', () => {
  const error = new Error('denied');
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockRejectedValue(error)},
    });
  });
  afterEach(() => {
    __resetLiveRegionsForTest();
    vi.useRealTimers();
  });

  it('reports a failed write once, for as long as a copy shows, and leaves isCopied alone', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const {result} = renderHook(() =>
      useClipboardCopy({announceFailure: 'Failed', onError}),
    );
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.copy('x');
    });
    expect(ok).toBe(false);
    expect(result.current.isFailed).toBe(true);
    expect(result.current.isCopied).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.isFailed).toBe(false);
  });

  it('clears the failure when a later write succeeds', async () => {
    const {result} = renderHook(() => useClipboardCopy());
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.isFailed).toBe(true);
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockResolvedValue(undefined)},
    });
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.isFailed).toBe(false);
    expect(result.current.isCopied).toBe(true);
  });

  it('keeps the public hook to copy and isCopied', () => {
    const {result} = renderHook(() => useClipboard());
    expect(Object.keys(result.current).sort()).toEqual(['copy', 'isCopied']);
  });
});
