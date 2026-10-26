// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeLanguage.test.tsx
 * @input CodeBlock, language modules, createCodeLanguage
 * @output CodeBlock FR13 evidence: a language value passed as `language`
 *   paints, labels with its name, and reflects its first identifier; a string
 *   never reaches a module; the `tokenizer` prop still wins; server rendering
 *   paints in the first render
 * @position CodeBlock FR13 evidence
 */

import {render, screen} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {CodeBlock} from './CodeBlock';
import {createCodeLanguage} from './grammar';
import {objectiveC} from './languages/objective-c';
import {thrift} from './languages/thrift';

const THRIFT = 'struct User {\n  1: required string name;\n}';

function keywordTexts(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('.astryx-token-keyword')).map(
    node => node.textContent ?? '',
  );
}

describe('a language value as `language` (FR13)', () => {
  it('paints and labels with the value; a string never reaches a module', () => {
    const plain = render(
      <CodeBlock code={THRIFT} language="thrift" highlightMode="spans" />,
    );
    expect(keywordTexts(plain.container)).toEqual([]);

    const {container} = render(
      <CodeBlock code={THRIFT} language={thrift} highlightMode="spans" />,
    );
    expect(keywordTexts(container)).toEqual(
      expect.arrayContaining(['struct', 'required', 'string']),
    );
    expect(screen.getAllByText('thrift').length).toBeGreaterThan(0);
  });

  it('reflects the first identifier as data-language', () => {
    const {container} = render(
      <CodeBlock code="@interface A\n@end" language={objectiveC} />,
    );
    expect(container.querySelector('pre')?.getAttribute('data-language')).toBe(
      'objective-c',
    );
  });

  it('paints a custom language made with createCodeLanguage', () => {
    const zig = createCodeLanguage({
      name: 'zig',
      identifiers: ['zig'],
      tokenize: () => [{type: 'keyword', start: 0, end: 3}],
    });
    const {container} = render(
      <CodeBlock
        code="pub fn main() void {}"
        language={zig}
        highlightMode="spans"
      />,
    );
    expect(keywordTexts(container)).toEqual(['pub']);
    expect(container.querySelector('pre')?.getAttribute('data-language')).toBe(
      'zig',
    );
  });

  it('labels with the value name and reflects its first identifier', () => {
    const zig = createCodeLanguage({
      name: 'Zig Lang',
      identifiers: ['zig', 'ziglang'],
      tokenize: () => [],
    });
    const {container} = render(
      <CodeBlock code="const a = 1;" language={zig} />,
    );
    expect(screen.getByText('Zig Lang')).toBeInTheDocument();
    expect(container.querySelector('pre')?.getAttribute('data-language')).toBe(
      'zig',
    );
  });

  it('paints a custom language synchronously at any length, as tokenizer does', () => {
    const long = 'pub '.repeat(600);
    const zig = createCodeLanguage({
      name: 'zig',
      identifiers: ['zig'],
      tokenize: code =>
        Array.from(code.matchAll(/pub/g), match => ({
          type: 'keyword',
          start: match.index ?? 0,
          end: (match.index ?? 0) + 3,
        })),
    });
    const html = renderToString(
      <CodeBlock code={long} language={zig} highlightMode="spans" />,
    );
    expect(html.match(/astryx-token-keyword/g)?.length).toBe(600);
    const {container} = render(
      <CodeBlock code={long} language={zig} highlightMode="spans" />,
    );
    expect(keywordTexts(container)).toHaveLength(600);
  });

  it('keeps the tokenizer prop winning, as released', () => {
    const tokenizer = () => [{type: 'string', start: 0, end: 6}];
    const builtIn = render(
      <CodeBlock
        code="const x = 1;"
        language="ts"
        tokenizer={tokenizer}
        highlightMode="spans"
      />,
    );
    expect(keywordTexts(builtIn.container)).toEqual([]);
    expect(
      builtIn.container.querySelector('.astryx-token-string')?.textContent,
    ).toBe('const ');
    const value = render(
      <CodeBlock
        code={THRIFT}
        language={thrift}
        tokenizer={tokenizer}
        highlightMode="spans"
      />,
    );
    expect(keywordTexts(value.container)).toEqual([]);
  });

  it('tokenizes an inline custom language once across re-renders', () => {
    let calls = 0;
    const tokenize = () => {
      calls++;
      return [{type: 'keyword', start: 0, end: 3}];
    };
    const make = () =>
      createCodeLanguage({name: 'zig', identifiers: ['zig'], tokenize});
    const {rerender} = render(
      <CodeBlock code="pub fn" language={make()} highlightMode="spans" />,
    );
    for (let i = 0; i < 5; i++) {
      rerender(
        <CodeBlock code="pub fn" language={make()} highlightMode="spans" />,
      );
    }
    expect(calls).toBe(1);
  });

  it('renders plain, not throwing, when a custom language has no function', () => {
    const missing = createCodeLanguage({
      name: 'zig',
      identifiers: ['zig'],
      tokenize: undefined as unknown as () => [],
    });
    const {container} = render(
      <CodeBlock code="pub fn" language={missing} highlightMode="spans" />,
    );
    expect(keywordTexts(container)).toEqual([]);
    expect(container.textContent).toContain('pub fn');
  });

  it('paints a language value in the server render', () => {
    const html = renderToString(
      <CodeBlock code={THRIFT} language={thrift} highlightMode="spans" />,
    );
    expect(html).toContain('astryx-token-keyword');
  });
});
