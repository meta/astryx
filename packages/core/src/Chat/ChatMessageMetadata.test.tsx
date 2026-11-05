// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ChatMessageMetadata} from './ChatMessageMetadata';

describe('ChatMessageMetadata', () => {
  it('renders metadata content', () => {
    render(
      <ChatMessageMetadata
        timestamp="12:00"
        status="read"
        data-testid="meta"
      />,
    );
    expect(screen.getByTestId('meta')).toBeTruthy();
  });

  it('forwards rest props (data-*, aria-*, id) to the root element', () => {
    render(
      <ChatMessageMetadata
        timestamp="12:00"
        data-testid="meta"
        data-custom="x"
        id="meta-1"
      />,
    );
    const root = screen.getByTestId('meta');
    expect(root).toHaveAttribute('data-custom', 'x');
    expect(root).toHaveAttribute('id', 'meta-1');
  });

  it('omits separators when a footer slot has no rendered content', () => {
    render(
      <ChatMessageMetadata
        timestamp="10:32"
        footer={false}
        data-testid="meta"
      />,
    );
    expect(screen.getByTestId('meta')).toHaveTextContent('10:32');
    expect(screen.getByTestId('meta')).not.toHaveTextContent('·');
  });

  it('omits an empty timestamp and the row when both slots are empty', () => {
    const {rerender} = render(
      <ChatMessageMetadata
        timestamp={false}
        footer="Model info"
        data-testid="meta"
      />,
    );
    expect(screen.getByTestId('meta')).toHaveTextContent('Model info');
    expect(screen.getByTestId('meta')).not.toHaveTextContent('·');

    rerender(
      <ChatMessageMetadata timestamp="" footer={false} data-testid="meta" />,
    );
    expect(screen.queryByTestId('meta')).not.toBeInTheDocument();
  });

  it('keeps numeric zero in both visible slots', () => {
    render(<ChatMessageMetadata timestamp={0} footer={0} data-testid="meta" />);
    expect(screen.getByTestId('meta')).toHaveTextContent('0·0');
  });
});
