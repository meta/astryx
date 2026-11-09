// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {render} from '@testing-library/react';
import {Markdown} from './Markdown';
import {parseInlineAst, parseMarkdownAst} from './parser';

type Json = {
  readonly type: string;
  readonly value?: string;
  readonly url?: string;
  readonly children?: ReadonlyArray<Json>;
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline content as the HTML CommonMark's examples show. */
function html(markdown: string): string {
  const write = (node: Json): string => {
    const inner = () => (node.children ?? []).map(write).join('');
    switch (node.type) {
      case 'text':
        return escapeHtml(node.value ?? '');
      case 'inlineCode':
        return `<code>${escapeHtml(node.value ?? '')}</code>`;
      case 'emphasis':
        return `<em>${inner()}</em>`;
      case 'strong':
        return `<strong>${inner()}</strong>`;
      case 'link':
        return `<a href="${node.url ?? ''}">${inner()}</a>`;
      case 'break':
        return '<br />\n';
      default:
        return inner();
    }
  };
  return (parseInlineAst(markdown) as unknown as ReadonlyArray<Json>)
    .map(write)
    .join('');
}

/**
 * CommonMark 0.31.2 §6.2 examples, by example number. Each pairs a run of
 * `*` or `_` by its flanking, its character, and the rule of three.
 */
const COMMONMARK: ReadonlyArray<readonly [number, string, string]> = [
  [350, '*foo bar*', '<em>foo bar</em>'],
  [351, 'a * foo bar*', 'a * foo bar*'],
  [352, 'a*"foo"*', 'a*&quot;foo&quot;*'.replace(/&quot;/g, '"')],
  [354, 'foo*bar*', 'foo<em>bar</em>'],
  [355, '5*6*78', '5<em>6</em>78'],
  [356, '_foo bar_', '<em>foo bar</em>'],
  [357, '_ foo bar_', '_ foo bar_'],
  [359, 'foo_bar_', 'foo_bar_'],
  [360, '5_6_78', '5_6_78'],
  [361, 'пристаням_стремятся_', 'пристаням_стремятся_'],
  [363, 'foo-_(bar)_', 'foo-<em>(bar)</em>'],
  [364, '_foo*', '_foo*'],
  [365, '*foo bar *', '*foo bar *'],
  [368, '*foo*bar', '<em>foo</em>bar'],
  [374, '_foo_bar_baz_', '<em>foo_bar_baz</em>'],
  [378, '**foo bar**', '<strong>foo bar</strong>'],
  [386, 'foo**bar**', 'foo<strong>bar</strong>'],
  [
    390,
    '__foo, __bar__, baz__',
    '<strong>foo, <strong>bar</strong>, baz</strong>',
  ],
  [413, '*foo **bar** baz*', '<em>foo <strong>bar</strong> baz</em>'],
  [414, '*foo**bar**baz*', '<em>foo<strong>bar</strong>baz</em>'],
  [415, '*foo**bar*', '<em>foo**bar</em>'],
  [416, '***foo** bar*', '<em><strong>foo</strong> bar</em>'],
  [417, '*foo **bar***', '<em>foo <strong>bar</strong></em>'],
  [418, '*foo**bar***', '<em>foo<strong>bar</strong></em>'],
  [
    420,
    'foo******bar*********baz',
    'foo<strong><strong><strong>bar</strong></strong></strong>***baz',
  ],
  [
    421,
    '*foo **bar *baz* bim** bop*',
    '<em>foo <strong>bar <em>baz</em> bim</strong> bop</em>',
  ],
  [422, '*foo [*bar*](/url)*', '<em>foo <a href="/url"><em>bar</em></a></em>'],
  [423, '** is not an empty emphasis', '** is not an empty emphasis'],
  [
    424,
    '**** is not an empty strong emphasis',
    '**** is not an empty strong emphasis',
  ],
  [442, '**foo*', '*<em>foo</em>'],
  [443, '*foo**', '<em>foo</em>*'],
  [449, '*foo _bar* baz_', '<em>foo _bar</em> baz_'],
  [
    450,
    '*foo __bar *baz bim__ bam*',
    '<em>foo <strong>bar *baz bim</strong> bam</em>',
  ],
  [451, '**foo **bar baz**', '**foo <strong>bar baz</strong>'],
  [452, '*foo *bar baz*', '*foo <em>bar baz</em>'],
  [453, '*[bar*](/url)', '*<a href="/url">bar*</a>'],
  [459, '*a `*`*', '<em>a <code>*</code></em>'],
  [460, '_a `_`_', '<em>a <code>_</code></em>'],
];

describe('emphasis and strong (CommonMark 0.31.2 §6.2)', () => {
  it.each(COMMONMARK)('example %i: %j', (_, markdown, expected) => {
    expect(html(markdown)).toBe(expected);
  });

  it('keeps an escaped delimiter literal inside emphasis', () => {
    expect(html('*a\\*b*')).toBe('<em>a*b</em>');
    expect(html('**a\\*\\*b**')).toBe('<strong>a**b</strong>');
  });

  it('draws `***x***` as strong outside emphasis, as Markdown always has', () => {
    expect(html('***both***')).toBe('<strong><em>both</em></strong>');
    expect(html('foo***bar***baz')).toBe('foo<strong><em>bar</em></strong>baz');
  });
});

describe('strong inside emphasis, as RichText writes it (spec:AST-061 FR7)', () => {
  it.each([
    ['*see **bold***', '<em>see <strong>bold</strong></em>'],
    ['*see **bold** more*', '<em>see <strong>bold</strong> more</em>'],
    ['**bold *both***', '<strong>bold <em>both</em></strong>'],
    ['_see __bold__ more_', '<em>see <strong>bold</strong> more</em>'],
    [
      '*see **bold** and **more***',
      '<em>see <strong>bold</strong> and <strong>more</strong></em>',
    ],
  ])('reads %j', (markdown, expected) => {
    expect(html(markdown)).toBe(expected);
  });

  it('renders the strong inside the emphasis', () => {
    const {container} = render(
      <Markdown>{'Keep *see **bold** more* here.'}</Markdown>,
    );
    const emphasis = container.querySelector('em');
    expect(emphasis?.textContent).toBe('see bold more');
    expect(emphasis?.querySelector('strong')?.textContent).toBe('bold');
    expect(container.textContent).not.toContain('*');
  });
});

/**
 * The fastest of three parses of `markdown`, in milliseconds, after one
 * warm-up parse: the minimum is the least disturbed by other work running on
 * the same machine.
 */
function parseTime(markdown: string): number {
  parseMarkdownAst(markdown);
  let fastest = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 3; round++) {
    const started = performance.now();
    parseMarkdownAst(markdown);
    fastest = Math.min(fastest, performance.now() - started);
  }
  return fastest;
}

describe('pathological emphasis', () => {
  const nestedStrongEmph = (levels: number): string =>
    `${'*a **a '.repeat(levels)}b${' a** a*'.repeat(levels)}`;

  it('nests up to 100 levels exactly', () => {
    expect(html(nestedStrongEmph(50))).toBe(
      `${'<em>a <strong>a '.repeat(50)}b${' a</strong> a</em>'.repeat(50)}`,
    );
  });

  it('keeps runs past 100 levels as text, around the nesting it allows', () => {
    expect(html(nestedStrongEmph(51))).toBe(
      `*a **a ${'<em>a <strong>a '.repeat(50)}b${' a</strong> a</em>'.repeat(50)} a** a*`,
    );
  });

  it.each([
    ['nested strong emph', nestedStrongEmph, 5_000],
    ['openers with no closers', (n: number) => '*a **a '.repeat(n), 7_000],
    [
      'openers, then as many closers',
      (n: number) => `${'*a '.repeat(n)}${'b* '.repeat(n)}`,
      4_000,
    ],
    ['closers with no openers', (n: number) => ' a*'.repeat(n), 15_000],
    [
      'runs whose lengths sum to a multiple of three',
      (n: number) => `${'a**b'.repeat(n)}${'c* '.repeat(n)}`,
      7_000,
    ],
  ] as const)(
    'parses %s without throwing, within a time budget',
    (_, input, size) => {
      const large = input(size * 2);
      expect(() => parseMarkdownAst(large)).not.toThrow();
      // Alone, the largest of these parses in about 0.1 s. The budget leaves
      // room for a loaded test machine running other suites in parallel; the
      // quadratic pass took 20 to 200 seconds on the nested inputs.
      expect(parseTime(large)).toBeLessThan(5000);
    },
    60_000,
  );

  it('renders 10,000 levels of nesting without exhausting the stack', () => {
    const {container} = render(<Markdown>{nestedStrongEmph(10_000)}</Markdown>);
    expect(container.querySelectorAll('em').length).toBe(50);
    expect(container.querySelectorAll('strong').length).toBe(50);
  });
});
