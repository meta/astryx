// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {type: string; text?: string; value?: string; children?: Json[]};

const textOf = (node: Json): string =>
  node.text ?? node.value ?? (node.children ?? []).map(textOf).join('');

/** Each row's cell texts in the first table found. */
function rowsOf(nodes: ReadonlyArray<Json>, rowType: string): string[][] {
  const table = nodes.find(node => node.type === 'table');
  return (table?.children ?? [])
    .filter(row => row.type === rowType)
    .map(row => (row.children ?? []).map(textOf));
}

const richRows = (markdown: string) =>
  rowsOf(
    (JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root
      .children ?? [],
    'tablerow',
  );

const coreRows = (markdown: string) =>
  rowsOf(parseMarkdownAst(markdown).children as unknown as Json[], 'tableRow');

describe('an indented table imports with its own columns, as core reads it', () => {
  it.each([
    '  | a | b |\n  | - | - |\n  | 1 | 2 |',
    '\t| a | b |\n\t| - | - |\n\t| 1 | 2 |',
    '| a | b |\n| - | - |\n| 1 | 2 |',
  ])('imports %j as two columns', markdown => {
    const expected = [
      ['a', 'b'],
      ['1', '2'],
    ];
    expect(richRows(markdown)).toEqual(expected);
    expect(coreRows(markdown)).toEqual(expected);
  });
});
