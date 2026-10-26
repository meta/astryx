// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Markdown.tsx
 * @input Markdown string, canonical AST, optional plugins and custom renderers
 * @output Exports Markdown component, MarkdownProps, and renderer contracts
 * @position Core implementation; renders markdown as Astryx components
 */

import {Suspense, useMemo, useRef, useState} from 'react';
import type React from 'react';
import {Fragment} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typeScaleVars,
  typographyVars,
  fontWeightVars,
  borderVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import type {TextDisplay} from '../theme/types';
import {CodeBlock, Code} from '../CodeBlock';
import {parseFenceLanguage} from '../CodeBlock/tokenizer';
import {listedLanguage, sameCodeLanguageList} from '../CodeBlock/grammar';
import type {CodeLanguage} from '../CodeBlock/grammar';
import {CheckboxList} from '../CheckboxList/CheckboxList';
import {CheckboxListItem} from '../CheckboxList/CheckboxListItem';
import {Blockquote} from '../Blockquote/Blockquote';
import {List} from '../List/List';
import {ListItem} from '../List/ListItem';
import {ListMarkerScope, type ListMarker} from '../List/ListContext';
import {Table} from '../Table/Table';
import {TableRow} from '../Table/TableRow';
import {TableCell} from '../Table/TableCell';
import {TableHeaderCell} from '../Table/TableHeaderCell';
import {TableHeader} from '../Table/TableHeader';
import {TableBody} from '../Table/TableBody';
import {mergeProps} from '../utils';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useStreamingText} from '../hooks/useStreamingText';
import {computeBoundaries, computeSegments} from './streaming';
import type {BaseProps} from '../BaseProps';
import {useTheme} from '../theme/useTheme';
import {Citation} from '../Citation/Citation';
import type {CitationSource} from '../Citation/Citation';
import {useLinkComponent} from '../Link/useLinkComponent';
import type {LinkComponentType} from '../Link/types';
import {
  parseInlineAst,
  parseMarkdownAst,
  parseMarkdownAstIncremental,
  createIncrementalState,
  trimStreamingArtifacts,
} from './parser';
import type {IncrementalState, MathParseOptions, ParseOptions} from './parser';
import {getMarkdownAstLegacyCodeLanguage, markdownAstText} from './ast';
import type {
  MarkdownAstBlockContent,
  MarkdownAstPhrasingContent,
  MarkdownAstPosition,
  MarkdownAstTable,
} from './ast';
import {
  applyMarkdownTransforms,
  getMarkdownExtensionRenderer,
  markdownExtensionText,
  prepareMarkdownPlugins,
  reportMarkdownPluginFailure,
} from './plugins/protocol';
import {getMarkdownFenceProposal} from './plugins/semanticFence';
import {
  MarkdownPluginBoundary,
  renderMarkdownPluginNode,
} from './plugin-renderer/MarkdownPluginNodeRenderer';
import type {
  MarkdownExtensionNode,
  MarkdownPluginEntry,
  PreparedMarkdownPlugins,
} from './plugins/protocol';
import {sanitizeMarkdownLinkUrl, sanitizeMarkdownUrl} from './url';
import {
  projectMarkdownHeadings,
  type MarkdownHeadingProjection,
} from './headingProjection';
import {
  HeadingLinksRenderer,
  headingLinksHeadingStyle,
} from './plugins/HeadingLinksRenderer';
import {themeProps} from '../utils/themeProps';
import {useTranslator, type TranslatorFn} from '../i18n';

type SyncReactNode = Exclude<React.ReactNode, Promise<unknown>>;
type RenderExtensionNode = MarkdownExtensionNode;
type RenderInlineNode = MarkdownAstPhrasingContent<RenderExtensionNode>;
type RenderBlockNode = MarkdownAstBlockContent<RenderExtensionNode>;

// spec:AST-061 DEC-6: a list nested inside n lists, of either kind, draws the
// marker at n modulo 3.
const BULLET_MARKERS: readonly [ListMarker, ListMarker, ListMarker] = [
  'disc',
  'circle',
  'square',
];
const NUMBER_MARKERS: readonly [ListMarker, ListMarker, ListMarker] = [
  'decimal',
  'lower-alpha',
  'lower-roman',
];
type RenderTable = MarkdownAstTable<RenderExtensionNode>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * A plugin that transforms text patterns into custom React elements
 * inside Markdown. Applied to parsed text nodes only — code blocks,
 * inline code, math, and other non-prose contexts are unaffected.
 *
 * Follows Lexical's TextMatchTransformer architecture:
 * - `pattern` for initial regex matching
 * - `getEndIndex` for programmatic boundary refinement
 * - `render` for producing the replacement element
 */
export interface MarkdownInlinePlugin {
  /** Regex with global flag. Matched against text nodes only. */
  pattern: RegExp;

  /**
   * Optional: refine the match boundary after the regex hits.
   * Return the end index, or false to reject the match.
   * Default: match.index + match[0].length
   */
  getEndIndex?: (text: string, match: RegExpMatchArray) => number | false;

  /** Render the match as a React element. */
  render: (match: RegExpMatchArray, key: string) => React.ReactNode;
}

/**
 * A citation source referenced inline in the markdown via `[id]` or `【id】`.
 * When `sources` is provided, bracket content matching a source key is rendered
 * as a compact superscript citation pill instead of plain text.
 */
export type MarkdownSource = CitationSource;

/**
 * A block's 1-based, inclusive source lines, given to `components` block
 * renderers while `markdownSourceLinesPlugin` is installed.
 */
export interface MarkdownSourceLines {
  readonly start: number;
  readonly end: number;
}

export interface MarkdownComponents {
  /**
   * Renders every fenced code block that no semantic-fence plugin claims, and
   * a claimed fence whose plugin renderer declines, throws, or suspends.
   */
  code?: React.ComponentType<{
    code: string;
    language?: string;
    sourceLines?: MarkdownSourceLines;
  }>;
  inlineCode?: React.ComponentType<{children: string}>;
  /**
   * Renders opt-in `$…$` and `$$…$$` math. Supplying this renderer enables
   * math parsing; Astryx passes the raw expression and does not execute it.
   */
  math?: React.ComponentType<{
    value: string;
    display: 'inline' | 'block';
    /** Present for block math only, while source lines are recorded. */
    sourceLines?: MarkdownSourceLines;
  }>;
  citation?: React.ComponentType<{
    source: CitationSource;
    number: number;
    variant: 'label' | 'number';
  }>;
  link?: React.ComponentType<{href: string; children: React.ReactNode}>;
  heading?: React.ComponentType<{
    level: 1 | 2 | 3 | 4 | 5 | 6;
    children: React.ReactNode;
    /**
     * Generated stable id for this heading, matching Markdown-derived Outline.
     * Released output supplies it to root headings; createMarkdownHeadingLinks()
     * expands the shared allocator to headings nested in blockquotes and lists.
     * Custom renderers own their output and should apply the id they receive.
     */
    id?: string;
    sourceLines?: MarkdownSourceLines;
  }>;
  paragraph?: React.ComponentType<{
    children: React.ReactNode;
    sourceLines?: MarkdownSourceLines;
  }>;
  image?: React.ComponentType<{
    src: string;
    alt: string;
    sourceLines?: MarkdownSourceLines;
  }>;
  blockquote?: React.ComponentType<{
    children: React.ReactNode;
    sourceLines?: MarkdownSourceLines;
  }>;
  hr?: React.ComponentType<{sourceLines?: MarkdownSourceLines}>;
}

/** A block node's recorded source lines, if the parse recorded them. */
function blockSourceLines(node: {
  readonly position?: MarkdownAstPosition;
}): MarkdownSourceLines | undefined {
  const start = node.position?.start.line;
  const end = node.position?.end.line;
  return start == null || end == null ? undefined : {start, end};
}

/** The stamps a default block element carries for its source lines. */
function sourceLineAttributes(lines: MarkdownSourceLines | undefined):
  | {
      readonly 'data-source-line': string;
      readonly 'data-source-line-end': string;
    }
  | undefined {
  return lines == null
    ? undefined
    : {
        'data-source-line': String(lines.start),
        'data-source-line-end': String(lines.end),
      };
}

export interface MarkdownProps<
  Plugins extends ReadonlyArray<MarkdownPluginEntry> = readonly [],
> extends BaseProps<HTMLElement> {
  ref?: React.Ref<HTMLDivElement> | React.Ref<HTMLSpanElement>;
  children: string;
  /**
   * Display type. Markdown defaults to block.
   * Use 'inline' for markdown spans embedded inside surrounding text.
   * @default 'block'
   */
  display?: TextDisplay;
  density?: 'default' | 'compact';
  /**
   * The HTML heading level that markdown `#` maps to.
   * Shifts all heading levels down to fit the surrounding page hierarchy.
   * E.g. headingLevelStart={3} renders `#` as h3, `##` as h4, `###` as h5.
   * Levels that would exceed h6 are clamped to h6.
   * @default 1
   */
  headingLevelStart?: 1 | 2 | 3 | 4 | 5 | 6;
  isStreaming?: boolean;
  onLinkClick?: (
    href: string,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => void | false; // eslint-disable-line @typescript-eslint/no-invalid-void-type
  /**
   * Citation sources keyed by ID. When provided, `[id]` and `【id】` markers
   * in the markdown that match a key are rendered as citation chips.
   */
  sources?: Record<string, MarkdownSource>;
  /**
   * How citations are displayed inline.
   * - `'label'` (default) — chip with source title text, icon, and border
   * - `'number'` — compact numbered badge (1, 2, 3…)
   * @default 'label'
   */
  citationStyle?: 'label' | 'number';
  /**
   * Max width for prose content (paragraphs, headings, lists, blockquotes).
   * Tables and code blocks are unconstrained and can expand to the full
   * container width. Use for readable line lengths in wide layouts.
   *
   * @example
   * ```
   * <Markdown contentWidth={640}>{text}</Markdown>
   * ```
   */
  contentWidth?: number | string;
  /**
   * Alignment of prose content within the container when `contentWidth`
   * is narrower than the available space.
   * - 'start': left-aligned (default)
   * - 'center': centered
   * @default 'start'
   */
  contentAlign?: 'start' | 'center';
  components?: Partial<MarkdownComponents>;
  /**
   * Plugins that transform text patterns into custom React elements.
   * Applied to text nodes after parsing — code blocks, inline code, and math
   * are unaffected. Patterns are matched in order; first match wins
   * for overlapping ranges.
   */
  /** Ordered syntax, immutable transforms, and typed extension renderers. */
  plugins?: Plugins;
  /**
   * Legacy text-match renderers. Unchanged and independent from `plugins`.
   */
  inlinePlugins?: MarkdownInlinePlugin[];
  /**
   * Opt-in autolinking of bare URLs and emails inside text.
   * - `'gfm'` — GitHub-Flavored Markdown autolink-literal rules:
   *   `https?://…`, `www.…`, `<scheme:url>`, `<email>`, and bare
   *   `user@host` all become `<a>` links. Trailing sentence punctuation
   *   (`?!.,:*_~`) and unbalanced trailing `)` are excluded; matches inside
   *   code spans, code blocks, existing links, and image alt text are
   *   skipped.
   *
   * Default behavior (option unset) is unchanged — bare URLs render as
   * literal text.
   */
  autolink?: 'gfm';
  /**
   * CodeBlock language values a fence may name: each one imported on its
   * own, such as `graphql` from `@astryxdesign/core/CodeBlock/languages/graphql`,
   * or made with `createCodeLanguage`. A fence whose language word is one of
   * a listed value's identifiers renders with that value, ahead of a built-in
   * with the same identifier; a later entry wins. Without it, fences render
   * as they do today.
   */
  codeLanguages?: ReadonlyArray<CodeLanguage>;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const ALIGN_MARGIN: Record<string, string> = {
  start: '0',
  center: 'auto',
};

const BLOCK_ALIGN_MARGIN: Record<string, string | null> = {
  start: null,
  center: 'auto',
};

const dynamicStyles = stylex.create({
  proseWidth: (maxWidth: string) => ({
    maxWidth,
  }),
  proseAlign: (marginInline: string) => ({
    marginInline,
  }),
  blockWidth: (minWidth: string) => ({
    minWidth: `min(${minWidth}, 100%)`,
  }),
  blockAlign: (marginInline: string) => ({
    marginInline,
  }),
  cellMinWidth: (minWidth: string) => ({
    minWidth,
  }),
});

const cellAlignStyles = stylex.create({
  center: {textAlign: 'center'},
  end: {textAlign: 'end'},
});

/**
 * Cell sizing for Markdown's own default Table part, layered over Table's
 * wrap-mode defaults.
 *
 * Table sizes wrap-mode cells with `max-width: 0` + `word-break: break-word`,
 * and its header cell also applies nowrap + ellipsis. Those defaults zero every
 * column's min-content contribution, so automatic layout divides the container
 * equally: a six-column Markdown table squashes to a few characters per cell,
 * identifiers split mid-word, header labels ellipsize, and nothing ever
 * overflows into the Scroll region that exists to take the width.
 *
 * Here the cell reports an honest min-content, the header wraps instead of
 * truncating, and `box-sizing: content-box` makes the per-column `ch` floor a
 * floor on the text box rather than on the padded border box — so the floor
 * means the same number of characters at every density, with no padding
 * arithmetic to keep in sync with Table's own tokens.
 *
 * Data-driven `Table` keeps its released wrap mode; only Markdown's part is
 * restyled.
 */
const markdownTableCellStyles = stylex.create({
  cell: {
    boxSizing: 'content-box',
    maxWidth: 'none',
    overflow: 'visible',
    overflowWrap: 'break-word',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
    wordBreak: 'normal',
  },
  headerCell: {
    boxSizing: 'content-box',
    maxWidth: 'none',
    overflow: 'visible',
    overflowWrap: 'break-word',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
    textOverflow: 'clip',
    whiteSpace: 'normal',
    wordBreak: 'normal',
  },
  // Inline Code sets `word-break: break-word` so a long token cannot widen a
  // paragraph. Inside a table cell that same rule zeroes the token's
  // min-content and splits an identifier across lines; the cell keeps it whole
  // and lets the column carry the width instead.
  code: {
    wordBreak: 'normal',
  },
  // The grid's outer edge. `dividers="grid"` draws the lines *between* cells
  // and stops at the table's rim, so without this the top, bottom, and sides
  // stay open and the grid reads as unfinished. On the table element, not the
  // wrapper, so `border-collapse: collapse` merges it with the cell lines
  // into one 1px rule rather than doubling up at the edge.
  tableOuterEdge: {
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
  },
});

/**
 * Default inline-code renderer inside Markdown table cells. Used only when the
 * consumer supplies no `components.inlineCode`; a custom renderer owns its own
 * wrapping rules.
 */
function MarkdownTableCellCode({children}: {children: string}) {
  return <Code xstyle={markdownTableCellStyles.code}>{children}</Code>;
}

const styles = stylex.create({
  root: {
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-primary'],
    lineHeight: typeScaleVars['--text-body-leading'],
    fontSize: typeScaleVars['--text-body-size'],
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflowWrap: 'break-word',
  },
  inlineRoot: {
    display: 'inline',
    width: 'auto',
    maxWidth: 'none',
    fontFamily: 'inherit',
    color: 'inherit',
    lineHeight: 'inherit',
    fontSize: 'inherit',
  },
  // Headings
  headingBase: {
    fontFamily: typographyVars['--font-family-heading'],
    color: colorVars['--color-text-primary'],
  },
  h1: {
    fontSize: typeScaleVars['--text-heading-1-size'],
    fontWeight: typeScaleVars['--text-heading-1-weight'],
    lineHeight: typeScaleVars['--text-heading-1-leading'],
  },
  h2: {
    fontSize: typeScaleVars['--text-heading-2-size'],
    fontWeight: typeScaleVars['--text-heading-2-weight'],
    lineHeight: typeScaleVars['--text-heading-2-leading'],
  },
  h3: {
    fontSize: typeScaleVars['--text-heading-3-size'],
    fontWeight: typeScaleVars['--text-heading-3-weight'],
    lineHeight: typeScaleVars['--text-heading-3-leading'],
  },
  h4: {
    fontSize: typeScaleVars['--text-heading-4-size'],
    fontWeight: typeScaleVars['--text-heading-4-weight'],
    lineHeight: typeScaleVars['--text-heading-4-leading'],
  },
  h5: {
    fontSize: typeScaleVars['--text-heading-5-size'],
    fontWeight: typeScaleVars['--text-heading-5-weight'],
    lineHeight: typeScaleVars['--text-heading-5-leading'],
  },
  h6: {
    fontSize: typeScaleVars['--text-heading-6-size'],
    fontWeight: typeScaleVars['--text-heading-6-weight'],
    lineHeight: typeScaleVars['--text-heading-6-leading'],
  },
  // Block spacing — per element type, default density
  spacingHeadingMajorDefault: {
    marginBlockStart: spacingVars['--spacing-6'],
    marginBlockEnd: spacingVars['--spacing-3'],
  },
  spacingHeadingMinorDefault: {
    marginBlockStart: spacingVars['--spacing-4'],
    marginBlockEnd: spacingVars['--spacing-2'],
  },
  spacingParagraphDefault: {
    marginBlockStart: spacingVars['--spacing-3'],
    marginBlockEnd: spacingVars['--spacing-3'],
  },
  spacingCodeblockDefault: {
    marginBlockStart: spacingVars['--spacing-4'],
    marginBlockEnd: spacingVars['--spacing-4'],
  },
  spacingBlockquoteDefault: {
    marginBlockStart: spacingVars['--spacing-4'],
    marginBlockEnd: spacingVars['--spacing-4'],
  },
  spacingListDefault: {
    marginBlockStart: spacingVars['--spacing-3'],
    marginBlockEnd: spacingVars['--spacing-3'],
  },
  spacingTableDefault: {
    marginBlockStart: spacingVars['--spacing-4'],
    marginBlockEnd: spacingVars['--spacing-4'],
  },
  spacingHrDefault: {
    marginBlockStart: spacingVars['--spacing-6'],
    marginBlockEnd: spacingVars['--spacing-6'],
  },
  spacingImageDefault: {
    marginBlockStart: spacingVars['--spacing-3'],
    marginBlockEnd: spacingVars['--spacing-3'],
  },
  // Block spacing — per element type, compact density
  spacingHeadingMajorCompact: {
    marginBlockStart: spacingVars['--spacing-4'],
    marginBlockEnd: spacingVars['--spacing-2'],
  },
  spacingHeadingMinorCompact: {
    marginBlockStart: spacingVars['--spacing-3'],
    marginBlockEnd: spacingVars['--spacing-1'],
  },
  spacingParagraphCompact: {
    marginBlockStart: spacingVars['--spacing-1'],
    marginBlockEnd: spacingVars['--spacing-1'],
  },
  spacingCodeblockCompact: {
    marginBlockStart: spacingVars['--spacing-2'],
    marginBlockEnd: spacingVars['--spacing-2'],
  },
  spacingBlockquoteCompact: {
    marginBlockStart: spacingVars['--spacing-2'],
    marginBlockEnd: spacingVars['--spacing-2'],
  },
  spacingListCompact: {
    marginBlockStart: spacingVars['--spacing-1'],
    marginBlockEnd: spacingVars['--spacing-1'],
  },
  spacingTableCompact: {
    marginBlockStart: spacingVars['--spacing-2'],
    marginBlockEnd: spacingVars['--spacing-2'],
  },
  spacingHrCompact: {
    marginBlockStart: spacingVars['--spacing-3'],
    marginBlockEnd: spacingVars['--spacing-3'],
  },
  spacingImageCompact: {
    marginBlockStart: spacingVars['--spacing-2'],
    marginBlockEnd: spacingVars['--spacing-2'],
  },
  noMarginBlockStart: {
    marginBlockStart: 0,
  },
  noMarginBlockEnd: {
    marginBlockEnd: 0,
  },
  // Table
  codeBlockWrapper: {
    maxWidth: '100%',
  },
  tableWrapper: {
    // No `overflow-x` here: Table's own Scroll region (`table-scroll-wrapper`)
    // is the table's scroller, and this block is exactly as wide as it, so a
    // second scroll container would only add a dead focus stop.
    maxWidth: '100%',
    '--container-padding-inline-start': '0px',
    '--container-padding-inline-end': '0px',
    '--container-padding-block-start': '0px',
    '--container-padding-block-end': '0px',
  },
  blockIndent: {
    marginInline: `calc(-1 * ${spacingVars['--spacing-2']})`,
  },
  // HR
  hr: {
    borderWidth: 0,
    borderTopWidth: borderVars['--border-width'],
    borderTopStyle: 'solid',
    borderTopColor: colorVars['--color-border'],
  },
  // Image
  image: {
    maxWidth: '100%',
    borderRadius: radiusVars['--radius-element'],
  },
  // Inline
  bold: {
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  strikethrough: {
    color: colorVars['--color-text-secondary'],
  },
  link: {
    color: colorVars['--color-text-accent'],
    textDecoration: 'underline',
  },
});

// ---------------------------------------------------------------------------
// Streaming fade-in animation

// Parse a CSS duration string (e.g. "175ms", "0.15s") to milliseconds.
function parseDuration(value: string): number | null {
  const ms = value.match(/^([\d.]+)ms$/);
  if (ms) {
    return parseFloat(ms[1]);
  }
  const s = value.match(/^([\d.]+)s$/);
  if (s) {
    return parseFloat(s[1]) * 1000;
  }
  return null;
}

// ---------------------------------------------------------------------------

const streamingStyles = stylex.create({
  fadeIn: {
    opacity: 1,
    transitionProperty: 'opacity',
    // Collapse the entry fade to an instant swap under reduced motion. The
    // 0s duration makes the @starting-style opacity jump non-animated (the
    // media query can't nest inside @starting-style), mirroring the
    // conditional-duration form in Spinner (Spinner.tsx).
    transitionDuration: {
      default: durationVars['--duration-medium'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    '@starting-style': {
      opacity: 0,
    },
  },
});

/**
 * Mutable cursor threaded through the render tree during streaming.
 * Tracks how many text characters we've visited so far. When `offset`
 * crosses `boundary`, newly rendered content is wrapped in a fade-in span.
 */
interface StreamingCursor {
  /** Characters visited so far in this render pass */
  offset: number;
  /** Recent boundary positions (up to 3), oldest first.
   *  Text before boundaries[0] is fully visible (no animation).
   *  Text between boundaries[i] and boundaries[i+1] gets its own fade span.
   *  Text after the last boundary is the newest chunk. */
  boundaries: number[];
  /** Whether streaming fade is active */
  active: boolean;
}

/**
 * Count the total text characters in inline nodes without rendering.
 * Used to advance the cursor past a block that will be faded as a whole unit.
 */
function countInlineTextLength(nodes: ReadonlyArray<RenderInlineNode>): number {
  let len = 0;
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        len += node.value.length;
        break;
      case 'inlineCode':
        len += node.value.length;
        break;
      case 'inlineMath':
        len += node.value.length;
        break;
      case 'image':
        len += node.alt.length;
        break;
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'link':
        len += countInlineTextLength(node.children);
        break;
      case 'break':
        len += 1;
        break;
      case 'citation':
        len += 1;
        break;
      case 'extension':
        len += node.source?.length ?? 0;
        break;
    }
  }
  return len;
}

/**
 * Count total text characters in a block node tree.
 */
function countBlockTextLength(nodes: ReadonlyArray<RenderBlockNode>): number {
  let len = 0;
  for (const node of nodes) {
    switch (node.type) {
      case 'heading':
      case 'paragraph':
        len += countInlineTextLength(node.children);
        break;
      case 'code':
        len += node.value.length;
        break;
      case 'math':
        len += node.value.length;
        break;
      case 'blockquote':
        len += countBlockTextLength(node.children);
        break;
      case 'list':
        for (const item of node.children) {
          len += countBlockTextLength(item.children);
        }
        break;
      case 'table':
        for (const row of node.children) {
          for (const cell of row.children) {
            len += countInlineTextLength(cell.children);
          }
        }
        break;
      case 'extension':
        len += node.source?.length ?? 0;
        break;
      case 'thematicBreak':
        break;
      case 'image':
        len += node.alt.length;
        break;
    }
  }
  return len;
}

const headingStyles = {
  1: styles.h1,
  2: styles.h2,
  3: styles.h3,
  4: styles.h4,
  5: styles.h5,
  6: styles.h6,
} as const;

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Inline plugin matching
// ---------------------------------------------------------------------------

type InlinePluginSegment =
  | {type: 'text'; content: string}
  | {type: 'plugin'; element: React.ReactNode; matchLength: number};

/**
 * Find all plugin matches in a text string and split it into segments
 * of plain text and plugin-rendered elements.
 *
 * Algorithm mirrors `findMatches` in `useLinkify`:
 * 1. Run each plugin's regex against the text
 * 2. Check getEndIndex if provided (default: match.index + match[0].length)
 * 3. If getEndIndex returns false, skip the match
 * 4. Collect all non-overlapping matches, sorted by start (first match wins)
 * 5. Split into text/plugin segments
 */
function applyInlinePlugins(
  text: string,
  plugins: MarkdownInlinePlugin[],
): InlinePluginSegment[] {
  interface RawMatch {
    start: number;
    end: number;
    match: RegExpMatchArray;
    plugin: MarkdownInlinePlugin;
  }

  const allMatches: RawMatch[] = [];

  for (const plugin of plugins) {
    // Reset lastIndex instead of cloning — avoids allocation per call.
    // Safe because text nodes are processed sequentially (no interleaving).
    plugin.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = plugin.pattern.exec(text)) !== null) {
      let end: number;
      if (plugin.getEndIndex) {
        const result = plugin.getEndIndex(text, m);
        if (result === false) {
          continue;
        }
        end = result;
      } else {
        end = m.index + m[0].length;
      }

      allMatches.push({
        start: m.index,
        end,
        match: m,
        plugin,
      });
    }
  }

  // Sort by start position (stable sort preserves plugin order for same position)
  allMatches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (first wins)
  const resolved: RawMatch[] = [];
  let lastEnd = 0;
  for (const m of allMatches) {
    if (m.start >= lastEnd) {
      resolved.push(m);
      lastEnd = m.end;
    }
  }

  if (resolved.length === 0) {
    return [{type: 'text', content: text}];
  }

  const segments: InlinePluginSegment[] = [];
  let cursor = 0;

  for (let i = 0; i < resolved.length; i++) {
    const m = resolved[i];

    // Text before this match
    if (m.start > cursor) {
      segments.push({type: 'text', content: text.slice(cursor, m.start)});
    }

    // Plugin element
    segments.push({
      type: 'plugin',
      element: m.plugin.render(m.match, `plugin-${i}`),
      matchLength: m.end - m.start,
    });

    cursor = m.end;
  }

  // Remaining text
  if (cursor < text.length) {
    segments.push({type: 'text', content: text.slice(cursor)});
  }

  return segments;
}

function useStableMarkdownSyntaxEntries(
  plugins: PreparedMarkdownPlugins | undefined,
): ReadonlyArray<MarkdownPluginEntry> | undefined {
  const identity = plugins?.syntaxIdentity ?? '';
  const syntaxEntriesRef = useRef<
    | {
        identity: string;
        entries: ReadonlyArray<MarkdownPluginEntry> | undefined;
      }
    | undefined
  >(undefined);
  if (
    syntaxEntriesRef.current == null ||
    syntaxEntriesRef.current.identity !== identity
  ) {
    syntaxEntriesRef.current = {
      identity,
      entries:
        plugins == null || identity === '' ? undefined : plugins.syntaxEntries,
    };
  }
  return syntaxEntriesRef.current.entries;
}

// ---------------------------------------------------------------------------
// Inline renderer
// ---------------------------------------------------------------------------

/**
 * Wrap a text string with a fade-in span for the portion that is "new".
 * If the entire string is old, returns it as-is. If partially new, splits
 * into [old, <span fade>new</span>]. If entirely new, wraps the whole thing.
 */
/** Check if a cursor offset is in the "new" (animating) region */
function wrapTextWithFade(
  content: string,
  cursor: StreamingCursor,
  key: string | number,
): SyncReactNode {
  const startOffset = cursor.offset;
  cursor.offset += content.length;

  if (!cursor.active) {
    return content;
  }

  const segments = computeSegments(
    content,
    startOffset,
    cursor.boundaries,
    key,
  );

  if (segments == null) {
    return content;
  }

  const nodes = segments.map(seg =>
    seg.fading ? (
      <span key={seg.key} {...stylex.props(streamingStyles.fadeIn)}>
        {seg.text}
      </span>
    ) : (
      <span key={seg.key}>{seg.text}</span>
    ),
  );

  return <span key={`wrap-${key}`}>{nodes}</span>;
}

/**
 * Context for citation rendering, threaded through the inline/block render tree.
 * Tracks which sources have been cited and assigns sequential display numbers.
 */
interface CitationContext {
  sources: Record<string, MarkdownSource>;
  numberMap: Map<string, number>;
  nextNumber: number;
  style: 'label' | 'number';
}

function getCitationNumber(ctx: CitationContext, sourceId: string): number {
  let num = ctx.numberMap.get(sourceId);
  if (num == null) {
    num = ctx.nextNumber++;
    ctx.numberMap.set(sourceId, num);
  }
  return num;
}

function renderInline(
  node: RenderInlineNode,
  index: number,
  onLinkClick: MarkdownProps['onLinkClick'] | undefined,
  cursor: StreamingCursor,
  citationCtx: CitationContext | null,
  linkComponent: LinkComponentType = 'a',
  inlinePlugins?: MarkdownInlinePlugin[],
  components?: Partial<MarkdownComponents>,
  preparedPlugins?: PreparedMarkdownPlugins,
): SyncReactNode {
  switch (node.type) {
    case 'text': {
      if (inlinePlugins && inlinePlugins.length > 0) {
        const segments = applyInlinePlugins(node.value, inlinePlugins);
        // If no plugin matched, fall through to the normal path
        // O(1) guard: applyInlinePlugins returns a single text segment when
        // nothing matched — skip the plugin path entirely in that case.
        if (!(segments.length === 1 && segments[0].type === 'text')) {
          const result: React.ReactNode[] = [];
          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (seg.type === 'text') {
              result.push(
                wrapTextWithFade(seg.content, cursor, `${index}-seg-${i}`),
              );
            } else {
              // Plugin segment — advance cursor by matchLength
              cursor.offset += seg.matchLength;
              result.push(
                <Fragment key={`plugin-${index}-${i}`}>{seg.element}</Fragment>,
              );
            }
          }
          return <Fragment key={index}>{result}</Fragment>;
        }
      }
      return wrapTextWithFade(node.value, cursor, index);
    }
    case 'strong':
      return (
        <strong key={index} {...stylex.props(styles.bold)}>
          {node.children.map((c, i) =>
            renderInline(
              c,
              i,
              onLinkClick,
              cursor,
              citationCtx,
              linkComponent,
              inlinePlugins,
              components,
              preparedPlugins,
            ),
          )}
        </strong>
      );
    case 'emphasis':
      return (
        <em key={index}>
          {node.children.map((c, i) =>
            renderInline(
              c,
              i,
              onLinkClick,
              cursor,
              citationCtx,
              linkComponent,
              inlinePlugins,
              components,
              preparedPlugins,
            ),
          )}
        </em>
      );
    case 'delete':
      return (
        <del key={index} {...stylex.props(styles.strikethrough)}>
          {node.children.map((c, i) =>
            renderInline(
              c,
              i,
              onLinkClick,
              cursor,
              citationCtx,
              linkComponent,
              inlinePlugins,
              components,
              preparedPlugins,
            ),
          )}
        </del>
      );
    case 'inlineCode': {
      // Track code content length for cursor but don't split inside code
      cursor.offset += node.value.length;
      const InlineCodeComp = components?.inlineCode;
      const codeEl = InlineCodeComp ? (
        <InlineCodeComp key={index}>{node.value}</InlineCodeComp>
      ) : (
        <Code key={index}>{node.value}</Code>
      );
      return codeEl;
    }
    case 'inlineMath': {
      const MathComp = components?.math;
      if (MathComp == null) {
        return wrapTextWithFade(`$${node.value}$`, cursor, index);
      }
      cursor.offset += node.value.length;
      return <MathComp key={index} value={node.value} display="inline" />;
    }
    case 'link': {
      const safeHref = sanitizeMarkdownLinkUrl(node.url);
      if (safeHref == null) {
        // Unsafe URL — render as plain text
        return (
          <span key={index}>
            {node.children.map((c, i) =>
              renderInline(
                c,
                i,
                onLinkClick,
                cursor,
                citationCtx,
                linkComponent,
                inlinePlugins,
                components,
                preparedPlugins,
              ),
            )}
          </span>
        );
      }
      const LinkComp = components?.link;
      if (LinkComp) {
        return (
          <LinkComp key={index} href={safeHref}>
            {node.children.map((c, i) =>
              renderInline(
                c,
                i,
                onLinkClick,
                cursor,
                citationCtx,
                linkComponent,
                inlinePlugins,
                components,
                preparedPlugins,
              ),
            )}
          </LinkComp>
        );
      }
      const isExternal =
        safeHref.startsWith('https://') || safeHref.startsWith('http://');
      const handleClick = onLinkClick
        ? (e: React.MouseEvent<HTMLAnchorElement>) => {
            const result = onLinkClick(safeHref, e);
            if (result === false) {
              e.preventDefault();
            }
          }
        : undefined;
      // Use linkComponent for internal links, native <a> for external links.
      // Framework routers (Next.js, React Router) handle internal navigation;
      // external links with target="_blank" should use a plain anchor.
      const LinkTag = isExternal ? 'a' : linkComponent;
      return (
        <LinkTag
          key={index}
          href={safeHref}
          onClick={handleClick}
          {...(isExternal
            ? {target: '_blank', rel: 'noopener noreferrer'}
            : {})}
          {...stylex.props(styles.link)}>
          {node.children.map((c, i) =>
            renderInline(
              c,
              i,
              onLinkClick,
              cursor,
              citationCtx,
              linkComponent,
              inlinePlugins,
              components,
              preparedPlugins,
            ),
          )}
        </LinkTag>
      );
    }
    case 'image': {
      const safeSrc = sanitizeMarkdownUrl(node.url);
      if (safeSrc == null) {
        return <span key={index}>[{node.alt}]</span>;
      }
      const ImageComp = components?.image;
      if (ImageComp) {
        return <ImageComp key={index} src={safeSrc} alt={node.alt} />;
      }
      return (
        <img
          key={index}
          src={safeSrc}
          alt={node.alt}
          {...stylex.props(styles.image)}
        />
      );
    }
    case 'extension':
      return renderMarkdownPluginNode(
        preparedPlugins,
        node,
        wrapTextWithFade(
          node.source ?? markdownExtensionText(preparedPlugins, node),
          cursor,
          index,
        ),
        index,
      );
    case 'break':
      cursor.offset += 1;
      return <br key={index} />;
    case 'citation': {
      cursor.offset += 1;
      if (!citationCtx) {
        // No sources provided — render as plain text
        return <span key={index}>[{node.sourceId}]</span>;
      }
      const num = getCitationNumber(citationCtx, node.sourceId);
      const source = citationCtx.sources[node.sourceId] ?? {
        title: node.sourceId,
      };
      const citVariant = citationCtx.style === 'number' ? 'number' : 'label';
      const CitationComp = components?.citation;
      const chip = CitationComp ? (
        <CitationComp
          key={index}
          source={source}
          number={num}
          variant={citVariant}
        />
      ) : (
        <Citation
          key={index}
          source={source}
          number={num}
          variant={citVariant}
        />
      );

      return chip;
    }
  }
}

// ---------------------------------------------------------------------------
// Block spacing helper
// ---------------------------------------------------------------------------

function getElementSpacing(
  node: RenderBlockNode,
  density: 'default' | 'compact',
): StyleXStyles {
  const compact = density === 'compact';
  switch (node.type) {
    case 'heading':
      return node.depth <= 3
        ? compact
          ? styles.spacingHeadingMajorCompact
          : styles.spacingHeadingMajorDefault
        : compact
          ? styles.spacingHeadingMinorCompact
          : styles.spacingHeadingMinorDefault;
    case 'paragraph':
      return compact
        ? styles.spacingParagraphCompact
        : styles.spacingParagraphDefault;
    case 'code':
    case 'math':
      return compact
        ? styles.spacingCodeblockCompact
        : styles.spacingCodeblockDefault;
    case 'blockquote':
      return compact
        ? styles.spacingBlockquoteCompact
        : styles.spacingBlockquoteDefault;
    case 'list':
      return compact ? styles.spacingListCompact : styles.spacingListDefault;
    case 'table':
      return compact ? styles.spacingTableCompact : styles.spacingTableDefault;
    case 'extension':
      return compact
        ? styles.spacingParagraphCompact
        : styles.spacingParagraphDefault;
    case 'thematicBreak':
      return compact ? styles.spacingHrCompact : styles.spacingHrDefault;
    case 'image':
      return compact ? styles.spacingImageCompact : styles.spacingImageDefault;
  }
}

// ---------------------------------------------------------------------------
// Block renderer
// ---------------------------------------------------------------------------

/**
 * Content-derived width floors for a Markdown table's columns, in `ch`.
 *
 * Once the cells stop clamping themselves (see `markdownTableCellStyles`),
 * automatic table layout already gives every column its min-content — the
 * longest unbreakable token — so no identifier can split mid-word. That floor
 * is honest but not readable: a prose column's longest word is short, so six
 * prose columns in a narrow container still wrap one word per line. The
 * readable floor lets a column's longest cell wrap to about two lines instead,
 * scaled by that cell's own length and bounded so a table of short columns
 * still fits its container.
 *
 * A header label adds its own floor, so a short-bodied column stays as wide as
 * its label reads on one line, up to a cap past which the label wraps rather
 * than widening the column further.
 *
 * The floors are `ch`, not `px`: they follow the reader's font size, and with
 * `box-sizing: content-box` on the cells they are floors on the text box, so
 * cell padding does not eat into them. Exact tuning lives here, not in the
 * spec.
 */
const TABLE_COLUMN_MIN_CH = 4;
const TABLE_COLUMN_MAX_CH = 24;
const TABLE_COLUMN_TARGET_LINES = 2;
const TABLE_HEADER_ONE_LINE_MAX_CH = 20;

function computeTableColumnMinWidths(node: RenderTable): number[] {
  const [header, ...rows] = node.children;
  if (header == null) {
    return [];
  }
  return header.children.map((cell, colIdx) => {
    const headerLen = countInlineTextLength(cell.children);
    let maxLen = headerLen;
    for (const row of rows) {
      const rowCell = row.children[colIdx];
      if (rowCell != null) {
        const len = countInlineTextLength(rowCell.children);
        if (len > maxLen) {
          maxLen = len;
        }
      }
    }
    // Body floor: the longest cell wraps to about TARGET_LINES lines.
    const bodyFloor = Math.ceil(maxLen / TABLE_COLUMN_TARGET_LINES);
    // Header floor: the label reads on one line up to the one-line cap.
    const headerFloor = Math.min(headerLen, TABLE_HEADER_ONE_LINE_MAX_CH);
    return Math.min(
      TABLE_COLUMN_MAX_CH,
      Math.max(TABLE_COLUMN_MIN_CH, bodyFloor, headerFloor),
    );
  });
}

function renderBlock(
  node: RenderBlockNode,
  index: number,
  blockCount: number,
  density: 'default' | 'compact',
  headingLevelStart: 1 | 2 | 3 | 4 | 5 | 6,
  onLinkClick: MarkdownProps['onLinkClick'] | undefined,
  cursor: StreamingCursor,
  citationCtx: CitationContext | null,
  contentWidthValue: string | null,
  contentAlign: 'start' | 'center',
  linkComponent: LinkComponentType = 'a',
  inlinePlugins: MarkdownInlinePlugin[] | undefined,
  components: Partial<MarkdownComponents> | undefined,
  preparedPlugins: PreparedMarkdownPlugins | undefined,
  t: TranslatorFn,
  // Language values fences may name (component:Markdown FR30).
  codeLanguages: ReadonlyArray<CodeLanguage> | undefined,
  headingProjection?: MarkdownHeadingProjection,
  // How many lists enclose this block (spec:AST-061 DEC-6).
  listDepth = 0,
): SyncReactNode {
  const blockAlignMargin = BLOCK_ALIGN_MARGIN[contentAlign];
  const blockAlignStyle =
    blockAlignMargin != null
      ? dynamicStyles.blockAlign(blockAlignMargin)
      : null;
  const spacing = getElementSpacing(node, density);
  const isFirst = index === 0;
  const isLast = index === blockCount - 1;
  // Source lines exist only while the source-lines plugin is installed
  // (module:Markdown/sourceLines); otherwise no block reads them.
  const recordsSourceLines = preparedPlugins?.sourceLines === true;
  const sourceLines = recordsSourceLines ? blockSourceLines(node) : undefined;
  const lineStamps = sourceLineAttributes(sourceLines);
  const lineProp = sourceLines == null ? null : {sourceLines};

  switch (node.type) {
    case 'heading': {
      const level = Math.min(node.depth + headingLevelStart - 1, 6) as
        1 | 2 | 3 | 4 | 5 | 6;
      const headingChildren = node.children.map((c, i) =>
        renderInline(
          c,
          i,
          onLinkClick,
          cursor,
          citationCtx,
          linkComponent,
          inlinePlugins,
          components,
          preparedPlugins,
        ),
      );
      const headingId = headingProjection?.ids.get(node);
      const headingLabel = headingProjection?.labels.get(node) ?? '';
      const permalinkUrl = headingProjection?.permalinkUrls.get(node);
      const HeadingComp = components?.heading;
      if (HeadingComp) {
        return (
          <HeadingComp key={index} level={level} id={headingId} {...lineProp}>
            {headingChildren}
          </HeadingComp>
        );
      }
      const Tag = `h${level}` as const;
      if (permalinkUrl == null || headingId == null) {
        return (
          <Tag
            key={index}
            id={headingId}
            {...mergeProps(
              themeProps('markdown-heading', {density, level}),
              stylex.props(
                styles.headingBase,
                headingStyles[level],
                spacing,
                contentWidthValue != null
                  ? dynamicStyles.proseWidth(contentWidthValue)
                  : null,
                contentAlign !== 'start'
                  ? dynamicStyles.proseAlign(ALIGN_MARGIN[contentAlign])
                  : null,
                isFirst && styles.noMarginBlockStart,
                isLast && styles.noMarginBlockEnd,
              ),
            )}
            {...lineStamps}>
            {headingChildren}
          </Tag>
        );
      }
      return (
        <HeadingLinksRenderer
          key={index}
          headingId={headingId}
          headingLabel={headingLabel}
          permalinkUrl={permalinkUrl}
          contentWidth={contentWidthValue}
          contentAlign={contentAlign}
          headingTextStyle={[styles.headingBase, headingStyles[level]]}
          blockSpacingStyle={[
            spacing,
            isFirst && styles.noMarginBlockStart,
            isLast && styles.noMarginBlockEnd,
          ]}>
          <Tag
            id={headingId}
            {...mergeProps(
              themeProps('markdown-heading', {density, level}),
              stylex.props(
                styles.headingBase,
                headingLinksHeadingStyle,
                headingStyles[level],
              ),
            )}
            {...lineStamps}>
            {headingChildren}
          </Tag>
        </HeadingLinksRenderer>
      );
    }
    case 'paragraph': {
      const paraChildren = node.children.map((c, i) =>
        renderInline(
          c,
          i,
          onLinkClick,
          cursor,
          citationCtx,
          linkComponent,
          inlinePlugins,
          components,
          preparedPlugins,
        ),
      );
      const ParagraphComp = components?.paragraph;
      if (ParagraphComp) {
        return (
          <ParagraphComp key={index} {...lineProp}>
            {paraChildren}
          </ParagraphComp>
        );
      }
      // Markdown paragraphs render as <div>, not <p>: inline content can
      // include block-level nodes (images, custom inline components), and a
      // <p> would reparent them, desyncing SSR markup from the hydrated DOM.
      // Block spacing comes from token-based StyleX margins, so the rendered
      // appearance is unchanged. role="paragraph" re-exposes the paragraph
      // role in the accessibility tree (a pure ARIA hint — it does not trigger
      // the parser's block-child reparenting) so prose semantics are preserved
      // without the <p> composition hazard. Consumers who want a real <p>
      // element can still pass components={{paragraph: 'p'}}.
      return (
        <div
          key={index}
          role="paragraph"
          {...mergeProps(
            themeProps('markdown-paragraph', {density}),
            stylex.props(
              spacing,
              contentWidthValue != null
                ? dynamicStyles.proseWidth(contentWidthValue)
                : null,
              contentAlign !== 'start'
                ? dynamicStyles.proseAlign(ALIGN_MARGIN[contentAlign])
                : null,
              isFirst && styles.noMarginBlockStart,
              isLast && styles.noMarginBlockEnd,
            ),
          )}
          {...lineStamps}>
          {paraChildren}
        </div>
      );
    }
    case 'code': {
      // Track codeblock content in cursor for accurate character counting
      cursor.offset += node.value.length;
      // `diff-<lang>` fences are the diff layer over <lang>; `diff` is the
      // layer over plaintext. The legacy language is the info
      // string's leading word characters, which stops at the hyphen, so the
      // diff mapping reads the whole first word and then applies the same
      // word rule to the language it names.
      const legacyLanguage =
        getMarkdownAstLegacyCodeLanguage(node) ?? 'plaintext';
      const fence = parseFenceLanguage(node.lang ?? legacyLanguage);
      const isDiff = fence.isDiff;
      // The language under the diff layer; the default CodeBlock renders it.
      const diffLanguage = isDiff
        ? fence.language.match(/^\w*/)?.[0] || 'plaintext'
        : undefined;
      const fenceWord = diffLanguage ?? legacyLanguage;
      // A listed language value claims its identifiers ahead of a built-in
      // with the same identifier (component:Markdown FR30).
      const language = listedLanguage(codeLanguages, fenceWord) ?? fenceWord;
      // A semantic-fence proposal claims its fence before the host's code
      // renderer (spec:AST-036 FR17). The host renderer, or the default Code
      // block without one, draws every unclaimed fence and is the fallback
      // when the claiming renderer is absent, declines, throws, or suspends.
      const CodeBlockComp = components?.code;
      const fallback = CodeBlockComp ? (
        <CodeBlockComp
          key={index}
          code={node.value}
          // A supplied renderer's contract is unchanged: it keeps receiving
          // the leading word characters (`diff` for a `diff-tsx` fence, as
          // today) and nothing new; only the default path maps the layer.
          language={legacyLanguage}
          {...lineProp}
        />
      ) : (
        <div
          key={index}
          {...mergeProps(
            themeProps('markdown-codeblock', {density}),
            stylex.props(
              spacing,
              styles.codeBlockWrapper,
              isFirst && styles.noMarginBlockStart,
              isLast && styles.noMarginBlockEnd,
            ),
          )}
          {...lineStamps}>
          <CodeBlock
            code={node.value}
            language={language}
            isDiff={isDiff}
            isCollapsible
            // Long lines wrap rather than scroll sideways, as they do in
            // RichText, so a reader sees whole lines and the read/edit switch
            // moves no block (spec:AST-061 FR5, DEC-9).
            isWrapped
            xstyle={[
              contentWidthValue != null
                ? dynamicStyles.blockWidth(contentWidthValue)
                : undefined,
              blockAlignStyle,
            ]}
          />
        </div>
      );
      const proposal = getMarkdownFenceProposal(node);
      if (proposal == null) {
        return fallback;
      }
      const renderer = getMarkdownExtensionRenderer(
        preparedPlugins,
        proposal.node,
      );
      if (renderer == null) {
        return fallback;
      }
      try {
        const rendered = renderer.render({node: proposal.node});
        if (rendered == null || typeof rendered === 'boolean') {
          return fallback;
        }
        return (
          <MarkdownPluginBoundary
            key={index}
            pluginName={proposal.node.plugin}
            resetKey={proposal.node}
            resetRenderer={renderer.render}
            fallback={fallback}>
            <Suspense fallback={fallback}>{rendered}</Suspense>
          </MarkdownPluginBoundary>
        );
      } catch (error) {
        reportMarkdownPluginFailure(proposal.node.plugin, 'render', error);
        return fallback;
      }
    }
    case 'math': {
      cursor.offset += node.value.length;
      const MathComp = components?.math;
      if (MathComp == null) {
        return (
          <div key={index} role="paragraph">
            {`$$${node.value}$$`}
          </div>
        );
      }
      return (
        <MathComp
          key={index}
          value={node.value}
          display="block"
          {...lineProp}
        />
      );
    }
    case 'blockquote': {
      const BlockquoteComp = components?.blockquote;
      if (BlockquoteComp) {
        const bqC = node.children.map((c, i) =>
          renderBlock(
            c,
            i,
            node.children.length,
            density,
            headingLevelStart,
            onLinkClick,
            cursor,
            citationCtx,
            contentWidthValue,
            contentAlign,
            linkComponent,
            inlinePlugins,
            components,
            preparedPlugins,
            t,
            codeLanguages,
            headingProjection,
            listDepth,
          ),
        );
        return (
          <BlockquoteComp key={index} {...lineProp}>
            {bqC}
          </BlockquoteComp>
        );
      }
      return (
        <Blockquote
          key={index}
          {...themeProps('markdown-blockquote', {density})}
          {...lineStamps}
          xstyle={[
            spacing,
            contentWidthValue != null
              ? dynamicStyles.proseWidth(contentWidthValue)
              : undefined,
            contentAlign !== 'start'
              ? dynamicStyles.proseAlign(ALIGN_MARGIN[contentAlign])
              : undefined,
            isFirst && styles.noMarginBlockStart,
            isLast && styles.noMarginBlockEnd,
          ]}>
          {node.children.map((c, i) =>
            renderBlock(
              c,
              i,
              node.children.length,
              density,
              headingLevelStart,
              onLinkClick,
              cursor,
              citationCtx,
              contentWidthValue,
              contentAlign,
              linkComponent,
              inlinePlugins,
              components,
              preparedPlugins,
              t,
              codeLanguages,
              headingProjection,
              listDepth,
            ),
          )}
        </Blockquote>
      );
    }
    case 'list': {
      // Detect task lists: all items have a checked state
      const isTaskList =
        node.children.length > 0 &&
        node.children.every(item => item.checked != null);

      if (isTaskList) {
        // Extract labels from task items — render as rich inline content
        const checkedValues = node.children
          .map((item, i) => ({item, key: `task-${i}`}))
          .filter(({item}) => item.checked)
          .map(({key}) => key);

        return (
          <div
            key={index}
            {...mergeProps(
              themeProps('markdown-list', {density}),
              stylex.props(
                spacing,
                isFirst && styles.noMarginBlockStart,
                isLast && styles.noMarginBlockEnd,
              ),
            )}>
            <CheckboxList
              label={t('@astryx.markdown.taskList')}
              isLabelHidden
              value={checkedValues}
              containerXstyle={styles.blockIndent}
              isReadOnly
              density="compact">
              {node.children.map((item, i) => {
                const firstChild = item.children[0];
                const isInline =
                  item.children.length === 1 &&
                  firstChild?.type === 'paragraph';

                const label = isInline ? (
                  <>
                    {firstChild.children.map((c, j) =>
                      renderInline(
                        c,
                        j,
                        onLinkClick,
                        cursor,
                        citationCtx,
                        linkComponent,
                        inlinePlugins,
                        components,
                        preparedPlugins,
                      ),
                    )}
                  </>
                ) : (
                  <>
                    {item.children.map((c, j) =>
                      renderBlock(
                        c,
                        j,
                        item.children.length,
                        density,
                        headingLevelStart,
                        onLinkClick,
                        cursor,
                        citationCtx,
                        contentWidthValue,
                        contentAlign,
                        linkComponent,
                        inlinePlugins,
                        components,
                        preparedPlugins,
                        t,
                        codeLanguages,
                        headingProjection,
                        listDepth + 1,
                      ),
                    )}
                  </>
                );

                return (
                  <CheckboxListItem
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- markdown task items are rendered from positional AST nodes
                    key={i}
                    value={`task-${i}`}
                    label={label}
                    {...(recordsSourceLines
                      ? sourceLineAttributes(blockSourceLines(item))
                      : undefined)}
                  />
                );
              })}
            </CheckboxList>
          </div>
        );
      }

      return (
        <div
          key={index}
          {...mergeProps(
            themeProps('markdown-list', {density}),
            stylex.props(
              spacing,
              contentWidthValue != null
                ? dynamicStyles.proseWidth(contentWidthValue)
                : null,
              contentAlign !== 'start'
                ? dynamicStyles.proseAlign(ALIGN_MARGIN[contentAlign])
                : null,
              isFirst && styles.noMarginBlockStart,
              isLast && styles.noMarginBlockEnd,
            ),
          )}>
          <List
            listStyle={node.ordered ? 'decimal' : 'disc'}
            density="compact"
            start={node.ordered ? node.start : undefined}
            xstyle={styles.blockIndent}>
            {node.children.map((item, i) => {
              const firstChild = item.children[0];
              const isInline =
                item.children.length === 1 && firstChild?.type === 'paragraph';

              // Check if this entire list item is "new" — if so, fade the
              // whole item as a block instead of fading individual text spans.

              const label = isInline ? (
                <>
                  {firstChild.children.map((c, j) =>
                    renderInline(
                      c,
                      j,
                      onLinkClick,
                      cursor,
                      citationCtx,
                      linkComponent,
                      inlinePlugins,
                      components,
                      preparedPlugins,
                    ),
                  )}
                </>
              ) : (
                <>
                  {item.children.map((c, j) =>
                    renderBlock(
                      c,
                      j,
                      item.children.length,
                      density,
                      headingLevelStart,
                      onLinkClick,
                      cursor,
                      citationCtx,
                      contentWidthValue,
                      contentAlign,
                      linkComponent,
                      inlinePlugins,
                      components,
                      preparedPlugins,
                      t,
                      codeLanguages,
                      headingProjection,
                      listDepth + 1,
                    ),
                  )}
                </>
              );

              // A task item beside plain items keeps its own checked state
              // (FR23): it shows a read-only checkbox where its marker
              // would be, named by its text.
              const firstParagraph = item.children.find(
                block => block.type === 'paragraph',
              );
              const task =
                item.checked == null
                  ? undefined
                  : {
                      isChecked: item.checked,
                      label:
                        firstParagraph?.type === 'paragraph'
                          ? markdownAstText(
                              firstParagraph.children,
                              extension =>
                                markdownExtensionText(
                                  preparedPlugins,
                                  extension,
                                ),
                            )
                          : t('@astryx.markdown.taskList'),
                    };

              return (
                <ListMarkerScope
                  // eslint-disable-next-line @eslint-react/no-array-index-key -- markdown list items are rendered from positional AST nodes
                  key={i}
                  marker={
                    (node.ordered ? NUMBER_MARKERS : BULLET_MARKERS)[
                      listDepth % 3
                    ]
                  }
                  task={task}>
                  <ListItem
                    label={label}
                    {...(recordsSourceLines
                      ? sourceLineAttributes(blockSourceLines(item))
                      : undefined)}
                  />
                </ListMarkerScope>
              );
            })}
          </List>
        </div>
      );
    }
    case 'table': {
      const colMinWidths = computeTableColumnMinWidths(node);
      const [header, ...rows] = node.children;
      // Inline code inside a cell keeps its token whole, through the same
      // `components` seam consumers use. A supplied renderer owns its own
      // wrapping and is left alone.
      const cellComponents: Partial<MarkdownComponents> | undefined =
        components?.inlineCode != null
          ? components
          : {...components, inlineCode: MarkdownTableCellCode};

      return (
        <div
          key={index}
          // No role, name, or tab stop here: Table's Scroll region owns the
          // table's horizontal overflow, its accessible name, and its
          // conditional keyboard focusability. This block only carries
          // spacing, sizing, and alignment.
          {...mergeProps(
            themeProps('markdown-table', {density}),
            stylex.props(
              styles.tableWrapper,
              spacing,
              contentWidthValue != null
                ? dynamicStyles.blockWidth(contentWidthValue)
                : null,
              BLOCK_ALIGN_MARGIN[contentAlign] != null
                ? dynamicStyles.blockAlign(BLOCK_ALIGN_MARGIN[contentAlign])
                : null,
              isFirst && styles.noMarginBlockStart,
              isLast && styles.noMarginBlockEnd,
            ),
          )}
          {...lineStamps}>
          <Table
            dividers="grid"
            textOverflow="wrap"
            xstyle={markdownTableCellStyles.tableOuterEdge}>
            <TableHeader>
              <TableRow>
                {header?.children.map((h, i) => (
                  <TableHeaderCell
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- markdown table columns are positional by definition
                    key={i}
                    xstyle={[
                      markdownTableCellStyles.headerCell,
                      dynamicStyles.cellMinWidth(`${colMinWidths[i]}ch`),
                      node.align[i] === 'center' && cellAlignStyles.center,
                      node.align[i] === 'right' && cellAlignStyles.end,
                    ]}>
                    {h.children.map((c, j) =>
                      renderInline(
                        c,
                        j,
                        onLinkClick,
                        cursor,
                        citationCtx,
                        linkComponent,
                        inlinePlugins,
                        cellComponents,
                        preparedPlugins,
                      ),
                    )}
                  </TableHeaderCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const cells = row.children.map((cell, j) => (
                  <TableCell
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- markdown table cells are positional by row and column
                    key={j}
                    xstyle={[
                      markdownTableCellStyles.cell,
                      node.align[j] === 'center' && cellAlignStyles.center,
                      node.align[j] === 'right' && cellAlignStyles.end,
                    ]}>
                    {cell.children.map((c, k) =>
                      renderInline(
                        c,
                        k,
                        onLinkClick,
                        cursor,
                        citationCtx,
                        linkComponent,
                        inlinePlugins,
                        cellComponents,
                        preparedPlugins,
                      ),
                    )}
                  </TableCell>
                ));
                return (
                  <TableRow
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- markdown table rows are rendered from positional AST nodes
                    key={i}>
                    {cells}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      );
    }
    case 'extension': {
      const content = renderMarkdownPluginNode(
        preparedPlugins,
        node,
        wrapTextWithFade(
          node.source ?? markdownExtensionText(preparedPlugins, node),
          cursor,
          index,
        ),
      );
      return (
        <div
          key={index}
          {...stylex.props(
            spacing,
            contentWidthValue != null
              ? dynamicStyles.proseWidth(contentWidthValue)
              : null,
            contentAlign !== 'start'
              ? dynamicStyles.proseAlign(ALIGN_MARGIN[contentAlign])
              : null,
            isFirst && styles.noMarginBlockStart,
            isLast && styles.noMarginBlockEnd,
          )}>
          {content}
        </div>
      );
    }
    case 'thematicBreak': {
      const HrComp = components?.hr;
      if (HrComp) {
        return <HrComp key={index} {...lineProp} />;
      }
      return (
        <hr
          key={index}
          {...mergeProps(
            themeProps('markdown-hr', {density}),
            stylex.props(
              styles.hr,
              spacing,
              isFirst && styles.noMarginBlockStart,
              isLast && styles.noMarginBlockEnd,
            ),
          )}
          {...lineStamps}
        />
      );
    }
    case 'image': {
      const safeSrc = sanitizeMarkdownUrl(node.url);
      if (safeSrc == null) {
        return (
          <div
            key={index}
            {...mergeProps(
              themeProps('markdown-image', {density}),
              stylex.props(
                spacing,
                isFirst && styles.noMarginBlockStart,
                isLast && styles.noMarginBlockEnd,
              ),
            )}
            {...lineStamps}>
            [{node.alt}]
          </div>
        );
      }
      const ImageComp = components?.image;
      if (ImageComp) {
        return (
          <ImageComp key={index} src={safeSrc} alt={node.alt} {...lineProp} />
        );
      }
      return (
        <div
          key={index}
          {...mergeProps(
            themeProps('markdown-image', {density}),
            stylex.props(
              spacing,
              isFirst && styles.noMarginBlockStart,
              isLast && styles.noMarginBlockEnd,
            ),
          )}
          {...lineStamps}>
          <img src={safeSrc} alt={node.alt} {...stylex.props(styles.image)} />
        </div>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a markdown string as Astryx components. Supports streaming with
 * smooth fade-in animation via isStreaming.
 *
 * @example
 * ```
 * <Markdown>
 *   {'# Hello\n\nThis is **bold** and _italic_ text.\n\n- Item one\n- Item two'}
 * </Markdown>
 * ```
 */
export function Markdown<
  const Plugins extends ReadonlyArray<MarkdownPluginEntry> = readonly [],
>({
  ref,
  children,
  display = 'block',
  density = 'default',
  headingLevelStart = 1,
  isStreaming = false,
  onLinkClick,
  sources,
  citationStyle = 'label',
  contentWidth = 680,
  contentAlign = 'start',
  components,
  plugins,
  inlinePlugins,
  autolink,
  codeLanguages: codeLanguagesProp,
  xstyle,
  className,
  style,
  id: rootId,
  'data-testid': testId,
  ...props
}: MarkdownProps<Plugins>): React.ReactElement {
  const t = useTranslator();
  // Keep one list while it names the same values, so an inline
  // `codeLanguages={[…]}` does not re-render every block on each parent
  // render (adjusting state during render, not in an Effect).
  const [codeLanguages, setCodeLanguages] = useState(codeLanguagesProp);
  if (!sameCodeLanguageList(codeLanguages, codeLanguagesProp)) {
    setCodeLanguages(codeLanguagesProp);
  }
  const LinkComponent = useLinkComponent();
  // Links read the caller's handler when clicked, so a handler recreated on
  // every caller render does not invalidate the memoized document below.
  // Only whether a handler exists changes the rendered links.
  const onLinkClickRef = useRef(onLinkClick);
  useIsomorphicLayoutEffect(() => {
    onLinkClickRef.current = onLinkClick;
  });
  const hasLinkClick = onLinkClick != null;
  const stableOnLinkClick = useMemo<MarkdownProps['onLinkClick']>(
    () =>
      hasLinkClick
        ? (href, event) => onLinkClickRef.current?.(href, event)
        : undefined,
    [hasLinkClick],
  );
  // Derive the set of source IDs for the parser (stable across renders when sources don't change)
  const sourceIds = useMemo(
    () => (sources ? new Set(Object.keys(sources)) : undefined),
    [sources],
  );

  const preparedPlugins = useMemo(() => {
    if (plugins == null) {
      return undefined;
    }
    try {
      return prepareMarkdownPlugins(plugins);
    } catch (error) {
      reportMarkdownPluginFailure('configuration', 'transform', error);
      return undefined;
    }
  }, [plugins]);
  const syntaxPlugins = useStableMarkdownSyntaxEntries(preparedPlugins);
  const hasMathRenderer = components?.math != null;
  const legacyParseOptions = useMemo<
    ParseOptions<ReadonlyArray<MarkdownPluginEntry>>
  >(
    () => ({sourceIds, autolink, plugins: syntaxPlugins}),
    [sourceIds, autolink, syntaxPlugins],
  );
  const mathParseOptions = useMemo<
    MathParseOptions<ReadonlyArray<MarkdownPluginEntry>>
  >(
    () => ({sourceIds, autolink, math: true, plugins: syntaxPlugins}),
    [sourceIds, autolink, syntaxPlugins],
  );

  // Smooth bursty streamed chunks into a steady character-by-character reveal.
  // When not streaming, the hook returns children unchanged (no-op).
  const smoothedText = useStreamingText(children, isStreaming);

  const incrementalStateRef = useRef<IncrementalState<boolean>>(
    createIncrementalState<boolean>(),
  );
  // Reset incremental cache when parser-affecting component options toggle —
  // cached settled blocks were parsed with the previous setting.
  const prevAutolinkRef = useRef(autolink);
  const prevMathRef = useRef(hasMathRenderer);
  if (
    prevAutolinkRef.current !== autolink ||
    prevMathRef.current !== hasMathRenderer
  ) {
    incrementalStateRef.current = createIncrementalState<boolean>();
    prevAutolinkRef.current = autolink;
    prevMathRef.current = hasMathRenderer;
  }

  const parsedBlocks = useMemo(() => {
    if (display === 'inline') {
      return [];
    }
    if (isStreaming) {
      if (smoothedText === '') {
        incrementalStateRef.current = createIncrementalState<boolean>();
        return [];
      }
      const options = hasMathRenderer ? mathParseOptions : legacyParseOptions;
      const input = trimStreamingArtifacts(smoothedText, options);
      return (
        hasMathRenderer
          ? parseMarkdownAstIncremental(
              input,
              incrementalStateRef.current,
              mathParseOptions,
            )
          : parseMarkdownAstIncremental(
              input,
              incrementalStateRef.current,
              legacyParseOptions,
            )
      ).children;
    }
    return (
      hasMathRenderer
        ? parseMarkdownAst(children, mathParseOptions)
        : parseMarkdownAst(children, legacyParseOptions)
    ).children;
  }, [
    display,
    smoothedText,
    children,
    isStreaming,
    hasMathRenderer,
    mathParseOptions,
    legacyParseOptions,
  ]);

  const transformSource = isStreaming
    ? trimStreamingArtifacts(
        smoothedText,
        hasMathRenderer ? mathParseOptions : legacyParseOptions,
      )
    : children;
  const blocks = useMemo(
    () =>
      applyMarkdownTransforms(
        {type: 'root', children: parsedBlocks},
        preparedPlugins,
        transformSource,
        !isStreaming,
        'block',
      ).children,
    [parsedBlocks, preparedPlugins, transformSource, isStreaming],
  );

  // Resolve one post-transform projection for Markdown and derived Outline.
  // The default remains root-only; installed first-party modules own any
  // alternative projection returned through this narrow integration seam.
  const headingProjection = useMemo(() => {
    if (display === 'inline' || blocks.length === 0) {
      return undefined;
    }
    return projectMarkdownHeadings(
      {type: 'root', children: blocks},
      preparedPlugins,
    );
  }, [display, blocks, preparedPlugins]);

  const parsedInlineNodes = useMemo(() => {
    if (display !== 'inline') {
      return [];
    }
    const options = hasMathRenderer ? mathParseOptions : legacyParseOptions;
    const input = isStreaming
      ? trimStreamingArtifacts(smoothedText, options)
      : children;
    return hasMathRenderer
      ? parseInlineAst(input, mathParseOptions)
      : parseInlineAst(input, legacyParseOptions);
  }, [
    display,
    smoothedText,
    children,
    isStreaming,
    hasMathRenderer,
    mathParseOptions,
    legacyParseOptions,
  ]);

  const inlineTransformSource = isStreaming
    ? trimStreamingArtifacts(
        smoothedText,
        hasMathRenderer ? mathParseOptions : legacyParseOptions,
      )
    : children;
  const inlineNodes = useMemo(() => {
    if (display !== 'inline') {
      return [];
    }
    const transformed = applyMarkdownTransforms(
      {
        type: 'root',
        children: [{type: 'paragraph', children: parsedInlineNodes}],
      },
      preparedPlugins,
      inlineTransformSource,
      !isStreaming,
      'inline',
    );
    const paragraph = transformed.children[0];
    return paragraph?.type === 'paragraph'
      ? [...paragraph.children]
      : parsedInlineNodes;
  }, [
    display,
    parsedInlineNodes,
    preparedPlugins,
    inlineTransformSource,
    isStreaming,
  ]);

  // Track recent boundaries for stacked fade-in animation.
  // The number of spans needed = ceil(animationDuration / tickInterval).
  // useStreamingText ticks every ~tickMs, and the fade runs for
  // --duration-fast-max. We compute the span count dynamically so the
  // oldest span has just finished animating when it gets evicted.
  const {token} = useTheme();
  const maxSpans = useMemo(() => {
    const duration = parseDuration(token('--duration-fast-max')) ?? 230;
    const tick = parseDuration(token('--duration-fast-min'));
    // Tick interval mirrors useStreamingText's timing: base / 10
    const tickMs = tick != null ? Math.max(4, Math.round(tick / 10)) : 50;
    return Math.min(Math.ceil(duration / tickMs), 12);
  }, [token]);

  const prevBlocksRef = useRef<ReadonlyArray<RenderBlockNode>>([]);
  const prevInlineNodesRef = useRef<ReadonlyArray<RenderInlineNode>>([]);
  const boundariesRef = useRef<number[]>([]);
  const smoothedLen = smoothedText.length;
  const boundaries = useMemo(() => {
    void smoothedLen; // dep trigger
    const prevLen =
      display === 'inline'
        ? countInlineTextLength(prevInlineNodesRef.current)
        : countBlockTextLength(prevBlocksRef.current);
    const next = computeBoundaries(boundariesRef.current, prevLen, maxSpans);
    boundariesRef.current = next;
    return next;
  }, [display, smoothedLen, maxSpans]);

  const contentWidthValue = contentWidth
    ? typeof contentWidth === 'number'
      ? `${contentWidth}px`
      : contentWidth
    : null;

  // The block document is the expensive part of a long Markdown render. It
  // depends only on these inputs, so a caller re-render that changes none of
  // them returns the same elements and React skips the whole subtree. The
  // cursor and citation numbering are rebuilt inside, from the start of the
  // document, exactly as a full render builds them.
  const renderedBlocks = useMemo(() => {
    if (display === 'inline') {
      return null;
    }
    const blockCursor: StreamingCursor = {
      offset: 0,
      boundaries,
      active: isStreaming,
    };
    // Numbers are assigned in encounter order during rendering.
    const blockCitationCtx: CitationContext | null = sources
      ? {sources, numberMap: new Map(), nextNumber: 1, style: citationStyle}
      : null;
    return blocks.map((block, i) =>
      renderBlock(
        block,
        i,
        blocks.length,
        density,
        headingLevelStart,
        stableOnLinkClick,
        blockCursor,
        blockCitationCtx,
        contentWidthValue,
        contentAlign,
        LinkComponent,
        inlinePlugins,
        components,
        preparedPlugins,
        t,
        codeLanguages,
        headingProjection,
      ),
    );
  }, [
    display,
    blocks,
    boundaries,
    isStreaming,
    sources,
    citationStyle,
    density,
    headingLevelStart,
    stableOnLinkClick,
    contentWidthValue,
    contentAlign,
    LinkComponent,
    inlinePlugins,
    components,
    preparedPlugins,
    t,
    headingProjection,
    codeLanguages,
  ]);

  if (display === 'inline') {
    const cursor: StreamingCursor = {
      offset: 0,
      boundaries,
      active: isStreaming,
    };
    // Numbers are assigned in encounter order during rendering.
    const citationCtx: CitationContext | null = sources
      ? {sources, numberMap: new Map(), nextNumber: 1, style: citationStyle}
      : null;
    const renderedInline = (
      <span
        ref={ref}
        // Consumer props first: what the component sets for itself wins.
        {...props}
        id={rootId}
        data-testid={testId}
        {...mergeProps(
          themeProps('markdown', {density}),
          stylex.props(styles.root, styles.inlineRoot, xstyle),
          className,
          style,
        )}>
        {inlineNodes.map((node, i) =>
          renderInline(
            node,
            i,
            stableOnLinkClick,
            cursor,
            citationCtx,
            LinkComponent,
            inlinePlugins,
            components,
            preparedPlugins,
          ),
        )}
      </span>
    );

    // Store current inline nodes for next render's boundary calculation.
    prevInlineNodesRef.current = inlineNodes;
    prevBlocksRef.current = [];

    return renderedInline;
  }

  const rendered = (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      // Consumer props first: what the component sets for itself — the
      // document role included — wins.
      {...props}
      id={rootId}
      role="document"
      data-testid={testId}
      {...mergeProps(
        themeProps('markdown', {density}),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}>
      {renderedBlocks}
    </div>
  );

  // Store current blocks for next render's boundary calculation.
  // This ref write is safe under StrictMode: both invocations produce the same
  // blocks (same smoothedText → same useMemo result), so both write the same value.
  prevBlocksRef.current = blocks;
  prevInlineNodesRef.current = [];

  return rendered;
}

Markdown.displayName = 'Markdown';
