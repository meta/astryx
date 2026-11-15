// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableColumnFloorPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/table, and lexical.
 * @output Exports TableColumnFloorPlugin, which gives each table column core
 *   Markdown's readable width floor, and tableColumnFloors, the rule itself.
 * @position Rendered by RichTextEditor and RichTextView. Matches core
 *   Markdown's table column floors (spec:AST-061 FR4): automatic table layout
 *   already keeps every column at least as wide as its longest word, but a
 *   prose column's longest word is short, so a narrow table still wraps one
 *   word per line. The floor lets a column's longest cell wrap to about two
 *   lines instead, keeps a header label on one line up to a cap, and stays
 *   bounded so a table of short columns still fits; a wider table scrolls
 *   inside its wrapper. The floors are `ch` on content-box cells, so they
 *   follow the reader's font size and cell padding does not eat into them.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isTableCellNode, $isTableNode, $isTableRowNode} from '@lexical/table';
import {$getRoot} from 'lexical';

const TABLE_COLUMN_MIN_CH = 4;
const TABLE_COLUMN_MAX_CH = 24;
const TABLE_COLUMN_TARGET_LINES = 2;
const TABLE_HEADER_ONE_LINE_MAX_CH = 20;

/**
 * Each column's floor in `ch`, from the text length of every cell, header row
 * first: the longest cell wraps to about two lines, the header reads on one
 * line up to its cap, and every floor stays between the bounds.
 */
export function tableColumnFloors(
  rows: ReadonlyArray<ReadonlyArray<number>>,
): Array<number> {
  const [header, ...body] = rows;
  if (header == null) {
    return [];
  }
  return header.map((headerLength, column) => {
    const longest = Math.max(
      headerLength,
      ...body.map(row => row[column] ?? 0),
    );
    const bodyFloor = Math.ceil(longest / TABLE_COLUMN_TARGET_LINES);
    const headerFloor = Math.min(headerLength, TABLE_HEADER_ONE_LINE_MAX_CH);
    return Math.min(
      TABLE_COLUMN_MAX_CH,
      Math.max(TABLE_COLUMN_MIN_CH, bodyFloor, headerFloor),
    );
  });
}

/**
 * Sets each top-level table's header cells to their column's floor after
 * every update, so the floors follow edits.
 */
export function TableColumnFloorPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      editor.getEditorState().read(() => {
        for (const table of $getRoot().getChildren().filter($isTableNode)) {
          const rows = table
            .getChildren()
            .filter($isTableRowNode)
            .map(row => row.getChildren().filter($isTableCellNode));
          const floors = tableColumnFloors(
            rows.map(cells => cells.map(cell => cell.getTextContentSize())),
          );
          rows[0]?.forEach((cell, column) => {
            const element = editor.getElementByKey(cell.getKey());
            const floor = `${floors[column]}ch`;
            if (element != null && element.style.minWidth !== floor) {
              element.style.minWidth = floor;
            }
          });
        }
      });
    };
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(apply);
      }
    };
    const unregister = editor.registerUpdateListener(schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      unregister();
    };
  }, [editor]);
  return null;
}
