// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.history.test.tsx
 * @input RichTextEditor, Lexical's UNDO_COMMAND, REDO_COMMAND and
 *   CAN_UNDO_COMMAND, and @lexical/react's HistoryPlugin as a caller-supplied
 *   history
 * @output Tests for the editor's own undo history and its `hasHistory` opt-out
 * @position Colocated test for RichTextEditor.tsx
 */

import {describe, it, expect} from 'vitest';
import {render, act, waitFor} from '@testing-library/react';
import {createRef, type ReactNode} from 'react';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {
  $createTextNode,
  $getRoot,
  $isElementNode,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {markdownToEditorStateJSON} from './markdownSerializers';

const START = markdownToEditorStateJSON('Hello\n');

async function mount(props: {
  hasHistory?: boolean;
  plugins?: ReactNode;
}): Promise<LexicalEditor> {
  const ref = createRef<RichTextEditorRef>();
  render(
    <RichTextEditor label="Notes" ref={ref} defaultValue={START} {...props} />,
  );
  await waitFor(() => expect(ref.current).not.toBeNull());
  const editor = ref.current?.getEditor();
  if (editor == null) {
    throw new Error('The editor did not mount.');
  }
  return editor;
}

function textOf(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

function appendWorld(editor: LexicalEditor): void {
  act(() => {
    editor.update(
      () => {
        const paragraph = $getRoot().getFirstChild();
        if (!$isElementNode(paragraph)) {
          throw new Error('The document has no first paragraph.');
        }
        paragraph.append($createTextNode(' world'));
      },
      {discrete: true},
    );
  });
}

// How many histories recorded the edit: each one that pushes an undo step
// announces CAN_UNDO_COMMAND.
function countUndoSteps(editor: LexicalEditor): () => number {
  let count = 0;
  editor.registerCommand(
    CAN_UNDO_COMMAND,
    canUndo => {
      if (canUndo) {
        count += 1;
      }
      return false;
    },
    COMMAND_PRIORITY_CRITICAL,
  );
  return () => count;
}

describe('RichTextEditor undo history', () => {
  it('undoes and redoes an edit with its own history by default', async () => {
    const editor = await mount({});

    appendWorld(editor);
    expect(textOf(editor)).toBe('Hello world');
    act(() => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await waitFor(() => expect(textOf(editor)).toBe('Hello'));
    act(() => {
      editor.dispatchCommand(REDO_COMMAND, undefined);
    });
    await waitFor(() => expect(textOf(editor)).toBe('Hello world'));
  });

  it('keeps no history of its own when hasHistory is false', async () => {
    const editor = await mount({hasHistory: false});
    const undoSteps = countUndoSteps(editor);

    appendWorld(editor);
    let handled = true;
    act(() => {
      handled = editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    expect(handled).toBe(false);
    expect(undoSteps()).toBe(0);
    expect(textOf(editor)).toBe('Hello world');
  });

  it('leaves undo and redo to one history passed in plugins', async () => {
    const editor = await mount({
      hasHistory: false,
      plugins: <HistoryPlugin />,
    });
    const undoSteps = countUndoSteps(editor);

    appendWorld(editor);
    // Only the caller's history records the edit.
    expect(undoSteps()).toBe(1);
    act(() => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await waitFor(() => expect(textOf(editor)).toBe('Hello'));
    act(() => {
      editor.dispatchCommand(REDO_COMMAND, undefined);
    });
    await waitFor(() => expect(textOf(editor)).toBe('Hello world'));
  });
});
