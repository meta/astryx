// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Avatar.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Avatar contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Avatar documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const avatar: NativeAdditions = {
  name: 'Avatar',
  baseTarget: 'root',
  callbacks: ['onClick'],
  sameMeaning: {onClick: 'a press, as in Compose'},
  // The named sizes every platform draws; the pixel sizes stay on the web.
  projections: {
    size: {xsm: 'xsm', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl'},
  },
  webOnly: {
    target: 'HTML link target',
    rel: 'HTML link relationship',
    status: 'holds AvatarStatusDot, which has no native view yet',
  },
};
