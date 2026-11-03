// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCloseMobileDrawerOnActivate.ts
 * @input AppShellMobileContext, TopNav and SideNav render modes
 * @output useCloseMobileDrawerOnActivate hook
 * @position Internal AppShell helper: a row inside the AppShell mobile drawer
 *   runs its own click handler and then closes the drawer. Not exported from
 *   the package.
 */

import type {MouseEvent} from 'react';
import {useAppShellMobile} from './AppShellMobileContext';
import {useSideNavRenderMode} from '../SideNav/SideNavRenderContext';
import {useTopNavRenderMode} from '../TopNav/TopNavRenderContext';

/**
 * Inside the AppShell mobile drawer (TopNav content or SideNav content shown
 * there), returns a handler that calls `onClick` and then closes the drawer.
 * Outside the drawer, returns `onClick` unchanged.
 */
export function useCloseMobileDrawerOnActivate<E extends Element>(
  onClick: ((event: MouseEvent<E>) => void) | undefined,
): ((event: MouseEvent<E>) => void) | undefined {
  const topNavRenderMode = useTopNavRenderMode();
  const sideNavRenderMode = useSideNavRenderMode();
  const {closeMobileNav} = useAppShellMobile();
  const isInMobileDrawer =
    topNavRenderMode === 'drawer' ||
    sideNavRenderMode === 'drawer' ||
    sideNavRenderMode === 'drawer-content';
  if (!isInMobileDrawer) {
    return onClick;
  }
  return event => {
    onClick?.(event);
    closeMobileNav();
  };
}
