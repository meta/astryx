// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatComposerTokenElement.test.tsx
 * @input Public Chat token element and props contract
 * @output Verifies serialization markers, rendering modes, and DOM passthrough
 * @position Public contract tests for @astryxdesign/core/Chat
 */

import {render, screen} from '@testing-library/react';
import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  ChatComposerTokenElement,
  type ChatComposerTokenElementProps,
} from '@astryxdesign/core/Chat';

describe('ChatComposerTokenElement', () => {
  it('renders a structured token with its serialized value', () => {
    render(
      <ChatComposerTokenElement
        token={{value: '@ada', label: 'Ada', variant: 'blue'}}
        data-testid="token"
      />,
    );

    const token = screen.getByTestId('token');
    expect(token).toHaveAttribute('data-astryx-token', '');
    expect(token).toHaveAttribute('data-astryx-token-value', '@ada');
    expect(token).toHaveAttribute('contenteditable', 'false');
    expect(token).toHaveTextContent('Ada');
  });

  it('renders caller-owned custom token content', () => {
    render(
      <ChatComposerTokenElement
        token={{
          value: '#design',
          render: () => <strong>Design</strong>,
        }}
      />,
    );

    expect(screen.getByText('Design').tagName).toBe('STRONG');
  });

  it('forwards the span ref and neutral DOM props', () => {
    const ref = {current: null as HTMLSpanElement | null};
    render(
      <ChatComposerTokenElement
        ref={ref}
        token={{value: '@ada', label: 'Ada'}}
        aria-label="Mention Ada"
      />,
    );

    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    expect(ref.current).toHaveAttribute('aria-label', 'Mention Ada');
  });

  it('keeps component-owned serialization markers authoritative', () => {
    const conflictingMarkers = {
      'data-astryx-token': 'consumer-value',
      'data-astryx-token-value': 'wrong-value',
    };

    render(
      <ChatComposerTokenElement
        {...conflictingMarkers}
        token={{value: '@ada', label: 'Ada'}}
        data-testid="token"
      />,
    );

    const token = screen.getByTestId('token');
    expect(token).toHaveAttribute('data-astryx-token', '');
    expect(token).toHaveAttribute('data-astryx-token-value', '@ada');
  });

  it('publishes the span props contract', () => {
    expectTypeOf<ChatComposerTokenElementProps>().toMatchTypeOf<{
      token: {value: string};
      ref?: React.Ref<HTMLSpanElement>;
    }>();
  });
});
