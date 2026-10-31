// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {tokenize} from '@astryxdesign/core/CodeBlock';
import {thrift} from '@astryxdesign/core/CodeBlock/languages/thrift';
import {listedLanguage, sameLanguages} from './codeLanguages';
import {renderedTokens} from './CodeSyntaxPlugin';
import {RichTextView} from './RichTextView';
import {markdownToEditorStateJSON} from './markdownSerializers';

describe('code block syntax colors (spec:AST-061 FR1)', () => {
  const code = 'let a = 1;\nreturn a;';

  it("uses core CodeBlock's tokens line by line when the text keeps its line breaks", () => {
    expect(renderedTokens(code, 'ts', code)).toEqual(tokenize(code, 'ts'));
  });

  it('paints a listed language value, as Markdown does (CodeBlock FR13)', () => {
    const idl = 'struct User {}';
    expect(renderedTokens(idl, 'thrift', idl)?.flat()).toEqual([]);
    expect(
      renderedTokens(idl, listedLanguage([thrift], 'thrift') ?? 'thrift', idl)
        ?.flat()
        .map(t => t.type),
    ).toContain('keyword');
    expect(listedLanguage([thrift], 'graphql')).toBeUndefined();
  });

  it('treats lists naming the same values as the same', () => {
    expect(sameLanguages([thrift], [thrift])).toBe(true);
    expect(sameLanguages(undefined, undefined)).toBe(true);
    expect(sameLanguages([thrift], [])).toBe(false);
    expect(sameLanguages([thrift], undefined)).toBe(false);
  });

  it('lays the tokens over the text as one line when line breaks render without text', () => {
    const rendered = code.replace('\n', '');
    const [line] = renderedTokens(code, 'ts', rendered) ?? [];
    const texts = (line ?? []).map(
      token => `${token.type}:${rendered.slice(token.start, token.end)}`,
    );
    expect(texts).toContain('keyword:let');
    expect(texts).toContain('keyword:return');
  });

  it('colors nothing while the rendered text is not the code, or for a language core does not know', () => {
    expect(renderedTokens(code, 'ts', 'let a')).toBeNull();
    expect(renderedTokens(code, 'notalanguage', code)).toEqual([]);
  });

  it('renders code blocks where the Highlight API is missing', async () => {
    render(
      <RichTextView
        value={markdownToEditorStateJSON('```ts\nlet plain = 1;\n```\n')}
      />,
    );
    expect(await screen.findByText('let plain = 1;')).toBeInTheDocument();
  });
});
