// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useOutlineFromMarkdown.ts
 * @input Uses React, parseOutlineFromMarkdown, and optional Markdown plugins
 * @output Exports useOutlineFromMarkdown hook
 * @position Hook utility; consumed by applications and Outline examples
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Outline/Outline.doc.mjs
 * - /packages/core/src/Outline/index.ts
 */

import {useMemo} from 'react';
import {parseOutlineFromMarkdown} from './parseOutlineFromMarkdown';
import type {ParseOutlineFromMarkdownOptions} from './parseOutlineFromMarkdown';
import type {MarkdownExtensionNode} from '../Markdown/plugins/protocol';
import type {OutlineItem} from './types';

/** Extract a stable outline from a Markdown string. */
export function useOutlineFromMarkdown<
  Node extends MarkdownExtensionNode = never,
>(
  markdown: string,
  options?: ParseOutlineFromMarkdownOptions<Node>,
): OutlineItem[] {
  const plugins = options?.plugins;
  const isFinal = options?.isFinal;
  return useMemo(
    () =>
      parseOutlineFromMarkdown(markdown, {
        plugins,
        isFinal,
      }),
    [markdown, plugins, isFinal],
  );
}
