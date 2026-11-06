// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$createTextNode, $getRoot, $isElementNode} from 'lexical';
import {DEFAULT_NODES} from './editorNodes';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

/**
 * Image Markdown is source RichText cannot show as a structure
 * (spec:AST-062 FR5). An edit beside it must not change it (FR2), and an edit
 * in its own paragraph must keep every character of it (FR5), so another
 * client still reads an image.
 */

function editAndExport(markdown: string, edit: () => void): string {
  const editor = createHeadlessEditor({
    namespace: 'astryx-markdown-images-test',
    nodes: [...DEFAULT_NODES],
    onError(error: Error) {
      throw error;
    },
  });
  editor.setEditorState(
    editor.parseEditorState(markdownToEditorStateJSON(markdown)),
  );
  editor.update(edit, {discrete: true});
  return editorStateJSONToMarkdown(
    JSON.stringify(editor.getEditorState().toJSON()),
  );
}

/** Types `text` at the end of the first block containing `needle`. */
function $appendToBlockContaining(needle: string, text: string): void {
  const block = $getRoot()
    .getChildren()
    .find(candidate => candidate.getTextContent().includes(needle));
  if (!$isElementNode(block)) {
    throw new Error(`no block contains ${needle}`);
  }
  block.append($createTextNode(text));
}

const IMAGES = {
  named: '![A chart](https://example.com/chart.png)',
  emptyAlt: '![](https://example.com/chart.png)',
  titled: '![A chart](https://example.com/chart.png "Weekly chart")',
};

describe('image Markdown through edits (spec:AST-062)', () => {
  for (const [name, image] of Object.entries(IMAGES)) {
    it(`keeps a ${name} image on its own line when the next paragraph changes (FR2)`, () => {
      const source = `${image}\n\nEdit me\n`;
      expect(
        editAndExport(source, () =>
          $appendToBlockContaining('Edit me', ' now'),
        ),
      ).toBe(`${image}\n\nEdit me now\n`);
    });

    it(`keeps a ${name} image inline when the paragraph beside it changes (FR2)`, () => {
      const source = `Before ${image} after\n\nEdit me\n`;
      expect(
        editAndExport(source, () =>
          $appendToBlockContaining('Edit me', ' now'),
        ),
      ).toBe(`Before ${image} after\n\nEdit me now\n`);
    });

    it(`keeps every character of a ${name} image when its own paragraph changes (FR5)`, () => {
      const source = `Before ${image} after\n`;
      expect(
        editAndExport(source, () => $appendToBlockContaining('after', ' now')),
      ).toBe(`Before ${image} after now\n`);
    });

    it(`keeps every character of a ${name} image on its own line when text is added after it (FR5)`, () => {
      const source = `${image}\n`;
      expect(
        editAndExport(source, () =>
          $appendToBlockContaining('chart', ' caption'),
        ),
      ).toBe(`${image} caption\n`);
    });
  }
});
