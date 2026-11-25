// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from TransferList.tsx, TransferListSelector.tsx, and
 *   tokens.stylex.ts
 * @output Exports TransferListSelector, TransferList, their prop types, and
 *   transferListVars
 * @position Entry point for @astryxdesign/core/TransferList; re-exported by
 *   /packages/core/src/index.ts and /packages/lab/src/TransferList/index.ts
 *
 * SYNC: When modified, update TransferList.doc.mjs, TransferListSelector.doc.mjs
 * and /packages/lab/src/TransferList/index.ts
 */

export {
  TransferList,
  type TransferListOption,
  type TransferListProps,
} from './TransferList';
export {
  TransferListSelector,
  type TransferListSelectorCommitBehavior,
  type TransferListSelectorProps,
} from './TransferListSelector';
export {transferListVars} from './tokens.stylex';
