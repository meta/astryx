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
 *   and tasks, and `# ` or `> ` takes a top-level item out of its list as a
 *   heading or a quote, the rest of the list continuing after it.
 * @position Rendered by RichTextEditor beside MarkdownShortcutPlugin, only
 *   when `hasMarkdownShortcuts` is on. Lexical's shortcuts never look inside a
 *   list. A marker counts only when the editor's `transformers` make that
 *   block from it, and a task takes the shape of the transformer that matched.
 *   Each re-mark is one undo step.
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
import {CHECK_LIST, type Transformer} from '@lexical/markdown';
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

/** The first of `transformers` that makes a block from `line`, all of it. */
function transformerFor(
  line: string,
  transformers: ReadonlyArray<Transformer>,
): Transformer | undefined {
  return transformers.find(
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
 * Switches the list holding `item` to bullets, numbers, or tasks. Tasks take
 * the shape the matching transformer reads and writes: Lexical's `check`
 * list for CHECK_LIST, or else RichText's bulleted items with task state
 * (markdownTaskList.ts). Switching to tasks makes every item a task, keeping
 * the state of those that already were, and `item` takes the marker's;
 * switching to bullets or numbers makes every item a plain one. A numbered
 * list starts at the marker's number when `item` is its first item.
 */
function $switchList(
  list: ListNode,
  item: ListItemNode,
  marker: Extract<ListItemMarker, {kind: 'bullet' | 'number' | 'task'}>,
  isCheckList: boolean,
): void {
  const items = $itemsOf(list);
  if (marker.kind === 'task' && isCheckList) {
    // A check list already keeps each item's state; only another list is
    // converted, carrying over RichText's task state.
    if (list.getListType() !== 'check') {
      const states = items.map(each => $getTaskState(each));
      for (const each of items) {
        $setTaskState(each, null);
      }
      list.setListType('check');
      items.forEach((each, index) => {
        each.setChecked(states[index] === 'checked');
      });
    }
    item.setChecked(marker.checked);
    return;
  }
  if (marker.kind === 'task') {
    // Read a check list's states first: Lexical reports no checked state
    // once the list is no longer a check list.
    const checkStates =
      list.getListType() === 'check'
        ? items.map(each => each.getChecked() === true)
        : null;
    if (list.getListType() !== 'bullet') {
      list.setListType('bullet');
    }
    items.forEach((each, index) => {
      if (checkStates != null) {
        each.setChecked(undefined);
        $setTaskState(each, checkStates[index] ? 'checked' : 'unchecked');
      } else if ($getTaskState(each) == null) {
        $setTaskState(each, 'unchecked');
      }
    });
    $setTaskState(item, marker.checked ? 'checked' : 'unchecked');
    return;
  }
  for (const each of items) {
    if ($getTaskState(each) != null) {
      $setTaskState(each, null);
    }
    if (each.getChecked() !== undefined) {
      each.setChecked(undefined);
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
 * they were. When the last of those nested lists has the same type, Lexical
 * merges the items after it into that list, which numbers them on from its
 * own items.
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
function $remark(
  key: NodeKey,
  prefix: string,
  marker: ListItemMarker,
  isCheckList: boolean,
): void {
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
    $switchList(list, item, marker, isCheckList);
    // Lexical merges a dirty list with a list of the same type after it, but
    // not with one before it. Marking the list before it joins the two, as
    // the Markdown reads back.
    const previous = list.getPreviousSibling();
    if (
      $isListNode(previous) &&
      previous.getListType() === list.getListType()
    ) {
      previous.markDirty();
    }
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
        const transformer =
          match == null ? undefined : transformerFor(match.line, transformers);
        if (
          match == null ||
          transformer == null ||
          !$isListItemNode(item) ||
          !text.is(item.getFirstChild()) ||
          !$isListNode(list)
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
        return {
          key,
          prefix,
          marker: match.marker,
          isCheckList: transformer === CHECK_LIST,
        };
      });
      if (found != null) {
        editor.update(() =>
          $remark(found.key, found.prefix, found.marker, found.isCheckList),
        );
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
