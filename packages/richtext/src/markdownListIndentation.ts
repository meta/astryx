// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownListIndentation.ts
 * @input Markdown source text.
 * @output Exports normalizeListIndentation, which rewrites the indentation of
 *   every list item line so its nesting reads the same to Lexical as it does
 *   to CommonMark.
 * @position Used by markdownSource.ts on the text it imports (never on the
 *   bytes it records). Lexical nests a list item one level per four spaces or
 *   one tab; CommonMark nests an item under the item whose content it is
 *   indented to, so `- a` / `  - b` (two spaces) and `1. a` / `   1. b`
 *   (three) are nested lists that Lexical would flatten (spec:AST-061 FR5).
 */

/** A list item line: indentation, marker, and the spaces after it. */
const LIST_ITEM = /^([ \t]*)([-+*]|\d{1,9}[.)])( {1,4}|\t|$)/;
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const BLANK_LINE = /^[ \t]*\r?$/;
/** A thematic break after its indentation: three or more of one marker. */
const THEMATIC_BREAK_CONTENT = /^([-*_])(?:[ \t]*\1){2,}[ \t]*\r?$/;

/** Columns of leading whitespace, with tabs stopping every four columns. */
function columnsOf(whitespace: string): number {
  let columns = 0;
  for (const character of whitespace) {
    columns = character === '\t' ? columns + 4 - (columns % 4) : columns + 1;
  }
  return columns;
}

/**
 * Rewrites each list item line's indentation as four spaces per CommonMark
 * nesting level, leaving every other line, and every line inside fenced code,
 * as it is. The line count and every line's content after its indentation
 * are unchanged.
 */
export function normalizeListIndentation(markdown: string): string {
  const lines = markdown.split('\n');
  // The content column of each open list item, outermost first.
  const open: Array<number> = [];
  let fence: string | null = null;
  let afterBlankLine = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence != null) {
      if (
        new RegExp(`^[ \\t]*${fence[0]}{${fence.length},}[ \\t]*\\r?$`).test(
          line,
        )
      ) {
        fence = null;
      }
      continue;
    }
    if (BLANK_LINE.test(line)) {
      afterBlankLine = true;
      continue;
    }
    const leading = /^[ \t]*/.exec(line)?.[0] ?? '';
    const indent = columnsOf(leading);
    if (THEMATIC_BREAK_CONTENT.test(line.slice(leading.length))) {
      // A thematic break, never an item, even where an item could start
      // (CommonMark 0.31 §4.1). Lexical shows it only as a block of its own,
      // so a break inside an item loses its indentation and reads as one.
      while (open.length > 0 && indent < open[open.length - 1]) {
        open.pop();
      }
      if (open.length > 0) {
        lines[index] = line.slice(leading.length);
      }
      afterBlankLine = false;
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item == null) {
      const opening = FENCE_OPEN.exec(line);
      if (opening != null) {
        fence = opening[1];
      }
      // A line after a blank line belongs to the items it is indented into;
      // without a blank line it continues the last item's paragraph lazily.
      if (afterBlankLine) {
        while (open.length > 0 && indent < open[open.length - 1]) {
          open.pop();
        }
      }
      afterBlankLine = false;
      continue;
    }
    afterBlankLine = false;
    // An item nests under every open item whose content it reaches.
    while (open.length > 0 && indent < open[open.length - 1]) {
      open.pop();
    }
    const depth = open.length;
    // The content column, counted across the whole prefix so a tab after
    // the marker stops at the right column; a marker that ends the line has
    // its content one column after it.
    const markerEnd = columnsOf(item[0]) + (item[3] === '' ? 1 : 0);
    open.push(markerEnd);
    lines[index] = ' '.repeat(depth * 4) + line.slice(item[1].length);
  }
  return lines.join('\n');
}
