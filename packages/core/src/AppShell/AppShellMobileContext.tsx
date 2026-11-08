// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AppShellMobileContext.tsx
 * @input Uses createSharedContext, use
 * @output Exports AppShellMobileContext, useAppShellMobile
 * @position Internal context for mobile nav state; consumed by MobileNavToggle, TopNav (future)
 *
 * Provides mobile navigation state to any component in the AppShell tree.
 * Used by MobileNavToggle to open/close the drawer and by TopNav (future)
 * to adapt rendering based on mobile context.
 */

import {use} from 'react';
import {createSharedContext} from '../utils/sharedContext';

export interface AppShellMobileContextValue {
  /** Whether the viewport is below the mobile breakpoint */
  isMobile: boolean;
  /** Whether the mobile nav drawer is currently open */
  isMobileNavOpen: boolean;
  /**
   * DOM id of the mobile nav drawer. `AppShell` sets this so the toggle can
   * point its `aria-controls` at the drawer and the drawer can apply it as its
   * `id`. Optional: callers that construct this context by hand may omit it, in
   * which case `MobileNav` falls back to a locally generated id and the toggle
   * simply drops `aria-controls`.
   */
  mobileNavId?: string;
  /** Toggle the mobile nav drawer open/closed */
  toggleMobileNav: () => void;
  /** Open the mobile nav drawer */
  openMobileNav: () => void;
  /** Close the mobile nav drawer */
  closeMobileNav: () => void;
  /** Whether mobile nav is enabled at all */
  isMobileNavEnabled: boolean;
  /** Whether auto-placed toggles should render (false in customToggle mode) */
  hasAutoToggle: boolean;
}

const defaultValue: AppShellMobileContextValue = {
  isMobile: false,
  isMobileNavOpen: false,
  toggleMobileNav: () => {},
  openMobileNav: () => {},
  closeMobileNav: () => {},
  isMobileNavEnabled: false,
  hasAutoToggle: true,
};

export const AppShellMobileContext =
  createSharedContext<AppShellMobileContextValue>(
    'AppShellMobileContext',
    1,
    defaultValue,
  );
AppShellMobileContext.displayName = 'AppShellMobileContext';

/**
 * Hook to access mobile nav state from anywhere in the AppShell tree.
 */
export function useAppShellMobile(): AppShellMobileContextValue {
  return use(AppShellMobileContext);
}
