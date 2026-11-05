// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sourceLines.test.tsx
 * @input markdownSourceLinesPlugin with Markdown, the canonical parsers, and renderers
 * @output Regression coverage for module:Markdown/sourceLines
 * @position Focused acceptance tests for opt-in source-line stamps
 */

import {render, screen} from '@testing-library/react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Markdown} from '../Markdown';
import type {MarkdownComponents, MarkdownSourceLines} from '../Markdown';
import {
  createIncrementalState,
  parseMarkdownAst,
  parseMarkdownAstIncremental,
} from '../parser';
import {createMarkdownFenceTransform} from './semanticFence';
import {createMarkdownFrontmatter} from './frontmatter';
import {createMarkdownPlugin, type MarkdownExtensionNode} from './protocol';
import {markdownSourceLinesPlugin} from './sourceLines';
import type * as ParserModule from '../parser';

const parseCalls = vi.hoisted(() => ({full: 0, incremental: 0}));

vi.mock('../parser', async importOriginal => {
  const actual = await importOriginal<typeof ParserModule>();
  return {
    ...actual,
    parseMarkdownAst: ((
      ...args: Parameters<typeof actual.parseMarkdownAst>
    ) => {
      parseCalls.full++;
      return actual.parseMarkdownAst(...args);
    }) as typeof actual.parseMarkdownAst,
    parseMarkdownAstIncremental: ((
      ...args: Parameters<typeof actual.parseMarkdownAstIncremental>
    ) => {
      parseCalls.incremental++;
      return actual.parseMarkdownAstIncremental(...args);
    }) as typeof actual.parseMarkdownAstIncremental,
  };
});

const SOURCE = [
  '# Title', // 1
  '', // 2
  'First paragraph', // 3
  'spans two lines.', // 4
  '', // 5
  '- one', // 6
  '- two', // 7
  '', // 8
  '> quoted', // 9
  '', // 10
  '```ts', // 11
  'const x = 1;', // 12
  '```', // 13
  '', // 14
  '| a | b |', // 15
  '| - | - |', // 16
  '| 1 | 2 |', // 17
  '', // 18
  '---', // 19
  '', // 20
  'Last *words* here.', // 21
].join('\n');

const NESTED = [
  '- outer item', // 1
  '  continues here', // 2
  '', // 3
  '  second paragraph', // 4
  '', // 5
  '  - inner one', // 6
  '  - inner two', // 7
  '', // 8
  '> quote opens', // 9
  'lazy continuation', // 10
  '>', // 11
  '> - quoted item', // 12
  '>', // 13
  '> ```', // 14
  '> fenced', // 15
  '> ```', // 16
  '', // 17
  '[ref]: https://example.com', // 18
  '', // 19
  'See [ref].', // 20
].join('\n');

function stamps(container: ParentNode, selector: string): string[] {
  return Array.from(container.querySelectorAll(selector)).map(
    element =>
      `${element.getAttribute('data-source-line')}-${element.getAttribute(
        'data-source-line-end',
      )}`,
  );
}

function renderDocument(source: string, withPlugin: boolean): HTMLElement {
  return render(
    <Markdown plugins={withPlugin ? [markdownSourceLinesPlugin] : []}>
      {source}
    </Markdown>,
  ).container;
}

/** Every node's type and recorded lines, in document order. */
function lineSpans(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      lineSpans(item, out);
    }
    return out;
  }
  if (value == null || typeof value !== 'object') {
    return out;
  }
  const node = value as {
    type?: string;
    position?: {start?: {line?: number}; end?: {line?: number}};
    children?: unknown;
  };
  const start = node.position?.start?.line;
  if (start != null) {
    out.push(`${node.type}:${start}-${node.position?.end?.line}`);
  }
  lineSpans(node.children, out);
  return out;
}

function hasAnyLine(value: unknown): boolean {
  return JSON.stringify(value).includes('"line"');
}

/** A parsed node, walked generically by the transforms below. */
interface TreeNode {
  readonly type?: string;
  readonly position?: {
    readonly start: {readonly line?: number};
    readonly end: {readonly line?: number};
  };
  readonly children?: ReadonlyArray<TreeNode>;
}

describe('markdownSourceLinesPlugin', () => {
  beforeEach(() => {
    parseCalls.full = 0;
    parseCalls.incremental = 0;
  });

  it('stamps every default block kind with its 1-based inclusive lines', () => {
    const container = renderDocument(SOURCE, true);

    expect(stamps(container, 'h1')).toEqual(['1-1']);
    expect(stamps(container, '[role="paragraph"]')).toEqual([
      '3-4',
      '9-9',
      '21-21',
    ]);
    expect(stamps(container, 'li')).toEqual(['6-6', '7-7']);
    expect(stamps(container, 'blockquote')).toEqual(['9-9']);
    expect(stamps(container, '[data-source-line="11"]')).toEqual(['11-13']);
    expect(
      container
        .querySelector('[data-source-line="11"]')
        ?.querySelector('pre')
        ?.textContent?.includes('const x = 1;'),
    ).toBe(true);
    expect(stamps(container, '[data-source-line="15"]')).toEqual(['15-17']);
    expect(
      container.querySelector('[data-source-line="15"] table'),
    ).not.toBeNull();
    expect(stamps(container, 'hr')).toEqual(['19-19']);
  });

  it('stamps no inline element, table row, or table cell', () => {
    const container = renderDocument(SOURCE, true);

    expect(
      container.querySelector('em')?.hasAttribute('data-source-line'),
    ).toBe(false);
    expect(container.querySelector('tr[data-source-line]')).toBeNull();
    expect(container.querySelector('td[data-source-line]')).toBeNull();
    expect(container.querySelector('th[data-source-line]')).toBeNull();
  });

  it('stamps nested blocks with document lines, past markers, lazy lines, and stripped definitions', () => {
    const container = renderDocument(NESTED, true);

    expect(stamps(container, 'li')).toEqual(['1-7', '6-6', '7-7', '12-12']);
    expect(stamps(container, '[role="paragraph"]')).toEqual([
      '1-2',
      '4-4',
      '9-10',
      '20-20',
    ]);
    expect(stamps(container, 'blockquote')).toEqual(['9-16']);
    expect(stamps(container, 'blockquote [data-source-line="14"]')).toEqual([
      '14-16',
    ]);
  });

  it('counts CRLF line endings and the lines a frontmatter block occupies', () => {
    const frontmatter = createMarkdownFrontmatter({
      name: 'metadata',
      parse: fields => ({title: fields.title ?? ''}),
    });
    render(
      <Markdown plugins={[frontmatter.plugin, markdownSourceLinesPlugin]}>
        {'---\r\ntitle: Notes\r\n---\r\n# Heading\r\n\r\nBody\r\nline'}
      </Markdown>,
    );

    expect(stamps(document, 'h1')).toEqual(['4-4']);
    expect(stamps(document, '[role="paragraph"]')).toEqual(['6-7']);
  });

  it('gives each components block renderer sourceLines and adds no wrapper', () => {
    const received: Record<string, MarkdownSourceLines | undefined> = {};
    const record =
      (kind: string) =>
      (props: {sourceLines?: MarkdownSourceLines}): void => {
        received[kind] = props.sourceLines;
      };
    const components: Partial<MarkdownComponents> = {
      heading: props => {
        record('heading')(props);
        return <h2 data-testid="heading">{props.children}</h2>;
      },
      paragraph: props => {
        record('paragraph')(props);
        return <p data-testid="paragraph">{props.children}</p>;
      },
      code: props => {
        record('code')(props);
        return <pre data-testid="code">{props.code}</pre>;
      },
      blockquote: props => {
        record('blockquote')(props);
        return <blockquote data-testid="quote">{props.children}</blockquote>;
      },
      hr: props => {
        record('hr')(props);
        return <hr data-testid="hr" />;
      },
      image: props => {
        record('image')(props);
        return <img data-testid="image" src={props.src} alt={props.alt} />;
      },
      math: props => {
        record(`math-${props.display}`)(props);
        return <span data-testid={`math-${props.display}`}>{props.value}</span>;
      },
    };
    const source = [
      '# Heading', // 1
      '', // 2
      'Text with $x$ inline.', // 3
      '', // 4
      '```', // 5
      'code', // 6
      '```', // 7
      '', // 8
      '> quote', // 9
      '', // 10
      '***', // 11
      '', // 12
      '![alt](https://example.com/a.png)', // 13
      '', // 14
      '$$', // 15
      'y', // 16
      '$$', // 17
    ].join('\n');
    const {container} = render(
      <Markdown plugins={[markdownSourceLinesPlugin]} components={components}>
        {source}
      </Markdown>,
    );

    expect(received).toEqual({
      heading: {start: 1, end: 1},
      paragraph: {start: 9, end: 9},
      'math-inline': undefined,
      code: {start: 5, end: 7},
      blockquote: {start: 9, end: 9},
      hr: {start: 11, end: 11},
      image: {start: 13, end: 13},
      'math-block': {start: 15, end: 17},
    });
    // Renderers own their element: Markdown places no stamp on, or around, it.
    expect(container.querySelector('[data-source-line]')).toBeNull();
    expect(screen.getByTestId('heading').parentElement).toBe(
      container.firstElementChild,
    );
  });

  it('gives plugin block renderers and claimed fences their lines through position', () => {
    type CardNode = MarkdownExtensionNode<
      'cards',
      'card',
      Record<string, never>,
      'block'
    >;
    type ChartNode = MarkdownExtensionNode<
      'charts',
      'chart',
      {readonly spec: string},
      'block'
    >;
    const seen: (string | undefined)[] = [];
    const cards = createMarkdownPlugin<'cards', CardNode>({
      name: 'cards',
      apiVersion: 1,
      parseKey: 'v1',
      syntax: {
        block: [
          {
            startsWith: [':::card'],
            maxSpan: 200,
            tokenize: ({offset}) => ({
              status: 'match',
              end: offset + ':::card'.length,
              node: {
                type: 'extension',
                plugin: 'cards',
                name: 'card',
                display: 'block',
                data: {},
              },
            }),
          },
        ],
      },
      renderers: {
        card: {
          render: ({node}) => {
            seen.push(
              `card:${node.position?.start.line}-${node.position?.end.line}`,
            );
            return <div>card</div>;
          },
          toText: () => 'card',
        },
      },
    });
    const charts = createMarkdownPlugin<'charts', ChartNode>({
      name: 'charts',
      apiVersion: 1,
      transform: createMarkdownFenceTransform({
        languages: ['chart'],
        createNode: ({code}) => ({
          type: 'extension',
          plugin: 'charts',
          name: 'chart',
          display: 'block',
          data: {spec: code},
        }),
      }),
      renderers: {
        chart: {
          render: ({node}) => {
            seen.push(
              `chart:${node.position?.start.line}-${node.position?.end.line}`,
            );
            return <div>chart</div>;
          },
          toText: node => node.data.spec,
        },
      },
    });

    render(
      <Markdown plugins={[cards, charts, markdownSourceLinesPlugin]}>
        {'Intro\n\n:::card\n\n- item\n\n  ```chart\n  bars\n  ```'}
      </Markdown>,
    );

    expect(seen).toEqual(['card:3-3', 'chart:7-9']);
  });

  it('keeps the lines when a claimed fence falls back to the host code renderer or the default code block', () => {
    type DiagramNode = MarkdownExtensionNode<
      'diagrams',
      'diagram',
      {readonly code: string},
      'block'
    >;
    const diagrams = (render: () => null | never) =>
      createMarkdownPlugin<'diagrams', DiagramNode>({
        name: 'diagrams',
        apiVersion: 1,
        transform: createMarkdownFenceTransform({
          languages: ['diagram'],
          createNode: ({code}) => ({
            type: 'extension',
            plugin: 'diagrams',
            name: 'diagram',
            display: 'block',
            data: {code},
          }),
        }),
        renderers: {diagram: {render, toText: node => node.data.code}},
      });
    const declining = diagrams(() => null);
    const throwing = diagrams(() => {
      throw new Error('broken diagram');
    });
    const source =
      'Intro\n\n```diagram\na --> b\n```\n\n```ts\nconst x = 1;\n```';
    const hostLines: [string | undefined, MarkdownSourceLines | undefined][] =
      [];
    const HostCode: NonNullable<MarkdownComponents['code']> = ({
      code,
      language,
      sourceLines,
    }) => {
      hostLines.push([language, sourceLines]);
      return <pre>{code}</pre>;
    };

    const {unmount} = render(
      <Markdown
        plugins={[declining, markdownSourceLinesPlugin]}
        components={{code: HostCode}}>
        {source}
      </Markdown>,
    );
    expect(hostLines).toEqual([
      ['diagram', {start: 3, end: 5}],
      ['ts', {start: 7, end: 9}],
    ]);
    unmount();

    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(
      <Markdown plugins={[throwing, markdownSourceLinesPlugin]}>
        {source}
      </Markdown>,
    );
    expect(stamps(container, '[data-source-line="3"]')).toEqual(['3-5']);
    expect(
      container.querySelector('[data-source-line="3"] pre')?.textContent,
    ).toContain('a --> b');
    warning.mockRestore();
  });

  it('records lines on canonical block nodes only with the plugin', () => {
    const withLines = parseMarkdownAst(NESTED, {
      plugins: [markdownSourceLinesPlugin],
    });
    expect(lineSpans(withLines)).toEqual([
      'list:1-7',
      'listItem:1-7',
      'paragraph:1-2',
      'paragraph:4-4',
      'list:6-7',
      'listItem:6-6',
      'paragraph:6-6',
      'listItem:7-7',
      'paragraph:7-7',
      'blockquote:9-16',
      'paragraph:9-10',
      'list:12-12',
      'listItem:12-12',
      'paragraph:12-12',
      'code:14-16',
      'paragraph:20-20',
    ]);

    const without = parseMarkdownAst(NESTED);
    expect(hasAnyLine(without)).toBe(false);
    expect(hasAnyLine(parseMarkdownAst(NESTED, {plugins: []}))).toBe(false);
  });

  it('composes with a transform that rebuilds nested blocks, which keep their lines', () => {
    const rebuild = (nodes: ReadonlyArray<TreeNode>): TreeNode[] =>
      nodes.map(node =>
        node.children == null
          ? {...node}
          : {...node, children: rebuild(node.children)},
      );
    const copy = createMarkdownPlugin({
      apiVersion: 1,
      name: 'test-rebuild',
      transform: document => ({
        ...document,
        children: rebuild(
          document.children as unknown as ReadonlyArray<TreeNode>,
        ) as unknown as typeof document.children,
      }),
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(
      <Markdown plugins={[copy, markdownSourceLinesPlugin]}>{NESTED}</Markdown>,
    );
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
    expect(stamps(container, '[data-source-line]')).toEqual(
      stamps(renderDocument(NESTED, true), '[data-source-line]'),
    );
  });

  it('refuses a transform that shifts a nested block to other lines', () => {
    const shift = (nodes: ReadonlyArray<TreeNode>): TreeNode[] =>
      nodes.map(node => {
        if (node.type === 'paragraph' && node.position?.start.line === 12) {
          return {...node, position: {start: {line: 13}, end: {line: 13}}};
        }
        return node.children == null
          ? node
          : {...node, children: shift(node.children)};
      });
    const forge = createMarkdownPlugin({
      apiVersion: 1,
      name: 'test-shift-lines',
      transform: document => ({
        ...document,
        children: shift(
          document.children as unknown as ReadonlyArray<TreeNode>,
        ) as unknown as typeof document.children,
      }),
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(
      <Markdown plugins={[forge, markdownSourceLinesPlugin]}>
        {NESTED}
      </Markdown>,
    );
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('"test-shift-lines" failed in transform'),
      expect.anything(),
    );
    warning.mockRestore();
    expect(stamps(container, '[data-source-line]')).toEqual(
      stamps(renderDocument(NESTED, true), '[data-source-line]'),
    );
  });

  it('refuses a transform that moves a top-level block to other lines while keeping its offsets', () => {
    const move = (nodes: ReadonlyArray<TreeNode>): TreeNode[] =>
      nodes.map(node => {
        const position = node.position;
        if (
          node.type !== 'paragraph' ||
          position == null ||
          position.start.line !== 20
        ) {
          return node;
        }
        return {
          ...node,
          position: {
            start: {...position.start, line: 19},
            end: {...position.end, line: 19},
          },
        };
      });
    const forge = createMarkdownPlugin({
      apiVersion: 1,
      name: 'test-move-lines-keep-offsets',
      transform: document => ({
        ...document,
        children: move(
          document.children as unknown as ReadonlyArray<TreeNode>,
        ) as unknown as typeof document.children,
      }),
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(
      <Markdown plugins={[forge, markdownSourceLinesPlugin]}>
        {NESTED}
      </Markdown>,
    );
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(
        '"test-move-lines-keep-offsets" failed in transform',
      ),
      expect.anything(),
    );
    warning.mockRestore();
    expect(stamps(container, '[data-source-line]')).toEqual(
      stamps(renderDocument(NESTED, true), '[data-source-line]'),
    );
  });

  it('keeps the released DOM and renderer props byte-identical without the plugin', () => {
    const plain = renderToStaticMarkup(<Markdown>{SOURCE}</Markdown>);
    expect(
      renderToStaticMarkup(<Markdown plugins={[]}>{SOURCE}</Markdown>),
    ).toBe(plain);
    expect(plain).not.toContain('data-source-line');

    const paragraphProps: object[] = [];
    render(
      <Markdown
        components={{
          paragraph: props => {
            paragraphProps.push(props);
            return <p>{props.children}</p>;
          },
        }}>
        {SOURCE}
      </Markdown>,
    );
    expect(paragraphProps.length).toBeGreaterThan(0);
    expect(paragraphProps.every(props => !('sourceLines' in props))).toBe(true);
  });

  it('runs one parse and tokenizes each source position once, with or without the plugin', () => {
    let tokenizerCalls = 0;
    type MarkNode = MarkdownExtensionNode<
      'marks',
      'mark',
      Record<string, never>,
      'inline'
    >;
    const marks = createMarkdownPlugin<'marks', MarkNode>({
      name: 'marks',
      apiVersion: 1,
      parseKey: 'v1',
      syntax: {
        inline: [
          {
            startsWith: ['!!'],
            maxSpan: 4,
            tokenize: ({offset}) => {
              tokenizerCalls++;
              return {
                status: 'match',
                end: offset + 2,
                node: {
                  type: 'extension',
                  plugin: 'marks',
                  name: 'mark',
                  display: 'inline',
                  data: {},
                },
              };
            },
          },
        ],
      },
      renderers: {mark: {render: () => <b>!</b>, toText: () => '!'}},
    });
    const source = `${NESTED}\n\nA !! mark, and - !! in a list:\n\n- item !!\n  > quote !!`;

    const {unmount} = render(<Markdown plugins={[marks]}>{source}</Markdown>);
    const baseline = {parses: parseCalls.full, tokens: tokenizerCalls};
    unmount();
    parseCalls.full = 0;
    tokenizerCalls = 0;

    render(
      <Markdown plugins={[marks, markdownSourceLinesPlugin]}>
        {source}
      </Markdown>,
    );

    expect(baseline.parses).toBeGreaterThan(0);
    expect(baseline.tokens).toBeGreaterThan(0);
    expect({parses: parseCalls.full, tokens: tokenizerCalls}).toEqual(baseline);
    expect(stamps(document, 'li').length).toBeGreaterThan(0);
  });

  it('streams to the full-parse lines at every character boundary', () => {
    const options = {plugins: [markdownSourceLinesPlugin]};
    const state = createIncrementalState();
    let compared = 0;
    let last = parseMarkdownAstIncremental('', state, options);
    for (let end = 1; end <= NESTED.length; end++) {
      const prefix = NESTED.slice(0, end);
      last = parseMarkdownAstIncremental(prefix, state, options);
      const full = parseMarkdownAst(prefix, options);
      // Where the stream shows the same blocks as a full parse, their lines
      // must agree too; elsewhere the stream is still withholding a block.
      if (
        JSON.stringify(last.children.map(node => node.type)) ===
          JSON.stringify(full.children.map(node => node.type)) &&
        lineSpans(last.children).length === lineSpans(full.children).length
      ) {
        expect(lineSpans(last.children)).toEqual(lineSpans(full.children));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(NESTED.length / 2);
    expect(lineSpans(last.children)).toEqual(
      lineSpans(parseMarkdownAst(NESTED, options).children),
    );
  });

  it('keeps a settled block and its stamp while more text streams in', () => {
    const options = {plugins: [markdownSourceLinesPlugin]};
    const state = createIncrementalState();
    const first = parseMarkdownAstIncremental(
      '# Title\n\nBody one.\n\nBody',
      state,
      options,
    );
    const second = parseMarkdownAstIncremental(
      '# Title\n\nBody one.\n\nBody two\nwraps.',
      state,
      options,
    );
    expect(second.children[0]).toBe(first.children[0]);
    expect(lineSpans(second.children)).toEqual([
      'heading:1-1',
      'paragraph:3-3',
      'paragraph:5-6',
    ]);
  });
});
