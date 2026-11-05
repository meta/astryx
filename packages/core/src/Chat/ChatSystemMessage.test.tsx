// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef, Fragment, type ReactNode} from 'react';
import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {ChatMessageList} from './ChatMessageList';
import {ChatSystemMessage} from './ChatSystemMessage';

const xstyleProbe = stylex.create({
  root: {marginBlockStart: '13px'},
});

function expectProbeClasses(element: HTMLElement): void {
  const classes = (stylex.props(xstyleProbe.root).className ?? '')
    .split(' ')
    .filter(className => className !== '' && !className.includes('__'));
  expect(classes.length).toBeGreaterThan(0);
  for (const className of classes) {
    expect(element).toHaveClass(className);
  }
}

describe('ChatSystemMessage', () => {
  it('renders children', () => {
    render(<ChatSystemMessage>Conversation started</ChatSystemMessage>);
    expect(screen.getByText('Conversation started')).toBeTruthy();
  });

  it('renders default variant without divider lines', () => {
    const {container} = render(<ChatSystemMessage>Hello</ChatSystemMessage>);
    const hiddenElements = container.querySelectorAll('[aria-hidden]');
    expect(hiddenElements.length).toBe(0);
  });

  it('renders divider variant with Divider', () => {
    render(<ChatSystemMessage variant="divider">Today</ChatSystemMessage>);
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('exposes the divider variant label as the separator accessible name', () => {
    render(<ChatSystemMessage variant="divider">Today</ChatSystemMessage>);
    expect(screen.getByRole('separator')).toHaveAccessibleName('Today');
  });

  it('renders icon in the default variant', () => {
    render(
      <ChatSystemMessage icon={<span data-testid="icon">*</span>}>
        Notice
      </ChatSystemMessage>,
    );
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('detects changes to the current divider and icon output for OQ1', () => {
    // OQ1 is unresolved. This assertion detects current-output changes; it does
    // not select whether Divider should render, reject, or warn on the icon.
    render(
      <ChatSystemMessage
        icon={<span data-testid="divider-icon">*</span>}
        variant="divider">
        Today
      </ChatSystemMessage>,
    );
    expect(screen.queryByTestId('divider-icon')).not.toBeInTheDocument();
  });

  it('applies variant class', () => {
    render(
      <ChatSystemMessage variant="divider" data-testid="sys">
        Today
      </ChatSystemMessage>,
    );
    expect(screen.getByTestId('sys')).toHaveAttribute(
      'data-variant',
      'divider',
    );
  });

  it.each(['default', 'divider'] as const)(
    'preserves the complete root passthrough seam for %s',
    variant => {
      const ref = createRef<HTMLDivElement>();
      render(
        <ChatSystemMessage
          ref={ref}
          variant={variant}
          data-testid={`sys-${variant}`}
          aria-label={`${variant} system message`}
          role="note"
          className="consumer-system-message"
          style={{outlineOffset: '3px'}}
          xstyle={xstyleProbe.root}>
          {variant === 'divider' ? 'Today' : 'Conversation started'}
        </ChatSystemMessage>,
      );

      const root = screen.getByTestId(`sys-${variant}`);
      expect(ref.current).toBe(root);
      expect(root).toHaveClass('consumer-system-message');
      expect(root).toHaveStyle({outlineOffset: '3px'});
      expectProbeClasses(root);
      expect(root).toHaveAttribute('aria-label', `${variant} system message`);
      expect(root).toHaveAttribute('role', 'note');
      expect(root).toHaveAttribute('data-variant', variant);
    },
  );

  it.each([
    {name: 'empty string', value: '', text: ''},
    {name: 'numeric zero', value: 0, text: '0'},
    {
      name: 'empty fragment',
      value: (
        <Fragment>
          {null}
          {null}
        </Fragment>
      ),
      text: '',
    },
  ])('keeps the default root for $name children', ({value, text}) => {
    render(
      <ChatSystemMessage data-testid="empty-partition">
        {value}
      </ChatSystemMessage>,
    );
    const root = screen.getByTestId('empty-partition');
    expect(root).not.toHaveAttribute('role');
    expect(root).toHaveTextContent(text);
  });

  it.each([
    {name: 'empty string', value: ''},
    {name: 'numeric zero', value: 0},
    {
      name: 'empty fragment',
      value: (
        <Fragment>
          {null}
          {null}
        </Fragment>
      ),
    },
  ])('keeps the divider root for $name children', ({value}) => {
    render(
      <ChatSystemMessage variant="divider" data-testid="empty-partition">
        {value}
      </ChatSystemMessage>,
    );
    const root = screen.getByTestId('empty-partition');
    expect(root).not.toHaveAttribute('role');
    expect(root).toContainElement(screen.getByRole('separator'));
  });

  it('keeps the numeric-zero label visible and names the shared divider', () => {
    render(
      <ChatSystemMessage variant="divider" data-testid="divider-zero">
        {0}
      </ChatSystemMessage>,
    );
    const root = screen.getByTestId('divider-zero');
    const separator = screen.getByRole('separator');
    expect(root).toHaveTextContent(/^0$/);
    expect(separator).toHaveAccessibleName('0');
    expect(separator).toHaveAttribute('aria-labelledby');
  });

  it.each(['default', 'divider'] as const)(
    'leaves a %s row inside a chat log to the log (spec:AST-086 FR4)',
    variant => {
      render(
        <ChatMessageList>
          <ChatSystemMessage variant={variant} data-testid="notice">
            Ana joined
          </ChatSystemMessage>
        </ChatMessageList>,
      );
      const notice = screen.getByTestId('notice');
      expect(notice.closest('[role="log"]')).not.toBeNull();
      for (const el of [notice, ...notice.querySelectorAll('*')]) {
        expect(el).not.toHaveAttribute('aria-live');
        expect(['status', 'alert', 'log']).not.toContain(
          el.getAttribute('role'),
        );
      }
    },
  );

  // A slot is empty for exactly the values React renders as nothing.
  it.each([
    ['an empty string', ''],
    ['false', false],
    ['true', true],
    ['null', null],
  ])('renders no icon wrapper for %s', (_name, icon) => {
    const {container: withIcon} = render(
      <ChatSystemMessage icon={icon as ReactNode}>Notice</ChatSystemMessage>,
    );
    const {container: without} = render(
      <ChatSystemMessage>Notice</ChatSystemMessage>,
    );
    expect(withIcon.innerHTML).toBe(without.innerHTML);
  });

  it('renders 0 as an icon, as React does', () => {
    render(<ChatSystemMessage icon={0}>Notice</ChatSystemMessage>);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
