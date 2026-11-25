// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.sheetHeldOtherSelector.test.tsx
 * @input Uses vitest, Testing Library, and Selector with its bottom-sheet
 *   frame held until the test releases it, counting each request for it
 * @output Tests that moving to another selector while an open waits for the
 *   sheet's frame ends that open, and only the other selector's sheet opens
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

describe('Selector held sheet open and another selector', () => {
  it("ends the held open when focus moves to another selector, and only that selector's sheet opens", async () => {
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
    fireEvent.click(color);
    fireEvent.pointerDown(size);
    act(() => {
      size.focus();
    });
    fireEvent.pointerUp(size);
    fireEvent.click(size);

    await act(async () => {
      frameModule.release();
      await frameModule.ready;
    });
    await vi.waitFor(() =>
      expect(size).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(color).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(1);
  });
});
