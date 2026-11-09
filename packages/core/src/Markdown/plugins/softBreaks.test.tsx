// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file softBreaks.test.tsx
 * @input Complete and streaming Markdown with soft line endings
 * @output AST, rendering, protection, typing, and convergence evidence
 * @position Acceptance tests for the first-party Markdown soft-breaks plugin
 */

import {renderToString} from 'react-dom/server';
import {describe, expect, expectTypeOf, it} from 'vitest';
import {Markdown} from '../Markdown';
import {parseMarkdownAst, parseMarkdownAstInternal} from '../parser';
import type {MarkdownPluginEntry} from './protocol';
import {markdownSoftBreaksPlugin} from './softBreaks';

const SOURCE = [
  'First line',
  'Second **emphasized** line',
  '',
  '[Linked',
  'label](/docs) and `inline code`.',
  '',
  '```text',
  'fenced',
  'code',
  '```',
].join('\n');

describe('markdownSoftBreaksPlugin', () => {
  it('turns eligible LF, CRLF, and lone CR endings into break nodes', () => {
    expect(
      parseMarkdownAst('Alpha\nBeta', {
        plugins: [markdownSoftBreaksPlugin],
      }).children[0],
    ).toMatchObject({
      type: 'paragraph',
      children: [
        {type: 'text', value: 'Alpha'},
        {type: 'break'},
        {type: 'text', value: 'Beta'},
      ],
    });
    expect(
      parseMarkdownAst('Alpha\r\nBeta', {
        plugins: [markdownSoftBreaksPlugin],
      }).children[0],
    ).toMatchObject({
      type: 'paragraph',
      children: [
        {type: 'text', value: 'Alpha'},
        {type: 'break'},
        {type: 'text', value: 'Beta'},
      ],
    });
    expect(
      parseMarkdownAst('Alpha\rBeta', {
        plugins: [markdownSoftBreaksPlugin],
      }).children[0],
    ).toMatchObject({
      type: 'paragraph',
      children: [
        {type: 'text', value: 'Alpha'},
        {type: 'break'},
        {type: 'text', value: 'Beta'},
      ],
    });
    for (const source of ['Alpha \nBeta', 'Alpha\t\nBeta']) {
      expect(
        parseMarkdownAst(source, {
          plugins: [markdownSoftBreaksPlugin],
        }).children[0],
      ).toMatchObject({
        type: 'paragraph',
        children: [
          {
            type: 'text',
            value: source.startsWith('Alpha\t') ? 'Alpha\t' : 'Alpha ',
          },
          {type: 'break'},
          {type: 'text', value: 'Beta'},
        ],
      });
    }
    expect(
      parseMarkdownAst('Alpha  \nBeta', {
        plugins: [markdownSoftBreaksPlugin],
      }).children[0],
    ).toMatchObject({
      type: 'paragraph',
      children: [
        {type: 'text', value: 'Alpha'},
        {type: 'break'},
        {type: 'text', value: 'Beta'},
      ],
    });
  });

  it('preserves the no-plugin path and opaque contexts', () => {
    expect(
      parseMarkdownAst('No line ending', {
        plugins: [markdownSoftBreaksPlugin],
      }),
    ).toEqual(parseMarkdownAst('No line ending'));

    const baseline = parseMarkdownAst(SOURCE);
    const transformed = parseMarkdownAst(SOURCE, {
      plugins: [markdownSoftBreaksPlugin],
    });

    expect(JSON.stringify(baseline)).not.toContain('"type":"break"');
    expect(JSON.stringify(transformed)).toContain('"type":"break"');
    expect(transformed.children).toMatchObject([
      {type: 'paragraph'},
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: '/docs',
            children: [
              {type: 'text', value: 'Linked'},
              {type: 'break'},
              {type: 'text', value: 'label'},
            ],
          },
          {type: 'text', value: ' and '},
          {type: 'inlineCode', value: 'inline code'},
          {type: 'text', value: '.'},
        ],
      },
      {type: 'code', value: 'fenced\ncode'},
    ]);
  });

  it('renders hard breaks during server rendering', () => {
    const html = renderToString(
      <Markdown plugins={[markdownSoftBreaksPlugin]}>{'Alpha\nBeta'}</Markdown>,
    );

    expect(html).toContain('Alpha<br/>Beta');
    expectTypeOf(markdownSoftBreaksPlugin).toMatchTypeOf<
      MarkdownPluginEntry<never>
    >();
  });

  it('is deterministic and converges across streaming prefixes', () => {
    const prefixes = ['Alpha', 'Alpha\n', 'Alpha\nBeta'];
    const snapshots = prefixes.map(source =>
      parseMarkdownAstInternal(
        source,
        {plugins: [markdownSoftBreaksPlugin]},
        false,
      ),
    );

    expect(snapshots[0]).toEqual(
      parseMarkdownAstInternal(
        prefixes[0],
        {plugins: [markdownSoftBreaksPlugin]},
        false,
      ),
    );
    expect(snapshots[1].children[0]).toMatchObject({
      type: 'paragraph',
      children: [{type: 'text', value: 'Alpha'}],
    });
    expect(snapshots[2]).toEqual(
      parseMarkdownAst(prefixes[2], {plugins: [markdownSoftBreaksPlugin]}),
    );
  });
});
