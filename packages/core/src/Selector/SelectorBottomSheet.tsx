// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectorBottomSheet.tsx
 * @input Uses SelectorBottomSheetFrame through the shared module loader
 * @output Exports SelectorBottomSheet, the host of the Selector and
 *   MultiSelector bottom sheet, and loadSelectorBottomSheet, which the
 *   trigger's intent and the open call
 * @position Internal presentation host for selection controls
 *
 * The host renders nothing until the frame (BottomSheet, Section and
 * Heading) has loaded, so an open made before then shows the sheet once the
 * frame arrives. It renders nothing on the server or while the page
 * hydrates; the closed sheet has no visible markup.
 */

import {useSyncExternalStore, type ReactElement} from 'react';
import {warnOnce} from '../utils/devWarning';
import {createModuleLoader} from '../utils/moduleLoader';
import type * as FrameModule from './SelectorBottomSheetFrame';
import type {SelectorBottomSheetProps} from './SelectorBottomSheetFrame';

export type {SelectorBottomSheetProps};

const frame = createModuleLoader<typeof FrameModule>(
  async () => import('./SelectorBottomSheetFrame'),
  {
    onLoadFailure: () =>
      warnOnce(
        'selector:sheet-load-failed',
        'Selector',
        'The selection sheet could not load. The next open tries again.',
      ),
  },
);

const readFrame = (): typeof FrameModule | null => frame.loaded();
const readNoFrame = (): null => null;

/**
 * Loads the sheet frame and resolves whether it loaded. A failed load warns
 * once and is not kept, so the next intent or open asks again.
 */
export async function loadSelectorBottomSheet(): Promise<boolean> {
  return frame.tryLoad();
}

export function SelectorBottomSheet(
  props: SelectorBottomSheetProps,
): ReactElement | null {
  const loaded = useSyncExternalStore(frame.subscribe, readFrame, readNoFrame);
  if (loaded == null) {
    return null;
  }
  const {SelectorBottomSheetFrame} = loaded;
  return <SelectorBottomSheetFrame {...props} />;
}
