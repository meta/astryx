// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavReopen.test.tsx
 * @input Uses vitest, @testing-library/react, AppShell + SideNav
 * @output Regression test for mobile hamburger nav re-open after close
 * @position Testing; validates the OOTB AppShell mobile drawer toggle cycle
 *
 * Repro for: mobile hamburger nav can be opened and closed once, but cannot
 * be re-opened after closing.
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
import {render, screen, fireEvent, act} from '@testing-library/react';
import {AppShell} from '../AppShell/AppShell';
import {SideNav, SideNavItem, SideNavSection} from '../SideNav';
import {loadMobileNavDrawer} from './MobileNavToggle';

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

// These cases test the drawer once it has loaded. MobileNavDrawer.test.tsx
// tests the closed placeholder and the load itself.
beforeAll(async () => {
  await loadMobileNavDrawer();
});

describe('Mobile nav re-open after close (uncontrolled OOTB)', () => {
  it('can be opened, closed, then opened again', () => {
    vi.useFakeTimers();
    try {
      render(<TestShell />);

      const getDialog = () => screen.getAllByRole('dialog', {hidden: true})[0];
      const openToggle = () =>
        screen.getByRole('button', {name: /open navigation/i});

      // 1. Open
      fireEvent.click(openToggle());
      expect(getDialog()).toHaveAttribute('open');

      // 2. Close via the drawer's close button
      fireEvent.click(screen.getByRole('button', {name: /close navigation/i}));
      // Flush the delayed dialog.close() (slide-out transition)
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(getDialog()).not.toHaveAttribute('open');

      // 3. Open AGAIN — this is the bug: it should re-open
      fireEvent.click(openToggle());
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(getDialog()).toHaveAttribute('open');
    } finally {
      vi.useRealTimers();
    }
  });
});
