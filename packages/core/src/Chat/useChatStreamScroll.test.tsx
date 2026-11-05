// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, render} from '@testing-library/react';
import {useRef} from 'react';
import {
  useChatStreamScroll,
  type UseChatStreamScrollOptions,
  type UseChatStreamScrollReturn,
} from './useChatStreamScroll';

// ---------------------------------------------------------------------------
// Test infrastructure
//
// jsdom has no layout engine, so these tests cover only the SYNCHRONOUS
// scroll paths (instant positioning, lock state, rAF scheduling decisions).
// The spring physics itself (frame-by-frame integration, scrollend re-lock,
// user-scroll detection) is layout/browser-dependent and is verified
// by useChatStreamScroll.a11y.chromium.spec.ts — mocking it here would only
// test the mock.
// ---------------------------------------------------------------------------

let rafQueue: {id: number; cb: FrameRequestCallback}[] = [];
let nextRafId = 1;

function flushRaf() {
  // One flush = one frame: callbacks scheduled during a flush run next flush.
  const frame = rafQueue;
  rafQueue = [];
  act(() => {
    for (const {cb} of frame) {
      cb(performance.now());
    }
  });
}

beforeEach(() => {
  rafQueue = [];
  nextRafId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafQueue.push({id, cb});
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue = rafQueue.filter(frame => frame.id !== id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// The global test setup polyfills matchMedia with a never-matching stub;
// this override makes only the reduced-motion query match, mirroring the
// pattern in useStreamingText.test.ts. Undone by afterEach's
// unstubAllGlobals.
function stubReducedMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function setGeometry(
  el: HTMLElement,
  {scrollHeight, clientHeight}: {scrollHeight: number; clientHeight: number},
) {
  Object.defineProperty(el, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', {
    value: clientHeight,
    configurable: true,
  });
  Object.defineProperty(el, 'offsetHeight', {
    value: clientHeight,
    configurable: true,
  });
}

function Harness({
  options,
  api,
}: {
  options?: Partial<UseChatStreamScrollOptions>;
  api: {current: UseChatStreamScrollReturn | null};
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  api.current = useChatStreamScroll({scrollRef, ...options});
  return <div ref={scrollRef} data-testid="scroller" />;
}

function renderHook(options?: Partial<UseChatStreamScrollOptions>) {
  const api: {current: UseChatStreamScrollReturn | null} = {current: null};
  const utils = render(<Harness options={options} api={api} />);
  const el = utils.getByTestId('scroller');
  return {api, el, ...utils};
}

describe('useChatStreamScroll — initial positioning', () => {
  it('default: jumps to the bottom on mount when content is scrollable', () => {
    const {el} = renderHook();
    setGeometry(el, {scrollHeight: 1000, clientHeight: 400});
    flushRaf();
    expect(el.scrollTop).toBe(600);
  });

  it('positions the first async fill in one synchronous step', () => {
    const {api, el} = renderHook();
    // Mount while loading — nothing scrollable yet.
    setGeometry(el, {scrollHeight: 400, clientHeight: 400});
    flushRaf();
    expect(el.scrollTop).toBe(0);

    // Async content lands; the layout's ResizeObserver calls scrollIfLocked.
    setGeometry(el, {scrollHeight: 1200, clientHeight: 400});
    act(() => api.current!.scrollIfLocked());
    // Positioned synchronously — no animation frames needed.
    expect(el.scrollTop).toBe(800);

    // Subsequent growth (streaming) goes back to the spring: nothing moves
    // until animation frames run.
    setGeometry(el, {scrollHeight: 1600, clientHeight: 400});
    act(() => api.current!.scrollIfLocked());
    expect(el.scrollTop).toBe(800);
  });

  it('consumes the pending first fill via the mount jump too', () => {
    const {api, el} = renderHook();
    // Content already present at mount.
    setGeometry(el, {scrollHeight: 1000, clientHeight: 400});
    flushRaf();
    expect(el.scrollTop).toBe(600);

    // Growth after the mount jump is streaming — spring path, not instant.
    setGeometry(el, {scrollHeight: 1400, clientHeight: 400});
    act(() => api.current!.scrollIfLocked());
    expect(el.scrollTop).toBe(600);
  });

  it('default: starts locked', () => {
    const {api} = renderHook();
    expect(api.current!.isLocked).toBe(true);
  });
});

describe("useChatStreamScroll — scrollToBottom({behavior: 'instant'})", () => {
  it('jumps synchronously without scheduling animation frames', () => {
    const {api, el} = renderHook();
    setGeometry(el, {scrollHeight: 1000, clientHeight: 400});
    flushRaf(); // consume the mount jump
    el.scrollTop = 100; // user scrolled up

    rafQueue = [];
    act(() => api.current!.scrollToBottom({behavior: 'instant'}));
    expect(el.scrollTop).toBe(600);
    expect(rafQueue).toHaveLength(0);
  });

  it('re-locks after an instant jump', () => {
    const {api, el} = renderHook();
    setGeometry(el, {scrollHeight: 1000, clientHeight: 400});
    flushRaf();
    act(() => api.current!.unlock());
    expect(api.current!.isLocked).toBe(false);

    act(() => api.current!.scrollToBottom({behavior: 'instant'}));
    expect(api.current!.isLocked).toBe(true);
    expect(el.scrollTop).toBe(600);
  });

  it('default scrollToBottom animates instead of jumping', () => {
    const {api, el} = renderHook();
    setGeometry(el, {scrollHeight: 1000, clientHeight: 400});
    flushRaf();
    el.scrollTop = 100;

    act(() => api.current!.scrollToBottom());
    // Spring path: position is untouched until animation frames run.
    expect(el.scrollTop).toBe(100);
    expect(rafQueue.length).toBeGreaterThan(0);
  });
});

describe('useChatStreamScroll — prefers-reduced-motion', () => {
  it('streaming growth jumps synchronously instead of springing', () => {
    stubReducedMotion();
    const {api, el} = renderHook();
    setGeometry(el, {scrollHeight: 1000, clientHeight: 400});
    flushRaf(); // consume the mount jump
    expect(el.scrollTop).toBe(600);

    // Post-first-fill growth would normally take the spring path; under
    // reduced motion it must land in the same synchronous step.
    setGeometry(el, {scrollHeight: 1400, clientHeight: 400});
    rafQueue = [];
    act(() => api.current!.scrollIfLocked());
    expect(el.scrollTop).toBe(1000);
    expect(rafQueue).toHaveLength(0);
  });

  it('default scrollToBottom falls back to an instant jump', () => {
    stubReducedMotion();
    const {api, el} = renderHook();
    setGeometry(el, {scrollHeight: 1000, clientHeight: 400});
    flushRaf();
    el.scrollTop = 100; // user scrolled up

    rafQueue = [];
    act(() => api.current!.scrollToBottom());
    expect(el.scrollTop).toBe(600);
    expect(rafQueue).toHaveLength(0);
    expect(api.current!.isLocked).toBe(true);
  });
});

describe('useChatStreamScroll — reader intent while content arrives', () => {
  // Mount with content present: the initial jump lands at the bottom, and one
  // scroll event syncs the tracked position so later events are judged
  // against it rather than against the empty container.
  function settleAtBottom(el: HTMLElement) {
    setGeometry(el, {scrollHeight: 1000, clientHeight: 400});
    flushRaf();
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
  }

  // The reader's scroll arrives in the same event that carries new content —
  // the shape every scroll event has while a turn is streaming.
  function scrollUpDuringGrowth(el: HTMLElement) {
    setGeometry(el, {scrollHeight: 1400, clientHeight: 400});
    el.scrollTop = 300;
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
  }

  it('releases follow when the reader scrolls up while content grows', () => {
    const {api, el} = renderHook();
    settleAtBottom(el);

    scrollUpDuringGrowth(el);

    expect(api.current!.isLocked).toBe(false);
  });

  it('releases follow under prefers-reduced-motion too', () => {
    stubReducedMotion();
    const {api, el} = renderHook();
    settleAtBottom(el);

    scrollUpDuringGrowth(el);

    expect(api.current!.isLocked).toBe(false);
  });

  it('keeps following when only the content grew', () => {
    const {api, el} = renderHook();
    settleAtBottom(el);

    setGeometry(el, {scrollHeight: 1400, clientHeight: 400});
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });

    expect(api.current!.isLocked).toBe(true);
  });

  it('a resize clamp onto the new bottom does not release', () => {
    // A block above collapses; the browser pins the position to the new
    // maximum. That is the one upward move that is not the reader.
    const {api, el} = renderHook();
    settleAtBottom(el);

    setGeometry(el, {scrollHeight: 800, clientHeight: 400});
    el.scrollTop = 400;
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });

    expect(api.current!.isLocked).toBe(true);
  });

  it('owns scroll anchoring while following and hands it back when not', () => {
    // Anchoring is the browser's other way of moving a container up on a
    // content change; while following, the hook is the only writer. The
    // switch is an attribute plus one injected rule, never the element's own
    // inline style.
    const {api, el, unmount} = renderHook();
    settleAtBottom(el);
    expect(el.hasAttribute('data-astryx-chat-following')).toBe(true);
    const rule = document.head.querySelector(
      '[data-astryx-chat-following-style]',
    );
    expect(rule?.textContent).toContain('overflow-anchor:none !important');
    expect(el.style.overflowAnchor).toBe('');

    scrollUpDuringGrowth(el);
    expect(api.current!.isLocked).toBe(false);
    expect(el.hasAttribute('data-astryx-chat-following')).toBe(false);

    act(() => api.current!.scrollToBottom({behavior: 'instant'}));
    expect(el.hasAttribute('data-astryx-chat-following')).toBe(true);

    unmount();
    expect(el.hasAttribute('data-astryx-chat-following')).toBe(false);
  });

  it("never touches the element's own overflow-anchor, whatever it becomes", () => {
    // The consumer set an inline value before the hook took over, then
    // changed it while the hook was following. Both are theirs: the hook
    // must not have written over either, and the latest one is what applies
    // once the hook lets go.
    const {api, el, unmount} = renderHook();
    el.style.overflowAnchor = 'auto';
    settleAtBottom(el);
    expect(el.style.overflowAnchor).toBe('auto');

    el.style.overflowAnchor = 'none';
    scrollUpDuringGrowth(el);
    expect(api.current!.isLocked).toBe(false);
    expect(el.style.overflowAnchor).toBe('none');

    unmount();
    expect(el.style.overflowAnchor).toBe('none');
  });

  it('a scroll-up the next spring frame outruns still releases', () => {
    // Between two frames the reader wheels up 100px; the spring's next write
    // then adds more than that, so the net position still advanced. Judged
    // against the position the hook itself wrote, the reader's move shows.
    const {api, el} = renderHook();
    settleAtBottom(el);

    setGeometry(el, {scrollHeight: 4000, clientHeight: 400});
    act(() => api.current!.scrollIfLocked());
    flushRaf();
    const written = el.scrollTop;
    expect(written).toBeGreaterThan(700);

    el.scrollTop = written - 100;
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });

    expect(api.current!.isLocked).toBe(false);
  });
});

describe('useChatStreamScroll — spring cancellation', () => {
  it('an instant jump leaves at most one live animation loop', () => {
    const {api, el} = renderHook();
    setGeometry(el, {scrollHeight: 1000, clientHeight: 400});
    flushRaf();

    // Streaming growth starts a spring.
    setGeometry(el, {scrollHeight: 1400, clientHeight: 400});
    act(() => api.current!.scrollIfLocked());
    flushRaf();
    expect(rafQueue).toHaveLength(1);

    // A programmatic jump lands mid-spring, and content grows again before
    // the superseded loop's next tick — so startAnimation opens a second one.
    act(() => api.current!.scrollToBottom({behavior: 'instant'}));
    setGeometry(el, {scrollHeight: 1800, clientHeight: 400});
    act(() => api.current!.scrollIfLocked());
    flushRaf();

    // Only the live loop rescheduled itself.
    expect(rafQueue).toHaveLength(1);
  });
});
