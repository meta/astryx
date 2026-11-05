// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useMediaQuery.test.ts
 * @input Uses vitest, @testing-library/react, useMediaQuery hook
 * @output Unit tests for useMediaQuery hook
 * @position Testing; validates useMediaQuery.ts implementation
 *
 * SYNC: When useMediaQuery.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {createElement} from 'react';
import {useMediaQuery} from './useMediaQuery';

// Mock matchMedia
function createMockMatchMedia(matches: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  return {
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(
      (_event: string, handler: (e: MediaQueryListEvent) => void) => {
        listeners.push(handler);
      },
    ),
    removeEventListener: vi.fn(
      (_event: string, handler: (e: MediaQueryListEvent) => void) => {
        const index = listeners.indexOf(handler);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      },
    ),
    dispatchEvent: vi.fn(),
    // Helper to simulate media query change
    _triggerChange(newMatches: boolean) {
      this.matches = newMatches;
      listeners.forEach(fn => fn({matches: newMatches} as MediaQueryListEvent));
    },
    _listeners: listeners,
  };
}

describe('useMediaQuery', () => {
  let mockMql: ReturnType<typeof createMockMatchMedia>;

  beforeEach(() => {
    mockMql = createMockMatchMedia(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));
  });

  it('returns false when media query does not match', () => {
    const {result} = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('returns true when media query matches', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    const {result} = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('updates when media query changes', () => {
    const {result} = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => {
      mockMql._triggerChange(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      mockMql._triggerChange(false);
    });
    expect(result.current).toBe(false);
  });

  it('passes the query string to matchMedia', () => {
    renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)');
  });

  it('cleans up event listener on unmount', () => {
    const {unmount} = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(mockMql.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );

    unmount();
    expect(mockMql.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('re-subscribes when query changes', () => {
    const mockMql2 = createMockMatchMedia(true);
    const matchMediaFn = vi.fn().mockReturnValue(mockMql);
    vi.stubGlobal('matchMedia', matchMediaFn);

    const {result, rerender} = renderHook(
      ({query}: {query: string}) => useMediaQuery(query),
      {initialProps: {query: '(max-width: 768px)'}},
    );
    expect(result.current).toBe(false);

    // Change query
    matchMediaFn.mockReturnValue(mockMql2);
    rerender({query: '(max-width: 1024px)'});
    expect(result.current).toBe(true);
    expect(matchMediaFn).toHaveBeenCalledWith('(max-width: 1024px)');
  });

  it('returns serverDefault during SSR (no matchMedia)', () => {
    // renderToString uses getServerSnapshot — simulate by calling the hook
    // in an environment where matchMedia doesn't exist. Since JSDOM always
    // provides matchMedia, we test the contract: the serverDefault param
    // is accepted and does not break when the client snapshot differs.
    mockMql = createMockMatchMedia(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    // serverDefault=true but client says false → client wins on hydration
    const {result} = renderHook(() =>
      useMediaQuery('(max-width: 768px)', true),
    );
    expect(result.current).toBe(false);
  });

  it('uses serverDefault=false by default', () => {
    mockMql = createMockMatchMedia(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    // No serverDefault → same as false
    const {result} = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('SSR: returns serverDefault=true in server render', () => {
    // renderToString uses getServerSnapshot — this is the actual SSR path
    function TestComponent() {
      const isMobile = useMediaQuery('(max-width: 768px)', true);
      return createElement('div', {'data-mobile': String(isMobile)});
    }

    const html = renderToString(createElement(TestComponent));
    expect(html).toContain('data-mobile="true"');
  });

  it('SSR: returns false when no serverDefault provided', () => {
    function TestComponent() {
      const isMobile = useMediaQuery('(max-width: 768px)');
      return createElement('div', {'data-mobile': String(isMobile)});
    }

    const html = renderToString(createElement(TestComponent));
    expect(html).toContain('data-mobile="false"');
  });

  it('answers its server default where the window has no matchMedia, as a test DOM may', () => {
    vi.stubGlobal('matchMedia', undefined);
    const off = renderHook(() => useMediaQuery('(pointer: coarse)'));
    expect(off.result.current).toBe(false);
    const on = renderHook(() => useMediaQuery('(pointer: coarse)', true));
    expect(on.result.current).toBe(true);
    off.unmount();
    on.unmount();
  });
});

describe('useMediaQuery shared watch', () => {
  /** A matchMedia whose lists count their live listeners per query. */
  function stubCountingMatchMedia(options: {legacy?: boolean} = {}) {
    const live = new Map<string, number>();
    const handlers = new Map<string, Set<() => void>>();
    let matches = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => {
        const add = (handler: () => void): void => {
          live.set(query, (live.get(query) ?? 0) + 1);
          const set = handlers.get(query) ?? new Set<() => void>();
          set.add(handler);
          handlers.set(query, set);
        };
        const remove = (handler: () => void): void => {
          live.set(query, (live.get(query) ?? 0) - 1);
          handlers.get(query)?.delete(handler);
        };
        const list = {
          media: query,
          get matches() {
            return matches;
          },
        };
        return options.legacy === true
          ? {...list, addListener: add, removeListener: remove}
          : {
              ...list,
              addEventListener: (_type: string, handler: () => void) =>
                add(handler),
              removeEventListener: (_type: string, handler: () => void) =>
                remove(handler),
            };
      }),
    );
    return {
      live: (query: string) => live.get(query) ?? 0,
      change(next: boolean) {
        matches = next;
        for (const set of handlers.values()) {
          for (const handler of Array.from(set)) {
            handler();
          }
        }
      },
    };
  }

  it('holds one listener per query for all its callers, and none after the last unmounts', () => {
    const media = stubCountingMatchMedia();
    const callers = [
      ...[0, 1, 2].map(() =>
        renderHook(() => useMediaQuery('(max-width: 768px)')),
      ),
      ...[0, 1].map(() => renderHook(() => useMediaQuery('(pointer: coarse)'))),
    ];
    expect(media.live('(max-width: 768px)')).toBe(1);
    expect(media.live('(pointer: coarse)')).toBe(1);
    for (const caller of callers) {
      caller.unmount();
    }
    expect(media.live('(max-width: 768px)')).toBe(0);
    expect(media.live('(pointer: coarse)')).toBe(0);
  });

  it('moves every caller of a query when it changes', () => {
    const media = stubCountingMatchMedia();
    const a = renderHook(() => useMediaQuery('(max-width: 768px)'));
    const b = renderHook(() => useMediaQuery('(max-width: 768px)'));
    act(() => media.change(true));
    expect([a.result.current, b.result.current]).toEqual([true, true]);
  });

  it('listens through the older pair on Safari before 14, which has no addEventListener', () => {
    const media = stubCountingMatchMedia({legacy: true});
    const caller = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(media.live('(max-width: 768px)')).toBe(1);
    act(() => media.change(true));
    expect(caller.result.current).toBe(true);
    caller.unmount();
    expect(media.live('(max-width: 768px)')).toBe(0);
  });
});
