// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @output Public Markdown plugin protocol, factory, and types
 * @position Subpath entry point: `@astryxdesign/core/Markdown/plugins`
 */

export {
  createMarkdownPlugin,
  getMarkdownPluginCapabilities,
  isMarkdownExtensionNode,
} from './protocol';
export {createMarkdownTextTransform} from './textTransform';
export type {
  MarkdownTextTransformContext,
  MarkdownTextTransformOptions,
} from './textTransform';
export {createMarkdownFenceTransform} from './semanticFence';
export type {
  MarkdownFenceContext,
  MarkdownFenceNode,
  MarkdownFenceTransformOptions,
} from './semanticFence';
export {
  createMarkdownSourceDecoration,
  getMarkdownSourceDecorations,
} from './sourceDecoration';
export type {
  MarkdownSourceDecoration,
  MarkdownSourceDecorationOptions,
  MarkdownSourceDecorationRange,
} from './sourceDecoration';
export {createMarkdownFrontmatter} from './frontmatter';
export {markdownSoftBreaksPlugin} from './softBreaks';
export {markdownSourceLinesPlugin} from './sourceLines';
export {createMarkdownHeadingLinks} from './headingLinks';
export type {MarkdownHeadingLinksOptions} from './headingLinks';
export type {
  MarkdownFrontmatter,
  MarkdownFrontmatterOptions,
  MarkdownFrontmatterParseResult,
} from './frontmatter';
export type {
  MarkdownPluginCapabilities,
  MarkdownPluginData,
  MarkdownExtensionNode,
  MarkdownTokenizerInput,
  MarkdownTokenizeResult,
  MarkdownSyntaxContribution,
  MarkdownSyntaxCapability,
  MarkdownTransformContext,
  MarkdownTransform,
  MarkdownExtensionRenderer,
  MarkdownExtensionRenderers,
  MarkdownSyntaxPluginDefinition,
  MarkdownTransformPluginDefinition,
  MarkdownPluginDefinition,
  MarkdownPluginEntry,
  MarkdownNodeOf,
  MarkdownExtensionsOf,
} from './protocol';
