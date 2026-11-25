// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.sheetHeldPressOutside.test.tsx
 * @input Uses vitest, Testing Library, and Selector with its bottom-sheet
 *   frame held until the test releases it, counting each request for it
 * @output Tests that a press outside the trigger, made while an open waits for
 *   the sheet's frame, ends that open, so no sheet appears later
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

describe('Selector held sheet open and a press elsewhere', () => {
  it('ends the held open on a press outside the trigger, so no sheet appears later', async () => {
    render(
      <>
        <Selector
          label="Color"
          options={['Red', 'Blue']}
          presentation="bottom-sheet"
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    const trigger = screen.getByRole('combobox');
    act(() => {
      trigger.focus();
    });
    fireEvent.click(trigger);
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    fireEvent.pointerDown(elsewhere);
    fireEvent.pointerUp(elsewhere);
    fireEvent.click(elsewhere);

    await act(async () => {
      frameModule.release();
      await frameModule.ready;
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});
