// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownExtensions.ts
 * @input Uses core's server-safe plugin protocol (getMarkdownPluginCapabilities)
 *   and parser (parseMarkdownAst), lexical, and RichTextExtensionNode.
 * @output Exports createRichTextExtension, RichTextExtensionError, and the
 *   RichTextMarkdownExtension type; and, for RichText's own Markdown import and
 *   export, the configuration check, the source shielding and restoring that
 *   puts core-recognized plugin nodes into the editor, and the transformers
 *   that export them.
 * @position Implements spec:AST-064 FR1–FR6 and FR10 for RichText's Markdown
 *   import and export. Server-safe: imports no React, DOM, or client module.
 *
 * A plugin is the entry core's createMarkdownPlugin returns; RichText adopts it
 * as it is (FR1), refusing a plugin that declares a transform (FR4, DEC-3).
 * Before Lexical imports a chunk of Markdown, core's parser finds the adopted
 * plugins' nodes in it, and each node's exact source becomes a private-use
 * stand-in that Lexical's transformers read as plain text (FR5, DEC-4). Core
 * reports where a top-level block node sits but not an inline one, so each
 * node is placed at the occurrence of its source that core itself recognizes:
 * replacing that occurrence, and only that one, removes exactly that node from
 * core's parse. After the import, each stand-in becomes an atomic
 * RichTextExtensionNode holding the node's source and data.
 */

import type {Transformer} from '@lexical/markdown';
import {
  $createParagraphNode,
  $createTextNode,
  $isLineBreakNode,
  $isParagraphNode,
  TextNode,
  type ElementNode,
  type LexicalNode,
  type ParagraphNode,
} from 'lexical';
import {
  getMarkdownPluginCapabilities,
  type MarkdownExtensionNode,
  type MarkdownPluginEntry,
} from '@astryxdesign/core/Markdown/plugins';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {
  $createRichTextExtensionNode,
  $isRichTextExtensionNode,
  RichTextExtensionNode,
} from './markdownExtensionNode';

const extensionPlugin = Symbol('RichTextMarkdownExtension.plugin');

/**
 * One Markdown plugin adopted by RichText. Opaque: create it with
 * `createRichTextExtension`, and pass it to the surfaces and serializers that
 * should recognize the plugin's syntax.
 */
export interface RichTextMarkdownExtension {
  /** The adopted plugin's name. */
  readonly name: string;
  readonly [extensionPlugin]: MarkdownPluginEntry;
}

/** Why RichText refused a plugin or a configuration (spec:AST-064 FR4, FR6). */
export class RichTextExtensionError extends Error {
  /** The plugin RichText refused, or that a configuration claims twice. */
  readonly plugin: string;
  /** What RichText cannot honor: `transform`, or what was claimed twice. */
  readonly capability: string;
  /** The transformer or second extension that claims the same thing. */
  readonly claimant: string | null;

  constructor(plugin: string, capability: string, claimant: string | null) {
    super(
      claimant == null
        ? `RichText cannot adopt Markdown plugin "${plugin}": RichText does not run its ${capability}.`
        : `RichText cannot use Markdown plugin "${plugin}" with ${claimant}: both claim its ${capability}.`,
    );
    this.name = 'RichTextExtensionError';
    this.plugin = plugin;
    this.capability = capability;
    this.claimant = claimant;
  }
}

/**
 * Adopts a Markdown plugin for RichText (spec:AST-064 FR1, FR4). RichText
 * recognizes the plugin's syntax with core's parser and keeps each node's
 * source; it never runs the plugin's immutable transform, so a plugin that
 * declares one is refused with a `RichTextExtensionError` here, before any
 * surface uses it.
 *
 * @example
 * ```
 * const mentions = createRichTextExtension(mentionsPlugin);
 * markdownToEditorStateJSON(markdown, {extensions: [mentions]});
 * ```
 */
export function createRichTextExtension(
  plugin: MarkdownPluginEntry,
): RichTextMarkdownExtension {
  const capabilities = getMarkdownPluginCapabilities(plugin);
  if (capabilities.transform) {
    throw new RichTextExtensionError(plugin.name, 'transform', null);
  }
  return Object.freeze({name: plugin.name, [extensionPlugin]: plugin});
}

/**
 * The plugins behind `extensions`, after checking that the configuration is
 * one RichText can honor (spec:AST-064 FR6): no plugin adopted twice, and no
 * transformer that imports or exports plugin nodes.
 */
export function pluginsOf(
  extensions: ReadonlyArray<RichTextMarkdownExtension>,
  transformers: ReadonlyArray<Transformer>,
): ReadonlyArray<MarkdownPluginEntry> {
  const seen = new Set<string>();
  for (const extension of extensions) {
    if (seen.has(extension.name)) {
      throw new RichTextExtensionError(
        extension.name,
        'syntax',
        `a second extension for "${extension.name}"`,
      );
    }
    seen.add(extension.name);
  }
  const [first] = extensions;
  if (first != null) {
    transformers.forEach((transformer, index) => {
      if (
        'dependencies' in transformer &&
        transformer.dependencies.includes(RichTextExtensionNode)
      ) {
        throw new RichTextExtensionError(
          first.name,
          'nodes',
          `transformer ${index} (${transformer.type})`,
        );
      }
    });
  }
  return extensions.map(extension => extension[extensionPlugin]);
}

// ---------------------------------------------------------------------------
// Shielding plugin source from Lexical's import
// ---------------------------------------------------------------------------

/** A plugin node core recognized, and the stand-in that holds its place. */
export interface ShieldedNode {
  readonly node: MarkdownExtensionNode;
  readonly apiVersion: number;
}

export interface ShieldedMarkdown {
  /** The Markdown with a stand-in in place of each recognized node. */
  readonly markdown: string;
  /** What each stand-in holds the place of. */
  readonly standIns: ReadonlyMap<string, ShieldedNode>;
}

const PRIVATE_USE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0xe000, 0xf8ff],
  [0xf0000, 0xffffd],
  [0x100000, 0x10fffd],
];

/** Private-use characters that do not occur in `text`, in order. */
export function* absentCharacters(text: string): Generator<string> {
  const present = new Set(text);
  for (const [first, last] of PRIVATE_USE_RANGES) {
    for (let codePoint = first; codePoint <= last; codePoint++) {
      const character = String.fromCodePoint(codePoint);
      if (!present.has(character)) {
        yield character;
      }
    }
  }
}

/**
 * The extension nodes core recognizes in `markdown`, in document order: inline
 * nodes anywhere, and block nodes at the top level only (block syntax nested
 * in a list item, quote, or table cell stays text in RichText).
 */
function recognizedNodes(
  markdown: string,
  plugins: ReadonlyArray<MarkdownPluginEntry>,
): {
  readonly adoptable: Array<MarkdownExtensionNode>;
  readonly total: number;
} {
  const adoptable: Array<MarkdownExtensionNode> = [];
  let total = 0;
  const visit = (node: unknown, isTopLevel: boolean) => {
    if (node == null || typeof node !== 'object') {
      return;
    }
    const candidate = node as {
      readonly type?: unknown;
      readonly children?: unknown;
    };
    if (candidate.type === 'extension') {
      total++;
      const extension = node as MarkdownExtensionNode;
      if (
        typeof extension.source === 'string' &&
        (extension.display === 'inline' || isTopLevel)
      ) {
        adoptable.push(extension);
      }
      return;
    }
    if (Array.isArray(candidate.children)) {
      for (const child of candidate.children) {
        visit(child, false);
      }
    }
  };
  const root = parseMarkdownAst(markdown, {plugins: [...plugins]});
  for (const block of root.children) {
    visit(block, true);
  }
  return {adoptable, total};
}

/**
 * Replaces the source of every plugin node core recognizes in `markdown` with
 * a stand-in, so Lexical's transformers never read plugin source as base
 * Markdown (spec:AST-064 FR5). A node whose source core does not recognize at
 * any one occurrence — a span split across a container's line markers — stays
 * text.
 */
export function shieldExtensionSources(
  markdown: string,
  plugins: ReadonlyArray<MarkdownPluginEntry>,
): ShieldedMarkdown {
  const standIns = new Map<string, ShieldedNode>();
  if (plugins.length === 0) {
    return {markdown, standIns};
  }
  const {adoptable, total} = recognizedNodes(markdown, plugins);
  if (adoptable.length === 0) {
    return {markdown, standIns};
  }
  const versions = new Map(
    plugins.map(plugin => [plugin.name, plugin.apiVersion]),
  );
  const tokens = absentCharacters(markdown);
  // How many recognized nodes with each source are still to be placed.
  const remaining = new Map<string, number>();
  for (const node of adoptable) {
    const source = node.source ?? '';
    remaining.set(source, (remaining.get(source) ?? 0) + 1);
  }
  let text = markdown;
  let shielded = 0;
  let searchFrom = 0;
  for (const node of adoptable) {
    const source = node.source ?? '';
    const token = tokens.next().value;
    if (token == null || source === '') {
      break;
    }
    const first = text.indexOf(source, searchFrom);
    // When every remaining occurrence of the source is a node core
    // recognized, the first occurrence is this node: no need to ask core.
    const isEveryOccurrence =
      occurrences(text, source, searchFrom) === (remaining.get(source) ?? 0);
    remaining.set(source, (remaining.get(source) ?? 1) - 1);
    for (let at = first; at !== -1; at = text.indexOf(source, at + 1)) {
      const candidate =
        text.slice(0, at) + token + text.slice(at + source.length);
      // The right occurrence is the one whose replacement removes exactly
      // this node from core's parse and leaves every other node in place.
      if (
        isEveryOccurrence ||
        recognizedNodes(candidate, plugins).total === total - shielded - 1
      ) {
        text = candidate;
        shielded++;
        searchFrom = at + token.length;
        standIns.set(token, {
          node,
          apiVersion: versions.get(node.plugin) ?? 1,
        });
        break;
      }
    }
  }
  return {markdown: text, standIns};
}

/** How many times `source` occurs in `text` from `from`, overlaps included. */
function occurrences(text: string, source: string, from: number): number {
  let count = 0;
  for (
    let at = text.indexOf(source, from);
    at !== -1;
    at = text.indexOf(source, at + 1)
  ) {
    count++;
  }
  return count;
}

function $nodeFor(
  {node, apiVersion}: ShieldedNode,
  format = 0,
): RichTextExtensionNode {
  return $createRichTextExtensionNode(
    {
      plugin: node.plugin,
      apiVersion,
      name: node.name,
      display: node.display,
      data: node.data,
      source: node.source ?? '',
    },
    format,
  );
}

/**
 * Puts a RichTextExtensionNode in place of every stand-in Lexical imported
 * into `holder`: inline nodes where their stand-in is, and a block node in
 * place of the paragraph that holds only its stand-in.
 */
export function $restoreExtensionSources(
  holder: ElementNode,
  standIns: ReadonlyMap<string, ShieldedNode>,
): void {
  if (standIns.size === 0) {
    return;
  }
  for (const textNode of holder.getAllTextNodes()) {
    $restoreInText(textNode, holder, standIns);
  }
}

function $restoreInText(
  textNode: TextNode,
  holder: ElementNode,
  standIns: ReadonlyMap<string, ShieldedNode>,
): void {
  const text = textNode.getTextContent();
  const offsets = new Set<number>();
  let offset = 0;
  for (const character of text) {
    if (standIns.has(character)) {
      offsets.add(offset);
      offsets.add(offset + character.length);
    }
    offset += character.length;
  }
  offsets.delete(0);
  offsets.delete(text.length);
  if (offsets.size === 0 && !standIns.has(text)) {
    return;
  }
  const pieces =
    offsets.size === 0
      ? [textNode]
      : textNode.splitText(...[...offsets].sort((a, b) => a - b));
  for (const piece of pieces) {
    const shielded = standIns.get(piece.getTextContent());
    if (shielded == null) {
      continue;
    }
    if (shielded.node.display === 'inline') {
      // The node keeps the text formats its stand-in had: a node inside
      // emphasis, strong, or strikethrough stays inside it.
      piece.replace($nodeFor(shielded, piece.getFormat()));
      continue;
    }
    const paragraph = piece.getParent();
    if (
      $isParagraphNode(paragraph) &&
      paragraph.getParent()?.is(holder) === true
    ) {
      $placeBlockNode(paragraph, piece, $nodeFor(shielded));
    } else {
      // A block stand-in that did not land in a top-level paragraph keeps
      // the node's source as text.
      piece.replace($createTextNode(shielded.node.source ?? ''));
    }
  }
}

/**
 * Puts a block node where its stand-in sits in `paragraph`, splitting the
 * paragraph around it: lines before the stand-in stay a paragraph, the node
 * follows as its own top-level block, and lines after it become a new
 * paragraph — as core reads a block that starts on the line after a paragraph
 * line.
 */
function $placeBlockNode(
  paragraph: ParagraphNode,
  standIn: TextNode,
  block: RichTextExtensionNode,
): void {
  const after = standIn.getNextSiblings();
  const before = standIn.getPreviousSiblings();
  // The line breaks around the stand-in end and start the neighbouring lines.
  if ($isLineBreakNode(before[before.length - 1])) {
    before[before.length - 1]?.remove();
  }
  if ($isLineBreakNode(after[0])) {
    after[0]?.remove();
    after.shift();
  }
  standIn.remove();
  if (after.length > 0) {
    const rest = $createParagraphNode();
    rest.append(...after);
    paragraph.insertAfter(rest);
  }
  paragraph.insertAfter(block);
  if (paragraph.getChildrenSize() === 0) {
    paragraph.remove();
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const NEVER = /(?!)/;

/**
 * Exports every plugin node as its exact source (spec:AST-064 FR10). Always
 * part of RichText's export, whatever transformers the caller passes, so no
 * transformer set can drop a plugin node's source.
 */
export const EXTENSION_EXPORT_TRANSFORMERS: ReadonlyArray<Transformer> = [
  {
    dependencies: [RichTextExtensionNode],
    export: (node: LexicalNode) =>
      $isRichTextExtensionNode(node) && !node.isInline()
        ? node.getSource()
        : null,
    regExp: NEVER,
    replace: () => false,
    type: 'element',
  },
  {
    dependencies: [RichTextExtensionNode],
    export: (node: LexicalNode) =>
      $isRichTextExtensionNode(node) && node.isInline()
        ? node.getSource()
        : null,
    importRegExp: NEVER,
    regExp: NEVER,
    replace: () => {},
    type: 'text-match',
  },
];

/**
 * A text view of an inline plugin node for Lexical's exporter: it reads as
 * text holding `placeholder`, with the node's formats, so emphasis, strong, or
 * strikethrough around the node wraps it instead of closing before it. The
 * caller writes the node's source in place of the placeholder.
 */
export function extensionTextView(
  node: RichTextExtensionNode,
  placeholder: string,
): TextNode {
  const view = Object.create(TextNode.prototype) as TextNode;
  // Reads of the view's format go to the node itself through its key.
  Object.assign(view, {__key: node.getKey()});
  view.getTextContent = () => placeholder;
  view.getParent = <T extends ElementNode>() => node.getParent<T>();
  return view;
}

const withExport = new WeakMap<
  ReadonlyArray<Transformer>,
  Array<Transformer>
>();

/**
 * `transformers` with the plugin node export first, the same array for the
 * same transformers so callers that cache by transformer list keep hitting.
 */
export function withExtensionExport(
  transformers: ReadonlyArray<Transformer>,
): Array<Transformer> {
  let combined = withExport.get(transformers);
  if (combined == null) {
    combined = [...EXTENSION_EXPORT_TRANSFORMERS, ...transformers];
    withExport.set(transformers, combined);
  }
  return combined;
}
