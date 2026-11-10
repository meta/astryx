// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverOutsidePress.test.tsx
 * @input usePopover with `onOutsidePress`
 * @output Tests for a cancellable outside dismissal
 * @position Colocated with usePopover.tsx
 */

import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import React, {useEffect, useRef} from 'react';
import {usePopover, type PopoverOutsidePressEvent} from './usePopover';

/** Presses `element`; returns whether the browser's pointerup was not cancelled. */
function press(element: Element, pointerType = 'mouse'): boolean {
  fireEvent.pointerDown(element, {pointerType, composed: true});
  return fireEvent.pointerUp(element, {pointerType, composed: true});
}

function Harness({
  onOutsidePress,
  hasLightDismiss,
}: {
  onOutsidePress?: (event: PopoverOutsidePressEvent) => void;
  hasLightDismiss?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const popover = usePopover({
    anchor: anchorRef,
    onOutsidePress,
    hasLightDismiss,
    hasAutoFocus: false,
    dialogLabel: 'Editor',
  });
  const showRef = useRef(popover.show);
  showRef.current = popover.show;
  // Opens once, on mount, from code.
  useEffect(() => {
    showRef.current();
  }, []);
  return (
    <>
      <div ref={anchorRef} data-testid="anchor">
        Pencil
      </div>
      <button type="button" data-testid="page">
        Page
      </button>
      <span data-testid="state">{popover.isOpen ? 'open' : 'closed'}</span>
      <button
        type="button"
        ref={popover.triggerRef}
        onClick={popover.toggle}
        {...popover.triggerProps}>
        Trigger
      </button>
      {popover.render(<button type="button">Inside</button>)}
    </>
  );
}

describe('usePopover onOutsidePress', () => {
  it('reports an outside press and closes when it is not cancelled', () => {
    const onOutsidePress = vi.fn();
    render(<Harness onOutsidePress={onOutsidePress} />);
    press(screen.getByTestId('page'), 'touch');
    expect(onOutsidePress).toHaveBeenCalledTimes(1);
    const event = onOutsidePress.mock.calls[0][0] as PopoverOutsidePressEvent;
    expect(event.target).toBe(screen.getByTestId('page'));
    expect(event.pointerType).toBe('touch');
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
  });

  it('stays open when the press is cancelled, without cancelling the press', () => {
    let event: PopoverOutsidePressEvent | null = null;
    render(
      <Harness
        onOutsidePress={received => {
          event = received;
          received.preventDefault();
        }}
      />,
    );
    const isPressUncancelled = press(screen.getByTestId('page'));
    expect(screen.getByTestId('state')).toHaveTextContent('open');
    expect(isPressUncancelled).toBe(true);
    // The event is the popover's own; it carries no browser event.
    expect(Object.keys(event ?? {})).not.toContain('nativeEvent');
  });

  it('treats a press on a separate anchor as outside', () => {
    const onOutsidePress = vi.fn((event: PopoverOutsidePressEvent) =>
      event.preventDefault(),
    );
    render(<Harness onOutsidePress={onOutsidePress} />);
    press(screen.getByTestId('anchor'));
    expect(onOutsidePress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent('open');
  });

  it('does not report a press inside the popover or on its trigger', () => {
    const onOutsidePress = vi.fn();
    render(<Harness onOutsidePress={onOutsidePress} />);
    press(screen.getByRole('button', {name: 'Inside', hidden: true}));
    press(screen.getByRole('button', {name: 'Trigger'}));
    expect(onOutsidePress).not.toHaveBeenCalled();
  });

  it('is not called when light dismiss is off', () => {
    const onOutsidePress = vi.fn();
    render(<Harness onOutsidePress={onOutsidePress} hasLightDismiss={false} />);
    press(screen.getByTestId('page'));
    expect(onOutsidePress).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('open');
  });

  it('keeps Escape as a dismissal that is not an outside press', () => {
    const onOutsidePress = vi.fn();
    render(<Harness onOutsidePress={onOutsidePress} />);
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
    expect(onOutsidePress).not.toHaveBeenCalled();
  });

  it('uses native light dismiss when no callback is given', () => {
    render(<Harness />);
    const layer = screen
      .getByRole('button', {name: 'Inside', hidden: true})
      .closest('[popover]');
    expect(layer).toHaveAttribute('popover', 'auto');
  });

  it('uses a manual popover when a callback is given', () => {
    render(<Harness onOutsidePress={() => {}} />);
    const layer = screen
      .getByRole('button', {name: 'Inside', hidden: true})
      .closest('[popover]');
    expect(layer).toHaveAttribute('popover', 'manual');
  });
});
