// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/ListItem.ts
 * @input None
 * @output What @astryxdesign/native adds to the core ListItem contract
 * @position Native additions read by fromComponentDoc together with core's
 *   ListItem documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const listItem: NativeAdditions = {
  name: 'ListItem',
  doc: {file: 'List/ListItem'},
  baseTarget: 'root',
  slots: {
    label: 'text',
    description: 'text',
    startContent: 'content',
    endContent: 'content',
  },
  callbacks: ['onClick'],
  sameMeaning: {onClick: 'a press, as in Compose'},
  webOnly: {
    target: 'HTML link target',
    rel: 'HTML link relationship',
    swipeActions:
      "a native platform's swipe actions work only inside its own scrolling list, so a row elsewhere could not honor them",
    swipeBehavior: 'applies only with swipeActions',
  },
};
