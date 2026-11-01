// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/VStack.ts
 * @input None
 * @output What @astryxdesign/native adds to the core VStack contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Stack documentation, which documents VStack
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';
import {STACK_SLOTS} from './stackShared.js';

export const vStack: NativeAdditions = {
  name: 'VStack',
  baseTarget: 'container',
  doc: {file: 'Stack', component: 'VStack'},
  slots: STACK_SLOTS,
  sameMeaning: {children: "the component's content, as on the web"},
};
