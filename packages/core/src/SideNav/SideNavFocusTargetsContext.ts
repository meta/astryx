// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SideNavFocusTargetsContext.ts
 * @input The SideNav rail's rows and its collapse toggle, registered by their
 *   callback refs
 * @output Where focus goes when collapsing the rail removes the focused row
 * @position Internal to SideNav: not exported from the SideNav entry. SideNav
 *   provides it; SideNavItem registers its row and SideNavCollapseButton,
 *   rendered inside the SideNav, registers itself (`component:SideNav` AR3).
 */

import {createContext} from 'react';

export interface SideNavFocusTargets {
  /** Registers a row's root element; returns its unregister. */
  registerRow: (element: HTMLElement) => () => void;
  /** Registers a collapse toggle rendered inside the SideNav. */
  registerToggle: (element: HTMLElement) => () => void;
}

export const SideNavFocusTargetsContext =
  createContext<SideNavFocusTargets | null>(null);
SideNavFocusTargetsContext.displayName = 'SideNavFocusTargetsContext';
