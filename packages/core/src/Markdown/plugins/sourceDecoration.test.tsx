// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sourceDecoration.test.tsx
 * @input Validated source ranges, overlapping claims, and decorated documents
 * @output Behavioral, determinism, invariance, streaming, and ownership coverage
 * @position Acceptance tests for the optional Markdown source-decoration helper
 */

import {renderToString} from 'react-dom/server';
import {describe, expect, expectTypeOf, it, vi} from 'vitest';
import {Markdown} from '../Markdown';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownAstIncremental,
  parseMarkdownIncremental,
  trimStreamingArtifacts,
} from '../parser';
import {createMarkdownPlugin} from './protocol';
import type {
  MarkdownExtensionNode,
  MarkdownSyntaxPluginDefinition,
  MarkdownTransform,
} from './protocol';
import {parseOutlineFromMarkdown} from '../../Outline/parseOutlineFromMarkdown';
import {
  createMarkdownSourceDecoration,
  getMarkdownSourceDecorations,
} from './sourceDecoration';
import type {MarkdownSourceDecoration} from './sourceDecoration';

const SOURCE = [
  '# Release notes',
  '',
  'Ada shipped the parser.',
  '',
  '> Quoted detail',
].join('\n');

type Seen = Map<string, ReadonlyArray<MarkdownSourceDecoration>>;

function spanOf(text: string, source: string = SOURCE) {
  const start = source.indexOf(text);
  expect(start).toBeGreaterThanOrEqual(0);
  return {start, end: start + text.length};
}

/**
 * Reads decorations back through the public protocol: a transform that runs
 * after the decorating one observes exactly what later plugins and rendering
 * observe.
 */
function observerPlugin(name: string, seen: Seen) {
  return createMarkdownPlugin({
    name,
    apiVersion: 1,
    transform(root) {
      seen.clear();
      root.children.forEach((block, index) => {
        seen.set(`${index}:${block.type}`, getMarkdownSourceDecorations(block));
      });
      return root;
    },
  });
}

function decorationPlugin(
  name: string,
  transform: MarkdownTransform<never>,
): ReturnType<typeof createMarkdownPlugin> {
  return createMarkdownPlugin({name, apiVersion: 1, transform});
}

function decorationsFor(
  source: string,
  ranges: ReadonlyArray<{start: number; end: number}>,
  name = 'hit',
): Seen {
  const seen: Seen = new Map();
  parseMarkdown(source, {
    plugins: [
      decorationPlugin(
        `${name}-decoration`,
        createMarkdownSourceDecoration({name, ranges}),
      ),
      observerPlugin(`${name}-observer`, seen),
    ],
  });
  return seen;
}

describe('createMarkdownSourceDecoration', () => {
  it('decorates positioned blocks without the caller opting into sourceRanges', () => {
    const paragraph = spanOf('Ada shipped the parser.');
    const seen: Seen = new Map();
    parseMarkdown(SOURCE, {
      plugins: [
        decorationPlugin(
          'covers-paragraph',
          createMarkdownSourceDecoration({
            name: 'review-hit',
            ranges: [{...paragraph, data: {reviewer: 'ada'}}],
          }),
        ),
        observerPlugin('covers-paragraph-observer', seen),
      ],
    });

    expect(seen.get('1:paragraph')).toEqual([
      {name: 'review-hit', data: {reviewer: 'ada'}},
    ]);
    expect(seen.get('0:heading')).toEqual([]);
    expect(seen.get('2:blockquote')).toEqual([]);
  });

  it('decorates every block a range touches, including partial overlap', () => {
    const heading = spanOf('# Release notes');
    const paragraph = spanOf('Ada shipped the parser.');

    // One range covering two whole blocks.
    const spanning = decorationsFor(SOURCE, [
      {start: heading.start, end: paragraph.end},
    ]);
    expect(spanning.get('0:heading')).toEqual([{name: 'hit'}]);
    expect(spanning.get('1:paragraph')).toEqual([{name: 'hit'}]);
    expect(spanning.get('2:blockquote')).toEqual([]);

    // A range strictly inside one block still decorates that block: a search
    // hit is a sub-span of the prose it was found in.
    const inside = decorationsFor(SOURCE, [spanOf('shipped')]);
    expect(inside.get('1:paragraph')).toEqual([{name: 'hit'}]);
    expect(inside.get('0:heading')).toEqual([]);

    // A range straddling a boundary touches both blocks.
    const straddling = decorationsFor(SOURCE, [
      {start: paragraph.end - 4, end: spanOf('> Quoted detail').start + 3},
    ]);
    expect(straddling.get('1:paragraph')).toEqual([{name: 'hit'}]);
    expect(straddling.get('2:blockquote')).toEqual([{name: 'hit'}]);
  });

  it('is observable through the rendered component without changing its output', () => {
    const paragraph = spanOf('Ada shipped the parser.');
    const seen: Seen = new Map();
    const plugins = [
      decorationPlugin(
        'component-decoration',
        createMarkdownSourceDecoration({
          name: 'search-hit',
          ranges: [paragraph],
        }),
      ),
      observerPlugin('component-observer', seen),
    ];

    const decorated = renderToString(
      <Markdown plugins={plugins}>{SOURCE}</Markdown>,
    );

    expect(seen.get('1:paragraph')).toEqual([{name: 'search-hit'}]);
    expect(decorated).toBe(renderToString(<Markdown>{SOURCE}</Markdown>));
  });

  it('is observable through Outline without changing heading identity', () => {
    const seen: Seen = new Map();
    const plugins = [
      decorationPlugin(
        'outline-decoration',
        createMarkdownSourceDecoration({
          name: 'search-hit',
          ranges: [spanOf('# Release notes')],
        }),
      ),
      observerPlugin('outline-observer', seen),
    ];

    expect(parseOutlineFromMarkdown(SOURCE, {plugins})).toEqual(
      parseOutlineFromMarkdown(SOURCE),
    );
    expect(seen.get('0:heading')).toEqual([{name: 'search-hit'}]);
  });

  it('exposes decorations only on the settled snapshot, never present then absent', () => {
    // An ordinary table: while it streams, the covering block is re-parsed
    // from paragraph to table and its extent changes under the range.
    const source = [
      '# Title',
      '',
      'Intro prose here.',
      '',
      '| Item | Detail |',
      '| --- | --- |',
      '| 1 | two |',
      '',
      'Tail prose.',
    ].join('\n');

    for (const target of [
      'Intro prose here.',
      '| Item | Detail |',
      '| 1 | two |',
      'Tail prose.',
    ]) {
      const start = source.indexOf(target);
      const range = {start, end: start + target.length};
      const seen: Seen = new Map();
      const plugins = [
        decorationPlugin(
          'streaming-decoration',
          createMarkdownSourceDecoration({name: 'hit', ranges: [range]}),
        ),
        observerPlugin('streaming-observer', seen),
      ];

      const state = createIncrementalState();
      const presence: boolean[] = [];
      for (let length = 1; length <= source.length; length++) {
        const chunk = source.slice(0, length);
        const isFinal = length === source.length;
        parseMarkdownIncremental(
          isFinal ? chunk : trimStreamingArtifacts(chunk, {}),
          state,
          {plugins, isFinal},
        );
        presence.push([...seen.values()].some(entries => entries.length > 0));
      }

      // Monotone by construction: absent while the source can still change,
      // present once it cannot. No present -> absent transition exists.
      expect(presence.slice(0, -1).every(shown => !shown)).toBe(true);
      expect(presence[presence.length - 1]).toBe(true);
    }
  });

  it('decorates blocks an earlier transform reordered', () => {
    const heading = spanOf('# Release notes');
    const quote = spanOf('> Quoted detail');
    // A transform that reverses the document puts spans out of source order,
    // so a sweep that assumed document order would miss or mis-assign them.
    const reverse = createMarkdownPlugin({
      name: 'reverse-blocks',
      apiVersion: 1,
      transform: root => ({...root, children: [...root.children].reverse()}),
    });
    const seen: Seen = new Map();
    parseMarkdown(SOURCE, {
      plugins: [
        reverse,
        decorationPlugin(
          'reordered',
          createMarkdownSourceDecoration({
            name: 'hit',
            ranges: [heading, {...quote, data: {tail: true}}],
          }),
        ),
        observerPlugin('reordered-observer', seen),
      ],
    });

    // Reversed order: blockquote, paragraph, heading.
    expect(seen.get('0:blockquote')).toEqual([
      {name: 'hit', data: {tail: true}},
    ]);
    expect(seen.get('1:paragraph')).toEqual([]);
    expect(seen.get('2:heading')).toEqual([{name: 'hit'}]);
  });

  it('resolves overlapping, duplicate, and unordered ranges deterministically', () => {
    const paragraph = spanOf('Ada shipped the parser.');
    const wide = {start: 0, end: paragraph.end};
    const run = () => {
      const seen: Seen = new Map();
      parseMarkdown(SOURCE, {
        plugins: [
          decorationPlugin(
            'overlaps',
            createMarkdownSourceDecoration({
              name: 'hit',
              ranges: [
                {...paragraph, data: {rank: 2}},
                wide,
                {...paragraph, data: {rank: 1}},
                // Exact duplicate of the first range.
                {...paragraph, data: {rank: 2}},
                paragraph,
              ],
            }),
          ),
          observerPlugin('overlaps-observer', seen),
        ],
      });
      return seen.get('1:paragraph');
    };

    // Sorted by start, then end, then payload; the repeated rank-2 range
    // collapses into one entry.
    expect(run()).toEqual([
      // The wide range starts first.
      {name: 'hit'},
      // Then the three paragraph-aligned ranges, payload-free first.
      {name: 'hit'},
      {name: 'hit', data: {rank: 1}},
      {name: 'hit', data: {rank: 2}},
    ]);
    expect(run()).toEqual(run());
  });

  it('records each range once per block however many blocks it sweeps', () => {
    const sections = 200;
    const source = Array.from(
      {length: sections},
      (_, index) => `Section ${index} prose.`,
    ).join('\n\n');
    // One range per block plus one range spanning the whole document.
    const ranges = [
      {start: 0, end: source.length},
      ...Array.from({length: sections}, (_, index) =>
        spanOf(`Section ${index} prose.`, source),
      ),
    ];
    const seen = decorationsFor(source, ranges);

    expect(seen.size).toBe(sections);
    for (let index = 0; index < sections; index++) {
      // The document-wide range and exactly this block's own range.
      expect(seen.get(`${index}:paragraph`)).toEqual([
        {name: 'hit'},
        {name: 'hit'},
      ]);
    }
  });

  it('appends later plugins after earlier ones', () => {
    const paragraph = spanOf('Ada shipped the parser.');
    const seen: Seen = new Map();
    parseMarkdown(SOURCE, {
      plugins: [
        decorationPlugin(
          'first-pass',
          createMarkdownSourceDecoration({name: 'first', ranges: [paragraph]}),
        ),
        decorationPlugin(
          'second-pass',
          createMarkdownSourceDecoration({name: 'second', ranges: [paragraph]}),
        ),
        observerPlugin('order-observer', seen),
      ],
    });

    expect(seen.get('1:paragraph')).toEqual([
      {name: 'first'},
      {name: 'second'},
    ]);
  });

  it('leaves parsed results, rendered output, and heading identity unchanged', () => {
    const decorated = decorationPlugin(
      'invariance',
      createMarkdownSourceDecoration({
        name: 'hit',
        ranges: [spanOf('# Release notes'), spanOf('Ada shipped the parser.')],
      }),
    );

    expect(parseMarkdown(SOURCE, {plugins: [decorated]})).toEqual(
      parseMarkdown(SOURCE),
    );
    expect(
      parseMarkdown(SOURCE, {sourceRanges: true, plugins: [decorated]}),
    ).toEqual(parseMarkdown(SOURCE, {sourceRanges: true}));

    const plain = renderToString(<Markdown>{SOURCE}</Markdown>);
    const withDecoration = renderToString(
      <Markdown plugins={[decorated]}>{SOURCE}</Markdown>,
    );
    expect(withDecoration).toBe(plain);
  });

  it('never mutates the document a transform received', () => {
    const paragraph = spanOf('Ada shipped the parser.');
    const before: ReadonlyArray<MarkdownSourceDecoration>[] = [];
    const after: ReadonlyArray<MarkdownSourceDecoration>[] = [];
    const capture = (
      name: string,
      sink: ReadonlyArray<MarkdownSourceDecoration>[],
    ) =>
      createMarkdownPlugin({
        name,
        apiVersion: 1,
        transform(root) {
          const block = root.children[1];
          sink.push(getMarkdownSourceDecorations(block));
          expect(Object.isFrozen(block)).toBe(true);
          return root;
        },
      });

    parseMarkdown(SOURCE, {
      plugins: [
        capture('mutation-before', before),
        decorationPlugin(
          'mutation-decorate',
          createMarkdownSourceDecoration({name: 'hit', ranges: [paragraph]}),
        ),
        capture('mutation-after', after),
      ],
    });

    expect(before).toEqual([[]]);
    expect(after).toEqual([[{name: 'hit'}]]);
  });

  it('freezes every sibling before an untrusted plugin observes the tree', () => {
    // A trusted helper carries undecorated siblings over by identity. Those
    // siblings must still be deeply frozen before plugin-authored code runs,
    // or a later plugin can mutate a node the helper never touched.
    const source = '# Title\n\nAlpha prose.\n\nBeta prose.\n\nGamma prose.';
    const target = source.indexOf('Beta prose.');
    const observed: {type: string; frozen: boolean; textFrozen: boolean}[] = [];
    let mutationRejected = false;

    const attacker = createMarkdownPlugin({
      name: 'sibling-attacker',
      apiVersion: 1,
      transform(root) {
        root.children.forEach(block => {
          const child =
            'children' in block
              ? (block.children[0] as object | undefined)
              : undefined;
          observed.push({
            type: block.type,
            frozen: Object.isFrozen(block),
            textFrozen: child == null || Object.isFrozen(child),
          });
        });
        // Attempt an in-place edit of an UNDECORATED sibling's text node.
        const victim = root.children[1];
        const text =
          victim.type === 'paragraph'
            ? (victim.children[0] as {value: string})
            : undefined;
        try {
          if (text != null) {
            text.value = 'HACKED';
          }
          mutationRejected = text?.value !== 'HACKED';
        } catch {
          mutationRejected = true;
        }
        return root;
      },
    });

    const blocks = parseMarkdown(source, {
      plugins: [
        decorationPlugin(
          'sibling-decoration',
          createMarkdownSourceDecoration({
            name: 'hit',
            ranges: [{start: target, end: target + 'Beta prose.'.length}],
          }),
        ),
        attacker,
      ],
    });

    expect(observed).toHaveLength(4);
    expect(observed.every(entry => entry.frozen && entry.textFrozen)).toBe(
      true,
    );
    expect(mutationRejected).toBe(true);
    // The undecorated sibling reached rendering unchanged.
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      children: [{type: 'text', content: 'Alpha prose.'}],
    });
  });

  it('leaves a prior streamed snapshot untouched when a later chunk decorates', () => {
    const source = 'Alpha prose.\n\nBeta prose.';
    const target = source.indexOf('Beta prose.');
    const plugins = [
      decorationPlugin(
        'snapshot-decoration',
        createMarkdownSourceDecoration({
          name: 'hit',
          ranges: [{start: target, end: target + 'Beta prose.'.length}],
        }),
      ),
    ];

    const state = createIncrementalState();
    const partial = parseMarkdownAstIncremental(
      source.slice(0, target),
      state,
      {plugins, isFinal: false},
    ).children;
    const partialSnapshot = JSON.parse(JSON.stringify(partial));
    const partialBlocks = [...partial];

    parseMarkdownAstIncremental(source, state, {plugins, isFinal: true});

    // The earlier snapshot is a settled value a caller may still hold: the
    // later chunk's decoration must not have reached back into it.
    expect(JSON.parse(JSON.stringify(partial))).toEqual(partialSnapshot);
    expect(partialBlocks.map(getMarkdownSourceDecorations)).toEqual(
      partialBlocks.map(() => []),
    );
  });

  it('copies caller ranges so later mutation cannot change decorations', () => {
    const paragraph = spanOf('Ada shipped the parser.');
    const payload = {reviewer: 'ada'};
    const ranges = [{...paragraph, data: payload}];
    const transform = createMarkdownSourceDecoration({name: 'hit', ranges});
    payload.reviewer = 'linus';
    ranges.push({start: 0, end: 4, data: payload});

    const seen: Seen = new Map();
    parseMarkdown(SOURCE, {
      plugins: [
        decorationPlugin('immutable-options', transform),
        observerPlugin('immutable-options-observer', seen),
      ],
    });

    expect(seen.get('1:paragraph')).toEqual([
      {name: 'hit', data: {reviewer: 'ada'}},
    ]);
    expect(seen.get('0:heading')).toEqual([]);
  });

  it('leaves plugin extension nodes to their owner', () => {
    type NoteNode = MarkdownExtensionNode<
      'decoration-notes',
      'note',
      {readonly body: string},
      'block'
    >;
    const source = ':::note\nOwned by the plugin\n:::\n\nAda shipped it.';
    const notes = createMarkdownPlugin<'decoration-notes', NoteNode>({
      name: 'decoration-notes',
      apiVersion: 1,
      parseKey: 'v1',
      syntax: {
        block: [
          {
            startsWith: [':::note'],
            maxSpan: 200,
            tokenize({source: input, offset, end, isFinal}) {
              const close = input.indexOf('\n:::', offset + 7);
              if (close < 0 || close + 4 > end) {
                return isFinal ? {status: 'no-match'} : {status: 'defer'};
              }
              return {
                status: 'match',
                end: close + 4,
                node: {
                  type: 'extension',
                  plugin: 'decoration-notes',
                  name: 'note',
                  display: 'block',
                  data: {body: input.slice(offset + 7, close).trim()},
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
    } satisfies MarkdownSyntaxPluginDefinition<'decoration-notes', NoteNode>);

    const seen: Seen = new Map();
    const blocks = parseMarkdown(source, {
      plugins: [
        notes,
        decorationPlugin(
          'extension-ownership',
          createMarkdownSourceDecoration({
            name: 'hit',
            ranges: [{start: 0, end: source.length}],
          }),
        ),
        observerPlugin('extension-ownership-observer', seen),
      ],
    });

    expect(seen.get('0:extension')).toEqual([]);
    expect(seen.get('1:paragraph')).toEqual([{name: 'hit'}]);
    expect(blocks[0]).toMatchObject({
      type: 'extension',
      data: {body: 'Owned by the plugin'},
    });
  });

  it('stores decorations in a versioned Core-owned envelope', () => {
    const root = parseMarkdownAst(SOURCE, {
      plugins: [
        decorationPlugin(
          'envelope-shape',
          createMarkdownSourceDecoration({
            name: 'hit',
            ranges: [spanOf('Ada shipped the parser.')],
          }),
        ),
      ],
    });

    expect(root.children[1]?.data).toEqual({
      'astryx:sourceDecorations': {
        kind: 'astryx.markdown.sourceDecorations',
        version: 1,
        entries: [{name: 'hit'}],
      },
    });
  });

  it('never merges into foreign data and reports the skip once', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seen: Seen = new Map();
    // Two foreign shapes: an opaque scalar, and an unbranded array parked at
    // the envelope key by another plugin.
    const foreign = createMarkdownPlugin({
      name: 'foreign-data',
      apiVersion: 1,
      transform(root) {
        return {
          ...root,
          children: root.children.map(block => {
            if (block.type === 'heading') {
              return {...block, data: 'opaque'};
            }
            if (block.type === 'blockquote') {
              return {
                ...block,
                data: {'astryx:sourceDecorations': [{name: 'forged'}]},
              };
            }
            return block;
          }),
        };
      },
    });

    parseMarkdown(SOURCE, {
      plugins: [
        foreign,
        decorationPlugin(
          'foreign-data-decoration',
          createMarkdownSourceDecoration({
            name: 'hit',
            ranges: [{start: 0, end: SOURCE.length}],
          }),
        ),
        observerPlugin('foreign-data-observer', seen),
      ],
    });

    expect(seen.get('0:heading')).toEqual([]);
    expect(seen.get('2:blockquote')).toEqual([]);
    expect(seen.get('1:paragraph')).toEqual([{name: 'hit'}]);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0]?.[0]).toContain('foreign-data-decoration');
    warning.mockRestore();
  });

  it('keeps unrelated data on a node it decorates', () => {
    const paragraph = spanOf('Ada shipped the parser.');
    const annotate = createMarkdownPlugin({
      name: 'annotate-first',
      apiVersion: 1,
      transform(root) {
        return {
          ...root,
          children: root.children.map(block =>
            block.type === 'paragraph'
              ? {...block, data: {owner: 'ada'}}
              : block,
          ),
        };
      },
    });

    const root = parseMarkdownAst(SOURCE, {
      plugins: [
        annotate,
        decorationPlugin(
          'annotate-decoration',
          createMarkdownSourceDecoration({name: 'hit', ranges: [paragraph]}),
        ),
      ],
    });

    expect(root.children[1]?.data).toEqual({
      owner: 'ada',
      'astryx:sourceDecorations': {
        kind: 'astryx.markdown.sourceDecorations',
        version: 1,
        entries: [{name: 'hit'}],
      },
    });
  });

  it('rejects invalid options at creation', () => {
    expect(() =>
      createMarkdownSourceDecoration({name: ' ', ranges: []}),
    ).toThrow(TypeError);
    expect(() =>
      createMarkdownSourceDecoration({
        name: 'hit',
        ranges: [{start: 4, end: 4}],
      }),
    ).toThrow(TypeError);
    expect(() =>
      createMarkdownSourceDecoration({
        name: 'hit',
        ranges: [{start: -1, end: 4}],
      }),
    ).toThrow(TypeError);
    expect(() =>
      createMarkdownSourceDecoration({
        name: 'hit',
        ranges: [{start: 0, end: 1.5}],
      }),
    ).toThrow(TypeError);
    expect(() =>
      createMarkdownSourceDecoration({
        name: 'hit',
        ranges: [
          {start: 0, end: 4, data: {render: (() => null) as unknown as string}},
        ],
      }),
    ).toThrow(TypeError);
  });

  it('treats an empty range list as a no-op transform', () => {
    const seen = decorationsFor(SOURCE, []);
    expect([...seen.values()].flat()).toEqual([]);
  });

  it('types as an extension-free transform and reads only its own envelope', () => {
    const transform = createMarkdownSourceDecoration({
      name: 'hit',
      ranges: [{start: 0, end: 4}],
    });
    expectTypeOf(transform).toExtend<MarkdownTransform<never>>();
    // A decoration plugin introduces no extension nodes, so it needs no
    // renderers.
    const plugin = createMarkdownPlugin({
      name: 'typed-decoration',
      apiVersion: 1,
      transform,
    });
    expectTypeOf(plugin.name).toEqualTypeOf<string>();
    expectTypeOf(getMarkdownSourceDecorations({})).toEqualTypeOf<
      ReadonlyArray<MarkdownSourceDecoration>
    >();

    expect(getMarkdownSourceDecorations({data: 'opaque'})).toEqual([]);
    expect(
      getMarkdownSourceDecorations({data: {decorations: [{name: 'x'}]}}),
    ).toEqual([]);
    expect(
      getMarkdownSourceDecorations({
        data: {'astryx:sourceDecorations': [{name: 'x'}]},
      }),
    ).toEqual([]);
    expect(
      getMarkdownSourceDecorations({
        data: {
          'astryx:sourceDecorations': {
            kind: 'astryx.markdown.sourceDecorations',
            version: 2,
            entries: [{name: 'x'}],
          },
        },
      }),
    ).toEqual([]);
    expect(
      getMarkdownSourceDecorations({
        data: {
          'astryx:sourceDecorations': {
            kind: 'astryx.markdown.sourceDecorations',
            version: 1,
            entries: [{name: 'x'}],
          },
        },
      }),
    ).toEqual([{name: 'x'}]);
  });
});
