// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file appShellDrawerFocus.ts
 * @input createSharedContext
 * @output Exports `AppShellDrawerFocusContext`: where focus goes when the
 *   AppShell drawer closes and the button that opened it is gone
 * @position Internal to Core, not exported from the AppShell entry. AppShell
 *   provides it. TopNav narrows it for its drawer, and MobileNav reads it
 *   when its drawer closes.
 */

import {createSharedContext} from '../utils/sharedContext';

export interface AppShellDrawerFocus {
  /** This shell's main region. */
  main(): HTMLElement | null;
  /**
   * Whether the drawer has nothing left to show, because the regions it
   * holds are hidden. Its menu button then goes too.
   */
  isDrawerEmpty(): boolean;
}

export const AppShellDrawerFocusContext =
  createSharedContext<AppShellDrawerFocus | null>(
    'AppShellDrawerFocusContext',
    1,
    null,
  );
AppShellDrawerFocusContext.displayName = 'AppShellDrawerFocusContext';
