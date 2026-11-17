// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavContext.ts
 * @input Layer-scoped React context
 * @output TopNavSlotContext, useTopNavSlot, TopNavMegaMenuCloseContext, and
 *   pickCloses
 * @position Navigation slot presentation defaults
 */

import {use} from 'react';
import {createLayerScopedContext} from '../Layer/layerScopedContext';
import {getInteractionModality} from '../utils/interactionModality';
import {getLastPointerType} from '../utils/inputStream';

export type TopNavSlot = 'start' | 'center' | 'end';

export const TopNavSlotContext = createLayerScopedContext<TopNavSlot>(
  'TopNavSlotContext',
  1,
  'start',
);
TopNavSlotContext.displayName = 'TopNavSlotContext';

export function useTopNavSlot(): TopNavSlot {
  return use(TopNavSlotContext);
}

/**
 * Closes the TopNavMegaMenu panel that holds the content, returning focus to
 * its trigger; null outside a panel. Panel items call it on a pick.
 */
export const TopNavMegaMenuCloseContext = createLayerScopedContext<
  (() => void) | null
>('TopNavMegaMenuCloseContext', 1, null);
TopNavMegaMenuCloseContext.displayName = 'TopNavMegaMenuCloseContext';

/**
 * Whether the pick that just activated `node` closes its TopNav menu: a
 * keyboard pick and a finger or pen press do; a mouse or trackpad pick, or a
 * pointer pick whose type the shared input stream did not hear, does not.
 * It reads the shared modality and input-stream state at the click; with no
 * node, it reads the page's.
 */
export function pickCloses(node: Element | null): boolean {
  if (getInteractionModality(node) === 'keyboard') {
    return true;
  }
  const view =
    node?.ownerDocument.defaultView ??
    (typeof window === 'undefined' ? null : window);
  const type = view == null ? null : getLastPointerType(view);
  return type === 'touch' || type === 'pen';
}
