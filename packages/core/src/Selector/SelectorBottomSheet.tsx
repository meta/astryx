// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectorBottomSheet.tsx
 * @input Uses SelectorBottomSheetFrame via lazy import
 * @output Lazy host for Selector and MultiSelector bottom sheets
 * @position Internal presentation host for selection controls
 */

import {lazy, Suspense} from 'react';
import {useIsHydrating} from '../hooks/useIsHydrating';
import type {SelectorBottomSheetProps} from './SelectorBottomSheetFrame';

export type {SelectorBottomSheetProps};

const LazySelectorBottomSheetFrame = lazy(async () =>
  import('./SelectorBottomSheetFrame').then(module => ({
    default: module.SelectorBottomSheetFrame,
  })),
);

export function SelectorBottomSheet(props: SelectorBottomSheetProps) {
  const isHydrating = useIsHydrating();
  if (isHydrating) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazySelectorBottomSheetFrame {...props} />
    </Suspense>
  );
}

SelectorBottomSheet.displayName = 'SelectorBottomSheet';
