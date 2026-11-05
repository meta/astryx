// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/HStack.ts
 * @input None
 * @output What @astryxdesign/native adds to the core HStack contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Stack documentation, which documents HStack
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';
import {STACK_SLOTS} from './stackShared.js';

export const hStack: NativeAdditions = {
  name: 'HStack',
  baseTarget: 'container',
  doc: {file: 'Stack', component: 'HStack'},
  slots: STACK_SLOTS,
  sameMeaning: {children: "the component's content, as on the web"},
};
