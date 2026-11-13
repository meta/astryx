// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, waitFor} from '@testing-library/react';
import {RichTextEditor} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {markdownToEditorStateJSON} from './markdownSerializers';
import {tableColumnFloors} from './TableColumnFloorPlugin';

describe('table column floors (spec:AST-061 FR4)', () => {
  it('lets the longest cell wrap to two lines, keeps a header on one line up to a cap, and stays bounded', () => {
    expect(
      tableColumnFloors([
        // Header lengths, then body rows.
        [4, 29, 2, 3],
        [22, 5, 1, 120],
      ]),
    ).toEqual([
      // 22 / 2 = 11
      11,
      // header capped at 20, body 5/2 → 20
      20,
      // the 4ch minimum
      4,
      // 120 / 2 = 60, capped at 24
      24,
    ]);
    expect(tableColumnFloors([])).toEqual([]);
  });

  it('sets the floors on the header cells in the editor and the view', async () => {
    const value = markdownToEditorStateJSON(
      '| Name | Notes |\n| --- | --- |\n| Ada | Wrote the first published program |\n',
    );
    const {container} = render(
      <>
        <RichTextEditor label="Notes" defaultValue={value} />
        <RichTextView value={value} />
      </>,
    );
    await waitFor(() => {
      const headers = [...container.querySelectorAll('th')];
      expect(headers).toHaveLength(4);
      expect(
        headers.map(header => (header as HTMLElement).style.minWidth),
      ).toEqual(['4ch', '17ch', '4ch', '17ch']);
    });
  });
});
