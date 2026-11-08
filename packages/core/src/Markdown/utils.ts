// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file utils.ts
 * @output Server-safe exports for Markdown parsing and AST traversal
 * @position Subpath entry point: `@astryxdesign/core/Markdown/utils`
 */

export {visitMarkdownNodes} from './ast';
export type {
  MarkdownAstExtensionNode,
  MarkdownAstPhrasingContent,
  MarkdownAstBlockContent,
  MarkdownAstRoot,
  MarkdownAstNodeMap,
  MarkdownAstNode,
} from './ast';

export {
  parseMarkdown,
  parseInline,
  parseMarkdownIncremental,
  createIncrementalState,
  trimStreamingArtifacts,
} from './parser';

export type {
  InlineNode,
  InlineNodeWithMath,
  MathInlineNode,
  BlockNode,
  BlockNodeWithMath,
  MathBlockNode,
  ListItemNode,
  TableCellNode,
  TableAlignment,
  ParseOptions,
  MathParseOptions,
  IncrementalParseOptions,
  IncrementalMathParseOptions,
  IncrementalState,
} from './parser';
