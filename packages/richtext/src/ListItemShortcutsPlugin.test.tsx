// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListItemShortcutsPlugin.test.tsx
 * @input Uses vitest, @testing-library/react, lexical, RichTextEditor, and the
 *   Markdown serializers.
 * @output Types Markdown block markers at the start of list items in a
 *   mounted RichTextEditor and checks the blocks they make, the undo step
 *   back to the typed marker, the task item shape, and the Markdown export.
 * @position Testing; validates ListItemShortcutsPlugin.tsx through
 *   RichTextEditor, which renders it when `hasMarkdownShortcuts` is on.
 */

import {describe, expect, it} from 'vitest';
import {createRef} from 'react';
import {act, render, waitFor} from '@testing-library/react';
import {$isListNode} from '@lexical/list';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  SKIP_SCROLL_INTO_VIEW_TAG,
  UNDO_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {
  RichTextEditor,
  type RichTextEditorProps,
  type RichTextEditorRef,
} from './RichTextEditor';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

interface Typed {
  readonly editor: LexicalEditor;
  readonly container: HTMLElement;
}

/**
 * Mounts an editor holding `markdown`, puts the caret at the start of the
 * text that begins with `before` (or `at` characters into it), and types
 * `text` one character at a time, as a keyboard does.
 */
async function typeAt(
  markdown: string,
  before: string,
  text: string,
  {
    at = 0,
    ...props
  }: Partial<RichTextEditorProps> & {readonly at?: number} = {},
): Promise<Typed> {
  const ref = createRef<RichTextEditorRef>();
  const {container} = render(
    <RichTextEditor
      label="Notes"
      {...props}
      ref={ref}
      defaultValue={markdownToEditorStateJSON(markdown)}
    />,
  );
  const editor = ref.current?.getEditor();
  if (editor == null) {
    throw new Error('No editor');
  }
  await act(async () => {
    editor.update(
      () => {
        const node = $getRoot()
          .getAllTextNodes()
          .find(textNode => textNode.getTextContent().startsWith(before));
        if (node == null) {
          throw new Error(`No text starts with ${before}`);
        }
        node.select(at, at);
      },
      // jsdom lays nothing out, so Lexical must not scroll to the caret.
      {discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG},
    );
  });
  for (const character of text) {
    await act(async () => {
      editor.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText(character);
          }
        },
        {discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG},
      );
    });
  }
  return {editor, container};
}

/** The document as Markdown, written with the default transformers. */
function markdownOf(editor: LexicalEditor): string {
  return editorStateJSONToMarkdown(
    JSON.stringify(editor.getEditorState().toJSON()),
  );
}

async function undo(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  });
}

describe('Markdown shortcuts typed at the start of a list item', () => {
  it("leaves a heading's own marker to Lexical's shortcuts, which re-mark it as one undo step", async () => {
    const {editor} = await typeAt('## Plan the launch\n', 'Plan', '### ');
    expect(markdownOf(editor)).toBe('### Plan the launch\n');
    await undo(editor);
    expect(markdownOf(editor)).toBe('## \\### Plan the launch\n');
  });

  it.each([
    ['1. ', '- Plan the launch\n', 'Plan', '1. Plan the launch\n'],
    ['- ', '1. Plan the launch\n', 'Plan', '- Plan the launch\n'],
    ['* ', '1. Plan the launch\n', 'Plan', '- Plan the launch\n'],
    ['[ ] ', '- Plan the launch\n', 'Plan', '- [ ] Plan the launch\n'],
    ['3. ', '- One\n- Two\n', 'One', '3. One\n4. Two\n'],
    [
      '[ ] ',
      '- First item\n- Second item\n',
      'Second',
      '- [ ] First item\n- [ ] Second item\n',
    ],
    [
      '[x] ',
      '- First item\n- Second item\n',
      'Second',
      '- [ ] First item\n- [x] Second item\n',
    ],
    ['[ ] ', '1. One\n2. Two\n', 'Two', '- [ ] One\n- [ ] Two\n'],
    ['- ', '- [ ] One\n- [x] Two\n', 'One', '- One\n- Two\n'],
    ['1. ', '- [ ] One\n- [x] Two\n', 'Two', '1. One\n2. Two\n'],
    ['1. ', '- Outer\n  - Inner\n', 'Inner', '- Outer\n  1. Inner\n'],
  ])(
    '%j switches the list of an item in %j',
    async (marker, markdown, before, expected) => {
      const {editor} = await typeAt(markdown, before, marker);
      expect(markdownOf(editor)).toBe(expected);
    },
  );

  it.each([
    ['# ', '- First item\n', 'First', '# First item\n'],
    ['> ', '- First item\n', 'First', '> First item\n'],
    [
      '### ',
      '- First item\n- Second item\n- Third item\n',
      'Second',
      '- First item\n\n### Second item\n\n- Third item\n',
    ],
    [
      '> ',
      '1. One\n2. Two\n3. Three\n',
      'Two',
      '1. One\n\n> Two\n\n3. Three\n',
    ],
    [
      '## ',
      '- One\n- Two\n  - Two a\n- Three\n',
      'Two',
      '- One\n\n## Two\n\n- Two a\n- Three\n',
    ],
  ])(
    '%j takes an item of %j out of its list, which continues after it',
    async (marker, markdown, before, expected) => {
      const {editor} = await typeAt(markdown, before, marker);
      expect(markdownOf(editor)).toBe(expected);
    },
  );

  it('makes a task item from `- [ ] ` typed at the start of a paragraph', async () => {
    const {editor} = await typeAt('Plan the launch\n', 'Plan', '- [ ] ');
    expect(markdownOf(editor)).toBe('- [ ] Plan the launch\n');
  });

  it("makes RichText's task items: a bulleted list whose checkboxes it draws, written back losslessly", async () => {
    const {editor, container} = await typeAt(
      '- Plan the launch\n- Ship it\n',
      'Ship',
      '[x] ',
    );
    expect(
      editor.getEditorState().read(() => {
        const list = $getRoot().getFirstChild();
        return $isListNode(list) ? list.getListType() : null;
      }),
    ).toBe('bullet');
    await waitFor(() => {
      const boxes = [
        ...container.querySelectorAll<HTMLInputElement>(
          '[data-richtext-task-checkbox] input[type="checkbox"]',
        ),
      ];
      expect(boxes.map(box => box.checked)).toEqual([false, true]);
    });
    const markdown = markdownOf(editor);
    expect(markdown).toBe('- [ ] Plan the launch\n- [x] Ship it\n');
    // The written Markdown reads back as the same tasks and writes back
    // byte for byte (spec:AST-062 FR1, FR3).
    expect(editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown))).toBe(
      markdown,
    );
  });

  it('keeps every untouched block as authored (spec:AST-062 FR2)', async () => {
    const {editor} = await typeAt(
      'Intro with *emphasis* &amp; a reference\n\n- Plan the launch\n- Ship it\n\n__Outro__ text\n',
      'Ship',
      '# ',
    );
    expect(markdownOf(editor)).toBe(
      'Intro with *emphasis* &amp; a reference\n\n- Plan the launch\n\n# Ship it\n\n__Outro__ text\n',
    );
  });

  it('is one undo step, back to the typed marker', async () => {
    const out = await typeAt('- First item\n- Second item\n', 'Second', '# ');
    expect(markdownOf(out.editor)).toBe('- First item\n\n# Second item\n');
    await undo(out.editor);
    expect(markdownOf(out.editor)).toBe('- First item\n- \\# Second item\n');
    await undo(out.editor);
    expect(markdownOf(out.editor)).toBe('- First item\n- Second item\n');

    const switched = await typeAt('- Plan the launch\n', 'Plan', '1. ');
    expect(markdownOf(switched.editor)).toBe('1. Plan the launch\n');
    await undo(switched.editor);
    expect(markdownOf(switched.editor)).toBe('- 1\\. Plan the launch\n');
  });

  it('keeps the caret at the start of the text it re-marked', async () => {
    const {editor} = await typeAt(
      '- First item\n- Second item\n',
      'Second',
      '# A',
    );
    expect(markdownOf(editor)).toBe('- First item\n\n# ASecond item\n');
  });

  it('leaves a heading or quote marker at an item of a nested list as typed', async () => {
    const {editor} = await typeAt('- Outer\n  - Inner\n', 'Inner', '# ');
    expect(
      editor.getEditorState().read(() => ({
        blocks: $getRoot()
          .getChildren()
          .map(node => node.getType()),
        texts: $getRoot()
          .getAllTextNodes()
          .map(node => node.getTextContent()),
      })),
    ).toEqual({blocks: ['list'], texts: ['Outer', '# Inner']});
  });

  it('leaves a marker typed after the start of an item as typed', async () => {
    const {editor} = await typeAt('- Plan the launch\n', 'Plan', '1. ', {
      at: 5,
    });
    expect(markdownOf(editor)).toBe('- Plan 1. the launch\n');
  });

  it('changes nothing without Markdown shortcuts, or with transformers that make no such block', async () => {
    const off = await typeAt('- Plan the launch\n', 'Plan', '1. ', {
      hasMarkdownShortcuts: false,
    });
    expect(markdownOf(off.editor)).toBe('- 1\\. Plan the launch\n');
    const none = await typeAt('- Plan the launch\n', 'Plan', '# ', {
      transformers: [],
    });
    expect(markdownOf(none.editor)).toBe('- \\# Plan the launch\n');
  });

  it('changes nothing in a read-only editor', async () => {
    const {editor} = await typeAt('- Plan the launch\n', 'Plan', '1. ', {
      isReadOnly: true,
    });
    expect(markdownOf(editor)).toBe('- 1\\. Plan the launch\n');
  });
});
