// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {registerMarkdownShortcuts} from '@lexical/markdown';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {DEFAULT_NODES} from './editorNodes';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {
  $exportMarkdownKeepingSource,
  importMarkdownKeepingSource,
} from './markdownSource';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {type: string; text?: string; value?: string; children?: Json[]};

/** The editor's top-level blocks: their types and text. */
function richBlocks(markdown: string): string[] {
  const text = (node: Json): string =>
    node.text ?? (node.children ?? []).map(text).join('');
  return (
    JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}
  ).root.children!.map(node => `${node.type}:${text(node)}`);
}

/** Core's top-level blocks: their types and text. */
function coreBlocks(markdown: string): string[] {
  const text = (node: Json): string =>
    node.value ?? (node.children ?? []).map(text).join('');
  return (parseMarkdownAst(markdown).children as unknown as Json[]).map(
    node => `${node.type === 'blockquote' ? 'quote' : node.type}:${text(node)}`,
  );
}

describe('a block quote marker reads as core reads it', () => {
  it.each(['>a', '>\ta', '   > a', '> a'])(
    'quotes %j, as core does',
    markdown => {
      expect(richBlocks(markdown)).toEqual(['quote:a']);
      expect(coreBlocks(markdown)).toEqual(['quote:a']);
    },
  );

  it('reads four spaces of indentation as no marker, as core does', () => {
    expect(richBlocks('    > a')).toEqual(['paragraph:    > a']);
    expect(coreBlocks('    > a')).toEqual(['paragraph:    > a']);
  });

  it('writes an edited quote back as one that reads as a quote', () => {
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    importMarkdownKeepingSource(editor, '>a\n', [...DEFAULT_TRANSFORMERS]);
    editor.update(
      () => {
        const last = $getRoot().getLastDescendant();
        if (!$isTextNode(last)) {
          throw new Error('No text to edit');
        }
        last.setTextContent(`${last.getTextContent()}x`);
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(richBlocks(exported)).toEqual(['quote:ax']);
  });
});

/** A headless editor with the default typing shortcuts, caret in an empty paragraph. */
function shortcutEditor(): LexicalEditor {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
  registerMarkdownShortcuts(editor, [...DEFAULT_TRANSFORMERS]);
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      $getRoot().clear().append(paragraph);
      paragraph.select();
    },
    {discrete: true},
  );
  return editor;
}

/** Types `text` one character at a time, as a person would. */
function type(editor: LexicalEditor, text: string): void {
  for (const character of text) {
    editor.update(
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(character);
        }
      },
      {discrete: true},
    );
  }
}

/** The editor's first block: its type and text, once queued updates ran. */
async function firstBlock(editor: LexicalEditor): Promise<string> {
  await Promise.resolve();
  editor.update(() => {}, {discrete: true});
  return editor.getEditorState().read(() => {
    const first = $getRoot().getFirstChild();
    return `${first?.getType()}:${first?.getTextContent()}`;
  });
}

describe('typing shortcuts keep the library quote trigger', () => {
  it('makes a quote from `> `, as before', async () => {
    const editor = shortcutEditor();
    type(editor, '> ');
    expect(await firstBlock(editor)).toBe('quote:');
  });

  it('leaves `   > ` typed with indentation as text', async () => {
    const editor = shortcutEditor();
    type(editor, '   > ');
    expect(await firstBlock(editor)).toBe('paragraph:   > ');
  });

  it('leaves `>` and Enter as text', async () => {
    const editor = shortcutEditor();
    type(editor, '>');
    editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    expect(await firstBlock(editor)).toBe('paragraph:>');
  });
});

describe('a paragraph line that starts like a quote marker stays text', () => {
  /** A one-paragraph document of `lines`, exported and read back. */
  function roundTrip(lines: ReadonlyArray<string>): {
    exported: string;
    blocks: string[];
  } {
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        lines.forEach((line, index) => {
          if (index > 0) {
            paragraph.append($createLineBreakNode());
          }
          paragraph.append($createTextNode(line));
        });
        $getRoot().clear().append(paragraph);
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    return {exported, blocks: richBlocks(exported)};
  }

  it.each([
    [['>a'], '\\>a', ['paragraph:>a']],
    [['   >a'], '   \\>a', ['paragraph:   >a']],
    [['> a'], '\\> a', ['paragraph:> a']],
  ])(
    'writes %j with an escaped marker, read back as text',
    (lines, written, blocks) => {
      const result = roundTrip(lines);
      expect(result.exported.trimEnd()).toBe(written);
      expect(result.blocks).toEqual(blocks);
    },
  );

  it('escapes a marker after more spaces, as a list continuation line may add them', () => {
    const result = roundTrip(['      >a']);
    expect(result.exported.trimEnd()).toBe('      \\>a');
    expect(result.blocks).toEqual(['paragraph:      >a']);
  });

  it('escapes the line after a line break too', () => {
    const result = roundTrip(['a', '>b']);
    expect(result.exported.trimEnd()).toBe('a\\\n\\>b');
    expect(result.blocks).toEqual(['paragraph:a>b']);
  });
});
