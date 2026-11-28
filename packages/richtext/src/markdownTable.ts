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

/** One position of a table's grid and the cell over it. */
interface GridSlot {
  readonly cell: TableCellNode;
  /** Whether this is the cell's top-left position, where its content goes. */
  readonly isOrigin: boolean;
}

/** A cell's span: a value below 2, or not a number, spans one. */
function spanOf(value: number): number {
  return value > 1 ? value : 1;
}

/**
 * The table laid out on its grid, row by row. A merged cell covers every
 * position its column and row spans reach, and a row span stops at the last
 * row. A position no cell reaches, past the end of a short row, is empty.
 */
function $tableGrid(table: TableNode): Array<Array<GridSlot | undefined>> {
  const rows = table.getChildren().filter($isTableRowNode);
  const grid: Array<Array<GridSlot | undefined>> = rows.map(() => []);
  rows.forEach((row, rowIndex) => {
    let column = 0;
    for (const cell of row.getChildren().filter($isTableCellNode)) {
      while (grid[rowIndex][column] !== undefined) {
        column++;
      }
      const colSpan = spanOf(cell.getColSpan());
      const rowSpan = Math.min(
        spanOf(cell.getRowSpan()),
        rows.length - rowIndex,
      );
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset++) {
        for (let columnOffset = 0; columnOffset < colSpan; columnOffset++) {
          grid[rowIndex + rowOffset][column + columnOffset] = {
            cell,
            isOrigin: rowOffset === 0 && columnOffset === 0,
          };
        }
      }
      column += colSpan;
    }
  });
  return grid;
}

/**
 * GFM pipe tables. The header row is the first row and renders as header
 * cells; delimiter-row colons set each column's alignment; rows shorter than
 * the widest row gain empty cells, so no cell is dropped. Export writes the
 * canonical form: outer pipes, one space of padding, and three-dash delimiters.
 *
 * GFM has no merged cells, so a merged cell exports as the cells it covers:
 * its content in the top-left one and the rest empty. Every row is written
 * with every column, so each cell stays in its column when the Markdown is
 * read again, and each column takes the alignment of the header-row cell over
 * it. The Markdown reads back with the cells split.
 */
export const TABLE: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export(node) {
    if (!$isTableNode(node)) {
      return null;
    }
    const grid = $tableGrid(node);
    const columns = Math.max(0, ...grid.map(row => row.length));
    const lines: Array<string> = [];
    grid.forEach((row, rowIndex) => {
      const slots = Array.from({length: columns}, (_, column) => row[column]);
      lines.push(
        `| ${slots.map(slot => (slot?.isOrigin ? cellMarkdown(slot.cell) : '')).join(' | ')} |`,
      );
      if (rowIndex === 0) {
        lines.push(
          `| ${slots.map(slot => delimiterFor(slot?.cell.getFormatType() ?? '')).join(' | ')} |`,
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
