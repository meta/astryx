// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Badge.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Badge contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Badge documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const badge: NativeAdditions = {
  name: 'Badge',
  baseTarget: 'root',
  // `icon` stays web-only until the core has an icon slot.
  slots: {label: 'text'},
};
