// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from CodeBlock.tsx, Code.tsx, tokenizer.ts, highlightRanges.ts, highlightStyles.ts
 * @output Exports CodeBlock, Code components, tokenizer utilities, and highlight APIs
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update /packages/core/src/CodeBlock/CodeBlock.doc.mjs
 */

export {CodeBlock} from './CodeBlock';
export type {CodeBlockProps} from './CodeBlock';
export {createCodeLanguage} from './grammar';
export type {
  CodeLanguage,
  CodeLanguageToken,
  CodeLanguageTokenize,
  CreateCodeLanguageOptions,
} from './grammar';

export {Code} from '../Code';
export type {CodeProps, CodeColor, CodeSize} from '../Code';

export {
  tokenize,
  tokenizeAsync,
  tokenizeStreaming,
  flatTokensToLines,
  SYNC_TOKENIZE_THRESHOLD,
} from './tokenizer';
export type {SyntaxToken, TokenLine} from './tokenizer';

export {
  applyHighlightRangesChunked,
  applyHighlightRangesBatch,
  applyHighlightRangesFlat,
  cleanupRanges,
} from './highlightRanges';
export {ensureHighlightStyles, TOKEN_TYPES} from './highlightStyles';
