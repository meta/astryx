// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Item.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Item contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Item documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const item: NativeAdditions = {
  name: 'Item',
  doc: {file: 'Item/Item', component: 'Item'},
  baseTarget: 'root',
  slots: {
    label: 'text',
    description: 'text',
    marker: 'content',
    startContent: 'content',
    endContent: 'content',
  },
  callbacks: ['onClick'],
  sameMeaning: {onClick: 'a press, as in Compose'},
  webOnly: {
    target: 'HTML link target',
    rel: 'HTML link relationship',
    'data-testid': 'web test selector; native platforms use the base id',
    swipeActions:
      "a native platform's swipe actions work only inside its own scrolling list, so a row elsewhere could not honor them",
    swipeBehavior: 'applies only with swipeActions',
  },
};
