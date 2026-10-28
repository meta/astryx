// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useId, useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  RichTextEditor,
  RichTextView,
  markdownToEditorStateJSON,
  editorStateJSONToMarkdown,
  RichTextEditorToolbar,
  RichTextEditorAutoLinkPlugin,
  type RichTextEditorRef,
} from '@astryxdesign/richtext';
import type {EditorState} from 'lexical';
import {objectiveC} from '@astryxdesign/core/CodeBlock/languages/objective-c';
import {thrift} from '@astryxdesign/core/CodeBlock/languages/thrift';
import {BOLD_STAR, ITALIC_STAR, UNORDERED_LIST} from '@lexical/markdown';
import {$getRoot} from 'lexical';
import {
  LONG_DOCUMENT_COPIES,
  MarkdownParitySandbox,
  type MarkdownParitySandboxProps,
} from './RichTextEditor.markdownParity';
import {MarkdownPluginsImportExport as MarkdownPluginsImportExportStory} from './RichTextEditor.markdownPluginsImportExport';
import {MarkdownPluginsSandbox} from './RichTextEditor.markdownPlugins';
import {RichTextEditorPlayground} from './RichTextEditor.playground';

const meta: Meta<typeof RichTextEditor> = {
  title: 'RichText/RichTextEditor',
  component: RichTextEditor,
  tags: ['autodocs'],
  argTypes: {
    label: {control: 'text', description: 'Label text (required)'},
    isLabelHidden: {control: 'boolean'},
    description: {control: 'text'},
    placeholder: {control: 'text'},
    isReadOnly: {control: 'boolean'},
    isDisabled: {control: 'boolean'},
    isRequired: {control: 'boolean'},
    isOptional: {control: 'boolean'},
    hasMarkdownShortcuts: {control: 'boolean'},
    hasAutoFocus: {control: 'boolean'},
    maxLength: {control: 'number'},
    minHeight: {
      control: 'text',
      description:
        'Minimum height of the editable surface (number in pixels or CSS length).',
    },
    size: {control: 'select', options: ['sm', 'md', 'lg']},
    statusVariant: {
      control: 'select',
      options: ['attached', 'detached', 'tooltip'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof RichTextEditor>;

/**
 * Every feature on one editor — the Astryx counterpart of
 * playground.lexical.dev. The other stories each mount their own editor to
 * show one thing; this one exists so the features can be combined on a single
 * document and watched for interactions: a toolbar format inside a table
 * cell, a Markdown shortcut inside a code block, an autolinked URL exported
 * back to Markdown. The panel beside the editor reads that same editor's
 * Markdown, HTML, editor state, node tree, and read-only RichTextView render.
 */
export const Playground = {
  // Page-sized, like the parity sandboxes: keep it off the docs page.
  tags: ['!autodocs'],
  parameters: {controls: {disable: true}},
  render: () => <RichTextEditorPlayground />,
};

export const Default: Story = {
  args: {
    label: 'Notes',
    placeholder: 'Write something…',
  },
};

export const WithToolbar: Story = {
  args: {
    label: 'Notes',
    placeholder: 'Format with the toolbar above…',
    toolbar: <RichTextEditorToolbar />,
  },
};

export const ResponsiveToolbar: Story = {
  name: 'Responsive toolbar',
  render: args => (
    <div
      style={{
        width: 420,
        minWidth: 280,
        maxWidth: '100%',
        resize: 'horizontal',
        overflow: 'hidden',
      }}>
      <RichTextEditor {...args} />
    </div>
  ),
  args: {
    label: 'Notes',
    description: 'Resize the editor to test the horizontal toolbar scroll.',
    placeholder: 'Every formatting action stays directly available…',
    toolbar: <RichTextEditorToolbar />,
  },
};

export const ResponsiveToolbarStressTest: Story = {
  name: 'Responsive toolbar — stress test',
  render: args => {
    const [width, setWidth] = useState(420);

    return (
      <div style={{display: 'grid', gap: 16}}>
        <label
          style={{
            display: 'grid',
            gap: 8,
            maxWidth: 560,
            font: 'inherit',
          }}>
          <span>Editor width: {width}px</span>
          <input
            type="range"
            min={240}
            max={900}
            step={10}
            value={width}
            aria-label="Editor width"
            onChange={event => setWidth(event.currentTarget.valueAsNumber)}
          />
        </label>
        <div style={{width, maxWidth: '100%'}}>
          <RichTextEditor {...args} />
        </div>
      </div>
    );
  },
  args: {
    label: 'Responsive toolbar stress test',
    description:
      'Sweep from 240px to 900px to stress the horizontal toolbar scroll.',
    placeholder: 'Scroll the toolbar and toggle several formats…',
    toolbar: <RichTextEditorToolbar />,
  },
};

export const WithLinks: Story = {
  args: {
    label: 'Notes',
    placeholder:
      'Select text and press the Link button (or Cmd/Ctrl+K) to add a link…',
    // The toolbar's Link button creates new-tab links by default (target/rel
    // baked into the node). No extra plugin needed.
    toolbar: <RichTextEditorToolbar />,
  },
};

export const WithAutoLink: Story = {
  args: {
    label: 'Notes',
    placeholder: 'Type a URL like https://astryx.dev and it auto-links…',
    toolbar: <RichTextEditorToolbar />,
    // Auto-linkify typed/pasted URLs + emails (open in a new tab).
    plugins: <RichTextEditorAutoLinkPlugin />,
  },
};

export const WithDescription: Story = {
  args: {
    label: 'Release notes',
    description: 'Supports **bold**, _italic_, lists, quotes and links.',
    placeholder: 'Describe what changed…',
  },
};

export const Required: Story = {
  args: {
    label: 'Summary',
    isRequired: true,
    placeholder: 'Required field',
  },
};

export const WithCharacterLimit: Story = {
  args: {
    label: 'Bio',
    maxLength: 80,
    description:
      'A character counter appears below the editor when maxLength is set.',
    placeholder: 'Type past 80 characters to see the counter turn red…',
  },
};

export const CustomTransformers: Story = {
  args: {
    label: 'Comment',
    description:
      'Restricted markdown: only `**bold**`, `*italic*` and `- ` unordered lists (no headings, quotes or code).',
    placeholder: 'Try typing "# " — it will not become a heading…',
    transformers: [BOLD_STAR, ITALIC_STAR, UNORDERED_LIST],
  },
};

export const ErrorStatus: Story = {
  args: {
    label: 'Notes',
    placeholder: 'Write something…',
    status: {type: 'error', message: 'This field is required.'},
    statusVariant: 'attached',
  },
};

export const DetachedStatus: Story = {
  args: {
    label: 'Notes',
    placeholder: 'Write something…',
    status: {type: 'warning', message: 'Review this content before saving.'},
    statusVariant: 'detached',
  },
};

export const TooltipStatus: Story = {
  args: {
    label: 'Notes',
    placeholder: 'Write something…',
    status: {type: 'error', message: 'This field is required.'},
    statusVariant: 'tooltip',
  },
};

export const ReadOnly: Story = {
  args: {
    label: 'Notes',
    isReadOnly: true,
  },
};

const SEED = JSON.stringify({
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'The quick brown fox jumps over the lazy dog.',
            type: 'text',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
});

export const WithInitialValue: Story = {
  args: {
    label: 'Notes',
    defaultValue: SEED,
  },
};

/**
 * Serialize on change and render the same content read-only with RichTextView.
 */
export const ControlledPersistence = {
  render: () => {
    const [json, setJson] = useState<string>(SEED);
    return (
      <div style={{display: 'grid', gap: 24, maxWidth: 560}}>
        <RichTextEditor
          label="Editor"
          defaultValue={SEED}
          placeholder="Type here…"
          onChange={(state: EditorState) =>
            setJson(JSON.stringify(state.toJSON()))
          }
        />
        <div>
          <div style={{fontWeight: 600, marginBottom: 8}}>
            RichTextView (read-only render of the same content)
          </div>
          <RichTextView value={json} />
        </div>
      </div>
    );
  },
};

export const ImperativeRef = {
  render: () => {
    const ref = useRef<RichTextEditorRef>(null);
    const [readout, setReadout] = useState<string>('(nothing read yet)');
    return (
      <div style={{display: 'grid', gap: 16, maxWidth: 560}}>
        <RichTextEditor
          ref={ref}
          label="Editor with imperative ref"
          defaultValue={SEED}
          placeholder="Type here, then use the buttons below…"
        />
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
          <button type="button" onClick={() => ref.current?.focus()}>
            focus()
          </button>
          <button type="button" onClick={() => ref.current?.clear()}>
            clear()
          </button>
          <button
            type="button"
            onClick={() => {
              const state = ref.current?.getEditorState();
              const text = state?.read(() => $getRoot().getTextContent());
              setReadout(
                `getEditorState() text content: ${JSON.stringify(text)}`,
              );
            }}>
            getEditorState()
          </button>
          <button
            type="button"
            onClick={() => {
              const md = ref.current?.getMarkdown();
              setReadout(`getMarkdown():\n${md}`);
            }}>
            getMarkdown()
          </button>
          <button
            type="button"
            onClick={() => {
              const html = ref.current?.getHTML();
              setReadout(`getHTML():\n${html}`);
            }}>
            getHTML()
          </button>
          <button
            type="button"
            onClick={() => {
              const editor = ref.current?.getEditor();
              setReadout(
                `getEditor() -> ${editor ? 'LexicalEditor instance ✓' : 'null'}`,
              );
            }}>
            getEditor()
          </button>
        </div>
        <pre
          style={{
            background: 'var(--color-background-muted)',
            color: 'var(--color-text-primary)',
            padding: 12,
            borderRadius: 6,
            fontSize: 13,
            whiteSpace: 'pre-wrap',
          }}>
          {readout}
        </pre>
      </div>
    );
  },
};

const SAMPLE_MARKDOWN = `# Release notes

Supports **bold**, _italic_, and lists:

- First item
- Second item

> A blockquote for good measure.`;

/**
 * Playground for the standalone Markdown <-> EditorState serializer helpers
 * (markdownToEditorStateJSON / editorStateJSONToMarkdown) added in #4544.
 *
 * These run headless — no mounted editor needed. Here we:
 *  1. Take Markdown text (left),
 *  2. Serialize it to an EditorState JSON string with `markdownToEditorStateJSON`,
 *  3. Feed that JSON straight into a live <RichTextEditor defaultValue={...} />
 *     AND a read-only <RichTextView />,
 *  4. Round-trip it back to Markdown with `editorStateJSONToMarkdown`
 *     so you can eyeball that Markdown -> JSON -> Markdown is stable.
 */
/**
 * One document with an inline and a block Markdown plugin node in core
 * Markdown, RichTextView, and RichTextEditor (spec:AST-064): each node renders
 * the same everywhere and edits as one unit. Copy a node into the editor
 * given the plugins, or into the one that is not, which shows its source.
 */
export const MarkdownPlugins = {
  name: 'Markdown plugins',
  render: () => <MarkdownPluginsSandbox />,
};

/**
 * Markdown with plugin syntax in, and out again (spec:AST-064). A mention
 * plugin and a note-block plugin, adopted with createRichTextExtension, are
 * recognized as RichText imports the Markdown; the exported Markdown sits
 * beside the input, byte for byte. Nodes inside emphasis, strong, and
 * strikethrough stay inside them, a note that starts on the line after a
 * paragraph line becomes its own block, and a plugin with a transform is
 * refused. Edit the text around the nodes and export to see them kept.
 */
export const MarkdownPluginsImportExport = {
  name: 'Markdown plugins: import and export',
  render: () => <MarkdownPluginsImportExportStory />,
};

export const MarkdownSerializers = {
  render: () => {
    const [markdown, setMarkdown] = useState<string>(SAMPLE_MARKDOWN);
    const inputLabelID = useId();

    const json = markdownToEditorStateJSON(markdown);
    const roundTripped = editorStateJSONToMarkdown(json);

    const boxStyle = {
      background: 'var(--color-background-muted)',
      color: 'var(--color-text-primary)',
      padding: 12,
      borderRadius: 6,
      fontSize: 13,
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const,
      margin: 0,
    };

    return (
      <div style={{display: 'grid', gap: 24, maxWidth: 720}}>
        <div>
          <div id={inputLabelID} style={{fontWeight: 600, marginBottom: 8}}>
            1. Input Markdown (edit me)
          </div>
          <textarea
            aria-labelledby={inputLabelID}
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            rows={10}
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 13,
              padding: 12,
              borderRadius: 6,
              border: '1px solid #ccc',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <div style={{fontWeight: 600, marginBottom: 8}}>
            2. markdownToEditorStateJSON(...) -&gt; live RichTextEditor
          </div>
          {/* key forces a remount when the serialized JSON changes, since
              defaultValue is only read on mount. */}
          <RichTextEditor
            key={json}
            label="Editor seeded from Markdown"
            defaultValue={json}
            placeholder="(serialized Markdown renders here)"
          />
        </div>

        <div>
          <div style={{fontWeight: 600, marginBottom: 8}}>
            3. Same JSON rendered read-only via RichTextView
          </div>
          <RichTextView value={json} />
        </div>

        <div>
          <div style={{fontWeight: 600, marginBottom: 8}}>
            4. editorStateJSONToMarkdown(json) -&gt; round-tripped Markdown
          </div>
          <pre style={boxStyle}>{roundTripped}</pre>
        </div>

        <details>
          <summary style={{cursor: 'pointer', fontWeight: 600}}>
            Serialized EditorState JSON (markdownToEditorStateJSON output)
          </summary>
          <pre style={{...boxStyle, marginTop: 8}}>{json}</pre>
        </details>
      </div>
    );
  },
};

/**
 * Markdown parity sandbox: one Markdown document rendered by core Markdown
 * (read) and RichTextEditor (edit). It is diagnostic: it shows current behavior
 * and promises no parity. Theme, color mode, and direction come from the
 * toolbar; the viewport menu offers 390px and 1440px.
 */
type MarkdownParityStory = StoryObj<MarkdownParitySandboxProps>;

const markdownParity: MarkdownParityStory = {
  render: args => <MarkdownParitySandbox {...args} />,
  // Page-sized diagnostics, not usage examples: keep them off the docs page.
  tags: ['!autodocs'],
  argTypes: {
    view: {
      control: 'inline-radio',
      options: ['side-by-side', 'toggle', 'overlay'],
    },
    isLongDocument: {
      control: 'boolean',
      description: `Repeat the fixture ${LONG_DOCUMENT_COPIES} times.`,
    },
    hasPlugins: {
      control: 'boolean',
      description:
        "Read side: Markdown's GFM autolinks and the demo plugins. Edit side: RichText's autolink plugin.",
    },
    hostWidth: {control: 'inline-radio', options: ['fill', '680px']},
  },
  parameters: {
    controls: {include: ['view', 'isLongDocument', 'hasPlugins', 'hostWidth']},
    viewport: {
      options: {
        parityPhone: {
          name: 'Phone (390px)',
          styles: {width: '390px', height: '844px'},
          type: 'mobile',
        },
        parityDesktop: {
          name: 'Desktop (1440px)',
          styles: {width: '1440px', height: '900px'},
          type: 'desktop',
        },
      },
    },
  },
};

export const MarkdownParity: MarkdownParityStory = {
  ...markdownParity,
  name: 'Markdown parity: side by side',
  args: {
    view: 'side-by-side',
    isLongDocument: false,
    hasPlugins: true,
    hostWidth: 'fill',
  },
};

export const MarkdownParityToggle: MarkdownParityStory = {
  ...markdownParity,
  name: 'Markdown parity: read/edit toggle',
  args: {
    view: 'toggle',
    isLongDocument: false,
    hasPlugins: true,
    hostWidth: '680px',
  },
};

export const MarkdownParityOverlay: MarkdownParityStory = {
  ...markdownParity,
  name: 'Markdown parity: overlay',
  args: {
    view: 'overlay',
    isLongDocument: false,
    hasPlugins: true,
    hostWidth: '680px',
  },
};

export const MarkdownParityLongDocument: MarkdownParityStory = {
  ...markdownParity,
  name: 'Markdown parity: long document',
  args: {
    view: 'toggle',
    isLongDocument: true,
    hasPlugins: true,
    hostWidth: '680px',
  },
};

const OBJC_FENCE = markdownToEditorStateJSON(
  '```objc\n@interface Greeter : NSObject\n@end\n```',
);

const THRIFT_FENCE = markdownToEditorStateJSON(
  '```thrift\n# A user record\nstruct User {\n  1: required string name;\n}\n```',
);

/**
 * Code blocks colour a fence named by a value in `codeLanguages`, as Markdown
 * does, and label it with the value's name; without it the fence stays plain.
 */
export const CodeLanguageModules: Story = {
  render: () => (
    <div style={{display: 'grid', gap: 16, maxWidth: 520}}>
      <div data-testid="listed">
        <RichTextView value={THRIFT_FENCE} codeLanguages={[thrift]} />
      </div>
      <div data-testid="listed-renamed">
        <RichTextView value={OBJC_FENCE} codeLanguages={[objectiveC]} />
      </div>
      <div data-testid="unlisted">
        <RichTextView value={THRIFT_FENCE} />
      </div>
    </div>
  ),
};
