// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayerContext.ts
 * @input React context
 * @output Exports LayerContext and related types
 * @position Context definition for LayerProvider
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/index.ts
 * - /packages/core/src/Layer/LayerProvider.tsx
 */

import {createContext, use} from 'react';

/**
 * The inset an app declares for a persistent bar floating over a viewport
 * edge — a phone navigation bar, a docked toolbar — once, on `LayerProvider`.
 * Each edge adds to the layer runtime's gutter for every anchored layer under
 * the provider and moves the toast viewport by the same amount. A number is
 * pixels; a string is a CSS length. Every edge defaults to zero: the system
 * already knows the device's own edges (the gutter reads
 * `env(safe-area-inset-*)`); only the app knows the bars it draws.
 */
export interface LayerInset {
  blockStart?: number | string;
  blockEnd?: number | string;
  inlineStart?: number | string;
  inlineEnd?: number | string;
}

/**
 * Toast configuration passed through the layer provider.
 */
export interface LayerToastConfig {
  /** Position of the toast stack. @default 'bottomEnd' */
  position?: 'topEnd' | 'topStart' | 'bottomEnd' | 'bottomStart';
  /** Maximum visible toasts. @default 5 */
  maxVisible?: number;
  /**
   * Toast-only inset from viewport edges. An edge set here replaces the
   * provider-level `inset` for the toast viewport on that edge; unset edges
   * follow the provider.
   */
  inset?: {
    top?: number;
    bottom?: number;
    start?: number;
    end?: number;
  };
}

/**
 * Context value provided by LayerProvider.
 */
export interface LayerContextValue {
  /** Toast configuration from the provider. */
  toastConfig: LayerToastConfig;
  /** The app-declared viewport inset from the provider; undefined is zero on every edge. */
  inset: LayerInset | undefined;
  /** Whether this is a real provider (not fallback). */
  isProvider: true;
}

/**
 * React context for the layer provider.
 * Default value is null — hooks detect this and use the fallback.
 */
export const LayerContext = createContext<LayerContextValue | null>(null);
LayerContext.displayName = 'LayerContext';

/**
 * Hook to access the layer context. Returns null if no provider exists.
 */
export function useLayerContext(): LayerContextValue | null {
  return use(LayerContext);
}
