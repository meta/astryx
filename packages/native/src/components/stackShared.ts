// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/stackShared.ts
 * @input None
 * @output The slot declarations HStack and VStack share
 * @position Read by components/HStack.ts and components/VStack.ts
 */

import type {SlotKind} from '../contract/fromComponentDoc.js';

export const STACK_SLOTS: Readonly<Record<string, SlotKind>> = {
  children: 'content',
};
