// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textTransform.ts
 * @input Regex selectors and replacement callbacks for eligible Markdown prose
 * @output Immutable Markdown transforms with protected-context traversal
 * @position Optional helper layer compiled onto the core transform protocol
 */

import type {
  MarkdownAstBlockContent,
  MarkdownAstListItem,
  MarkdownAstPhrasingContent,
  MarkdownAstTableCell,
  MarkdownAstTableRow,
} from '../ast';
import {
  getMarkdownHelperOwnership,
  adoptMarkdownHelperNode,
  adoptMarkdownHelperNodes,
  markMarkdownTransformClaim,
  markMarkdownTransformTrusted,
  type MarkdownExtensionNode,
  type MarkdownHelperOwnership,
  type MarkdownTransform,
} from './protocol';

/**
 * Ownership for a transform invoked outside Core's pipeline. It owns no
 * plugin name and no renderer, so a callback's extension node is rejected
 * while ordinary phrasing still works.
 */
const UNOWNED: MarkdownHelperOwnership = Object.freeze({
  pluginName: '\u0000unowned',
  hasRenderer: () => false,
  sourceUnchanged: false,
});

export interface MarkdownTextTransformContext {
  readonly parentType:
    'heading' | 'paragraph' | 'strong' | 'emphasis' | 'delete' | 'tableCell';
}

export interface MarkdownTextTransformOptions<
  Node extends MarkdownExtensionNode = never,
> {
  /** Global expression matched against eligible built-in prose only. */
  readonly pattern: RegExp;
  /**
   * Literal substrings such that source containing an eligible match contains
   * at least one. Core uses them to skip the transform without walking the AST
   * when none are present. Omit this optimization when no conservative literal
   * exists; the helper will inspect eligible prose on every run. This fast path
   * is also disabled for case-insensitive patterns so JavaScript case folding
   * remains exact.
   */
  readonly requiredSubstrings?: readonly [string, ...string[]];
  /** Optionally decline or extend a regex claim. */
  readonly getEndIndex?: (
    text: string,
    match: RegExpExecArray,
  ) => number | false;
  replace(
    match: RegExpExecArray,
    context: MarkdownTextTransformContext,
  ):
    | MarkdownAstPhrasingContent<Node>
    | ReadonlyArray<MarkdownAstPhrasingContent<Node>>;
}

/**
 * Replacement nodes already placed in a document by this helper.
 *
 * A callback that builds a node per match hands over a fresh object, and
 * that object can go straight into the tree — copying it would allocate a
 * second one for nothing, and it is validated and frozen on the way in
 * either way. A callback that returns the SAME object for several matches
 * is the case that needs a copy: one object cannot occupy two positions in
 * a tree, and a node already frozen into an earlier position must not be
 * reused for a later one. Weak, so remembering a node never keeps it alive.
 */
const adoptedReplacements = new WeakSet<object>();

/** One reusable expression per transform invocation. */
interface Scanner {
  readonly pattern: RegExp;
  busy: boolean;
}

type AnyExtension = MarkdownExtensionNode;
type Phrasing = MarkdownAstPhrasingContent<AnyExtension>;
type Block = MarkdownAstBlockContent<AnyExtension>;

/**
 * Copies a caller's node away from them. The cycle-tracking map is allocated
 * only once a nested object actually appears: the overwhelmingly common
 * replacement is a flat node of primitives, and this runs once per match.
 */
function cloneReplacement<T>(value: T, seen?: Map<object, unknown>): T {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  const cached = seen?.get(value);
  if (cached != null) {
    return cached as T;
  }
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen ??= new Map<object, unknown>();
    seen.set(value, clone);
    for (const item of value) {
      clone.push(cloneReplacement(item, seen));
    }
    return clone as T;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }
  const clone: Record<string, unknown> = {};
  let tracked = seen;
  for (const key in value) {
    const nested = (value as Record<string, unknown>)[key];
    if (nested != null && typeof nested === 'object') {
      if (tracked === undefined) {
        tracked = new Map<object, unknown>();
        tracked.set(value, clone);
      }
      clone[key] = cloneReplacement(nested, tracked);
    } else {
      clone[key] = nested;
    }
  }
  return clone as T;
}

function advanceStringIndex(
  value: string,
  index: number,
  unicode: boolean,
): number {
  if (!unicode || index >= value.length) {
    return index + 1;
  }
  const first = value.charCodeAt(index);
  if (first < 0xd800 || first > 0xdbff || index + 1 >= value.length) {
    return index + 1;
  }
  const second = value.charCodeAt(index + 1);
  return second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1;
}

function replaceTextNode<Node extends MarkdownExtensionNode>(
  value: string,
  options: MarkdownTextTransformOptions<Node>,
  parentType: MarkdownTextTransformContext['parentType'],
  ownership: MarkdownHelperOwnership,
  scanner: Scanner,
): ReadonlyArray<Phrasing> | null {
  // The conservative substring hint decides per text node, not just per
  // document: source without one cannot contain an eligible match, so most
  // prose is skipped before any scanning happens.
  // Disabled for case-insensitive patterns, exactly as the document-level
  // claim is, so JavaScript case folding stays the only authority.
  const required = options.pattern.ignoreCase
    ? undefined
    : options.requiredSubstrings;
  if (required != null && !required.some(hint => value.includes(hint))) {
    return null;
  }
  // One expression per transform invocation rather than one per text node.
  // A `replace` callback that re-enters this helper gets its own, so a
  // nested scan can never disturb the outer one's `lastIndex`.
  const pattern = scanner.busy
    ? new RegExp(options.pattern.source, options.pattern.flags)
    : scanner.pattern;
  const reentrant = pattern !== scanner.pattern;
  if (!reentrant) {
    scanner.busy = true;
  }
  pattern.lastIndex = 0;
  const output: Phrasing[] = [];
  let cursor = 0;
  let changed = false;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) != null) {
    const start = match.index;
    const defaultEnd = start + match[0].length;
    const resolvedEnd = options.getEndIndex?.(value, match) ?? defaultEnd;
    if (resolvedEnd === false) {
      if (match[0].length === 0) {
        pattern.lastIndex = advanceStringIndex(
          value,
          pattern.lastIndex,
          pattern.unicode || pattern.flags.includes('v'),
        );
      }
      continue;
    }
    if (
      !Number.isInteger(resolvedEnd) ||
      resolvedEnd < defaultEnd ||
      resolvedEnd < start ||
      resolvedEnd > value.length
    ) {
      throw new TypeError(
        'Markdown text transform returned an invalid end index',
      );
    }
    if (start < cursor) {
      continue;
    }
    if (start > cursor) {
      output.push({type: 'text', value: value.slice(cursor, start)});
    }
    const replacement = options.replace(match, {parentType});
    // The callback's nodes are the only untrusted structure this helper can
    // introduce. Each one is checked here under the same rules Core applies
    // to newly-introduced nodes — representable data, no authored
    // provenance, no foreign extension ownership, no cycles — and frozen,
    // so the tree this transform returns needs no further checking. A node
    // the callback has handed over before is copied first; a fresh one is
    // adopted as it stands.
    if (Array.isArray(replacement)) {
      const adopted: Phrasing[] = [];
      for (const replacementNode of replacement) {
        adopted.push(
          adoptedReplacements.has(replacementNode)
            ? cloneReplacement(replacementNode)
            : replacementNode,
        );
      }
      adoptMarkdownHelperNodes(adopted, ownership);
      for (const node of adopted) {
        adoptedReplacements.add(node);
      }
      output.push(...adopted);
    } else {
      // One node is the overwhelmingly common reply, and it is worth its
      // own path: wrapping it in an array to share the loop above would
      // allocate twice per match, which on a large document is the
      // helper's dominant garbage.
      const single = replacement as Phrasing;
      const adopted = adoptedReplacements.has(single)
        ? cloneReplacement(single)
        : single;
      adoptMarkdownHelperNode(adopted, ownership);
      adoptedReplacements.add(adopted);
      output.push(adopted);
    }
    cursor = resolvedEnd;
    pattern.lastIndex =
      resolvedEnd === start
        ? advanceStringIndex(
            value,
            pattern.lastIndex,
            pattern.unicode || pattern.flags.includes('v'),
          )
        : Math.max(pattern.lastIndex, resolvedEnd);
    changed = true;
  }

  if (!reentrant) {
    scanner.busy = false;
  }
  if (!changed) {
    return null;
  }
  if (cursor < value.length) {
    output.push({type: 'text', value: value.slice(cursor)});
  }
  return output;
}

function transformPhrasing<Node extends MarkdownExtensionNode>(
  children: ReadonlyArray<Phrasing>,
  options: MarkdownTextTransformOptions<Node>,
  parentType: MarkdownTextTransformContext['parentType'],
  ownership: MarkdownHelperOwnership,
  scanner: Scanner,
): ReadonlyArray<Phrasing> {
  // Lazy rebuild: unchanged phrasing is returned as-is, so prose with no
  // match costs one walk and no allocation. Only the first change copies.
  let next: Phrasing[] | undefined;
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if (node.type === 'text') {
      const replaced = replaceTextNode(
        node.value,
        options,
        parentType,
        ownership,
        scanner,
      );
      if (replaced == null) {
        next?.push(node);
        continue;
      }
      next ??= children.slice(0, index);
      for (const replacement of replaced) {
        next.push(replacement);
      }
      continue;
    }
    if (
      node.type === 'strong' ||
      node.type === 'emphasis' ||
      node.type === 'delete'
    ) {
      const nested = transformPhrasing(
        node.children,
        options,
        node.type,
        ownership,
        scanner,
      );
      if (nested === node.children) {
        next?.push(node);
        continue;
      }
      next ??= children.slice(0, index);
      next.push({...node, children: nested});
      continue;
    }
    // Links, images, code, math, citations, breaks, and accepted extension
    // syntax are protected contexts owned by their existing semantics.
    next?.push(node);
  }
  return next ?? children;
}

function blockMayContainRequiredSource<Node extends MarkdownExtensionNode>(
  block: Block,
  source: string | undefined,
  options: MarkdownTextTransformOptions<Node>,
): boolean {
  const required = options.requiredSubstrings;
  if (source === undefined || required === undefined) {
    return true;
  }
  const start = block.position?.start.offset;
  const end = block.position?.end.offset;
  if (typeof start !== 'number' || typeof end !== 'number') {
    return true;
  }
  for (const hint of required) {
    const match = source.indexOf(hint, start);
    if (match >= 0 && match < end) {
      return true;
    }
  }
  return false;
}

function transformBlocks<Node extends MarkdownExtensionNode>(
  blocks: ReadonlyArray<Block>,
  options: MarkdownTextTransformOptions<Node>,
  ownership: MarkdownHelperOwnership,
  scanner: Scanner,
  source: string | undefined,
): ReadonlyArray<Block> {
  // Lazy rebuild, matching transformPhrasing: a block list with no match is
  // returned unchanged and allocates nothing.
  let next: Block[] | undefined;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (!blockMayContainRequiredSource(block, source, options)) {
      next?.push(block);
      continue;
    }
    let replacement: Block;
    switch (block.type) {
      case 'heading':
      case 'paragraph': {
        const children = transformPhrasing(
          block.children,
          options,
          block.type,
          ownership,
          scanner,
        );
        replacement =
          children === block.children ? block : {...block, children};
        break;
      }
      case 'blockquote': {
        const children = transformBlocks(
          block.children,
          options,
          ownership,
          scanner,
          source,
        );
        replacement =
          children === block.children ? block : {...block, children};
        break;
      }
      case 'list': {
        let items: MarkdownAstListItem<AnyExtension>[] | undefined;
        for (
          let item_index = 0;
          item_index < block.children.length;
          item_index++
        ) {
          const item = block.children[item_index];
          const itemChildren = transformBlocks(
            item.children,
            options,
            ownership,
            scanner,
            source,
          );
          if (itemChildren === item.children) {
            items?.push(item);
            continue;
          }
          items ??= block.children.slice(0, item_index);
          items.push({...item, children: itemChildren});
        }
        replacement = items == null ? block : {...block, children: items};
        break;
      }
      case 'table': {
        let rows: MarkdownAstTableRow<AnyExtension>[] | undefined;
        for (
          let row_index = 0;
          row_index < block.children.length;
          row_index++
        ) {
          const row = block.children[row_index];
          let cells: MarkdownAstTableCell<AnyExtension>[] | undefined;
          for (
            let cell_index = 0;
            cell_index < row.children.length;
            cell_index++
          ) {
            const cell = row.children[cell_index];
            const cellChildren = transformPhrasing(
              cell.children,
              options,
              'tableCell',
              ownership,
              scanner,
            );
            if (cellChildren === cell.children) {
              cells?.push(cell);
              continue;
            }
            cells ??= row.children.slice(0, cell_index);
            cells.push({...cell, children: cellChildren});
          }
          if (cells == null) {
            rows?.push(row);
            continue;
          }
          rows ??= block.children.slice(0, row_index);
          rows.push({...row, children: cells});
        }
        replacement = rows == null ? block : {...block, children: rows};
        break;
      }
      case 'code':
      case 'math':
      case 'image':
      case 'thematicBreak':
      case 'extension':
        replacement = block;
        break;
    }
    if (next === undefined && replacement !== block) {
      next = blocks.slice(0, index);
    }
    next?.push(replacement);
  }
  return next ?? blocks;
}

export function createMarkdownTextTransform(
  options: MarkdownTextTransformOptions<never>,
): MarkdownTransform<never>;
export function createMarkdownTextTransform<Node extends MarkdownExtensionNode>(
  options: MarkdownTextTransformOptions<Node>,
): MarkdownTransform<Node>;
export function createMarkdownTextTransform(
  options: MarkdownTextTransformOptions<MarkdownExtensionNode>,
): MarkdownTransform<MarkdownExtensionNode> {
  if (!options.pattern.global) {
    throw new TypeError(
      'Markdown text transform patterns must use the global flag',
    );
  }
  if (
    options.requiredSubstrings != null &&
    (!Array.isArray(options.requiredSubstrings) ||
      options.requiredSubstrings.length === 0 ||
      options.requiredSubstrings.some(
        value => typeof value !== 'string' || value === '',
      ))
  ) {
    throw new TypeError(
      'Markdown text transform requiredSubstrings must be non-empty strings',
    );
  }
  const requiredSubstrings =
    options.requiredSubstrings == null
      ? undefined
      : (Object.freeze([...options.requiredSubstrings]) as readonly [
          string,
          ...string[],
        ]);
  const normalizedOptions: MarkdownTextTransformOptions<MarkdownExtensionNode> =
    Object.freeze({
      pattern: new RegExp(options.pattern.source, options.pattern.flags),
      requiredSubstrings,
      getEndIndex: options.getEndIndex,
      replace: options.replace,
    });
  const transform: MarkdownTransform<MarkdownExtensionNode> = (
    root,
    context,
  ) => {
    const ownership = getMarkdownHelperOwnership(context) ?? UNOWNED;
    const children = transformBlocks(
      root.children,
      normalizedOptions,
      ownership,
      {
        pattern: new RegExp(
          normalizedOptions.pattern.source,
          normalizedOptions.pattern.flags,
        ),
        busy: false,
      },
      ownership.sourceUnchanged &&
        requiredSubstrings != null &&
        !normalizedOptions.pattern.ignoreCase
        ? context.source
        : undefined,
    );
    return children === root.children ? root : {...root, children};
  };
  // Every node this helper returns is either one Core already validated or
  // one `replaceTextNode` just validated against the same rules, so Core may
  // run it on the trusted path.
  const trusted = markMarkdownTransformTrusted(
    transform as MarkdownTransform<never>,
  ) as MarkdownTransform<MarkdownExtensionNode>;
  if (requiredSubstrings == null || options.pattern.ignoreCase) {
    return trusted;
  }
  return markMarkdownTransformClaim(trusted, source =>
    requiredSubstrings.some(required => source.includes(required)),
  );
}
