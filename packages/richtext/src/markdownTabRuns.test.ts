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

/** Imports `markdown`, appends `x` to its last text, and exports it. */
function editAndExport(markdown: string): string {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
  importMarkdownKeepingSource(editor, markdown, [...DEFAULT_TRANSFORMERS]);
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
  return editor
    .getEditorState()
    .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
}

/**
 * The least CPU time of three runs of `run`, in milliseconds. CPU time, not
 * elapsed time: on a loaded test machine, other work stretches elapsed time
 * but not the time the editor spends computing.
 */
function leastCpuTime(run: () => void): number {
  run();
  let least = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 3; round++) {
    const started = process.cpuUsage();
    run();
    const used = process.cpuUsage(started);
    least = Math.min(least, (used.user + used.system) / 1000);
  }
  return least;
}

const TABS = '\t'.repeat(8_000);

describe('a run of tabs, one editor node per tab', () => {
  it('keeps every tab through an edit', () => {
    expect(editAndExport(`a${TABS}b\n`)).toBe(`a${TABS}bx\n`);
  });

  it.each([
    ['plain text', `a${TABS}b\n`],
    ['a list item', `- a${TABS}b\n`],
    ['bold text', `**a${TABS}b**\n`],
    ['link text', `[a${TABS}b](u)\n`],
    ['a table cell', `| h |\n| - |\n| a${TABS}b |\n`],
  ])(
    'imports, edits, and exports %s with 8,000 tabs within 1 s',
    (_, markdown) => {
      // Alone each takes about 0.1 s; reading a node's children once per child
      // took over a minute.
      expect(leastCpuTime(() => editAndExport(markdown))).toBeLessThan(1000);
    },
  );
});
