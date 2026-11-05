// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {type: string; text?: string; value?: string; children?: Json[]};

const textOf = (node: Json): string =>
  node.type === 'linebreak'
    ? '\n'
    : (node.text ?? (node.children ?? []).map(textOf).join(''));

describe('a fence left open at the end imports its code, as core reads it', () => {
  it.each([
    ['```js\ncode\n', 'code'],
    ['```js\ncode\n\n', 'code\n'],
    ['a\n\n```\nx\n\ny\n', 'x\n\ny'],
    ['```js\ncode', 'code'],
  ])('imports %j with code %j', (markdown, value) => {
    const root = (
      JSON.parse(markdownToEditorStateJSON(markdown)) as {
        root: {children: Json[]};
      }
    ).root.children;
    expect(
      root.filter(node => node.type === 'code').map(node => textOf(node)),
    ).toEqual([value]);
    expect(
      (parseMarkdownAst(markdown).children as unknown as Json[])
        .filter(node => node.type === 'code')
        .map(node => node.value),
    ).toEqual([value]);
  });
});
