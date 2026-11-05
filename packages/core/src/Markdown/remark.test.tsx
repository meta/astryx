// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file remark.test.tsx
 * @input Synchronous transform-only Remark plugins over the canonical Markdown tree
 * @output Round-trip, rejection, diagnostic, rendering, and bundle-isolation coverage
 * @position Compatibility evidence for the limited Remark profile in spec:AST-036
 */

import fs from 'node:fs';
import path from 'node:path';
import {renderToString} from 'react-dom/server';
import {render, screen} from '@testing-library/react';
import {describe, expect, expectTypeOf, it, vi} from 'vitest';
import {Markdown} from './Markdown';
import {parseInlineAst, parseMarkdown, parseMarkdownAst} from './parser';
import {createMarkdownPlugin} from './plugins';
import type {
  MarkdownExtensionNode,
  MarkdownPluginEntry,
  MarkdownSyntaxPluginDefinition,
  MarkdownTransformContext,
} from './plugins';
import type {MarkdownAstRoot} from './ast';
import type {MarkdownTransform} from './plugins';
import {createMarkdownRemarkTransform} from './remark';
import type {
  MarkdownRemarkFile,
  MarkdownRemarkPlugin,
  MarkdownRemarkRoot,
} from './remark';
import {parseOutlineFromMarkdown} from '../Outline/parseOutlineFromMarkdown';

type MutableNode = {
  type: string;
  children?: MutableNode[];
  [key: string]: unknown;
};

/** Minimal unist-style walk, matching how real Remark plugins traverse. */
function visit(node: MutableNode, visitor: (node: MutableNode) => void): void {
  visitor(node);
  if (Array.isArray(node.children)) {
    for (const entry of [...node.children]) {
      visit(entry, visitor);
    }
  }
}

function asTree(tree: MarkdownRemarkRoot): MutableNode {
  return tree as unknown as MutableNode;
}

/** Reads a file key through the guard; the value itself is never used. */
function probe(file: MarkdownRemarkFile, key: string): void {
  const record = file as unknown as Record<string, unknown>;
  // A plain member access, so the Proxy sees an ordinary read.
  void record[key];
}

/**
 * A realistic transform-only plugin in Unified's attacher shape: it wraps a
 * prose term in `strong` without touching code, link destinations, or any
 * other protected value.
 */
const remarkStrongTerm: MarkdownRemarkPlugin<[{term: string}]> =
  ({term}) =>
  (tree, file) => {
    let matches = 0;
    visit(asTree(tree), node => {
      if (!Array.isArray(node.children) || node.type === 'strong') {
        return;
      }
      node.children = node.children.flatMap(candidate => {
        if (candidate.type !== 'text' || typeof candidate.value !== 'string') {
          return [candidate];
        }
        const parts = candidate.value.split(term);
        if (parts.length === 1) {
          return [candidate];
        }
        matches += parts.length - 1;
        return parts.flatMap((part, index) =>
          index === 0
            ? part === ''
              ? []
              : [{type: 'text', value: part}]
            : [
                {type: 'strong', children: [{type: 'text', value: term}]},
                ...(part === '' ? [] : [{type: 'text', value: part}]),
              ],
        );
      });
    });
    if (matches > 0) {
      file.message(`wrapped ${matches} term(s)`);
    }
  };

/** A text-only rename, used to prove transformed heading identity. */
const remarkRenameTerm: MarkdownRemarkPlugin<[{from: string; to: string}]> =
  ({from, to}) =>
  tree => {
    visit(asTree(tree), node => {
      if (node.type === 'text' && typeof node.value === 'string') {
        node.value = node.value.split(from).join(to);
      }
    });
  };

const renameTermPlugin = createMarkdownPlugin({
  name: 'remark-rename-term',
  apiVersion: 1,
  transform: createMarkdownRemarkTransform(remarkRenameTerm, {
    from: 'Astryx',
    to: 'Astryx Design',
  }),
});

const removeFirstHeadingPlugin = createMarkdownPlugin({
  name: 'remark-remove-first-heading',
  apiVersion: 1,
  transform: createMarkdownRemarkTransform(() => tree => {
    const root = asTree(tree);
    const headingIndex = root.children?.findIndex(
      node => node.type === 'heading',
    );
    if (headingIndex != null && headingIndex >= 0) {
      root.children?.splice(headingIndex, 1);
    }
  }),
});

const strongTermPlugin = createMarkdownPlugin({
  name: 'remark-strong-term',
  apiVersion: 1,
  transform: createMarkdownRemarkTransform(remarkStrongTerm, {term: 'Astryx'}),
});

type NoteNode = MarkdownExtensionNode<
  'notes',
  'note',
  {readonly body: string},
  'block'
>;

const notePlugin = createMarkdownPlugin<'notes', NoteNode>({
  name: 'notes',
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
              plugin: 'notes',
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
      render: ({node}) => <aside data-testid="note">{node.data.body}</aside>,
      toText: node => node.data.body,
    },
  },
} satisfies MarkdownSyntaxPluginDefinition<'notes', NoteNode>);

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value != null && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested, seen);
    }
    Object.freeze(value);
  }
  return value;
}

interface RunResult {
  readonly root: MarkdownAstRoot<MarkdownExtensionNode>;
  readonly result: MarkdownAstRoot<MarkdownExtensionNode>;
  readonly reports: string[];
}

function runAdapter(
  source: string,
  plugin: MarkdownRemarkPlugin<[]>,
  options: {
    display?: 'inline' | 'block';
    sourceIds?: ReadonlySet<string>;
    plugins?: ReadonlyArray<MarkdownPluginEntry>;
  } = {},
): RunResult {
  const display = options.display ?? 'block';
  const parsed =
    display === 'inline'
      ? ({
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: parseInlineAst(source, options.sourceIds),
            },
          ],
        } as MarkdownAstRoot<MarkdownExtensionNode>)
      : (parseMarkdownAst(source, {
          sourceRanges: true,
          sourceIds: options.sourceIds,
          plugins: options.plugins ?? [],
        }) as MarkdownAstRoot<MarkdownExtensionNode>);
  const root = deepFreeze(parsed);
  const reports: string[] = [];
  const context: MarkdownTransformContext = {
    source,
    isFinal: true,
    display,
    report: message => reports.push(message),
  };
  const result = createMarkdownRemarkTransform(plugin)(root, context);
  return {root, result, reports};
}

const everyNodeSource = [
  '# Heading with `code` and *emphasis*',
  '',
  'Prose with **strong**, ~~struck~~, [a link](/docs), ![alt](/logo.png), a',
  'citation [ref], $x + y$ inline math, and a hard break.  ',
  'Second line.',
  '',
  '![standalone](/hero.png)',
  '',
  '> Quoted prose',
  '>',
  '> - nested item',
  '',
  '1) First',
  '2) Second',
  '',
  '- [ ] open task',
  '- [x] done task',
  '',
  '| Left | Right |',
  '| :--- | ----: |',
  '| a    | b     |',
  '',
  '```ts title="example.ts" {1,3}',
  'const value = 1;',
  '```',
  '',
  '```',
  'no language, no meta',
  '```',
  '',
  '$$',
  'a^2 + b^2',
  '$$',
  '',
  '---',
  '',
  ':::note',
  'An owned extension node.',
  ':::',
].join('\n');

describe('Remark adapter — supported round trip', () => {
  it('returns the identical document when every supported node is untouched', () => {
    const root = deepFreeze(
      parseMarkdownAst(everyNodeSource, {
        math: true,
        sourceRanges: true,
        sourceIds: new Set(['ref']),
        plugins: [notePlugin],
      }) as MarkdownAstRoot<MarkdownExtensionNode>,
    );
    const reports: string[] = [];
    const transform = createMarkdownRemarkTransform(() => () => undefined);
    const result = transform(root, {
      source: everyNodeSource,
      isFinal: true,
      display: 'block',
      report: message => reports.push(message),
    });

    // Identity, not just equality: every node round-tripped without loss, so
    // the adapter reuses the canonical tree instead of allocating a copy.
    expect(result).toBe(root);
    expect(reports).toEqual([]);
  });

  it('exposes the supported subset as a mutable mdast tree', () => {
    const seen: string[] = [];
    const codeNodes: MutableNode[] = [];
    runAdapter(everyNodeSource, () => tree => {
      visit(asTree(tree), node => {
        seen.push(node.type);
        if (node.type === 'code') {
          codeNodes.push(node);
        }
      });
    });

    expect(new Set(seen)).toEqual(
      new Set([
        'root',
        'heading',
        'paragraph',
        'text',
        'inlineCode',
        'emphasis',
        'strong',
        'delete',
        'link',
        'image',
        'break',
        'blockquote',
        'list',
        'listItem',
        'table',
        'tableRow',
        'tableCell',
        'code',
        'thematicBreak',
      ]),
    );
    // MDAST spelling on the way in: `meta` is the authored info string, or
    // `null` when the fence had none.
    expect(codeNodes[0]).toMatchObject({
      type: 'code',
      lang: 'ts',
      meta: 'title="example.ts" {1,3}',
      value: 'const value = 1;',
    });
    expect(codeNodes[1]).toMatchObject({
      type: 'code',
      lang: null,
      meta: null,
      value: 'no language, no meta',
    });
  });

  it('applies a compatible transform and keeps protected contexts literal', () => {
    const blocks = parseMarkdown(
      'Astryx ships `Astryx` and [Astryx](/astryx).',
      {plugins: [strongTermPlugin]},
    );

    expect(blocks).toMatchObject([
      {
        type: 'paragraph',
        children: [
          {type: 'bold', children: [{type: 'text', content: 'Astryx'}]},
          {type: 'text', content: ' ships '},
          {type: 'code', content: 'Astryx'},
          {type: 'text', content: ' and '},
          {
            type: 'link',
            href: '/astryx',
            children: [
              {type: 'bold', children: [{type: 'text', content: 'Astryx'}]},
            ],
          },
          {type: 'text', content: '.'},
        ],
      },
    ]);
  });

  it('leaves fenced code copyable and renders adapted output in the browser and on the server', () => {
    const source = 'Astryx docs\n\n```txt\nAstryx stays literal\n```';
    render(<Markdown plugins={[strongTermPlugin]}>{source}</Markdown>);

    expect(screen.getByText('Astryx')).toHaveRole('strong');
    expect(screen.getByText('Astryx stays literal')).toBeInTheDocument();

    const html = renderToString(
      <Markdown plugins={[strongTermPlugin]}>{source}</Markdown>,
    );
    expect(html).toContain('<strong');
    expect(html).toContain('Astryx stays literal');
  });

  it('shares transformed heading identity with Outline', () => {
    const source = '# Astryx release\n\nBody.';
    render(<Markdown plugins={[renameTermPlugin]}>{source}</Markdown>);
    const [item] = parseOutlineFromMarkdown(source, {
      plugins: [renameTermPlugin],
    });

    expect(item).toMatchObject({label: 'Astryx Design release', level: 1});
    expect(screen.getByRole('heading', {level: 1})).toHaveTextContent(
      'Astryx Design release',
    );
    expect(screen.getByRole('heading', {level: 1})).toHaveAttribute(
      'id',
      item.id,
    );
  });

  it('lets a transform remove a heading while Markdown and Outline keep surviving identity', () => {
    const source = '# Removed\n\n## Kept\n\nBody.';
    render(<Markdown plugins={[removeFirstHeadingPlugin]}>{source}</Markdown>);
    const outline = parseOutlineFromMarkdown(source, {
      plugins: [removeFirstHeadingPlugin],
    });

    expect(
      screen.queryByRole('heading', {name: 'Removed'}),
    ).not.toBeInTheDocument();
    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({label: 'Kept', level: 2});
    expect(
      screen.getByRole('heading', {name: 'Kept', level: 2}),
    ).toHaveAttribute('id', outline[0].id);
  });

  it('reports exactly one fixed diagnostic that cannot carry plugin text', () => {
    // Every channel a plugin could speak through quotes the document.
    const {reports} = runAdapter(
      'Astryx confidential-token',
      () => (tree, file) => {
        file.message('saw confidential-token at line 1');
        file.message('saw confidential-token again');
        asTree(tree).children?.push({type: 'html', value: '<b>x</b>'});
      },
    );

    expect(reports).toEqual([
      'Remark adapter: raw HTML has no Astryx representation',
    ]);
    expect(reports.join(' ')).not.toContain('confidential-token');
  });

  it('keeps a plugin-authored failure reason off the diagnostic', () => {
    const {reports} = runAdapter(
      'Astryx confidential-token',
      () => (_t, file) => file.fail('cannot handle "confidential-token"'),
    );

    expect(reports).toEqual([
      'Remark adapter: the plugin reported the document as unsupported',
    ]);
    expect(reports.join(' ')).not.toContain('confidential-token');
  });

  it('keeps a thrown error message off the diagnostic', () => {
    const {reports} = runAdapter('Astryx confidential-token', () => () => {
      throw new Error('failed parsing "confidential-token"');
    });

    expect(reports).toEqual(['Remark adapter: the plugin threw an error']);
    expect(reports.join(' ')).not.toContain('confidential-token');
  });

  it('keeps a successful run quiet even when the plugin records messages', () => {
    const {reports} = runAdapter(
      'Astryx prose',
      () => (_tree, file) => void file.message('informational'),
    );

    expect(reports).toEqual([]);
  });

  it('makes provenance tamper-proof rather than trusting the plugin', () => {
    let markers: symbol[] = [];
    runAdapter('Prose.', () => tree => {
      const paragraph = asTree(tree).children?.[0] ?? {};
      markers = Object.getOwnPropertySymbols(paragraph);
      for (const marker of markers) {
        const descriptor = Object.getOwnPropertyDescriptor(paragraph, marker);
        expect(descriptor).toMatchObject({
          configurable: false,
          writable: false,
        });
      }
    });

    expect(markers).toHaveLength(1);
  });

  it('gives every invocation a fresh tree and isolated file data', () => {
    const observed: unknown[] = [];
    const transform = createMarkdownRemarkTransform(
      () => (tree: MarkdownRemarkRoot, file: MarkdownRemarkFile) => {
        observed.push(file.data.runs);
        file.data.runs = 'first';
        asTree(tree).children?.push({type: 'thematicBreak'});
      },
    );
    const source = 'Body text';
    const root = deepFreeze(
      parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
    );
    const context: MarkdownTransformContext = {
      source,
      isFinal: true,
      display: 'block',
      report: () => {},
    };

    const first = transform(root, context);
    const second = transform(root, context);

    expect(observed).toEqual([undefined, undefined]);
    expect(root.children).toHaveLength(1);
    expect(first.children).toHaveLength(2);
    expect(second).toEqual(first);
  });
});

describe('Remark adapter — fenced code metadata', () => {
  const fenceSource = [
    '```ts title="example.ts" {1,3}',
    'const value = 1;',
    '```',
    '',
    '```',
    'bare fence',
    '```',
  ].join('\n');

  it('round-trips a parsed fence untouched, metadata included', () => {
    const root = deepFreeze(
      parseMarkdownAst(fenceSource, {
        sourceRanges: true,
      }) as MarkdownAstRoot<MarkdownExtensionNode>,
    );
    const reports: string[] = [];
    const result = createMarkdownRemarkTransform(() => () => undefined)(root, {
      source: fenceSource,
      isFinal: true,
      display: 'block',
      report: message => reports.push(message),
    });

    // Identity: a dropped or re-added `meta` would rebuild the node.
    expect(result).toBe(root);
    expect(reports).toEqual([]);
  });

  it('keeps the released code projection for a fence it rewrites', () => {
    const blocks = parseMarkdown(fenceSource, {
      plugins: [
        createMarkdownPlugin({
          name: 'uppercase-code',
          apiVersion: 1,
          transform: createMarkdownRemarkTransform(() => tree => {
            mutateFirst(tree, 'code', node => {
              node.value = String(node.value).toUpperCase();
            });
          }),
        }),
      ],
    });

    // The rewritten node keeps lang, meta, and the released language
    // projection the renderer reads.
    expect(blocks[0]).toMatchObject({
      type: 'codeblock',
      language: 'ts',
      content: 'CONST VALUE = 1;',
    });
    expect(blocks[1]).toMatchObject({
      type: 'codeblock',
      content: 'bare fence',
    });
  });

  it('carries metadata into and back out of a transform', () => {
    const seen: unknown[] = [];
    const {result} = runAdapter(fenceSource, () => tree => {
      visit(asTree(tree), node => {
        if (node.type === 'code') {
          seen.push(node.meta);
        }
      });
      mutateFirst(tree, 'code', node => {
        node.meta = 'title="renamed.ts"';
      });
    });

    expect(seen).toEqual(['title="example.ts" {1,3}', null]);
    expect(result.children[0]).toMatchObject({
      type: 'code',
      lang: 'ts',
      meta: 'title="renamed.ts"',
    });
  });

  it('rejects metadata Astryx cannot represent', () => {
    const {root, result, reports} = runAdapter(
      fenceSource,
      () => tree =>
        mutateFirst(tree, 'code', node => {
          node.meta = {title: 'example.ts'};
        }),
    );

    expect(result).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: a code node requires a string or null "meta"',
    ]);
  });
});

describe('Remark adapter — the constrained file fails closed', () => {
  const unsupportedKeys = [
    'path',
    'cwd',
    'history',
    'basename',
    'dirname',
    'extname',
    'stem',
    'stored',
    'result',
    'map',
    'contents',
  ];

  it.each(unsupportedKeys)('rejects reading file.%s', key => {
    const {root, result, reports} = runAdapter(
      'Prose.',
      () => (_tree, file) => {
        probe(file, key);
      },
    );

    expect(result).toBe(root);
    expect(reports).toEqual([
      `Remark adapter: the file has no "${key}" in this profile`,
    ]);
  });

  it('rejects reading an arbitrary key without echoing its name', () => {
    const {reports} = runAdapter('Prose.', () => (_tree, file) => {
      probe(file, 'secretProjectCodename');
    });

    expect(reports).toEqual([
      'Remark adapter: the file has no "unknown" in this profile',
    ]);
    expect(reports[0]).not.toContain('secretProjectCodename');
  });

  it.each(['path', 'cwd', 'value'])('rejects writing file.%s', key => {
    const {root, result, reports} = runAdapter(
      'Prose.',
      () => (_tree, file) => {
        (file as unknown as Record<string, unknown>)[key] = 'anything';
      },
    );

    expect(result).toBe(root);
    expect(reports).toEqual([
      `Remark adapter: the file's "${key}" cannot be assigned in this profile`,
    ]);
  });

  it('rejects defining or deleting a file property', () => {
    for (const mutate of [
      (file: MarkdownRemarkFile) =>
        Object.defineProperty(file, 'cwd', {value: '/'}),
      (file: MarkdownRemarkFile) =>
        delete (file as unknown as Record<string, unknown>).value,
    ]) {
      const {reports} = runAdapter('Prose.', () => (_tree, file) => {
        mutate(file);
      });
      expect(reports).toEqual([
        expect.stringMatching(/cannot be assigned in this profile$/),
      ]);
    }
  });

  it('lets a plugin feature-detect instead of failing', () => {
    const detected: Record<string, boolean> = {};
    const {root, result, reports} = runAdapter(
      'Prose.',
      () => (_tree, file) => {
        for (const key of ['cwd', 'path', 'data', 'message']) {
          detected[key] = key in file;
        }
        expect(Object.keys(file).sort()).toEqual([
          'data',
          'fail',
          'message',
          'messages',
          'toString',
          'value',
        ]);
      },
    );

    expect(detected).toEqual({
      cwd: false,
      path: false,
      data: true,
      message: true,
    });
    expect(result).toBe(root);
    expect(reports).toEqual([]);
  });

  it('serves the whole documented surface', () => {
    const observed: Record<string, unknown> = {};
    const {reports} = runAdapter('Document source.', () => (_tree, file) => {
      observed.value = file.value;
      observed.text = file.toString();
      observed.data = file.data;
      observed.messages = file.messages.length;
      file.data.note = 'kept';
      file.message('advisory');
      observed.afterMessage = file.messages.length;
    });

    expect(observed).toEqual({
      value: 'Document source.',
      text: 'Document source.',
      data: {note: 'kept'},
      messages: 0,
      afterMessage: 1,
    });
    expect(reports).toEqual([]);
  });
});

describe('Remark adapter — a plugin cannot talk its way out of a failure', () => {
  it('fails the run when the plugin swallows its own fail()', () => {
    const {root, result, reports} = runAdapter(
      'Prose.',
      () => (_tree, file) => {
        try {
          file.fail('cannot handle this document');
        } catch {
          // A plugin that carries on regardless has still declared the
          // document unsupported.
        }
      },
    );

    expect(result).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: the plugin reported the document as unsupported',
    ]);
  });

  it('keeps the verdict when the plugin swallows fail() and returns a tree', () => {
    const {root, result, reports} = runAdapter('Prose.', () => (tree, file) => {
      try {
        file.fail('cannot handle this document');
      } catch {
        // ignored
      }
      return tree;
    });

    expect(result).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: the plugin reported the document as unsupported',
    ]);
  });

  it('keeps the verdict when the plugin swallows fail() then throws its own error', () => {
    const {result, root, reports} = runAdapter(
      'Prose.',
      () => (_tree, file) => {
        try {
          file.fail('cannot handle this document');
        } catch {
          throw new Error('a different, friendlier-sounding message');
        }
      },
    );

    expect(result).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: the plugin reported the document as unsupported',
    ]);
  });

  it('lets the original verdict stand when a plugin steals the rejection class', () => {
    let stolen: (new (message: string) => Error) | undefined;
    const {root, result, reports} = runAdapter(
      'Prose.',
      () => (_tree, file) => {
        try {
          probe(file, 'cwd');
        } catch (error) {
          stolen = (error as Error).constructor as new (
            message: string,
          ) => Error;
        }
        // Carrying on after a guard fires does not clear the verdict.
      },
    );

    expect(stolen).toBeTypeOf('function');
    expect(result).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: the file has no "cwd" in this profile',
    ]);
  });

  it('never echoes a rejection forged from the stolen class in a later run', () => {
    let stolen: (new (message: string) => Error) | undefined;
    const transform = createMarkdownRemarkTransform(
      () => (_tree: MarkdownRemarkRoot, file: MarkdownRemarkFile) => {
        if (stolen == null) {
          try {
            probe(file, 'cwd');
          } catch (error) {
            stolen = (error as Error).constructor as new (
              message: string,
            ) => Error;
          }
          return;
        }
        throw new stolen('the document is perfectly fine, carry on');
      },
    );
    const reports: string[] = [];
    const run = (): MarkdownAstRoot<MarkdownExtensionNode> => {
      const source = 'Prose.';
      const root = deepFreeze(
        parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
      );
      const result = transform(root, {
        source,
        isFinal: true,
        display: 'block',
        report: message => reports.push(message),
      });
      expect(result).toBe(root);
      return result;
    };

    run();
    run();

    // The forged throw is an untracked instance, so only the generic reason
    // is reported — its own wording never reaches the diagnostic.
    expect(reports).toEqual([
      'Remark adapter: the file has no "cwd" in this profile',
      'Remark adapter: the plugin threw an error',
    ]);
    expect(reports.join(' ')).not.toContain('perfectly fine');
  });

  it('never echoes a rewritten message on a real rejection', () => {
    const {reports} = runAdapter('Prose.', () => (_tree, file) => {
      try {
        probe(file, 'cwd');
      } catch (error) {
        (error as Error).message = 'everything is fine';
        throw error;
      }
    });

    expect(reports).toEqual([
      'Remark adapter: the file has no "cwd" in this profile',
    ]);
  });

  it.each([
    [
      'reading a prohibited key',
      (file: MarkdownRemarkFile) => probe(file, 'cwd'),
    ],
    [
      'writing a prohibited key',
      (file: MarkdownRemarkFile) => {
        (file as unknown as Record<string, unknown>).cwd = '/tmp';
      },
    ],
    [
      'defining a property',
      (file: MarkdownRemarkFile) =>
        Object.defineProperty(file, 'path', {value: '/tmp/doc.md'}),
    ],
    [
      'deleting a property',
      (file: MarkdownRemarkFile) => {
        delete (file as unknown as Record<string, unknown>).value;
      },
    ],
  ])('fails the run when the plugin catches %s', (_name, trip) => {
    const {root, result, reports} = runAdapter('Prose.', () => (tree, file) => {
      try {
        trip(file);
      } catch {
        // Swallowed, then the plugin carries on as if nothing happened.
      }
      return tree;
    });

    expect(result).toBe(root);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatch(/^Remark adapter: the file\b/);
  });

  it('fails the attach when the plugin catches a processor access', () => {
    const sneaky = function sneaky(this: {data(key: string): unknown}) {
      try {
        this.data('micromarkExtensions');
      } catch {
        // Swallowed; the attacher returns a perfectly ordinary transformer.
      }
      return (tree: MarkdownRemarkRoot) => tree;
    };
    const transform = createMarkdownRemarkTransform(
      sneaky as unknown as MarkdownRemarkPlugin<[]>,
    );
    const source = 'Prose.';
    const root = deepFreeze(
      parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
    );
    const reports: string[] = [];

    expect(
      transform(root, {
        source,
        isFinal: true,
        display: 'block',
        report: message => reports.push(message),
      }),
    ).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: processor registration is outside the adapter',
    ]);
  });

  it('fails the run when the plugin catches a processor access at run time', () => {
    const {root, result, reports} = runAdapter(
      'Prose.',
      function attacher(this: {data(key: string): unknown}) {
        // A real plugin closes over the processor at attach time and reaches
        // for it later; the guard has to hold then too.
        const data = this.data.bind(this);
        return (tree: MarkdownRemarkRoot) => {
          try {
            data('micromarkExtensions');
          } catch {
            // Swallowed mid-transform.
          }
          return tree;
        };
      },
    );

    expect(result).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: processor registration is outside the adapter',
    ]);
  });

  it('keeps the first verdict when a plugin catches a guard and then fails', () => {
    const {reports} = runAdapter('Prose.', () => (_tree, file) => {
      try {
        probe(file, 'path');
      } catch {
        // ignored
      }
      file.fail('a different explanation');
    });

    expect(reports).toEqual([
      'Remark adapter: the file has no "path" in this profile',
    ]);
  });

  it('rejects output when a hostile then accessor trips a guard late', () => {
    // `then` is read after the transformer returns, so a guard that fires
    // inside the accessor lands after the first sticky check. The validated
    // output must still never be accepted.
    const {root, result, reports} = runAdapter(
      'Prose.',
      () => (tree: MarkdownRemarkRoot, file: MarkdownRemarkFile) => {
        const hostile = asTree(tree) as unknown as Record<string, unknown>;
        Object.defineProperty(hostile, 'then', {
          configurable: true,
          get() {
            try {
              probe(file, 'cwd');
            } catch {
              // Swallowed inside the accessor, mid-inspection.
            }
            return undefined;
          },
        });
        return tree;
      },
    );

    expect(result).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: the file has no "cwd" in this profile',
    ]);
  });

  it('rejects output when a guard fires while the result is being validated', () => {
    // A getter on a node the adapter reads during validation is the same
    // trap by another route: the refusal lands after every earlier check.
    const {root, result, reports} = runAdapter(
      'Prose.',
      () => (tree: MarkdownRemarkRoot, file: MarkdownRemarkFile) => {
        const paragraph = asTree(tree).children?.[0] as unknown as Record<
          string,
          unknown
        >;
        let tripped = false;
        const actual = paragraph.children as unknown[];
        Object.defineProperty(paragraph, 'children', {
          configurable: true,
          get(): unknown[] {
            if (!tripped) {
              tripped = true;
              try {
                probe(file, 'path');
              } catch {
                // Swallowed during validation.
              }
            }
            return actual;
          },
        });
        return tree;
      },
    );

    expect(result).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: the file has no "path" in this profile',
    ]);
  });

  it('ignores a message a plugin marks fatal by hand', () => {
    const {root, result, reports} = runAdapter(
      'Prose.',
      () => (_tree, file) => {
        const message = file.message('advisory');
        message.fatal = true;
        file.messages.push({
          reason: 'forged',
          fatal: true,
          place: null,
          ruleId: null,
          toString: () => 'forged',
        });
      },
    );

    // A run that did not actually fail still succeeds, silently.
    expect(result).toBe(root);
    expect(reports).toEqual([]);
  });
});

interface RejectionCase {
  readonly name: string;
  readonly plugin: MarkdownRemarkPlugin<[]>;
  readonly reason: RegExp;
  readonly source?: string;
  readonly display?: 'inline' | 'block';
  readonly sourceIds?: ReadonlySet<string>;
  readonly plugins?: ReadonlyArray<MarkdownPluginEntry>;
}

const rejectionSource = '# Astryx heading\n\nProse with [a link](/docs).';

function mutateFirst(
  tree: MarkdownRemarkRoot,
  type: string,
  mutate: (node: MutableNode) => void,
): void {
  let done = false;
  visit(asTree(tree), node => {
    if (!done && node.type === type) {
      done = true;
      mutate(node);
    }
  });
}

const rejectionCases: RejectionCase[] = [
  {
    name: 'an asynchronous transformer',
    plugin: () => async () => undefined,
    reason: /asynchronous transformer/,
  },
  {
    name: 'a callback-style transformer',
    plugin: () =>
      ((_tree: unknown, _file: unknown, _next: unknown) => undefined) as never,
    reason: /callback-style/,
  },
  {
    name: 'a parser or compiler plugin that registers processor state',
    plugin: function parserPlugin(this: {data(key: string): void}) {
      this.data('micromarkExtensions');
      return () => undefined;
    },
    reason: /processor registration/,
  },
  {
    name: 'a plugin that returns no transformer',
    plugin: () => undefined,
    reason: /transform-only plugin/,
  },
  {
    name: 'a plugin that returns a promise from its attacher',
    plugin: (() => ({then: () => undefined})) as never,
    reason: /asynchronous plugin/,
  },
  {
    name: 'raw HTML',
    plugin: () => tree =>
      void asTree(tree).children?.push({type: 'html', value: '<b>x</b>'}),
    reason: /raw HTML/,
  },
  {
    name: 'an unsupported node kind',
    plugin: () => tree =>
      void asTree(tree).children?.push({
        type: 'footnoteDefinition',
        identifier: 'a',
        children: [],
      }),
    reason: /"footnoteDefinition" is outside the supported MDAST subset/,
  },
  {
    name: 'a forged source position',
    plugin: () => tree =>
      void asTree(tree).children?.push({
        type: 'paragraph',
        children: [{type: 'text', value: 'forged'}],
        position: {start: {offset: 0}, end: {offset: 4}},
      }),
    reason: /cannot carry a source position/,
  },
  {
    name: 'a shifted source position',
    plugin: () => tree =>
      mutateFirst(tree, 'paragraph', node => {
        node.position = {start: {offset: 999}, end: {offset: 1200}};
      }),
    reason: /position must stay exactly as Core authored it/,
  },
  {
    name: 'a shifted line or column on an unchanged offset',
    plugin: () => tree =>
      mutateFirst(tree, 'paragraph', node => {
        const position = node.position as {
          start: {offset: number};
          end: {offset: number};
        };
        node.position = {
          start: {line: 99, column: 1, offset: position.start.offset},
          end: {line: 99, column: 9, offset: position.end.offset},
        };
      }),
    reason: /position must stay exactly as Core authored it/,
  },
  {
    name: 'a removed source position',
    plugin: () => tree =>
      mutateFirst(tree, 'paragraph', node => {
        delete node.position;
      }),
    reason: /position must stay exactly as Core authored it/,
  },
  {
    name: 'provenance rebuilt from a copied position',
    plugin: () => tree => {
      const root = asTree(tree);
      const paragraph = root.children?.find(node => node.type === 'paragraph');
      root.children = root.children?.map(node =>
        node === paragraph
          ? {
              type: 'paragraph',
              position: paragraph.position,
              children: [{type: 'text', value: 'rebuilt'}],
            }
          : node,
      );
    },
    reason: /cannot carry a source position/,
  },

  {
    name: 'a changed source heading depth',
    plugin: () => tree =>
      mutateFirst(tree, 'heading', node => {
        node.depth = 4;
      }),
    reason: /heading's depth cannot change/,
  },
  {
    name: 'a retyped source node',
    plugin: () => tree =>
      mutateFirst(tree, 'paragraph', node => {
        node.type = 'blockquote';
      }),
    reason: /cannot be retyped/,
  },
  {
    name: 'a duplicated source node',
    plugin: () => tree => {
      const root = asTree(tree);
      const first = root.children?.[0];
      if (first != null) {
        root.children?.push(first);
      }
    },
    reason: /cannot be duplicated/,
  },
  {
    name: 'an authored Astryx extension node',
    plugin: () => tree =>
      void asTree(tree).children?.push({
        type: 'extension',
        plugin: 'notes',
        name: 'note',
        display: 'block',
        data: {body: 'forged'},
      }),
    reason: /"extension" node cannot be authored or changed/,
  },
  {
    name: 'a rewritten Astryx citation',
    source: 'Prose with a citation [ref].',
    sourceIds: new Set(['ref']),
    plugin: () => tree =>
      mutateFirst(tree, 'citation', node => {
        node.sourceId = 'other';
      }),
    reason: /"citation" node cannot be authored or changed/,
  },
  {
    name: "an edited Astryx extension node's data",
    source: ':::note\nOwned body.\n:::',
    plugins: [notePlugin],
    plugin: () => tree =>
      mutateFirst(tree, 'extension', node => {
        node.data = {body: 'rewritten'};
      }),
    reason: /"extension" node cannot be authored or changed/,
  },
  {
    name: "an edited Astryx extension node's authored source",
    source: ':::note\nOwned body.\n:::',
    plugins: [notePlugin],
    plugin: () => tree =>
      mutateFirst(tree, 'extension', node => {
        node.source = ':::note\nforged\n:::';
      }),
    reason: /"extension" node cannot be authored or changed/,
  },
  {
    name: 'a raw-markup data channel',
    plugin: () => tree =>
      mutateFirst(tree, 'paragraph', node => {
        node.data = {hName: 'section'};
      }),
    reason: /raw-markup data channel "hName"/,
  },
  {
    name: 'unrepresentable node data',
    plugin: () => tree =>
      mutateFirst(tree, 'paragraph', node => {
        node.data = {render: () => null};
      }),
    reason: /data must be finite JSON-like/,
  },
  {
    name: 'unrepresentable file data',
    plugin: () => (_tree, file) => {
      file.data.cache = () => null;
    },
    reason: /file data must be finite JSON-like/,
  },
  {
    name: 'non-string fence metadata',
    source: '```ts\nconst a = 1;\n```',
    plugin: () => tree =>
      mutateFirst(tree, 'code', node => {
        node.meta = 42;
      }),
    reason: /requires a string or null "meta"/,
  },
  {
    name: 'an unrepresentable link title',
    plugin: () => tree =>
      mutateFirst(tree, 'link', node => {
        node.title = 'Docs';
      }),
    reason: /"title" has no Astryx representation/,
  },
  {
    name: 'an unsupported field on a supported node',
    plugin: () => tree =>
      mutateFirst(tree, 'paragraph', node => {
        node.hProperties = {className: 'x'};
      }),
    reason: /unsupported field "hProperties"/,
  },
  {
    name: 'a rejected link destination',
    plugin: () => tree =>
      mutateFirst(tree, 'link', node => {
        node.url = 'javascript:alert(1)';
      }),
    reason: /rejected by the navigation owner/,
  },
  {
    name: 'an image without its text alternative',
    source: '![alt](/logo.png)',
    plugin: () => tree =>
      mutateFirst(tree, 'image', node => {
        node.alt = null;
      }),
    reason: /requires its text alternative/,
  },
  {
    name: 'invalid built-in structure',
    plugin: () => tree =>
      mutateFirst(tree, 'paragraph', node => {
        node.children?.push({type: 'thematicBreak'});
      }),
    reason: /cannot be a child of a "paragraph" node/,
  },
  {
    name: 'a nested link',
    plugin: () => tree =>
      mutateFirst(tree, 'link', node => {
        node.children = [
          {type: 'link', url: '/inner', title: null, children: []},
        ];
      }),
    reason: /nested inside another link/,
  },
  {
    name: 'a loose list item',
    source: '- one\n- two',
    plugin: () => tree =>
      mutateFirst(tree, 'listItem', node => {
        node.spread = true;
      }),
    reason: /loose list item/,
  },
  {
    name: 'a ragged transformed table',
    source: '| a | b |\n| - | - |\n| c | d |',
    plugin: () => tree =>
      mutateFirst(tree, 'tableRow', node => {
        node.children?.pop();
      }),
    reason: /ragged rows/,
  },
  {
    name: 'block output from an inline entry point',
    display: 'inline',
    source: 'Inline Astryx prose',
    plugin: () => tree =>
      void asTree(tree).children?.push({
        type: 'paragraph',
        children: [{type: 'text', value: 'extra'}],
      }),
    reason: /one paragraph of phrasing content/,
  },
  {
    name: 'a transformer that throws',
    plugin: () => () => {
      throw new Error('boom');
    },
    reason: /^Remark adapter: the plugin threw an error$/,
  },
  {
    name: 'a transformer that fails the file',
    plugin: () => (_tree, file) => file.fail('unsupported document'),
    reason: /^Remark adapter: the plugin reported the document as unsupported$/,
  },
  {
    name: 'a transformer that returns a non-root node',
    plugin: () => () => ({type: 'paragraph', children: []}) as never,
    reason: /cannot be a child of|must return the document root|unsupported/,
  },
];

describe('Remark adapter — rejection matrix', () => {
  it.each(rejectionCases)(
    'keeps the last valid document after $name',
    ({plugin, reason, source, display, sourceIds, plugins}) => {
      const {root, result, reports} = runAdapter(
        source ?? rejectionSource,
        plugin,
        {display, sourceIds, plugins},
      );

      expect(result).toBe(root);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatch(/^Remark adapter: /);
      expect(reports[0]).toMatch(reason);
      // Diagnostics name contracts, never document source.
      expect(reports[0]).not.toContain('Astryx heading');
    },
  );

  it('renders readable source after a rejected transform', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = createMarkdownPlugin({
      name: 'broken-remark',
      apiVersion: 1,
      transform: createMarkdownRemarkTransform(() => tree => {
        asTree(tree).children?.push({
          type: 'html',
          value: '<script>x</script>',
        });
      }),
    });

    render(
      <Markdown plugins={[broken]}>
        {'# Still readable\n\nProse survives.'}
      </Markdown>,
    );

    expect(screen.getByRole('heading', {level: 1})).toHaveTextContent(
      'Still readable',
    );
    expect(screen.getByText('Prose survives.')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('<script>');
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it('keeps later plugins running after one adapted plugin fails', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = createMarkdownPlugin({
      name: 'failing-remark',
      apiVersion: 1,
      transform: createMarkdownRemarkTransform(() => () => {
        throw new Error('boom');
      }),
    });

    const blocks = parseMarkdown('Astryx ships', {
      plugins: [failing, strongTermPlugin],
    });

    expect(blocks).toMatchObject([
      {
        type: 'paragraph',
        children: [
          {type: 'bold', children: [{type: 'text', content: 'Astryx'}]},
          {type: 'text', content: ' ships'},
        ],
      },
    ]);
    warning.mockRestore();
  });

  it('rejects provenance smuggled in from another document', () => {
    let stashed: MutableNode | undefined;
    const transform = createMarkdownRemarkTransform(() => tree => {
      const root = asTree(tree);
      if (stashed == null) {
        stashed = root.children?.[0];
        return;
      }
      root.children?.push(stashed);
    });
    const reports: string[] = [];
    const run = (source: string): MarkdownAstRoot<MarkdownExtensionNode> => {
      const root = deepFreeze(
        parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
      );
      const result = transform(root, {
        source,
        isFinal: true,
        display: 'block',
        report: message => reports.push(message),
      });
      expect(result).toBe(root);
      return result;
    };

    run('First document.');
    run('Second document.');

    expect(reports).toEqual([
      'Remark adapter: a "paragraph" node carries forged provenance',
    ]);
  });

  it('rejects a plugin value that is not a function', () => {
    expect(() =>
      createMarkdownRemarkTransform({} as unknown as MarkdownRemarkPlugin<[]>),
    ).toThrow(/plugin must be a function/);
  });
});

/* ------------------------------------------------------------------ *
 * Compile fixture: a conventional Unified/Remark plugin type
 *
 * These declarations mirror `unified`'s own shapes without depending on the
 * package: an attacher bound to a processor, and a transformer that takes the
 * callback parameter and declares an asynchronous return union. Existing
 * typed plugins must type-check at the callsite; the run-time behavior for an
 * actual promise and for a callback-style transformer is asserted above.
 * ------------------------------------------------------------------ */

interface UnifiedPoint {
  line: number;
  column: number;
  offset?: number | undefined;
}

interface UnifiedNode {
  type: string;
  children?: UnifiedNode[];
  value?: string;
  position?: {start: UnifiedPoint; end: UnifiedPoint} | undefined;
  data?: Record<string, unknown> | undefined;
}

interface UnifiedRoot extends UnifiedNode {
  type: 'root';
  children: UnifiedNode[];
}

interface UnifiedVFile {
  value: string | Uint8Array;
  data: Record<string, unknown>;
  cwd: string;
  message(reason: string | Error): {reason: string};
  fail(reason: string | Error): never;
}

interface UnifiedProcessor {
  data(key: string): unknown;
  use(plugin: unknown): UnifiedProcessor;
}

/* eslint-disable @typescript-eslint/no-invalid-void-type -- Unified's own
   transformer and attacher types include `void`; the fixture is only faithful
   if it keeps them. */
type UnifiedTransformer = (
  tree: UnifiedRoot,
  file: UnifiedVFile,
  next: (error?: Error | null, tree?: UnifiedRoot) => undefined,
) => Promise<UnifiedRoot | undefined> | UnifiedRoot | undefined | void;

type UnifiedPlugin<Parameters extends unknown[] = []> = (
  this: UnifiedProcessor,
  ...parameters: Parameters
) => UnifiedTransformer | undefined | void;
/* eslint-enable @typescript-eslint/no-invalid-void-type */

const remarkConventional: UnifiedPlugin<[{flag: boolean}?]> =
  options => tree => {
    if (options?.flag === true) {
      tree.children = [];
    }
  };

const remarkNoSettings: UnifiedPlugin = () => tree => tree;

describe('Remark adapter — conventional plugin types', () => {
  it('accepts a conventional Unified plugin at the callsite', () => {
    // Compile fixture: these calls failing to type-check is the regression.
    const withSettings = createMarkdownRemarkTransform(remarkConventional, {
      flag: false,
    });
    const withoutSettings = createMarkdownRemarkTransform(remarkNoSettings);
    const inlineAstryxPlugin = createMarkdownRemarkTransform(
      () => (tree, file) => {
        // The strict overload still types the tree and file for new plugins.
        expectTypeOf(tree).toEqualTypeOf<MarkdownRemarkRoot>();
        expectTypeOf(file).toEqualTypeOf<MarkdownRemarkFile>();
        return tree;
      },
    );

    expectTypeOf(withSettings).toEqualTypeOf<MarkdownTransform<never>>();
    expectTypeOf(withoutSettings).toEqualTypeOf<MarkdownTransform<never>>();
    expectTypeOf(inlineAstryxPlugin).toEqualTypeOf<MarkdownTransform<never>>();
    expectTypeOf(createMarkdownRemarkTransform).parameter(0).not.toBeNever();

    // A conventional plugin also runs: a no-op leaves the document identical.
    const source = 'Prose stays put.';
    const root = deepFreeze(
      parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
    );
    const reports: string[] = [];
    expect(
      withoutSettings(root, {
        source,
        isFinal: true,
        display: 'block',
        report: message => reports.push(message),
      }),
    ).toBe(root);
    expect(reports).toEqual([]);
  });

  it('still rejects an actual promise from a conventional plugin', () => {
    const remarkAsync: UnifiedPlugin = () => async tree => tree;
    const transform = createMarkdownRemarkTransform(remarkAsync);
    const source = 'Prose stays put.';
    const root = deepFreeze(
      parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
    );
    const reports: string[] = [];

    expect(
      transform(root, {
        source,
        isFinal: true,
        display: 'block',
        report: message => reports.push(message),
      }),
    ).toBe(root);
    expect(reports).toEqual([
      'Remark adapter: an asynchronous transformer is outside the adapter',
    ]);
  });
});

describe('Remark adapter — a refused promise is never left unhandled', () => {
  /** Collects unhandled rejections for the duration of `work`. */
  async function withUnhandledRejections(work: () => void): Promise<unknown[]> {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      seen.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      work();
      // Unhandled rejections are reported a macrotask later.
      await new Promise(resolve => setTimeout(resolve, 50));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    return seen;
  }

  it('refuses an already-rejected transformer result without an unhandled rejection', async () => {
    const reports: string[] = [];
    const seen = await withUnhandledRejections(() => {
      const source = 'Astryx confidential-token';
      const root = deepFreeze(
        parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
      );
      const transform = createMarkdownRemarkTransform(
        () => () =>
          Promise.reject(
            new Error('failed on "confidential-token"'),
          ) as unknown as MarkdownRemarkRoot,
      );
      expect(
        transform(root, {
          source,
          isFinal: true,
          display: 'block',
          report: message => reports.push(message),
        }),
      ).toBe(root);
    });

    expect(reports).toEqual([
      'Remark adapter: an asynchronous transformer is outside the adapter',
    ]);
    expect(seen).toEqual([]);
  });

  it('refuses a rejected attacher result without an unhandled rejection', async () => {
    const reports: string[] = [];
    const seen = await withUnhandledRejections(() => {
      const source = 'Astryx confidential-token';
      const root = deepFreeze(
        parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
      );
      const rejectingAttacher = async (): Promise<never> => {
        throw new Error('attach failed on "confidential-token"');
      };
      const transform = createMarkdownRemarkTransform(
        rejectingAttacher as unknown as MarkdownRemarkPlugin<[]>,
      );
      expect(
        transform(root, {
          source,
          isFinal: true,
          display: 'block',
          report: message => reports.push(message),
        }),
      ).toBe(root);
    });

    expect(reports).toEqual([
      'Remark adapter: an asynchronous plugin is outside the adapter',
    ]);
    expect(seen).toEqual([]);
  });

  it('defuses a rejected promise even when a caught guard outranks it', async () => {
    // The ordering trap: the sticky verdict is reported, but the promise
    // must still be handled on the way past.
    const reports: string[] = [];
    const seen = await withUnhandledRejections(() => {
      const source = 'Astryx confidential-token';
      const root = deepFreeze(
        parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
      );
      const transform = createMarkdownRemarkTransform(
        () => (_tree: MarkdownRemarkRoot, file: MarkdownRemarkFile) => {
          try {
            probe(file, 'cwd');
          } catch {
            // Swallowed, then an async result on top of it.
          }
          return Promise.reject(
            new Error('async failure quoting confidential-token'),
          ) as unknown as MarkdownRemarkRoot;
        },
      );
      expect(
        transform(root, {
          source,
          isFinal: true,
          display: 'block',
          report: message => reports.push(message),
        }),
      ).toBe(root);
    });

    // The caught guard is what gets reported...
    expect(reports).toEqual([
      'Remark adapter: the file has no "cwd" in this profile',
    ]);
    // ...and the promise is still handled.
    expect(seen).toEqual([]);
  });

  it('defuses a rejected promise even when the plugin also caught its own fail()', async () => {
    const reports: string[] = [];
    const seen = await withUnhandledRejections(() => {
      const source = 'Prose.';
      const root = deepFreeze(
        parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
      );
      const transform = createMarkdownRemarkTransform(
        () => (_tree: MarkdownRemarkRoot, file: MarkdownRemarkFile) => {
          try {
            file.fail('cannot handle "confidential-token"');
          } catch {
            // Swallowed.
          }
          return Promise.reject(
            new Error('and an async failure too'),
          ) as unknown as MarkdownRemarkRoot;
        },
      );
      expect(
        transform(root, {
          source,
          isFinal: true,
          display: 'block',
          report: message => reports.push(message),
        }),
      ).toBe(root);
    });

    expect(reports).toEqual([
      'Remark adapter: the plugin reported the document as unsupported',
    ]);
    expect(seen).toEqual([]);
  });

  it('refuses a thenable whose then throws', async () => {
    const reports: string[] = [];
    const seen = await withUnhandledRejections(() => {
      const source = 'Prose.';
      const root = deepFreeze(
        parseMarkdownAst(source) as MarkdownAstRoot<MarkdownExtensionNode>,
      );
      const transform = createMarkdownRemarkTransform(
        () => () =>
          ({
            then() {
              throw new Error('hostile thenable');
            },
          }) as unknown as MarkdownRemarkRoot,
      );
      expect(
        transform(root, {
          source,
          isFinal: true,
          display: 'block',
          report: message => reports.push(message),
        }),
      ).toBe(root);
    });

    expect(reports).toEqual([
      'Remark adapter: an asynchronous transformer is outside the adapter',
    ]);
    expect(seen).toEqual([]);
  });

  it('renders readable server output for a rejected async plugin, quietly', async () => {
    const asyncPlugin = createMarkdownPlugin({
      name: 'async-remark',
      apiVersion: 1,
      transform: createMarkdownRemarkTransform(
        () => () =>
          Promise.reject(
            new Error('server-side failure quoting confidential-token'),
          ) as unknown as MarkdownRemarkRoot,
      ),
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let html = '';
    const seen = await withUnhandledRejections(() => {
      html = renderToString(
        <Markdown plugins={[asyncPlugin]}>
          {'# Still readable\n\nProse survives.'}
        </Markdown>,
      );
    });

    expect(html).toContain('Still readable');
    expect(html).toContain('Prose survives.');
    expect(html).not.toContain('confidential-token');
    expect(seen).toEqual([]);
    warning.mockRestore();
  });
});

describe('Remark adapter — optional by construction', () => {
  it('stays out of the Markdown entry point and parser modules', () => {
    for (const file of [
      'index.ts',
      'Markdown.tsx',
      'parser.ts',
      'plugins/protocol.ts',
    ]) {
      const contents = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(contents).not.toContain('./remark');
    }
  });

  it('is published as its own entry point', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'),
    ) as {exports: Record<string, {source?: string}>};

    expect(manifest.exports['./Markdown/remark']).toMatchObject({
      source: './src/Markdown/remark.ts',
    });
  });
});
