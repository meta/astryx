// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, waitFor, fireEvent, act} from '@testing-library/react';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import {expectNativeLinkClicks} from '../hooks/__tests__/menuLinkClicks';
import userEvent from '@testing-library/user-event';
import {Breadcrumbs} from './Breadcrumbs';
import {BreadcrumbItem} from './BreadcrumbItem';
import {
  BreadcrumbMenuItem,
  BreadcrumbMenuDivider,
  BreadcrumbMenuGroup,
  BreadcrumbMenuCheckboxItem,
  BreadcrumbMenuRadioGroup,
  BreadcrumbMenuRadioItem,
} from './index';
import type {BreadcrumbMenuDividerProps, BreadcrumbMenuOption} from './index';
import {LinkProvider} from '../Link/LinkProvider';

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

describe('Breadcrumbs', () => {
  it('renders a nav landmark with aria-label', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
  });

  it('supports custom aria-label', () => {
    render(
      <Breadcrumbs label="Custom nav">
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByRole('navigation')).toHaveAttribute(
      'aria-label',
      'Custom nav',
    );
  });

  it('renders items in an ordered list', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
  });

  it('renders separators between items', () => {
    const {container} = render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Detail</BreadcrumbItem>
      </Breadcrumbs>,
    );
    // Each item renders its own separator span; first is hidden via CSS
    const separators = container.querySelectorAll('span[aria-hidden="true"]');
    expect(separators).toHaveLength(3);
    expect(separators[0].textContent).toBe('/');
  });

  it('wraps the contextual default slash in the RTL mirror style', () => {
    const {container} = render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Page</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const separators = container.querySelectorAll('span[aria-hidden="true"]');
    expect(separators[1].firstElementChild).toHaveTextContent('/');
    expect(separators[1].firstElementChild).toHaveAttribute('class');
  });

  it('supports custom separator', () => {
    const {container} = render(
      <Breadcrumbs separator={<span>›</span>}>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Page</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const separators = container.querySelectorAll('span[aria-hidden="true"]');
    // Custom separator content is nested inside the aria-hidden span
    // First item's separator is hidden via CSS, but still in the DOM
    expect(separators[1].textContent).toBe('›');
  });

  it('forwards ref to the nav element', () => {
    const ref = {current: null as HTMLElement | null};
    render(
      <Breadcrumbs ref={ref}>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('NAV');
  });

  it('supports data-testid', () => {
    render(
      <Breadcrumbs data-testid="my-breadcrumbs">
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByTestId('my-breadcrumbs')).toBeInTheDocument();
  });

  it('defaults to variant="default"', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('accepts variant="supporting"', () => {
    render(
      <Breadcrumbs variant="supporting">
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Current')).toHaveAttribute('aria-current', 'page');
  });

  it('supporting variant renders links and current items', () => {
    render(
      <Breadcrumbs variant="supporting">
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Detail</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const link = screen.getByRole('link', {name: 'Home'});
    expect(link).toHaveAttribute('href', '/');
    expect(screen.getByText('Detail')).toHaveAttribute('aria-current', 'page');
  });
});

describe('BreadcrumbItem', () => {
  it('renders a link when href is provided', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/home">Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const link = screen.getByRole('link', {name: 'Home'});
    expect(link).toHaveAttribute('href', '/home');
  });

  it('renders current item as span with aria-current="page"', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current Page</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const current = screen.getByText('Current Page');
    expect(current.tagName).toBe('SPAN');
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('auto-detects last child as current when no isCurrent is set', async () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
        <BreadcrumbItem>Last Item</BreadcrumbItem>
      </Breadcrumbs>,
    );
    // aria-current is set via useEffect on the content element (matching the
    // explicit isCurrent path), not the outer <li>.
    const lastContent = screen.getByText('Last Item');
    await waitFor(() => {
      expect(lastContent).toHaveAttribute('aria-current', 'page');
    });
    expect(lastContent.tagName).toBe('SPAN');
    // The <li> wrapper must NOT carry aria-current.
    expect(lastContent.closest('li')).not.toHaveAttribute('aria-current');
  });

  it('auto-detects aria-current on the anchor when the last item is a link', async () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/projects/current">Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const lastLink = screen.getByText('Current');
    await waitFor(() => {
      expect(lastLink).toHaveAttribute('aria-current', 'page');
    });
    // aria-current is on the anchor itself, not the <li>.
    expect(lastLink.tagName).toBe('A');
    expect(lastLink.closest('li')).not.toHaveAttribute('aria-current');
  });

  it('does not auto-detect when isCurrent is explicitly set', async () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem isCurrent>First</BreadcrumbItem>
        <BreadcrumbItem href="/second">Second</BreadcrumbItem>
        <BreadcrumbItem href="/third">Third</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByText('First')).toHaveAttribute('aria-current', 'page');
    // Wait for effects to settle, then confirm third has no aria-current
    const thirdLi = screen.getByText('Third').closest('li')!;
    await waitFor(() => {
      expect(thirdLi).not.toHaveAttribute('aria-current');
    });
    expect(screen.getByText('Third').tagName).toBe('A');
  });

  it('handles onClick on link items', async () => {
    const handleClick = vi.fn();
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/" onClick={handleClick}>
          Home
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const link = screen.getByRole('link', {name: 'Home'});
    await userEvent.click(link);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders onClick-only items as buttons with link styling', async () => {
    const handleClick = vi.fn();
    render(
      <Breadcrumbs>
        <BreadcrumbItem onClick={handleClick}>Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const button = screen.getByRole('button', {name: 'Home'});
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders startIcon', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          href="/"
          startIcon={<span data-testid="home-icon">icon</span>}>
          Home
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByTestId('home-icon')).toBeInTheDocument();
  });

  it('supports data-testid on items', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/" data-testid="crumb-home">
          Home
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent data-testid="crumb-current">
          Current
        </BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByTestId('crumb-home')).toBeInTheDocument();
    expect(screen.getByTestId('crumb-current')).toBeInTheDocument();
  });

  it('renders single item as current by auto-detection', async () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem>Only Item</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const content = screen.getByText('Only Item');
    await waitFor(() => {
      expect(content).toHaveAttribute('aria-current', 'page');
    });
    expect(content.tagName).toBe('SPAN');
    expect(content.closest('li')).not.toHaveAttribute('aria-current');
  });

  it('auto-detects last child as current with supporting variant', async () => {
    render(
      <Breadcrumbs variant="supporting">
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem>Last</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const content = screen.getByText('Last');
    await waitFor(() => {
      expect(content).toHaveAttribute('aria-current', 'page');
    });
    expect(content.tagName).toBe('SPAN');
    expect(content.closest('li')).not.toHaveAttribute('aria-current');
  });

  it('renders custom component for non-current items when as is provided', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/" as={CustomLink}>
          Home
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const link = screen.getByRole('link', {name: 'Home'});
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).toHaveAttribute('href', '/');
  });

  it('does not apply as to current item (renders as span)', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent as={CustomLink}>
          Current
        </BreadcrumbItem>
      </Breadcrumbs>,
    );
    const current = screen.getByText('Current');
    expect(current.tagName).toBe('SPAN');
    expect(current).not.toHaveAttribute('data-custom-link');
  });

  it('renders custom component from LinkProvider for non-current items', () => {
    render(
      <LinkProvider component={CustomLink}>
        <Breadcrumbs>
          <BreadcrumbItem href="/">Home</BreadcrumbItem>
          <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
          <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
        </Breadcrumbs>
      </LinkProvider>,
    );
    const homeLink = screen.getByRole('link', {name: 'Home'});
    expect(homeLink).toHaveAttribute('data-custom-link');
    const projectsLink = screen.getByRole('link', {name: 'Projects'});
    expect(projectsLink).toHaveAttribute('data-custom-link');
    // Current item is still a span
    const current = screen.getByText('Current');
    expect(current.tagName).toBe('SPAN');
  });
});

describe('BreadcrumbItem menu', () => {
  // Mock the native Popover API — jsdom doesn't implement showPopover/
  // hidePopover or the :popover-open match. Mirrors DropdownMenu's test setup.
  beforeEach(() => {
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

  const items: BreadcrumbMenuOption[] = [
    {label: 'Design', onClick: vi.fn()},
    {label: 'Engineering', onClick: vi.fn()},
    {type: 'divider'},
    {label: 'Data', onClick: vi.fn()},
  ];

  it('renders as a menu trigger button with aria-haspopup="menu"', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem menu={items}>Teams</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const trigger = screen.getByRole('button', {name: 'Teams'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('labels the menu from non-string trigger content', async () => {
    const user = userEvent.setup();
    render(
      <Breadcrumbs>
        <BreadcrumbItem menu={items}>
          <span>Teams</span>
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );

    await user.click(screen.getByRole('button', {name: 'Teams'}));

    expect(screen.getByRole('menu', {hidden: true})).toHaveAccessibleName(
      'Teams',
    );
  });

  it('leaves a Ctrl-, Cmd-, Shift- or middle click on a link item in its menu to the browser', async () => {
    __resetMenuPressForTest();
    const user = userEvent.setup();
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          menu={[
            {label: 'Design', href: '/design'},
            {label: 'Engineering', href: '/engineering'},
          ]}>
          Teams
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Teams'}));
    const row = screen.getByRole('menuitem', {name: 'Design', hidden: true});
    expectNativeLinkClicks(row.closest('a') ?? row);
  });

  it('acts on the menu item a press slid across the menu lifts on, once (family:action-groups FR1, FR2, FR5)', async () => {
    __resetMenuPressForTest();
    const user = userEvent.setup();
    const onFirst = vi.fn();
    const onSecond = vi.fn();
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          menu={[
            {label: 'Design', onClick: onFirst},
            {label: 'Engineering', onClick: onSecond},
          ]}>
          Teams
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Teams'}));
    const FIRST = 'Design';
    const SECOND = 'Engineering';
    const item = (name: string) =>
      screen.getByRole('menuitem', {name, hidden: true});
    for (const pointer of [
      {pointerType: 'touch', pointerId: 1},
      {pointerType: 'mouse', pointerId: 2, button: 0},
    ]) {
      onFirst.mockClear();
      onSecond.mockClear();
      fireEvent.pointerDown(item(FIRST), pointer);
      fireEvent.pointerMove(item(SECOND), pointer);
      fireEvent.pointerUp(item(SECOND), pointer);
      expect(onSecond).toHaveBeenCalledTimes(1);
      expect(onFirst).not.toHaveBeenCalled();
    }
  });

  it('portability: a DropdownMenuOption[] renders its items on open', async () => {
    const user = userEvent.setup();
    render(
      <Breadcrumbs>
        <BreadcrumbItem menu={items}>Teams</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Teams'}));
    const menu = screen.getByRole('menu', {hidden: true});
    expect(menu).toHaveAccessibleName('Teams');
    expect(
      screen.getByRole('menuitem', {name: 'Design', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Engineering', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {name: 'Data', hidden: true}),
    ).toBeInTheDocument();
  });

  it('after a pointer open, a row the mouse rests on takes focus without :focus-visible', async () => {
    // Nothing else in this file activates the shared modality tracking, so
    // the menu crumb must activate it for its rows to follow the last input
    // (architecture:interaction-modality INV1).
    const user = userEvent.setup();
    render(
      <Breadcrumbs>
        <BreadcrumbItem menu={items}>Teams</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Teams'}));
    const design = screen.getByRole('menuitem', {name: 'Design', hidden: true});
    const focusSpy = vi.spyOn(design, 'focus');
    fireEvent.pointerMove(design, {pointerType: 'mouse'});
    expect(design).toHaveFocus();
    expect(focusSpy).toHaveBeenCalledWith({
      preventScroll: true,
      focusVisible: false,
    });
  });

  it('fires the item onClick and closes the menu on select', async () => {
    const user = userEvent.setup();
    const onDesign = vi.fn();
    render(
      <Breadcrumbs>
        <BreadcrumbItem menu={[{label: 'Design', onClick: onDesign}]}>
          Teams
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Teams'}));
    await user.click(
      screen.getByRole('menuitem', {name: 'Design', hidden: true}),
    );
    expect(onDesign).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('supports the composed children form', async () => {
    const user = userEvent.setup();
    const onOverview = vi.fn();
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          menu={
            <>
              <BreadcrumbMenuItem label="Overview" onClick={onOverview} />
              <BreadcrumbMenuItem label="Settings" />
            </>
          }>
          Project
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Project'}));
    expect(
      screen.getByRole('menuitem', {name: 'Overview', hidden: true}),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('menuitem', {name: 'Overview', hidden: true}),
    );
    expect(onOverview).toHaveBeenCalledTimes(1);
  });

  it('supports a selectable checkbox item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          menu={
            <BreadcrumbMenuCheckboxItem
              label="Show archived"
              value={false}
              onChange={onChange}
            />
          }>
          Filters
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Filters'}));
    const checkbox = screen.getByRole('menuitemcheckbox', {
      name: 'Show archived',
      hidden: true,
    });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('supports a selectable radio group', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          menu={
            <BreadcrumbMenuRadioGroup
              label="Sort by"
              value="name"
              onChange={onChange}>
              <BreadcrumbMenuRadioItem value="name" label="Name" />
              <BreadcrumbMenuRadioItem value="date" label="Date" />
            </BreadcrumbMenuRadioGroup>
          }>
          Sort
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Sort'}));
    const nameOption = screen.getByRole('menuitemradio', {
      name: 'Name',
      hidden: true,
    });
    expect(nameOption).toHaveAttribute('aria-checked', 'true');
    await user.click(
      screen.getByRole('menuitemradio', {name: 'Date', hidden: true}),
    );
    expect(onChange).toHaveBeenCalledWith('date');
  });

  it('opens with ArrowDown and closes with Escape, returning focus to trigger', async () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem menu={items}>Teams</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const trigger = screen.getByRole('button', {name: 'Teams'});
    trigger.focus();
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => {
      expect(menu).toContainElement(
        document.activeElement as HTMLElement | null,
      );
    });
    fireEvent.keyDown(menu, {key: 'Escape'});
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('preserves outside focus after a browser light dismiss', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Breadcrumbs>
          <BreadcrumbItem menu={items}>Teams</BreadcrumbItem>
          <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
        </Breadcrumbs>
        <button type="button">Outside action</button>
      </>,
    );
    const trigger = screen.getByRole('button', {name: 'Teams'});
    await user.click(trigger);
    const menu = screen.getByRole('menu', {hidden: true});
    const outside = screen.getByRole('button', {name: 'Outside action'});

    outside.focus();
    expect(outside).toHaveFocus();
    const popover = menu.closest('[popover]');
    expect(popover).not.toBeNull();
    await act(async () => {
      (popover as HTMLElement).hidePopover();
    });

    await waitFor(() => {
      expect(outside).toHaveFocus();
    });
  });

  it('roves focus with ArrowDown across items', async () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem menu={items}>Teams</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const trigger = screen.getByRole('button', {name: 'Teams'});
    trigger.focus();
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    const menu = screen.getByRole('menu', {hidden: true});
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Design', hidden: true}),
      ).toHaveFocus();
    });
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitem', {name: 'Engineering', hidden: true}),
    ).toHaveFocus();
  });

  it('renders a submenu from a nested items array and keyboard-reaches an item after it', async () => {
    // Breadcrumb menus reuse the DropdownMenu item pipeline, so a nested
    // `items` array becomes a submenu. The inline flyout must not pollute the
    // breadcrumb menu's roving order — an item after the submenu row stays
    // keyboard-reachable.
    const onDelete = vi.fn();
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          menu={[
            {label: 'Rename', onClick: vi.fn()},
            {
              label: 'Move to',
              items: [
                {label: 'Folder A', onClick: vi.fn()},
                {label: 'Folder B', onClick: vi.fn()},
              ],
            },
            {type: 'divider'},
            {label: 'Delete', onClick: onDelete},
          ]}>
          Teams
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const trigger = screen.getByRole('button', {name: 'Teams'});
    trigger.focus();
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    // Two role="menu" exist (the breadcrumb menu + the inline submenu flyout);
    // the breadcrumb menu is the first in DOM order.
    const menu = screen.getAllByRole('menu', {hidden: true})[0];
    const submenuTrigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    expect(submenuTrigger).toHaveAttribute('aria-haspopup', 'menu');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Rename', hidden: true}),
      ).toHaveFocus();
    });
    // Rename → Move to → Delete, one step per press.
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(submenuTrigger).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveFocus();
  });

  it('allows menu together with isCurrent (both aria-current and aria-haspopup)', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent menu={items}>
          Teams
        </BreadcrumbItem>
      </Breadcrumbs>,
    );
    const trigger = screen.getByRole('button', {name: 'Teams'});
    expect(trigger).toHaveAttribute('aria-current', 'page');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('warns and lets menu win when href is also provided', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/teams" menu={items}>
          Teams
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    // menu wins: it's a button trigger, not a link.
    expect(screen.getByRole('button', {name: 'Teams'})).toHaveAttribute(
      'aria-haspopup',
      'menu',
    );
    expect(screen.queryByRole('link', {name: 'Teams'})).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('`menu` and `href` are mutually exclusive'),
    );
    warn.mockRestore();
  });

  it('reflects the variant on the item and menu-trigger theme targets', () => {
    const {container} = render(
      <Breadcrumbs variant="supporting">
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem menu={items}>Teams</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    // The variant selects between style objects on both elements, so a theme
    // needs it as a data attribute on both targets to reach them.
    for (const item of container.querySelectorAll('.astryx-breadcrumb-item')) {
      expect(item).toHaveAttribute('data-variant', 'supporting');
    }
    expect(
      container.querySelector('.astryx-breadcrumb-item-menu-trigger'),
    ).toHaveAttribute('data-variant', 'supporting');
  });

  it('defaults the item theme target to the default variant', () => {
    const {container} = render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(container.querySelector('.astryx-breadcrumb-item')).toHaveAttribute(
      'data-variant',
      'default',
    );
  });

  it('keeps mid-trail separators intact around a menu crumb', () => {
    const {container} = render(
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem menu={items}>Teams</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>,
    );
    // One separator per item (first hidden via CSS); the menu crumb does not
    // add or drop any.
    const separators = container.querySelectorAll(
      'ol > li > span[aria-hidden="true"]',
    );
    expect(separators).toHaveLength(3);
  });

  it('renders the separator and props types through the BreadcrumbMenuDivider aliases', async () => {
    const user = userEvent.setup();
    const dividerProps: BreadcrumbMenuDividerProps = {
      'data-testid': 'breadcrumb-menu-divider',
    };
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          menu={
            <>
              <BreadcrumbMenuItem label="Overview" />
              <BreadcrumbMenuDivider {...dividerProps} />
              <BreadcrumbMenuItem label="Settings" />
            </>
          }>
          Project
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Project'}));

    expect(screen.getByTestId('breadcrumb-menu-divider')).toHaveAttribute(
      'role',
      'separator',
    );
  });

  it('carries the group semantics through the BreadcrumbMenuGroup alias', async () => {
    // The alias must bring the semantics, not just the component: a group
    // that renders but is not named leaves a screen reader with a run of
    // loose rows where a sighted user sees a cluster.
    const user = userEvent.setup();
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          menu={
            <BreadcrumbMenuGroup title="Recent">
              <BreadcrumbMenuItem label="Overview" onClick={() => {}} />
              <BreadcrumbMenuItem label="Settings" onClick={() => {}} />
            </BreadcrumbMenuGroup>
          }>
          Project
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>Current</BreadcrumbItem>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', {name: 'Project'}));

    const group = screen.getByRole('group', {name: 'Recent', hidden: true});
    const heading = screen.getByText('Recent');
    expect(group).toHaveAttribute('aria-labelledby', heading.id);
    expect(group).toContainElement(
      screen.getByRole('menuitem', {name: 'Overview', hidden: true}),
    );
  });
});
