// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SideNavRenderContext.ts
 * @input React createContext, use
 * @output Exports SideNavRenderContext and useSideNavRenderMode hook
 * @position Internal context for controlling SideNav rendering mode
 *
 * When AppShell renders the SideNav in multiple locations (inline, top bar,
 * mobile drawer), this context tells SideNav which parts to render:
 * - 'default': full sidebar (desktop inline)
 * - 'topbar': heading + footerIcons only, laid out horizontally (mobile top bar)
 * - 'drawer': children only, skip heading + footerIcons (mobile drawer)
 */

import {createContext, use} from 'react';

export type SideNavRenderMode =
  | 'default'
  | 'topbar'
  | 'drawer'
  | 'drawer-content';

export const SideNavRenderContext =
  createContext<SideNavRenderMode>('default');
SideNavRenderContext.displayName = 'SideNavRenderContext';

/**
 * Read the current SideNav render mode from context.
 */
export function useSideNavRenderMode(): SideNavRenderMode {
  return use(SideNavRenderContext);
}
