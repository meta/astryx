// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from InputGroup.tsx, InputGroupText.tsx, InputGroupContext.ts
 * @output Exports InputGroup, InputGroupText, context hook, and types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 */

export {InputGroup} from './InputGroup';
export type {InputGroupProps, InputGroupSize} from './InputGroup';

export {InputGroupText} from './InputGroupText';
export type {InputGroupTextProps} from './InputGroupText';

export {useInputGroup} from './InputGroupContext';
export type {InputGroupContextValue} from './InputGroupContext';
