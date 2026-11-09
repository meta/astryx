// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {
  $createNodeSelection,
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $setSelection,
} from 'lexical';
import {DEFAULT_NODES} from './editorNodes';
import {
  $createRichTextExtensionNode,
  $selectedExtensionNodesOnly,
} from './markdownExtensionNode';

describe('$selectedExtensionNodesOnly', () => {
  it('returns the plugin nodes a range selects when it selects no text', () => {
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    const results: Array<unknown> = [];
    editor.update(
      () => {
        const before = $createTextNode('Ping ');
        const node = $createRichTextExtensionNode({
          plugin: 'mentions',
          apiVersion: 1,
          name: 'mention',
          display: 'inline',
          data: {label: 'ada'},
          source: '@{ada}',
        });
        const after = $createTextNode(' about');
        $getRoot()
          .clear()
          .append($createParagraphNode().append(before, node, after));
        const select = (
          anchor: [typeof before, number],
          focus: [typeof before, number],
        ) => {
          const selection = $createRangeSelection();
          selection.anchor.set(anchor[0].getKey(), anchor[1], 'text');
          selection.focus.set(focus[0].getKey(), focus[1], 'text');
          $setSelection(selection);
          return $selectedExtensionNodesOnly(selection);
        };
        // From the end of the text before to the start of the text after.
        results.push(select([before, 5], [after, 0])?.length);
        // The same, backward.
        results.push(select([after, 0], [before, 5])?.length);
        // With a character of text.
        results.push(select([before, 4], [after, 0]));
        // A caret.
        results.push(select([before, 5], [before, 5]));
      },
      {discrete: true},
    );
    expect(results).toEqual([1, 1, null, null]);
  });

  it('returns the plugin nodes a node selection holds when it holds nothing else', () => {
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    const results: Array<unknown> = [];
    editor.update(
      () => {
        const node = $createRichTextExtensionNode({
          plugin: 'mentions',
          apiVersion: 1,
          name: 'mention',
          display: 'inline',
          data: {label: 'ada'},
          source: '@{ada}',
        });
        const text = $createTextNode('Ping ');
        const paragraph = $createParagraphNode().append(text, node);
        $getRoot().clear().append(paragraph);
        const select = (...keys: string[]) => {
          const selection = $createNodeSelection();
          keys.forEach(key => selection.add(key));
          $setSelection(selection);
          return $selectedExtensionNodesOnly(selection);
        };
        results.push(select(node.getKey())?.length);
        results.push(select(node.getKey(), text.getKey()));
        results.push(select(paragraph.getKey()));
      },
      {discrete: true},
    );
    expect(results).toEqual([1, null, null]);
  });
});
