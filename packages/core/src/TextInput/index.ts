// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports TextInput component and types from TextInput.tsx
 * @output Exports TextInput, TextInputProps, TextInputSize, TextInputStatus, TextInputStatusType
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/TextInput/TextInput.doc.mjs
 */

export {TextInput} from './TextInput';
export type {
  TextInputProps,
  TextInputType,
  TextInputSize,
  TextInputStatus,
  TextInputStatusType,
} from './TextInput';
