// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.sheetHeldBackdrop.test.tsx
 * @input Uses vitest, Testing Library, and Selector with its bottom-sheet
 *   frame held until the test releases it, counting each request for it
 * @output Tests that a backdrop press on a Dialog that holds a Selector, made
 *   while the Selector's open waits for the sheet's frame, still closes the
 *   Dialog
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
import {Dialog} from '../Dialog/Dialog';

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

describe('Selector held sheet open inside a modal host', () => {
  it("lets a backdrop press close the host while the Selector's open is held", async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const onOpenChange = vi.fn();
    render(
      <Dialog isOpen onOpenChange={onOpenChange} aria-label="Filters">
        <Selector
          label="Color"
          options={['Red', 'Blue']}
          presentation="bottom-sheet"
        />
      </Dialog>,
    );
    const trigger = screen.getByRole('combobox', {hidden: true});
    act(() => {
      trigger.focus();
    });
    fireEvent.click(trigger);
    // Held: the frame has not arrived.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    const backdrop = screen.getAllByRole('dialog', {hidden: true})[0];
    fireEvent.pointerDown(backdrop, {pointerType: 'touch'});
    fireEvent.pointerUp(backdrop, {pointerType: 'touch'});
    fireEvent.click(backdrop);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
