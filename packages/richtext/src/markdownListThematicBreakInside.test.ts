// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

type Json = {type: string; text?: string; children?: Json[]};

/** The editor's blocks, and every text in document order. */
function read(markdown: string): {blocks: string[]; texts: string[]} {
  const root = (JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json})
    .root;
  const texts: string[] = [];
  const visit = (node: Json) => {
    if (node.type === 'text') {
      texts.push((node.text ?? '').trim());
    }
    (node.children ?? []).forEach(visit);
  };
  visit(root);
  return {blocks: (root.children ?? []).map(node => node.type), texts};
}

describe('a thematic break indented into a list item', () => {
  it.each([
    ['under a top-level item', '- a\n  * * *\n  b', ['a', 'b']],
    ['before a sibling item', '- a\n  ***\n- c', ['a', 'c']],
    [
      'under a nested item',
      '- a\n    - b\n      ---\n    - c',
      ['a', 'b', 'c'],
    ],
    [
      'under a nested item, two spaces a level',
      '- a\n  - b\n    ---\n  - c',
      ['a', 'b', 'c'],
    ],
    [
      'with CRLF line endings',
      '- a\r\n    - b\r\n      ---\r\n    - c\r\n',
      ['a', 'b', 'c'],
    ],
  ])(
    'renders as a break, never as its source, and keeps every item: %s',
    (_, markdown, texts) => {
      const read_ = read(markdown);
      expect(read_.blocks).toContain('horizontalrule');
      expect(read_.texts).toEqual(texts);
      expect(
        editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown)),
      ).toBe(markdown);
    },
  );

  it.each([
    ['a break alone', '* * *', ['horizontalrule']],
    ['two items', '- a\n- b', ['list']],
    ['a break before a list', '- - -\n- a', ['horizontalrule', 'list']],
  ])('leaves %s as it was', (_, markdown, blocks) => {
    expect(read(markdown).blocks).toEqual(blocks);
  });
});
