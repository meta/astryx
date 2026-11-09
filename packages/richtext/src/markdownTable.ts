// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownTable.ts
 * @input Uses @lexical/markdown (multiline element transformer, inline text
 *   transformers) and the @lexical/table nodes.
 * @output Exports TABLE, the GFM pipe-table transformer, and DEFAULT_TRANSFORMERS,
 *   the editor's default Markdown transformers (Lexical's standard set plus TABLE).
 * @position Internal to @astryxdesign/richtext. RichTextEditor.tsx (shortcuts,
 *   getMarkdown) and markdownSerializers.ts (headless import/export) default to
 *   DEFAULT_TRANSFORMERS so tables import, edit, and export the same way.
 *
 * SYNC: Table recognition mirrors core Markdown's parser (a line with a pipe
 * followed by a delimiter row; body rows continue while they contain a pipe),
 * so the same source is a table on both surfaces. Keep the two in step.
 */

import {
  $convertFromMarkdownString,
  CODE,
  HEADING,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  LINK,
  ORDERED_LIST,
  QUOTE,
  TRANSFORMERS,
  type MultilineElementTransformer,
  type Transformer,
} from '@lexical/markdown';
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table';
import type {ElementFormatType} from 'lexical';
import {HARD_LINE_BREAK} from './markdownHardLineBreak';
import {THEMATIC_BREAK} from './markdownThematicBreak';
import {HEADING_MARKERS} from './markdownHeading';
import {QUOTE_MARKERS} from './markdownQuote';
import {LIST_EXPORT} from './markdownListExport';
import {TASK_LIST} from './markdownTaskList';
import {ORDERED_LIST_KEEPING_START} from './markdownOrderedList';
import {LINK_KEEPING_DESTINATIONS} from './markdownLink';
import {BACKTICK_CODE, TILDE_CODE} from './markdownCodeFence';
import {$convertToMarkdownKeepingTimeLinear} from './markdownSpaceRuns';

/**
 * Cells hold inline Markdown only, so they are imported and exported with the
 * inline transformers.
 */
const CELL_TRANSFORMERS: Array<Transformer> = [
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS.map(transformer =>
    transformer === LINK ? LINK_KEEPING_DESTINATIONS : transformer,
  ),
];

type ColumnAlignment = 'left' | 'center' | 'right' | null;

/**
 * Splits a row into trimmed cell sources: the row's indentation, one leading
 * pipe, trailing spaces, and one trailing pipe are dropped, and the rest
 * splits on unescaped pipes. An escaped pipe stays escaped for the cell's
 * inline import.
 */
function splitTableRow(line: string): Array<string> {
  let start = 0;
  let end = line.length;
  while (start < end && (line[start] === ' ' || line[start] === '\t')) {
    start++;
  }
  if (line[start] === '|') {
    start++;
    while (start < end && line[start] === ' ') {
      start++;
    }
  }
  while (end > start && line[end - 1] === ' ') {
    end--;
  }
  if (end > start && line[end - 1] === '|') {
    end--;
  }
  const content = line.slice(start, end);
  const cells: Array<string> = [];
  let current = '';
  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (character === '\\' && content[index + 1] === '|') {
      current += '\\|';
      index++;
    } else if (character === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** A delimiter row: every non-empty cell is dashes with optional colons. */
function isDelimiterRow(line: string | undefined): boolean {
  if (line == null || !line.includes('|')) {
    return false;
  }
  const cells = line
    .split('|')
    .map(cell => cell.trim())
    .filter(cell => cell.length > 0);
  return cells.length > 0 && cells.every(cell => /^:?-+:?$/.test(cell));
}

function columnAlignment(delimiterCell: string): ColumnAlignment {
  const left = delimiterCell.startsWith(':');
  const right = delimiterCell.endsWith(':');
  if (left && right) {
    return 'center';
  }
  return right ? 'right' : left ? 'left' : null;
}

/**
 * Alignment is stored as the cell's element format. Left and right map to
 * logical start and end, so an aligned column follows the reading direction
 * the way core Markdown's table does.
 */
const ALIGNMENT_FORMAT: Record<
  NonNullable<ColumnAlignment>,
  ElementFormatType
> = {left: 'start', center: 'center', right: 'end'};

function delimiterFor(format: ElementFormatType): string {
  switch (format) {
    case 'left':
    case 'start':
      return ':---';
    case 'center':
      return ':---:';
    case 'right':
    case 'end':
      return '---:';
    default:
      return '---';
  }
}

function $createCell(
  source: string,
  isHeader: boolean,
  alignment: ColumnAlignment,
): TableCellNode {
  const cell = $createTableCellNode(
    isHeader ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS,
  );
  // The pipe was only escaped to keep it out of the row split.
  $convertFromMarkdownString(
    source.replace(/\\\|/g, '|'),
    CELL_TRANSFORMERS,
    cell,
  );
  if (alignment != null) {
    cell.setFormat(ALIGNMENT_FORMAT[alignment]);
  }
  return cell;
}

function cellMarkdown(cell: TableCellNode): string {
  // A cell is one line of Markdown, so paragraph breaks inside it become
  // spaces, and literal pipes are escaped to stay inside the cell.
  return oneLine($convertToMarkdownKeepingTimeLinear(CELL_TRANSFORMERS, cell))
    .replace(/\|/g, '\\|')
    .trim();
}

/**
 * `markdown` with each run of spaces that holds a line break made one space.
 * Read line by line: a pattern matching optional spaces around line breaks
 * retries from every space in a long run without a line break, so its time
 * grows with the square of the run.
 */
function oneLine(markdown: string): string {
  if (!markdown.includes('\n')) {
    return markdown;
  }
  const lines = markdown.split('\n');
  let joined = lines[0].trimEnd();
  for (let index = 1; index < lines.length; index++) {
    const isLast = index === lines.length - 1;
    const line = isLast ? lines[index].trimStart() : lines[index].trim();
    // A blank line is part of the run of spaces around it.
    if (line !== '' || isLast) {
      joined += ` ${line}`;
    }
  }
  return joined;
}

/**
 * GFM pipe tables. The header row is the first row and renders as header
 * cells; delimiter-row colons set each column's alignment; rows shorter than
 * the widest row gain empty cells, so no cell is dropped. Export writes the
 * canonical form: outer pipes, one space of padding, and three-dash delimiters.
 */
export const TABLE: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export(node) {
    if (!$isTableNode(node)) {
      return null;
    }
    const rows = node.getChildren().filter($isTableRowNode);
    const lines: Array<string> = [];
    rows.forEach((row, rowIndex) => {
      const cells = row.getChildren().filter($isTableCellNode);
      lines.push(`| ${cells.map(cellMarkdown).join(' | ')} |`);
      if (rowIndex === 0) {
        lines.push(
          `| ${cells.map(cell => delimiterFor(cell.getFormatType())).join(' | ')} |`,
        );
      }
    });
    return lines.join('\n');
  },
  regExpStart: /\|/,
  handleImportAfterStartMatch({lines, rootNode, startLineIndex}) {
    if (!isDelimiterRow(lines[startLineIndex + 1])) {
      return null;
    }
    const alignments = splitTableRow(lines[startLineIndex + 1]).map(
      columnAlignment,
    );
    const rowSources: Array<Array<string>> = [
      splitTableRow(lines[startLineIndex]),
    ];
    let lastLineIndex = startLineIndex + 1;
    while (
      lastLineIndex + 1 < lines.length &&
      lines[lastLineIndex + 1].includes('|') &&
      lines[lastLineIndex + 1].trim() !== ''
    ) {
      lastLineIndex++;
      rowSources.push(splitTableRow(lines[lastLineIndex]));
    }
    const columnCount = Math.max(...rowSources.map(cells => cells.length));
    const table = $createTableNode();
    rowSources.forEach((cells, rowIndex) => {
      const row = $createTableRowNode();
      for (let column = 0; column < columnCount; column++) {
        row.append(
          $createCell(
            cells[column] ?? '',
            rowIndex === 0,
            alignments[column] ?? null,
          ),
        );
      }
      table.append(row);
    });
    rootNode.append(table);
    return [true, lastLineIndex];
  },
  replace() {
    // Every table imports through handleImportAfterStartMatch.
    return false;
  },
  type: 'multiline-element',
};

/**
 * The editor's default Markdown transformers: thematic breaks, list export
 * that nests to each parent's content column, GFM task list items, Lexical's
 * standard set (with `~~~` fences beside its backtick ones, both reading the
 * opening line's info string as core does, its ordered list keeping each
 * nested list's start, and its
 * link writing an unbalanced destination's parentheses escaped), hard line
 * breaks for breaks typed in the editor, and GFM tables. Thematic breaks come first so a line such as `* * *` is a rule
 * rather than a list item, and task items before bullets so `- [ ] text` is a
 * task rather than a bullet that starts with `[ ]`.
 */
export const DEFAULT_TRANSFORMERS: ReadonlyArray<Transformer> = [
  THEMATIC_BREAK,
  LIST_EXPORT,
  TASK_LIST,
  TILDE_CODE,
  ...TRANSFORMERS.map(transformer =>
    transformer === ORDERED_LIST
      ? ORDERED_LIST_KEEPING_START
      : transformer === LINK
        ? LINK_KEEPING_DESTINATIONS
        : transformer === CODE
          ? BACKTICK_CODE
          : transformer === QUOTE
            ? QUOTE_MARKERS
            : transformer === HEADING
              ? HEADING_MARKERS
              : transformer,
  ),
  HARD_LINE_BREAK,
  TABLE,
];
