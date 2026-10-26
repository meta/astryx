// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';
/**
 * @file CodeBlock.tsx
 * @input Uses React, StyleX, theme tokens, CSS Custom Highlight API, SyntaxTheme provider
 * @output Exports CodeBlock component and CodeBlockProps
 * @position Core implementation; read-only syntax-highlighted code display
 */

import {
  useInsertionEffect,
  useEffect,
  useId,
  useRef,
  useState,
  useCallback,
  useMemo,
  type CSSProperties,
} from 'react';
import * as React from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
  fontWeightVars,
  typeScaleVars,
  borderVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {isRenderable, mergeProps} from '../utils';
import {useClipboard} from '../hooks/useClipboard';
import {useScrollableArea} from '../hooks/useScrollableArea';
import {Icon} from '../Icon';
import {IconButton} from '../IconButton';
import type {DiffLineKind} from './tokenizer';
import {
  tokenize,
  tokenizeAsync,
  splitDiffLines,
  flatTokensToLines,
  SYNC_TOKENIZE_THRESHOLD,
} from './tokenizer';
import type {CodeLanguageInput, SyntaxToken, TokenLine} from './tokenizer';
import type {CodeLanguage} from './grammar';
import {
  isCustomCodeLanguage,
  languageKey,
  languageLabel as languageWord,
} from './grammar';
import {ensureHighlightStyles} from './highlightStyles';
import {applyHighlightRangesChunked} from './highlightRanges';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {useTranslator} from '../i18n';
import {SyntaxTheme, type SyntaxThemeDefinition} from '../theme/syntax';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyles = stylex.create({
  card: {
    borderRadius: radiusVars['--radius-element'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
  },
  section: {
    borderRadius: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'transparent',
    // Transparent background so the block blends into the surface it's
    // embedded in (a card or panel) instead of painting its own muted layer,
    // which would compound with a muted parent into a darker grey. Override
    // the syntax-background var so both the root and the sticky header inherit
    // it. Consumers can still set an explicit background via xstyle.
    '--color-syntax-background': 'transparent',
  },
});

const dynamicStyles = stylex.create({
  width: (value: string) => ({
    width: value,
    minWidth: value === 'fit-content' ? 'min(100%, 400px)' : null,
    maxWidth: value === 'fit-content' ? '100%' : null,
  }),
  // Width of the line-number column, sized to the widest number. `ch` is the
  // advance of "0" in the (monospace) code font, so N digits => N ch. Set on
  // <code>; `--_codeblock-gutter-width` is unregistered so it inherits (with its var()
  // substituted) down to the line divs that read it for their grid track.
  gutterWidth: (digits: number) => ({
    '--_codeblock-gutter-width': `${digits}ch`,
  }),
});

// Light reveal so the leading chevron eases into view instead of popping in.
// Growing the chevron's own footprint (width + inline margin) from zero slides
// the title into place instead of snapping it over, and clipping keeps the
// glyph from spilling while it's mid-reveal.
const chevronReveal = stylex.keyframes({
  from: {
    width: 0,
    marginInlineEnd: 0,
    opacity: 0,
  },
  to: {
    width: '14px',
    marginInlineEnd: spacingVars['--spacing-1'],
    opacity: 1,
  },
});

const styles = stylex.create({
  root: {
    position: 'relative',
    isolation: 'isolate',
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    backgroundColor: 'var(--color-syntax-background)',
    overflow: 'hidden',
  },
  // The viewport is a flex item of the column root. Its implied min-height
  // would be its content while it fits (the shared capability keeps it
  // `overflow: clip` then), so a root sized from outside could never make it
  // shrink and scroll; 0 lets the root's bound reach it.
  viewport: {
    minHeight: 0,
  },
  // With no header, Copy sits in its own inline-end column beside the code
  // viewport rather than over it, so no line, scrolled or wrapped, runs under
  // the button. The column is as wide as its content; the single row still
  // lets a root sized from outside bound the viewport.
  rootCorner: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gridTemplateRows: 'minmax(0, 1fr)',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: spacingVars['--spacing-4'],
    backgroundColor: 'var(--color-syntax-background)',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    // Reset default <button> appearance for the collapsible title control.
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
  },
  headerWithDivider: {
    paddingBlock: spacingVars['--spacing-2'],
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  headerCompact: {
    paddingBlock: spacingVars['--spacing-2'],
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: typeScaleVars['--text-supporting-size'],
    fontFamily: typographyVars['--font-family-code'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: 'var(--color-syntax-comment)',
    margin: 0,
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
  codeWrapper: {
    display: 'flex',
    minWidth: 'fit-content',
  },
  codeWrapperCompact: {
    marginBlockStart: `calc(-1 * ${spacingVars['--spacing-2']})`,
  },
  collapseGrid: {
    display: 'grid',
    gridTemplateRows: '1fr',
    transitionProperty: 'grid-template-rows',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  collapseGridCollapsed: {
    gridTemplateRows: '0fr',
  },
  collapseInner: {
    overflow: 'hidden',
    minHeight: 0,
  },
  collapseChevron: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '14px',
    height: '14px',
    marginInlineEnd: spacingVars['--spacing-1'],
    overflow: 'hidden',
    color: 'var(--color-syntax-comment)',
    animationName: {
      default: chevronReveal,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    animationDuration: durationVars['--duration-medium'],
    animationTimingFunction: easeVars['--ease-standard'],
  },
  // Applied to the chevron <Icon> (via `xstyle`): the glyph is the element that
  // rotates and the element a theme targets, so one selector reaches both.
  collapseChevronIcon: {
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  collapseChevronExpanded: {
    // Leading disclosure convention (matches TreeList/Table): the resting
    // chevronRight points right (>) when collapsed; rotate it down (v) when
    // expanded.
    transform: 'rotate(90deg)',
  },
  headerCollapsible: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    userSelect: 'none',
    // Restore a keyboard-only focus ring with the standard token/offset so this
    // disclosure control matches the rest of the system (Collapsible, TabMenu);
    // otherwise it falls back to the inconsistent UA default outline.
  },
  code: {
    display: 'block',
    flex: 1,
    // The block grows to its longest line, so a row's paint (diff tint,
    // highlightLines) spans the full scroll width instead of stopping at the
    // viewport edge when the reader scrolls a long line.
    minWidth: 'max-content',
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
    margin: 0,
    fontFamily: typographyVars['--font-family-code'],
    color: 'var(--color-syntax-variable)',
    tabSize: 2,
    whiteSpace: 'pre',
    wordBreak: 'normal',
    overflowWrap: 'normal',
  },
  codeWrapped: {
    // Wrapped lines never overflow, and max-content would stop them wrapping.
    minWidth: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    overflowWrap: 'break-word',
  },
  // With line numbers on, the <code> element hosts the full-height divider
  // between the number gutter and the code. It spans the code's block padding
  // too (inset-block: 0), so the rule reaches the top and bottom edges the way
  // the old separate gutter column did. The numbers themselves are drawn per
  // line (see `lineNumbered`) — a separate column can't track wrap height.
  codeNumbered: {
    position: 'relative',
    '::after': {
      content: '""',
      position: 'absolute',
      insetBlock: 0,
      insetInlineStart: `calc(${spacingVars['--spacing-4']} + var(--_codeblock-gutter-width) + ${spacingVars['--spacing-3']})`,
      width: 0,
      borderInlineStartWidth: borderVars['--border-width'],
      borderInlineStartStyle: 'solid',
      borderInlineStartColor: colorVars['--color-border'],
      pointerEvents: 'none',
    },
  },
  line: {
    lineHeight: typeScaleVars['--text-code-leading'],
  },
  // Per-line number gutter: a two-column grid ([number] [code]). The number is
  // a ::before generated from the data-line attribute. Because the number and
  // its code occupy one grid row, the row grows to fit wrapped code while the
  // number stays pinned to the row's first visual line (alignSelf: start) —
  // this is what keeps numbers aligned when isWrapped wraps a line.
  lineNumbered: {
    display: 'grid',
    gridTemplateColumns: 'var(--_codeblock-gutter-width) 1fr',
    columnGap: `calc(${spacingVars['--spacing-3']} + ${borderVars['--border-width']} + ${spacingVars['--spacing-4']})`,
    '::before': {
      content: 'attr(data-line)',
      gridColumn: '1',
      alignSelf: 'start',
      textAlign: 'end',
      color: 'var(--color-syntax-punctuation)',
      userSelect: 'none',
      fontFamily: typographyVars['--font-family-code'],
    },
  },
  // In span mode the tokens are wrapped in this element so they form a single
  // grid item in column 2 (otherwise each token span would flow into its own
  // grid cell). minWidth:0 lets it shrink so long lines wrap within the track.
  lineContent: {
    minWidth: 0,
  },
  lineChunk: {
    contentVisibility: 'auto',
  },
  lineHighlighted: {
    backgroundColor: colorVars['--color-accent-muted'],
    marginInline: `calc(-1 * ${spacingVars['--spacing-4']})`,
    paddingInline: spacingVars['--spacing-4'],
  },
  // Diff change rows: the whole row is tinted so added and removed lines read
  // at a glance; the text keeps its ordinary colour, which stays readable on
  // the tint where the semantic text colours would not, and the leading +/-
  // glyph stays in the text as the cue that needs no colour. A caller's
  // highlightLines row is declared after these and keeps its background.
  // A changed row's margin reads the change: the tint runs under the gutter
  // cell too (the row spans the full width), and the line number and the
  // glyph take the row's marker slot. The code — tokens and plain runs alike
  // — keeps the syntax theme's colours, so an identifier looks the same on a
  // changed row as on a context row.
  lineAdded: {
    backgroundColor: 'var(--color-syntax-added)',
    marginInline: `calc(-1 * ${spacingVars['--spacing-4']})`,
    paddingInline: spacingVars['--spacing-4'],
    '::before': {color: 'var(--color-syntax-added-marker)'},
  },
  lineRemoved: {
    backgroundColor: 'var(--color-syntax-removed)',
    marginInline: `calc(-1 * ${spacingVars['--spacing-4']})`,
    paddingInline: spacingVars['--spacing-4'],
    '::before': {color: 'var(--color-syntax-removed-marker)'},
  },
  // Hunk and file headers stay visible but quiet: a muted row with secondary
  // text, never change paint.
  lineDiffHeader: {
    backgroundColor: 'var(--color-syntax-diff-header)',
    // The syntax theme's own secondary colour: text-secondary in the default
    // theme, the theme's punctuation colour in a defined one.
    color: 'var(--color-syntax-punctuation)',
    marginInline: `calc(-1 * ${spacingVars['--spacing-4']})`,
    paddingInline: spacingVars['--spacing-4'],
  },
  // The glyph column: the +, - or space of every line sits in its own track
  // before the code, so the code column starts at the same inline offset on
  // every line and the content's indentation reads exactly as written. The
  // glyph is laid out as text but not selectable; the copy button still
  // copies the original source with its glyphs.
  lineDiff: {
    display: 'grid',
    gridTemplateColumns: '1ch 1fr',
    columnGap: spacingVars['--spacing-2'],
  },
  // With line numbers the gutter's gap (which the full-height divider sits
  // in) has to stay between the number and the marker, so the grid has no
  // gap of its own and the marker carries both gaps as margins.
  lineDiffNumbered: {
    // `auto`, not `1ch`: the marker's gap margins have to widen its track.
    gridTemplateColumns: 'var(--_codeblock-gutter-width) auto 1fr',
    columnGap: 0,
  },
  // The glyph is the source's own text: read by assistive technology, kept
  // out of a drag selection (copy returns the exact source anyway).
  diffMarker: {
    color: colorVars['--color-text-secondary'],
    userSelect: 'none',
    whiteSpace: 'pre',
  },
  diffMarkerNumbered: {
    marginInlineStart: `calc(${spacingVars['--spacing-3']} + ${borderVars['--border-width']} + ${spacingVars['--spacing-4']})`,
    marginInlineEnd: spacingVars['--spacing-2'],
  },
  // On a tinted row the glyph is the cue a reader without colour depends on,
  // so it takes the row's marker slot like the line number does.
  diffMarkerAdded: {
    color: 'var(--color-syntax-added-marker)',
  },
  diffMarkerRemoved: {
    color: 'var(--color-syntax-removed-marker)',
  },
  sizeSm: {
    fontSize: typeScaleVars['--text-supporting-size'],
  },
  sizeMd: {
    fontSize: typeScaleVars['--text-code-size'],
  },
  copyButton: {
    // The copy control is a ghost IconButton (Button owns its own padding,
    // radius, and hover surface); this only tints the resting glyph to the
    // muted syntax-comment colour so it blends into the header/corner. A theme
    // reaches it via the `code-block-copy-button` target on the Button.
    color: 'var(--color-syntax-comment)',
  },
  // The controls of a headerless block: caller controls, then Copy, in the
  // second column (cornerClusterMd/Sm give its height).
  cornerCluster: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    alignSelf: 'start',
    marginInline: spacingVars['--spacing-2'],
  },
  // The header's controls: caller controls, then Copy.
  headerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    flexShrink: 0,
  },
  // The cluster is exactly as tall as the first line's row (its block padding
  // on both sides plus its line box), and centres its controls in it, so any
  // control height sits on the first line: a one-line block reads as one row
  // with even space above and below, and a block that grows keeps its
  // controls where they were.
  cornerClusterMd: {
    blockSize: `calc(2 * ${spacingVars['--spacing-3']} + ${typeScaleVars['--text-code-size']} * ${typeScaleVars['--text-code-leading']})`,
  },
  cornerClusterSm: {
    blockSize: `calc(2 * ${spacingVars['--spacing-3']} + ${typeScaleVars['--text-supporting-size']} * ${typeScaleVars['--text-code-leading']})`,
  },
});

// ---------------------------------------------------------------------------
// Line rendering
// ---------------------------------------------------------------------------

const LINE_CHUNK_SIZE = 20;
const LINE_CHUNK_THRESHOLD = 100;

/**
 * Memoized chunk component — cheaper than memoizing every individual line.
 */
const CodeChunk = React.memo(function CodeChunk({
  lines,
  startIndex,
  highlightSet,
  diffKinds,
  renderLineContent,
  lineNumbers,
}: {
  lines: string[];
  startIndex: number;
  highlightSet: Set<number> | null;
  diffKinds: ReadonlyArray<DiffLineKind> | null;
  renderLineContent: (line: string, lineIndex: number) => React.ReactNode;
  lineNumbers: boolean;
}) {
  return (
    <>
      {lines.map((line, j) => {
        const i = startIndex + j;
        const diffKind = diffKinds?.[i];
        return (
          <div
            key={i}
            data-line={i + 1}
            data-diff={diffKind === 'context' ? undefined : diffKind}
            {...stylex.props(
              styles.line,
              lineNumbers && styles.lineNumbered,
              diffKinds != null && styles.lineDiff,
              diffKinds != null && lineNumbers && styles.lineDiffNumbered,
              diffKind === 'added' && styles.lineAdded,
              diffKind === 'removed' && styles.lineRemoved,
              diffKind === 'header' && styles.lineDiffHeader,
              // Last on purpose: a highlight replaces a diff tint rather than
              // stacking on it, so tokens keep their single-paint contrast.
              (highlightSet?.has(i + 1) ?? false) && styles.lineHighlighted,
            )}>
            {renderLineContent(line, i)}
          </div>
        );
      })}
    </>
  );
});

function renderLines(
  lines: string[],
  highlightSet: Set<number> | null,
  diffKinds: ReadonlyArray<DiffLineKind> | null,
  renderLineContent: (line: string, lineIndex: number) => React.ReactNode,
  lineNumbers: boolean,
  chunkSize: number = LINE_CHUNK_SIZE,
): React.ReactNode {
  chunkSize = Math.max(1, Math.floor(chunkSize));

  if (lines.length < LINE_CHUNK_THRESHOLD) {
    return (
      <CodeChunk
        lines={lines}
        startIndex={0}
        highlightSet={highlightSet}
        diffKinds={diffKinds}
        renderLineContent={renderLineContent}
        lineNumbers={lineNumbers}
      />
    );
  }

  const chunks: React.ReactNode[] = [];
  for (let start = 0; start < lines.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, lines.length);
    const chunkLines = lines.slice(start, end);
    const estimatedHeight = `${chunkLines.length}lh`;

    chunks.push(
      <div
        key={start}
        {...mergeProps(stylex.props(styles.lineChunk), {
          style: {containIntrinsicBlockSize: `auto ${estimatedHeight}`},
        })}>
        <CodeChunk
          lines={chunkLines}
          startIndex={start}
          highlightSet={highlightSet}
          diffKinds={diffKinds}
          renderLineContent={renderLineContent}
          lineNumbers={lineNumbers}
        />
      </div>,
    );
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CodeBlockProps extends BaseProps<HTMLPreElement> {
  ref?: React.Ref<HTMLPreElement>;
  code: string;
  /**
   * The code's language: a built-in identifier such as `'rust'`, or a
   * language value — a module imported on its own, such as `graphql` from
   * `@astryxdesign/core/CodeBlock/languages/graphql`, or one made with
   * `createCodeLanguage`. A string selects only a built-in grammar; the label
   * shows the string, or the value's `name`.
   * @default 'plaintext'
   */
  language?: string | CodeLanguage;
  title?: string;
  hasLanguageLabel?: boolean;
  hasLineNumbers?: boolean;
  highlightLines?: number[];
  /**
   * Render the code as a unified diff over `language`: lines starting with
   * `+` are added, `-` removed, `@@` is a hunk header (a `--- `/`+++ ` pair
   * directly before one is a file header), anything else is context; the
   * label reads `diff` or `<language> diff`. The glyph sits in its own column and the rest of every line
   * keeps the language's syntax highlighting. Copy still returns the exact
   * source, glyphs included.
   */
  isDiff?: boolean;
  hasCopyButton?: boolean;
  onCopy?: () => void;
  /**
   * Your own controls, shown just before Copy: in the header when the block
   * has one, otherwise beside the code in the top inline-end corner, never
   * over it. It never creates a header, and activating it never collapses the
   * block. You own each control's label, state, and action; ghost `sm`
   * IconButtons match Copy's size and variant.
   */
  endContent?: React.ReactNode;
  isWrapped?: boolean;
  maxHeight?: number | string;
  isCollapsible?: boolean;
  collapsibleThreshold?: number;
  size?: 'sm' | 'md';
  /**
   * Width of the code block. Accepts any CSS width value.
   * - `'fit-content'` (default): shrinks to the width of the longest line (with a min-width floor).
   * - `'100%'`: stretches to fill the parent container width.
   * - Any valid CSS width string (e.g. `'600px'`, `'50vw'`).
   * @default 'fit-content'
   */
  width?: string;
  /**
   * Container presentation style.
   * - `'card'` (default): border-radius and border with the muted syntax
   *   background — standalone card look.
   * - `'section'`: no border-radius, no border, and a transparent background
   *   so the block blends into the card or panel it's embedded in. Set an
   *   explicit background via `xstyle` if you need one.
   * @default 'card'
   */
  container?: 'card' | 'section';
  /**
   * Your own tokenizer; it wins over `language`'s grammar. The same function
   * also makes a custom language: `createCodeLanguage({name, identifiers,
   * tokenize})`.
   */
  tokenizer?: (
    code: string,
    language: string,
  ) => {type: string; start: number; end: number}[];
  highlightMode?: 'auto' | 'ranges' | 'spans';
  /**
   * Per-instance syntax theme override. Shorthand for wrapping this block in
   * `<SyntaxTheme theme={...}>` — accepts a preset from
   * `@astryxdesign/core/theme/syntax` or a theme created with
   * `defineSyntaxTheme()`. Without it, the block uses the theme-level syntax
   * colors from the nearest SyntaxTheme ancestor or `defineTheme({ syntax })`.
   */
  syntaxTheme?: SyntaxThemeDefinition;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasHighlightAPI(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof Highlight !== 'undefined'
  );
}

/**
 * Safari supports the Highlight API JS objects but has rendering issues
 * with ::highlight() in code blocks. Detect Safari (WebKit without Chrome)
 * so we can fall back to spans.
 */
function isSafari(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  return ua.includes('AppleWebKit') && !ua.includes('Chrome');
}

/**
 * Hook: per-line tokens with sync/async + custom tokenizer compat.
 */
function useTokenLines(
  code: string,
  language: CodeLanguageInput,
  customTokenizer?: CodeBlockProps['tokenizer'],
): TokenLine[] {
  const [asyncTokenResult, setAsyncTokenResult] = useState<{
    code: string;
    language: CodeLanguageInput;
    tokens: TokenLine[];
  } | null>(null);

  const syncTokens = useMemo(() => {
    if (customTokenizer) {
      return flatTokensToLines(
        customTokenizer(code, languageWord(language)),
        code,
      );
    }
    // A custom language paints synchronously at any length, as `tokenizer`
    // does, so the codemod's rewrite keeps the same first paint (FR13).
    if (
      code.length >= SYNC_TOKENIZE_THRESHOLD &&
      !isCustomCodeLanguage(language)
    ) {
      return null;
    }
    return tokenize(code, language);
  }, [code, language, customTokenizer]);

  // Synchronizes long code with a scheduler-yielding tokenize task: it starts
  // when the code, language, or tokenizer changes, and the
  // cleanup aborts the previous one.
  useEffect(() => {
    if (
      code.length < SYNC_TOKENIZE_THRESHOLD ||
      customTokenizer ||
      isCustomCodeLanguage(language)
    ) {
      return;
    }

    const abortController = new AbortController();

    async function tokenizeLargeCode() {
      try {
        const tokens = await tokenizeAsync(
          code,
          language,
          abortController.signal,
        );
        if (!abortController.signal.aborted) {
          setAsyncTokenResult({code, language, tokens});
        }
      } catch {
        if (!abortController.signal.aborted) {
          setAsyncTokenResult({code, language, tokens: []});
        }
      }
    }

    void tokenizeLargeCode();

    return () => {
      abortController.abort();
    };
  }, [code, language, customTokenizer]);

  if (syncTokens != null) {
    return syncTokens;
  }

  if (
    asyncTokenResult?.code === code &&
    asyncTokenResult.language === language
  ) {
    return asyncTokenResult.tokens;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Span-mode code element
// ---------------------------------------------------------------------------

function buildSpanLine(
  lineText: string,
  tokens: SyntaxToken[],
): React.ReactNode {
  if (tokens.length === 0) {
    return lineText || '\u200b';
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const token of tokens) {
    if (token.start > cursor) {
      parts.push(lineText.slice(cursor, token.start));
    }
    const end = Math.min(token.end, lineText.length);
    parts.push(
      <span
        key={`${token.start}-${token.type}`}
        className={`astryx-token-${token.type} xds-token-${token.type}`}>
        {lineText.slice(token.start, end)}
      </span>,
    );
    cursor = end;
  }

  if (cursor < lineText.length) {
    parts.push(lineText.slice(cursor));
  }
  return parts.length > 0 ? parts : '\u200b';
}

function SpanCodeContent({
  lines,
  tokenLines,
  highlightSet,
  diffKinds,
  diff,
  isWrapped,
  sizeStyle,
  hasLineNumbers,
  maxDigits,
}: {
  lines: string[];
  tokenLines: TokenLine[];
  highlightSet: Set<number> | null;
  diffKinds: ReadonlyArray<DiffLineKind> | null;
  diff: ReturnType<typeof splitDiffLines> | null;
  isWrapped: boolean;
  sizeStyle: stylex.StyleXStyles;
  hasLineNumbers: boolean;
  maxDigits: number;
}) {
  useInsertionEffect(() => {
    ensureHighlightStyles();
  }, []);

  const renderLineContent = useCallback(
    (line: string, lineIndex: number): React.ReactNode => {
      const tokens = tokenLines[lineIndex] ?? [];
      if (diff) {
        // Header rows show their raw text; every other row shows its glyph in
        // the marker column and the base-language tokens of the rest.
        const kind = diff.kinds[lineIndex];
        const content = kind === 'header' ? line : diff.content[lineIndex];
        return (
          <>
            <span
              data-diff-marker=""
              {...stylex.props(
                styles.diffMarker,
                hasLineNumbers && styles.diffMarkerNumbered,
                kind === 'added' && styles.diffMarkerAdded,
                kind === 'removed' && styles.diffMarkerRemoved,
              )}>
              {diff.glyphs[lineIndex] || ' '}
            </span>
            <span {...stylex.props(styles.lineContent)}>
              {kind === 'header'
                ? content || '\u200b'
                : buildSpanLine(content, tokens)}
            </span>
          </>
        );
      }
      // Wrap tokens in a single element so they occupy one grid cell when line
      // numbers are on (see `lineNumbered`); an inline span is a no-op when off.
      return (
        <span {...stylex.props(styles.lineContent)}>
          {buildSpanLine(line, tokens)}
        </span>
      );
    },
    [tokenLines, diff, hasLineNumbers],
  );

  return (
    <code
      {...stylex.props(
        styles.code,
        sizeStyle,
        isWrapped && styles.codeWrapped,
        hasLineNumbers && styles.codeNumbered,
        hasLineNumbers && dynamicStyles.gutterWidth(maxDigits),
      )}>
      {renderLines(
        lines,
        highlightSet,
        diffKinds,
        renderLineContent,
        hasLineNumbers,
      )}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Range-mode code element
// ---------------------------------------------------------------------------

function RangeCodeContent({
  lines,
  tokenLines,
  highlightSet,
  diffKinds,
  isWrapped,
  sizeStyle,
  hasLineNumbers,
  maxDigits,
}: {
  lines: string[];
  tokenLines: TokenLine[];
  highlightSet: Set<number> | null;
  diffKinds: ReadonlyArray<DiffLineKind> | null;
  isWrapped: boolean;
  sizeStyle: stylex.StyleXStyles;
  hasLineNumbers: boolean;
  maxDigits: number;
}) {
  const codeRef = useRef<HTMLElement>(null);

  // Insert the ::highlight() rules before the commit's layout reads, as the
  // span path does. Inserted later, the new rules restyle the whole document
  // a second time after any layout read in the same commit has already
  // styled it, which on a long page full of code blocks costs a full style
  // recalculation.
  useInsertionEffect(() => {
    if (hasHighlightAPI()) {
      ensureHighlightStyles();
    }
  }, []);

  useEffect(() => {
    if (!hasHighlightAPI()) {
      return;
    }

    const codeEl = codeRef.current;
    if (!codeEl || tokenLines.length === 0) {
      return;
    }

    return applyHighlightRangesChunked(codeEl, tokenLines);
  }, [tokenLines]);

  // Range mode keeps the line's text as a bare text node (its firstChild) so
  // applyHighlightRangesChunked can map token offsets onto it \u2014 no wrapper. The
  // number ::before is a pseudo-element, so it never becomes a child node here.
  const renderLineContent = useCallback(
    (line: string): React.ReactNode => line || '\u200b',
    [],
  );

  return (
    <code
      ref={codeRef}
      {...stylex.props(
        styles.code,
        sizeStyle,
        isWrapped && styles.codeWrapped,
        hasLineNumbers && styles.codeNumbered,
        hasLineNumbers && dynamicStyles.gutterWidth(maxDigits),
      )}>
      {renderLines(
        lines,
        highlightSet,
        diffKinds,
        renderLineContent,
        hasLineNumbers,
      )}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Read-only code display with syntax highlighting, line numbers,
 * and optional copy button.
 *
 * @example
 * ```
 * <CodeBlock code="const x = 42;" language="javascript" />
 * ```
 */
export function CodeBlock({
  code,
  language = 'plaintext',
  title,
  hasLanguageLabel = true,
  hasLineNumbers = false,
  highlightLines,
  isDiff = false,
  hasCopyButton = true,
  onCopy,
  endContent,
  isWrapped = false,
  maxHeight,
  isCollapsible = false,
  collapsibleThreshold = 10,
  size = 'md',
  width: widthProp = 'fit-content',
  container = 'card',
  tokenizer: customTokenizer,
  highlightMode = 'auto',
  syntaxTheme,
  xstyle,
  className,
  style,
  ref,
  ...props
}: CodeBlockProps) {
  const t = useTranslator();
  // Owns the clipboard write, the transient copied flag, its reset timer, and
  // the polite copy announcement (a swapped aria-label alone is not reliably
  // announced) — shared with Timestamp via the same hook.
  const {copy, isCopied: copied} = useClipboard({
    announce: t('@astryx.codeBlock.copied'),
  });

  const useSpans =
    isDiff ||
    highlightMode === 'spans' ||
    (highlightMode === 'auto' && !hasHighlightAPI()) ||
    (highlightMode === 'auto' && isSafari());

  const lines = useMemo(() => {
    const l = code.split('\n');
    if (l.length > 1 && l[l.length - 1] === '') {
      l.pop();
    }
    return l;
  }, [code]);

  // In diff mode the base language sees the code with the glyph column set
  // aside, so a `tsx` diff still highlights as `tsx` on every line; headers
  // contribute an empty line and are rendered as their raw text.
  const diff = useMemo(
    () => (isDiff ? splitDiffLines(lines) : null),
    [isDiff, lines],
  );
  const tokenLines = useTokenLines(
    diff ? diff.content.join('\n') : code,
    language,
    customTokenizer,
  );
  const diffKinds = diff?.kinds ?? null;
  const highlightSet = useMemo(
    () => (highlightLines ? new Set(highlightLines) : null),
    [highlightLines],
  );

  const handleCopy = useCallback(async () => {
    const didCopy = await copy(code);
    if (didCopy) {
      onCopy?.();
    }
  }, [code, copy, onCopy]);

  const sizeStyle = size === 'sm' ? styles.sizeSm : styles.sizeMd;
  // Digits in the largest line number — sizes the gutter column width.
  const maxLineDigits = String(lines.length).length;
  // With the diff layer on, the label and viewport name say so: `diff` over
  // plaintext, `tsx diff` over a language — so a diff keeps its header,
  // collapse control, and a name that still matches a `diff` fence.
  // A language value labels with its `name` and reflects its first
  // identifier as `data-language`, so theme selectors keep matching (FR13).
  const languageName = languageWord(language);
  const languageAttr = languageKey(language);
  const languageLabel = !hasLanguageLabel
    ? null
    : isDiff
      ? languageName === 'plaintext'
        ? 'diff'
        : `${languageName} diff`
      : languageName !== 'plaintext'
        ? languageName
        : null;
  const showHeader = title != null || languageLabel != null;

  // A collapsed body must never outlive the visible header that controls it.
  const canCollapse =
    showHeader && isCollapsible && lines.length >= collapsibleThreshold;
  const collapseControl = useMemo(
    () => (canCollapse ? {} : null),
    [canCollapse],
  );
  const [collapsedControl, setCollapsedControl] = useState<object | null>(null);
  const isCollapsed =
    collapseControl != null && collapsedControl === collapseControl;
  const toggleCollapsed = useCallback(() => {
    setCollapsedControl(current =>
      current === collapseControl ? null : collapseControl,
    );
  }, [collapseControl]);
  // Links the collapsible header to the code region it shows/hides so assistive
  // tech can move from the button to its controlled content (disclosure
  // pattern). The region stays mounted when collapsed (CSS grid animation), so
  // this is always a resolvable reference — aria-controls can be unconditional.
  const regionId = useId();

  // The code viewport enters the Tab order only while its content actually
  // overflows (AST-025 FR12–FR13): the shared scroll capability measures
  // both axes, keeps focus where it is when overflow goes away, and owns the
  // overflow declarations. role="group" (not "region") so several code
  // blocks on a page don't create duplicate same-named landmarks.
  const {getViewportProps, getContentProps} = useScrollableArea({
    axis: 'both',
    keyboardAccess: {
      owner: 'viewport',
      role: 'group',
      label: languageLabel ?? t('@astryx.codeBlock.code'),
    },
  });
  const scrollStyle: CSSProperties | undefined =
    maxHeight != null
      ? {
          maxHeight:
            typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
        }
      : undefined;

  // Caller controls render before Copy; together they are the block's controls,
  // in the header when there is one and in the corner cluster otherwise.
  const hasEndContent = isRenderable(endContent);
  const hasControls = hasCopyButton || hasEndContent;
  const copyButtonEl = hasCopyButton ? (
    <IconButton
      variant="ghost"
      size="sm"
      icon={<Icon icon={copied ? 'check' : 'copy'} size="sm" color="inherit" />}
      // A visible "Copy" hover/focus hint via Button's built-in tooltip. It
      // stays "Copy" after copying — the copy → check icon flip is the
      // confirmation, not a tooltip change. The aria-label still swaps to the
      // localized "Copied" for assistive tech, backed by the announcement.
      tooltip={t('@astryx.codeBlock.copyCode')}
      label={
        copied ? t('@astryx.codeBlock.copied') : t('@astryx.codeBlock.copyCode')
      }
      onClick={e => {
        // Stop propagation so copying does not toggle the collapsible header.
        e.stopPropagation();
        void handleCopy();
      }}
      xstyle={styles.copyButton}
      {...themeProps('code-block-copy-button')}
    />
  ) : null;

  const headerEl = showHeader ? (
    <div
      {...mergeProps(
        themeProps('code-block-header', {
          size,
          language: languageAttr,
          container,
        }),
        stylex.props(
          styles.headerRow,
          hasLineNumbers ? styles.headerWithDivider : styles.headerCompact,
        ),
      )}>
      <div
        role={canCollapse ? 'button' : undefined}
        tabIndex={canCollapse ? 0 : undefined}
        aria-expanded={canCollapse ? !isCollapsed : undefined}
        aria-controls={canCollapse ? regionId : undefined}
        aria-label={
          canCollapse && !title?.trim() && !languageLabel
            ? t('@astryx.codeBlock.code')
            : undefined
        }
        onClick={canCollapse ? toggleCollapsed : undefined}
        onKeyDown={
          canCollapse
            ? (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleCollapsed();
                }
              }
            : undefined
        }
        {...focusOutlineProps.focusVisible(
          styles.header,
          canCollapse && styles.headerCollapsible,
        )}>
        <span
          {...mergeProps(
            themeProps('code-block-title', {size, language: languageAttr}),
            stylex.props(styles.headerTitle),
          )}>
          {canCollapse && (
            <span {...stylex.props(styles.collapseChevron)}>
              <Icon
                icon="chevronRight"
                size="xsm"
                color="inherit"
                xstyle={[
                  styles.collapseChevronIcon,
                  !isCollapsed && styles.collapseChevronExpanded,
                ]}
              />
            </span>
          )}
          {title}
          {title && languageLabel ? ' — ' : ''}
          {languageLabel}
        </span>
      </div>
      {hasControls ? (
        <div {...stylex.props(styles.headerControls)}>
          {hasEndContent ? endContent : null}
          {copyButtonEl}
        </div>
      ) : null}
    </div>
  ) : null;

  const codeBody = (
    <div
      {...getViewportProps<HTMLDivElement>({
        ...stylex.props(styles.viewport),
        style: scrollStyle,
      })}>
      <div
        {...getContentProps<HTMLDivElement>(
          stylex.props(
            styles.codeWrapper,
            showHeader && !hasLineNumbers && styles.codeWrapperCompact,
          ),
        )}>
        {useSpans ? (
          <SpanCodeContent
            lines={lines}
            tokenLines={tokenLines}
            highlightSet={highlightSet}
            diffKinds={diffKinds}
            diff={diff}
            isWrapped={isWrapped}
            sizeStyle={sizeStyle}
            hasLineNumbers={hasLineNumbers}
            maxDigits={maxLineDigits}
          />
        ) : (
          <RangeCodeContent
            lines={lines}
            tokenLines={tokenLines}
            highlightSet={highlightSet}
            diffKinds={diffKinds}
            isWrapped={isWrapped}
            sizeStyle={sizeStyle}
            hasLineNumbers={hasLineNumbers}
            maxDigits={maxLineDigits}
          />
        )}
      </div>
    </div>
  );

  const block = (
    <pre
      ref={ref}
      {...mergeProps(
        themeProps('code-block', {size, language: languageAttr, container}),
        stylex.props(
          styles.root,
          hasControls && !showHeader && styles.rootCorner,
          dynamicStyles.width(widthProp),
          containerStyles[container],
          xstyle,
        ),
        className,
        style,
      )}
      {...props}>
      {headerEl}
      {canCollapse ? (
        <div
          id={regionId}
          // While collapsed, the region is only hidden visually (0fr grid
          // row); inert also removes it from the tab order and accessibility
          // tree so keyboard users cannot Tab into the invisible scroll
          // container (a tab stop while it overflows). aria-controls pointing at an inert
          // element remains a valid, resolvable reference.
          inert={isCollapsed ? true : undefined}
          {...stylex.props(
            styles.collapseGrid,
            isCollapsed && styles.collapseGridCollapsed,
          )}>
          <div {...stylex.props(styles.collapseInner)}>{codeBody}</div>
        </div>
      ) : (
        codeBody
      )}
      {hasControls && !showHeader ? (
        <div
          {...stylex.props(
            styles.cornerCluster,
            size === 'sm' ? styles.cornerClusterSm : styles.cornerClusterMd,
          )}>
          {hasEndContent ? endContent : null}
          {copyButtonEl}
        </div>
      ) : null}
    </pre>
  );

  return syntaxTheme ? (
    <SyntaxTheme theme={syntaxTheme}>{block}</SyntaxTheme>
  ) : (
    block
  );
}

CodeBlock.displayName = 'CodeBlock';
