// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, act} from '@testing-library/react';
import {Suspense, startTransition, use, useState} from 'react';
import {ChatLayout} from './ChatLayout';
import {ChatMessageList} from './ChatMessageList';
import {ChatMessage} from './ChatMessage';
import {ChatMessageBubble} from './ChatMessageBubble';
import {useChatNewMessages} from './useChatNewMessages';

// ---------------------------------------------------------------------------
// Test infrastructure: track ResizeObserver observations
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

beforeEach(() => {
  activeObservations = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useChatNewMessages — callback ref (issue #2282)', () => {
  it('attaches observer when element is provided immediately', () => {
    const onResize = vi.fn();

    function TestHarness() {
      const {contentRef} = useChatNewMessages({isLocked: true, onResize});
      return (
        <div ref={contentRef} data-testid="content">
          <div className="astryx-chat-message">msg</div>
        </div>
      );
    }

    render(<TestHarness />);
    // observeResize fires initial callback → onResize called
    expect(onResize).toHaveBeenCalled();
  });

  it('attaches observer when element mounts late (callback ref)', () => {
    const onResize = vi.fn();

    function TestHarness() {
      const {contentRef} = useChatNewMessages({isLocked: true, onResize});
      const [mounted, setMounted] = useState(false);

      return (
        <>
          <button
            type="button"
            data-testid="mount"
            onClick={() => setMounted(true)}>
            Mount
          </button>
          {mounted && (
            <div ref={contentRef} data-testid="content">
              <div className="astryx-chat-message">msg</div>
            </div>
          )}
        </>
      );
    }

    const {getByTestId} = render(<TestHarness />);

    // Before mount — no element, no observer
    expect(onResize).not.toHaveBeenCalled();

    // Mount the content element
    act(() => {
      getByTestId('mount').click();
    });

    // Callback ref fires → observer attaches → initial callback → onResize
    expect(onResize).toHaveBeenCalled();
  });

  it('detaches observer when element unmounts', () => {
    const onResize = vi.fn();

    function TestHarness() {
      const {contentRef} = useChatNewMessages({isLocked: true, onResize});
      const [mounted, setMounted] = useState(true);

      return (
        <>
          <button
            type="button"
            data-testid="unmount"
            onClick={() => setMounted(false)}>
            Unmount
          </button>
          {mounted && (
            <div ref={contentRef} data-testid="content">
              <div className="astryx-chat-message">msg</div>
            </div>
          )}
        </>
      );
    }

    const {getByTestId} = render(<TestHarness />);
    expect(onResize).toHaveBeenCalled();

    const observationsBefore = activeObservations.length;

    act(() => {
      getByTestId('unmount').click();
    });

    // Observer should have been detached
    expect(activeObservations.length).toBeLessThan(observationsBefore);
  });

  it('works end-to-end with ChatLayout conditional ChatMessageList', () => {
    function TestApp() {
      const [messages, setMessages] = useState<string[]>([]);

      return (
        <>
          <button
            type="button"
            data-testid="add-message"
            onClick={() =>
              setMessages(prev => [...prev, `msg-${prev.length}`])
            }>
            Add
          </button>
          <ChatLayout
            composer={<div>composer</div>}
            emptyState={<div>Empty state</div>}>
            {messages.length > 0 && (
              <ChatMessageList>
                {messages.map(msg => (
                  <ChatMessage key={msg} sender="assistant">
                    <ChatMessageBubble>{msg}</ChatMessageBubble>
                  </ChatMessage>
                ))}
              </ChatMessageList>
            )}
          </ChatLayout>
        </>
      );
    }

    const {getByTestId, getByText} = render(<TestApp />);

    // Empty state showing — no content observer yet
    expect(getByText('Empty state')).toBeInTheDocument();

    // Add first message — ChatMessageList mounts
    act(() => {
      getByTestId('add-message').click();
    });

    expect(getByText('msg-0')).toBeInTheDocument();

    // The inner content div should now be observed
    const contentObservation = activeObservations.find(o => {
      const el = o.element;
      if (!el.querySelector?.('.astryx-chat-message')) {
        return false;
      }
      if (el.className?.includes('astryx-chat-layout')) {
        return false;
      }
      return true;
    });

    expect(contentObservation).toBeDefined();
  });
});

describe('useChatNewMessages — committed values', () => {
  it('keeps the committed lock and onResize when React discards a render, as a suspended transition does', async () => {
    const committed = vi.fn();
    const discarded = vi.fn();
    const pending = new Promise<never>(() => {});
    function Pending(): null {
      use(pending);
      return null;
    }
    function Content({
      isLocked,
      onResize,
    }: {
      isLocked: boolean;
      onResize: () => void;
    }) {
      const {contentRef, hasNewMessages} = useChatNewMessages({
        isLocked,
        onResize,
      });
      return (
        <div
          ref={contentRef}
          data-testid="content"
          data-new-messages={String(hasNewMessages)}>
          <div className="astryx-chat-message">first</div>
        </div>
      );
    }
    function Screen({
      isLocked,
      onResize,
      isPending,
    }: {
      isLocked: boolean;
      onResize: () => void;
      isPending: boolean;
    }) {
      return (
        <Suspense fallback={null}>
          <Content isLocked={isLocked} onResize={onResize} />
          {isPending ? <Pending /> : null}
        </Suspense>
      );
    }
    const {getByTestId, rerender} = render(
      <Screen isLocked onResize={committed} isPending={false} />,
    );
    // The transition renders an unlocked list and a new onResize, then
    // suspends for good, so React keeps the committed tree and never commits
    // that render.
    await act(async () => {
      startTransition(() => {
        rerender(<Screen isLocked={false} onResize={discarded} isPending />);
      });
    });
    committed.mockClear();
    // A message arrives and the content grows.
    const content = getByTestId('content');
    act(() => {
      const message = document.createElement('div');
      message.className = 'astryx-chat-message';
      content.append(message);
      const entry: Partial<ResizeObserverEntry> = {target: content};
      for (const {element, callback} of activeObservations) {
        if (element === content) {
          callback([entry as ResizeObserverEntry], {} as ResizeObserver);
        }
      }
    });
    expect(discarded).not.toHaveBeenCalled();
    expect(committed).toHaveBeenCalled();
    expect(content.dataset.newMessages).toBe('false');
  });

  it('reads the lock and onResize of the commit that attaches a new content element', () => {
    const first = vi.fn();
    const second = vi.fn();
    function Content({
      isLocked,
      onResize,
      element,
    }: {
      isLocked: boolean;
      onResize: () => void;
      element: string;
    }) {
      const {contentRef, hasNewMessages} = useChatNewMessages({
        isLocked,
        onResize,
      });
      return (
        <div
          key={element}
          ref={contentRef}
          data-testid="content"
          data-new-messages={String(hasNewMessages)}>
          <div className="astryx-chat-message">{element}</div>
        </div>
      );
    }
    const {getByTestId, rerender} = render(
      <Content isLocked onResize={first} element="a" />,
    );
    rerender(<Content isLocked={false} onResize={first} element="a" />);
    first.mockClear();
    // One commit swaps the content element and locks the list. The observer
    // calls back as the new element attaches.
    rerender(<Content isLocked onResize={second} element="b" />);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    expect(getByTestId('content').dataset.newMessages).toBe('false');
  });
});
