// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {markdownSoftBreaksPlugin} from '@astryxdesign/core/Markdown/plugins';
import {remarkBreaksPlugin} from '../stories/Markdown.remarkPlugins';

describe('adapted remark-breaks story fixture', () => {
  it.each([
    ['no space', 'First\nSecond'],
    ['one space', 'First \nSecond'],
    ['one tab', 'First\t\nSecond'],
    ['multiline link', '[Linked\nlabel](/docs)'],
    ['phrasing', 'First *emphasized\nline*'],
  ])('matches the first-party tree for %s', (_name, source) => {
    expect(
      parseMarkdownAst(source, {plugins: [markdownSoftBreaksPlugin]}),
    ).toEqual(parseMarkdownAst(source, {plugins: [remarkBreaksPlugin]}));
  });

  it('preserves opaque fenced code in both paths', () => {
    const source = ['```text', 'fenced', 'code', '```'].join('\n');

    expect(
      parseMarkdownAst(source, {plugins: [markdownSoftBreaksPlugin]}),
    ).toEqual(parseMarkdownAst(source, {plugins: [remarkBreaksPlugin]}));
  });
});
