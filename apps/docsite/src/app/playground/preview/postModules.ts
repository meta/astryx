// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file postModules.ts
 * @input A blog post slug, and the generated `blogExampleAssets` loaders.
 * @output The post's own example assets as modules keyed by the relative
 *   specifier a live example imports them with (`./TarotCard`).
 * @position Preview frame only. A blog post's `tsx live` block
 *   (spec:AST-033 FR22) may import the demo material beside its Markdown file;
 *   each asset loads on demand, and a post resolves only its own assets.
 */

import {blogExampleAssets} from '@/generated/blogExampleAssets';
import type {LocalModules} from './runner';

export async function loadPostModules(post: string): Promise<LocalModules> {
  const loaders = Object.hasOwn(blogExampleAssets, post)
    ? blogExampleAssets[post]
    : undefined;
  if (loaders == null) {
    return {};
  }
  const entries = await Promise.all(
    Object.entries(loaders).map(
      async ([specifier, load]) =>
        [specifier, (await load()) as Record<string, unknown>] as const,
    ),
  );
  return Object.fromEntries(entries);
}
