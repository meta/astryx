// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Selector.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Selector contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Selector documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const selector: NativeAdditions = {
  name: 'Selector',
  baseTarget: 'trigger',
  typeNames: {SelectorOption: 'SelectorOption'},
  types: {
    // The portable part of core's option data. Its rich description, icon,
    // and secondary control are web-only until typed slots exist.
    SelectorOption: {
      value: {type: {kind: 'string'}},
      label: {type: {kind: 'string'}, optional: true},
      disabled: {type: {kind: 'boolean'}, optional: true},
    },
  },
  webOnly: {
    presentation:
      'web presentation choice; native platforms use their own control (FR11)',
  },
  platforms: {
    ios: {
      menuStyle: {
        type: {kind: 'enum', values: ['popUp', 'pullDown']},
        optional: true,
      },
    },
    macos: {
      menuStyle: {
        type: {kind: 'enum', values: ['popUp', 'pullDown']},
        optional: true,
      },
    },
    android: {
      menuStyle: {
        type: {kind: 'enum', values: ['dropdown', 'bottomSheet']},
        optional: true,
      },
    },
  },
};
