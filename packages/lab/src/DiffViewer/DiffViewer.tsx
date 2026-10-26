// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DiffViewer.tsx
 * @input Uses React, StyleX, theme tokens, the shared CodeBlock tokenizer and
 *   syntax-theme slots (incl. the diff row slots), useScrollableArea,
 *   Token, Icon, VisuallyHidden, and the i18n translator
 * @output Exports DiffViewer component, DiffViewerProps, DiffViewerViewMode,
 *   DiffViewerChangeIndicator, DiffViewerInlineHighlight
 * @position Lab implementation; read-only, syntax-highlighted file diff for
 *   code review surfaces
 *
 * Renders one DiffViewerFile: a file header (path, status, +/- counts, a
 * caller slot, optional disclosure) over its hunks in unified or split view.
 * Unified view is one table. Split view is two side-by-side panes (each an
 * ARIA table) whose rows share one grid's row tracks through `subgrid`, so a
 * row is as tall as its taller side while each pane scrolls sideways on its
 * own. Rows take their tint, gutter, and header paint from the same
 * syntax-theme slots CodeBlock's diff layer uses, so a syntax theme styles
 * both. Changed lines can show +/- glyphs or bars, and paired removed/added
 * lines highlight the words (or characters) that changed. Callers can render
 * annotation rows under any line (review comments) and make the line numbers
 * actionable.
 *
 * Known limit: rows are plain DOM — there is NO virtualization. Very large
 * files should be windowed or collapsed by the caller.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/DiffViewer/DiffViewer.doc.mjs (props table, notes)
 * - /packages/lab/src/DiffViewer/DiffViewer.test.tsx (behavior tests)
 * - /packages/lab/src/DiffViewer/index.ts (exports if types change)
 * - /packages/lab/src/DiffViewer/inlineDiff.ts (inline highlight ranges)
 * - /apps/storybook/stories/DiffViewer.stories.tsx (examples and visual coverage)
 */

'use client';

import {
  Fragment,
  useId,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type UIEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import type {BaseProps} from '@astryxdesign/core';
import {
  ensureHighlightStyles,
  tokenize,
  type CodeLanguage,
  type SyntaxToken,
  type TokenLine,
} from '@astryxdesign/core/CodeBlock';
import {
  useScrollableArea,
  type ScrollableElementProps,
} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import {Icon} from '@astryxdesign/core/Icon';
import {
  SyntaxTheme,
  type SyntaxThemeDefinition,
} from '@astryxdesign/core/theme/syntax';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  focusOutlineProps,
  mergeProps,
  rtlStyles,
  themeProps,
} from '@astryxdesign/core/utils';
import {Token, type TokenColor} from '@astryxdesign/core/Token';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';

import type {
  DiffViewerFile,
  DiffViewerFileStatus,
  DiffViewerLine,
  DiffViewerLineRef,
  DiffViewerSide,
} from './diffTypes';
import {diffInlineRanges, type InlineRange} from './inlineDiff';

/** How hunks are laid out: one column, or old and new side by side. */
export type DiffViewerViewMode = 'unified' | 'split';

/**
 * How a changed line is marked beside its code: `classic` `+`/`-` glyphs,
 * `bars` (a solid bar for added lines and a dashed one for removed lines), or
 * `none`. Screen readers hear "Added"/"Removed" in every mode.
 */
export type DiffViewerChangeIndicator = 'classic' | 'bars' | 'none';

/**
 * How finely to highlight what changed inside a removed line and the added
 * line that replaced it: by `word`, by `char`acter, or `none`.
 */
export type DiffViewerInlineHighlight = 'word' | 'char' | 'none';

export interface DiffViewerProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element. */
  ref?: Ref<HTMLDivElement>;
  /**
   * The file to render. Build one with `parseUnifiedDiff(patch)` (one per
   * file in the patch) or `createDiffFile({oldValue, newValue})`.
   */
  file: DiffViewerFile;
  /**
   * `unified` shows one column with removed lines above their replacements;
   * `split` shows the old file on the left and the new file on the right,
   * pairing each removed line with the added line that replaced it. The hunk
   * area reads left-to-right in every page direction, like a code editor;
   * the file header and annotation content follow the page, and annotation
   * rows scroll with the code.
   * @default 'unified'
   */
  viewMode?: DiffViewerViewMode;
  /**
   * Syntax-highlighting language: a built-in identifier such as `'rust'`, or
   * a language value — a module imported on its own, such as `graphql` from
   * `@astryxdesign/core/CodeBlock/languages/graphql`, or one made with
   * `createCodeLanguage`. Defaults to one inferred from the file's name or
   * extension among the built-ins and `codeLanguages`; an unmatched file
   * renders as plain text.
   */
  language?: string | CodeLanguage;
  /**
   * Language values the file's name or extension may infer, such as
   * `[graphql, dockerfile]`; a later entry wins. Pass the same list to every
   * DiffViewer on a review page.
   */
  codeLanguages?: ReadonlyArray<CodeLanguage>;
  /**
   * Show the old and new line-number gutters.
   * @default true
   */
  hasLineNumbers?: boolean;
  /**
   * Wrap long lines instead of scrolling them horizontally. Unwrapped, line
   * numbers and change indicators stay pinned while the code scrolls; in
   * split view each side is its own scroller, the split stays fixed at half
   * and half, and the two sides scroll sideways in lockstep. While code
   * overflows sideways, sideways overscroll (elastic bounce, swipe
   * navigation) is off.
   * @default false
   */
  isWrapped?: boolean;
  /**
   * How changed lines are marked beside their code.
   * @default 'classic'
   */
  changeIndicator?: DiffViewerChangeIndicator;
  /**
   * Highlight the changed words (or characters) inside each removed line and
   * the added line that replaced it. Lines that share nothing but whitespace
   * get no inline highlight; the row tint already marks them.
   * @default 'word'
   */
  inlineHighlight?: DiffViewerInlineHighlight;
  /**
   * Tint the rows of added and removed lines. Without it only the change
   * indicator, the line numbers, and the inline highlight mark a change.
   * @default true
   */
  hasChangeBackground?: boolean;
  /**
   * Make the file header a disclosure that hides and shows the hunks. Needs a
   * file path to name the control.
   * @default true
   */
  isCollapsible?: boolean;
  /** Controlled collapsed state. Pair with `onCollapsedChange`. */
  isCollapsed?: boolean;
  /**
   * Initial collapsed state when uncontrolled.
   * @default false
   */
  defaultIsCollapsed?: boolean;
  /** Called with the next collapsed state when the header is toggled. */
  onCollapsedChange?: (isCollapsed: boolean) => void;
  /**
   * Content at the end of the file header, e.g. a "Viewed" checkbox or a menu
   * of file actions.
   */
  headerEnd?: ReactNode;
  /**
   * Render content in a full-width row under a line, e.g. review comments.
   * Return `null` (or `false`) for lines with nothing to show. Called once per line with
   * its {@link DiffViewerLineRef}; in split view the row sits under the
   * line's own side.
   */
  renderLineAnnotation?: (ref: DiffViewerLineRef) => ReactNode;
  /**
   * Makes each line's number a button (e.g. to start a comment on that line).
   * Receives the line's {@link DiffViewerLineRef}. Only the number on the
   * line's anchor side is a button, so an unchanged line's original number
   * stays plain text. Each button is its own Tab stop, like any other set of
   * independent buttons.
   */
  onLineNumberClick?: (
    ref: DiffViewerLineRef,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  /** Maximum height of the hunk area before it scrolls. */
  maxHeight?: number | string;
  /**
   * Per-instance syntax theme, as on CodeBlock. Without it the nearest
   * `SyntaxTheme` or the theme's syntax colors apply.
   */
  syntaxTheme?: SyntaxThemeDefinition;
}

// ---------------------------------------------------------------------------
// Language inference
// ---------------------------------------------------------------------------

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  json: 'json',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'svg',
  css: 'css',
  scss: 'scss',
  less: 'less',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'zsh',
  php: 'php',
  hack: 'hack',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  sql: 'sql',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  go: 'go',
};

/**
 * The language a file's name or extension infers: a listed value first (a
 * later entry wins), then a built-in, else plain text (CodeBlock FR13).
 */
function inferLanguage(
  path: string | null,
  codeLanguages: ReadonlyArray<CodeLanguage> | undefined,
): string | CodeLanguage {
  if (path == null) {
    return 'plaintext';
  }
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  const extension = dot > 0 ? base.slice(dot + 1).toLowerCase() : null;
  if (codeLanguages != null) {
    for (let i = codeLanguages.length - 1; i >= 0; i--) {
      const language = codeLanguages[i];
      if (
        language.fileNames.includes(base) ||
        (extension != null && language.fileExtensions.includes(extension))
      ) {
        return language;
      }
    }
  }
  return extension == null
    ? 'plaintext'
    : (EXTENSION_LANGUAGES[extension] ?? 'plaintext');
}

// ---------------------------------------------------------------------------
// Row model
// ---------------------------------------------------------------------------

interface LineCell {
  line: DiffViewerLine;
  ref: DiffViewerLineRef;
  tokens: TokenLine;
  /** Changed character ranges to highlight inside the line. */
  emphasis: readonly InlineRange[];
}

type UnifiedRow =
  | {type: 'hunk'; key: string; header: string}
  | {type: 'line'; key: string; cell: LineCell};

type SplitRow =
  | {type: 'hunk'; key: string; header: string}
  | {type: 'pair'; key: string; old: LineCell | null; new: LineCell | null};

function lineRef(
  line: DiffViewerLine,
  hunkIndex: number,
): DiffViewerLineRef | null {
  if (line.kind === 'removed') {
    return line.oldLineNumber == null
      ? null
      : {side: 'old', lineNumber: line.oldLineNumber, line, hunkIndex};
  }
  return line.newLineNumber == null
    ? null
    : {side: 'new', lineNumber: line.newLineNumber, line, hunkIndex};
}

/**
 * Pair each run of removed lines with the run of added lines after it, line
 * by line (the same pairing split view shows), and mark what changed inside
 * each pair.
 */
function addInlineEmphasis(
  cells: LineCell[],
  granularity: 'word' | 'char',
): void {
  let i = 0;
  while (i < cells.length) {
    if (cells[i].line.kind !== 'removed') {
      i++;
      continue;
    }
    const removed: LineCell[] = [];
    const added: LineCell[] = [];
    while (i < cells.length && cells[i].line.kind === 'removed') {
      removed.push(cells[i++]);
    }
    while (i < cells.length && cells[i].line.kind === 'added') {
      added.push(cells[i++]);
    }
    const pairs = Math.min(removed.length, added.length);
    for (let r = 0; r < pairs; r++) {
      const ranges = diffInlineRanges(
        removed[r].line.content,
        added[r].line.content,
        granularity,
      );
      removed[r].emphasis = ranges.old;
      added[r].emphasis = ranges.new;
    }
  }
}

/**
 * Tokenize each hunk's old and new side as continuous text, so constructs
 * that span lines (block comments, template strings) keep their paint within
 * the hunk, then hand each line the tokens of the side it renders from.
 */
function buildCells(
  file: DiffViewerFile,
  language: string | CodeLanguage,
  inlineHighlight: DiffViewerInlineHighlight,
): LineCell[][] {
  return file.hunks.map((hunk, hunkIndex) => {
    const oldLines = hunk.lines.filter(line => line.kind !== 'added');
    const newLines = hunk.lines.filter(line => line.kind !== 'removed');
    const highlight = language !== 'plaintext';
    const oldTokens = highlight
      ? tokenize(oldLines.map(line => line.content).join('\n'), language)
      : [];
    const newTokens = highlight
      ? tokenize(newLines.map(line => line.content).join('\n'), language)
      : [];
    let oldIndex = 0;
    let newIndex = 0;
    const cells: LineCell[] = [];
    for (const line of hunk.lines) {
      let tokens: TokenLine;
      if (line.kind === 'removed') {
        tokens = oldTokens[oldIndex++] ?? [];
      } else if (line.kind === 'added') {
        tokens = newTokens[newIndex++] ?? [];
      } else {
        oldIndex++;
        tokens = newTokens[newIndex++] ?? [];
      }
      const ref = lineRef(line, hunkIndex);
      if (ref != null) {
        cells.push({line, ref, tokens, emphasis: []});
      }
    }
    if (inlineHighlight !== 'none') {
      addInlineEmphasis(cells, inlineHighlight);
    }
    return cells;
  });
}

function buildUnifiedRows(
  file: DiffViewerFile,
  cells: LineCell[][],
): UnifiedRow[] {
  const rows: UnifiedRow[] = [];
  file.hunks.forEach((hunk, h) => {
    rows.push({type: 'hunk', key: `h${h}`, header: hunk.header});
    cells[h].forEach((cell, i) => {
      rows.push({type: 'line', key: `h${h}l${i}`, cell});
    });
  });
  return rows;
}

/**
 * Pair each run of removed lines with the run of added lines that follows it,
 * row by row; context lines appear on both sides of one row.
 */
function buildSplitRows(file: DiffViewerFile, cells: LineCell[][]): SplitRow[] {
  const rows: SplitRow[] = [];
  file.hunks.forEach((hunk, h) => {
    rows.push({type: 'hunk', key: `h${h}`, header: hunk.header});
    const hunkCells = cells[h];
    let i = 0;
    while (i < hunkCells.length) {
      const cell = hunkCells[i];
      if (cell.line.kind === 'context') {
        rows.push({type: 'pair', key: `h${h}l${i}`, old: cell, new: cell});
        i++;
        continue;
      }
      const removed: LineCell[] = [];
      const added: LineCell[] = [];
      while (i < hunkCells.length && hunkCells[i].line.kind === 'removed') {
        removed.push(hunkCells[i++]);
      }
      while (i < hunkCells.length && hunkCells[i].line.kind === 'added') {
        added.push(hunkCells[i++]);
      }
      const count = Math.max(removed.length, added.length);
      for (let r = 0; r < count; r++) {
        rows.push({
          type: 'pair',
          key: `h${h}l${i}r${r}`,
          old: removed[r] ?? null,
          new: added[r] ?? null,
        });
      }
    }
  });
  return rows;
}

interface Piece {
  start: number;
  end: number;
  type: string | null;
  isChanged: boolean;
}

/**
 * Cut a line into pieces at every syntax-token and inline-highlight boundary,
 * so each piece carries one token type and one changed/unchanged state.
 */
function buildPieces(
  text: string,
  tokens: SyntaxToken[],
  emphasis: readonly InlineRange[],
): Piece[] {
  const segments: Array<{start: number; end: number; type: string | null}> = [];
  let cursor = 0;
  for (const token of tokens) {
    const start = Math.max(token.start, cursor);
    const end = Math.min(token.end, text.length);
    if (start > cursor) {
      segments.push({start: cursor, end: start, type: null});
    }
    if (end > start) {
      segments.push({start, end, type: token.type});
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) {
    segments.push({start: cursor, end: text.length, type: null});
  }

  const cuts = new Set<number>();
  for (const [start, end] of emphasis) {
    cuts.add(start);
    cuts.add(end);
  }
  const isChanged = (offset: number) =>
    emphasis.some(([start, end]) => offset >= start && offset < end);

  const pieces: Piece[] = [];
  for (const segment of segments) {
    let start = segment.start;
    for (let offset = segment.start + 1; offset < segment.end; offset++) {
      if (cuts.has(offset)) {
        pieces.push({
          start,
          end: offset,
          type: segment.type,
          isChanged: isChanged(start),
        });
        start = offset;
      }
    }
    pieces.push({
      start,
      end: segment.end,
      type: segment.type,
      isChanged: isChanged(start),
    });
  }
  return pieces;
}

function renderPiece(text: string, piece: Piece): ReactNode {
  const slice = text.slice(piece.start, piece.end);
  return piece.type == null ? (
    <Fragment key={piece.start}>{slice}</Fragment>
  ) : (
    <span key={piece.start} className={`astryx-token-${piece.type}`}>
      {slice}
    </span>
  );
}

function buildSpans(
  text: string,
  tokens: SyntaxToken[],
  emphasis: readonly InlineRange[],
  changeXstyle: stylex.StyleXStyles,
): ReactNode {
  if (text === '') {
    return '\u200b';
  }
  if (tokens.length === 0 && emphasis.length === 0) {
    return text;
  }
  const pieces = buildPieces(text, tokens, emphasis);
  const parts: ReactNode[] = [];
  let i = 0;
  while (i < pieces.length) {
    if (!pieces[i].isChanged) {
      parts.push(renderPiece(text, pieces[i]));
      i++;
      continue;
    }
    // One highlight per changed range, holding its syntax-token spans.
    const run: ReactNode[] = [];
    const first = pieces[i].start;
    while (i < pieces.length && pieces[i].isChanged) {
      run.push(renderPiece(text, pieces[i]));
      i++;
    }
    parts.push(
      <span
        key={`c${first}`}
        data-diff-change=""
        {...stylex.props(changeXstyle)}>
        {run}
      </span>,
    );
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const TAB_SIZE = 2;

// Column widths, also used to place pinned cells and size split panes.
const MARKER_WIDTH: Record<DiffViewerChangeIndicator, string> = {
  classic: `calc(1ch + ${spacingVars['--spacing-1']} + ${spacingVars['--spacing-2']})`,
  bars: spacingVars['--spacing-3'],
  none: spacingVars['--spacing-2'],
};

function gutterWidth(digits: number): string {
  return `calc(${digits}ch + 2 * ${spacingVars['--spacing-2']})`;
}

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    // The pinned cells' z-index stacks inside the DiffViewer, never against
    // the host page (a sticky page header stays on top).
    isolation: 'isolate',
    borderRadius: radiusVars['--radius-element'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    backgroundColor: 'var(--color-syntax-background)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    minWidth: 0,
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    backgroundColor: colorVars['--color-background-surface'],
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
  headerDivider: {
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    minWidth: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    color: colorVars['--color-icon-secondary'],
    transitionProperty: 'transform',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  chevronExpanded: {
    transform: 'rotate(90deg)',
  },
  path: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: typographyVars['--font-family-code'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  stats: {
    display: 'inline-flex',
    gap: spacingVars['--spacing-1'],
    flexShrink: 0,
    fontFamily: typographyVars['--font-family-code'],
  },
  statAdded: {
    color: colorVars['--color-text-green'],
  },
  statRemoved: {
    color: colorVars['--color-text-red'],
  },
  headerEnd: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    marginInlineStart: 'auto',
    flexShrink: 0,
  },
  // The hunk area reads left-to-right in every page direction, as code
  // editors do: line numbers stay on the left and a line wider than the
  // viewer opens at its start. Under RTL a mirrored table would open scrolled
  // to the lines' ends, cutting off every line's start.
  viewport: {
    minWidth: 0,
    direction: 'ltr',
  },
  message: {
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-supporting-size'],
  },
  table: {
    borderCollapse: 'collapse',
    borderSpacing: 0,
    fontFamily: typographyVars['--font-family-code'],
    fontSize: typeScaleVars['--text-code-size'],
    lineHeight: typeScaleVars['--text-code-leading'],
    color: 'var(--color-syntax-variable)',
    tabSize: TAB_SIZE,
  },
  tableScroll: {
    width: 'max-content',
    minWidth: '100%',
  },
  tableWrapped: {
    width: '100%',
    tableLayout: 'fixed',
  },
  gutter: {
    paddingBlock: 0,
    paddingInline: spacingVars['--spacing-2'],
    textAlign: 'end',
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    color: 'var(--color-syntax-punctuation)',
  },
  gutterAdded: {
    color: 'var(--color-syntax-added-marker)',
  },
  gutterRemoved: {
    color: 'var(--color-syntax-removed-marker)',
  },
  gutterButton: {
    display: 'inline',
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textDecorationLine: {
      default: 'none',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': 'underline',
    },
  },
  marker: {
    position: 'relative',
    paddingBlock: 0,
    paddingInlineStart: spacingVars['--spacing-1'],
    paddingInlineEnd: spacingVars['--spacing-2'],
    verticalAlign: 'top',
    whiteSpace: 'pre',
    userSelect: 'none',
    color: colorVars['--color-text-secondary'],
  },
  // Bars and no indicator: the column is only a gap before the code (and
  // holds the bar).
  markerSlim: {
    paddingInline: 0,
  },
  // The bar sits at the start of the indicator column, beside the code.
  // Added lines get a solid bar, removed lines a dashed one, so the two read
  // apart without relying on colour.
  bar: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    width: `calc(3 * ${borderVars['--border-width']})`,
  },
  barAdded: {
    backgroundColor: 'var(--color-syntax-added-marker)',
  },
  barRemoved: {
    backgroundImage: `repeating-linear-gradient(to bottom, var(--color-syntax-removed-marker) 0 calc(2 * ${borderVars['--border-width']}), transparent calc(2 * ${borderVars['--border-width']}) calc(4 * ${borderVars['--border-width']}))`,
  },
  // Line numbers and change indicators stay put while unwrapped code scrolls
  // sideways. They paint the syntax background under their tint so scrolled
  // code does not show through.
  sticky: {
    position: 'sticky',
    zIndex: 1,
    backgroundColor: 'var(--color-syntax-background)',
  },
  markerAdded: {
    color: 'var(--color-syntax-added-marker)',
  },
  markerRemoved: {
    color: 'var(--color-syntax-removed-marker)',
  },
  // Code, hunk headers, paths, and counts read left-to-right in every page
  // direction.
  ltr: {
    direction: 'ltr',
    unicodeBidi: 'isolate',
  },
  code: {
    textAlign: 'start',
    paddingBlock: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: spacingVars['--spacing-4'],
    verticalAlign: 'top',
    whiteSpace: 'pre',
  },
  // Break at spaces first, and inside a token only when a word cannot fit.
  codeWrapped: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'normal',
    overflowWrap: 'anywhere',
  },
  // Row tints are a background-image layer so a pinned (sticky) cell can lay
  // them over an opaque syntax background.
  added: {
    backgroundImage:
      'linear-gradient(var(--color-syntax-added), var(--color-syntax-added))',
  },
  removed: {
    backgroundImage:
      'linear-gradient(var(--color-syntax-removed), var(--color-syntax-removed))',
  },
  // The changed words of a paired line: two more layers of the row tint, so
  // a syntax theme's tint styles both and the words stand out with or
  // without the row tint under them.
  change: {
    borderRadius: radiusVars['--radius-inner'],
    boxDecorationBreak: 'clone',
  },
  changeAdded: {
    backgroundColor: 'var(--color-syntax-added)',
    backgroundImage:
      'linear-gradient(var(--color-syntax-added), var(--color-syntax-added))',
  },
  changeRemoved: {
    backgroundColor: 'var(--color-syntax-removed)',
    backgroundImage:
      'linear-gradient(var(--color-syntax-removed), var(--color-syntax-removed))',
  },
  // The empty half of a split row whose other side has no counterpart.
  filler: {
    backgroundColor: 'var(--color-syntax-diff-header)',
  },
  hunk: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
    textAlign: 'start',
    backgroundColor: 'var(--color-syntax-diff-header)',
    color: 'var(--color-syntax-punctuation)',
    whiteSpace: 'pre',
    borderBlockWidth: borderVars['--border-width'],
    borderBlockStyle: 'solid',
    borderBlockColor: colorVars['--color-border'],
  },
  // Unwrapped, the header text stays at the visible start while the code
  // scrolls.
  hunkTextSticky: {
    position: 'sticky',
    insetInlineStart: spacingVars['--spacing-3'],
  },
  // Split view: two panes in one grid. Each pane spans every row track and
  // shares them through `subgrid`, so a row is as tall as its taller side
  // (wrapped code, an annotation) while each pane scrolls sideways alone.
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  },
  pane: {
    display: 'grid',
    gridRow: '1 / -1',
    gridTemplateRows: 'subgrid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    minWidth: 0,
  },
  paneOld: {
    gridColumn: 1,
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
  },
  paneNew: {
    gridColumn: 2,
  },
  paneTable: {
    display: 'grid',
    gridRow: '1 / -1',
    gridTemplateRows: 'subgrid',
  },
  paneTableScroll: {
    width: 'max-content',
    minWidth: '100%',
  },
  paneTableWrapped: {
    width: '100%',
  },
  paneRow: {
    display: 'grid',
    gridColumn: '1 / -1',
    gridTemplateColumns: 'subgrid',
  },
  paneSpan: {
    gridColumn: '1 / -1',
  },
  invisible: {
    visibility: 'hidden',
  },
  // Unwrapped split view: a zero-height, invisible row in both panes holding
  // the widest line of either side, so both code columns (and so both
  // scroll widths) match and the panes can scroll in lockstep.
  sizer: {
    gridColumn: '-2 / -1',
    height: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
  },
  // Column headers exist for assistive technology only: their text is
  // visually hidden, so the header row takes no height.
  columnHeader: {
    padding: 0,
    borderWidth: 0,
  },

  // Annotation cells stay left-to-right like the rest of the hunk area, so
  // they start at its visible left edge and the split divider stays put.
  annotation: {
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    verticalAlign: 'top',
    whiteSpace: 'normal',
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
    backgroundColor: colorVars['--color-background-surface'],
    borderBlockWidth: borderVars['--border-width'],
    borderBlockStyle: 'solid',
    borderBlockColor: colorVars['--color-border'],
  },
});

// The caller's content (review comments) reads in the page's direction. Its
// row stays in the left-to-right hunk area and scrolls with the code, as in a
// code editor. Inline-size containment keeps the content out of the table's
// max-content width, so a long comment wraps within the width the code sets
// instead of widening the table; long unbroken words wrap too.
const annotationStyles = stylex.create({
  content: {
    direction: {default: null, ':is([dir="rtl"] *)': 'rtl'},
    overflowWrap: 'anywhere',
    contain: 'inline-size',
  },
});

const dynamicStyles = stylex.create({
  columnWidth: (width: string) => ({
    width,
  }),
  stickyAt: (offset: string) => ({
    insetInlineStart: offset,
  }),
  splitRows: (count: number) => ({
    gridTemplateRows: `repeat(${count}, auto)`,
  }),
  paneColumns: (columns: string) => ({
    gridTemplateColumns: columns,
  }),
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// File status is a category of change, not an alert, so it is a coloured
// Token rather than a status Badge.
const STATUS_COLORS: Partial<Record<DiffViewerFileStatus, TokenColor>> = {
  added: 'green',
  deleted: 'red',
  renamed: 'blue',
};

type CellTag = 'td' | 'div';

interface DiffViewerPaneProps {
  side: DiffViewerSide;
  label: string;
  /** The pane's `grid-template-columns`. */
  columns: string;
  isWrapped: boolean;
  viewportRef?: Ref<HTMLDivElement>;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

/**
 * Sideways overscroll is turned off on a DiffViewer scroller while its code
 * overflows sideways: no elastic bounce past a line's start or end, and no
 * browser back/forward swipe while reading code. A scroller with nothing to
 * scroll sideways (wrapped lines, or split view's block-only viewport) keeps
 * the hook's policy so sideways gestures reach the page. Vertical overscroll
 * always keeps the hook's policy so the page still scrolls on past the diff.
 * Applied over the hook's own (inline) overscroll style, which only knows
 * `auto` and `contain`.
 */
function withoutInlineOverscroll(
  props: ScrollableElementProps<HTMLDivElement>,
): ScrollableElementProps<HTMLDivElement> {
  return props['data-scrollable-inline'] === 'true'
    ? {...props, style: {...props.style, overscrollBehaviorX: 'none'}}
    : props;
}

/**
 * One side of split view: a sideways scroller (keyboard-reachable once it
 * overflows) around that side's ARIA table.
 */
function DiffViewerPane({
  side,
  label,
  columns,
  isWrapped,
  viewportRef,
  onScroll,
  children,
}: DiffViewerPaneProps) {
  const {getViewportProps, getContentProps} = useScrollableArea({
    axis: 'inline',
    keyboardAccess: {owner: 'viewport', role: 'group', label},
  });
  return (
    <div
      data-diff-pane={side}
      {...withoutInlineOverscroll(
        getViewportProps<HTMLDivElement>({
          ...stylex.props(
            styles.pane,
            side === 'old' ? styles.paneOld : styles.paneNew,
          ),
          ref: viewportRef,
          onScroll,
        }),
      )}>
      <div
        role="table"
        {...getContentProps<HTMLDivElement>(
          stylex.props(
            styles.table,
            styles.paneTable,
            isWrapped ? styles.paneTableWrapped : styles.paneTableScroll,
            dynamicStyles.paneColumns(columns),
          ),
        )}>
        {children}
      </div>
    </div>
  );
}

/**
 * The line of `lines` likely to render widest, by its length with tabs
 * expanded and wide (East Asian, emoji) characters counted twice.
 */
function widestLine(lines: Iterable<string>): string {
  let widest = '';
  let widestWidth = -1;
  for (const line of lines) {
    let width = 0;
    for (const char of line) {
      const code = char.codePointAt(0) ?? 0;
      width += char === '\t' ? TAB_SIZE : code >= 0x1100 ? 2 : 1;
    }
    if (width > widestWidth) {
      widest = line;
      widestWidth = width;
    }
  }
  return widest;
}

/**
 * Read-only, syntax-highlighted diff of one file, in unified or split view,
 * for code review surfaces. Supports review-comment annotation rows under any
 * line and actionable line numbers.
 *
 * @example
 * ```
 * const [file] = parseUnifiedDiff(patch);
 * <DiffViewer file={file} viewMode="split" />
 * ```
 */
export function DiffViewer({
  ref,
  file,
  viewMode = 'unified',
  language: languageProp,
  codeLanguages,
  hasLineNumbers = true,
  isWrapped = false,
  changeIndicator = 'classic',
  inlineHighlight = 'word',
  hasChangeBackground = true,
  isCollapsible = true,
  isCollapsed: isCollapsedProp,
  defaultIsCollapsed = false,
  onCollapsedChange,
  headerEnd,
  renderLineAnnotation,
  onLineNumberClick,
  maxHeight,
  syntaxTheme,
  xstyle,
  className,
  style,
  ...props
}: DiffViewerProps) {
  const t = useTranslator();
  const bodyId = useId();

  useInsertionEffect(() => {
    ensureHighlightStyles();
  }, []);

  const path = file.newPath ?? file.oldPath;
  const language = languageProp ?? inferLanguage(path, codeLanguages);
  const displayPath =
    file.status === 'renamed' && file.oldPath != null && file.newPath != null
      ? t('@astryx.diffViewer.renamedPath', {
          oldPath: file.oldPath,
          newPath: file.newPath,
        })
      : path;

  const [uncontrolledCollapsed, setUncontrolledCollapsed] =
    useState(defaultIsCollapsed);
  const canCollapse = isCollapsible && displayPath != null;
  const isCollapsed = canCollapse && (isCollapsedProp ?? uncontrolledCollapsed);
  const toggleCollapsed = () => {
    const next = !isCollapsed;
    if (isCollapsedProp === undefined) {
      setUncontrolledCollapsed(next);
    }
    onCollapsedChange?.(next);
  };

  const cells = useMemo(
    () => buildCells(file, language, inlineHighlight),
    [file, language, inlineHighlight],
  );
  const unifiedRows = useMemo(
    () => (viewMode === 'unified' ? buildUnifiedRows(file, cells) : []),
    [viewMode, file, cells],
  );
  const splitRows = useMemo(
    () => (viewMode === 'split' ? buildSplitRows(file, cells) : []),
    [viewMode, file, cells],
  );

  let addedCount = 0;
  let removedCount = 0;
  let maxLineNumber = 1;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'added') {
        addedCount++;
      } else if (line.kind === 'removed') {
        removedCount++;
      }
      maxLineNumber = Math.max(
        maxLineNumber,
        line.oldLineNumber ?? 0,
        line.newLineNumber ?? 0,
      );
    }
  }
  const digits = String(maxLineNumber).length;

  // Split view's panes scroll sideways on their own, so the shared viewport
  // only scrolls vertically there.
  const {getViewportProps, getContentProps} = useScrollableArea({
    axis: viewMode === 'split' ? 'block' : 'both',
    keyboardAccess: {
      owner: 'viewport',
      role: 'group',
      label: displayPath ?? t('@astryx.diffViewer.label'),
    },
  });
  const scrollStyle: CSSProperties | undefined =
    maxHeight != null
      ? {
          maxHeight:
            typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
        }
      : undefined;

  // --- cells ---------------------------------------------------------------

  // Unwrapped, the line numbers and the change indicator are pinned at the
  // start of their scroller; these are their offsets from its edge.
  const isPinned = !isWrapped;
  const gutter = gutterWidth(digits);
  const markerWidth = MARKER_WIDTH[changeIndicator];
  const isSlimMarker = changeIndicator !== 'classic';
  const pinAt = (offset: string | null) =>
    isPinned &&
    offset != null && [styles.sticky, dynamicStyles.stickyAt(offset)];

  const tint = (kind: DiffViewerLine['kind'] | undefined) =>
    hasChangeBackground &&
    (kind === 'added' ? styles.added : kind === 'removed' && styles.removed);

  const cellRole = (tag: CellTag) => (tag === 'div' ? {role: 'cell'} : {});

  const renderGutter = (
    tag: CellTag,
    cell: LineCell | null,
    side: DiffViewerSide,
    key: string,
    pinOffset: string,
  ) => {
    if (!hasLineNumbers) {
      return null;
    }
    const Cell = tag;
    const number =
      cell == null
        ? null
        : side === 'old'
          ? cell.line.oldLineNumber
          : cell.line.newLineNumber;
    const kind = cell?.line.kind;
    // Only the gutter of the line's own anchor side is a button: a context
    // line anchors to its new number, so its old number stays plain text
    // rather than a second button whose label names a line it does not report.
    const actionRef =
      number != null && cell != null && cell.ref.side === side
        ? cell.ref
        : null;
    return (
      <Cell
        key={key}
        {...cellRole(tag)}
        {...stylex.props(
          styles.gutter,
          pinAt(pinOffset),
          tint(kind),
          kind === 'added' && styles.gutterAdded,
          kind === 'removed' && styles.gutterRemoved,
          cell == null && styles.filler,
        )}>
        {actionRef != null && onLineNumberClick != null ? (
          <button
            type="button"
            data-diff-line-button=""
            aria-label={t('@astryx.diffViewer.lineNumberButton', {
              side,
              line: number,
            })}
            onClick={event => onLineNumberClick(actionRef, event)}
            {...focusOutlineProps.focusVisible(styles.gutterButton)}>
            {number}
          </button>
        ) : (
          number
        )}
      </Cell>
    );
  };

  const renderMarker = (
    tag: CellTag,
    cell: LineCell | null,
    key: string,
    pinOffset: string,
  ) => {
    const Cell = tag;
    const kind = cell?.line.kind;
    const isChange = kind === 'added' || kind === 'removed';
    return (
      <Cell
        key={key}
        {...cellRole(tag)}
        {...stylex.props(
          styles.marker,
          isSlimMarker && styles.markerSlim,
          pinAt(pinOffset),
          tint(kind),
          kind === 'added' && styles.markerAdded,
          kind === 'removed' && styles.markerRemoved,
          cell == null && styles.filler,
        )}>
        {isChange && changeIndicator === 'classic' && (
          <span aria-hidden="true">{kind === 'added' ? '+' : '-'}</span>
        )}
        {isChange && changeIndicator === 'bars' && (
          <span
            aria-hidden="true"
            data-diff-bar=""
            {...stylex.props(
              styles.bar,
              kind === 'added' ? styles.barAdded : styles.barRemoved,
            )}
          />
        )}
        {isChange && (
          <VisuallyHidden>
            {kind === 'added'
              ? t('@astryx.diffViewer.added')
              : t('@astryx.diffViewer.removed')}
          </VisuallyHidden>
        )}
      </Cell>
    );
  };

  const renderCode = (tag: CellTag, cell: LineCell | null, key: string) => {
    const Cell = tag;
    const kind = cell?.line.kind;
    return (
      <Cell
        key={key}
        {...cellRole(tag)}
        data-diff={kind != null && kind !== 'context' ? kind : undefined}
        {...stylex.props(
          styles.code,
          styles.ltr,
          isWrapped && styles.codeWrapped,
          tint(kind),
          cell == null && styles.filler,
        )}>
        {cell != null &&
          buildSpans(cell.line.content, cell.tokens, cell.emphasis, [
            styles.change,
            kind === 'added' ? styles.changeAdded : styles.changeRemoved,
          ])}
      </Cell>
    );
  };

  const renderHunkText = (header: string) => (
    <span {...stylex.props(styles.ltr, isPinned && styles.hunkTextSticky)}>
      {header}
    </span>
  );

  // `null`, `undefined` and booleans render nothing in React, so they draw no
  // row either; that keeps `hasThread && <Thread />` from adding empty rows.
  const annotationFor = (cell: LineCell | null): ReactNode => {
    if (cell == null || renderLineAnnotation == null) {
      return null;
    }
    const note = renderLineAnnotation(cell.ref);
    return typeof note === 'boolean' ? null : note;
  };

  // Name every column so a screen reader moving across a row hears which
  // number is which (and, in split view, which side's code it is in).
  const columnHeader = (tag: 'th' | 'div', key: string, label: string) => {
    const Header = tag;
    return (
      <Header
        key={key}
        {...(tag === 'th' ? {scope: 'col'} : {role: 'columnheader'})}
        {...stylex.props(styles.columnHeader)}>
        <VisuallyHidden>{label}</VisuallyHidden>
      </Header>
    );
  };

  // --- unified table -------------------------------------------------------

  const renderUnified = () => {
    const columns = (hasLineNumbers ? 2 : 0) + 2;
    const markerPin = hasLineNumbers ? `calc(2 * ${gutter})` : '0px';
    return (
      <table
        {...stylex.props(
          styles.table,
          isWrapped ? styles.tableWrapped : styles.tableScroll,
        )}>
        <colgroup>
          {hasLineNumbers && (
            <col {...stylex.props(dynamicStyles.columnWidth(gutter))} />
          )}
          {hasLineNumbers && (
            <col {...stylex.props(dynamicStyles.columnWidth(gutter))} />
          )}
          <col {...stylex.props(dynamicStyles.columnWidth(markerWidth))} />
          <col />
        </colgroup>
        <thead>
          <tr>
            {hasLineNumbers &&
              columnHeader('th', 'og', t('@astryx.diffViewer.columnOldLine'))}
            {hasLineNumbers &&
              columnHeader('th', 'ng', t('@astryx.diffViewer.columnNewLine'))}
            {columnHeader('th', 'm', t('@astryx.diffViewer.columnChange'))}
            {columnHeader('th', 'c', t('@astryx.diffViewer.columnCode'))}
          </tr>
        </thead>
        <tbody>
          {unifiedRows.map(row => {
            if (row.type === 'hunk') {
              return (
                <tr key={row.key}>
                  <td colSpan={columns} {...stylex.props(styles.hunk)}>
                    {renderHunkText(row.header)}
                  </td>
                </tr>
              );
            }
            const note = annotationFor(row.cell);
            return (
              <Fragment key={row.key}>
                <tr>
                  {renderGutter('td', row.cell, 'old', 'og', '0px')}
                  {renderGutter('td', row.cell, 'new', 'ng', gutter)}
                  {renderMarker('td', row.cell, 'm', markerPin)}
                  {renderCode('td', row.cell, 'c')}
                </tr>
                {note != null && (
                  <tr>
                    <td colSpan={columns} {...stylex.props(styles.annotation)}>
                      <div {...stylex.props(annotationStyles.content)}>
                        {note}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    );
  };

  // --- split panes ---------------------------------------------------------

  // Unwrapped, the two panes scroll sideways in lockstep. Setting the other
  // pane's scrollLeft fires a scroll event there too; the expected value it
  // lands on marks that event as our own echo, so it is not mirrored back
  // (which would fight momentum scrolling on the side the reader drives).
  const paneRefs = useRef<Record<DiffViewerSide, HTMLDivElement | null>>({
    old: null,
    new: null,
  });
  // Stable per side: a new callback ref every render would re-attach the
  // pane's scroll measurement each time.
  const paneRefCallbacks = useMemo(
    () => ({
      old: (node: HTMLDivElement | null) => {
        paneRefs.current.old = node;
      },
      new: (node: HTMLDivElement | null) => {
        paneRefs.current.new = node;
      },
    }),
    [],
  );
  const scrollEcho = useRef<{side: DiffViewerSide; left: number} | null>(null);
  const syncPaneScroll = (
    side: DiffViewerSide,
    event: UIEvent<HTMLDivElement>,
  ) => {
    const left = event.currentTarget.scrollLeft;
    const echo = scrollEcho.current;
    if (echo != null && echo.side === side) {
      scrollEcho.current = null;
      if (Math.abs(echo.left - left) < 1) {
        return;
      }
    }
    const otherSide = side === 'old' ? 'new' : 'old';
    const other = paneRefs.current[otherSide];
    if (other == null || Math.abs(other.scrollLeft - left) < 1) {
      return;
    }
    other.scrollLeft = left;
    scrollEcho.current = {side: otherSide, left: other.scrollLeft};
  };

  const renderSplit = () => {
    const items = splitRows.map(row =>
      row.type === 'hunk'
        ? {row, oldNote: null, newNote: null}
        : {
            row,
            // A context line anchors to its new side, so only that side
            // carries its annotation.
            oldNote:
              row.old?.line.kind === 'context' ? null : annotationFor(row.old),
            newNote: annotationFor(row.new),
          },
    );
    const hasSizer = !isWrapped;
    const sizerText = hasSizer
      ? widestLine(
          cells.flatMap(hunkCells => hunkCells.map(cell => cell.line.content)),
        )
      : '';
    const rowCount =
      1 +
      (hasSizer ? 1 : 0) +
      items.reduce(
        (count, item) =>
          count + 1 + (item.oldNote != null || item.newNote != null ? 1 : 0),
        0,
      );
    const columns = `${hasLineNumbers ? `${gutter} ` : ''}${markerWidth} ${
      isWrapped ? 'minmax(0, 1fr)' : '1fr'
    }`;
    const markerPin = hasLineNumbers ? gutter : '0px';

    const renderSide = (side: DiffViewerSide) => {
      const isOld = side === 'old';
      const rows: ReactNode[] = [
        <div key="head" role="row" {...stylex.props(styles.paneRow)}>
          {hasLineNumbers &&
            columnHeader(
              'div',
              'g',
              t(
                isOld
                  ? '@astryx.diffViewer.columnOldLine'
                  : '@astryx.diffViewer.columnNewLine',
              ),
            )}
          {columnHeader('div', 'm', t('@astryx.diffViewer.columnChange'))}
          {columnHeader(
            'div',
            'c',
            t(
              isOld
                ? '@astryx.diffViewer.columnOldCode'
                : '@astryx.diffViewer.columnNewCode',
            ),
          )}
        </div>,
      ];
      for (const {row, oldNote, newNote} of items) {
        if (row.type === 'hunk') {
          // The new side repeats the header for its own table's readers but
          // shows only the band.
          rows.push(
            <div key={row.key} role="row" {...stylex.props(styles.paneRow)}>
              <div
                role="cell"
                {...stylex.props(
                  styles.hunk,
                  styles.paneSpan,
                  // A side is half as wide as the unified header's row.
                  isWrapped && styles.codeWrapped,
                )}>
                {isOld ? (
                  renderHunkText(row.header)
                ) : (
                  <>
                    {/* Takes the same width as the old side's header, so a
                        header wider than the code widens both panes alike
                        and they still scroll in lockstep. */}
                    <span
                      aria-hidden="true"
                      {...stylex.props(styles.ltr, styles.invisible)}>
                      {row.header}
                    </span>
                    <VisuallyHidden>{row.header}</VisuallyHidden>
                  </>
                )}
              </div>
            </div>,
          );
          continue;
        }
        const cell = isOld ? row.old : row.new;
        rows.push(
          <div
            key={row.key}
            role="row"
            // The empty half of an unpaired change is spacing, not a line.
            aria-hidden={cell == null ? true : undefined}
            {...stylex.props(styles.paneRow)}>
            {renderGutter('div', cell, side, 'g', '0px')}
            {renderMarker('div', cell, 'm', markerPin)}
            {renderCode('div', cell, 'c')}
          </div>,
        );
        if (oldNote != null || newNote != null) {
          const note = isOld ? oldNote : newNote;
          rows.push(
            <div
              key={`${row.key}n`}
              role="row"
              aria-hidden={note == null ? true : undefined}
              {...stylex.props(styles.paneRow)}>
              <div
                role="cell"
                {...stylex.props(styles.annotation, styles.paneSpan)}>
                {note != null && (
                  <div {...stylex.props(annotationStyles.content)}>{note}</div>
                )}
              </div>
            </div>,
          );
        }
      }
      if (hasSizer) {
        rows.push(
          <div
            key="sizer"
            data-diff-sizer=""
            aria-hidden="true"
            {...stylex.props(styles.paneRow)}>
            <div {...stylex.props(styles.code, styles.ltr, styles.sizer)}>
              {sizerText}
            </div>
          </div>,
        );
      }
      return (
        <DiffViewerPane
          key={side}
          side={side}
          label={t(
            isOld
              ? '@astryx.diffViewer.columnOldCode'
              : '@astryx.diffViewer.columnNewCode',
          )}
          columns={columns}
          isWrapped={isWrapped}
          viewportRef={paneRefCallbacks[side]}
          onScroll={
            hasSizer ? event => syncPaneScroll(side, event) : undefined
          }>
          {rows}
        </DiffViewerPane>
      );
    };

    return (
      <div
        data-diff-split=""
        {...stylex.props(styles.split, dynamicStyles.splitRows(rowCount))}>
        {renderSide('old')}
        {renderSide('new')}
      </div>
    );
  };

  const table = viewMode === 'split' ? renderSplit() : renderUnified();

  let body: ReactNode;
  if (file.isBinary) {
    body = (
      <div {...stylex.props(styles.message)}>
        {t('@astryx.diffViewer.binary')}
      </div>
    );
  } else if (file.hunks.length === 0) {
    body = (
      <div {...stylex.props(styles.message)}>
        {t('@astryx.diffViewer.noChanges')}
      </div>
    );
  } else {
    body = (
      <div
        {...withoutInlineOverscroll(
          getViewportProps<HTMLDivElement>({
            ...stylex.props(styles.viewport),
            style: scrollStyle,
          }),
        )}>
        <div {...getContentProps<HTMLDivElement>({})}>{table}</div>
      </div>
    );
  }

  // --- header --------------------------------------------------------------

  const statusColor = STATUS_COLORS[file.status];
  const statusLabel =
    file.status === 'added'
      ? t('@astryx.diffViewer.statusAdded')
      : file.status === 'deleted'
        ? t('@astryx.diffViewer.statusDeleted')
        : file.status === 'renamed'
          ? t('@astryx.diffViewer.statusRenamed')
          : null;

  const pathEl = (
    <span
      {...mergeProps(
        themeProps('diff-viewer-path'),
        stylex.props(styles.path, styles.ltr),
      )}>
      {displayPath}
    </span>
  );

  const header =
    displayPath != null || headerEnd != null ? (
      <div
        {...mergeProps(
          themeProps('diff-viewer-header'),
          stylex.props(styles.header, !isCollapsed && styles.headerDivider),
        )}>
        {canCollapse ? (
          <button
            type="button"
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
            onClick={toggleCollapsed}
            {...focusOutlineProps.focusVisible(styles.toggle)}>
            <span
              {...stylex.props(
                styles.chevron,
                !isCollapsed && styles.chevronExpanded,
              )}>
              <span {...stylex.props(isCollapsed && rtlStyles.mirror)}>
                <Icon icon="chevronRight" size="xsm" color="inherit" />
              </span>
            </span>
            {pathEl}
          </button>
        ) : (
          pathEl
        )}
        {statusColor != null && statusLabel != null && (
          <Token size="sm" color={statusColor} label={statusLabel} />
        )}
        {(addedCount > 0 || removedCount > 0) && (
          <span {...stylex.props(styles.stats, styles.ltr)}>
            <span aria-hidden="true" {...stylex.props(styles.statAdded)}>
              {t('@astryx.diffViewer.addedCount', {count: addedCount})}
            </span>
            <span aria-hidden="true" {...stylex.props(styles.statRemoved)}>
              {t('@astryx.diffViewer.removedCount', {count: removedCount})}
            </span>
            <VisuallyHidden>
              {t('@astryx.diffViewer.stats', {
                added: addedCount,
                removed: removedCount,
              })}
            </VisuallyHidden>
          </span>
        )}
        {headerEnd != null && (
          <div {...stylex.props(styles.headerEnd)}>{headerEnd}</div>
        )}
      </div>
    ) : null;

  const root = (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('diff-viewer', {viewMode}),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...props}>
      {header}
      <div id={bodyId} hidden={isCollapsed}>
        {isCollapsed ? null : body}
      </div>
    </div>
  );

  return syntaxTheme ? (
    <SyntaxTheme theme={syntaxTheme}>{root}</SyntaxTheme>
  ) : (
    root
  );
}

DiffViewer.displayName = 'DiffViewer';
