// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.sheetLoad.test.tsx
 * @input Uses vitest, Testing Library, and Selector with its bottom-sheet
 *   frame held until the test releases it, counting each request for it
 * @output Tests that the bottom-sheet frame loads on the trigger's intent and
 *   not before, loads once, and that a tap made before it loads opens the
 *   sheet once, with focus moved in
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

describe('Selector bottom-sheet load', () => {
  it('loads the sheet on intent, once, and opens a tap made before the load once, with focus moved in', async () => {
    render(
      <>
        <Selector
          label="Fruit"
          options={['Apple', 'Banana']}
          presentation="bottom-sheet"
        />
        <Selector
          label="Size"
          options={['Small', 'Large']}
          presentation="bottom-sheet"
          isReadOnly
        />
      </>,
    );
    const [trigger, readOnlyTrigger] = screen.getAllByRole('combobox');

    // Idle: the sheet's listbox is not in the document, so nothing names it.
    expect(trigger).not.toHaveAttribute('aria-controls');

    // No intent yet, and a read-only selector's focus is no intent: nothing
    // loads.
    readOnlyTrigger.focus();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(frameModule.requests).toBe(0);

    // The finger lands: the load starts before the tap ends.
    fireEvent.pointerDown(trigger, {pointerType: 'touch'});
    await vi.waitFor(() => expect(frameModule.requests).toBe(1));

    // The tap ends and opens the list while the frame still loads. Focus
    // and the open add no second load.
    trigger.focus();
    fireEvent.pointerUp(trigger, {pointerType: 'touch'});
    fireEvent.click(trigger);
    // The open is held until the frame renders the listbox: the trigger
    // reports no expanded list and names nothing yet.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');
    expect(frameModule.requests).toBe(1);
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();

    // The frame arrives: the sheet opens once and takes focus.
    await act(async () => {
      frameModule.release();
      await frameModule.ready;
    });
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(screen.getAllByRole('dialog', {hidden: true})).toHaveLength(1);
    expect(frameModule.requests).toBe(1);
    const listbox = screen.getByRole('listbox', {hidden: true});
    expect(listbox.contains(document.activeElement)).toBe(true);
    expect(trigger).toHaveAttribute('aria-controls', listbox.id);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
