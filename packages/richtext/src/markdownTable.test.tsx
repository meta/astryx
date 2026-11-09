// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, waitFor} from '@testing-library/react';
import {TableCellHeaderStates} from '@lexical/table';
import {RichTextEditor} from './RichTextEditor';
import {RichTextView} from './RichTextView';
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
