// Copyright (c) Meta Platforms, Inc. and affiliates.

import {beforeAll, describe, expect, it} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {createRef} from 'react';
import {$isCodeNode, type CodeNode} from '@lexical/code';
import {$isHeadingNode} from '@lexical/rich-text';
import {
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  DELETE_CHARACTER_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {markdownToEditorStateJSON} from './markdownSerializers';

// jsdom's Range has no getBoundingClientRect, which Lexical calls to scroll
// the selection into view while the editor has focus.
beforeAll(() => {
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
});

async function renderMarkdown(markdown: string, {isReadOnly = false} = {}) {
  const ref = createRef<RichTextEditorRef>();
  render(
    <RichTextEditor
      ref={ref}
      label="Notes"
      isReadOnly={isReadOnly}
      defaultValue={markdownToEditorStateJSON(markdown)}
    />,
  );
  await waitFor(() => expect(ref.current).not.toBeNull());
  const textbox = screen.getByRole('textbox', {name: 'Notes'});
  textbox.focus();
  const handle = ref.current!;
  return {handle, editor: handle.getEditor(), textbox};
}

function $codeBlock(): CodeNode {
  const code = $getRoot().getChildren().find($isCodeNode);
  if (code == null) {
    throw new Error('The editor holds no code block');
  }
  return code;
}

/** Selects from one offset of the code block's text to another. */
function selectInCode(editor: LexicalEditor, from: number, to = from) {
  act(() => {
    editor.update(
      () => {
        const first = $codeBlock().getFirstChild();
        if ($isTextNode(first)) {
          first.select(from, to);
        } else {
          $codeBlock().selectStart();
        }
      },
      {discrete: true},
    );
  });
}

/**
 * Presses Backspace and commits the edit it scheduled, as a browser does
 * before the next key. Returns whether the editor kept the key.
 */
function pressBackspace(editor: LexicalEditor, textbox: HTMLElement): boolean {
  const kept = !fireEvent.keyDown(textbox, {
    key: 'Backspace',
    code: 'Backspace',
  });
  editor.read(() => undefined);
  return kept;
}

/**
 * Each top-level block as `type: content`, a heading by its tag: a line
 * break node is `⏎`, a newline inside text stays a newline, and a collapsed
 * caret is `|`.
 */
function blocks(editor: LexicalEditor): string[] {
  return editor.read(() => {
    const selection = $getSelection();
    const caret =
      $isRangeSelection(selection) && selection.isCollapsed()
        ? selection.anchor
        : null;
    return $getRoot()
      .getChildren()
      .map(block => {
        const name = $isHeadingNode(block) ? block.getTag() : block.getType();
        const children = $isElementNode(block) ? block.getChildren() : [];
        const caretAt = (index: number) =>
          caret?.key === block.getKey() && caret.offset === index ? '|' : '';
        let content = '';
        children.forEach((child, index) => {
          content += caretAt(index);
          const text = child.getTextContent();
          if ($isLineBreakNode(child)) {
            content += '⏎';
          } else if ($isTextNode(child) && caret?.key === child.getKey()) {
            content += `${text.slice(0, caret.offset)}|${text.slice(caret.offset)}`;
          } else {
            content += text;
          }
        });
        return `${name}: ${content}${caretAt(children.length)}`;
      });
  });
}

const blockTypes = (editor: LexicalEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .map(block => block.getType()),
  );

describe('Backspace at the very start of a code block', () => {
  it('turns the block into a paragraph of its lines, and the heading above keeps its text', async () => {
    const {handle, editor, textbox} = await renderMarkdown(
      '### Code and quote\n\n```\nconst first = 1;\nconst second = 2;\n```\n\nAfter the code\n',
    );
    selectInCode(editor, 0);

    expect(pressBackspace(editor, textbox)).toBe(true);
    expect(blocks(editor)).toEqual([
      'h3: Code and quote',
      'paragraph: |const first = 1;⏎const second = 2;',
      'paragraph: After the code',
    ]);
    // Each line break exports as a hard break, so the Markdown reads back
    // as the editor shows it, and the heading as written.
    expect(handle.getMarkdown()).toBe(
      '### Code and quote\n\nconst first = 1;\\\nconst second = 2;\n\nAfter the code\n',
    );
  });

  it('never merges the code into a paragraph above', async () => {
    const {editor, textbox} = await renderMarkdown(
      'Intro\n\n```\nalpha\nbeta\n```\n',
    );
    selectInCode(editor, 0);

    pressBackspace(editor, textbox);
    expect(blocks(editor)).toEqual([
      'paragraph: Intro',
      'paragraph: |alpha⏎beta',
    ]);
  });

  it('keeps the lines of a block with nothing above it', async () => {
    const {handle, editor, textbox} = await renderMarkdown(
      '```\nalpha\nbeta\n```\n\nAfter\n',
    );
    selectInCode(editor, 0);

    pressBackspace(editor, textbox);
    expect(blocks(editor)).toEqual([
      'paragraph: |alpha⏎beta',
      'paragraph: After',
    ]);
    expect(handle.getMarkdown()).toBe('alpha\\\nbeta\n\nAfter\n');
  });

  it('turns an empty block into an empty paragraph', async () => {
    const {editor, textbox} = await renderMarkdown(
      '## Title\n\n```\n```\n\nAfter\n',
    );
    selectInCode(editor, 0);

    pressBackspace(editor, textbox);
    expect(blocks(editor)).toEqual([
      'h2: Title',
      'paragraph: |',
      'paragraph: After',
    ]);
  });

  it('does the same for the backward deletion that input events dispatch', async () => {
    const {editor} = await renderMarkdown('## Title\n\n```\nalpha\n```\n');
    selectInCode(editor, 0);

    act(() => {
      editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
    });
    expect(blocks(editor)).toEqual(['h2: Title', 'paragraph: |alpha']);
  });
});

describe('Backspace that keeps its usual meaning', () => {
  // jsdom cannot delete text inside a line, so these check only that the
  // block stays a code block, which is all this behavior decides.
  it('leaves the code block alone with the caret inside its first line', async () => {
    const {editor, textbox} = await renderMarkdown(
      'Intro\n\n```\nalpha\nbeta\n```\n',
    );
    selectInCode(editor, 'alp'.length);

    pressBackspace(editor, textbox);
    expect(blockTypes(editor)).toEqual(['paragraph', 'code']);
  });

  it('leaves the code block alone at the start of a later line', async () => {
    const {editor, textbox} = await renderMarkdown(
      'Intro\n\n```\nalpha\n```\n',
    );
    // Lines as Enter leaves them: text nodes with a line break node between,
    // so the caret sits at offset 0 of a text node that is not the first.
    act(() => {
      editor.update(
        () => {
          const second = $createTextNode('beta');
          $codeBlock().append($createLineBreakNode(), second);
          second.select(0, 0);
        },
        {discrete: true},
      );
    });

    pressBackspace(editor, textbox);
    expect(blockTypes(editor)).toEqual(['paragraph', 'code']);
  });

  it('deletes a selection that starts at the block start', async () => {
    const {editor, textbox} = await renderMarkdown(
      'Intro\n\n```\nalpha\nbeta\n```\n',
    );
    selectInCode(editor, 0, 'alpha'.length);

    pressBackspace(editor, textbox);
    expect(blocks(editor)).toEqual(['paragraph: Intro', 'code: |\nbeta']);
  });

  it('changes nothing in a read-only editor', async () => {
    const {editor, textbox} = await renderMarkdown(
      '## Title\n\n```\nalpha\n```\n',
      {isReadOnly: true},
    );
    selectInCode(editor, 0);

    pressBackspace(editor, textbox);
    expect(blockTypes(editor)).toEqual(['heading', 'code']);
  });
});
