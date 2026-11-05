// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file semanticFence.ts
 * @input Declared fenced-code languages and typed extension-node factories
 * @output Immutable Markdown transform that annotates eligible canonical code nodes
 * @position Optional helper layer compiled onto the core transform protocol
 */

import type {
  MarkdownAstBlockContent,
  MarkdownAstCode,
  MarkdownAstListItem,
  MarkdownAstPosition,
} from '../ast';
import {
  getMarkdownHelperOwnership,
  markMarkdownTransformClaim,
  markMarkdownTransformTrusted,
  type MarkdownExtensionNode,
  type MarkdownPluginData,
  type MarkdownTransform,
  type MarkdownTransformContext,
} from './protocol';

export interface MarkdownFenceContext<Language extends string> {
  readonly code: string;
  readonly language: Language;
  readonly meta?: string;
}

export type MarkdownFenceNode<Node extends MarkdownExtensionNode> = Node & {
  readonly type: 'extension';
  readonly display: 'block';
  readonly position?: never;
  readonly source?: never;
};

export interface MarkdownFenceTransformOptions<
  Languages extends readonly [string, ...string[]],
  Node extends MarkdownExtensionNode<
    string,
    string,
    MarkdownPluginData,
    'block'
  >,
> {
  /** Exact, case-sensitive fenced-code language identifiers this helper owns. */
  readonly languages: Languages;
  /**
   * Creates typed semantic data for an eligible fence. Return null or undefined
   * to retain Markdown's ordinary CodeBlock rendering.
   */
  readonly createNode: (
    context: MarkdownFenceContext<Languages[number]>,
  ) => MarkdownFenceNode<Node> | null | undefined;
}

interface MarkdownFenceProposal {
  readonly node: MarkdownExtensionNode<
    string,
    string,
    MarkdownPluginData,
    'block'
  >;
}

const markdownFenceProposal = Symbol('MarkdownFenceProposal');

type FenceCode = MarkdownAstCode & {
  readonly [markdownFenceProposal]?: MarkdownFenceProposal;
};

/** @internal Returns the first transform-owned proposal attached to a code node. */
export function getMarkdownFenceProposal(
  node: MarkdownAstCode,
): MarkdownFenceProposal | undefined {
  return (node as FenceCode)[markdownFenceProposal];
}

function cloneNestedPluginData(
  value: unknown,
  parent: object,
  ancestors: ReadonlySet<object> | undefined,
): MarkdownPluginData {
  if (value == null || typeof value !== 'object') {
    return clonePluginData(value, ancestors);
  }
  const nestedAncestors = new Set(ancestors);
  nestedAncestors.add(parent);
  return clonePluginData(value, nestedAncestors);
}

function clonePluginData(
  value: unknown,
  ancestors?: ReadonlySet<object>,
): MarkdownPluginData {
  if (
    value == null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value as MarkdownPluginData;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('invalid plugin data');
    }
    return value;
  }
  if (
    typeof value !== 'object' ||
    ancestors?.has(value) === true ||
    (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
  ) {
    throw new TypeError('invalid plugin data');
  }
  let clone: MarkdownPluginData;
  if (Array.isArray(value)) {
    const items = new Array<MarkdownPluginData>(value.length);
    for (let index = 0; index < value.length; index++) {
      if (index in value) {
        items[index] = cloneNestedPluginData(value[index], value, ancestors);
      }
    }
    clone = Object.freeze(items);
  } else {
    const record: Record<string, MarkdownPluginData> = {};
    for (const key in value) {
      const nested = cloneNestedPluginData(
        (value as Record<string, unknown>)[key],
        value,
        ancestors,
      );
      if (key === '__proto__') {
        Object.defineProperty(record, key, {
          configurable: true,
          enumerable: true,
          value: nested,
          writable: true,
        });
      } else {
        record[key] = nested;
      }
    }
    clone = Object.freeze(record);
  }
  return clone;
}

function createProposal(
  node: MarkdownFenceNode<
    MarkdownExtensionNode<string, string, MarkdownPluginData, 'block'>
  >,
  pluginName: string,
  hasRenderer: (nodeName: string) => boolean,
  sourceLines: MarkdownAstPosition | undefined,
): MarkdownFenceProposal {
  if (
    node == null ||
    typeof node !== 'object' ||
    node.type !== 'extension' ||
    node.plugin !== pluginName ||
    typeof node.name !== 'string' ||
    node.name.trim() === '' ||
    // Every extension node must have a renderer and a text projection
    // (FR14). Checking it here is what lets Core run this helper on its
    // trusted path: the node is fully validated before it is inserted.
    !hasRenderer(node.name) ||
    node.display !== 'block' ||
    'source' in node ||
    'position' in node
  ) {
    throw new TypeError(
      'Markdown fence createNode must return an owned block extension node with finite data and a registered renderer',
    );
  }

  let data: MarkdownPluginData;
  try {
    data = clonePluginData(node.data);
  } catch {
    throw new TypeError(
      'Markdown fence createNode must return an owned block extension node with finite data and a registered renderer',
    );
  }
  return Object.freeze({
    node: Object.freeze({
      type: 'extension' as const,
      plugin: node.plugin,
      name: node.name,
      display: 'block' as const,
      data,
      // The fence's Core-authored source lines, recorded only while the
      // source-lines plugin is installed (module:Markdown/sourceLines FR5).
      ...(sourceLines == null ? null : {position: sourceLines}),
    }),
  });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function consumeInvalidAsyncNode(
  value: PromiseLike<unknown>,
  report: (message: string) => void,
): void {
  void Promise.resolve(value).then(
    () => report('Markdown fence createNode returned a Promise'),
    () => report('Markdown fence createNode Promise rejected'),
  );
}

function annotateCode(
  node: MarkdownAstCode,
  languages: ReadonlySet<string>,
  pluginName: string,
  hasRenderer: (nodeName: string) => boolean,
  createNode: (
    context: MarkdownFenceContext<string>,
  ) =>
    | MarkdownFenceNode<
        MarkdownExtensionNode<string, string, MarkdownPluginData, 'block'>
      >
    | null
    | undefined,
  report: (message: string) => void,
): MarkdownAstCode {
  if (
    node.lang == null ||
    !languages.has(node.lang) ||
    getMarkdownFenceProposal(node) != null
  ) {
    return node;
  }

  const proposalNode = createNode(
    Object.freeze({
      code: node.value,
      language: node.lang,
      ...(node.meta == null ? {} : {meta: node.meta}),
    }),
  );
  if (isPromiseLike(proposalNode)) {
    consumeInvalidAsyncNode(proposalNode, report);
    throw new TypeError('Markdown fence createNode must be synchronous');
  }
  if (proposalNode == null) {
    return node;
  }

  const annotated = {...node};
  Object.defineProperty(annotated, markdownFenceProposal, {
    configurable: false,
    enumerable: true,
    value: createProposal(
      proposalNode,
      pluginName,
      hasRenderer,
      node.position?.start.line == null ? undefined : node.position,
    ),
    writable: false,
  });
  return annotated;
}

function transformBlocks(
  blocks: ReadonlyArray<MarkdownAstBlockContent<MarkdownExtensionNode>>,
  languages: ReadonlySet<string>,
  pluginName: string,
  hasRenderer: (nodeName: string) => boolean,
  createNode: (
    context: MarkdownFenceContext<string>,
  ) =>
    | MarkdownFenceNode<
        MarkdownExtensionNode<string, string, MarkdownPluginData, 'block'>
      >
    | null
    | undefined,
  report: (message: string) => void,
): ReadonlyArray<MarkdownAstBlockContent<MarkdownExtensionNode>> {
  let next: MarkdownAstBlockContent<MarkdownExtensionNode>[] | undefined;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    let replacement: MarkdownAstBlockContent<MarkdownExtensionNode>;
    switch (block.type) {
      case 'code':
        replacement = annotateCode(
          block,
          languages,
          pluginName,
          hasRenderer,
          createNode,
          report,
        );
        break;
      case 'blockquote': {
        const children = transformBlocks(
          block.children,
          languages,
          pluginName,
          hasRenderer,
          createNode,
          report,
        );
        replacement =
          children === block.children ? block : {...block, children};
        break;
      }
      case 'list': {
        let items: MarkdownAstListItem<MarkdownExtensionNode>[] | undefined;
        for (
          let itemIndex = 0;
          itemIndex < block.children.length;
          itemIndex++
        ) {
          const item = block.children[itemIndex];
          const itemChildren = transformBlocks(
            item.children,
            languages,
            pluginName,
            hasRenderer,
            createNode,
            report,
          );
          if (itemChildren === item.children) {
            items?.push(item);
            continue;
          }
          items ??= block.children.slice(0, itemIndex);
          items.push({...item, children: itemChildren});
        }
        replacement = items == null ? block : {...block, children: items};
        break;
      }
      case 'heading':
      case 'paragraph':
      case 'math':
      case 'table':
      case 'thematicBreak':
      case 'image':
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

export function createMarkdownFenceTransform<
  const Languages extends readonly [string, ...string[]],
  const Node extends MarkdownExtensionNode<
    string,
    string,
    MarkdownPluginData,
    'block'
  >,
>(
  options: MarkdownFenceTransformOptions<Languages, Node>,
): MarkdownTransform<Node> {
  if (
    !Array.isArray(options.languages) ||
    options.languages.length === 0 ||
    options.languages.some(
      language => typeof language !== 'string' || language.trim() === '',
    )
  ) {
    throw new TypeError('Markdown fence languages must be non-empty strings');
  }
  if (new Set(options.languages).size !== options.languages.length) {
    throw new TypeError('Markdown fence languages must be unique');
  }
  if (typeof options.createNode !== 'function') {
    throw new TypeError('Markdown fence createNode must be a function');
  }

  const declaredLanguages = Object.freeze([...options.languages]);
  const languages = new Set<string>(declaredLanguages);
  const sourceNeedles = Object.freeze(
    declaredLanguages.flatMap(language => [
      `\`\`\`${language}`,
      `~~~${language}`,
    ]),
  );
  const createNode = options.createNode as (
    context: MarkdownFenceContext<string>,
  ) =>
    | MarkdownFenceNode<
        MarkdownExtensionNode<string, string, MarkdownPluginData, 'block'>
      >
    | null
    | undefined;
  const transform: MarkdownTransform<Node> = (
    root,
    context: MarkdownTransformContext,
  ) => {
    const ownership = getMarkdownHelperOwnership(context);
    if (ownership == null) {
      throw new TypeError(
        'Markdown fence transforms must run through createMarkdownPlugin',
      );
    }
    const children = transformBlocks(
      root.children,
      languages,
      ownership.pluginName,
      ownership.hasRenderer,
      createNode,
      context.report,
    );
    return children === root.children ? root : {...root, children};
  };

  // Every node this helper inserts is validated above against the same
  // rules Core applies to plugin-authored output — owned plugin name,
  // registered renderer, representable frozen data, no authored provenance
  // — and nothing else in the tree is touched. Core may therefore skip
  // revalidating the whole document after it runs.
  return markMarkdownTransformTrusted(
    markMarkdownTransformClaim(transform, source =>
      sourceNeedles.some(needle => source.includes(needle)),
    ) as MarkdownTransform<never>,
  );
}
