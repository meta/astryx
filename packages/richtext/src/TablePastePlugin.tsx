// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TablePastePlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/table,
 *   @lexical/utils, and lexical.
 * @output Exports TablePastePlugin, which pastes into a table's cells without
 *   dropping any of the paste or emptying a cell.
 * @position Rendered by RichTextEditor beside TablePlugin. It answers a paste
 *   that holds a table, made with the selection in one table's cells, ahead of
 *   TablePlugin's own handler. That handler refuses a table that comes with
 *   other content, and fits a pasted merged cell by merging the cells under
 *   it, which drops their text.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $computeTableCellRectBoundary,
  $computeTableMap,
  $computeTableMapSkipCellCheck,
  $insertTableColumnAtNode,
  $insertTableRowAtNode,
  $isTableCellNode,
  $isTableNode,
  $isTableSelection,
  type TableCellNode,
  type TableNode,
  type TableSelection,
} from '@lexical/table';
import {$dfs, $findMatchingParent} from '@lexical/utils';
import {
  $createParagraphNode,
  $createTabNode,
  $createTextNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
  type BaseSelection,
  type LexicalNode,
  type ParagraphNode,
  type RangeSelection,
} from 'lexical';

/** A selection that starts and ends in cells of one table. */
interface CellSelection {
  readonly selection: RangeSelection | TableSelection;
  readonly table: TableNode;
  readonly anchorCell: TableCellNode;
  readonly focusCell: TableCellNode;
}

function $cellSelection(selection: BaseSelection): CellSelection | null {
  if (!$isRangeSelection(selection) && !$isTableSelection(selection)) {
    return null;
  }
  const points = selection.getStartEndPoints();
  if (points == null) {
    return null;
  }
  const anchorCell = $findMatchingParent(points[0].getNode(), $isTableCellNode);
  const focusCell = $findMatchingParent(points[1].getNode(), $isTableCellNode);
  if (anchorCell == null || focusCell == null) {
    return null;
  }
  const table = $findMatchingParent(anchorCell, $isTableNode);
  if (table == null || !table.isParentOf(focusCell)) {
    return null;
  }
  return {selection, table, anchorCell, focusCell};
}

/**
 * Writes a pasted table into the table cell by cell, starting at the
 * top-left selected cell and adding the rows and columns it reaches past the
 * table's edge; selected cells bound it instead. Each pasted cell replaces
 * what its cell held. A merged pasted cell fills only the cell where it
 * starts: the rest of its span, like the missing end of a short row, leaves
 * the cells under it as they were, so no cell is merged or emptied.
 */
function $pasteTableIntoCells(
  pasted: TableNode,
  {selection, table, anchorCell, focusCell}: CellSelection,
): void {
  const [grid, anchorEntry, focusEntry] = $computeTableMap(
    table,
    anchorCell,
    focusCell,
  );
  const {minRow, minColumn, maxRow, maxColumn} = $computeTableCellRectBoundary(
    grid,
    anchorEntry,
    focusEntry,
  );
  const [source] = $computeTableMapSkipCellCheck(pasted, null, null);
  // Pasted rows can differ in length, so the widest one sets the width.
  let rows = source.length;
  let columns = Math.max(0, ...source.map(row => row.length));
  if ($isTableSelection(selection)) {
    rows = Math.min(rows, maxRow - minRow + 1);
    columns = Math.min(columns, maxColumn - minColumn + 1);
  }
  for (let count = grid.length; count < minRow + rows; count++) {
    const [current] = $computeTableMapSkipCellCheck(table, null, null);
    $insertTableRowAtNode(current[current.length - 1][0].cell);
  }
  for (let count = grid[0].length; count < minColumn + columns; count++) {
    const [current] = $computeTableMapSkipCellCheck(table, null, null);
    $insertTableColumnAtNode(
      current[0][current[0].length - 1].cell,
      true,
      false,
    );
  }
  const [target] = $computeTableMapSkipCellCheck(table, null, null);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const entry = source[row][column];
      if (
        entry == null ||
        entry.startRow !== row ||
        entry.startColumn !== column
      ) {
        continue;
      }
      const cell = target[minRow + row][minColumn + column].cell;
      const replaced = cell.getChildren();
      cell.append(...entry.cell.getChildren());
      for (const node of replaced) {
        node.remove();
      }
    }
  }
  target[minRow][minColumn].cell.selectEnd();
}

/**
 * A table as text a cell can hold: a paragraph per row, with the text of the
 * row's cells between tabs. A merged cell's text appears once, where the
 * cell starts.
 */
function $tableAsParagraphs(table: TableNode): Array<ParagraphNode> {
  const [grid] = $computeTableMapSkipCellCheck(table, null, null);
  return grid.map((row, rowIndex) => {
    const paragraph = $createParagraphNode();
    row.forEach((entry, column) => {
      if (column > 0) {
        paragraph.append($createTabNode());
      }
      if (entry.startRow !== rowIndex || entry.startColumn !== column) {
        return;
      }
      const text = entry.cell.getTextContent().replace(/\s+/g, ' ').trim();
      if (text !== '') {
        paragraph.append($createTextNode(text));
      }
    });
    return paragraph;
  });
}

/** `node` with every table in it, or the node itself if a table, as text. */
function $withTablesAsText(node: LexicalNode): Array<LexicalNode> {
  if ($isTableNode(node)) {
    return $tableAsParagraphs(node);
  }
  for (const {node: inner} of $dfs(node)) {
    if ($isTableNode(inner)) {
      for (const paragraph of $tableAsParagraphs(inner)) {
        inner.insertBefore(paragraph);
      }
      inner.remove();
    }
  }
  return [node];
}

/**
 * Pastes a table into a table's cells. A table alone goes in cell by cell
 * (`$pasteTableIntoCells`). A table that comes with other content, such as
 * the paragraph and table a web page copies, goes into the cell with each
 * table as text, since a cell holds no table. Any other paste is left to
 * the editor's own handlers.
 */
export function TablePastePlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
        ({nodes, selection}, dispatchEditor) => {
          if (
            dispatchEditor !== editor ||
            !nodes.some(node =>
              $dfs(node).some(({node: inner}) => $isTableNode(inner)),
            )
          ) {
            return false;
          }
          const cells = $cellSelection(selection);
          if (cells == null) {
            return false;
          }
          if (nodes.length === 1 && $isTableNode(nodes[0])) {
            $pasteTableIntoCells(nodes[0], cells);
          } else {
            cells.selection.insertNodes(nodes.flatMap($withTablesAsText));
          }
          return true;
        },
        // Ahead of TablePlugin's handler, which runs at the editor priority.
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );
  return null;
}
