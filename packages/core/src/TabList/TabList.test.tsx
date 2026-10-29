// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabList.test.tsx
 * @input Uses vitest, @testing-library/react, TabList components
 * @output Unit tests for TabList, Tab, TabMenu behavior
 * @position Testing; validates TabList component implementation
 *
 * SYNC: When TabList components change, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeAll, afterAll} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import userEvent from '@testing-library/user-event';
import {
  hasPressedArm,
  hasReleaseFade,
  readsPressStrength,
} from '../__tests__/pressState';
import {TabList} from './TabList';
import type {TabListProps} from './TabList';
import {Tab} from './Tab';
import {TabMenu} from './TabMenu';
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

// Store original matches to restore later
const originalMatches = HTMLElement.prototype.matches;

// Track popover open state per element
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

// Mock Popover API for jsdom
beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });

  // Only intercept :popover-open, delegate everything else to original
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

describe('TabList', () => {
  it('renders a nav element with tab buttons', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Home'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Settings'})).toBeInTheDocument();
  });

  it('does not set aria-orientation on the nav (invalid for role navigation)', () => {
    // Regression: aria-orientation is not an allowed attribute on the
    // navigation role and produces an axe aria-allowed-attr violation.
    // TabList deliberately never sets this attribute.
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    expect(screen.getByRole('navigation')).not.toHaveAttribute(
      'aria-orientation',
    );
  });

  it('ignores a consumer-supplied aria-orientation on the nav', () => {
    // A caller passing aria-orientation should not reintroduce the invalid
    // attribute onto the nav.
    render(
      <TabList value="home" onChange={() => {}} aria-orientation="vertical">
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    expect(screen.getByRole('navigation')).not.toHaveAttribute(
      'aria-orientation',
    );
  });

  it('marks selected tab with a generic aria-current, not "page"', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    expect(screen.getByRole('button', {name: 'Home'})).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', {name: 'Settings'})).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('marks a selected link tab with the same generic aria-current', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" href="/home" />
        <Tab value="settings" label="Settings" href="/settings" />
      </TabList>,
    );

    expect(screen.getByRole('link', {name: 'Home'})).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('link', {name: 'Settings'})).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('calls onChange when a tab is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <TabList value="home" onChange={handleChange}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    await user.click(screen.getByRole('button', {name: 'Settings'}));
    expect(handleChange).toHaveBeenCalledWith('settings');
  });

  it('updates aria-current when value changes', () => {
    const {rerender} = render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    expect(screen.getByRole('button', {name: 'Home'})).toHaveAttribute(
      'aria-current',
      'true',
    );

    rerender(
      <TabList value="settings" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    expect(screen.getByRole('button', {name: 'Home'})).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('button', {name: 'Settings'})).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('renders with different sizes', () => {
    const {rerender} = render(
      <TabList value="home" onChange={() => {}} size="sm">
        <Tab value="home" label="Home" />
      </TabList>,
    );
    expect(screen.getByRole('button', {name: 'Home'})).toBeInTheDocument();

    rerender(
      <TabList value="home" onChange={() => {}} size="lg">
        <Tab value="home" label="Home" />
      </TabList>,
    );
    expect(screen.getByRole('button', {name: 'Home'})).toBeInTheDocument();
  });

  it('renders tab with icon', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab
          value="home"
          label="Home"
          icon={<span data-testid="icon">🏠</span>}
        />
      </TabList>,
    );

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders icon-only tab with aria-label from label prop', () => {
    render(
      <TabList value="preview" onChange={() => {}}>
        <Tab
          value="preview"
          label="Preview"
          isLabelHidden
          icon={<span data-testid="icon">▣</span>}
        />
      </TabList>,
    );

    const tab = screen.getByRole('button', {name: 'Preview'});
    expect(tab).toHaveAttribute('aria-label', 'Preview');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('omits empty label nodes so aria-labeled icon tabs align to the icon', () => {
    render(
      <TabList value="preview" onChange={() => {}}>
        <Tab
          value="preview"
          label=""
          aria-label="Preview"
          icon={<span data-testid="icon">▣</span>}
        />
      </TabList>,
    );

    const tab = screen.getByRole('button', {name: 'Preview'});
    expect(tab).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(tab.querySelectorAll(':scope > span').length).toBe(3);
  });

  it('renders selectedIcon when tab is selected', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab
          value="home"
          label="Home"
          icon={<span data-testid="icon">○</span>}
          selectedIcon={<span data-testid="selected-icon">●</span>}
        />
      </TabList>,
    );

    expect(screen.getByTestId('selected-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
  });

  it('renders regular icon when tab is not selected', () => {
    render(
      <TabList value="other" onChange={() => {}}>
        <Tab
          value="home"
          label="Home"
          icon={<span data-testid="icon">○</span>}
          selectedIcon={<span data-testid="selected-icon">●</span>}
        />
      </TabList>,
    );

    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.queryByTestId('selected-icon')).not.toBeInTheDocument();
  });

  it('renders endContent after the label', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab
          value="home"
          label="Home"
          endContent={<span data-testid="badge">5</span>}
        />
      </TabList>,
    );

    expect(screen.getByTestId('badge')).toBeInTheDocument();
    expect(screen.getByTestId('badge').textContent).toBe('5');
  });

  it('does not render endContent wrapper when endContent is not provided', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
      </TabList>,
    );

    // The endContentWrapper span should not exist
    const button = screen.getByRole('button', {name: 'Home'});
    // Button children: hoverBg, labelContainer, indicator (no endContent wrapper)
    const spans = button.querySelectorAll(':scope > span');
    // hoverBg + labelContainer + indicator = 3 spans
    expect(spans.length).toBe(3);
  });

  it('renders endContent in link tabs', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab
          value="home"
          label="Home"
          href="/home"
          endContent={<span data-testid="dot">●</span>}
        />
      </TabList>,
    );

    expect(screen.getByTestId('dot')).toBeInTheDocument();
  });
});

describe('TabList divider gap', () => {
  // The divider adds the reserved gap + indicator offset via a single class
  // (StyleX applies deterministic classes in the test env). Capture that
  // class set once so the assertions describe intent, not opaque hashes.
  function navClasses(hasDivider: boolean): Set<string> {
    const {unmount} = render(
      <TabList value="home" onChange={() => {}} hasDivider={hasDivider}>
        <Tab value="home" label="Home" />
      </TabList>,
    );
    const nav = screen.getByRole('navigation');
    const classes = new Set(nav.className.split(/\s+/).filter(Boolean));
    unmount();
    return classes;
  }

  it('adds divider-only styling classes when hasDivider is set', () => {
    const withDivider = navClasses(true);
    const withoutDivider = navClasses(false);

    // Every class the plain nav has must still be present when divided: the
    // divider only adds styling (border + reserved gap + indicator offset),
    // it never removes the base nav styles.
    for (const cls of withoutDivider) {
      expect(withDivider.has(cls)).toBe(true);
    }

    // And it must add at least one class the undivided nav does not have.
    const added = [...withDivider].filter(c => !withoutDivider.has(c));
    expect(added.length).toBeGreaterThan(0);
  });

  it('does not add divider styling to an undivided tab list (default)', () => {
    // Default (no hasDivider) and explicit hasDivider={false} are identical:
    // the non-divided path is untouched by the divider gap change.
    expect(navClasses(false)).toEqual(
      (() => {
        const {unmount} = render(
          <TabList value="home" onChange={() => {}}>
            <Tab value="home" label="Home" />
          </TabList>,
        );
        const nav = screen.getByRole('navigation');
        const classes = new Set(nav.className.split(/\s+/).filter(Boolean));
        unmount();
        return classes;
      })(),
    );
  });

  it('keeps the selected indicator rendered under a divider', () => {
    render(
      <TabList value="home" onChange={() => {}} hasDivider>
        <Tab value="home" label="Home" />
        <Tab value="away" label="Away" />
      </TabList>,
    );
    const selected = screen.getByRole('button', {name: 'Home'});
    // The indicator span carries the selected marker; the divider must not
    // drop it (it is repositioned onto the rail, not removed).
    expect(
      selected.querySelector('[data-selected="selected"]'),
    ).toBeInTheDocument();
  });
});

describe('TabList keyboard navigation (roving tabindex)', () => {
  it('exposes the tab strip as a single Tab stop (only selected tab is tabbable)', () => {
    render(
      <TabList value="settings" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
        <Tab value="profile" label="Profile" />
      </TabList>,
    );

    expect(screen.getByRole('button', {name: 'Home'})).toHaveAttribute(
      'tabindex',
      '-1',
    );
    expect(screen.getByRole('button', {name: 'Settings'})).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('button', {name: 'Profile'})).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('makes the first tab tabbable when the selected value matches no tab', () => {
    render(
      <TabList value="__none__" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    expect(screen.getByRole('button', {name: 'Home'})).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('button', {name: 'Settings'})).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('moves focus with ArrowRight and ArrowLeft', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
        <Tab value="profile" label="Profile" />
      </TabList>,
    );

    const home = screen.getByRole('button', {name: 'Home'});
    const settings = screen.getByRole('button', {name: 'Settings'});
    const profile = screen.getByRole('button', {name: 'Profile'});

    home.focus();
    expect(home).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(settings).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(profile).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(settings).toHaveFocus();
  });

  it('supports ArrowDown and ArrowUp as forward/backward as well', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    const home = screen.getByRole('button', {name: 'Home'});
    const settings = screen.getByRole('button', {name: 'Settings'});

    home.focus();
    await user.keyboard('{ArrowDown}');
    expect(settings).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(home).toHaveFocus();
  });

  it('jumps to first and last tab with Home and End', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="settings" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
        <Tab value="profile" label="Profile" />
      </TabList>,
    );

    const home = screen.getByRole('button', {name: 'Home'});
    const settings = screen.getByRole('button', {name: 'Settings'});
    const profile = screen.getByRole('button', {name: 'Profile'});

    settings.focus();

    await user.keyboard('{End}');
    expect(profile).toHaveFocus();

    await user.keyboard('{Home}');
    expect(home).toHaveFocus();
  });

  it('wraps around at the ends', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
        <Tab value="profile" label="Profile" />
      </TabList>,
    );

    const home = screen.getByRole('button', {name: 'Home'});
    const profile = screen.getByRole('button', {name: 'Profile'});

    home.focus();
    await user.keyboard('{ArrowLeft}');
    expect(profile).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(home).toHaveFocus();
  });

  it('skips disabled tabs during arrow navigation', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" aria-disabled="true" />
        <Tab value="profile" label="Profile" />
      </TabList>,
    );

    const home = screen.getByRole('button', {name: 'Home'});
    const profile = screen.getByRole('button', {name: 'Profile'});

    home.focus();
    await user.keyboard('{ArrowRight}');
    expect(profile).toHaveFocus();
  });

  it('does not intercept unrelated keys', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    const home = screen.getByRole('button', {name: 'Home'});
    home.focus();
    await user.keyboard('a');
    expect(home).toHaveFocus();
  });

  it('composes consumer onKeyDown with internal arrow navigation', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();

    render(
      <TabList value="home" onChange={() => {}} onKeyDown={onKeyDown}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    const home = screen.getByRole('button', {name: 'Home'});
    const settings = screen.getByRole('button', {name: 'Settings'});

    home.focus();
    await user.keyboard('{ArrowRight}');

    expect(onKeyDown).toHaveBeenCalled();
    expect(settings).toHaveFocus();
  });

  it('respects preventDefault from consumer onKeyDown', async () => {
    const user = userEvent.setup();

    render(
      <TabList
        value="home"
        onChange={() => {}}
        onKeyDown={e => e.preventDefault()}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );

    const home = screen.getByRole('button', {name: 'Home'});
    home.focus();
    await user.keyboard('{ArrowRight}');

    expect(home).toHaveFocus();
  });
});

describe('Tab polymorphic link', () => {
  it('renders custom component when href and as are provided', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" href="/home" as={CustomLink} />
      </TabList>,
    );
    const link = screen.getByRole('link', {name: 'Home'});
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).toHaveAttribute('href', '/home');
  });

  it('still renders button without href even with as prop', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" as={CustomLink} />
      </TabList>,
    );
    const button = screen.getByRole('button', {name: 'Home'});
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveAttribute('data-custom-link');
  });

  it('renders custom component from LinkProvider when href is provided', () => {
    render(
      <LinkProvider component={CustomLink}>
        <TabList value="home" onChange={() => {}}>
          <Tab value="home" label="Home" href="/home" />
        </TabList>
      </LinkProvider>,
    );
    const link = screen.getByRole('link', {name: 'Home'});
    expect(link).toHaveAttribute('data-custom-link');
  });
});

describe('TabMenu', () => {
  const menuOptions = [
    {value: 'analytics', label: 'Analytics'},
    {value: 'reports', label: 'Reports'},
  ];

  it('renders a trigger button with aria-haspopup and aria-controls', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    const trigger = screen.getByRole('button', {name: /More/});
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // aria-controls points to the menu element
    const menuId = trigger.getAttribute('aria-controls');
    expect(menuId).toBeTruthy();
    const menu = document.getElementById(menuId!);
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveAttribute('role', 'menu');
  });

  it('shows label prop as trigger text when no option is selected', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    expect(screen.getByRole('button', {name: /More/})).toBeInTheDocument();
  });

  it('shows selected option label as trigger text when an option is active', () => {
    render(
      <TabList value="analytics" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    const trigger = screen.getByRole('button', {name: /Analytics/});
    expect(trigger).toBeInTheDocument();
  });

  it('opens dropdown on click and shows menu items', async () => {
    const user = userEvent.setup();

    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    await user.click(screen.getByRole('button', {name: /More/}));

    // showPopover should have been called
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();

    // Menu items are rendered in DOM (popover controls visibility, hidden from a11y tree)
    expect(
      screen.getByRole('menuitemradio', {name: 'Analytics', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', {name: 'Reports', hidden: true}),
    ).toBeInTheDocument();
  });

  it('renders heading with menu label in dropdown', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    // The dropdown has role="menu" with aria-label
    const menu = screen.getByRole('menu', {name: 'More', hidden: true});
    expect(menu).toBeInTheDocument();

    // The heading is a presentation span with the menu label
    const heading = screen.getByRole('presentation', {hidden: true});
    expect(heading).toHaveTextContent('More');
  });

  it('picks the option a press slid across the menu lifts on, once (family:action-groups FR1, FR2, FR5)', async () => {
    __resetMenuPressForTest();
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <TabList value="home" onChange={handleChange}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );
    await user.click(screen.getByRole('button', {name: /More/}));
    const option = (name: string) =>
      screen.getByRole('menuitemradio', {name, hidden: true});
    for (const pointer of [
      {pointerType: 'touch', pointerId: 1},
      {pointerType: 'mouse', pointerId: 2, button: 0},
    ]) {
      handleChange.mockClear();
      fireEvent.pointerDown(option('Analytics'), pointer);
      fireEvent.pointerMove(option('Reports'), pointer);
      fireEvent.pointerUp(option('Reports'), pointer);
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith('reports');
    }
  });

  it('selects a menu item and calls onChange', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <TabList value="home" onChange={handleChange}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    // Click the menu trigger
    await user.click(screen.getByRole('button', {name: /More/}));

    // Click the menu item (popover content, hidden from a11y tree in jsdom)
    const menuItem = screen.getByRole('menuitemradio', {
      name: 'Analytics',
      hidden: true,
    });
    await user.click(menuItem);
    expect(handleChange).toHaveBeenCalledWith('analytics');
  });

  it('exposes options as menuitemradio and marks the selected tab aria-checked', () => {
    render(
      <TabList value="analytics" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    // Menu items are in DOM (popover content, hidden from a11y tree in jsdom).
    // Single-select menu options carry radio semantics (APG menu-button):
    // role="menuitemradio" + aria-checked, not menuitem + aria-current.
    const analyticsItem = screen.getByRole('menuitemradio', {
      name: 'Analytics',
      hidden: true,
    });
    expect(analyticsItem).toHaveAttribute('aria-checked', 'true');
    expect(analyticsItem).not.toHaveAttribute('aria-current');

    const reportsItem = screen.getByRole('menuitemradio', {
      name: 'Reports',
      hidden: true,
    });
    expect(reportsItem).toHaveAttribute('aria-checked', 'false');
  });
});

describe('TabMenu host attributes', () => {
  const menuOptions = [
    {value: 'analytics', label: 'Analytics'},
    {value: 'reports', label: 'Reports'},
  ];

  it('forwards host attributes to the trigger, not the popup', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu
          label="More"
          options={menuOptions}
          id="more-tabs"
          aria-label="More views"
          data-view="overflow"
        />
      </TabList>,
    );

    const trigger = screen.getByRole('button', {name: 'More views'});
    expect(trigger).toHaveAttribute('id', 'more-tabs');
    expect(trigger).toHaveAttribute('data-view', 'overflow');
    const menu = screen.getByRole('menu', {name: 'More', hidden: true});
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
  });

  it('runs drag-and-drop handlers on the trigger', () => {
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu
          label="More"
          options={menuOptions}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
      </TabList>,
    );
    const trigger = screen.getByRole('button', {name: 'More'});
    fireEvent.dragOver(trigger);
    fireEvent.drop(trigger);
    expect(onDragOver).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('onClick preserves the toggle', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    });
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} onClick={onClick} />
      </TabList>,
    );
    const trigger = screen.getByRole('button', {name: 'More'});
    await user.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('TabMenu keyboard navigation (roving tabindex)', () => {
  const menuOptions = [
    {value: 'analytics', label: 'Analytics'},
    {value: 'reports', label: 'Reports'},
  ];

  it('exposes the overflow menu as a single Tab stop (one item tabbable, rest -1)', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    await user.click(screen.getByRole('button', {name: /More/}));

    const analytics = screen.getByRole('menuitemradio', {
      name: 'Analytics',
      hidden: true,
    });
    const reports = screen.getByRole('menuitemradio', {
      name: 'Reports',
      hidden: true,
    });

    // Exactly one menu item is in the Tab sequence; arrow keys reach the rest.
    expect(analytics).toHaveAttribute('tabindex', '0');
    expect(reports).toHaveAttribute('tabindex', '-1');

    const tabbable = [analytics, reports].filter(
      el => el.getAttribute('tabindex') === '0',
    );
    expect(tabbable).toHaveLength(1);
  });

  it('moves focus between items with ArrowDown and ArrowUp', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    await user.click(screen.getByRole('button', {name: /More/}));
    const menu = screen.getByRole('menu', {hidden: true});
    const analytics = screen.getByRole('menuitemradio', {
      name: 'Analytics',
      hidden: true,
    });
    const reports = screen.getByRole('menuitemradio', {
      name: 'Reports',
      hidden: true,
    });

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(analytics).toHaveFocus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(reports).toHaveFocus();

    fireEvent.keyDown(menu, {key: 'ArrowUp'});
    expect(analytics).toHaveFocus();
  });

  it('moves the roving tab stop with arrow navigation', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    await user.click(screen.getByRole('button', {name: /More/}));
    const menu = screen.getByRole('menu', {hidden: true});
    const analytics = screen.getByRole('menuitemradio', {
      name: 'Analytics',
      hidden: true,
    });
    const reports = screen.getByRole('menuitemradio', {
      name: 'Reports',
      hidden: true,
    });

    fireEvent.keyDown(menu, {key: 'ArrowDown'}); // focus analytics
    fireEvent.keyDown(menu, {key: 'ArrowDown'}); // focus reports

    // The tab stop follows focus, so it is still a single stop after moving.
    expect(reports).toHaveAttribute('tabindex', '0');
    expect(analytics).toHaveAttribute('tabindex', '-1');
  });

  it('jumps to first and last item with Home and End', async () => {
    const user = userEvent.setup();
    const options = [
      {value: 'analytics', label: 'Analytics'},
      {value: 'reports', label: 'Reports'},
      {value: 'exports', label: 'Exports'},
    ];
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={options} />
      </TabList>,
    );

    await user.click(screen.getByRole('button', {name: /More/}));
    const menu = screen.getByRole('menu', {hidden: true});
    const analytics = screen.getByRole('menuitemradio', {
      name: 'Analytics',
      hidden: true,
    });
    const exports = screen.getByRole('menuitemradio', {
      name: 'Exports',
      hidden: true,
    });

    fireEvent.keyDown(menu, {key: 'End'});
    expect(exports).toHaveFocus();

    fireEvent.keyDown(menu, {key: 'Home'});
    expect(analytics).toHaveFocus();
  });

  it('selects an item with Enter and calls onChange', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <TabList value="home" onChange={handleChange}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    await user.click(screen.getByRole('button', {name: /More/}));
    const analytics = screen.getByRole('menuitemradio', {
      name: 'Analytics',
      hidden: true,
    });
    analytics.focus();
    fireEvent.keyDown(analytics, {key: 'Enter'});

    expect(handleChange).toHaveBeenCalledWith('analytics');
  });

  it('closes the menu when Tab is pressed inside it (APG menu-button)', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    await user.click(screen.getByRole('button', {name: /More/}));
    const menu = screen.getByRole('menu', {hidden: true});

    const hidePopover = vi.mocked(HTMLElement.prototype.hidePopover);
    hidePopover.mockClear();
    fireEvent.keyDown(menu, {key: 'Tab'});
    expect(hidePopover).toHaveBeenCalled();
  });

  it('closes the menu when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <TabMenu label="More" options={menuOptions} />
      </TabList>,
    );

    await user.click(screen.getByRole('button', {name: /More/}));
    const menu = screen.getByRole('menu', {hidden: true});

    const hidePopover = vi.mocked(HTMLElement.prototype.hidePopover);
    hidePopover.mockClear();
    fireEvent.keyDown(menu, {key: 'Escape'});
    expect(hidePopover).toHaveBeenCalled();
  });
});

describe('TabList overflow (scroll)', () => {
  const STRIP = '.astryx-tab-strip';
  const ARROW = '.astryx-tab-scroll-button';

  /** jsdom has no layout, so the scroll box is described by hand. */
  function fakeScrollBox(
    strip: HTMLElement,
    {
      scrollWidth,
      clientWidth,
      scrollLeft = 0,
    }: {scrollWidth: number; clientWidth: number; scrollLeft?: number},
  ) {
    Object.defineProperty(strip, 'scrollWidth', {
      value: scrollWidth,
      configurable: true,
    });
    Object.defineProperty(strip, 'clientWidth', {
      value: clientWidth,
      configurable: true,
    });
    Object.defineProperty(strip, 'scrollLeft', {
      value: scrollLeft,
      writable: true,
      configurable: true,
    });
  }

  /**
   * Places the strip at 0..width and a tab at the given offsets, so the
   * keep-selected-visible arithmetic has real numbers to work with.
   */
  function fakeGeometry(
    strip: HTMLElement,
    tabValue: string,
    {
      stripWidth,
      tabLeft,
      tabRight,
    }: {stripWidth: number; tabLeft: number; tabRight: number},
  ) {
    strip.getBoundingClientRect = () =>
      ({left: 0, right: stripWidth, width: stripWidth}) as DOMRect;
    const tab = strip.querySelector<HTMLElement>(
      `[data-tab-value="${tabValue}"]`,
    );
    if (tab) {
      tab.getBoundingClientRect = () =>
        ({
          left: tabLeft,
          right: tabRight,
          width: tabRight - tabLeft,
        }) as DOMRect;
    }
  }

  function renderStrip(props: Partial<TabListProps> = {}) {
    const utils = render(
      <TabList value="a" onChange={() => {}} {...props}>
        <Tab value="a" label="Alpha" />
        <Tab value="b" label="Beta" />
        <Tab value="c" label="Gamma" />
      </TabList>,
    );
    const strip = utils.container.querySelector<HTMLElement>(STRIP);
    if (!strip) {
      throw new Error('no tab strip');
    }
    return {...utils, strip};
  }

  it('renders the tabs inside a scroll strip by default', () => {
    const {strip} = renderStrip();
    expect(strip.querySelectorAll('[data-tab-value]')).toHaveLength(3);
  });

  it('offers an end arrow while there are tabs past the end, and pressing it scrolls', () => {
    const {container, strip} = renderStrip();
    fakeScrollBox(strip, {scrollWidth: 600, clientWidth: 300});
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    fireEvent.scroll(strip);

    const arrows = container.querySelectorAll(ARROW);
    expect(arrows).toHaveLength(1);

    fireEvent.click(arrows[0]);
    expect(scrollBy).toHaveBeenCalledWith({left: 240});
  });

  it('offers both arrows once the strip is scrolled away from the start', () => {
    const {container, strip} = renderStrip();
    fakeScrollBox(strip, {scrollWidth: 600, clientWidth: 300, scrollLeft: 150});
    strip.scrollBy = vi.fn();
    fireEvent.scroll(strip);

    expect(container.querySelectorAll(ARROW)).toHaveLength(2);
  });

  it('keeps the arrows out of the tab order and out of the accessibility tree', () => {
    const {container, strip} = renderStrip();
    fakeScrollBox(strip, {scrollWidth: 600, clientWidth: 300});
    strip.scrollBy = vi.fn();
    fireEvent.scroll(strip);

    const arrow = container.querySelector<HTMLElement>(ARROW);
    expect(arrow?.getAttribute('aria-hidden')).toBe('true');
    expect(arrow?.tabIndex).toBe(-1);
  });

  it('scrolls a selected tab that starts out of view back into view on mount', () => {
    const scrollBy = vi.fn();
    // The strip mounts before the effect runs, so the geometry has to be in
    // place on the prototype rather than on an element we can reach first.
    const originalScrollBy = Element.prototype.scrollBy;
    const originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.scrollBy = scrollBy;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return (
        this.classList.contains('astryx-tab-strip')
          ? {left: 0, right: 300, width: 300}
          : {left: 420, right: 500, width: 80}
      ) as DOMRect;
    };

    render(
      <TabList value="c" onChange={() => {}}>
        <Tab value="a" label="Alpha" />
        <Tab value="b" label="Beta" />
        <Tab value="c" label="Gamma" />
      </TabList>,
    );

    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({behavior: 'instant'}),
    );
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);
    Element.prototype.scrollBy = originalScrollBy;
    Element.prototype.getBoundingClientRect = originalRect;
  });

  it('keeps the selected tab in view when the host changes value without focus', () => {
    const {strip, rerender} = renderStrip({value: 'a'});
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    fakeGeometry(strip, 'c', {stripWidth: 300, tabLeft: 420, tabRight: 500});

    rerender(
      <TabList value="c" onChange={() => {}}>
        <Tab value="a" label="Alpha" />
        <Tab value="b" label="Beta" />
        <Tab value="c" label="Gamma" />
      </TabList>,
    );

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);
  });

  it('leaves a tab that is already in view alone', () => {
    const {strip, rerender} = renderStrip({value: 'a'});
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    fakeGeometry(strip, 'b', {stripWidth: 300, tabLeft: 80, tabRight: 140});

    rerender(
      <TabList value="b" onChange={() => {}}>
        <Tab value="a" label="Alpha" />
        <Tab value="b" label="Beta" />
        <Tab value="c" label="Gamma" />
      </TabList>,
    );

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('reveals on a selection change, not on an unrelated overflow change', () => {
    const {strip, rerender} = renderStrip({value: 'c', overflow: 'visible'});
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    fakeGeometry(strip, 'c', {stripWidth: 300, tabLeft: 420, tabRight: 500});

    // Turning scrolling on re-measures the strip, and that one reveal is the
    // resize path's. The selection has not moved, so nothing may add a second.
    rerender(
      <TabList value="c" onChange={() => {}} overflow="scroll">
        <Tab value="a" label="Alpha" />
        <Tab value="b" label="Beta" />
        <Tab value="c" label="Gamma" />
      </TabList>,
    );

    expect(scrollBy).toHaveBeenCalledTimes(1);

    fakeGeometry(strip, 'a', {stripWidth: 300, tabLeft: -200, tabRight: -120});
    rerender(
      <TabList value="a" onChange={() => {}} overflow="scroll">
        <Tab value="a" label="Alpha" />
        <Tab value="b" label="Beta" />
        <Tab value="c" label="Gamma" />
      </TabList>,
    );

    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0);
  });

  it('finishes the job on focus: a tab only half in view is scrolled clear', () => {
    const {strip} = renderStrip({value: 'a'});
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    // The browser scrolls a focused tab into view only when it is entirely
    // outside the box, so this one — straddling the end edge — stays cut off.
    fakeGeometry(strip, 'c', {stripWidth: 300, tabLeft: 260, tabRight: 340});

    const tab = strip.querySelector<HTMLElement>('[data-tab-value="c"]');
    fireEvent.focus(tab!, {bubbles: true});

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0][0].left).toBeCloseTo(40);
  });

  it('reveals a half-visible overflow menu trigger too, not just tabs', () => {
    const {container} = render(
      <TabList value="a" onChange={() => {}}>
        <Tab value="a" label="Alpha" />
        <Tab value="b" label="Beta" />
        <TabMenu label="More" options={[{value: 'c', label: 'Gamma'}]} />
      </TabList>,
    );
    const strip = container.querySelector<HTMLElement>(STRIP);
    if (!strip) {
      throw new Error('no tab strip');
    }
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    strip.getBoundingClientRect = () =>
      ({left: 0, right: 300, width: 300}) as DOMRect;
    const trigger = strip.querySelector<HTMLElement>('[data-tab-menu]');
    if (!trigger) {
      throw new Error('no menu trigger');
    }
    trigger.getBoundingClientRect = () =>
      ({left: 260, right: 340, width: 80}) as DOMRect;

    fireEvent.focus(trigger, {bubbles: true});

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0][0].left).toBeCloseTo(40);
  });

  it('fades out at the strip’s own edge, not at the bleed edge', () => {
    // The scroll box is a ring-bleed wider than the TabList on each side while
    // it holds focus, so a fade that ran to the box edge would paint tabs
    // outside the component and past the arrow that caps that edge.
    const bleed = 'var(--_tab-strip-bleed)';
    const {strip} = renderStrip();
    strip.scrollBy = vi.fn();

    fakeScrollBox(strip, {scrollWidth: 600, clientWidth: 300});
    fireEvent.scroll(strip);
    expect(getComputedStyle(strip).maskImage).toContain(`transparent ${bleed}`);

    fakeScrollBox(strip, {scrollWidth: 600, clientWidth: 300, scrollLeft: 150});
    fireEvent.scroll(strip);
    expect(getComputedStyle(strip).maskImage).toContain(
      `transparent calc(100% - ${bleed})`,
    );
  });

  it('is no wider than the TabList until the strip holds focus', () => {
    // The bleed is real geometry: while the strip carries it, its border box
    // sticks out of the TabList's and every ancestor that scrolls counts it.
    // jsdom has no layout, so the box is read off the declarations: padding
    // and its cancelling margin are both the bleed, and the bleed is zero
    // until a ring needs keeping whole. `:has(:focus-visible)` flips it --
    // covered in a browser, since jsdom does not recompute style on a focus
    // change.
    const {strip} = renderStrip();
    const cs = getComputedStyle(strip);

    expect(cs.getPropertyValue('--_tab-strip-bleed')).toBe('0px');
    expect(cs.paddingInline).toBe('var(--_tab-strip-bleed)');
    expect(cs.marginInline).toBe('calc(-1 * (var(--_tab-strip-bleed)))');
  });

  it('does not hand focus to an arrow, which is hidden from assistive tech', () => {
    const {container, strip} = renderStrip();
    fakeScrollBox(strip, {scrollWidth: 600, clientWidth: 300});
    strip.scrollBy = vi.fn();
    fireEvent.scroll(strip);

    const arrow = container.querySelector<HTMLElement>(ARROW);
    const prevented = !fireEvent.mouseDown(arrow!);
    expect(prevented).toBe(true);
  });

  it('overflow="visible" scrolls nothing and offers no arrows', () => {
    const {container, strip, rerender} = renderStrip({
      value: 'a',
      overflow: 'visible',
    });
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    fakeScrollBox(strip, {scrollWidth: 600, clientWidth: 300});
    fakeGeometry(strip, 'c', {stripWidth: 300, tabLeft: 420, tabRight: 500});
    fireEvent.scroll(strip);

    rerender(
      <TabList value="c" onChange={() => {}} overflow="visible">
        <Tab value="a" label="Alpha" />
        <Tab value="b" label="Beta" />
        <Tab value="c" label="Gamma" />
      </TabList>,
    );

    expect(container.querySelectorAll(ARROW)).toHaveLength(0);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('shows the reading start of a stop too wide to fit', () => {
    const {strip} = renderStrip({value: 'a'});
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    // Wider than the strip, so one end stays hidden either way. Aligning the
    // end would land a long label on its last words.
    fakeGeometry(strip, 'c', {stripWidth: 300, tabLeft: 420, tabRight: 800});

    const tab = strip.querySelector<HTMLElement>('[data-tab-value="c"]');
    fireEvent.focus(tab!, {bubbles: true});

    expect(scrollBy.mock.calls[0][0].left).toBeCloseTo(420);
  });

  it('shows the reading start of an over-wide stop in RTL too', () => {
    const {strip} = renderStrip({value: 'a'});
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    strip.style.direction = 'rtl';
    fakeGeometry(strip, 'c', {stripWidth: 300, tabLeft: -500, tabRight: -120});

    const tab = strip.querySelector<HTMLElement>('[data-tab-value="c"]');
    fireEvent.focus(tab!, {bubbles: true});

    // RTL reads from the right edge, so that is the end to bring flush.
    expect(scrollBy.mock.calls[0][0].left).toBeCloseTo(-420);
  });
});

describe('TabList ARIA pattern — role="tablist"', () => {
  function warnSpy() {
    return vi.spyOn(console, 'warn').mockImplementation(() => {});
  }

  it('does not mix navigation semantics into explicit Tabs', () => {
    render(
      <TabList value="b" onChange={() => {}} role="tablist" aria-label="Views">
        <Tab value="a" label="Alpha" panelId="panel-a" />
        <Tab value="b" label="Beta" panelId="panel-b" />
      </TabList>,
    );

    expect(screen.queryByRole('navigation')).toBeNull();
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).not.toHaveAttribute('aria-current');
    }
  });

  it('lets the consumer name the tablist from another element', () => {
    render(
      <>
        <h2 id="views-heading">Project views</h2>
        <TabList
          value="a"
          onChange={() => {}}
          role="tablist"
          aria-labelledby="views-heading">
          <Tab value="a" label="Alpha" panelId="panel-a" />
        </TabList>
      </>,
    );

    expect(screen.getByRole('tablist', {name: 'Project views'})).not.toBeNull();
  });

  it('renders no navigation landmark around the tabs', () => {
    const {container} = render(
      <TabList value="a" onChange={() => {}} role="tablist">
        <Tab value="a" label="Alpha" panelId="panel-a" />
      </TabList>,
    );

    expect(container.querySelector('nav')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('omits aria-controls when a tab has no panel, and says so', () => {
    const warn = warnSpy();
    render(
      <TabList value="a" onChange={() => {}} role="tablist">
        <Tab value="a" label="Alpha" />
      </TabList>,
    );

    expect(screen.getByRole('tab')).not.toHaveAttribute('aria-controls');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Tab: a tab in a role="tablist" TabList controls nothing',
      ),
    );
    warn.mockRestore();
  });

  it('leaves a hand-wired aria-controls alone, and does not ask for a panelId it already has', () => {
    const warn = warnSpy();
    render(
      <TabList value="a" onChange={() => {}} role="tablist">
        <Tab value="a" label="Alpha" aria-controls="panel-written-by-hand" />
      </TabList>,
    );

    expect(screen.getByRole('tab')).toHaveAttribute(
      'aria-controls',
      'panel-written-by-hand',
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ignores href: the tab is a button, and the caller is told', () => {
    const warn = warnSpy();
    render(
      <TabList value="a" onChange={() => {}} role="tablist">
        <Tab value="a" label="Alpha" panelId="panel-a" href="/alpha" />
      </TabList>,
    );

    const tab = screen.getByRole('tab');
    expect(tab.tagName).toBe('BUTTON');
    expect(tab).not.toHaveAttribute('href');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Tab: href is ignored in a role="tablist"'),
    );
    warn.mockRestore();
  });

  it('warns about anything in the strip that is not a tab, however it got there', () => {
    const warn = warnSpy();
    const showMenu = true;
    render(
      <TabList value="a" onChange={() => {}} role="tablist">
        <Tab value="a" label="Alpha" panelId="panel-a" />
        {showMenu ? (
          <div>
            <TabMenu label="More" options={[{value: 'b', label: 'Beta'}]} />
          </div>
        ) : null}
      </TabList>,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('TabList: role="tablist" owns only tabs'),
    );
    warn.mockRestore();
  });

  it('says nothing when the strip holds only tabs with panels', () => {
    const warn = warnSpy();
    render(
      <TabList value="a" onChange={() => {}} role="tablist">
        <Tab value="a" label="Alpha" panelId="panel-a" />
        <Tab value="b" label="Beta" panelId="panel-b" />
      </TabList>,
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('leaves ArrowDown and ArrowUp to the page', async () => {
    // A tablist reports itself as horizontal, so the vertical arrows are the
    // page's to scroll with.
    const user = userEvent.setup();
    render(
      <TabList value="a" onChange={() => {}} role="tablist">
        <Tab value="a" label="Alpha" panelId="panel-a" />
        <Tab value="b" label="Beta" panelId="panel-b" />
      </TabList>,
    );

    const alpha = screen.getByRole('tab', {name: 'Alpha'});
    alpha.focus();
    await user.keyboard('{ArrowDown}');
    expect(alpha).toHaveFocus();
  });
});

describe('TabList ARIA pattern — no role', () => {
  it('is the navigation landmark it has always been', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <TabList value="a" onChange={() => {}} aria-label="Views">
        <Tab value="a" label="Alpha" />
        <Tab value="b" label="Beta" />
      </TabList>,
    );

    expect(screen.getByRole('navigation', {name: 'Views'})).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('button', {name: 'Alpha'})).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops a panelId and says so: there is no panel relationship to state', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <TabList value="a" onChange={() => {}}>
        <Tab value="a" label="Alpha" panelId="panel-a" />
      </TabList>,
    );

    expect(screen.getByRole('button', {name: 'Alpha'})).not.toHaveAttribute(
      'aria-controls',
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Tab: panelId does nothing outside a role="tablist" TabList',
      ),
    );
    warn.mockRestore();
  });
});

describe('TabList ARIA pattern — any other role', () => {
  it('passes the role through and leaves the tabs on the navigation pattern', () => {
    const {container} = render(
      <TabList value="a" onChange={() => {}} role="toolbar">
        <Tab value="a" label="Alpha" />
      </TabList>,
    );

    expect(container.querySelector('nav')).toHaveAttribute('role', 'toolbar');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('button', {name: 'Alpha'})).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});

describe('pressed state', () => {
  it('paints the pressed overlay on the tab surface while the tab is pressed', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );
    const tab = screen.getByRole('button', {name: 'Settings'});
    // The hover surface is a child layer read off the tab; the press paints
    // the same layer, so the assertion is on that layer.
    const surface = tab.querySelector('span[aria-hidden="true"]');
    if (surface == null) {
      throw new Error('the tab has no hover surface to press');
    }
    expect(hasPressedArm(surface)).toBe(true);
  });

  it('does not activate a disabled button tab or call its handler', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClick = vi.fn();
    render(
      <TabList value="home" onChange={onChange}>
        <Tab value="home" label="Home" />
        <Tab
          value="settings"
          label="Settings"
          aria-disabled="true"
          onClick={onClick}
        />
      </TabList>,
    );
    const tab = screen.getByRole('button', {name: 'Settings'});
    await user.click(tab);
    expect(onClick).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes navigation from a disabled link tab', () => {
    const onChange = vi.fn();
    const {container} = render(
      <LinkProvider component={CustomLink}>
        <TabList value="home" onChange={onChange}>
          <Tab value="home" label="Home" />
          <Tab
            value="settings"
            label="Settings"
            href="/settings"
            aria-disabled="true"
          />
        </TabList>
      </LinkProvider>,
    );
    const tab = container.querySelector('a');
    if (tab == null) {
      throw new Error('the disabled link tab did not render an anchor');
    }
    expect(tab).not.toHaveAttribute('data-custom-link');
    expect(tab).not.toHaveAttribute('href');
    fireEvent.click(tab);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fades the touch press out from the tab, with the surface reading its strength', () => {
    render(
      <TabList value="home" onChange={() => {}}>
        <Tab value="home" label="Home" />
        <Tab value="settings" label="Settings" />
      </TabList>,
    );
    const tab = screen.getByRole('button', {name: 'Settings'});
    const surface = tab.querySelector('span[aria-hidden="true"]');
    if (surface == null) {
      throw new Error('the tab has no hover surface to press');
    }
    // The controller writes the tab; the tab owns the strength and its
    // release, and the surface paints the pressed token at that strength on
    // both touch arms.
    expect(hasReleaseFade(tab)).toBe(true);
    expect(readsPressStrength(surface, '[data-astryx-press="on"]')).toBe(true);
    expect(readsPressStrength(surface)).toBe(true);
  });
});
