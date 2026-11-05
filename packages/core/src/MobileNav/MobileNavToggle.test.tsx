// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavToggle.test.tsx
 * @input Uses vitest, @testing-library/react, AppShell + SideNav
 * @output Unit tests for MobileNavToggle ARIA wiring
 * @position Testing; validates MobileNavToggle.tsx exposes aria-expanded and
 *   aria-controls so screen-reader users know the drawer state and target.
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
import {render, screen, fireEvent} from '@testing-library/react';
import {AppShell} from '../AppShell/AppShell';
import {SideNav, SideNavItem, SideNavSection} from '../SideNav';
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
