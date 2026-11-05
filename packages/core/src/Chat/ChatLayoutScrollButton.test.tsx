// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ChatLayoutScrollButton} from './ChatLayoutScrollButton';

describe('ChatLayoutScrollButton', () => {
  it('renders a scroll button', () => {
    render(
      <ChatLayoutScrollButton
        isVisible
        onClick={() => {}}
        data-testid="scroll"
      />,
    );
    expect(screen.getByTestId('scroll')).toBeTruthy();
  });

  it('renders icon-only (no visible label text) in the default, label-less state', () => {
    render(<ChatLayoutScrollButton isVisible onClick={() => {}} />);
    const button = screen.getByRole('button', {name: 'Scroll to bottom'});
    // The translated name must stay accessible-only. Button renders visible
    // text whenever isIconOnly is false (its default), so a missing
    // isIconOnly here previously rendered the full translation as clipped
    // visible text inside the circular button instead of just the chevron.
    expect(button.textContent).toBe('');
  });

  it('renders the label as visible text when provided', () => {
    render(
      <ChatLayoutScrollButton
        isVisible
        onClick={() => {}}
        label="New messages"
      />,
    );
    const button = screen.getByRole('button', {name: 'New messages'});
    expect(button).toHaveTextContent('New messages');
  });

  it('forwards rest props (data-*, aria-*, id) to the root element', () => {
    render(
      <ChatLayoutScrollButton
        isVisible
        onClick={() => {}}
        data-testid="scroll"
        data-custom="x"
        id="scroll-1"
      />,
    );
    const root = screen.getByTestId('scroll');
    expect(root).toHaveAttribute('data-custom', 'x');
    expect(root).toHaveAttribute('id', 'scroll-1');
  });

  // The hidden state paints nothing, so focus landing on it would have no
  // visible indicator (WCAG 2.2 SC 2.4.7). `opacity: 0` and
  // `pointer-events: none` suppress paint and the pointer but leave the button
  // in sequential focus navigation, so the hidden state must also stop being
  // focusable — without costing the visible state its keyboard access.
  it('is keyboard reachable while visible', async () => {
    const user = userEvent.setup();
    render(<ChatLayoutScrollButton isVisible onClick={() => {}} />);

    await user.tab();

    expect(
      screen.getByRole('button', {name: 'Scroll to bottom'}),
    ).toHaveFocus();
  });

  it('makes the pill inert whenever the visible state turns off', () => {
    const {container, rerender} = render(
      <ChatLayoutScrollButton isVisible onClick={() => {}} />,
    );
    const pill = container.querySelector('.astryx-chat-layout-scroll-button');

    expect(pill).not.toHaveAttribute('inert');

    rerender(<ChatLayoutScrollButton isVisible={false} onClick={() => {}} />);

    expect(pill).toHaveAttribute('inert');
  });

  it('is not keyboard reachable while hidden', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ChatLayoutScrollButton isVisible={false} onClick={() => {}} />
        <button type="button">After</button>
      </>,
    );

    await user.tab();

    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
  });
});
