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
  // The Swift field applies only these types; search, tel and url stay in
  // the web contract.
  projections: {type: {text: 'text', password: 'password', email: 'email'}},
  webOnly: {
    autoComplete: 'HTML autocomplete attribute',
    // Touch-keyboard props join a native contract only where that platform's
    // field applies them.
    enterKeyHint:
      'touch-keyboard Return key label the Swift field does not apply',
    inputMode: 'touch keyboard choice the Swift field does not apply',
    autoCapitalize:
      'touch-keyboard capitalization the Swift field does not apply',
    hasAutoCorrect:
      'touch-keyboard autocorrection the Swift field does not apply',
    hasSpellCheck: 'spell-check marking the Swift field does not apply',
  },
};
