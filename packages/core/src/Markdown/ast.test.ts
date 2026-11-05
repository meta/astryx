// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownAst,
} from './parser';
import {markdownAstText} from './ast';
import {createMarkdownPlugin} from './plugins';
import type {
  MarkdownExtensionNode,
  MarkdownSyntaxPluginDefinition,
} from './plugins';

type DemoNoteNode = MarkdownExtensionNode<
  'demo-notes',
  'note',
  {readonly body: string},
  'block'
>;

const demoNotes = createMarkdownPlugin<'demo-notes', DemoNoteNode>({
  name: 'demo-notes',
  apiVersion: 1,
  parseKey: 'v1',
  syntax: {
    block: [
      {
        startsWith: [':::note'],
        maxSpan: 200,
        tokenize({source, offset, end, isFinal}) {
          const close = source.indexOf('\n:::', offset + 7);
          if (close < 0 || close + 4 > end) {
            return isFinal ? {status: 'no-match'} : {status: 'defer'};
          }
          return {
            status: 'match',
            end: close + 4,
            node: {
              type: 'extension',
              plugin: 'demo-notes',
              name: 'note',
              display: 'block',
              data: {body: source.slice(offset + 7, close).trim()},
            },
          };
        },
      },
    ],
  },
  renderers: {
    note: {
      render: ({node}) => node.data.body,
      toText: node => node.data.body,
    },
  },
} satisfies MarkdownSyntaxPluginDefinition<'demo-notes', DemoNoteNode>);

describe('canonical Markdown AST', () => {
  it('uses MDAST-aligned names and fields for every built-in structure', () => {
    const ast = parseMarkdownAst(
      '# Title\n\n**bold** and *emphasis* with `code` and [link](/docs).\n\n- item\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst value = 1;\n```\n\n---',
    );

    expect(ast).toMatchObject({
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{type: 'text', value: 'Title'}],
        },
        {
          type: 'paragraph',
          children: [
            {type: 'strong'},
            {type: 'text'},
            {type: 'emphasis'},
            {type: 'text'},
            {type: 'inlineCode', value: 'code'},
            {type: 'text'},
            {type: 'link', url: '/docs'},
            {type: 'text', value: '.'},
          ],
        },
        {
          type: 'list',
          ordered: false,
          children: [{type: 'listItem'}],
        },
        {
          type: 'table',
          align: [null, null],
          children: [
            {
              type: 'tableRow',
              children: [{type: 'tableCell'}, {type: 'tableCell'}],
            },
            {
              type: 'tableRow',
              children: [{type: 'tableCell'}, {type: 'tableCell'}],
            },
          ],
        },
        {type: 'code', lang: 'ts', value: 'const value = 1;'},
        {type: 'thematicBreak'},
      ],
    });
  });

  it('represents remaining built-ins without legacy aliases', () => {
    const ast = parseMarkdownAst(
      '> quote\n\n![Block](/block.png)\n\nParagraph ![Inline](/inline.png) [src] $x$  \nnext\n\n$$\ny\n$$',
      {math: true, sourceIds: new Set(['src'])},
    );

    expect(ast.children).toMatchObject([
      {
        type: 'blockquote',
        children: [
          {type: 'paragraph', children: [{type: 'text', value: 'quote'}]},
        ],
      },
      {type: 'image', url: '/block.png', alt: 'Block'},
      {
        type: 'paragraph',
        children: [
          {type: 'text', value: 'Paragraph '},
          {type: 'image', url: '/inline.png', alt: 'Inline'},
          {type: 'text', value: ' '},
          {type: 'citation', sourceId: 'src'},
          {type: 'text', value: ' '},
          {type: 'inlineMath', value: 'x'},
          {type: 'break'},
          {type: 'text', value: 'next'},
        ],
      },
      {type: 'math', value: 'y'},
    ]);
    expect(parseMarkdownAst('```\nplain\n```').children[0]).toMatchObject({
      type: 'code',
      lang: null,
      value: 'plain',
    });
    expect(parseMarkdown('```\nplain\n```')[0]).toEqual({
      type: 'codeblock',
      language: 'plaintext',
      content: 'plain',
    });
  });

  it('keeps lazy continuation text and source provenance in its owning block', () => {
    const source = '> quoted\ncontinued lazily';
    const ast = parseMarkdownAst(source);
    const quote = ast.children[0];

    expect(ast.children).toHaveLength(1);
    expect(quote).toMatchObject({
      type: 'blockquote',
      position: {start: {offset: 0}, end: {offset: source.length}},
      children: [
        {
          type: 'paragraph',
          children: [{type: 'text', value: 'quoted\ncontinued lazily'}],
        },
      ],
    });
    if (quote?.type !== 'blockquote') {
      throw new Error('Expected blockquote');
    }
    const paragraph = quote.children[0];
    if (paragraph?.type !== 'paragraph') {
      throw new Error('Expected paragraph');
    }
    expect(markdownAstText(paragraph.children, () => '')).toBe(
      'quoted\ncontinued lazily',
    );
    expect(parseMarkdown(source, {sourceRanges: true})[0]?.range).toEqual({
      start: 0,
      end: source.length,
    });

    const listSource = '- listed\ncontinued lazily';
    const list = parseMarkdownAst(listSource).children[0];
    expect(list).toMatchObject({
      type: 'list',
      position: {start: {offset: 0}, end: {offset: listSource.length}},
      children: [
        {
          type: 'listItem',
          children: [
            {
              type: 'paragraph',
              children: [{type: 'text', value: 'listed\ncontinued lazily'}],
            },
          ],
        },
      ],
    });
  });

  it('lets block plugin syntax interrupt a lazy continuation', () => {
    const ast = parseMarkdownAst('> quoted\n:::note\nBody\n:::', {
      plugins: [demoNotes],
    });

    expect(ast.children).toMatchObject([
      {type: 'blockquote'},
      {
        type: 'extension',
        plugin: 'demo-notes',
        name: 'note',
        data: {body: 'Body'},
      },
    ]);
  });

  it('keeps source provenance canonical while projecting the released range', () => {
    const source = '# Heading\n\nParagraph';
    const ast = parseMarkdownAst(source, {sourceRanges: true});
    const legacy = parseMarkdown(source, {sourceRanges: true});

    expect(ast.children[0].position).toEqual({
      start: {offset: 0},
      end: {offset: 9},
    });
    expect(legacy[0]).toEqual({
      type: 'heading',
      level: 1,
      children: [{type: 'text', content: 'Heading'}],
      range: {start: 0, end: 9},
    });
    expect('position' in legacy[0]).toBe(false);
  });

  it('authors canonical positions without the sourceRanges option', () => {
    const source = '# Heading\n\nParagraph\n\n> Quoted';
    const ast = parseMarkdownAst(source);

    // Transforms observe provenance on every top-level block whether or not
    // the caller opted into the released `range` projection.
    expect(ast.children.map(block => block.position)).toEqual([
      {start: {offset: 0}, end: {offset: 9}},
      {start: {offset: 11}, end: {offset: 20}},
      {start: {offset: 22}, end: {offset: 30}},
    ]);
    expect(
      parseMarkdownAst(source, {sourceRanges: true}).children.map(
        block => block.position,
      ),
    ).toEqual(ast.children.map(block => block.position));

    // Nested blocks remain a top-level-only contract.
    const quote = ast.children[2];
    if (quote.type !== 'blockquote') {
      throw new Error('Expected blockquote');
    }
    expect(quote.children[0].position).toBeUndefined();

    // The released projection is unchanged: no `range` unless asked for.
    expect(parseMarkdown(source)).toEqual([
      {
        type: 'heading',
        level: 1,
        children: [{type: 'text', content: 'Heading'}],
      },
      {type: 'paragraph', children: [{type: 'text', content: 'Paragraph'}]},
      {
        type: 'blockquote',
        children: [
          {type: 'paragraph', children: [{type: 'text', content: 'Quoted'}]},
        ],
      },
    ]);
  });

  it('keeps canonical positions off released extension nodes', () => {
    const source = ':::note\nBody\n:::\n\nTail prose.';
    const plugins = [demoNotes];

    // The projection rebuilds every built-in block field by field, but passes
    // an extension node through — so it is the one kind that could carry a
    // canonical position out. Without the option the released node is exactly
    // what it has always been.
    const released = parseMarkdown(source, {plugins});
    expect(released[0]).toEqual({
      type: 'extension',
      plugin: 'demo-notes',
      name: 'note',
      display: 'block',
      data: {body: 'Body'},
      source: ':::note\nBody\n:::',
    });
    expect('position' in released[0]).toBe(false);
    expect(Object.keys(released[0])).toEqual([
      'type',
      'plugin',
      'name',
      'display',
      'data',
      'source',
    ]);

    // With the option the node keeps the exact provenance it has always
    // exposed: `position` with offsets, and no `range`.
    const withRanges = parseMarkdown(source, {sourceRanges: true, plugins});
    expect(withRanges[0]).toEqual({
      type: 'extension',
      plugin: 'demo-notes',
      name: 'note',
      display: 'block',
      data: {body: 'Body'},
      source: ':::note\nBody\n:::',
      position: {start: {offset: 0}, end: {offset: 16}},
    });
    expect('range' in withRanges[0]).toBe(false);

    // The canonical tree carries provenance either way.
    expect(parseMarkdownAst(source, {plugins}).children[0].position).toEqual({
      start: {offset: 0},
      end: {offset: 16},
    });
  });

  it('preserves optional legacy keys and insertion order exactly', () => {
    const [image, list] = parseMarkdown('![Alt](/image.png)\n\n- item');

    expect(Object.keys(image)).toEqual(['type', 'alt', 'src']);
    expect(Object.keys(list)).toEqual([
      'type',
      'ordered',
      'start',
      'delimiter',
      'loose',
      'items',
    ]);
    if (list.type !== 'list') {
      throw new Error('Expected list');
    }
    expect(Object.keys(list.items[0])).toEqual(['checked', 'children']);
    expect(list).toStrictEqual({
      type: 'list',
      ordered: false,
      start: undefined,
      delimiter: undefined,
      loose: undefined,
      items: [
        {
          checked: undefined,
          children: [
            {
              type: 'paragraph',
              children: [{type: 'text', content: 'item'}],
            },
          ],
        },
      ],
    });
  });

  it('does not expose canonical fields through released parser results', () => {
    const state = createIncrementalState();
    const blocks = parseMarkdown('# Heading\n\nParagraph');

    expect(blocks[0]).toEqual({
      type: 'heading',
      level: 1,
      children: [{type: 'text', content: 'Heading'}],
    });
    expect('depth' in blocks[0]).toBe(false);
    expect(state.settledBlocks).toEqual([]);
  });
});
