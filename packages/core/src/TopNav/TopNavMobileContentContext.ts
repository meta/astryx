// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavMobileContentContext.ts
 * @input createSharedContext, use
 * @output Exports TopNavMobileContentContext and useTopNavMobileContent
 * @position Internal context for passing additional drawer content to TopNav
 *
 * When both TopNav and SideNav exist, AppShell passes the SideNav content
 * to TopNav via this context. TopNav renders it below its own items in the
 * mobile drawer, producing a single combined drawer. AppShell also says which
 * of the two its `hiddenRegions` hides: a hidden region stays mounted in the
 * drawer but hidden, and does not count as drawer content.
 */

import {use, type ReactNode} from 'react';
import {createSharedContext} from '../utils/sharedContext';

export interface TopNavMobileContent {
  /** The SideNav content the drawer also holds. */
  readonly content: ReactNode;
  /** The top nav is hidden: its own items stay mounted but hidden. */
  readonly isOwnContentHidden: boolean;
  /** The SideNav content is hidden. */
  readonly isContentHidden: boolean;
}

export const TopNavMobileContentContext =
  createSharedContext<TopNavMobileContent | null>(
    'TopNavMobileContentContext',
    2,
    null,
  );
TopNavMobileContentContext.displayName = 'TopNavMobileContentContext';

/**
 * Read the additional mobile drawer content AppShell provides, with what it
 * hides. Returns null outside AppShell's mobile bar and drawer.
 */
export function useTopNavMobileContent(): TopNavMobileContent | null {
  return use(TopNavMobileContentContext);
}
