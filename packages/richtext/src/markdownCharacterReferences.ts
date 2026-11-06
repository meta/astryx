// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownCharacterReferences.ts
 * @input Uses lexical, @lexical/link, @lexical/code, and core Markdown's
 *   decodeMarkdownCharacterReferences.
 * @output Exports protectRefusedLinks, protectBackslashEscapes,
 *   protectLinkDestinationParentheses, and protectCharacterReferences, which
 *   swap every link core refuses, every backslash escape, every parenthesis
 *   inside a link destination, and every character reference in Markdown
 *   source for a private-use stand-in before Lexical imports it, and
 *   $restoreCharacterReferences, which puts the literal or decoded text in
 *   place of the stand-ins afterwards.
 * @position Used by importMarkdownKeepingSource (markdownSource.ts), so every
 *   block — paragraphs, headings, lists, quotes, table cells, link text and
 *   destinations — decodes references with the one decoder core Markdown
 *   renders with (spec:AST-061 FR7, DEC-5), in one pass over the source and
 *   one over the imported text. The stand-ins mean nothing to Lexical's
 *   Markdown import, so a decoded `*` never starts emphasis, and no `&#digits;`
 *   reaches Lexical's own decoding, which ignores escapes and throws on a
 *   number past Unicode. Code keeps references as written.
 *   Backslash escapes go through the same way, so an escaped character is
 *   literal text wherever it is — `\[x](y)` is text, not a link, as in core
 *   Markdown (spec:AST-061 FR7, spec:AST-062 FR3) — and code keeps its
 *   backslashes. Parentheses inside a link destination go through the same
 *   way, so Lexical, which reads none in a destination, reads balanced ones
 *   as core does.
 */

import {$isCodeNode} from '@lexical/code';
import {$isLinkNode} from '@lexical/link';
import {$isTableCellNode} from '@lexical/table';
import {$dfs, $findMatchingParent} from '@lexical/utils';
import {
  $isElementNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
} from 'lexical';
import {
  decodeMarkdownCharacterReferences,
  parseInlineAst,
} from '@astryxdesign/core/Markdown/parser';

/**
 * What a stand-in replaced: a reference as written, an escaped `&`, or a
 * backslash-escaped character.
 */
type StandIn =
  | {readonly kind: 'reference'; readonly source: string}
  | {readonly kind: 'ampersand'}
  | {readonly kind: 'escape'; readonly character: string}
  | {readonly kind: 'backslash'}
  | {readonly kind: 'literal'; readonly text: string};

export interface ProtectedMarkdown {
  /** The source with stand-ins in place of references. */
  readonly markdown: string;
  /** What each stand-in replaced. */
  readonly standIns: ReadonlyMap<string, StandIn>;
}

// Something that looks like a reference; the decoder decides if it is one.
const REFERENCE_LIKE = /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/y;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

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
 * The ranges of `text` that are code: fenced code blocks, and code spans,
 * where a backtick run opens a span only if a later run of the same length
 * closes it (CommonMark 0.31). One scan collects the runs; runs of each length
 * are searched by position, so the whole is O(n log n).
 */
function codeRanges(text: string): Array<readonly [number, number]> {
  const {fenced, spans} = codeRangesByKind(text);
  return [...fenced, ...spans].sort((a, b) => a[0] - b[0]);
}

/** The fenced code blocks of `text`, and its code spans, each in order. */
function codeRangesByKind(text: string): {
  fenced: Array<readonly [number, number]>;
  spans: Array<readonly [number, number]>;
} {
  const ranges: Array<readonly [number, number]> = [];
  // Fenced code blocks, line by line.
  let lineStart = 0;
  let fence: {readonly marker: string; readonly start: number} | null = null;
  while (lineStart <= text.length) {
    const lineEnd = text.indexOf('\n', lineStart);
    const end = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(lineStart, end);
    if (fence == null) {
      const open = FENCE_OPEN.exec(line);
      if (open != null) {
        fence = {marker: open[1], start: lineStart};
      }
    } else if (
      new RegExp(
        `^ {0,3}\\${fence.marker[0]}{${fence.marker.length},}[ \\t]*$`,
      ).test(line)
    ) {
      ranges.push([fence.start, end]);
      fence = null;
    }
    if (lineEnd === -1) {
      break;
    }
    lineStart = lineEnd + 1;
  }
  if (fence != null) {
    ranges.push([fence.start, text.length]);
  }
  const fencedCount = ranges.length;
  // Code spans, outside fenced code. A backtick run is a string of backticks
  // with no backtick on either side. Backslashes are literal inside a code
  // span, so they never hide a closing run; an odd number of backslashes
  // before a run only makes its first backtick literal, so the rest of the
  // run (if any) may still open a span.
  const runs: Array<{readonly start: number; readonly length: number}> = [];
  let index = 0;
  let fenceIndex = 0;
  while (index < text.length) {
    const current = ranges[fenceIndex];
    if (current != null && index >= current[0]) {
      index = current[1];
      fenceIndex++;
      continue;
    }
    if (text[index] === '`') {
      let end = index;
      while (text[end] === '`') {
        end++;
      }
      runs.push({start: index, length: end - index});
      index = end;
      continue;
    }
    index++;
  }
  // Each run's position in the list of runs of its length, for finding the
  // next run of a given length after a point by binary search.
  const byLength = new Map<number, Array<number>>();
  for (const run of runs) {
    const starts = byLength.get(run.length) ?? [];
    starts.push(run.start);
    byLength.set(run.length, starts);
  }
  const nextRunAfter = (length: number, after: number): number | null => {
    const starts = byLength.get(length);
    if (starts == null) {
      return null;
    }
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (starts[middle] < after) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return starts[low] ?? null;
  };
  let resumeAt = 0;
  for (const run of runs) {
    if (run.start < resumeAt) {
      continue;
    }
    let backslashes = 0;
    while (text[run.start - 1 - backslashes] === '\\') {
      backslashes++;
    }
    const isEscaped = backslashes % 2 === 1;
    const openStart = isEscaped ? run.start + 1 : run.start;
    const openLength = isEscaped ? run.length - 1 : run.length;
    if (openLength === 0) {
      continue;
    }
    const closer = nextRunAfter(openLength, run.start + run.length);
    if (closer == null) {
      continue;
    }
    ranges.push([openStart, closer + openLength]);
    resumeAt = closer + openLength;
  }
  return {
    fenced: ranges.slice(0, fencedCount),
    spans: ranges.slice(fencedCount).sort((a, b) => a[0] - b[0]),
  };
}

/** The characters a backslash escapes (CommonMark 0.31 §2.4). */
const ESCAPABLE = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');

/**
 * Returns `markdown` with every backslash escape outside code — a backslash
 * before ASCII punctuation — replaced by a private-use stand-in for the
 * escaped character, and every backslash in code by a stand-in for itself,
 * which Lexical would otherwise drop from a code span — except before `|`,
 * which a table reads before its code. A backslash before anything else
 * outside code stays as written. One pass over the source.
 */
export function protectBackslashEscapes(markdown: string): ProtectedMarkdown {
  const standIns = new Map<string, StandIn>();
  if (!markdown.includes('\\')) {
    return {markdown, standIns};
  }
  const available = absentCharacters(markdown);
  const byKey = new Map<string, string>();
  const standInFor = (key: string, value: StandIn): string | null => {
    const existing = byKey.get(key);
    if (existing != null) {
      return existing;
    }
    const next = available.next();
    if (next.done === true) {
      // Every private-use character is in the text: leave the rest as
      // written.
      return null;
    }
    byKey.set(key, next.value);
    standIns.set(next.value, value);
    return next.value;
  };
  const code = codeRanges(markdown);
  let output = '';
  let copied = 0;
  let codeIndex = 0;
  let index = markdown.indexOf('\\');
  while (index !== -1) {
    while (code[codeIndex] != null && code[codeIndex][1] <= index) {
      codeIndex++;
    }
    const range = code[codeIndex];
    const character = markdown[index + 1];
    const inCode = range != null && range[0] <= index;
    // A table splits its cells before it reads code, so `\|` in code is the
    // table's to read.
    if (inCode && character === '|') {
      index = markdown.indexOf('\\', index + 2);
      continue;
    }
    const isEscape = !inCode && character != null && ESCAPABLE.has(character);
    if (inCode || isEscape) {
      const standIn = inCode
        ? standInFor('code', {kind: 'backslash'})
        : standInFor(`escape:${character}`, {
            kind: 'escape',
            character: character ?? '',
          });
      if (standIn == null) {
        break;
      }
      output += markdown.slice(copied, index) + standIn;
      copied = index + (inCode ? 1 : 2);
      index = markdown.indexOf('\\', copied);
      continue;
    }
    index = markdown.indexOf('\\', index + 1);
  }
  return {markdown: output + markdown.slice(copied), standIns};
}

/**
 * For each `[`, `]`, `(`, and `)` in `text` outside code and not escaped,
 * the index of the bracket or parenthesis it pairs with by nesting; -1 for
 * the rest. One pass, so a candidate never rescans the text.
 */
function pairedDelimiters(
  text: string,
  code: ReadonlyArray<readonly [number, number]>,
): Int32Array {
  const pair = new Int32Array(text.length).fill(-1);
  const brackets: number[] = [];
  const parentheses: number[] = [];
  let codeIndex = 0;
  for (let index = 0; index < text.length; index++) {
    while (codeIndex < code.length && code[codeIndex][1] <= index) {
      codeIndex++;
    }
    if (codeIndex < code.length && code[codeIndex][0] <= index) {
      index = code[codeIndex][1] - 1;
      continue;
    }
    const character = text[index];
    const open =
      character === ']'
        ? brackets.pop()
        : character === ')'
          ? parentheses.pop()
          : undefined;
    if (character === '\\') {
      index++;
    } else if (character === '[') {
      brackets.push(index);
    } else if (character === '(') {
      parentheses.push(index);
    } else if (open !== undefined) {
      pair[index] = open;
      pair[open] = index;
    }
  }
  return pair;
}

/**
 * Where a destination that opens with `<` ends — the index of the `)` that
 * closes the link — read as core Markdown reads it (CommonMark 0.31 §6.3):
 * `'refused'` when it opens with `<` but is no angle-bracket destination,
 * and null when the content after `open` (the `(`) does not open with `<`.
 * Inside the brackets parentheses are plain characters; a line ending, even
 * escaped, or an unescaped `<` makes it no destination; after the `>` come
 * only spaces, an optional title, and the `)`.
 */
function angleDestinationEnd(
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
 * Whether core Markdown refuses a link to `destination`, as written in the
 * source: its own parser decides, so both surfaces refuse the same
 * destinations by one policy.
 */
function coreRefusesDestination(destination: string): boolean {
  const probe = `[x](${destination})`;
  const [only, ...rest] = parseInlineAst(probe);
  return rest.length === 0 && only?.type === 'text' && only.value === probe;
}

/**
 * Whether core Markdown refuses a link to `url`, a destination already
 * decoded: the probe writes it back with every special character escaped.
 * A URL that cannot be written back is refused.
 */
export function coreRefusesUrl(url: string): boolean {
  if (/[\n\r]/.test(url)) {
    return true;
  }
  // Angle brackets never decide a scheme, so the probe percent-encodes them:
  // the URL then fits one angle-bracket destination even with spaces in it.
  const escaped = url
    .replace(/[<>]/g, character => (character === '<' ? '%3C' : '%3E'))
    .replace(/[\\()&[\]"']/g, character => `\\${character}`);
  return coreRefusesDestination(/\s/.test(url) ? `<${escaped}>` : escaped);
}

/**
 * Returns `markdown` with each inline link whose destination core Markdown
 * refuses — `javascript:` and the like — kept from becoming a link
 * (spec:AST-061 FR7). Where core shows the link as its source text, exactly
 * as written, the whole source becomes one stand-in that comes back as that
 * text. Where core reads no link there at all (its link text holds brackets
 * of its own), only the `(` that opens the destination becomes a stand-in,
 * so the text around it reads as core reads it, marks included. Brackets and
 * parentheses pair by nesting, so link text holding brackets is found whole.
 * Linear in the source: pairs come from one pass, and a destination inside a
 * found link is not probed again. Run first, on the source as written;
 * `$unwrapRefusedLinks` catches any link the editor still makes.
 */
export function protectRefusedLinks(markdown: string): ProtectedMarkdown {
  const standIns = new Map<string, StandIn>();
  if (!markdown.includes('](')) {
    return {markdown, standIns};
  }
  const pair = pairedDelimiters(markdown, codeRanges(markdown));
  // Ranges to replace, in order: a whole link, or the `(` that opens its
  // destination.
  const refused: Array<{start: number; end: number; whole: boolean}> = [];
  // Where the last probed destination ends: a link cannot sit inside one.
  let probedTo = -1;
  for (
    let index = markdown.indexOf('](');
    index !== -1;
    index = markdown.indexOf('](', index + 1)
  ) {
    const open = pair[index];
    // A destination in angle brackets ends where core ends it — parentheses
    // inside the brackets are plain characters — so `[a](<b)c>)` is probed
    // whole, not as `<b`.
    const angleClose = angleDestinationEnd(markdown, index + 1);
    const close = typeof angleClose === 'number' ? angleClose : pair[index + 1];
    if (index < probedTo || open === -1 || close === -1) {
      continue;
    }
    probedTo = close;
    if (!coreRefusesDestination(markdown.slice(index + 2, close))) {
      continue;
    }
    const source = markdown.slice(open, close + 1);
    const [only, ...rest] = parseInlineAst(source);
    if (rest.length === 0 && only?.type === 'text' && only.value === source) {
      // A whole link stands for the refused links found inside it.
      while (refused.length > 0 && refused[refused.length - 1].start >= open) {
        refused.pop();
      }
      refused.push({start: open, end: close + 1, whole: true});
    } else {
      refused.push({start: index + 1, end: index + 2, whole: false});
    }
  }
  if (refused.length === 0) {
    return {markdown, standIns};
  }
  const available = absentCharacters(markdown);
  let output = '';
  let copied = 0;
  for (const {start, end, whole} of refused) {
    const next = available.next();
    if (next.done === true || start < copied) {
      break;
    }
    standIns.set(
      next.value,
      whole
        ? {kind: 'literal', text: markdown.slice(start, end)}
        : {kind: 'escape', character: '('},
    );
    output += markdown.slice(copied, start) + next.value;
    copied = end;
  }
  return {markdown: output + markdown.slice(copied), standIns};
}

/**
 * Takes every link under `node` whose URL core Markdown refuses out of its
 * link, leaving its text in place, so no form of link text or destination
 * the source pass did not find can store or draw an unsafe URL.
 */
export function $unwrapRefusedLinks(node: ElementNode): void {
  for (const {node: descendant} of $dfs(node)) {
    if ($isLinkNode(descendant) && coreRefusesUrl(descendant.getURL())) {
      for (const child of descendant.getChildren()) {
        descendant.insertBefore(child);
      }
      descendant.remove();
    }
  }
}

/**
 * Returns `markdown` with every parenthesis inside an inline link
 * destination — between the destination's own parentheses, balanced, as core
 * Markdown and CommonMark read them — replaced by a private-use stand-in for
 * itself, outside code. Run after protectBackslashEscapes, so an escaped
 * parenthesis is already a stand-in and never counts toward the balance.
 */
export function protectLinkDestinationParentheses(
  markdown: string,
): ProtectedMarkdown {
  const standIns = new Map<string, StandIn>();
  if (!markdown.includes('](')) {
    return {markdown, standIns};
  }
  const available = absentCharacters(markdown);
  const byCharacter = new Map<string, string>();
  const standInFor = (character: '(' | ')'): string | null => {
    const existing = byCharacter.get(character);
    if (existing != null) {
      return existing;
    }
    const next = available.next();
    if (next.done === true) {
      return null;
    }
    byCharacter.set(character, next.value);
    standIns.set(next.value, {kind: 'escape', character});
    return next.value;
  };
  const code = codeRanges(markdown);
  const inner: Array<number> = [];
  let codeIndex = 0;
  let index = markdown.indexOf('](');
  while (index !== -1) {
    while (code[codeIndex] != null && code[codeIndex][1] <= index) {
      codeIndex++;
    }
    const range = code[codeIndex];
    if (range != null && range[0] <= index) {
      index = markdown.indexOf('](', range[1]);
      continue;
    }
    // The destination's own parentheses are depth one; any inside it are
    // deeper. A space at depth one ends the destination (a title follows);
    // a space deeper, or no closing parenthesis, means no link.
    const parentheses: Array<number> = [];
    let depth = 1;
    let position = index + 2;
    let isLink = markdown[position] !== '<';
    for (; isLink && position < markdown.length; position++) {
      const character = markdown[position];
      if (/\s/.test(character)) {
        isLink = depth === 1;
        break;
      }
      if (character === '(') {
        depth++;
        parentheses.push(position);
      } else if (character === ')') {
        depth--;
        if (depth === 0) {
          break;
        }
        parentheses.push(position);
      }
    }
    if (isLink && depth <= 1) {
      inner.push(...parentheses);
    }
    index = markdown.indexOf('](', position + 1);
  }
  if (inner.length === 0) {
    return {markdown, standIns};
  }
  let output = '';
  let copied = 0;
  for (const position of inner) {
    const standIn = standInFor(markdown[position] as '(' | ')');
    if (standIn == null) {
      break;
    }
    output += markdown.slice(copied, position) + standIn;
    copied = position + 1;
  }
  return {markdown: output + markdown.slice(copied), standIns};
}

/** The code spans a stand-in pass replaced: each stand-in's code. */
export interface ProtectedCodeSpans {
  readonly markdown: string;
  readonly spans: ReadonlyMap<string, string>;
  /** Stand-ins for backticks in link destinations and titles. */
  readonly standIns: ReadonlyMap<string, StandIn>;
}

/** Whether `text` holds a `|` with no backslash before it. */
function hasUnescapedPipe(text: string): boolean {
  for (let index = text.indexOf('|'); index !== -1;) {
    let backslashes = 0;
    while (text[index - 1 - backslashes] === '\\') {
      backslashes++;
    }
    if (backslashes % 2 === 0) {
      return true;
    }
    index = text.indexOf('|', index + 1);
  }
  return false;
}

/** A GFM table's delimiter row: cells of hyphens with optional colons. */
const TABLE_DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * The ranges of `markdown` a code span must not start in: inline link
 * destinations and titles, from the `(` after a `]` to its paired `)`. The
 * link reads its destination before any code span there, as core and
 * CommonMark read it.
 */
function linkTargetRanges(
  markdown: string,
  code: ReadonlyArray<readonly [number, number]>,
): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  if (!markdown.includes('](')) {
    return ranges;
  }
  const pair = pairedDelimiters(markdown, code);
  for (
    let index = markdown.indexOf('](');
    index !== -1;
    index = markdown.indexOf('](', index + 1)
  ) {
    // An angle-bracket destination ends where core ends it: a parenthesis
    // inside the brackets pairs with nothing.
    const angleClose = angleDestinationEnd(markdown, index + 1);
    const close = typeof angleClose === 'number' ? angleClose : pair[index + 1];
    if (pair[index] !== -1 && close !== -1) {
      ranges.push([index + 1, close + 1]);
    }
  }
  return ranges;
}

/** The ranges of `markdown` that are GFM table rows, header row included. */
function tableRowRanges(markdown: string): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  const lines = markdown.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    if (
      line.includes('|') &&
      TABLE_DELIMITER_ROW.test(line) &&
      lines[index - 1].includes('|')
    ) {
      let end = index + 1;
      while (end < lines.length && lines[end].trim() !== '') {
        end++;
      }
      ranges.push([starts[index - 1], starts[end - 1] + lines[end - 1].length]);
      index = end;
    }
  }
  return ranges;
}

/**
 * Returns `markdown` with each code span outside fenced code replaced by a
 * private-use stand-in, and the code each stands for, as core Markdown reads
 * it. Code spans bind tighter than emphasis and links (CommonMark 0.31
 * §6.1), but Lexical's import applies a code span before an earlier mark on
 * the same line, which breaks every mark around code that follows another
 * (`~~a~~ ~~`c`~~`); with the code out of the way, the marks pair first and
 * the code comes back inside them. Backticks in a link's destination or
 * title are the link's, never a code span: they become stand-ins too, put
 * back into the link's address and title after import, so Lexical cannot
 * pair them into code either. In a table row, a span holding an unescaped
 * `|` is left alone, so the row still splits its cells there, as GFM does.
 */
export function protectCodeSpans(markdown: string): ProtectedCodeSpans {
  const spans = new Map<string, string>();
  const standIns = new Map<string, StandIn>();
  if (!markdown.includes('`')) {
    return {markdown, spans, standIns};
  }
  const code = codeRangesByKind(markdown);
  const targets = linkTargetRanges(markdown, [...code.fenced, ...code.spans]);
  const rows = tableRowRanges(markdown);
  // Whether a position lies in one of ranges sorted by start, for positions
  // asked in order: one pass over the ranges in all.
  const cursor = (ranges: ReadonlyArray<readonly [number, number]>) => {
    let next = 0;
    let coveredTo = -1;
    return (position: number): boolean => {
      while (next < ranges.length && ranges[next][0] <= position) {
        coveredTo = Math.max(coveredTo, ranges[next][1]);
        next++;
      }
      return position < coveredTo;
    };
  };
  const inTarget = cursor(targets);
  const inRow = cursor(rows);
  // Replacements in source order: code spans, and backticks in targets.
  const replacements: Array<{
    readonly start: number;
    readonly end: number;
    readonly code: string | null;
  }> = [];
  for (const [start, end] of code.spans) {
    const source = markdown.slice(start, end);
    const isInRow = inRow(start);
    if (inTarget(start) || (isInRow && hasUnescapedPipe(source))) {
      continue;
    }
    const [only, ...rest] = parseInlineAst(source);
    if (rest.length > 0 || only?.type !== 'inlineCode') {
      continue;
    }
    replacements.push({start, end, code: only.value});
  }
  for (const [from, to] of targets) {
    for (
      let index = markdown.indexOf('`', from);
      index !== -1 && index < to;
      index = markdown.indexOf('`', index + 1)
    ) {
      replacements.push({start: index, end: index + 1, code: null});
    }
  }
  replacements.sort((a, b) => a.start - b.start);
  const available = absentCharacters(markdown);
  let output = '';
  let copied = 0;
  for (const {start, end, code: content} of replacements) {
    if (start < copied) {
      continue;
    }
    const next = available.next();
    if (next.done === true) {
      break;
    }
    if (content == null) {
      standIns.set(next.value, {kind: 'literal', text: '`'});
    } else {
      spans.set(next.value, content);
    }
    output += markdown.slice(copied, start) + next.value;
    copied = end;
  }
  return {markdown: output + markdown.slice(copied), spans, standIns};
}

/**
 * Puts each code span back where its stand-in sits under `node`: the code as
 * text with the code format, inside whatever marks the stand-in took. In a
 * table cell an escaped `\|` in code is a `|`, as GFM reads cells.
 */
export function $restoreCodeSpans(
  node: ElementNode,
  spans: ReadonlyMap<string, string>,
): void {
  if (spans.size === 0) {
    return;
  }
  for (const text of node.getAllTextNodes()) {
    const content = text.getTextContent();
    const offsets: number[] = [];
    let offset = 0;
    for (const character of content) {
      if (spans.has(character)) {
        offsets.push(offset, offset + character.length);
      }
      offset += character.length;
    }
    if (offsets.length === 0) {
      continue;
    }
    const pieces = text.splitText(
      ...offsets.filter(point => point > 0 && point < content.length),
    );
    for (const piece of pieces) {
      const code = spans.get(piece.getTextContent());
      if (code == null) {
        continue;
      }
      const inCell = $findMatchingParent(piece, $isTableCellNode) != null;
      piece.setTextContent(inCell ? code.replace(/\\\|/g, '|') : code);
      if (!piece.hasFormat('code')) {
        piece.toggleFormat('code');
      }
    }
  }
}

/**
 * Returns `markdown` with every character reference outside code replaced by
 * a private-use stand-in that occurs nowhere else in it, and the escaped `&`
 * of an escaped reference replaced by one too. One pass over the source.
 */
export function protectCharacterReferences(
  markdown: string,
): ProtectedMarkdown {
  const standIns = new Map<string, StandIn>();
  if (!markdown.includes('&')) {
    return {markdown, standIns};
  }
  const available = absentCharacters(markdown);
  const byReference = new Map<string, string>();
  let ampersand: string | null = null;
  const standInFor = (reference: string | null): string | null => {
    const existing = reference == null ? ampersand : byReference.get(reference);
    if (existing != null) {
      return existing;
    }
    const next = available.next();
    if (next.done === true) {
      // Every private-use character is in the text or already used: leave
      // the rest as written.
      return null;
    }
    if (reference == null) {
      ampersand = next.value;
      standIns.set(next.value, {kind: 'ampersand'});
    } else {
      byReference.set(reference, next.value);
      standIns.set(next.value, {kind: 'reference', source: reference});
    }
    return next.value;
  };
  const code = codeRanges(markdown);
  let output = '';
  let copied = 0;
  let codeIndex = 0;
  let index = markdown.indexOf('&');
  while (index !== -1) {
    while (code[codeIndex] != null && code[codeIndex][1] <= index) {
      codeIndex++;
    }
    const range = code[codeIndex];
    if (range != null && range[0] <= index) {
      index = markdown.indexOf('&', range[1]);
      continue;
    }
    REFERENCE_LIKE.lastIndex = index;
    const match = REFERENCE_LIKE.exec(markdown);
    if (match == null) {
      index = markdown.indexOf('&', index + 1);
      continue;
    }
    let backslashes = 0;
    while (markdown[index - 1 - backslashes] === '\\') {
      backslashes++;
    }
    const reference = match[0];
    const end = index + reference.length;
    if (backslashes % 2 === 1) {
      // An escaped `&`: the reference stays literal, without its backslash.
      const standIn = standInFor(null);
      if (standIn != null) {
        output += markdown.slice(copied, index - 1) + standIn;
        copied = index + 1;
      }
    } else if (decodeMarkdownCharacterReferences(reference) !== reference) {
      const standIn = standInFor(reference);
      if (standIn != null) {
        output += markdown.slice(copied, index) + standIn;
        copied = end;
      }
    } else if (reference.startsWith('&#')) {
      // Not a reference (too many digits): literal, but kept from Lexical's
      // own numeric decoding.
      const standIn = standInFor(null);
      if (standIn != null) {
        output += markdown.slice(copied, index) + standIn;
        copied = index + 1;
      }
    }
    index = markdown.indexOf('&', end);
  }
  return {markdown: output + markdown.slice(copied), standIns};
}

/** `text` with each stand-in replaced as `replace` says. */
function restored(
  text: string,
  standIns: ReadonlyMap<string, StandIn>,
  replace: (standIn: StandIn) => string,
): string {
  let output = '';
  let changed = false;
  for (const character of text) {
    const standIn = standIns.get(character);
    if (standIn == null) {
      output += character;
    } else {
      output += replace(standIn);
      changed = true;
    }
  }
  return changed ? output : text;
}

const decoded = (standIn: StandIn): string => {
  switch (standIn.kind) {
    case 'literal':
      return standIn.text;
    case 'ampersand':
      return '&';
    case 'backslash':
      return '\\';
    case 'escape':
      return standIn.character;
    case 'reference':
      return decodeMarkdownCharacterReferences(standIn.source);
  }
};
const asWritten = (standIn: StandIn): string => {
  switch (standIn.kind) {
    case 'literal':
      return standIn.text;
    case 'ampersand':
      return '&';
    case 'backslash':
      return '\\';
    case 'escape':
      return `\\${standIn.character}`;
    case 'reference':
      return standIn.source;
  }
};

/**
 * Replaces the stand-ins under `node` with the characters their references
 * name or their escapes stand for — or, in code Lexical read as code, with
 * the references and escapes as written — in text, link destinations, and
 * link titles. One pass over the text.
 */
export function $restoreCharacterReferences(
  node: ElementNode,
  standIns: ReadonlyMap<string, StandIn>,
): void {
  if (standIns.size === 0) {
    return;
  }
  const visit = (current: LexicalNode, inCode: boolean) => {
    if ($isTextNode(current)) {
      const text = current.getTextContent();
      const next = restored(
        text,
        standIns,
        inCode || current.hasFormat('code') ? asWritten : decoded,
      );
      if (next !== text) {
        current.setTextContent(next);
      }
      return;
    }
    if ($isLinkNode(current)) {
      const url = restored(current.getURL(), standIns, decoded);
      if (url !== current.getURL()) {
        current.setURL(url);
      }
      const title = current.getTitle();
      if (title != null) {
        const nextTitle = restored(title, standIns, decoded);
        if (nextTitle !== title) {
          current.setTitle(nextTitle);
        }
      }
    }
    if ($isElementNode(current)) {
      const isCode = inCode || $isCodeNode(current);
      for (const child of current.getChildren()) {
        visit(child, isCode);
      }
    }
  };
  visit(node, false);
}
