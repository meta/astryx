// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.cellMerge.test.tsx
 * @input Uses @lexical/table, @testing-library/react, ./RichTextEditor
 * @output Proves `hasCellMerge`: a merged table cell survives when the
 *   surface asks for merges, and is un-merged by default, as a surface that
 *   round-trips through Markdown needs.
 * @position Unit test for the editor's table merge contract.
 */

import {describe, expect, it} from 'vitest';
import {render, waitFor} from '@testing-library/react';
import {createRef} from 'react';
import {$getRoot} from 'lexical';
import {
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  $mergeCells,
} from '@lexical/table';

import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {markdownToEditorStateJSON} from './markdownSerializers';

const TABLE = markdownToEditorStateJSON(
  '| Name | Notes |\n| --- | --- |\n| Ada | Wrote it |\n',
);

/** Merges the two cells of the table's first body row. */
function mergeFirstBodyRow(editor: RichTextEditorRef) {
  editor.getEditor().update(
    () => {
      const table = $getRoot()
        .getChildren()
        .find(child => $isTableNode(child));
      if (table == null) {
        throw new Error('no table in the editor');
      }
      const row = table.getChildren()[1];
      if (!$isTableRowNode(row)) {
        throw new Error('no body row in the table');
      }
      const cells = row.getChildren().filter($isTableCellNode).slice(0, 2);
      $mergeCells(cells);
    },
    {discrete: true},
  );
}

describe('RichTextEditor hasCellMerge', () => {
  it('keeps a merged cell when the surface asks for merges', async () => {
    const ref = createRef<RichTextEditorRef | null>();
    const {container} = render(
      <RichTextEditor
        label="Notes"
        defaultValue={TABLE}
        hasCellMerge
        ref={ref}
      />,
    );

    await waitFor(() =>
      expect(container.querySelector('table')).not.toBeNull(),
    );
    mergeFirstBodyRow(ref.current!);

    await waitFor(() => {
      const merged = container.querySelector('td[colspan="2"]');
      expect(merged).not.toBeNull();
    });
  });

  it('un-merges by default, because Markdown cannot carry a merge', async () => {
    const ref = createRef<RichTextEditorRef | null>();
    const {container} = render(
      <RichTextEditor label="Notes" defaultValue={TABLE} ref={ref} />,
    );

    await waitFor(() =>
      expect(container.querySelector('table')).not.toBeNull(),
    );
    mergeFirstBodyRow(ref.current!);

    await waitFor(() => {
      expect(container.querySelector('td[colspan="2"]')).toBeNull();
    });
  });
});
