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
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {readFileSync} from 'node:fs';
import {ContextMenu} from './ContextMenu';
import {loadContextMenuTouchLayer} from './lazyContextMenuTouchLayer';
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
// The touch layer loads on demand; load it once so a touch test's first
// render runs it at once.
beforeAll(loadContextMenuTouchLayer, 20000);

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
    expect(
      screen.getByRole('menu', {name: 'Row actions', hidden: true}),
    ).toBeInTheDocument();
  });

  it('does not put aria-haspopup on the role-less trigger wrapper (menus-15)', () => {
    render(
      <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
        <div>Right-click me</div>
      </ContextMenu>,
    );
    expect(screen.getByTestId('ctx')).not.toHaveAttribute('aria-haspopup');
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

  it('keeps only the top content padding in a menu BottomSheet', () => {
    const source = readFileSync(
      'packages/core/src/DropdownMenu/MenuBottomSheet.tsx',
      'utf8',
    );

    expect(source).toContain('paddingBlockStart={4}');
    expect(source).toContain('paddingBlockEnd={0}');
  });

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
        fireEvent.contextMenu(container.querySelector('div div')!);
        // At the document a press on the menu is retargeted to a shadow host.
        const item = container.querySelector('[role="menuitem"]')!;
        fireEvent.mouseDown(item, {composed: true});
        expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
        // A press on the host itself is outside the menu.
        fireEvent.mouseDown(host);
        expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
      } finally {
        host.remove();
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
// event time; each install of fake timers restarts `performance.now()` near 0,
// so every case moves the faked clock past the ones before it.
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
        presentation?: 'popover';
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
      press.up();
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

    it('holds the page still while a menu a finger opened is up, and lets it go when the menu closes', () => {
      const trigger = renderMenu();
      const press = finger(trigger);
      press.down();
      advance(contextMenu.press.commitMs);
      // Lifted after the commit: the menu opens at the lift.
      act(() => {
        press.up();
      });
      expect(document.body.style.position).toBe('fixed');
      act(() => {
        fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
          key: 'Escape',
        });
      });
      expect(document.body.style.position).toBe('');
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

    it('makes the trigger a pressable surface of core’s one press machine, which starts and ends its growth', () => {
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

    await user.click(screen.getByRole('menuitem', {name: 'Cut', hidden: true}));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('has aria-disabled when disabled', () => {
    render(
      <ContextMenu items={[{label: 'Cut', isDisabled: true}]}>
        <div>Right-click me</div>
      </ContextMenu>,
    );
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
      // Carries an anchor-name so the menu can be anchored to it via CSS
      // anchor positioning (context mode), not fixed viewport coordinates.
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

  it('typeahead skips an aria-disabled item and matches the next enabled label', () => {
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
    // This pins the `:not([aria-disabled="true"])` in MENU_ITEM_SELECTOR: the
    // menus never pass useTypeahead's `isDisabled` option, so that clause is
    // the only thing keeping disabled rows out of the typeahead list. An
    // arrow-key test cannot cover it — useListFocus re-filters disabled items
    // independently, so arrow navigation is guarded twice over.
    // The disabled row keeps tabIndex={-1} on purpose: it stays focusable, so
    // the selector clause is the sole reason focus skips it.
    screen.getByRole('menuitem', {name: 'Cut', hidden: true}).focus();
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {key: 'n'});
    expect(
      screen.getByRole('menuitemcheckbox', {name: 'Nightly', hidden: true}),
    ).toHaveFocus();
  });

  it('skips aria-disabled menuitemradio and menuitemcheckbox items during arrow navigation', () => {
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
      screen.getByRole('menuitemradio', {name: 'Oldest', hidden: true}),
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

  it('a tap outside closes the menu through its compatibility mousedown; a scroll that starts outside leaves it open', () => {
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

  it('presses that send no mousedown leave the menu open, as before: a cancelled pointerdown, a finger drag, a second finger', () => {
    const onOpenChange = vi.fn<(isOpen: boolean) => void>();
    const {trigger, outside} = renderMenu(onOpenChange);
    fireEvent.contextMenu(trigger, {clientX: 50, clientY: 15, detail: 1});
    // A control that cancels its pointerdown (a NumberInput stepper, a
    // resize handle): the browser sends no mousedown.
    fireEvent.pointerDown(outside, {pointerType: 'mouse', pointerId: 1});
    fireEvent.pointerUp(outside, {pointerType: 'mouse', pointerId: 1});
    // A finger drag on a surface that does not pan (a Slider), lifted.
    fireEvent.pointerDown(outside, finger(5));
    fireEvent.pointerMove(outside, finger(5));
    fireEvent.pointerUp(outside, finger(5));
    // A second finger's tap.
    fireEvent.pointerDown(outside, finger(6));
    fireEvent.pointerDown(outside, finger(7));
    fireEvent.pointerUp(outside, finger(7));
    fireEvent.pointerCancel(outside, finger(6));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
