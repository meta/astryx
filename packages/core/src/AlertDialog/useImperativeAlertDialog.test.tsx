// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useImperativeAlertDialog.test.tsx
 * @input Uses vitest, @testing-library/react, useImperativeAlertDialog hook
 * @output Unit tests for the imperative show/hide alert dialog wrapper
 * @position Testing; validates useImperativeAlertDialog.tsx implementation
 *
 * SYNC: When useImperativeAlertDialog.tsx changes, update tests to match
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, renderHook} from '@testing-library/react';
import {useImperativeAlertDialog} from './useImperativeAlertDialog';

// jsdom doesn't implement dialog.showModal/close; mirror the open attribute so
// tests can tell an open dialog from a closed one.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

const deleteOptions = {
  title: 'Delete item?',
  description: 'This action cannot be undone.',
  actionLabel: 'Delete',
  onAction: () => {},
};

const noop = () => {};

function TestHarness({onAction = noop}: {onAction?: () => void}) {
  const alert = useImperativeAlertDialog();

  return (
    <div>
      <button
        type="button"
        onClick={() => alert.show({...deleteOptions, onAction})}>
        Open
      </button>
      <button
        type="button"
        onClick={() =>
          alert.show({
            title: 'Archive item?',
            description: 'You can restore it later.',
            actionLabel: 'Archive',
            actionVariant: 'primary',
            onAction: () => {},
          })
        }>
        Open Archive
      </button>
      <button type="button" onClick={() => alert.hide()}>
        Close
      </button>
      <span data-testid="status">{alert.isOpen ? 'open' : 'closed'}</span>
      {alert.element}
    </div>
  );
}

describe('useImperativeAlertDialog', () => {
  it('starts closed', () => {
    render(<TestHarness />);
    expect(screen.getByTestId('status').textContent).toBe('closed');
  });

  it('renders nothing until the first show()', () => {
    render(<TestHarness />);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('returns a null element before the first show()', () => {
    const {result} = renderHook(() => useImperativeAlertDialog());
    expect(result.current.element).toBeNull();
  });

  it('opens on show()', () => {
    render(<TestHarness />);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('status').textContent).toBe('open');
    expect(screen.getByRole('alertdialog')).toHaveAttribute('open');
  });

  it('renders the title, description and action label passed to show()', () => {
    render(<TestHarness />);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Delete item?')).toBeInTheDocument();
    expect(
      screen.getByText('This action cannot be undone.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Delete'})).toBeInTheDocument();
  });

  it('falls back to the translated cancel label', () => {
    render(<TestHarness />);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByRole('button', {name: 'Cancel'})).toBeInTheDocument();
  });

  it('closes on hide()', () => {
    render(<TestHarness />);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('status').textContent).toBe('open');

    fireEvent.click(screen.getByText('Close'));
    expect(screen.getByTestId('status').textContent).toBe('closed');
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
  });

  it('keeps the dialog mounted after hide() so it can be reopened', () => {
    render(<TestHarness />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('Close'));
    expect(document.querySelector('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('status').textContent).toBe('open');
  });

  it('closes when the dialog cancel button is pressed', () => {
    render(<TestHarness />);
    fireEvent.click(screen.getByText('Open'));

    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(screen.getByTestId('status').textContent).toBe('closed');
  });

  it('runs the onAction passed to show() when the action button is pressed', () => {
    const onAction = vi.fn();
    render(<TestHarness onAction={onAction} />);
    fireEvent.click(screen.getByText('Open'));

    fireEvent.click(screen.getByRole('button', {name: 'Delete'}));
    expect(onAction).toHaveBeenCalledTimes(1);
    // The dialog does not auto-close — that is the caller's job.
    expect(screen.getByTestId('status').textContent).toBe('open');
  });

  it('replaces the content when show() is called again with new options', () => {
    render(<TestHarness />);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Delete item?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Archive'));
    expect(screen.queryByText('Delete item?')).toBeNull();
    expect(screen.getByText('Archive item?')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Archive'})).toBeInTheDocument();
  });

  // The `if (!open)` guard in the hook's onOpenChange is deliberately not
  // covered: AlertDialog only ever reports `false`, so the ignored-`true` path
  // is unreachable through the public surface. Forcing it through the element's
  // props would assert a value that is already settled.
});
