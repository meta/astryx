// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAnnounce.test.tsx
 * @input Uses vitest, @testing-library/react, useAnnounce hook
 * @output Unit tests for useAnnounce live-region announcements
 * @position Testing; validates useAnnounce.ts
 *
 * SYNC: When useAnnounce.ts changes, update tests to match new behavior
 */

import {describe, it, expect, afterEach, vi} from 'vitest';
import {act, renderHook, waitFor} from '@testing-library/react';
import {useAnnounce, __resetLiveRegionsForTest} from './useAnnounce';

afterEach(() => {
  __resetLiveRegionsForTest();
});

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}
function assertiveRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="assertive"]');
}

describe('useAnnounce', () => {
  it.each(['polite', 'assertive'] as const)(
    'cancels every queued %s write when cleared',
    politeness => {
      vi.useFakeTimers();
      try {
        const {result} = renderHook(() => useAnnounce());
        result.current('First', politeness);
        result.current('Second', politeness);
        const region =
          politeness === 'polite' ? politeRegion()! : assertiveRegion()!;
        const write = vi.spyOn(region, 'textContent', 'set');
        result.current('', politeness);
        act(() => {
          vi.advanceTimersByTime(50);
        });
        expect(write.mock.calls).toEqual([['']]);
        write.mockRestore();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each(['polite', 'assertive'] as const)(
    'joins %s messages announced in the same frame, in order (AST-086 FR9)',
    politeness => {
      vi.useFakeTimers();
      try {
        const {result} = renderHook(() => useAnnounce());
        result.current('3 results', politeness);
        result.current('Filter applied', politeness);
        const region =
          politeness === 'polite' ? politeRegion()! : assertiveRegion()!;
        const write = vi.spyOn(region, 'textContent', 'set');
        act(() => {
          vi.advanceTimersByTime(50);
        });
        // One write exposes both; neither is dropped or exposed alone.
        expect(write.mock.calls).toEqual([['3 results Filter applied']]);
        write.mockRestore();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('keeps an identical message repeated in the same frame once (AST-086 FR9)', () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useAnnounce());
      result.current('1 result');
      result.current('Filter applied');
      result.current('1 result');
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(politeRegion()!.textContent).toBe('1 result Filter applied');
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a new announcement for a message after the joined one is exposed (AST-086 FR9)', () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useAnnounce());
      result.current('First');
      result.current('Second');
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(politeRegion()).toHaveTextContent('First Second');
      result.current('Third');
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(politeRegion()!.textContent).toBe('Third');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears messages joined but not yet exposed (AST-086 FR9)', () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useAnnounce());
      result.current('First');
      result.current('Second');
      result.current('');
      result.current('Third');
      act(() => {
        vi.advanceTimersByTime(50);
      });
      // The clear dropped First and Second; only the later message is exposed.
      expect(politeRegion()!.textContent).toBe('Third');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels queued writes on reset', () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useAnnounce());
      result.current('Saved');
      result.current('Failed', 'assertive');
      const polite = politeRegion()!;
      const assertive = assertiveRegion()!;
      __resetLiveRegionsForTest();
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(polite.textContent).toBe('');
      expect(assertive.textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('mounts empty polite and assertive live regions on first announce', async () => {
    const {result} = renderHook(() => useAnnounce());
    // Regions do not exist until first use.
    expect(politeRegion()).toBeNull();

    result.current('Saved');

    // Both regions exist after the first announce, before content settles.
    expect(politeRegion()).not.toBeNull();
    expect(assertiveRegion()).not.toBeNull();
    expect(politeRegion()).toHaveAttribute('aria-live', 'polite');
    expect(politeRegion()).toHaveAttribute('aria-atomic', 'true');
    expect(politeRegion()).toHaveAttribute('role', 'status');
    expect(assertiveRegion()).toHaveAttribute('aria-live', 'assertive');
    expect(assertiveRegion()).toHaveAttribute('role', 'alert');
  });

  it('announces a polite message into the polite region', async () => {
    const {result} = renderHook(() => useAnnounce());
    result.current('12 results');
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('12 results');
    });
    // Assertive region stays empty.
    expect(assertiveRegion()).toHaveTextContent('');
  });

  it('routes assertive messages to the assertive region', async () => {
    const {result} = renderHook(() => useAnnounce());
    result.current('Upload failed', 'assertive');
    await waitFor(() => {
      expect(assertiveRegion()).toHaveTextContent('Upload failed');
    });
    expect(politeRegion()).toHaveTextContent('');
  });

  it('re-announces an identical message (clears then re-sets)', async () => {
    const {result} = renderHook(() => useAnnounce());
    result.current('No results found');
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('No results found');
    });
    // Second identical announce should still land (region is cleared first).
    result.current('No results found');
    expect(politeRegion()).toHaveTextContent('');
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('No results found');
    });
  });

  it('ignores empty messages', () => {
    const {result} = renderHook(() => useAnnounce());
    result.current('');
    // No regions created for an empty announce.
    expect(politeRegion()).toBeNull();
  });

  it('clears the region after the clear delay, but not before', () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useAnnounce());
      result.current('Saved');
      // Flush the rAF that re-sets the message.
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(politeRegion()?.textContent).toBe('Saved');

      // The message survives long enough for AT to finish reading it.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(politeRegion()?.textContent).toBe('Saved');

      // After the clear delay, stale status text is removed from the DOM.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(politeRegion()?.textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the clear timer on each announce', () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useAnnounce());
      result.current('first');
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      // Announcing again must reset the pending clear, not inherit it.
      result.current('second');
      act(() => {
        vi.advanceTimersByTime(1900);
      });
      // 3.4s after 'first' (past its clear point) but only 1.9s after
      // 'second' — the newer message must still be present.
      expect(politeRegion()?.textContent).toBe('second');
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(politeRegion()?.textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-announces normally after a clear', () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useAnnounce());
      result.current('gone soon');
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(politeRegion()?.textContent).toBe('');

      // The clear-then-rAF re-announce pattern still works after a clear.
      result.current('back again');
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(politeRegion()?.textContent).toBe('back again');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses the same singleton regions across hook instances', async () => {
    const {result: a} = renderHook(() => useAnnounce());
    a.current('first');
    const region = politeRegion();

    const {result: b} = renderHook(() => useAnnounce());
    b.current('second');
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('second');
    });
    // Same DOM node, not a duplicate.
    expect(politeRegion()).toBe(region);
    expect(
      document.querySelectorAll('[data-astryx-live-region="polite"]').length,
    ).toBe(1);
  });
});
