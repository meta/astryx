// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Button.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Button contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Button documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const button: NativeAdditions = {
  name: 'Button',
  baseTarget: 'root',
  callbacks: ['onClick'],
  sameMeaning: {onClick: 'a press, as in Compose'},
  projections: {width: {content: 'auto', fill: '100%'}},
  webOnly: {
    type: 'HTML form submission type',
    name: 'HTML form field name',
    form: 'HTML form owner',
    target: 'HTML link target',
    rel: 'HTML link relationship',
    isIconOnly: 'needs an icon, which has no core slot yet',
  },
};
