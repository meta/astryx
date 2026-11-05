// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
} from 'lexical';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {DEFAULT_NODES} from './editorNodes';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {$exportMarkdownKeepingSource} from './markdownSource';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {type: string; text?: string; value?: string; children?: Json[]};

const textOf = (node: Json): string =>
  node.type === 'linebreak' || node.type === 'break'
    ? '\n'
    : (node.text ?? node.value ?? (node.children ?? []).map(textOf).join(''));

/** The editor's top-level blocks: their types and text. */
function richBlocks(markdown: string): string[] {
  return (
    JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}
  ).root.children!.map(node => `${node.type}:${textOf(node)}`);
}

/** Core's top-level block types. */
function coreTypes(markdown: string): string[] {
  return (parseMarkdownAst(markdown).children as unknown as Json[]).map(
    node => node.type,
  );
}

/** A one-paragraph document of `lines`, written by the editor. */
function exportParagraph(lines: ReadonlyArray<string>): string {
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
  return editor
    .getEditorState()
    .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]))
    .trimEnd();
}

describe('paragraph text that starts like a block marker after spaces stays text', () => {
  it.each([
    ['a bullet after spaces', '   - a', '   \\- a'],
    ['a plus bullet after spaces', '  + a', '  \\+ a'],
    ['a bullet deeper than a list continuation', '      - a', '      \\- a'],
    ['a number after spaces', '  1. step', '  1\\. step'],
    ['a parenthesis number after spaces', '   2) step', '   2\\) step'],
    ['a break line after spaces', '   ---', '   \\---'],
    ['an underline after spaces', '  ===', '  \\==='],
    ['a bullet at the margin, as before', '- a', '\\- a'],
    ['a number at the margin, as before', '1. step', '1\\. step'],
  ])(
    'writes %s escaped, and both surfaces read it back as text',
    (_, text, written) => {
      const exported = exportParagraph([text]);
      expect(exported).toBe(written);
      expect(richBlocks(exported)).toEqual([`paragraph:${text}`]);
      expect(coreTypes(exported)).toEqual(['paragraph']);
    },
  );

  it('escapes a spaced marker on the line after a line break', () => {
    const exported = exportParagraph(['intro', '   - a']);
    expect(exported).toBe('intro\\\n   \\- a');
    expect(richBlocks(exported)).toEqual(['paragraph:intro\n   - a']);
    expect(coreTypes(exported)).toEqual(['paragraph']);
  });

  it('leaves a dash inside a line alone', () => {
    expect(exportParagraph(['a - b'])).toBe('a - b');
  });
});
