// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @output Exports Markdown component, canonical and compatibility parser functions,
 *   the character reference decoder, and types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 */

export {visitMarkdownNodes} from './ast';
export type {
  MarkdownAstPoint,
  MarkdownAstDataValue,
  MarkdownAstPosition,
  MarkdownAstNodeBase,
  MarkdownAstExtensionNode,
  MarkdownAstText,
  MarkdownAstInlineCode,
  MarkdownAstInlineMath,
  MarkdownAstLink,
  MarkdownAstImage,
  MarkdownAstCitation,
  MarkdownAstBreak,
  MarkdownAstPhrasingContent,
  MarkdownAstHeading,
  MarkdownAstParagraph,
  MarkdownAstCode,
  MarkdownAstMath,
  MarkdownAstBlockquote,
  MarkdownAstList,
  MarkdownAstListItem,
  MarkdownAstTable,
  MarkdownAstTableRow,
  MarkdownAstTableCell,
  MarkdownAstThematicBreak,
  MarkdownAstBlockContent,
  MarkdownAstRoot,
  MarkdownAstNodeMap,
  MarkdownAstNode,
} from './ast';

export {Markdown} from './Markdown';
export type {
  MarkdownProps,
  MarkdownSource,
  MarkdownComponents,
  MarkdownInlinePlugin,
  MarkdownSourceLines,
} from './Markdown';

export {
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
  createIncrementalState,
  parseInline,
  parseInlineAst,
} from './parser';
export {decodeMarkdownCharacterReferences} from './characterReferences';
export type {
  BlockNode,
  BlockNodeWithMath,
  MathBlockNode,
  InlineNode,
  InlineNodeWithMath,
  MathInlineNode,
  SourceRange,
  ListItemNode,
  TableCellNode,
  TableAlignment,
  ParseOptions,
  MathParseOptions,
  IncrementalParseOptions,
  IncrementalMathParseOptions,
  IncrementalState as IncrementalParseState,
} from './parser';
