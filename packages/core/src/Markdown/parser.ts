// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file parser.ts
 * @input Markdown string, released parse options, and optional ordered plugins
 * @output Canonical MDAST-aligned nodes for public/server consumers plus unchanged
 *   released parser-node projections; shared heading slug helpers
 * @position Core parser and compatibility boundary; consumed by public parser entry,
 *   Markdown, and Outline
 */

import {
  getMarkdownAstLegacyCodeLanguage,
  markdownAstText,
  markMarkdownAstLegacyCodeLanguage,
} from './ast';
import type {
  MarkdownAstBlockContent,
  MarkdownAstList,
  MarkdownAstListItem,
  MarkdownAstPhrasingContent,
  MarkdownAstPosition,
  MarkdownAstRoot,
  MarkdownAstTableCell,
  MarkdownAstTableRow,
} from './ast';
import {
  applyMarkdownTransforms,
  freezeMarkdownPluginData,
  isMarkdownPluginData,
  prepareMarkdownPlugins,
  reportMarkdownPluginFailure,
} from './plugins/protocol';
import type {
  MarkdownExtensionNode,
  MarkdownExtensionsOf,
  MarkdownPluginData,
  MarkdownPluginEntry,
  PreparedMarkdownPlugins,
  PreparedSyntaxContribution,
} from './plugins/protocol';
import {
  decodeLiteralText,
  isAsciiPunctuation,
  matchCharacterReference,
} from './characterReferences';

// The decoder Markdown renders with, public from the parser subpath
// (spec:AST-061 DEC-5).
export {decodeMarkdownCharacterReferences} from './characterReferences';
import {isSafeMarkdownParserUrl} from './url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Nodes returned by default and legacy parser calls. */
export type InlineNode<Extension extends MarkdownExtensionNode = never> =
  | {type: 'text'; content: string}
  | {type: 'bold'; children: InlineNode<Extension>[]}
  | {type: 'italic'; children: InlineNode<Extension>[]}
  | {type: 'strikethrough'; children: InlineNode<Extension>[]}
  | {type: 'code'; content: string}
  | {type: 'link'; href: string; children: InlineNode<Extension>[]}
  | {type: 'image'; src: string; alt: string}
  | {type: 'citation'; sourceId: string}
  | {type: 'break'}
  | Extract<Extension, {display: 'inline'}>;

/** The additional inline node returned only when parsing with `math: true`. */
export type MathInlineNode = {type: 'math'; value: string};

/** Nodes returned by an explicitly math-enabled inline parse. */
export type InlineNodeWithMath<
  Extension extends MarkdownExtensionNode = never,
> =
  | {type: 'text'; content: string}
  | {type: 'bold'; children: InlineNodeWithMath<Extension>[]}
  | {type: 'italic'; children: InlineNodeWithMath<Extension>[]}
  | {type: 'strikethrough'; children: InlineNodeWithMath<Extension>[]}
  | {type: 'code'; content: string}
  | MathInlineNode
  | {type: 'link'; href: string; children: InlineNodeWithMath<Extension>[]}
  | {type: 'image'; src: string; alt: string}
  | {type: 'citation'; sourceId: string}
  | {type: 'break'}
  | Extract<Extension, {display: 'inline'}>;

type BlockMetadata = {
  /**
   * Where this block came from in the source, when parsed with the
   * `sourceRanges` option. Top-level blocks only.
   */
  range?: SourceRange;
};

type LegacyBlockNodeKind<Extension extends MarkdownExtensionNode = never> =
  | {
      type: 'heading';
      level: 1 | 2 | 3 | 4 | 5 | 6;
      children: InlineNode<Extension>[];
    }
  | {type: 'paragraph'; children: InlineNode<Extension>[]}
  | {type: 'codeblock'; language: string; content: string}
  | {type: 'blockquote'; children: BlockNode<Extension>[]}
  | {
      type: 'list';
      ordered: boolean;
      start?: number;
      /** Ordered-list marker delimiter ('.' or ')'). Undefined for bullets. */
      delimiter?: '.' | ')';
      loose?: boolean;
      items: ListItemNode<Extension>[];
    }
  | {
      type: 'table';
      headers: TableCellNode<Extension>[];
      alignments: TableAlignment[];
      rows: TableCellNode<Extension>[][];
    }
  | {type: 'hr'}
  | {type: 'image'; src: string; alt: string}
  | Extract<Extension, {display: 'block'}>;

/** Blocks returned by default and legacy parser calls. */
export type BlockNode<Extension extends MarkdownExtensionNode = never> =
  LegacyBlockNodeKind<Extension> & BlockMetadata;

/** The additional block returned only when parsing with `math: true`. */
export type MathBlockNode = {type: 'math'; value: string} & BlockMetadata;

type MathEnabledBlockNodeKind<Extension extends MarkdownExtensionNode = never> =
  | {
      type: 'heading';
      level: 1 | 2 | 3 | 4 | 5 | 6;
      children: InlineNodeWithMath<Extension>[];
    }
  | {type: 'paragraph'; children: InlineNodeWithMath<Extension>[]}
  | {type: 'codeblock'; language: string; content: string}
  | MathBlockNode
  | {type: 'blockquote'; children: BlockNodeWithMath<Extension>[]}
  | {
      type: 'list';
      ordered: boolean;
      start?: number;
      /** Ordered-list marker delimiter ('.' or ')'). Undefined for bullets. */
      delimiter?: '.' | ')';
      loose?: boolean;
      items: ListItemNodeWithMath<Extension>[];
    }
  | {
      type: 'table';
      headers: TableCellNodeWithMath<Extension>[];
      alignments: TableAlignment[];
      rows: TableCellNodeWithMath<Extension>[][];
    }
  | {type: 'hr'}
  | {type: 'image'; src: string; alt: string}
  | Extract<Extension, {display: 'block'}>;

/** Blocks returned by an explicitly math-enabled block parse. */
export type BlockNodeWithMath<Extension extends MarkdownExtensionNode = never> =
  MathEnabledBlockNodeKind<Extension> & BlockMetadata;

/**
 * Where a block sits in the source string handed to `parseMarkdown`:
 * `source.slice(start, end)` is the block, and `end` excludes the block's
 * trailing blank lines.
 *
 * An object rather than a `[start, end]` tuple so a second way of addressing
 * the same block — line numbers, once a consumer needs them — can be added as
 * optional fields without breaking anyone.
 */
export type SourceRange = {readonly start: number; readonly end: number};

export type ListItemNode<Extension extends MarkdownExtensionNode = never> = {
  checked?: boolean;
  children: BlockNode<Extension>[];
};
type ListItemNodeWithMath<Extension extends MarkdownExtensionNode = never> = {
  checked?: boolean;
  children: BlockNodeWithMath<Extension>[];
};
export type TableCellNode<Extension extends MarkdownExtensionNode = never> = {
  children: InlineNode<Extension>[];
};
type TableCellNodeWithMath<Extension extends MarkdownExtensionNode = never> = {
  children: InlineNodeWithMath<Extension>[];
};
export type TableAlignment = 'left' | 'center' | 'right' | null;

type RuntimeExtensionNode =
  | MarkdownExtensionNode<string, string, MarkdownPluginData, 'inline'>
  | MarkdownExtensionNode<string, string, MarkdownPluginData, 'block'>;
type RuntimeInlineNode = InlineNodeWithMath<RuntimeExtensionNode>;
type RuntimeBlockNode = BlockNodeWithMath<RuntimeExtensionNode>;

type LegacyProjectionCache = WeakMap<object, object>;

function projectRange(
  position: MarkdownAstPosition | undefined,
): BlockMetadata {
  const start = position?.start.offset;
  const end = position?.end.offset;
  return start == null || end == null ? {} : {range: {start, end}};
}

/**
 * Canonical nodes always carry Core-authored positions; the released block
 * shape exposes them as `range` only when the caller passed `sourceRanges`,
 * so this projection stays byte-for-byte what it has always returned.
 *
 * An extension node is the one kind the projection passes through instead of
 * rebuilding field by field, so it is the one kind that could carry a
 * canonical `position` out into released output. Strip it unless the caller
 * asked for provenance, in which case the node keeps exactly the `position`
 * it has always exposed.
 */
function projectExtensionNode<Node extends RuntimeExtensionNode>(
  node: Node,
  withRanges: boolean,
): Node {
  if (withRanges || node.position === undefined) {
    return node;
  }
  const {position: _canonicalPosition, ...released} = node;
  return released as Node;
}

function projectInlineNode(
  node: MarkdownAstPhrasingContent<RuntimeExtensionNode>,
  cache: LegacyProjectionCache,
  withRanges: boolean,
): RuntimeInlineNode {
  const cached = cache.get(node);
  if (cached != null) {
    return cached as RuntimeInlineNode;
  }
  let projected: RuntimeInlineNode;
  switch (node.type) {
    case 'text':
      projected = {type: 'text', content: node.value};
      break;
    case 'strong':
      projected = {
        type: 'bold',
        children: node.children.map(child =>
          projectInlineNode(child, cache, withRanges),
        ),
      };
      break;
    case 'emphasis':
      projected = {
        type: 'italic',
        children: node.children.map(child =>
          projectInlineNode(child, cache, withRanges),
        ),
      };
      break;
    case 'delete':
      projected = {
        type: 'strikethrough',
        children: node.children.map(child =>
          projectInlineNode(child, cache, withRanges),
        ),
      };
      break;
    case 'inlineCode':
      projected = {type: 'code', content: node.value};
      break;
    case 'inlineMath':
      projected = {type: 'math', value: node.value};
      break;
    case 'link':
      projected = {
        type: 'link',
        href: node.url,
        children: node.children.map(child =>
          projectInlineNode(child, cache, withRanges),
        ),
      };
      break;
    case 'image':
      projected = {type: 'image', src: node.url, alt: node.alt};
      break;
    case 'citation':
      projected = {type: 'citation', sourceId: node.sourceId};
      break;
    case 'break':
      projected = {type: 'break'};
      break;
    case 'extension':
      projected = projectExtensionNode(node, withRanges);
      break;
  }
  cache.set(node, projected);
  return projected;
}

function projectTableCell(
  node: MarkdownAstTableCell<RuntimeExtensionNode>,
  cache: LegacyProjectionCache,
  withRanges: boolean,
): TableCellNodeWithMath<RuntimeExtensionNode> {
  const cached = cache.get(node);
  if (cached != null) {
    return cached as TableCellNodeWithMath<RuntimeExtensionNode>;
  }
  const projected = {
    children: node.children.map(child =>
      projectInlineNode(child, cache, withRanges),
    ),
  };
  cache.set(node, projected);
  return projected;
}

function projectListItem(
  node: MarkdownAstListItem<RuntimeExtensionNode>,
  cache: LegacyProjectionCache,
  withRanges: boolean,
): ListItemNodeWithMath<RuntimeExtensionNode> {
  const cached = cache.get(node);
  if (cached != null) {
    return cached as ListItemNodeWithMath<RuntimeExtensionNode>;
  }
  const projected = {
    checked: node.checked,
    children: node.children.map(child =>
      projectBlockNode(child, cache, withRanges),
    ),
  };
  cache.set(node, projected);
  return projected;
}

function projectBlockNode(
  node: MarkdownAstBlockContent<RuntimeExtensionNode>,
  cache: LegacyProjectionCache,
  withRanges: boolean,
): RuntimeBlockNode {
  const cached = cache.get(node);
  if (cached != null) {
    return cached as RuntimeBlockNode;
  }
  const metadata = withRanges ? projectRange(node.position) : {};
  let projected: RuntimeBlockNode;
  switch (node.type) {
    case 'heading':
      projected = {
        type: 'heading',
        level: node.depth,
        children: node.children.map(child =>
          projectInlineNode(child, cache, withRanges),
        ),
        ...metadata,
      };
      break;
    case 'paragraph':
      projected = {
        type: 'paragraph',
        children: node.children.map(child =>
          projectInlineNode(child, cache, withRanges),
        ),
        ...metadata,
      };
      break;
    case 'code':
      projected = {
        type: 'codeblock',
        language: getMarkdownAstLegacyCodeLanguage(node) ?? 'plaintext',
        content: node.value,
        ...metadata,
      };
      break;
    case 'math':
      projected = {type: 'math', value: node.value, ...metadata};
      break;
    case 'blockquote':
      projected = {
        type: 'blockquote',
        children: node.children.map(child =>
          projectBlockNode(child, cache, withRanges),
        ),
        ...metadata,
      };
      break;
    case 'list':
      projected = {
        type: 'list',
        ordered: node.ordered,
        start: node.start,
        delimiter: node.delimiter,
        loose: node.spread,
        items: node.children.map(item =>
          projectListItem(item, cache, withRanges),
        ),
        ...metadata,
      };
      break;
    case 'table': {
      const [header = {type: 'tableRow' as const, children: []}, ...rows] =
        node.children;
      projected = {
        type: 'table',
        headers: header.children.map(cell =>
          projectTableCell(cell, cache, withRanges),
        ),
        alignments: [...node.align],
        rows: rows.map(row =>
          row.children.map(cell => projectTableCell(cell, cache, withRanges)),
        ),
        ...metadata,
      };
      break;
    }
    case 'thematicBreak':
      projected = {type: 'hr', ...metadata};
      break;
    case 'image':
      projected = {type: 'image', alt: node.alt, src: node.url, ...metadata};
      break;
    case 'extension':
      projected = projectExtensionNode(node, withRanges);
      break;
  }
  cache.set(node, projected);
  return projected;
}

function projectInlineNodes(
  nodes: ReadonlyArray<MarkdownAstPhrasingContent<RuntimeExtensionNode>>,
  withRanges: boolean,
  cache: LegacyProjectionCache = new WeakMap(),
): RuntimeInlineNode[] {
  return nodes.map(node => projectInlineNode(node, cache, withRanges));
}

function projectMarkdownRoot(
  root: MarkdownAstRoot<RuntimeExtensionNode>,
  withRanges: boolean,
  cache: LegacyProjectionCache = new WeakMap(),
): RuntimeBlockNode[] {
  return root.children.map(node => projectBlockNode(node, cache, withRanges));
}

/** Whether a caller asked for the released `range` field on its blocks. */
function wantsLegacyRanges(
  arg: ReadonlySet<string> | RuntimeParseOptions | undefined,
): boolean {
  return (
    arg != null &&
    typeof (arg as {has?: unknown}).has !== 'function' &&
    (arg as RuntimeParseOptions).sourceRanges === true
  );
}

// ---------------------------------------------------------------------------
// Parse options
// ---------------------------------------------------------------------------

/**
 * Options for the markdown parser entry points.
 *
 * Backward-compatible: the public `parseMarkdown` / `parseInline` /
 * `parseMarkdownIncremental` functions also accept the legacy
 * `ReadonlySet<string>` shape as the second argument.
 */
type CommonParseOptions<
  Plugins extends ReadonlyArray<MarkdownPluginEntry> = readonly [],
> = {
  /** Set of citation source ids — `[id]` / `【id】` markers in this set
   *  become citation nodes instead of plain text / links. */
  sourceIds?: ReadonlySet<string>;
  /** Ordered opt-in Markdown extensions. */
  plugins?: Plugins;
  /**
   * Autolink mode. When set to `'gfm'`, the parser turns bare
   * `https?://…` / `www.…` URLs, `<URL>` / `<email>` angle-bracket
   * forms, and `user@host` emails into `link` inline nodes (per the
   * GitHub Flavored Markdown autolink-literal extension plus the
   * CommonMark §6.5 autolink form). Disabled by default.
   *
   * Two intentional deviations from the strict GFM spec for v1:
   * trailing `&entity;` is not peeled off the URL, and an invalid TLD
   * suffix is not rejected (Astryx accepts any plausible TLD shape).
   */
  autolink?: 'gfm';
  /**
   * When true, every top-level block carries a `range` — the offsets it
   * occupies in the string passed in. Lets a consumer that still holds the
   * source slice the original markdown for a block instead of reconstructing
   * it from the parsed node (or from the rendered DOM). Off by default: the
   * field is absent unless asked for, so nothing that compares nodes changes.
   *
   * Blocks nested inside a list item or a blockquote do not carry one.
   */
  sourceRanges?: boolean;
};

/** Options for default and legacy parser results. */
export type ParseOptions<
  Plugins extends ReadonlyArray<MarkdownPluginEntry> = readonly [],
> = CommonParseOptions<Plugins> & {math?: false | undefined};

/**
 * Options that explicitly parse `$…$` and `$$…$$` into math-enabled result
 * unions. Keeping this separate prevents a legacy `ParseOptions` annotation
 * from silently widening an exhaustive node switch.
 */
export type MathParseOptions<
  Plugins extends ReadonlyArray<MarkdownPluginEntry> = readonly [],
> = CommonParseOptions<Plugins> & {math: true};

export type IncrementalParseOptions<
  Plugins extends ReadonlyArray<MarkdownPluginEntry> = readonly [],
> = ParseOptions<Plugins> & {
  /** False while more source may arrive; true for the terminal snapshot. */
  readonly isFinal?: boolean;
};

export type IncrementalMathParseOptions<
  Plugins extends ReadonlyArray<MarkdownPluginEntry> = readonly [],
> = MathParseOptions<Plugins> & {
  /** False while more source may arrive; true for the terminal snapshot. */
  readonly isFinal?: boolean;
};

type RuntimeParseOptions = CommonParseOptions<
  ReadonlyArray<MarkdownPluginEntry>
> & {
  math?: boolean;
  isFinal?: boolean;
};

type ResolvedOptions = {
  readonly sourceIds: ReadonlySet<string> | undefined;
  readonly autolink: 'gfm' | undefined;
  readonly math?: boolean;
  /** Whether the caller asked for the released `range` projection. */
  readonly sourceRanges?: boolean;
  /**
   * Whether this parse authors canonical `position` offsets on its blocks.
   * Internal only, and independent of `sourceRanges`: the canonical tree
   * transforms observe always carries provenance, while `sourceRanges` alone
   * decides whether the released projection exposes it as `range`.
   */
  readonly astPositions?: boolean;
  readonly plugins?: PreparedMarkdownPlugins;
  readonly isFinal: boolean;
  readonly allowBlockSyntax?: boolean;
  /**
   * Offset of this parse's input within the document the ranges are reported
   * against. Internal only — the incremental parser parses slices and needs
   * their blocks' ranges to come out absolute.
   */
  readonly baseOffset?: number;
  /**
   * Link reference definitions (`[label]: url`) collected from the whole
   * document, keyed by normalized label. Internal only — populated by the
   * block parser, never by the public `ParseOptions`. Enables `parseInlineImpl`
   * to resolve full/collapsed/shortcut reference links and images.
   */
  readonly linkDefs?: ReadonlyMap<string, string>;
  /**
   * How many lists and blockquotes enclose this parse. Internal only: past
   * MAX_BLOCK_NESTING, content is read as text, so no input nests blocks
   * deep enough to exhaust the stack of the parser, a projection, or a
   * render.
   */
  readonly blockDepth: number;
  /**
   * The blocks each nested parse inside a lazy-continuation probe produced,
   * keyed by depth and input, shared by the whole document. Internal only:
   * a probe asks whether nested content ends in a paragraph, and finds the
   * answer here when an earlier probe already read the same content one
   * level up, so probes at every nesting level cost no more than one parse.
   * Parses outside a probe record nothing.
   */
  readonly nestedParses?: {
    map: Map<string, MarkdownAstBlockContent<RuntimeExtensionNode>[]> | null;
  };
  /** Whether this parse runs inside a lazy-continuation probe. */
  readonly probing?: boolean;
  /**
   * Whether blocks record their source lines (`module:Markdown/sourceLines`).
   * Set only by the source-lines plugin; otherwise no line work runs.
   */
  readonly sourceLines?: boolean;
  /**
   * 0-based document line of this parse's first input line. Internal only —
   * the incremental parser parses slices whose lines must come out absolute.
   */
  readonly baseLine?: number;
  /**
   * 0-based document line of each input line of a nested parse. Internal only
   * — a list item's or a blockquote's content is reassembled one line per
   * source line, so its lines map back to the document through this table.
   * A nested parse without it records no lines.
   */
  readonly lineOrigin?: ReadonlyArray<number>;
};

/**
 * The deepest lists and blockquotes may nest, as emphasis is capped
 * (MAX_EMPHASIS_DEPTH): at most 100 levels. Content nested deeper is one
 * paragraph of text.
 */
const MAX_BLOCK_NESTING = 100;

/** The key a nested parse of `input` at `depth` is remembered under. */
function nestedParseKey(depth: number, input: string): string {
  return `${depth}\u0000${input}`;
}

/**
 * Every resolved options object is built here, so all of them share one key
 * set in one order — and therefore one hidden class. The parser reads these
 * fields in its hottest loops; letting an omitted-options parse and an
 * options-bag parse produce differently-shaped objects makes those reads
 * polymorphic in any process that does both, which is exactly what a caller
 * comparing an empty pipeline against a configured one does.
 */
function makeResolvedOptions(
  fields: Partial<ResolvedOptions> & {readonly isFinal: boolean},
): ResolvedOptions {
  return {
    sourceIds: fields.sourceIds,
    autolink: fields.autolink,
    math: fields.math,
    sourceRanges: fields.sourceRanges,
    astPositions: fields.astPositions ?? true,
    plugins: fields.plugins,
    isFinal: fields.isFinal,
    allowBlockSyntax: fields.allowBlockSyntax ?? true,
    baseOffset: fields.baseOffset,
    linkDefs: fields.linkDefs,
    blockDepth: fields.blockDepth ?? 0,
    nestedParses: fields.nestedParses,
    probing: fields.probing,
    sourceLines: fields.sourceLines,
    baseLine: fields.baseLine,
    lineOrigin: fields.lineOrigin,
  };
}

const EMPTY_OPTS: ResolvedOptions = makeResolvedOptions({isFinal: true});
const EMPTY_INCREMENTAL_OPTS: ResolvedOptions = makeResolvedOptions({
  isFinal: false,
});

function resolveOptions(
  arg: ReadonlySet<string> | RuntimeParseOptions | undefined,
  incremental = false,
): ResolvedOptions {
  if (arg == null) {
    return incremental ? EMPTY_INCREMENTAL_OPTS : EMPTY_OPTS;
  }
  // Duck-type the legacy `ReadonlySet<string>` form: any object whose
  // `.has` is callable is treated as the legacy sourceIds set. This is
  // safer than `instanceof Set`, which would misclassify cross-realm
  // or polyfilled `ReadonlySet` implementations as a `ParseOptions` bag
  // and silently lose citation resolution.
  if (typeof (arg as {has?: unknown}).has === 'function') {
    return makeResolvedOptions({
      sourceIds: arg as ReadonlySet<string>,
      isFinal: !incremental,
    });
  }
  const opts = arg as RuntimeParseOptions;
  const plugins =
    opts.plugins != null && opts.plugins.length > 0
      ? prepareMarkdownPlugins(opts.plugins)
      : undefined;
  return makeResolvedOptions({
    sourceIds: opts.sourceIds,
    autolink: opts.autolink,
    math: opts.math === true ? true : undefined,
    sourceRanges: opts.sourceRanges,
    plugins,
    isFinal: incremental ? opts.isFinal === true : true,
    sourceLines: plugins?.sourceLines === true ? true : undefined,
  });
}

// ---------------------------------------------------------------------------
// Link reference definitions
// ---------------------------------------------------------------------------

// A CommonMark link reference definition line: up to 3 leading spaces, a
// bracketed label, `:`, a destination (bare or `<...>`), and an optional
// same-line title (captured as group 4 so a title-less definition can absorb a
// title on the following line). `^`-leading labels (`[^1]:`) are footnote
// definitions — a separate, unsupported feature — and are excluded so they
// pass through verbatim.
const LINK_DEFINITION_RE =
  /^ {0,3}\[([^\]^](?:\\.|[^\]\\])*)\]:[ \t]*(?:<([^<>\n]*)>|(\S+))([ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?[ \t]*$/;

/** The most characters a link label may hold (CommonMark 0.31 §4.7). */
const MAX_LINK_LABEL_LENGTH = 999;

// A line that is nothing but a title — the continuation form allowed when a
// definition's destination is followed by its title on the next line.
const LINK_TITLE_ONLY_RE = /^ {0,3}(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\))[ \t]*$/;

// CommonMark matches reference labels case-insensitively with leading/trailing
// whitespace stripped and internal whitespace runs collapsed to one space.
function normalizeLinkLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

type DisplayMathContainer = {
  outerQuoteDepth: number;
  listBaseIndent: number | null;
  innerQuoteDepth: number;
};

type DisplayMathMatch = {
  value: string;
  nextIndex: number;
  endLine: number;
};

function stripBlockquoteMarkers(line: string): {
  content: string;
  quoteDepth: number;
} {
  let content = line.endsWith('\r') ? line.slice(0, -1) : line;
  let quoteDepth = 0;
  while (true) {
    const marker = /^ {0,3}> ?/.exec(content);
    if (marker == null) {
      return {content, quoteDepth};
    }
    content = content.slice(marker[0].length);
    quoteDepth++;
  }
}

function stripExactBlockquoteDepth(
  line: string,
  quoteDepth: number,
): string | null {
  let content = line;
  for (let depth = 0; depth < quoteDepth; depth++) {
    const marker = /^ {0,3}> ?/.exec(content);
    if (marker == null) {
      return null;
    }
    content = content.slice(marker[0].length);
  }
  return content;
}

/**
 * Recognize a standalone display-math marker at the current container boundary.
 * A list opener carries its base indent so an indented continuation marker can
 * close it; blockquotes must keep the same quote depth.
 */
function displayMathContainer(line: string): DisplayMathContainer | null {
  const outer = stripBlockquoteMarkers(line);
  const listMarker = /^( {0,9})(?:[-*+]|\d+[.)]) +(.*)$/.exec(outer.content);
  if (listMarker != null) {
    const taskMarker = /^\[[ xX]\] +(.*)$/.exec(listMarker[2]);
    const inner = stripBlockquoteMarkers(taskMarker?.[1] ?? listMarker[2]);
    return inner.content.trim() === '$$'
      ? {
          outerQuoteDepth: outer.quoteDepth,
          listBaseIndent: listMarker[1].length,
          innerQuoteDepth: inner.quoteDepth,
        }
      : null;
  }
  return outer.content.trim() === '$$'
    ? {
        outerQuoteDepth: outer.quoteDepth,
        listBaseIndent: null,
        innerQuoteDepth: 0,
      }
    : null;
}

type DisplayMathLineState = 'close' | 'inside' | 'outside';

function displayMathLineState(
  line: string,
  container: DisplayMathContainer,
): DisplayMathLineState {
  const outerContent = stripExactBlockquoteDepth(
    line,
    container.outerQuoteDepth,
  );
  if (outerContent == null) {
    return 'outside';
  }

  if (container.listBaseIndent == null) {
    // A deeper quote starts a different container. It cannot close or continue
    // the math expression owned by the shallower quote.
    if (/^ {0,3}> ?/.test(outerContent)) {
      return 'outside';
    }
    return outerContent.trim() === '$$' ? 'close' : 'inside';
  }

  const continuationIndent =
    outerContent.length - outerContent.trimStart().length;
  if (continuationIndent <= container.listBaseIndent) {
    return 'outside';
  }
  const innerContent = stripExactBlockquoteDepth(
    outerContent.trimStart(),
    container.innerQuoteDepth,
  );
  if (innerContent == null || /^ {0,3}> ?/.test(innerContent)) {
    return 'outside';
  }
  return innerContent.trim() === '$$' ? 'close' : 'inside';
}

/** Match a complete `$$…$$` display-math block without consuming partial input. */
function matchDisplayMathBlock(
  lines: string[],
  lineIndex: number,
): DisplayMathMatch | null {
  const trimmed = lines[lineIndex].trim();
  if (
    trimmed.length > 4 &&
    trimmed.startsWith('$$') &&
    trimmed.endsWith('$$')
  ) {
    const value = trimmed.slice(2, -2);
    return value.trim() === ''
      ? null
      : {value, nextIndex: lineIndex + 1, endLine: lineIndex};
  }
  if (trimmed !== '$$') {
    return null;
  }
  for (let index = lineIndex + 1; index < lines.length; index++) {
    if (lines[index].trim() === '$$') {
      const value = lines.slice(lineIndex + 1, index).join('\n');
      return value.trim() === ''
        ? null
        : {
            value,
            nextIndex: index + 1,
            endLine: index,
          };
    }
  }
  return null;
}

function matchLinkDefinition(
  line: string,
): {label: string; destination: string; hasTitle: boolean} | null {
  const match = LINK_DEFINITION_RE.exec(line);
  // A longer label defines nothing, so the line stays text, as a reference
  // with that label does.
  if (match == null || match[1].length > MAX_LINK_LABEL_LENGTH) {
    return null;
  }
  const label = normalizeLinkLabel(match[1]);
  // `match[2]` is the `<...>` destination (present but possibly empty, e.g.
  // `<>` → empty href, valid per CommonMark); `match[3]` is the bare
  // destination (always non-empty). One of the two always matches.
  const destination = match[2] != null ? match[2] : match[3];
  if (label === '' || destination == null) {
    return null;
  }
  return {
    label,
    destination: decodeLinkDestination(destination),
    hasTitle: match[4] != null,
  };
}

/**
 * A code fence line: up to three spaces of indentation, then three or more
 * backticks or tildes (CommonMark 0.31 §4.5). Group 1 is the indentation and
 * group 2 the fence.
 */
const FENCE_LINE = /^( {0,3})(`{3,}|~{3,})/;

/**
 * Whether `line` closes a code block opened with `fence`: a fence of the same
 * character, at least as long, after up to three spaces of indentation, with
 * only spaces or tabs after it (CommonMark 0.31 §4.5) — so `   ```js` inside
 * an open block is code, not its end.
 */
function closesFence(line: string, fence: string): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(line);
  return (
    match != null &&
    match[1].startsWith(fence[0]) &&
    match[1].length >= fence.length
  );
}

/** Where a list item's lines sit: its marker's indentation and content. */
interface ListItemScope {
  /** The marker's indentation. */
  readonly base: number;
  /** Where the item's content starts: past the marker and its spaces. */
  readonly content: number;
  readonly ordered: boolean;
}

/**
 * The list item `line` opens, read as the block parser reads one: a bullet or
 * a number with `.` or `)` after up to nine spaces, then a space. A thematic
 * break opens no item.
 */
function listItemScopeOf(line: string): ListItemScope | null {
  if (isHorizontalRule(line)) {
    return null;
  }
  const marker = /^( {0,9})([-*+]|\d+[.)]) /.exec(line);
  if (marker == null) {
    return null;
  }
  const markerEnd = marker[0].length;
  const spacesAfter = getIndent(line.slice(markerEnd));
  return {
    base: marker[1].length,
    content: spacesAfter >= 4 ? markerEnd : markerEnd + spacesAfter,
    ordered: marker[2] !== '-' && marker[2] !== '*' && marker[2] !== '+',
  };
}

/** What a line does to the top-level code fence. */
type TopLevelFenceEvent = 'open' | 'close' | 'inside' | null;

/**
 * Follows the code fences that open at the top level of a document, a line at
 * a time, as the block parser reads them. A fence indented into an open list
 * item belongs to that item, whose own parse reads it: it neither opens nor
 * closes a top-level fence, so a list step's fence closed at the margin leaves
 * the margin line to open a fence of its own, as the full parse does. Scanners
 * that run outside the block parser — streaming settlement, link definitions,
 * display-math trimming — share it so they pair fences the same way.
 */
function topLevelFences(): {
  readonly open: boolean;
  read(lines: ReadonlyArray<string>, index: number): TopLevelFenceEvent;
} {
  let fence = '';
  // The outermost open list item, and what it last read. After a blank line
  // inside the item, the parser keeps only lines indented to its content.
  let item: ListItemScope | null = null;
  let itemHadBlank = false;
  let itemFence = '';
  let itemEndsInParagraph = false;
  // A number other than 1 cannot interrupt an open top-level paragraph.
  let paragraphOpen = false;

  const isHeadingOrBreak = (text: string) =>
    /^ {0,3}#{1,6}(?:[ \t]|$)/.test(text) || isHorizontalRule(text);

  /** Reads a line of the open item, without the item's indentation. */
  const readItemLine = (text: string) => {
    if (itemFence !== '') {
      if (closesFence(text, itemFence)) {
        itemFence = '';
      }
      itemEndsInParagraph = false;
      return;
    }
    const opening = FENCE_LINE.exec(text);
    if (opening != null) {
      itemFence = opening[2];
      itemEndsInParagraph = false;
      return;
    }
    itemEndsInParagraph = text.trim() !== '' && !isHeadingOrBreak(text);
  };

  return {
    get open() {
      return fence !== '';
    },
    read(lines, index) {
      const line = lines[index];
      if (fence !== '') {
        if (closesFence(line, fence)) {
          fence = '';
          return 'close';
        }
        return 'inside';
      }
      if (line.trim() === '') {
        itemHadBlank = item != null;
        paragraphOpen = false;
        return null;
      }
      const indent = getIndent(line);
      if (
        item != null &&
        (itemHadBlank ? indent >= item.content : indent > item.base)
      ) {
        readItemLine(line.slice(Math.min(indent, item.content)));
        return null;
      }
      const scope = listItemScopeOf(line);
      if (
        scope != null &&
        !(
          paragraphOpen &&
          item == null &&
          scope.ordered &&
          !/^ {0,9}0*1[.)]/.test(line)
        )
      ) {
        item = scope;
        itemHadBlank = false;
        itemFence = '';
        paragraphOpen = false;
        readItemLine(line.slice(scope.content));
        return null;
      }
      const opening = FENCE_LINE.exec(line);
      if (opening != null) {
        item = null;
        paragraphOpen = false;
        fence = opening[2];
        return 'open';
      }
      if (
        item != null &&
        !itemHadBlank &&
        itemEndsInParagraph &&
        canContinueParagraphLazily(lines, index)
      ) {
        // A lazy continuation line of the item's paragraph.
        return null;
      }
      item = null;
      paragraphOpen = !isHeadingOrBreak(line);
      return null;
    },
  };
}

/**
 * Collect link reference definitions from the whole document and return the
 * input with the definition lines removed. A definition is recognized at a
 * block boundary — document start, after a blank line, after another
 * definition, or after a self-contained block (heading / thematic break /
 * closed fenced code) — but never inside a fenced code block or as a lazy
 * continuation of a paragraph, honoring CommonMark's rule that a definition
 * cannot interrupt a paragraph. First definition wins, and definitions produce
 * no output so stripping unreferenced ones is correct.
 *
 * Scope limit: definitions are collected at the top level only, and a
 * definition directly following a list, blockquote, or table (with no blank
 * line between) is not recognized. A definition nested inside a blockquote or
 * list item resolves within that container (via the recursive parse) but is
 * not exposed to references elsewhere in the document, unlike full CommonMark
 * where every definition is global. Separating a footer definition block with
 * a blank line — the usual form — always works.
 */
function extractLinkDefinitions(
  input: string,
  math = false,
): {
  defs: ReadonlyMap<string, string>;
  cleaned: string;
  /**
   * For each line of `cleaned`, the line of `input` it came from. Undefined
   * when nothing was stripped and the two are the same text.
   */
  lineMap?: number[];
} {
  const lines = input.split('\n');
  const defs = new Map<string, string>();
  const keep = new Array<boolean>(lines.length).fill(true);
  let atBoundary = true;
  const fences = topLevelFences();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fences.open) {
      // The line after a closed fence begins a new block.
      atBoundary = fences.read(lines, index) === 'close';
      continue;
    }
    if (math) {
      const displayMath = matchDisplayMathBlock(lines, index);
      if (displayMath != null) {
        // Math is opaque Markdown content: definition-shaped TeX must not leak
        // into the document-wide link-definition map.
        index = displayMath.endLine;
        atBoundary = true;
        continue;
      }
    }
    if (fences.read(lines, index) === 'open') {
      atBoundary = false;
      continue;
    }
    if (line.trim() === '') {
      atBoundary = true;
      continue;
    }
    if (atBoundary) {
      const def = matchLinkDefinition(line);
      if (def != null) {
        if (!defs.has(def.label)) {
          defs.set(def.label, def.destination);
        }
        keep[index] = false;
        // A title-less definition absorbs a title on the following line
        // (CommonMark), which then also produces no output.
        if (
          !def.hasTitle &&
          index + 1 < lines.length &&
          LINK_TITLE_ONLY_RE.test(lines[index + 1])
        ) {
          keep[index + 1] = false;
          index++;
        }
        // Consecutive definitions stay at a block boundary.
        continue;
      }
    }
    // A heading or thematic break is a self-contained single-line block, so
    // the next line begins a new block where a definition may appear.
    atBoundary = /^ {0,3}#{1,6}(?: |\t|$)/.test(line) || isHorizontalRule(line);
  }

  if (defs.size === 0) {
    return {defs, cleaned: input};
  }
  const lineMap: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (keep[index]) {
      lineMap.push(index);
    }
  }
  const cleaned = lineMap.map(index => lines[index]).join('\n');
  return {defs, cleaned, lineMap};
}

/** Order-independent signature of a citation-source set, for cache checks. */
function sourceIdsSignature(
  sourceIds: ReadonlySet<string> | undefined,
): string {
  return sourceIds == null || sourceIds.size === 0
    ? ''
    : [...sourceIds].sort().join('\u0000');
}

/** Order-independent signature of a link-definition set, for cache checks. */
function linkDefsSignature(defs: ReadonlyMap<string, string>): string {
  if (defs.size === 0) {
    return '';
  }
  return [...defs]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([label, dest]) => `${label}\u0000${dest}`)
    .join('\u0001');
}

/**
 * Resolve a full (`[text][label]`), collapsed (`[text][]`), or shortcut
 * (`[text]`) reference at `start` (which points at `[`) against `linkDefs`.
 * Returns the node plus the index just past the reference, or null when it is
 * not a resolvable reference (caller falls through to literal handling).
 */
function protectedInlineOptions(opts: ResolvedOptions): ResolvedOptions {
  return opts.plugins == null ? opts : {...opts, plugins: undefined};
}

function matchReferenceLink(
  text: string,
  start: number,
  linkDefs: ReadonlyMap<string, string>,
  opts: ResolvedOptions,
  context: 'default' | 'tableCell',
  inlineIndex: InlineIndex,
): {
  node: MarkdownAstPhrasingContent<RuntimeExtensionNode>;
  end: number;
} | null {
  const textClose = inlineIndex.openerClose(start);
  if (textClose === -1) {
    return null;
  }
  const linkText = text.slice(start + 1, textClose);
  // Full `[text][label]` / collapsed `[text][]` — a matching definition wins.
  if (text[textClose + 1] === '[') {
    const labelClose = inlineIndex.closingBracket(textClose + 2);
    if (labelClose !== -1) {
      const rawLabel = text.slice(textClose + 2, labelClose);
      // Only truly-empty brackets are the collapsed form; a whitespace-only
      // label (`[ ]`) is a full reference whose normalized label is empty and
      // matches nothing.
      const label = rawLabel === '' ? linkText : rawLabel;
      const href = linkDefs.get(normalizeLinkLabel(label));
      if (href != null && isSafeMarkdownParserUrl(href)) {
        return {
          node: {
            type: 'link',
            url: href,
            children: parseInlineImpl(
              linkText,
              protectedInlineOptions(opts),
              context,
            ),
          },
          end: labelClose + 1,
        };
      }
      // No match — fall back to a shortcut `[text]` (CommonMark back-off),
      // leaving the trailing `[label]` to be parsed separately.
    }
  }
  // Shortcut: `[text]`.
  if (linkText.trim() === '') {
    return null;
  }
  const href = linkDefs.get(normalizeLinkLabel(linkText));
  if (href == null || !isSafeMarkdownParserUrl(href)) {
    return null;
  }
  return {
    node: {
      type: 'link',
      url: href,
      children: parseInlineImpl(
        linkText,
        protectedInlineOptions(opts),
        context,
      ),
    },
    end: textClose + 1,
  };
}

/** Reference-image equivalent of {@link matchReferenceLink} (`![alt][label]`). */
/** How many image descriptions enclose the one being read. */
let imageAltDepth = 0;

/**
 * The deepest image descriptions are read as inline content. Reading one
 * reads every image nested in it again, so the cost grows with the depth
 * times the text; ten levels keep any input fast, and no real image nests
 * that deep.
 */
const MAX_IMAGE_ALT_DEPTH = 10;

/**
 * An image's alt text: its description read as inline content and taken as
 * plain text (CommonMark 0.31 §6.4), so `` ![`a]b` *c*](u) `` has the alt
 * `a]b c`. Descriptions nested deeper than MAX_IMAGE_ALT_DEPTH keep their
 * decoded source.
 */
function imageAlt(
  description: string,
  opts: ResolvedOptions,
  context: 'default' | 'tableCell',
): string {
  if (imageAltDepth >= MAX_IMAGE_ALT_DEPTH) {
    return decodeLiteralText(description);
  }
  imageAltDepth++;
  try {
    return markdownAstText(
      breaksAsLineEndings(
        parseInlineImpl(description, protectedInlineOptions(opts), context),
      ),
    );
  } finally {
    imageAltDepth--;
  }
}

/**
 * `nodes` with each hard line break as the line ending it stands for, so an
 * alt text keeps the words on either side apart, as commonmark.js writes it.
 */
function breaksAsLineEndings(
  nodes: ReadonlyArray<MarkdownAstPhrasingContent<RuntimeExtensionNode>>,
): MarkdownAstPhrasingContent<RuntimeExtensionNode>[] {
  return nodes.map(node => {
    switch (node.type) {
      case 'break':
        return {type: 'text', value: '\n'};
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'link':
        return {...node, children: breaksAsLineEndings(node.children)};
      case 'text':
      case 'inlineCode':
      case 'inlineMath':
      case 'image':
      case 'citation':
      case 'extension':
        return node;
    }
  });
}

function matchReferenceImage(
  text: string,
  start: number,
  linkDefs: ReadonlyMap<string, string>,
  inlineIndex: InlineIndex,
  opts: ResolvedOptions,
  context: 'default' | 'tableCell',
): {
  node: MarkdownAstPhrasingContent<RuntimeExtensionNode>;
  end: number;
} | null {
  const altClose = inlineIndex.openerClose(start + 1);
  if (altClose === -1) {
    return null;
  }
  const alt = text.slice(start + 2, altClose);
  if (text[altClose + 1] === '[') {
    const labelClose = inlineIndex.closingBracket(altClose + 2);
    if (labelClose !== -1) {
      const rawLabel = text.slice(altClose + 2, labelClose);
      const label = rawLabel === '' ? alt : rawLabel;
      const src = linkDefs.get(normalizeLinkLabel(label));
      if (src != null && isSafeMarkdownParserUrl(src)) {
        return {
          node: {type: 'image', url: src, alt: imageAlt(alt, opts, context)},
          end: labelClose + 1,
        };
      }
      // No match — fall back to a shortcut `![alt]`.
    }
  }
  if (alt.trim() === '') {
    return null;
  }
  const src = linkDefs.get(normalizeLinkLabel(alt));
  if (src == null || !isSafeMarkdownParserUrl(src)) {
    return null;
  }
  return {
    node: {type: 'image', url: src, alt: imageAlt(alt, opts, context)},
    end: altClose + 1,
  };
}

// ---------------------------------------------------------------------------
// Inline parser helpers
// ---------------------------------------------------------------------------

/** Find closing ')' that balances nested parentheses. */
// The content between an inline link's or image's parentheses: a `<…>`
// destination or one without spaces, then an optional `"…"`, `'…'`, or `(…)`
// title after whitespace (CommonMark 0.31, link destinations and titles).
const INLINE_DESTINATION_WITH_TITLE =
  /^\s*(?:<((?:[^<>\n\\]|\\.)*)>|([^\s<]\S*?))(?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?\s*$/s;

/**
 * Where an inline link's or image's destination ends when it opens with `<`
 * — the index of the `)` that closes the link — `'refused'` when it opens
 * with `<` but is no angle-bracket destination, or null when the content
 * after `open` (the `(`) does not open with `<`. Inside the brackets
 * parentheses are plain characters, so `<b(c>` is the destination `b(c`. A
 * destination that opens with `<` must be one whole angle-bracket
 * destination — no line ending, even escaped, and no unescaped `<` inside;
 * then only spaces, an optional title, and the `)` — or the link is text:
 * `[a](<b>c>)` and `[a](<b)` are no links (CommonMark 0.31 §6.3).
 */
function angleDestinationClose(
  text: string,
  open: number,
): number | 'refused' | null {
  let index = open + 1;
  while (text[index] === ' ' || text[index] === '\t') {
    index++;
  }
  if (text[index] !== '<') {
    return null;
  }
  for (index++; index < text.length; index++) {
    const character = text[index];
    if (
      character === '\\' &&
      text[index + 1] !== '\n' &&
      text[index + 1] !== '\r'
    ) {
      index++;
    } else if (character === '\n' || character === '\r' || character === '<') {
      return 'refused';
    } else if (character === '>') {
      break;
    }
  }
  if (index >= text.length) {
    return 'refused';
  }
  // After the brackets: spaces, an optional title, spaces, and the `)`.
  index++;
  while (/\s/.test(text[index] ?? '')) {
    index++;
  }
  const quote = text[index];
  if (quote === '"' || quote === "'" || quote === '(') {
    const closer = quote === '(' ? ')' : quote;
    for (index++; index < text.length && text[index] !== closer; index++) {
      if (text[index] === '\\') {
        index++;
      } else if (quote === '(' && text[index] === '(') {
        // A title in parentheses holds no unescaped `(`; stopping here
        // also keeps every search short.
        return 'refused';
      }
    }
    index++;
    while (/\s/.test(text[index] ?? '')) {
      index++;
    }
  }
  return text[index] === ')' ? index : 'refused';
}

/**
 * The destination of an inline link or image, without its title. Content in
 * any other shape keeps its released meaning: all of it is the destination.
 */
function inlineDestination(content: string): string {
  const match = INLINE_DESTINATION_WITH_TITLE.exec(content);
  return match == null ? content : (match[1] ?? match[2] ?? content);
}

/**
 * A link or image destination with its backslash escapes and character
 * references decoded, as CommonMark 0.31 §6.3 reads it: `\)` is `)`,
 * `&amp;` is `&`, and an escaped `\&` stays literal. Every URL safety check
 * runs on this decoded value, so an encoded scheme such as `&#106;avascript:`
 * is refused like the plain one.
 */
function decodeLinkDestination(raw: string): string {
  if (!raw.includes('\\') && !raw.includes('&')) {
    return raw;
  }
  let decoded = '';
  let index = 0;
  while (index < raw.length) {
    const character = raw[index];
    if (character === '\\' && isAsciiPunctuation(raw[index + 1])) {
      decoded += raw[index + 1];
      index += 2;
      continue;
    }
    if (character === '&') {
      const reference = matchCharacterReference(raw, index);
      if (reference != null) {
        decoded += reference.value;
        index = reference.end;
        continue;
      }
    }
    decoded += character;
    index++;
  }
  return decoded;
}

/**
 * The `]` that closes link text, an image's alternative text, or a reference
 * label opened before `from`; an escaped `\]` does not close it.
 */
/**
 * What the inline scan of one text asks about it again and again, each
 * answer indexed once, when first asked, so no question rescans the text.
 */
interface InlineIndex {
  /**
   * Where the backtick string of `length` that closes a code span opened
   * before `from` starts, or -1: the first backtick string of exactly that
   * length at or after `from` (CommonMark 0.31 §6.1).
   */
  backtickCloser(from: number, length: number): number;
  /**
   * The index of the unescaped `]` at or after `from` that closes link text
   * or a label, or -1. A code span hides its brackets: code spans bind
   * tighter than links (CommonMark 0.31 §6.1), so `[`a]b`](u)` links `a]b`
   * as code.
   */
  closingBracket(from: number): number;
  /**
   * The index of the `)` that closes the `(` at `open`, by nesting and
   * skipping escaped parentheses, or -1: where an inline link's or image's
   * destination ends.
   */
  closingParen(open: number): number;
  /**
   * The index of the `]` that closes the link or image opened by the `[` at
   * `open`, or -1 when no link or image forms there. Brackets pair as
   * CommonMark 0.31 §6.3 pairs them: each `]` closes the nearest open `[`,
   * so link text may hold balanced brackets and `[a [b](u)` links only `b`;
   * and a link inside link text wins, so the outer brackets stay text —
   * links never nest. Images may hold links.
   */
  openerClose(open: number): number;
}

function inlineIndexOf(
  text: string,
  linkDefs?: ReadonlyMap<string, string>,
): InlineIndex {
  let backtickStarts: Map<number, number[]> | null = null;
  const backtickCloser = (from: number, length: number): number => {
    if (backtickStarts == null) {
      backtickStarts = new Map();
      for (let start = text.indexOf('`'); start !== -1;) {
        let end = start;
        while (text[end] === '`') {
          end++;
        }
        const sameLength = backtickStarts.get(end - start);
        if (sameLength == null) {
          backtickStarts.set(end - start, [start]);
        } else {
          sameLength.push(start);
        }
        start = text.indexOf('`', end);
      }
    }
    const sameLength = backtickStarts.get(length);
    if (sameLength == null) {
      return -1;
    }
    let low = 0;
    let high = sameLength.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sameLength[middle] < from) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low < sameLength.length ? sameLength[low] : -1;
  };
  let nextClosingBracket: Int32Array | null = null;
  const closingBracket = (from: number): number => {
    if (nextClosingBracket == null) {
      // Which `]` can close: outside code spans, paired left to right as
      // the inline scan pairs them, and not escaped.
      const closes = new Uint8Array(text.length);
      for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (character === '\\') {
          index++;
        } else if (character === '`') {
          let runEnd = index;
          while (text[runEnd] === '`') {
            runEnd++;
          }
          const closer = backtickCloser(runEnd, runEnd - index);
          index = (closer === -1 ? runEnd : closer + (runEnd - index)) - 1;
        } else if (character === ']') {
          closes[index] = 1;
        }
      }
      nextClosingBracket = new Int32Array(text.length + 1).fill(-1);
      for (let index = text.length - 1; index >= 0; index--) {
        nextClosingBracket[index] =
          closes[index] === 1 ? index : nextClosingBracket[index + 1];
      }
    }
    return from < text.length ? nextClosingBracket[from] : -1;
  };
  let parenPartners: Int32Array | null = null;
  const closingParen = (open: number): number => {
    if (parenPartners == null) {
      // Every parenthesis pairs once, by nesting, so no destination search
      // rescans the text after an unclosed one.
      parenPartners = new Int32Array(text.length).fill(-1);
      const opens: number[] = [];
      for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (character === '\\') {
          index++;
        } else if (character === '(') {
          opens.push(index);
        } else if (character === ')') {
          const opened = opens.pop();
          if (opened !== undefined) {
            parenPartners[opened] = index;
          }
        }
      }
    }
    return text[open] === '(' ? parenPartners[open] : -1;
  };
  /**
   * Where the link or image whose text closes at `close` ends — past its
   * destination or label — or -1 when nothing after the `]` makes one. The
   * same checks the inline scan makes when it builds the node.
   */
  const linkEnd = (open: number, close: number): number => {
    if (text[close + 1] === '(') {
      const angleClose = angleDestinationClose(text, close + 1);
      const urlClose =
        angleClose === 'refused' ? -1 : (angleClose ?? closingParen(close + 1));
      if (urlClose !== -1) {
        return urlClose + 1;
      }
    }
    if (linkDefs == null || close - open - 1 > MAX_LINK_LABEL_LENGTH) {
      return -1;
    }
    const linkText = text.slice(open + 1, close);
    const defines = (label: string): boolean => {
      const href = linkDefs.get(normalizeLinkLabel(label));
      return href != null && isSafeMarkdownParserUrl(href);
    };
    if (text[close + 1] === '[') {
      const labelClose = closingBracket(close + 2);
      if (
        labelClose !== -1 &&
        labelClose - close - 2 <= MAX_LINK_LABEL_LENGTH &&
        defines(
          labelClose === close + 2
            ? linkText
            : text.slice(close + 2, labelClose),
        )
      ) {
        return labelClose + 1;
      }
    }
    return linkText.trim() !== '' && defines(linkText) ? close + 1 : -1;
  };
  let openerCloses: Map<number, number> | null = null;
  const openerClose = (open: number): number => {
    if (openerCloses == null) {
      // One pass in text order, as CommonMark's bracket stack runs: a `]`
      // closes the nearest open `[`; when that makes a link, every `[`
      // still open before it can no longer make one.
      openerCloses = new Map();
      const openers: {index: number; image: boolean}[] = [];
      let inactiveBelow = 0;
      for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (character === '\\') {
          index++;
        } else if (character === '`') {
          let runEnd = index;
          while (text[runEnd] === '`') {
            runEnd++;
          }
          const closer = backtickCloser(runEnd, runEnd - index);
          index = (closer === -1 ? runEnd : closer + (runEnd - index)) - 1;
        } else if (character === '!' && text[index + 1] === '[') {
          openers.push({index: index + 1, image: true});
          index++;
        } else if (character === '[') {
          openers.push({index, image: false});
        } else if (character === ']' && openers.length > 0) {
          const position = openers.length - 1;
          const opener = openers[position];
          openers.pop();
          const active = opener.image || position >= inactiveBelow;
          inactiveBelow = Math.min(inactiveBelow, position);
          if (!active) {
            continue;
          }
          const end = linkEnd(opener.index, index);
          if (end === -1) {
            continue;
          }
          openerCloses.set(opener.index, index);
          if (!opener.image) {
            inactiveBelow = openers.length;
          }
          // The destination or label is no part of any bracket pairing.
          index = end - 1;
        }
      }
    }
    return openerCloses.get(open) ?? -1;
  };
  return {backtickCloser, closingBracket, closingParen, openerClose};
}

// ---------------------------------------------------------------------------
// Emphasis and strong (CommonMark 0.31 §6.2)
// ---------------------------------------------------------------------------

/**
 * Adds `value` to the last text node of `nodes`, unless that node is a
 * delimiter run, which stays its own node until emphasis is resolved.
 */
function appendInlineText(
  nodes: MarkdownAstPhrasingContent<RuntimeExtensionNode>[],
  delimiterNodes: ReadonlySet<object> | null,
  value: string,
): void {
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text' && delimiterNodes?.has(last) !== true) {
    nodes[nodes.length - 1] = {...last, value: last.value + value};
  } else {
    nodes.push({type: 'text', value});
  }
}

type PhrasingNode = MarkdownAstPhrasingContent<RuntimeExtensionNode>;

/** A run of `*` or `_`: what it can do, and how many delimiters are left. */
interface DelimiterRun {
  /** The run's text node; its text shrinks as delimiters are used. */
  readonly node: {type: 'text'; value: string};
  readonly character: '*' | '_';
  readonly originalLength: number;
  length: number;
  readonly canOpen: boolean;
  readonly canClose: boolean;
}

// Built at runtime, not written as literals: for targets without property
// escapes, or when no browserslist is set, Babel's
// transform-unicode-property-regex rewrites a `\p{…}` literal, and the copy
// bundled with Next.js lacks the Unicode data it needs, so a source build fails
// with "Unknown property". Literals are safe once Next's bundled Babel ships
// that data.
const UNICODE_WHITESPACE = new RegExp('^[\\t\\n\\f\\r\\p{Zs}]$', 'u');
const UNICODE_PUNCTUATION = new RegExp('^[\\p{P}\\p{S}]$', 'u');

/** The character before `index` (a whole code point), if any. */
function characterBefore(text: string, index: number): string | undefined {
  if (index <= 0) {
    return undefined;
  }
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) {
      return text.slice(index - 2, index);
    }
  }
  return text[index - 1];
}

/** The character at `index` (a whole code point), if any. */
function characterAt(text: string, index: number): string | undefined {
  if (index >= text.length) {
    return undefined;
  }
  const codePoint = text.codePointAt(index);
  return codePoint == null ? undefined : String.fromCodePoint(codePoint);
}

/**
 * The delimiter run `text.slice(start, end)`: left- or right-flanking by the
 * characters around it, and whether it can open or close emphasis — an
 * underscore run only where it is not inside a word.
 */
function delimiterRun(
  character: '*' | '_',
  text: string,
  start: number,
  end: number,
): DelimiterRun {
  const before = characterBefore(text, start);
  const after = characterAt(text, end);
  // The start and end of the text count as whitespace.
  const isSpaceBefore = before == null || UNICODE_WHITESPACE.test(before);
  const isSpaceAfter = after == null || UNICODE_WHITESPACE.test(after);
  const isPunctuationBefore =
    before != null && UNICODE_PUNCTUATION.test(before);
  const isPunctuationAfter = after != null && UNICODE_PUNCTUATION.test(after);
  const isLeftFlanking =
    !isSpaceAfter &&
    (!isPunctuationAfter || isSpaceBefore || isPunctuationBefore);
  const isRightFlanking =
    !isSpaceBefore &&
    (!isPunctuationBefore || isSpaceAfter || isPunctuationAfter);
  return {
    node: {type: 'text', value: text.slice(start, end)},
    character,
    originalLength: end - start,
    length: end - start,
    canOpen:
      character === '*'
        ? isLeftFlanking
        : isLeftFlanking && (!isRightFlanking || isPunctuationBefore),
    canClose:
      character === '*'
        ? isRightFlanking
        : isRightFlanking && (!isLeftFlanking || isPunctuationAfter),
  };
}

/**
 * The deepest emphasis and strong may nest. Pairs that would nest deeper stay
 * text, as other CommonMark parsers cap nesting, so a hostile input cannot
 * build a tree that overflows the stack of a recursive walk or render.
 */
const MAX_EMPHASIS_DEPTH = 100;

interface Entry {
  node: PhrasingNode;
  previous: Entry | null;
  next: Entry | null;
}

/**
 * Pairs the delimiter runs of one inline text into emphasis and strong, as
 * CommonMark's process-emphasis procedure does: each closer, in order, takes
 * the nearest opener of its character that the rule of three allows, two
 * delimiters for strong when both have two, else one for emphasis, and the
 * nodes between them become its children. A run left unpaired stays text,
 * joined to the text beside it. `***x***` keeps strong outside emphasis, as
 * Markdown has always drawn it. Runs are taken off a linked stack as they
 * are used or passed, so the pass is linear in the number of runs, and
 * nesting stops at MAX_EMPHASIS_DEPTH.
 */
function resolveEmphasis(
  nodes: ReadonlyArray<PhrasingNode>,
  delimiters: ReadonlyArray<DelimiterRun>,
): PhrasingNode[] {
  const head: Entry = {
    node: {type: 'text', value: ''},
    previous: null,
    next: null,
  };
  let tail = head;
  const entryOf = new Map<object, Entry>();
  for (const node of nodes) {
    const entry: Entry = {node, previous: tail, next: null};
    tail.next = entry;
    tail = entry;
    entryOf.set(node, entry);
  }
  const unlink = (entry: Entry): void => {
    if (entry.previous != null) {
      entry.previous.next = entry.next;
    }
    if (entry.next != null) {
      entry.next.previous = entry.previous;
    }
  };
  // The delimiter stack, as a doubly linked list in source order: a run
  // leaves it once used up, paired across, or unable to pair, so every
  // search below visits only runs still on it, and the whole pass is linear.
  interface StackRun {
    readonly run: DelimiterRun;
    readonly index: number;
    previous: StackRun | null;
    next: StackRun | null;
    /** The deepest emphasis among the nodes after this run, up to the next. */
    depthAfter: number;
    canClose: boolean;
  }
  const stack: StackRun[] = delimiters.map((run, index) => ({
    run,
    index,
    previous: null,
    next: null,
    depthAfter: 0,
    canClose: run.canClose,
  }));
  stack.forEach((item, index) => {
    item.previous = stack[index - 1] ?? null;
    item.next = stack[index + 1] ?? null;
  });
  // Takes a run off the stack; what followed it now follows the one before.
  const leave = (item: StackRun): void => {
    if (item.previous != null) {
      item.previous.next = item.next;
      item.previous.depthAfter = Math.max(
        item.previous.depthAfter,
        item.depthAfter,
      );
    }
    if (item.next != null) {
      item.next.previous = item.previous;
    }
  };
  // Where the search for an opener stops, by source index, for closers of
  // each kind: no opener at or before it can match them.
  const openersBottom = new Map<string, number>();
  // The strong a pair of runs made last, to keep `***x***` strong outside.
  let lastStrong: {
    readonly node: PhrasingNode;
    readonly opener: DelimiterRun;
    readonly closer: DelimiterRun;
  } | null = null;
  let closerItem: StackRun | null = stack[0] ?? null;
  while (closerItem != null) {
    const closer = closerItem.run;
    if (!closerItem.canClose || closer.length === 0) {
      closerItem = closerItem.next;
      continue;
    }
    const key = `${closer.character}${closer.canOpen ? 1 : 0}${closer.originalLength % 3}`;
    const bottom = openersBottom.get(key) ?? -1;
    let openerItem: StackRun | null = closerItem.previous;
    for (; openerItem != null && openerItem.index > bottom;) {
      const candidate = openerItem.run;
      // The rule of three: a run that can both open and close does not pair
      // with one whose lengths sum to a multiple of three, unless both are.
      const isOddMatch =
        (closer.canOpen || candidate.canClose) &&
        (candidate.originalLength + closer.originalLength) % 3 === 0 &&
        !(
          candidate.originalLength % 3 === 0 && closer.originalLength % 3 === 0
        );
      if (
        candidate.character === closer.character &&
        candidate.canOpen &&
        candidate.length > 0 &&
        !isOddMatch
      ) {
        break;
      }
      openerItem = openerItem.previous;
    }
    if (openerItem == null || openerItem.index <= bottom) {
      openersBottom.set(key, closerItem.index - 1);
      const next: StackRun | null = closerItem.next;
      if (!closer.canOpen) {
        leave(closerItem);
      }
      closerItem = next;
      continue;
    }
    const opener = openerItem.run;
    // Runs between the pair can no longer pair: take them off the stack, and
    // note the deepest emphasis among the nodes between.
    let innerDepth = openerItem.depthAfter;
    for (
      let between = openerItem.next;
      between != null && between !== closerItem;
      between = between.next
    ) {
      innerDepth = Math.max(innerDepth, between.depthAfter);
    }
    openerItem.next = closerItem;
    closerItem.previous = openerItem;
    openerItem.depthAfter = innerDepth;
    if (innerDepth >= MAX_EMPHASIS_DEPTH) {
      // Nesting deeper than the cap: both runs stay text, so no input can
      // build a tree deep enough to exhaust the stack of whatever walks it.
      const next: StackRun | null = closerItem.next;
      leave(openerItem);
      closerItem.canClose = false;
      if (!closer.canOpen) {
        leave(closerItem);
      }
      closerItem = next;
      continue;
    }
    const openerEntry = entryOf.get(opener.node);
    const closerEntry = entryOf.get(closer.node);
    if (openerEntry == null || closerEntry == null) {
      break;
    }
    const use = opener.length >= 2 && closer.length >= 2 ? 2 : 1;
    const children: PhrasingNode[] = [];
    for (
      let entry = openerEntry.next;
      entry != null && entry !== closerEntry;
      entry = entry.next
    ) {
      children.push(entry.node);
    }
    let wrapper: PhrasingNode;
    if (use === 2) {
      wrapper = {type: 'strong', children};
      lastStrong = {node: wrapper, opener, closer};
    } else {
      const [only] = children;
      wrapper =
        children.length === 1 &&
        only === lastStrong?.node &&
        lastStrong.opener === opener &&
        lastStrong.closer === closer &&
        only.type === 'strong'
          ? {
              type: 'strong',
              children: [{type: 'emphasis', children: only.children}],
            }
          : {type: 'emphasis', children};
    }
    const wrapperEntry: Entry = {
      node: wrapper,
      previous: openerEntry,
      next: closerEntry,
    };
    openerEntry.next = wrapperEntry;
    closerEntry.previous = wrapperEntry;
    openerItem.depthAfter = innerDepth + 1;
    opener.length -= use;
    closer.length -= use;
    opener.node.value = opener.character.repeat(opener.length);
    closer.node.value = closer.character.repeat(closer.length);
    if (opener.length === 0) {
      unlink(openerEntry);
      leave(openerItem);
    }
    if (closer.length === 0) {
      unlink(closerEntry);
      const next: StackRun | null = closerItem.next;
      leave(closerItem);
      closerItem = next;
    }
  }
  // An unpaired run is text, joined to the text beside it.
  const leftover = new Set<object>(
    delimiters.filter(run => run.length > 0).map(run => run.node),
  );
  const result: PhrasingNode[] = [];
  let previousIsLeftover = false;
  for (let entry = head.next; entry != null; entry = entry.next) {
    const {node} = entry;
    const isLeftover = leftover.has(node);
    const last = result[result.length - 1];
    if (
      node.type === 'text' &&
      last?.type === 'text' &&
      (isLeftover || previousIsLeftover)
    ) {
      result[result.length - 1] = {...last, value: last.value + node.value};
      previousIsLeftover = true;
      continue;
    }
    result.push(
      isLeftover
        ? {type: 'text', value: (node as {value: string}).value}
        : node,
    );
    previousIsLeftover = isLeftover;
  }
  return result;
}

/** True when the character at `index` is preceded by an odd backslash run. */
function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

/**
 * Find the closing delimiter for `$…$` math on the same line.
 *
 * The whitespace and numeric-edge rules mirror common dollar-math parsers:
 * whitespace cannot hug the delimiters, a digit cannot sit immediately before
 * the opener or after the closer, and `$$` is reserved for display math. The
 * numeric guard prevents ordinary prose such as "$20 and $30" from becoming a
 * formula even in a math-enabled document.
 */
function isInlineMathStart(text: string, index: number): boolean {
  return (
    text[index] === '$' &&
    text[index - 1] !== '$' &&
    text[index + 1] !== '$' &&
    text[index + 1] != null &&
    !/\s/.test(text[index + 1]) &&
    !/\d/.test(text[index - 1] ?? '') &&
    !isEscaped(text, index)
  );
}

function findInlineMathEnd(text: string, start: number): number {
  if (!isInlineMathStart(text, start)) {
    return -1;
  }

  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === '\n') {
      return -1;
    }
    if (text[index] !== '$' || isEscaped(text, index)) {
      continue;
    }
    // An unescaped dollar ends this candidate: it either forms a valid closer
    // or makes the whole span literal. Never skip over one and pair with a
    // later dollar, which would swallow currency or another expression.
    if (
      text[index - 1] === '$' ||
      text[index + 1] === '$' ||
      /\s/.test(text[index - 1]) ||
      /\d/.test(text[index + 1] ?? '')
    ) {
      return -1;
    }
    return index;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Inline parser
// ---------------------------------------------------------------------------

/**
 * Match a fullwidth bracket citation 【id】 at position `i`.
 * Returns the sourceId and end index, or null if no match.
 */
function matchFullwidthCitation(
  text: string,
  i: number,
  opts: ResolvedOptions,
): {sourceId: string; end: number} | null {
  if (!opts.sourceIds || text[i] !== '\u3010') {
    return null;
  }
  const closeIndex = text.indexOf('\u3011', i + 1);
  if (closeIndex === -1) {
    return null;
  }
  const id = text.slice(i + 1, closeIndex);
  if (id.length === 0 || !opts.sourceIds.has(id)) {
    return null;
  }
  return {sourceId: id, end: closeIndex + 1};
}

/**
 * Match a bracket citation [id] at position `i`.
 * Only matches if the id exists in sourceIds and is NOT followed by `(` (link).
 */
function matchBracketCitation(
  text: string,
  i: number,
  opts: ResolvedOptions,
): {sourceId: string; end: number} | null {
  if (!opts.sourceIds || text[i] !== '[') {
    return null;
  }
  const closeIndex = text.indexOf(']', i + 1);
  if (closeIndex === -1) {
    return null;
  }
  if (text[closeIndex + 1] === '(') {
    return null;
  }
  const id = text.slice(i + 1, closeIndex);
  if (id.length === 0 || !opts.sourceIds.has(id)) {
    return null;
  }
  return {sourceId: id, end: closeIndex + 1};
}

type ExtensionMatch =
  | {readonly status: 'none'}
  | {readonly status: 'defer'}
  | {
      readonly status: 'match';
      readonly node: RuntimeExtensionNode;
      readonly end: number;
    };

function currentLineStart(source: string, offset: number): number {
  return source.lastIndexOf('\n', offset - 1) + 1;
}

function matchExtensionSyntax(
  source: string,
  offset: number,
  context: 'inline' | 'block',
  opts: ResolvedOptions,
): ExtensionMatch {
  const byFirstCharacter =
    context === 'inline'
      ? opts.plugins?.inlineByFirstCharacter
      : opts.allowBlockSyntax === false
        ? undefined
        : opts.plugins?.blockByFirstCharacter;
  const candidates = byFirstCharacter?.get(source[offset]);
  if (candidates == null) {
    return {status: 'none'};
  }

  const seen = new Set<PreparedSyntaxContribution>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    let fullPrefix = false;
    for (const prefix of candidate.contribution.startsWith) {
      if (source.startsWith(prefix, offset)) {
        fullPrefix = true;
        break;
      }
      if (!opts.isFinal) {
        const remaining = source.slice(offset);
        if (remaining.length < prefix.length && prefix.startsWith(remaining)) {
          return {status: 'defer'};
        }
      }
    }
    if (!fullPrefix) {
      continue;
    }

    const end = Math.min(
      source.length,
      offset + candidate.contribution.maxSpan,
    );
    let result: ReturnType<typeof candidate.contribution.tokenize>;
    try {
      result = candidate.contribution.tokenize({
        source: end === source.length ? source : source.slice(0, end),
        offset,
        end,
        isFinal: opts.isFinal,
        context,
        lineStart: currentLineStart(source, offset),
        column: offset - currentLineStart(source, offset),
      });
    } catch (error) {
      reportMarkdownPluginFailure(candidate.pluginName, 'syntax', error);
      continue;
    }
    if (
      result == null ||
      typeof result !== 'object' ||
      typeof (result as {then?: unknown}).then === 'function'
    ) {
      reportMarkdownPluginFailure(
        candidate.pluginName,
        'syntax',
        new TypeError('Tokenizer returned an invalid result'),
      );
      continue;
    }
    if (result.status === 'no-match') {
      continue;
    }
    if (result.status === 'defer') {
      return !opts.isFinal &&
        end === source.length &&
        source.length - offset < candidate.contribution.maxSpan
        ? {status: 'defer'}
        : {status: 'none'};
    }
    if (
      result.status !== 'match' ||
      !Number.isInteger(result.end) ||
      result.end <= offset ||
      result.end > end ||
      result.node.type !== 'extension' ||
      result.node.plugin !== candidate.pluginName ||
      result.node.display !== context ||
      result.node.name.trim() === '' ||
      !isMarkdownPluginData(result.node.data) ||
      !opts.plugins?.renderers.has(
        `${candidate.pluginName}\0${result.node.name}`,
      )
    ) {
      reportMarkdownPluginFailure(
        candidate.pluginName,
        'syntax',
        new TypeError('Tokenizer returned an invalid extension node'),
      );
      continue;
    }
    const rawNode = result.node as typeof result.node & {
      readonly source?: unknown;
      readonly position?: unknown;
    };
    const {
      source: _ignoredSource,
      position: _ignoredPosition,
      ...safeNode
    } = rawNode;
    const absoluteStart = (opts.baseOffset ?? 0) + offset;
    const absoluteEnd = (opts.baseOffset ?? 0) + result.end;
    return {
      status: 'match',
      end: result.end,
      node: Object.freeze({
        ...safeNode,
        data: freezeMarkdownPluginData(result.node.data),
        source: source.slice(offset, result.end),
        ...(opts.sourceRanges && context === 'block'
          ? {
              position: Object.freeze({
                start: Object.freeze({offset: absoluteStart}),
                end: Object.freeze({offset: absoluteEnd}),
              }),
            }
          : null),
      }) as RuntimeExtensionNode,
    };
  }
  return {status: 'none'};
}

type ParseOptionsWithoutPlugins = Omit<ParseOptions, 'plugins'>;
type MathParseOptionsWithoutPlugins = Omit<MathParseOptions, 'plugins'>;
type IncrementalParseOptionsWithoutPlugins = Omit<
  IncrementalParseOptions,
  'plugins'
>;
type IncrementalMathParseOptionsWithoutPlugins = Omit<
  IncrementalMathParseOptions,
  'plugins'
>;

/**
 * The length of the line ending at `index` in inline text: 1 for LF, 2 for
 * CRLF (the parser keeps a CRLF line's `\r`), or 0 when none starts there.
 */
function lineEndingLengthAt(text: string, index: number): number {
  if (text[index] === '\n') {
    return 1;
  }
  return text[index] === '\r' && text[index + 1] === '\n' ? 2 : 0;
}

export function parseInline(
  text: string,
  sourceIds?: ReadonlySet<string>,
): InlineNode[];
export function parseInline(
  text: string,
  options: MathParseOptionsWithoutPlugins,
): InlineNodeWithMath[];
export function parseInline(
  text: string,
  options: ParseOptionsWithoutPlugins,
): InlineNode[];
export function parseInline<
  const Plugins extends ReadonlyArray<MarkdownPluginEntry>,
>(
  text: string,
  options: ParseOptionsWithoutPlugins & {plugins: Plugins},
): InlineNode<MarkdownExtensionsOf<Plugins>>[];
export function parseInline<
  const Plugins extends ReadonlyArray<MarkdownPluginEntry>,
>(
  text: string,
  options: MathParseOptionsWithoutPlugins & {plugins: Plugins},
): InlineNodeWithMath<MarkdownExtensionsOf<Plugins>>[];
export function parseInline(
  text: string,
  arg?: ReadonlySet<string> | RuntimeParseOptions,
): RuntimeInlineNode[] {
  return projectInlineNodes(
    parseInlineAstRuntime(text, arg),
    wantsLegacyRanges(arg),
  );
}

/**
 * Parse inline Markdown into the canonical immutable Astryx AST.
 *
 * Unlike `parseInline`, this returns MDAST-aligned node names and fields. Math
 * nodes are present only when `math: true`, and plugin extension nodes are
 * inferred from the ordered `plugins` tuple.
 */
export function parseInlineAst(
  text: string,
  sourceIds?: ReadonlySet<string>,
): MarkdownAstPhrasingContent[];
export function parseInlineAst(
  text: string,
  options: ParseOptionsWithoutPlugins | MathParseOptionsWithoutPlugins,
): MarkdownAstPhrasingContent[];
export function parseInlineAst<
  const Plugins extends ReadonlyArray<MarkdownPluginEntry>,
>(
  text: string,
  options: (ParseOptionsWithoutPlugins | MathParseOptionsWithoutPlugins) & {
    plugins: Plugins;
  },
): MarkdownAstPhrasingContent<MarkdownExtensionsOf<Plugins>>[];
export function parseInlineAst(
  text: string,
  arg?: ReadonlySet<string> | RuntimeParseOptions,
): MarkdownAstPhrasingContent<RuntimeExtensionNode>[] {
  return parseInlineAstRuntime(text, arg);
}

function parseInlineAstRuntime(
  text: string,
  arg?: ReadonlySet<string> | RuntimeParseOptions,
): MarkdownAstPhrasingContent<RuntimeExtensionNode>[] {
  const opts = resolveOptions(arg);
  const nodes = parseInlineEntry(text, opts);
  if ((opts.plugins?.transforms.length ?? 0) === 0) {
    return nodes;
  }
  const transformed = applyMarkdownTransforms(
    {type: 'root', children: [{type: 'paragraph', children: nodes}]},
    opts.plugins,
    text,
    opts.isFinal,
    'inline',
  );
  const paragraph = transformed.children[0];
  return paragraph?.type === 'paragraph' ? [...paragraph.children] : nodes;
}

/**
 * Internal block-level inline entry point: parses, then applies the GFM
 * autolink transform when enabled. Recursive calls inside `parseInlineImpl`
 * (link labels, bold/italic/strikethrough bodies) intentionally bypass this
 * wrapper and call `parseInlineImpl` directly so the transform runs only on
 * the outermost block's inline tree — letting `transformAutolinks` decide
 * which subtrees to descend into (text, bold, italic, strikethrough) and
 * which to skip (link, code, math, image, citation, break).
 */
function parseInlineEntry(
  text: string,
  opts: ResolvedOptions,
  context: 'default' | 'tableCell' = 'default',
): MarkdownAstPhrasingContent<RuntimeExtensionNode>[] {
  const nodes = parseInlineImpl(text, opts, context);
  return opts.autolink === 'gfm' ? transformAutolinks(nodes) : nodes;
}

function parseInlineImpl(
  text: string,
  opts: ResolvedOptions,
  context: 'default' | 'tableCell' = 'default',
): MarkdownAstPhrasingContent<RuntimeExtensionNode>[] {
  const nodes: MarkdownAstPhrasingContent<RuntimeExtensionNode>[] = [];
  // Runs of `*` and `_`, in order; each is also a text node in `nodes` until
  // resolveEmphasis pairs it. Created only when a run appears.
  let delimiters: DelimiterRun[] | null = null;
  let delimiterNodes: Set<object> | null = null;
  // Code-span closers and link-text closers, each indexed when first asked,
  // so neither code spans nor link text rescan the text.
  const inlineIndex = inlineIndexOf(text, opts.linkDefs);
  // Only a plugin that actually contributes INLINE syntax may cost anything
  // per source position. A transform-only list contributes none, so it takes
  // the same path as an omitted or empty one: no candidate probe per
  // position, and no map lookup per character in the plain-text scan below.
  const inlineExtensionStarts =
    opts.plugins != null && opts.plugins.inlineByFirstCharacter.size > 0
      ? opts.plugins.inlineByFirstCharacter
      : undefined;
  let i = 0;

  while (i < text.length) {
    // --- Escape: a backslash escapes ASCII punctuation, and before a line
    // break it is a hard break; before anything else it is a literal
    // backslash (CommonMark 0.31, backslash escapes and hard line breaks).
    if (text[i] === '\\' && i + 1 < text.length) {
      const lineEnding = lineEndingLengthAt(text, i + 1);
      if (lineEnding > 0) {
        nodes.push({type: 'break'});
        i += 1 + lineEnding;
        continue;
      }
      if (isAsciiPunctuation(text[i + 1])) {
        nodes.push({type: 'text', value: text[i + 1]});
        i += 2;
        continue;
      }
    }

    // --- Inline code: a backtick string closes at the next backtick string
    // of the same length, never part of a longer one; with none, it is text
    // (CommonMark 0.31 §6.1).
    if (text[i] === '`') {
      let openIndex = i;
      while (text[openIndex] === '`') {
        openIndex++;
      }
      const tickCount = openIndex - i;
      const closeIndex = inlineIndex.backtickCloser(openIndex, tickCount);
      if (closeIndex === -1) {
        appendInlineText(nodes, delimiterNodes, text.slice(i, openIndex));
        i = openIndex;
        continue;
      }
      nodes.push({
        type: 'inlineCode',
        value:
          context === 'tableCell'
            ? text.slice(openIndex, closeIndex).replace(/\\\|/g, '|')
            : text.slice(openIndex, closeIndex),
      });
      i = closeIndex + tickCount;
      continue;
    }

    // --- Inline math (opt-in; code takes precedence) ---
    if (opts.math && text[i] === '$') {
      const closeIndex = findInlineMathEnd(text, i);
      if (closeIndex !== -1) {
        nodes.push({
          type: 'inlineMath',
          value: text.slice(i + 1, closeIndex),
        });
        i = closeIndex + 1;
        continue;
      }
    }

    // --- Citation: fullwidth 【id】 ---
    {
      const citation = matchFullwidthCitation(text, i, opts);
      if (citation) {
        nodes.push({type: 'citation', sourceId: citation.sourceId});
        i = citation.end;
        continue;
      }
    }

    // --- Image ![alt](src) ---
    if (text[i] === '!' && text[i + 1] === '[') {
      const altClose = inlineIndex.openerClose(i + 1);
      if (altClose !== -1 && text[altClose + 1] === '(') {
        const angleClose = angleDestinationClose(text, altClose + 1);
        const srcClose =
          angleClose === 'refused'
            ? -1
            : (angleClose ?? inlineIndex.closingParen(altClose + 1));
        if (srcClose !== -1) {
          const src = decodeLinkDestination(
            inlineDestination(text.slice(altClose + 2, srcClose)),
          );
          if (!isSafeMarkdownParserUrl(src)) {
            // Dangerous scheme — emit as plain text.
            nodes.push({type: 'text', value: text.slice(i, srcClose + 1)});
          } else {
            nodes.push({
              type: 'image',
              url: src,
              alt: imageAlt(text.slice(i + 2, altClose), opts, context),
            });
          }
          i = srcClose + 1;
          continue;
        }
      }
    }

    // --- Reference image ![alt][label] / ![alt][] / ![alt] ---
    if (opts.linkDefs != null && text[i] === '!' && text[i + 1] === '[') {
      const ref = matchReferenceImage(
        text,
        i,
        opts.linkDefs,
        inlineIndex,
        opts,
        context,
      );
      if (ref) {
        nodes.push(ref.node);
        i = ref.end;
        continue;
      }
    }

    // --- Citation: bracket [id] (before link — link requires `(` after `]`) ---
    {
      const citation = matchBracketCitation(text, i, opts);
      if (citation) {
        nodes.push({type: 'citation', sourceId: citation.sourceId});
        i = citation.end;
        continue;
      }
    }

    // --- Link [text](url) ---
    if (text[i] === '[') {
      const textClose = inlineIndex.openerClose(i);
      if (textClose !== -1 && text[textClose + 1] === '(') {
        const angleClose = angleDestinationClose(text, textClose + 1);
        const urlClose =
          angleClose === 'refused'
            ? -1
            : (angleClose ?? inlineIndex.closingParen(textClose + 1));
        if (urlClose !== -1) {
          const href = decodeLinkDestination(
            inlineDestination(text.slice(textClose + 2, urlClose)),
          );
          if (!isSafeMarkdownParserUrl(href)) {
            // Dangerous scheme — emit as plain text instead of a link.
            nodes.push({type: 'text', value: text.slice(i, urlClose + 1)});
          } else {
            nodes.push({
              type: 'link',
              url: href,
              children: parseInlineImpl(
                text.slice(i + 1, textClose),
                protectedInlineOptions(opts),
                context,
              ),
            });
          }
          i = urlClose + 1;
          continue;
        }
      }
    }

    // --- Reference link [text][label] / [text][] / [text] ---
    if (opts.linkDefs != null && text[i] === '[') {
      const ref = matchReferenceLink(
        text,
        i,
        opts.linkDefs,
        opts,
        context,
        inlineIndex,
      );
      if (ref) {
        nodes.push(ref.node);
        i = ref.end;
        continue;
      }
    }

    // --- Emphasis and strong: a run of `*` or `_` is a delimiter run,
    // paired with the others once the whole text is read (CommonMark 0.31
    // §6.2; see resolveEmphasis). ---
    if (text[i] === '*' || text[i] === '_') {
      const character = text[i] as '*' | '_';
      let runEnd = i + 1;
      while (text[runEnd] === character) {
        runEnd++;
      }
      const run = delimiterRun(character, text, i, runEnd);
      if (run.canOpen || run.canClose) {
        nodes.push(run.node);
        (delimiters ??= []).push(run);
        (delimiterNodes ??= new Set()).add(run.node);
        i = runEnd;
        continue;
      }
      // A run that can neither open nor close is text; a plugin that starts
      // with it may still read it below.
      if (inlineExtensionStarts?.has(character) !== true) {
        appendInlineText(nodes, delimiterNodes, text.slice(i, runEnd));
        i = runEnd;
        continue;
      }
    }

    // --- Strikethrough: ~~ ---
    if (text[i] === '~' && text[i + 1] === '~') {
      const closeIndex = text.indexOf('~~', i + 2);
      if (closeIndex !== -1) {
        nodes.push({
          type: 'delete',
          children: parseInlineImpl(
            text.slice(i + 2, closeIndex),
            opts,
            context,
          ),
        });
        i = closeIndex + 2;
        continue;
      }
    }

    // --- Extension syntax (built-ins and protected contexts win) ---
    if (inlineExtensionStarts !== undefined) {
      const extension = matchExtensionSyntax(text, i, 'inline', opts);
      if (extension.status === 'match') {
        nodes.push(
          extension.node as Extract<RuntimeExtensionNode, {display: 'inline'}>,
        );
        i = extension.end;
        continue;
      }
      if (extension.status === 'defer') {
        break;
      }
    }

    // --- Character reference: the characters it names, as plain text ---
    if (text[i] === '&') {
      const reference = matchCharacterReference(text, i);
      if (reference != null) {
        appendInlineText(nodes, delimiterNodes, reference.value);
        i = reference.end;
        continue;
      }
    }

    // --- Plain text (with line-break detection) ---
    let end = i + 1;
    while (
      end < text.length &&
      !'*_~`[!\\\n\u3010&'.includes(text[end]) &&
      !(opts.math && text[end] === '$') &&
      (inlineExtensionStarts === undefined ||
        !inlineExtensionStarts.has(text[end]))
    ) {
      end++;
    }

    const content = text.slice(i, end);

    // Detect trailing-space line break: 2+ spaces immediately before the
    // line ending. A CRLF line keeps its `\r` in the text; it belongs to the
    // line ending, not to the spaces before it.
    if (end < text.length && text[end] === '\n') {
      const line = content.endsWith('\r') ? content.slice(0, -1) : content;
      // Counted from the end: a pattern such as / +$/ retries from every
      // space in a long run that does not end the line, so its time grows
      // with the square of the run.
      let spaces = 0;
      while (line[line.length - 1 - spaces] === ' ') {
        spaces++;
      }
      const trimmed = line.slice(0, line.length - spaces);
      if (spaces >= 2) {
        if (trimmed.length > 0) {
          appendInlineText(nodes, delimiterNodes, trimmed);
        }
        nodes.push({type: 'break'});
        i = end + 1;
        continue;
      }
    }

    appendInlineText(nodes, delimiterNodes, content);
    i = end;
  }
  return delimiters == null ? nodes : resolveEmphasis(nodes, delimiters);
}

// ---------------------------------------------------------------------------
// GFM autolink post-pass (opt-in via ParseOptions.autolink === 'gfm')
// ---------------------------------------------------------------------------

// Character classes used in autolink patterns.
const ANY_NON_WHITESPACE_OR_ANGLE = '[^\\s<]+';
const SCHEME = 'https?:\\/\\/';
const EMAIL_LOCAL_PART = '[A-Za-z0-9._%+-]+';
const DOMAIN_LABEL = '[A-Za-z0-9-]+';
const DOMAIN_WITH_DOT = `${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})+`;
const ANGLE_SCHEME = '[a-zA-Z][a-zA-Z0-9+.-]*';
const ANGLE_URL_BODY = '[^<>\\s]*';

/** Bare http(s) URL up to whitespace or `<`. Trailing punctuation is peeled afterwards. */
const URL_LITERAL_RE = new RegExp(
  `${SCHEME}${ANY_NON_WHITESPACE_OR_ANGLE}`,
  'g',
);

/** Bare www. URL. Resulting href gets `http://` prepended. */
const WWW_LITERAL_RE = new RegExp(`www\\.${ANY_NON_WHITESPACE_OR_ANGLE}`, 'g');

/** Bare email: local-part@domain (at least one dot in domain). */
const EMAIL_LITERAL_RE = new RegExp(
  `${EMAIL_LOCAL_PART}@${DOMAIN_WITH_DOT}`,
  'g',
);

/** Angle-bracket autolink: `<scheme:url>` (CommonMark §6.5). */
const ANGLE_URL_RE = new RegExp(`<(${ANGLE_SCHEME}:${ANGLE_URL_BODY})>`, 'g');

/** Angle-bracket email: `<user@host.tld>`. */
const ANGLE_EMAIL_RE = new RegExp(
  `<(${EMAIL_LOCAL_PART}@${DOMAIN_WITH_DOT})>`,
  'g',
);

/** Characters treated as trailing sentence punctuation per GFM §6.9. */
const TRAILING_PUNCT_CHARS = new Set('?!.,:*_~');

/** Characters valid in an email local part (used for boundary detection). */
const EMAIL_LOCAL_CHARS = new Set(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._%+-@',
);

interface AutolinkMatch {
  start: number;
  end: number;
  href: string;
  display: string;
}

/**
 * Peel trailing sentence-end punctuation and unbalanced trailing `)` off a
 * bare URL. Mirrors GFM §6.9: `?!.,:*_~` immediately after the URL aren't
 * part of it; a trailing `)` is excluded if there are more `)` than `(` in
 * the candidate (so `(https://example.com)` ends at the second `)` but
 * `https://example.com/Foo_(bar)` keeps the inner pair).
 */
function peelTrailingPunctAndParens(url: string): string {
  let s = url;
  while (s.length > 0) {
    // Peel trailing punctuation characters in one pass.
    if (TRAILING_PUNCT_CHARS.has(s[s.length - 1])) {
      let end = s.length - 1;
      while (end > 0 && TRAILING_PUNCT_CHARS.has(s[end - 1])) {
        end--;
      }
      s = s.slice(0, end);
      continue;
    }
    if (s.endsWith(')')) {
      let open = 0;
      let close = 0;
      for (let idx = 0; idx < s.length; idx++) {
        if (s[idx] === '(') {
          open++;
        } else if (s[idx] === ')') {
          close++;
        }
      }
      if (close > open) {
        s = s.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return s;
}

/** Characters that, when preceding a URL, indicate it's part of a larger token. */
const URL_CONTINUATION_CHARS = new Set(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/=',
);

/**
 * The character immediately before a bare-URL or bare-www match must not
 * make the URL look like the tail of a larger token (`xhttps`, `=https://`,
 * `/https://`). null means start-of-text — always allowed.
 */
function isUrlBoundaryChar(ch: string | undefined): boolean {
  if (ch == null) {
    return true;
  }
  return !URL_CONTINUATION_CHARS.has(ch);
}

function scanAutolinksInText(text: string): AutolinkMatch[] {
  const matches: AutolinkMatch[] = [];

  // <scheme:url> angle-bracket form
  {
    const re = new RegExp(ANGLE_URL_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const url = m[1];
      // Skip dangerous URL schemes (javascript:, vbscript:, data:text/html)
      if (!isSafeMarkdownParserUrl(url)) {
        continue;
      }
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        href: url,
        display: url,
      });
    }
  }

  // <email> angle-bracket form
  {
    const re = new RegExp(ANGLE_EMAIL_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const email = m[1];
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        href: `mailto:${email}`,
        display: email,
      });
    }
  }

  // bare https?:// URL
  {
    const re = new RegExp(URL_LITERAL_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const prev = text[m.index - 1];
      if (!isUrlBoundaryChar(prev)) {
        continue;
      }
      if (text.slice(m.index - 2, m.index) === '](') {
        continue;
      }
      const cleaned = peelTrailingPunctAndParens(m[0]);
      if (cleaned.length === 0) {
        continue;
      }
      matches.push({
        start: m.index,
        end: m.index + cleaned.length,
        href: cleaned,
        display: cleaned,
      });
    }
  }

  // bare www. URL
  {
    const re = new RegExp(WWW_LITERAL_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const prev = text[m.index - 1];
      if (!isUrlBoundaryChar(prev)) {
        continue;
      }
      // Don't match inside an https://www… capture from the previous pattern
      if (text.slice(m.index - 3, m.index) === '://') {
        continue;
      }
      const cleaned = peelTrailingPunctAndParens(m[0]);
      if (cleaned.length === 0) {
        continue;
      }
      matches.push({
        start: m.index,
        end: m.index + cleaned.length,
        href: `http://${cleaned}`,
        display: cleaned,
      });
    }
  }

  // bare email
  {
    const re = new RegExp(EMAIL_LITERAL_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const prev = text[m.index - 1];
      // Reject if previous char could be part of the local part or sits in
      // a position that would make this match continuation of something
      // bigger (`name@x.y@host`, `foo+bar@x`, `mailto:user@host`).
      if (prev != null && EMAIL_LOCAL_CHARS.has(prev)) {
        continue;
      }
      if (text.slice(Math.max(0, m.index - 7), m.index) === 'mailto:') {
        continue;
      }
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        href: `mailto:${m[0]}`,
        display: m[0],
      });
    }
  }

  // Sort by start; first-match-wins on overlaps so e.g. an angle-bracket
  // <https://x> outranks the bare https://x inside it.
  matches.sort((a, b) => a.start - b.start);
  const resolved: AutolinkMatch[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      resolved.push(m);
      lastEnd = m.end;
    }
  }
  return resolved;
}

/**
 * Split a text-node `content` string into a sequence of text + link nodes
 * based on autolink matches.
 */
function splitTextOnAutolinks(
  content: string,
): MarkdownAstPhrasingContent<RuntimeExtensionNode>[] {
  const matches = scanAutolinksInText(content);
  if (matches.length === 0) {
    return [{type: 'text', value: content}];
  }
  const out: MarkdownAstPhrasingContent<RuntimeExtensionNode>[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      out.push({type: 'text', value: content.slice(cursor, m.start)});
    }
    out.push({
      type: 'link',
      url: m.href,
      children: [{type: 'text', value: m.display}],
    });
    cursor = m.end;
  }
  if (cursor < content.length) {
    out.push({type: 'text', value: content.slice(cursor)});
  }
  return out;
}

/**
 * Walk an inline-node tree and replace bare URLs / emails inside `text`
 * nodes with `link` nodes. Recurses into emphasis containers
 * (`bold`/`italic`/`strikethrough`) so wrapped URLs link too, but never
 * descends into existing `link` children (no nested links), `code` content,
 * `image` alt text, `citation`, or `break`. Runs only on the outermost
 * block's inline tree (see `parseInlineEntry`).
 */
function transformAutolinks(
  nodes: ReadonlyArray<MarkdownAstPhrasingContent<RuntimeExtensionNode>>,
): MarkdownAstPhrasingContent<RuntimeExtensionNode>[] {
  const out: MarkdownAstPhrasingContent<RuntimeExtensionNode>[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      const split = splitTextOnAutolinks(node.value);
      for (const seg of split) {
        const last = out[out.length - 1];
        if (seg.type === 'text' && last?.type === 'text') {
          out[out.length - 1] = {...last, value: last.value + seg.value};
        } else {
          out.push(seg);
        }
      }
    } else if (
      node.type === 'strong' ||
      node.type === 'emphasis' ||
      node.type === 'delete'
    ) {
      out.push({...node, children: transformAutolinks(node.children)});
    } else {
      out.push(node);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block parser helpers
// ---------------------------------------------------------------------------

function getIndent(line: string): number {
  let count = 0;
  while (count < line.length && line[count] === ' ') {
    count++;
  }
  return count;
}

/** HR: 3+ identical markers (-, *, _) optionally separated by spaces. */
function isHorizontalRule(line: string): boolean {
  const trimmed = line.trim();
  const ch = trimmed[0];
  if (
    trimmed.length < 3 ||
    (ch !== '-' && ch !== '*' && ch !== '_') ||
    !trimmed.endsWith(ch)
  ) {
    return false;
  }
  // Three or more of one marker, spaces between allowed. Both ends are
  // checked first and the scan stops at the first other character, so a long
  // line that is not a rule costs next to nothing — this runs on every line
  // at every nesting level.
  let count = 0;
  for (let idx = 0; idx < trimmed.length; idx++) {
    const character = trimmed[idx];
    if (character === ch) {
      count++;
    } else if (character !== ' ') {
      return false;
    }
  }
  return count >= 3;
}

/**
 * Whether a line holds a pipe that could delimit table cells.
 *
 * A backslash-escaped `\|` is literal text inside one cell — `splitTableRow`
 * keeps it verbatim — so a line whose only pipes are escaped shows no partial
 * table syntax while it streams. Used by `trimUnsettledStructural` to decide
 * whether an unfinished trailing line is a table header worth holding back.
 */
function hasUnescapedPipe(line: string): boolean {
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\') {
      // Skip the escaped character, whatever it is.
      index++;
      continue;
    }
    if (line[index] === '|') {
      return true;
    }
  }
  return false;
}

/** GFM separator row: cells contain only dashes/colons. */
function isTableSeparator(line: string): boolean {
  if (!line.includes('|')) {
    return false;
  }
  const cells = line.split('|').map(cell => cell.trim());
  const nonEmpty = cells.filter(cell => cell.length > 0);
  return nonEmpty.length > 0 && nonEmpty.every(cell => /^:?-+:?$/.test(cell));
}

/**
 * The same options for content parsed out of an enclosing block. Ranges are a
 * top-level contract: a list item's or a blockquote's children are parsed from
 * text the caller reassembled (markers and `>` prefixes stripped), so an
 * offset into it would not address the document.
 */
function nested(opts: ResolvedOptions): ResolvedOptions {
  return {
    ...opts,
    allowBlockSyntax: false,
    sourceRanges: false,
    astPositions: false,
    blockDepth: opts.blockDepth + 1,
    baseLine: undefined,
    lineOrigin: undefined,
  };
}

/**
 * The same options for content parsed out of an enclosing block whose input
 * lines came from the document lines `origin` names. Without source lines,
 * exactly `nested(opts)`.
 */
function nestedAt(
  opts: ResolvedOptions,
  origin: ReadonlyArray<number> | null,
): ResolvedOptions {
  return origin == null ? nested(opts) : {...nested(opts), lineOrigin: origin};
}

function blockExtensionColumn(line: string): number | null {
  const indentation = line.length - line.trimStart().length;
  return indentation <= 3 ? indentation : null;
}

/**
 * A block quote marker: up to three spaces of indentation, then `>`
 * (CommonMark 0.31 §5.1). Text may follow the `>` directly.
 */
const QUOTE_MARKER = /^ {0,3}>/;

/** A quoted line's content: the marker and the one space or tab after it. */
function quotedContent(line: string): string {
  return line.replace(/^ {0,3}>[ \t]?/, '');
}

/**
 * Returns true when a line could start a new block — used to stop paragraph
 * continuation.  Every regex here uses bounded or single-class quantifiers
 * to avoid ReDoS.
 */
function isBlockStart(line: string): boolean {
  if (/^ {0,3}#{1,6} /.test(line)) {
    return true;
  }
  if (FENCE_LINE.test(line)) {
    return true;
  }
  if (isHorizontalRule(line)) {
    return true;
  }
  if (QUOTE_MARKER.test(line)) {
    return true;
  }
  if (/^ {0,9}[-*+] /.test(line)) {
    return true;
  }
  if (/^ {0,9}0*1[.)] /.test(line)) {
    return true;
  }
  if (line.includes('|')) {
    return true;
  }
  return false;
}

/**
 * A lazy continuation may omit an owning quote marker or list indentation only
 * while the deepest open leaf is a paragraph. A blank line or an interrupting
 * block start closes that opportunity.
 */
function canContinueParagraphLazily(
  lines: ReadonlyArray<string>,
  lineIndex: number,
  insideList = false,
): boolean {
  const line = lines[lineIndex];
  if (line == null || line.trim() === '') {
    return false;
  }
  if (
    /^ {0,3}#{1,6} /.test(line) ||
    FENCE_LINE.test(line) ||
    isHorizontalRule(line) ||
    QUOTE_MARKER.test(line) ||
    /^ {0,9}[-*+] /.test(line) ||
    (insideList ? /^ {0,9}\d+[.)] /.test(line) : /^ {0,9}0*1[.)] /.test(line))
  ) {
    return false;
  }
  return !(
    line.includes('|') &&
    lineIndex + 1 < lines.length &&
    isTableSeparator(lines[lineIndex + 1])
  );
}

function endsInParagraph(
  blocks: ReadonlyArray<MarkdownAstBlockContent<RuntimeExtensionNode>>,
): boolean {
  const last = blocks[blocks.length - 1];
  if (last == null) {
    return false;
  }
  if (last.type === 'paragraph') {
    return true;
  }
  if (last.type === 'blockquote') {
    return endsInParagraph(last.children);
  }
  if (last.type === 'list') {
    const item = last.children[last.children.length - 1];
    return item != null && endsInParagraph(item.children);
  }
  return false;
}

function sourceEndsInParagraph(source: string, opts: ResolvedOptions): boolean {
  // A parse at the next depth may already have read this content: the probe
  // at each nesting level then costs a lookup, not another parse of every
  // level below it.
  const record = opts.nestedParses;
  if (record != null) {
    record.map ??= new Map();
  }
  const known = record?.map?.get(nestedParseKey(opts.blockDepth + 1, source));
  return endsInParagraph(
    known ?? parseMarkdownImpl(source, {...nested(opts), probing: true}),
  );
}

function splitTableRow(line: string): string[] {
  let start = 0;
  let end = line.length;
  // A row's indentation, and its leading pipe, open no cell.
  while (start < end && (line[start] === ' ' || line[start] === '\t')) {
    start++;
  }
  if (line[start] === '|') {
    start++;
    while (start < end && line[start] === ' ') {
      start++;
    }
  }
  while (end > start && line[end - 1] === ' ') {
    end--;
  }
  if (end > start && line[end - 1] === '|') {
    end--;
  }
  // Split on unescaped pipes (not preceded by backslash)
  const content = line.slice(start, end);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < content.length; i++) {
    if (
      content[i] === '\\' &&
      i + 1 < content.length &&
      content[i + 1] === '|'
    ) {
      // Escaped pipe — keep the backslash-pipe literal for parseInline to handle
      current += '\\|';
      i++;
    } else if (content[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += content[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseTable(
  lines: string[],
  lineIndex: number,
  opts: ResolvedOptions,
): {node: MarkdownAstBlockContent<RuntimeExtensionNode>; nextIndex: number} {
  const headers: MarkdownAstTableCell<RuntimeExtensionNode>[] = splitTableRow(
    lines[lineIndex],
  ).map(cell => ({
    type: 'tableCell',
    children: parseInlineEntry(cell, opts, 'tableCell'),
  }));
  const alignments: TableAlignment[] = splitTableRow(lines[lineIndex + 1]).map(
    cell => {
      const trimmed = cell.trim();
      const leftAligned = trimmed.startsWith(':');
      const rightAligned = trimmed.endsWith(':');
      return leftAligned && rightAligned
        ? 'center'
        : rightAligned
          ? 'right'
          : leftAligned
            ? 'left'
            : null;
    },
  );
  const rows: MarkdownAstTableRow<RuntimeExtensionNode>[] = [];
  let rowIndex = lineIndex + 2;
  while (
    rowIndex < lines.length &&
    lines[rowIndex].includes('|') &&
    lines[rowIndex].trim() !== ''
  ) {
    rows.push({
      type: 'tableRow',
      children: splitTableRow(lines[rowIndex]).map(cell => ({
        type: 'tableCell',
        children: parseInlineEntry(cell, opts, 'tableCell'),
      })),
    });
    rowIndex++;
  }
  const header: MarkdownAstTableRow<RuntimeExtensionNode> = {
    type: 'tableRow',
    children: headers,
  };
  return {
    node: {
      type: 'table',
      align: alignments,
      children: [header, ...rows],
    },
    nextIndex: rowIndex,
  };
}

function listItemSource(
  itemText: string,
  subLines: ReadonlyArray<string>,
  lazyLineIndexes: ReadonlySet<number>,
): string {
  if (subLines.length === 0) {
    return itemText;
  }
  const nonBlankIndents = subLines
    .filter((line, index) => line.trim() !== '' && !lazyLineIndexes.has(index))
    .map(getIndent);
  const minSubIndent =
    nonBlankIndents.length === 0 ? 0 : Math.min(...nonBlankIndents);
  return `${itemText}\n${subLines
    .map((line, index) =>
      line.trim() === ''
        ? ''
        : line.slice(
            lazyLineIndexes.has(index) ? getIndent(line) : minSubIndent,
          ),
    )
    .join('\n')}`;
}

function parseList(
  lines: string[],
  startIndex: number,
  ordered: boolean,
  opts: ResolvedOptions,
  interruptsLazyContinuation: (lineIndex: number) => boolean,
  documentLineOf: ((line: number) => number) | null,
): {node: MarkdownAstBlockContent<RuntimeExtensionNode>; nextIndex: number} {
  const items: MarkdownAstListItem<RuntimeExtensionNode>[] = [];
  const baseIndent = getIndent(lines[startIndex]);
  // Ordered lists may use either '.' or ')' as the marker delimiter
  // (CommonMark 5.2). Capture which one this list starts with so its items
  // must all share it — a change of delimiter starts a new list.
  const orderedStart = ordered
    ? lines[startIndex].match(/^ *(\d+)([.)]) /)
    : null;
  const delim = orderedStart ? orderedStart[2] : '.';
  const escDelim = `\\${delim}`;
  // Bullet lists likewise keep the bullet they start with — `-`, `*`, or
  // `+` — and another bullet starts a new list (CommonMark 0.31 §5.3).
  const bullet = ordered ? null : lines[startIndex].trimStart()[0];
  const itemPattern = ordered
    ? new RegExp(`^ {${baseIndent}}\\d+${escDelim} `)
    : new RegExp(`^ {${baseIndent}}\\${bullet} `);

  const start = orderedStart ? parseInt(orderedStart[1], 10) : undefined;

  let loose = false;
  let index = startIndex;
  // A line that is a thematic break is one, not an item, even where an item
  // could start (CommonMark 0.31 §4.1): `* * *` after `- item` ends the list.
  const startsItem = (line: string) =>
    itemPattern.test(line) && !isHorizontalRule(line);
  while (index < lines.length && startsItem(lines[index])) {
    const itemStart = index;
    const content = ordered
      ? lines[index].replace(new RegExp(`^ *\\d+${escDelim} `), '')
      : lines[index].replace(/^ *[-*+] /, '');
    // Where the item's content starts: past the marker and the spaces after
    // it (one to four; more makes the content indented by one space).
    const markerEnd = lines[index].length - content.length;
    const spacesAfter = getIndent(content);
    const contentColumn =
      spacesAfter >= 4 ? markerEnd : markerEnd + spacesAfter;

    const taskMatch = content.match(/^\[([ xX])\] (.*)/);
    let checked: boolean | undefined;
    let itemText: string;
    if (taskMatch) {
      checked = taskMatch[1].toLowerCase() === 'x';
      itemText = taskMatch[2];
    } else {
      itemText = content;
    }

    index++;

    // Collect sub-content. Lines indented past the marker remain ordinary
    // nested content. A less-indented nonblank line can still belong to the
    // item when the deepest open leaf is a paragraph: CommonMark's lazy
    // continuation rule permits deleting some or all of that indentation.
    const subLines: string[] = [];
    const lazyLineIndexes = new Set<number>();
    let lazyParagraphOpen: boolean | undefined = canContinueParagraphLazily(
      [itemText],
      0,
      true,
    )
      ? true
      : undefined;
    while (index < lines.length && lines[index].trim() !== '') {
      if (getIndent(lines[index]) > baseIndent) {
        subLines.push(lines[index]);
        if (
          lazyParagraphOpen === true &&
          !canContinueParagraphLazily([lines[index].trimStart()], 0)
        ) {
          lazyParagraphOpen = undefined;
        }
        index++;
        continue;
      }

      if (
        interruptsLazyContinuation(index) ||
        !canContinueParagraphLazily(lines, index, true)
      ) {
        break;
      }
      if (lazyParagraphOpen === undefined) {
        lazyParagraphOpen = sourceEndsInParagraph(
          listItemSource(itemText, subLines, lazyLineIndexes),
          opts,
        );
      }
      if (!lazyParagraphOpen) {
        break;
      }
      lazyLineIndexes.add(subLines.length);
      subLines.push(lines[index]);
      index++;
    }

    // After blank lines, lines indented to the item's content still belong
    // to it (CommonMark 0.31 §5.2): a nested list, a code block, or another
    // paragraph. Lazy continuation stops at a blank line.
    for (;;) {
      let next = index;
      while (next < lines.length && lines[next].trim() === '') {
        next++;
      }
      if (
        next === index ||
        next >= lines.length ||
        getIndent(lines[next]) < contentColumn
      ) {
        break;
      }
      for (; index < next; index++) {
        subLines.push('');
      }
      while (
        index < lines.length &&
        lines[index].trim() !== '' &&
        getIndent(lines[index]) >= contentColumn
      ) {
        subLines.push(lines[index]);
        index++;
      }
      loose = true;
    }

    const source = listItemSource(itemText, subLines, lazyLineIndexes);

    if (documentLineOf == null) {
      items.push({
        type: 'listItem',
        checked,
        children: parseMarkdownImpl(source, nested(opts)),
      });
    } else {
      // The item's source holds one line per line it consumed, from its
      // marker line to its last content line, so its lines map back
      // one-to-one; blank lines are consumed only before more content.
      const origin: number[] = [];
      for (let line = itemStart; line < index; line++) {
        origin.push(documentLineOf(line));
      }
      items.push({
        type: 'listItem',
        checked,
        children: parseMarkdownImpl(source, nestedAt(opts, origin)),
        position: {
          start: {line: origin[0] + 1},
          end: {line: origin[origin.length - 1] + 1},
        },
      });
    }

    // CommonMark loose list: blank line(s) between items of the same style
    // and indent still form one list. Skip the blanks and continue if the
    // next non-blank line matches the same item pattern.
    let lookahead = index;
    while (lookahead < lines.length && lines[lookahead].trim() === '') {
      lookahead++;
    }
    if (
      lookahead > index &&
      lookahead < lines.length &&
      startsItem(lines[lookahead])
    ) {
      loose = true;
      index = lookahead;
    }
  }
  const node: MarkdownAstList<RuntimeExtensionNode> = {
    type: 'list',
    ordered,
    start,
    delimiter: ordered ? (delim as '.' | ')') : undefined,
    spread: loose || undefined,
    children: items,
  };
  listMarkerShapes.set(node, `${baseIndent}:${ordered ? delim : bullet}`);
  return {node, nextIndex: index};
}

// ---------------------------------------------------------------------------
// Main block parser
// ---------------------------------------------------------------------------

export function parseMarkdown(
  input: string,
  sourceIds?: ReadonlySet<string>,
): BlockNode[];
export function parseMarkdown(
  input: string,
  options: MathParseOptionsWithoutPlugins,
): BlockNodeWithMath[];
export function parseMarkdown(
  input: string,
  options: ParseOptionsWithoutPlugins,
): BlockNode[];
export function parseMarkdown<
  const Plugins extends ReadonlyArray<MarkdownPluginEntry>,
>(
  input: string,
  options: ParseOptionsWithoutPlugins & {plugins: Plugins},
): BlockNode<MarkdownExtensionsOf<Plugins>>[];
export function parseMarkdown<
  const Plugins extends ReadonlyArray<MarkdownPluginEntry>,
>(
  input: string,
  options: MathParseOptionsWithoutPlugins & {plugins: Plugins},
): BlockNodeWithMath<MarkdownExtensionsOf<Plugins>>[];
export function parseMarkdown(
  input: string,
  arg?: ReadonlySet<string> | RuntimeParseOptions,
): RuntimeBlockNode[] {
  return projectMarkdownRoot(
    parseMarkdownAstInternal(input, arg, true),
    wantsLegacyRanges(arg),
  );
}

/**
 * Parse block Markdown into the canonical immutable Astryx AST.
 *
 * Unlike `parseMarkdown`, this returns the MDAST-aligned root used by Markdown,
 * transforms, and Outline. Math nodes are present only when `math: true`, and
 * plugin extension nodes are inferred from the ordered `plugins` tuple.
 */
export function parseMarkdownAst(
  input: string,
  sourceIds?: ReadonlySet<string>,
): MarkdownAstRoot;
export function parseMarkdownAst(
  input: string,
  options: ParseOptionsWithoutPlugins | MathParseOptionsWithoutPlugins,
): MarkdownAstRoot;
export function parseMarkdownAst<
  const Plugins extends ReadonlyArray<MarkdownPluginEntry>,
>(
  input: string,
  options: (ParseOptionsWithoutPlugins | MathParseOptionsWithoutPlugins) & {
    plugins: Plugins;
  },
): MarkdownAstRoot<MarkdownExtensionsOf<Plugins>>;
export function parseMarkdownAst(
  input: string,
  arg?: ReadonlySet<string> | RuntimeParseOptions,
): MarkdownAstRoot<RuntimeExtensionNode> {
  return parseMarkdownAstInternal(input, arg, true);
}

/** @internal Full-parse entry point with streaming finality for Outline. */
export function parseMarkdownAstInternal(
  input: string,
  arg: ReadonlySet<string> | RuntimeParseOptions | undefined,
  isFinal: boolean,
): MarkdownAstRoot<RuntimeExtensionNode> {
  const resolved = resolveOptions(arg);
  const opts = isFinal ? resolved : {...resolved, isFinal: false};
  const root: MarkdownAstRoot<RuntimeExtensionNode> = {
    type: 'root',
    children: parseMarkdownImpl(input, opts),
  };
  return applyMarkdownTransforms(
    root,
    opts.plugins,
    input,
    opts.isFinal,
    'block',
  );
}

function parseMarkdownImpl(
  input: string,
  callerOpts: ResolvedOptions,
): MarkdownAstBlockContent<RuntimeExtensionNode>[] {
  // Content at depth 100 sits inside 100 lists or blockquotes: the cap.
  if (callerOpts.blockDepth >= MAX_BLOCK_NESTING) {
    // Nested deeper than the cap: the content is one paragraph of text.
    const text = input.trim();
    return text === ''
      ? []
      : [{type: 'paragraph', children: parseInlineEntry(text, callerOpts)}];
  }
  // One document's nested parses share one record of what they produced.
  const baseOpts: ResolvedOptions =
    callerOpts.nestedParses == null
      ? {...callerOpts, nestedParses: {map: null}}
      : callerOpts;
  // Collect this input's link reference definitions and strip their lines,
  // then merge them with any definitions inherited from an enclosing parse
  // (the incremental parser passes the whole document's definitions in; a
  // recursive blockquote/list parse inherits the outer definitions). Inherited
  // definitions win on conflict, matching CommonMark's first-definition-wins
  // in document order; locally-nested definitions still resolve within this
  // parse.
  const {defs, cleaned, lineMap} = extractLinkDefinitions(input, baseOpts.math);
  const inherited = baseOpts.linkDefs;
  let linkDefs: ReadonlyMap<string, string> | undefined;
  if (defs.size === 0) {
    linkDefs = inherited;
  } else if (inherited == null) {
    linkDefs = defs;
  } else {
    linkDefs = new Map<string, string>([...defs, ...inherited]);
  }
  const opts: ResolvedOptions =
    linkDefs != null ? {...baseOpts, linkDefs} : baseOpts;
  const lines = cleaned.split('\n');
  const hasBlockExtensionSyntax =
    opts.allowBlockSyntax !== false &&
    (opts.plugins?.blockByFirstCharacter.size ?? 0) > 0;
  // Derived from the already-split lines rather than a second character
  // scan: every line contributes its own length plus the newline it ended on.
  const lineOffsets = [0];
  if (opts.astPositions === true || hasBlockExtensionSyntax) {
    let offset = 0;
    for (let index = 0; index < lines.length; index++) {
      offset += lines[index].length + 1;
      lineOffsets.push(offset);
    }
  }
  const blockExtensionMatches = new Map<number, ExtensionMatch>();
  const interruptsWithBlockExtension = (lineIndex: number): boolean => {
    if (!hasBlockExtensionSyntax) {
      return false;
    }
    const extensionColumn = blockExtensionColumn(lines[lineIndex]);
    if (extensionColumn == null) {
      return false;
    }
    const extensionOffset = lineOffsets[lineIndex] + extensionColumn;
    const extension = matchExtensionSyntax(
      cleaned,
      extensionOffset,
      'block',
      opts,
    );
    if (extension.status === 'none') {
      return false;
    }
    blockExtensionMatches.set(extensionOffset, extension);
    return true;
  };
  const blocks: MarkdownAstBlockContent<RuntimeExtensionNode>[] = [];
  // The line each block started on, parallel to `blocks`. Only collected when
  // ranges were asked for; a block's end is resolved after the loop, since the
  // branch that produced it has already moved `index` past whatever it read.
  // A parse records lines only when it can place them in the document: at
  // the top level, or nested with a table of its lines' origins.
  const documentLineOf = sourceLineResolver(opts, lineMap);
  const blockStartLines: number[] | null =
    opts.astPositions === true || documentLineOf != null ? [] : null;
  // Set only by a block that consumes blank lines as content, where the
  // positional end derivation would trim them away.
  const blockEndLines: (number | undefined)[] | null =
    blockStartLines != null ? [] : null;
  let blockStartLine = 0;
  const pushBlock = (
    node: MarkdownAstBlockContent<RuntimeExtensionNode>,
    endLine?: number,
  ) => {
    blocks.push(node);
    blockStartLines?.push(blockStartLine);
    blockEndLines?.push(endLine);
  };
  let index = 0;

  while (index < lines.length) {
    blockStartLine = index;
    const line = lines[index];
    if (line.trim() === '') {
      index++;
      continue;
    }

    // --- Fenced code block ---
    const fenceMatch = FENCE_LINE.exec(line);
    if (fenceMatch) {
      const [opening, indentation, fence] = fenceMatch;
      // The rest of the line is the info string; its first word, after any
      // spaces, is the language (CommonMark 0.31 §4.5).
      const info = line.slice(opening.length).trim();
      const language = info.match(/^(\S+)/)?.[1] ?? null;
      const legacyLanguage = info.match(/^(\w*)/)?.[1] || null;
      const meta =
        language == null
          ? undefined
          : info.slice(language.length).trim() || undefined;
      const codeLines: string[] = [];
      // Each code line loses as much indentation as the opening fence has.
      const fenceIndentation = new RegExp(`^ {0,${indentation.length}}`);
      index++;
      while (index < lines.length && !closesFence(lines[index], fence)) {
        codeLines.push(lines[index].replace(fenceIndentation, ''));
        index++;
      }
      const closed = index < lines.length;
      // A fence left open in the document runs to its end, whose final line
      // ending starts no line of code (CommonMark 0.31 §4.5) — as a closed
      // fence's code ends before its closing line. A container's content is
      // rebuilt from its lines, so its last line is a real one: a quoted
      // blank line stays code.
      if (
        opts.blockDepth === 0 &&
        !closed &&
        codeLines.length > 0 &&
        lines[lines.length - 1] === ''
      ) {
        codeLines.pop();
      }
      index++; // skip closing fence
      // A fence owns its blank lines, and an unterminated one (mid-stream)
      // can end on them, so it states its own end rather than letting the
      // positional derivation trim them off.
      pushBlock(
        markMarkdownAstLegacyCodeLanguage(
          {
            type: 'code',
            lang: language,
            ...(meta == null ? {} : {meta}),
            value: codeLines.join('\n'),
          },
          legacyLanguage,
        ),
        Math.min(index, lines.length) - 1,
      );
      continue;
    }

    // --- Display math (opt-in; fenced code takes precedence) ---
    if (opts.math) {
      const displayMath = matchDisplayMathBlock(lines, index);
      if (displayMath != null) {
        pushBlock(
          {type: 'math', value: displayMath.value},
          displayMath.endLine,
        );
        index = displayMath.nextIndex;
        continue;
      }
    }

    // --- Heading ---
    // An ATX heading may be indented up to three spaces (CommonMark 0.31 §4.2).
    const headingMatch = line.match(/^ {0,3}(#{1,6}) +(.*)/);
    if (headingMatch) {
      pushBlock({
        type: 'heading',
        depth: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInlineEntry(headingMatch[2], opts),
      });
      index++;
      continue;
    }

    // --- HR (must precede list check to handle `- - -`, `* * *`, `_ _ _`) ---
    if (isHorizontalRule(line)) {
      pushBlock({type: 'thematicBreak'});
      index++;
      continue;
    }

    // --- Standalone image ---
    // An unsafe src falls through to the paragraph path and renders as
    // literal text, the same rule the inline image path applies.
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    const imageSrc = imageMatch
      ? decodeLinkDestination(inlineDestination(imageMatch[2]))
      : '';
    if (
      imageMatch &&
      line.trim() === imageMatch[0] &&
      isSafeMarkdownParserUrl(imageSrc)
    ) {
      pushBlock({
        type: 'image',
        alt: imageAlt(imageMatch[1], opts, 'default'),
        url: imageSrc,
      });
      index++;
      continue;
    }

    // --- Table (with or without leading pipe) ---
    if (
      index + 1 < lines.length &&
      line.includes('|') &&
      isTableSeparator(lines[index + 1])
    ) {
      const tableResult = parseTable(lines, index, opts);
      pushBlock(tableResult.node);
      index = tableResult.nextIndex;
      continue;
    }

    // --- Blockquote ---
    if (QUOTE_MARKER.test(line)) {
      const quoteLines: string[] = [];
      let lazyParagraphOpen: boolean | undefined;
      while (index < lines.length) {
        const quoteLine = lines[index];
        if (QUOTE_MARKER.test(quoteLine)) {
          const content = quotedContent(quoteLine);
          quoteLines.push(content);
          if (content.trim() === '') {
            lazyParagraphOpen = false;
          } else if (
            lazyParagraphOpen === false ||
            (lazyParagraphOpen === true &&
              !canContinueParagraphLazily([content], 0))
          ) {
            lazyParagraphOpen = undefined;
          }
          index++;
          continue;
        }
        if (
          quoteLines[quoteLines.length - 1]?.trim() === '' ||
          interruptsWithBlockExtension(index) ||
          !canContinueParagraphLazily(lines, index)
        ) {
          break;
        }
        if (lazyParagraphOpen === undefined) {
          lazyParagraphOpen = sourceEndsInParagraph(
            quoteLines.join('\n'),
            opts,
          );
        }
        if (!lazyParagraphOpen) {
          break;
        }
        quoteLines.push(quoteLine);
        index++;
      }
      pushBlock({
        type: 'blockquote',
        children: parseMarkdownImpl(
          quoteLines.join('\n'),
          nestedAt(
            opts,
            // Each quote line is one source line, from the quote's first on.
            documentLineOf == null
              ? null
              : quoteLines.map((_, offset) =>
                  documentLineOf(blockStartLine + offset),
                ),
          ),
        ),
      });
      continue;
    }

    // --- Unordered list ---
    if (/^ {0,9}[-*+] /.test(line)) {
      const listResult = parseList(
        lines,
        index,
        false,
        opts,
        interruptsWithBlockExtension,
        documentLineOf,
      );
      pushBlock(listResult.node);
      index = listResult.nextIndex;
      continue;
    }

    // --- Ordered list ---
    if (/^ {0,9}\d+[.)] /.test(line)) {
      const listResult = parseList(
        lines,
        index,
        true,
        opts,
        interruptsWithBlockExtension,
        documentLineOf,
      );
      pushBlock(listResult.node);
      index = listResult.nextIndex;
      continue;
    }

    // --- Extension block syntax (built-in blocks take precedence) ---
    if (hasBlockExtensionSyntax) {
      const extensionColumn = blockExtensionColumn(line);
      const extensionOffset =
        extensionColumn == null
          ? lineOffsets[index]
          : lineOffsets[index] + extensionColumn;
      const extension =
        blockExtensionMatches.get(extensionOffset) ??
        (extensionColumn == null
          ? {status: 'none' as const}
          : matchExtensionSyntax(cleaned, extensionOffset, 'block', opts));
      blockExtensionMatches.delete(extensionOffset);
      if (extension.status === 'match') {
        const consumedEnd = extension.end;
        const consumed = cleaned.slice(lineOffsets[index], consumedEnd);
        if (
          consumedEnd < cleaned.length &&
          cleaned[consumedEnd] !== '\n' &&
          cleaned[consumedEnd - 1] !== '\n'
        ) {
          reportMarkdownPluginFailure(
            extension.node.plugin,
            'syntax',
            new TypeError('Block syntax must consume complete lines'),
          );
        } else {
          const newlineCount = consumed.split('\n').length - 1;
          const consumedLines = Math.max(
            1,
            newlineCount + (consumed.endsWith('\n') ? 0 : 1),
          );
          pushBlock(
            extension.node as Extract<RuntimeExtensionNode, {display: 'block'}>,
            index + consumedLines - 1,
          );
          index += consumedLines;
          continue;
        }
      }
      if (extension.status === 'defer') {
        break;
      }
    }

    // --- Paragraph ---
    const paraLines: string[] = [line];
    index++;
    while (index < lines.length) {
      const nextLine = lines[index];
      if (
        isBlockStart(nextLine) ||
        (opts.math && matchDisplayMathBlock(lines, index) != null) ||
        nextLine.trim() === ''
      ) {
        break;
      }
      if (interruptsWithBlockExtension(index)) {
        break;
      }
      paraLines.push(nextLine);
      index++;
    }
    pushBlock({
      type: 'paragraph',
      children: parseInlineEntry(paraLines.join('\n'), opts),
    });
  }
  if (blockStartLines != null) {
    stampSourceRanges(
      blocks,
      blockStartLines,
      blockEndLines ?? [],
      lines,
      lineMap,
      input,
      opts,
      documentLineOf,
    );
  }
  const nestedParses = baseOpts.nestedParses?.map;
  if (baseOpts.probing === true && nestedParses != null) {
    nestedParses.set(nestedParseKey(baseOpts.blockDepth, input), blocks);
  }
  return blocks;
}

/**
 * Give each block the offsets it occupies in the original input.
 *
 * Blocks are contiguous and in source order, so a block runs from its own
 * first line to the line before the next block starts, minus the blank lines
 * between them. Offsets are computed against the *input*, not the text the
 * block loop saw: link reference definitions are stripped before parsing, and
 * `lineMap` says which input line each surviving line came from.
 */
function stampSourceRanges(
  blocks: MarkdownAstBlockContent<RuntimeExtensionNode>[],
  blockStartLines: number[],
  blockEndLines: (number | undefined)[],
  lines: string[],
  lineMap: number[] | undefined,
  input: string,
  opts: ResolvedOptions,
  documentLineOf: ((line: number) => number) | null,
): void {
  const withOffsets = opts.astPositions === true;
  const base = opts.baseOffset ?? 0;
  // Offset of the first character of every line of the input.
  const inputLineStarts = [0];
  if (withOffsets) {
    for (let i = 0; i < input.length; i++) {
      if (input[i] === '\n') {
        inputLineStarts.push(i + 1);
      }
    }
  }
  // Stripping removes whole lines and never edits one, so a parsed line's
  // length is its input line's length.
  const lineStart = (line: number): number =>
    base + inputLineStarts[lineMap != null ? lineMap[line] : line];

  for (let i = 0; i < blocks.length; i++) {
    const startLine = blockStartLines[i];
    let endLine = blockEndLines[i];
    if (endLine == null) {
      const nextStart =
        i + 1 < blocks.length ? blockStartLines[i + 1] : lines.length;
      endLine = nextStart - 1;
      while (endLine > startLine && lines[endLine].trim() === '') {
        endLine--;
      }
    }
    // Exactly the block's own lines, verbatim — a CRLF document's trailing
    // `\r` included, since the parser reads it as part of the line too and a
    // range that dropped it would slice to something that re-parses
    // differently.
    // Each point is built as one literal so a parse without source lines
    // produces exactly the `{offset}` points it always has.
    let position: MarkdownAstPosition;
    if (documentLineOf == null) {
      position = {
        start: {offset: lineStart(startLine)},
        end: {offset: lineStart(endLine) + lines[endLine].length},
      };
    } else if (withOffsets) {
      position = {
        start: {
          offset: lineStart(startLine),
          line: documentLineOf(startLine) + 1,
        },
        end: {
          offset: lineStart(endLine) + lines[endLine].length,
          line: documentLineOf(endLine) + 1,
        },
      };
    } else {
      position = {
        start: {line: documentLineOf(startLine) + 1},
        end: {line: documentLineOf(endLine) + 1},
      };
    }
    blocks[i] = withMarkerShapeOf(blocks[i], {...blocks[i], position});
  }
}

/**
 * Maps a line of a parse's block loop to its 0-based document line, or `null`
 * when this parse records no lines. Link reference definitions are stripped
 * before the loop, so a loop line goes through `lineMap` to its input line
 * first; a nested parse then goes through `lineOrigin` to the document, and a
 * top-level parse adds the line its slice starts on.
 */
function sourceLineResolver(
  opts: ResolvedOptions,
  lineMap: number[] | undefined,
): ((line: number) => number) | null {
  if (opts.sourceLines !== true) {
    return null;
  }
  const inputLine = (line: number): number =>
    lineMap != null ? lineMap[line] : line;
  const origin = opts.lineOrigin;
  if (origin != null) {
    return line => origin[inputLine(line)];
  }
  if (opts.astPositions !== true) {
    return null;
  }
  const baseLine = opts.baseLine ?? 0;
  return line => baseLine + inputLine(line);
}

// ---------------------------------------------------------------------------
// Incremental parsing
// ---------------------------------------------------------------------------

type IncrementalBlockNode<MathEnabled extends boolean> =
  MathEnabled extends true ? BlockNodeWithMath : BlockNode;

declare const incrementalStateMode: unique symbol;

export interface IncrementalState<MathEnabled extends boolean = false> {
  /** @internal Nominally couples a factory-created cache to its node union. */
  readonly [incrementalStateMode]: MathEnabled;
  prevInput: string;
  settledText: string;
  settledBlocks: IncrementalBlockNode<MathEnabled>[];
  settledUpTo: number;
  /**
   * The `autolink` option the cached `settledBlocks` were parsed with.
   * `parseMarkdownIncremental` invalidates the cache when the caller flips
   * this option, so already-settled URLs flip between link/text along
   * with newly-arriving content.
   */
  autolink?: 'gfm';
  /** Whether the cached settled blocks were parsed with math enabled. */
  math?: MathEnabled;
  /**
   * The `sourceRanges` option the cached `settledBlocks` were parsed with.
   * Flipping it invalidates them the same way `autolink` does: they either
   * lack the ranges the caller now asks for, or carry ones it did not.
   */
  sourceRanges?: boolean;
  /** Identity of citation sources used by settled nodes. */
  sourceIdsKey?: string;
  /** Ordered syntax-only identity used by settled nodes. */
  pluginSyntaxIdentity?: string;
  /**
   * Signature of the link reference definitions the cached `settledBlocks`
   * were parsed with. Definitions are document-global and typically arrive
   * (in a footer) after the references that use them, so when the set changes
   * the settled cache is invalidated to let earlier references resolve.
   */
  linkDefsKey?: string;
}

type IncrementalWork = {
  /** Characters copied into the tail line array. */
  readonly splitCharacters: number;
  /** Tail lines visited by fence and blank-boundary detection. */
  readonly boundaryLines: number;
  /** Characters visited while collecting document-global definitions. */
  readonly definitionCharacters: number;
  /** Block nodes parsed anew this call (settled delta + unsettled tail). */
  readonly renderedBlocks: number;
};

type IncrementalCache = {
  /** Character offset immediately after the immutable settled prefix. */
  settledEnd: number;
  /**
   * Line breaks before `settledEnd`, kept only while source lines are
   * recorded; `undefined` when unknown, counted once from the settled text.
   */
  settledEndLine: number | undefined;
  /** Definitions whose complete block is in the settled prefix. */
  settledLinkDefs: Map<string, string>;
  /** Definitions still in the mutable tail on the preceding call. */
  tailLinkDefs: ReadonlyMap<string, string>;
  /** The effective document-global definitions used by slice parses. */
  linkDefs: ReadonlyMap<string, string>;
  linkDefsKey: string;
  /** Canonical settled blocks shared by rendering and compatibility projection. */
  settledAstBlocks: MarkdownAstBlockContent<RuntimeExtensionNode>[];
  settledRevision: number;
  projectedRevision: number;
  projectedSettledBlocks: RuntimeBlockNode[];
  /** Preserves released settled-node identity across projected snapshots. */
  projectionCache: LegacyProjectionCache;
  work: IncrementalWork;
};

const incrementalCaches = new WeakMap<
  IncrementalState<boolean>,
  IncrementalCache
>();

function makeIncrementalCache(
  state: IncrementalState<boolean>,
): IncrementalCache {
  const {defs} = extractLinkDefinitions(state.settledText, state.math);
  const cache: IncrementalCache = {
    settledEnd: state.settledText.length,
    settledEndLine: undefined,
    settledLinkDefs: new Map(defs),
    tailLinkDefs: new Map(),
    linkDefs: defs,
    linkDefsKey: linkDefsSignature(defs),
    settledAstBlocks: [],
    settledRevision: 0,
    projectedRevision: -1,
    projectedSettledBlocks: [],
    projectionCache: new WeakMap(),
    work: {
      splitCharacters: 0,
      boundaryLines: 0,
      definitionCharacters: 0,
      renderedBlocks: 0,
    },
  };
  incrementalCaches.set(state, cache);
  return cache;
}

/**
 * Create an incremental parser cache. Use the `<true>` type argument with
 * `MathParseOptions` so the cache and returned nodes share the math contract.
 */
export function createIncrementalState<
  MathEnabled extends boolean = false,
>(): IncrementalState<MathEnabled> {
  const state = {
    prevInput: '',
    settledText: '',
    settledBlocks: [],
    settledUpTo: 0,
  } as unknown as IncrementalState<MathEnabled>;
  makeIncrementalCache(state);
  return state;
}

/**
 * Deterministic work counters for the most recent incremental parse.
 * @internal Exported from this module for performance regression tests only.
 */
export function getIncrementalParseWork(
  state: IncrementalState<boolean>,
): IncrementalWork {
  return (
    incrementalCaches.get(state)?.work ?? {
      splitCharacters: 0,
      boundaryLines: 0,
      definitionCharacters: 0,
      renderedBlocks: 0,
    }
  );
}

/**
 * Find the line-index of the last blank line that is NOT inside a fenced code
 * block, and report whether a fence is still open at the end of the input.
 * Returns -1 when nothing is settled.
 *
 * This index must never move backwards as more of the document arrives. The
 * caller's cache is keyed on the settled text staying a prefix of what it was,
 * so a boundary that retracts by one line costs a re-parse of every block in
 * the document. Two things used to retract it: a blank last line, which is
 * just the newline the stream has written so far and stops being blank as soon
 * as the next chunk appends to it; and an open fence, which used to collapse
 * the boundary to -1 even though the content before the fence opened cannot be
 * changed by anything typed inside it.
 */
function findSettledBoundary(
  lines: string[],
  math = false,
): {
  boundary: number;
  openFence: boolean;
  openMath: boolean;
} {
  const fences = topLevelFences();
  let mathContainer: DisplayMathContainer | null = null;
  let suppressMathUntilBoundary = false;
  let lastBoundary = -1;
  let boundaryBeforeFence = -1;
  let boundaryBeforeMath = -1;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    if (fences.open) {
      fences.read(lines, lineIndex);
      continue;
    }

    if (mathContainer != null) {
      const state = displayMathLineState(line, mathContainer);
      if (state === 'close') {
        mathContainer = null;
        continue;
      }
      if (state === 'inside') {
        continue;
      }
      // The list item or blockquote ended before a closer arrived. The parser
      // treats that unmatched opener literally, so resume ordinary boundary
      // detection on this first line outside the container.
      mathContainer = null;
      suppressMathUntilBoundary = true;
    }

    // A complete same-line `$$…$$` expression never changes boundary state.
    // A standalone marker may belong to the top level, a blockquote, or one
    // list item; remember that container so its continuation marker closes the
    // same expression instead of opening a new one.
    if (math && !suppressMathUntilBoundary) {
      const container = displayMathContainer(line);
      if (container != null) {
        mathContainer = container;
        boundaryBeforeMath = lastBoundary;
        continue;
      }
    }

    if (fences.read(lines, lineIndex) === 'open') {
      boundaryBeforeFence = lastBoundary;
      continue;
    }

    if (line.trim() === '') {
      suppressMathUntilBoundary = false;
      // A blank line settles only what precedes it when the next line starts
      // at the margin: an indented line may continue a list item across it.
      if (
        lineIndex > 0 &&
        lineIndex < lines.length - 1 &&
        /^\S/.test(lines[lineIndex + 1])
      ) {
        lastBoundary = lineIndex;
      }
    }
  }

  return {
    boundary: fences.open
      ? boundaryBeforeFence
      : mathContainer != null
        ? boundaryBeforeMath
        : lastBoundary,
    openFence: fences.open,
    openMath: mathContainer != null,
  };
}

/**
 * Strip trailing incomplete inline syntax that appears during streaming.
 * Only affects the tail of the last line — safe to apply to the full string.
 */
export function trimStreamingArtifacts(
  input: string,
  options?: {math?: boolean},
): string {
  // First remove an incomplete display expression as one structural unit. This
  // full-input scan distinguishes a terminal nested closer from a new opener;
  // looking only at the final `$$` line cannot.
  const displayTrimmed = options?.math ? trimOpenDisplayMath(input) : input;
  const lastNL = displayTrimmed.lastIndexOf('\n');
  const prefix = lastNL === -1 ? '' : displayTrimmed.slice(0, lastNL + 1);
  let tail = lastNL === -1 ? displayTrimmed : displayTrimmed.slice(lastNL + 1);

  if (options?.math) {
    // Hold an unmatched inline opener so raw TeX syntax does not flash while
    // streaming. If another unescaped dollar is already present but fails the
    // closing-boundary rule, keep both literal (the currency case).
    for (let index = 0; index < tail.length; index++) {
      if (
        tail[index] === '$' &&
        tail[index + 1] == null &&
        tail[index - 1] !== '$' &&
        !/\d/.test(tail[index - 1] ?? '') &&
        !isEscaped(tail, index)
      ) {
        tail = tail.slice(0, index);
        break;
      }
      if (!isInlineMathStart(tail, index)) {
        continue;
      }
      const close = findInlineMathEnd(tail, index);
      if (close !== -1) {
        index = close;
        continue;
      }
      let laterDollar = -1;
      for (let next = index + 1; next < tail.length; next++) {
        if (tail[next] === '$' && !isEscaped(tail, next)) {
          laterDollar = next;
          break;
        }
      }
      if (laterDollar === -1) {
        tail = tail.slice(0, index);
        break;
      }
      index = laterDollar;
    }
  }

  // Scan backwards for unclosed syntax markers — no regex to avoid ReDoS
  // Find the last unclosed [ or ![ (link/image start)
  const lastBracket = tail.lastIndexOf('[');
  if (lastBracket !== -1) {
    const afterBracket = tail.slice(lastBracket);
    // A closed link/image has ](...)  somewhere after the [
    const hasClose = afterBracket.includes('](') && afterBracket.includes(')');
    if (!hasClose) {
      // Also trim a preceding `!` for images
      const trimTo =
        lastBracket > 0 && tail[lastBracket - 1] === '!'
          ? lastBracket - 1
          : lastBracket;
      tail = tail.slice(0, trimTo);
    }
  }

  // Find trailing unclosed backticks
  let end = tail.length;
  while (end > 0 && tail[end - 1] === '`') {
    end--;
  }
  if (end < tail.length && end > 0) {
    // There are trailing backticks — check if they opened inline code
    const ticks = tail.length - end;
    const opener = tail.lastIndexOf('`'.repeat(ticks), end - 1);
    if (opener === -1) {
      // Unclosed — trim from the backticks
      tail = tail.slice(0, end);
    }
  }

  // Find trailing unclosed bold/italic markers (*)
  // First check trailing stars (no content after them yet):
  end = tail.length;
  while (end > 0 && tail[end - 1] === '*') {
    end--;
  }
  if (end < tail.length && end > 0) {
    const stars = tail.length - end;
    if (stars <= 3) {
      const opener = tail.lastIndexOf('*'.repeat(stars), end - 1);
      if (opener === -1) {
        tail = tail.slice(0, end);
      }
    }
  }

  // Check for unclosed bold/italic mid-line: e.g. "Hello **bold" or "Hello *ital"
  // Instead of trimming (hiding content), auto-close the markers so the text
  // renders with formatting immediately as it streams in.
  {
    let searchFrom = 0;
    const markers: {pos: number; len: number}[] = [];
    while (searchFrom < tail.length) {
      const idx = tail.indexOf('*', searchFrom);
      if (idx === -1) {
        break;
      }
      // Determine marker length (* or ** or ***)
      let markerLen = 1;
      while (idx + markerLen < tail.length && tail[idx + markerLen] === '*') {
        markerLen++;
      }
      if (markerLen > 3) {
        // 4+ stars — not standard markdown emphasis, skip
        searchFrom = idx + markerLen;
        continue;
      }
      markers.push({pos: idx, len: markerLen});
      searchFrom = idx + markerLen;
    }
    // Pair markers greedily. Unpaired openers get auto-closed.
    const paired = new Set<number>();
    for (let i = 0; i < markers.length; i++) {
      if (paired.has(i)) {
        continue;
      }
      for (let j = i + 1; j < markers.length; j++) {
        if (paired.has(j)) {
          continue;
        }
        if (markers[j].len === markers[i].len) {
          paired.add(i);
          paired.add(j);
          break;
        }
      }
    }
    // Append closing markers for each unpaired opener (in reverse order),
    // before any trailing whitespace: a closer must follow content to close
    // (CommonMark's flanking rules), so `**bold ` closes as `**bold** `.
    for (let i = markers.length - 1; i >= 0; i--) {
      if (!paired.has(i)) {
        const marker = markers[i];
        const content = tail.slice(marker.pos + marker.len);
        const trailing = content.length - content.trimEnd().length;
        // Only close if there's actual content after the opener
        if (trailing < content.length) {
          tail =
            tail.slice(0, tail.length - trailing) +
            '*'.repeat(marker.len) +
            tail.slice(tail.length - trailing);
        } else {
          // A marker with nothing but whitespace after it — trim it
          tail = tail.slice(0, marker.pos);
        }
      }
    }
  }

  // Find trailing unclosed strikethrough (~~)
  if (tail.length >= 2 && tail.endsWith('~~')) {
    // Check if there's an opener before these closing ~~
    const opener = tail.lastIndexOf('~~', tail.length - 3);
    if (opener === -1) {
      tail = tail.slice(0, -2);
    }
  } else if (tail.endsWith('~')) {
    // Single trailing ~ after content — might be start of ~~
    const secondLast = tail.length - 2;
    if (secondLast >= 0 && tail[secondLast] !== '~') {
      tail = tail.slice(0, -1);
    }
  }

  // Check for unclosed ~~ mid-line: e.g. "Hello ~~struck"
  // Count ~~ occurrences — if odd, the last one is unclosed.
  {
    let count = 0;
    let searchFrom = 0;
    const positions: number[] = [];
    while (true) {
      const idx = tail.indexOf('~~', searchFrom);
      if (idx === -1) {
        break;
      }
      positions.push(idx);
      count++;
      searchFrom = idx + 2;
    }
    if (count % 2 === 1) {
      // Odd number of ~~ — the last one is unclosed, trim from it
      tail = tail.slice(0, positions[positions.length - 1]);
    }
  }

  return prefix + tail;
}

/**
 * Trim trailing lines from the unsettled zone that look like the start of
 * a structural block but aren't complete yet. This prevents flashes of
 * partial syntax like bare `-` bullets or incomplete table headers.
 *
 * Only trims the minimal set of clearly-incomplete patterns:
 * 1. Bare list markers (`- `, `1. `) with no content after them
 * 2. A lone table header line without its separator row
 * 3. Empty trailing lines
 *
 * Once a table is established (header + separator exist), new data rows
 * render immediately — no suppression.
 */
function trimOpenDisplayMath(text: string): string {
  const lines = text.split('\n');
  const fences = topLevelFences();
  let mathContainer: DisplayMathContainer | null = null;
  let suppressMathUntilBoundary = false;
  let mathStartLine = -1;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fences.open) {
      fences.read(lines, index);
      continue;
    }
    if (mathContainer != null) {
      const state = displayMathLineState(line, mathContainer);
      if (state === 'close') {
        mathContainer = null;
        mathStartLine = -1;
        continue;
      }
      if (state === 'inside') {
        continue;
      }
      mathContainer = null;
      mathStartLine = -1;
      suppressMathUntilBoundary = true;
    }

    if (line.trim() === '') {
      suppressMathUntilBoundary = false;
    }

    if (fences.read(lines, index) === 'open') {
      continue;
    }
    const container = suppressMathUntilBoundary
      ? null
      : displayMathContainer(line);
    if (container != null) {
      mathContainer = container;
      mathStartLine = index;
    }
  }

  return mathContainer != null && mathStartLine >= 0
    ? lines.slice(0, mathStartLine).join('\n').trimEnd()
    : text;
}

function trimUnsettledStructural(text: string): string {
  const lines = text.split('\n');

  // Walk backwards, but only trim clearly-incomplete trailing lines
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    const trimmed = last.trim();

    // Empty trailing lines — safe to drop
    if (trimmed === '') {
      lines.pop();
      continue;
    }

    // Bare list marker with no content: "- " or "1. " (just whitespace after marker)
    if (/^ {0,9}[-*+] $/.test(last) || /^ {0,9}\d+[.)] $/.test(last)) {
      lines.pop();
      continue;
    }

    // Table: only suppress if this is a lone header without a separator.
    // If the line has an unescaped `|` and the line before it is NOT a
    // separator, and THIS line is not a separator, and there's no established
    // table above (header + separator pair), hold it back. An escaped `\|` is
    // ordinary prose, not a cell delimiter, so a line carrying only those is
    // never held back — holding it back blanks the text while it streams.
    if (hasUnescapedPipe(trimmed) && !isTableSeparator(last)) {
      // Is there a separator anywhere above that would make this part of
      // an established table? Walk up to find header+separator pair. The
      // header test mirrors the block parser's own `includes('|')`, which
      // accepts an escaped-only header line once its separator arrives.
      let tableEstablished = false;
      for (let i = lines.length - 2; i >= 1; i--) {
        if (isTableSeparator(lines[i]) && lines[i - 1].includes('|')) {
          tableEstablished = true;
          break;
        }
      }
      if (!tableEstablished) {
        // Lone pipe line — could be a table header waiting for separator
        lines.pop();
        continue;
      }
    }

    // Separator line without a header above it
    if (isTableSeparator(last)) {
      if (lines.length < 2 || !lines[lines.length - 2].includes('|')) {
        lines.pop();
        continue;
      }
    }

    // This line looks complete — stop trimming
    break;
  }

  return lines.join('\n');
}

/**
 * The same options, for parsing a slice that starts at `offset` of the
 * document — so the slice's blocks report ranges into the whole document
 * rather than into the slice.
 */
function atOffset(
  opts: ResolvedOptions,
  offset: number,
  line: number,
): ResolvedOptions {
  if (opts.astPositions !== true) {
    return opts;
  }
  return opts.sourceLines === true
    ? {...opts, baseOffset: offset, baseLine: line}
    : {...opts, baseOffset: offset};
}

/** Line breaks in `text` from `start` to `end`. */
function countLineBreaks(text: string, start = 0, end = text.length): number {
  let count = 0;
  for (let index = text.indexOf('\n', start); index !== -1 && index < end;) {
    count++;
    index = text.indexOf('\n', index + 1);
  }
  return count;
}

/**
 * Each list the block parser builds, keyed to its markers: their indentation
 * and the bullet or delimiter. The full parse continues a list only with
 * items at the same indentation with the same bullet or delimiter.
 */
const listMarkerShapes = new WeakMap<object, string>();

/**
 * Whether the full parse reads `next`, a blank line after `previous`, as more
 * of the same list: both numbered or both bulleted, with the same delimiter,
 * and — for lists the block parser built — markers at the same indentation
 * with the same bullet. So `- a⏎⏎* b` and ` 1. a⏎⏎2. b` stay two lists.
 */
function continuesList(
  previous: MarkdownAstList<RuntimeExtensionNode>,
  next: MarkdownAstList<RuntimeExtensionNode>,
): boolean {
  if (
    previous.ordered !== next.ordered ||
    previous.delimiter !== next.delimiter
  ) {
    return false;
  }
  const previousShape = listMarkerShapes.get(previous);
  const nextShape = listMarkerShapes.get(next);
  return (
    previousShape == null || nextShape == null || previousShape === nextShape
  );
}

/** `merged`, carrying the marker shape of the list it continues. */
function withMarkerShapeOf<Node extends object>(
  list: object,
  merged: Node,
): Node {
  const shape = listMarkerShapes.get(list);
  if (shape != null) {
    listMarkerShapes.set(merged, shape);
  }
  return merged;
}

/**
 * Concatenate freshly-parsed delta blocks with previously-settled blocks,
 * merging adjacent same-style lists into a single loose list. The boundary
 * detector settles each pre-blank segment independently, so without this
 * merge an incrementally-streamed `1.\n\n1.\n\n1.` would land as N separate
 * lists even though the full-text parser joins them per CommonMark §5.3.
 */
function mergeSettledBlocks(
  prev: MarkdownAstBlockContent<RuntimeExtensionNode>[],
  delta: MarkdownAstBlockContent<RuntimeExtensionNode>[],
): MarkdownAstBlockContent<RuntimeExtensionNode>[] {
  if (prev.length === 0 || delta.length === 0) {
    return [...prev, ...delta];
  }
  const prevLast = prev[prev.length - 1];
  const deltaFirst = delta[0];
  if (
    prevLast.type === 'list' &&
    deltaFirst.type === 'list' &&
    continuesList(prevLast, deltaFirst)
  ) {
    const merged: MarkdownAstBlockContent<RuntimeExtensionNode> = {
      type: 'list',
      ordered: prevLast.ordered,
      start: prevLast.start,
      delimiter: prevLast.delimiter,
      spread: true,
      children: [...prevLast.children, ...deltaFirst.children],
      // One list now, so one position spans both halves.
      ...(prevLast.position != null && deltaFirst.position != null
        ? {
            position: {
              start: prevLast.position.start,
              end: deltaFirst.position.end,
            },
          }
        : null),
    };
    return [
      ...prev.slice(0, -1),
      withMarkerShapeOf(prevLast, merged),
      ...delta.slice(1),
    ];
  }
  return [...prev, ...delta];
}

/** Append a newly-settled slice without copying the already-settled prefix. */
function appendSettledBlocks(
  prev: MarkdownAstBlockContent<RuntimeExtensionNode>[],
  delta: MarkdownAstBlockContent<RuntimeExtensionNode>[],
): boolean {
  if (delta.length === 0) {
    return false;
  }
  if (prev.length === 0) {
    prev.push(...delta);
    return false;
  }
  const prevLast = prev[prev.length - 1];
  const deltaFirst = delta[0];
  if (
    prevLast.type === 'list' &&
    deltaFirst.type === 'list' &&
    continuesList(prevLast, deltaFirst)
  ) {
    prev[prev.length - 1] = withMarkerShapeOf(prevLast, {
      type: 'list',
      ordered: prevLast.ordered,
      start: prevLast.start,
      delimiter: prevLast.delimiter,
      spread: true,
      children: [...prevLast.children, ...deltaFirst.children],
      ...(prevLast.position != null && deltaFirst.position != null
        ? {
            position: {
              start: prevLast.position.start,
              end: deltaFirst.position.end,
            },
          }
        : null),
    });
    prev.push(...delta.slice(1));
    return true;
  }
  prev.push(...delta);
  return false;
}

function sameUnsettledDefinitions(
  previous: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
  settled: ReadonlyMap<string, string>,
): boolean {
  for (const [label, destination] of previous) {
    if (!settled.has(label) && next.get(label) !== destination) {
      return false;
    }
  }
  for (const [label, destination] of next) {
    if (!settled.has(label) && previous.get(label) !== destination) {
      return false;
    }
  }
  return true;
}

function resetIncrementalCache(
  state: IncrementalState<boolean>,
  cache: IncrementalCache,
): void {
  state.prevInput = '';
  state.settledText = '';
  state.settledBlocks = [];
  state.settledUpTo = 0;
  state.linkDefsKey = undefined;
  state.sourceIdsKey = undefined;
  state.pluginSyntaxIdentity = undefined;
  state.math = undefined;
  cache.settledEnd = 0;
  cache.settledEndLine = 0;
  cache.settledLinkDefs.clear();
  cache.tailLinkDefs = new Map();
  cache.linkDefs = new Map();
  cache.linkDefsKey = '';
  cache.settledAstBlocks = [];
  cache.settledRevision++;
  cache.projectedRevision = -1;
  cache.projectedSettledBlocks = [];
  cache.projectionCache = new WeakMap();
  cache.work = {
    splitCharacters: 0,
    boundaryLines: 0,
    definitionCharacters: 0,
    renderedBlocks: 0,
  };
}

/**
 * Parse one cumulative snapshot of a streaming Markdown document.
 *
 * Every call returns a fresh array, and later calls never mutate a
 * previously returned array or the block nodes inside it, so results are
 * stable snapshots. Settled block objects are shared across calls by
 * reference, which is safe because they are replaced — never edited in
 * place — when adjacent content changes them. When the input no longer
 * starts with the settled prefix (a replacement rather than an append),
 * the cache is discarded and the whole document is re-parsed.
 */
export function parseMarkdownIncremental(
  input: string,
  state: IncrementalState<false>,
  sourceIds?: ReadonlySet<string>,
): BlockNode[];
export function parseMarkdownIncremental(
  input: string,
  state: IncrementalState<true>,
  options: IncrementalMathParseOptionsWithoutPlugins,
): BlockNodeWithMath[];
export function parseMarkdownIncremental(
  input: string,
  state: IncrementalState<false>,
  options: IncrementalParseOptionsWithoutPlugins,
): BlockNode[];
export function parseMarkdownIncremental<
  const Plugins extends ReadonlyArray<MarkdownPluginEntry>,
>(
  input: string,
  state: IncrementalState<false>,
  options: IncrementalParseOptionsWithoutPlugins & {plugins: Plugins},
): BlockNode<MarkdownExtensionsOf<Plugins>>[];
export function parseMarkdownIncremental<
  const Plugins extends ReadonlyArray<MarkdownPluginEntry>,
>(
  input: string,
  state: IncrementalState<true>,
  options: IncrementalMathParseOptionsWithoutPlugins & {plugins: Plugins},
): BlockNodeWithMath<MarkdownExtensionsOf<Plugins>>[];
export function parseMarkdownIncremental(
  input: string,
  state: IncrementalState<boolean>,
  arg?: ReadonlySet<string> | RuntimeParseOptions,
): RuntimeBlockNode[] {
  const withRanges = wantsLegacyRanges(arg);
  const root = parseMarkdownAstIncremental(input, state, arg);
  const cache = incrementalCaches.get(state) ?? makeIncrementalCache(state);
  const projected = projectMarkdownRoot(
    root,
    withRanges,
    cache.projectionCache,
  );
  if (cache.projectedRevision !== cache.settledRevision) {
    cache.projectedSettledBlocks = cache.settledAstBlocks.map(block =>
      projectBlockNode(block, cache.projectionCache, withRanges),
    );
    cache.projectedRevision = cache.settledRevision;
  }
  state.settledBlocks =
    cache.projectedSettledBlocks as typeof state.settledBlocks;
  return projected;
}

/** @internal Canonical incremental parse used by Markdown rendering. */
export function parseMarkdownAstIncremental(
  input: string,
  state: IncrementalState<boolean>,
  arg?: ReadonlySet<string> | RuntimeParseOptions,
): MarkdownAstRoot<RuntimeExtensionNode> {
  const opts = resolveOptions(arg, true);
  const root: MarkdownAstRoot<RuntimeExtensionNode> = {
    type: 'root',
    children: parseMarkdownIncrementalAstBlocks(input, state, opts),
  };
  return applyMarkdownTransforms(
    root,
    opts.plugins,
    input,
    opts.isFinal,
    'block',
  );
}

function parseMarkdownIncrementalAstBlocks(
  input: string,
  state: IncrementalState<boolean>,
  opts: ResolvedOptions,
): MarkdownAstBlockContent<RuntimeExtensionNode>[] {
  const cache = incrementalCaches.get(state) ?? makeIncrementalCache(state);
  let reparseSettled = false;

  const nextSourceIdsKey = sourceIdsSignature(opts.sourceIds);
  const nextPluginSyntaxIdentity = opts.plugins?.syntaxIdentity ?? '';
  // Invalidate cache when an option that changes parsed nodes flips — cached
  // settled blocks were parsed with the previous setting and would otherwise
  // be reused unchanged.
  if (
    state.autolink !== opts.autolink ||
    state.math !== opts.math ||
    Boolean(state.sourceRanges) !== Boolean(opts.sourceRanges) ||
    state.sourceIdsKey !== nextSourceIdsKey ||
    state.pluginSyntaxIdentity !== nextPluginSyntaxIdentity
  ) {
    reparseSettled = true;
    state.autolink = opts.autolink;
    state.math = opts.math;
    state.sourceRanges = opts.sourceRanges;
    state.sourceIdsKey = nextSourceIdsKey;
    state.pluginSyntaxIdentity = nextPluginSyntaxIdentity;
  }
  if (input === '') {
    resetIncrementalCache(state, cache);
    return [];
  }
  // The settled prefix is only reusable while the input still contains it
  // verbatim. Lengths alone cannot tell: a same-length or longer replacement
  // (new args after reusing a state) disagrees with the prefix without ever
  // being shorter, so compare content. `startsWith` is a memcmp-speed scan
  // with no allocation and is the one whole-prefix operation retained per
  // call — the contract that a replaced document renders the new content
  // cannot be honored without looking at the prefix. A shorter input can
  // never contain the prefix and fails the same check.
  if (
    state.settledText.length !== cache.settledEnd ||
    !input.startsWith(state.settledText)
  ) {
    resetIncrementalCache(state, cache);
    state.autolink = opts.autolink;
    state.math = opts.math;
    state.sourceRanges = opts.sourceRanges;
    state.sourceIdsKey = nextSourceIdsKey;
    state.pluginSyntaxIdentity = nextPluginSyntaxIdentity;
  }

  // The recurring parse costs are confined to the mutable suffix: splitting,
  // fence/boundary detection, definition collection, and block construction.
  // An open fence simply keeps the suffix growing until its closing marker.
  const oldSettledEnd = cache.settledEnd;
  // The line the settled prefix ends on, only while lines are recorded.
  const oldSettledLine =
    opts.sourceLines === true
      ? (cache.settledEndLine ??= countLineBreaks(state.settledText))
      : 0;
  const tailRaw = input.slice(oldSettledEnd);
  const tailLines = tailRaw.split('\n');
  const {boundary, openFence, openMath} = findSettledBoundary(
    tailLines,
    opts.math,
  );
  const settledDelta =
    boundary >= 0 ? tailLines.slice(0, boundary).join('\n') : '';
  const nextSettledEnd = oldSettledEnd + settledDelta.length;
  const unsettledInput = input.slice(nextSettledEnd);

  // Promote definitions only when their entire block becomes immutable.
  // Tail definitions are re-collected because the tail is allowed to change.
  // Changes that affect the effective set intentionally reparse settled
  // blocks: document-global references may precede their footer definition.
  let definitionsChanged = false;
  if (settledDelta !== '') {
    const {defs: deltaDefs} = extractLinkDefinitions(settledDelta, opts.math);
    for (const [label, destination] of deltaDefs) {
      if (!cache.settledLinkDefs.has(label)) {
        cache.settledLinkDefs.set(label, destination);
        if (cache.linkDefs.get(label) !== destination) {
          definitionsChanged = true;
        }
      }
    }
  }
  const {defs: tailLinkDefs} = extractLinkDefinitions(
    unsettledInput,
    opts.math,
  );
  if (
    !sameUnsettledDefinitions(
      cache.tailLinkDefs,
      tailLinkDefs,
      cache.settledLinkDefs,
    )
  ) {
    definitionsChanged = true;
  }
  cache.tailLinkDefs = tailLinkDefs;

  if (definitionsChanged) {
    // Later entries are overwritten, so settled (earlier) definitions win.
    cache.linkDefs = new Map([...tailLinkDefs, ...cache.settledLinkDefs]);
    cache.linkDefsKey = linkDefsSignature(cache.linkDefs);
    reparseSettled = true;
  }
  state.linkDefsKey = cache.linkDefsKey;
  const parseOpts: ResolvedOptions =
    cache.linkDefs.size > 0 ? {...opts, linkDefs: cache.linkDefs} : opts;

  if (settledDelta !== '') {
    state.settledText += settledDelta;
    state.settledUpTo += settledDelta.split('\n').length - 1;
    if (oldSettledEnd === 0) {
      state.settledUpTo++;
    }
    cache.settledEnd = nextSettledEnd;
    cache.settledEndLine =
      opts.sourceLines === true
        ? oldSettledLine + countLineBreaks(settledDelta)
        : undefined;
  }

  // Blank lines before the tail and whitespace after it carry nothing, but the
  // first line's indentation does: it decides a list's indent and whether a
  // line is a heading, as in a full parse of the same text.
  const trimmedUnsettledInput = unsettledInput
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .trimEnd();
  // Trimming the end removes the CR that belongs to the final content line of a
  // CRLF snapshot along with trailing blank lines. Keep that one byte so
  // source ranges and delimiter content remain identical to a full parse.
  const unsettledRaw =
    trimmedUnsettledInput !== '' && /\r(?:\n[\s]*)?$/.test(unsettledInput)
      ? `${trimmedUnsettledInput}\r`
      : trimmedUnsettledInput;
  // Structural trimming holds back lines that look like an incomplete list or
  // table, which inside a fence is ordinary code: a TypeScript union or a `- `
  // would disappear from the code block as it streams. And an open fence's
  // trailing blank lines are code, as in a full parse of the same text.
  const unsettledText = openFence
    ? unsettledInput.replace(/^(?:[ \t]*\r?\n)+/, '')
    : openMath
      ? trimOpenDisplayMath(unsettledRaw)
      : trimUnsettledStructural(unsettledRaw);

  const legacyRanges = opts.sourceRanges === true;
  let parsedSettledBlocks = 0;
  if (reparseSettled) {
    cache.settledAstBlocks = state.settledText
      ? parseMarkdownImpl(state.settledText, parseOpts)
      : [];
    parsedSettledBlocks = cache.settledAstBlocks.length;
    cache.settledRevision++;
    cache.projectedSettledBlocks = cache.settledAstBlocks.map(block =>
      projectBlockNode(block, cache.projectionCache, legacyRanges),
    );
    cache.projectedRevision = cache.settledRevision;
  } else if (settledDelta !== '') {
    const deltaBlocks = parseMarkdownImpl(
      settledDelta,
      atOffset(parseOpts, oldSettledEnd, oldSettledLine),
    );
    const mergeIndex = cache.settledAstBlocks.length - 1;
    const mergedList = appendSettledBlocks(cache.settledAstBlocks, deltaBlocks);
    parsedSettledBlocks = deltaBlocks.length;
    cache.settledRevision++;
    const projectedDelta = deltaBlocks.map(block =>
      projectBlockNode(block, cache.projectionCache, legacyRanges),
    );
    if (mergedList) {
      const canonicalMerged = cache.settledAstBlocks[mergeIndex];
      const projectedMerged = projectBlockNode(
        canonicalMerged,
        cache.projectionCache,
        legacyRanges,
      );
      cache.projectedSettledBlocks[mergeIndex] = projectedMerged;
      cache.projectedSettledBlocks.push(...projectedDelta.slice(1));
    } else {
      cache.projectedSettledBlocks.push(...projectedDelta);
    }
    cache.projectedRevision = cache.settledRevision;
  }

  // The unsettled tail is trimmed before parsing, so its offset in the
  // document is where that trimmed text actually starts — not the boundary,
  // which is a line index. If it somehow cannot be located, parse it without
  // positions rather than report wrong ones. The search starts at the
  // settled end, so it scans the tail and never the prefix.
  const unsettledStart =
    unsettledText && opts.astPositions === true
      ? input.indexOf(unsettledText, cache.settledEnd)
      : -1;
  const unsettledBlocks = unsettledText
    ? parseMarkdownImpl(
        unsettledText,
        unsettledStart >= 0
          ? atOffset(
              parseOpts,
              unsettledStart,
              opts.sourceLines === true
                ? (cache.settledEndLine ?? 0) +
                    countLineBreaks(input, cache.settledEnd, unsettledStart)
                : 0,
            )
          : nested(parseOpts),
      )
    : [];

  state.prevInput = input;

  // Snapshot semantics: hand back a fresh array so later calls never mutate
  // an earlier return. The settled block objects inside it are reused by
  // reference — they are immutable, so sharing them is what keeps this cheap:
  // assembling the result copies one pointer per settled block and never
  // re-visits the settled characters.
  cache.work = {
    splitCharacters: tailRaw.length,
    boundaryLines: tailLines.length,
    definitionCharacters: settledDelta.length + unsettledInput.length,
    renderedBlocks: parsedSettledBlocks + unsettledBlocks.length,
  };
  return mergeSettledBlocks(cache.settledAstBlocks, unsettledBlocks);
}

// ---------------------------------------------------------------------------
// Heading slugs
// ---------------------------------------------------------------------------
// Single source of truth for the heading id contract: Markdown renders these
// slugs as `id` attributes on h1–h6, and Outline's parseOutlineFromMarkdown
// derives its item ids from the same functions, so outline hash links always
// resolve to a rendered heading by construction.

/** Turn heading text into a URL-safe slug (lowercase, hyphen-separated). */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Disambiguate repeated slugs with a numeric suffix (`setup`, `setup-1`, …).
 * Empty slugs fall back to `section`. The caller owns the counts map so one
 * document shares a single numbering sequence.
 */
export function uniqueSlug(
  baseSlug: string,
  counts: Map<string, number>,
): string {
  const fallbackSlug = baseSlug || 'section';
  const count = counts.get(fallbackSlug) ?? 0;
  counts.set(fallbackSlug, count + 1);
  return count === 0 ? fallbackSlug : `${fallbackSlug}-${count}`;
}
