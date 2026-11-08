// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.public.test.ts
 * @input Imports Markdown parser, plugin factory, visitor, and node types from the public Markdown and plugin barrels
 * @output Compile-time compatibility coverage for legacy, math-enabled, and plugin results
 * @position Public API test guarding @astryxdesign/core/Markdown and /Markdown/plugins
 */

import {describe, expectTypeOf, it} from 'vitest';
import {
  createIncrementalState,
  decodeMarkdownCharacterReferences,
  parseInline,
  parseMarkdown,
  parseMarkdownIncremental,
  visitMarkdownNodes,
} from './index';
import {decodeMarkdownCharacterReferences as decodeFromParser} from './parser/index';
import {
  createMarkdownFenceTransform,
  createMarkdownHeadingLinks,
  createMarkdownPlugin,
  createMarkdownTextTransform,
  isMarkdownExtensionNode,
  markdownSoftBreaksPlugin,
  markdownSourceLinesPlugin,
} from './plugins';
import type {
  MarkdownExtensionNode,
  MarkdownFenceTransformOptions,
  MarkdownHeadingLinksOptions,
  MarkdownPluginEntry,
  MarkdownSyntaxPluginDefinition,
  MarkdownTransform,
} from './plugins';
import type {
  BlockNode,
  BlockNodeWithMath,
  InlineNode,
  InlineNodeWithMath,
  ParseOptions,
} from './index';

function assertNever(value: never): never {
  throw new Error(`Unexpected node: ${JSON.stringify(value)}`);
}

// Existing exhaustive consumers must not gain a new case when they do not opt
// into math parsing. These functions fail to compile if the legacy unions widen.
function legacyInlineText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
    case 'code':
      return node.content;
    case 'bold':
    case 'italic':
    case 'strikethrough':
    case 'link':
      return node.children.map(legacyInlineText).join('');
    case 'image':
      return node.alt;
    case 'citation':
      return node.sourceId;
    case 'break':
      return '\n';
    default:
      return assertNever(node);
  }
}

function legacyBlockText(node: BlockNode): string {
  switch (node.type) {
    case 'heading':
    case 'paragraph':
      return node.children.map(legacyInlineText).join('');
    case 'codeblock':
      return node.content;
    case 'blockquote':
      return node.children.map(legacyBlockText).join('\n');
    case 'list':
      return node.items
        .flatMap(item => item.children.map(legacyBlockText))
        .join('\n');
    case 'table':
      return [...node.headers, ...node.rows.flat()]
        .flatMap(cell => cell.children.map(legacyInlineText))
        .join(' ');
    case 'image':
      return node.alt;
    case 'hr':
      return '';
    default:
      return assertNever(node);
  }
}

describe('decodeMarkdownCharacterReferences entry points (spec:AST-061 DEC-5)', () => {
  it('is the same function from the Markdown entry and the parser subpath', () => {
    expectTypeOf(decodeMarkdownCharacterReferences).toEqualTypeOf<
      (text: string) => string
    >();
    expectTypeOf(decodeFromParser).toEqualTypeOf<(text: string) => string>();
  });
});

describe('Markdown public parser types', () => {
  it('keeps default and legacy parser calls on the legacy unions', () => {
    expectTypeOf(parseInline('plain')).toEqualTypeOf<InlineNode[]>();
    expectTypeOf(parseInline('plain', new Set<string>())).toEqualTypeOf<
      InlineNode[]
    >();
    expectTypeOf(parseMarkdown('plain')).toEqualTypeOf<BlockNode[]>();
    expectTypeOf(parseMarkdown('plain', {math: false})).toEqualTypeOf<
      BlockNode[]
    >();
    const annotatedOptions: ParseOptions = {autolink: 'gfm'};
    expectTypeOf(parseInline('plain', annotatedOptions)).toEqualTypeOf<
      InlineNode[]
    >();
    expectTypeOf(parseMarkdown('plain', annotatedOptions)).toEqualTypeOf<
      BlockNode[]
    >();
    expectTypeOf(
      parseMarkdownIncremental(
        'plain',
        createIncrementalState(),
        annotatedOptions,
      ),
    ).toEqualTypeOf<BlockNode[]>();
    expectTypeOf(
      parseMarkdownIncremental('plain', createIncrementalState()),
    ).toEqualTypeOf<BlockNode[]>();
    expectTypeOf(createIncrementalState().settledBlocks).toEqualTypeOf<
      BlockNode[]
    >();
    expectTypeOf(legacyInlineText).returns.toBeString();
    expectTypeOf(legacyBlockText).returns.toBeString();
  });

  it('rejects ambiguous math options and structurally forged state', () => {
    function compileOnlyGuards() {
      const dynamicOptions: {math: boolean} = {math: true};
      // @ts-expect-error callers must narrow to ParseOptions or MathParseOptions
      parseMarkdown('$$x$$', dynamicOptions);

      const structuralState = {
        prevInput: '',
        settledText: '',
        settledBlocks: [] as BlockNode[],
        settledUpTo: 0,
      };
      // @ts-expect-error math caches must come from createIncrementalState<true>()
      parseMarkdownIncremental('$$x$$', structuralState, {math: true});
    }

    expectTypeOf(compileOnlyGuards).toBeFunction();
  });

  it('types direct and incremental math opt-ins with explicit math unions', () => {
    const inline = parseInline('$x$', {math: true});
    const direct = parseMarkdown('$$x$$', {math: true});
    const incremental = parseMarkdownIncremental(
      '$$x$$',
      createIncrementalState<true>(),
      {math: true},
    );

    // A state carries the same node contract as the parser result it caches.
    // @ts-expect-error math parsing requires a math-enabled incremental state
    parseMarkdownIncremental('$$x$$', createIncrementalState(), {math: true});

    expectTypeOf(inline).toEqualTypeOf<InlineNodeWithMath[]>();
    expectTypeOf(direct).toEqualTypeOf<BlockNodeWithMath[]>();
    expectTypeOf(incremental).toEqualTypeOf<BlockNodeWithMath[]>();
    expectTypeOf(createIncrementalState<true>().settledBlocks).toEqualTypeOf<
      BlockNodeWithMath[]
    >();
    expectTypeOf<
      Extract<InlineNodeWithMath, {type: 'math'}>['value']
    >().toBeString();
    expectTypeOf<
      Extract<BlockNodeWithMath, {type: 'math'}>['value']
    >().toBeString();
  });

  it('exports typed plugin construction and node-kind visitors', () => {
    type PublicNode = MarkdownExtensionNode<
      'public-demo',
      'token',
      {readonly label: string},
      'inline'
    >;
    const definition = {
      name: 'public-demo',
      apiVersion: 1,
      parseKey: 'v1',
      syntax: {
        inline: [
          {
            startsWith: ['::'],
            maxSpan: 20,
            tokenize: () => ({status: 'no-match'}) as const,
          },
        ],
      },
      renderers: {
        token: {
          render: () => null,
          toText: node => node.data.label,
        },
      },
    } satisfies MarkdownSyntaxPluginDefinition<'public-demo', PublicNode>;
    const plugin = createMarkdownPlugin<'public-demo', PublicNode>(definition);
    const headingLinksOptions: MarkdownHeadingLinksOptions = {
      headingIdPrefix: 'article',
    };
    const headingLinks = createMarkdownHeadingLinks(headingLinksOptions);
    const nodes = parseInline('plain', {plugins: [plugin] as const});

    expectTypeOf(nodes).toEqualTypeOf<InlineNode<PublicNode>[]>();
    expectTypeOf(headingLinks).toEqualTypeOf<MarkdownPluginEntry<never>>();
    expectTypeOf(createMarkdownHeadingLinks)
      .parameter(0)
      .toEqualTypeOf<MarkdownHeadingLinksOptions | undefined>();
    expectTypeOf(visitMarkdownNodes).toBeFunction();
    expectTypeOf(createMarkdownTextTransform).toBeFunction();
    expectTypeOf(markdownSoftBreaksPlugin).toEqualTypeOf<
      MarkdownPluginEntry<never>
    >();
    expectTypeOf(markdownSourceLinesPlugin).toEqualTypeOf<
      MarkdownPluginEntry<never>
    >();
    expectTypeOf(isMarkdownExtensionNode).toBeFunction();

    function compileOnlyPluginGuards() {
      // @ts-expect-error transforms that own extension nodes require renderers
      createMarkdownPlugin<'public-demo', PublicNode>({
        name: 'public-demo',
        apiVersion: 1,
        transform: root => root,
      });
    }
    expectTypeOf(compileOnlyPluginGuards).toBeFunction();
  });

  it('exports a language-narrowed semantic fence transform helper', () => {
    type PublicFenceNode = MarkdownExtensionNode<
      'public-semantic-fences',
      'diagram',
      {
        readonly code: string;
        readonly language: 'mermaid' | 'dot';
        readonly meta?: string;
      },
      'block'
    >;
    const options = {
      languages: ['mermaid', 'dot'] as const,
      createNode: ({language, code, meta}) => {
        expectTypeOf(language).toEqualTypeOf<'mermaid' | 'dot'>();
        expectTypeOf(code).toBeString();
        expectTypeOf(meta).toEqualTypeOf<string | undefined>();
        return {
          type: 'extension',
          plugin: 'public-semantic-fences',
          name: 'diagram',
          display: 'block',
          data: {
            code,
            language,
            ...(meta == null ? {} : {meta}),
          },
        } as const;
      },
    } satisfies MarkdownFenceTransformOptions<
      readonly ['mermaid', 'dot'],
      PublicFenceNode
    >;
    const transform = createMarkdownFenceTransform(options);
    const plugin = createMarkdownPlugin<
      'public-semantic-fences',
      PublicFenceNode
    >({
      name: 'public-semantic-fences',
      apiVersion: 1,
      transform,
      renderers: {
        diagram: {
          render: () => null,
          toText: node => node.data.code,
        },
      },
    });
    const typedTransform: MarkdownTransform<PublicFenceNode> = transform;

    expectTypeOf(typedTransform).toBeFunction();
    expectTypeOf(plugin).toEqualTypeOf<MarkdownPluginEntry<PublicFenceNode>>();

    function compileOnlyFenceGuards() {
      createMarkdownFenceTransform({
        languages: ['mermaid'],
        // @ts-expect-error fence helpers create data nodes; render belongs in renderers
        render: () => null,
      });
    }
    expectTypeOf(compileOnlyFenceGuards).toBeFunction();
  });
});
