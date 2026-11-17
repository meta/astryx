// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/AvatarStatusDot.ts
 * @input None
 * @output What @astryxdesign/native adds to the core AvatarStatusDot contract
 * @position Native additions read by fromComponentDoc together with core's
 *   AvatarStatusDot documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const avatarStatusDot: NativeAdditions = {
  name: 'AvatarStatusDot',
  doc: {file: 'Avatar/AvatarStatusDot'},
  baseTarget: 'root',
  webOnly: {
    icon: 'free-form content; a native icon needs the shared icon-name slot',
  },
};
