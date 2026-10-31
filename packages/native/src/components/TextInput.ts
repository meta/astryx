// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/TextInput.ts
 * @input None
 * @output What @astryxdesign/native adds to the core TextInput contract
 * @position Native additions read by fromComponentDoc together with core's
 *   TextInput documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const textInput: NativeAdditions = {
  name: 'TextInput',
  // family:input-fields routes base props to the primary semantic control.
  baseTarget: 'control',
  webOnly: {
    autoComplete: 'HTML autocomplete attribute',
  },
};
