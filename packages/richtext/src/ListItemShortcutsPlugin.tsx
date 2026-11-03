// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListItemShortcutsPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/list,
 *   @lexical/rich-text, @lexical/markdown (Transformer), lexical, and the task
 *   state in markdownTaskList.ts.
 * @output Exports ListItemShortcutsPlugin, which re-marks a list item when a
 *   Markdown block marker is typed at its start, keeping the item's text:
 *   `- `, `1. `, or `[ ] ` switches the item's list between bullets, numbers,
 *   and tasks, and `# ` or `> ` takes the item out of its list as a heading
 *   or a quote, the rest of the list continuing after it.
 * @position Rendered by RichTextEditor beside MarkdownShortcutPlugin, only
 *   when `hasMarkdownShortcuts` is on. Lexical's shortcuts re-mark a block
 *   that sits directly in the root (`### ` before an h2's text makes an h3)
 *   but never look inside a list. A marker counts here only when the editor's
 *   `transformers` turn the same marker into that block at the start of a
 *   paragraph, so the transformers stay the one source of Markdown behavior.
 *   Each re-marking is one undo step, back to the typed marker. Tasks keep
 *   RichText's shape (markdownTaskList.ts): items of a bulleted list that
 *   carry task state, which TaskCheckboxPlugin draws and LIST_EXPORT writes
 *   as `[ ]` or `[x]`.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListItemNode,
  type ListNode,
} from '@lexical/list';
import type {Transformer} from '@lexical/markdown';
import {
  $createHeadingNode,
  $createQuoteNode,
  type HeadingTagType,
} from '@lexical/rich-text';
import {
  $addUpdateTag,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  HISTORY_PUSH_TAG,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import {$getTaskState, $setTaskState} from './markdownTaskList';

/** What a marker typed at the start of a list item makes of it. */
type ListItemMarker =
  | {readonly kind: 'heading'; readonly tag: HeadingTagType}
  | {readonly kind: 'quote'}
  | {readonly kind: 'bullet'}
  | {readonly kind: 'number'; readonly start: number}
  | {readonly kind: 'task'; readonly checked: boolean};

type BlockMarker = Extract<ListItemMarker, {kind: 'heading' | 'quote'}>;

/** Whether `marker` takes an item out of its list, rather than switching it. */
function isBlockMarker(marker: ListItemMarker): marker is BlockMarker {
  return marker.kind === 'heading' || marker.kind === 'quote';
}

/**
 * The marker `prefix` is (the text before the caret, ending in the space
 * just typed), and the line that would make the same block at the start of a
 * paragraph. A task marker needs a bullet there, as GFM task items do.
 */
function markerOf(
  prefix: string,
): {readonly marker: ListItemMarker; readonly line: string} | null {
  const heading = /^(#{1,6}) $/.exec(prefix);
  if (heading != null) {
    return {
      marker: {kind: 'heading', tag: `h${heading[1].length}` as HeadingTagType},
      line: prefix,
    };
  }
  if (prefix === '> ') {
    return {marker: {kind: 'quote'}, line: prefix};
  }
  if (/^[-*+] $/.test(prefix)) {
    return {marker: {kind: 'bullet'}, line: prefix};
  }
  const number = /^(\d{1,9})\. $/.exec(prefix);
  if (number != null) {
    return {marker: {kind: 'number', start: Number(number[1])}, line: prefix};
  }
  const task = /^([-*+] )?\[([ xX])\] $/.exec(prefix);
  if (task != null) {
    return {
      marker: {kind: 'task', checked: task[2] !== ' '},
      line: task[1] == null ? `- ${prefix}` : prefix,
    };
  }
  return null;
}

/** Whether one of `transformers` makes a block from `line`, all of it. */
function isTransformed(
  line: string,
  transformers: ReadonlyArray<Transformer>,
): boolean {
  return transformers.some(
    transformer =>
      transformer.type === 'element' &&
      line.match(transformer.regExp)?.[0] === line,
  );
}

/** Whether `node` is the item Lexical nests a list in, not an item itself. */
function $holdsNestedList(node: LexicalNode | null): node is ListItemNode {
  return (
    $isListItemNode(node) &&
    node.getChildrenSize() === 1 &&
    $isListNode(node.getFirstChild())
  );
}

/** The items of `list` that have content of their own. */
function $itemsOf(list: ListNode): Array<ListItemNode> {
  return list
    .getChildren()
    .filter(
      (child): child is ListItemNode =>
        $isListItemNode(child) && !$holdsNestedList(child),
    );
}

/**
 * Switches the list holding `item` to bullets, numbers, or tasks. Tasks are
 * bulleted items that carry task state: switching to tasks makes every item
 * a task, keeping the state of those that already were, and `item` takes the
 * marker's; switching to bullets or numbers makes every item a plain one. A
 * numbered list starts at the marker's number when `item` is its first item.
 */
function $switchList(
  list: ListNode,
  item: ListItemNode,
  marker: Extract<ListItemMarker, {kind: 'bullet' | 'number' | 'task'}>,
): void {
  const items = $itemsOf(list);
  if (marker.kind === 'task') {
    if (list.getListType() === 'number') {
      list.setListType('bullet');
    }
    for (const each of items) {
      if ($getTaskState(each) == null) {
        $setTaskState(each, 'unchecked');
      }
    }
    $setTaskState(item, marker.checked ? 'checked' : 'unchecked');
    return;
  }
  for (const each of items) {
    if ($getTaskState(each) != null) {
      $setTaskState(each, null);
    }
  }
  const wasNumbered = list.getListType() === 'number';
  list.setListType(marker.kind);
  if (marker.kind === 'number') {
    if (items[0]?.is(item) === true) {
      list.setStart(marker.start);
    } else if (!wasNumbered) {
      list.setStart(1);
    }
  }
}

/**
 * Takes `item` out of `list` as `block`, holding the item's content. The
 * items before it stay in `list`; the lists nested under it follow `block`
 * at the top level, since a heading or a quote cannot hold them; and the
 * items after it continue in a list of the same kind, numbered on from where
 * they were.
 */
function $takeOutOfList(
  list: ListNode,
  item: ListItemNode,
  block: ElementNode,
): void {
  const nested: Array<ListItemNode> = [];
  let next = item.getNextSibling();
  while ($holdsNestedList(next)) {
    nested.push(next);
    next = next.getNextSibling();
  }
  const after = next == null ? [] : [next, ...next.getNextSiblings()];
  const before = $itemsOf(list).findIndex(each => each.is(item));
  block.append(...item.getChildren());
  list.insertAfter(block);
  let last: LexicalNode = block;
  for (const holder of nested) {
    const child = holder.getFirstChild();
    if ($isListNode(child)) {
      last.insertAfter(child);
      last = child;
    }
    holder.remove();
  }
  if (after.length > 0) {
    const type = list.getListType();
    const rest = $createListNode(
      type,
      type === 'number' ? list.getStart() + before + 1 : 1,
    );
    rest.append(...after);
    last.insertAfter(rest);
  }
  item.remove();
  if (list.getChildrenSize() === 0) {
    list.remove();
  }
}

/** Re-marks the item whose first text, `key`, starts with `prefix`. */
function $remark(key: NodeKey, prefix: string, marker: ListItemMarker): void {
  const text = $getNodeByKey(key);
  const item = text?.getParent();
  const list = item?.getParent();
  if (
    !$isTextNode(text) ||
    !text.getTextContent().startsWith(prefix) ||
    !$isListItemNode(item) ||
    !text.is(item.getFirstChild()) ||
    !$isListNode(list) ||
    (isBlockMarker(marker) && !$isRootOrShadowRoot(list.getParent()))
  ) {
    return;
  }
  const rest = text.getTextContent().slice(prefix.length);
  if (rest === '') {
    text.remove();
  } else {
    text.setTextContent(rest);
  }
  if (isBlockMarker(marker)) {
    const block =
      marker.kind === 'heading'
        ? $createHeadingNode(marker.tag)
        : $createQuoteNode();
    $takeOutOfList(list, item, block);
    block.selectStart();
  } else {
    $switchList(list, item, marker);
    item.selectStart();
  }
  // Its own undo step, so undo returns to the marker as typed.
  $addUpdateTag(HISTORY_PUSH_TAG);
}

/**
 * Watches for a marker completed by a typed space at the start of a list
 * item's text, and re-marks the item in an update of its own, as Lexical's
 * Markdown shortcuts do for blocks in the root.
 */
function registerListItemShortcuts(
  editor: LexicalEditor,
  transformers: ReadonlyArray<Transformer>,
): () => void {
  return editor.registerUpdateListener(
    ({tags, dirtyLeaves, editorState, prevEditorState}) => {
      if (
        tags.has(COLLABORATION_TAG) ||
        tags.has(HISTORIC_TAG) ||
        dirtyLeaves.size === 0 ||
        editor.isComposing() ||
        !editor.isEditable()
      ) {
        return;
      }
      const previous = prevEditorState.read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) && selection.isCollapsed()
          ? selection.anchor
          : null;
      });
      if (previous == null) {
        return;
      }
      const found = editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return null;
        }
        const {key, offset} = selection.anchor;
        // One character typed, just now, in the same text.
        if (
          !dirtyLeaves.has(key) ||
          previous.key !== key ||
          previous.offset !== offset - 1
        ) {
          return null;
        }
        const text = selection.anchor.getNode();
        if (!$isTextNode(text) || text.hasFormat('code')) {
          return null;
        }
        const prefix = text.getTextContent().slice(0, offset);
        const match = markerOf(prefix);
        const item = text.getParent();
        const list = item?.getParent();
        if (
          match == null ||
          !$isListItemNode(item) ||
          !text.is(item.getFirstChild()) ||
          !$isListNode(list) ||
          !isTransformed(match.line, transformers)
        ) {
          return null;
        }
        // A heading or a quote can only stand where a top-level block does;
        // in a nested list the marker stays as typed.
        if (
          isBlockMarker(match.marker) &&
          !$isRootOrShadowRoot(list.getParent())
        ) {
          return null;
        }
        return {key, prefix, marker: match.marker};
      });
      if (found != null) {
        editor.update(() => $remark(found.key, found.prefix, found.marker));
      }
    },
  );
}

export function ListItemShortcutsPlugin({
  transformers,
}: {
  /** The editor's Markdown transformers; markers they do not make are left. */
  readonly transformers: ReadonlyArray<Transformer>;
}): null {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () => registerListItemShortcuts(editor, transformers),
    [editor, transformers],
  );
  return null;
}
