// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectorRowLayoutContext.ts
 * @input Layer-scoped React context/use
 * @output Exports the row-layout context and useSelectorRowLayout hook
 * @position Internal to the Selector module; read by SelectorOption
 *
 * The trigger inside an InputGroup is height-pinned by the group, so its value
 * box is clamped to one line and anything taller is cut off at the fold. This
 * context is how the rows the system draws itself avoid being cut: they reflow
 * label and description onto that one line instead. The geometry does not
 * depend on it — a node that ignores this context still cannot grow the row.
 */

import {use} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

export type SelectorRowLayout = 'stacked' | 'inline';

export const SelectorRowLayoutContext =
  createContext<SelectorRowLayout>('stacked');
SelectorRowLayoutContext.displayName = 'SelectorRowLayoutContext';

/**
 * The row layout a host imposes on the options it renders. `stacked` outside
 * any height-pinned host.
 */
export function useSelectorRowLayout(): SelectorRowLayout {
  return use(SelectorRowLayoutContext);
}
