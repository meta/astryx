// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavRenderContext.ts
 * @input createSharedContext, use
 * @output Exports TopNavRenderContext, useTopNavRenderMode, TopNavUnreadBreakpointContext and useTopNavUnreadBreakpoint
 * @position Internal context for controlling TopNav rendering mode
 *
 * When AppShell renders TopNav in multiple locations (top bar, mobile drawer),
 * this context tells TopNav and its children which parts to render:
 * - 'default': full top bar (desktop)
 * - 'mobile-bar': heading + endContent + toggle, hide nav items (mobile top bar)
 * - 'drawer': nav items as vertical list elements (mobile drawer)
 *
 * TopNavUnreadBreakpointContext carries the width point below which AppShell's
 * phone layout applies, while the shell has not read the window yet.
 */

import {use} from 'react';
import {createSharedContext} from '../utils/sharedContext';
import type {WidthBreakpointName} from '../theme/themeAdaptations';

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

/**
 * Until AppShell reads the window, its server-rendered full bar can be
 * showing on a phone. AppShell then names the standard width point below
 * which its phone layout applies, and the full bar hides its start and center
 * content below that point, as its mobile bar does. `null` everywhere else.
 */
export const TopNavUnreadBreakpointContext =
  createSharedContext<WidthBreakpointName | null>(
    'TopNavUnreadBreakpointContext',
    1,
    null,
  );
TopNavUnreadBreakpointContext.displayName = 'TopNavUnreadBreakpointContext';

/**
 * Read the width point below which the full bar hides its start and center
 * content until AppShell reads the window.
 */
export function useTopNavUnreadBreakpoint(): WidthBreakpointName | null {
  return use(TopNavUnreadBreakpointContext);
}
