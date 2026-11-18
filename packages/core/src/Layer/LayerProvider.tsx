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
import {ToastHostOutlet} from './toastHost';

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

const DEFAULT_TOAST_CONFIG = {};

/**
 * App-level configuration for toasts and the viewport inset.
 *
 * Optional — hooks fall back to a lazy self-mounting viewport when no
 * provider exists. The provider renders the toast viewport once Toast is
 * imported; without Toast it renders no empty viewport. A nested provider
 * keeps the outer toast configuration and mounts no second viewport. One that
 * declares an `inset` applies its declared edges to the anchored layers in its
 * subtree. `inset` declares a persistent bar floating over a viewport edge
 * once; anchored layers and toasts both clear it.
 *
 * @example
 * ```
 * <LayerProvider toast={{ position: 'topEnd', maxVisible: 3 }}>
 *   <App />
 * </LayerProvider>
 * ```
 */
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

  // Nested provider — pass through. One that declares an inset applies it
  // to the anchored layers in its subtree (an app hosted inside another
  // provider can still declare its own bar); the toast viewport is the
  // root's and reads the root's declaration.
  if (existingContext) {
    if (nestedValue == null) {
      return <>{children}</>;
    }
    return <LayerContext value={nestedValue}>{children}</LayerContext>;
  }

  // The declared inset reaches anchored layers through context. Each layer
  // writes it inline on itself, so a corrective portal cannot escape it. The
  // toast viewport gets it through the outlet. Nothing resolves placement
  // through the provider (spec:AST-059 FR6). With no inset, no layer or toast
  // viewport gets a layer-inset custom property. A surface with no provider
  // therefore renders as one under the default provider.
  return (
    <LayerContext value={contextValue}>
      <ToastHostOutlet
        position={toastConfig.position}
        maxVisible={toastConfig.maxVisible}
        inset={toastConfig.inset}
        layerInset={inset}>
        {children}
      </ToastHostOutlet>
    </LayerContext>
  );
}

LayerProvider.displayName = 'LayerProvider';
