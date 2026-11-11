// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from SegmentedControl component files
 * @output Exports SegmentedControl, SegmentedControlItem and their types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/SegmentedControl/SegmentedControl.doc.mjs
 */

export {SegmentedControl} from './SegmentedControl';
export type {SegmentedControlProps} from './SegmentedControl';

export {SegmentedControlItem} from './SegmentedControlItem';
export type {SegmentedControlItemProps} from './SegmentedControlItem';

export type {
  SegmentedControlSize,
  SegmentedControlLayout,
} from './SegmentedControlContext';
