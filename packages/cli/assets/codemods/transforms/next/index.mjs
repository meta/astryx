// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next transform manifest
 *
 * Staged codemods for the next release. The Version Packages PR promotes
 * this file into the resolved version folder.
 */

import migrateItemSwipeActionsToSwipe, {
  meta as migrateItemSwipeActionsToSwipeMeta,
} from './migrate-item-swipe-actions-to-swipe.mjs';
import preserveChatRadius, {
  meta as preserveChatRadiusMeta,
} from './preserve-chat-radius.mjs';

export default [
  {
    name: 'migrate-item-swipe-actions-to-swipe',
    transform: migrateItemSwipeActionsToSwipe,
    meta: migrateItemSwipeActionsToSwipeMeta,
  },
  {
    name: 'preserve-chat-radius',
    transform: preserveChatRadius,
    meta: preserveChatRadiusMeta,
  },
];
