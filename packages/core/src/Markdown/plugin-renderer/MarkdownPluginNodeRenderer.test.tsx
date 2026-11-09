// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MarkdownPluginNodeRenderer.test.tsx
 * @input Renders extension nodes through Markdown and MarkdownPluginNodeRenderer
 * @output Proves the single-node renderer renders a node exactly as Markdown
 *   does — output, nothing, fallbacks, and failure reports — with no element
 *   of its own (spec:AST-064 FR8, DEC-6)
 */

import {render} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {Markdown} from '../Markdown';
import {parseInlineAst, parseMarkdownAst} from '../parser';
import {createMarkdownPlugin} from '../plugins/protocol';
import type {
  MarkdownExtensionNode,
  MarkdownPluginEntry,
} from '../plugins/protocol';
import {MarkdownPluginNodeRenderer} from './index';

type ProbeNode = MarkdownExtensionNode<
  string,
  'probe',
  {readonly label: string},
  'inline'
>;
type BlockProbeNode = MarkdownExtensionNode<
  string,
  'probe',
  {readonly label: string},
  'block'
>;

function ThrowingChild(): never {
  throw new Error('broken probe child');
}

const neverSettles = new Promise<never>(() => {});
function Suspending(): never {
  // Suspense's protocol: a component suspends by throwing a promise.
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw neverSettles;
}

/** A plugin whose renderer does what each node's label says. */
function probePlugin(name: string): MarkdownPluginEntry<ProbeNode> {
  return createMarkdownPlugin<string, ProbeNode>({
    name,
    apiVersion: 1,
    parseKey: 'v1',
    syntax: {
      inline: [
        {
          startsWith: ['@{'],
          maxSpan: 40,
          tokenize({source, offset, end}) {
            const close = source.indexOf('}', offset + 2);
            if (close < 0 || close >= end) {
              return {status: 'no-match'};
            }
            return {
              status: 'match',
              end: close + 1,
              node: {
                type: 'extension',
                plugin: name,
                name: 'probe',
                display: 'inline',
                data: {label: source.slice(offset + 2, close)},
              },
            };
          },
        },
      ],
    },
    renderers: {
      probe: {
        render: ({node}) => {
          switch (node.data.label) {
            case 'nothing':
              return null;
            case 'throw':
              throw new Error('broken probe');
            case 'child':
              return <ThrowingChild />;
            case 'suspend':
              return <Suspending />;
            default:
              return <mark data-probe="">{node.data.label}</mark>;
          }
        },
        toText: node => `probe ${node.data.label}`,
      },
    },
  });
}

/** A block plugin whose renderer does what each node's label says. */
function blockProbePlugin(name: string): MarkdownPluginEntry<BlockProbeNode> {
  return createMarkdownPlugin<string, BlockProbeNode>({
    name,
    apiVersion: 1,
    parseKey: 'v1',
    syntax: {
      block: [
        {
          startsWith: [':::'],
          maxSpan: 40,
          tokenize({source, offset, end}) {
            const lineEnd = source.indexOf('\n', offset);
            const stop = lineEnd < 0 || lineEnd > end ? end : lineEnd;
            return {
              status: 'match',
              end: stop,
              node: {
                type: 'extension',
                plugin: name,
                name: 'probe',
                display: 'block',
                data: {label: source.slice(offset + 3, stop)},
              },
            };
          },
        },
      ],
    },
    renderers: {
      probe: {
        render: ({node}) => {
          switch (node.data.label) {
            case 'nothing':
              return null;
            case 'throw':
              throw new Error('broken block probe');
            case 'child':
              return <ThrowingChild />;
            case 'suspend':
              return <Suspending />;
            default:
              return <aside data-probe="">{node.data.label}</aside>;
          }
        },
        toText: node => `block probe ${node.data.label}`,
      },
    },
  });
}

/** What Markdown renders for a block `source` inside its block wrapper. */
function markdownBlockOutput(
  source: string,
  plugin: MarkdownPluginEntry,
): string {
  const {container, unmount} = render(
    <Markdown plugins={[plugin]}>{source}</Markdown>,
  );
  const wrapper = container.firstElementChild?.firstElementChild;
  const html = wrapper?.innerHTML ?? '';
  unmount();
  return html;
}

/** The one block extension node `source` parses to with `plugin`. */
function blockNodeOf(
  source: string,
  plugin: MarkdownPluginEntry,
): BlockProbeNode {
  const [node] = parseMarkdownAst(source, {plugins: [plugin]}).children;
  if (node?.type !== 'extension') {
    throw new Error(`${source} did not parse to a block extension node`);
  }
  return node as BlockProbeNode;
}

/** The one extension node `source` parses to with `plugin`. */
function nodeOf(source: string, plugin: MarkdownPluginEntry): ProbeNode {
  const [node] = parseInlineAst(source, {plugins: [plugin]});
  if (node?.type !== 'extension') {
    throw new Error(`${source} did not parse to an extension node`);
  }
  return node as ProbeNode;
}

/** What Markdown renders for `source` inside its inline root. */
function markdownOutput(source: string, plugin: MarkdownPluginEntry): string {
  const {container, unmount} = render(
    <Markdown display="inline" plugins={[plugin]}>
      {source}
    </Markdown>,
  );
  const html = container.firstElementChild?.innerHTML ?? '';
  unmount();
  return html;
}

function nodeRendererOutput(
  node: ProbeNode | BlockProbeNode,
  plugins: ReadonlyArray<MarkdownPluginEntry>,
): string {
  const {container, unmount} = render(
    <MarkdownPluginNodeRenderer plugins={plugins} node={node} />,
  );
  const html = container.innerHTML;
  unmount();
  return html;
}

describe('MarkdownPluginNodeRenderer', () => {
  it.each([
    ['content', '@{content}', '<mark data-probe="">content</mark>'],
    ['nothing', '@{nothing}', ''],
    ['a renderer that throws when called', '@{throw}', '@{throw}'],
    ['a renderer whose component throws', '@{child}', '@{child}'],
    ['a renderer that suspends', '@{suspend}', '@{suspend}'],
  ])(
    'renders %s exactly as Markdown does, with no element of its own',
    (_, source, expected) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const plugin = probePlugin(`probe-${source}`);
        const node = nodeOf(source, plugin);
        expect(markdownOutput(source, plugin)).toBe(expected);
        expect(nodeRendererOutput(node, [plugin])).toBe(expected);
      } finally {
        warn.mockRestore();
        error.mockRestore();
      }
    },
  );

  it.each([
    ['content', ':::content', '<aside data-probe="">content</aside>'],
    ['nothing', ':::nothing', ''],
    ['a renderer that throws when called', ':::throw', ':::throw'],
    ['a renderer whose component throws', ':::child', ':::child'],
    ['a renderer that suspends', ':::suspend', ':::suspend'],
  ])(
    'renders a block node with %s exactly as Markdown does below its block wrapper',
    (_, source, expected) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const plugin = blockProbePlugin(`block-probe-${source}`);
        const node = blockNodeOf(source, plugin);
        expect(markdownBlockOutput(source, plugin)).toBe(expected);
        expect(nodeRendererOutput(node, [plugin])).toBe(expected);
      } finally {
        warn.mockRestore();
        error.mockRestore();
      }
    },
  );

  it("shows a sourceless block node's text as Markdown would", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const plugin = blockProbePlugin('block-probe-fallbacks');
      const {source: _source, ...withoutSource} = blockNodeOf(
        ':::throw',
        plugin,
      );
      expect(nodeRendererOutput(withoutSource, [plugin])).toBe(
        'block probe throw',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('reports a failure as Markdown does', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const plugin = probePlugin('probe-report');
      nodeRendererOutput(nodeOf('@{throw}', plugin), [plugin]);
      expect(JSON.stringify(warn.mock.calls)).toContain(
        'plugin \\"probe-report\\" failed in render; rendered readable fallback.',
      );
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("shows the plugin's text for a node with no source, and the source without the plugin", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const plugin = probePlugin('probe-fallbacks');
      const {source: _source, ...withoutSource} = nodeOf('@{throw}', plugin);
      expect(nodeRendererOutput(withoutSource, [plugin])).toBe('probe throw');
      expect(nodeRendererOutput(nodeOf('@{content}', plugin), [])).toBe(
        '@{content}',
      );
    } finally {
      warn.mockRestore();
    }
  });
});
