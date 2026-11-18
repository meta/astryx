// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file layerScopedContext.tsx
 * @input Surface-scoped React contexts and layer content
 * @output Private context creation and whole-value content boundary
 * @position AST-038 surface membership; unrelated contexts retain their owners
 */

import {createContext, useState, type Context, type ReactNode} from 'react';
import {createSharedContext} from '../utils/sharedContext';
import {realmValue, sharedKey} from '../utils/sharedRealm';

type Reset = (children: ReactNode) => ReactNode;
/**
 * The reset of each layer-scoped context from every copy of Core on this
 * React. A layer boundary from any of those copies resets them all, and never
 * renders another React's contexts.
 */
const resetsByReact = realmValue(
  sharedKey('layer-scoped-context-resets', 2),
  () => new WeakMap<typeof createContext, Map<Context<unknown>, Reset>>(),
  value => value instanceof WeakMap,
);
let resets = resetsByReact.get(createContext);
if (resets == null) {
  resets = new Map();
  resetsByReact.set(createContext, resets);
}
const reactResets = resets;

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
  if (!reactResets.has(Context as Context<unknown>)) {
    reactResets.set(Context as Context<unknown>, children => (
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
  const [resetChain] = useState(() => [...reactResets.values()]);
  return resetChain.reduceRight(
    (content, reset): ReactNode => reset(content),
    children,
  );
}
