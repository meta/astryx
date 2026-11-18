// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavRenderContext.ts
 * @input createSharedContext, use
 * @output Exports TopNavRenderContext and useTopNavRenderMode hook
 * @position Internal context for controlling TopNav rendering mode
 *
 * When AppShell renders TopNav in multiple locations (top bar, mobile drawer),
 * this context tells TopNav and its children which parts to render:
 * - 'default': full top bar (desktop)
 * - 'mobile-bar': heading + endContent + toggle, hide nav items (mobile top bar)
 * - 'drawer': nav items as vertical list elements (mobile drawer)
 */

import {use} from 'react';
import {createSharedContext} from '../utils/sharedContext';

export type TopNavRenderMode = 'default' | 'mobile-bar' | 'drawer';

export const TopNavRenderContext = createSharedContext<TopNavRenderMode>(
  'TopNavRenderContext',
  1,
  'default',
);
TopNavRenderContext.displayName = 'TopNavRenderContext';

/**
 * Read the current TopNav render mode from context.
 */
export function useTopNavRenderMode(): TopNavRenderMode {
  return use(TopNavRenderContext);
}
