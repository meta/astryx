// Copyright (c) Meta Platforms, Inc. and affiliates.

import {beforeEach, describe, it, expect, vi} from 'vitest';
import {Activity, type KeyboardEvent} from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {LinkProvider} from '../Link';
import {NavHeadingMenu} from './NavHeadingMenu';
import {NavHeadingMenuItem} from './NavHeadingMenuItem';
import {NavHeadingCloseContext} from './NavMenuContext';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import {expectNativeLinkClicks} from '../hooks/__tests__/menuLinkClicks';

describe('NavHeadingMenu', () => {
  it('renders with role="menu"', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Item 1" />
      </NavHeadingMenu>,
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('renders children as menuitems', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Dashboard" />
        <NavHeadingMenuItem label="Settings" />
      </NavHeadingMenu>,
    );
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Dashboard');
    expect(items[1]).toHaveTextContent('Settings');
  });

  it('applies size class to container', () => {
    render(
      <NavHeadingMenu size="lg">
        <NavHeadingMenuItem label="Item" />
      </NavHeadingMenu>,
    );
    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('nav-heading-menu');
  });

  it('applies data-testid', () => {
    render(
      <NavHeadingMenu data-testid="product-menu">
        <NavHeadingMenuItem label="Item" />
      </NavHeadingMenu>,
    );
    expect(screen.getByTestId('product-menu')).toBeInTheDocument();
  });

  it('applies minWidth override via inline style', () => {
    render(
      <NavHeadingMenu minWidth={300}>
        <NavHeadingMenuItem label="Item" />
      </NavHeadingMenu>,
    );
    const menu = screen.getByRole('menu');
    expect(menu.style.minWidth).toBe('300px');
  });
});

describe('NavHeadingMenuItem', () => {
  it('renders with role="menuitem"', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Dashboard" />
      </NavHeadingMenu>,
    );
    expect(screen.getByRole('menuitem')).toHaveTextContent('Dashboard');
  });

  it('renders as a link when href is provided', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" />
      </NavHeadingMenu>,
    );
    const item = screen.getByRole('menuitem');
    expect(item.tagName).toBe('A');
    expect(item).toHaveAttribute('href', '/docs');
  });

  it('renders as div when no href', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Action" onClick={() => {}} />
      </NavHeadingMenu>,
    );
    const item = screen.getByRole('menuitem');
    expect(item.tagName).toBe('DIV');
  });

  it('calls onClick on click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Action" onClick={onClick} />
      </NavHeadingMenu>,
    );
    await user.click(screen.getByRole('menuitem'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Action" onClick={onClick} isDisabled />
      </NavHeadingMenu>,
    );
    await user.click(screen.getByRole('menuitem'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sets aria-disabled when disabled', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Disabled" isDisabled />
      </NavHeadingMenu>,
    );
    expect(screen.getByRole('menuitem')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('exposes no destination on a disabled link item', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" isDisabled />
      </NavHeadingMenu>,
    );
    const item = screen.getByRole('menuitem');
    // No href means no navigation path at all: not a pointer click, a
    // middle-click, an assistive-technology activation, or Enter.
    expect(item).not.toHaveAttribute('href');
    // The row keeps its shape and still reports the disabled state.
    expect(item.tagName).toBe('A');
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not reach a custom link component when a link item is disabled', () => {
    function CustomLink({
      children,
      ref,
      ...props
    }: React.ComponentPropsWithRef<'a'>) {
      return (
        <a ref={ref} data-custom-link {...props}>
          {children}
        </a>
      );
    }
    render(
      <LinkProvider component={CustomLink}>
        <NavHeadingMenu>
          <NavHeadingMenuItem label="Docs" href="/docs" isDisabled />
        </NavHeadingMenu>
      </LinkProvider>,
    );
    const item = screen.getByRole('menuitem');
    expect(item).not.toHaveAttribute('data-custom-link');
    expect(item).not.toHaveAttribute('href');
  });

  it('keeps an enabled link item on the custom link component', () => {
    function CustomLink({
      children,
      ref,
      ...props
    }: React.ComponentPropsWithRef<'a'>) {
      return (
        <a ref={ref} data-custom-link {...props}>
          {children}
        </a>
      );
    }
    render(
      <LinkProvider component={CustomLink}>
        <NavHeadingMenu>
          <NavHeadingMenuItem label="Docs" href="/docs" />
        </NavHeadingMenu>
      </LinkProvider>,
    );
    const item = screen.getByRole('menuitem');
    expect(item).toHaveAttribute('data-custom-link');
    expect(item).toHaveAttribute('href', '/docs');
  });

  it('keeps a disabled link item focusable but out of the Tab order', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" isDisabled />
      </NavHeadingMenu>,
    );
    const item = screen.getByRole('menuitem');
    // No href and no tabindex would make the anchor unfocusable.
    expect(item).toHaveAttribute('tabindex', '-1');
    item.focus();
    expect(item).toHaveFocus();
  });

  it('keeps focus on a link item that becomes disabled while focused', () => {
    const {rerender} = render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" />
      </NavHeadingMenu>,
    );
    screen.getByRole('menuitem').focus();
    expect(screen.getByRole('menuitem')).toHaveFocus();

    rerender(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" isDisabled />
      </NavHeadingMenu>,
    );
    const disabled = screen.getByRole('menuitem');
    expect(disabled).not.toHaveAttribute('href');
    expect(disabled).toHaveFocus();

    rerender(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" />
      </NavHeadingMenu>,
    );
    expect(screen.getByRole('menuitem')).toHaveFocus();
  });

  it('does not steal focus when an unfocused link item toggles disabled', () => {
    const {rerender} = render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" />
      </NavHeadingMenu>,
    );
    rerender(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" isDisabled />
      </NavHeadingMenu>,
    );
    expect(screen.getByRole('menuitem')).not.toHaveFocus();
  });

  it('does not pull focus back when an Activity boundary reveals a row', () => {
    const tree = (mode: 'visible' | 'hidden') => (
      <>
        <button type="button">Elsewhere</button>
        <Activity mode={mode}>
          <NavHeadingMenu>
            <NavHeadingMenuItem label="Docs" href="/docs" />
          </NavHeadingMenu>
        </Activity>
      </>
    );
    const {rerender} = render(tree('visible'));
    screen.getByRole('menuitem').focus();
    expect(screen.getByRole('menuitem')).toHaveFocus();

    // Hide the row while it holds focus, then move focus elsewhere.
    rerender(tree('hidden'));
    const other = screen.getByRole('button', {name: 'Elsewhere'});
    other.focus();
    expect(other).toHaveFocus();

    // Revealing the same node must leave focus where the person put it.
    rerender(tree('visible'));
    expect(other).toHaveFocus();
  });

  it('leaves focus on the page when an Activity boundary reveals a row', () => {
    const tree = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <NavHeadingMenu>
          <NavHeadingMenuItem label="Docs" href="/docs" />
        </NavHeadingMenu>
      </Activity>
    );
    const {rerender} = render(tree('visible'));
    screen.getByRole('menuitem').focus();
    expect(screen.getByRole('menuitem')).toHaveFocus();

    // Hide while focused, then drop focus to the page.
    rerender(tree('hidden'));
    (document.activeElement as HTMLElement | null)?.blur();

    // The same node re-attaches on reveal; it was not replaced, so it must not
    // pull focus back from the page.
    rerender(tree('visible'));
    expect(document.activeElement).toBe(document.body);
  });

  it('does not take focus on reveal when isDisabled flipped while hidden', () => {
    const tree = (mode: 'visible' | 'hidden', isDisabled: boolean) => (
      <>
        <button type="button">Elsewhere</button>
        <Activity mode={mode}>
          <NavHeadingMenu>
            <NavHeadingMenuItem
              label="Billing"
              href="/billing"
              isDisabled={isDisabled}
            />
          </NavHeadingMenu>
        </Activity>
      </>
    );
    const {rerender} = render(tree('visible', false));
    screen.getByRole('menuitem').focus();
    expect(screen.getByRole('menuitem')).toHaveFocus();

    // Hide while focused, swap the row's element type while hidden, then move
    // focus to another control.
    rerender(tree('hidden', false));
    rerender(tree('hidden', true));
    const other = screen.getByRole('button', {name: 'Elsewhere'});
    other.focus();
    expect(other).toHaveFocus();

    // The swapped-in node attaches only now and must not take focus.
    rerender(tree('visible', true));
    expect(screen.getByRole('menuitem')).not.toHaveAttribute('href');
    expect(other).toHaveFocus();
  });

  it('renders description text', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Dashboard" description="View metrics" />
      </NavHeadingMenu>,
    );
    expect(screen.getByText('View metrics')).toBeInTheDocument();
  });

  it('applies data-testid', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Item" data-testid="menu-item-1" />
      </NavHeadingMenu>,
    );
    expect(screen.getByTestId('menu-item-1')).toBeInTheDocument();
  });
});

describe('keyboard navigation', () => {
  it('keeps arrow navigation when an item handler cancels', () => {
    const onKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault());
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="First" onKeyDown={onKeyDown} />
        <NavHeadingMenuItem label="Second" />
      </NavHeadingMenu>,
    );
    const [first, second] = screen.getAllByRole('menuitem');
    first.focus();
    fireEvent.keyDown(first, {key: 'ArrowDown'});
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(second).toHaveFocus();
  });

  it.each(['onKeyDown', 'onKeyDownCapture'] as const)(
    'preserves menu-level cancellation through %s',
    handler => {
      const cancel = vi.fn((event: KeyboardEvent) => event.preventDefault());
      render(
        <NavHeadingMenu {...{[handler]: cancel}}>
          <NavHeadingMenuItem label="First" />
          <NavHeadingMenuItem label="Second" />
        </NavHeadingMenu>,
      );
      const first = screen.getAllByRole('menuitem')[0];
      first.focus();
      fireEvent.keyDown(first, {key: 'ArrowDown'});
      expect(cancel).toHaveBeenCalledOnce();
      expect(first).toHaveFocus();
    },
  );

  it('moves focus with arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="First" />
        <NavHeadingMenuItem label="Second" />
        <NavHeadingMenuItem label="Third" />
      </NavHeadingMenu>,
    );
    const items = screen.getAllByRole('menuitem');
    items[0].focus();
    expect(document.activeElement).toBe(items[0]);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[2]);

    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(items[1]);
  });

  it('wraps focus at boundaries', async () => {
    const user = userEvent.setup();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="First" />
        <NavHeadingMenuItem label="Last" />
      </NavHeadingMenu>,
    );
    const items = screen.getAllByRole('menuitem');
    items[1].focus();

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[0]);
  });

  it('Home focuses first item, End focuses last', async () => {
    const user = userEvent.setup();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="First" />
        <NavHeadingMenuItem label="Middle" />
        <NavHeadingMenuItem label="Last" />
      </NavHeadingMenu>,
    );
    const items = screen.getAllByRole('menuitem');
    items[1].focus();

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(items[0]);

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(items[2]);
  });

  it('activates a focused onClick-only item with Enter', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Action" onClick={onClick} />
      </NavHeadingMenu>,
    );
    const item = screen.getByRole('menuitem');
    item.focus();

    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('activates a focused onClick-only item with Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Action" onClick={onClick} />
      </NavHeadingMenu>,
    );
    const item = screen.getByRole('menuitem');
    item.focus();

    await user.keyboard('{ }');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not activate a disabled item with Enter', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Action" onClick={onClick} isDisabled />
      </NavHeadingMenu>,
    );
    const item = screen.getByRole('menuitem');
    item.focus();

    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('typeahead focuses the item matching the typed character (menus-11)', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Cut" />
        <NavHeadingMenuItem label="Paste" />
      </NavHeadingMenu>,
    );
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, {key: 'p'});
    expect(screen.getByRole('menuitem', {name: 'Paste'})).toHaveFocus();
  });

  it('typeahead skips a disabled menuitem (menus-11)', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Cut" />
        <NavHeadingMenuItem label="Paste (disabled)" isDisabled />
        <NavHeadingMenuItem label="Paste special" />
      </NavHeadingMenu>,
    );
    const menu = screen.getByRole('menu');
    // Typing "p" must land on the enabled "Paste special", never the disabled
    // "Paste (disabled)" — the disabled item is excluded from the typeahead
    // selector entirely.
    fireEvent.keyDown(menu, {key: 'p'});
    expect(screen.getByRole('menuitem', {name: 'Paste special'})).toHaveFocus();
    expect(
      screen.getByRole('menuitem', {name: 'Paste (disabled)'}),
    ).not.toHaveFocus();
  });
});

describe('context forwarding', () => {
  it('forwards closeMenu from parent NavMenuContext', async () => {
    const user = userEvent.setup();
    const closeMenu = vi.fn();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Action" onClick={() => {}} />
      </NavHeadingMenu>,
      {
        wrapper: ({children}) => (
          <NavHeadingCloseContext value={{closeMenu}}>
            {children}
          </NavHeadingCloseContext>
        ),
      },
    );
    await user.click(screen.getByRole('menuitem'));
    expect(closeMenu).toHaveBeenCalledOnce();
  });

  it('calls parent closeMenu on Escape', async () => {
    const user = userEvent.setup();
    const closeMenu = vi.fn();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="First" />
      </NavHeadingMenu>,
      {
        wrapper: ({children}) => (
          <NavHeadingCloseContext value={{closeMenu}}>
            {children}
          </NavHeadingCloseContext>
        ),
      },
    );
    screen.getByRole('menuitem').focus();
    await user.keyboard('{Escape}');
    expect(closeMenu).toHaveBeenCalledOnce();
  });
});

describe('NavHeadingMenu pass-through props', () => {
  it('forwards pass-through props to the menu element', () => {
    render(
      <NavHeadingMenu aria-label="Products" id="products" data-source="nav">
        <NavHeadingMenuItem label="First" />
      </NavHeadingMenu>,
    );
    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('aria-label', 'Products');
    expect(menu).toHaveAttribute('id', 'products');
    expect(menu).toHaveAttribute('data-source', 'nav');
  });

  it('runs a caller onKeyDown alongside the menu keyboard model', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    render(
      <NavHeadingMenu onKeyDown={onKeyDown}>
        <NavHeadingMenuItem label="First" />
        <NavHeadingMenuItem label="Second" />
      </NavHeadingMenu>,
    );
    const items = screen.getAllByRole('menuitem');
    items[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(onKeyDown).toHaveBeenCalled();
    expect(items[1]).toHaveFocus();
  });
});

describe('NavHeadingMenuItem pass-through props', () => {
  it('forwards pass-through props to the item element', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem
          label="Dashboard"
          aria-label="Open dashboard"
          id="nav-dashboard"
          data-tracking="nav-item"
          data-testid="item"
        />
      </NavHeadingMenu>,
    );
    const item = screen.getByTestId('item');
    expect(item).toHaveAttribute('aria-label', 'Open dashboard');
    expect(item).toHaveAttribute('id', 'nav-dashboard');
    expect(item).toHaveAttribute('data-tracking', 'nav-item');
  });

  it('forwards event handlers to the item element', () => {
    const handleMouseEnter = vi.fn();
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem
          label="Dashboard"
          onMouseEnter={handleMouseEnter}
          data-testid="item"
        />
      </NavHeadingMenu>,
    );
    fireEvent.mouseEnter(screen.getByTestId('item'));
    expect(handleMouseEnter).toHaveBeenCalledOnce();
  });

  it('keeps the menuitem contract over colliding pass-throughs', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem
          label="Dashboard"
          data-testid="item"
          role="button"
          aria-disabled="false"
          isDisabled
        />
      </NavHeadingMenu>,
    );
    // Owned role and aria-disabled win over the colliding pass-throughs.
    const item = screen.getByTestId('item');
    expect(item).toHaveAttribute('role', 'menuitem');
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('NavHeadingMenu as an action group (family:action-groups)', () => {
  beforeEach(() => {
    __resetMenuPressForTest();
  });

  const item = (name: string) => screen.getByRole('menuitem', {name});
  const finger = {pointerType: 'touch', pointerId: 1};
  const mouse = {pointerType: 'mouse', pointerId: 1, button: 0};

  function renderMenu() {
    const onDashboard = vi.fn();
    const onSettings = vi.fn();
    const closeMenu = vi.fn();
    render(
      <NavHeadingCloseContext value={{closeMenu}}>
        <NavHeadingMenu>
          <NavHeadingMenuItem label="Dashboard" onClick={onDashboard} />
          <NavHeadingMenuItem label="Settings" onClick={onSettings} />
          <NavHeadingMenuItem label="Archive" isDisabled />
        </NavHeadingMenu>
      </NavHeadingCloseContext>,
    );
    return {onDashboard, onSettings, closeMenu};
  }

  it('renders a link item undraggable, so a mouse press that slides to another item is not a drag', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" />
        <NavHeadingMenuItem label="Sign out" onClick={() => {}} />
      </NavHeadingMenu>,
    );
    expect(item('Docs')).toHaveAttribute('draggable', 'false');
    expect(item('Sign out')).not.toHaveAttribute('draggable');
  });

  it('leaves a Ctrl-, Cmd-, Shift- or middle click on a link item to the browser', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Docs" href="/docs" />
        <NavHeadingMenuItem label="Status" href="/status" />
      </NavHeadingMenu>,
    );
    expectNativeLinkClicks(item('Docs'));
  });

  it('acts on the item a finger lifts on, once, after sliding from another (FR1, FR2)', () => {
    const {onDashboard, onSettings} = renderMenu();
    fireEvent.pointerDown(item('Dashboard'), finger);
    fireEvent.pointerMove(item('Settings'), finger);
    fireEvent.pointerUp(item('Settings'), finger);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onDashboard).not.toHaveBeenCalled();
  });

  it('acts on the item a held mouse lifts on (FR5)', () => {
    const {onDashboard, onSettings} = renderMenu();
    fireEvent.pointerDown(item('Settings'), mouse);
    fireEvent.pointerMove(item('Dashboard'), mouse);
    fireEvent.pointerUp(item('Dashboard'), mouse);
    expect(onDashboard).toHaveBeenCalledTimes(1);
    expect(onSettings).not.toHaveBeenCalled();
  });

  it('acts on nothing for a lift on a disabled item (FR2)', () => {
    const {onDashboard, onSettings} = renderMenu();
    fireEvent.pointerDown(item('Dashboard'), finger);
    fireEvent.pointerMove(item('Archive'), finger);
    fireEvent.pointerUp(item('Archive'), finger);
    expect(onDashboard).not.toHaveBeenCalled();
    expect(onSettings).not.toHaveBeenCalled();
  });
});
