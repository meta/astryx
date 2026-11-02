// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liveBlocks.mjs
 * @input A blog post's Markdown body.
 * @output The `tsx live` fence rule (spec:AST-033 FR22) and the static
 *   fallback the plain-text route serves in place of a running example.
 * @position Shared by BlogPostBody (which runs the blocks), the plain-text
 *   post route, and their tests.
 */

/** The fenced-code language a live block declares. */
export const LIVE_BLOCK_LANGUAGE = 'tsx';

/** Whether a `tsx` fence's info string, after the language, marks it live. */
export function isLiveBlockMeta(meta) {
  return typeof meta === 'string' && meta.trim() === 'live';
}

// A fence opener (up to three spaces of indent, three or more backticks or
// tildes) whose info string is exactly `tsx live`.
const LIVE_FENCE_OPENER = /^( {0,3})(`{3,}|~{3,})[ \t]*tsx[ \t]+live[ \t]*$/gm;

/**
 * The body with every `tsx live` block shown as its source in an ordinary
 * `tsx` code block: the static fallback where nothing can run it.
 *
 * @param {string} body
 * @returns {string}
 */
export function toStaticLiveBlocks(body) {
  return body.replace(LIVE_FENCE_OPENER, '$1$2tsx');
}
