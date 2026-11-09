// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownOrderedList.ts
 * @input Uses @lexical/list (ListNode, ListItemNode) and @lexical/markdown
 *   (ORDERED_LIST).
 * @output Exports ORDERED_LIST_KEEPING_START, Lexical's ordered list
 *   transformer with one change: a nested numbered list starts at the number
 *   its first item was written with.
 * @position Replaces Lexical's ORDERED_LIST in DEFAULT_TRANSFORMERS
 *   (markdownTable.ts). Lexical nests an indented item under a numbered list
 *   by indenting it into a new list that starts at 1, so `27.` written as the
 *   first item of a nested list read as `1.` (or `a.` under spec:AST-061
 *   DEC-6). Markdown keeps every list's start, nested or not (DEC-6), so this
 *   sets the new nested list's start from the marker. A later item in the same
 *   nested list continues its sequence, as Lexical's does.
 */

import {$isListItemNode, $isListNode, type ListNode} from '@lexical/list';
import {ORDERED_LIST, type ElementTransformer} from '@lexical/markdown';

/**
 * The list `item` was indented into: the last item under `list`, followed
 * down through the wrapper items Lexical nests lists in.
 */
function nestedListOfLastItem(list: ListNode): ListNode {
  let current = list;
  for (;;) {
    const last = current.getLastChild();
    const nested = $isListItemNode(last) ? last.getFirstChild() : null;
    if (
      !$isListItemNode(last) ||
      last.getChildrenSize() !== 1 ||
      !$isListNode(nested)
    ) {
      return current;
    }
    current = nested;
  }
}

export const ORDERED_LIST_KEEPING_START: ElementTransformer = {
  ...ORDERED_LIST,
  replace: (parentNode, children, match, isImport) => {
    const previous = parentNode.getPreviousSibling();
    const result = ORDERED_LIST.replace(parentNode, children, match, isImport);
    if ($isListNode(previous) && previous.getListType() === 'number') {
      const nested = nestedListOfLastItem(previous);
      // The new item opened this nested list: start it at its own number.
      if (
        nested !== previous &&
        nested.getListType() === 'number' &&
        nested.getChildrenSize() === 1
      ) {
        nested.setStart(Number(match[2]));
      }
    }
    return result;
  },
};
