// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file transferListBusy.ts
 * @input Whether the selector around a TransferList has a change pending
 * @output TransferListBusyContext, which TransferListSelector provides and
 *   TransferList reads
 * @position Internal to the TransferList directory. The package does not
 *   export it, so the public props of both components do not change.
 */

import {createSharedContext} from '@astryxdesign/core/internal/shared-context';

/**
 * True while the list's owner has a change pending and refuses the next one.
 * Without a provider, the list is never busy.
 */
export const TransferListBusyContext = createSharedContext<boolean>(
  'TransferListBusyContext',
  1,
  false,
);
