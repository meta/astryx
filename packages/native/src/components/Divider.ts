// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Divider.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Divider contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Divider documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const divider: NativeAdditions = {
  name: 'Divider',
  baseTarget: 'root',
  slots: {label: 'text'},
};
