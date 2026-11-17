// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/ProgressBar.ts
 * @input None
 * @output What @astryxdesign/native adds to the core ProgressBar contract
 * @position Native additions read by fromComponentDoc together with core's
 *   ProgressBar documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const progressBar: NativeAdditions = {
  name: 'ProgressBar',
  baseTarget: 'root',
};
