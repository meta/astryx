// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferList re-export
 * @input `@astryxdesign/core/TransferList`
 * @output Re-exports TransferListSelector, TransferList, their prop types, and
 *   transferListVars from Core
 * @position Lab entry for callers that import the transfer list from Lab;
 *   consumed by packages/lab/src/index.ts
 */

export {
  TransferList,
  TransferListSelector,
  transferListVars,
} from '@astryxdesign/core/TransferList';
export type {
  TransferListOption,
  TransferListProps,
  TransferListSelectorCommitBehavior,
  TransferListSelectorProps,
} from '@astryxdesign/core/TransferList';
