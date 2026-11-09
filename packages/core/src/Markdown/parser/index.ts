// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Markdown source and public parser options
 * @output Server-safe legacy and canonical Markdown parser entry points and types,
 *   and the character reference decoder Markdown renders with
 * @position Public subpath entry point: `@astryxdesign/core/Markdown/parser`
 */

export {
  createIncrementalState,
  decodeMarkdownCharacterReferences,
  parseInline,
  parseInlineAst,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
} from '../parser';
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
} from '../parser';
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
} from '../ast';
