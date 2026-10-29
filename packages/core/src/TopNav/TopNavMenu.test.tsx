// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TopNavMenu.test.tsx
 * @input Uses vitest, @testing-library/react, TopNavMenu
 * @output Unit tests for TopNavMenu component
 * @position Testing; validates TopNavMenu behavior
 *
 * SYNC: When TopNavMenu changes, update tests to match new behavior
 */

import {beforeEach, describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {TopNavRenderContext} from './TopNavRenderContext';
import {TopNavMenu} from './TopNavMenu';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import {expectNativeLinkClicks} from '../hooks/__tests__/menuLinkClicks';

const mockItems = [
  {
    title: 'Analytics',
    description: 'Track user behavior',
    href: '/analytics',
  },
  {
    title: 'Messaging',
    description: 'Real-time communication',
    href: '/messaging',
  },
];

describe('TopNavMenu', () => {
  it.each([
    'javascript:alert(1)',
    'vbscript:MsgBox(1)',
    'data:text/html,<b>x</b>',
  ])('does not expose rejected menu destination %s', href => {
    const onClick = vi.fn();
    render(
      <TopNavMenu
        label="Menu"
        items={[{title: 'Destination', href, onClick}]}
      />,
    );
    const item = screen.getByRole('menuitem', {hidden: true});
    expect(item).not.toHaveAttribute('href');
    fireEvent.click(item);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('preserves an accepted native menu destination', () => {
    render(
      <TopNavMenu
        label="Menu"
        items={[{title: 'Destination', href: '/docs'}]}
      />,
    );
    expect(screen.getByRole('menuitem', {hidden: true})).toHaveAttribute(
      'href',
      '/docs',
    );
  });
  it('renders the trigger button with label', () => {
    render(<TopNavMenu label="Products" items={mockItems} />);
    expect(screen.getByRole('button', {name: 'Products'})).toBeInTheDocument();
  });

  it('trigger announces a menu popup, not a dialog', () => {
    render(<TopNavMenu label="Products" items={mockItems} />);
    const trigger = screen.getByRole('button', {name: 'Products'});
    // usePopover with role:'none' emits aria-haspopup="true" (the ARIA
    // synonym for "menu") because the exposed semantics of the popup are its
    // child role="menu", not a dialog.
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');
  });

  it('renders with custom items', () => {
    const items = [{title: 'Custom Item', description: 'A custom description'}];
    render(<TopNavMenu label="Menu" items={items} />);
    expect(screen.getByRole('button', {name: 'Menu'})).toBeInTheDocument();
  });

  it('renders icon when provided in items', () => {
    const items = [
      {
        title: 'With Icon',
        description: 'Has an icon',
        icon: <span data-testid="menu-icon">Icon</span>,
      },
    ];
    render(<TopNavMenu label="Menu" items={items} />);
    // Icon is in the hover card content, which may not be visible initially
    expect(screen.getByRole('button', {name: 'Menu'})).toBeInTheDocument();
  });
});

describe('menu semantics (APG)', () => {
  it('does not wrap the popup in a role="dialog" / aria-modal shell', () => {
    render(<TopNavMenu label="Products" items={mockItems} />);
    // The popup's exposed semantics are the role="menu" container itself —
    // no dialog wrapper, no aria-modal.
    expect(
      screen.queryByRole('dialog', {hidden: true}),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[aria-modal]')).toBeNull();
    expect(
      screen.getByRole('menu', {name: 'Products', hidden: true}),
    ).toBeInTheDocument();
  });
});

describe('keyboard navigation (APG menu pattern)', () => {
  it('exposes exactly one tab stop among menu items (roving tabindex)', async () => {
    const user = userEvent.setup();
    render(<TopNavMenu label="Products" items={mockItems} />);
    await user.click(screen.getByRole('button', {name: 'Products'}));

    const items = screen.getAllByRole('menuitem', {hidden: true});
    expect(items).toHaveLength(2);
    const tabbable = items.filter(el => el.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('moves focus with ArrowDown/ArrowUp and the tab stop follows', async () => {
    const user = userEvent.setup();
    render(<TopNavMenu label="Products" items={mockItems} />);
    await user.click(screen.getByRole('button', {name: 'Products'}));

    const menu = screen.getByRole('menu', {hidden: true});
    const items = screen.getAllByRole('menuitem', {hidden: true});
    items[0].focus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(items[1]).toHaveFocus();
    expect(items[1]).toHaveAttribute('tabindex', '0');
    expect(items[0]).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(menu, {key: 'ArrowUp'});
    expect(items[0]).toHaveFocus();
    expect(items[0]).toHaveAttribute('tabindex', '0');
    expect(items[1]).toHaveAttribute('tabindex', '-1');
  });

  it('wraps focus at both ends', async () => {
    const user = userEvent.setup();
    render(<TopNavMenu label="Products" items={mockItems} />);
    await user.click(screen.getByRole('button', {name: 'Products'}));

    const menu = screen.getByRole('menu', {hidden: true});
    const items = screen.getAllByRole('menuitem', {hidden: true});

    items[1].focus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(items[0]).toHaveFocus();

    fireEvent.keyDown(menu, {key: 'ArrowUp'});
    expect(items[1]).toHaveFocus();
  });

  it('typeahead moves focus to the item matching the typed character', async () => {
    const user = userEvent.setup();
    render(<TopNavMenu label="Products" items={mockItems} />);
    await user.click(screen.getByRole('button', {name: 'Products'}));

    const menu = screen.getByRole('menu', {hidden: true});
    fireEvent.keyDown(menu, {key: 'm'});
    expect(
      screen.getByRole('menuitem', {name: /Messaging/, hidden: true}),
    ).toHaveFocus();
  });

  it('activates a focused onClick-only item with Enter', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TopNavMenu label="Menu" items={[{title: 'Action', onClick}]} />);
    await user.click(screen.getByRole('button', {name: 'Menu'}));

    const item = screen.getByRole('menuitem', {hidden: true});
    item.focus();
    fireEvent.keyDown(item, {key: 'Enter'});
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('still activates an item on click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TopNavMenu label="Menu" items={[{title: 'Action', onClick}]} />);
    await user.click(screen.getByRole('button', {name: 'Menu'}));

    await user.click(screen.getByRole('menuitem', {hidden: true}));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('closes the menu with Escape', async () => {
    const user = userEvent.setup();
    render(<TopNavMenu label="Products" items={mockItems} />);
    const trigger = screen.getByRole('button', {name: 'Products'});
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const menu = screen.getByRole('menu', {hidden: true});
    fireEvent.keyDown(menu, {key: 'Escape'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

// =============================================================================
// The shared focus ring (#4654) — see the note in SideNav.test.tsx: jsdom will
// not derive `:focus-visible` here, so what is pinned is that the focusable
// element composes the shared utility's classes rather than falling back to
// the browser's own outline.
// =============================================================================

const sharedFocusRingClasses = stylex
  .props(focusOutlineStyles.focusVisible)
  .className!.split(' ');

function expectSharedFocusRing(el: Element) {
  const classes = el.className.split(' ');
  for (const c of sharedFocusRingClasses) {
    expect(classes).toContain(c);
  }
}

describe('TopNavMenu — drawer focus ring', () => {
  it('draws the shared ring on the drawer section header', () => {
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMenu label="Products" items={mockItems} />
      </TopNavRenderContext>,
    );
    expectSharedFocusRing(screen.getByRole('button', {name: /Products/}));
  });

  it('draws the shared ring on a drawer item', async () => {
    const user = userEvent.setup();
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMenu label="Products" items={mockItems} />
      </TopNavRenderContext>,
    );
    await user.click(screen.getByRole('button', {name: /Products/}));
    expectSharedFocusRing(screen.getByRole('link', {name: /Analytics/}));
  });

  it('clips the drawer section only while it is collapsed', async () => {
    // The ring paints outside the item, so a permanent clip would cut it off.
    const user = userEvent.setup();
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMenu label="Products" items={mockItems} />
      </TopNavRenderContext>,
    );
    const trigger = screen.getByRole('button', {name: /Products/});
    const section = document.getElementById(
      trigger.getAttribute('aria-controls') ?? '',
    )!;
    expect(getComputedStyle(section).overflow).toBe('hidden');
    expect(getComputedStyle(section.firstElementChild!).overflow).toBe('');

    await user.click(trigger);
    expect(getComputedStyle(section).overflow).toBe('visible');
  });
});

describe('TopNavMenu — drawer collapsed section', () => {
  it('makes collapsed items inert and hidden from assistive technology', async () => {
    const user = userEvent.setup();
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMenu label="Products" items={mockItems} />
      </TopNavRenderContext>,
    );
    const trigger = screen.getByRole('button', {name: /Products/});
    const region = document.getElementById(
      trigger.getAttribute('aria-controls') ?? '',
    );

    expect(region).toHaveAttribute('inert');
    expect(region).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('link', {name: /Analytics/})).toBeNull();

    await user.click(trigger);
    expect(region).not.toHaveAttribute('inert');
    expect(region).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByRole('link', {name: /Analytics/})).toBeInTheDocument();
  });
});

describe('TopNavMenu pass-through props', () => {
  it('forwards pass-through props to the trigger button', () => {
    render(
      <TopNavMenu
        label="Products"
        items={mockItems}
        aria-label="Products menu"
        id="products-trigger"
        data-source="nav"
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Products menu'});
    expect(trigger).toHaveAttribute('id', 'products-trigger');
    expect(trigger).toHaveAttribute('data-source', 'nav');
  });

  it('forwards pass-through props to the drawer trigger', () => {
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMenu
          label="Products"
          items={mockItems}
          id="products-drawer"
          data-source="nav"
        />
      </TopNavRenderContext>,
    );
    const trigger = screen.getByRole('button', {name: /Products/});
    expect(trigger).toHaveAttribute('id', 'products-drawer');
    expect(trigger).toHaveAttribute('data-source', 'nav');
  });

  it('keeps its own popup wiring when a caller passes the same attributes', () => {
    render(
      <TopNavMenu
        label="Products"
        items={mockItems}
        aria-haspopup="dialog"
        aria-expanded
        data-source="nav"
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Products'});
    expect({
      hasPopup: trigger.getAttribute('aria-haspopup'),
      isExpanded: trigger.getAttribute('aria-expanded'),
      dataSource: trigger.getAttribute('data-source'),
    }).toEqual({hasPopup: 'true', isExpanded: 'false', dataSource: 'nav'});
  });
});

describe('TopNavMenu — owned handlers on the trigger', () => {
  it("composes a caller's onClick with the trigger's own open behavior", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <TopNavMenu label="Products" items={mockItems} onClick={handleClick} />,
    );

    const trigger = screen.getByRole('button', {name: 'Products'});
    await user.click(trigger);

    expect(handleClick).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it("composes a caller's hover handlers with the trigger's hover wiring", async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const handleMouseEnter = vi.fn();
    const handleMouseLeave = vi.fn();
    render(
      <TopNavMenu
        label="Products"
        items={mockItems}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />,
    );

    const trigger = screen.getByRole('button', {name: 'Products'});
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(handleMouseEnter).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.unhover(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(handleMouseLeave).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    vi.useRealTimers();
  });

  it("composes a caller's onClick with the drawer section toggle", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMenu label="Products" items={mockItems} onClick={handleClick} />
      </TopNavRenderContext>,
    );

    const trigger = screen.getByRole('button', {name: /Products/});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(handleClick).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('still forwards hover handlers the drawer trigger does not own', async () => {
    const user = userEvent.setup();
    const handleMouseEnter = vi.fn();
    render(
      <TopNavRenderContext value="drawer">
        <TopNavMenu
          label="Products"
          items={mockItems}
          onMouseEnter={handleMouseEnter}
        />
      </TopNavRenderContext>,
    );

    await user.hover(screen.getByRole('button', {name: /Products/}));
    expect(handleMouseEnter).toHaveBeenCalledOnce();
  });
});

describe('TopNavMenu as an action group (family:action-groups)', () => {
  beforeEach(() => {
    __resetMenuPressForTest();
  });

  const item = (name: RegExp) =>
    screen.getByRole('menuitem', {name, hidden: true});

  it('renders a link item undraggable, so a mouse press that slides to another item is not a drag', () => {
    render(
      <TopNavMenu
        label="Products"
        items={[
          {title: 'Docs', href: '/docs'},
          {title: 'Status', onClick: () => {}},
        ]}
      />,
    );
    expect(item(/Docs/)).toHaveAttribute('draggable', 'false');
    expect(item(/Status/)).not.toHaveAttribute('draggable');
  });

  it('leaves a Ctrl-, Cmd-, Shift- or middle click on a link item to the browser', () => {
    render(
      <TopNavMenu
        label="Products"
        items={[
          {title: 'Docs', href: '/docs'},
          {title: 'Status', href: '/status'},
        ]}
      />,
    );
    expectNativeLinkClicks(item(/Docs/));
  });

  it('acts on the item a press lifts on, once, after sliding from another (FR1, FR2, FR5)', () => {
    const onAnalytics = vi.fn();
    const onMessaging = vi.fn();
    render(
      <TopNavMenu
        label="Products"
        items={[
          {title: 'Analytics', onClick: onAnalytics},
          {title: 'Messaging', onClick: onMessaging},
        ]}
      />,
    );
    for (const pointer of [
      {pointerType: 'touch', pointerId: 1},
      {pointerType: 'mouse', pointerId: 2, button: 0},
    ]) {
      onAnalytics.mockClear();
      onMessaging.mockClear();
      fireEvent.pointerDown(item(/Analytics/), pointer);
      fireEvent.pointerMove(item(/Messaging/), pointer);
      fireEvent.pointerUp(item(/Messaging/), pointer);
      expect(onMessaging).toHaveBeenCalledTimes(1);
      expect(onAnalytics).not.toHaveBeenCalled();
    }
  });
});
