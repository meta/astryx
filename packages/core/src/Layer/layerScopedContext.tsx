// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file layerScopedContext.tsx
 * @input Surface-scoped React contexts and layer content
 * @output Private context creation and whole-value content boundary
 * @position AST-038 surface membership; unrelated contexts retain their owners
 */

import {createContext, useState, type Context, type ReactNode} from 'react';

type Reset = (children: ReactNode) => ReactNode;
const resets: Reset[] = [];

/** Create a surface-scoped context whose whole default applies in a new layer. */
export function createLayerScopedContext<T>(defaultValue: T): Context<T> {
  const Context = createContext(defaultValue);
  Context.displayName = 'LayerScopedContext';
  resets.push(children => <Context value={defaultValue}>{children}</Context>);
  return Context;
}

export function LayerContentBoundary({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  // Keep the provider chain stable for this mount: lazy imports must not
  // remount existing content and discard its state or focus.
  const [resetChain] = useState(() => resets.slice());
  return resetChain.reduceRight(
    (content, reset): ReactNode => reset(content),
    children,
  );
}
