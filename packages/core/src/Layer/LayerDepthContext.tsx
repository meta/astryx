// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayerDepthContext.tsx
 * @input React depth context
 * @output Exports LayerDepthContext, useLayerDepth, LayerDepthProvider
 * @position Layer system; how the dismissal stack learns which layer is nested
 *   inside which.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/index.ts
 * - /packages/core/src/Layer/useLayerDismissal.ts
 *
 * Nesting is read from the React tree rather than the DOM. Two reasons:
 *
 * - **Portals.** A nested overlay routinely renders into `document.body` or the
 *   native top layer, so DOM containment reports it as a sibling of the layer
 *   it is logically inside. React context flows through `createPortal`, so the
 *   tree keeps the relationship the DOM loses.
 * - **Same-commit mounts.** Depth is fixed during render. Effect order is not
 *   available then and is misleading anyway: React runs child effects before
 *   parent effects, so an inner layer registers first and looks "older" than
 *   the outer layer that contains it.
 *
 * There is nothing to mount at the app root: the context defaults to 0, and
 * each layer provides depth for its OWN content, so nesting composes on its own.
 */

import {createContext, use, type ReactNode} from 'react';

/**
 * How many layers deep the current subtree is. 0 at the app root; each layer
 * increments it for its own content.
 */
export const LayerDepthContext = createContext(0);
LayerDepthContext.displayName = 'LayerDepthContext';

/**
 * Read the current nesting depth. A layer calls this to learn its OWN depth —
 * the depth of the subtree it is rendered into, before it pushes its content
 * one level deeper.
 */
export function useLayerDepth(): number {
  return use(LayerDepthContext);
}

/**
 * Wrap a layer's content so any layer opened from inside it registers as
 * nested. Takes no depth prop on purpose: it reads the ambient depth and adds
 * one, so nesting composes without anyone tracking absolute numbers.
 *
 * Renders no DOM element — it is a context boundary only, which is why it takes
 * no `xstyle`/`ref` and exposes no props interface.
 */
export function LayerDepthProvider({children}: {children: ReactNode}) {
  const depth = use(LayerDepthContext);
  return <LayerDepthContext value={depth + 1}>{children}</LayerDepthContext>;
}

LayerDepthProvider.displayName = 'LayerDepthProvider';
