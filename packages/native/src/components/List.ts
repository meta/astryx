// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/List.ts
 * @input None
 * @output What @astryxdesign/native adds to the core List contract
 * @position Native additions read by fromComponentDoc together with core's
 *   List documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const list: NativeAdditions = {
  name: 'List',
  doc: {file: 'List/List'},
  baseTarget: 'root',
  slots: {
    children: 'content',
    header: 'content',
  },
  sameMeaning: {children: "the list's rows, as on the web"},
  // `outset` and `bleed` reach a container's padding, which Swift
  // containers do not publish yet.
  projections: {edge: {padded: 'padded', flush: 'flush'}},
  webOnly: {
    edgeCompensation: 'deprecated on the web; `edge` replaces it',
  },
};
