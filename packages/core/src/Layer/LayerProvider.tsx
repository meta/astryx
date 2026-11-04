// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useMemo, type ReactNode} from 'react';
import {
  LayerContext,
  useLayerContext,
  type LayerContextValue,
  type LayerInset,
  type LayerToastConfig,
} from './LayerContext';
import {ToastViewport} from '../Toast/ToastViewport';

export interface LayerProviderProps {
  children: ReactNode;
  /** Toast configuration. Omit to use defaults. */
  toast?: LayerToastConfig;
  /**
   * A persistent bar floating over a viewport edge, declared once. Each edge
   * adds to the gutter every anchored layer keeps from that edge and moves
   * the toast viewport by the same amount. Numbers are pixels; strings are
   * CSS lengths. Defaults to zero on every edge.
   *
   * @example
   * ```
   * <LayerProvider inset={{blockEnd: 56}}>…</LayerProvider>
   * ```
   */
  inset?: LayerInset;
}

/**
 * App-level provider for layer systems (toast, sheet, imperative modals).
 *
 * Optional — hooks fall back to a lazy self-mounting viewport when no
 * provider exists. Nested providers are no-ops, except that one declaring an
 * `inset` narrows it for the anchored layers in its subtree. `inset` declares
 * a persistent bar floating over a viewport edge once; anchored layers and
 * toasts both clear it.
 *
 * @example
 * ```
 * <LayerProvider toast={{ position: 'topEnd', maxVisible: 3 }}>
 *   <App />
 * </LayerProvider>
 * ```
 */
const DEFAULT_TOAST_CONFIG = {};

export function LayerProvider({
  children,
  toast: toastConfig = DEFAULT_TOAST_CONFIG,
  inset,
}: LayerProviderProps) {
  const existingContext = useLayerContext();

  const contextValue = useMemo<LayerContextValue>(
    () => ({toastConfig, inset, isProvider: true}),
    [toastConfig, inset],
  );
  const nestedValue = useMemo<LayerContextValue | null>(
    () =>
      existingContext && inset != null ? {...existingContext, inset} : null,
    [existingContext, inset],
  );

  // Nested provider — pass through. One that declares an inset narrows it
  // for the anchored layers in its subtree (an app hosted inside another
  // provider can still declare its own bar); the toast viewport is the
  // root's and reads the root's declaration.
  if (existingContext) {
    if (nestedValue == null) {
      return <>{children}</>;
    }
    return <LayerContext value={nestedValue}>{children}</LayerContext>;
  }

  // The declared inset reaches anchored layers through context — each layer
  // writes it inline on itself, so a corrective portal cannot escape it — and
  // the toast viewport through its prop. Nothing resolves placement through
  // the provider (spec:AST-059 FR6). With no inset nothing is written, so a
  // surface with no provider renders as one under the default provider.
  return (
    <LayerContext value={contextValue}>
      <ToastViewport
        position={toastConfig.position}
        maxVisible={toastConfig.maxVisible}
        inset={toastConfig.inset}
        layerInset={inset}>
        {children}
      </ToastViewport>
    </LayerContext>
  );
}

LayerProvider.displayName = 'LayerProvider';
