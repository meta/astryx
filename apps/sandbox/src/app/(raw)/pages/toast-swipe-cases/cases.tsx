// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file cases.tsx
 * @input A case id from caseIds.ts
 * @output The case: a top toast to swipe up and away, to turn back, or to
 *   pull past where it started
 * @position The Toast swipe cases page's content.
 */

import {useEffect, useRef} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {ToastViewport, useToast} from '@astryxdesign/core/Toast';
import type {ToastDismissFn} from '@astryxdesign/core/Toast';
import type {ToastSwipeCaseId} from './caseIds';

const BODIES: Readonly<Record<ToastSwipeCaseId, string>> = {
  'swipe-away': 'Swipe this toast up and away.',
  'turn-back': 'Drag this toast up, then back down before you lift.',
  'pull-away':
    'Drag this toast up a little, then pull it down past where it started.',
};

function ShowToast({id}: {id: ToastSwipeCaseId}) {
  const toast = useToast();
  // The case's one toast. Showing it again replaces it.
  const dismissRef = useRef<ToastDismissFn | null>(null);
  // Synchronizes the toast system with the case: leaving the case dismisses
  // its toast.
  useEffect(() => () => dismissRef.current?.(), []);
  return (
    <Button
      label="Show the toast"
      onClick={() => {
        dismissRef.current = toast({
          body: BODIES[id],
          uniqueID: 'toast-swipe-case',
          isAutoHide: false,
        });
      }}
    />
  );
}

export function ToastSwipeCase({id}: {id: ToastSwipeCaseId}) {
  return (
    <ToastViewport position="topEnd">
      <ShowToast id={id} />
    </ToastViewport>
  );
}
