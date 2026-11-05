// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownSource.ts
 * @input Uses lexical (node state, root, node classes), @lexical/markdown
 *   ($convertFromMarkdownString / $convertToMarkdownString), @lexical/code,
 *   and the plugin node shielding and export in markdownExtensions.ts.
 * @output Exports importMarkdownKeepingSource and $exportMarkdownKeepingSource,
 *   the source-preserving Markdown import and export behind
 *   markdownToEditorStateJSON, editorStateJSONToMarkdown, and getMarkdown().
 * @position Internal to @astryxdesign/richtext. Implements spec:AST-062: an
 *   untouched top-level block exports exactly as authored, and an edit
 *   regenerates only the blocks it changed.
 *
 * Import splits the source into chunks (runs of non-blank lines; a fenced code
 * block is one chunk even across blank lines) and imports each chunk on its
 * own. Once node transforms settle the tree, the top-level nodes from one or
 * more consecutive chunks form a group, and the group's first node records the
 * exact bytes it came from and its canonical Markdown at import. Facts about
 * the whole document — its byte order mark, the bytes before the first block
 * and after the last, its line ending — live on the root, so moving, copying,
 * or deleting blocks never moves or duplicates them.
 *
 * Export reads the tree without changing it. Each group's canonical Markdown
 * is regenerated (and cached per node, so an unchanged tree costs a lookup per
 * group); when it still matches the recorded one, the recorded bytes are
 * written instead.
 */

import {$convertFromMarkdownString, type Transformer} from '@lexical/markdown';
import {$isCodeNode} from '@lexical/code';
import {$isListItemNode, $isListNode} from '@lexical/list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getState,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  $setState,
  createState,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import {isMarkedHardLineBreak} from './markdownHardLineBreak';
import {normalizeListIndentation} from './markdownListIndentation';
import {
  $restoreCharacterReferences,
  $restoreCodeSpans,
  protectBackslashEscapes,
  protectCharacterReferences,
  protectCodeSpans,
  protectLinkDestinationParentheses,
  protectRefusedLinks,
  $unwrapRefusedLinks,
} from './markdownCharacterReferences';
import {
  $restoreExtensionSources,
  absentCharacters,
  extensionTextView,
  shieldExtensionSources,
  withExtensionExport,
} from './markdownExtensions';
import {$isRichTextExtensionNode} from './markdownExtensionNode';
import {$convertToMarkdownKeepingTimeLinear} from './markdownSpaceRuns';
import type {MarkdownPluginEntry} from '@astryxdesign/core/Markdown/plugins';

/** The whitespace and content one chunk of Markdown source was split into. */
export interface MarkdownChunk {
  /** Blank lines before the chunk; only the first chunk has any. */
  readonly leading: string;
  /** The chunk's lines, without the line ending that ends the last one. */
  readonly content: string;
  /** Everything after the content up to the next chunk, or to the end. */
  readonly trailing: string;
}

/** What a group of top-level nodes was imported from. */
interface GroupRecord {
  /** The import and chunk this group came from; unique across documents. */
  readonly group: string;
  /** The rest is recorded on the group's first node only. */
  readonly size?: number;
  readonly content?: string;
  /** The bytes between this group and the next one. */
  readonly trailing?: string;
  /** A hash of the group's canonical Markdown at import. */
  readonly canonicalHash?: string;
  /** The line ending the group's source uses. */
  readonly lineEnding?: string;
  /**
   * The group right after this one in the source, recorded only when no
   * blank line separates them (a thematic break written under a block).
   */
  readonly next?: string;
}

/**
 * The serialized form of a group record: short keys, and defaults left out,
 * because every imported group carries one.
 */
interface SerializedGroupRecord {
  g: string;
  n?: number;
  s?: string;
  t?: string;
  h?: string;
  e?: string;
  x?: string;
}

/** Facts about the whole imported document, kept on the root. */
interface DocumentRecord {
  readonly importId: string;
  readonly byteOrderMark: boolean;
  /** The bytes before the first block, without the byte order mark. */
  readonly leading: string;
  /** The bytes after the last block. */
  readonly trailing: string;
  /** The document's first line ending, or LF when it has none. */
  readonly lineEnding: string;
}

function parseGroupRecord(value: unknown): GroupRecord | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const serialized = value as Partial<SerializedGroupRecord>;
  if (typeof serialized.g !== 'string') {
    return null;
  }
  if (typeof serialized.s !== 'string') {
    return {group: serialized.g};
  }
  return {
    group: serialized.g,
    size: typeof serialized.n === 'number' ? serialized.n : 1,
    content: serialized.s,
    trailing: typeof serialized.t === 'string' ? serialized.t : '\n\n',
    canonicalHash: typeof serialized.h === 'string' ? serialized.h : '',
    lineEnding: typeof serialized.e === 'string' ? serialized.e : '\n',
    ...(typeof serialized.x === 'string' ? {next: serialized.x} : {}),
  };
}

function unparseGroupRecord(
  record: GroupRecord | null,
): SerializedGroupRecord | null {
  if (record == null) {
    return null;
  }
  const serialized: SerializedGroupRecord = {g: record.group};
  if (record.content != null) {
    serialized.s = record.content;
    if (record.size !== 1) {
      serialized.n = record.size;
    }
    if (record.trailing !== '\n\n') {
      serialized.t = record.trailing;
    }
    serialized.h = record.canonicalHash;
    if (record.next != null) {
      serialized.x = record.next;
    }
    if (record.lineEnding !== '\n') {
      serialized.e = record.lineEnding;
    }
  }
  return serialized;
}

function isDocumentRecord(value: unknown): value is DocumentRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as {importId?: unknown}).importId === 'string'
  );
}

const groupState = createState('astryxMd', {
  parse: parseGroupRecord,
  unparse: unparseGroupRecord,
});

const documentState = createState('astryxMdDocument', {
  parse: (value: unknown): DocumentRecord | null =>
    isDocumentRecord(value) ? value : null,
});

const BLANK_LINE = /^[ \t]*\r?$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
// A thematic break line (CommonMark 0.31), and the dash-only lines that
// underline a paragraph line above them as a heading instead.
const THEMATIC_BREAK_LINE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*\r?$/;
const SETEXT_DASHES = /^ {0,3}-+[ \t]*\r?$/;
// Lines that start a block other than a paragraph.
const BLOCK_START =
  /^ {0,3}(?:[-*+][ \t]|\d{1,9}[.)][ \t]|>|#{1,6}(?:[ \t]|\r?$)|\|)/;

/**
 * Splits Markdown into chunks: runs of non-blank lines, with a fenced code
 * block kept whole across blank lines, and a thematic break always a chunk of
 * its own, so editing the block beside a rule never rewrites the rule
 * (spec:AST-062 FR2). A dash-only line under paragraph lines underlines them
 * instead, and stays with them. Joining every chunk's leading, content, and
 * trailing text gives back the input exactly.
 */
/**
 * The chunks of `markdown` that cover the same lines as `like`, the chunks of
 * text with the same line count. Rewriting indentation can move a line across
 * a chunk boundary rule — a thematic break indented into a list item becomes
 * a break of its own — so the chunks follow the authored text, not the rule.
 */
function sameLines(
  markdown: string,
  like: ReadonlyArray<MarkdownChunk>,
): Array<MarkdownChunk> {
  const lines = markdown.split('\n');
  const lineEndings = (text: string) => text.split('\n').length - 1;
  let line = 0;
  return like.map(chunk => {
    line += lineEndings(chunk.leading);
    const count = lineEndings(chunk.content) + 1;
    const content = lines.slice(line, line + count).join('\n');
    line += count - 1 + lineEndings(chunk.trailing);
    return {...chunk, content};
  });
}

export function splitMarkdownChunks(markdown: string): Array<MarkdownChunk> {
  const lines = markdown.split('\n');
  const chunks: Array<MarkdownChunk> = [];
  let leading = '';
  let index = 0;
  // Blank lines before the first chunk.
  while (index < lines.length && BLANK_LINE.test(lines[index])) {
    if (index === lines.length - 1) {
      // Whitespace with no content at all.
      return [];
    }
    leading += `${lines[index]}\n`;
    index++;
  }
  while (index < lines.length) {
    const start = index;
    let fence: string | null = null;
    // Whether every line so far is paragraph text.
    let isParagraph = true;
    while (index < lines.length) {
      const line = lines[index];
      if (fence != null) {
        index++;
        const close = new RegExp(
          `^ {0,3}${fence[0]}{${fence.length},}[ \\t]*\\r?$`,
        );
        if (close.test(line)) {
          fence = null;
        }
        continue;
      }
      if (BLANK_LINE.test(line)) {
        break;
      }
      const isRule =
        THEMATIC_BREAK_LINE.test(line) &&
        !(isParagraph && index > start && SETEXT_DASHES.test(line));
      if (isRule && index > start) {
        // The rule starts a chunk of its own.
        break;
      }
      const open = FENCE_OPEN.exec(line);
      if (open != null) {
        fence = open[1];
      }
      if (open != null || BLOCK_START.test(line)) {
        isParagraph = false;
      }
      index++;
      if (isRule) {
        // And ends it.
        break;
      }
    }
    let content = lines.slice(start, index).join('\n');
    let trailing = '';
    // A CRLF line ending belongs to the trailing text, not the content.
    if (content.endsWith('\r')) {
      content = content.slice(0, -1);
      trailing = '\r';
    }
    while (index < lines.length && BLANK_LINE.test(lines[index])) {
      trailing += `\n${lines[index]}`;
      index++;
    }
    if (index < lines.length) {
      // The line ending before the next chunk's first line.
      trailing += '\n';
    }
    chunks.push({
      leading: chunks.length === 0 ? leading : '',
      content,
      trailing,
    });
  }
  return chunks;
}

/** Lines without the carriage return before each line feed. */
function withoutCarriageReturns(text: string): string {
  return text.replace(/\r(?=\n|$)/g, '');
}

/** The first line ending in `text`, or `fallback` when it has none. */
function lineEndingOf(text: string, fallback: string): string {
  const index = text.indexOf('\n');
  if (index === -1) {
    return fallback;
  }
  return index > 0 && text[index - 1] === '\r' ? '\r\n' : '\n';
}

/** Rewrites every line ending in `text` as `lineEnding`. */
function withLineEnding(text: string, lineEnding: string): string {
  const lf = text.replace(/\r\n/g, '\n');
  return lineEnding === '\n' ? lf : lf.replace(/\n/g, lineEnding);
}

/**
 * A 64-bit hash of `text`, from two independent 32-bit FNV-1a passes. Only
 * equality matters: it tells an unchanged group from a changed one without
 * storing the canonical Markdown itself.
 */
function hashOf(text: string): string {
  let first = 0x811c9dc5;
  let second = 0x01000193 ^ text.length;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x5bd1e995) >>> 0;
  }
  return first.toString(36) + second.toString(36).padStart(7, '0');
}

let importCount = 0;

/** An id no other import in this or any other document shares. */
function nextImportId(): string {
  importCount++;
  return `${Math.random().toString(36).slice(2, 8)}${importCount.toString(36)}`;
}

/**
 * Imports Markdown into the editor's root and records its authored bytes. Runs
 * two discrete updates: the first imports every chunk and stamps its nodes
 * with the chunk's group id; the second runs after node transforms have
 * settled the tree (adjacent lists merge, for example), so each group covers
 * exactly the chunks that ended up in its nodes.
 */
export function importMarkdownKeepingSource(
  editor: LexicalEditor,
  markdown: string,
  transformers: Array<Transformer>,
  plugins: ReadonlyArray<MarkdownPluginEntry> = [],
): void {
  const importId = nextImportId();
  const byteOrderMark = markdown.startsWith('\uFEFF');
  const body = byteOrderMark ? markdown.slice(1) : markdown;
  const chunks = splitMarkdownChunks(body);
  // Lexical reads the same chunks with list nesting spelled its way; the
  // records keep the authored bytes. Only indentation changes, so each chunk
  // is the same lines of the rewritten text.
  const importChunks = sameLines(normalizeListIndentation(body), chunks);
  const lineEnding = lineEndingOf(body, '\n');
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      chunks.forEach((chunk, index) => {
        // The holder is attached while Lexical imports into it: Lexical only
        // continues a paragraph, list item, or quote onto the next line
        // inside an attached tree, and would otherwise start a new paragraph
        // at every line ending.
        const holder = $createParagraphNode();
        root.append(holder);
        // Lexical imports LF lines; the record keeps the authored endings.
        // Adopted plugins' nodes, links core refuses (as their source text),
        // then code spans, then backslash escapes and parentheses in
        // link destinations, then character references go through as
        // stand-ins: plugin nodes come back as extension nodes holding their
        // source, escapes and parentheses as the literal characters,
        // references decoded.
        const shielded = shieldExtensionSources(
          withoutCarriageReturns(importChunks[index]?.content ?? chunk.content),
          plugins,
        );
        // Links core refuses go first, on the source as written, so one whose
        // text holds code (`[`x`](javascript:y)`) shows whole as core shows
        // it; code spans next, so a safe link's code still reads as code.
        const refused = protectRefusedLinks(shielded.markdown);
        const code = protectCodeSpans(refused.markdown);
        const escaped = protectBackslashEscapes(code.markdown);
        const destinations = protectLinkDestinationParentheses(
          escaped.markdown,
        );
        const referenced = protectCharacterReferences(destinations.markdown);
        $convertFromMarkdownString(referenced.markdown, transformers, holder);
        $restoreCharacterReferences(
          holder,
          new Map([
            ...refused.standIns,
            ...code.standIns,
            ...escaped.standIns,
            ...destinations.standIns,
            ...referenced.standIns,
          ]),
        );
        $restoreCodeSpans(holder, code.spans);
        $unwrapRefusedLinks(holder);
        $restoreExtensionSources(holder, shielded.standIns);
        $joinSoftLineBreaks(holder);
        for (const node of holder.getChildren()) {
          $setState(node, groupState, {group: `${importId}:${index}`});
        }
        for (const node of holder.getChildren()) {
          holder.insertBefore(node);
        }
        holder.remove();
      });
      $nestFollowingLists(root);
      if (root.getChildrenSize() === 0) {
        // Nothing to import: keep one empty paragraph, as Lexical does.
        root.append($createParagraphNode());
      }
    },
    {discrete: true},
  );
  editor.update(
    () => {
      $recordGroups(chunks, importId, transformers);
      const root = $getRoot();
      const hasGroups = root
        .getChildren()
        .some(node => $getState(node, groupState)?.content != null);
      $setState(root, documentState, {
        importId,
        byteOrderMark,
        leading: hasGroups ? (chunks[0]?.leading ?? '') : '',
        trailing: hasGroups
          ? (chunks[chunks.length - 1]?.trailing ?? '')
          : body,
        lineEnding,
      });
    },
    {discrete: true},
  );
}

/**
 * Joins the lines of a paragraph, list item, or block quote across soft line
 * breaks: a line ending without two trailing spaces or a backslash continues
 * the block, as one space (CommonMark, soft line breaks; spec:AST-061 FR5).
 * Lexical imports every line ending as a line break and marks the hard ones,
 * so the unmarked ones outside code are the soft breaks.
 */
export function $joinSoftLineBreaks(element: ElementNode): void {
  for (const child of element.getChildren()) {
    if ($isElementNode(child) && !$isCodeNode(child)) {
      $joinSoftLineBreaks(child);
    }
  }
  for (const child of element.getChildren()) {
    if (!$isLineBreakNode(child) || isMarkedHardLineBreak(child)) {
      continue;
    }
    // The spaces around a soft break are part of it.
    const previous = child.getPreviousSibling();
    if ($isTextNode(previous) && !previous.hasFormat('code')) {
      // Counted from the end: a pattern such as /[ \t]+$/ retries from every
      // space in a long run that does not end the text, so its time grows
      // with the square of the run.
      const text = previous.getTextContent();
      let end = text.length;
      while (end > 0 && (text[end - 1] === ' ' || text[end - 1] === '\t')) {
        end--;
      }
      previous.setTextContent(text.slice(0, end));
    }
    const next = child.getNextSibling();
    if ($isTextNode(next) && !next.hasFormat('code')) {
      next.setTextContent(next.getTextContent().replace(/^[ \t]+/, ''));
    }
    child.replace($createTextNode(' '));
  }
}

/**
 * Moves a list that begins nested right after another list into that list's
 * last item. Lexical starts a new top-level list for an item of a different
 * type (a bullet under `1. item`) and nests it there, while CommonMark nests
 * it inside the item above; without this, writing it back would lose the
 * nesting (spec:AST-061 FR5, spec:AST-062 FR3).
 */
export function $nestFollowingLists(root: ElementNode): void {
  for (const node of root.getChildren()) {
    const previous = node.getPreviousSibling();
    if (!$isListNode(node) || !$isListNode(previous)) {
      continue;
    }
    // Lexical keeps a nested list in an item of its own after its parent.
    let first = node.getFirstChild();
    while (
      $isListItemNode(first) &&
      first.getChildrenSize() === 1 &&
      $isListNode(first.getFirstChild())
    ) {
      previous.append(first);
      first = node.getFirstChild();
    }
    if (node.getChildrenSize() === 0) {
      node.remove();
    }
  }
}

/**
 * Turns the first pass's chunk stamps into groups. Consecutive nodes stamped
 * with one chunk form a group, and the group also covers every later chunk up
 * to the next group's: those chunks merged into its nodes or imported to
 * nothing. Chunks before the first group become part of it.
 */
function $recordGroups(
  chunks: ReadonlyArray<MarkdownChunk>,
  importId: string,
  transformers: Array<Transformer>,
): void {
  const children = $getRoot().getChildren();
  const chunkOf = (node: LexicalNode): number | null => {
    const group = $getState(node, groupState)?.group;
    if (group == null || !group.startsWith(`${importId}:`)) {
      return null;
    }
    return Number(group.slice(importId.length + 1));
  };
  let index = 0;
  let isFirstGroup = true;
  while (index < children.length) {
    const firstChunk = chunkOf(children[index]);
    if (firstChunk == null) {
      index++;
      continue;
    }
    const group: Array<LexicalNode> = [];
    while (index < children.length && chunkOf(children[index]) === firstChunk) {
      group.push(children[index]);
      index++;
    }
    const nextChunk =
      index === children.length
        ? chunks.length
        : (chunkOf(children[index]) ?? chunks.length);
    const startChunk = isFirstGroup ? 0 : firstChunk;
    isFirstGroup = false;
    const covered = chunks.slice(startChunk, nextChunk);
    const content = covered
      .map(
        (chunk, position) =>
          (position === 0 ? '' : chunk.leading) +
          (position === covered.length - 1
            ? chunk.content
            : chunk.content + chunk.trailing),
      )
      .join('');
    const isLastGroup = index === children.length;
    const trailing = isLastGroup
      ? ''
      : (covered[covered.length - 1]?.trailing ?? '');
    const record: GroupRecord = {
      group: `${importId}:${firstChunk}`,
      size: group.length,
      content,
      trailing,
      canonicalHash: $canonicalMarkdown(group, transformers).hash,
      lineEnding: lineEndingOf(
        content + (covered[covered.length - 1]?.trailing ?? ''),
        '\n',
      ),
      ...(!isLastGroup && !ENDS_WITH_BLANK_LINE.test(trailing)
        ? {next: `${importId}:${nextChunk}`}
        : {}),
    };
    group.forEach((node, position) => {
      $setState(
        node,
        groupState,
        position === 0 ? record : {group: record.group},
      );
    });
  }
}

/**
 * An element that lists `nodes` as its children without adopting them, so
 * Lexical's exporter can read a run of top-level nodes on its own. The
 * exporter only ever asks the root it is given for its children.
 */
function childrenOf(nodes: ReadonlyArray<LexicalNode>): ElementNode {
  return {getChildren: () => [...nodes]} as unknown as ElementNode;
}

/** Every node in the runs' subtrees, in document order. */
function descendantsOf(nodes: ReadonlyArray<LexicalNode>): Array<LexicalNode> {
  const out: Array<LexicalNode> = [];
  const visit = (node: LexicalNode) => {
    out.push(node);
    if ($isElementNode(node)) {
      node.getChildren().forEach(visit);
    }
  };
  nodes.forEach(visit);
  return out;
}

/**
 * Canonical Markdown per run of nodes, keyed by the run's first node. Lexical
 * keeps a node's object across editor states until that node itself changes,
 * so a run whose every descendant is the same object as last time is
 * unchanged and costs a walk instead of an export.
 */
const canonicalCache = new WeakMap<
  LexicalNode,
  {
    readonly descendants: ReadonlyArray<LexicalNode>;
    readonly transformers: ReadonlyArray<Transformer>;
    readonly markdown: string;
    readonly hash: string;
  }
>();

function $canonicalMarkdown(
  nodes: ReadonlyArray<LexicalNode>,
  transformers: Array<Transformer>,
): {readonly markdown: string; readonly hash: string} {
  const descendants = descendantsOf(nodes);
  const cached = canonicalCache.get(nodes[0]);
  if (
    cached != null &&
    cached.transformers === transformers &&
    cached.descendants.length === descendants.length &&
    cached.descendants.every((node, index) => node === descendants[index])
  ) {
    return cached;
  }
  // Inline plugin nodes read as text inside the marks around them, so a mark
  // put on or taken off a node alone changes the canonical form too.
  const {placeholders, sources} = extensionPlaceholders(
    descendants,
    descendants.map(node => node.getTextContent()).join(''),
  );
  let markdown = $convertToMarkdownKeepingTimeLinear(
    withExtensionExport(transformers),
    childrenOf(
      placeholders.size === 0
        ? nodes
        : nodes.map(node => markedView(node, null, placeholders)),
    ),
  );
  for (const [placeholder, source] of sources) {
    markdown = markdown.split(placeholder).join(source);
  }
  const entry = {descendants, transformers, markdown, hash: hashOf(markdown)};
  canonicalCache.set(nodes[0], entry);
  return entry;
}

/**
 * Line starts that would turn literal text into a block structure. Each match
 * is the spaces before the marker, where the escape goes: block markers may
 * follow up to three spaces (CommonMark 0.31), and a list item's continuation
 * line adds its own indentation, so any spaces count.
 */
const LINE_START_SYNTAX: ReadonlyArray<RegExp> = [
  // Block quote or ATX heading marker.
  /^ *(?=>|#{1,6}(?:[ \t]|$))/,
  // Bullet list item.
  /^ *(?=[-+](?:[ \t]|$))/,
  // Setext underline or thematic break made of `=` or `-`.
  /^ *(?=[=-][=\- \t]*$)/,
  // Table delimiter row.
  /^ *(?=[|:][|:\- \t]*-[|:\- \t]*$)/,
];
// An ordered list item escapes its delimiter, not its first character.
const ORDERED_LIST_START = /^( *\d{1,9})(?=[.)](?:[ \t]|$))/;

// Inline syntax Lexical's export leaves unescaped: link and image brackets and
// character references.
const INLINE_SYNTAX =
  /[[\]]|&(?=#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};|[A-Za-z][A-Za-z0-9]*;)/g;

const PRIVATE_USE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0xe000, 0xf8ff],
  [0xf0000, 0xffffd],
  [0x100000, 0x10fffd],
];

/**
 * A token that appears nowhere in `text`. There are 137,468 private-use code
 * points, so a text shorter than that always misses one of them; a longer
 * text cannot contain every one of the 137,468² ordered pairs.
 */
export function absentToken(text: string): string {
  const present = new Set(text);
  for (const [first, last] of PRIVATE_USE_RANGES) {
    for (let codePoint = first; codePoint <= last; codePoint++) {
      const candidate = String.fromCodePoint(codePoint);
      if (!present.has(candidate)) {
        return candidate;
      }
    }
  }
  for (const [first, last] of PRIVATE_USE_RANGES) {
    for (let a = first; a <= last; a++) {
      for (let b = first; b <= last; b++) {
        const candidate = String.fromCodePoint(a, b);
        if (!text.includes(candidate)) {
          return candidate;
        }
      }
    }
  }
  throw new Error('No escape token is absent from the text');
}

/**
 * A view of `node` whose text marks every character that needs a backslash
 * with `token` (none when `token` is null), and whose inline plugin nodes read
 * as text holding their placeholders. Views delegate everything else to the
 * node they wrap, so Lexical's exporter reads them like the real tree without
 * changing it.
 */
function markedView(
  node: LexicalNode,
  token: string | null,
  placeholders: ReadonlyMap<NodeKey, string>,
): LexicalNode {
  const placeholder = placeholders.get(node.getKey());
  if (placeholder != null && $isRichTextExtensionNode(node)) {
    return extensionTextView(node, placeholder);
  }
  if ($isTextNode(node)) {
    if (node.hasFormat('code') || $isCodeNode(node.getParent())) {
      return node;
    }
    if (token == null) {
      return Object.create(node) as typeof node;
    }
    let text = node
      .getTextContent()
      .replace(INLINE_SYNTAX, match => token + match);
    const previous = node.getPreviousSibling();
    if (previous == null || $isLineBreakNode(previous)) {
      const ordered = ORDERED_LIST_START.exec(text);
      const start = LINE_START_SYNTAX.map(pattern => pattern.exec(text)).find(
        match => match != null,
      );
      const before = ordered?.[1] ?? start?.[0];
      if (before != null) {
        text = before + token + text.slice(before.length);
      }
    }
    const view = Object.create(node) as typeof node;
    view.getTextContent = () => text;
    return view;
  }
  if ($isElementNode(node) && !$isCodeNode(node)) {
    // Read once: each read walks every child, so reading per child would
    // cost the square of their number — a run of tabs is one node per tab.
    const original = node.getChildren();
    const children = original.map(child =>
      markedView(child, token, placeholders),
    );
    // Each view's siblings are the views beside it, so a text view sees a
    // plugin node's text view as text with formats, not as a gap.
    children.forEach((child, index) => {
      if (child !== original[index]) {
        child.getPreviousSibling = <T extends LexicalNode>() =>
          (children[index - 1] ?? null) as T | null;
        child.getNextSibling = <T extends LexicalNode>() =>
          (children[index + 1] ?? null) as T | null;
      }
    });
    const view = Object.create(node) as typeof node;
    view.getChildren = <T extends LexicalNode>() => children as Array<T>;
    return view;
  }
  return node;
}

/**
 * A placeholder for each inline plugin node among `nodes`, absent from
 * `text`, and the source each placeholder stands for.
 */
function extensionPlaceholders(
  nodes: ReadonlyArray<LexicalNode>,
  text: string,
): {
  readonly placeholders: ReadonlyMap<NodeKey, string>;
  readonly sources: ReadonlyMap<string, string>;
} {
  const placeholders = new Map<NodeKey, string>();
  const sources = new Map<string, string>();
  const free = absentCharacters(text);
  for (const node of nodes) {
    if ($isRichTextExtensionNode(node) && node.isInline()) {
      const placeholder = free.next().value;
      if (placeholder == null) {
        break;
      }
      placeholders.set(node.getKey(), placeholder);
      sources.set(placeholder, node.getSource());
    }
  }
  return {placeholders, sources};
}

/**
 * The canonical Markdown of a changed group, with literal text escaped so it
 * imports again as the structure the editor showed (spec:AST-062 FR3).
 */
function $regeneratedMarkdown(
  nodes: ReadonlyArray<LexicalNode>,
  canonical: string,
  transformers: Array<Transformer>,
): string {
  // The token is absent from the plain export and from every text the views
  // mark, so each token in the marked export is one of the marks.
  const text = canonical + nodes.map(node => node.getTextContent()).join('');
  const token = absentToken(text);
  // Inline plugin nodes export as placeholders inside the text around them,
  // so the marks around a node wrap it; each placeholder becomes the node's
  // exact source afterwards.
  const {placeholders, sources} = extensionPlaceholders(
    descendantsOf(nodes),
    text + token,
  );
  let marked = $convertToMarkdownKeepingTimeLinear(
    withExtensionExport(transformers),
    childrenOf(nodes.map(node => markedView(node, token, placeholders))),
  )
    .split(token)
    .join('\\');
  for (const [placeholder, source] of sources) {
    marked = marked.split(placeholder).join(source);
  }
  return marked;
}

interface ExportPiece {
  readonly text: string;
  /** Recorded bytes after the piece, when they belong to this document. */
  readonly trailing: string | null;
  /** Whether the piece is the group's recorded source, unchanged. */
  readonly isAsWritten: boolean;
  /** The piece's group, and the group that followed it in the source. */
  readonly group: string | null;
  readonly next: string | null;
}

const ENDS_WITH_BLANK_LINE = /\n[ \t]*\r?\n[ \t\r]*$/;

/**
 * Exports the root per spec:AST-062: unchanged groups as authored, changed and
 * new blocks in canonical form, all in the document's envelope. Reads the tree
 * without changing it, so it runs in a read of the live editor state.
 */
/** Whether `text` is one thematic break line, as written. */
function isRuleLine(text: string): boolean {
  return !text.includes('\n') && THEMATIC_BREAK_LINE.test(text);
}

/**
 * Whether the bytes recorded after `piece` still separate it from `next`.
 * Bytes ending in a blank line separate any two blocks. A single line break
 * only follows or precedes a thematic break (a rule is a chunk of its own),
 * and it belongs to the block it follows:
 *
 * - after a rule as written, it stays whatever comes next, because no line
 *   after a rule can join it;
 * - between the same two blocks, both as written, it stays;
 * - after a changed block, it stays only above the same rule as written when
 *   that rule cannot underline the block as a heading (`***`, `___`, or
 *   spaced dashes, not `---`).
 *
 * Everywhere else — next to a moved, inserted, deleted, or changed block — a
 * blank line separates the two, so no block can join its neighbor.
 */
function keepsRecordedTrailing(piece: ExportPiece, next: ExportPiece): boolean {
  // The last block's recorded trailing is empty: it separates nothing.
  if (piece.trailing == null || !piece.trailing.includes('\n')) {
    return false;
  }
  if (ENDS_WITH_BLANK_LINE.test(piece.trailing)) {
    return true;
  }
  if (piece.isAsWritten && isRuleLine(piece.text)) {
    return true;
  }
  if (piece.next == null || piece.next !== next.group || !next.isAsWritten) {
    return false;
  }
  return (
    piece.isAsWritten ||
    (isRuleLine(next.text) && !SETEXT_DASHES.test(next.text))
  );
}

export function $exportMarkdownKeepingSource(
  transformers: ReadonlyArray<Transformer>,
): string {
  const transformerList = transformers as Array<Transformer>;
  const root = $getRoot();
  const document = $getState(root, documentState);
  const lineEnding = document?.lineEnding ?? '\n';
  const children = root.getChildren();
  const pieces: Array<ExportPiece> = [];
  let index = 0;
  while (index < children.length) {
    const first = children[index];
    const record = $getState(first, groupState);
    const group: Array<LexicalNode> = [first];
    index++;
    if (record?.content != null) {
      while (
        index < children.length &&
        $getState(children[index], groupState)?.group === record.group &&
        $getState(children[index], groupState)?.content == null
      ) {
        group.push(children[index]);
        index++;
      }
    }
    const canonical = $canonicalMarkdown(group, transformerList);
    // A group imported into another document keeps its content but takes this
    // document's line ending and separators.
    const isOwn =
      document != null &&
      record?.group.startsWith(`${document.importId}:`) === true;
    if (
      record?.content != null &&
      group.length === record.size &&
      canonical.hash === record.canonicalHash
    ) {
      pieces.push({
        text: isOwn
          ? record.content
          : withLineEnding(record.content, lineEnding),
        trailing: isOwn ? (record.trailing ?? null) : null,
        isAsWritten: isOwn,
        group: record.group,
        next: record.next ?? null,
      });
      continue;
    }
    const regenerated = $regeneratedMarkdown(
      group,
      canonical.markdown,
      transformerList,
    );
    pieces.push({
      text: withLineEnding(
        regenerated,
        isOwn && record?.lineEnding != null ? record.lineEnding : lineEnding,
      ),
      trailing: isOwn ? (record?.trailing ?? null) : null,
      isAsWritten: false,
      group: record?.group ?? null,
      next: isOwn ? (record?.next ?? null) : null,
    });
  }
  const separator = lineEnding + lineEnding;
  let output =
    (document?.byteOrderMark === true ? '\uFEFF' : '') +
    (document?.leading ?? '');
  pieces.forEach((piece, position) => {
    output += piece.text;
    if (position < pieces.length - 1) {
      output += keepsRecordedTrailing(piece, pieces[position + 1])
        ? (piece.trailing ?? '')
        : separator;
    }
  });
  return output + (document?.trailing ?? '');
}
