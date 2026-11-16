// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavToggle.test.tsx
 * @input Uses vitest, @testing-library/react, AppShell + SideNav
 * @output Unit tests for MobileNavToggle presence, button, name, icon, and
 *   ARIA wiring
 * @position Testing; validates MobileNavToggle.tsx renders only in an enabled
 *   AppShell mobile layout and exposes aria-expanded and aria-controls so
 *   screen-reader users know the drawer state and target.
 *
 * SYNC: When MobileNavToggle.tsx changes, update tests to match new behavior
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import type {ComponentProps} from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import {AppShell} from '../AppShell/AppShell';
import {Icon} from '../Icon/Icon';
import {SideNav, SideNavItem, SideNavSection} from '../SideNav';
import {MobileNav} from './MobileNav';
import {MobileNavToggle, type MobileNavToggleProps} from './MobileNavToggle';

// jsdom doesn't implement showModal/close on <dialog>, so we mock them
beforeAll(() => {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
});

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

function createMockMatchMedia(matches: boolean) {
  return {
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

beforeEach(() => {
  // Below the breakpoint so the mobile nav (and its toggle) render.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue(createMockMatchMedia(true)),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function TestShell() {
  return (
    <AppShell
      sideNav={
        <SideNav>
          <SideNavSection title="Test" isHeaderHidden>
            <SideNavItem label="Home" />
          </SideNavSection>
        </SideNav>
      }
      mobileNav={{breakpoint: 'md'}}>
      <div>Content</div>
    </AppShell>
  );
}

describe('MobileNavToggle ARIA wiring', () => {
  it('exposes aria-expanded="false" when the drawer is closed', () => {
    render(<TestShell />);

    const toggle = screen.getByRole('button', {name: /open navigation/i});
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('exposes aria-expanded="true" after opening the drawer', () => {
    render(<TestShell />);

    const toggle = screen.getByRole('button', {name: /open navigation/i});
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('references the nav drawer via aria-controls that resolves to the dialog', () => {
    render(<TestShell />);

    const toggle = screen.getByRole('button', {name: /open navigation/i});
    const controls = toggle.getAttribute('aria-controls');
    expect(controls).toBeTruthy();

    const target = document.getElementById(controls!);
    expect(target).not.toBeNull();
    expect(target).toBe(screen.getAllByRole('dialog', {hidden: true})[0]);
    expect(target?.tagName).toBe('DIALOG');
  });
});

describe('MobileNavToggle host attributes', () => {
  // architecture:public-component-api INV5 and INV7: host attributes and
  // handlers reach the button; FR11's toggle and ARIA wiring stay owned.
  function ShellWithToggle(props: MobileNavToggleProps) {
    return (
      <AppShell
        sideNav={
          <SideNav>
            <SideNavSection title="Test" isHeaderHidden>
              <SideNavItem label="Home" />
            </SideNavSection>
          </SideNav>
        }
        mobileNav={{breakpoint: 'md'}}>
        <MobileNavToggle {...props} />
      </AppShell>
    );
  }

  it('forwards data, ARIA and id attributes to the button', () => {
    render(
      <ShellWithToggle
        data-testid="page-menu"
        data-analytics-id="open-nav"
        id="page-menu-toggle"
        aria-describedby="nav-hint"
      />,
    );
    const toggle = screen.getByTestId('page-menu');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('data-analytics-id', 'open-nav');
    expect(toggle).toHaveAttribute('id', 'page-menu-toggle');
    expect(toggle).toHaveAttribute('aria-describedby', 'nav-hint');
  });

  it('keeps its own aria-expanded and aria-controls over a caller value', () => {
    render(
      <ShellWithToggle
        data-testid="page-menu"
        aria-expanded="true"
        aria-controls="elsewhere"
      />,
    );
    const toggle = screen.getByTestId('page-menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const controls = toggle.getAttribute('aria-controls');
    expect(controls).not.toBe('elsewhere');
    expect(document.getElementById(controls!)?.tagName).toBe('DIALOG');
  });

  it('runs a caller onClick after the toggle, which a preventDefault does not cancel', () => {
    const onClick = vi.fn((event: {preventDefault: () => void}) => {
      event.preventDefault();
    });
    render(<ShellWithToggle data-testid="page-menu" onClick={onClick} />);
    const toggle = screen.getByTestId('page-menu');
    fireEvent.click(toggle);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('MobileNavToggle presence', () => {
  function ShellWithPlacedToggle({
    mobileNav,
  }: {
    mobileNav: ComponentProps<typeof AppShell>['mobileNav'];
  }) {
    return (
      <AppShell
        sideNav={
          <SideNav>
            <SideNavSection title="Test" isHeaderHidden>
              <SideNavItem label="Home" />
            </SideNavSection>
          </SideNav>
        }
        mobileNav={mobileNav}>
        <MobileNavToggle data-testid="placed-toggle" />
      </AppShell>
    );
  }

  it('renders nothing above the mobile breakpoint', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue(createMockMatchMedia(false)),
    );
    render(<ShellWithPlacedToggle mobileNav={{breakpoint: 'md'}} />);
    expect(screen.queryByTestId('placed-toggle')).toBeNull();
    expect(screen.queryByRole('button', {name: /open navigation/i})).toBeNull();
  });

  it('renders nothing when AppShell turns mobile navigation off', () => {
    render(<ShellWithPlacedToggle mobileNav={false} />);
    expect(screen.queryByTestId('placed-toggle')).toBeNull();
  });

  it('renders nothing when AppShell takes a MobileNav node', () => {
    render(
      <ShellWithPlacedToggle
        mobileNav={
          <MobileNav>
            <SideNavItem label="Home" />
          </MobileNav>
        }
      />,
    );
    expect(screen.queryByTestId('placed-toggle')).toBeNull();
  });

  it('renders nothing in an AppShell with no side or top nav', () => {
    render(
      <AppShell mobileNav={{breakpoint: 'md'}}>
        <MobileNavToggle data-testid="placed-toggle" />
      </AppShell>,
    );
    expect(screen.queryByTestId('placed-toggle')).toBeNull();
  });

  it('renders nothing outside an AppShell', () => {
    render(<MobileNavToggle data-testid="placed-toggle" />);
    expect(screen.queryByTestId('placed-toggle')).toBeNull();
  });

  it('renders where the page places it when the auto toggle is off', () => {
    render(
      <ShellWithPlacedToggle
        mobileNav={{breakpoint: 'md', hasToggle: false}}
      />,
    );
    expect(
      screen.getAllByRole('button', {name: /open navigation/i}),
    ).toHaveLength(1);
    expect(screen.getByTestId('placed-toggle').tagName).toBe('BUTTON');
  });
});

describe('MobileNavToggle button, name, and icon', () => {
  function ShellWithToggle(props: MobileNavToggleProps) {
    return (
      <AppShell
        sideNav={
          <SideNav>
            <SideNavSection title="Test" isHeaderHidden>
              <SideNavItem label="Home" />
            </SideNavSection>
          </SideNav>
        }
        mobileNav={{breakpoint: 'md', hasToggle: false}}>
        <MobileNavToggle data-testid="page-menu" {...props} />
      </AppShell>
    );
  }

  it('is an icon-only ghost Button named by its label', () => {
    render(<ShellWithToggle />);
    const toggle = screen.getByTestId('page-menu');
    expect(toggle).toHaveClass('astryx-button');
    expect(toggle).toHaveAttribute('data-variant', 'ghost');
    expect(toggle).toHaveAccessibleName('Open navigation');
    expect(toggle).toHaveTextContent('');
  });

  it('takes its accessible name from label', () => {
    render(<ShellWithToggle label="Menu" />);
    expect(screen.getByTestId('page-menu')).toHaveAccessibleName('Menu');
    expect(screen.queryByRole('button', {name: /open navigation/i})).toBeNull();
  });

  it('draws the menu icon by default', () => {
    const {container: menu} = render(<Icon icon="menu" />);
    const menuGlyph = menu.querySelector('svg')?.innerHTML;
    render(<ShellWithToggle />);
    const icons = screen.getByTestId('page-menu').querySelectorAll('svg');
    expect(icons).toHaveLength(1);
    expect(menuGlyph).toBeTruthy();
    expect(icons[0].innerHTML).toBe(menuGlyph);
  });

  it('draws children in place of the menu icon', () => {
    render(
      <ShellWithToggle>
        <span data-testid="custom-glyph" />
      </ShellWithToggle>,
    );
    const toggle = screen.getByTestId('page-menu');
    expect(toggle).toContainElement(screen.getByTestId('custom-glyph'));
    expect(toggle.querySelector('svg')).toBeNull();
  });
});
