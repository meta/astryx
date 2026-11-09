// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.markdownPlugins.tsx
 * @input Uses core Markdown and its plugin protocol, and the RichText
 *   surfaces, serializers, and plugin adapter.
 * @output Exports MarkdownPluginsSandbox: one document with an inline and a
 *   block Markdown plugin node, shown in core Markdown, RichTextView, and
 *   RichTextEditor, plus two editors to paste into — one given the plugins,
 *   one not.
 * @position Lab sandbox for spec:AST-064; its Chrome spec checks that a plugin
 *   node renders the same on every surface and edits as one unit.
 */

import {useMemo, useRef, useState} from 'react';
import {Markdown} from '@astryxdesign/core/Markdown';
import {
  createMarkdownPlugin,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';
import {
  createRichTextExtension,
  markdownToEditorStateJSON,
  RichTextEditor,
  RichTextEditorToolbar,
  RichTextView,
  type RichTextEditorRef,
} from '@astryxdesign/richtext';

type MentionNode = MarkdownExtensionNode<
  'sandbox-mentions',
  'mention',
  {readonly handle: string},
  'inline'
>;
type NoteNode = MarkdownExtensionNode<
  'sandbox-notes',
  'note',
  {readonly body: string},
  'block'
>;

const mentions = createMarkdownPlugin<'sandbox-mentions', MentionNode>({
  name: 'sandbox-mentions',
  apiVersion: 1,
  parseKey: 'v1',
  syntax: {
    inline: [
      {
        startsWith: ['@{'],
        maxSpan: 64,
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
              plugin: 'sandbox-mentions',
              name: 'mention',
              display: 'inline',
              data: {handle: source.slice(offset + 2, close)},
            },
          };
        },
      },
    ],
  },
  renderers: {
    mention: {
      render: ({node}) => (
        <a href={`#people/${node.data.handle}`} data-mention={node.data.handle}>
          @{node.data.handle}
        </a>
      ),
      toText: node => `@${node.data.handle}`,
    },
  },
});

const notes = createMarkdownPlugin<'sandbox-notes', NoteNode>({
  name: 'sandbox-notes',
  apiVersion: 1,
  parseKey: 'v1',
  syntax: {
    block: [
      {
        startsWith: [':::note'],
        maxSpan: 400,
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
              plugin: 'sandbox-notes',
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
      render: ({node}) => (
        // A note, not a landmark: the story shows the same note on three
        // surfaces, and landmarks must be unique on a page.
        <div role="note" aria-label="Note" data-note="">
          {node.data.body}
        </div>
      ),
      toText: node => node.data.body,
    },
  },
});

const PLUGINS = [mentions, notes];
const EXTENSIONS = PLUGINS.map(createRichTextExtension);

export const MARKDOWN_PLUGINS_SOURCE = [
  'Ping @{ada} about the review.',
  '',
  ':::note',
  'Ship on Thursday',
  ':::',
  '',
  'Then @{grace} signs off, *with thanks to @{linus}*.',
  '',
].join('\n');

const column = {display: 'grid', gap: 8, alignContent: 'start'} as const;

export function MarkdownPluginsSandbox() {
  const value = useMemo(
    () =>
      markdownToEditorStateJSON(MARKDOWN_PLUGINS_SOURCE, {
        extensions: EXTENSIONS,
      }),
    [],
  );
  const editor = useRef<RichTextEditorRef>(null);
  const withPlugins = useRef<RichTextEditorRef>(null);
  const [output, setOutput] = useState('');
  return (
    <div
      style={{
        display: 'grid',
        gap: 24,
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      }}>
      <section data-plugin-surface="markdown" style={column}>
        <div>Markdown</div>
        <Markdown plugins={PLUGINS}>{MARKDOWN_PLUGINS_SOURCE}</Markdown>
      </section>
      <section data-plugin-surface="view" style={column}>
        <div>RichTextView</div>
        <RichTextView value={value} markdownExtensions={EXTENSIONS} />
      </section>
      <section data-plugin-surface="editor" style={column}>
        <RichTextEditor
          label="Editor"
          ref={editor}
          defaultValue={value}
          markdownExtensions={EXTENSIONS}
          toolbar={<RichTextEditorToolbar />}
        />
        <button
          type="button"
          onClick={() =>
            setOutput(
              [editor, withPlugins]
                .map(ref => ref.current?.getMarkdown() ?? '')
                .join('\n---\n'),
            )
          }>
          Show Markdown
        </button>
        <pre data-markdown-output="">{output}</pre>
      </section>
      <section data-plugin-surface="paste-with" style={column}>
        <RichTextEditor
          label="Paste target with the plugins"
          ref={withPlugins}
          markdownExtensions={EXTENSIONS}
        />
      </section>
      <section data-plugin-surface="paste-without" style={column}>
        <RichTextEditor label="Paste target without the plugins" />
      </section>
    </div>
  );
}
