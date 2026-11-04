// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {registerMarkdownShortcuts} from '@lexical/markdown';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
} from 'lexical';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {DEFAULT_NODES} from './editorNodes';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {$exportMarkdownKeepingSource} from './markdownSource';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {
  type: string;
  tag?: string;
  depth?: number;
  text?: string;
  value?: string;
  children?: Json[];
};

const textOf = (node: Json): string =>
  node.text ?? node.value ?? (node.children ?? []).map(textOf).join('');

/** The editor's top-level blocks: heading level or type, and text. */
function richBlocks(markdown: string): string[] {
  return (
    JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}
  ).root.children!.map(
    node => `${node.type === 'heading' ? node.tag : node.type}:${textOf(node)}`,
  );
}

/** Core's top-level blocks: heading level or type, and text. */
function coreBlocks(markdown: string): string[] {
  return (parseMarkdownAst(markdown).children as unknown as Json[]).map(
    node =>
      `${node.type === 'heading' ? `h${node.depth}` : node.type}:${textOf(node)}`,
  );
}

function newEditor(): LexicalEditor {
  return createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
}

describe('an indented ATX heading reads as core reads it', () => {
  it.each([
    ['   # h', ['h1:h']],
    [' ## h', ['h2:h']],
    ['# h', ['h1:h']],
    ['    # h', ['paragraph:    # h']],
  ])('imports %j as core reads it', (markdown, expected) => {
    expect(richBlocks(markdown)).toEqual(expected);
    expect(coreBlocks(markdown)).toEqual(expected);
  });
});

describe('typing shortcuts keep the library heading trigger', () => {
  /** Types `text` into an empty paragraph, then reads the first block. */
  async function typed(text: string): Promise<string> {
    const editor = newEditor();
    registerMarkdownShortcuts(editor, [...DEFAULT_TRANSFORMERS]);
    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        $getRoot().clear().append(paragraph);
        paragraph.select();
      },
      {discrete: true},
    );
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
    await Promise.resolve();
    editor.update(() => {}, {discrete: true});
    return editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild();
      return `${first?.getType()}:${first?.getTextContent()}`;
    });
  }

  it('makes a heading from `# `, as before', async () => {
    expect(await typed('# ')).toBe('heading:');
  });

  it('leaves `   # ` typed with indentation as text', async () => {
    expect(await typed('   # ')).toBe('paragraph:   # ');
  });
});

describe('paragraph text that starts like a heading marker stays text', () => {
  it.each([
    ['   # h', '   \\# h'],
    ['      # h', '      \\# h'],
    ['# h', '\\# h'],
  ])('writes %j escaped, read back as text', (text, written) => {
    const editor = newEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode(text)));
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(exported.trimEnd()).toBe(written);
    expect(richBlocks(exported)).toEqual([`paragraph:${text}`]);
  });
});
