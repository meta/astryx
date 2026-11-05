// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.markdownPluginsImportExport.tsx
 * @input Uses core's Markdown plugin protocol and the RichText serializers,
 *   editor, and plugin adapter.
 * @output Exports MarkdownPluginsImportExport: Markdown with plugin syntax in,
 *   the plugin nodes RichText recognized, and the Markdown it exports beside
 *   the input, byte for byte; an editor, given the same extensions, to change
 *   the text around the nodes; and a refused plugin's error.
 * @position Lab story for spec:AST-064's import and export. How plugin nodes
 *   look in the editor and the view is the "Markdown plugins" story.
 */

import {useMemo, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {
  colorVars,
  radiusVars,
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  createMarkdownPlugin,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';
import {
  createRichTextExtension,
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
  RichTextEditor,
  type RichTextEditorRef,
} from '@astryxdesign/richtext';

type MentionNode = MarkdownExtensionNode<
  'story-mentions',
  'mention',
  {readonly handle: string},
  'inline'
>;
type NoteNode = MarkdownExtensionNode<
  'story-notes',
  'note',
  {readonly body: string},
  'block'
>;

const mentions = createMarkdownPlugin<'story-mentions', MentionNode>({
  name: 'story-mentions',
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
              plugin: 'story-mentions',
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
        <a href={`#people/${node.data.handle}`}>@{node.data.handle}</a>
      ),
      toText: node => `@${node.data.handle}`,
    },
  },
});

const notes = createMarkdownPlugin<'story-notes', NoteNode>({
  name: 'story-notes',
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
              plugin: 'story-notes',
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
      render: ({node}) => <aside aria-label="Note">{node.data.body}</aside>,
      toText: node => node.data.body,
    },
  },
});

/** A plugin RichText refuses: it declares an immutable transform. */
const shouting = createMarkdownPlugin({
  name: 'story-shouting',
  apiVersion: 1,
  transform: root => root,
});

const EXTENSIONS = [
  createRichTextExtension(mentions),
  createRichTextExtension(notes),
];

const SAMPLE = [
  'Ping @{ada} about the review.',
  '',
  'Marks stay around nodes: *see @{grace} here*, **ask @{linus}**, and ~~not @{old}~~.',
  'Inside link text a mention stays text, as in Markdown: [ask @{ada}](https://example.com).',
  'Code is never a node: `@{ada}` stays code.',
  'This line ends a paragraph',
  ':::note',
  'and this note starts on the next line.',
  ':::',
  '',
].join('\n');

const FORMATS: ReadonlyArray<readonly [number, string]> = [
  [1, 'bold'],
  [2, 'italic'],
  [4, 'strikethrough'],
];

interface Recognized {
  readonly plugin: string;
  readonly display: string;
  readonly source: string;
  readonly marks: string;
}

function recognized(json: string): Array<Recognized> {
  const found: Array<Recognized> = [];
  const visit = (node: Record<string, unknown>) => {
    if (node.type === 'astryx-markdown-extension') {
      const format = (node.format as number | undefined) ?? 0;
      found.push({
        plugin: node.plugin as string,
        display: node.display as string,
        source: node.source as string,
        marks:
          FORMATS.filter(([bit]) => (format & bit) !== 0)
            .map(([, name]) => name)
            .join(', ') || 'none',
      });
    }
    (node.children as Array<Record<string, unknown>> | undefined)?.forEach(
      visit,
    );
  };
  visit((JSON.parse(json) as {root: Record<string, unknown>}).root);
  return found;
}

// Theme tokens, so every box reads in light and dark mode.
const styles = stylex.create({
  page: {
    display: 'grid',
    gap: spacingVars['--spacing-6'],
    maxWidth: 1100,
    color: colorVars['--color-text-primary'],
  },
  columns: {
    display: 'grid',
    gap: spacingVars['--spacing-4'],
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  stack: {
    display: 'grid',
    gap: spacingVars['--spacing-2'],
    alignContent: 'start',
  },
  box: {
    margin: 0,
    padding: spacingVars['--spacing-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-muted'],
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-code'],
    fontSize: 13,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  table: {
    borderCollapse: 'collapse',
    color: colorVars['--color-text-primary'],
  },
  cell: {
    textAlign: 'start',
    paddingBlock: spacingVars['--spacing-1'],
    paddingInlineEnd: spacingVars['--spacing-4'],
    borderBlockEndWidth: 1,
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: colorVars['--color-border'],
  },
});

export function MarkdownPluginsImportExport() {
  const [markdown, setMarkdown] = useState(SAMPLE);
  const json = useMemo(
    () => markdownToEditorStateJSON(markdown, {extensions: EXTENSIONS}),
    [markdown],
  );
  const exported = useMemo(() => editorStateJSONToMarkdown(json), [json]);
  const nodes = useMemo(() => recognized(json), [json]);
  const editor = useRef<RichTextEditorRef>(null);
  const [edited, setEdited] = useState('');
  const refusal = useMemo(() => {
    try {
      createRichTextExtension(shouting);
      return 'adopted';
    } catch (error) {
      return error instanceof Error ? `${error.name}: ${error.message}` : '';
    }
  }, []);
  return (
    <div {...stylex.props(styles.page)}>
      <section {...stylex.props(styles.columns)}>
        <label {...stylex.props(styles.stack)}>
          <Text type="label">Markdown in</Text>
          <textarea
            data-plugins-input=""
            rows={12}
            value={markdown}
            onChange={event => setMarkdown(event.target.value)}
            {...stylex.props(styles.box)}
          />
        </label>
        <div {...stylex.props(styles.stack)}>
          <Text type="label">
            Markdown out{' '}
            <strong data-plugins-identical="">
              {exported === markdown
                ? '— identical, byte for byte'
                : '— differs from the input'}
            </strong>
          </Text>
          <pre data-plugins-output="" {...stylex.props(styles.box)}>
            {exported}
          </pre>
        </div>
      </section>
      <section {...stylex.props(styles.stack)}>
        <Text type="label">Plugin nodes RichText recognized</Text>
        <table data-plugins-nodes="" {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.cell)}>Plugin</th>
              <th {...stylex.props(styles.cell)}>Display</th>
              <th {...stylex.props(styles.cell)}>Source</th>
              <th {...stylex.props(styles.cell)}>Marks around it</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, index) => (
              <tr key={index}>
                <td {...stylex.props(styles.cell)}>{node.plugin}</td>
                <td {...stylex.props(styles.cell)}>{node.display}</td>
                <td {...stylex.props(styles.cell)}>
                  <code>{node.source}</code>
                </td>
                <td {...stylex.props(styles.cell)}>{node.marks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section {...stylex.props(styles.stack)}>
        <Text type="label">
          Edit the text around the nodes, then export. The editor is given the
          same extensions, so each node renders as Markdown renders it.
        </Text>
        <RichTextEditor
          key={json}
          label="Editor"
          ref={editor}
          defaultValue={json}
          markdownExtensions={EXTENSIONS}
        />
        <div>
          <Button
            label="Export"
            variant="secondary"
            onClick={() => setEdited(editor.current?.getMarkdown() ?? '')}
          />
        </div>
        <pre data-plugins-edited="" {...stylex.props(styles.box)}>
          {edited}
        </pre>
      </section>
      <section {...stylex.props(styles.stack)}>
        <Text type="label">A plugin with a transform is refused</Text>
        <pre data-plugins-refusal="" {...stylex.props(styles.box)}>
          {refusal}
        </pre>
      </section>
    </div>
  );
}
