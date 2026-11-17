// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Thumbnail.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Thumbnail contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Thumbnail documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const thumbnail: NativeAdditions = {
  name: 'Thumbnail',
  baseTarget: 'root',
  callbacks: ['onClick', 'onRemove'],
  sameMeaning: {onClick: 'a press, as in Compose'},
  webOnly: {
    'data-testid': 'web test selector; native platforms use the base id',
  },
};
