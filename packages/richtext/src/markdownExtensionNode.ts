// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownExtensionNode.ts
 * @input Uses lexical (DecoratorNode, node serialization, text formats).
 * @output Exports RichTextExtensionNode, the editor node for one Markdown
 *   plugin node, with $createRichTextExtensionNode and
 *   $isRichTextExtensionNode.
 * @position Registered with every RichText surface and serializer
 *   (editorNodes.ts), so stored state holding plugin nodes always loads. A
 *   node is atomic — the editor cannot type into it — and keeps the exact
 *   source it was read from, which is what it exports (spec:AST-064 FR7,
 *   FR10). Stored state keeps that source, the plugin's name and protocol
 *   version, the data the plugin derived for rendering (FR11), and the text
 *   formats the node sits inside, so a node inside emphasis, strong, or
 *   strikethrough stays inside it. Imports no React: the client surfaces
 *   register how an editor draws plugin nodes.
 */

import {
  $isNodeSelection,
  $isTextNode,
  DecoratorNode,
  TEXT_TYPE_TO_FORMAT,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type NodeSelection,
  type RangeSelection,
  type TextNode,
  type SerializedLexicalNode,
  type Spread,
  type TextFormatType,
} from 'lexical';
import type {MarkdownPluginData} from '@astryxdesign/core/Markdown/plugins';

/** What one plugin node is: the parsed node's identity, data, and source. */
export interface RichTextExtensionNodeFacts {
  readonly plugin: string;
  readonly apiVersion: number;
  readonly name: string;
  readonly display: 'inline' | 'block';
  readonly data: MarkdownPluginData;
  readonly source: string;
}

export type SerializedRichTextExtensionNode = Spread<
  RichTextExtensionNodeFacts & {
    /** The text formats the node sits inside, as a text node's format bits. */
    readonly format: number;
  },
  SerializedLexicalNode
>;

/** Reads stored facts defensively: a missing field becomes an empty value. */
export function factsFrom(
  value: Record<string, unknown>,
): RichTextExtensionNodeFacts {
  const {plugin, apiVersion, name, display, data, source} = value;
  return {
    plugin: typeof plugin === 'string' ? plugin : '',
    apiVersion: typeof apiVersion === 'number' ? apiVersion : 0,
    name: typeof name === 'string' ? name : '',
    display: display === 'block' ? 'block' : 'inline',
    data: (data ?? null) as MarkdownPluginData,
    source: typeof source === 'string' ? source : '',
  };
}

/**
 * Draws a plugin node's content in one editor, inside the text formats the
 * node sits in; `nodeKey` lets it select the node. The client surfaces
 * register one (MarkdownExtensionsPlugin); without one, a node shows its
 * source.
 */
export type RichTextExtensionNodeDecorator = (
  facts: RichTextExtensionNodeFacts,
  format: number,
  nodeKey: NodeKey,
) => unknown;

const decorators = new WeakMap<LexicalEditor, RichTextExtensionNodeDecorator>();

/** Sets how `editor` draws plugin nodes; returns a function that unsets it. */
export function setRichTextExtensionNodeDecorator(
  editor: LexicalEditor,
  decorator: RichTextExtensionNodeDecorator,
): () => void {
  decorators.set(editor, decorator);
  return () => {
    if (decorators.get(editor) === decorator) {
      decorators.delete(editor);
    }
  };
}

/**
 * The attribute that carries a node's facts and formats in its element, so
 * copying it as HTML — the browser's own copy, or the editor's HTML export —
 * and pasting it into any RichText editor brings back the same node with the
 * same source and marks.
 */
const FACTS_ATTRIBUTE = 'data-markdown-extension';

function factsAttribute(node: RichTextExtensionNode): string {
  return JSON.stringify({...node.__facts, format: node.__format});
}

function convertExtensionElement(element: HTMLElement): DOMConversionOutput {
  let node: RichTextExtensionNode | null = null;
  try {
    const parsed: unknown = JSON.parse(
      element.getAttribute(FACTS_ATTRIBUTE) ?? '',
    );
    if (parsed != null && typeof parsed === 'object') {
      const value = parsed as Record<string, unknown>;
      node = $createRichTextExtensionNode(
        factsFrom(value),
        typeof value.format === 'number' ? value.format : 0,
      );
    }
  } catch {
    node = null;
  }
  return {
    node,
    // The element's content is the node's rendering, not more document.
    forChild: () => null,
  };
}

const importExtensionElement = (element: HTMLElement) =>
  element.hasAttribute(FACTS_ATTRIBUTE)
    ? {conversion: convertExtensionElement, priority: 4 as const}
    : null;

export class RichTextExtensionNode extends DecoratorNode<unknown> {
  __facts: RichTextExtensionNodeFacts;
  /**
   * The text formats the node sits inside, as a text node's format bits. Only
   * inline nodes carry any.
   */
  __format: number;

  static getType(): string {
    return 'astryx-markdown-extension';
  }

  static clone(node: RichTextExtensionNode): RichTextExtensionNode {
    return new RichTextExtensionNode(node.__facts, node.__format, node.__key);
  }

  static importJSON(
    serialized: SerializedLexicalNode & Record<string, unknown>,
  ): RichTextExtensionNode {
    // Stored state is read defensively, so a damaged node still loads.
    const {format} = serialized;
    return $createRichTextExtensionNode(
      factsFrom(serialized),
      typeof format === 'number' ? format : 0,
    ).updateFromJSON(serialized);
  }

  static importDOM(): DOMConversionMap {
    return {span: importExtensionElement, div: importExtensionElement};
  }

  constructor(facts: RichTextExtensionNodeFacts, format = 0, key?: NodeKey) {
    super(key);
    this.__facts = facts;
    this.__format = facts.display === 'inline' ? format : 0;
  }

  exportJSON(): SerializedRichTextExtensionNode {
    const latest = this.getLatest();
    return {
      ...super.exportJSON(),
      ...latest.__facts,
      format: latest.__format,
    };
  }

  /** The node's identity, data, and source. */
  getFacts(): RichTextExtensionNodeFacts {
    return this.getLatest().__facts;
  }

  /** The exact Markdown the node was read from. */
  getSource(): string {
    return this.getLatest().__facts.source;
  }

  /** The text formats the node sits inside, as a text node's format bits. */
  getFormat(): number {
    return this.getLatest().__format;
  }

  hasFormat(type: TextFormatType): boolean {
    return (this.getFormat() & TEXT_TYPE_TO_FORMAT[type]) !== 0;
  }

  /** Puts the node inside, or takes it out of, one text format. */
  setFormatFlag(type: TextFormatType, isOn: boolean): this {
    const writable = this.getWritable();
    const flag = TEXT_TYPE_TO_FORMAT[type];
    writable.__format = isOn
      ? writable.__format | flag
      : writable.__format & ~flag;
    return writable;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement(
      this.__facts.display === 'inline' ? 'span' : 'div',
    );
    element.setAttribute(FACTS_ATTRIBUTE, factsAttribute(this));
    if (this.__facts.display === 'block') {
      // A block node is spaced and measured as Markdown spaces its block.
      const className: unknown = config.theme.markdownExtensionBlock;
      if (typeof className === 'string' && className !== '') {
        element.className = className;
      }
    }
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement(
      this.__facts.display === 'inline' ? 'span' : 'div',
    );
    element.setAttribute(FACTS_ATTRIBUTE, factsAttribute(this));
    element.textContent = this.__facts.source;
    return {element};
  }

  updateDOM(prevNode: RichTextExtensionNode, dom: HTMLElement): false {
    // A mark toggled on the node changes what its element carries.
    if (prevNode.__format !== this.__format) {
      dom.setAttribute(FACTS_ATTRIBUTE, factsAttribute(this));
    }
    return false;
  }

  isInline(): boolean {
    return this.__facts.display === 'inline';
  }

  /** The node's text is its source, so plain-text copies and search see it. */
  getTextContent(): string {
    return this.getLatest().__facts.source;
  }

  decorate(editor: LexicalEditor): unknown {
    return (
      decorators.get(editor)?.(this.__facts, this.__format, this.__key) ??
      this.__facts.source
    );
  }
}

export function $createRichTextExtensionNode(
  facts: RichTextExtensionNodeFacts,
  format = 0,
): RichTextExtensionNode {
  return new RichTextExtensionNode(facts, format);
}

export function $isRichTextExtensionNode(
  node: LexicalNode | null | undefined,
): node is RichTextExtensionNode {
  return node instanceof RichTextExtensionNode;
}

/**
 * The first text node a range selects characters of, as Lexical's formatText
 * reads it: a range that starts at the end of a text node starts in the next.
 * Null when the range selects no text, only nodes.
 */
export function $firstSelectedText(selection: RangeSelection): TextNode | null {
  const texts = selection.getNodes().filter($isTextNode);
  const isBackward = selection.isBackward();
  const start = isBackward ? selection.focus : selection.anchor;
  const end = isBackward ? selection.anchor : selection.focus;
  let first: TextNode | undefined = texts[0];
  let startOffset = start.type === 'element' ? 0 : start.offset;
  if (
    first != null &&
    start.type === 'text' &&
    startOffset === first.getTextContentSize()
  ) {
    first = texts[1];
    startOffset = 0;
  }
  const last = texts[texts.length - 1];
  if (first == null || last == null) {
    return null;
  }
  const endOffset =
    end.type === 'text' ? end.offset : last.getTextContentSize();
  return first.is(last) && startOffset === endOffset ? null : first;
}

/**
 * The inline plugin nodes a selection holds when it holds nothing else: a
 * range that selects no text, only nodes, or a node selection of plugin
 * nodes alone. Null otherwise. A format shown or toggled then belongs to
 * them.
 */
export function $selectedExtensionNodesOnly(
  selection: RangeSelection | NodeSelection,
): RichTextExtensionNode[] | null {
  if ($isNodeSelection(selection)) {
    const selected = selection.getNodes();
    return selected.length > 0 &&
      selected.every(node => $isRichTextExtensionNode(node) && node.isInline())
      ? (selected as RichTextExtensionNode[])
      : null;
  }
  const nodes = selection
    .getNodes()
    .filter(
      (node): node is RichTextExtensionNode =>
        $isRichTextExtensionNode(node) && node.isInline(),
    );
  return nodes.length > 0 && $firstSelectedText(selection) == null
    ? nodes
    : null;
}
