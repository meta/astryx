// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports RadioList, RadioListItem components and types
 * @output Exports RadioList, RadioListProps, RadioListItem, RadioListItemProps
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header
 */

export {RadioList, RadioListContext} from './RadioList';
export type {
  RadioListProps,
  RadioListSize,
  RadioListContextValue,
} from './RadioList';
export {RadioListItem} from './RadioListItem';
export type {RadioListItemProps} from './RadioListItem';
