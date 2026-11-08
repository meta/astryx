// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownTaskList.ts
 * @input Uses lexical (node state), @lexical/list, and @lexical/markdown
 *   (ElementTransformer).
 * @output Exports TASK_LIST, the transformer that imports GFM task list
 *   items; $getTaskState / $setTaskState, which read and set whether a list
 *   item is a task and whether it is checked; and registerTaskListEditing,
 *   the editor's Enter and Mod+Enter behavior for task items.
 * @position Part of DEFAULT_TRANSFORMERS (markdownTable.ts), ahead of
 *   Lexical's bullet transformer. It reads exactly the task items core
 *   Markdown reads (spec:AST-061 FR5): a `-`, `*`, or `+` bullet, one space,
 *   `[ ]`, `[x]`, or `[X]`, and a space. Lexical's own CHECK_LIST also takes a
 *   line with no bullet, `[]`, and missing spaces, and reads `[X]` as
 *   unchecked; those stay a paragraph or an ordinary bullet here.
 *
 *   A task is a property of an item, not of its list: GFM lets task and
 *   plain items share one list, and Lexical keeps a checked state only in its
 *   all-checkbox lists. So task items live in ordinary bullet lists, beside
 *   plain items, and carry their state as node state; LIST_EXPORT writes
 *   `[ ]` or `[x]` for each task item. TaskCheckboxPlugin draws them, and
 *   registers registerTaskListEditing in the editor.
 */

import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import type {ElementTransformer} from '@lexical/markdown';
import {$findMatchingParent, mergeRegister} from '@lexical/utils';
import {
  $getSelection,
  $getState,
  $isRangeSelection,
  $setState,
  COMMAND_PRIORITY_LOW,
  createState,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
} from 'lexical';

export type TaskState = 'checked' | 'unchecked';

// Whether an item is a task. A copy keeps it, so the item Enter makes after
// a task is a task too.
const taskKind = createState('astryxTask', {
  parse: (value: unknown): boolean => value === true,
});

// Whether a task is checked.
const taskChecked = createState('astryxTaskChecked', {
  parse: (value: unknown): boolean => value === true,
});

/**
 * Whether `item` is a task and whether it is checked; null for a plain item.
 * An item in one of Lexical's own checkbox lists is a task too.
 */
export function $getTaskState(item: ListItemNode): TaskState | null {
  if ($getState(item, taskKind)) {
    return $getState(item, taskChecked) ? 'checked' : 'unchecked';
  }
  const list = item.getParent();
  if ($isListNode(list) && list.getListType() === 'check') {
    return item.getChecked() === true ? 'checked' : 'unchecked';
  }
  return null;
}

/** Makes `item` a task in the given state, or a plain item for null. */
export function $setTaskState(
  item: ListItemNode,
  state: TaskState | null,
): void {
  const list = item.getParent();
  if ($isListNode(list) && list.getListType() === 'check') {
    item.setChecked(state === 'checked');
    return;
  }
  $setState(item, taskKind, state != null);
  $setState(item, taskChecked, state === 'checked');
}

const TASK_ITEM = /^(\s*)([-*+])\s\[([ xX])\]\s/;

/** Nesting depth from leading whitespace, counted as Lexical's lists do. */
function indentOf(whitespace: string): number {
  const tabs = whitespace.match(/\t/g)?.length ?? 0;
  const spaces = whitespace.match(/ /g)?.length ?? 0;
  return tabs + Math.floor(spaces / 4);
}

export const TASK_LIST: ElementTransformer = {
  dependencies: [ListNode, ListItemNode],
  // LIST_EXPORT writes every list, task items included.
  export: () => null,
  regExp: TASK_ITEM,
  replace: (parentNode, children, match, isImport) => {
    const item = $createListItemNode();
    $setState(item, taskKind, true);
    $setState(item, taskChecked, match[3] !== ' ');
    // A task item joins the bullet list beside it, as a plain item does.
    const previous = parentNode.getPreviousSibling();
    const next = parentNode.getNextSibling();
    if ($isListNode(next) && next.getListType() === 'bullet') {
      const first = next.getFirstChild();
      if (first == null) {
        next.append(item);
      } else {
        first.insertBefore(item);
      }
      parentNode.remove();
    } else if ($isListNode(previous) && previous.getListType() === 'bullet') {
      previous.append(item);
      parentNode.remove();
    } else {
      const list = $createListNode('bullet');
      list.append(item);
      parentNode.replace(list);
    }
    item.append(...children);
    if (!isImport) {
      item.select(0, 0);
    }
    const indent = indentOf(match[1]);
    if (indent > 0) {
      item.setIndent(indent);
    }
  },
  type: 'element',
};

/** The task item holding the selection's anchor, if any. */
function $selectedTaskItem(): ListItemNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }
  return $findMatchingParent(
    selection.anchor.getNode(),
    (node): node is ListItemNode =>
      $isListItemNode(node) && $getTaskState(node) != null,
  );
}

/**
 * Task editing in an editor:
 *
 * - Enter in a task makes the new item a task, unchecked, as Lexical's own
 *   checkbox items do. Lexical copies the item to make the new one, state and
 *   all, so the new item's state is set here, where Enter makes it — never
 *   inferred later from content, which would uncheck a written `- [x]` with
 *   no text. Enter at the start of a task leaves its text, and its state, on
 *   the item that holds it, and puts the new, unchecked item before it. Enter
 *   in an empty task is left to the list, which ends the list there.
 * - Mod+Enter checks or unchecks the task holding the caret.
 */
export function registerTaskListEditing(editor: LexicalEditor): () => void {
  return mergeRegister(
    editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        const selection = $getSelection();
        const item = $selectedTaskItem();
        if (
          item == null ||
          !$isRangeSelection(selection) ||
          item.getTextContent().trim() === ''
        ) {
          return false;
        }
        const state = $getTaskState(item);
        const isAtStart =
          selection.isCollapsed() &&
          selection.anchor.offset === 0 &&
          (selection.anchor.getNode().is(item) ||
            selection.anchor.getNode().is(item.getFirstDescendant()));
        const created = selection.insertParagraph();
        if (!$isListItemNode(created) || $getTaskState(created) == null) {
          return true;
        }
        if (isAtStart) {
          // The text moved to the new item: it keeps its state, and the item
          // left empty before it is the new, unchecked one.
          $setTaskState(created, state);
          $setTaskState(item, 'unchecked');
        } else {
          $setTaskState(created, 'unchecked');
        }
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      event => {
        const isModified =
          event != null &&
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey;
        const item = isModified ? $selectedTaskItem() : null;
        if (item == null) {
          return false;
        }
        event?.preventDefault();
        $setTaskState(
          item,
          $getTaskState(item) === 'checked' ? 'unchecked' : 'checked',
        );
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}
