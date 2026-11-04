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

import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

export interface LayoutDividerContextValue {
  defaultHasDividers: boolean;
}

export const LayoutDividerContext =
  createContext<LayoutDividerContextValue | null>(null);
LayoutDividerContext.displayName = 'LayoutDividerContext';
