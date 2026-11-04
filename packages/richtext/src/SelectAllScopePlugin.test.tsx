// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectAllScopePlugin.test.tsx
 * @input Uses vitest, @testing-library/react, lexical, RichTextEditor, and the
 *   Markdown serializers.
 * @output Presses Ctrl+A (Mod+A off Apple platforms) in a mounted
 *   RichTextEditor and checks that a code block or table cell holding the
 *   caret is selected first and the whole document on the next press.
 * @position Testing; validates SelectAllScopePlugin.tsx through
 *   RichTextEditor.
 */

import {beforeAll, describe, expect, it} from 'vitest';
import {createRef} from 'react';
import {act, fireEvent, render} from '@testing-library/react';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  SELECT_ALL_COMMAND,
  SKIP_SCROLL_INTO_VIEW_TAG,
  type LexicalEditor,
} from 'lexical';
import {
  RichTextEditor,
  type RichTextEditorProps,
  type RichTextEditorRef,
} from './RichTextEditor';
import {markdownToEditorStateJSON} from './markdownSerializers';

// jsdom's Range has no getBoundingClientRect, which Lexical calls to scroll
// the selection into view in a focused editor.
beforeAll(() => {
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
});

const DOCUMENT =
  'Above.\n\n```sql\nSELECT 1\nFROM t\n```\n\n| Owner | Approved |\n| --- | --- |\n| Ada | Yes |\n\nBelow.\n';

function mount(props: Partial<RichTextEditorProps> = {}): LexicalEditor {
  const ref = createRef<RichTextEditorRef>();
  render(
    <RichTextEditor
      label="Notes"
      {...props}
      ref={ref}
      defaultValue={markdownToEditorStateJSON(DOCUMENT)}
    />,
  );
  const editor = ref.current?.getEditor();
  if (editor == null) {
    throw new Error('No editor');
  }
  return editor;
}

/**
 * Focuses the editor, as a person typing in it has, and puts the caret in
 * the text that starts with `text`. A non-editable editor keeps no DOM
 * selection, so focusing it would move the caret; it is left unfocused.
 */
async function caretIn(editor: LexicalEditor, text: string): Promise<void> {
  await act(async () => {
    if (editor.isEditable()) {
      editor.getRootElement()?.focus();
    }
    editor.update(
      () => {
        const node = $getRoot()
          .getAllTextNodes()
          .find(textNode => textNode.getTextContent().startsWith(text));
        if (node == null) {
          throw new Error(`No text starts with ${text}`);
        }
        node.select(1, 1);
      },
      {discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG},
    );
  });
}

function selectedText(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    return $isRangeSelection(selection) ? selection.getTextContent() : '';
  });
}

/** Presses Ctrl+A, the select-all shortcut off Apple platforms. */
async function selectAll(editor: LexicalEditor): Promise<string> {
  const root = editor.getRootElement();
  if (root == null) {
    throw new Error('No editor root');
  }
  await act(async () => {
    fireEvent.keyDown(root, {key: 'a', ctrlKey: true});
  });
  return selectedText(editor);
}

function expectWholeDocument(text: string): void {
  expect(text).toContain('Above.');
  expect(text).toContain('SELECT 1');
  expect(text).toContain('Approved');
  expect(text).toContain('Below.');
}

describe('select all, one scope at a time', () => {
  it('selects the code block holding the caret, then the whole document', async () => {
    const editor = mount();
    await caretIn(editor, 'SELECT 1');
    expect(await selectAll(editor)).toBe('SELECT 1\nFROM t');
    expectWholeDocument(await selectAll(editor));
  });

  it('selects the table cell holding the caret, then the whole document', async () => {
    const editor = mount();
    await caretIn(editor, 'Approved');
    expect(await selectAll(editor)).toBe('Approved');
    expectWholeDocument(await selectAll(editor));
  });

  it('selects the whole document at once from a paragraph', async () => {
    const editor = mount();
    await caretIn(editor, 'Above.');
    expectWholeDocument(await selectAll(editor));
  });

  it('selects the whole document when the code block is already selected', async () => {
    const editor = mount();
    await act(async () => {
      editor.getRootElement()?.focus();
      editor.update(
        () => {
          const code = $getRoot()
            .getAllTextNodes()
            .find(node => node.getTextContent().startsWith('SELECT 1'))
            ?.getParent();
          if (code == null) {
            throw new Error('No code block');
          }
          code.select(0, code.getChildrenSize());
        },
        {discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG},
      );
    });
    expectWholeDocument(await selectAll(editor));
  });

  it('selects the whole document when the selection runs out of the code block', async () => {
    const editor = mount();
    await act(async () => {
      editor.getRootElement()?.focus();
      editor.update(
        () => {
          const texts = $getRoot().getAllTextNodes();
          const code = texts.find(node =>
            node.getTextContent().startsWith('SELECT 1'),
          );
          const below = texts.find(node => node.getTextContent() === 'Below.');
          if (code == null || below == null) {
            throw new Error('No code block or closing paragraph');
          }
          const selection = code.select(1, 1);
          selection.focus.set(below.getKey(), 2, 'text');
        },
        {discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG},
      );
    });
    expectWholeDocument(await selectAll(editor));
  });

  it('keeps select all whole in a read-only editor', async () => {
    const editor = mount({isReadOnly: true});
    await caretIn(editor, 'SELECT 1');
    // Past the DOM, which ignores keys in a non-editable editor.
    await act(async () => {
      editor.dispatchCommand(SELECT_ALL_COMMAND, new KeyboardEvent('keydown'));
    });
    expectWholeDocument(selectedText(editor));
  });
});
