// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MoveBlockPlugin.test.tsx
 * @input Uses vitest, @testing-library/react, lexical, RichTextEditor, and the
 *   Markdown serializers.
 * @output Presses Ctrl+Alt+ArrowUp / Ctrl+Alt+ArrowDown (the shortcut off
 *   Apple platforms) in a mounted RichTextEditor and checks which block
 *   moves, the undo step each move makes, and the Markdown export.
 * @position Testing; validates MoveBlockPlugin.tsx through RichTextEditor.
 *   MoveBlockPlugin.apple.test.tsx covers Cmd+Option on Apple platforms.
 */

import {beforeAll, describe, expect, it} from 'vitest';
import {createRef} from 'react';
import {act, fireEvent, render} from '@testing-library/react';
import {$isHorizontalRuleNode} from '@lexical/extension';
import {
  $createNodeSelection,
  $getRoot,
  $setSelection,
  KEY_DOWN_COMMAND,
  SKIP_SCROLL_INTO_VIEW_TAG,
  UNDO_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {
  RichTextEditor,
  type RichTextEditorProps,
  type RichTextEditorRef,
} from './RichTextEditor';
import {markdownToEditorStateJSON} from './markdownSerializers';

// jsdom's Range has no getBoundingClientRect, which Lexical calls to scroll
// the caret into view in a focused editor.
beforeAll(() => {
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
});

interface Mounted {
  readonly editor: LexicalEditor;
  readonly markdown: () => string;
}

function mount(
  markdown: string,
  props: Partial<RichTextEditorProps> = {},
): Mounted {
  const ref = createRef<RichTextEditorRef>();
  render(
    <RichTextEditor
      label="Notes"
      {...props}
      ref={ref}
      defaultValue={markdownToEditorStateJSON(markdown)}
    />,
  );
  const handle = ref.current;
  if (handle == null) {
    throw new Error('No editor');
  }
  return {editor: handle.getEditor(), markdown: () => handle.getMarkdown()};
}

/**
 * Focuses the editor, as a person typing in it has, and puts the caret inside
 * the text that reads exactly `text`. A non-editable editor keeps no DOM
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
          .find(textNode => textNode.getTextContent() === text);
        if (node == null) {
          throw new Error(`No text reads ${text}`);
        }
        node.select(1, 1);
      },
      // jsdom lays nothing out, so Lexical must not scroll to the caret.
      {discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG},
    );
  });
}

/** Presses `key` with Ctrl+Alt (unless other modifiers are given). */
async function press(
  editor: LexicalEditor,
  key: 'ArrowUp' | 'ArrowDown',
  modifiers: Partial<
    Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>
  > = {ctrlKey: true, altKey: true},
): Promise<void> {
  const root = editor.getRootElement();
  if (root == null) {
    throw new Error('No editor root');
  }
  await act(async () => {
    fireEvent.keyDown(root, {key, ...modifiers});
  });
}

async function undo(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  });
}

describe('moving the block that holds the caret', () => {
  it('moves a top-level block past its neighbor, one undo step each, keeping every block as authored', async () => {
    const {editor, markdown} = mount(
      '# Title\n\nFirst *one*.\n\nSecond &amp; two.\n\nThird.\n',
    );
    await caretIn(editor, 'Second & two.');
    await press(editor, 'ArrowUp');
    expect(markdown()).toBe(
      '# Title\n\nSecond &amp; two.\n\nFirst *one*.\n\nThird.\n',
    );
    await press(editor, 'ArrowDown');
    await press(editor, 'ArrowDown');
    expect(markdown()).toBe(
      '# Title\n\nFirst *one*.\n\nThird.\n\nSecond &amp; two.\n',
    );
    // Already last: nothing moves, and no undo step is made.
    await press(editor, 'ArrowDown');
    expect(markdown()).toBe(
      '# Title\n\nFirst *one*.\n\nThird.\n\nSecond &amp; two.\n',
    );
    await undo(editor);
    expect(markdown()).toBe(
      '# Title\n\nFirst *one*.\n\nSecond &amp; two.\n\nThird.\n',
    );
    await undo(editor);
    expect(markdown()).toBe(
      '# Title\n\nSecond &amp; two.\n\nFirst *one*.\n\nThird.\n',
    );
  });

  it('moves a list item with its nested items, within its list', async () => {
    const {editor, markdown} = mount(
      '- One\n- Two\n  - Two a\n  - Two b\n- Three\n\nAfter.\n',
    );
    await caretIn(editor, 'Two');
    await press(editor, 'ArrowDown');
    expect(markdown()).toBe(
      '- One\n- Three\n- Two\n  - Two a\n  - Two b\n\nAfter.\n',
    );
    // Already last in its list: it stays in the list.
    await press(editor, 'ArrowDown');
    expect(markdown()).toBe(
      '- One\n- Three\n- Two\n  - Two a\n  - Two b\n\nAfter.\n',
    );
    await press(editor, 'ArrowUp');
    await press(editor, 'ArrowUp');
    expect(markdown()).toBe(
      '- Two\n  - Two a\n  - Two b\n- One\n- Three\n\nAfter.\n',
    );
    // A nested item moves among its own siblings.
    await caretIn(editor, 'Two b');
    await press(editor, 'ArrowUp');
    expect(markdown()).toBe(
      '- Two\n  - Two b\n  - Two a\n- One\n- Three\n\nAfter.\n',
    );
    // A block after the list moves past the whole list.
    await caretIn(editor, 'After.');
    await press(editor, 'ArrowUp');
    expect(markdown()).toBe(
      'After.\n\n- Two\n  - Two b\n  - Two a\n- One\n- Three\n',
    );
  });

  it('renumbers a numbered list and keeps each task with its item', async () => {
    const numbered = mount('1. One\n2. Two\n');
    await caretIn(numbered.editor, 'Two');
    await press(numbered.editor, 'ArrowUp');
    expect(numbered.markdown()).toBe('1. Two\n2. One\n');

    const tasks = mount('- [ ] One\n- [x] Two\n');
    await caretIn(tasks.editor, 'Two');
    await press(tasks.editor, 'ArrowUp');
    expect(tasks.markdown()).toBe('- [x] Two\n- [ ] One\n');
  });

  it('moves the whole table when the caret is in one of its cells', async () => {
    const {editor, markdown} = mount(
      'Intro.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n',
    );
    await caretIn(editor, '2');
    await press(editor, 'ArrowUp');
    expect(markdown()).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n\nIntro.\n');
  });

  it('moves a selected horizontal rule', async () => {
    const {editor, markdown} = mount('Above.\n\n---\n\nBelow.\n');
    await act(async () => {
      editor.getRootElement()?.focus();
      editor.update(
        () => {
          const rule = $getRoot().getChildren().find($isHorizontalRuleNode);
          if (rule == null) {
            throw new Error('No rule');
          }
          const selection = $createNodeSelection();
          selection.add(rule.getKey());
          $setSelection(selection);
        },
        {discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG},
      );
    });
    await press(editor, 'ArrowUp');
    expect(markdown()).toBe('---\n\nAbove.\n\nBelow.\n');
  });

  it('moves nothing when the selection runs across blocks', async () => {
    const {editor, markdown} = mount('First.\n\nSecond.\n\nThird.\n');
    await act(async () => {
      editor.getRootElement()?.focus();
      editor.update(
        () => {
          const [first, second] = $getRoot().getAllTextNodes();
          const selection = first.select(1, 1);
          selection.focus.set(second.getKey(), 2, 'text');
        },
        {discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG},
      );
    });
    await press(editor, 'ArrowDown');
    expect(markdown()).toBe('First.\n\nSecond.\n\nThird.\n');
  });

  it('takes exactly Ctrl+Alt off Apple platforms', async () => {
    const {editor, markdown} = mount('First.\n\nSecond.\n');
    await caretIn(editor, 'Second.');
    for (const modifiers of [
      {metaKey: true, altKey: true},
      {ctrlKey: true, altKey: true, shiftKey: true},
      {ctrlKey: true},
      {altKey: true},
    ]) {
      await press(editor, 'ArrowUp', modifiers);
    }
    expect(markdown()).toBe('First.\n\nSecond.\n');
  });

  it('changes nothing in a read-only or disabled editor', async () => {
    for (const props of [{isReadOnly: true}, {isDisabled: true}]) {
      const {editor, markdown} = mount('First.\n\nSecond.\n', props);
      await caretIn(editor, 'Second.');
      // Past the DOM, which ignores keys in a non-editable editor.
      await act(async () => {
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent('keydown', {
            key: 'ArrowUp',
            ctrlKey: true,
            altKey: true,
          }),
        );
      });
      expect(markdown()).toBe('First.\n\nSecond.\n');
    }
  });
});
