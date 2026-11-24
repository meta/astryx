// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelector.sheetLoad.test.tsx
 * @input Uses vitest, Testing Library, and MultiSelector with the shared
 *   bottom-sheet frame held until the test releases it, counting each request
 *   for it
 * @output Tests that a caller's renderTrigger control starts the sheet's load
 *   on a pointer down and on a mouse entering it, and that an idle sheet
 *   trigger names no listbox until the sheet has rendered one
 * @position Tests; MultiSelector's touch presentation, alongside
 *   MultiSelector.test.tsx
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

vi.mock('../Selector/SelectorBottomSheetFrame', async importOriginal => {
  frameModule.requests += 1;
  await frameModule.released;
  const module = await importOriginal();
  frameModule.markReady();
  return module;
});

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

async function idle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });
}

describe('MultiSelector bottom-sheet load', () => {
  it("starts the load from a caller's control on a mouse entering it and on a pointer down, and names no missing listbox", async () => {
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
    const opener = screen.getByRole('button', {name: 'Pick labels'});
    // Idle: the sheet's listbox is not in the document, so nothing names it.
    expect(opener).not.toHaveAttribute('aria-controls');

    fireEvent.pointerEnter(opener, {pointerType: 'touch'});
    await idle();
    expect(frameModule.requests).toBe(0);
    fireEvent.pointerEnter(opener, {pointerType: 'mouse'});
    await vi.waitFor(() => expect(frameModule.requests).toBe(1));
    fireEvent.pointerDown(opener, {pointerType: 'touch'});
    await idle();
    expect(frameModule.requests).toBe(1);

    fireEvent.click(opener);
    await act(async () => {
      frameModule.release();
      await frameModule.ready;
    });
    await vi.waitFor(() =>
      expect(opener.getAttribute('aria-controls')).not.toBeNull(),
    );
    expect(
      document.getElementById(opener.getAttribute('aria-controls')!),
    ).toHaveAttribute('role', 'listbox');
  });
});
