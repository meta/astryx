// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownTrailingLineBreak.test.ts
 * @input A headless editor holding line breaks typed in the editor
 *   (Shift+Enter), the default transformers, and Markdown import
 * @output Proof that a typed line break at the end of its block exports as
 *   Markdown that reads back with no literal backslash, and that a break
 *   inside a block and an authored backslash still read back as written
 * @position Markdown round trip for typed line breaks (spec:AST-062 FR3)
 */

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$createListItemNode, $createListNode} from '@lexical/list';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalNode,
} from 'lexical';
import {DEFAULT_NODES} from './editorNodes';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {$exportMarkdownKeepingSource} from './markdownSource';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {type: string; text?: string; children?: Json[]};

/** The Markdown of a document built in the editor by `build`. */
function exportBuilt(build: () => LexicalNode[]): string {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
  editor.update(
    () => {
      $getRoot()
        .clear()
        .append(...build());
    },
    {discrete: true},
  );
  return editor
    .getEditorState()
    .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
}

/** Each top-level block read back from `markdown`: its text, a break as ⏎. */
function readBack(markdown: string): string[] {
  const text = (node: Json): string =>
    node.type === 'linebreak'
      ? '⏎'
      : (node.text ?? (node.children ?? []).map(text).join(''));
  return (
    JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}
  ).root.children!.map(text);
}

/** A paragraph of `parts`: a string is text, `null` a typed line break. */
function $paragraph(...parts: Array<string | null>) {
  const paragraph = $createParagraphNode();
  for (const part of parts) {
    paragraph.append(
      part === null ? $createLineBreakNode() : $createTextNode(part),
    );
  }
  return paragraph;
}

const IMAGE = '![Diagram](https://example.com/diagram.png)';

describe('a typed line break at the end of its block (spec:AST-062 FR3)', () => {
  it('reads back with no literal backslash before an image block', () => {
    const markdown = exportBuilt(() => [
      $paragraph('Notes', null),
      $paragraph(IMAGE),
    ]);
    expect(readBack(markdown)).toEqual(['Notes', IMAGE]);
  });

  it('reads back with no literal backslash at the end of the document', () => {
    const markdown = exportBuilt(() => [$paragraph('Last line', null)]);
    expect(readBack(markdown)).toEqual(['Last line']);
  });

  it('reads back with no literal backslash after two typed breaks', () => {
    const markdown = exportBuilt(() => [
      $paragraph('Notes', null, null),
      $paragraph('Next'),
    ]);
    expect(readBack(markdown)).toEqual(['Notes', 'Next']);
  });

  it('reads back with no literal backslash at the end of a checklist item', () => {
    const markdown = exportBuilt(() => {
      const list = $createListNode('check');
      const item = $createListItemNode(false);
      item.append($createTextNode('Buy milk'), $createLineBreakNode());
      list.append(item);
      return [list, $paragraph(IMAGE)];
    });
    expect(readBack(markdown)).toEqual(['Buy milk', IMAGE]);
  });

  it('exports the same Markdown again after it is read back', () => {
    const markdown = exportBuilt(() => [
      $paragraph('Notes', null),
      $paragraph(IMAGE),
    ]);
    const json = markdownToEditorStateJSON(markdown);
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    editor.setEditorState(editor.parseEditorState(json));
    const again = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(again).toBe(markdown);
  });
});

describe('a typed line break inside its block still round-trips', () => {
  it('reads back as a line break', () => {
    const markdown = exportBuilt(() => [$paragraph('one', null, 'two')]);
    expect(markdown.trimEnd()).toBe('one\\\ntwo');
    expect(readBack(markdown)).toEqual(['one⏎two']);
  });

  it('drops a break that only a space follows, and keeps the space', () => {
    const markdown = exportBuilt(() => [$paragraph('one', null, ' ')]);
    expect(readBack(markdown)).toEqual(['one ']);
  });

  it('keeps an authored backslash at the end of a line as text', () => {
    const markdown = exportBuilt(() => [$paragraph('C:\\temp\\')]);
    expect(readBack(markdown)).toEqual(['C:\\temp\\']);
  });
});
