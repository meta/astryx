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
 * mobile drawer, producing a single combined drawer.
 */

import {use, type ReactNode} from 'react';
import {createSharedContext} from '../utils/sharedContext';

export const TopNavMobileContentContext = createSharedContext<ReactNode>(
  'TopNavMobileContentContext',
  1,
  null,
);
TopNavMobileContentContext.displayName = 'TopNavMobileContentContext';

/**
 * Read additional mobile drawer content provided by AppShell.
 * Returns null when no additional content is available.
 */
export function useTopNavMobileContent(): ReactNode {
  return use(TopNavMobileContentContext);
}
