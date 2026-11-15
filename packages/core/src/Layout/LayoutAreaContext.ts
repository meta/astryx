// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayoutAreaContext.ts
 * @input Uses createSharedContext
 * @output Exports LayoutAreaContext and LayoutArea type
 * @position Context for layout slot detection
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Layout/Layout.doc.mjs
 */

import {createSharedContext} from '../utils/sharedContext';

/**
 * Layout area type representing which slot a component is rendered in.
 * Used by content area components to detect their position and adjust styling.
 */
export type LayoutArea =
  'header' | 'footer' | 'content' | 'start' | 'end' | null;

/**
 * Context for detecting which layout area a component is rendered in.
 * Content area components use this to:
 * - Auto-position dividers correctly
 * - Apply correct semantic elements
 * - Adjust internal spacing
 */
export const LayoutAreaContext = createSharedContext<LayoutArea>(
  'LayoutAreaContext',
  1,
  null,
);
LayoutAreaContext.displayName = 'LayoutAreaContext';
