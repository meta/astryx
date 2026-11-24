// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectorBottomSheet.tsx
 * @input Uses SelectorBottomSheetFrame through the shared module loader
 * @output Exports SelectorBottomSheet, the host of the Selector and
 *   MultiSelector bottom sheet, and preloadSelectorBottomSheet, which the
 *   trigger's intent calls
 * @position Internal presentation host for selection controls
 *
 * The sheet frame (BottomSheet, Section and Heading) loads on the trigger's
 * first intent: a pointer down, focus, or an open request. Once it has
 * loaded, the host renders it directly, with no suspended render. An open
 * that comes before the load ends waits for it and then opens once.
 *
 * The host renders nothing on the server or in the render that hydrates
 * server HTML (spec:AST-013 FR9). The closed sheet has no visible markup.
 */

import {Suspense, use, type ReactElement} from 'react';
import {useIsHydrating} from '../hooks/useIsHydrating';
import {createModuleLoader} from '../utils/moduleLoader';
import type * as FrameModule from './SelectorBottomSheetFrame';
import type {SelectorBottomSheetProps} from './SelectorBottomSheetFrame';

export type {SelectorBottomSheetProps};

const frame = createModuleLoader<typeof FrameModule>(
  async () => import('./SelectorBottomSheetFrame'),
);

// One promise for `use()` while the load runs, so a render that waits again
// reads the same promise. A failed load is not kept.
let pendingFrame: Promise<typeof FrameModule> | null = null;
function frameLoad(): Promise<typeof FrameModule> {
  pendingFrame ??= frame.load().catch((error: unknown) => {
    pendingFrame = null;
    throw error;
  });
  return pendingFrame;
}

/**
 * Starts loading the sheet frame. The trigger calls it on intent. A failed
 * load is not kept, so the next intent or the open asks again.
 */
export function preloadSelectorBottomSheet(): void {
  frameLoad().catch(() => {});
}

function SelectorBottomSheetHost(
  props: SelectorBottomSheetProps,
): ReactElement | null {
  const loaded = frame.loaded();
  if (loaded == null && !props.isOpen) {
    return null;
  }
  const {SelectorBottomSheetFrame} = loaded ?? use(frameLoad());
  return <SelectorBottomSheetFrame {...props} />;
}

export function SelectorBottomSheet(
  props: SelectorBottomSheetProps,
): ReactElement | null {
  if (useIsHydrating()) {
    return null;
  }
  // The same boundary wraps the host before and after the load, so the
  // frame never remounts when its module arrives.
  return (
    <Suspense fallback={null}>
      <SelectorBottomSheetHost {...props} />
    </Suspense>
  );
}
