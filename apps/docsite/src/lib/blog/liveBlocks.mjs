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

// A line's container prefix (blockquote markers and list-item markers, with
// their indentation), then a possible fence: its run of backticks or tildes
// and the rest of the line.
const FENCE_LINE =
  /^((?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?[ \t]*)(`{3,}|~{3,})(.*)$/;

/**
 * The body with every `tsx live` block shown as its source in an ordinary
 * `tsx` code block: the static fallback where nothing can run it. Fences are
 * read the way the page reads them: inside a blockquote or a list item too,
 * and nothing inside another fenced block (a longer fence quoting the syntax)
 * changes.
 *
 * @param {string} body
 * @returns {string}
 */
export function toStaticLiveBlocks(body) {
  /** The fence that opened the block we are inside, or null. */
  let open = null;
  return body
    .split('\n')
    .map(line => {
      const match = FENCE_LINE.exec(line);
      if (open != null) {
        // Inside a block: only a closing fence (same character, at least as
        // long, nothing after it) ends it; nothing else is rewritten.
        if (
          match != null &&
          match[2][0] === open[0] &&
          match[2].length >= open.length &&
          match[3].trim() === ''
        ) {
          open = null;
        }
        return line;
      }
      if (match == null) {
        return line;
      }
      const [, prefix, fence, info] = match;
      // A backtick fence's info string cannot hold a backtick.
      if (fence[0] === '`' && info.includes('`')) {
        return line;
      }
      open = fence;
      const words = info.trim().split(/\s+/);
      if (
        words[0] === LIVE_BLOCK_LANGUAGE &&
        isLiveBlockMeta(words.slice(1).join(' '))
      ) {
        return `${prefix}${fence}${LIVE_BLOCK_LANGUAGE}`;
      }
      return line;
    })
    .join('\n');
}
