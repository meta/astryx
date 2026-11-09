// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file editorNodes.ts
 * @input Imports the default Lexical node classes registered by the editor.
 * @output Exports DEFAULT_NODES — the base OSS node set.
 * @position Shared by RichTextEditor.tsx (editor config) and
 *   markdownSerializers.ts (headless conversion), so both register the same
 *   nodes and Markdown round-trips consistently.
 *
 * SYNC: When the default node set changes, both consumers pick it up here.
 */

import {ListNode, ListItemNode} from '@lexical/list';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {LinkNode, AutoLinkNode} from '@lexical/link';
import {CodeNode, CodeHighlightNode} from '@lexical/code';
import {TableNode, TableRowNode, TableCellNode} from '@lexical/table';
import {HorizontalRuleNode} from '@lexical/extension';
import type {Klass, LexicalNode} from 'lexical';
import {RichTextExtensionNode} from './markdownExtensionNode';

/**
 * The default OSS node set registered with the editor: headings, quotes,
 * lists, links, code, and tables. Extend via the `nodes` prop / option rather
 * than editing this list.
 */
export const DEFAULT_NODES: ReadonlyArray<Klass<LexicalNode>> = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  CodeNode,
  CodeHighlightNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  HorizontalRuleNode,
  // Markdown plugin nodes (spec:AST-064): registered everywhere so stored
  // state that holds them always loads.
  RichTextExtensionNode,
];
