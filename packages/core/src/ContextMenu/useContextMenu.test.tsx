// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useContextMenu.test.tsx
 * @input vitest (jsdom), Testing Library, useContextMenu in a component
 * @output Checks the hook over createContextMenu (spec:AST-107 FR8, FR6): it
 *   attaches to the ref'd element, renders `items` or a ReactNode
 *   `menuContent` with the caller's Core providers, opens and closes from
 *   what it returns, follows `isDisabled`, and unmounting removes it all
 * @position Testing for useContextMenu.tsx
 */

import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {use, useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {LayerContext} from '../Layer/LayerContext';
import {dataAttr} from '../naming';
import {useContextMenu, type UseContextMenuOptions} from './useContextMenu';

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
