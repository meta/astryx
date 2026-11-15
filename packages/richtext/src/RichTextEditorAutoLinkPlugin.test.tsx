// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditorAutoLinkPlugin.test.tsx
 * @input RichTextEditor with RichTextEditorAutoLinkPlugin mounted
 * @output Proof that auto-linking skips code blocks, on import and on paste,
 *   and still links a URL in ordinary text (spec:AST-062 FR3, FR6)
 * @position Colocated tests for the auto-link plugin
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, render, waitFor} from '@testing-library/react';
import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode, type CodeNode} from '@lexical/code';
import {$isAutoLinkNode} from '@lexical/link';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  PASTE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';
import {RichTextEditor} from './RichTextEditor';
import {RichTextEditorAutoLinkPlugin} from './RichTextEditorAutoLinkPlugin';
import {markdownToEditorStateJSON} from './markdown';

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

async function renderEditor(document: string): Promise<LexicalEditor> {
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
      defaultValue={markdownToEditorStateJSON(document)}
      plugins={
        <>
          <RichTextEditorAutoLinkPlugin />
          <CaptureEditor />
        </>
      }
    />,
  );
  await waitFor(() => expect(captured).toBeDefined());
  // Let the node transforms run on the imported state.
  act(() => {
    captured!.update(() => undefined, {discrete: true});
  });
  return captured!;
}

function $codeBlock(): CodeNode {
  const code = $getRoot().getChildren().find($isCodeNode);
  if (code == null) {
    throw new Error('The editor holds no code block');
  }
  return code;
}

function $autoLinks(node: LexicalNode): number {
  if ($isAutoLinkNode(node)) {
    return 1;
  }
  return $isElementNode(node)
    ? node.getChildren().reduce((sum, child) => sum + $autoLinks(child), 0)
    : 0;
}

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

describe('RichTextEditorAutoLinkPlugin and code blocks', () => {
  it('leaves a URL in an imported fence as code', async () => {
    const editor = await renderEditor(
      '```sh\ncurl https://example.com/api\n```\n',
    );
    expect(editor.read(() => $autoLinks($codeBlock()))).toBe(0);
    expect(editor.read(() => $codeBlock().getTextContent())).toBe(
      'curl https://example.com/api',
    );
  });

  it('leaves a URL in a rich paste into a code block as code', async () => {
    const editor = await renderEditor('```ts\nconst x = 1;\n\n```\n');
    act(() => {
      editor.update(() => $codeBlock().selectEnd(), {discrete: true});
    });
    paste(editor, {
      'text/html': '<p>See https://example.com</p>',
      'text/plain': 'See https://example.com',
    });
    expect(editor.read(() => $codeBlock().getTextContent())).toBe(
      'const x = 1;\nSee https://example.com',
    );
    expect(editor.read(() => $autoLinks($codeBlock()))).toBe(0);
  });

  it('leaves a URL typed into a code block as code', async () => {
    const editor = await renderEditor('```ts\nconst x = 1;\n\n```\n');
    act(() => {
      editor.update(
        () => {
          $codeBlock().selectEnd();
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText('// see https://example.com ');
          }
        },
        {discrete: true},
      );
    });
    expect(editor.read(() => $codeBlock().getTextContent())).toBe(
      'const x = 1;\n// see https://example.com ',
    );
    expect(editor.read(() => $autoLinks($codeBlock()))).toBe(0);
  });

  it('still links a URL in ordinary text', async () => {
    const editor = await renderEditor('See https://example.com today.\n');
    expect(editor.read(() => $autoLinks($getRoot()))).toBe(1);
  });
});
