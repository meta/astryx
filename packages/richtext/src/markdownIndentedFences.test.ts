// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {type: string; text?: string; value?: string; children?: Json[]};

/** The text of every code block the editor imports, in order. */
function richCode(markdown: string): string[] {
  const text = (node: Json): string =>
    node.type === 'linebreak'
      ? '\n'
      : (node.text ?? (node.children ?? []).map(text).join(''));
  return (JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root
    .children!.filter(node => node.type === 'code')
    .map(text);
}

/** The text of every code block core reads, in order. */
function coreCode(markdown: string): string[] {
  return (parseMarkdownAst(markdown).children as unknown as Json[])
    .filter(node => node.type === 'code')
    .map(node => node.value ?? '');
}

describe('an indented code fence reads as core reads it', () => {
  it.each([
    ['  ```js\n  x\n    y\n  ```', ['x\n  y']],
    [' ```\na\n ```', ['a']],
    ['   ~~~\n   b\n   ~~~', ['b']],
    ['```\ncode\n  ```\nafter', ['code']],
    ['Text\n ```\n code\n ```', ['code']],
  ])('imports %j with the code core reads', (markdown, expected) => {
    expect(richCode(markdown)).toEqual(expected);
    expect(coreCode(markdown)).toEqual(expected);
  });

  it('reads a fence indented four spaces as no fence, as core does', () => {
    expect(richCode('    ```\n    x\n    ```')).toEqual([]);
    expect(coreCode('    ```\n    x\n    ```')).toEqual([]);
  });
});
