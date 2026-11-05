// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageList.test.tsx
 * @input React Testing Library, Vitest, and the public ChatMessageList surface
 * @output Observable log, empty-state, alignment, and async-loading regressions
 * @position Colocated component behavior tests
 */

import {describe, it, expect, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import {ChatMessageList} from './ChatMessageList';
import {ChatMessage} from './ChatMessage';
import {ChatMessageBubble} from './ChatMessageBubble';

describe('ChatMessageList', () => {
  it('renders children', () => {
    render(
      <ChatMessageList>
        <ChatMessage sender="assistant">
          <ChatMessageBubble>Hello</ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>,
    );
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('renders with role="log"', () => {
    render(
      <ChatMessageList data-testid="list">
        <div>msg</div>
      </ChatMessageList>,
    );
    const el = screen.getByTestId('list');
    expect(el.getAttribute('role')).toBe('log');
  });

  it('is not aria-busy by default', () => {
    render(
      <ChatMessageList data-testid="list">
        <div>msg</div>
      </ChatMessageList>,
    );
    expect(screen.getByTestId('list')).not.toHaveAttribute('aria-busy');
  });

  it('marks the log aria-busy while streaming', () => {
    render(
      <ChatMessageList data-testid="list" isStreaming>
        <div>msg</div>
      </ChatMessageList>,
    );
    expect(screen.getByTestId('list')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders empty state when no children', () => {
    render(
      <ChatMessageList emptyState={<div>No messages yet</div>}>
        {[]}
      </ChatMessageList>,
    );
    expect(screen.getByText('No messages yet')).toBeTruthy();
  });

  it('renders an accepted numeric empty state', () => {
    render(<ChatMessageList emptyState={0}>{[]}</ChatMessageList>);
    expect(screen.getByRole('log')).toHaveTextContent('0');
  });

  it('applies density class', () => {
    render(
      <ChatMessageList density="compact" data-testid="list">
        <div>msg</div>
      </ChatMessageList>,
    );
    const el = screen.getByTestId('list');
    expect(el).toHaveAttribute('data-density', 'compact');
  });

  it('accepts gap independently from density', () => {
    render(
      <ChatMessageList density="compact" gap={6} data-testid="list">
        <div>msg</div>
      </ChatMessageList>,
    );
    const el = screen.getByTestId('list');
    expect(el).toHaveAttribute('data-density', 'compact');
  });

  it('applies data-testid', () => {
    render(
      <ChatMessageList data-testid="chat-list">
        <div>msg</div>
      </ChatMessageList>,
    );
    expect(screen.getByTestId('chat-list')).toBeTruthy();
  });

  // With no scrollToTopAction the spacer is the only aria-hidden element in
  // the list, so its presence maps 1:1 to the aria-hidden count.
  it('renders the bottom spacer by default', () => {
    render(
      <ChatMessageList data-testid="list">
        <div>msg</div>
      </ChatMessageList>,
    );
    expect(
      screen.getByTestId('list').querySelectorAll('[aria-hidden]'),
    ).toHaveLength(1);
  });

  it('renders the bottom spacer when align="bottom"', () => {
    render(
      <ChatMessageList align="bottom" data-testid="list">
        <div>msg</div>
      </ChatMessageList>,
    );
    expect(
      screen.getByTestId('list').querySelectorAll('[aria-hidden]'),
    ).toHaveLength(1);
  });

  it('omits the spacer when align="top"', () => {
    render(
      <ChatMessageList align="top" data-testid="list">
        <div>msg</div>
      </ChatMessageList>,
    );
    expect(
      screen.getByTestId('list').querySelectorAll('[aria-hidden]'),
    ).toHaveLength(0);
  });

  it('still renders children when align="top"', () => {
    render(
      <ChatMessageList align="top">
        <ChatMessage sender="assistant">
          <ChatMessageBubble>Hello</ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>,
    );
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('loads older messages through the top sentinel and exposes pending status', async () => {
    let notify!: IntersectionObserverCallback;
    let complete!: () => void;
    const observeSentinel = vi.fn();
    const disconnect = vi.fn();
    const action = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          complete = resolve;
        }),
    );
    class Observer {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe = observeSentinel;
      disconnect = disconnect;
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    try {
      const {unmount} = render(
        <ChatMessageList scrollToTopAction={action}>
          <div>Earlier message</div>
        </ChatMessageList>,
      );
      expect(observeSentinel).toHaveBeenCalledTimes(1);
      act(() => {
        notify(
          [{isIntersecting: false} as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
      expect(action).not.toHaveBeenCalled();
      act(() => {
        notify(
          [{isIntersecting: true} as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
      expect(action).toHaveBeenCalledTimes(1);
      // The loader Spinner inside the log is silent (spec:AST-086 FR4, FR8).
      expect(document.querySelector('.astryx-spinner')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      await act(async () => complete());
      expect(document.querySelector('.astryx-spinner')).toBeNull();
      unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
