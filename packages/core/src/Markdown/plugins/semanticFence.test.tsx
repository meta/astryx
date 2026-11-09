// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file semanticFence.test.tsx
 * @input Semantic-fence helper, canonical transforms, and standard plugin renderers
 * @output Regression coverage for typing, immutability, precedence, fallback, and SSR
 * @position Focused acceptance tests for AST-036 semantic code fences
 */

import {render, screen} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {describe, expect, expectTypeOf, it, vi} from 'vitest';
import {Markdown} from '../Markdown';
import type {MarkdownAstRoot} from '../ast';
import {parseMarkdown, parseMarkdownAst} from '../parser';
import {
  applyMarkdownTransforms,
  createMarkdownPlugin,
  prepareMarkdownPlugins,
  type MarkdownExtensionNode,
  type MarkdownExtensionRenderer,
  type MarkdownTransform,
  type MarkdownTransformPluginDefinition,
} from './protocol';
import {
  createMarkdownFenceTransform,
  getMarkdownFenceProposal,
  type MarkdownFenceContext,
  type MarkdownFenceNode,
} from './semanticFence';

type DiagramData = {
  readonly code: string;
  readonly language: 'diagram';
  readonly meta?: string;
};

type DiagramNode<Name extends string = 'diagram-fences'> =
  MarkdownExtensionNode<Name, 'diagram', DiagramData, 'block'>;

function createDiagramNode<const Name extends string>(
  plugin: Name,
  context: MarkdownFenceContext<'diagram'>,
): MarkdownFenceNode<DiagramNode<Name>> {
  return {
    type: 'extension',
    plugin,
    name: 'diagram',
    display: 'block',
    data: {
      code: context.code,
      language: context.language,
      ...(context.meta == null ? {} : {meta: context.meta}),
    },
  };
}

function createFencePlugin<const Name extends string>(
  name: Name,
  render: MarkdownExtensionRenderer<DiagramNode<Name>>['render'],
  createNode: (
    context: MarkdownFenceContext<'diagram'>,
  ) => MarkdownFenceNode<DiagramNode<Name>> | null | undefined = context =>
    createDiagramNode(name, context),
) {
  return createMarkdownPlugin<Name, DiagramNode<Name>>({
    name,
    apiVersion: 1,
    transform: createMarkdownFenceTransform({
      languages: ['diagram'],
      createNode,
    }),
    renderers: {
      diagram: {
        render,
        toText: node => node.data.code,
      },
    },
  });
}

function ThrowingFenceChild(): never {
  throw new Error('broken semantic fence child');
}

describe('createMarkdownFenceTransform', () => {
  it('narrows createNode input and returns the owned extension-node transform', () => {
    type DiagramOrDotNode = MarkdownExtensionNode<
      'typed-fences',
      'diagram',
      {
        readonly code: string;
        readonly language: 'mermaid' | 'dot';
        readonly meta?: string;
      },
      'block'
    >;
    const transform = createMarkdownFenceTransform({
      languages: ['mermaid', 'dot'] as const,
      createNode: context => {
        expectTypeOf(context.language).toEqualTypeOf<'mermaid' | 'dot'>();
        expectTypeOf(context.code).toBeString();
        expectTypeOf(context.meta).toEqualTypeOf<string | undefined>();
        return {
          type: 'extension',
          plugin: 'typed-fences',
          name: 'diagram',
          display: 'block',
          data: {
            code: context.code,
            language: context.language,
            ...(context.meta == null ? {} : {meta: context.meta}),
          },
        } satisfies MarkdownFenceNode<DiagramOrDotNode>;
      },
    });

    const typedTransform: MarkdownTransform<DiagramOrDotNode> = transform;
    expectTypeOf(typedTransform).toBeFunction();
  });

  it('annotates the original code node with frozen typed data', () => {
    const position = {
      start: {offset: 0},
      end: {offset: 35},
    } as const;
    const code = {
      type: 'code',
      lang: 'diagram',
      meta: 'title="Flow"',
      value: 'start --> finish',
      data: {owner: 'source'},
      position,
    } as const;
    const root: MarkdownAstRoot = {type: 'root', children: [code]};
    const plugin = createFencePlugin('diagram-fences', () => null);
    const transformed = applyMarkdownTransforms(
      root,
      prepareMarkdownPlugins([plugin]),
      '```diagram title="Flow"\nstart --> finish\n```',
      true,
      'block',
    );
    const transformedCode = transformed.children[0];
    const proposal =
      transformedCode?.type === 'code'
        ? getMarkdownFenceProposal(transformedCode)
        : undefined;

    expect(transformed).not.toBe(root);
    expect(transformedCode).not.toBe(code);
    expect(transformedCode).toMatchObject(code);
    expect(getMarkdownFenceProposal(code)).toBeUndefined();
    expect(proposal?.node).toEqual({
      type: 'extension',
      plugin: 'diagram-fences',
      name: 'diagram',
      display: 'block',
      data: {
        code: 'start --> finish',
        language: 'diagram',
        meta: 'title="Flow"',
      },
    });
    expect(Object.isFrozen(transformed)).toBe(true);
    expect(Object.isFrozen(transformedCode)).toBe(true);
    expect(Object.isFrozen(proposal?.node)).toBe(true);
    expect(Object.isFrozen(proposal?.node.data)).toBe(true);
  });

  it('preserves fence metadata in the canonical tree without changing legacy output', () => {
    const source = '```diagram title="Flow"\nstart --> finish\n```';
    expect(parseMarkdownAst(source).children[0]).toMatchObject({
      type: 'code',
      lang: 'diagram',
      meta: 'title="Flow"',
      value: 'start --> finish',
    });
    expect(parseMarkdown(source)).toEqual([
      {
        type: 'codeblock',
        language: 'diagram',
        content: 'start --> finish',
      },
    ]);
  });

  it('matches the complete declared language without prefix collisions', () => {
    type CNode<Name extends string> = MarkdownExtensionNode<
      Name,
      'code',
      {readonly value: string},
      'block'
    >;
    const prefixRender = vi.fn(() => <div>C renderer</div>);
    const exactRender = vi.fn(() => <div>C++ renderer</div>);
    const prefix = createMarkdownPlugin<'c-fences', CNode<'c-fences'>>({
      name: 'c-fences',
      apiVersion: 1,
      transform: createMarkdownFenceTransform({
        languages: ['c'],
        createNode: ({code}) => ({
          type: 'extension',
          plugin: 'c-fences',
          name: 'code',
          display: 'block',
          data: {value: code},
        }),
      }),
      renderers: {
        code: {render: prefixRender, toText: node => node.data.value},
      },
    });
    const exact = createMarkdownPlugin<'cpp-fences', CNode<'cpp-fences'>>({
      name: 'cpp-fences',
      apiVersion: 1,
      transform: createMarkdownFenceTransform({
        languages: ['c++'],
        createNode: ({code}) => ({
          type: 'extension',
          plugin: 'cpp-fences',
          name: 'code',
          display: 'block',
          data: {value: code},
        }),
      }),
      renderers: {code: {render: exactRender, toText: node => node.data.value}},
    });
    const source = '```c++ title="Example"\nint main() {}\n```';

    expect(parseMarkdownAst(source).children[0]).toMatchObject({
      type: 'code',
      lang: 'c++',
      meta: 'title="Example"',
    });
    expect(parseMarkdown(source)).toEqual([
      {type: 'codeblock', language: 'c', content: 'int main() {}'},
    ]);
    render(<Markdown plugins={[prefix, exact]}>{source}</Markdown>);
    expect(screen.getByText('C++ renderer')).toBeInTheDocument();
    expect(prefixRender).not.toHaveBeenCalled();
    expect(exactRender).toHaveBeenCalledOnce();
  });

  it('renders typed proposal data through the standard renderer map', () => {
    const renderFence = vi.fn(
      ({node}: {node: DiagramNode<'typed-diagram-fences'>}) => (
        <figure
          aria-label={`${node.data.language}: ${node.data.meta ?? 'Untitled'}`}>
          <code>{node.data.code}</code>
        </figure>
      ),
    );
    const plugin = createFencePlugin('typed-diagram-fences', renderFence);

    render(
      <Markdown plugins={[plugin]}>
        {'```diagram title="Flow"\nstart --> finish\n```'}
      </Markdown>,
    );

    expect(
      screen.getByRole('figure', {name: 'diagram: title="Flow"'}),
    ).toHaveTextContent('start --> finish');
    expect(renderFence).toHaveBeenCalledOnce();
    expect(renderFence.mock.calls[0]?.[0].node.data).toEqual({
      code: 'start --> finish',
      language: 'diagram',
      meta: 'title="Flow"',
    });
  });

  it('renders a claimed fence through its plugin and an unclaimed fence through components.code', () => {
    const renderFence = vi.fn(() => <div data-testid="semantic">Semantic</div>);
    const plugin = createFencePlugin('override-fences', renderFence);
    const codeOverride = vi.fn(
      ({code, language}: {code: string; language?: string}) => (
        <div data-testid="code-override">
          {language}: {code}
        </div>
      ),
    );

    render(
      <Markdown plugins={[plugin]} components={{code: codeOverride}}>
        {'```diagram\nstart --> finish\n```\n\n```ts\nconst x = 1;\n```'}
      </Markdown>,
    );

    expect(screen.getByTestId('semantic')).toHaveTextContent('Semantic');
    expect(renderFence).toHaveBeenCalledOnce();
    expect(screen.getAllByTestId('code-override')).toHaveLength(1);
    expect(screen.getByTestId('code-override')).toHaveTextContent(
      'ts: const x = 1;',
    );
    expect(codeOverride.mock.calls.map(([props]) => props.language)).toEqual([
      'ts',
    ]);
  });

  it('falls back to components.code when a claimed fence is declined or its renderer returns nothing', () => {
    const CodeOverride = ({code}: {code: string; language?: string}) => (
      <div data-testid="code-override">Override: {code}</div>
    );
    const declining = createFencePlugin(
      'declining-override-fences',
      () => <div>Semantic</div>,
      () => null,
    );
    const empty = createFencePlugin('empty-override-fences', () => null);
    const source = '```diagram\nstart --> finish\n```';

    const {rerender} = render(
      <Markdown plugins={[declining]} components={{code: CodeOverride}}>
        {source}
      </Markdown>,
    );
    expect(screen.getByTestId('code-override')).toHaveTextContent(
      'Override: start --> finish',
    );

    rerender(
      <Markdown plugins={[empty]} components={{code: CodeOverride}}>
        {source}
      </Markdown>,
    );
    expect(screen.getByTestId('code-override')).toHaveTextContent(
      'Override: start --> finish',
    );
    expect(document.querySelector('pre')).toBeNull();
  });

  it('falls back to components.code when a claimed fence renderer throws', () => {
    const CodeOverride = ({code}: {code: string; language?: string}) => (
      <div data-testid="code-override">Override: {code}</div>
    );
    const throwing = createFencePlugin('throwing-override-fences', () => {
      throw new Error('broken semantic fence');
    });
    const descendant = createFencePlugin('descendant-override-fences', () => (
      <ThrowingFenceChild />
    ));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const source = '```diagram\nstart --> finish\n```';

    const {rerender} = render(
      <Markdown plugins={[throwing]} components={{code: CodeOverride}}>
        {source}
      </Markdown>,
    );
    expect(screen.getByTestId('code-override')).toHaveTextContent(
      'Override: start --> finish',
    );

    rerender(
      <Markdown plugins={[descendant]} components={{code: CodeOverride}}>
        {source}
      </Markdown>,
    );
    expect(screen.getByTestId('code-override')).toHaveTextContent(
      'Override: start --> finish',
    );
    expect(
      renderToString(
        <Markdown plugins={[descendant]} components={{code: CodeOverride}}>
          {source}
        </Markdown>,
      ),
    ).toContain('Override: <!-- -->start --&gt; finish');

    warning.mockRestore();
    error.mockRestore();
  });

  it('shows components.code while a claimed fence renderer suspends', () => {
    const CodeOverride = ({code}: {code: string; language?: string}) => (
      <div data-testid="code-override">Override: {code}</div>
    );
    const pending = new Promise<never>(() => {});
    function Suspending(): never {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw pending;
    }
    const plugin = createFencePlugin('suspending-override-fences', () => (
      <Suspending />
    ));

    render(
      <Markdown plugins={[plugin]} components={{code: CodeOverride}}>
        {'```diagram\nstart --> finish\n```'}
      </Markdown>,
    );

    expect(screen.getByTestId('code-override')).toHaveTextContent(
      'Override: start --> finish',
    );
  });

  it('uses CodeBlock for undeclared or declined fences', () => {
    const createNode = vi.fn(() => null);
    const renderFence = vi.fn(() => <div>Semantic</div>);
    const plugin = createFencePlugin(
      'declining-fences',
      renderFence,
      createNode,
    );
    const {rerender} = render(
      <Markdown plugins={[plugin]}>{'```text\nplain source\n```'}</Markdown>,
    );

    expect(createNode).not.toHaveBeenCalled();
    expect(document.querySelector('pre')).toHaveTextContent('plain source');
    expect(screen.getByRole('button', {name: 'Copy code'})).toBeInTheDocument();
    // CodeBlock's named viewport; its tab stop follows overflow (none in jsdom).
    expect(screen.getByRole('group', {name: 'text'})).toHaveAttribute(
      'data-scroll-axis',
      'both',
    );

    rerender(
      <Markdown plugins={[plugin]}>
        {'```diagram\nsemantic source\n```'}
      </Markdown>,
    );
    expect(createNode).toHaveBeenCalledOnce();
    expect(renderFence).not.toHaveBeenCalled();
    expect(document.querySelector('pre')).toHaveTextContent('semantic source');
    expect(screen.getByRole('button', {name: 'Copy code'})).toBeInTheDocument();
  });

  it('uses CodeBlock when the standard renderer is missing', () => {
    const transform = createMarkdownFenceTransform({
      languages: ['diagram'],
      createNode: context => createDiagramNode('missing-renderer', context),
    });
    const plugin = createMarkdownPlugin({
      name: 'missing-renderer',
      apiVersion: 1,
      transform,
    } as unknown as MarkdownTransformPluginDefinition<
      'missing-renderer',
      never
    >);

    render(
      <Markdown plugins={[plugin]}>
        {'```diagram\nstart --> finish\n```'}
      </Markdown>,
    );

    expect(document.querySelector('pre')).toHaveTextContent('start --> finish');
    expect(screen.getByRole('button', {name: 'Copy code'})).toBeInTheDocument();
  });

  it('fails the transform closed for foreign ownership or invalid data', () => {
    const foreignCreateNode = () => ({
      type: 'extension' as const,
      plugin: 'foreign',
      name: 'diagram' as const,
      display: 'block' as const,
      data: {code: 'forged', language: 'diagram' as const},
    });
    const invalidDataCreateNode = () => ({
      type: 'extension' as const,
      plugin: 'invalid-data-fences',
      name: 'diagram' as const,
      display: 'block' as const,
      data: {run: () => 'not data'},
    });
    const foreign = createFencePlugin(
      'owned-fences',
      () => <div>Foreign</div>,
      foreignCreateNode as never,
    );
    const invalid = createFencePlugin(
      'invalid-data-fences',
      () => <div>Invalid</div>,
      invalidDataCreateNode as never,
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = '```diagram\nreadable source\n```';

    const {rerender} = render(
      <Markdown plugins={[foreign]}>{source}</Markdown>,
    );
    expect(document.querySelector('pre')).toHaveTextContent('readable source');
    rerender(<Markdown plugins={[invalid]}>{source}</Markdown>);
    expect(document.querySelector('pre')).toHaveTextContent('readable source');
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it('consumes rejected async createNode values in client and SSR', async () => {
    const source = '```diagram\nprivate source\n```';
    const clientCreateNode = (async () => {
      throw new Error('client rejection: private source');
    }) as unknown as NonNullable<Parameters<typeof createFencePlugin>[2]>;
    const serverCreateNode = (async () => {
      throw new Error('server rejection: private source');
    }) as unknown as NonNullable<Parameters<typeof createFencePlugin>[2]>;
    const clientPlugin = createFencePlugin(
      'async-client-fences',
      () => <div>Client proposal</div>,
      clientCreateNode,
    );
    const serverPlugin = createFencePlugin(
      'async-server-fences',
      () => <div>Server proposal</div>,
      serverCreateNode,
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<Markdown plugins={[clientPlugin]}>{source}</Markdown>);
    expect(document.querySelector('pre')).toHaveTextContent('private source');
    expect(
      renderToString(<Markdown plugins={[serverPlugin]}>{source}</Markdown>),
    ).toContain('private source');
    await Promise.resolve();

    const warningText = warning.mock.calls.flat().map(String).join(' ');
    expect(warningText).toContain('async-client-fences');
    expect(warningText).toContain('async-server-fences');
    expect(warningText).not.toContain('private source');
    warning.mockRestore();
  });

  it('falls back when a standard proposal renderer throws', () => {
    const plugin = createFencePlugin('throwing-fences', () => {
      throw new Error('broken semantic fence');
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Markdown plugins={[plugin]}>
        {'Before.\n\n```diagram\nstart --> finish\n```\n\nAfter.'}
      </Markdown>,
    );

    expect(screen.getByText('Before.')).toBeInTheDocument();
    expect(document.querySelector('pre')).toHaveTextContent('start --> finish');
    expect(screen.getByText('After.')).toBeInTheDocument();
    warning.mockRestore();
  });

  it('falls back for descendant errors and during server rendering', () => {
    const plugin = createFencePlugin('descendant-fences', () => (
      <ThrowingFenceChild />
    ));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const source = '```diagram\nstart --> finish\n```';

    expect(
      renderToString(<Markdown plugins={[plugin]}>{source}</Markdown>),
    ).toContain('start --&gt; finish');
    render(<Markdown plugins={[plugin]}>{source}</Markdown>);
    expect(document.querySelector('pre')).toHaveTextContent('start --> finish');

    warning.mockRestore();
    error.mockRestore();
  });

  it('keeps no-plugin and nonmatching-plugin server output identical', () => {
    const plugin = createFencePlugin('nonmatching-fences', () => (
      <div>Semantic</div>
    ));
    const source = '```text\nplain source\n```';

    expect(
      renderToString(<Markdown plugins={[plugin]}>{source}</Markdown>),
    ).toBe(renderToString(<Markdown>{source}</Markdown>));
  });

  it('preserves the first proposal and legacy language through node rebuilds', () => {
    const firstRender = vi.fn(() => <div>First renderer</div>);
    const secondRender = vi.fn(() => <div>Second renderer</div>);
    type CppNode<Name extends string> = MarkdownExtensionNode<
      Name,
      'code',
      {readonly value: string},
      'block'
    >;
    const first = createMarkdownPlugin<
      'first-cpp-fences',
      CppNode<'first-cpp-fences'>
    >({
      name: 'first-cpp-fences',
      apiVersion: 1,
      transform: createMarkdownFenceTransform({
        languages: ['c++'],
        createNode: ({code}) => ({
          type: 'extension',
          plugin: 'first-cpp-fences',
          name: 'code',
          display: 'block',
          data: {value: code},
        }),
      }),
      renderers: {
        code: {render: firstRender, toText: node => node.data.value},
      },
    });
    const rebuild = createMarkdownPlugin({
      name: 'rebuild-code-nodes',
      apiVersion: 1,
      transform: root => ({
        ...root,
        children: root.children.map(node =>
          node.type === 'code'
            ? {
                type: 'code',
                lang: node.lang,
                ...(node.meta == null ? {} : {meta: node.meta}),
                value: node.value,
                ...(node.data == null ? {} : {data: node.data}),
                ...(node.position == null ? {} : {position: node.position}),
              }
            : node,
        ),
      }),
    });
    const second = createMarkdownPlugin<
      'second-cpp-fences',
      CppNode<'second-cpp-fences'>
    >({
      name: 'second-cpp-fences',
      apiVersion: 1,
      transform: createMarkdownFenceTransform({
        languages: ['c++'],
        createNode: ({code}) => ({
          type: 'extension',
          plugin: 'second-cpp-fences',
          name: 'code',
          display: 'block',
          data: {value: code},
        }),
      }),
      renderers: {
        code: {render: secondRender, toText: node => node.data.value},
      },
    });
    const plugins = [first, rebuild, second] as const;
    const source = '```c++\nint main() {}\n```';

    expect(parseMarkdown(source, {plugins})).toEqual([
      {type: 'codeblock', language: 'c', content: 'int main() {}'},
    ]);
    render(<Markdown plugins={plugins}>{source}</Markdown>);

    expect(screen.getByText('First renderer')).toBeInTheDocument();
    expect(firstRender).toHaveBeenCalledOnce();
    expect(secondRender).not.toHaveBeenCalled();
  });
});
