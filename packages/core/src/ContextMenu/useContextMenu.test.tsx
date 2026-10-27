// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useContextMenu.test.tsx
 * @input vitest (jsdom), Testing Library, useContextMenu in a component
 * @output Checks the hook over createContextMenu (spec:AST-107 FR8, FR6): it
 *   attaches to the ref'd element through the public factory, handing it a
 *   `render` for a ReactNode `menuContent` (with the caller's Core providers,
 *   and rows that keep the menu's behavior) or `items`, opens and closes from
 *   what it returns, follows `isDisabled` and `presentation`, and unmounting
 *   removes it all
 * @position Testing for useContextMenu.tsx
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {use, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DropdownMenuItem} from '../DropdownMenu/DropdownMenuItem';
import {LayerContext} from '../Layer/LayerContext';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {dataAttr} from '../naming';
import {createContextMenu} from './createContextMenu';
import {useContextMenu, type UseContextMenuOptions} from './useContextMenu';

// The real factory, watched: the hook must go through it.
vi.mock('./createContextMenu', async importOriginal => {
  const actual = await importOriginal<typeof import('./createContextMenu')>();
  return {...actual, createContextMenu: vi.fn(actual.createContextMenu)};
});

/** The options the public factory takes (spec:AST-107 FR8). */
const FACTORY_OPTIONS = new Set([
  'items',
  'render',
  'label',
  'isDisabled',
  'onOpenChange',
  'presentation',
]);

beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

let controls: {open: (at?: {x: number; y: number}) => void; close: () => void};

function Row(props: UseContextMenuOptions) {
  const ref = useRef<HTMLLIElement>(null);
  controls = useContextMenu(ref, props);
  return (
    <ul>
      <li ref={ref} tabIndex={0}>
        Inbox
      </li>
    </ul>
  );
}

function rightClick(target: Element): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 30,
    clientY: 40,
    button: 2,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
/** Whether the menu's popover is showing (the popover mocks above). */
const isOpen = () =>
  menu()?.closest('[popover]')?.hasAttribute('popover-open') === true;

/** A layer inside the menu's content, portaled outside the menu's DOM. */
function NestedDismissibleLayer({onDismiss}: {onDismiss: () => void}) {
  const [isLayerOpen, setIsLayerOpen] = useState(true);
  const containerRef = useRef<HTMLButtonElement>(null);
  useLayerDismissal({
    isActive: isLayerOpen,
    onDismiss: () => {
      setIsLayerOpen(false);
      onDismiss();
    },
    getContainer: () => containerRef.current,
  });
  // Only the layer depth inside the menu can rank it above the menu.
  return isLayerOpen
    ? createPortal(
        <button ref={containerRef} type="button">
          Nested layer
        </button>,
        document.body,
      )
    : null;
}

function Probe() {
  return use(LayerContext) != null ? <span data-testid="bridged" /> : null;
}

describe('useContextMenu', () => {
  it('opens on a right click on its element, and a choice runs and closes the menu', async () => {
    const onArchive = vi.fn();
    render(<Row items={[{label: 'Archive', onClick: onArchive}]} />);
    rightClick(screen.getByText('Inbox'));
    await userEvent
      .setup()
      .click(screen.getByRole('menuitem', {name: 'Archive', hidden: true}));
    expect(onArchive).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it('keeps the list valid: the menu is not inserted into it', () => {
    render(<Row items={[{label: 'Archive'}]} />);
    rightClick(screen.getByText('Inbox'));
    const list = document.querySelector('ul');
    expect(
      Array.from(list?.children ?? []).map(child => child.localName),
    ).toEqual(['li']);
    expect(list?.querySelector('[role="menu"]')).toBeNull();
  });

  it("renders a ReactNode menuContent with the caller's Core providers", () => {
    render(
      <LayerContext value={{} as never}>
        <Row
          menuContent={
            <div role="menuitem" tabIndex={-1}>
              Custom <Probe />
            </div>
          }
        />
      </LayerContext>,
    );
    rightClick(screen.getByText('Inbox'));
    expect(
      screen.getByRole('menuitem', {name: 'Custom', hidden: true}),
    ).not.toBeNull();
    expect(screen.queryByTestId('bridged')).not.toBeNull();
  });

  it('hands the public createContextMenu a `render` for menuContent, and nothing else (spec:AST-107 FR8, FR6)', () => {
    vi.mocked(createContextMenu).mockClear();
    render(
      <Row
        label="Inbox actions"
        menuContent={
          <div role="menuitem" tabIndex={-1}>
            Custom
          </div>
        }
      />,
    );
    expect(vi.mocked(createContextMenu)).toHaveBeenCalledTimes(1);
    const [element, options] = vi.mocked(createContextMenu).mock.calls[0] ?? [];
    expect(element).toBe(screen.getByText('Inbox'));
    expect(
      Object.keys(options ?? {}).filter(key => !FACTORY_OPTIONS.has(key)),
    ).toEqual([]);
    expect(typeof options?.render).toBe('function');
    expect(options?.items).toBeUndefined();
    expect(options?.label).toBe('Inbox actions');
  });

  it('passes `presentation` to the factory, as ContextMenu does', () => {
    vi.mocked(createContextMenu).mockClear();
    render(<Row presentation="popover" items={[{label: 'Archive'}]} />);
    expect(vi.mocked(createContextMenu).mock.calls[0]?.[1]).toMatchObject({
      presentation: 'popover',
    });
  });

  it("a DropdownMenuItem in menuContent keeps the menu's behavior: choosing it closes the menu", async () => {
    const onArchive = vi.fn();
    render(
      <Row
        menuContent={<DropdownMenuItem label="Archive" onClick={onArchive} />}
      />,
    );
    rightClick(screen.getByText('Inbox'));
    expect(isOpen()).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('menuitem', {name: 'Archive', hidden: true}),
      ),
    );
    // A key chooses the row: jsdom's pointer click lands on a row the close
    // has already taken out of the page, which no browser does (the browser
    // check is the interaction spec's).
    await userEvent.setup().keyboard('{Enter}');
    expect(onArchive).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it('a layer inside menuContent takes Escape before the menu, as in ContextMenu', () => {
    const onNestedDismiss = vi.fn();
    render(
      <Row
        menuContent={<NestedDismissibleLayer onDismiss={onNestedDismiss} />}
      />,
    );
    rightClick(screen.getByText('Inbox'));
    expect(isOpen()).toBe(true);
    const nested = screen.getByRole('button', {
      name: 'Nested layer',
      hidden: true,
    });
    nested.focus();
    fireEvent.keyDown(nested, {key: 'Escape'});
    expect(onNestedDismiss).toHaveBeenCalledOnce();
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(isOpen()).toBe(false);
  });

  it('open() and close() drive the menu', () => {
    const onOpenChange = vi.fn();
    render(<Row onOpenChange={onOpenChange} items={[{label: 'Archive'}]} />);
    act(() => {
      controls.open({x: 10, y: 10});
    });
    expect(isOpen()).toBe(true);
    act(() => {
      controls.close();
    });
    expect(isOpen()).toBe(false);
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('follows isDisabled: the browser keeps its menu while disabled', () => {
    const view = render(<Row isDisabled items={[{label: 'Archive'}]} />);
    expect(rightClick(screen.getByText('Inbox')).defaultPrevented).toBe(false);
    expect(isOpen()).toBe(false);
    view.rerender(<Row items={[{label: 'Archive'}]} />);
    expect(rightClick(screen.getByText('Inbox')).defaultPrevented).toBe(true);
    expect(isOpen()).toBe(true);
  });

  it('unmounting removes the menu and everything it added', () => {
    const view = render(<Row items={[{label: 'Archive'}]} />);
    const element = screen.getByText('Inbox');
    rightClick(element);
    view.unmount();
    expect(isOpen()).toBe(false);
    expect(
      document.querySelector(`[${dataAttr('context-menu-host')}]`),
    ).toBeNull();
    expect(rightClick(element).defaultPrevented).toBe(false);
  });
});
