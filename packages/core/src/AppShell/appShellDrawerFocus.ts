// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file appShellDrawerFocus.ts
 * @input React createContext
 * @output Exports `AppShellDrawerFocusContext`: where focus goes when the
 *   AppShell drawer closes and the button that opened it is gone
 * @position Internal to Core, not exported from the AppShell entry. AppShell
 *   provides it; MobileNav reads it when its drawer closes.
 */

import {createContext} from 'react';

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
  createContext<AppShellDrawerFocus | null>(null);
AppShellDrawerFocusContext.displayName = 'AppShellDrawerFocusContext';
