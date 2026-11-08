// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetStacking.announce.test.tsx
 * @input BottomSheet, useAnnounce
 * @output Tests of useAnnounce's modal route (spec:AST-086 FR14) under the
 *   sheet stack (component:BottomSheet FR5–FR12): a message from the top
 *   sheet lands in the top sheet's regions; a message from a covered sheet
 *   — inert and aria-hidden, so not exposed — is delivered beyond it, to the
 *   exposed top sheet, never lost; a same-update replace hands a message
 *   from the leaving sheet to the entering one; a covered sheet that still
 *   contains the top sheet (exposed, but not on top) keeps its words for
 *   when it is on top again, as FR14 rules for a covered modal.
 * @position Test for BottomSheet; sits beside BottomSheetStacking.test.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import React, {useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {__resetLiveRegionsForTest, useAnnounce} from '../hooks/useAnnounce';
import {BottomSheet} from './BottomSheet';
import {resetBottomSheetStackForTests} from './bottomSheetStack';

function Owner({message, label}: {message: string; label: string}) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce(message)}>
      {label}
    </button>
  );
}

function stubDialogs() {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
    this.dataset.modal = 'true';
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    delete this.dataset.modal;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    delete this.dataset.modal;
    this.dispatchEvent(new Event('close'));
  });
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':modal'
      ? this instanceof HTMLDialogElement &&
          this.open &&
          this.dataset.modal === 'true'
      : matches.call(this, selector);
  });
}

async function nextFrame() {
  await act(
    async () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
  );
}

const shared = (politeness = 'polite') =>
  document.querySelector(`[data-astryx-live-region="${politeness}"]`);
const regionIn = (dialog: Element, politeness = 'polite') =>
  dialog.querySelector(
    `:scope > [data-astryx-modal-live-region="${politeness}"]`,
  );
const dialog = (label: string) =>
  document.querySelector<HTMLDialogElement>(`dialog[aria-label="${label}"]`)!;

/** Finishes a sheet's exit the way the panel's motion end would. */
function finishExit(element: HTMLDialogElement) {
  act(() => {
    element
      .querySelector('[data-bottom-sheet-panel]')
      ?.dispatchEvent(new Event('transitionend', {bubbles: true}));
    if (element.open) {
      element.close();
    }
  });
}

beforeEach(() => {
  __resetLiveRegionsForTest();
  resetBottomSheetStackForTests();
  stubDialogs();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Two sibling sheets, A beneath B, each with an announcing control. */
function Siblings({initialB = false}: {initialB?: boolean}) {
  const [isAOpen, setIsAOpen] = useState(true);
  const [isBOpen, setIsBOpen] = useState(initialB);
  return (
    <>
      <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
        <Owner message="From A" label="Say A" />
        <button type="button" onClick={() => setIsBOpen(true)}>
          Open B
        </button>
      </BottomSheet>
      <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
        <Owner message="From B" label="Say B" />
        <button type="button" onClick={() => setIsBOpen(false)}>
          Close B
        </button>
      </BottomSheet>
    </>
  );
}

describe('useAnnounce under the sheet stack (FR14 × component:BottomSheet FR5–FR12)', () => {
  it('a message from the top sheet of a stack lands in the top sheet, not in the covered one or the page', async () => {
    render(<Siblings />);
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    await nextFrame();
    expect(dialog('A')).toHaveAttribute('inert');
    expect(dialog('B')).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', {name: 'Say B'}));
    await nextFrame();
    expect(regionIn(dialog('B'))).toHaveTextContent('From B');
    expect(regionIn(dialog('A'))?.textContent ?? '').toBe('');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('a message from a covered sheet (inert, aria-hidden: not exposed) is not lost — it is delivered beyond the covered sheet, to the exposed top sheet', async () => {
    render(<Siblings />);
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    await nextFrame();
    expect(dialog('A')).toHaveAttribute('aria-hidden', 'true');
    // The covered sheet's control is aria-hidden; a timer or a resolved
    // request inside it would announce the same way, so reach it by element.
    fireEvent.click(screen.getByText('Say A'));
    await nextFrame();
    expect(regionIn(dialog('B'))).toHaveTextContent('From A');
    expect(regionIn(dialog('A'))?.textContent ?? '').toBe('');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('once the top sheet closes and the covered sheet is exposed again, its messages land in it again', async () => {
    render(<Siblings />);
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    finishExit(dialog('B'));
    await nextFrame();
    expect(dialog('A')).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', {name: 'Say A'}));
    await nextFrame();
    expect(regionIn(dialog('A'))).toHaveTextContent('From A');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('a same-update replace: words announced from the leaving sheet by the handler that switches sheets are handed to the entering sheet — not left in the leaving sheet, not lost to the page', async () => {
    function Next({onNext}: {onNext: () => void}) {
      const announce = useAnnounce();
      return (
        <button
          type="button"
          onClick={() => {
            announce('Moved on');
            onNext();
          }}>
          Next
        </button>
      );
    }
    function Flow() {
      const [step, setStep] = useState<'one' | 'two'>('one');
      return (
        <>
          <BottomSheet
            isOpen={step === 'one'}
            onOpenChange={() => {}}
            label="One">
            <Next onNext={() => setStep('two')} />
          </BottomSheet>
          <BottomSheet
            isOpen={step === 'two'}
            onOpenChange={() => {}}
            label="Two">
            <Owner message="From Two" label="Say Two" />
          </BottomSheet>
        </>
      );
    }
    render(<Flow />);
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    // The leaving sheet is presented, inert and aria-hidden through its
    // fade (the replace handoff); the entering one is the exposed modal.
    expect(dialog('One')).toHaveAttribute('inert');
    expect(dialog('Two')).not.toHaveAttribute('inert');
    await nextFrame();
    await nextFrame();
    // The words were written into One while it was exposed; One stopped
    // being exposed in the same update, so its provider handed them to the
    // channel exposed then: the entering sheet.
    expect(regionIn(dialog('One'))?.textContent ?? '').toBe('');
    expect(regionIn(dialog('Two'))).toHaveTextContent('Moved on');
    expect(shared()?.textContent ?? '').toBe('');
    finishExit(dialog('One'));
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Say Two'}));
    await nextFrame();
    expect(regionIn(dialog('Two'))).toHaveTextContent('From Two');
  });

  it('a covered sheet that contains the top sheet (exposed, but not on top) has its words cleared, as FR14 rules for a covered modal, and the top sheet hears its own', async () => {
    function Nested() {
      const [isBOpen, setIsBOpen] = useState(false);
      return (
        <BottomSheet isOpen onOpenChange={() => {}} label="A">
          <Owner message="From A" label="Say A" />
          <button type="button" onClick={() => setIsBOpen(true)}>
            Open B
          </button>
          <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
            <Owner message="From B" label="Say B" />
          </BottomSheet>
        </BottomSheet>
      );
    }
    render(<Nested />);
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    await nextFrame();
    // A contains B's dialog, so the stack leaves A to the browser's modal
    // blocking rather than marking it inert.
    expect(dialog('A')).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', {name: 'Say A'}));
    await nextFrame();
    expect(regionIn(dialog('A'))?.textContent ?? '').toBe('');
    fireEvent.click(screen.getByRole('button', {name: 'Say B'}));
    await nextFrame();
    expect(regionIn(dialog('B'))).toHaveTextContent('From B');
  });
});
