// Copyright (c) Meta Platforms, Inc. and affiliates.

import {fireEvent, render, screen, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MobileSheetConfirmation} from './MobileSheetConfirmation';

// jsdom has no native modal presentation; keep the public Dialog path active.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  window.scrollTo = vi.fn();
});

function setup() {
  const onAction = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <MobileSheetConfirmation
      isOpen
      onOpenChange={onOpenChange}
      title="Discard changes?"
      description="The draft will be removed."
      actionLabel="Discard"
      cancelLabel="Keep editing"
      onAction={onAction}
    />,
  );
  const dialog = screen.getByRole('alertdialog', {name: 'Discard changes?'});
  return {dialog, onAction, onOpenChange};
}

describe('MobileSheetConfirmation', () => {
  it('keeps the alert-dialog theme target and accessible copy', () => {
    const {dialog} = setup();
    expect(dialog).toHaveClass('astryx-alert-dialog');
    expect(dialog).toHaveAccessibleDescription('The draft will be removed.');
  });

  it('stacks full-width large actions with the secondary safe action focused', () => {
    const {dialog} = setup();
    const [destructive, safe] = within(dialog).getAllByRole('button');
    expect(destructive).toHaveAccessibleName('Discard');
    expect(destructive).toHaveAttribute('data-variant', 'destructive');
    expect(safe).toHaveAccessibleName('Keep editing');
    expect(safe).toHaveAttribute('data-variant', 'secondary');
    for (const button of [destructive, safe]) {
      expect(button).toHaveAttribute('data-size', 'lg');
      expect(getComputedStyle(button).width).toBe('100%');
    }
    expect(getComputedStyle(safe.parentElement!).flexDirection).toBe('column');
    expect(safe).toHaveFocus();
  });

  it('reports action and safe dismissal independently without committing on cancel', () => {
    const {dialog, onAction, onOpenChange} = setup();
    fireEvent.click(within(dialog).getByRole('button', {name: 'Keep editing'}));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', {name: 'Discard'}));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
