// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Tokenizer component
 * @output Exports all Tokenizer module public API
 * @position Entry point for Tokenizer module
 *
 * SYNC: When adding new Tokenizer files, update exports here
 */

export {Tokenizer} from './Tokenizer';
export type {
  TokenizerProps,
  TokenizerSize,
  TokenizerOverflowBehavior,
  TokenizerPresentation,
  TokenizerChange,
  TokenizerHandle,
  TokenizerStatus,
  TokenizerStatusType,
} from './Tokenizer';
