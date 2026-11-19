// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCloseMobileDrawerOnActivate.ts
 * @input AppShellMobileContext, TopNav and SideNav render modes
 * @output useCloseMobileDrawerOnActivate, useIsInAppShellMobileDrawer
 * @position Internal AppShell helper for rows in the mobile drawer. Not
 *   exported from the package.
 */

import {useAppShellMobile} from './AppShellMobileContext';
import {isModifiedClick} from '../DropdownMenu/menuItemRoles';
import {useSideNavRenderMode} from '../SideNav/SideNavRenderContext';
import {useTopNavRenderMode} from '../TopNav/TopNavRenderContext';

/**
 * Returns a function that wraps a row's click handler. While
 * `isInMobileDrawer` is true, the wrapped handler calls the row's handler and
 * then closes the AppShell mobile drawer. Otherwise the row's handler comes
 * back unchanged. Every drawer row closes the drawer through this one rule,
 * except that a modified click on a link leaves it open.
 */
export function useCloseMobileDrawerOnActivate(
  isInMobileDrawer: boolean,
): <Args extends unknown[]>(
  onClick: ((...args: Args) => void) | undefined,
) => ((...args: Args) => void) | undefined {
  const {closeMobileNav} = useAppShellMobile();
  return onClick => {
    if (!isInMobileDrawer) {
      return onClick;
    }
    return (...args) => {
      onClick?.(...args);
      if (!isModifiedLinkClick(args[0])) {
        closeMobileNav();
      }
    };
  };
}

// A modified click on a link is the browser's (a new tab), so the drawer stays
// open for the next one. The clicked element decides whether it is a link, so
// a row whose blocked `href` renders no address still closes. A row whose
// `onClick` cancels the click opens nothing elsewhere, so it still closes.
function isModifiedLinkClick(event: unknown): boolean {
  const click = event as React.MouseEvent<Element> | undefined;
  return (
    click?.currentTarget?.hasAttribute?.('href') === true &&
    isModifiedClick(click) &&
    !click.defaultPrevented
  );
}

/**
 * Whether the caller renders inside the AppShell mobile drawer: in TopNav
 * content or SideNav content shown there.
 */
export function useIsInAppShellMobileDrawer(): boolean {
  const topNavRenderMode = useTopNavRenderMode();
  const sideNavRenderMode = useSideNavRenderMode();
  return (
    topNavRenderMode === 'drawer' ||
    sideNavRenderMode === 'drawer' ||
    sideNavRenderMode === 'drawer-content'
  );
}
