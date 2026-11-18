// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ChatLayout} from './ChatLayout';
import {ChatMessageList} from './ChatMessageList';
import {ChatMessage} from './ChatMessage';
import {ChatMessageBubble} from './ChatMessageBubble';

describe('ChatLayout', () => {
  it('renders children in the message area', () => {
    render(
      <ChatLayout composer={<div>composer</div>}>
        <div>Hello message</div>
      </ChatLayout>,
    );
    expect(screen.getByText('Hello message')).toBeTruthy();
  });

  it('renders composer in dock', () => {
    render(
      <ChatLayout composer={<div data-testid="composer">Compose</div>}>
        <div>msg</div>
      </ChatLayout>,
    );
    expect(screen.getByTestId('composer')).toBeTruthy();
  });

  it('renders empty state when children is empty array', () => {
    render(
      <ChatLayout
        composer={<div>composer</div>}
        emptyState={<div>No messages yet</div>}>
        {[]}
      </ChatLayout>,
    );
    expect(screen.getByText('No messages yet')).toBeTruthy();
  });

  it('prefers children over empty state when both present', () => {
    render(
      <ChatLayout
        composer={<div>composer</div>}
        emptyState={<div>No messages yet</div>}>
        <div>A message</div>
      </ChatLayout>,
    );
    expect(screen.getByText('A message')).toBeTruthy();
    expect(screen.queryByText('No messages yet')).toBeNull();
  });

  it('applies density attribute to root element', () => {
    const {rerender} = render(
      <ChatLayout
        composer={<div>composer</div>}
        data-testid="layout"
        density="compact">
        <div>msg</div>
      </ChatLayout>,
    );
    const root = screen.getByTestId('layout');
    expect(root).toHaveAttribute('data-density', 'compact');

    rerender(
      <ChatLayout
        composer={<div>composer</div>}
        data-testid="layout"
        density="spacious">
        <div>msg</div>
      </ChatLayout>,
    );
    expect(root).toHaveAttribute('data-density', 'spacious');
  });

  it('defaults density to balanced', () => {
    render(
      <ChatLayout composer={<div>composer</div>} data-testid="layout">
        <div>msg</div>
      </ChatLayout>,
    );
    const root = screen.getByTestId('layout');
    expect(root).toHaveAttribute('data-density', 'balanced');
  });

  it('renders custom scrollButton slot', () => {
    render(
      <ChatLayout
        composer={<div>composer</div>}
        scrollButton={<button type="button">Scroll down</button>}>
        <div>msg</div>
      </ChatLayout>,
    );
    expect(screen.getByRole('button', {name: /Scroll down/})).toBeTruthy();
  });

  it('hides scrollButton when null', () => {
    render(
      <ChatLayout composer={<div>composer</div>} scrollButton={null}>
        <div>msg</div>
      </ChatLayout>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Keyboard reachability of the default scroll-to-bottom button
//
// At rest the layout is neither scrolled up nor holding new messages, so the
// default ChatLayoutScrollButton renders in its hidden state. It is still in
// the DOM, and it is the first control in the dock — ahead of the composer.
// A control nobody can see must not be a tab stop: WCAG 2.2 SC 2.4.7 requires
// a visible focus indicator wherever focus can land, and the hidden pill paints
// nothing. `opacity: 0` and `pointer-events: none` do not remove an element
// from sequential focus navigation; only visibility/display/inert do.
// ---------------------------------------------------------------------------

describe('ChatLayout — default scroll button keyboard reachability', () => {
  it('does not make the resting scroll-to-bottom button the first tab stop', async () => {
    const user = userEvent.setup();
    render(
      <ChatLayout composer={<button type="button">Send</button>}>
        <div>msg</div>
      </ChatLayout>,
    );

    await user.tab();

    expect(screen.getByRole('button', {name: 'Send'})).toHaveFocus();
  });
});

describe('ChatLayout — a page that scrolls the document', () => {
  // The page's root element scrolls, and the browser raises the scroll at the
  // document. The root's offsetHeight is the page's height; its clientHeight
  // is the viewport's.
  const root = document.documentElement;
  const geometry = {scrollHeight: 3000, clientHeight: 700, offsetHeight: 3000};

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    for (const [property, value] of Object.entries(geometry)) {
      Object.defineProperty(root, property, {value, configurable: true});
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const property of Object.keys(geometry)) {
      Reflect.deleteProperty(root, property);
    }
    root.scrollTop = 0;
  });

  function scrollPageTo(top: number) {
    root.scrollTop = top;
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
  }

  it('shows the scroll-to-bottom button when the reader scrolls the page up from its end', () => {
    const scrollRef = {current: root};
    render(
      <ChatLayout composer={<div>composer</div>} scrollRef={scrollRef}>
        <div>msg</div>
      </ChatLayout>,
    );
    const hiddenPill = () =>
      screen.getByLabelText('Scroll to bottom').closest('[inert]');

    scrollPageTo(2300);
    expect(hiddenPill()).not.toBeNull();

    scrollPageTo(2000);
    expect(hiddenPill()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Self-scroll layout contract (#2573)
//
// jsdom has no layout, so these assert the class-level CSS intent: the root
// must be a flex column whose message area flexes (grow, no shrink) instead
// of forcing minHeight: 100%. With minHeight: 100% the in-flow sticky dock
// added its full height on top of the message area, so the root always
// overflowed by exactly the dock height (phantom scrollbar). Real-layout
// geometry was verified in a browser; see the PR for measurements.
// ---------------------------------------------------------------------------

describe('ChatLayout — self-scroll layout contract (#2573)', () => {
  it('root is a flex column so the dock height is part of the 100%', () => {
    render(
      <ChatLayout composer={<div>composer</div>} data-testid="layout">
        <div>msg</div>
      </ChatLayout>,
    );
    const root = screen.getByTestId('layout');
    expect(root).toHaveStyle({display: 'flex', flexDirection: 'column'});
  });

  it('message area flexes to fill leftover space instead of minHeight: 100%', () => {
    render(
      <ChatLayout composer={<div>composer</div>} data-testid="layout">
        <div>msg</div>
      </ChatLayout>,
    );
    const messageArea = screen.getByTestId('layout')
      .firstElementChild as HTMLElement;
    expect(messageArea).toHaveStyle({flexGrow: '1', flexShrink: '0'});
    // minHeight: 100% is the phantom-scrollbar bug — it must not come back.
    expect(getComputedStyle(messageArea).minHeight).not.toBe('100%');
  });

  it('dock is sticky in self-scroll mode and fixed with an external scrollRef', () => {
    const {rerender} = render(
      <ChatLayout composer={<div>composer</div>} data-testid="layout">
        <div>msg</div>
      </ChatLayout>,
    );
    const dock = screen.getByTestId('layout').lastElementChild as HTMLElement;
    expect(dock).toHaveStyle({position: 'sticky'});

    const scrollRef = {current: document.documentElement};
    rerender(
      <ChatLayout
        composer={<div>composer</div>}
        data-testid="layout"
        scrollRef={scrollRef}>
        <div>msg</div>
      </ChatLayout>,
    );
    expect(dock).toHaveStyle({position: 'fixed'});
  });

  it('makes room at the message area\u2019s end for a fixed dock\u2019s height, so the newest message rests above it', () => {
    const rect = stubDockHeight(142);
    const scrollRef = {current: document.documentElement};
    render(
      <ChatLayout
        composer={<div>composer</div>}
        data-testid="layout"
        scrollRef={scrollRef}>
        <div>msg</div>
      </ChatLayout>,
    );
    const messageArea = screen.getByTestId('layout')
      .firstElementChild as HTMLElement;
    expect(endRoom(messageArea)).toBe(142);
    rect.mockRestore();
  });

  it('adds no room for the dock in self-scroll mode, where the sticky dock is in flow', () => {
    const rect = stubDockHeight(142);
    render(
      <ChatLayout composer={<div>composer</div>} data-testid="layout">
        <div>msg</div>
      </ChatLayout>,
    );
    const messageArea = screen.getByTestId('layout')
      .firstElementChild as HTMLElement;
    expect(endRoom(messageArea)).toBe(0);
    rect.mockRestore();
  });
});

// The dock: the layout root's last child. jsdom has no layout, so its height
// is stubbed; every other element measures 0.
function stubDockHeight(height: number) {
  return vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const parent = this.parentElement;
      const isDock =
        parent?.getAttribute('data-testid') === 'layout' &&
        parent.lastElementChild === this;
      return new DOMRect(0, 0, 390, isDock ? height : 0);
    });
}

// The room the message area's end padding adds to the density's own padding,
// CSS px: the `+ Npx` of its functional style.
function endRoom(element: HTMLElement): number {
  const match = /--[\w-]+:\s*calc\([^;]*\+\s*(-?[\d.]+)px\)/.exec(
    element.getAttribute('style') ?? '',
  );
  return match == null ? 0 : Number(match[1]);
}

// ---------------------------------------------------------------------------
// First-fill scroll positioning
//
// jsdom has no layout, so geometry is stubbed and only the synchronous
// paths are asserted (see useChatStreamScroll.test.tsx for the rationale).
// The ResizeObserver stub mirrors useChatNewMessages.test.tsx.
// ---------------------------------------------------------------------------

type ObserverEntry = {element: Element; callback: ResizeObserverCallback};
let activeObservations: ObserverEntry[] = [];

class FakeResizeObserver {
  callback: ResizeObserverCallback;
  observed = new Set<Element>();

  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
  }

  observe(el: Element) {
    this.observed.add(el);
    activeObservations.push({element: el, callback: this.callback});
    this.callback([{target: el} as ResizeObserverEntry], this);
  }

  unobserve(el: Element) {
    this.observed.delete(el);
    activeObservations = activeObservations.filter(o => o.element !== el);
  }

  disconnect() {
    for (const el of this.observed) {
      activeObservations = activeObservations.filter(o => o.element !== el);
    }
    this.observed.clear();
  }
}

describe('ChatLayout — first-fill scroll positioning', () => {
  let rafQueue: FrameRequestCallback[] = [];

  beforeEach(() => {
    activeObservations = [];
    rafQueue = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows a fixed dock that grows, as a composer does with a second line', () => {
    const rect = stubDockHeight(142);
    const scrollRef = {current: document.documentElement};
    render(
      <ChatLayout
        composer={<div>composer</div>}
        data-testid="layout"
        scrollRef={scrollRef}>
        <div>msg</div>
      </ChatLayout>,
    );
    const layout = screen.getByTestId('layout');
    const messageArea = layout.firstElementChild as HTMLElement;
    const dock = layout.lastElementChild as HTMLElement;
    expect(endRoom(messageArea)).toBe(142);
    const observation = activeObservations.find(o => o.element === dock);
    act(() => {
      observation?.callback(
        [
          {
            target: dock,
            borderBoxSize: [{blockSize: 166, inlineSize: 390}],
          } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });
    expect(endRoom(messageArea)).toBe(166);
    rect.mockRestore();
  });

  function setGeometry(el: HTMLElement, scrollHeight: number) {
    Object.defineProperty(el, 'scrollHeight', {
      value: scrollHeight,
      configurable: true,
    });
    Object.defineProperty(el, 'clientHeight', {value: 400, configurable: true});
    Object.defineProperty(el, 'offsetHeight', {
      value: 400,
      configurable: true,
    });
  }

  function fireContentResize() {
    act(() => {
      for (const {element, callback} of [...activeObservations]) {
        callback([{target: element} as ResizeObserverEntry], null!);
      }
    });
  }

  function renderLayout() {
    render(
      <ChatLayout composer={<div>composer</div>} data-testid="layout">
        <ChatMessageList>
          <ChatMessage sender="assistant">
            <ChatMessageBubble>Hello</ChatMessageBubble>
          </ChatMessage>
        </ChatMessageList>
      </ChatLayout>,
    );
    return screen.getByTestId('layout');
  }

  it('positions async-loaded content synchronously on the first fill', () => {
    const root = renderLayout();
    // Mounted while content is short (loading) — not scrollable.
    setGeometry(root, 400);
    act(() => rafQueue.splice(0).forEach(cb => cb(0)));
    expect(root.scrollTop).toBe(0);

    // Content lands: the message list's ResizeObserver fires.
    setGeometry(root, 1400);
    fireContentResize();
    // Positioned in the same synchronous step — no animation frames.
    expect(root.scrollTop).toBe(1000);
  });

  it('springs on growth after the first fill — animation owns it', () => {
    const root = renderLayout();
    setGeometry(root, 400);
    act(() => rafQueue.splice(0).forEach(cb => cb(0)));

    // First fill: instant.
    setGeometry(root, 1400);
    fireContentResize();
    expect(root.scrollTop).toBe(1000);

    // Streaming growth: nothing moves until animation frames run.
    rafQueue.length = 0;
    setGeometry(root, 1800);
    fireContentResize();
    expect(root.scrollTop).toBe(1000);
    expect(rafQueue.length).toBeGreaterThan(0);
  });
});
