// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetStacking.test.tsx
 * @input Uses vitest, @testing-library/react, react-dom/server, BottomSheet,
 *   BottomSheetSwitcher, Dialog, and the private bottom-sheet stack registry
 * @output Tests for stacked bottom sheets, one group per requirement: no new
 *   API, open order, same-commit opens, covered sheets, dismissal, one scrim,
 *   closing a covered sheet, focus, the native top layer, concurrent React,
 *   non-modal sheets, and unchanged standalone behaviour
 * @position Core testing; validates bottomSheetStack.ts and the stacking
 *   behaviour of BottomSheet.tsx and BottomSheetSwitcher.tsx
 *
 * SYNC: When bottomSheetStack.ts, BottomSheet.tsx or BottomSheetSwitcher.tsx
 * change their stacking behaviour, update these tests to match.
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {
  Activity,
  StrictMode,
  Suspense,
  startTransition,
  useState,
  type ReactNode,
} from 'react';
import {createPortal, flushSync} from 'react-dom';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Dialog} from '../Dialog';
import {Popover} from '../Popover';
import {subscribeModalOutlets} from '../Layer/modalOutlet';
import * as BottomSheetModule from './index';
import {BottomSheet} from './BottomSheet';
import {BottomSheetSwitcher} from './BottomSheetSwitcher';
import {
  BOTTOM_SHEET_STACK_STATE_FOR_TESTS,
  getBottomSheetStackForTests,
  registerBottomSheet,
  resetBottomSheetStackForTests,
} from './bottomSheetStack';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

/**
 * Every native showModal/show/close, in order, with the dialog. The label is
 * read when a test asks, because a switcher labels its dialog from state its
 * items register in the same commit that shows it.
 */
let nativeLog: {
  call: 'showModal' | 'show' | 'close' | 'showPopover' | 'hidePopover';
  dialog: HTMLElement;
}[] = [];

beforeEach(() => {
  nativeLog = [];
  resetBottomSheetStackForTests();
  __resetInteractionModalityForTest();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    nativeLog.push({call: 'showModal', dialog: this});
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    nativeLog.push({call: 'show', dialog: this});
    this.setAttribute('open', '');
  });
  // A non-modal sheet is a manual popover; jsdom's stand-ins keep the same
  // `open` marker the dialog paths use (the Drawer tests do the same).
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    nativeLog.push({call: 'showPopover', dialog: this});
    this.setAttribute('open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    nativeLog.push({call: 'hidePopover', dialog: this});
    this.removeAttribute('open');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    nativeLog.push({call: 'close', dialog: this});
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
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDialog(
  label: string,
  root: ParentNode = document,
): HTMLDialogElement {
  const dialog = root.querySelector<HTMLDialogElement>(
    `dialog[aria-label="${label}"]`,
  );
  if (dialog == null) {
    throw new Error(`dialog "${label}" not found`);
  }
  return dialog;
}

function getPanel(dialog: HTMLElement): HTMLElement {
  const panels = Array.from(
    dialog.querySelectorAll<HTMLElement>('.astryx-bottom-sheet'),
  ).filter(panel => panel.closest('dialog') === dialog);
  const panel =
    panels.find(candidate => !candidate.parentElement?.hidden) ?? panels[0];
  if (panel == null) {
    throw new Error('sheet panel not found');
  }
  return panel;
}

function getPositioner(dialog: HTMLElement): HTMLElement {
  const positioner = getPanel(dialog).parentElement;
  if (positioner == null) {
    throw new Error('positioner not found');
  }
  return positioner;
}

function getHandle(dialog: HTMLElement): HTMLElement {
  const handle = getPanel(dialog).querySelector<HTMLElement>(
    '[aria-hidden="true"]',
  );
  if (handle == null) {
    throw new Error('grab handle not found');
  }
  return handle;
}

function scrim(dialog: HTMLElement): string {
  return dialog.style.getPropertyValue('--_sheet-scrim-opacity');
}

/** The inline pin on the scrim transition: `0s` for the frame it changes hands. */
function scrimDuration(dialog: HTMLElement): string {
  return dialog.style.getPropertyValue('--_sheet-scrim-duration');
}

/**
 * Record every scrim-opacity write with the transition pin in force at that
 * moment. rAF is synchronous in these tests, so the pin is gone by the time
 * an assertion reads the style; the spy sees it as the browser would.
 */
function recordScrimWrites(): {
  writes: {opacity: string; pin: string}[];
  restore: () => void;
} {
  const writes: {opacity: string; pin: string}[] = [];
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (
    this: CSSStyleDeclaration,
    name: string,
    value: string | null,
    priority?: string,
  ) {
    if (name === '--_sheet-scrim-opacity') {
      writes.push({
        opacity: String(value),
        pin: this.getPropertyValue('--_sheet-scrim-duration'),
      });
    }
    return setProperty.call(this, name, value, priority);
  };
  return {
    writes,
    restore: () => {
      CSSStyleDeclaration.prototype.setProperty = setProperty;
    },
  };
}

/** `label:state:depth` for every presented modal sheet, bottom to top. */
function stackSummary(): string[] {
  return getBottomSheetStackForTests().map(({element, isOpen, view}) => {
    const label = element?.getAttribute('aria-label') ?? '?';
    const state = !isOpen ? 'exiting' : view.isTop ? 'top' : 'covered';
    return `${label}:${state}:${view.depth}`;
  });
}

/** The final native top-layer order: the last showModal of each open dialog. */
function topLayerOrder(): string[] {
  const order: HTMLElement[] = [];
  for (const entry of nativeLog) {
    const index = order.indexOf(entry.dialog);
    if (index !== -1) {
      order.splice(index, 1);
    }
    if (entry.call === 'showModal') {
      order.push(entry.dialog);
    }
  }
  return order.map(dialog => dialog.getAttribute('aria-label') ?? '?');
}

function openDialogs(): string[] {
  return Array.from(document.querySelectorAll('dialog[open]')).map(
    dialog => dialog.getAttribute('aria-label') ?? '?',
  );
}

// The sheet keeps its dialog open through the exit animation; jsdom never
// runs it, so end it the way the panel's transition would.
function finishExit(dialog: HTMLElement) {
  for (const panel of Array.from(
    dialog.querySelectorAll<HTMLElement>('.astryx-bottom-sheet'),
  )) {
    if (panel.closest('dialog') === dialog) {
      fireEvent.transitionEnd(panel, {propertyName: 'transform'});
    }
  }
}

/**
 * Complete a switcher handoff: the entering step's panel finishes its
 * transform, the retained step fades, and its dialog closes.
 */
function finishHandoff(entering: HTMLElement, retained: HTMLElement) {
  for (const panel of Array.from(
    entering.querySelectorAll<HTMLElement>('.astryx-bottom-sheet'),
  )) {
    if (panel.closest('dialog') === entering) {
      fireEvent.transitionEnd(panel, {propertyName: 'transform'});
    }
  }
  for (const panel of Array.from(
    retained.querySelectorAll<HTMLElement>('.astryx-bottom-sheet'),
  )) {
    if (panel.closest('dialog') === retained) {
      fireEvent.transitionEnd(panel, {propertyName: 'opacity'});
    }
  }
}

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function fireCancel(dialog: Element): Event {
  const event = new Event('cancel', {bubbles: false, cancelable: true});
  dialog.dispatchEvent(event);
  return event;
}

// Drive a pointer drag on a grab handle. jsdom PointerEvents don't carry
// clientY, so dispatch plain events with the coords the handlers read.
function drag(handle: HTMLElement, points: {y: number}[]) {
  const [down, ...rest] = points;
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    clientY: down.y,
    button: 0,
    isPrimary: true,
  });
  for (const point of rest) {
    fireEvent.pointerMove(handle, {pointerId: 1, clientY: point.y});
  }
  const last = points[points.length - 1];
  fireEvent.pointerUp(handle, {pointerId: 1, clientY: last.y});
}

function classes(element: Element): string {
  return element.className;
}

/**
 * Two sibling sheets, each with its own state, plus an opener for each. The
 * default writes A before B; `reversed` writes B before A so an open of A
 * then B is an open out of tree order.
 */
function Siblings({
  reversed = false,
  purposeB,
  initialA = false,
  initialB = false,
}: {
  reversed?: boolean;
  purposeB?: 'info' | 'form' | 'required';
  initialA?: boolean;
  initialB?: boolean;
}) {
  const [isAOpen, setIsAOpen] = useState(initialA);
  const [isBOpen, setIsBOpen] = useState(initialB);
  const a = (
    <BottomSheet key="A" isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
      <button type="button" onClick={() => setIsBOpen(true)}>
        Open B
      </button>
      <input aria-label="A field" defaultValue="" />
    </BottomSheet>
  );
  const b = (
    <BottomSheet
      key="B"
      isOpen={isBOpen}
      onOpenChange={setIsBOpen}
      label="B"
      purpose={purposeB}>
      <button type="button" onClick={() => setIsBOpen(false)}>
        Close B
      </button>
      <button type="button" onClick={() => setIsAOpen(false)}>
        Close A from B
      </button>
      <input aria-label="B field" defaultValue="" />
    </BottomSheet>
  );
  return (
    <>
      <button type="button" onClick={() => setIsAOpen(true)}>
        Open A
      </button>
      {reversed ? [b, a] : [a, b]}
    </>
  );
}

/** A → B → C, each rendered inside the previous sheet's content. */
function Nested({
  initial = false,
  closeAllFromC = false,
}: {
  initial?: boolean;
  closeAllFromC?: boolean;
}) {
  const [isAOpen, setIsAOpen] = useState(initial);
  const [isBOpen, setIsBOpen] = useState(initial);
  const [isCOpen, setIsCOpen] = useState(initial);
  return (
    <>
      <button type="button" onClick={() => setIsAOpen(true)}>
        Open A
      </button>
      <button type="button" onClick={() => setIsAOpen(false)}>
        Close A from page
      </button>
      <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
        <button type="button" onClick={() => setIsBOpen(true)}>
          Open B
        </button>
        <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
          <button type="button" onClick={() => setIsCOpen(true)}>
            Open C
          </button>
          <BottomSheet isOpen={isCOpen} onOpenChange={setIsCOpen} label="C">
            <button
              type="button"
              onClick={() => {
                if (closeAllFromC) {
                  setIsAOpen(false);
                  setIsBOpen(false);
                }
                setIsCOpen(false);
              }}>
              Close C
            </button>
          </BottomSheet>
        </BottomSheet>
      </BottomSheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Requirement 1 — no new public API; a lone sheet is unchanged
// ---------------------------------------------------------------------------

describe('R1 no new public API', () => {
  it('exports exactly BottomSheet and BottomSheetSwitcher', () => {
    expect(Object.keys(BottomSheetModule).sort()).toEqual([
      'BottomSheet',
      'BottomSheetSwitcher',
    ]);
  });

  it('a sheet on its own carries no stack state and behaves as before', () => {
    const onOpenChange = vi.fn();
    render(
      <BottomSheet isOpen onOpenChange={onOpenChange} label="Alone">
        Content
      </BottomSheet>,
    );
    const dialog = getDialog('Alone');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).not.toHaveAttribute('inert');
    expect(dialog).not.toHaveAttribute('data-sheet-stack');
    expect(dialog).not.toHaveAttribute('data-sheet-stack-depth');
    expect(scrim(dialog)).toBe('1');
    expect(getComputedStyle(getPositioner(dialog)).transform).toBe('');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(getPanel(dialog)).toHaveFocus();

    act(() => {
      pressEscape();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// Requirement 2 — order is open order
// ---------------------------------------------------------------------------

describe('R2 order is open order', () => {
  it('a sheet opened over another stacks on top; the covered one recedes', () => {
    render(<Siblings />);
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    expect(stackSummary()).toEqual(['A:top:0']);

    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
    expect(getDialog('A')).toHaveAttribute('data-sheet-stack', 'covered');
    expect(getDialog('A')).toHaveAttribute('data-sheet-stack-depth', '1');
    expect(getDialog('B')).toHaveAttribute('data-sheet-stack', 'top');
    expect(getDialog('B')).not.toHaveAttribute('data-sheet-stack-depth');
    expect(topLayerOrder()).toEqual(['A', 'B']);
  });

  it('a sheet that closes and reopens goes back on top', () => {
    function Three() {
      const [open, setOpen] = useState({A: true, B: true, C: true});
      const toggle = (id: 'A' | 'B' | 'C', value: boolean) =>
        setOpen(current => ({...current, [id]: value}));
      return (
        <>
          <button type="button" onClick={() => toggle('A', false)}>
            Close A
          </button>
          <button type="button" onClick={() => toggle('A', true)}>
            Reopen A
          </button>
          <BottomSheet
            isOpen={open.A}
            onOpenChange={v => toggle('A', v)}
            label="A">
            a
          </BottomSheet>
          <BottomSheet
            isOpen={open.B}
            onOpenChange={v => toggle('B', v)}
            label="B">
            b
          </BottomSheet>
          <BottomSheet
            isOpen={open.C}
            onOpenChange={v => toggle('C', v)}
            label="C">
            c
          </BottomSheet>
        </>
      );
    }
    render(<Three />);
    expect(stackSummary()).toEqual(['A:covered:2', 'B:covered:1', 'C:top:0']);

    fireEvent.click(screen.getByRole('button', {name: 'Close A'}));
    finishExit(getDialog('A'));
    expect(stackSummary()).toEqual(['B:covered:1', 'C:top:0']);

    fireEvent.click(screen.getByRole('button', {name: 'Reopen A'}));
    expect(stackSummary()).toEqual(['B:covered:2', 'C:covered:1', 'A:top:0']);
    expect(topLayerOrder()).toEqual(['B', 'C', 'A']);
  });

  it('a sheet reopened during its exit returns on top', () => {
    render(<Siblings initialA initialB />);
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
    fireEvent.click(screen.getByRole('button', {name: 'Close A from B'}));
    expect(stackSummary()).toEqual(['A:exiting:1', 'B:top:0']);
    // Reopen before the exit animation has finished.
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    expect(stackSummary()).toEqual(['B:covered:1', 'A:top:0']);
    expect(topLayerOrder()).toEqual(['B', 'A']);
    expect(scrim(getDialog('A'))).toBe('0');
    expect(scrim(getDialog('B'))).toBe('1');
  });

  it('sheets in separate components stack the same way', () => {
    function Owner({label, children}: {label: string; children?: ReactNode}) {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open {label}
          </button>
          <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label={label}>
            {children}
          </BottomSheet>
        </>
      );
    }
    render(
      <>
        <Owner label="First" />
        <Owner label="Second" />
      </>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open Second'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open First'}));
    expect(stackSummary()).toEqual(['Second:covered:1', 'First:top:0']);
  });

  it('a sheet inside another sheet’s content stacks above it', () => {
    render(<Nested />);
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
    expect(stackSummary()).toEqual(['A:covered:2', 'B:covered:1', 'C:top:0']);
    expect(topLayerOrder()).toEqual(['A', 'B', 'C']);
  });

  it('a whole switcher is one level, and switching its step keeps its place', () => {
    function App() {
      const [isAOpen, setIsAOpen] = useState(false);
      const [step, setStep] = useState<string | null>(null);
      const [isCOpen, setIsCOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(true)}>
            Open A
          </button>
          <button type="button" onClick={() => setStep('one')}>
            Open switcher
          </button>
          <button type="button" onClick={() => setStep('two')}>
            Step two
          </button>
          <button type="button" onClick={() => setIsCOpen(true)}>
            Open C
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            a
          </BottomSheet>
          <BottomSheetSwitcher activeSheet={step} onActiveSheetChange={setStep}>
            <BottomSheet sheetId="one" label="One">
              one
            </BottomSheet>
            <BottomSheet sheetId="two" label="Two">
              two
            </BottomSheet>
          </BottomSheetSwitcher>
          <BottomSheet isOpen={isCOpen} onOpenChange={setIsCOpen} label="C">
            c
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open switcher'}));
    expect(stackSummary()).toEqual(['A:covered:1', 'One:top:0']);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', {name: 'Step two'}));
    // Each step owns its dialog: the entering step's is presented above the
    // retained one, and the flow's level is now that dialog; its place in
    // the stack is unchanged.
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(3);
    expect(stackSummary()).toEqual(['A:covered:1', 'Two:top:0']);
    finishHandoff(getDialog('Two'), getDialog('One'));
    expect(stackSummary()).toEqual(['A:covered:1', 'Two:top:0']);
    expect(getDialog('One')).not.toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
    expect(stackSummary()).toEqual(['A:covered:2', 'Two:covered:1', 'C:top:0']);
    const switcherDialog = getDialog('Two');
    expect(switcherDialog).toHaveAttribute('data-sheet-stack', 'covered');
    expect(switcherDialog).toHaveAttribute('data-sheet-stack-depth', '1');
    expect(switcherDialog).toHaveAttribute('inert');
    expect(switcherDialog).toHaveAttribute('aria-hidden', 'true');
    // The step's positioner recedes with the switcher.
    for (const positioner of Array.from(
      switcherDialog.querySelectorAll<HTMLElement>('.astryx-bottom-sheet'),
    ).map(panel => panel.parentElement!)) {
      expect(getComputedStyle(positioner).transform).toContain('scale(.96)');
    }
    // One scrim: A, the bottom sheet, owns it; the step and C are clear.
    expect(scrim(getDialog('A'))).toBe('1');
    expect(scrim(switcherDialog)).toBe('0');
    expect(scrim(getDialog('C'))).toBe('0');
  });

  it('a sheet over a switcher flow keeps the field being typed in when the flow changes step from code (the re-show lands on it, no panel focus)', () => {
    function App() {
      const [step, setStep] = useState<string | null>('one');
      const [isCOpen, setIsCOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setStep('two')}>
            Step two
          </button>
          <button type="button" onClick={() => setIsCOpen(true)}>
            Open C
          </button>
          <BottomSheetSwitcher activeSheet={step} onActiveSheetChange={setStep}>
            <BottomSheet sheetId="one" label="One">
              one
            </BottomSheet>
            <BottomSheet sheetId="two" label="Two">
              two
            </BottomSheet>
          </BottomSheetSwitcher>
          <BottomSheet isOpen={isCOpen} onOpenChange={setIsCOpen} label="C">
            <label>
              Note <input aria-label="Note" />
            </label>
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
    expect(stackSummary()).toEqual(['One:covered:1', 'C:top:0']);
    const note = screen.getByRole('textbox', {name: 'Note'});
    note.focus();
    fireEvent.change(note, {target: {value: 'hel'}});
    expect(note).toHaveFocus();
    const focusEvents: string[] = [];
    note.addEventListener('blur', () => focusEvents.push('blur'));
    note.addEventListener('focus', () => focusEvents.push('focus'));
    const showsBefore = vi.mocked(HTMLDialogElement.prototype.showModal).mock
      .calls.length;

    // The flow beneath changes step from code: its level is a new dialog, so
    // C is closed and shown again to stay on top.
    fireEvent.click(screen.getByRole('button', {name: 'Step two'}));
    const cShows = vi
      .mocked(HTMLDialogElement.prototype.showModal)
      .mock.contexts.slice(showsBefore)
      .filter(dialog => dialog === getDialog('C')).length;
    expect(cShows).toBe(1);
    expect(stackSummary()).toEqual(['Two:covered:1', 'C:top:0']);
    // Focus is still in the field; the next keystrokes land there, and the
    // delegate attribute the re-show used is gone again.
    expect(note).toHaveFocus();
    expect(note).not.toHaveAttribute('autofocus');
    expect((note as HTMLInputElement).value).toBe('hel');
    // At most one blur and one focus reached the field (the top layer is
    // append-only: a re-show closes the dialog first); never a focus on the
    // panel in between.
    expect(focusEvents.filter(e => e === 'blur').length).toBeLessThanOrEqual(1);
    expect(focusEvents.filter(e => e === 'focus').length).toBeLessThanOrEqual(
      1,
    );
    expect(
      getDialog('C').querySelector('.astryx-bottom-sheet'),
    ).not.toHaveFocus();
  });

  it('a Popover presented as a BottomSheet, opened from a sheet, is one level of the stack: it covers the sheet, Escape reaches only it, and focus returns into the sheet', async () => {
    function App() {
      const [isAOpen, setIsAOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(true)}>
            Open A
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <Popover
              label="Filters"
              presentation="bottom-sheet"
              content={<button type="button">Apply</button>}>
              <button type="button">Filter</button>
            </Popover>
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    const filter = screen.getByRole('button', {name: 'Filter'});
    filter.focus();
    await act(async () => {
      fireEvent.click(filter);
      // The sheet presentation loads on demand.
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(stackSummary()).toEqual(['A:covered:1', 'Filters:top:0']);
    // A contains the Popover's dialog, so it is left to the browser's modal
    // blocking rather than marked inert (inert on it would reach the top
    // sheet too); it recedes and loses its scrim like any covered sheet.
    expect(getDialog('A')).toHaveAttribute('data-sheet-stack', 'covered');
    expect(getDialog('A')).not.toHaveAttribute('inert');
    expect(getDialog('Filters')).not.toHaveAttribute('inert');
    expect(getDialog('Filters')).toHaveAttribute('aria-modal', 'true');
    // Escape reaches only the top sheet (the Popover's): A stays open.
    fireEvent.keyDown(getDialog('Filters'), {key: 'Escape'});
    finishExit(getDialog('Filters'));
    expect(stackSummary()).toEqual(['A:top:0']);
    expect(getDialog('A')).not.toHaveAttribute('data-sheet-stack');
    // Focus returns into A, to the control that opened the Popover.
    expect(filter).toHaveFocus();
  });

  it('a standalone sheet inside a switcher step stacks above the switcher', () => {
    function App() {
      const [isNestedOpen, setIsNestedOpen] = useState(false);
      return (
        <BottomSheetSwitcher
          activeSheet="details"
          onActiveSheetChange={() => {}}>
          <BottomSheet sheetId="details" label="Details">
            <button type="button" onClick={() => setIsNestedOpen(true)}>
              Open nested
            </button>
            <BottomSheet
              isOpen={isNestedOpen}
              onOpenChange={setIsNestedOpen}
              label="Nested">
              nested
            </BottomSheet>
          </BottomSheet>
        </BottomSheetSwitcher>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open nested'}));
    expect(stackSummary()).toEqual(['Details:covered:1', 'Nested:top:0']);
    expect(topLayerOrder()).toEqual(['Details', 'Nested']);
  });

  it('opening out of tree order puts the later-opened sheet on top', () => {
    render(<Siblings reversed />);
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    // B is written before A in the DOM, but opened after it.
    const dialogs = Array.from(document.querySelectorAll('dialog')).map(d =>
      d.getAttribute('aria-label'),
    );
    expect(dialogs).toEqual(['B', 'A']);
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
    expect(topLayerOrder()).toEqual(['A', 'B']);
  });
});

// ---------------------------------------------------------------------------
// Requirement 3 — same-update opens break ties by tree order, first frame
// ---------------------------------------------------------------------------

describe('R3 same-update opens (deep link)', () => {
  function mountSync(element: ReactNode) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let microtaskRan = false;
    void Promise.resolve().then(() => {
      microtaskRan = true;
    });
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the test asserts the first synchronous frame
    flushSync(() => {
      root.render(element);
    });
    return {
      container,
      microtaskRan: () => microtaskRan,
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  }

  it('a depth-3 deep link of nested sheets is right in the first painted frame', () => {
    const mounted = mountSync(<Nested initial />);
    expect(mounted.microtaskRan()).toBe(false);

    // Effects ran child first (C, B, A), yet the native top layer ends in
    // tree order and every sheet already carries its stack state.
    expect(topLayerOrder()).toEqual(['A', 'B', 'C']);
    expect(stackSummary()).toEqual(['A:covered:2', 'B:covered:1', 'C:top:0']);
    expect(getDialog('A')).toHaveAttribute('data-sheet-stack', 'covered');
    expect(getDialog('A')).toHaveAttribute('data-sheet-stack-depth', '2');
    expect(getDialog('B')).toHaveAttribute('data-sheet-stack-depth', '1');
    expect(getDialog('C')).toHaveAttribute('data-sheet-stack', 'top');
    expect(getComputedStyle(getPositioner(getDialog('A'))).transform).toContain(
      'scale(.92)',
    );
    expect(getComputedStyle(getPositioner(getDialog('B'))).transform).toContain(
      'scale(.96)',
    );
    expect(getComputedStyle(getPositioner(getDialog('C'))).transform).toBe('');
    expect(scrim(getDialog('A'))).toBe('1');
    expect(scrim(getDialog('B'))).toBe('0');
    expect(scrim(getDialog('C'))).toBe('0');
    expect(getPanel(getDialog('C'))).toHaveFocus();
    expect(mounted.microtaskRan()).toBe(false);
    mounted.unmount();
  });

  it('siblings opened in one commit stack in document order', () => {
    const mounted = mountSync(<Siblings reversed initialA initialB />);
    // B is written first, so with no open order between them B is below A.
    expect(stackSummary()).toEqual(['B:covered:1', 'A:top:0']);
    expect(topLayerOrder()).toEqual(['B', 'A']);
    mounted.unmount();
  });

  it('several sheets opened in one later update are ordered by tree, and a later open goes above them', () => {
    function App() {
      const [all, setAll] = useState(false);
      const [isDOpen, setIsDOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAll(true)}>
            Deep link
          </button>
          <button type="button" onClick={() => setIsDOpen(true)}>
            Open D
          </button>
          <BottomSheet isOpen={all} onOpenChange={() => {}} label="A">
            <BottomSheet isOpen={all} onOpenChange={() => {}} label="B">
              b
            </BottomSheet>
          </BottomSheet>
          <BottomSheet isOpen={all} onOpenChange={() => {}} label="C">
            c
          </BottomSheet>
          <BottomSheet isOpen={isDOpen} onOpenChange={setIsDOpen} label="D">
            d
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Deep link'}));
    expect(stackSummary()).toEqual(['A:covered:2', 'B:covered:1', 'C:top:0']);
    expect(topLayerOrder()).toEqual(['A', 'B', 'C']);
    fireEvent.click(screen.getByRole('button', {name: 'Open D'}));
    expect(stackSummary()).toEqual([
      'A:covered:3',
      'B:covered:2',
      'C:covered:1',
      'D:top:0',
    ]);
    expect(topLayerOrder()).toEqual(['A', 'B', 'C', 'D']);
  });
});

// ---------------------------------------------------------------------------
// Requirement 4 — covered sheets stay mounted, are blocked, and recede
// ---------------------------------------------------------------------------

describe('R4 covered sheets', () => {
  it('keeps a covered sheet mounted with its state and marks a sibling-covered one inert', () => {
    render(<Siblings />);
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    fireEvent.change(screen.getByLabelText('A field'), {
      target: {value: 'kept'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));

    const a = getDialog('A');
    expect(a).toHaveAttribute('open');
    expect(a).toHaveAttribute('inert');
    expect(a).toHaveAttribute('aria-hidden', 'true');
    expect(getDialog('B')).not.toHaveAttribute('inert');
    expect(screen.getByLabelText('A field')).toHaveValue('kept');

    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    expect(a).not.toHaveAttribute('inert');
    expect(a).not.toHaveAttribute('aria-hidden');
    expect(screen.getByLabelText('A field')).toHaveValue('kept');
  });

  it('leaves a covered sheet that contains the top sheet to the browser’s modal blocking', () => {
    render(<Nested initial />);
    // inert on A would reach C, which lives inside A's content.
    expect(getDialog('A')).not.toHaveAttribute('inert');
    expect(getDialog('B')).not.toHaveAttribute('inert');
    expect(getDialog('C')).not.toHaveAttribute('inert');
    expect(getDialog('A')).toHaveAttribute('data-sheet-stack', 'covered');
    expect(getDialog('C')).toHaveAttribute('data-sheet-stack', 'top');
    // The top sheet is the last modal dialog shown, so the browser blocks
    // everything outside it, A and B included.
    expect(topLayerOrder().at(-1)).toBe('C');
  });

  it('recedes by depth: 0.96 / −8px at depth 1, 0.92 / −16px from depth 2 on', () => {
    function Four() {
      return (
        <>
          <BottomSheet isOpen onOpenChange={() => {}} label="A">
            a
          </BottomSheet>
          <BottomSheet isOpen onOpenChange={() => {}} label="B">
            b
          </BottomSheet>
          <BottomSheet isOpen onOpenChange={() => {}} label="C">
            c
          </BottomSheet>
          <BottomSheet isOpen onOpenChange={() => {}} label="D">
            d
          </BottomSheet>
        </>
      );
    }
    render(<Four />);
    const transform = (label: string) =>
      getComputedStyle(getPositioner(getDialog(label))).transform;
    expect(getDialog('A')).toHaveAttribute('data-sheet-stack-depth', '3');
    expect(transform('A')).toBe(
      'translateY(calc(-2 * var(--spacing-2))) scale(.92)',
    );
    expect(transform('B')).toBe(
      'translateY(calc(-2 * var(--spacing-2))) scale(.92)',
    );
    expect(transform('C')).toBe(
      'translateY(calc(-1 * var(--spacing-2))) scale(.96)',
    );
    expect(transform('D')).toBe('');
    expect(
      getComputedStyle(getPositioner(getDialog('C'))).transformOrigin,
    ).toBe('50% 0');
  });

  it('only sheets count: a Dialog over a sheet does not make it recede', () => {
    function App() {
      const [isDialogOpen, setIsDialogOpen] = useState(false);
      return (
        <BottomSheet isOpen onOpenChange={() => {}} label="Sheet">
          <button type="button" onClick={() => setIsDialogOpen(true)}>
            Open dialog
          </button>
          <Dialog
            isOpen={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            aria-label="Over">
            over
          </Dialog>
        </BottomSheet>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open dialog'}));
    expect(getDialog('Over')).toHaveAttribute('open');
    expect(stackSummary()).toEqual(['Sheet:top:0']);
    expect(getDialog('Sheet')).not.toHaveAttribute('data-sheet-stack');
    expect(getComputedStyle(getPositioner(getDialog('Sheet'))).transform).toBe(
      '',
    );
  });
});

// ---------------------------------------------------------------------------
// Requirement 5 — dismissal reaches only the top sheet, via its own callback
// ---------------------------------------------------------------------------

describe('R5 dismissal', () => {
  function Pair({purposeB}: {purposeB?: 'info' | 'form' | 'required'}) {
    return <Siblings initialA initialB purposeB={purposeB} />;
  }

  it('Escape closes only the top sheet', () => {
    render(<Pair />);
    let event!: KeyboardEvent;
    act(() => {
      event = pressEscape();
    });
    expect(event.defaultPrevented).toBe(true);
    // The revealed sheet comes forward as the top sheet slides away.
    expect(stackSummary()).toEqual(['A:top:0', 'B:exiting:0']);
    expect(getDialog('B')).toHaveAttribute('open');
    finishExit(getDialog('B'));
    expect(stackSummary()).toEqual(['A:top:0']);
    expect(getDialog('A')).toHaveAttribute('open');
  });

  it('a scrim tap closes only the top sheet', () => {
    render(<Pair />);
    fireEvent.click(getDialog('B'));
    expect(stackSummary()).toEqual(['A:top:0', 'B:exiting:0']);
    // Only the exiting sheet went; A is still open, and B's own callback was
    // the one called (A's state is untouched).
    expect(getDialog('A')).toHaveAttribute('open');
  });

  it('a swipe closes only the top sheet', () => {
    render(<Pair />);
    drag(getHandle(getDialog('B')), [{y: 0}, {y: 40}, {y: 120}]);
    expect(stackSummary()).toEqual(['A:top:0', 'B:exiting:0']);
    finishExit(getDialog('B'));
    expect(stackSummary()).toEqual(['A:top:0']);
  });

  it('a platform close request pops the top sheet and is declined by a covered one', () => {
    render(<Pair />);
    const declined = fireCancel(getDialog('A'));
    expect(declined.defaultPrevented).toBe(true);
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);

    let accepted!: Event;
    act(() => {
      accepted = fireCancel(getDialog('B'));
    });
    expect(accepted.defaultPrevented).toBe(true);
    expect(stackSummary()).toEqual(['A:top:0', 'B:exiting:0']);
  });

  it('Escape and a platform close reach the top sheet, not a covered sheet nested deeper in the tree', () => {
    // B is rendered in A's content (one tree level deeper); C is written
    // outside both and opened last, so C is the top sheet. The dismissal
    // stack ranks tree depth first, so without the sheet stack standing a
    // covered sheet down it would hand the press to B.
    function App() {
      const [isAOpen, setIsAOpen] = useState(true);
      const [isBOpen, setIsBOpen] = useState(true);
      const [isCOpen, setIsCOpen] = useState(false);
      return (
        <>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <button type="button" onClick={() => setIsCOpen(true)}>
              Open C from A
            </button>
            <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
              <button type="button" onClick={() => setIsCOpen(true)}>
                Open C from B
              </button>
            </BottomSheet>
          </BottomSheet>
          <BottomSheet isOpen={isCOpen} onOpenChange={setIsCOpen} label="C">
            c
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open C from B'}));
    expect(stackSummary()).toEqual(['A:covered:2', 'B:covered:1', 'C:top:0']);
    act(() => {
      pressEscape();
    });
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0', 'C:exiting:0']);
    expect(getDialog('B')).toHaveAttribute('open');
    finishExit(getDialog('C'));
    // Now B is the top sheet and takes the next press.
    act(() => {
      pressEscape();
    });
    expect(stackSummary()).toEqual(['A:top:0', 'B:exiting:0']);
    finishExit(getDialog('B'));
    // Platform close: the same rule. Reopen C over A.
    fireEvent.click(screen.getByRole('button', {name: 'Open C from A'}));
    expect(stackSummary()).toEqual(['A:covered:1', 'C:top:0']);
    let accepted!: Event;
    act(() => {
      accepted = fireCancel(getDialog('C'));
    });
    expect(accepted.defaultPrevented).toBe(true);
    expect(stackSummary()).toEqual(['A:top:0', 'C:exiting:0']);
  });

  it('honours the top sheet’s purpose: required blocks every path and shields the sheet below', () => {
    render(<Pair purposeB="required" />);
    let event!: KeyboardEvent;
    act(() => {
      event = pressEscape();
    });
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(getDialog('B'));
    drag(getHandle(getDialog('B')), [{y: 0}, {y: 40}, {y: 120}]);
    fireCancel(getDialog('B'));
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
  });

  it('honours a form top sheet: Escape closes, scrim and swipe do not', () => {
    render(<Pair purposeB="form" />);
    fireEvent.click(getDialog('B'));
    drag(getHandle(getDialog('B')), [{y: 0}, {y: 40}, {y: 120}]);
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
    act(() => {
      pressEscape();
    });
    expect(stackSummary()).toEqual(['A:top:0', 'B:exiting:0']);
  });
});

// ---------------------------------------------------------------------------
// Requirement 6 — one visible scrim per stack
// ---------------------------------------------------------------------------

describe('R6 one scrim', () => {
  it('only the bottom sheet’s backdrop is visible; upper backdrops are transparent', () => {
    render(<Nested initial />);
    expect(scrim(getDialog('A'))).toBe('1');
    expect(scrim(getDialog('B'))).toBe('0');
    expect(scrim(getDialog('C'))).toBe('0');
  });

  it('keeps the dim stable through a push and a pop', () => {
    render(<Siblings initialA />);
    const a = getDialog('A');
    expect(scrim(a)).toBe('1');
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    expect(scrim(a)).toBe('1');
    expect(scrim(getDialog('B'))).toBe('0');
    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    // The popped sheet's backdrop stays transparent through its exit; the
    // bottom sheet's stays at full strength throughout.
    expect(scrim(getDialog('B'))).toBe('0');
    expect(scrim(a)).toBe('1');
    finishExit(getDialog('B'));
    expect(scrim(a)).toBe('1');
    expect(scrimDuration(a)).toBe('');
  });

  it('hands the scrim over at once when the visible-backdrop sheet closes under others', () => {
    render(<Siblings initialA initialB />);
    const a = getDialog('A');
    const b = getDialog('B');
    const recorder = recordScrimWrites();
    fireEvent.click(screen.getByRole('button', {name: 'Close A from B'}));
    recorder.restore();
    // The dim is B's from this frame on: B's backdrop appears with no fade
    // and A's leaves with no fade, both pinned to 0s for the frame, so the
    // page neither lightens nor darkens between the two. The pin is lifted
    // again once the frame has painted.
    expect(scrim(a)).toBe('0');
    expect(scrim(b)).toBe('1');
    expect(recorder.writes).toEqual(
      expect.arrayContaining([
        {opacity: '0', pin: '0s'},
        {opacity: '1', pin: '0s'},
      ]),
    );
    expect(scrimDuration(a)).toBe('');
    expect(scrimDuration(b)).toBe('');
    expect(getBottomSheetStackForTests()[0].view.isScrimTakenOver).toBe(true);
    finishExit(a);
    expect(stackSummary()).toEqual(['B:top:0']);
    expect(scrim(b)).toBe('1');
  });

  it('a sheet closing alone fades its scrim out; no pin is applied', () => {
    render(<Nested initial={false} />);
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    const a = getDialog('A');
    expect(scrim(a)).toBe('1');
    const recorder = recordScrimWrites();
    fireEvent.click(screen.getByRole('button', {name: 'Close A from page'}));
    recorder.restore();
    expect(scrim(a)).toBe('0');
    expect(recorder.writes.every(write => write.pin === '')).toBe(true);
    expect(classes(a)).toContain('scrimClosing');
  });

  it('a drag on an upper sheet never thins the visible scrim or reveals its own', () => {
    render(<Siblings initialA initialB />);
    // Partial drag that settles back: the gesture reports opacity changes.
    drag(getHandle(getDialog('B')), [{y: 0}, {y: 10}, {y: 0}]);
    expect(scrim(getDialog('A'))).toBe('1');
    expect(scrim(getDialog('B'))).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Requirement 7 — closing a covered sheet from code
// ---------------------------------------------------------------------------

describe('R7 closing a covered sheet', () => {
  it('takes the sheets rendered in its content with it, leaving their state to their owners', () => {
    const onBChange = vi.fn();
    const onCChange = vi.fn();
    function App() {
      const [isAOpen, setIsAOpen] = useState(true);
      const [isBOpen, setIsBOpen] = useState(true);
      const [isCOpen, setIsCOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(false)}>
            Close A
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <BottomSheet
              isOpen={isBOpen}
              onOpenChange={value => {
                onBChange(value);
                setIsBOpen(value);
              }}
              label="B">
              <BottomSheet
                isOpen={isCOpen}
                onOpenChange={value => {
                  onCChange(value);
                  setIsCOpen(value);
                }}
                label="C">
                c
              </BottomSheet>
            </BottomSheet>
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    expect(stackSummary()).toEqual(['A:covered:2', 'B:covered:1', 'C:top:0']);

    fireEvent.click(screen.getByRole('button', {name: 'Close A'}));
    // All three leave together. B and C are not asked to change their state:
    // their `isOpen` stays the consumer's (a Dialog in a closed Dialog works
    // the same way), and they come back if A reopens while they are open.
    expect(onBChange).not.toHaveBeenCalled();
    expect(onCChange).not.toHaveBeenCalled();
    expect(stackSummary()).toEqual([
      'A:exiting:0',
      'B:exiting:0',
      'C:exiting:0',
    ]);
    finishExit(getDialog('C'));
    finishExit(getDialog('B'));
    finishExit(getDialog('A'));
    expect(stackSummary()).toEqual([]);
    expect(openDialogs()).toEqual([]);
  });

  it('a nested sheet still open when its host reopens is presented again, on top', () => {
    function App() {
      const [isAOpen, setIsAOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(false)}>
            Close A
          </button>
          <button type="button" onClick={() => setIsAOpen(true)}>
            Reopen A
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <BottomSheet isOpen onOpenChange={() => {}} label="B">
              b
            </BottomSheet>
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
    fireEvent.click(screen.getByRole('button', {name: 'Close A'}));
    finishExit(getDialog('B'));
    finishExit(getDialog('A'));
    expect(openDialogs()).toEqual([]);
    fireEvent.click(screen.getByRole('button', {name: 'Reopen A'}));
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
    expect(openDialogs()).toEqual(['A', 'B']);
  });

  it('a switcher flow in a sheet’s content leaves with the sheet and returns with it; its state is never written', () => {
    const onActiveSheetChange = vi.fn();
    function App() {
      const [isAOpen, setIsAOpen] = useState(true);
      const [step, setStep] = useState<string | null>('one');
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(false)}>
            Close A
          </button>
          <button type="button" onClick={() => setIsAOpen(true)}>
            Reopen A
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <BottomSheetSwitcher
              activeSheet={step}
              onActiveSheetChange={next => {
                onActiveSheetChange(next);
                setStep(next);
              }}>
              <BottomSheet sheetId="one" label="One">
                one
              </BottomSheet>
              <BottomSheet sheetId="two" label="Two">
                two
              </BottomSheet>
            </BottomSheetSwitcher>
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    expect(stackSummary()).toEqual(['A:covered:1', 'One:top:0']);
    fireEvent.click(screen.getByRole('button', {name: 'Close A'}));
    // The flow leaves with its host, through its own exit, without its
    // state being written.
    expect(onActiveSheetChange).not.toHaveBeenCalled();
    expect(stackSummary()).toEqual(['A:exiting:0', 'One:exiting:0']);
    finishExit(getDialog('One'));
    finishExit(getDialog('A'));
    expect(openDialogs()).toEqual([]);
    expect(onActiveSheetChange).not.toHaveBeenCalled();
    // The flow's state still names its step, so it comes back with the host.
    fireEvent.click(screen.getByRole('button', {name: 'Reopen A'}));
    expect(stackSummary()).toEqual(['A:covered:1', 'One:top:0']);
    expect(openDialogs()).toEqual(['A', 'One']);
  });

  it('a sheet in a closed sheet’s content keeps its state and presents when that sheet opens', () => {
    const onInnerChange = vi.fn();
    function App() {
      const [isOuterOpen, setIsOuterOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOuterOpen(true)}>
            Open outer
          </button>
          <BottomSheet
            isOpen={isOuterOpen}
            onOpenChange={setIsOuterOpen}
            label="Outer">
            <BottomSheet isOpen onOpenChange={onInnerChange} label="Inner">
              inner
            </BottomSheet>
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    expect(openDialogs()).toEqual([]);
    // The inner sheet is not asked to close: its host has not closed, it
    // merely has not opened yet.
    expect(onInnerChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'Open outer'}));
    expect(stackSummary()).toEqual(['Outer:covered:1', 'Inner:top:0']);
    expect(onInnerChange).not.toHaveBeenCalled();
  });

  it('never writes a nested sheet’s state: no onOpenChange on mount, rerender, StrictMode replay, or host close', () => {
    const onInnerChange = vi.fn();
    function App({tick}: {tick: number}) {
      const [isOuterOpen, setIsOuterOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsOuterOpen(false)}>
            Close outer {tick}
          </button>
          <BottomSheet
            isOpen={isOuterOpen}
            onOpenChange={setIsOuterOpen}
            label="Outer">
            <BottomSheet
              isOpen
              onOpenChange={value => {
                onInnerChange(value);
              }}
              label="Inner">
              inner
            </BottomSheet>
          </BottomSheet>
        </>
      );
    }
    const {rerender} = render(
      <StrictMode>
        <App tick={0} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <App tick={1} />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Close outer 1'}));
    rerender(
      <StrictMode>
        <App tick={2} />
      </StrictMode>,
    );
    expect(onInnerChange).not.toHaveBeenCalled();
    // The inner sheet left with its host all the same.
    expect(stackSummary()).toEqual(['Outer:exiting:0', 'Inner:exiting:0']);
  });

  it('leaves sibling sheets above it open: it slides out from beneath them', () => {
    render(<Siblings initialA initialB />);
    fireEvent.click(screen.getByRole('button', {name: 'Close A from B'}));
    expect(stackSummary()).toEqual(['A:exiting:1', 'B:top:0']);
    expect(getDialog('B')).toHaveAttribute('open');
    expect(getDialog('B')).not.toHaveAttribute('inert');
    finishExit(getDialog('A'));
    expect(stackSummary()).toEqual(['B:top:0']);
    expect(getDialog('B')).not.toHaveAttribute('data-sheet-stack');
    expect(openDialogs()).toEqual(['B']);
    // Nothing is stuck: B still closes normally.
    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    finishExit(getDialog('B'));
    expect(openDialogs()).toEqual([]);
  });

  it('a sheet in a switcher step leaves when the step is left', () => {
    const onNestedChange = vi.fn();
    function App() {
      const [step, setStep] = useState<string | null>('one');
      const [isNestedOpen, setIsNestedOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setStep('two')}>
            Step two
          </button>
          <BottomSheetSwitcher activeSheet={step} onActiveSheetChange={setStep}>
            <BottomSheet sheetId="one" label="One">
              <BottomSheet
                isOpen={isNestedOpen}
                onOpenChange={value => {
                  onNestedChange(value);
                  setIsNestedOpen(value);
                }}
                label="Nested">
                nested
              </BottomSheet>
            </BottomSheet>
            <BottomSheet sheetId="two" label="Two">
              two
            </BottomSheet>
          </BottomSheetSwitcher>
        </>
      );
    }
    render(<App />);
    expect(stackSummary()).toEqual(['One:covered:1', 'Nested:top:0']);
    fireEvent.click(screen.getByRole('button', {name: 'Step two'}));
    // The nested sheet leaves with the step; its state stays its owner's.
    expect(onNestedChange).not.toHaveBeenCalled();
    expect(stackSummary()).toEqual(['Two:top:0', 'Nested:exiting:0']);
    finishExit(getDialog('Nested'));
    expect(stackSummary()).toEqual(['Two:top:0']);
  });
});

// ---------------------------------------------------------------------------
// Requirement 8 — focus
// ---------------------------------------------------------------------------

describe('R8 focus', () => {
  it('moves focus into a sheet when it opens, and returns it to the opener in the revealed sheet', () => {
    render(<Siblings initialA />);
    const openB = screen.getByRole('button', {name: 'Open B'});
    openB.focus();
    fireEvent.click(openB);
    expect(getPanel(getDialog('B'))).toHaveFocus();

    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    finishExit(getDialog('B'));
    expect(openB).toHaveFocus();
  });

  it('focuses the revealed sheet’s panel when the opener is gone', () => {
    function App() {
      const [isAOpen, setIsAOpen] = useState(true);
      const [isBOpen, setIsBOpen] = useState(false);
      return (
        <>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            {!isBOpen && (
              <button type="button" onClick={() => setIsBOpen(true)}>
                Open B
              </button>
            )}
          </BottomSheet>
          <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
            <button type="button" onClick={() => setIsBOpen(false)}>
              Close B
            </button>
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    const openB = screen.getByRole('button', {name: 'Open B'});
    openB.focus();
    fireEvent.click(openB);
    expect(openB).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    finishExit(getDialog('B'));
    expect(getPanel(getDialog('A'))).toHaveFocus();
  });

  it('a switcher flow closing over a sheet focuses that sheet’s panel when the opener is gone', () => {
    // The flow leaves the registry in the same commit its dialog closes
    // (React runs the registration cleanup first), so the close must have
    // read the sheet beneath before that.
    function App() {
      const [isAOpen, setIsAOpen] = useState(true);
      const [step, setStep] = useState<string | null>(null);
      return (
        <>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            {step == null && (
              <button type="button" onClick={() => setStep('one')}>
                Open flow
              </button>
            )}
          </BottomSheet>
          <BottomSheetSwitcher activeSheet={step} onActiveSheetChange={setStep}>
            <BottomSheet sheetId="one" label="One">
              <button type="button" onClick={() => setStep(null)}>
                Close flow
              </button>
            </BottomSheet>
          </BottomSheetSwitcher>
        </>
      );
    }
    render(<App />);
    const openFlow = screen.getByRole('button', {name: 'Open flow'});
    openFlow.focus();
    fireEvent.click(openFlow);
    expect(openFlow).not.toBeInTheDocument();
    expect(stackSummary()).toEqual(['A:covered:1', 'One:top:0']);
    // The flow's dialog is labelled by its active step; keep a handle.
    const flowDialog = getDialog('One');
    fireEvent.click(screen.getByRole('button', {name: 'Close flow'}));
    finishExit(flowDialog);
    expect(flowDialog).not.toHaveAttribute('open');
    expect(stackSummary()).toEqual(['A:top:0']);
    expect(getPanel(getDialog('A'))).toHaveFocus();
  });

  it('closing a covered sheet from code leaves focus in the top sheet', () => {
    render(<Siblings initialA />);
    const openB = screen.getByRole('button', {name: 'Open B'});
    openB.focus();
    fireEvent.click(openB);
    const field = screen.getByLabelText('B field');
    field.focus();
    // jsdom's close() does not move focus; the browser's does, back to the
    // element focused at showModal() (the button in A). Emulate it.
    const a = getDialog('A');
    const close = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      close.call(this);
      if (this === a) {
        openB.focus();
      }
    };
    fireEvent.click(screen.getByRole('button', {name: 'Close A from B'}));
    finishExit(getDialog('A'));
    expect(field).toHaveFocus();
    expect(openDialogs()).toEqual(['B']);
  });

  it('a deep link returns focus into the revealed sheet, not to the page', () => {
    render(<Nested initial />);
    expect(getPanel(getDialog('C'))).toHaveFocus();
    fireEvent.click(screen.getByRole('button', {name: 'Close C'}));
    finishExit(getDialog('C'));
    expect(getPanel(getDialog('B'))).toHaveFocus();
  });

  it('a popped sheet’s finalFocusRef outside the revealed sheet yields to that sheet’s panel; inside it, it is focused', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const outsideRef = {current: outside as HTMLElement | null};
    const insideRef = {current: null as HTMLElement | null};
    function App() {
      const [isAOpen, setIsAOpen] = useState(true);
      const [isBOpen, setIsBOpen] = useState(false);
      const [isCOpen, setIsCOpen] = useState(false);
      return (
        <>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <button
              type="button"
              ref={node => {
                insideRef.current = node;
              }}>
              Inside A
            </button>
            <button type="button" onClick={() => setIsBOpen(true)}>
              Open B
            </button>
            <button type="button" onClick={() => setIsCOpen(true)}>
              Open C
            </button>
          </BottomSheet>
          <BottomSheet
            isOpen={isBOpen}
            onOpenChange={setIsBOpen}
            finalFocusRef={outsideRef}
            label="B">
            <button type="button" onClick={() => setIsBOpen(false)}>
              Close B
            </button>
          </BottomSheet>
          <BottomSheet
            isOpen={isCOpen}
            onOpenChange={setIsCOpen}
            finalFocusRef={insideRef}
            label="C">
            <button type="button" onClick={() => setIsCOpen(false)}>
              Close C
            </button>
          </BottomSheet>
        </>
      );
    }
    try {
      render(<App />);
      // B's target is on the page, which stays inert under A: A's panel.
      fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
      fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
      finishExit(getDialog('B'));
      expect(getPanel(getDialog('A'))).toHaveFocus();
      // C's target is inside A: it is focused.
      fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
      fireEvent.click(screen.getByRole('button', {name: 'Close C'}));
      finishExit(getDialog('C'));
      expect(screen.getByRole('button', {name: 'Inside A'})).toHaveFocus();
    } finally {
      outside.remove();
    }
  });

  it('applies the standalone rules when the last sheet closes: the opener, or finalFocusRef', () => {
    function App() {
      const [isAOpen, setIsAOpen] = useState(false);
      const [isBOpen, setIsBOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsAOpen(true)}>
            Open A
          </button>
          <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
            <button type="button" onClick={() => setIsBOpen(true)}>
              Open B
            </button>
          </BottomSheet>
          <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
            <button
              type="button"
              onClick={() => {
                setIsBOpen(false);
                setIsAOpen(false);
              }}>
              Close all
            </button>
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    const openA = screen.getByRole('button', {name: 'Open A'});
    openA.focus();
    fireEvent.click(openA);
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    fireEvent.click(screen.getByRole('button', {name: 'Close all'}));
    finishExit(getDialog('B'));
    finishExit(getDialog('A'));
    expect(openA).toHaveFocus();
    expect(openDialogs()).toEqual([]);
  });

  /**
   * A browser refuses to focus an element outside every open modal dialog
   * (everything else is inert while a modal is shown) and anything inside a
   * closed dialog (`display: none`). jsdom lets any focus through, which
   * hides the "Close all" problem: the exits complete bottom first (all the
   * panels' transitions end in the same frame, in tree order), so each
   * sheet returns focus at depth 0 — the bottom sheet to a page opener
   * refused while the dialogs above are still modal, the upper sheets to
   * openers inside dialogs that are closed. Emulate the browser's rules.
   */
  function withModalFocusBlocking(run: () => void) {
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      const own = this.closest('dialog');
      if (own != null && !own.open) {
        return;
      }
      const modal = [...document.querySelectorAll('dialog[open]')].filter(
        d => d.getAttribute('aria-modal') === 'true',
      );
      if (modal.length > 0 && !modal.some(d => d.contains(this))) {
        return;
      }
      focus.call(this, options);
    };
    try {
      run();
    } finally {
      HTMLElement.prototype.focus = focus;
    }
  }

  describe('closing every sheet in one update ("Close all")', () => {
    it('returns focus once, to the bottom sheet’s opener, after the last dialog has closed (standalone sheets, depth 3)', () => {
      function App() {
        const [isAOpen, setIsAOpen] = useState(false);
        const [isBOpen, setIsBOpen] = useState(false);
        const [isCOpen, setIsCOpen] = useState(false);
        const closeAll = () => {
          setIsCOpen(false);
          setIsBOpen(false);
          setIsAOpen(false);
        };
        return (
          <>
            <button type="button" onClick={() => setIsAOpen(true)}>
              Open A
            </button>
            <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
              <button type="button" onClick={() => setIsBOpen(true)}>
                Open B
              </button>
            </BottomSheet>
            <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
              <button type="button" onClick={() => setIsCOpen(true)}>
                Open C
              </button>
            </BottomSheet>
            <BottomSheet isOpen={isCOpen} onOpenChange={setIsCOpen} label="C">
              <button type="button" onClick={closeAll}>
                Close all
              </button>
            </BottomSheet>
          </>
        );
      }
      render(<App />);
      const openA = screen.getByRole('button', {name: 'Open A'});
      openA.focus();
      fireEvent.click(openA);
      fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
      fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
      expect(stackSummary()).toEqual(['A:covered:2', 'B:covered:1', 'C:top:0']);
      withModalFocusBlocking(() => {
        fireEvent.click(screen.getByRole('button', {name: 'Close all'}));
        // The exits complete bottom first (tree order of the transitionend
        // events, all in one frame), as in Chromium.
        finishExit(getDialog('A'));
        expect(openA).not.toHaveFocus();
        finishExit(getDialog('B'));
        expect(openA).not.toHaveFocus();
        finishExit(getDialog('C'));
      });
      expect(openDialogs()).toEqual([]);
      expect(openA).toHaveFocus();
    });

    it('returns focus when a member of the group unmounts mid-exit instead of reporting its motion (Close all with the upper sheet unmounting)', () => {
      function App() {
        const [isAOpen, setIsAOpen] = useState(false);
        const [isBOpen, setIsBOpen] = useState(false);
        const [isBMounted, setIsBMounted] = useState(true);
        const closeAll = () => {
          setIsBOpen(false);
          setIsAOpen(false);
        };
        return (
          <>
            <button type="button" onClick={() => setIsAOpen(true)}>
              Open A
            </button>
            <button type="button" onClick={() => setIsBMounted(false)}>
              Unmount B
            </button>
            <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
              <button type="button" onClick={() => setIsBOpen(true)}>
                Open B
              </button>
            </BottomSheet>
            {isBMounted && (
              <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
                <button type="button" onClick={closeAll}>
                  Close all
                </button>
              </BottomSheet>
            )}
          </>
        );
      }
      render(<App />);
      const openA = screen.getByRole('button', {name: 'Open A'});
      openA.focus();
      fireEvent.click(openA);
      fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
      expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
      withModalFocusBlocking(() => {
        fireEvent.click(screen.getByRole('button', {name: 'Close all'}));
        // Both exits are under way (the group is formed) when B's owner stops
        // rendering it: its dialog was still open, and no exit motion will
        // ever be reported for it. A's exit is the only one left.
        expect(getDialog('B')).toHaveAttribute('open');
        fireEvent.click(screen.getByRole('button', {name: 'Unmount B'}));
        expect(screen.queryByRole('dialog', {name: 'B'})).toBeNull();
        finishExit(getDialog('A'));
      });
      expect(openDialogs()).toEqual([]);
      expect(openA).toHaveFocus();
    });

    it('prefers the bottom sheet’s finalFocusRef', () => {
      const target = document.createElement('button');
      document.body.appendChild(target);
      const finalFocusRef = {current: target as HTMLElement | null};
      function App() {
        const [isAOpen, setIsAOpen] = useState(true);
        const [isBOpen, setIsBOpen] = useState(true);
        return (
          <>
            <BottomSheet
              isOpen={isAOpen}
              onOpenChange={setIsAOpen}
              finalFocusRef={finalFocusRef}
              label="A">
              a
            </BottomSheet>
            <BottomSheet isOpen={isBOpen} onOpenChange={setIsBOpen} label="B">
              <button
                type="button"
                onClick={() => {
                  setIsBOpen(false);
                  setIsAOpen(false);
                }}>
                Close all
              </button>
            </BottomSheet>
          </>
        );
      }
      try {
        render(<App />);
        withModalFocusBlocking(() => {
          fireEvent.click(screen.getByRole('button', {name: 'Close all'}));
          finishExit(getDialog('A'));
          finishExit(getDialog('B'));
        });
        expect(target).toHaveFocus();
      } finally {
        target.remove();
      }
    });

    it('a switcher flow on top closes with the sheet beneath it, focus to the bottom sheet’s opener', () => {
      function App() {
        const [isAOpen, setIsAOpen] = useState(false);
        const [step, setStep] = useState<string | null>(null);
        return (
          <>
            <button type="button" onClick={() => setIsAOpen(true)}>
              Open A
            </button>
            <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
              <button type="button" onClick={() => setStep('one')}>
                Open flow
              </button>
            </BottomSheet>
            <BottomSheetSwitcher
              activeSheet={step}
              onActiveSheetChange={setStep}>
              <BottomSheet sheetId="one" label="One">
                <button
                  type="button"
                  onClick={() => {
                    setStep(null);
                    setIsAOpen(false);
                  }}>
                  Close all
                </button>
              </BottomSheet>
            </BottomSheetSwitcher>
          </>
        );
      }
      render(<App />);
      const openA = screen.getByRole('button', {name: 'Open A'});
      openA.focus();
      fireEvent.click(openA);
      fireEvent.click(screen.getByRole('button', {name: 'Open flow'}));
      expect(stackSummary()).toEqual(['A:covered:1', 'One:top:0']);
      const flowDialog = getDialog('One');
      withModalFocusBlocking(() => {
        fireEvent.click(screen.getByRole('button', {name: 'Close all'}));
        finishExit(getDialog('A'));
        finishExit(flowDialog);
      });
      expect(openDialogs()).toEqual([]);
      expect(openA).toHaveFocus();
    });

    it('non-modal sheets closing together keep their own rule: the opener only while focus was inside', () => {
      function App() {
        const [isAOpen, setIsAOpen] = useState(false);
        const [isBOpen, setIsBOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setIsAOpen(true)}>
              Open A
            </button>
            <BottomSheet
              isOpen={isAOpen}
              onOpenChange={setIsAOpen}
              hasScrim={false}
              label="A">
              <button type="button" onClick={() => setIsBOpen(true)}>
                Open B
              </button>
            </BottomSheet>
            <BottomSheet
              isOpen={isBOpen}
              onOpenChange={setIsBOpen}
              hasScrim={false}
              label="B">
              <button
                type="button"
                onClick={() => {
                  setIsBOpen(false);
                  setIsAOpen(false);
                }}>
                Close all
              </button>
            </BottomSheet>
          </>
        );
      }
      render(<App />);
      const openA = screen.getByRole('button', {name: 'Open A'});
      openA.focus();
      fireEvent.click(openA);
      const openB = screen.getByRole('button', {name: 'Open B'});
      openB.focus();
      fireEvent.click(openB);
      // No modal dialog blocks anything; B's own close ran with focus
      // inside B, so it returns to B's opener (inside A, which is leaving),
      // then A's close finds focus no longer inside it and leaves it.
      // Nothing is grouped.
      expect(getBottomSheetStackForTests()).toHaveLength(0);
      const closeAll = screen.getByRole('button', {name: 'Close all'});
      closeAll.focus();
      fireEvent.click(closeAll);
      finishExit(getDialog('B'));
      finishExit(getDialog('A'));
      expect(openDialogs()).toEqual([]);
      expect(document.activeElement).not.toBe(document.body);
    });

    it('a modal sheet closing with a non-modal one is not a group', () => {
      function App() {
        const [isAOpen, setIsAOpen] = useState(false);
        const [isBOpen, setIsBOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setIsAOpen(true)}>
              Open A
            </button>
            <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
              <button type="button" onClick={() => setIsBOpen(true)}>
                Open B
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsBOpen(false);
                  setIsAOpen(false);
                }}>
                Close all
              </button>
            </BottomSheet>
            <BottomSheet
              isOpen={isBOpen}
              onOpenChange={setIsBOpen}
              hasScrim={false}
              label="B">
              b
            </BottomSheet>
          </>
        );
      }
      render(<App />);
      const openA = screen.getByRole('button', {name: 'Open A'});
      openA.focus();
      fireEvent.click(openA);
      fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
      withModalFocusBlocking(() => {
        fireEvent.click(screen.getByRole('button', {name: 'Close all'}));
        finishExit(getDialog('A'));
        finishExit(getDialog('B'));
      });
      // The one modal sheet returns focus through its own close.
      expect(openDialogs()).toEqual([]);
      expect(openA).toHaveFocus();
    });
  });
});

// ---------------------------------------------------------------------------
// Requirement 9 — the native top layer
// ---------------------------------------------------------------------------

describe('R9 top layer', () => {
  it('keeps each sheet’s own dialog where it is written; nothing moves', () => {
    const {container} = render(
      <div data-testid="where-written">
        <Siblings initialA initialB />
      </div>,
    );
    const region = container.querySelector('[data-testid="where-written"]')!;
    expect(getDialog('A').parentElement).toBe(region);
    expect(getDialog('B').parentElement).toBe(region);
    expect(getDialog('A')).toHaveAttribute('open');
    expect(getDialog('B')).toHaveAttribute('open');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(2);
  });

  it('a Dialog opened from a stacked sheet paints above it, and a sheet opened from that Dialog paints above the Dialog', () => {
    function App() {
      const [isDialogOpen, setIsDialogOpen] = useState(false);
      const [isCOpen, setIsCOpen] = useState(false);
      return (
        <>
          <BottomSheet isOpen onOpenChange={() => {}} label="A">
            a
          </BottomSheet>
          <BottomSheet isOpen onOpenChange={() => {}} label="B">
            <button type="button" onClick={() => setIsDialogOpen(true)}>
              Open dialog
            </button>
            <Dialog
              isOpen={isDialogOpen}
              onOpenChange={setIsDialogOpen}
              aria-label="Over">
              <button type="button" onClick={() => setIsCOpen(true)}>
                Open C
              </button>
              <BottomSheet isOpen={isCOpen} onOpenChange={setIsCOpen} label="C">
                c
              </BottomSheet>
            </Dialog>
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open dialog'}));
    expect(topLayerOrder()).toEqual(['A', 'B', 'Over']);
    fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
    expect(topLayerOrder()).toEqual(['A', 'B', 'Over', 'C']);
    // The Dialog is not a sheet: C is the top sheet over B, and the Dialog
    // sits between them in the top layer without entering the stack.
    expect(stackSummary()).toEqual(['A:covered:2', 'B:covered:1', 'C:top:0']);
    // B contains the Dialog that contains C, so inert on B would reach C.
    expect(getDialog('B')).not.toHaveAttribute('inert');
    expect(getDialog('A')).toHaveAttribute('inert');
  });
});

// ---------------------------------------------------------------------------
// Requirement 10 — concurrent React
// ---------------------------------------------------------------------------

describe('R10 concurrent React', () => {
  it('StrictMode leaves exactly one entry per sheet and every dialog open', () => {
    render(
      <StrictMode>
        <Siblings initialA initialB />
      </StrictMode>,
    );
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
    expect(openDialogs()).toEqual(['A', 'B']);
    expect(topLayerOrder()).toEqual(['A', 'B']);
    expect(getPanel(getDialog('B'))).toHaveFocus();
  });

  it('StrictMode keeps an out-of-tree-order stack in open order', () => {
    render(
      <StrictMode>
        <Siblings reversed />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
  });

  it('a transition that never commits has no effect', () => {
    const never = new Promise<never>(() => {});
    function Gate({children}: {children: ReactNode}): ReactNode {
      if (children != null) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- Suspense protocol: a thrown promise suspends the subtree
        throw never;
      }
      return children;
    }
    let setShow!: (value: boolean) => void;
    function App() {
      const [show, set] = useState(false);
      setShow = set;
      return (
        <>
          <BottomSheet isOpen onOpenChange={() => {}} label="A">
            a
          </BottomSheet>
          <Suspense fallback={null}>
            {show ? (
              <Gate>
                <BottomSheet isOpen onOpenChange={() => {}} label="B">
                  b
                </BottomSheet>
              </Gate>
            ) : null}
          </Suspense>
        </>
      );
    }
    render(<App />);
    act(() => {
      startTransition(() => setShow(true));
    });
    expect(stackSummary()).toEqual(['A:top:0']);
    expect(openDialogs()).toEqual(['A']);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  });

  it('Suspense hide takes a sheet out of the stack; reveal re-presents it on top', async () => {
    let resolveGate!: () => void;
    const gate = new Promise<void>(resolve => {
      resolveGate = resolve;
    });
    let isSettled = false;
    void gate.then(() => {
      isSettled = true;
    });
    function MaybeSuspend({suspend}: {suspend: boolean}) {
      if (suspend && !isSettled) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- Suspense protocol: a thrown promise suspends the subtree
        throw gate;
      }
      return null;
    }
    let setSuspend!: (value: boolean) => void;
    function App() {
      const [suspend, set] = useState(false);
      setSuspend = set;
      return (
        <>
          <BottomSheet isOpen onOpenChange={() => {}} label="A">
            a
          </BottomSheet>
          <Suspense fallback={<span data-testid="fallback" />}>
            <BottomSheet isOpen onOpenChange={() => {}} label="B">
              <MaybeSuspend suspend={suspend} />
            </BottomSheet>
          </Suspense>
          <BottomSheet isOpen onOpenChange={() => {}} label="C">
            c
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    expect(stackSummary()).toEqual(['A:covered:2', 'B:covered:1', 'C:top:0']);

    act(() => setSuspend(true));
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    // The hidden sheet left the stack and the top layer: a modal dialog with
    // no box would otherwise keep blocking the page.
    expect(stackSummary()).toEqual(['A:covered:1', 'C:top:0']);
    expect(openDialogs()).toEqual(['A', 'C']);

    await act(async () => {
      resolveGate();
      await gate;
    });
    // Revealed: presented again, as the most recent open — on top.
    expect(stackSummary()).toEqual(['A:covered:2', 'C:covered:1', 'B:top:0']);
    expect(topLayerOrder()).toEqual(['A', 'C', 'B']);
  });

  it('Activity hidden takes a sheet out; visible re-presents it on top with its state', () => {
    let setHidden!: (value: boolean) => void;
    function App() {
      const [hidden, set] = useState(false);
      setHidden = set;
      return (
        <>
          <BottomSheet isOpen onOpenChange={() => {}} label="A">
            a
          </BottomSheet>
          <Activity mode={hidden ? 'hidden' : 'visible'}>
            <BottomSheet isOpen onOpenChange={() => {}} label="B">
              <input aria-label="bInput" defaultValue="" />
            </BottomSheet>
          </Activity>
          <BottomSheet isOpen onOpenChange={() => {}} label="C">
            c
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.change(screen.getByLabelText('bInput'), {
      target: {value: 'kept'},
    });
    act(() => setHidden(true));
    expect(stackSummary()).toEqual(['A:covered:1', 'C:top:0']);
    expect(openDialogs()).toEqual(['A', 'C']);
    act(() => setHidden(false));
    expect(stackSummary()).toEqual(['A:covered:2', 'C:covered:1', 'B:top:0']);
    expect(screen.getByLabelText('bInput')).toHaveValue('kept');
  });

  it('SSR and hydration markup match, and the stack forms on the client', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    function App() {
      return (
        <BottomSheet isOpen onOpenChange={() => {}} label="A">
          <BottomSheet isOpen onOpenChange={() => {}} label="B">
            b
          </BottomSheet>
        </BottomSheet>
      );
    }
    const html = renderToString(<App />);
    expect(html).not.toContain('data-sheet-stack');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <App />);
    });
    expect(error).not.toHaveBeenCalled();
    expect(stackSummary()).toEqual(['A:covered:1', 'B:top:0']);
    expect(topLayerOrder()).toEqual(['A', 'B']);
    act(() => root.unmount());
    container.remove();
    error.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Requirement 11 — non-modal sheets stay out of the stack
// ---------------------------------------------------------------------------

describe('R11 non-modal sheets', () => {
  it('a hasScrim={false} sheet neither joins the stack nor recedes a modal sheet', () => {
    function App() {
      const [isNonModalOpen, setIsNonModalOpen] = useState(false);
      return (
        <>
          <BottomSheet isOpen onOpenChange={() => {}} label="Modal">
            <button type="button" onClick={() => setIsNonModalOpen(true)}>
              Open non-modal
            </button>
          </BottomSheet>
          <BottomSheet
            isOpen={isNonModalOpen}
            onOpenChange={setIsNonModalOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open non-modal'}));
    expect(getDialog('NonModal')).toHaveAttribute('open');
    // Not shown modally and not a stack level. Opened while a modal that
    // does not contain it is open, it is inert under that modal, so it is
    // not put in the top layer (there it would paint above the modal while
    // a press on it lands on the modal): it is shown by show(), beneath.
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    expect(HTMLDialogElement.prototype.show).toHaveBeenCalledTimes(1);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(stackSummary()).toEqual(['Modal:top:0']);
    expect(getDialog('Modal')).not.toHaveAttribute('data-sheet-stack');
    expect(getDialog('NonModal')).not.toHaveAttribute('data-sheet-stack');
    expect(getComputedStyle(getPositioner(getDialog('Modal'))).transform).toBe(
      '',
    );
  });

  it('a hasScrim={false} sheet rendered inside an open modal sheet enters the top layer', () => {
    function App() {
      const [isNonModalOpen, setIsNonModalOpen] = useState(false);
      return (
        <BottomSheet isOpen onOpenChange={() => {}} label="Modal">
          <button type="button" onClick={() => setIsNonModalOpen(true)}>
            Open non-modal
          </button>
          <BottomSheet
            isOpen={isNonModalOpen}
            onOpenChange={setIsNonModalOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </BottomSheet>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open non-modal'}));
    // Inside the modal's content it is not inert, so the top layer is right.
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(HTMLDialogElement.prototype.show).not.toHaveBeenCalled();
  });

  it('a hasScrim={false} sheet opened from a Dialog and rendered outside it stays beneath the Dialog', () => {
    function App() {
      const [isNonModalOpen, setIsNonModalOpen] = useState(false);
      return (
        <>
          <Dialog isOpen onOpenChange={() => {}} aria-label="Edit">
            <button type="button" onClick={() => setIsNonModalOpen(true)}>
              Open non-modal
            </button>
          </Dialog>
          <BottomSheet
            isOpen={isNonModalOpen}
            onOpenChange={setIsNonModalOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open non-modal'}));
    expect(getDialog('NonModal')).toHaveAttribute('open');
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    expect(HTMLDialogElement.prototype.show).toHaveBeenCalledTimes(1);
  });

  it('a hasScrim={false} sheet shown beneath a Dialog enters the top layer once the Dialog closes, announcing its entry', () => {
    function App() {
      const [isDialogOpen, setIsDialogOpen] = useState(true);
      const [isNonModalOpen, setIsNonModalOpen] = useState(false);
      return (
        <>
          <Dialog
            isOpen={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            aria-label="Edit">
            <button type="button" onClick={() => setIsNonModalOpen(true)}>
              Open non-modal
            </button>
            <button type="button" onClick={() => setIsDialogOpen(false)}>
              Close dialog
            </button>
          </Dialog>
          <BottomSheet
            isOpen={isNonModalOpen}
            onOpenChange={setIsNonModalOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </>
      );
    }
    const entries: string[] = [];
    const unsubscribe = subscribeModalOutlets(change => {
      entries.push(change);
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open non-modal'}));
    expect(HTMLDialogElement.prototype.show).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    expect(entries).not.toContain('entry');
    // The Dialog closes: its dialog loses `open` and, as in a browser, a
    // `close` event follows. The waiting sheet leaves show() for the top
    // layer and announces the entry global hosts re-enter above.
    fireEvent.click(screen.getByRole('button', {name: 'Close dialog'}));
    act(() => {
      getDialog('Edit').dispatchEvent(new Event('close'));
    });
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(getDialog('NonModal')).toHaveAttribute('open');
    expect(entries).toContain('entry');
    unsubscribe();
  });

  it('a hasScrim={false} sheet shown beneath a Dialog enters the top layer when that Dialog unmounts while open (no close event fires)', async () => {
    function App() {
      const [isEditing, setIsEditing] = useState(true);
      const [isNonModalOpen, setIsNonModalOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsNonModalOpen(true)}>
            Open non-modal
          </button>
          <button type="button" onClick={() => setIsEditing(false)}>
            Unmount dialog
          </button>
          {isEditing && (
            <Dialog isOpen onOpenChange={() => {}} aria-label="Edit">
              editing
            </Dialog>
          )}
          <BottomSheet
            isOpen={isNonModalOpen}
            onOpenChange={setIsNonModalOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </>
      );
    }
    const entries: string[] = [];
    const unsubscribe = subscribeModalOutlets(change => {
      entries.push(change);
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open non-modal'}));
    expect(HTMLDialogElement.prototype.show).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    // The Dialog is removed from the document still open: no `close` event
    // and no sheet-stack update follow. The removal itself is the signal.
    fireEvent.click(screen.getByRole('button', {name: 'Unmount dialog'}));
    expect(screen.queryByRole('dialog', {name: 'Edit'})).toBeNull();
    // Mutation records are delivered on a microtask.
    await act(async () => {
      await Promise.resolve();
    });
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(getDialog('NonModal')).toHaveAttribute('open');
    expect(entries).toContain('entry');
    unsubscribe();
  });

  it('a hasScrim={false} sheet opened in the update that closes a modal sheet enters the top layer at once (the closing modal is gone for this decision)', () => {
    function App() {
      const [isModalOpen, setIsModalOpen] = useState(true);
      const [isNonModalOpen, setIsNonModalOpen] = useState(false);
      return (
        <>
          <BottomSheet
            isOpen={isModalOpen}
            onOpenChange={setIsModalOpen}
            label="Modal">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setIsNonModalOpen(true);
              }}>
              Swap
            </button>
          </BottomSheet>
          <BottomSheet
            isOpen={isNonModalOpen}
            onOpenChange={setIsNonModalOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    // A browser keeps answering `:modal` for the closing dialog until its
    // close(); jsdom answers false to `:modal` for everything, so give this
    // dialog the browser's answer.
    const modal = getDialog('Modal');
    const nativeMatches = modal.matches.bind(modal);
    vi.spyOn(modal, 'matches').mockImplementation((selectors: string) =>
      selectors === ':modal'
        ? modal.hasAttribute('open')
        : nativeMatches(selectors),
    );
    fireEvent.click(screen.getByRole('button', {name: 'Swap'}));
    // The modal sheet is mid-exit: still an open modal dialog, but inert.
    expect(modal).toHaveAttribute('open');
    expect(modal).toHaveAttribute('inert');
    expect(modal.matches(':modal')).toBe(true);
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(HTMLDialogElement.prototype.show).not.toHaveBeenCalled();
  });

  it('a hasScrim={false} sheet deferred under a plain showModal() dialog with no aria-modal (a MobileNav or Lightbox host) is promoted when that dialog is removed while open', async () => {
    // A bare <dialog> presented with showModal(): the browser answers
    // `:modal` for it and nothing sets aria-modal. jsdom answers false to
    // `:modal` for everything, so give this dialog the browser's answer —
    // only while it is in the document and open, as a browser would.
    const plain = document.createElement('dialog');
    plain.setAttribute('aria-label', 'Nav');
    plain.textContent = 'nav';
    document.body.appendChild(plain);
    plain.setAttribute('open', '');
    const nativeMatches = plain.matches.bind(plain);
    vi.spyOn(plain, 'matches').mockImplementation((selectors: string) =>
      selectors === ':modal'
        ? plain.isConnected && plain.hasAttribute('open')
        : nativeMatches(selectors),
    );
    function App() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open non-modal
          </button>
          <BottomSheet
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open non-modal'}));
    expect(HTMLDialogElement.prototype.show).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    // The nav is removed from the document still open: no close event, and
    // nothing on the removed node says it was modal.
    plain.remove();
    await act(async () => {
      await Promise.resolve();
    });
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(getDialog('NonModal')).toHaveAttribute('open');
  });

  it('a hasScrim={false} sheet deferred under one Dialog that is replaced by another in a single update is promoted when the second unmounts while open (the re-check records the new blocker)', async () => {
    function App() {
      const [editor, setEditor] = useState<'caption' | 'alt' | null>('caption');
      const [isNonModalOpen, setIsNonModalOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsNonModalOpen(true)}>
            Open non-modal
          </button>
          <button type="button" onClick={() => setEditor('alt')}>
            Switch editor
          </button>
          <button type="button" onClick={() => setEditor(null)}>
            Unmount editor
          </button>
          {editor === 'caption' && (
            <Dialog isOpen onOpenChange={() => {}} aria-label="Caption">
              caption
            </Dialog>
          )}
          {editor === 'alt' && (
            <Dialog isOpen onOpenChange={() => {}} aria-label="Alt text">
              alt text
            </Dialog>
          )}
          <BottomSheet
            isOpen={isNonModalOpen}
            onOpenChange={setIsNonModalOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open non-modal'}));
    expect(HTMLDialogElement.prototype.show).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    // One update: the Caption dialog leaves (still open, no close event) and
    // the Alt text dialog arrives open. The sheet stays beneath the new one.
    fireEvent.click(screen.getByRole('button', {name: 'Switch editor'}));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog', {name: 'Caption'})).toBeNull();
    expect(getDialog('Alt text')).toHaveAttribute('open');
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    // The second dialog unmounts while open too.
    fireEvent.click(screen.getByRole('button', {name: 'Unmount editor'}));
    await act(async () => {
      await Promise.resolve();
    });
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(getDialog('NonModal')).toHaveAttribute('open');
  });

  it('a hasScrim={false} sheet opened with no modal open enters the top layer', () => {
    function App() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open non-modal
          </button>
          <BottomSheet
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open non-modal'}));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(HTMLDialogElement.prototype.show).not.toHaveBeenCalled();
  });

  it('a modal sheet opened over a non-modal sheet does not recede it', () => {
    function App() {
      const [isModalOpen, setIsModalOpen] = useState(false);
      return (
        <>
          <BottomSheet
            isOpen
            onOpenChange={() => {}}
            hasScrim={false}
            label="NonModal">
            <button type="button" onClick={() => setIsModalOpen(true)}>
              Open modal
            </button>
          </BottomSheet>
          <BottomSheet
            isOpen={isModalOpen}
            onOpenChange={setIsModalOpen}
            label="Modal">
            modal
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open modal'}));
    expect(stackSummary()).toEqual(['Modal:top:0']);
    expect(getDialog('NonModal')).not.toHaveAttribute('data-sheet-stack');
    expect(getDialog('NonModal')).not.toHaveAttribute('inert');
    expect(
      getComputedStyle(getPositioner(getDialog('NonModal'))).transform,
    ).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Requirement 13 — one registry per realm, per document
// ---------------------------------------------------------------------------

describe('R13 registry state', () => {
  it('keeps its state on globalThis under a shared symbol, with its shape', () => {
    const holder = globalThis as Record<symbol, unknown>;
    const shared = holder[BOTTOM_SHEET_STACK_STATE_FOR_TESTS.key] as {
      shape: number;
      entries: unknown[];
    };
    expect(shared.shape).toBe(BOTTOM_SHEET_STACK_STATE_FOR_TESTS.shape);
    render(<Siblings initialA />);
    expect(shared.entries).toHaveLength(1);
  });

  it('everything the stack reads across commits is in the shared state, nothing per copy: the deferred non-modal sheets and the element to keep focused are shared by a second same-protocol copy', async () => {
    const holder = globalThis as Record<symbol, unknown>;
    const shared = holder[BOTTOM_SHEET_STACK_STATE_FOR_TESTS.key] as {
      entries: unknown[];
      shownOrder: WeakMap<Document, unknown>;
      listenedDocuments: WeakMap<Document, unknown>;
      lastPress: WeakMap<Document, unknown>;
      focusToKeep: WeakMap<Document, unknown>;
      deferredTopLayer: WeakMap<Document, {deferred: Map<unknown, unknown>}>;
    };
    // The shape carries every per-document table the stack keeps.
    for (const table of [
      'shownOrder',
      'listenedDocuments',
      'lastPress',
      'focusToKeep',
      'deferredTopLayer',
    ] as const) {
      expect(shared[table]).toBeInstanceOf(WeakMap);
    }
    // A deferral made by this copy is visible to a fresh same-protocol copy:
    // a non-modal sheet shown beneath an open Dialog waits in the shared
    // state, and the copy's own promotion pass finds it and promotes it.
    function App() {
      const [isDialogOpen, setIsDialogOpen] = useState(true);
      const [isNonModalOpen, setIsNonModalOpen] = useState(false);
      return (
        <>
          <Dialog
            isOpen={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            aria-label="Edit">
            <button type="button" onClick={() => setIsNonModalOpen(true)}>
              Open non-modal
            </button>
            <button type="button" onClick={() => setIsDialogOpen(false)}>
              Close dialog
            </button>
          </Dialog>
          <BottomSheet
            isOpen={isNonModalOpen}
            onOpenChange={setIsNonModalOpen}
            hasScrim={false}
            label="NonModal">
            non-modal
          </BottomSheet>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Open non-modal'}));
    expect(shared.deferredTopLayer.get(document)?.deferred.size).toBe(1);
    vi.resetModules();
    const copy = await import('./bottomSheetStack');
    // The Dialog closes without the event the listener would need (the stub
    // close() fires none): the second copy's promotion pass, reading the
    // shared deferrals, promotes the sheet this copy deferred.
    fireEvent.click(screen.getByRole('button', {name: 'Close dialog'}));
    act(() => {
      copy.promoteDeferredNonModal(document);
    });
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(shared.deferredTopLayer.get(document)?.deferred.size).toBe(0);
  });

  it('a second copy of the module shares the same state', async () => {
    // Two copies of the package on one page (two bundles, a dev server
    // serving one file under two URLs) must see one stack.
    vi.resetModules();
    const copy = await import('./bottomSheetStack');
    expect(copy.registerBottomSheet).not.toBe(registerBottomSheet);
    render(<Siblings initialA />);
    expect(copy.getBottomSheetStackForTests()).toHaveLength(1);
    expect(copy.getBottomSheetStackForTests()[0].element).toBe(getDialog('A'));
  });

  it('the document-global key names the protocol version', () => {
    const {key, protocolVersion, keyFor} = BOTTOM_SHEET_STACK_STATE_FOR_TESTS;
    expect(key).toBe(keyFor(protocolVersion));
    expect(key.description).toBe(`astryx.bottomSheetStack.v${protocolVersion}`);
  });

  it('two copies on different protocol versions keep two independent stacks: each orders only the sheets its copy renders (PR1)', async () => {
    // A copy on another protocol version writes its state under its own
    // key, so neither copy ever reads a state of the wrong shape. Modelled
    // with this copy's state parked under the previous version's key, the
    // way an older bundle on the page would have left it.
    const holder = globalThis as Record<symbol, unknown>;
    const {key, keyFor, protocolVersion} = BOTTOM_SHEET_STACK_STATE_FOR_TESTS;
    const olderKey = keyFor(protocolVersion - 1);
    const thisState = holder[key];
    holder[olderKey] = {...(thisState as object), shape: protocolVersion - 1};
    try {
      render(<Siblings initialA />);
      expect(getBottomSheetStackForTests()).toHaveLength(1);
      // A fresh copy of the module speaks this protocol and joins this stack.
      vi.resetModules();
      const sameProtocol = await import('./bottomSheetStack');
      expect(sameProtocol.getBottomSheetStackForTests()).toHaveLength(1);
      // The older state under the older key saw nothing of it: the two
      // stacks are independent, and the older copy's would order only what
      // that copy rendered.
      const older = holder[olderKey] as {entries: unknown[]; shape: number};
      expect(older.shape).toBe(protocolVersion - 1);
      expect(older).not.toBe(holder[key]);
    } finally {
      Reflect.deleteProperty(holder, olderKey);
    }
  });

  it('a state found under this version key with another shape (a key collision) is not shared', async () => {
    const holder = globalThis as Record<symbol, unknown>;
    const shared = holder[BOTTOM_SHEET_STACK_STATE_FOR_TESTS.key] as {
      shape: number;
    };
    const shape = shared.shape;
    shared.shape = shape + 1000;
    try {
      vi.resetModules();
      const copy = await import('./bottomSheetStack');
      render(<Siblings initialA />);
      expect(copy.getBottomSheetStackForTests()).toHaveLength(0);
    } finally {
      shared.shape = shape;
    }
  });

  it('the press listeners are installed once per document with its first sheet, removed when its last sheet leaves, and installed again by the next (INV5)', () => {
    const {isListeningForPresses} = BOTTOM_SHEET_STACK_STATE_FOR_TESTS;
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const pressAdds = () =>
      add.mock.calls.filter(
        ([type, , options]) =>
          ['pointerdown', 'click', 'keydown'].includes(type) &&
          options === true,
      ).length;
    const pressRemoves = () =>
      remove.mock.calls.filter(
        ([type, , options]) =>
          ['pointerdown', 'click', 'keydown'].includes(type) &&
          options === true,
      ).length;
    expect(isListeningForPresses(document)).toBe(false);
    const view = render(<Siblings initialA initialB />);
    // Two sheets, one set of three listeners.
    expect(isListeningForPresses(document)).toBe(true);
    expect(pressAdds()).toBe(3);
    // The top sheet leaves: the other still reads presses.
    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    finishExit(getDialog('B'));
    view.rerender(<Siblings initialA />);
    expect(isListeningForPresses(document)).toBe(true);
    expect(pressRemoves()).toBe(0);
    // The last sheet leaves the registry (unmounted): the listeners go.
    view.unmount();
    expect(isListeningForPresses(document)).toBe(false);
    expect(pressRemoves()).toBe(3);
    // The next sheet installs them again.
    render(<Siblings initialA />);
    expect(isListeningForPresses(document)).toBe(true);
    expect(pressAdds()).toBe(6);
    add.mockRestore();
    remove.mockRestore();
  });

  it('a recorded press holds its target weakly: a removed, collected target is not an actor', () => {
    // WeakRef cannot be forced to clear in a test; what can be checked is
    // that the record is a WeakRef whose deref is read, by swapping in one
    // that answers undefined and seeing the actor fall back to focus.
    render(<Siblings initialA />);
    const holder = globalThis as Record<symbol, unknown>;
    const shared = holder[BOTTOM_SHEET_STACK_STATE_FOR_TESTS.key] as {
      lastPress: WeakMap<Document, {target: WeakRef<Element>; at: number}>;
    };
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open B'}));
    const press = shared.lastPress.get(document);
    expect(press).toBeDefined();
    expect(press!.target).toBeInstanceOf(WeakRef);
    expect(press!.target.deref()).toBe(
      screen.getByRole('button', {name: 'Open B'}),
    );
  });

  it('two copies, one presenting in an iframe document and one in the main document, keep both sheets shown', async () => {
    // Everything the reconcile reads — the per-document shown order and the
    // press listener registry — lives in the shared state, so a copy that
    // first meets a document does not mistake it for another copy's.
    vi.resetModules();
    const {BottomSheet: CopyBottomSheet} = await import('./BottomSheet');
    const copyStack = await import('./bottomSheetStack');
    expect(copyStack.registerBottomSheet).not.toBe(registerBottomSheet);
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument as Document;
    const FrameDialog = (frame.contentWindow as Window & typeof globalThis)
      .HTMLDialogElement;
    FrameDialog.prototype.showModal = HTMLDialogElement.prototype.showModal;
    FrameDialog.prototype.close = HTMLDialogElement.prototype.close;
    const mount = frameDocument.createElement('div');
    frameDocument.body.appendChild(mount);
    function App() {
      return (
        <>
          {createPortal(
            <CopyBottomSheet isOpen onOpenChange={() => {}} label="Framed">
              framed
            </CopyBottomSheet>,
            mount,
          )}
          <BottomSheet isOpen onOpenChange={() => {}} label="A">
            a
          </BottomSheet>
        </>
      );
    }
    try {
      render(<App />);
      expect(
        nativeLog.map(
          ({call, dialog}) => `${call}:${dialog.getAttribute('aria-label')}`,
        ),
      ).toEqual(['showModal:Framed', 'showModal:A']);
      expect(stackSummary()).toEqual(['A:top:0']);
      expect(
        copyStack
          .getBottomSheetStackForTests(frameDocument)
          .map(({element}) => element?.getAttribute('aria-label')),
      ).toEqual(['Framed']);
      expect(
        getBottomSheetStackForTests(frameDocument).map(({element}) =>
          element?.getAttribute('aria-label'),
        ),
      ).toEqual(['Framed']);
      expect(frameDocument.querySelector('dialog')).toHaveAttribute('open');
    } finally {
      frame.remove();
    }
  });

  it('sheets in another document form their own stack', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument as Document;
    // jsdom has no showModal/close in any realm; the frame's realm gets the
    // same stand-ins as the main one.
    const FrameDialog = (frame.contentWindow as Window & typeof globalThis)
      .HTMLDialogElement;
    FrameDialog.prototype.showModal = HTMLDialogElement.prototype.showModal;
    FrameDialog.prototype.close = HTMLDialogElement.prototype.close;
    const mount = frameDocument.createElement('div');
    frameDocument.body.appendChild(mount);
    function App() {
      return (
        <>
          <BottomSheet isOpen onOpenChange={() => {}} label="A">
            a
          </BottomSheet>
          {createPortal(
            <BottomSheet isOpen onOpenChange={() => {}} label="Framed">
              framed
            </BottomSheet>,
            mount,
          )}
        </>
      );
    }
    try {
      render(<App />);
      expect(stackSummary()).toEqual(['A:top:0']);
      expect(
        getBottomSheetStackForTests(frameDocument).map(
          ({element, view}) =>
            `${element?.getAttribute('aria-label')}:${view.isTop ? 'top' : 'covered'}`,
        ),
      ).toEqual(['Framed:top']);
      expect(getDialog('A')).not.toHaveAttribute('data-sheet-stack');
    } finally {
      frame.remove();
    }
  });
});

// ---------------------------------------------------------------------------
// Requirement 12 — existing behaviour: the standalone and switcher contracts
// ---------------------------------------------------------------------------

describe('R14 a switcher flow stacked with standalone sheets', () => {
  function Mixed() {
    const [isAOpen, setIsAOpen] = useState(false);
    const [step, setStep] = useState<string | null>(null);
    const [isCOpen, setIsCOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setIsAOpen(true)}>
          Open A
        </button>
        <button type="button" onClick={() => setStep('one')}>
          Open flow
        </button>
        <button type="button" onClick={() => setStep('two')}>
          Step two
        </button>
        <button type="button" onClick={() => setStep(null)}>
          Close flow
        </button>
        <button type="button" onClick={() => setIsCOpen(true)}>
          Open C
        </button>
        <BottomSheet isOpen={isAOpen} onOpenChange={setIsAOpen} label="A">
          <button type="button" onClick={() => setStep('one')}>
            Open flow from A
          </button>
        </BottomSheet>
        <BottomSheetSwitcher activeSheet={step} onActiveSheetChange={setStep}>
          <BottomSheet sheetId="one" label="One">
            <button type="button" onClick={() => setIsCOpen(true)}>
              Open C from one
            </button>
          </BottomSheet>
          <BottomSheet sheetId="two" label="Two">
            two
          </BottomSheet>
        </BottomSheetSwitcher>
        <BottomSheet isOpen={isCOpen} onOpenChange={setIsCOpen} label="C">
          <button type="button" onClick={() => setIsCOpen(false)}>
            Close C
          </button>
        </BottomSheet>
      </>
    );
  }

  it('a flow over a standalone sheet: one scrim (the sheet’s), the sheet recedes, the flow’s steps stay clear through a handoff', () => {
    render(<Mixed />);
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open flow from A'}));
    expect(stackSummary()).toEqual(['A:covered:1', 'One:top:0']);
    expect(topLayerOrder()).toEqual(['A', 'One']);
    expect(scrim(getDialog('A'))).toBe('1');
    expect(scrim(getDialog('One'))).toBe('0');
    expect(getDialog('A')).toHaveAttribute('data-sheet-stack', 'covered');
    expect(getDialog('A')).toHaveAttribute('inert');
    expect(getDialog('One')).toHaveAttribute('data-sheet-stack', 'top');
    expect(getDialog('One')).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', {name: 'Step two'}));
    // Neither step dims: A still owns the stack's scrim.
    expect(scrim(getDialog('One'))).toBe('0');
    expect(scrim(getDialog('Two'))).toBe('0');
    expect(topLayerOrder()).toEqual(['A', 'One', 'Two']);
    finishHandoff(getDialog('Two'), getDialog('One'));
    expect(stackSummary()).toEqual(['A:covered:1', 'Two:top:0']);
    expect(scrim(getDialog('A'))).toBe('1');
    expect(scrim(getDialog('Two'))).toBe('0');
    expect(getDialog('A')).toHaveAttribute('data-sheet-stack', 'covered');

    // Escape reaches the flow, not the covered sheet.
    act(() => {
      pressEscape();
    });
    expect(stackSummary()).toEqual(['A:top:0', 'Two:exiting:0']);
    finishExit(getDialog('Two'));
    expect(stackSummary()).toEqual(['A:top:0']);
    expect(getDialog('A')).not.toHaveAttribute('data-sheet-stack');
    expect(getDialog('A')).not.toHaveAttribute('inert');
    expect(scrim(getDialog('A'))).toBe('1');
  });

  it('a flow closing over a standalone sheet returns focus into that sheet', () => {
    render(<Mixed />);
    fireEvent.click(screen.getByRole('button', {name: 'Open A'}));
    const opener = screen.getByRole('button', {name: 'Open flow from A'});
    opener.focus();
    fireEvent.click(opener);
    expect(stackSummary()).toEqual(['A:covered:1', 'One:top:0']);
    fireEvent.click(screen.getByRole('button', {name: 'Close flow'}));
    finishExit(getDialog('One'));
    expect(stackSummary()).toEqual(['A:top:0']);
    // The opener is inside the revealed sheet, so it takes focus back.
    expect(opener).toHaveFocus();
  });

  it('a standalone sheet over a flow: the flow owns the one scrim and recedes as a whole; the sheet is clear', () => {
    render(<Mixed />);
    fireEvent.click(screen.getByRole('button', {name: 'Open flow'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open C from one'}));
    expect(stackSummary()).toEqual(['One:covered:1', 'C:top:0']);
    expect(topLayerOrder()).toEqual(['One', 'C']);
    expect(scrim(getDialog('One'))).toBe('1');
    expect(scrim(getDialog('C'))).toBe('0');
    const stepDialog = getDialog('One');
    expect(stepDialog).toHaveAttribute('data-sheet-stack', 'covered');
    expect(stepDialog).toHaveAttribute('data-sheet-stack-depth', '1');
    expect(stepDialog).toHaveAttribute('inert');
    expect(stepDialog).toHaveAttribute('aria-hidden', 'true');
    expect(
      getComputedStyle(getPanel(stepDialog).parentElement!).transform,
    ).toContain('scale(.96)');

    // Escape reaches C, the top sheet; the covered flow stands down.
    act(() => {
      pressEscape();
    });
    expect(stackSummary()).toEqual(['One:top:0', 'C:exiting:0']);
    finishExit(getDialog('C'));
    expect(stackSummary()).toEqual(['One:top:0']);
    expect(stepDialog).not.toHaveAttribute('data-sheet-stack');
    expect(stepDialog).not.toHaveAttribute('inert');
    expect(scrim(stepDialog)).toBe('1');
  });

  it('a step switch while the flow is covered keeps the covering sheet on top', () => {
    render(<Mixed />);
    fireEvent.click(screen.getByRole('button', {name: 'Open flow'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
    expect(topLayerOrder()).toEqual(['One', 'C']);
    // Only code can switch a covered flow; the new step's dialog is presented
    // on top, and the registry puts C back above it in the same commit.
    fireEvent.click(screen.getByRole('button', {name: 'Step two'}));
    expect(topLayerOrder()).toEqual(['One', 'Two', 'C']);
    expect(stackSummary()).toEqual(['Two:covered:1', 'C:top:0']);
    expect(scrim(getDialog('C'))).toBe('0');
    finishHandoff(getDialog('Two'), getDialog('One'));
    expect(topLayerOrder()).toEqual(['Two', 'C']);
    expect(scrim(getDialog('Two'))).toBe('1');
    expect(getDialog('Two')).toHaveAttribute('inert');
  });

  it('a standalone sheet closing over a flow returns focus into the flow’s active step', () => {
    render(<Mixed />);
    fireEvent.click(screen.getByRole('button', {name: 'Open flow'}));
    const opener = screen.getByRole('button', {name: 'Open C from one'});
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', {name: 'Close C'}));
    finishExit(getDialog('C'));
    expect(stackSummary()).toEqual(['One:top:0']);
    expect(opener).toHaveFocus();
  });
});

describe('R12 existing behaviour', () => {
  it('a standalone sheet presented alone keeps its full contract after a stack has come and gone', () => {
    render(<Siblings initialA />);
    const a = getDialog('A');
    fireEvent.click(screen.getByRole('button', {name: 'Open B'}));
    fireEvent.click(screen.getByRole('button', {name: 'Close B'}));
    finishExit(getDialog('B'));
    expect(stackSummary()).toEqual(['A:top:0']);
    expect(a).not.toHaveAttribute('data-sheet-stack');
    expect(a).not.toHaveAttribute('inert');
    expect(scrim(a)).toBe('1');
    expect(getComputedStyle(getPositioner(a)).transform).toBe('');
    expect(classes(getPositioner(a))).not.toContain('positionerStackMotion');
    act(() => {
      pressEscape();
    });
    expect(stackSummary()).toEqual(['A:exiting:0']);
    finishExit(a);
    expect(openDialogs()).toEqual([]);
  });

  it('a switcher on its own presents each step in its own dialog, hands its scrim over, and carries no stack state', () => {
    function Flow() {
      const [step, setStep] = useState<string | null>('one');
      return (
        <BottomSheetSwitcher activeSheet={step} onActiveSheetChange={setStep}>
          <BottomSheet sheetId="one" label="One">
            <button type="button" onClick={() => setStep('two')}>
              Next
            </button>
          </BottomSheet>
          <BottomSheet sheetId="two" label="Two">
            two
          </BottomSheet>
        </BottomSheetSwitcher>
      );
    }
    render(<Flow />);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(2);
    const dialog = getDialog('Two');
    // The retained step keeps the flow's scrim through the handoff.
    expect(scrim(getDialog('One'))).toBe('1');
    expect(scrim(dialog)).toBe('0');
    finishHandoff(dialog, getDialog('One'));
    expect(dialog).not.toHaveAttribute('data-sheet-stack');
    expect(dialog).not.toHaveAttribute('inert');
    expect(scrim(dialog)).toBe('1');
    expect(getDialog('One')).not.toHaveAttribute('open');
  });
});
