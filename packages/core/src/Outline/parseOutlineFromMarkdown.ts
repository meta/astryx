// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file parseOutlineFromMarkdown.ts
 * @input Uses Markdown's canonical AST parser and heading slug helpers
 * @output Exports parseOutlineFromMarkdown for extracting heading outlines from Markdown
 * @position Pure compatibility utility; consumed by useOutlineFromMarkdown and public exports
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Outline/Outline.doc.mjs
 * - /packages/core/src/Outline/index.ts
 */

import {parseMarkdownAstInternal} from '../Markdown/parser';
import {projectMarkdownHeadings} from '../Markdown/headingProjection';
import {
  prepareMarkdownPlugins,
  reportMarkdownPluginFailure,
} from '../Markdown/plugins/protocol';
import type {
  MarkdownExtensionNode,
  MarkdownPluginEntry,
  PreparedMarkdownPlugins,
} from '../Markdown/plugins/protocol';
import type {OutlineItem} from './types';

/**
 * Extract heading items from a Markdown string.
 *
 * Uses Markdown's parser so fenced code blocks, tables, lists, and inline
 * formatting are interpreted consistently with rendered Markdown output.
 * Ids come from the parser's shared slug helpers, so they always match the
 * `id` attributes Markdown renders on its headings.
 */
export interface ParseOutlineFromMarkdownOptions<
  Node extends MarkdownExtensionNode = never,
> {
  readonly plugins?: ReadonlyArray<MarkdownPluginEntry<Node>>;
  /** Match Markdown's transform finality while content is streaming. */
  readonly isFinal?: boolean;
}

export function parseOutlineFromMarkdown<
  Node extends MarkdownExtensionNode = never,
>(
  markdown: string,
  options?: ParseOutlineFromMarkdownOptions<Node>,
): OutlineItem[] {
  let plugins = options?.plugins;
  let prepared: PreparedMarkdownPlugins | undefined;
  try {
    prepared = plugins == null ? undefined : prepareMarkdownPlugins(plugins);
  } catch (error) {
    reportMarkdownPluginFailure('configuration', 'transform', error);
    plugins = undefined;
  }
  const root = parseMarkdownAstInternal(
    markdown,
    {plugins},
    options?.isFinal ?? true,
  );
  return [...projectMarkdownHeadings(root, prepared).outline];
}
