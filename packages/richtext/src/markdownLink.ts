// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownLink.ts
 * @input Uses @lexical/link and @lexical/markdown (LINK).
 * @output Exports LINK_KEEPING_DESTINATIONS, Lexical's link transformer with
 *   one change on export. Import is Lexical's own, which reads every
 *   CommonMark destination and title shape, an angle-bracket destination
 *   (`<https://e.com/a b>`) included, and decodes backslash escapes and
 *   character references in both. A destination that needs no escape is
 *   written by Lexical's export too, which escapes parentheses and an `&`
 *   that starts a character reference (`https://e.com/a_(b)` as
 *   `https://e.com/a_\(b\)`). One that holds whitespace or opens with `<`
 *   is written here in angle brackets, and one with a backslash or
 *   unbalanced parentheses with those escaped; both escape a
 *   reference-starting `&` as Lexical does, so every link reads back as
 *   the same link, whether it was imported or made in the editor
 *   (spec:AST-062 FR3).
 * @position Replaces Lexical's LINK in DEFAULT_TRANSFORMERS and in table
 *   cells (markdownTable.ts).
 */

import {$isAutoLinkNode, $isLinkNode} from '@lexical/link';
import {LINK, type TextMatchTransformer} from '@lexical/markdown';

/** Whether every `)` in `url` closes an earlier `(` and every `(` closes. */
function isBalanced(url: string): boolean {
  let depth = 0;
  for (const character of url) {
    if (character === '(') {
      depth++;
    } else if (character === ')') {
      depth--;
      if (depth < 0) {
        return false;
      }
    }
  }
  return depth === 0;
}

/**
 * `value` with every `&` that would start a character reference written as
 * `&#38;`, since import decodes references in a destination and a title.
 */
function escapeCharacterReferences(value: string): string {
  return value.replace(
    /&(?=#\d+;|#[Xx][\dA-Fa-f]+;|[A-Za-z][\dA-Za-z]*;)/g,
    '&#38;',
  );
}

/** `url` as a Markdown destination that reads back as `url`. */
export function markdownDestination(url: string): string {
  if (/\s/.test(url) || url.startsWith('<')) {
    // Only an angle-bracket destination may hold a space or open with `<`
    // (CommonMark §6.3).
    return `<${url.replace(/[\\<>]/g, '\\$&')}>`;
  }
  // A backslash before punctuation would read back as an escape, so every
  // backslash is written escaped; so is every parenthesis that does not
  // balance.
  return url.replace(isBalanced(url) ? /\\/g : /[\\()]/g, '\\$&');
}

export const LINK_KEEPING_DESTINATIONS: TextMatchTransformer = {
  // Lexical's own import reads every CommonMark destination and title shape,
  // an angle-bracket destination included.
  ...LINK,
  export: (node, exportChildren, exportFormat) => {
    if (!$isLinkNode(node) || $isAutoLinkNode(node)) {
      return null;
    }
    const url = node.getURL();
    const destination = markdownDestination(url);
    if (destination === url) {
      return LINK.export?.(node, exportChildren, exportFormat) ?? null;
    }
    const text = exportChildren(node);
    const written = escapeCharacterReferences(destination);
    const title = node.getTitle();
    return title == null || title === ''
      ? `[${text}](${written})`
      : `[${text}](${written} "${escapeCharacterReferences(title).replace(/([\\"])/g, '\\$1')}")`;
  },
};
