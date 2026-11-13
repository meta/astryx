// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it, vi} from 'vitest';
import {createRef} from 'react';
import {render, waitFor} from '@testing-library/react';
import {Markdown} from '@astryxdesign/core/Markdown';
import {
  createMarkdownPlugin,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {
  createRichTextExtension,
  markdownToEditorStateJSON,
  RichTextExtensionError,
} from './markdown';

type MentionNode = MarkdownExtensionNode<
  'demo-mentions',
  'mention',
  {readonly label: string},
  'inline'
>;
type NoteNode = MarkdownExtensionNode<
  'demo-notes',
  'note',
  {readonly body: string},
  'block'
>;

const mentions = createMarkdownPlugin<'demo-mentions', MentionNode>({
  name: 'demo-mentions',
  apiVersion: 1,
  parseKey: 'v1',
  syntax: {
    inline: [
      {
        startsWith: ['@{'],
        maxSpan: 80,
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
              plugin: 'demo-mentions',
              name: 'mention',
              display: 'inline',
              data: {label: source.slice(offset + 2, close)},
            },
          };
        },
      },
    ],
  },
  renderers: {
    mention: {
      render: ({node}) => {
        if (node.data.label === 'broken') {
          throw new Error('broken mention');
        }
        return <mark data-mention={node.data.label}>@{node.data.label}</mark>;
      },
      toText: node => `@${node.data.label}`,
    },
  },
});

const notes = createMarkdownPlugin<'demo-notes', NoteNode>({
  name: 'demo-notes',
  apiVersion: 1,
  parseKey: 'v1',
  syntax: {
    block: [
      {
        startsWith: [':::note'],
        maxSpan: 500,
        tokenize({source, offset, end}) {
          const close = source.indexOf('\n:::', offset);
          if (close < 0 || close + 4 > end) {
            return {status: 'no-match'};
          }
          return {
            status: 'match',
            end: close + 4,
            node: {
              type: 'extension',
              plugin: 'demo-notes',
              name: 'note',
              display: 'block',
              data: {body: source.slice(offset + 8, close)},
            },
          };
        },
      },
    ],
  },
  renderers: {
    note: {
      render: ({node}) => <aside data-note="">{node.data.body}</aside>,
      toText: node => node.data.body,
    },
  },
});

const EXTENSIONS = [
  createRichTextExtension(mentions),
  createRichTextExtension(notes),
];

const SOURCE = 'Hi @{ada} and @{broken}.\n\n:::note\nRemember this\n:::\n';

/** The HTML each plugin node renders inside its RichText element. */
function richTextNodes(root: Element): Array<string> {
  return [...root.querySelectorAll('[data-lexical-decorator="true"]')].map(
    element => element.innerHTML,
  );
}

describe('Markdown plugin nodes in RichText (spec:AST-064 FR8, FR11)', () => {
  it('renders each node exactly as core Markdown does, fallback included, in the view and the editor', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const core = render(
        <Markdown plugins={[mentions, notes]}>{SOURCE}</Markdown>,
      );
      const expected = [
        core.container.querySelector('[data-mention="ada"]')?.outerHTML,
        '@{broken}',
        core.container.querySelector('[data-note]')?.outerHTML,
      ];
      expect(core.container.textContent).toContain('@{broken}');
      core.unmount();
      const value = markdownToEditorStateJSON(SOURCE, {extensions: EXTENSIONS});
      for (const surface of [
        <RichTextView
          key="view"
          value={value}
          markdownExtensions={EXTENSIONS}
        />,
        <RichTextEditor
          key="editor"
          label="Notes"
          defaultValue={value}
          markdownExtensions={EXTENSIONS}
        />,
      ]) {
        const {container, unmount} = render(surface);
        await waitFor(() => expect(richTextNodes(container)).toEqual(expected));
        // A block node is spaced as a paragraph; an inline one sits in text.
        const block = container.querySelector(
          '[data-lexical-decorator="true"] > aside',
        )?.parentElement;
        expect(block?.tagName).toBe('DIV');
        expect(block?.className).not.toBe('');
        unmount();
      }
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('draws a node inside the marks around it, as core Markdown does', async () => {
    const source = 'See *thanks to @{ada}* and **ask @{ada}**.\n';
    const core = render(<Markdown plugins={[mentions]}>{source}</Markdown>);
    expect(
      core.container.querySelector('em [data-mention="ada"]'),
    ).not.toBeNull();
    expect(
      core.container.querySelector('strong [data-mention="ada"]'),
    ).not.toBeNull();
    core.unmount();
    const {container} = render(
      <RichTextView
        value={markdownToEditorStateJSON(source, {extensions: EXTENSIONS})}
        markdownExtensions={EXTENSIONS}
      />,
    );
    await waitFor(() =>
      expect(richTextNodes(container)).toEqual([
        '<em><mark data-mention="ada">@ada</mark></em>',
        '<strong><mark data-mention="ada">@ada</mark></strong>',
      ]),
    );
  });

  it('shows the source of a node whose plugin the surface was not given', async () => {
    const value = markdownToEditorStateJSON(SOURCE, {extensions: EXTENSIONS});
    const {container} = render(
      <RichTextView
        value={value}
        markdownExtensions={[createRichTextExtension(notes)]}
      />,
    );
    await waitFor(() =>
      expect(richTextNodes(container)).toEqual([
        '@{ada}',
        '@{broken}',
        expect.stringContaining('data-note'),
      ]),
    );
  });

  it('derives each node again from its source and never draws stored data', async () => {
    const stored = JSON.parse(
      markdownToEditorStateJSON('Hi @{ada}.\n', {extensions: EXTENSIONS}),
    ) as {root: {children: Array<{children: Array<Record<string, unknown>>}>}};
    const node = stored.root.children[0]?.children.find(
      child => child.type === 'astryx-markdown-extension',
    );
    if (node == null) {
      throw new Error('No extension node');
    }
    node.data = {label: 'stale'};
    const tampered = JSON.stringify(stored);
    const {container, unmount} = render(
      <RichTextView value={tampered} markdownExtensions={EXTENSIONS} />,
    );
    await waitFor(() =>
      expect(richTextNodes(container)).toEqual([
        '<mark data-mention="ada">@ada</mark>',
      ]),
    );
    unmount();
    // A node stored under another protocol version shows its source.
    node.data = {label: 'ada'};
    node.apiVersion = 2;
    const other = render(
      <RichTextView
        value={JSON.stringify(stored)}
        markdownExtensions={EXTENSIONS}
      />,
    );
    await waitFor(() =>
      expect(richTextNodes(other.container)).toEqual(['@{ada}']),
    );
  });

  it('keeps every node source in getMarkdown()', async () => {
    const ref = createRef<RichTextEditorRef>();
    render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON(SOURCE, {
          extensions: EXTENSIONS,
        })}
        markdownExtensions={EXTENSIONS}
      />,
    );
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(SOURCE));
  });

  it('refuses a configuration that adopts one plugin twice', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <RichTextView
            value={markdownToEditorStateJSON('x')}
            markdownExtensions={[
              createRichTextExtension(mentions),
              createRichTextExtension(mentions),
            ]}
          />,
        ),
      ).toThrow(RichTextExtensionError);
    } finally {
      error.mockRestore();
    }
  });
});
