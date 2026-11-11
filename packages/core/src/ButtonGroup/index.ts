// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from ButtonGroup.tsx and ButtonGroupContext.ts
 * @output Exports ButtonGroup, context hook, and types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 */

export {ButtonGroup} from './ButtonGroup';
export type {ButtonGroupProps} from './ButtonGroup';

export {useButtonGroup} from './ButtonGroupContext';
export type {
  ButtonGroupOrientation,
  ButtonGroupContextValue,
} from './ButtonGroupContext';
