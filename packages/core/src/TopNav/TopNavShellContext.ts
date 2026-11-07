// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavShellContext.ts
 * @input React createContext
 * @output Exports `TopNavShellContext`: what AppShell tells its TopNav about
 *   hidden regions
 * @position Internal to Core, not exported from the TopNav entry. With a
 *   hidden region, the phone drawer keeps that region mounted but hidden.
 */

import {createContext} from 'react';

export interface TopNavShell {
  /** The top nav is hidden: its own items stay mounted but hidden. */
  readonly isOwnContentHidden: boolean;
  /** The side nav content the drawer also holds is hidden. */
  readonly isMobileContentHidden: boolean;
}

export const TopNavShellContext = createContext<TopNavShell | null>(null);
TopNavShellContext.displayName = 'TopNavShellContext';
