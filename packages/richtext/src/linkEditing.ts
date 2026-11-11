// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file linkEditing.ts
 * @input A Lexical editor, a link's node key, and an entered address
 * @output Exports $linkOf, $caretLink, toLinkHref, setLinkUrlAt, removeLinkAt,
 *   displayUrl, and openLinkInNewTab
 * @position Internal to RichText. The link rules RichTextEditorToolbar's link
 *   popover and RichTextEditorLinkPopoverPlugin share: which address an entry
 *   becomes, and how a link's address is set or the link is removed.
 */

import {$isAutoLinkNode, $isLinkNode, type LinkNode} from '@lexical/link';
import {$findMatchingParent} from '@lexical/utils';
import {
  $addUpdateTag,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import {isOpenableUrl, sanitizeUrl} from './linkUtils';

/** The link `node` is in, if any. An unlinked autolink reads as text. */
export function $linkOf(node: LexicalNode | null): LinkNode | null {
  const link = node == null ? null : $findMatchingParent(node, $isLinkNode);
  return $isLinkNode(link) && !($isAutoLinkNode(link) && link.getIsUnlinked())
    ? link
    : null;
}

/** The link a collapsed selection (the caret) is in, or null. */
export function $caretLink(): LinkNode | null {
  const selection = $getSelection();
  return $isRangeSelection(selection) && selection.isCollapsed()
    ? $linkOf(selection.anchor.getNode())
    : null;
}

/**
 * The address an entry becomes under the link rules (`sanitizeUrl`), or null
 * when the rules refuse it.
 */
export function toLinkHref(entered: string): string | null {
  const href = sanitizeUrl(entered.trim());
  return href === 'about:blank' ? null : href;
}

/**
 * Removes the link `key` and keeps its words, as one undo step. An autolink
 * is marked unlinked instead, so the autolink plugin does not link its words
 * again.
 */
export function removeLinkAt(editor: LexicalEditor, key: NodeKey): void {
  editor.update(
    () => {
      const node = $getNodeByKey(key);
      if (!$isLinkNode(node)) {
        return;
      }
      $addUpdateTag(HISTORY_PUSH_TAG);
      if ($isAutoLinkNode(node)) {
        node.setIsUnlinked(true);
        return;
      }
      for (const child of node.getChildren()) {
        node.insertBefore(child);
      }
      node.remove();
    },
    {discrete: true},
  );
}

/**
 * Sets the link `key`'s address, as one undo step, with the new-tab
 * attributes the toolbar writes when `hasNewTabLinks` is on (and none when it
 * is off). An empty entry removes the link and keeps its words. Returns false
 * when the link rules refuse the entry, and changes nothing then.
 */
export function setLinkUrlAt(
  editor: LexicalEditor,
  key: NodeKey,
  entered: string,
  {hasNewTabLinks}: {readonly hasNewTabLinks: boolean},
): boolean {
  if (entered.trim() === '') {
    removeLinkAt(editor, key);
    return true;
  }
  const href = toLinkHref(entered);
  if (href == null) {
    return false;
  }
  editor.update(
    () => {
      const node = $getNodeByKey(key);
      if ($isLinkNode(node)) {
        $addUpdateTag(HISTORY_PUSH_TAG);
        node.setURL(href);
        node.setTarget(hasNewTabLinks ? '_blank' : null);
        node.setRel(hasNewTabLinks ? 'noopener noreferrer' : null);
      }
    },
    {discrete: true},
  );
  return true;
}

/** The address as a person reads it: no web scheme, no trailing slash. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** Opens a stored link in a new tab. An address that is not safe to open
 *  never opens. */
export function openLinkInNewTab(url: string): void {
  if (isOpenableUrl(url)) {
    window.open(sanitizeUrl(url), '_blank', 'noopener,noreferrer');
  }
}
