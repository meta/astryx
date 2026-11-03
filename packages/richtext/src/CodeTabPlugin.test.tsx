// Copyright (c) Meta Platforms, Inc. and affiliates.

import {beforeAll, describe, expect, it} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode, type CodeNode} from '@lexical/code';
import {
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  UNDO_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {RichTextEditor} from './RichTextEditor';
import {markdownToEditorStateJSON} from './markdownSerializers';

// jsdom's Range has no getBoundingClientRect, which Lexical calls to scroll
// the selection into view while the editor has focus.
beforeAll(() => {
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
});

/**
 * Renders an editor holding a paragraph and then a code block of `code`, and
 * focuses it.
 */
async function renderCode(code: string, {isReadOnly = false} = {}) {
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
      isReadOnly={isReadOnly}
      defaultValue={markdownToEditorStateJSON(
        `Intro\n\n\`\`\`\n${code}\n\`\`\`\n`,
      )}
      plugins={<CaptureEditor />}
    />,
  );
  await waitFor(() => expect(captured).toBeDefined());
  // The block's frame draws after mount; its Copy code is the next tab stop.
  await screen.findByRole('button', {name: 'Copy code'});
  const textbox = screen.getByRole('textbox', {name: 'Notes'});
  textbox.focus();
  return {editor: captured!, textbox};
}

function $codeBlock(): CodeNode {
  const code = $getRoot().getChildren().find($isCodeNode);
  if (code == null) {
    throw new Error('The editor holds no code block');
  }
  return code;
}

/** Selects from one offset of the code block's text to another. */
function select(editor: LexicalEditor, from: number, to = from) {
  act(() => {
    editor.update(
      () => {
        const code = $codeBlock();
        const pointAt = (offset: number) => {
          let left = offset;
          for (const child of code.getChildren()) {
            const size = child.getTextContentSize();
            if ($isTextNode(child) && left <= size) {
              return {key: child.getKey(), offset: left};
            }
            left -= size;
          }
          throw new Error(`No text at offset ${offset}`);
        };
        const anchor = pointAt(from);
        const focus = pointAt(to);
        const selection = code.select(0, 0);
        selection.anchor.set(anchor.key, anchor.offset, 'text');
        selection.focus.set(focus.key, focus.offset, 'text');
      },
      {discrete: true},
    );
  });
}

/**
 * The code block's text with the selection drawn in: `|` for a caret, or
 * `[` at the anchor and `]` at the focus.
 */
function marked(editor: LexicalEditor): string {
  // `editor.read` commits the update a key press scheduled before reading.
  return editor.read(() => {
    const code = $codeBlock();
    const selection = $getSelection();
    const mark = (key: string, offset: number) => {
      if (!$isRangeSelection(selection)) {
        return '';
      }
      const {anchor, focus} = selection;
      if (selection.isCollapsed()) {
        return anchor.key === key && anchor.offset === offset ? '|' : '';
      }
      return (
        (anchor.key === key && anchor.offset === offset ? '[' : '') +
        (focus.key === key && focus.offset === offset ? ']' : '')
      );
    };
    const children = code.getChildren();
    let text = '';
    children.forEach((child, index) => {
      text += mark(code.getKey(), index);
      const content = child.getTextContent();
      if ($isTextNode(child)) {
        for (let i = 0; i < content.length; i++) {
          text += mark(child.getKey(), i) + content[i];
        }
        text += mark(child.getKey(), content.length);
      } else {
        text += content;
      }
    });
    return text + mark(code.getKey(), children.length);
  });
}

const codeText = (editor: LexicalEditor) =>
  editor.read(() => $codeBlock().getTextContent());

/**
 * Presses Tab and commits the edit it scheduled, as a browser does before the
 * next key. Returns whether the editor kept the key (default prevented).
 */
function pressTab(
  editor: LexicalEditor,
  textbox: HTMLElement,
  shiftKey = false,
): boolean {
  const kept = !fireEvent.keyDown(textbox, {key: 'Tab', code: 'Tab', shiftKey});
  editor.read(() => undefined);
  return kept;
}

describe('Tab in a code block', () => {
  it("indents the caret's line, and Shift+Tab outdents it, with the caret on the same character", async () => {
    const {editor, textbox} = await renderCode('alpha\n  beta\ngamma');
    select(editor, 'al'.length);

    expect(pressTab(editor, textbox)).toBe(true);
    expect(marked(editor)).toBe('  al|pha\n  beta\ngamma');

    expect(pressTab(editor, textbox, true)).toBe(true);
    expect(marked(editor)).toBe('al|pha\n  beta\ngamma');

    // Nothing left to outdent: the key still stays in the editor.
    expect(pressTab(editor, textbox, true)).toBe(true);
    expect(marked(editor)).toBe('al|pha\n  beta\ngamma');
    expect(document.activeElement).toBe(textbox);
  });

  it('indents and outdents every line a selection touches, keeping the selection on the same characters', async () => {
    const {editor, textbox} = await renderCode('alpha\n  beta\ngamma');
    select(editor, 'a'.length, 'alpha\n  beta\ngam'.length);

    expect(pressTab(editor, textbox)).toBe(true);
    expect(marked(editor)).toBe('  a[lpha\n    beta\n  gam]ma');

    expect(pressTab(editor, textbox, true)).toBe(true);
    expect(marked(editor)).toBe('a[lpha\n  beta\ngam]ma');
  });

  it('keeps a backward selection backward', async () => {
    const {editor, textbox} = await renderCode('alpha\nbeta');
    select(editor, 'alpha\nbe'.length, 'al'.length);

    pressTab(editor, textbox);
    expect(marked(editor)).toBe('  al]pha\n  be[ta');
  });

  it('leaves alone a line the selection only reaches the start of', async () => {
    const {editor, textbox} = await renderCode('one\ntwo\nthree');
    select(editor, 0, 'one\n'.length);

    pressTab(editor, textbox);
    expect(marked(editor)).toBe('  [one\n]two\nthree');
  });

  it.each([
    [
      'a tab when a line starts with one',
      '\tx\nyz',
      '\tx\ny'.length,
      '\tx\n\ty|z',
    ],
    [
      'the fewest spaces a line starts with',
      'a\n    b\n        c',
      0,
      '    |a\n    b\n        c',
    ],
    ['two spaces when no line is indented', 'a\nb', 0, '  |a\nb'],
    ['at least two spaces', ' a', 1, '   |a'],
    ['at most eight spaces', `${' '.repeat(12)}a`, 12, `${' '.repeat(20)}|a`],
  ])('indents by the block’s own indent: %s', async (_, code, caret, after) => {
    const {editor, textbox} = await renderCode(code);
    select(editor, caret);

    pressTab(editor, textbox);
    expect(marked(editor)).toBe(after);
  });

  it('undoes each press on its own', async () => {
    const {editor, textbox} = await renderCode('alpha\n  beta\ngamma');
    select(editor, 'a'.length, 'alpha\n  beta\ngam'.length);
    pressTab(editor, textbox);
    pressTab(editor, textbox, true);
    pressTab(editor, textbox);
    expect(codeText(editor)).toBe('  alpha\n    beta\n  gamma');

    act(() => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    expect(marked(editor)).toBe('a[lpha\n  beta\ngam]ma');
  });

  it('undoes one press of a tab-indented line on its own, even right after another', async () => {
    // Each press adds one character before the caret here, the edit that
    // typing makes, which history would otherwise merge into one step.
    const {editor, textbox} = await renderCode('\tx\ny');
    select(editor, '\tx\n'.length);
    pressTab(editor, textbox);
    pressTab(editor, textbox);
    expect(marked(editor)).toBe('\tx\n\t\t|y');

    act(() => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    expect(marked(editor)).toBe('\tx\n\t|y');
  });

  it('still lets Escape then Tab move focus out of the editor', async () => {
    const user = userEvent.setup();
    const {editor} = await renderCode('alpha');
    select(editor, 'al'.length);

    await user.keyboard('{Escape}');
    await user.tab();
    // The next stop after the editable text is the block's own Copy code.
    expect(document.activeElement).toBe(
      screen.getByRole('button', {name: 'Copy code'}),
    );
    expect(codeText(editor)).toBe('alpha');
  });

  it('keeps Tab’s meaning outside a code block', async () => {
    const {editor, textbox} = await renderCode('alpha');
    act(() => {
      editor.update(() => $getRoot().getFirstChildOrThrow().selectStart(), {
        discrete: true,
      });
    });

    expect(pressTab(editor, textbox)).toBe(true);
    const introIndent = editor.read(() => {
      const intro = $getRoot().getFirstChildOrThrow();
      return $isParagraphNode(intro) ? intro.getIndent() : null;
    });
    expect(introIndent).toBe(1);
    expect(codeText(editor)).toBe('alpha');
  });

  it('leaves a read-only editor’s Tab as focus movement', async () => {
    const user = userEvent.setup();
    const {editor} = await renderCode('alpha', {isReadOnly: true});

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', {name: 'Copy code'}),
    );
    expect(codeText(editor)).toBe('alpha');
  });
});
