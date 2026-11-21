// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, waitFor} from '@testing-library/react';
import {createRef} from 'react';
import {createHeadlessEditor} from '@lexical/headless';
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  TableCellHeaderStates,
} from '@lexical/table';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type ElementFormatType,
} from 'lexical';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {DEFAULT_NODES} from './editorNodes';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

interface SerializedNode {
  type: string;
  children?: Array<SerializedNode>;
  text?: string;
  format?: string | number;
  headerState?: number;
}

function roundTrip(markdown: string): string {
  return editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown));
}

function topLevel(markdown: string): Array<SerializedNode> {
  const state = JSON.parse(markdownToEditorStateJSON(markdown)) as {
    root: SerializedNode;
  };
  return state.root.children ?? [];
}

function onlyTable(markdown: string): SerializedNode {
  const tables = topLevel(markdown).filter(node => node.type === 'table');
  expect(tables).toHaveLength(1);
  return tables[0];
}

function rows(table: SerializedNode): Array<Array<SerializedNode>> {
  return (table.children ?? []).map(row => row.children ?? []);
}

function textOf(node: SerializedNode): string {
  if (node.text != null) {
    return node.text;
  }
  return (node.children ?? []).map(textOf).join('');
}

describe('GFM tables', () => {
  it('imports a pipe table with a header row', () => {
    const table = onlyTable(
      '| Name | Role |\n| --- | --- |\n| Ada | Engineer |',
    );
    const [header, body] = rows(table);
    expect(header.map(textOf)).toEqual(['Name', 'Role']);
    expect(body.map(textOf)).toEqual(['Ada', 'Engineer']);
    expect(header.map(cell => cell.headerState)).toEqual([
      TableCellHeaderStates.ROW,
      TableCellHeaderStates.ROW,
    ]);
    expect(body.map(cell => cell.headerState)).toEqual([
      TableCellHeaderStates.NO_STATUS,
      TableCellHeaderStates.NO_STATUS,
    ]);
  });

  it('exports the canonical form unchanged', () => {
    const source = '| Name | Role |\n| --- | --- |\n| Ada | Engineer |';
    expect(roundTrip(source)).toBe(source);
  });

  it('keeps each column alignment', () => {
    const source =
      '| Left | Center | Right | None |\n| :--- | :---: | ---: | --- |\n| a | b | c | d |';
    const [header, body] = rows(onlyTable(source));
    expect(header.map(cell => cell.format)).toEqual([
      'start',
      'center',
      'end',
      '',
    ]);
    expect(body.map(cell => cell.format)).toEqual([
      'start',
      'center',
      'end',
      '',
    ]);
    expect(roundTrip(source)).toBe(source);
  });

  it('keeps escaped pipes inside cells, including inline code', () => {
    const source = '| a \\| b | c |\n| --- | --- |\n| `x \\| y` | d |';
    const [header, body] = rows(onlyTable(source));
    expect(textOf(header[0])).toBe('a | b');
    expect(textOf(body[0])).toBe('x | y');
    expect(roundTrip(source)).toBe(source);
  });

  it('keeps inline formatting and links inside cells', () => {
    const source =
      '| **Bold** | [Link](https://example.com) |\n| --- | --- |\n| `code` | *em* |';
    expect(roundTrip(source)).toBe(source);
  });

  it('recognizes a table without outer pipes, as core Markdown does', () => {
    const source = 'Name | Role\n--- | ---\nAda | Engineer';
    expect(rows(onlyTable(source)).map(row => row.map(textOf))).toEqual([
      ['Name', 'Role'],
      ['Ada', 'Engineer'],
    ]);
    // Imported tables come back exactly as written (spec:AST-062).
    expect(roundTrip(source)).toBe(source);
  });

  it('leaves a line with pipes but no delimiter row as text', () => {
    const nodes = topLevel('a | b\n\nNext paragraph');
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'paragraph']);
    expect(textOf(nodes[0])).toBe('a | b');
  });

  it('pads short rows so every row has every column and no cell is dropped', () => {
    const table = onlyTable(
      '| A | B | C |\n| --- | --- | --- |\n| 1 |\n| 1 | 2 | 3 | 4 |',
    );
    expect(rows(table).map(row => row.map(textOf))).toEqual([
      ['A', 'B', 'C', ''],
      ['1', '', '', ''],
      ['1', '2', '3', '4'],
    ]);
  });

  it('ends a table at a blank line or at a line without a pipe', () => {
    expect(
      topLevel('| A |\n| --- |\n| 1 |\n\nAfter').map(node => node.type),
    ).toEqual(['table', 'paragraph']);
    const nodes = topLevel('| A |\n| --- |\n| 1 |\nAfter');
    expect(nodes.map(node => node.type)).toEqual(['table', 'paragraph']);
    expect(rows(nodes[0])).toHaveLength(2);
  });

  it('keeps the blocks around a table', () => {
    const source = '# Title\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAfter';
    expect(topLevel(source).map(node => node.type)).toEqual([
      'heading',
      'table',
      'paragraph',
    ]);
    expect(roundTrip(source)).toBe(source);
  });

  it('renders header and body cells inside a scroll wrapper in the editor', async () => {
    const {container} = render(
      <RichTextEditor
        label="Notes"
        defaultValue={markdownToEditorStateJSON(
          '| Name | Role |\n| --- | --- |\n| Ada | Engineer |',
        )}
      />,
    );
    expect(
      [...container.querySelectorAll('th')].map(cell => cell.textContent),
    ).toEqual(['Name', 'Role']);
    expect(
      [...container.querySelectorAll('td')].map(cell => cell.textContent),
    ).toEqual(['Ada', 'Engineer']);
    // A wide table scrolls inside its own wrapper rather than widening the
    // editor. The table plugin re-renders existing tables into the wrapper
    // after mount.
    await waitFor(() => {
      const wrapper = container.querySelector('table')?.parentElement;
      expect(wrapper?.tagName).toBe('DIV');
      expect(wrapper?.getAttribute('contenteditable')).toBeNull();
    });
  });

  it('sizes the scroll wrapper from its container, not from the table', async () => {
    const {container} = render(
      <RichTextEditor
        label="Notes"
        defaultValue={markdownToEditorStateJSON(
          '| Name | Role |\n| --- | --- |\n| Ada | Engineer |',
        )}
      />,
    );
    await waitFor(() => {
      const wrapper = container.querySelector('table')?.parentElement;
      expect(wrapper?.getAttribute('contenteditable')).toBeNull();
      // jsdom keeps `display` but not grid track sizes; the browser test
      // checks what the track does.
      expect(wrapper).toHaveStyle({display: 'grid'});
    });
  });

  it('renders a table from the editor in RichTextView, inside a scroll wrapper', async () => {
    const {container} = render(
      <RichTextView
        value={markdownToEditorStateJSON(
          '| Name | Role |\n| --- | --- |\n| Ada | Engineer |',
        )}
      />,
    );
    expect(
      [...container.querySelectorAll('th')].map(cell => cell.textContent),
    ).toEqual(['Name', 'Role']);
    expect(
      [...container.querySelectorAll('td')].map(cell => cell.textContent),
    ).toEqual(['Ada', 'Engineer']);
    await waitFor(() => {
      const wrapper = container.querySelector('table')?.parentElement;
      expect(wrapper?.tagName).toBe('DIV');
      expect(wrapper?.getAttribute('contenteditable')).toBeNull();
    });
  });
});

/** A cell of a table built for a test: its text, spans, and alignment. */
interface CellSpec {
  text: string;
  colSpan?: number;
  rowSpan?: number;
  format?: ElementFormatType;
}

/**
 * Serialized editor state holding one table, the way content made outside
 * RichText holds merged cells: a merged cell keeps its spans, and each row
 * lists only the cells that start in it. The first row is the header row.
 */
function tableStateJSON(rows: Array<Array<CellSpec>>): string {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error: Error) {
      throw error;
    },
  });
  editor.update(
    () => {
      const table = $createTableNode();
      rows.forEach((cells, rowIndex) => {
        const row = $createTableRowNode();
        for (const {text, colSpan = 1, rowSpan = 1, format} of cells) {
          const cell = $createTableCellNode(
            rowIndex === 0
              ? TableCellHeaderStates.ROW
              : TableCellHeaderStates.NO_STATUS,
            colSpan,
          );
          cell.setRowSpan(rowSpan);
          if (format != null) {
            cell.setFormat(format);
          }
          cell.append($createParagraphNode().append($createTextNode(text)));
          row.append(cell);
        }
        table.append(row);
      });
      $getRoot().clear().append(table);
    },
    {discrete: true},
  );
  return JSON.stringify(editor.getEditorState().toJSON());
}

/** A table whose header spans two columns and whose "Ada" spans two rows. */
const MERGED = tableStateJSON([
  [{text: 'Name', colSpan: 2}, {text: 'Notes'}],
  [{text: 'Ada', rowSpan: 2}, {text: 'first'}, {text: 'wrote'}],
  [{text: 'second'}, {text: 'proved'}],
  [{text: 'Grace'}, {text: 'third'}, {text: 'built'}],
]);

/**
 * GFM has no merged cells: each merged cell's content sits in its top-left
 * cell, the cells it covered are empty, and every row has every column.
 */
const MERGED_MARKDOWN = [
  '| Name |  | Notes |',
  '| --- | --- | --- |',
  '| Ada | first | wrote |',
  '|  | second | proved |',
  '| Grace | third | built |',
].join('\n');

/** Each rendered cell's text and spans, in document order. */
function renderedCells(
  container: HTMLElement,
): Array<[string, number, number]> {
  return [...container.querySelectorAll<HTMLTableCellElement>('th, td')].map(
    cell => [cell.textContent ?? '', cell.colSpan, cell.rowSpan],
  );
}

const KEPT_CELLS: Array<[string, number, number]> = [
  ['Name', 2, 1],
  ['Notes', 1, 1],
  ['Ada', 1, 2],
  ['first', 1, 1],
  ['wrote', 1, 1],
  ['second', 1, 1],
  ['proved', 1, 1],
  ['Grace', 1, 1],
  ['third', 1, 1],
  ['built', 1, 1],
];

const SPLIT_CELLS: Array<[string, number, number]> = [
  ['Name', 1, 1],
  ['', 1, 1],
  ['Notes', 1, 1],
  ['Ada', 1, 1],
  ['first', 1, 1],
  ['wrote', 1, 1],
  ['', 1, 1],
  ['second', 1, 1],
  ['proved', 1, 1],
  ['Grace', 1, 1],
  ['third', 1, 1],
  ['built', 1, 1],
];

describe('merged table cells', () => {
  it('export as GFM with every row at the full column count', () => {
    expect(editorStateJSONToMarkdown(MERGED)).toBe(MERGED_MARKDOWN);
  });

  it('export Markdown that reads back with every cell in its column', () => {
    const table = onlyTable(editorStateJSONToMarkdown(MERGED));
    expect(rows(table).map(row => row.map(textOf))).toEqual([
      ['Name', '', 'Notes'],
      ['Ada', 'first', 'wrote'],
      ['', 'second', 'proved'],
      ['Grace', 'third', 'built'],
    ]);
  });

  it('export each column with the alignment of the header-row cell over it', () => {
    const value = tableStateJSON([
      [
        {text: 'Wide', colSpan: 2, format: 'center'},
        {text: 'Last', format: 'end'},
      ],
      [{text: 'a'}, {text: 'b'}, {text: 'c'}],
    ]);
    expect(editorStateJSONToMarkdown(value)).toBe(
      '| Wide |  | Last |\n| :---: | :---: | ---: |\n| a | b | c |',
    );
  });

  it('stay merged in the editor with hasCellMerge, and export the same Markdown', async () => {
    const ref = createRef<RichTextEditorRef>();
    const {container} = render(
      <RichTextEditor
        ref={ref}
        label="Notes"
        defaultValue={MERGED}
        hasCellMerge
      />,
    );
    // Let the table plugin's mount effects run before reading the cells.
    await waitFor(() => {
      expect(container.querySelector('table')?.parentElement?.tagName).toBe(
        'DIV',
      );
    });
    expect(renderedCells(container)).toEqual(KEPT_CELLS);
    expect(ref.current?.getMarkdown()).toBe(MERGED_MARKDOWN);
  });

  it('split in the editor by default, with the content in the first cell of each', async () => {
    const ref = createRef<RichTextEditorRef>();
    const {container} = render(
      <RichTextEditor ref={ref} label="Notes" defaultValue={MERGED} />,
    );
    await waitFor(() => {
      expect(renderedCells(container)).toEqual(SPLIT_CELLS);
    });
    expect(ref.current?.getMarkdown()).toBe(MERGED_MARKDOWN);
  });

  it('stay merged in RichTextView with hasCellMerge', async () => {
    const {container} = render(<RichTextView value={MERGED} hasCellMerge />);
    await waitFor(() => {
      expect(container.querySelector('table')?.parentElement?.tagName).toBe(
        'DIV',
      );
    });
    expect(renderedCells(container)).toEqual(KEPT_CELLS);
  });

  it('split in RichTextView by default', async () => {
    const {container} = render(<RichTextView value={MERGED} />);
    await waitFor(() => {
      expect(renderedCells(container)).toEqual(SPLIT_CELLS);
    });
  });
});
