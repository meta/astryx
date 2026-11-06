// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file AvatarGroupContext.ts
 * @input Layer-scoped React context
 * @output Exports AvatarGroup context and useAvatarGroup hook
 * @position Shared context; consumed by children for group-aware styling
 */

import {use} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';
import type {AvatarShape, AvatarSize} from '../Avatar';

export interface AvatarGroupContextValue {
  size: AvatarSize;
  shape: AvatarShape;
  overlap: number;
  numericSize: number;
}

export const AvatarGroupContext = createContext<AvatarGroupContextValue | null>(
  null,
);
AvatarGroupContext.displayName = 'AvatarGroupContext';

export function useAvatarGroup(): AvatarGroupContextValue | null {
  return use(AvatarGroupContext);
}
