// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatSendButton.test.tsx
 * @input Uses vitest, @testing-library/react, the global icon registry
 * @output Unit tests for ChatSendButton
 * @position Colocated unit test; covers labels and icons, disabled rules,
 *   composed consumer clicks, state-action routing, and ChatComposer defaults
 */

import {createRef} from 'react';
import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ChatSendButton} from './ChatSendButton';
import {ChatComposer} from './ChatComposer';
import {Button} from '../Button';
import {registerIcons, resetIcons} from '../Icon';
import {TestIcon} from '../__tests__/TestIcon';
import {declaredValue} from '../__tests__/stylexDeclarations';

describe('ChatSendButton', () => {
  afterEach(() => {
    resetIcons();
  });

  describe('send state', () => {
    it('names the button "Send" from the en message catalog', () => {
      render(<ChatSendButton />);
      expect(screen.getByRole('button')).toHaveAccessibleName('Send');
    });

    it('is disabled with no composer context and no isDisabled prop', () => {
      render(<ChatSendButton />);
      expect(screen.getByRole('button', {name: 'Send'})).toBeDisabled();
    });

    it('is enabled when isDisabled is explicitly false', () => {
      render(<ChatSendButton isDisabled={false} onSend={() => {}} />);
      expect(screen.getByRole('button', {name: 'Send'})).toBeEnabled();
    });

    it('forwards ref, className, data, and ARIA inputs to the Button root', () => {
      const ref = createRef<HTMLButtonElement>();
      render(
        <>
          <ChatSendButton
            ref={ref}
            isDisabled={false}
            onSend={() => {}}
            className="consumer-class"
            data-audit-root="forwarded"
            aria-describedby="send-help"
          />
          <span id="send-help">Sends the current message</span>
        </>,
      );
      const button = screen.getByRole('button', {name: 'Send'});
      expect(ref.current).toBe(button);
      expect(button).toHaveClass('consumer-class');
      expect(button).toHaveAttribute('data-audit-root', 'forwarded');
      expect(button).toHaveAccessibleDescription('Sends the current message');
    });

    it('reflects both supported Button sizes', () => {
      render(
        <>
          <ChatSendButton
            data-testid="send-small"
            isDisabled={false}
            onSend={() => {}}
            size="sm"
          />
          <ChatSendButton
            data-testid="send-medium"
            isDisabled={false}
            onSend={() => {}}
            size="md"
          />
        </>,
      );
      expect(screen.getByTestId('send-small')).toHaveAttribute(
        'data-size',
        'sm',
      );
      expect(screen.getByTestId('send-medium')).toHaveAttribute(
        'data-size',
        'md',
      );
    });

    it('calls onSend when clicked', () => {
      const onSend = vi.fn();
      render(<ChatSendButton isDisabled={false} onSend={onSend} />);
      fireEvent.click(screen.getByRole('button', {name: 'Send'}));
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('composes the consumer onClick with onSend', () => {
      const onClick = vi.fn();
      const onSend = vi.fn();
      render(
        <ChatSendButton isDisabled={false} onClick={onClick} onSend={onSend} />,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Send'}));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('runs onSend exactly once before a consumer click prevents default', () => {
      const order: string[] = [];
      const onSend = vi.fn(() => order.push('send'));
      const onClick = vi.fn(event => {
        order.push('click');
        event.preventDefault();
      });
      render(
        <ChatSendButton isDisabled={false} onClick={onClick} onSend={onSend} />,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Send'}));
      expect(order).toEqual(['send', 'click']);
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('supports native Enter and Space activation', async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      render(<ChatSendButton isDisabled={false} onSend={onSend} />);
      const button = screen.getByRole('button', {name: 'Send'});
      button.focus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      expect(onSend).toHaveBeenCalledTimes(2);
    });

    it('swallows both state and consumer clicks while disabled', () => {
      // isDisabled already defaults true here (no composer context), so this
      // pins the click routing through a disabled Button, not the prop.
      const onSend = vi.fn();
      const onClick = vi.fn();
      render(<ChatSendButton onClick={onClick} onSend={onSend} />);
      fireEvent.click(screen.getByRole('button', {name: 'Send'}));
      expect(onSend).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });

    it('styles the send state as a primary button', () => {
      const {container} = render(<ChatSendButton />);
      const send = container.querySelector('button')!;
      const {container: primaryRef} = render(
        <Button
          label="reference"
          variant="primary"
          isIconOnly
          icon={<TestIcon />}
        />,
      );
      const {container: secondaryRef} = render(
        <Button
          label="reference"
          variant="secondary"
          isIconOnly
          icon={<TestIcon />}
        />,
      );
      const primary = declaredValue(
        primaryRef.querySelector('button')!,
        'background-color',
      );
      expect(primary).not.toBeNull();
      expect(
        declaredValue(
          secondaryRef.querySelector('button')!,
          'background-color',
        ),
      ).not.toBe(primary);
      expect(declaredValue(send, 'background-color')).toBe(primary);
    });

    it('resolves its default icon from the registry arrowUp entry', () => {
      registerIcons({
        arrowUp: (
          <svg data-testid="registry-arrow-up">
            <path d="M0 0" />
          </svg>
        ),
      });
      render(<ChatSendButton />);
      expect(screen.getByTestId('registry-arrow-up')).toBeInTheDocument();
    });

    it('renders an explicit sendIcon instead of the registry icon', () => {
      registerIcons({
        arrowUp: (
          <svg data-testid="registry-arrow-up">
            <path d="M0 0" />
          </svg>
        ),
      });
      render(<ChatSendButton sendIcon={<TestIcon data-testid="my-send" />} />);
      expect(screen.getByTestId('my-send')).toBeInTheDocument();
      expect(screen.queryByTestId('registry-arrow-up')).not.toBeInTheDocument();
    });
  });

  describe('stop state', () => {
    it('names the button "Stop" from the en message catalog', () => {
      render(<ChatSendButton isStopShown />);
      expect(screen.getByRole('button')).toHaveAccessibleName('Stop');
    });

    it('stays enabled even when isDisabled is set', () => {
      render(<ChatSendButton isStopShown isDisabled onStop={() => {}} />);
      expect(screen.getByRole('button', {name: 'Stop'})).toBeEnabled();
    });

    it('routes the click to onStop and never to onSend', () => {
      const onSend = vi.fn();
      const onStop = vi.fn();
      render(<ChatSendButton isStopShown onSend={onSend} onStop={onStop} />);
      fireEvent.click(screen.getByRole('button', {name: 'Stop'}));
      expect(onStop).toHaveBeenCalledTimes(1);
      expect(onSend).not.toHaveBeenCalled();
    });

    it('composes the consumer onClick with onStop', () => {
      const onClick = vi.fn();
      const onStop = vi.fn();
      render(<ChatSendButton isStopShown onClick={onClick} onStop={onStop} />);
      fireEvent.click(screen.getByRole('button', {name: 'Stop'}));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('runs onStop exactly once before a consumer click prevents default', () => {
      const order: string[] = [];
      const onStop = vi.fn(() => order.push('stop'));
      const onClick = vi.fn(event => {
        order.push('click');
        event.preventDefault();
      });
      render(<ChatSendButton isStopShown onClick={onClick} onStop={onStop} />);
      fireEvent.click(screen.getByRole('button', {name: 'Stop'}));
      expect(order).toEqual(['stop', 'click']);
      expect(onStop).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('remains an enabled no-op without onStop while generic onClick still runs', () => {
      const onClick = vi.fn();
      render(<ChatSendButton isStopShown onClick={onClick} />);
      const stop = screen.getByRole('button', {name: 'Stop'});
      expect(stop).toBeEnabled();
      fireEvent.click(stop);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('resolves its default icon from the registry stop entry', () => {
      registerIcons({
        stop: (
          <svg data-testid="registry-stop">
            <rect />
          </svg>
        ),
      });
      render(<ChatSendButton isStopShown />);
      expect(screen.getByTestId('registry-stop')).toBeInTheDocument();
    });

    it('renders an explicit stopIcon instead of the registry icon', () => {
      registerIcons({
        stop: (
          <svg data-testid="registry-stop">
            <rect />
          </svg>
        ),
      });
      render(
        <ChatSendButton
          isStopShown
          stopIcon={<TestIcon data-testid="my-stop" />}
        />,
      );
      expect(screen.getByTestId('my-stop')).toBeInTheDocument();
      expect(screen.queryByTestId('registry-stop')).not.toBeInTheDocument();
    });
  });

  describe('inside ChatComposer', () => {
    it('takes canSend and onSubmit from the composer context', () => {
      const onSubmit = vi.fn();
      const {rerender} = render(
        <ChatComposer onSubmit={onSubmit} value="" input={<div />} />,
      );
      // Empty composer — nothing to send.
      expect(screen.getByRole('button', {name: 'Send'})).toBeDisabled();

      rerender(
        <ChatComposer onSubmit={onSubmit} value="hello" input={<div />} />,
      );
      const send = screen.getByRole('button', {name: 'Send'});
      expect(send).toBeEnabled();

      fireEvent.click(send);
      expect(onSubmit).toHaveBeenCalledWith('hello');
    });
  });
});
