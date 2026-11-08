// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MarkdownExtensionsPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/utils ($dfs),
 *   lexical, core's client-only MarkdownPluginNodeRenderer and server-safe
 *   parser, and the RichText adapter and extension node.
 * @output Exports MarkdownExtensionsPlugin, which draws every Markdown plugin
 *   node in an editor with its plugin's renderer, and deriveExtensionNode.
 * @position Rendered by RichTextEditor and RichTextView when they are given
 *   `markdownExtensions` (spec:AST-064 FR2). It checks the configuration
 *   first (FR6), so a conflicting one throws a RichTextExtensionError while
 *   the surface renders. Each node is derived again from its source with the
 *   adopted plugins and drawn by core's MarkdownPluginNodeRenderer, so it
 *   renders, falls back, and reports failures exactly as Markdown does (FR8,
 *   FR9); stored data is never drawn on its own, and a node its plugin no
 *   longer recognizes — or whose plugin is not adopted — shows its source
 *   (FR11). Without this plugin a node shows its source.
 */

import {useEffect, useMemo, type ReactNode} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';
import type {Transformer} from '@lexical/markdown';
import {
  $dfs,
  addClassNamesToElement,
  removeClassNamesFromElement,
} from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  HISTORY_MERGE_TAG,
  TEXT_TYPE_TO_FORMAT,
  type LexicalEditor,
  type NodeKey,
  type RangeSelection,
  type TextFormatType,
} from 'lexical';
import {MarkdownPluginNodeRenderer} from '@astryxdesign/core/Markdown/plugin-renderer';
import {
  parseInlineAst,
  parseMarkdownAst,
} from '@astryxdesign/core/Markdown/parser';
import type {
  MarkdownExtensionNode,
  MarkdownPluginEntry,
} from '@astryxdesign/core/Markdown/plugins';
import {pluginsOf, type RichTextMarkdownExtension} from './markdownExtensions';
import {
  $firstSelectedText,
  $isRichTextExtensionNode,
  setRichTextExtensionNodeDecorator,
  type RichTextExtensionNode,
  type RichTextExtensionNodeFacts,
} from './markdownExtensionNode';

/**
 * The node core derives from a stored node's source with `plugins`, or null
 * when no adopted plugin of the same protocol version reads that exact source
 * as that node.
 */
export function deriveExtensionNode(
  facts: RichTextExtensionNodeFacts,
  plugins: ReadonlyArray<MarkdownPluginEntry>,
): MarkdownExtensionNode | null {
  const plugin = plugins.find(entry => entry.name === facts.plugin);
  if (plugin == null || plugin.apiVersion !== facts.apiVersion) {
    return null;
  }
  const nodes: ReadonlyArray<{readonly type: string}> =
    facts.display === 'inline'
      ? parseInlineAst(facts.source, {plugins: [plugin]})
      : parseMarkdownAst(facts.source, {plugins: [plugin]}).children;
  const [node] = nodes;
  if (nodes.length !== 1 || node?.type !== 'extension') {
    return null;
  }
  const extension = node as MarkdownExtensionNode;
  return extension.plugin === facts.plugin &&
    extension.name === facts.name &&
    extension.display === facts.display &&
    extension.source === facts.source
    ? extension
    : null;
}

/**
 * The formats a plugin node can sit inside, outermost first, as RichText draws
 * them around text (textSemantics.ts): a deletion, then emphasis, then strong.
 */
const MARKS: ReadonlyArray<readonly [TextFormatType, 'del' | 'em' | 'strong']> =
  [
    ['strikethrough', 'del'],
    ['italic', 'em'],
    ['bold', 'strong'],
  ];

/** The formats a toggle can put a plugin node inside. */
const NODE_FORMATS: ReadonlySet<TextFormatType> = new Set(
  MARKS.map(([format]) => format),
);

function ExtensionNodeView({
  facts,
  format,
  nodeKey,
  plugins,
}: {
  facts: RichTextExtensionNodeFacts;
  format: number;
  nodeKey: NodeKey;
  plugins: ReadonlyArray<MarkdownPluginEntry>;
}): ReactNode {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  // A click on the node selects it whole, as a click on a rule does, so a
  // pointer user can format or delete it like a keyboard user.
  useEffect(
    () =>
      editor.registerCommand(
        CLICK_COMMAND,
        event => {
          const element = editor.getElementByKey(nodeKey);
          if (
            !editor.isEditable() ||
            element == null ||
            !(event.target instanceof Node) ||
            !element.contains(event.target)
          ) {
            return false;
          }
          clearSelection();
          setSelected(true);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [clearSelection, editor, nodeKey, setSelected],
  );
  // A selected node shows the focus ring a selected rule shows.
  useEffect(() => {
    const element = editor.getElementByKey(nodeKey);
    const className: unknown = editor._config.theme.markdownExtensionSelected;
    if (element == null || typeof className !== 'string' || className === '') {
      return;
    }
    if (isSelected) {
      addClassNamesToElement(element, className);
    } else {
      removeClassNamesFromElement(element, className);
    }
  }, [editor, isSelected, nodeKey]);
  const node = useMemo(
    () => deriveExtensionNode(facts, plugins),
    [facts, plugins],
  );
  let content: ReactNode =
    node == null ? (
      facts.source
    ) : (
      <MarkdownPluginNodeRenderer plugins={plugins} node={node} />
    );
  // Inside emphasis, strong, or strikethrough, the node is drawn inside the
  // same elements, as core Markdown draws it inside the text's.
  for (const [type, Tag] of [...MARKS].reverse()) {
    if ((format & TEXT_TYPE_TO_FORMAT[type]) !== 0) {
      content = <Tag>{content}</Tag>;
    }
  }
  return content;
}

/**
 * Marks every plugin node so Lexical draws it again with the decorator the
 * editor has now. Not an edit, so it adds nothing to undo history.
 */
function redrawExtensionNodes(editor: LexicalEditor): void {
  editor.update(
    () => {
      for (const {node} of $dfs()) {
        if ($isRichTextExtensionNode(node)) {
          node.markDirty();
        }
      }
    },
    {tag: HISTORY_MERGE_TAG},
  );
}

/**
 * Whether `format` will be on for the text a range selects once it is
 * toggled, as Lexical's formatText decides it from the first selected
 * character; null when the range selects no text, only nodes.
 */
function $nextTextFormat(
  selection: RangeSelection,
  format: TextFormatType,
): boolean | null {
  const first = $firstSelectedText(selection);
  return first == null
    ? null
    : (first.getFormatFlags(format, null) & TEXT_TYPE_TO_FORMAT[format]) !== 0;
}

export interface MarkdownExtensionsPluginProps {
  extensions: ReadonlyArray<RichTextMarkdownExtension>;
  /** The surface's Markdown transformers, checked against the extensions. */
  transformers: ReadonlyArray<Transformer>;
}

export function MarkdownExtensionsPlugin({
  extensions,
  transformers,
}: MarkdownExtensionsPluginProps): null {
  const [editor] = useLexicalComposerContext();
  const plugins = useMemo(
    () => pluginsOf(extensions, transformers),
    [extensions, transformers],
  );

  useEffect(() => {
    const unset = setRichTextExtensionNodeDecorator(
      editor,
      (facts, format, nodeKey) => (
        <ExtensionNodeView
          facts={facts}
          format={format}
          nodeKey={nodeKey}
          plugins={plugins}
        />
      ),
    );
    redrawExtensionNodes(editor);
    return () => {
      unset();
      redrawExtensionNodes(editor);
    };
  }, [editor, plugins]);

  // Bold, italic, or strikethrough toggled on a selection takes the plugin
  // nodes in it along, so they stay inside the marks the text around them
  // gets — and a selection of nodes alone toggles them by themselves.
  useEffect(
    () =>
      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        format => {
          const selection = $getSelection();
          if (!NODE_FORMATS.has(format) || selection == null) {
            return false;
          }
          const nodes = selection
            .getNodes()
            .filter(
              (node): node is RichTextExtensionNode =>
                $isRichTextExtensionNode(node) && node.isInline(),
            );
          if (nodes.length === 0) {
            return false;
          }
          // The state Lexical gives the selected text, read before it does;
          // null when no text is selected, only nodes.
          const textState = $isRangeSelection(selection)
            ? $nextTextFormat(selection, format)
            : null;
          if ($isRangeSelection(selection)) {
            selection.formatText(format);
          }
          const isOn =
            textState ?? !nodes.every(node => node.hasFormat(format));
          for (const node of nodes) {
            node.setFormatFlag(format, isOn);
          }
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  return null;
}
