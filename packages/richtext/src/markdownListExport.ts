// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownListExport.ts
 * @input Uses @lexical/list (ListNode, ListItemNode) and @lexical/markdown
 *   (ElementTransformer).
 * @output Exports LIST_EXPORT, which writes lists the way Lexical's list
 *   transformers do except for nesting: a nested list is indented to its
 *   parent item's content column instead of four spaces per level, and each
 *   task item writes `[ ]` or `[x]` (markdownTaskList.ts).
 * @position Part of DEFAULT_TRANSFORMERS (markdownTable.ts), ahead of
 *   Lexical's list transformers, which still import. Import reads nesting the
 *   CommonMark way (markdownListIndentation.ts), so a child written four
 *   spaces under `100. parent` (content column five) would read back at the
 *   parent's level; indenting to the content column keeps an edited list's
 *   structure when it is read again (spec:AST-062 FR3).
 */

import {
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import type {ElementTransformer} from '@lexical/markdown';
import type {ElementNode} from 'lexical';
import {$getTaskState} from './markdownTaskList';

/** The bullet Lexical recorded for a list on import (`-`, `*`, or `+`). */
function bulletOf(list: ListNode): string {
  // The export may hand over a view of the list (an object inheriting from
  // the node, see markdownSource.ts); Lexical validates the fields of the
  // node it serializes, so read the recorded state from the node itself.
  const serialized = list.getLatest().exportJSON() as {
    $?: {mdListMarker?: unknown};
  };
  const marker = serialized.$?.mdListMarker;
  return marker === '*' || marker === '+' ? marker : '-';
}

function exportList(
  list: ListNode,
  exportChildren: (node: ElementNode) => string,
  indent: string,
): string {
  const lines: Array<string> = [];
  const type = list.getListType();
  let index = 0;
  // Where a nested list goes: the content column of the item before it.
  let childIndent = `${indent}  `;
  for (const item of list.getChildren()) {
    if (!$isListItemNode(item)) {
      continue;
    }
    const first = item.getFirstChild();
    if (item.getChildrenSize() === 1 && $isListNode(first)) {
      lines.push(exportList(first, exportChildren, childIndent));
      continue;
    }
    const marker =
      type === 'number' ? `${list.getStart() + index}. ` : `${bulletOf(list)} `;
    // A task item, in any bulleted list, writes its box.
    const task = type === 'number' ? null : $getTaskState(item);
    const checkbox = task == null ? '' : `[${task === 'checked' ? 'x' : ' '}] `;
    let text = exportChildren(item);
    if (type !== 'number') {
      // As Lexical does: keep `1. ` at the start of a bullet item literal.
      text = text.replace(/^(\s{0,3}\d+)(\.\s)/, '$1\\$2');
    }
    lines.push(indent + marker + checkbox + text);
    childIndent = indent + ' '.repeat(marker.length);
    index++;
  }
  return lines.join('\n');
}

export const LIST_EXPORT: ElementTransformer = {
  dependencies: [ListNode, ListItemNode],
  export: (node, exportChildren) =>
    $isListNode(node) ? exportList(node, exportChildren, '') : null,
  // Export only: Lexical's list transformers import.
  regExp: /(?!)/,
  replace: () => false,
  type: 'element',
};
