// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetSuspense.test.tsx
 * @input Uses vitest, @testing-library/react, BottomSheet and a Suspense
 *   boundary that hides the sheet while it closes
 * @output Tests that a sheet a Suspense boundary hides during its exit, and
 *   then shows again, finishes closing: its dialog closes, it is no longer
 *   inert or hidden, and the page under it is usable
 * @position Core testing; validates the motion completion in
 *   BottomSheetPanel.tsx when React re-runs its layout effects
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {Suspense, use, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BottomSheet} from './BottomSheet';
import {resetBottomSheetStackForTests} from './bottomSheetStack';
import {Button} from '../Button/Button';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

beforeEach(() => {
  resetBottomSheetStackForTests();
  __resetInteractionModalityForTest();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
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

function Page({wait}: {wait: Promise<void> | null}) {
  if (wait != null) {
    use(wait);
  }
  return <p>Page</p>;
}

function Shell({wait}: {wait: Promise<void> | null}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Page wait={wait} />
      <Button label="Open" onClick={() => setIsOpen(true)} />
      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Sheet">
        <Button label="Close" onClick={() => setIsOpen(false)} />
      </BottomSheet>
    </Suspense>
  );
}

function sheetState() {
  const dialog = document.querySelector<HTMLDialogElement>(
    'dialog[aria-label="Sheet"]',
  );
  if (dialog == null) {
    throw new Error('sheet dialog not found');
  }
  return {
    open: dialog.hasAttribute('open'),
    inert: dialog.hasAttribute('inert'),
    ariaHidden: dialog.getAttribute('aria-hidden'),
  };
}

/** Gives the exit a real transition, so it ends on a timer, not at once. */
function slowExit() {
  const panel = document.querySelector<HTMLElement>(
    'dialog[aria-label="Sheet"] .astryx-bottom-sheet',
  );
  if (panel == null) {
    throw new Error('sheet panel not found');
  }
  panel.style.transitionProperty = 'transform';
  panel.style.transitionDuration = '200ms';
  panel.style.transitionDelay = '0s';
}

const CLOSED = {open: false, inert: false, ariaHidden: null};

async function waitPastExit() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 600));
  });
}

describe('BottomSheet hidden by Suspense while it closes', () => {
  it('closes normally without the hide', async () => {
    render(<Shell wait={null} />);
    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    slowExit();
    fireEvent.click(screen.getByRole('button', {name: 'Close'}));
    await waitPastExit();
    expect(sheetState()).toEqual(CLOSED);
  });

  it('finishes closing when it is shown again', async () => {
    const {rerender} = render(<Shell wait={null} />);
    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    slowExit();
    fireEvent.click(screen.getByRole('button', {name: 'Close'}));

    let resolve: () => void = () => {};
    const pending = new Promise<void>(done => {
      resolve = done;
    });
    rerender(<Shell wait={pending} />);
    expect(screen.getByText('Loading')).toBeInTheDocument();

    await act(async () => {
      resolve();
      await pending;
    });
    rerender(<Shell wait={null} />);
    expect(screen.getByText('Page')).toBeInTheDocument();

    await waitPastExit();
    expect(sheetState()).toEqual(CLOSED);
  });
});
