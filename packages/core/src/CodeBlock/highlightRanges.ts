// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file highlightRanges.ts
 * @input Line divs, per-line token arrays, CSS Custom Highlight API
 * @output Creates/removes highlight Range objects for syntax coloring
 * @position Shared utility consumed by CodeBlock (ranges mode)
 *
 * Tokens are per-line with line-relative offsets, so we map directly
 * from line div → text node → Range. No global text-node map, no
 * binary search, no TreeWalker.
 */

import type {SyntaxToken, TokenLine} from './tokenizer';
import {ensureHighlightStyles, TOKEN_TYPES} from './highlightStyles';

/**
 * contentvisibilityautostatechange event — not yet in all TS DOM libs.
 */
interface ContentVisibilityAutoStateChangeEvent extends Event {
  readonly skipped: boolean;
}

interface CheckVisibilityOptions {
  checkVisibilityCSS?: boolean;
  contentVisibilityAuto?: boolean;
}

// ---------------------------------------------------------------------------
// Dynamic ::highlight() style injection
// ---------------------------------------------------------------------------

/**
 * Pre-seeded with all built-in token types — the static stylesheet in
 * highlightStyles.ts already has ::highlight() rules for these. Only
 * truly unknown types trigger dynamic insertRule, avoiding unnecessary
 * stylesheet mutations and style recalcs.
 */
const registeredHighlightTypes = new Set<string>(TOKEN_TYPES);
let dynamicStyleSheet: CSSStyleSheet | null = null;

/**
 * Inject a dynamic ::highlight() rule for an unknown token type.
 * Built-in types are pre-seeded and never reach this path.
 */
function ensureDynamicHighlightType(tokenType: string): void {
  if (registeredHighlightTypes.has(tokenType)) {
    return;
  }
  registeredHighlightTypes.add(tokenType);

  ensureHighlightStyles();
  if (typeof document === 'undefined') {
    return;
  }

  if (!dynamicStyleSheet) {
    const style = document.createElement('style');
    style.setAttribute('data-astryx-highlight-dynamic', '');
    document.head.appendChild(style);
    dynamicStyleSheet = style.sheet ?? null;
    if (!dynamicStyleSheet) {
      return;
    }
  }

  // CSS.escape both generated names before they land in rule text: the
  // registry key stays the raw string (a ::highlight() selector matches by
  // ident VALUE, escapes and all), so dotted, non-ASCII, `_private`, and
  // digit-led token types keep their colours — while nothing a token stream
  // carries can step outside its ident and shape the rule.
  const name = CSS.escape(`astryx-${tokenType}`);
  const colorVar = `var(${CSS.escape(`--color-syntax-${tokenType}`)}, currentColor)`;
  try {
    dynamicStyleSheet.insertRule(
      `.astryx-code-block code::highlight(${name}), .astryx-codeeditor code::highlight(${name}) { color: ${colorVar}; }`,
    );
  } catch {
    // An engine that still refuses the rule costs that type its colour
    // (ranges paint with currentColor) — never the whole code block.
  }
}

// ---------------------------------------------------------------------------
// Per-type Highlight lookup
// ---------------------------------------------------------------------------

/**
 * Build a local Highlight cache for the duration of a single
 * apply pass. Avoids calling CSS.highlights.get() per-token
 * (one Map lookup per type instead of per token).
 */
function createHighlightResolver(): (tokenType: string) => Highlight {
  const cache = new Map<string, Highlight>();
  return (tokenType: string): Highlight => {
    let highlight = cache.get(tokenType);
    if (highlight) {
      return highlight;
    }

    ensureDynamicHighlightType(tokenType);

    const name = `astryx-${tokenType}`;
    highlight = CSS.highlights.get(name);
    if (!highlight) {
      highlight = new Highlight();
      CSS.highlights.set(name, highlight);
    }
    cache.set(tokenType, highlight);
    return highlight;
  };
}

// ---------------------------------------------------------------------------
// Range application — line-based
// ---------------------------------------------------------------------------

interface RangeEntry {
  range: Range;
  highlight: Highlight;
}

/**
 * Apply highlight ranges for a single line's tokens.
 * The line div is expected to contain a single text node as its
 * first child (or a zero-width space placeholder for empty lines).
 */
function applyLineRanges(
  lineDiv: Element,
  tokens: SyntaxToken[],
  results: RangeEntry[],
  resolve: (tokenType: string) => Highlight,
): void {
  if (tokens.length === 0) {
    return;
  }

  // The text node is the first child of the line div.
  // In range mode, lines render plain text so this is always a Text node.
  const textNode = lineDiv.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    return;
  }

  const textLength = (textNode as Text).length;

  for (const token of tokens) {
    if (token.start >= textLength || token.end <= 0) {
      continue;
    }

    const start = Math.min(token.start, textLength);
    const end = Math.min(token.end, textLength);

    const highlight = resolve(token.type);

    try {
      const range = new Range();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      highlight.add(range);
      results.push({range, highlight});
    } catch {
      // Skip invalid ranges
    }
  }
}

function cleanupRanges(ranges: RangeEntry[]): void {
  for (const {range, highlight} of ranges) {
    highlight.delete(range);
  }
}

// ---------------------------------------------------------------------------
// Chunked application with lazy content-visibility support
// ---------------------------------------------------------------------------

/**
 * Apply ranges for all [data-line] divs inside a container element.
 * Returns the RangeEntry[] so the caller can clean them up later.
 */
function applyRangesToContainer(
  container: Element,
  tokenLines: TokenLine[],
  globalLineOffset: number,
  resolve: (tokenType: string) => Highlight,
): RangeEntry[] {
  const results: RangeEntry[] = [];
  const lineDivs = container.querySelectorAll('[data-line]');
  for (let i = 0; i < lineDivs.length; i++) {
    const tokenIndex = globalLineOffset + i;
    const tokens = tokenLines[tokenIndex];
    if (tokens && tokens.length > 0) {
      applyLineRanges(lineDivs[i], tokens, results, resolve);
    }
  }
  return results;
}

/**
 * Apply CSS Custom Highlight API ranges lazily as content-visibility
 * chunks scroll into view. Visible chunks get ranges immediately;
 * offscreen chunks get ranges when `contentvisibilityautostatechange`
 * fires. Ranges are removed when chunks scroll back offscreen to
 * keep memory usage proportional to the viewport.
 *
 * For small files (no chunk wrappers / below LINE_CHUNK_THRESHOLD),
 * all lines are direct children and get ranges immediately.
 *
 * @param codeEl - The <code> element containing line divs (possibly inside chunk wrappers)
 * @param tokenLines - Per-line token arrays from the tokenizer
 * @returns Cleanup function that removes all ranges and event listeners
 */
export function applyHighlightRangesChunked(
  codeEl: HTMLElement,
  tokenLines: TokenLine[],
): () => void {
  ensureHighlightStyles();

  const resolve = createHighlightResolver();

  // Detect chunk wrappers — direct children of <code> that contain [data-line] divs.
  // If there are no wrappers (small file), lines are direct children.
  const chunkWrappers: Element[] = [];
  const chunkLineOffsets: number[] = [];
  let lineCount = 0;

  for (let i = 0; i < codeEl.children.length; i++) {
    const child = codeEl.children[i];
    const lineDivs = child.querySelectorAll('[data-line]');
    if (
      lineDivs.length > 0 &&
      child.tagName === 'DIV' &&
      !child.hasAttribute('data-line')
    ) {
      // This is a chunk wrapper
      chunkWrappers.push(child);
      chunkLineOffsets.push(lineCount);
      lineCount += lineDivs.length;
    }
  }

  // No chunk wrappers — small file, apply all ranges directly
  if (chunkWrappers.length === 0) {
    const allRanges: RangeEntry[] = [];
    const lineDivs = codeEl.querySelectorAll('[data-line]');
    for (let i = 0; i < lineDivs.length; i++) {
      const tokens = tokenLines[i];
      if (tokens && tokens.length > 0) {
        applyLineRanges(lineDivs[i], tokens, allRanges, resolve);
      }
    }
    return () => cleanupRanges(allRanges);
  }

  // Chunked path — lazy application per chunk
  const chunkRanges = new Map<Element, RangeEntry[]>();
  const listeners = new Map<Element, EventListener>();

  function applyChunk(wrapper: Element, index: number) {
    if (chunkRanges.has(wrapper)) {
      return;
    } // already applied
    const ranges = applyRangesToContainer(
      wrapper,
      tokenLines,
      chunkLineOffsets[index],
      resolve,
    );
    chunkRanges.set(wrapper, ranges);
  }

  function removeChunk(wrapper: Element) {
    const ranges = chunkRanges.get(wrapper);
    if (ranges) {
      cleanupRanges(ranges);
      chunkRanges.delete(wrapper);
    }
  }

  for (let i = 0; i < chunkWrappers.length; i++) {
    const wrapper = chunkWrappers[i];

    const handler = (e: Event) => {
      // contentvisibilityautostatechange fires with .skipped = true when
      // the element goes offscreen, false when it becomes visible.
      const skipped = (e as ContentVisibilityAutoStateChangeEvent).skipped;
      if (skipped) {
        removeChunk(wrapper);
      } else {
        applyChunk(wrapper, i);
      }
    };

    wrapper.addEventListener('contentvisibilityautostatechange', handler);
    listeners.set(wrapper, handler);

    // Apply immediately to chunks that are currently visible.
    // A chunk with content-visibility: auto that is onscreen will have
    // its content rendered — check via checkVisibility if available,
    // otherwise apply eagerly for the first screen's worth.
    const el = wrapper as HTMLElement & {
      checkVisibility?: (opts?: CheckVisibilityOptions) => boolean;
    };
    if (typeof el.checkVisibility === 'function') {
      if (
        el.checkVisibility({
          checkVisibilityCSS: true,
          contentVisibilityAuto: true,
        })
      ) {
        applyChunk(wrapper, i);
      }
    } else {
      // Fallback: apply first few chunks synchronously (likely visible)
      if (i < 5) {
        applyChunk(wrapper, i);
      }
    }
  }

  return function cleanup() {
    // Remove all event listeners
    for (const [wrapper, handler] of listeners) {
      wrapper.removeEventListener('contentvisibilityautostatechange', handler);
    }
    listeners.clear();

    // Clean up all active ranges
    for (const ranges of chunkRanges.values()) {
      cleanupRanges(ranges);
    }
    chunkRanges.clear();
  };
}

/**
 * Apply highlight ranges for a batch of lines starting at a given
 * line index. Used by the streaming tokenizer to apply highlights
 * progressively as tokens arrive.
 */
export function applyHighlightRangesBatch(
  codeEl: HTMLElement,
  tokenLines: TokenLine[],
  startLine: number,
): RangeEntry[] {
  ensureHighlightStyles();

  const resolve = createHighlightResolver();
  const lineDivs = codeEl.querySelectorAll('[data-line]');
  const results: RangeEntry[] = [];

  for (let i = 0; i < tokenLines.length; i++) {
    const divIndex = startLine + i;
    if (divIndex >= lineDivs.length) {
      break;
    }

    const lineDiv = lineDivs[divIndex];
    const tokens = tokenLines[i];
    if (tokens && tokens.length > 0) {
      applyLineRanges(lineDiv, tokens, results, resolve);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Flat text-node application (for contentEditable elements)
// ---------------------------------------------------------------------------

/**
 * Apply CSS Custom Highlight API ranges to a flat element (no [data-line]
 * structure). Works with contentEditable="plaintext-only" where all text
 * may be a single Text node with embedded newlines.
 *
 * @param el - The element containing text (e.g. contentEditable code element)
 * @param tokenLines - Per-line token arrays from the tokenizer
 * @returns Cleanup function that removes all ranges
 */
export function applyHighlightRangesFlat(
  el: HTMLElement,
  tokenLines: TokenLine[],
): () => void {
  ensureHighlightStyles();

  const resolve = createHighlightResolver();
  const myRanges: RangeEntry[] = [];

  // Collect text nodes with absolute offsets
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes: {node: Text; start: number; length: number}[] = [];
  let totalOffset = 0;
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    textNodes.push({node: text, start: totalOffset, length: text.length});
    totalOffset += text.length;
    current = walker.nextNode();
  }

  if (textNodes.length === 0) {
    return () => cleanupRanges(myRanges);
  }

  // Convert per-line tokens to absolute offsets.
  // The source code string has lines joined by \n, so each line starts
  // at the cumulative offset of all previous lines + their \n separators.
  const fullText = el.textContent ?? '';
  let lineOffset = 0;
  for (let lineIdx = 0; lineIdx < tokenLines.length; lineIdx++) {
    const lineTokens = tokenLines[lineIdx];
    if (lineTokens) {
      for (const token of lineTokens) {
        const absStart = lineOffset + token.start;
        const absEnd = lineOffset + token.end;

        const startPos = resolveOffset(textNodes, absStart);
        const endPos = resolveOffset(textNodes, absEnd);
        if (!startPos || !endPos) {
          continue;
        }

        const highlight = resolve(token.type);
        try {
          const range = new Range();
          range.setStart(startPos.node, startPos.offset);
          range.setEnd(endPos.node, endPos.offset);
          highlight.add(range);
          myRanges.push({range, highlight});
        } catch {
          // Skip invalid ranges
        }
      }
    }

    // Advance past this line + \n separator
    const nlPos = fullText.indexOf('\n', lineOffset);
    lineOffset = nlPos === -1 ? fullText.length : nlPos + 1;
  }

  return () => cleanupRanges(myRanges);
}

function resolveOffset(
  textNodes: {node: Text; start: number; length: number}[],
  absOffset: number,
): {node: Text; offset: number} | null {
  for (const entry of textNodes) {
    const end = entry.start + entry.length;
    if (absOffset >= entry.start && absOffset <= end) {
      return {node: entry.node, offset: absOffset - entry.start};
    }
  }
  return null;
}

/**
 * Cleanup a batch of ranges (returned from applyHighlightRangesBatch).
 */
export {cleanupRanges};
