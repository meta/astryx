// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.test.ts
 * @input The Lab TransferList entry and the Core components
 * @output Tests that the Lab entry re-exports the Core components, their
 *   props, and transferListVars
 * @position Testing; validates index.ts
 */

import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  TransferList as CoreTransferList,
  TransferListSelector as CoreTransferListSelector,
  transferListVars as coreTransferListVars,
  type TransferListOption as CoreTransferListOption,
  type TransferListProps as CoreTransferListProps,
  type TransferListSelectorCommitBehavior as CoreTransferListSelectorCommitBehavior,
  type TransferListSelectorProps as CoreTransferListSelectorProps,
} from '@astryxdesign/core/TransferList';
import {
  TransferList,
  TransferListSelector,
  transferListVars,
  type TransferListOption,
  type TransferListProps,
  type TransferListSelectorCommitBehavior,
  type TransferListSelectorProps,
} from './index';

describe('Lab TransferList', () => {
  it('is the Core components and layout variables', () => {
    expect(TransferList).toBe(CoreTransferList);
    expect(TransferListSelector).toBe(CoreTransferListSelector);
    expect(transferListVars).toBe(coreTransferListVars);
  });

  it('takes the Core props', () => {
    expectTypeOf<TransferListProps>().toEqualTypeOf<CoreTransferListProps>();
    expectTypeOf<TransferListSelectorProps>().toEqualTypeOf<CoreTransferListSelectorProps>();
    expectTypeOf<TransferListOption>().toEqualTypeOf<CoreTransferListOption>();
    expectTypeOf<TransferListSelectorCommitBehavior>().toEqualTypeOf<CoreTransferListSelectorCommitBehavior>();
  });
});
