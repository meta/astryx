// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayoutContainerContext.ts
 * @input Layer-scoped React context
 * @output Exports LayoutContainerContext and the LayoutContainer type
 * @position Names the container a Layout sits in: a card, a dialog, or a
 *   bottom sheet. Card.tsx, Dialog.tsx and BottomSheetPanel.tsx provide it.
 *   LayoutHeader.tsx and LayoutFooter.tsx read it and reflect it as their
 *   `container` theme prop. A new layer resets it, so a menu opened from a
 *   card is in no container.
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

/** A container that names itself to the Layout inside it. */
export type LayoutContainer = 'card' | 'dialog' | 'bottom-sheet';

export const LayoutContainerContext =
  createLayerScopedContext<LayoutContainer | null>(
    'LayoutContainerContext',
    1,
    null,
  );
LayoutContainerContext.displayName = 'LayoutContainerContext';
