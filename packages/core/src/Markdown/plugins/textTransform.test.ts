// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textTransform.test.ts
 * @input Text-transform helper selectors, callbacks, and protected contexts
 * @output Behavioral, ordering, typing, and work-count regression coverage
 * @position Acceptance tests for the optional Markdown text helper
 */

import {describe, expect, expectTypeOf, it, vi} from 'vitest';
import {parseInline, parseMarkdown, parseMarkdownAst} from '../parser';
import {createMarkdownPlugin} from './protocol';
import type {MarkdownExtensionNode} from './protocol';
import {createMarkdownTextTransform} from './textTransform';
import type {MarkdownTextTransformContext} from './textTransform';

type TodoNode = MarkdownExtensionNode<
  'todo-labels',
  'todo',
  {readonly label: string},
  'inline'
>;

function todoPlugin(
  onReplace?: (context: MarkdownTextTransformContext) => void,
) {
  return createMarkdownPlugin<'todo-labels', TodoNode>({
    name: 'todo-labels',
    apiVersion: 1,
    transform: createMarkdownTextTransform<TodoNode>({
      pattern: /TODO/g,
      requiredSubstrings: ['TODO'],
      replace(_match, context) {
        onReplace?.(context);
        return {
          type: 'extension',
          plugin: 'todo-labels',
          name: 'todo',
          display: 'inline',
          data: {label: 'TODO'},
        };
      },
    }),
    renderers: {
      todo: {
        render: ({node}) => node.data.label,
        toText: node => node.data.label,
      },
    },
  });
}

function extensionCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (count, child) => count + extensionCount(child),
      0,
    );
  }
  if (value == null || typeof value !== 'object') {
    return 0;
  }
  const record = value as Record<string, unknown>;
  const own = record.type === 'extension' ? 1 : 0;
  return (
    own +
    Object.values(record).reduce<number>(
      (count, child) => count + extensionCount(child),
      0,
    )
  );
}

describe('createMarkdownTextTransform', () => {
  it('replaces eligible prose and preserves protected contexts', () => {
    const parents: string[] = [];
    const plugin = todoPlugin(context => parents.push(context.parentType));
    const blocks = parseMarkdown(
      [
        'TODO **TODO** [TODO](/tasks) `TODO` [source]',
        '',
        '> TODO',
        '',
        '| Item |',
        '| --- |',
        '| TODO |',
        '',
        '```text',
        'TODO',
        '```',
      ].join('\n'),
      {plugins: [plugin], sourceIds: new Set(['source'])},
    );

    expect(extensionCount(blocks)).toBe(4);
    expect(parents).toEqual(['paragraph', 'strong', 'paragraph', 'tableCell']);
    expect(JSON.stringify(blocks)).toContain('"type":"link","href":"/tasks"');
    expect(JSON.stringify(blocks)).toContain('"type":"code","content":"TODO"');
  });

  it('runs helpers in plugin order and supports removal', () => {
    const replace = (name: string, pattern: RegExp, value: string) =>
      createMarkdownPlugin({
        name,
        apiVersion: 1,
        transform: createMarkdownTextTransform({
          pattern,
          requiredSubstrings: [pattern.source],
          replace: () => (value === '' ? [] : {type: 'text' as const, value}),
        }),
      });

    expect(
      parseMarkdown('A', {
        plugins: [replace('a-to-b', /A/g, 'B'), replace('b-to-c', /B/g, 'C')],
      }),
    ).toMatchObject([
      {
        type: 'paragraph',
        children: [{type: 'text', content: 'C'}],
      },
    ]);
    expect(
      parseMarkdown('Remove me', {
        plugins: [replace('remove', /Remove /g, '')],
      }),
    ).toMatchObject([
      {type: 'paragraph', children: [{type: 'text', content: 'me'}]},
    ]);
  });

  it('clones a hoisted replacement for each claim', () => {
    const replacement = {type: 'text' as const, value: 'done'};
    const plugin = createMarkdownPlugin({
      name: 'hoisted-replacement',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /X/g,
        requiredSubstrings: ['X'],
        replace: () => replacement,
      }),
    });

    expect(parseMarkdown('X X', {plugins: [plugin]})).toMatchObject([
      {
        type: 'paragraph',
        children: [
          {type: 'text', content: 'done'},
          {type: 'text', content: ' '},
          {type: 'text', content: 'done'},
        ],
      },
    ]);
  });

  it('does not invoke callbacks for absent or protected-only matches', () => {
    let replacements = 0;
    const plugin = todoPlugin(() => replacements++);

    parseMarkdown('No work here.', {plugins: [plugin]});
    expect(replacements).toBe(0);
    parseMarkdown('`TODO`\n\n```text\nTODO\n```', {plugins: [plugin]});
    expect(replacements).toBe(0);
  });

  it('uses case-insensitive source claims with case-insensitive patterns', () => {
    const plugin = createMarkdownPlugin({
      name: 'case-insensitive',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /todo/gi,
        requiredSubstrings: ['todo'],
        replace: () => ({type: 'text', value: 'done'}),
      }),
    });

    expect(parseMarkdown('TODO', {plugins: [plugin]})).toMatchObject([
      {type: 'paragraph', children: [{type: 'text', content: 'done'}]},
    ]);
    const unicodeCaseFold = createMarkdownPlugin({
      name: 'unicode-case-fold',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /Σ/gi,
        requiredSubstrings: ['Σ'],
        replace: () => ({type: 'text', value: 'sigma'}),
      }),
    });
    expect(parseMarkdown('ς', {plugins: [unicodeCaseFold]})).toMatchObject([
      {type: 'paragraph', children: [{type: 'text', content: 'sigma'}]},
    ]);
    const digits = createMarkdownPlugin({
      name: 'digits-without-prefilter',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /\d+/g,
        replace: match => ({type: 'text', value: `[${match[0]}]`}),
      }),
    });
    expect(parseMarkdown('Item 42', {plugins: [digits]})).toMatchObject([
      {
        type: 'paragraph',
        children: [
          {type: 'text', content: 'Item '},
          {type: 'text', content: '[42]'},
        ],
      },
    ]);
  });

  it('supports bounded claim extension and decline', () => {
    let replacements = 0;
    const plugin = createMarkdownPlugin({
      name: 'hash-tags',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /#/g,
        requiredSubstrings: ['#'],
        getEndIndex(text, match) {
          const end = text.indexOf(' ', match.index);
          return end < 0 ? text.length : end;
        },
        replace(match) {
          replacements++;
          return {type: 'text', value: match.index === 0 ? 'tag' : 'nested'};
        },
      }),
    });

    expect(parseInline('#one #two', {plugins: [plugin]})).toMatchObject([
      {type: 'text', content: 'tag'},
      {type: 'text', content: ' '},
      {type: 'text', content: 'nested'},
    ]);
    expect(replacements).toBe(2);
  });

  it('supports accepted zero-width insertions at text boundaries', () => {
    const start = createMarkdownPlugin({
      name: 'insert-start',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /^/g,
        replace: () => ({type: 'text', value: '['}),
      }),
    });
    const end = createMarkdownPlugin({
      name: 'insert-end',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /$/g,
        replace: () => ({type: 'text', value: ']'}),
      }),
    });

    expect(parseMarkdown('value', {plugins: [start]})).toMatchObject([
      {
        type: 'paragraph',
        children: [
          {type: 'text', content: '['},
          {type: 'text', content: 'value'},
        ],
      },
    ]);
    expect(parseMarkdown('value', {plugins: [end]})).toMatchObject([
      {
        type: 'paragraph',
        children: [
          {type: 'text', content: 'value'},
          {type: 'text', content: ']'},
        ],
      },
    ]);
  });

  it('advances declined zero-width matches by Unicode code point', () => {
    let replacements = 0;
    const astral = createMarkdownPlugin({
      name: 'astral-zero-width',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /(?=😀)/gu,
        requiredSubstrings: ['😀'],
        getEndIndex: () => false,
        replace: () => {
          replacements++;
          return {type: 'text', value: 'unexpected'};
        },
      }),
    });
    const end = createMarkdownPlugin({
      name: 'end-zero-width',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /$/gu,
        requiredSubstrings: ['😀'],
        getEndIndex: () => false,
        replace: () => {
          replacements++;
          return {type: 'text', value: 'unexpected'};
        },
      }),
    });

    expect(parseMarkdown('😀', {plugins: [astral, end]})).toMatchObject([
      {type: 'paragraph', children: [{type: 'text', content: '😀'}]},
    ]);
    expect(replacements).toBe(0);
  });

  it('requires a global pattern and keeps the helper typed as a transform', () => {
    expect(() =>
      createMarkdownTextTransform({
        pattern: /TODO/,
        requiredSubstrings: ['TODO'],
        replace: () => ({type: 'text', value: 'done'}),
      }),
    ).toThrow(/global flag/);
    expect(() =>
      createMarkdownTextTransform({
        pattern: /TODO/g,
        requiredSubstrings: [] as never,
        replace: () => ({type: 'text', value: 'done'}),
      }),
    ).toThrow(/requiredSubstring/);
    expect(() =>
      createMarkdownTextTransform({
        pattern: /TODO/g,
        requiredSubstrings: [42] as never,
        replace: () => ({type: 'text', value: 'done'}),
      }),
    ).toThrow(/requiredSubstrings/);
    const ownedTransform = createMarkdownTextTransform<TodoNode>({
      pattern: /TODO/g,
      requiredSubstrings: ['TODO'],
      replace: () => ({
        type: 'extension',
        plugin: 'todo-labels',
        name: 'todo',
        display: 'inline',
        data: {label: 'TODO'},
      }),
    });
    function compileOnlyRendererRequirement() {
      // @ts-expect-error a helper that owns extension nodes requires renderers
      createMarkdownPlugin({
        name: 'todo-labels',
        apiVersion: 1,
        transform: ownedTransform,
      });
    }
    expectTypeOf(compileOnlyRendererRequirement).toBeFunction();
    expectTypeOf(createMarkdownTextTransform).toBeFunction();
  });

  it('adopts a fresh replacement node and freezes it against later writes', () => {
    // A callback that builds a node per match hands over a fresh object, so
    // the helper puts it straight into the tree rather than copying it. That
    // is only safe because the node is frozen on the way in: whoever still
    // holds the reference cannot reach into the document afterwards.
    const handedOver: {type: 'text'; value: string}[] = [];
    const plugin = createMarkdownPlugin({
      name: 'fresh-nodes',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /TODO/g,
        requiredSubstrings: ['TODO'],
        replace: () => {
          const node = {type: 'text' as const, value: 'done'};
          handedOver.push(node);
          return node;
        },
      }),
    });

    const blocks = parseMarkdown('TODO and TODO again', {plugins: [plugin]});
    expect(handedOver).toHaveLength(2);
    expect(handedOver.every(node => Object.isFrozen(node))).toBe(true);

    // A late write by the caller is rejected and the document is unaffected.
    expect(() => {
      'use strict';
      handedOver[0].value = 'HACKED';
    }).toThrow(TypeError);
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        children: [
          {type: 'text', content: 'done'},
          {type: 'text', content: ' and '},
          {type: 'text', content: 'done'},
          {type: 'text', content: ' again'},
        ],
      },
    ]);
  });

  it('copies a replacement node the callback hands over more than once', () => {
    // One object cannot occupy two positions in the tree, and the first
    // position's node is already frozen. A callback that returns the same
    // object for every match therefore gets a copy from the second match on.
    const shared = {type: 'text' as const, value: 'done'};
    const plugin = createMarkdownPlugin({
      name: 'shared-node',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /TODO/g,
        requiredSubstrings: ['TODO'],
        replace: () => shared,
      }),
    });

    const root = parseMarkdownAst('TODO and TODO again', {plugins: [plugin]});
    const paragraph = root.children[0];
    if (paragraph.type !== 'paragraph') {
      throw new Error('Expected a paragraph');
    }
    const [first, , third] = paragraph.children;
    expect(first).not.toBe(third);
    expect(first).toEqual({type: 'text', value: 'done'});
    expect(third).toEqual({type: 'text', value: 'done'});

    // Both documents agree with a run whose callback allocates per match.
    expect(parseMarkdown('TODO and TODO again', {plugins: [plugin]})).toEqual(
      parseMarkdown('TODO and TODO again', {
        plugins: [
          createMarkdownPlugin({
            name: 'per-match-node',
            apiVersion: 1,
            transform: createMarkdownTextTransform({
              pattern: /TODO/g,
              requiredSubstrings: ['TODO'],
              replace: () => ({type: 'text', value: 'done'}),
            }),
          }),
        ],
      }),
    );
  });

  it('still rejects an unrepresentable node without freezing the batch', () => {
    const rejected = {
      type: 'text' as const,
      value: 'ok',
      position: {start: {offset: 0}, end: {offset: 2}},
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = createMarkdownPlugin({
      name: 'forged-provenance',
      apiVersion: 1,
      transform: createMarkdownTextTransform({
        pattern: /TODO/g,
        requiredSubstrings: ['TODO'],
        replace: () => rejected as never,
      }),
    });

    // Authored provenance is refused, the document keeps its source text,
    // and the caller's object is left exactly as it was.
    expect(parseMarkdown('TODO', {plugins: [plugin]})).toEqual(
      parseMarkdown('TODO'),
    );
    expect(Object.isFrozen(rejected)).toBe(false);
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });
});
