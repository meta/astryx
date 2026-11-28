// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.sheetLoadHover.test.tsx
 * @input Uses vitest, Testing Library, and Selector with its bottom-sheet
 *   frame held until the test releases it, counting each request for it
 * @output Tests that a mouse entering the trigger starts the bottom-sheet
 *   frame's load and a finger entering it does not, and that a closed trigger
 *   names no listbox after the frame has loaded
 * @position Tests; Selector's touch presentation on first open, alongside
 *   Selector.sheetActiveDescendant.test.tsx
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';

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

vi.mock('./SelectorBottomSheetFrame', async importOriginal => {
  frameModule.requests += 1;
  await frameModule.released;
  const module = await importOriginal();
  frameModule.markReady();
  return module;
});

import {Selector} from './Selector';

// The frame's first load under the test transform can take seconds on a busy
// machine; load the real module first so that load counts against no wait.
await vi.importActual('./SelectorBottomSheetFrame');

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

describe('Selector bottom-sheet load on hover', () => {
  it('starts the load when a mouse enters the trigger, not when a finger does', async () => {
    render(
      <Selector
        label="Color"
        options={['Red', 'Blue']}
        presentation="bottom-sheet"
      />,
    );
    const trigger = screen.getByRole('combobox');
    fireEvent.pointerEnter(trigger, {pointerType: 'touch'});
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(frameModule.requests).toBe(0);
    fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
    await vi.waitFor(() => expect(frameModule.requests).toBe(1));
    await act(async () => {
      frameModule.release();
      await frameModule.ready;
    });
    // Loaded but closed: the trigger's closed-state ARIA has not changed.
    expect(trigger).not.toHaveAttribute('aria-controls');
  });

  it('names the listbox only from the open trigger, after another selector loaded the frame', async () => {
    render(
      <>
        <Selector
          label="Color"
          options={['Red', 'Blue']}
          presentation="bottom-sheet"
        />
        <Selector
          label="Size"
          options={['Small', 'Large']}
          presentation="bottom-sheet"
        />
      </>,
    );
    const [color, size] = screen.getAllByRole('combobox');
    act(() => {
      color.focus();
    });
    await act(async () => {
      frameModule.release();
      await frameModule.ready;
    });
    expect(color).not.toHaveAttribute('aria-controls');
    expect(size).not.toHaveAttribute('aria-controls');

    fireEvent.click(size);
    await vi.waitFor(() =>
      expect(size.getAttribute('aria-controls')).not.toBeNull(),
    );
    expect(
      document.getElementById(size.getAttribute('aria-controls')!),
    ).toHaveAttribute('role', 'listbox');
    expect(color).not.toHaveAttribute('aria-controls');
  });
});
