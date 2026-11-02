// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetCloseFocus.test.tsx
 * @input Uses vitest, @testing-library/react and BottomSheet
 * @output Tests the close order for focus: a sheet that closes with focus
 *   inside it is neither inert nor aria-hidden during its exit, keeps that
 *   focus, and returns it to the opener when the exit ends, before its dialog
 *   closes; a sheet that closes with focus elsewhere is inert and hidden at
 *   once
 * @position Core testing; validates the exit inertness in BottomSheet.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BottomSheet} from './BottomSheet';
import {resetBottomSheetStackForTests} from './bottomSheetStack';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

beforeEach(() => {
  resetBottomSheetStackForTests();
  __resetInteractionModalityForTest();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Filters() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Filters
      </button>
      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
        <button type="button" onClick={() => setIsOpen(false)}>
          Done
        </button>
      </BottomSheet>
    </>
  );
}

function sheet(): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>(
    'dialog[aria-label="Filters"]',
  );
  if (dialog == null) {
    throw new Error('sheet not found');
  }
  return dialog;
}

function finishExit() {
  const panel = sheet().querySelector<HTMLElement>('.astryx-bottom-sheet');
  if (panel == null) {
    throw new Error('sheet panel not found');
  }
  fireEvent.transitionEnd(panel, {propertyName: 'transform'});
}

function openFilters() {
  render(<Filters />);
  const opener = screen.getByRole('button', {name: 'Filters'});
  act(() => opener.focus());
  fireEvent.click(opener);
  return opener;
}

describe('BottomSheet close order for focus', () => {
  it('keeps a closing sheet out of inert and aria-hidden while focus is inside', () => {
    openFilters();
    const done = screen.getByRole('button', {name: 'Done'});
    act(() => done.focus());

    fireEvent.click(done);

    const dialog = sheet();
    expect(dialog).toHaveAttribute('open');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog).not.toHaveAttribute('inert');
    expect(dialog).not.toHaveAttribute('aria-hidden');
    expect(done).toHaveFocus();
  });

  it('returns focus to the opener when the exit ends, then closes', () => {
    const opener = openFilters();
    const done = screen.getByRole('button', {name: 'Done'});
    act(() => done.focus());
    fireEvent.click(done);

    finishExit();

    expect(opener).toHaveFocus();
    expect(sheet()).not.toHaveAttribute('open');
  });

  it('marks a closing sheet inert and hidden at once when focus is elsewhere', () => {
    openFilters();
    const done = screen.getByRole('button', {name: 'Done'});
    act(() => (document.activeElement as HTMLElement | null)?.blur());

    fireEvent.click(done);

    expect(sheet()).toHaveAttribute('inert');
    expect(sheet()).toHaveAttribute('aria-hidden', 'true');
  });
});
