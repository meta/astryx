// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelector.sheetLoad.test.tsx
 * @input Uses vitest, Testing Library, and MultiSelector with the shared
 *   bottom-sheet frame held until the test releases it, counting each request
 *   for it
 * @output Tests that a caller's renderTrigger control starts the sheet's load
 *   on a pointer down and on a mouse entering it, each on its own, that a
 *   held open stays collapsed and names no listbox or option until the sheet
 *   renders them, and that a sheet trigger names the listbox only while the
 *   sheet is open
 * @position Tests; MultiSelector's touch presentation, alongside
 *   MultiSelector.test.tsx
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import type * as SheetModule from '../Selector/SelectorBottomSheet';

const frameModule = vi.hoisted(() => {
  let release: () => void = () => {};
  const released = new Promise<void>(resolve => {
    release = resolve;
  });
  let markReady: () => void = () => {};
  const ready = new Promise<void>(resolve => {
    markReady = resolve;
  });
  return {
    requests: 0,
    released,
    release: () => release(),
    ready,
    markReady: () => markReady(),
  };
});

// Counts each load the trigger's intents start, whether or not the frame has
// loaded already.
vi.mock('../Selector/SelectorBottomSheet', async importOriginal => {
  const actual = await importOriginal<typeof SheetModule>();
  return {
    ...actual,
    loadSelectorBottomSheet: vi.fn(actual.loadSelectorBottomSheet),
  };
});

vi.mock('../Selector/SelectorBottomSheetFrame', async importOriginal => {
  frameModule.requests += 1;
  await frameModule.released;
  const module = await importOriginal();
  frameModule.markReady();
  return module;
});

import {loadSelectorBottomSheet} from '../Selector/SelectorBottomSheet';
import {MultiSelector} from './MultiSelector';

await vi.importActual('../Selector/SelectorBottomSheetFrame');

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
  frameModule.release();
  vi.unstubAllGlobals();
});

function renderWithTrigger() {
  render(
    <MultiSelector
      label="Labels"
      options={['Bug', 'Feature']}
      value={[]}
      onChange={() => {}}
      presentation="bottom-sheet"
      renderTrigger={props => (
        <button type="button" {...props}>
          Pick labels
        </button>
      )}
    />,
  );
  return screen.getByRole('button', {name: 'Pick labels'});
}

describe('MultiSelector bottom-sheet load', () => {
  beforeEach(() => {
    vi.mocked(loadSelectorBottomSheet).mockClear();
  });

  // First in the file: the frame is still held here, so the open waits for it.
  it('keeps a held open collapsed, naming nothing, until the sheet renders its listbox', async () => {
    render(
      <MultiSelector
        label="Labels"
        options={['Bug', 'Feature']}
        value={[]}
        onChange={() => {}}
        presentation="bottom-sheet"
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Labels'});
    act(() => {
      trigger.focus();
    });
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    // Held: no listbox is in the document, so the trigger names nothing.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');
    expect(trigger).not.toHaveAttribute('aria-activedescendant');

    await act(async () => {
      frameModule.release();
      await frameModule.ready;
    });
    await vi.waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    const listboxId = trigger.getAttribute('aria-controls');
    expect(document.getElementById(listboxId ?? '')).toHaveAttribute(
      'role',
      'listbox',
    );
    const active = trigger.getAttribute('aria-activedescendant');
    if (active != null) {
      expect(document.getElementById(active)).not.toBeNull();
    }
  });

  it("starts the load on a pointer down on a caller's control", () => {
    const opener = renderWithTrigger();
    fireEvent.pointerDown(opener, {pointerType: 'touch'});
    expect(loadSelectorBottomSheet).toHaveBeenCalledTimes(1);
  });

  it("starts the load when a mouse enters a caller's control, not when a finger does", () => {
    const opener = renderWithTrigger();
    fireEvent.pointerEnter(opener, {pointerType: 'touch'});
    expect(loadSelectorBottomSheet).not.toHaveBeenCalled();
    fireEvent.pointerEnter(opener, {pointerType: 'mouse'});
    expect(loadSelectorBottomSheet).toHaveBeenCalledTimes(1);
  });

  it('names the listbox only while the sheet is open', async () => {
    const opener = renderWithTrigger();
    expect(opener).not.toHaveAttribute('aria-controls');
    fireEvent.pointerEnter(opener, {pointerType: 'mouse'});
    await act(async () => {
      frameModule.release();
      await frameModule.ready;
    });
    // Loaded but closed: the closed-state ARIA has not changed.
    expect(opener).not.toHaveAttribute('aria-controls');

    fireEvent.click(opener);
    await vi.waitFor(() =>
      expect(opener.getAttribute('aria-controls')).not.toBeNull(),
    );
    expect(
      document.getElementById(opener.getAttribute('aria-controls')!),
    ).toHaveAttribute('role', 'listbox');
  });
});
