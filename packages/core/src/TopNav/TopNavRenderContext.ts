// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavRenderContext.ts
 * @input createSharedContext, use, StyleX style types
 * @output Exports TopNavRenderContext, useTopNavRenderMode,
 *   TopNavUnreadRegionContext and useTopNavUnreadRegionStyle
 * @position Internal contexts through which AppShell tells TopNav how to
 *   render: its mode ('default' full bar, 'mobile-bar' heading, end content
 *   and toggle, 'drawer' items as a vertical list), and the rule its start
 *   and center regions take until the shell reads the window.
 */

import {use} from 'react';
import {createSharedContext} from '../utils/sharedContext';
import type {StyleXStyles} from '@stylexjs/stylex';

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
 * showing on a phone. AppShell then hands the full bar the rule that hides
 * its start and center content below the breakpoint, as its mobile bar does.
 * `null` everywhere else.
 */
export const TopNavUnreadRegionContext =
  createSharedContext<StyleXStyles | null>(
    'TopNavUnreadRegionContext',
    1,
    null,
  );
TopNavUnreadRegionContext.displayName = 'TopNavUnreadRegionContext';

/**
 * Read the rule the full bar's start and center regions take until AppShell
 * reads the window.
 */
export function useTopNavUnreadRegionStyle(): StyleXStyles | null {
  return use(TopNavUnreadRegionContext);
}
