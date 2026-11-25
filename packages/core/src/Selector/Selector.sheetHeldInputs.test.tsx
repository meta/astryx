// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.sheetHeldInputs.test.tsx
 * @input Uses vitest, Testing Library, and Selector with its bottom-sheet
 *   frame held until the test releases it, counting each request for it
 * @output Tests that a second press, Enter or Space made while an open waits
 *   for the sheet's frame keeps that open, picks nothing, and that the sheet
 *   then opens once
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

describe('Selector inputs during a held sheet open', () => {
  it('keeps the held open through a second press, Enter and Space, and picks nothing', async () => {
    const onChange = vi.fn();
    render(
      <Selector
        label="Color"
        options={['Red', 'Blue']}
        presentation="bottom-sheet"
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole('combobox');
    act(() => {
      trigger.focus();
    });
    fireEvent.click(trigger);
    // Held: the frame has not arrived.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, {key: 'Enter'});
    fireEvent.keyDown(trigger, {key: ' '});
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      frameModule.release();
      await frameModule.ready;
    });
    await vi.waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(screen.getAllByRole('dialog', {hidden: true})).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
