// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file lazyContextMenuTouchLayer.ts
 * @input Uses React lazy and ContextMenuTouchLayer
 * @output Exports ContextMenuTouchLayer loaded on demand, and
 *   loadContextMenuTouchLayer, which starts that load
 * @position Internal to ContextMenu
 *
 * The touch layer (the gesture foundation, the press recognizer and the press
 * feedback's animator) only runs under the touch model. Loading it on demand
 * keeps it out of pages whose context menus only open from a mouse or a
 * keyboard (architecture:component-style-authoring INV6). Under a coarse
 * primary pointer, where the touch model applies, the load starts with this
 * module, so the layer is usually ready before the first finger lands; until
 * it attaches, ContextMenu keeps today's 500 ms long press.
 */

import {
  createElement,
  lazy,
  useState,
  type ComponentProps,
  type ReactElement,
} from 'react';
import {TOUCH_QUERY} from '../utils/touchPresentation';
import type * as TouchLayerModule from './ContextMenuTouchLayer';

let touchLayerModule: typeof TouchLayerModule | null = null;
let touchLayerLoad: Promise<typeof TouchLayerModule> | null = null;

/** Starts loading the touch layer; resolves once it can render. */
export async function loadContextMenuTouchLayer(): Promise<
  typeof TouchLayerModule
> {
  touchLayerLoad ??= import('./ContextMenuTouchLayer').then(module => {
    touchLayerModule = module;
    return module;
  });
  return touchLayerLoad;
}

if (
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(TOUCH_QUERY).matches
) {
  void loadContextMenuTouchLayer();
}

const LazyContextMenuTouchLayer = lazy(async () =>
  loadContextMenuTouchLayer().then(module => ({
    default: module.ContextMenuTouchLayer,
  })),
);

/**
 * The touch layer, rendered directly once loaded. Chosen once per mount, so a
 * load that lands while a lazy layer is mounted never remounts it mid-press.
 * Wrap in Suspense: the first mount before the load suspends.
 */
export function ContextMenuTouchLayer(
  props: ComponentProps<typeof TouchLayerModule.ContextMenuTouchLayer>,
): ReactElement {
  const [LoadedLayer] = useState(
    () => touchLayerModule?.ContextMenuTouchLayer ?? null,
  );
  return createElement(LoadedLayer ?? LazyContextMenuTouchLayer, props);
}
