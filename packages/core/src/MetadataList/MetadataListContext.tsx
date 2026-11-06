// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MetadataListContext.tsx
 * @input Layer-scoped React context
 * @output Exports MetadataListContext for sharing config between MetadataList and MetadataListItem
 * @position Internal context; consumed by MetadataList.tsx and MetadataListItem.tsx
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

export interface MetadataListLabelConfig {
  position?: 'start' | 'top';
  width?: number | string;
}

export interface MetadataListContextValue {
  labelConfig: MetadataListLabelConfig;
  orientation: 'vertical' | 'horizontal';
}

export const MetadataListContext =
  createLayerScopedContext<MetadataListContextValue | null>(
    'MetadataListContext',
    1,
    null,
  );
MetadataListContext.displayName = 'MetadataListContext';
