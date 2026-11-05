// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

interface ListShape {
  readonly start: number;
  readonly items: ReadonlyArray<string | ListShape>;
}

/** Each list's start and items, nesting as Markdown does. */
function lists(markdown: string): Array<ListShape> {
  const shape = (node: Record<string, unknown>): ListShape => ({
    start: node.start as number,
    items: (node.children as Array<Record<string, unknown>>).flatMap(item =>
      (item.children as Array<Record<string, unknown>>).map(child =>
        child.type === 'list' ? shape(child) : (child.text as string),
      ),
    ),
  });
  const root = (
    JSON.parse(markdownToEditorStateJSON(markdown)) as {
      root: {children: Array<Record<string, unknown>>};
    }
  ).root;
  return root.children.filter(node => node.type === 'list').map(shape);
}

describe('ordered list starts (spec:AST-061 DEC-6)', () => {
  it('starts a nested numbered list at the number its first item was written with', () => {
    expect(lists('1. a\n   27. b\n   28. c\n')).toEqual([
      {start: 1, items: ['a', {start: 27, items: ['b', 'c']}]},
    ]);
    expect(lists('3. a\n   0. b\n')).toEqual([
      {start: 3, items: ['a', {start: 0, items: ['b']}]},
    ]);
  });

  it('keeps nested starts at every depth, and continues an existing nested list', () => {
    expect(lists('1. a\n   5. b\n      9. c\n   6. d\n')).toEqual([
      {
        start: 1,
        items: ['a', {start: 5, items: ['b', {start: 9, items: ['c']}, 'd']}],
      },
    ]);
  });

  it('leaves top-level and kind-changing starts as they were, and round-trips', () => {
    for (const markdown of [
      '27. a\n28. b\n',
      '- a\n  27. b\n',
      '1. a\n   27. b\n   28. c\n',
    ]) {
      const json = markdownToEditorStateJSON(markdown);
      expect(editorStateJSONToMarkdown(json)).toBe(markdown);
    }
    expect(lists('27. a\n28. b\n')).toEqual([{start: 27, items: ['a', 'b']}]);
  });
});
