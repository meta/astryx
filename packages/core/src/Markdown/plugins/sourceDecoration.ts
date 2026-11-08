// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sourceDecoration.ts
 * @input Caller-supplied UTF-16 source ranges and non-semantic decoration payloads
 * @output Immutable Markdown transforms that annotate Core-authored source-backed nodes
 * @position Optional helper layer compiled onto the core transform protocol
 */

import type {
  MarkdownAstDataValue,
  MarkdownAstNodeBase,
  MarkdownAstPosition,
  MarkdownAstRoot,
} from '../ast';
import {
  isMarkdownPluginData,
  markMarkdownTransformClaim,
  markMarkdownTransformTrusted,
  type MarkdownExtensionNode,
  type MarkdownPluginData,
  type MarkdownTransform,
} from './protocol';

/**
 * Reserved node-data key and brand of the Core-owned decoration envelope.
 * Decorations are only ever read from, and merged into, a value carrying all
 * three: an arbitrary payload that happens to sit at this key is foreign data
 * and is left untouched.
 */
const ENVELOPE_KEY = 'astryx:sourceDecorations';
const ENVELOPE_BRAND = 'astryx.markdown.sourceDecorations';
const ENVELOPE_VERSION = 1;

/** One decoration recorded on an annotated node. */
export interface MarkdownSourceDecoration {
  /** Stable decoration name supplied by the helper's caller. */
  readonly name: string;
  /** Optional finite JSON-like payload copied from the matching range. */
  readonly data?: MarkdownPluginData;
}

export interface MarkdownSourceDecorationRange {
  /** Inclusive UTF-16 offset into the parsed source. */
  readonly start: number;
  /** Exclusive UTF-16 offset into the parsed source. */
  readonly end: number;
  /** Optional finite JSON-like payload recorded with this range. */
  readonly data?: MarkdownPluginData;
}

export interface MarkdownSourceDecorationOptions {
  /** Stable decoration name identifying every entry this helper records. */
  readonly name: string;
  /**
   * Source ranges to decorate, as UTF-16 offsets into the same string the
   * parser received. Order does not matter: entries are recorded in a fixed
   * start, end, payload order so overlapping and duplicate ranges resolve the
   * same way on every run. An empty list is a valid no-op.
   */
  readonly ranges: ReadonlyArray<MarkdownSourceDecorationRange>;
}

/** A decoration entry as stored: plain, frozen, JSON-like node data. */
type DecorationEntry = {readonly [key: string]: MarkdownAstDataValue};

interface NormalizedRange {
  readonly start: number;
  readonly end: number;
  readonly entry: DecorationEntry;
}

/**
 * Every AST node shares an optional `position` and `data`; decoration is node
 * kind agnostic, so the walk below reads only those two fields plus children.
 */
type DecoratableNode = MarkdownAstNodeBase & {
  readonly type: string;
  readonly children?: ReadonlyArray<DecoratableNode>;
};

interface RunState {
  readonly report: (message: string) => void;
  hasReported: boolean;
}

const NO_DECORATIONS: ReadonlyArray<MarkdownSourceDecoration> = Object.freeze(
  [],
);

function isPlainObject(
  value: MarkdownAstDataValue | undefined,
): value is {readonly [key: string]: MarkdownAstDataValue} {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function cloneDecorationData<Data extends MarkdownPluginData>(
  value: Data,
): Data {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneDecorationData)) as Data;
  }
  const clone: Record<string, MarkdownAstDataValue> = {};
  for (const [key, nested] of Object.entries(value)) {
    clone[key] = cloneDecorationData(nested);
  }
  return Object.freeze(clone) as Data;
}

function fail(message: string): never {
  throw new TypeError(`Markdown source decoration: ${message}`);
}

function normalizeRanges(
  name: string,
  ranges: ReadonlyArray<MarkdownSourceDecorationRange>,
): ReadonlyArray<NormalizedRange> {
  const normalized: (NormalizedRange & {readonly key: string})[] = [];
  const seen = new Set<string>();
  for (const range of ranges) {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < 0 ||
      range.end <= range.start
    ) {
      fail('ranges must be ordered, non-empty, non-negative UTF-16 offsets');
    }
    if (range.data !== undefined && !isMarkdownPluginData(range.data)) {
      fail('range data must be finite JSON-like plugin data');
    }
    const data =
      range.data === undefined ? undefined : cloneDecorationData(range.data);
    const key = `${range.start}\u0000${range.end}\u0000${
      data === undefined ? '' : JSON.stringify(data)
    }`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      start: range.start,
      end: range.end,
      entry: Object.freeze(
        data === undefined ? {name} : {name, data},
      ) as DecorationEntry,
      key,
    });
  }
  // Sorted by start, then end, then payload: the sweep below needs start
  // order, and the tail of the comparison makes overlapping and duplicate
  // ranges resolve identically on every run.
  normalized.sort(
    (left, right) =>
      left.start - right.start ||
      left.end - right.end ||
      (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
  );
  return Object.freeze(
    normalized.map(({start, end, entry}) => Object.freeze({start, end, entry})),
  );
}

/**
 * A node's Core-authored span, or `undefined` when it has no usable one.
 * Read into two numbers rather than an object: this runs once per node of
 * every decorated document.
 */
function spanStart(position: MarkdownAstPosition | undefined): number {
  if (position === undefined) {
    return -1;
  }
  const start = position.start.offset;
  const end = position.end.offset;
  return typeof start === 'number' &&
    typeof end === 'number' &&
    start >= 0 &&
    end >= start
    ? start
    : -1;
}

/**
 * Reads the decoration entries already on a node. `null` means the node
 * carries data this helper does not own, so it must be left alone.
 */
function existingEntries(
  data: MarkdownAstDataValue | undefined,
): ReadonlyArray<MarkdownAstDataValue> | undefined | null {
  if (data === undefined) {
    return undefined;
  }
  if (!isPlainObject(data)) {
    return null;
  }
  const envelope = data[ENVELOPE_KEY];
  if (envelope === undefined) {
    return undefined;
  }
  if (
    !isPlainObject(envelope) ||
    envelope.kind !== ENVELOPE_BRAND ||
    envelope.version !== ENVELOPE_VERSION ||
    !Array.isArray(envelope.entries) ||
    !envelope.entries.every(isDecorationEntry)
  ) {
    return null;
  }
  return envelope.entries;
}

function isDecorationEntry(value: MarkdownAstDataValue): boolean {
  return isPlainObject(value) && typeof value.name === 'string';
}

function envelope(
  entries: ReadonlyArray<MarkdownAstDataValue>,
): MarkdownAstDataValue {
  return {
    kind: ENVELOPE_BRAND,
    version: ENVELOPE_VERSION,
    entries,
  };
}

function reportSkip(state: RunState): void {
  if (state.hasReported) {
    return;
  }
  state.hasReported = true;
  state.report(
    'skipped a node whose data is not a Core-owned source-decoration envelope',
  );
}

/**
 * Records `entries` in the node's decoration envelope, or returns `undefined`
 * when the node carries data this helper does not own. Skipping keeps a
 * foreign payload intact instead of overwriting or extending it.
 */
function mergeDecorations(
  node: DecoratableNode,
  entries: ReadonlyArray<DecorationEntry>,
  state: RunState,
): MarkdownAstDataValue | undefined {
  const current = existingEntries(node.data);
  if (current === null) {
    reportSkip(state);
    return undefined;
  }
  const merged = envelope(
    current === undefined ? entries : [...current, ...entries],
  );
  return node.data === undefined
    ? {[ENVELOPE_KEY]: merged}
    : {...(node.data as object), [ENVELOPE_KEY]: merged};
}

/**
 * Whether the positioned children already sit in ascending span order, and
 * the span-ordered index list when they do not. An earlier transform may
 * reorder, drop, or interleave blocks, so document order is never assumed —
 * but the ordinary case is detected in one pass and needs no index list at
 * all.
 */
function spanOrder(
  children: ReadonlyArray<DecoratableNode>,
): ReadonlyArray<number> | undefined {
  let previous = -1;
  for (let index = 0; index < children.length; index++) {
    const start = spanStart(children[index].position);
    if (start < 0) {
      continue;
    }
    if (start < previous) {
      const indices: number[] = [];
      for (let scan = 0; scan < children.length; scan++) {
        if (spanStart(children[scan].position) >= 0) {
          indices.push(scan);
        }
      }
      indices.sort(
        (left, right) =>
          spanStart(children[left].position) -
            spanStart(children[right].position) || left - right,
      );
      return indices;
    }
    previous = start;
  }
  return undefined;
}

/**
 * The first slot whose node can overlap `offset` — that is, the first one
 * ending after it. Spans ascend, so the blocks a range touches are one
 * contiguous run and a search finds its start without walking the document.
 * Decorating a known range therefore costs the blocks it actually covers,
 * not the length of the document it sits in.
 */
function firstSlotEndingAfter(
  children: ReadonlyArray<DecoratableNode>,
  order: ReadonlyArray<number> | undefined,
  length: number,
  offset: number,
): number {
  let low = 0;
  let high = length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const node = children[order?.[middle] ?? middle];
    const end = node.position?.end.offset;
    if (typeof end === 'number' && end <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * Sweeps the start-sorted ranges across the span-ordered children, keeping
 * the ranges that can still overlap in an active window. Each range is
 * admitted and retired at most once, so the pass costs the blocks the ranges
 * reach plus the matches — never the whole document per range.
 */
function decorateChildren(
  children: ReadonlyArray<DecoratableNode>,
  ranges: ReadonlyArray<NormalizedRange>,
  state: RunState,
): ReadonlyArray<DecoratableNode> {
  const order = spanOrder(children);
  const length = order?.length ?? children.length;
  let next: DecoratableNode[] | undefined;
  let cursor = 0;
  const active: NormalizedRange[] = [];

  // Skip straight to the first block the earliest range can reach. Unordered
  // trees fall back to a full sweep, since a sorted index list makes the
  // search valid only over positioned nodes.
  let slot =
    order === undefined
      ? firstSlotEndingAfter(children, order, length, ranges[0].start)
      : 0;

  for (; slot < length; slot++) {
    // Once every range has been admitted and retired, no later span can
    // match: the rest of the document is left untouched.
    if (cursor >= ranges.length && active.length === 0) {
      break;
    }
    const index = order?.[slot] ?? slot;
    const child = children[index];
    const start = spanStart(child.position);
    if (start < 0) {
      continue;
    }
    const end = child.position?.end.offset as number;
    while (cursor < ranges.length && ranges[cursor].start < end) {
      active.push(ranges[cursor++]);
    }
    // Retire in place: spans are visited in ascending start order, so a range
    // that ended before this one starts cannot match any later span either.
    let kept = 0;
    for (let active_slot = 0; active_slot < active.length; active_slot++) {
      if (active[active_slot].end > start) {
        active[kept++] = active[active_slot];
      }
    }
    active.length = kept;
    if (kept === 0) {
      // No range reaches this block. When the next range starts beyond this
      // block, jump to the first block it can reach rather than walking the
      // gap between; when it starts inside this one the next block is
      // already the answer and searching for it would cost more than
      // stepping to it.
      if (
        order === undefined &&
        cursor < ranges.length &&
        ranges[cursor].start > end
      ) {
        const jump = firstSlotEndingAfter(
          children,
          order,
          length,
          ranges[cursor].start,
        );
        if (jump > slot) {
          slot = jump - 1;
        }
      }
      continue;
    }
    const decorated = decorateNode(child, active, state);
    if (decorated === child) {
      continue;
    }
    next ??= children.slice();
    next[index] = decorated;
  }
  return next ?? children;
}

/**
 * Decorates one node every range in `ranges` already overlaps. Decoration
 * stops at the outermost positioned node, so a range never records itself
 * twice down one branch.
 */
function decorateNode(
  node: DecoratableNode,
  ranges: ReadonlyArray<NormalizedRange>,
  state: RunState,
): DecoratableNode {
  // Extension nodes belong to the plugin that produced them; their data is
  // part of their identity, so decoration never touches them.
  if (node.type === 'extension') {
    return node;
  }
  const data = mergeDecorations(
    node,
    ranges.map(range => range.entry),
    state,
  );
  return data === undefined ? node : {...node, data};
}

/**
 * Compiles validated source ranges into an immutable transform that records
 * non-semantic presentation metadata on the Core-authored nodes those ranges
 * overlap.
 *
 * A node is decorated only when the parser authored its source position and
 * the range overlaps its span, so the helper never changes AST meaning,
 * rendered output, copyable text, accessible names, focus order, navigation,
 * or source provenance. Core authors positions on top-level blocks, so a
 * range decorates every block it touches, whatever order those blocks sit in
 * after earlier transforms.
 *
 * Decorations describe settled source, so they appear on the final snapshot
 * of a streaming document rather than on its partial chunks: a partial
 * block's extent is still changing, and exposing decorations from it would
 * let one appear and then vanish. Exposure is therefore monotone — never
 * present, then absent.
 *
 * Decorations are stored in one Core-owned versioned envelope and read back
 * with `getMarkdownSourceDecorations`; data the helper does not own is never
 * merged into or overwritten.
 *
 * @example
 * ```
 * const reviewHits = createMarkdownPlugin({
 *   name: 'review-hits',
 *   apiVersion: 1,
 *   transform: createMarkdownSourceDecoration({
 *     name: 'review-hit',
 *     ranges: [{start: 0, end: 12, data: {reviewer: 'ada'}}],
 *   }),
 * });
 * ```
 */
export function createMarkdownSourceDecoration(
  options: MarkdownSourceDecorationOptions,
): MarkdownTransform<never> {
  if (typeof options.name !== 'string' || options.name.trim() === '') {
    fail('name must be a non-empty string');
  }
  if (!Array.isArray(options.ranges)) {
    fail('ranges must be an array');
  }
  const ranges = normalizeRanges(options.name, options.ranges);
  const smallestStart = ranges.length === 0 ? -1 : ranges[0].start;

  const transform: MarkdownTransform<never> = (document, context) => {
    // Decorations describe settled source. While a document streams, the
    // block a range falls in can still be re-parsed, re-split, merged into a
    // table or list, or withheld entirely, so a range's covering block is not
    // stable and a decoration computed from it could appear, vanish, and
    // reappear across chunks. Waiting for the settled snapshot makes exposure
    // monotone by construction: absent while the source can still change,
    // then present once it cannot.
    if (!context.isFinal || ranges.length === 0) {
      return document;
    }
    // A range starting at or past the end of the source overlaps nothing.
    const usable =
      ranges[ranges.length - 1].start < context.source.length
        ? ranges
        : ranges.filter(range => range.start < context.source.length);
    if (usable.length === 0) {
      return document;
    }
    const root = document as unknown as DecoratableNode;
    if (root.children == null) {
      return document;
    }
    const state: RunState = {
      report: message => context.report(message),
      hasReported: false,
    };
    const children = decorateChildren(root.children, usable, state);
    return children === root.children
      ? document
      : ({
          ...document,
          children,
        } as unknown as MarkdownAstRoot<MarkdownExtensionNode>);
  };

  // Every node this helper emits is built here, from ranges validated above:
  // it inserts no caller-supplied node and changes no existing node's meaning,
  // provenance, or ownership. Core may therefore skip the validation and
  // freezing it applies to plugin-authored output.
  return markMarkdownTransformTrusted(
    markMarkdownTransformClaim(
      transform,
      source => smallestStart >= 0 && source.length > smallestStart,
    ),
  );
}

/**
 * Reads the decorations a source-decoration helper recorded on a node.
 * Returns an empty list for undecorated nodes and for any value that is not
 * a current Core-owned decoration envelope.
 */
export function getMarkdownSourceDecorations(
  node: MarkdownAstNodeBase,
): ReadonlyArray<MarkdownSourceDecoration> {
  const entries = existingEntries(node.data);
  // `existingEntries` returns entries only from a branded envelope whose
  // every member passed `isDecorationEntry`, so each one has a string name.
  return entries == null || entries.length === 0
    ? NO_DECORATIONS
    : (entries as unknown as ReadonlyArray<MarkdownSourceDecoration>);
}
