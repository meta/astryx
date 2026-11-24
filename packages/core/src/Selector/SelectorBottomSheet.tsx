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
 * first intent: a pointer down, focus, or an open request. The host renders
 * nothing until the frame has loaded, and then renders it directly, with no
 * suspended render. An open that comes before the load ends stays requested,
 * so the sheet opens once when the frame arrives.
 *
 * The host renders nothing on the server or in the render that hydrates
 * server HTML (spec:AST-013 FR9). The closed sheet has no visible markup.
 */

import {useSyncExternalStore, type ReactElement} from 'react';
import {createModuleLoader} from '../utils/moduleLoader';
import type * as FrameModule from './SelectorBottomSheetFrame';
import type {SelectorBottomSheetProps} from './SelectorBottomSheetFrame';

export type {SelectorBottomSheetProps};

const frame = createModuleLoader<typeof FrameModule>(
  async () => import('./SelectorBottomSheetFrame'),
);

// Hosts that wait for the frame. Each one renders again when it arrives.
const frameListeners = new Set<() => void>();
let pendingFrame: Promise<void> | null = null;

function subscribeToFrame(listener: () => void): () => void {
  frameListeners.add(listener);
  return () => {
    frameListeners.delete(listener);
  };
}

const readFrame = (): typeof FrameModule | null => frame.loaded();
const readNoFrame = (): null => null;

/**
 * Starts loading the sheet frame. The trigger's intent and the open call it.
 * A failed load is not kept, so the next intent or open asks again.
 */
export function preloadSelectorBottomSheet(): void {
  pendingFrame ??= frame.load().then(
    () => {
      for (const listener of frameListeners) {
        listener();
      }
    },
    () => {
      pendingFrame = null;
    },
  );
}

export function SelectorBottomSheet(
  props: SelectorBottomSheetProps,
): ReactElement | null {
  const loaded = useSyncExternalStore(subscribeToFrame, readFrame, readNoFrame);
  if (loaded == null) {
    return null;
  }
  const {SelectorBottomSheetFrame} = loaded;
  return <SelectorBottomSheetFrame {...props} />;
}
