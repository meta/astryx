// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$getRoot, $isTextNode} from 'lexical';
import {DEFAULT_NODES} from './editorNodes';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {
  $exportMarkdownKeepingSource,
  importMarkdownKeepingSource,
} from './markdownSource';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = Record<string, unknown>;

/** Each link's destination and text, in document order. */
function linksOf(markdown: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  const visit = (node: Json) => {
    if (node.type === 'link') {
      found.push([
        node.url as string,
        ((node.children as Array<Json>) ?? [])
          .map(child => child.text as string)
          .join(''),
      ]);
    }
    ((node.children as Array<Json>) ?? []).forEach(visit);
  };
  visit((JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root);
  return found;
}

describe('links in table cells (spec:AST-062 FR3)', () => {
  it('keep a destination with unbalanced parentheses through an edit of the table', () => {
    const markdown = [
      '| Name | Link |',
      '| --- | --- |',
      '| Ada | [docs](https://e.com/a\\(b) |',
      '',
    ].join('\n');
    expect(linksOf(markdown)).toEqual([['https://e.com/a(b', 'docs']]);
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    importMarkdownKeepingSource(editor, markdown, [...DEFAULT_TRANSFORMERS]);
    // Editing another cell makes the table export from the editor's nodes.
    editor.update(
      () => {
        const name = $getRoot()
          .getAllTextNodes()
          .find(node => node.getTextContent() === 'Ada');
        if (!$isTextNode(name)) {
          throw new Error('No Ada cell');
        }
        name.setTextContent('Grace');
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(exported).toContain('Grace');
    expect(linksOf(exported)).toEqual([['https://e.com/a(b', 'docs']]);
  });
});
