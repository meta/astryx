// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TopNavDrawerModifiedClick.test.tsx
 * @input Uses vitest, @testing-library/react, TopNavItem, TopNavMenu, TopNavMegaMenuItem
 * @output Tests that a modified click on a drawer link leaves the mobile drawer open
 * @position Testing; validates the TopNav drawer rows' close-on-activate rule
 *
 * SYNC: When a TopNav drawer row's click handling changes, update tests to match
 */

import type {ReactNode} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {AppShellMobileContext} from '../AppShell/AppShellMobileContext';
import {TopNavRenderContext} from './TopNavRenderContext';
import {TopNavItem} from './TopNavItem';
import {TopNavMenu} from './TopNavMenu';
import {TopNavMegaMenuItem} from './TopNavMegaMenuItem';

function renderInDrawer(ui: ReactNode) {
  const closeMobileNav = vi.fn();
  render(
    <AppShellMobileContext
      value={{
        isMobile: true,
        isMobileNavOpen: true,
        toggleMobileNav: vi.fn(),
        openMobileNav: vi.fn(),
        closeMobileNav,
        isMobileNavEnabled: true,
        hasAutoToggle: true,
      }}>
      <TopNavRenderContext value="drawer">{ui}</TopNavRenderContext>
    </AppShellMobileContext>,
  );
  return {closeMobileNav};
}

const modifiers = [
  ['ctrl', {ctrlKey: true}],
  ['meta', {metaKey: true}],
  ['shift', {shiftKey: true}],
  ['alt', {altKey: true}],
] as const;

describe('TopNav drawer rows: a modified click on a link', () => {
  describe('TopNavItem', () => {
    it('closes the drawer on a plain click', async () => {
      const user = userEvent.setup();
      const {closeMobileNav} = renderInDrawer(
        <TopNavItem label="Home" href="#home" />,
      );
      await user.click(screen.getByRole('link', {name: 'Home'}));
      expect(closeMobileNav).toHaveBeenCalledTimes(1);
    });

    it.each(modifiers)(
      'leaves the drawer open on a %s-click',
      (_name, modifier) => {
        const onClick = vi.fn();
        const {closeMobileNav} = renderInDrawer(
          <TopNavItem label="Home" href="#home" onClick={onClick} />,
        );
        fireEvent.click(screen.getByRole('link', {name: 'Home'}), modifier);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(closeMobileNav).not.toHaveBeenCalled();
      },
    );

    it('closes the drawer on a modified click of an item with no href', () => {
      const {closeMobileNav} = renderInDrawer(
        <TopNavItem label="Action" onClick={vi.fn()} />,
      );
      fireEvent.click(screen.getByText('Action'), {
        ctrlKey: true,
      });
      expect(closeMobileNav).toHaveBeenCalledTimes(1);
    });
  });

  describe('TopNavMenu', () => {
    const items = [{title: 'Analytics', href: '#analytics'}];

    async function openMenu() {
      const user = userEvent.setup();
      const view = renderInDrawer(
        <TopNavMenu label="Products" items={items} />,
      );
      await user.click(screen.getByRole('button', {name: /Products/}));
      return {user, ...view};
    }

    it('closes the drawer on a plain click', async () => {
      const {user, closeMobileNav} = await openMenu();
      await user.click(screen.getByRole('link', {name: /Analytics/}));
      expect(closeMobileNav).toHaveBeenCalledTimes(1);
    });

    it.each(modifiers)(
      'leaves the drawer open on a %s-click',
      async (_name, modifier) => {
        const {closeMobileNav} = await openMenu();
        fireEvent.click(
          screen.getByRole('link', {name: /Analytics/}),
          modifier,
        );
        expect(closeMobileNav).not.toHaveBeenCalled();
      },
    );
  });

  describe('TopNavMegaMenuItem', () => {
    it('closes the drawer on a plain click', async () => {
      const user = userEvent.setup();
      const {closeMobileNav} = renderInDrawer(
        <TopNavMegaMenuItem title="Reports" href="#reports" />,
      );
      await user.click(screen.getByRole('link', {name: /Reports/}));
      expect(closeMobileNav).toHaveBeenCalledTimes(1);
    });

    it.each(modifiers)(
      'leaves the drawer open on a %s-click',
      (_name, modifier) => {
        const onClick = vi.fn();
        const {closeMobileNav} = renderInDrawer(
          <TopNavMegaMenuItem
            title="Reports"
            href="#reports"
            onClick={onClick}
          />,
        );
        fireEvent.click(screen.getByRole('link', {name: /Reports/}), modifier);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(closeMobileNav).not.toHaveBeenCalled();
      },
    );
  });
});
