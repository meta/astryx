// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef, type ReactNode} from 'react';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ChatMessage} from './ChatMessage';
import {ChatMessageBubble} from './ChatMessageBubble';
import {ChatMessageList} from './ChatMessageList';
import {ChatMessageMetadata} from './ChatMessageMetadata';

/**
 * Classes shared between two elements. StyleX emits one atomic class per
 * style declaration, so two elements share a class exactly when they share
 * a declaration — e.g. the same density paddingInline.
 */
function sharedClasses(a: Element, b: Element): string[] {
  const bClasses = new Set(Array.from(b.classList));
  return Array.from(a.classList).filter(c => bClasses.has(c));
}

describe('ChatMessageBubble', () => {
  it('renders children', () => {
    render(
      <ChatMessage sender="assistant">
        <ChatMessageBubble>Hello world</ChatMessageBubble>
      </ChatMessage>,
    );
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('applies sender-aware class from context', () => {
    render(
      <ChatMessage sender="user">
        <ChatMessageBubble data-testid="bubble">Hi</ChatMessageBubble>
      </ChatMessage>,
    );
    const el = screen.getByTestId('bubble');
    expect(el).toHaveAttribute('data-sender', 'user');
  });

  it('defaults to assistant when no context', () => {
    render(
      <ChatMessageBubble data-testid="bubble">Standalone</ChatMessageBubble>,
    );
    const el = screen.getByTestId('bubble');
    expect(el).toHaveAttribute('data-sender', 'assistant');
  });

  it('applies inherited compact density class', () => {
    render(
      <ChatMessageList density="compact">
        <ChatMessage sender="assistant">
          <ChatMessageBubble data-testid="bubble">Compact</ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>,
    );
    const el = screen.getByTestId('bubble');
    expect(el).toHaveAttribute('data-density', 'compact');
  });

  it('applies data-testid', () => {
    render(
      <ChatMessage sender="assistant">
        <ChatMessageBubble data-testid="my-bubble">Hi</ChatMessageBubble>
      </ChatMessage>,
    );
    expect(screen.getByTestId('my-bubble')).toBeTruthy();
  });

  it('renders aligned name and metadata slots around the bubble root', () => {
    render(
      <ChatMessage sender="assistant">
        <ChatMessageBubble
          data-testid="bubble"
          name="Navi"
          metadata={<span>10:32 AM</span>}>
          Hi
        </ChatMessageBubble>
      </ChatMessage>,
    );
    const bubble = screen.getByTestId('bubble');

    expect(bubble.previousElementSibling).toHaveTextContent('Navi');
    expect(bubble.nextElementSibling).toHaveTextContent('10:32 AM');
  });

  it('keeps numeric zero inside the aligned name and metadata slots', () => {
    render(
      <ChatMessageBubble data-testid="bubble" name={0} metadata={0}>
        Zero slots
      </ChatMessageBubble>,
    );
    const bubble = screen.getByTestId('bubble');

    expect(bubble.previousElementSibling).toHaveAttribute('data-chat-name');
    expect(bubble.previousElementSibling).toHaveTextContent('0');
    expect(bubble.nextElementSibling).toHaveTextContent('0');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['false', false],
    ['true', true],
    ['empty string', ''],
  ] satisfies [string, ReactNode][])(
    'omits aligned wrappers for %s',
    (_, value) => {
      const {container} = render(
        <ChatMessageBubble data-testid="bubble" name={value} metadata={value}>
          Empty scalar slots
        </ChatMessageBubble>,
      );
      const bubble = screen.getByTestId('bubble');

      expect(container.querySelector('[data-chat-name]')).toBeNull();
      expect(bubble.previousElementSibling).toBeNull();
      expect(bubble.nextElementSibling).toBeNull();
    },
  );

  it('forwards the ref and neutral DOM props to the bubble root', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChatMessageBubble
        ref={ref}
        id="bubble-id"
        aria-label="Message content"
        data-consumer="preserved"
        data-testid="bubble">
        Standalone
      </ChatMessageBubble>,
    );
    const bubble = screen.getByTestId('bubble');

    expect(ref.current).toBe(bubble);
    expect(bubble).toHaveAttribute('id', 'bubble-id');
    expect(bubble).toHaveAttribute('aria-label', 'Message content');
    expect(bubble).toHaveAttribute('data-consumer', 'preserved');
  });

  it('reflects both built-in visual variants on the painting root', () => {
    render(
      <>
        <ChatMessageBubble data-testid="filled">Filled</ChatMessageBubble>
        <ChatMessageBubble data-testid="ghost" variant="ghost">
          Ghost
        </ChatMessageBubble>
      </>,
    );

    expect(screen.getByTestId('filled')).toHaveAttribute(
      'data-variant',
      'filled',
    );
    expect(screen.getByTestId('ghost')).toHaveAttribute(
      'data-variant',
      'ghost',
    );
  });

  it('ghost variant aligns custom content with the bubble text column (#2574)', () => {
    // Repro from the issue: a raw child renders flush with the message
    // edge — it carries none of the inset the bubble's name slot gets.
    const {container} = render(
      <ChatMessage sender="assistant">
        <ChatMessageBubble name="Navi">Hello</ChatMessageBubble>
        <div data-testid="raw">Artifact card</div>
        <ChatMessageBubble variant="ghost" data-testid="ghost">
          Artifact card
        </ChatMessageBubble>
      </ChatMessage>,
    );
    const nameSlot = container.querySelector('[data-chat-name]')!;
    expect(nameSlot).toBeTruthy();

    // Unwrapped custom content: no shared inset — the misalignment case.
    expect(sharedClasses(screen.getByTestId('raw'), nameSlot)).toEqual([]);

    // Ghost-wrapped content: shares the bubble slot's paddingInline
    // declaration, so its text column matches the filled bubble exactly.
    expect(
      sharedClasses(screen.getByTestId('ghost'), nameSlot).length,
    ).toBeGreaterThan(0);
  });

  it('ghost inset tracks message density', () => {
    const renderAtDensity = (density: 'balanced' | 'spacious') => {
      const {container} = render(
        <ChatMessage sender="assistant" density={density}>
          <ChatMessageBubble name="Navi">Hello</ChatMessageBubble>
          <ChatMessageBubble variant="ghost" data-testid={`ghost-${density}`}>
            Card
          </ChatMessageBubble>
        </ChatMessage>,
      );
      return sharedClasses(
        screen.getByTestId(`ghost-${density}`),
        container.querySelector('[data-chat-name]')!,
      );
    };

    const balancedInset = renderAtDensity('balanced');
    const spaciousInset = renderAtDensity('spacious');

    // Both densities align with their own bubble's slot padding...
    expect(balancedInset.length).toBeGreaterThan(0);
    expect(spaciousInset.length).toBeGreaterThan(0);
    // ...and spacious uses a wider inset than balanced.
    expect(spaciousInset).not.toEqual(balancedInset);
  });

  it('width prop replaces the default width cap', () => {
    render(
      <ChatMessage sender="assistant">
        <ChatMessageBubble data-testid="capped">Text</ChatMessageBubble>
        <ChatMessageBubble variant="ghost" width="100%" data-testid="full">
          Card
        </ChatMessageBubble>
      </ChatMessage>,
    );
    const capped = screen.getByTestId('capped');
    const full = screen.getByTestId('full');

    // Default bubbles keep the cap; a width bubble replaces it with none.
    expect(getComputedStyle(capped).maxWidth).toMatch(/^max\(80%,\s*280px\)$/);
    expect(getComputedStyle(full).maxWidth).toBe('none');
    // The dynamic width value is set on the element (string passes through).
    expect(full.getAttribute('style')).toContain('100%');
  });

  it('numeric width is treated as pixels', () => {
    render(
      <ChatMessage sender="assistant">
        <ChatMessageBubble width={420} data-testid="fixed">
          Artifact
        </ChatMessageBubble>
      </ChatMessage>,
    );
    expect(screen.getByTestId('fixed').getAttribute('style')).toContain(
      '420px',
    );
  });
});

describe('ChatMessageMetadata', () => {
  it('renders timestamp', () => {
    render(
      <ChatMessage sender="assistant">
        <ChatMessageMetadata timestamp="2:30 PM" />
      </ChatMessage>,
    );
    expect(screen.getByText('2:30 PM')).toBeTruthy();
  });

  it('renders footer content', () => {
    render(
      <ChatMessage sender="assistant">
        <ChatMessageMetadata footer={<span>Liked</span>} />
      </ChatMessage>,
    );
    expect(screen.getByText('Liked')).toBeTruthy();
  });

  it('renders status', () => {
    render(
      <ChatMessage sender="user">
        <ChatMessageMetadata status="sent" />
      </ChatMessage>,
    );
    expect(screen.getByLabelText('Message sent')).toBeTruthy();
  });

  it('renders timestamp and status on one row', () => {
    render(
      <ChatMessage sender="user">
        <ChatMessageMetadata timestamp="2:30 PM" status="read" />
      </ChatMessage>,
    );
    expect(screen.getByText('2:30 PM')).toBeTruthy();
    expect(screen.getByLabelText('Message read')).toBeTruthy();
    expect(screen.getByText('·')).toBeTruthy();
  });

  it('renders nothing when all props are empty', () => {
    const {container} = render(
      <ChatMessage sender="user">
        <ChatMessageMetadata />
      </ChatMessage>,
    );
    // Only the article wrapper from ChatMessage
    expect(container.querySelectorAll('article').length).toBe(1);
  });
});
