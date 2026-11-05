// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.sheetActiveDescendant.test.tsx
 * @input Uses vitest, Testing Library, and Selector with its bottom-sheet
 *   module held until the test releases it
 * @output Tests that the bottom-sheet trigger names an active option only once
 *   that option is in the document, while the sheet's surface is still loading
 * @position Tests; Selector's touch presentation on first open, alongside
 *   Selector.test.tsx. The held module stands in for the code-split sheet a
 *   real first open waits for.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const sheetModule = vi.hoisted(() => {
  let release: () => void = () => {};
  const released = new Promise<void>(resolve => {
    release = resolve;
  });
  let markReady: () => void = () => {};
  const ready = new Promise<void>(resolve => {
    markReady = resolve;
  });
  return {
    released,
    release: () => release(),
    ready,
    markReady: () => markReady(),
  };
});

vi.mock('../BottomSheet/BottomSheet', async importOriginal => {
  await sheetModule.released;
  const module = await importOriginal();
  sheetModule.markReady();
  return module;
});

import {Selector} from './Selector';

// Selector loads the sheet's module on demand, and its first load under the
// test transform can take seconds on a busy machine. The file loads the real
// module before any test runs, so that load counts against no wait or time
// limit. The mock above still holds the module until the test releases it.
await vi.importActual('../BottomSheet/BottomSheet');

// jsdom has no modal dialogs or media queries; stand in for them the way
// Selector.test.tsx does.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  sheetModule.release();
  vi.unstubAllGlobals();
});

describe('Selector bottom-sheet active option', () => {
  it('names no active option on the trigger until the sheet has rendered it', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        presentation="bottom-sheet"
      />,
    );
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{Enter}');

    // Open, but the sheet's surface has not loaded: no option exists yet, so
    // the trigger must not point at one.
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('option', {hidden: true})).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-activedescendant');

    // The release lets the sheet's module resolve. `act` renders the sheet that
    // resolution starts, however long that takes, so the checks below need no
    // wait of their own.
    await act(async () => {
      sheetModule.release();
      await sheetModule.ready;
    });
    expect(screen.getByRole('listbox', {hidden: true})).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-activedescendant');
    expect(
      document.getElementById(trigger.getAttribute('aria-activedescendant')!),
    ).toHaveAttribute('role', 'option');
  });
});
