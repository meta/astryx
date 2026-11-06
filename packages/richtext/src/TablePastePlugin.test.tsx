// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TablePastePlugin.test.tsx
 * @input Uses vitest, @testing-library/react, lexical, @lexical/table,
 *   RichTextEditor, and markdownToEditorStateJSON.
 * @output Tests that pasting into a table's cells keeps every cell and every
 *   pasted cell: a table pastes cell by cell over the table, and a table among
 *   other content goes into the cell as text. A paste without a table is left
 *   to the editor.
 * @position Testing; validates TablePastePlugin.tsx through RichTextEditor.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, render} from '@testing-library/react';
import {createRef} from 'react';
import {
  $createTableSelectionFrom,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  type TableCellNode,
  type TableNode,
} from '@lexical/table';
import {
  $getRoot,
  $setSelection,
  PASTE_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {markdownToEditorStateJSON} from './markdownSerializers';

const TABLE = markdownToEditorStateJSON(
  '| a | b | c |\n| --- | --- | --- |\n| d1 | d2 | d3 |\n| e1 | e2 | e3 |',
);

// jsdom has neither event class, and Lexical's paste handler tells a paste
// from a drop by the event's class name.
class TestClipboardEvent extends Event {}
class TestDragEvent extends Event {}

beforeAll(() => {
  vi.stubGlobal('ClipboardEvent', TestClipboardEvent);
  vi.stubGlobal('DragEvent', TestDragEvent);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** A paste event whose clipboard holds `html` and nothing else. */
function htmlPaste(html: string): ClipboardEvent {
  const event = new TestClipboardEvent('paste', {
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/html' ? html : ''),
      types: ['text/html'],
      files: [],
    },
  });
  return event;
}

function $table(): TableNode {
  const table = $getRoot().getChildren().find($isTableNode);
  if (table == null) {
    throw new Error('No table');
  }
  return table;
}

function $cellHolding(text: string): TableCellNode {
  const cell = $table()
    .getChildren()
    .filter($isTableRowNode)
    .flatMap(row => row.getChildren().filter($isTableCellNode))
    .find(each => each.getTextContent() === text);
  if (cell == null) {
    throw new Error(`No cell holds "${text}"`);
  }
  return cell;
}

function mountTable(): LexicalEditor {
  const ref = createRef<RichTextEditorRef>();
  render(<RichTextEditor ref={ref} label="Notes" defaultValue={TABLE} />);
  if (ref.current == null) {
    throw new Error('The editor did not mount');
  }
  return ref.current.getEditor();
}

async function select(editor: LexicalEditor, $select: () => void) {
  await act(async () => {
    editor.update($select, {discrete: true});
  });
}

async function paste(editor: LexicalEditor, html: string) {
  await act(async () => {
    editor.dispatchCommand(PASTE_COMMAND, htmlPaste(html));
    await Promise.resolve();
  });
}

/**
 * The table as rows of cells: each cell's blocks' text joined by `/`, with
 * `[columns×rows]` after a merged cell.
 */
function tableShape(editor: LexicalEditor): Array<Array<string>> {
  return editor.getEditorState().read(() =>
    $table()
      .getChildren()
      .filter($isTableRowNode)
      .map(row =>
        row
          .getChildren()
          .filter($isTableCellNode)
          .map(cell => {
            const text = cell
              .getChildren()
              .map(block => block.getTextContent())
              .join('/');
            const spans =
              cell.getColSpan() > 1 || cell.getRowSpan() > 1
                ? `[${cell.getColSpan()}×${cell.getRowSpan()}]`
                : '';
            return text + spans;
          }),
      ),
  );
}

describe('pasting into a table cell', () => {
  it('pastes a table with a merged cell over the cells, emptying none', async () => {
    const editor = mountTable();
    await select(editor, () => $cellHolding('d1').selectEnd());
    await paste(
      editor,
      '<table><tr><td>x1</td><td colspan="2">merged</td></tr></table>',
    );
    expect(tableShape(editor)).toEqual([
      ['a', 'b', 'c'],
      ['x1', 'merged', 'd3'],
      ['e1', 'e2', 'e3'],
    ]);
  });

  it('keeps the cells under a pasted cell that spans rows', async () => {
    const editor = mountTable();
    await select(editor, () => $cellHolding('d1').selectEnd());
    await paste(
      editor,
      '<table><tr><td rowspan="2">tall</td><td>q</td></tr><tr><td>t</td></tr></table>',
    );
    expect(tableShape(editor)).toEqual([
      ['a', 'b', 'c'],
      ['tall', 'q', 'd3'],
      ['e1', 't', 'e3'],
    ]);
  });

  it('pastes every cell of a table whose rows differ in length', async () => {
    const editor = mountTable();
    await select(editor, () => $cellHolding('d1').selectEnd());
    await paste(
      editor,
      '<table><tr><td>p</td></tr><tr><td>s</td><td>t</td><td>u</td></tr></table>',
    );
    expect(tableShape(editor)).toEqual([
      ['a', 'b', 'c'],
      ['p', 'd2', 'd3'],
      ['s', 't', 'u'],
    ]);
  });

  it('grows the table for a pasted table that reaches past it', async () => {
    const editor = mountTable();
    await select(editor, () => $cellHolding('e3').selectEnd());
    await paste(
      editor,
      '<table><tr><td>p</td><td>q</td></tr><tr><td>r</td><td>s</td></tr></table>',
    );
    expect(tableShape(editor)).toEqual([
      ['a', 'b', 'c', ''],
      ['d1', 'd2', 'd3', ''],
      ['e1', 'e2', 'p', 'q'],
      ['', '', 'r', 's'],
    ]);
  });

  it('pastes a table among other content into the cell as text', async () => {
    const editor = mountTable();
    await select(editor, () => $cellHolding('d2').selectEnd());
    await paste(
      editor,
      '<p>intro</p><table><tr><td>t1</td><td>t2</td></tr><tr><td>t3</td><td>t4</td></tr></table>',
    );
    expect(tableShape(editor)).toEqual([
      ['a', 'b', 'c'],
      ['d1', 'd2intro/t1\tt2/t3\tt4', 'd3'],
      ['e1', 'e2', 'e3'],
    ]);
  });

  it('leaves a paste without a table to the editor', async () => {
    const editor = mountTable();
    await select(editor, () => $cellHolding('d1').selectEnd());
    await paste(editor, '<p>one</p><p>two</p>');
    expect(tableShape(editor)).toEqual([
      ['a', 'b', 'c'],
      ['d1one/two', 'd2', 'd3'],
      ['e1', 'e2', 'e3'],
    ]);
  });
});

describe('pasting over selected cells', () => {
  it('pastes a table with a merged cell inside the selected cells, emptying none', async () => {
    const editor = mountTable();
    await select(editor, () =>
      $setSelection(
        $createTableSelectionFrom(
          $table(),
          $cellHolding('d1'),
          $cellHolding('e2'),
        ),
      ),
    );
    await paste(
      editor,
      '<table><tr><td colspan="2">wide</td><td>w3</td></tr><tr><td>p</td><td>q</td><td>r</td></tr></table>',
    );
    expect(tableShape(editor)).toEqual([
      ['a', 'b', 'c'],
      ['wide', 'd2', 'd3'],
      ['p', 'q', 'e3'],
    ]);
  });

  it('pastes a table among other content into the focused cell as text', async () => {
    const editor = mountTable();
    await select(editor, () =>
      $setSelection(
        $createTableSelectionFrom(
          $table(),
          $cellHolding('d1'),
          $cellHolding('e2'),
        ),
      ),
    );
    await paste(
      editor,
      '<p>intro</p><table><tr><td>t1</td><td>t2</td></tr></table>',
    );
    expect(tableShape(editor)).toEqual([
      ['a', 'b', 'c'],
      ['d1', 'd2', 'd3'],
      ['e1', 'intro/t1\tt2', 'e3'],
    ]);
  });
});
