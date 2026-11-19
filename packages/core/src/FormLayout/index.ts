// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Uses FormLayout, FormLayoutContext
 * @output Re-exports public API for FormLayout
 * @position Entry point for FormLayout module
 *
 * SYNC: When modified, update these files to stay in sync:
 */

export {FormLayout} from './FormLayout';
export type {FormLayoutProps} from './FormLayout';
export type {
  EntryErrorBehavior,
  FormLayoutDirection,
  FormOptionality,
} from './FormLayoutContext';
export {FormLayoutContext} from './FormLayoutContext';
