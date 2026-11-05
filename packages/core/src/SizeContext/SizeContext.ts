// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SizeContext.ts
 * @input Layer-scoped React context, use
 * @output Exports SizeContext, useSize, ElementSize, SizeProvider
 * @position Context provider; consumed by Button, TextInput, TabList, Selector, etc.
 *
 * Generic size context that lets container components (Toolbar, TopNav, Card headers)
 * cascade a default size to interactive children. Children use the context as a
 * fallback — an explicit `size` prop always wins.
 */

import {use} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

/**
 * Standard element sizes used across interactive components.
 */
export type ElementSize = 'sm' | 'md' | 'lg';

/**
 * Context for cascading a default size from container to children.
 *
 * `null` means no container is providing a size — components use their own default.
 */
export const SizeContext = createContext<ElementSize | null>(null);
SizeContext.displayName = 'SizeContext';

/**
 * Resolve the effective size from an explicit prop, inherited context, or default.
 *
 * @param sizeProp - Explicit size prop from the component (wins if set)
 * @param defaultSize - Fallback when neither prop nor context provides a size
 * @returns The resolved size
 *
 * @example
 * ```ts
 * // In a component:
 * const size = useSize(sizeProp, 'md');
 * ```
 */
export function useSize<T extends string = ElementSize>(
  sizeProp?: T,
  defaultSize: T = 'md' as T,
): T {
  const inherited = use(SizeContext);
  return sizeProp ?? (inherited as T | null) ?? defaultSize;
}

export const SizeProvider = SizeContext.Provider;
