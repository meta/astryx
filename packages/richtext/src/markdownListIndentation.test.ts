// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$createListItemNode, $isListItemNode, $isListNode} from '@lexical/list';
import {$createTextNode, $getRoot, type LexicalNode} from 'lexical';
import {DEFAULT_NODES} from './editorNodes';
import {normalizeListIndentation} from './markdownListIndentation';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

interface SerializedNode {
  readonly type: string;
  readonly text?: string;
  readonly children?: ReadonlyArray<SerializedNode>;
}

/** Each list item's depth and text, in document order. */
function listItems(markdown: string): Array<string> {
  const {root} = JSON.parse(markdownToEditorStateJSON(markdown)) as {
    root: SerializedNode;
  };
  const items: Array<string> = [];
  const visit = (node: SerializedNode, depth: number) => {
    if (node.type === 'listitem') {
      const text = (node.children ?? [])
        .filter(child => child.type === 'text')
        .map(child => child.text)
        .join('');
      if (text !== '') {
        items.push(`${depth}:${text}`);
      }
    }
    const nextDepth = node.type === 'list' ? depth + 1 : depth;
    for (const child of node.children ?? []) {
      visit(child, nextDepth);
    }
  };
  visit(root, -1);
  return items;
}

/** Edits the imported document and exports it again. */
function editAndExport(markdown: string, edit: () => void): string {
  const editor = createHeadlessEditor({
    namespace: 'astryx-list-nesting-test',
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

/** Every list item node, in document order. */
function $listItems(): Array<LexicalNode> {
  const items: Array<LexicalNode> = [];
  const visit = (node: LexicalNode) => {
    if ($isListItemNode(node)) {
      items.push(node);
    }
    if ($isListNode(node) || $isListItemNode(node)) {
      node.getChildren().forEach(visit);
    }
  };
  $getRoot().getChildren().forEach(visit);
  return items;
}

describe('list nesting (spec:AST-061 FR5)', () => {
  it('nests an item under the item whose content it is indented to', () => {
    expect(listItems('- a\n  - b\n    - c\n- d\n')).toEqual([
      '0:a',
      '1:b',
      '2:c',
      '0:d',
    ]);
    expect(listItems('1. a\n   1. b\n   2. c\n2. d\n')).toEqual([
      '0:a',
      '1:b',
      '1:c',
      '0:d',
    ]);
    expect(listItems('- a\n    - four spaces\n')).toEqual([
      '0:a',
      '1:four spaces',
    ]);
    expect(listItems('- a\n\t- tab\n')).toEqual(['0:a', '1:tab']);
  });

  it('keeps an item that does not reach its parent content at the parent level', () => {
    // One space is not enough to reach the content of `- a`.
    expect(listItems('- a\n - b\n')).toEqual(['0:a', '0:b']);
    // `10. ` puts its content at column four, so a three-space item starts
    // a list of its own, and a four-space item does not reach that one's.
    expect(listItems('10. a\n   - b\n    - c\n')).toEqual([
      '0:a',
      '0:b',
      '0:c',
    ]);
  });

  it('keeps nesting across blank lines in a loose list', () => {
    expect(listItems('- a\n\n  - b\n\n- c\n')).toEqual(['0:a', '1:b', '0:c']);
  });

  it('leaves non-list lines, fenced code, and the line count alone', () => {
    const markdown =
      '- a\n  continued\n\n```\n  - not a list\n```\n\nText\n  - b\n';
    const normalized = normalizeListIndentation(markdown);
    expect(normalized.split('\n')).toHaveLength(markdown.split('\n').length);
    expect(normalized).toContain('```\n  - not a list\n```');
    expect(normalized).toContain('- a\n  continued');
  });

  it('measures the content column across a tab after the marker', () => {
    expect(listItems('-\tparent\n\t-\tchild\n\t\t-\tgrandchild\n')).toEqual([
      '0:parent',
      '1:child',
      '2:grandchild',
    ]);
    expect(listItems('1.\ta\n\t1.\tb\n')).toEqual(['0:a', '1:b']);
    expect(listItems('- a\n  -\tb\n      - c\n')).toEqual([
      '0:a',
      '1:b',
      '2:c',
    ]);
    expect(listItems('- a\r\n  - b\r\n    - c\r\n')).toEqual([
      '0:a',
      '1:b',
      '2:c',
    ]);
  });

  it('writes an edited nested list so it reads back at the same depths (spec:AST-062 FR3)', () => {
    for (const parent of ['9.', '10.', '100.']) {
      const child = ' '.repeat(parent.length + 1);
      const markdown = `${parent} a\n${child}- one\n${child}- two\n`;
      expect(listItems(markdown), parent).toEqual(['0:a', '1:one', '1:two']);
      // Edit a child.
      const edited = editAndExport(markdown, () => {
        const one = $getRoot()
          .getAllTextNodes()
          .find(node => node.getTextContent() === 'one');
        one?.setTextContent('one!');
      });
      expect(listItems(edited), `${parent} edited`).toEqual([
        '0:a',
        '1:one!',
        '1:two',
      ]);
      // Insert a child after the last one.
      const inserted = editAndExport(markdown, () => {
        const two = $listItems().find(node => node.getTextContent() === 'two');
        two?.insertAfter(
          $createListItemNode().append($createTextNode('three')),
        );
      });
      expect(listItems(inserted), `${parent} inserted`).toEqual([
        '0:a',
        '1:one',
        '1:two',
        '1:three',
      ]);
      // Move the second child before the first.
      const moved = editAndExport(markdown, () => {
        const items = $listItems();
        const one = items.find(node => node.getTextContent() === 'one');
        const two = items.find(node => node.getTextContent() === 'two');
        if (one != null && two != null) {
          one.insertBefore(two);
        }
      });
      expect(listItems(moved), `${parent} moved`).toEqual([
        '0:a',
        '1:two',
        '1:one',
      ]);
    }
    // A list of another type nested under the item above, as CommonMark
    // reads it, through the same edits.
    for (const parent of ['9.', '100.']) {
      const child = ' '.repeat(parent.length + 1);
      const markdown = `${parent} a\n${child}- one\n${child}- two\n${parent.replace(/\d+/, n => String(Number(n) + 1))} b\n`;
      expect(listItems(markdown), parent).toEqual([
        '0:a',
        '1:one',
        '1:two',
        '0:b',
      ]);
      const edited = editAndExport(markdown, () => {
        const one = $getRoot()
          .getAllTextNodes()
          .find(node => node.getTextContent() === 'one');
        one?.setTextContent('one!');
      });
      expect(listItems(edited), `${parent} mixed edited`).toEqual([
        '0:a',
        '1:one!',
        '1:two',
        '0:b',
      ]);
    }
    // Three levels, and CRLF line endings.
    for (const ending of ['\n', '\r\n']) {
      const markdown = ['- a', '  - b', '    - c', ''].join(ending);
      const edited = editAndExport(markdown, () => {
        const c = $getRoot()
          .getAllTextNodes()
          .find(node => node.getTextContent() === 'c');
        c?.setTextContent('c!');
      });
      expect(listItems(edited), JSON.stringify(ending)).toEqual([
        '0:a',
        '1:b',
        '2:c!',
      ]);
    }
  });

  it('keeps the authored indentation of an untouched list (spec:AST-062)', () => {
    const markdown = '- a\n  - b\n\n1. a\n   1. b\n';
    expect(editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown))).toBe(
      markdown,
    );
  });
});
