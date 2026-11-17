// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverPresentation.test.tsx
 * @input vitest (jsdom), Testing Library, Popover, a stand-in matchMedia and
 *   jsdom stubs for <dialog>
 * @output Checks Popover's `presentation`: the default stays anchored on a
 *   phone; `adaptive` presents a BottomSheet on a compact touch screen and the
 *   popover elsewhere; `bottom-sheet` always presents the sheet; the trigger's
 *   expanded state and controlled element follow the sheet; closing the sheet
 *   reports it; controlled visibility drives the sheet; dismissal maps to the
 *   sheet's purpose
 * @position Testing for Popover.tsx (presentation)
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import React, {useState} from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {Button} from '../Button';
import {defineTheme} from '../theme/defineTheme';
import {
  compactDefinition,
  DEFAULT_COMPACT_DEFINITION,
} from '../theme/themeAdaptations';
import {BottomSheet} from '../BottomSheet';
import {Popover, type PopoverPresentation} from './Popover';

// Compact as spec:AST-012 FR9 defines it, with a coarse pointer.
const COMPACT_TOUCH_QUERY = DEFAULT_COMPACT_DEFINITION.coarsePointerQuery;

let isCompactTouch = false;
// The media query's change listeners, so a test can turn the phone.
const mediaListeners = new Set<() => void>();
function setCompactTouch(next: boolean) {
  isCompactTouch = next;
  act(() => {
    for (const listener of mediaListeners) {
      listener();
    }
  });
}

beforeAll(async () => {
  // The sheet loads on demand; load it once so the first open in a test does
  // not wait on the import.
  await import('../BottomSheet/BottomSheet');
});

beforeEach(() => {
  isCompactTouch = false;
  mediaListeners.clear();
  // jsdom implements no <dialog> open/close or pointer capture.
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
    // A closed dialog fires `close`, as the browsers do.
    this.dispatchEvent(new Event('close'));
  });
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === COMPACT_TOUCH_QUERY ? isCompactTouch : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        mediaListeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: () => void) => {
        mediaListeners.delete(listener);
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Filters({
  presentation,
  onOpenChange,
  hasLightDismiss,
  hasEscapeDismiss,
  hasCloseButton,
}: {
  presentation?: PopoverPresentation;
  onOpenChange?: (isOpen: boolean) => void;
  hasLightDismiss?: boolean;
  hasEscapeDismiss?: boolean;
  hasCloseButton?: boolean;
}) {
  return (
    <Popover
      label="Filters"
      presentation={presentation}
      onOpenChange={onOpenChange}
      hasLightDismiss={hasLightDismiss}
      hasEscapeDismiss={hasEscapeDismiss}
      hasCloseButton={hasCloseButton}
      content={<button type="button">Apply</button>}>
      <Button label="Filter">Filter</Button>
    </Popover>
  );
}

const trigger = () => screen.getByRole('button', {name: 'Filter'});
const compactQueryReads = () =>
  vi
    .mocked(window.matchMedia)
    .mock.calls.filter(([query]) => query === COMPACT_TOUCH_QUERY).length;
const sheetDialog = () =>
  document.querySelector<HTMLDialogElement>('dialog[aria-label="Filters"]');
const openLayer = () =>
  document.querySelector(
    '[popover]:has([role="dialog"][aria-label="Filters"])',
  );

async function tapTrigger() {
  await act(async () => {
    fireEvent.click(trigger());
    await Promise.resolve();
  });
}

describe('Popover presentation', () => {
  it('a closed sheet holds no observers or viewport listeners until it opens', async () => {
    isCompactTouch = true;
    const observed: string[] = [];
    const record = (kind: string, target: Node) => {
      // The root theme's attribute observer is the theme's, not the sheet's.
      if (target !== document.documentElement) {
        observed.push(kind);
      }
    };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(target: Element) {
          record('resize', target);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe(target: Node) {
          record('mutation', target);
        }
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    const viewportListeners: string[] = [];
    const addWindowListener = window.addEventListener.bind(window);
    const recordWindowListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'resize' || type === 'blur') {
        viewportListeners.push(type);
      }
      addWindowListener(type, listener, options);
    };
    vi.spyOn(window, 'addEventListener').mockImplementation(
      recordWindowListener,
    );

    render(<Filters presentation="adaptive" />);
    // The closed sheet is mounted at rest, in place of the anchored layer.
    await vi.waitFor(() => {
      expect(sheetDialog()).not.toBeNull();
    });
    expect(sheetDialog()).not.toHaveAttribute('open');
    expect(observed).toEqual([]);
    expect(viewportListeners).toEqual([]);

    // Opening attaches them.
    await tapTrigger();
    await vi.waitFor(() => {
      expect(observed.length).toBeGreaterThan(0);
    });
  });

  it('reads the compact-touch query only for an adaptive popover', async () => {
    const {unmount} = render(<Filters />);
    await tapTrigger();
    render(<Filters presentation="bottom-sheet" />);
    expect(compactQueryReads()).toBe(0);
    unmount();
    render(<Filters presentation="adaptive" />);
    expect(compactQueryReads()).toBeGreaterThan(0);
  });

  it('takes compact from the compact definition: a short landscape phone gets the sheet', async () => {
    // FR9 counts a screen shorter than 500 as compact whatever its width.
    expect(COMPACT_TOUCH_QUERY).toContain('height < 500px');
    isCompactTouch = true;
    render(<Filters presentation="adaptive" />);
    await tapTrigger();
    expect(sheetDialog()).not.toBeNull();
  });

  it("styles the sheet's panel with the caller's xstyle, className and style", async () => {
    render(
      <Popover
        label="Filters"
        presentation="bottom-sheet"
        className="caller-popover"
        style={{outlineWidth: 3}}
        content={<button type="button">Apply</button>}>
        <Button label="Filter">Filter</Button>
      </Popover>,
    );
    await tapTrigger();
    const styled = sheetDialog()?.querySelector<HTMLElement>('.caller-popover');
    expect(styled).not.toBeNull();
    expect(styled?.style.outlineWidth).toBe('3px');
  });

  it('stays anchored on a phone by default', async () => {
    isCompactTouch = true;
    render(<Filters />);
    await tapTrigger();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(sheetDialog()).toBeNull();
    expect(openLayer()).not.toBeNull();
  });

  it('adaptive: a phone gets a BottomSheet holding the content, labeled by the popover', async () => {
    isCompactTouch = true;
    const onOpenChange = vi.fn();
    render(<Filters presentation="adaptive" onOpenChange={onOpenChange} />);
    await tapTrigger();
    const dialog = await vi.waitFor(() => {
      const element = sheetDialog();
      expect(element).toHaveAttribute('open');
      return element!;
    });
    expect(dialog.querySelector('button')).toHaveTextContent('Apply');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    // The trigger controls the sheet's panel, not the hidden layer.
    const controlled = document.getElementById(
      trigger().getAttribute('aria-controls') ?? '',
    );
    expect(controlled).not.toBeNull();
    expect(dialog.contains(controlled)).toBe(true);
    expect(document.querySelector('[popover]:popover-open')).toBeNull();
  });

  it('a sheet without a label is named by the trigger\u2019s text, never an unnamed dialog (DEC-8)', async () => {
    isCompactTouch = true;
    render(
      <Popover
        presentation="adaptive"
        content={<button type="button">Apply</button>}>
        <Button label="Sort by">Sort by</Button>
      </Popover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Sort by'}));
      await Promise.resolve();
    });
    const dialog = await vi.waitFor(() => {
      const element = document.querySelector<HTMLDialogElement>('dialog');
      expect(element).toHaveAttribute('open');
      return element!;
    });
    expect(dialog).toHaveAttribute('aria-label', 'Sort by');
  });

  it('a render-prop trigger without a label names the sheet with its text (DEC-8)', async () => {
    isCompactTouch = true;
    render(
      <Popover
        presentation="adaptive"
        content={<button type="button">Apply</button>}>
        {triggerProps => (
          <button type="button" {...triggerProps}>
            Group by
          </button>
        )}
      </Popover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Group by'}));
      await Promise.resolve();
    });
    const dialog = await vi.waitFor(() => {
      const element = document.querySelector<HTMLDialogElement>('dialog');
      expect(element).toHaveAttribute('open');
      return element!;
    });
    expect(dialog).toHaveAttribute('aria-label', 'Group by');
  });

  it('a sheet with hasEscapeDismiss={false} leaves Escape on for a sheet opened inside it', async () => {
    isCompactTouch = true;
    const onInnerOpenChange = vi.fn();
    render(
      <Popover
        label="Filters"
        presentation="adaptive"
        hasEscapeDismiss={false}
        content={
          <BottomSheet
            isOpen
            onOpenChange={onInnerOpenChange}
            label="Inner sheet">
            Inner
          </BottomSheet>
        }>
        <Button label="Filter">Filter</Button>
      </Popover>,
    );
    await tapTrigger();
    const inner = await vi.waitFor(() => {
      const element = document.querySelector<HTMLDialogElement>(
        'dialog[aria-label="Inner sheet"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    act(() => {
      fireEvent.keyDown(inner, {key: 'Escape'});
    });
    expect(onInnerOpenChange).toHaveBeenCalledWith(false);
  });

  it('the sheet focuses the first content control, as the anchored popover does (FR2)', async () => {
    isCompactTouch = true;
    render(
      <Popover
        label="Filters"
        presentation="adaptive"
        content={
          <div>
            <p>Status</p>
            <button type="button">Apply</button>
          </div>
        }>
        <Button label="Filter">Filter</Button>
      </Popover>,
    );
    await tapTrigger();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', {name: 'Apply'}),
      );
    });
  });

  it('a sheet with read-only content focuses its labelled surface (FR2)', async () => {
    isCompactTouch = true;
    render(
      <Popover
        label="About this filter"
        presentation="adaptive"
        content={<p>Shows open items only.</p>}>
        <Button label="Filter">Filter</Button>
      </Popover>,
    );
    await tapTrigger();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('group', {name: 'About this filter'}),
      );
    });
  });

  it('an overflowing sheet still focuses its first content control, not its scroll area (FR2)', async () => {
    isCompactTouch = true;
    render(
      <Popover
        label="Filters"
        presentation="adaptive"
        content={<button type="button">Apply</button>}>
        <Button label="Filter">Filter</Button>
      </Popover>,
    );
    // The closed sheet is mounted at rest. BottomSheet's scroll area becomes a
    // tab stop when its content overflows: make it one before opening.
    const panel = await vi.waitFor(() => {
      const element =
        sheetDialog()?.querySelector<HTMLElement>('[tabindex="-1"]');
      expect(element).toBeTruthy();
      return element!;
    });
    for (const child of Array.from(panel.children)) {
      (child as HTMLElement).tabIndex = 0;
    }
    await tapTrigger();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', {name: 'Apply'}),
      );
    });
  });

  it('the sheet focuses its first content control again at each opening (FR2)', async () => {
    isCompactTouch = true;
    render(
      <Popover
        label="Filters"
        presentation="bottom-sheet"
        content={<button type="button">Apply</button>}>
        <Button label="Filter">Filter</Button>
      </Popover>,
    );
    const apply = () => screen.getByRole('button', {name: 'Apply'});
    await tapTrigger();
    await vi.waitFor(() => expect(document.activeElement).toBe(apply()));
    // A second tap on the trigger closes the sheet; a third opens it again.
    await tapTrigger();
    // The exit ends on the panel's transform transition, which jsdom never
    // runs: end it by hand.
    const panel = document.querySelector('dialog [tabindex="-1"]');
    if (panel != null) {
      fireEvent.transitionEnd(panel, {propertyName: 'transform'});
    }
    await vi.waitFor(
      () => expect(document.querySelector('dialog[open]')).toBeNull(),
      {timeout: 3000},
    );
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await tapTrigger();
    await vi.waitFor(() => expect(document.activeElement).toBe(apply()));
  });

  it('adaptive: a desktop keeps the anchored popover', async () => {
    render(<Filters presentation="adaptive" />);
    await tapTrigger();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(sheetDialog()).toBeNull();
    expect(openLayer()).not.toBeNull();
  });

  it('bottom-sheet: the sheet on any screen', async () => {
    render(<Filters presentation="bottom-sheet" />);
    await tapTrigger();
    await vi.waitFor(() => {
      expect(sheetDialog()).toHaveAttribute('open');
    });
  });

  it('closing the sheet reports it and collapses the trigger', async () => {
    isCompactTouch = true;
    const onOpenChange = vi.fn();
    render(<Filters presentation="adaptive" onOpenChange={onOpenChange} />);
    await tapTrigger();
    const dialog = await vi.waitFor(() => {
      const element = sheetDialog();
      expect(element).toHaveAttribute('open');
      return element!;
    });
    act(() => {
      fireEvent.keyDown(dialog, {key: 'Escape'});
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('controlled: isOpen drives the sheet, and the trigger asks to close it', async () => {
    isCompactTouch = true;
    const changes: boolean[] = [];
    function Controlled() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open from outside
          </button>
          <Popover
            label="Filters"
            presentation="adaptive"
            isOpen={isOpen}
            onOpenChange={next => {
              changes.push(next);
              setIsOpen(next);
            }}
            content={<button type="button">Apply</button>}>
            <Button label="Filter">Filter</Button>
          </Popover>
        </>
      );
    }
    render(<Controlled />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Open from outside'}));
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(sheetDialog()).toHaveAttribute('open');
    });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    await tapTrigger();
    expect(changes).toEqual([false]);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('holds one instance of the content: the sheet\u2019s, while the sheet is the surface', async () => {
    isCompactTouch = true;
    render(<Filters presentation="adaptive" />);
    // Before it opens, the content sits where an open would show it.
    expect(
      screen.getAllByRole('button', {name: 'Apply', hidden: true}),
    ).toHaveLength(1);
    await tapTrigger();
    await vi.waitFor(() => {
      expect(sheetDialog()).toHaveAttribute('open');
    });
    const applies = screen.getAllByRole('button', {
      name: 'Apply',
      hidden: true,
    });
    expect(applies).toHaveLength(1);
    expect(sheetDialog()!.contains(applies[0])).toBe(true);
  });

  it('a sheet light-dismisses whatever hasLightDismiss says: a tap outside closes it (DEC-8)', async () => {
    isCompactTouch = true;
    const onOpenChange = vi.fn();
    render(
      <Filters
        presentation="adaptive"
        hasLightDismiss={false}
        hasEscapeDismiss={false}
        onOpenChange={onOpenChange}
      />,
    );
    await tapTrigger();
    const dialog = await vi.waitFor(() => {
      const element = sheetDialog();
      expect(element).toHaveAttribute('open');
      return element!;
    });
    // Never an alertdialog: the sheet always has a way out.
    expect(dialog).not.toHaveAttribute('role', 'alertdialog');
    // The scrim is the dialog element itself.
    act(() => {
      fireEvent.click(dialog);
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a swipe down closes a sheet with hasLightDismiss={false} (DEC-8)', async () => {
    isCompactTouch = true;
    const onOpenChange = vi.fn();
    render(
      <Filters
        presentation="adaptive"
        hasLightDismiss={false}
        hasEscapeDismiss={false}
        onOpenChange={onOpenChange}
      />,
    );
    await tapTrigger();
    const handle = await vi.waitFor(() => {
      const element = sheetDialog()?.querySelector<HTMLElement>(
        '.astryx-bottom-sheet [aria-hidden="true"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    // jsdom's PointerEvents carry no clientY, so these carry the coordinates
    // the sheet's drag reads.
    act(() => {
      fireEvent.pointerDown(handle, {
        pointerId: 1,
        clientY: 0,
        button: 0,
        isPrimary: true,
      });
      fireEvent.pointerMove(handle, {pointerId: 1, clientY: 40});
      fireEvent.pointerMove(handle, {pointerId: 1, clientY: 120});
      fireEvent.pointerUp(handle, {pointerId: 1, clientY: 120});
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('in a sheet, Escape follows hasEscapeDismiss', async () => {
    isCompactTouch = true;
    const onOpenChange = vi.fn();
    const {unmount} = render(
      <Filters
        presentation="adaptive"
        hasEscapeDismiss={false}
        onOpenChange={onOpenChange}
      />,
    );
    await tapTrigger();
    const blocked = await vi.waitFor(() => {
      const element = sheetDialog();
      expect(element).toHaveAttribute('open');
      return element!;
    });
    onOpenChange.mockClear();
    act(() => {
      fireEvent.keyDown(blocked, {key: 'Escape'});
      fireEvent(blocked, new Event('cancel', {cancelable: true}));
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    unmount();

    render(<Filters presentation="adaptive" onOpenChange={onOpenChange} />);
    await tapTrigger();
    const allowed = await vi.waitFor(() => {
      const element = sheetDialog();
      expect(element).toHaveAttribute('open');
      return element!;
    });
    act(() => {
      fireEvent.keyDown(allowed, {key: 'Escape'});
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the fallback close control in the sheet, hidden until reached, as the anchored surface does', async () => {
    isCompactTouch = true;
    const onOpenChange = vi.fn();
    render(<Filters presentation="adaptive" onOpenChange={onOpenChange} />);
    await tapTrigger();
    const close = await vi.waitFor(() => {
      const element = sheetDialog()?.querySelector<HTMLElement>(
        'button[data-astryx-popover-fallback-close]',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(close).toHaveTextContent('Close popover');
    // The Button itself carries the hidden-until-focused styles: no wrapper
    // element (architecture:component-style-authoring INV7).
    expect(
      close.parentElement?.closest('[data-astryx-popover-fallback-close]'),
    ).toBeNull();
    act(() => {
      fireEvent.click(close);
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('controlled: a phone turned past the compact width keeps its sheet until it closes', async () => {
    isCompactTouch = true;
    const changes: boolean[] = [];
    function Controlled() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <Popover
          label="Filters"
          presentation="adaptive"
          isOpen={isOpen}
          onOpenChange={next => {
            changes.push(next);
            setIsOpen(next);
          }}
          content={<button type="button">Apply</button>}>
          <Button label="Filter">Filter</Button>
        </Popover>
      );
    }
    render(<Controlled />);
    await vi.waitFor(() => {
      expect(sheetDialog()).toHaveAttribute('open');
    });
    // Landscape on a wide phone: no longer a compact touch screen.
    setCompactTouch(false);
    expect(sheetDialog()).toHaveAttribute('open');
    expect(document.querySelector('[popover]:popover-open')).toBeNull();
    expect(changes).toEqual([]);
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('adaptive: a sheet closed after the screen stops being compact plays its exit and hands focus back to the trigger', async () => {
    isCompactTouch = true;
    const closedWhileConnected: boolean[] = [];
    const close = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      closedWhileConnected.push(this.isConnected);
      close.call(this);
    });
    render(<Filters presentation="adaptive" />);
    trigger().focus();
    await tapTrigger();
    const dialog = await vi.waitFor(() => {
      const element = sheetDialog();
      expect(element).toHaveAttribute('open');
      return element!;
    });
    // An iPad mini turned to landscape: no longer a compact touch screen.
    setCompactTouch(false);
    act(() => {
      fireEvent.keyDown(dialog, {key: 'Escape'});
    });
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    // The sheet that was open stays mounted through its exit.
    expect(dialog.isConnected).toBe(true);
    const panel = dialog.querySelector<HTMLElement>('.astryx-bottom-sheet');
    expect(panel).not.toBeNull();
    act(() => {
      fireEvent.transitionEnd(panel!, {propertyName: 'transform'});
    });
    // Its dialog closes in the document, and focus is back on the trigger.
    expect(dialog).not.toHaveAttribute('open');
    expect(closedWhileConnected).toEqual([true]);
    expect(document.activeElement).toBe(trigger());
    // The next open on the wide screen is the anchored popover, with the
    // content.
    await tapTrigger();
    await vi.waitFor(() => {
      expect(openLayer()).not.toBeNull();
    });
    expect(openLayer()).toHaveTextContent('Apply');
  });

  it('mounts one presentation at a time, with the content once', async () => {
    // The elements a render adds to the document.
    let before = 0;
    const elements = () => document.body.querySelectorAll('*').length - before;
    // A desktop: the anchored layer, at rest and open.
    before = document.body.querySelectorAll('*').length;
    const desktop = render(<Filters presentation="adaptive" />);
    const desktopAtRest = elements();
    await tapTrigger();
    const desktopOpen = elements();
    desktop.unmount();
    // A compact touch screen: the closed sheet stands in place of the
    // anchored layer, holding the content, with no more elements.
    isCompactTouch = true;
    before = document.body.querySelectorAll('*').length;
    render(<Filters presentation="adaptive" />);
    const dialog = await vi.waitFor(() => {
      const element = sheetDialog();
      expect(element).not.toBeNull();
      return element!;
    });
    expect(dialog).not.toHaveAttribute('open');
    expect(document.querySelector('[popover]')).toBeNull();
    expect(
      screen.getAllByRole('button', {name: 'Apply', hidden: true}),
    ).toHaveLength(1);
    const touchAtRest = elements();
    expect(touchAtRest).toBeLessThanOrEqual(desktopAtRest);
    // Open: still the one presentation.
    await tapTrigger();
    await vi.waitFor(() => {
      expect(dialog).toHaveAttribute('open');
    });
    expect(document.querySelector('[popover]')).toBeNull();
    expect(screen.getAllByRole('button', {name: 'Apply'})).toHaveLength(1);
    // Open under touch, the sheet adds at most its edge tint, within the
    // open-layer allowance (spec:AST-017 FR60).
    expect(elements()).toBeLessThanOrEqual(desktopOpen + 1);
    // Closed: the sheet stays, closed, as it was at rest.
    act(() => {
      fireEvent.keyDown(dialog, {key: 'Escape'});
    });
    act(() => {
      fireEvent.transitionEnd(
        dialog.querySelector<HTMLElement>('.astryx-bottom-sheet')!,
        {propertyName: 'transform'},
      );
    });
    expect(dialog).not.toHaveAttribute('open');
    expect(sheetDialog()).toBe(dialog);
    expect(elements()).toBe(touchAtRest);
  });

  it('keeps state in the content across sheet openings, as the anchored popover does', async () => {
    isCompactTouch = true;
    render(
      <Popover
        label="Filters"
        presentation="adaptive"
        content={<input type="checkbox" aria-label="Archived" />}>
        <Button label="Filter">Filter</Button>
      </Popover>,
    );
    await tapTrigger();
    const dialog = await vi.waitFor(() => {
      const element = sheetDialog();
      expect(element).toHaveAttribute('open');
      return element!;
    });
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', {name: 'Archived'}));
    });
    expect(screen.getByRole('checkbox', {name: 'Archived'})).toBeChecked();
    act(() => {
      fireEvent.keyDown(dialog, {key: 'Escape'});
    });
    act(() => {
      fireEvent.transitionEnd(
        dialog.querySelector<HTMLElement>('.astryx-bottom-sheet')!,
        {propertyName: 'transform'},
      );
    });
    await tapTrigger();
    await vi.waitFor(() => {
      expect(sheetDialog()).toHaveAttribute('open');
    });
    expect(screen.getByRole('checkbox', {name: 'Archived'})).toBeChecked();
  });

  it('a trigger whose popover has no dialog role says it opens a dialog while the sheet is the surface', async () => {
    const Menu = () => (
      <Popover
        label="Filters"
        role="none"
        presentation="adaptive"
        content={<button type="button">Apply</button>}>
        <Button label="Filter">Filter</Button>
      </Popover>
    );
    // A desktop: the anchored layer, which is not a dialog.
    const desktop = render(<Menu />);
    expect(trigger()).toHaveAttribute('aria-haspopup', 'true');
    desktop.unmount();
    // A compact touch screen: the sheet, a modal dialog.
    isCompactTouch = true;
    render(<Menu />);
    await vi.waitFor(() => {
      expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
    });
    await tapTrigger();
    await vi.waitFor(() => {
      expect(sheetDialog()).toHaveAttribute('open');
    });
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('a sheet with neither dismissal renders no more elements than the anchored popover', async () => {
    const Required = () => (
      <Popover
        label="Filters"
        presentation="adaptive"
        hasLightDismiss={false}
        hasEscapeDismiss={false}
        content={<p>Showing archived items</p>}>
        <Button label="Filter">Filter</Button>
      </Popover>
    );
    let before = 0;
    const elements = () => document.body.querySelectorAll('*').length - before;
    // A desktop: the anchored popover, open.
    before = document.body.querySelectorAll('*').length;
    const desktop = render(<Required />);
    await tapTrigger();
    const anchoredOpen = elements();
    desktop.unmount();
    // A phone: the sheet, open. BottomSheet's frame (the dialog, the panel,
    // its grab bar, body and content box) matches the anchored layer's
    // (sentinel, layer, surface, content box, fallback wrapper), and the
    // sheet's Close button is the Button itself.
    isCompactTouch = true;
    before = document.body.querySelectorAll('*').length;
    render(<Required />);
    await tapTrigger();
    await vi.waitFor(() => {
      expect(sheetDialog()).toHaveAttribute('open');
    });
    // Plus the edge tint, its own element while presented (spec:AST-017 FR60).
    expect(elements()).toBe(anchoredOpen + 1);
  });

  it('without a Theme provider, adaptive measures compact against the registered root theme', async () => {
    defineTheme({
      name: 'root-popover-points',
      adaptations: {widthBreakpoints: {md: 900}},
    });
    const originalGetAttribute = document.documentElement.getAttribute.bind(
      document.documentElement,
    );
    const rootTheme = vi
      .spyOn(document.documentElement, 'getAttribute')
      .mockImplementation(name =>
        name === 'data-astryx-theme'
          ? 'root-popover-points'
          : originalGetAttribute(name),
      );
    try {
      render(<Filters presentation="adaptive" />);
      expect(window.matchMedia).toHaveBeenCalledWith(
        compactDefinition({md: 900}).coarsePointerQuery,
      );
      expect(window.matchMedia).not.toHaveBeenCalledWith(COMPACT_TOUCH_QUERY);
    } finally {
      rootTheme.mockRestore();
    }
  });

  it('a render-prop trigger gets the sheet state', async () => {
    isCompactTouch = true;
    render(
      <Popover
        label="Filters"
        presentation="adaptive"
        content={<button type="button">Apply</button>}>
        {props => (
          <button type="button" {...props}>
            Filter
          </button>
        )}
      </Popover>,
    );
    await tapTrigger();
    await vi.waitFor(() => {
      expect(sheetDialog()).toHaveAttribute('open');
    });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(
      sheetDialog()!.contains(
        document.getElementById(trigger().getAttribute('aria-controls') ?? ''),
      ),
    ).toBe(true);
  });
});

// Keeps React in scope for the JSX runtime in this file.
void React;
