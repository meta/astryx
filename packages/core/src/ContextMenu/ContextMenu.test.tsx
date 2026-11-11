// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file ContextMenu.test.tsx
 * @input Uses vitest, @testing-library/react, ContextMenu component
 * @output Unit tests for ContextMenu component behavior
 * @position Testing; validates ContextMenu.tsx implementation
 *
 * SYNC: When ContextMenu.tsx changes, update tests to match new behavior
 */

import {useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeAll,
  beforeEach,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
  cleanup,
  createEvent,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {readFileSync} from 'node:fs';
import {ContextMenu} from './ContextMenu';
import {ContextMenuGroup} from './index';
import {
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
} from './index';
import {DropdownMenuItem} from '../DropdownMenu/DropdownMenuItem';
import {DropdownMenuSubMenu} from '../DropdownMenu/DropdownMenuSubMenu';
import {Divider} from '../Divider';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {warmMenuBottomSheet} from '../DropdownMenu/__tests__/warmMenuBottomSheet';
import {COMPACT_TOUCH_PRESENTATION_QUERY} from '../hooks/useAdaptivePresentation';
import {COMPACT_QUERY, TOUCH_QUERY} from '../utils/touchPresentation';
import {HAPTIC_VIBRATION_PATTERNS} from '../motion/uikit';
import {contextMenu} from '../motion/uikit/contextMenu';

// The touch sheet is loaded lazily; resolve its modules once up front, so
// ContextMenu's own lazy sheet renders within the cases' waitFor.
beforeAll(warmMenuBottomSheet, 20000);

function NestedDismissibleLayer({onDismiss}: {onDismiss: () => void}) {
  const [isOpen, setIsOpen] = useState(true);
  const containerRef = useRef<HTMLButtonElement>(null);

  useLayerDismissal({
    isActive: isOpen,
    onDismiss: () => {
      setIsOpen(false);
      onDismiss();
    },
    getContainer: () => containerRef.current,
  });

  // Portaled outside the menu's DOM, so only the layer depth ContextMenu
  // provides can rank it above the menu.
  return isOpen
    ? createPortal(
        <button ref={containerRef} type="button">
          Nested layer
        </button>,
        document.body,
      )
    : null;
}

beforeEach(() => {
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
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  const originalMatches = HTMLElement.prototype.matches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    return originalMatches.call(this, selector);
  };
});

/** Opens the menu: its layer mounts at the first open (ContextMenu.tsx). */
function openMenu() {
  fireEvent.contextMenu(screen.getByText('Right-click me'));
}

describe('ContextMenu', () => {
  it('renders trigger children', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    expect(screen.getByText('Right-click me')).toBeInTheDocument();
  });

  it('renders menu with role="menu"', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();
    expect(screen.getByRole('menu', {hidden: true})).toBeInTheDocument();
  });

  it('typeahead focuses the matching menu item (menus-11)', () => {
    render(
      <ContextMenu items={[{label: 'Cut'}, {label: 'Copy'}, {label: 'Paste'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Right-click me'));
    const menu = screen.getByRole('menu', {hidden: true});
    fireEvent.keyDown(menu, {key: 'p'});
    expect(
      screen.getByRole('menuitem', {name: 'Paste', hidden: true}),
    ).toHaveFocus();
  });

  it('gives the menu an accessible name (menus-13)', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();
    // Defaults to "Context menu"; overridable via label.
    expect(
      screen.getByRole('menu', {name: 'Context menu', hidden: true}),
    ).toBeInTheDocument();
  });

  it('uses a custom label', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]} label="Row actions">
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();
    expect(
      screen.getByRole('menu', {name: 'Row actions', hidden: true}),
    ).toBeInTheDocument();
  });

  it('suppresses native text selection on the long-press trigger', () => {
    const source = readFileSync(
      'packages/core/src/ContextMenu/ContextMenu.tsx',
      'utf8',
    );

    expect(source).toMatch(
      /trigger:[\s\S]*?WebkitTouchCallout: 'none',[\s\S]*?WebkitUserSelect: 'none',[\s\S]*?userSelect: 'none'/,
    );
  });

  it('does not put aria-haspopup on the role-less trigger wrapper (menus-15)', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
        <div>Right-click me</div>
      </ContextMenu>,
    );
    expect(screen.getByTestId('ctx')).not.toHaveAttribute('aria-haspopup');
  });

  // architecture:interaction-modality INV1: a pointer-opened menu focuses its
  // first row without the keyboard ring; a keyboard open keeps it.
  it('focuses the first row with the focus the last input calls for', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    render(
      <ContextMenu items={[{label: 'Cut'}, {label: 'Copy'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    const target = screen.getByText('Right-click me');
    fireEvent.pointerDown(target, {pointerType: 'mouse', button: 2});
    fireEvent.contextMenu(target);
    await waitFor(() =>
      expect(focus).toHaveBeenCalledWith(
        expect.objectContaining({focusVisible: false}),
      ),
    );
    expect(focus.mock.contexts.at(-1)).toHaveTextContent('Cut');
    focus.mockRestore();
  });

  it('opens menu on right-click', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
  });

  it('composes the consumer context-menu handler with menu opening', () => {
    const onContextMenu = vi.fn();
    render(
      <ContextMenu items={[{label: 'Item 1'}]} onContextMenu={onContextMenu}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    expect(onContextMenu).toHaveBeenCalledOnce();
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledOnce();
  });

  it('keeps component-owned opening when a consumer prevents default', () => {
    render(
      <ContextMenu
        items={[{label: 'Item 1'}]}
        onContextMenu={event => event.preventDefault()}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledOnce();
  });

  it('lets a nested layer consume Escape before the context menu', () => {
    const onNestedDismiss = vi.fn();
    render(
      <ContextMenu
        menuContent={<NestedDismissibleLayer onDismiss={onNestedDismiss} />}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    const nestedLayer = screen.getByRole('button', {
      name: 'Nested layer',
      hidden: true,
    });
    nestedLayer.focus();
    fireEvent.keyDown(nestedLayer, {key: 'Escape'});

    expect(onNestedDismiss).toHaveBeenCalledOnce();
    expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();

    fireEvent.keyDown(document, {key: 'Escape'});
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalledOnce();
  });

  it('opens the real menu content in a BottomSheet when requested', async () => {
    render(
      <ContextMenu
        presentation="bottom-sheet"
        label="Row actions"
        items={[{label: 'Edit'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    await waitFor(() =>
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce(),
    );
    const dialog = screen.getByRole('dialog', {name: 'Row actions'});
    const actionList = dialog.querySelector('[data-autofocus]');
    expect(actionList).not.toBeNull();
    await waitFor(() => expect(actionList).toHaveFocus());
    expect(screen.getByRole('button', {name: 'Edit'})).not.toHaveFocus();
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  });

  it('drills into nested data items inside the BottomSheet', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();

    render(
      <ContextMenu
        presentation="bottom-sheet"
        label="Row actions"
        items={[
          {
            label: 'Move to project',
            items: [{label: 'Apollo launch', onClick: onMove}],
          },
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    // The sheet is lazy: its first render suspends once even when the module
    // is already loaded, so wait for the row rather than relying on an
    // earlier case to have rendered a sheet.
    await user.click(
      await screen.findByRole('button', {name: 'Move to project'}),
    );

    const submenuHeading = screen.getByRole('heading', {
      name: 'Move to project',
    });
    expect(submenuHeading).toBeInTheDocument();
    await waitFor(() => expect(submenuHeading).toHaveFocus());
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', {name: 'Apollo launch'}));
    expect(onMove).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  for (const mode of ['items', 'compound'] as const) {
    it(`insets a ${mode} menu sheet itself and publishes the inset to its rows`, async () => {
      render(
        mode === 'items' ? (
          <ContextMenu presentation="bottom-sheet" items={[{label: 'Edit'}]}>
            <div>Right-click me</div>
          </ContextMenu>
        ) : (
          <ContextMenu
            presentation="bottom-sheet"
            menuContent={<DropdownMenuItem label="Edit" />}>
            <div>Right-click me</div>
          </ContextMenu>
        ),
      );
      fireEvent.contextMenu(screen.getByText('Right-click me'));
      const content = await waitFor(() => {
        const element = document.querySelector<HTMLElement>(
          'dialog .astryx-context-menu',
        );
        expect(element).not.toBeNull();
        return element as HTMLElement;
      });
      // No Section wrapper: the menu element keeps the 4px side inset plus
      // its own 4px, and its own 4px below the band the sheet keeps under its
      // grab bar, and publishes the padding it applies.
      expect(content.parentElement?.closest('.astryx-section')).toBeNull();
      expect(content).toHaveStyle({
        paddingTop: 'var(--spacing-1)',
        paddingInline: 'calc(var(--spacing-1) + var(--spacing-1))',
        '--container-padding-block-start': 'var(--spacing-1)',
        '--container-padding-inline-start':
          'calc(var(--spacing-1) + var(--spacing-1))',
      });
    });
  }

  it('uses the BottomSheet for adaptive presentation on compact touch', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        // A compact touch screen: a coarse primary pointer, a narrow viewport.
        matches:
          query === COMPACT_TOUCH_PRESENTATION_QUERY ||
          query === TOUCH_QUERY ||
          query === COMPACT_QUERY,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    render(
      <ContextMenu presentation="adaptive" items={[{label: 'Edit'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    await waitFor(() =>
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce(),
    );
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  });

  it('closes on Escape even when opened without auto-focus', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
    // Focus is not inside the menu, so the Escape path must be document-level.
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it.each(['open', 'closed', 'nested'] as const)(
    'judges presses once inside a %s shadow root',
    mode => {
      // Under the touch model, so a touch on the host closes the menu.
      stubPointer(true);
      const host = document.createElement('div');
      document.body.append(host);
      let root = host.attachShadow({mode: mode === 'open' ? 'open' : 'closed'});
      if (mode === 'nested') {
        const innerHost = document.createElement('div');
        root.append(innerHost);
        root = innerHost.attachShadow({mode: 'closed'});
      }
      const container = document.createElement('div');
      root.append(container);
      try {
        render(
          <ContextMenu items={[{label: 'Item 1'}]}>
            <div>Right-click me</div>
          </ContextMenu>,
          {container},
        );
        const trigger = container.querySelector('div div')!;
        fireEvent.contextMenu(trigger);
        // At the document a press on the menu is retargeted to a shadow host.
        const item = container.querySelector('[role="menuitem"]')!;
        fireEvent.mouseDown(item, {composed: true});
        expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
        // A touch on the menu is inside too, through its lift.
        const onItem = {pointerType: 'touch', pointerId: 1, composed: true};
        fireEvent.pointerDown(item, onItem);
        fireEvent.pointerUp(item, onItem);
        expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
        // A mouse press on the host itself is outside the menu. Its
        // pointerdown comes first, as a browser sends it.
        fireEvent.pointerDown(host, {pointerType: 'mouse', pointerId: 3});
        fireEvent.mouseDown(host);
        expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
        // A touch on the host closes the menu at its lift.
        vi.mocked(HTMLElement.prototype.hidePopover).mockClear();
        fireEvent.contextMenu(trigger);
        const onHost = {pointerType: 'touch', pointerId: 2};
        fireEvent.pointerDown(host, onHost);
        expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
        fireEvent.pointerUp(host, onHost);
        expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
      } finally {
        host.remove();
        vi.unstubAllGlobals();
      }
    },
  );

  it('closes the menu when Tab is pressed inside it (APG menu pattern)', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();

    const menu = screen.getByRole('menu', {hidden: true});
    fireEvent.keyDown(menu, {key: 'Tab'});
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('ignores Escape during IME composition', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    fireEvent.keyDown(document, {key: 'Escape', isComposing: true});
    expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
  });

  it('restores focus to the trigger on close', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <button type="button">Right-click me</button>
      </ContextMenu>,
    );

    const trigger = screen.getByRole('button', {name: 'Right-click me'});
    trigger.focus();
    expect(trigger).toHaveFocus();

    fireEvent.contextMenu(trigger);
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(trigger).toHaveFocus();
  });

  it('prevents default context menu on right-click', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    const event = new MouseEvent('contextmenu', {bubbles: true});
    const preventDefault = vi.spyOn(event, 'preventDefault');
    screen.getByText('Right-click me').dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('prevents default context menu on the opened menu container', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    const menu = screen.getByRole('menu', {hidden: true});
    const event = new MouseEvent('contextmenu', {bubbles: true});
    const preventDefault = vi.spyOn(event, 'preventDefault');
    menu.dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('does not open when isDisabled is true', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]} isDisabled>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  });

  it('applies data-testid to trigger wrapper', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]} data-testid="my-context-menu">
        <div>Right-click me</div>
      </ContextMenu>,
    );
    expect(screen.getByTestId('my-context-menu')).toBeInTheDocument();
  });

  it('opens from a keyboard-invoked contextmenu (Shift+F10 / Menu key)', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
        <div>Right-click me</div>
      </ContextMenu>,
    );
    const trigger = screen.getByTestId('ctx');
    // Anchor the trigger box so the rect fallback has a position to read.
    trigger.getBoundingClientRect = () =>
      ({
        left: 40,
        top: 10,
        bottom: 30,
        right: 100,
        width: 60,
        height: 20,
      }) as DOMRect;
    // Keyboard-initiated contextmenu: coords are (0,0) and detail is 0.
    fireEvent.contextMenu(trigger, {clientX: 0, clientY: 0, detail: 0});
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
  });
});

describe('a menu that was never opened', () => {
  it('adds no popover element and no menu until its first open, which mounts and shows it', () => {
    render(
      <ContextMenu items={[{label: 'Cut'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    expect(document.querySelector('[popover]')).toBeNull();
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
    openMenu();
    const popover = document.querySelector('[popover]');
    expect(popover).not.toBeNull();
    expect(popover?.hasAttribute('popover-open')).toBe(true);
    expect(
      screen.getByRole('menuitem', {name: 'Cut', hidden: true}),
    ).toBeInTheDocument();
  });

  it('shows a first open as its layer attaches, and a later open within the event', () => {
    render(
      <ContextMenu items={[{label: 'Cut'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    const trigger = screen.getByText('Right-click me');
    const open = () =>
      trigger.dispatchEvent(
        new MouseEvent('contextmenu', {bubbles: true, cancelable: true}),
      );
    const showPopover = vi.mocked(HTMLElement.prototype.showPopover);
    act(() => {
      open();
      // No layer yet: the show waits for its popover element.
      expect(showPopover).not.toHaveBeenCalled();
    });
    // The commit attached the layer, which showed it.
    expect(showPopover).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, {key: 'Escape'});
    act(() => {
      open();
      // Mounted: shown in the event itself.
      expect(showPopover).toHaveBeenCalledTimes(2);
    });
  });

  it('a keyboard open moves focus to the first item once the menu shows, and Escape returns it', async () => {
    render(
      <ContextMenu items={[{label: 'Cut'}, {label: 'Copy'}]}>
        <button type="button">Right-click me</button>
      </ContextMenu>,
    );
    const button = screen.getByRole('button', {name: 'Right-click me'});
    button.focus();
    // Shift+F10 / the Menu key: a contextmenu at (0, 0) with no click count.
    fireEvent.contextMenu(button, {clientX: 0, clientY: 0, detail: 0});
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Cut', hidden: true}),
      ).toHaveFocus();
    });
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(button).toHaveFocus();
  });

  it('carries the same trigger and cursor anchor attributes as after it opened', () => {
    render(
      <ContextMenu items={[{label: 'Cut'}]} data-testid="ctx">
        <div>Right-click me</div>
      </ContextMenu>,
    );
    const trigger = screen.getByTestId('ctx');
    const describe = () => ({
      trigger: [...trigger.attributes].map(a => `${a.name}=${a.value}`),
      anchor: [...(trigger.lastElementChild?.attributes ?? [])].map(
        a => a.name,
      ),
      anchorName: (
        (trigger.lastElementChild as HTMLElement | null)?.style as unknown as
          Record<string, string> | undefined
      )?.anchorName,
    });
    const before = describe();
    openMenu();
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(describe()).toEqual(before);
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
    expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
  });

  it('keeps its layer mounted after the first close, and a second open shows the same menu', () => {
    render(
      <ContextMenu items={[{label: 'Cut'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();
    const menu = screen.getByRole('menu', {hidden: true});
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(menu.isConnected).toBe(true);
    expect(
      document.querySelector('[popover]')?.hasAttribute('popover-open'),
    ).toBe(false);
    openMenu();
    expect(screen.getByRole('menu', {hidden: true})).toBe(menu);
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(2);
  });
});

/**
 * A finger on the real gesture host: touch events with explicit contacts,
 * stamped on the (faked) `performance.now()` clock the host reads.
 */
interface Contact {
  id: number;
  x: number;
  y: number;
}

function dispatchTouch(
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  target: EventTarget,
  changed: Contact[],
  all: Contact[],
): Event {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const toTouch = (contact: Contact) => ({
    identifier: contact.id,
    clientX: contact.x,
    clientY: contact.y,
    target,
  });
  Object.defineProperty(event, 'changedTouches', {value: changed.map(toTouch)});
  Object.defineProperty(event, 'touches', {value: all.map(toTouch)});
  Object.defineProperty(event, 'timeStamp', {value: performance.now()});
  target.dispatchEvent(event);
  return event;
}

function finger(target: EventTarget, id = 1, x = 20, y = 20) {
  const contact = {id, x, y};
  return {
    down: () => dispatchTouch('touchstart', target, [contact], [contact]),
    moveTo: (nx: number, ny: number) => {
      contact.x = nx;
      contact.y = ny;
      return dispatchTouch('touchmove', target, [contact], [contact]);
    },
    up: () => dispatchTouch('touchend', target, [contact], []),
  };
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** The primary pointer answers `matches` to `(pointer: coarse)`. */
function stubPointer(isCoarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: isCoarse && query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/**
 * A finger on iOS in jsdom: a coarse pointer, on an engine that supports
 * `-webkit-touch-callout` (WebKit on iOS). Undone by vi.unstubAllGlobals().
 */
function stubIosTouch() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal('CSS', {
    ...(globalThis as {CSS?: object}).CSS,
    supports: (condition: string) =>
      condition.includes('-webkit-touch-callout'),
  });
}

/** A finger on Android: a coarse pointer, no WebKit touch callout. */
function stubAndroidTouch() {
  stubPointer(true);
}

// The gesture host lives as long as the document and remembers the latest
// event time. Each install of fake timers restarts `performance.now()` near 0.
// So every case moves the faked clock past the ones before it.
let clockEpoch = 0;

// One touch model on every touch device (#8316): iOS and Android alike.
describe.each([
  ['iOS', stubIosTouch],
  ['Android', stubAndroidTouch],
] as const)(
  'ContextMenu under a finger on %s: UIKit’s long-press timeline',
  (_platform, stubTouch) => {
    beforeEach(() => {
      stubTouch();
      vi.useFakeTimers({
        toFake: [
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'performance',
          'Date',
        ],
      });
      clockEpoch += 100_000;
      vi.advanceTimersByTime(clockEpoch);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    function renderMenu(
      props: {
        isDisabled?: boolean;
        presentation?: 'popover' | 'bottom-sheet';
        triggerAs?: 'div' | 'span';
        onTouchStart?: (event: React.TouchEvent) => void;
        onTouchEnd?: (event: React.TouchEvent) => void;
      } = {},
    ) {
      render(
        <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx" {...props}>
          <div>Long-press me</div>
        </ContextMenu>,
      );
      return screen.getByTestId('ctx');
    }

    it('opens for a finger still down at 735 ms (iOS 26.2), not a millisecond before', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(contextMenu.press.menuDisplayMs - 1);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
      advance(1);
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
      press.up();
    });

    it('mounts the menu, closed, at the commit, and shows that element at 735 ms', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(contextMenu.press.commitMs - 1);
      expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
      advance(1);
      const menu = screen.getByRole('menu', {hidden: true});
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
      advance(contextMenu.press.menuDisplayMs - contextMenu.press.commitMs);
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('menu', {hidden: true})).toBe(menu);
      press.up();
    });

    it('shows the menu mounted at the commit at the lift that comes before 735 ms', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(529);
      const menu = screen.getByRole('menu', {hidden: true});
      act(() => {
        press.up();
      });
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('menu', {hidden: true})).toBe(menu);
    });

    it('mounts no menu for a press lifted before the commit', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(250);
      press.up();
      advance(1000);
      expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
    });

    it.each([
      [
        'a move past the tolerance',
        (trigger: HTMLElement) => {
          const moved = {id: 1, x: 20, y: 50};
          dispatchTouch('touchmove', trigger, [moved], [moved]);
        },
      ],
      [
        'a touch the browser cancels',
        (trigger: HTMLElement) => {
          dispatchTouch('touchcancel', trigger, [{id: 1, x: 20, y: 20}], []);
        },
      ],
    ])(
      'unmounts the menu mounted at the commit after %s, before 735 ms',
      (_, end) => {
        const trigger = renderMenu();
        const press = finger(trigger);
        press.down();
        advance(contextMenu.press.commitMs + 50);
        expect(screen.getByRole('menu', {hidden: true})).toBeInTheDocument();
        act(() => {
          end(trigger);
        });
        advance(contextMenu.press.menuDisplayMs);
        expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
        expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
      },
    );

    it('leaves a disabled trigger out of the press machine (spec:AST-094 FR24)', () => {
      const trigger = renderMenu({isDisabled: true});
      expect(trigger).not.toHaveAttribute('data-astryx-pressable');
    });

    it('lights no row when a touch opens it: focus goes to the menu itself, not its first item', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(contextMenu.press.menuDisplayMs);
      // The focus moves on the next frame.
      advance(20);
      expect(screen.getByRole('menu', {hidden: true})).toHaveFocus();
      expect(
        screen.getByRole('menuitem', {name: 'Item 1', hidden: true}),
      ).not.toHaveFocus();
      press.up();
    });

    it('opens at the lift for a finger lifted after the commit (400 ms), as UIKit does', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(529);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
      // A first open mounts the menu's layer, which shows it as it attaches.
      act(() => {
        press.up();
      });
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    });

    it('opens nothing for a drag past the tolerance after the commit, before the menu', () => {
      const trigger = renderMenu();
      const press = finger(trigger, 1, 20, 20);
      press.down();
      advance(500);
      press.moveTo(20, 50);
      advance(500);
      press.up();
      advance(100);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    });

    it('keeps the menu open as the finger lifts: the lift sends no click or compatibility mouse events', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(contextMenu.press.menuDisplayMs);
      const lift = press.up();
      // A cancelled touchend is the one signal that stops the browser's click
      // and its compatibility mousedown, which would read as a press outside.
      expect(lift.defaultPrevented).toBe(true);
      expect(screen.getByRole('menu', {hidden: true})).toBeInTheDocument();
      expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
    });

    it('still opens at 735 ms beside a consumer onTouchStart, which runs (#7167)', () => {
      const onTouchStart = vi.fn();
      const trigger = renderMenu({onTouchStart});
      const press = finger(trigger);
      press.down();
      expect(onTouchStart).toHaveBeenCalledTimes(1);
      advance(contextMenu.press.menuDisplayMs - 1);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
      advance(1);
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
      press.up();
    });

    it('opens nothing for an early lift whose consumer onTouchEnd prevents default (#7167)', () => {
      const onTouchEnd = vi.fn((event: React.TouchEvent) => {
        event.preventDefault();
      });
      const trigger = renderMenu({onTouchEnd});
      const press = finger(trigger);
      press.down();
      advance(200);
      press.up();
      expect(onTouchEnd).toHaveBeenCalledTimes(1);
      advance(1000);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    });

    it('moves the recognizer to the new trigger when triggerAs swaps it: a hold on the new node opens the menu', () => {
      const {rerender} = render(
        <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
          <div>Long-press me</div>
        </ContextMenu>,
      );
      rerender(
        <ContextMenu
          items={[{label: 'Item 1'}]}
          data-testid="ctx"
          triggerAs="span">
          <span>Long-press me</span>
        </ContextMenu>,
      );
      const press = finger(screen.getByTestId('ctx'));
      press.down();
      advance(contextMenu.press.menuDisplayMs);
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
      press.up();
    });

    it('opens nothing for a press lifted before the commit, and leaves its click alone', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(250);
      const lift = press.up();
      expect(lift.defaultPrevented).toBe(false);
      advance(1000);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    });

    it('cancels when the finger drifts past the tolerance on one axis (11.5 px)', () => {
      const trigger = renderMenu();
      const press = finger(trigger, 1, 20, 20);
      press.down();
      advance(50);
      press.moveTo(20, 31.6);
      advance(1000);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
      press.up();
    });

    it('still opens after a drift inside the tolerance', () => {
      const trigger = renderMenu();
      const press = finger(trigger, 1, 20, 20);
      press.down();
      advance(50);
      press.moveTo(31, 31); // 15.6 px away, 11 px on each axis
      advance(contextMenu.press.menuDisplayMs);
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
      press.up();
    });

    it('cancels when a second finger lands before the commit', () => {
      const trigger = renderMenu();
      const first = {id: 1, x: 20, y: 20};
      const second = {id: 2, x: 60, y: 20};
      dispatchTouch('touchstart', trigger, [first], [first]);
      advance(100);
      dispatchTouch('touchstart', trigger, [second], [first, second]);
      advance(1000);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
      dispatchTouch('touchend', trigger, [first, second], []);
    });

    it('lets the long press decide while a finger is down: the browser’s own long-press menu opens nothing', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(380);
      // Android Chrome fires contextmenu for a held finger on its own clock.
      const native = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      });
      trigger.dispatchEvent(native);
      expect(native.defaultPrevented).toBe(true);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
      advance(contextMenu.press.menuDisplayMs - 380);
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
      press.up();
    });

    it('plays the click haptic at the commit where the platform vibrates, and none for an early lift', () => {
      const vibrate = vi.fn(() => true);
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrate,
        configurable: true,
      });
      try {
        const trigger = renderMenu();
        const early = finger(trigger);
        early.down();
        advance(250);
        early.up();
        advance(500);
        expect(vibrate).not.toHaveBeenCalled();

        const held = finger(trigger);
        held.down();
        advance(contextMenu.press.commitMs - 1);
        expect(vibrate).not.toHaveBeenCalled();
        advance(1);
        // At the commit, before the menu shows.
        expect(vibrate).toHaveBeenCalledTimes(1);
        expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
        expect(vibrate).toHaveBeenCalledWith([
          ...HAPTIC_VIBRATION_PATTERNS[contextMenu.commitHaptic].value,
        ]);
        held.up();
      } finally {
        // jsdom has no vibration API of its own.
        delete (navigator as {vibrate?: unknown}).vibrate;
      }
    });

    it('leaves the page free to scroll while a menu a finger opened is up; a touch outside closes it as it begins to pan', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(contextMenu.press.commitMs);
      // Lifted after the commit: the menu opens at the lift.
      act(() => {
        press.up();
      });
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
      expect(document.body.style.position).toBe('');
      const outside = {pointerType: 'touch', pointerId: 9, clientX: 200};
      act(() => {
        fireEvent.pointerDown(document.body, {...outside, clientY: 200});
        fireEvent.pointerMove(document.body, {...outside, clientY: 195});
      });
      expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
      act(() => {
        fireEvent.pointerMove(document.body, {...outside, clientY: 180});
      });
      expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
    });

    it('leaves the page alone for a menu a right-click opened', () => {
      const trigger = renderMenu();
      fireEvent.contextMenu(trigger, {clientX: 20, clientY: 20});
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
      expect(document.body.style.position).toBe('');
    });

    it('passes touch events through to the consumer’s own handlers', () => {
      const onTouchStart = vi.fn();
      const onTouchEnd = vi.fn();
      const trigger = renderMenu({onTouchStart, onTouchEnd});
      const press = finger(trigger);
      press.down();
      press.up();
      expect(onTouchStart).toHaveBeenCalledTimes(1);
      expect(onTouchEnd).toHaveBeenCalledTimes(1);
    });

    it('makes the trigger a pressable surface of core’s one press machine', () => {
      const trigger = renderMenu();
      expect(trigger).toHaveAttribute('data-astryx-pressable');
    });

    it('keeps today’s menu with presentation="popover": a held finger opens it at 500 ms through today’s long press, with no growth and no scroll lock', () => {
      const trigger = renderMenu({presentation: 'popover'});
      const shows = () =>
        vi.mocked(HTMLElement.prototype.showPopover).mock.calls.length;
      expect(trigger).not.toHaveAttribute('data-astryx-pressable');
      const press = finger(trigger);
      press.down();
      advance(499);
      expect(shows()).toBe(0);
      advance(1);
      expect(shows()).toBe(1);
      // Today’s menu: the first row takes the focus, nothing grows, the page
      // is not locked.
      expect(trigger.style.getPropertyValue('scale')).toBe('');
      expect(document.body.style.overflow).not.toBe('hidden');
      press.up();
      // The browser’s own long-press menu (Android Chrome) still opens it.
      fireEvent.contextMenu(trigger, {clientX: 20, clientY: 20, detail: 1});
      expect(shows()).toBeGreaterThanOrEqual(1);
    });

    it('with presentation="popover", a drift past 10 px or a lift before 500 ms opens nothing (today’s long press)', () => {
      const trigger = renderMenu({presentation: 'popover'});
      const shows = () =>
        vi.mocked(HTMLElement.prototype.showPopover).mock.calls.length;
      let press = finger(trigger);
      press.down();
      advance(300);
      press.up();
      advance(400);
      expect(shows()).toBe(0);
      press = finger(trigger);
      press.down();
      press.moveTo(31, 20);
      advance(600);
      expect(shows()).toBe(0);
      press.up();
    });

    it('opens nothing on touch when disabled', () => {
      const trigger = renderMenu({isDisabled: true});
      const press = finger(trigger);
      press.down();
      advance(1000);
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
      press.up();
    });
  },
);

describe('ContextMenu under a fine pointer: the touch model costs nothing', () => {
  beforeEach(() => {
    stubPointer(false);
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Date',
      ],
    });
    clockEpoch += 100_000;
    vi.advanceTimersByTime(clockEpoch);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens today’s menu for a finger held 500 ms (today’s long press), with no touch model: no growth, no scroll lock, the first row focused', () => {
    // A fine pointer in this context, before any check.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    const onTouchStart = vi.fn();
    render(
      <ContextMenu
        items={[{label: 'Item 1'}]}
        data-testid="ctx"
        onTouchStart={onTouchStart}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    const trigger = screen.getByTestId('ctx');
    expect(trigger).not.toHaveAttribute('data-astryx-pressable');
    const press = finger(trigger);
    press.down();
    expect(onTouchStart).toHaveBeenCalledTimes(1);
    advance(499);
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    advance(1);
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    expect(trigger.style.getPropertyValue('scale')).toBe('');
    expect(document.body.style.overflow).not.toBe('hidden');
    advance(20);
    expect(
      screen.getByRole('menuitem', {name: 'Item 1', hidden: true}),
    ).toHaveFocus();
    press.up();
  });

  it('does not hand the finger that opened the menu on to it: a slide onto a row and a lift pick nothing', () => {
    const onClick = vi.fn();
    render(
      <ContextMenu items={[{label: 'Item 1', onClick}]} data-testid="ctx">
        <div>Right-click me</div>
      </ContextMenu>,
    );
    const trigger = screen.getByTestId('ctx');
    const press = finger(trigger);
    press.down();
    advance(500);
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    const row = screen.getByRole('menuitem', {name: 'Item 1', hidden: true});
    const box = row.getBoundingClientRect();
    press.moveTo(box.left + 4, box.top + 4);
    press.up();
    advance(50);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('opens the cursor menu on a right-click, as before', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
        <div>Right-click me</div>
      </ContextMenu>,
    );
    const trigger = screen.getByTestId('ctx');
    fireEvent.contextMenu(trigger, {clientX: 20, clientY: 20, detail: 1});
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    advance(20);
    expect(
      screen.getByRole('menuitem', {name: 'Item 1', hidden: true}),
    ).toHaveFocus();
  });
});

describe('ContextMenu: the primary pointer alone picks a finger’s rules (spec:AST-094 FR13, FR33)', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Date',
      ],
    });
    clockEpoch += 100_000;
    vi.advanceTimersByTime(clockEpoch);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens for the same held finger at 735 ms where the primary pointer is coarse, and at 500 ms where it is fine', () => {
    const shows = () =>
      vi.mocked(HTMLElement.prototype.showPopover).mock.calls.length;
    const renderTrigger = () => {
      const view = render(
        <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
          <div>Hold me</div>
        </ContextMenu>,
      );
      return {trigger: screen.getByTestId('ctx'), unmount: view.unmount};
    };
    // Coarse: the touch model's timeline, no menu at 500 ms.
    stubPointer(true);
    const coarse = renderTrigger();
    let press = finger(coarse.trigger);
    press.down();
    advance(600);
    expect(shows()).toBe(0);
    advance(contextMenu.press.menuDisplayMs - 600);
    expect(shows()).toBe(1);
    press.up();
    coarse.unmount();
    vi.mocked(HTMLElement.prototype.showPopover).mockClear();
    // Fine: today's long press, the same finger opens at 500 ms.
    stubPointer(false);
    const fine = renderTrigger();
    press = finger(fine.trigger);
    press.down();
    advance(499);
    expect(shows()).toBe(0);
    advance(1);
    expect(shows()).toBe(1);
    press.up();
  });
});

describe('ContextMenu items', () => {
  it('renders items with labels', () => {
    render(
      <ContextMenu items={[{label: 'Cut'}, {label: 'Copy'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();
    expect(
      screen.getByRole('menuitem', {name: 'Cut', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toBeInTheDocument();
  });

  it('calls onClick when item is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <ContextMenu items={[{label: 'Cut', onClick: handleClick}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    await user.click(screen.getByRole('menuitem', {name: 'Cut', hidden: true}));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <ContextMenu
        items={[{label: 'Cut', onClick: handleClick, isDisabled: true}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    await user.click(screen.getByRole('menuitem', {name: 'Cut', hidden: true}));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('has aria-disabled when disabled', () => {
    render(
      <ContextMenu items={[{label: 'Cut', isDisabled: true}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();
    expect(
      screen.getByRole('menuitem', {name: 'Cut', hidden: true}),
    ).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('ContextMenu destructive variant', () => {
  it('forwards a destructive item variant to the shared menu item', () => {
    render(
      <ContextMenu
        items={[
          {label: 'Delete', variant: 'destructive', onClick: () => {}},
          {label: 'Rename', onClick: () => {}},
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveAttribute('data-variant', 'destructive');
    expect(
      screen.getByRole('menuitem', {name: 'Rename', hidden: true}),
    ).not.toHaveAttribute('data-variant');
  });
});

describe('ContextMenu sections', () => {
  it('renders section with title', () => {
    render(
      <ContextMenu
        items={[
          {
            type: 'section',
            title: 'Edit',
            items: [{label: 'Cut'}, {label: 'Copy'}],
          },
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Cut', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toBeInTheDocument();
  });

  it('has role="group" with aria-label', () => {
    render(
      <ContextMenu
        items={[
          {
            type: 'section',
            title: 'Edit',
            items: [{label: 'Cut'}],
          },
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    const group = screen.getByRole('group', {name: 'Edit', hidden: true});
    expect(group).toBeInTheDocument();
  });
});

describe('ContextMenu dividers', () => {
  it('renders dividers between items', () => {
    render(
      <ContextMenu
        items={[{label: 'Cut'}, {type: 'divider'}, {label: 'Paste'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    expect(
      screen.getByRole('menuitem', {name: 'Cut', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Paste', hidden: true}),
    ).toBeInTheDocument();
    expect(screen.getByRole('separator', {hidden: true})).toBeInTheDocument();
  });
});

describe('ContextMenu compound mode', () => {
  it('shows a sub-menu with a header or footer as its rows alone, and says why in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <ContextMenu
          menuContent={
            <>
              <DropdownMenuItem label="Rename" onClick={() => {}} />
              <DropdownMenuSubMenu
                label="Labels"
                header={<input aria-label="Filter labels" />}
                footer={<button type="button">Create label</button>}>
                <DropdownMenuItem label="Bug" onClick={() => {}} />
              </DropdownMenuSubMenu>
            </>
          }>
          <div>Right-click me</div>
        </ContextMenu>,
      );
      fireEvent.contextMenu(screen.getByText('Right-click me'));
      const row = screen.getByRole('menuitem', {name: /Labels/, hidden: true});
      // No region can sit outside this menu, so none renders inside it.
      expect(row).toHaveAttribute('aria-haspopup', 'menu');
      fireEvent.click(row, {detail: 1});
      await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'));
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
      expect(
        screen.queryByRole('textbox', {name: 'Filter labels', hidden: true}),
      ).toBeNull();
      expect(
        screen.getByRole('menuitem', {name: 'Bug', hidden: true}),
      ).toBeInTheDocument();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('DropdownMenuSubMenu: header and footer'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('renders menuContent as menu items', () => {
    render(
      <ContextMenu
        menuContent={
          <>
            <DropdownMenuItem label="Cut" onClick={() => {}} />
            <DropdownMenuItem label="Copy" onClick={() => {}} />
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();
    expect(
      screen.getByRole('menuitem', {name: 'Cut', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toBeInTheDocument();
  });

  it('renders ContextMenuItem endContent', () => {
    render(
      <ContextMenu
        menuContent={
          <ContextMenuItem
            label="Cut"
            endContent={<span data-testid="shortcut">⌘X</span>}
            onClick={() => {}}
          />
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    expect(screen.getByTestId('shortcut')).toHaveTextContent('⌘X');
  });

  it('renders the menu divider surface through the ContextMenu alias', () => {
    render(
      <ContextMenu
        menuContent={
          <>
            <ContextMenuItem label="Cut" onClick={() => {}} />
            <ContextMenuDivider />
            <ContextMenuItem label="Delete" onClick={() => {}} />
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    expect(screen.getByRole('separator', {hidden: true})).toHaveClass(
      'astryx-dropdown-menu-divider',
    );
  });

  it('calls onClick when compound item is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <ContextMenu
        menuContent={<DropdownMenuItem label="Cut" onClick={handleClick} />}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    await user.click(screen.getByRole('menuitem', {name: 'Cut', hidden: true}));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders dividers between compound items', () => {
    render(
      <ContextMenu
        menuContent={
          <>
            <DropdownMenuItem label="Cut" onClick={() => {}} />
            <Divider />
            <DropdownMenuItem label="Paste" onClick={() => {}} />
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();

    expect(
      screen.getByRole('menuitem', {name: 'Cut', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Paste', hidden: true}),
    ).toBeInTheDocument();
    expect(screen.getByRole('separator', {hidden: true})).toBeInTheDocument();
  });

  describe('cursor anchor positioning (#3465)', () => {
    // The menu is anchored to a 1px element placed at the cursor point
    // *inside the trigger*, so it is positioned relative to the trigger's
    // context (scroll-follow + auto-flip) rather than the viewport.
    function getCursorAnchor(trigger: HTMLElement): HTMLElement {
      const anchor = trigger.querySelector<HTMLElement>('[aria-hidden="true"]');
      if (!anchor) {
        throw new Error('cursor anchor not found');
      }
      return anchor;
    }

    it('renders a 1px cursor anchor inside the trigger', () => {
      render(
        <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
          <div>Right-click me</div>
        </ContextMenu>,
      );
      const anchor = getCursorAnchor(screen.getByTestId('ctx'));
      expect(anchor.tagName).toBe('SPAN');
      // Carries an anchor-name while the menu is open, so the menu is
      // anchored to it via CSS anchor positioning (context mode), not fixed
      // viewport coordinates. Closed, it is no anchor.
      expect(anchor.style.anchorName).toBe('');
      openMenu();
      expect(anchor.style.anchorName).toMatch(/^--astryx-layer-/);
      // Owns a box: WebKit counts an empty anchor box inside a scroll
      // container as clipped, and `position-visibility` hides the menu.
      expect(anchor).toHaveStyle({width: '1px', height: '1px'});
    });

    it('places the cursor anchor at the pointer position relative to the trigger', () => {
      render(
        <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
          <div>Right-click me</div>
        </ContextMenu>,
      );
      const trigger = screen.getByTestId('ctx');
      trigger.getBoundingClientRect = () =>
        ({
          left: 100,
          top: 50,
          right: 300,
          bottom: 150,
          width: 200,
          height: 100,
        }) as DOMRect;
      // Pointer at viewport (170, 90) -> local trigger offset (70, 40).
      fireEvent.contextMenu(trigger, {clientX: 170, clientY: 90, detail: 1});
      const anchor = getCursorAnchor(trigger);
      expect(anchor.style.left).toBe('70px');
      expect(anchor.style.top).toBe('40px');
    });

    it("places a right-click's anchor at the pointer offset inside a scaled container, with no scale of its own", () => {
      render(
        <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
          <div>Right-click me</div>
        </ContextMenu>,
      );
      const trigger = screen.getByTestId('ctx');
      // A 200x120 trigger inside an ancestor scaled to 0.5.
      Object.defineProperty(trigger, 'offsetWidth', {value: 200});
      Object.defineProperty(trigger, 'offsetHeight', {value: 120});
      trigger.getBoundingClientRect = () =>
        ({
          left: 100,
          top: 50,
          right: 200,
          bottom: 110,
          width: 100,
          height: 60,
        }) as DOMRect;
      fireEvent.contextMenu(trigger, {clientX: 150, clientY: 80, detail: 1});
      const anchor = getCursorAnchor(trigger);
      expect(anchor.style.left).toBe('50px');
      expect(anchor.style.top).toBe('30px');
      // The ancestor's scale is not the press feedback's growth: nothing to cancel.
      expect(anchor.style.scale).toBe('');
      expect(anchor.style.translate).toBe('');
    });

    it('anchors a keyboard-invoked menu to the trigger bottom-left', () => {
      render(
        <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
          <div>Right-click me</div>
        </ContextMenu>,
      );
      const trigger = screen.getByTestId('ctx');
      trigger.getBoundingClientRect = () =>
        ({
          left: 40,
          top: 10,
          right: 100,
          bottom: 30,
          width: 60,
          height: 20,
        }) as DOMRect;
      // Keyboard-initiated contextmenu: coords (0,0), detail 0 -> local (0, height).
      fireEvent.contextMenu(trigger, {clientX: 0, clientY: 0, detail: 0});
      const anchor = getCursorAnchor(trigger);
      expect(anchor.style.left).toBe('0px');
      // The 1px anchor steps back into the trigger's last pixel row, so its
      // bottom edge (where the menu starts) is still the trigger's bottom.
      expect(anchor.style.top).toBe('19px');
    });

    it('keeps the anchor inside the trigger at its end edges, and nowhere else', () => {
      render(
        <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
          <div>Right-click me</div>
        </ContextMenu>,
      );
      const trigger = screen.getByTestId('ctx');
      trigger.getBoundingClientRect = () =>
        ({
          left: 100,
          top: 50,
          right: 300,
          bottom: 150,
          width: 200,
          height: 100,
        }) as DOMRect;
      const anchor = getCursorAnchor(trigger);
      // A point on the trigger's end edges steps back by the anchor's pixel.
      fireEvent.contextMenu(trigger, {clientX: 300, clientY: 150, detail: 1});
      expect(anchor.style.left).toBe('199px');
      expect(anchor.style.top).toBe('99px');
      // A point past the trigger (content overflowing it) stays at the
      // pointer, as does a point on the trigger's start edges.
      fireEvent.contextMenu(trigger, {clientX: 320, clientY: 50, detail: 1});
      expect(anchor.style.left).toBe('220px');
      expect(anchor.style.top).toBe('0px');
    });
  });
});

describe('ContextMenu selectable items', () => {
  it('renders checkbox and radio items with correct roles and state', () => {
    render(
      <ContextMenu
        menuContent={
          <>
            <ContextMenuRadioGroup
              value="name"
              onChange={() => {}}
              label="Sort by">
              <ContextMenuRadioItem value="name" label="Sort by name" />
              <ContextMenuRadioItem value="date" label="Sort by date" />
            </ContextMenuRadioGroup>
            <ContextMenuCheckboxItem label="Show hidden" value={true} />
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();
    expect(
      screen.getByRole('menuitemradio', {name: 'Sort by name', hidden: true}),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemradio', {name: 'Sort by date', hidden: true}),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByRole('menuitemcheckbox', {name: 'Show hidden', hidden: true}),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('group', {name: 'Sort by', hidden: true}),
    ).toBeInTheDocument();
  });

  it('fires onChange for radio and checkbox items', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const onToggle = vi.fn();
    render(
      <ContextMenu
        menuContent={
          <>
            <ContextMenuRadioGroup
              value="name"
              onChange={onSort}
              label="Sort by">
              <ContextMenuRadioItem value="name" label="Sort by name" />
              <ContextMenuRadioItem value="date" label="Sort by date" />
            </ContextMenuRadioGroup>
            <ContextMenuCheckboxItem
              label="Show hidden"
              value={false}
              onChange={onToggle}
            />
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    openMenu();
    await user.click(
      screen.getByRole('menuitemradio', {name: 'Sort by date', hidden: true}),
    );
    expect(onSort).toHaveBeenCalledWith('date');
    await user.click(
      screen.getByRole('menuitemcheckbox', {name: 'Show hidden', hidden: true}),
    );
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('ContextMenu keyboard access for menuitemradio/menuitemcheckbox (#3829)', () => {
  it('arrow navigation reaches consumer-rendered menuitemradio and menuitemcheckbox items', () => {
    render(
      <ContextMenu
        menuContent={
          <>
            <DropdownMenuItem label="Cut" onClick={() => {}} />
            <div role="menuitemradio" tabIndex={-1} aria-checked="false">
              Newest
            </div>
            <div role="menuitemcheckbox" tabIndex={-1} aria-checked="false">
              Archived
            </div>
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    const menu = screen.getByRole('menu', {hidden: true});
    screen.getByRole('menuitem', {name: 'Cut', hidden: true}).focus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitemradio', {name: 'Newest', hidden: true}),
    ).toHaveFocus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitemcheckbox', {name: 'Archived', hidden: true}),
    ).toHaveFocus();
  });

  it('activates a focused menuitemradio with Enter and a menuitemcheckbox with Space', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <ContextMenu
        menuContent={
          <>
            <DropdownMenuItem label="Cut" onClick={() => {}} />
            <div
              role="menuitemradio"
              tabIndex={-1}
              aria-checked="false"
              onClick={onSelect}>
              Newest
            </div>
            <div
              role="menuitemcheckbox"
              tabIndex={-1}
              aria-checked="false"
              onClick={onToggle}>
              Archived
            </div>
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    const menu = screen.getByRole('menu', {hidden: true});

    screen.getByRole('menuitemradio', {name: 'Newest', hidden: true}).focus();
    fireEvent.keyDown(menu, {key: 'Enter'});
    expect(onSelect).toHaveBeenCalledTimes(1);

    screen
      .getByRole('menuitemcheckbox', {name: 'Archived', hidden: true})
      .focus();
    fireEvent.keyDown(menu, {key: ' '});
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('typeahead matches a menuitemradio label', () => {
    render(
      <ContextMenu
        menuContent={
          <>
            <DropdownMenuItem label="Cut" onClick={() => {}} />
            <div role="menuitemradio" tabIndex={-1} aria-checked="false">
              Newest
            </div>
            <div role="menuitemcheckbox" tabIndex={-1} aria-checked="false">
              Archived
            </div>
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {key: 'n'});
    expect(
      screen.getByRole('menuitemradio', {name: 'Newest', hidden: true}),
    ).toHaveFocus();
  });

  it('typeahead matches a menuitemcheckbox label', () => {
    render(
      <ContextMenu
        menuContent={
          <>
            <DropdownMenuItem label="Cut" onClick={() => {}} />
            <div role="menuitemradio" tabIndex={-1} aria-checked="false">
              Newest
            </div>
            <div role="menuitemcheckbox" tabIndex={-1} aria-checked="false">
              Archived
            </div>
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {key: 'a'});
    expect(
      screen.getByRole('menuitemcheckbox', {name: 'Archived', hidden: true}),
    ).toHaveFocus();
  });

  it('typeahead reaches an aria-disabled item, which stays discoverable', () => {
    render(
      <ContextMenu
        menuContent={
          <>
            <DropdownMenuItem label="Cut" onClick={() => {}} />
            <div role="menuitemradio" tabIndex={-1} aria-disabled="true">
              Newest
            </div>
            <div role="menuitemcheckbox" tabIndex={-1} aria-checked="false">
              Nightly
            </div>
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    // Anchor the search on 'Cut' so typeahead scans forward and meets the
    // disabled 'Newest' (also an 'n' match) before the enabled 'Nightly'.
    screen.getByRole('menuitem', {name: 'Cut', hidden: true}).focus();
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {key: 'n'});
    expect(
      screen.getByRole('menuitemradio', {name: 'Newest', hidden: true}),
    ).toHaveFocus();
  });

  it('reaches aria-disabled menuitemradio and menuitemcheckbox items during arrow navigation', () => {
    render(
      <ContextMenu
        menuContent={
          <>
            <DropdownMenuItem label="Cut" onClick={() => {}} />
            <div role="menuitemradio" tabIndex={-1} aria-disabled="true">
              Newest
            </div>
            <div role="menuitemcheckbox" tabIndex={-1} aria-disabled="true">
              Archived
            </div>
            <div role="menuitemradio" tabIndex={-1} aria-checked="false">
              Oldest
            </div>
          </>
        }>
        <div>Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right-click me'));
    const menu = screen.getByRole('menu', {hidden: true});
    screen.getByRole('menuitem', {name: 'Cut', hidden: true}).focus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitemradio', {name: 'Newest', hidden: true}),
    ).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitemcheckbox', {name: 'Archived', hidden: true}),
    ).toHaveFocus();
  });

  it('renders a submenu from a nested items array and keyboard-reaches an item after it', () => {
    // Same inline-flyout scoping the DropdownMenu fix covers: the submenu's
    // items must not pollute the ContextMenu's roving order, and an item after
    // the submenu row must stay keyboard-reachable.
    const onDelete = vi.fn();
    render(
      <ContextMenu
        items={[
          {label: 'Cut', onClick: () => {}},
          {
            label: 'Move to',
            items: [
              {label: 'Folder A', onClick: () => {}},
              {label: 'Folder B', onClick: () => {}},
            ],
          },
          {type: 'divider'},
          {label: 'Delete', onClick: onDelete},
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Right-click me'));
    // Two role="menu" exist (the context menu + the inline submenu flyout);
    // the context menu is the first in DOM order.
    const menu = screen.getAllByRole('menu', {hidden: true})[0];
    // The submenu trigger renders as a menuitem with aria-haspopup.
    const submenuTrigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    expect(submenuTrigger).toHaveAttribute('aria-haspopup', 'menu');
    // Cut → Move to → Delete, one step per press (submenu items not swept in).
    screen.getByRole('menuitem', {name: 'Cut', hidden: true}).focus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(submenuTrigger).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveFocus();
  });
});

describe('ContextMenu data-driven submenu inside a section', () => {
  it('renders a submenu row for an item with nested items inside a section', () => {
    render(
      <ContextMenu
        items={[
          {
            type: 'section',
            title: 'Organize',
            items: [
              {label: 'Rename', onClick: () => {}},
              {
                label: 'Move to',
                items: [
                  {label: 'Folder A', onClick: () => {}},
                  {label: 'Folder B', onClick: () => {}},
                ],
              },
            ],
          },
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Right-click me'));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(
      screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
    ).toBeInTheDocument();
  });
});

describe('ContextMenu press model', () => {
  const touch = {pointerType: 'touch', pointerId: 1};
  const item = (name: string) =>
    screen.getByRole('menuitem', {name, hidden: true});
  it('acts on the row under a finger release, once, and swallows the stray click', () => {
    const onCut = vi.fn();
    const onPaste = vi.fn();
    render(
      <ContextMenu
        items={[
          {label: 'Cut', onClick: onCut},
          {label: 'Copy'},
          {label: 'Paste', onClick: onPaste},
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Right-click me'));
    expect(screen.getByRole('menu', {hidden: true})).toHaveAttribute(
      'data-astryx-menu-press',
    );
    fireEvent.pointerDown(item('Cut'), touch);
    fireEvent.pointerMove(item('Paste'), touch);
    expect(item('Paste')).toHaveFocus();
    fireEvent.pointerUp(item('Paste'), touch);
    fireEvent.click(item('Cut'), {detail: 1});
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(onCut).not.toHaveBeenCalled();
  });
});

describe('ContextMenuGroup', () => {
  it('carries the group semantics through the alias, not just the component', async () => {
    // Three public surfaces alias this component at once. An alias that
    // re-exports without the semantics would pass a render test and fail a
    // screen reader.
    render(
      <ContextMenu
        menuContent={
          <ContextMenuGroup title="Version history">
            <DropdownMenuItem label="Restore" onClick={() => {}} />
            <DropdownMenuItem label="Compare" onClick={() => {}} />
          </ContextMenuGroup>
        }>
        <div data-testid="target">Right-click me</div>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByTestId('target'));
    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', {name: 'Restore', hidden: true}),
      ).toBeInTheDocument(),
    );

    const group = screen.getByRole('group', {
      name: 'Version history',
      hidden: true,
    });
    const heading = screen.getByText('Version history');
    expect(group).toHaveAttribute('aria-labelledby', heading.id);
    expect(group).toContainElement(
      screen.getByRole('menuitem', {name: 'Restore', hidden: true}),
    );
  });
});

describe('ContextMenu keyboard', () => {
  const item = (name: string) =>
    screen.getByRole('menuitem', {name, hidden: true});

  it('wraps arrow navigation at the ends', () => {
    render(
      <ContextMenu items={[{label: 'Cut'}, {label: 'Copy'}, {label: 'Paste'}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Right-click me'));
    const menu = screen.getByRole('menu', {hidden: true});
    item('Paste').focus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(item('Cut')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'ArrowUp'});
    expect(item('Paste')).toHaveFocus();
  });
});

describe('ContextMenu inline trigger (triggerAs)', () => {
  it('an inline trigger keeps its flow', () => {
    render(
      <p>
        Filed under{' '}
        <ContextMenu
          triggerAs="span"
          data-testid="ref"
          items={[{label: 'Open', onClick: () => {}}]}>
          T123
        </ContextMenu>{' '}
        yesterday.
      </p>,
    );
    const trigger = screen.getByTestId('ref');
    expect(trigger.tagName).toBe('SPAN');
    expect(trigger.parentElement?.tagName).toBe('P');
    expect(trigger).not.toHaveStyle({display: 'block'});
    fireEvent.contextMenu(trigger, {clientX: 20, clientY: 10, detail: 1});
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
  });

  it('defaults to a block trigger', () => {
    render(
      <ContextMenu data-testid="area" items={[{label: 'Open'}]}>
        Area
      </ContextMenu>,
    );
    expect(screen.getByTestId('area').tagName).toBe('DIV');
  });
});

describe('ContextMenu outside dismissal', () => {
  const finger = (pointerId: number) => ({pointerType: 'touch', pointerId});

  // Under the touch model, a coarse primary pointer. Undone at the end.
  function underTouchModel(run: () => void) {
    stubPointer(true);
    try {
      run();
    } finally {
      vi.unstubAllGlobals();
    }
  }

  // Holds a finger on the trigger until the long-press opens the menu. Only
  // the long-press delay is faked.
  function longPress(trigger: HTMLElement, pointerId: number) {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      fireEvent.pointerDown(trigger, finger(pointerId));
      fireEvent.touchStart(trigger, {touches: [{clientX: 20, clientY: 20}]});
      act(() => {
        vi.advanceTimersByTime(500);
      });
    } finally {
      vi.useRealTimers();
    }
  }

  // What a browser sends after a touch: the lift, then compatibility mouse
  // events aimed at the element the finger held.
  function lift(target: HTMLElement, pointerId: number) {
    fireEvent.pointerUp(target, finger(pointerId));
    fireEvent.touchEnd(target);
    fireEvent.mouseDown(target);
    fireEvent.mouseUp(target);
    fireEvent.click(target);
  }

  function renderMenu(onOpenChange: (isOpen: boolean) => void) {
    render(
      <>
        <ContextMenu
          items={[{label: 'Cut'}, {label: 'Copy'}]}
          data-testid="ctx"
          onOpenChange={onOpenChange}>
          <div>Long-press me</div>
        </ContextMenu>
        <button type="button">Outside</button>
      </>,
    );
    return {
      trigger: screen.getByTestId('ctx'),
      outside: screen.getByRole('button', {name: 'Outside'}),
    };
  }

  it('the long press that opened the menu does not close it, mid-hold or as it lifts; the next press outside does', () => {
    const onOpenChange = vi.fn<(isOpen: boolean) => void>();
    const {trigger, outside} = renderMenu(onOpenChange);
    longPress(trigger, 1);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // iOS: a compatibility mousedown while the finger is still down.
    fireEvent.mouseDown(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // Chromium: the compatibility events that follow the lift.
    lift(trigger, 1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // A new press is a new gesture: a mouse press outside closes the menu.
    fireEvent.pointerDown(outside, {pointerType: 'mouse', pointerId: 9});
    fireEvent.mouseDown(outside);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('a finger long press that opens the menu through a pointer contextmenu (Chromium) does not close it as it lifts', () => {
    const onOpenChange = vi.fn<(isOpen: boolean) => void>();
    const {trigger, outside} = renderMenu(onOpenChange);
    fireEvent.pointerDown(trigger, finger(8));
    const contextmenu = createEvent.contextMenu(trigger, {
      clientX: 20,
      clientY: 15,
      detail: 1,
    });
    Object.defineProperty(contextmenu, 'pointerType', {value: 'touch'});
    fireEvent(trigger, contextmenu);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    lift(trigger, 8);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // A right-click is not a finger: its gesture's next mousedown, outside,
    // closes the menu.
    fireEvent.pointerDown(trigger, {pointerType: 'mouse', pointerId: 1});
    fireEvent.contextMenu(trigger, {clientX: 20, clientY: 15, detail: 1});
    fireEvent.mouseDown(outside);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('a long press that moves the open menu keeps it open as it lifts', () => {
    const onOpenChange = vi.fn<(isOpen: boolean) => void>();
    const {trigger} = renderMenu(onOpenChange);
    fireEvent.contextMenu(trigger, {clientX: 50, clientY: 15, detail: 1});
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    longPress(trigger, 2);
    lift(trigger, 2);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('under the touch model, a tap outside closes the menu at its lift, and a scroll that starts outside closes it as the browser takes the finger', () => {
    underTouchModel(() => {
      const onOpenChange = vi.fn<(isOpen: boolean) => void>();
      const {trigger, outside} = renderMenu(onOpenChange);
      fireEvent.contextMenu(trigger, {clientX: 50, clientY: 15, detail: 1});
      // The browser takes this finger for a scroll: no compatibility events.
      fireEvent.pointerDown(outside, finger(3));
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      fireEvent.pointerCancel(outside, finger(3));
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      fireEvent.contextMenu(trigger, {clientX: 50, clientY: 15, detail: 1});
      fireEvent.pointerDown(outside, finger(4));
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      lift(outside, 4);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });
  });

  it('outside the touch model, a tap outside closes the menu through its compatibility mousedown, and a scroll that starts outside leaves it open', () => {
    const onOpenChange = vi.fn<(isOpen: boolean) => void>();
    const {trigger, outside} = renderMenu(onOpenChange);
    fireEvent.contextMenu(trigger, {clientX: 50, clientY: 15, detail: 1});
    // The browser takes this finger for a scroll: no compatibility events.
    fireEvent.pointerDown(outside, finger(3));
    fireEvent.pointerCancel(outside, finger(3));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.pointerDown(outside, finger(4));
    lift(outside, 4);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('with presentation="popover", a finger keeps the released outside dismissal: a scroll or a drag outside leaves the menu open', () => {
    underTouchModel(() => {
      const onOpenChange = vi.fn<(isOpen: boolean) => void>();
      render(
        <>
          <ContextMenu
            items={[{label: 'Cut'}]}
            presentation="popover"
            data-testid="ctx"
            onOpenChange={onOpenChange}>
            <div>Long-press me</div>
          </ContextMenu>
          <button type="button">Outside</button>
        </>,
      );
      const outside = screen.getByRole('button', {name: 'Outside'});
      fireEvent.contextMenu(screen.getByTestId('ctx'), {
        clientX: 50,
        clientY: 15,
        detail: 1,
      });
      fireEvent.pointerDown(outside, {...finger(3), clientX: 0, clientY: 0});
      fireEvent.pointerCancel(outside, finger(3));
      fireEvent.pointerDown(outside, {...finger(4), clientX: 0, clientY: 0});
      fireEvent.pointerMove(outside, {...finger(4), clientX: 0, clientY: 40});
      fireEvent.pointerUp(outside, finger(4));
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  it('a mouse press or a pen press outside closes the menu at the press', () => {
    for (const pointerType of ['mouse', 'pen']) {
      const onOpenChange = vi.fn<(isOpen: boolean) => void>();
      const {trigger, outside} = renderMenu(onOpenChange);
      fireEvent.contextMenu(trigger, {clientX: 50, clientY: 15, detail: 1});
      fireEvent.pointerDown(outside, {pointerType, pointerId: 7});
      fireEvent.mouseDown(outside);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      cleanup();
    }
  });

  it('a mouse press that sends no mousedown leaves the menu open, as before', () => {
    const onOpenChange = vi.fn<(isOpen: boolean) => void>();
    const {trigger, outside} = renderMenu(onOpenChange);
    fireEvent.contextMenu(trigger, {clientX: 50, clientY: 15, detail: 1});
    // A control that cancels its pointerdown (a NumberInput stepper, a
    // resize handle): the browser sends no mousedown.
    fireEvent.pointerDown(outside, {pointerType: 'mouse', pointerId: 1});
    fireEvent.pointerUp(outside, {pointerType: 'mouse', pointerId: 1});
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('under the touch model, a finger outside closes the menu as it pans past the pan threshold, or at its lift; a second finger waits for the first one', () => {
    underTouchModel(() => {
      const onOpenChange = vi.fn<(isOpen: boolean) => void>();
      const {trigger, outside} = renderMenu(onOpenChange);
      const open = () =>
        fireEvent.contextMenu(trigger, {clientX: 50, clientY: 15, detail: 1});
      // A drag on a surface that does not pan (a Slider): it closes the menu
      // as it travels past the pan threshold, before the lift.
      open();
      fireEvent.pointerDown(outside, {...finger(5), clientX: 0, clientY: 0});
      fireEvent.pointerMove(outside, {...finger(5), clientX: 8, clientY: 0});
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      fireEvent.pointerMove(outside, {...finger(5), clientX: 30, clientY: 0});
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      fireEvent.pointerUp(outside, finger(5));
      // A second finger's tap does not end the first finger's touch.
      open();
      fireEvent.pointerDown(outside, finger(6));
      fireEvent.pointerDown(outside, finger(7));
      fireEvent.pointerUp(outside, finger(7));
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      fireEvent.pointerUp(outside, finger(6));
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });
  });

  it('under the touch model, a touch on the menu itself leaves it open', () => {
    underTouchModel(() => {
      const onOpenChange = vi.fn<(isOpen: boolean) => void>();
      const {trigger} = renderMenu(onOpenChange);
      fireEvent.contextMenu(trigger, {clientX: 50, clientY: 15, detail: 1});
      const menu = screen.getByRole('menu', {hidden: true});
      fireEvent.pointerDown(menu, {...finger(8), clientX: 0, clientY: 0});
      fireEvent.pointerMove(menu, {...finger(8), clientX: 0, clientY: 40});
      fireEvent.pointerUp(menu, finger(8));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('in a second document', () => {
    // An app can render a ContextMenu into a same-origin iframe or a Document
    // Picture-in-Picture window through a portal. Every press for it then
    // happens in that document.
    let frame: HTMLIFrameElement;
    let secondDocument: Document;

    beforeEach(() => {
      frame = document.createElement('iframe');
      document.body.appendChild(frame);
      secondDocument = frame.contentDocument!;
      // The Popover API stand-in above, on the second window's own prototype.
      const {prototype} = secondDocument.defaultView!.HTMLElement;
      prototype.showPopover = HTMLElement.prototype.showPopover;
      prototype.hidePopover = HTMLElement.prototype.hidePopover;
      prototype.matches = HTMLElement.prototype.matches;
    });

    afterEach(() => {
      // Unmount before the frame goes, or React removes nodes from a
      // document that no longer exists.
      cleanup();
      frame.remove();
    });

    it('a mouse press outside the menu closes it in the document it renders in; a press in the page does not', () => {
      const onOpenChange = vi.fn<(isOpen: boolean) => void>();
      render(
        createPortal(
          <>
            <ContextMenu
              items={[{label: 'Cut'}]}
              data-testid="ctx"
              onOpenChange={onOpenChange}>
              <div>Right-click me</div>
            </ContextMenu>
            <button type="button">Outside</button>
          </>,
          secondDocument.body,
        ),
      );
      const view = within(secondDocument.body);
      fireEvent.contextMenu(view.getByTestId('ctx'), {
        clientX: 50,
        clientY: 15,
        detail: 1,
      });
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      fireEvent.pointerDown(document.body, {
        pointerType: 'mouse',
        pointerId: 1,
      });
      fireEvent.mouseDown(document.body);
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      const outside = view.getByRole('button', {name: 'Outside'});
      fireEvent.pointerDown(outside, {pointerType: 'mouse', pointerId: 1});
      fireEvent.mouseDown(outside);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });

    it('times a finger on the second document’s own clock: a short tap opens no menu and keeps its click', () => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'],
      });
      clockEpoch += 100_000;
      vi.advanceTimersByTime(clockEpoch);
      const view = secondDocument.defaultView as Window & typeof globalThis;
      // The frame opened after the page, so its clock reads 5 s less. Its
      // events come stamped on that clock.
      const frameNow = vi
        .spyOn(view.performance, 'now')
        .mockImplementation(() => performance.now() - 5000);
      const coarse = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      vi.stubGlobal('matchMedia', coarse);
      Object.defineProperty(view, 'matchMedia', {
        value: coarse,
        configurable: true,
      });
      try {
        const onOpenChange = vi.fn<(isOpen: boolean) => void>();
        render(
          createPortal(
            <ContextMenu
              items={[{label: 'Cut'}]}
              data-testid="ctx"
              onOpenChange={onOpenChange}>
              <div>Long-press me</div>
            </ContextMenu>,
            secondDocument.body,
          ),
        );
        const trigger = within(secondDocument.body).getByTestId('ctx');
        const send = (type: 'touchstart' | 'touchend') => {
          const event = new view.Event(type, {bubbles: true, cancelable: true});
          const contact = {
            identifier: 1,
            clientX: 20,
            clientY: 20,
            target: trigger,
          };
          Object.defineProperty(event, 'changedTouches', {value: [contact]});
          Object.defineProperty(event, 'touches', {
            value: type === 'touchstart' ? [contact] : [],
          });
          Object.defineProperty(event, 'timeStamp', {
            value: view.performance.now(),
          });
          trigger.dispatchEvent(event);
          return event;
        };
        send('touchstart');
        act(() => {
          vi.advanceTimersByTime(120);
        });
        const lift = send('touchend');
        act(() => {
          vi.advanceTimersByTime(1000);
        });
        expect(onOpenChange).not.toHaveBeenCalledWith(true);
        expect(lift.defaultPrevented).toBe(false);
      } finally {
        frameNow.mockRestore();
        vi.unstubAllGlobals();
        vi.useRealTimers();
      }
    });
  });
});

describe('ContextMenu: Tab from a flyout leaves the whole menu (APG menu button)', () => {
  it('Tab on a sub-menu row closes every level, once', async () => {
    const onOpenChange = vi.fn();
    render(
      <ContextMenu
        onOpenChange={onOpenChange}
        items={[
          {label: 'Cut', onClick: () => {}},
          {
            label: 'Move to',
            items: [
              {label: 'Folder A', onClick: () => {}},
              {label: 'Folder B', onClick: () => {}},
            ],
          },
        ]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Right-click me'));
    const menu = screen.getAllByRole('menu', {hidden: true})[0];
    const moveTo = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    fireEvent.click(moveTo, {detail: 1});
    await waitFor(() =>
      expect(moveTo).toHaveAttribute('aria-expanded', 'true'),
    );
    const folder = screen.getByRole('menuitem', {
      name: 'Folder A',
      hidden: true,
    });
    act(() => folder.focus());
    onOpenChange.mockClear();
    const tab = fireEvent.keyDown(folder, {key: 'Tab'});
    expect(tab).toBe(true);
    expect(moveTo).toHaveAttribute('aria-expanded', 'false');
    expect(menu.closest('[popover]')).not.toHaveAttribute('popover-open');
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
