// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MoreMenu.test.tsx
 * @input Uses vitest, @testing-library/react, MoreMenu component
 * @output Unit tests for MoreMenu component behavior
 * @position Testing; validates MoreMenu.tsx implementation
 *
 * SYNC: When MoreMenu.tsx changes, update tests to match new behavior
 */

import {createRef} from 'react';
import {describe, it, expect, vi, beforeAll, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MoreMenu} from './MoreMenu';
import {DropdownMenu} from '../DropdownMenu/DropdownMenu';
import {warmMenuBottomSheet} from '../DropdownMenu/__tests__/warmMenuBottomSheet';

// DropdownMenu's touch sheet is loaded lazily; resolve it once up front.
beforeAll(warmMenuBottomSheet, 20000);

// Mock showPopover and hidePopover methods since they're not implemented in jsdom
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

const defaultItems = [
  {label: 'Edit', onClick: vi.fn()},
  {label: 'Delete', onClick: vi.fn()},
];

describe('MoreMenu', () => {
  it('renders trigger button with default aria-label', () => {
    render(<MoreMenu items={defaultItems} />);
    expect(
      screen.getByRole('button', {name: 'More options'}),
    ).toBeInTheDocument();
  });

  it('renders menu with role="menu"', () => {
    render(<MoreMenu items={defaultItems} />);
    expect(screen.getByRole('menu', {hidden: true})).toBeInTheDocument();
  });

  it('has aria-haspopup and aria-expanded attributes', () => {
    render(<MoreMenu items={defaultItems} />);
    const button = screen.getByRole('button', {name: 'More options'});
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders menu items', () => {
    render(<MoreMenu items={defaultItems} />);

    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toBeInTheDocument();
  });

  it('opens menu when button is clicked', async () => {
    const user = userEvent.setup();
    render(<MoreMenu items={defaultItems} />);

    await user.click(screen.getByRole('button', {name: 'More options'}));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
  });

  it('keeps the trigger visually pressed while the menu is open', async () => {
    const user = userEvent.setup();
    render(<MoreMenu items={defaultItems} />);

    const trigger = screen.getByRole('button', {name: 'More options'});
    expect(trigger.className).not.toContain('DropdownMenu__styles.triggerOpen');

    await user.click(trigger);

    expect(trigger.className).toContain('DropdownMenu__styles.triggerOpen');
  });

  it('forwards BottomSheet presentation to DropdownMenu', async () => {
    const user = userEvent.setup();
    render(<MoreMenu items={defaultItems} presentation="bottom-sheet" />);

    await user.click(screen.getByRole('button', {name: 'More options'}));
    await waitFor(() =>
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce(),
    );
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  });

  it('calls onClick when item is clicked', async () => {
    const handleEdit = vi.fn();
    const items = [
      {label: 'Edit', onClick: handleEdit},
      {label: 'Delete', onClick: vi.fn()},
    ];
    const user = userEvent.setup();
    render(<MoreMenu items={items} />);

    // Open the menu first
    await user.click(screen.getByRole('button', {name: 'More options'}));
    // Click the item
    await user.click(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );

    expect(handleEdit).toHaveBeenCalledOnce();
  });

  it('supports disabled state', () => {
    render(<MoreMenu items={defaultItems} isDisabled />);
    const button = screen.getByRole('button', {name: 'More options'});
    // Button uses aria-disabled (not native disabled) to keep
    // the button focusable for tooltip access
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the menu closed from every opening key and press while disabled', async () => {
    const user = userEvent.setup();
    render(<MoreMenu items={defaultItems} isDisabled />);
    const button = screen.getByRole('button', {name: 'More options'});
    button.focus();
    for (const key of ['{Enter}', ' ', '{ArrowDown}', '{ArrowUp}']) {
      await user.keyboard(key);
      expect(button).toHaveAttribute('aria-expanded', 'false');
    }
    await user.pointer([
      {keys: '[MouseLeft>]', target: button},
      {keys: '[/MouseLeft]'},
    ]);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not carry a refused ArrowUp into a later open', async () => {
    const user = userEvent.setup();
    const {rerender} = render(<MoreMenu items={defaultItems} isDisabled />);
    const button = screen.getByRole('button', {name: 'More options'});
    button.focus();
    await user.keyboard('{ArrowUp}');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    // Enabled again, a synthesized click (detail 0: screen-reader activation)
    // opens on the FIRST row; the refused ArrowUp must not have armed "last".
    rerender(<MoreMenu items={defaultItems} />);
    fireEvent.click(button, {detail: 0});
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
      ).toHaveFocus();
    });
  });

  it('supports custom label', () => {
    render(<MoreMenu items={defaultItems} label="Row actions" />);
    expect(
      screen.getByRole('button', {name: 'Row actions'}),
    ).toBeInTheDocument();
  });

  it('supports custom icon', () => {
    const CustomIcon = () => <span data-testid="custom-icon">★</span>;
    render(<MoreMenu items={defaultItems} icon={<CustomIcon />} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('supports data-testid', () => {
    render(<MoreMenu items={defaultItems} data-testid="my-menu" />);
    expect(screen.getByTestId('my-menu')).toBeInTheDocument();
  });

  it('opens menu when clicked', async () => {
    const user = userEvent.setup();
    render(<MoreMenu items={defaultItems} />);

    await user.click(screen.getByRole('button', {name: 'More options'}));
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
  });

  it('renders sections with group role', () => {
    const items = [
      {
        type: 'section' as const,
        title: 'Actions',
        items: [{label: 'Edit', onClick: vi.fn()}],
      },
    ];
    render(<MoreMenu items={items} />);

    expect(
      screen.getByRole('group', {name: 'Actions', hidden: true}),
    ).toBeInTheDocument();
  });

  it('does not call onClick for disabled items', async () => {
    const handleEdit = vi.fn();
    const items = [{label: 'Edit', onClick: handleEdit, isDisabled: true}];
    const user = userEvent.setup();
    render(<MoreMenu items={items} />);

    await user.click(screen.getByRole('button', {name: 'More options'}));
    await user.click(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );

    expect(handleEdit).not.toHaveBeenCalled();
  });

  it('forwards its ref to the bottom-sheet trigger', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <MoreMenu items={defaultItems} ref={ref} presentation="bottom-sheet" />,
    );
    expect(ref.current).toBe(
      screen.getByRole('button', {name: 'More options'}),
    );
  });

  it('supports forwardRef', () => {
    const ref = vi.fn();
    render(<MoreMenu items={defaultItems} ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('renders dividers between items', () => {
    const items = [
      {label: 'Edit', onClick: vi.fn()},
      {type: 'divider' as const},
      {label: 'Delete', onClick: vi.fn()},
    ];
    render(<MoreMenu items={items} />);

    const separators = screen.getAllByRole('separator', {hidden: true});
    expect(separators.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults to ghost variant', () => {
    render(<MoreMenu items={defaultItems} />);
    const button = screen.getByRole('button', {name: 'More options'});
    // Ghost variant should render a button element
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
  });

  it('renders astryx-more-menu class on dropdown panel for theme targeting', () => {
    render(<MoreMenu items={defaultItems} />);
    const menu = screen.getByRole('menu', {hidden: true});
    expect(menu.className).toContain('astryx-more-menu');
  });

  it('pointer open focuses the menu container, not the first item (#4477)', async () => {
    const user = userEvent.setup();
    render(<MoreMenu items={defaultItems} />);

    await user.click(screen.getByRole('button', {name: 'More options'}));

    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).not.toHaveFocus();
  });

  it('first ArrowDown after a pointer open moves focus to the first item (#4477)', async () => {
    const user = userEvent.setup();
    render(<MoreMenu items={defaultItems} />);

    await user.click(screen.getByRole('button', {name: 'More options'}));
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => expect(menu).toHaveFocus());

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    ).toHaveFocus();
  });

  describe('placement and alignment', () => {
    const positionAreaOf = (menu: HTMLElement) =>
      menu
        .closest('[popover]')
        ?.getAttribute('style')
        ?.match(/position-area:[^;]*/)?.[0];

    it('resolves the same default position as DropdownMenu', () => {
      render(
        <>
          <MoreMenu items={defaultItems} />
          <DropdownMenu button={{label: 'Actions'}} items={defaultItems} />
        </>,
      );
      const [moreMenu, dropdownMenu] = screen.getAllByRole('menu', {
        hidden: true,
      });

      expect(positionAreaOf(moreMenu)).toBe(positionAreaOf(dropdownMenu));
      expect(positionAreaOf(moreMenu)).toBe(
        'position-area: self-block-end span-self-inline-end',
      );
    });

    it('forwards alignment to the menu layer', () => {
      render(<MoreMenu items={defaultItems} alignment="end" />);
      expect(positionAreaOf(screen.getByRole('menu', {hidden: true}))).toBe(
        'position-area: self-block-end span-self-inline-start',
      );
    });

    it('forwards placement to the menu layer', () => {
      render(<MoreMenu items={defaultItems} placement="above" />);
      expect(positionAreaOf(screen.getByRole('menu', {hidden: true}))).toBe(
        'position-area: self-block-start span-self-inline-end',
      );
    });
  });
});
