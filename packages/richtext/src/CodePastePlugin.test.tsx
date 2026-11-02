// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, render, waitFor} from '@testing-library/react';
import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode, type CodeNode} from '@lexical/code';
import {
  $getRoot,
  $isLineBreakNode,
  $isTextNode,
  PASTE_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {
  createMarkdownPlugin,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';
import {RichTextEditor} from './RichTextEditor';
import {createRichTextExtension, markdownToEditorStateJSON} from './markdown';

// jsdom has no clipboard or drag events; Lexical tells a paste from a drop
// by these classes.
beforeAll(() => {
  if (typeof ClipboardEvent === 'undefined') {
    vi.stubGlobal('ClipboardEvent', class ClipboardEvent extends Event {});
  }
  if (typeof DragEvent === 'undefined') {
    vi.stubGlobal('DragEvent', class DragEvent extends Event {});
  }
});
afterAll(() => {
  vi.unstubAllGlobals();
});

/** A paragraph, a code block ending in an empty line, and a paragraph. */
const DOCUMENT = 'Run it:\n\n```ts\nconst x = 1;\n\n```\n\nDone.\n';

type MentionNode = MarkdownExtensionNode<
  'test-mentions',
  'mention',
  {readonly label: string},
  'inline'
>;

/** A Markdown plugin that reads `@{name}` as an inline mention node. */
const MENTIONS = createRichTextExtension(
  createMarkdownPlugin<'test-mentions', MentionNode>({
    name: 'test-mentions',
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
                plugin: 'test-mentions',
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
        render: ({node}) => <mark>@{node.data.label}</mark>,
        toText: node => `@${node.data.label}`,
      },
    },
  }),
);

async function renderEditor(): Promise<LexicalEditor> {
  let captured: LexicalEditor | undefined;
  function CaptureEditor() {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
      captured = editor;
    }, [editor]);
    return null;
  }
  render(
    <RichTextEditor
      label="Notes"
      defaultValue={markdownToEditorStateJSON(DOCUMENT)}
      markdownExtensions={[MENTIONS]}
      plugins={<CaptureEditor />}
    />,
  );
  await waitFor(() => expect(captured).toBeDefined());
  return captured!;
}

function $codeBlock(): CodeNode {
  const code = $getRoot().getChildren().find($isCodeNode);
  if (code == null) {
    throw new Error('The editor holds no code block');
  }
  return code;
}

/** Puts the caret on the code block's empty last line. */
function caretInCode(editor: LexicalEditor) {
  act(() => {
    editor.update(() => $codeBlock().selectEnd(), {discrete: true});
  });
}

/** Pastes clipboard data of the given types, and commits the paste. */
function paste(editor: LexicalEditor, data: Record<string, string>) {
  const event = new ClipboardEvent('paste', {cancelable: true});
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => data[type] ?? '',
      types: Object.keys(data),
      files: [],
    },
  });
  act(() => {
    editor.dispatchCommand(PASTE_COMMAND, event);
    editor.read(() => undefined);
  });
}

/**
 * Each top-level block's type, the code block's text, and anything the code
 * block holds besides plain code: an element, a decorator, or formatted text.
 */
function shape(editor: LexicalEditor) {
  return editor.read(() => {
    const code = $codeBlock();
    return {
      blocks: $getRoot()
        .getChildren()
        .map(block => block.getType()),
      code: code.getTextContent(),
      codeHolds: code.getChildren().flatMap(child => {
        if ($isTextNode(child)) {
          return child.getFormat() === 0
            ? []
            : [`formatted ${child.getType()}`];
        }
        return $isLineBreakNode(child) ? [] : [child.getType()];
      }),
    };
  });
}

/** A word processor's clipboard: a heading, formatted text, a list, a table. */
const RICH_HTML =
  '<h2>Plan</h2>' +
  '<p><b>Bold</b> and <i>italic</i> with <a href="https://example.com">a link</a></p>' +
  '<ul><li>one</li><li>two</li></ul>' +
  '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
const RICH_TEXT = 'Plan\nBold and italic with a link\none\ntwo\na\tb';

describe('pasting into a code block', () => {
  it('pastes rich content as the plain text on the clipboard', async () => {
    const editor = await renderEditor();
    caretInCode(editor);

    paste(editor, {'text/html': RICH_HTML, 'text/plain': RICH_TEXT});
    expect(shape(editor)).toEqual({
      blocks: ['paragraph', 'code', 'paragraph'],
      code: `const x = 1;\n${RICH_TEXT}`,
      codeHolds: [],
    });
  });

  it('keeps copied code exactly, indentation included', async () => {
    const editor = await renderEditor();
    caretInCode(editor);
    const code = 'if (x) {\n\treturn  1;\n}';

    paste(editor, {
      'text/html': `<pre><code>${code}</code></pre>`,
      'text/plain': code,
    });
    expect(shape(editor)).toEqual({
      blocks: ['paragraph', 'code', 'paragraph'],
      code: `const x = 1;\n${code}`,
      codeHolds: [],
    });
  });

  it('pastes HTML with no plain text as the text of its blocks, one line each', async () => {
    const editor = await renderEditor();
    caretInCode(editor);

    paste(editor, {
      'text/html':
        '<p>intro</p><table><tr><td>a</td><td>b</td></tr></table><ul><li>one</li><li>two</li></ul>',
    });
    expect(shape(editor)).toEqual({
      blocks: ['paragraph', 'code', 'paragraph'],
      code: 'const x = 1;\nintro\na\nb\none\ntwo',
      codeHolds: [],
    });
  });

  it('pastes blocks copied from an editor, with no plain text, as their lines', async () => {
    const editor = await renderEditor();
    caretInCode(editor);
    const copied = JSON.parse(
      markdownToEditorStateJSON('## Heading\n\n- one\n- two\n\n**Last**\n'),
    ).root.children;

    paste(editor, {
      'application/x-lexical-editor': JSON.stringify({
        namespace: 'astryx-editor',
        nodes: copied,
      }),
    });
    expect(shape(editor)).toEqual({
      blocks: ['paragraph', 'code', 'paragraph'],
      code: 'const x = 1;\nHeading\none\ntwo\nLast',
      codeHolds: [],
    });
  });

  it('pastes a Markdown plugin node as its source (spec:AST-064)', async () => {
    const editor = await renderEditor();
    caretInCode(editor);
    // Inline content copied from inside a paragraph: text and a mention.
    const [paragraph] = JSON.parse(
      markdownToEditorStateJSON('Hi @{ada}', {extensions: [MENTIONS]}),
    ).root.children;

    paste(editor, {
      'application/x-lexical-editor': JSON.stringify({
        namespace: 'astryx-editor',
        nodes: paragraph.children,
      }),
    });
    expect(shape(editor)).toEqual({
      blocks: ['paragraph', 'code', 'paragraph'],
      code: 'const x = 1;\nHi @{ada}',
      codeHolds: [],
    });
  });

  it('still pastes rich content as blocks outside a code block', async () => {
    const editor = await renderEditor();
    act(() => {
      editor.update(() => $getRoot().getLastChildOrThrow().selectEnd(), {
        discrete: true,
      });
    });

    paste(editor, {
      'text/html': '<h2>Plan</h2><p>Next</p>',
      'text/plain': 'Plan\nNext',
    });
    const after = shape(editor);
    expect(after.code).toBe('const x = 1;\n');
    expect(after.blocks).toEqual([
      'paragraph',
      'code',
      'paragraph',
      'paragraph',
    ]);
  });
});
