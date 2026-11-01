// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next transform manifest
 *
 * Staged codemods for the next release. The Version Packages PR promotes
 * this file into the resolved version folder.
 */

import migrateTouchTriggerTapToPressTrigger, {
  meta as migrateTouchTriggerTapToPressTriggerMeta,
} from './migrate-touch-trigger-tap-to-press-trigger.mjs';

export default [
  {
    name: 'migrate-touch-trigger-tap-to-press-trigger',
    transform: migrateTouchTriggerTapToPressTrigger,
    meta: migrateTouchTriggerTapToPressTriggerMeta,
  },
];
