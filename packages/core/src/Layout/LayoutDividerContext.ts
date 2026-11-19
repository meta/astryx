// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayoutDividerContext.ts
 * @input Layer-scoped React context
 * @output Exports LayoutDividerContext and LayoutDividerContextValue type
 * @position Context for container-controlled default divider visibility;
 *   consumed by LayoutHeader.tsx, LayoutFooter.tsx, provided by Layout.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Layout/Layout.doc.mjs
 * - /packages/core/src/Layout/Layout.tsx
 * - /packages/core/src/Layout/LayoutHeader.tsx
 * - /packages/core/src/Layout/LayoutFooter.tsx
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

export interface LayoutDividerContextValue {
  defaultHasDividers: boolean;
}

export const LayoutDividerContext =
  createLayerScopedContext<LayoutDividerContextValue | null>(
    'LayoutDividerContext',
    1,
    null,
  );
LayoutDividerContext.displayName = 'LayoutDividerContext';
