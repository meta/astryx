// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next transform manifest
 *
 * Staged codemods for the next release. The Version Packages PR promotes
 * this file into the resolved version folder.
 */

import migrateTouchTriggerTapToTriggerBehavior, {
  meta as migrateTouchTriggerTapToTriggerBehaviorMeta,
} from './migrate-touch-trigger-tap-to-trigger-behavior.mjs';

export default [
  {
    name: 'migrate-touch-trigger-tap-to-trigger-behavior',
    transform: migrateTouchTriggerTapToTriggerBehavior,
    meta: migrateTouchTriggerTapToTriggerBehaviorMeta,
  },
];
