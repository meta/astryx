// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Card.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Card contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Card documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const card: NativeAdditions = {
  name: 'Card',
  baseTarget: 'container',
  slots: {children: 'content'},
  sameMeaning: {children: "the component's content, as on the web"},
};
