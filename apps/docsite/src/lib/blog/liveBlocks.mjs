// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liveBlocks.mjs
 * @input A blog post's Markdown body.
 * @output The `tsx live` fence rule (spec:AST-033 FR22) and the static
 *   fallback the plain-text route serves in place of a running example.
 * @position Shared by BlogPostBody (which runs the blocks), the plain-text
 *   post route, and their tests.
 */

import {markdownSourceLinesPlugin} from '@astryxdesign/core/Markdown/plugins';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {visitMarkdownNodes} from '@astryxdesign/core/Markdown/utils';

/** The fenced-code language a live block declares. */
export const LIVE_BLOCK_LANGUAGE = 'tsx';

/** Whether a `tsx` fence's info string, after the language, marks it live. */
export function isLiveBlockMeta(meta) {
  return typeof meta === 'string' && meta.trim() === 'live';
}

/**
 * The body with every `tsx live` block shown as its source in an ordinary
 * `tsx` code block: the static fallback where nothing can run it. The blocks
 * are found by the same Markdown parser the page renders with, so the
 * fallback rewrites exactly the fences the page runs: inside blockquotes and
 * list items too, and never a fence quoted inside another block.
 *
 * @param {string} body
 * @returns {string}
 */
export function toStaticLiveBlocks(body) {
  const root = parseMarkdownAst(body, {plugins: [markdownSourceLinesPlugin]});
  /** 1-based source lines that open a live block. */
  const openers = new Set();
  visitMarkdownNodes(root, 'code', node => {
    if (
      node.lang === LIVE_BLOCK_LANGUAGE &&
      isLiveBlockMeta(node.meta) &&
      node.position?.start.line != null
    ) {
      openers.add(node.position.start.line);
    }
  });
  if (openers.size === 0) {
    return body;
  }
  return body
    .split('\n')
    .map((line, index) =>
      openers.has(index + 1)
        ? line.replace(/(`{3,}|~{3,})[ \t]*tsx[ \t]+live[ \t]*$/, '$1tsx')
        : line,
    )
    .join('\n');
}
