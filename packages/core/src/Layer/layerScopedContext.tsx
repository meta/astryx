// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file layerScopedContext.tsx
 * @input Surface-scoped React contexts and layer content
 * @output Private context creation and whole-value content boundary
 * @position AST-038 surface membership; unrelated contexts retain their owners
 */

import {useState, type Context, type ReactNode} from 'react';
import {
  createSharedContext,
  realmValue,
  sharedKey,
} from '../utils/sharedContext';

type Reset = (children: ReactNode) => ReactNode;
/**
 * The reset of each layer-scoped context from every copy of Core. A layer
 * boundary from any copy resets them all.
 */
const resets = realmValue(
  sharedKey('layer-scoped-context-resets', 1),
  () => new Map<Context<unknown>, Reset>(),
);

/**
 * Create a surface-scoped context whose whole default applies in a new layer.
 * The name and version register it like `createSharedContext`.
 */
export function createLayerScopedContext<T>(
  name: string,
  version: number,
  defaultValue: T,
): Context<T> {
  const Context = createSharedContext(name, version, defaultValue);
  if (!resets.has(Context as Context<unknown>)) {
    resets.set(Context as Context<unknown>, children => (
      <Context value={defaultValue}>{children}</Context>
    ));
  }
  return Context;
}

export function LayerContentBoundary({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  // Keep the provider chain stable for this mount: lazy imports must not
  // remount existing content and discard its state or focus.
  const [resetChain] = useState(() => [...resets.values()]);
  return resetChain.reduceRight(
    (content, reset): ReactNode => reset(content),
    children,
  );
}
