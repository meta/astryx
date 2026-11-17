// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Switch.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Switch contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Switch documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const switchControl: NativeAdditions = {
  name: 'Switch',
  // The web Switch forwards base props to its root wrapper.
  baseTarget: 'root',
  // Apple switch rows follow the system toggle layout, label leading and
  // system spacing (Swift component API A2); Android and Windows keep both
  // props until a ruling covers them.
  onlyOn: {
    labelPosition: {
      platforms: ['android', 'windows'],
      reason: 'Apple rows follow the system toggle layout (component API A2)',
    },
    labelSpacing: {
      platforms: ['android', 'windows'],
      reason: "Apple rows use the system's spacing (component API A2)",
    },
  },
};
