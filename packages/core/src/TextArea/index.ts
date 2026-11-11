// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports TextArea component and types from TextArea.tsx
 * @output Exports TextArea, TextAreaProps, TextAreaStatus, TextAreaStatusType
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/TextArea/TextArea.doc.mjs
 */

export {TextArea} from './TextArea';
export type {
  TextAreaProps,
  TextAreaStatus,
  TextAreaStatusType,
  TextAreaSize,
} from './TextArea';
