// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file protocol.ts
 * @input Markdown plugin definitions, syntax tokenizers, immutable transforms, and renderers
 * @output Public plugin protocol plus validated internal preparation and execution
 * @position Shared Markdown extension boundary consumed by the parser and renderer
 */

import type React from 'react';
import {devError, warnOnce} from '../../utils/devWarning';
import {isSafeMarkdownParserUrl} from '../url';
import type {
  MarkdownAstDataValue,
  MarkdownAstExtensionNode,
  MarkdownAstNodeBase,
  MarkdownAstPosition,
  MarkdownAstRoot,
} from '../ast';

export type MarkdownPluginData = MarkdownAstDataValue;

export type MarkdownExtensionNode<
  PluginName extends string = string,
  NodeName extends string = string,
  Data extends MarkdownPluginData = MarkdownPluginData,
  Display extends 'inline' | 'block' = 'inline' | 'block',
> = MarkdownAstExtensionNode<PluginName, NodeName, Data, Display>;

export function isMarkdownExtensionNode<Node extends MarkdownExtensionNode>(
  node: MarkdownAstNodeBase & {readonly type: string},
  plugin: Node['plugin'],
  name: Node['name'],
): node is Node {
  return (
    node.type === 'extension' &&
    (node as MarkdownExtensionNode).plugin === plugin &&
    (node as MarkdownExtensionNode).name === name
  );
}

export interface MarkdownTokenizerInput {
  readonly source: string;
  /** UTF-16 offset into `source`. */
  readonly offset: number;
  /** Exclusive UTF-16 bound visible to this tokenizer. */
  readonly end: number;
  readonly isFinal: boolean;
  readonly context: 'inline' | 'block';
  readonly lineStart: number;
  readonly column: number;
}

type ExtensionNodeWithoutProvenance<Node extends MarkdownExtensionNode> = Omit<
  Node,
  'source' | 'position'
>;

export type MarkdownTokenizeResult<Node extends MarkdownExtensionNode> =
  | {readonly status: 'no-match'}
  | {readonly status: 'defer'}
  | {
      readonly status: 'match';
      readonly end: number;
      readonly node: ExtensionNodeWithoutProvenance<Node>;
    };

export interface MarkdownSyntaxContribution<
  Node extends MarkdownExtensionNode = MarkdownExtensionNode,
> {
  readonly startsWith: readonly [string, ...string[]];
  /** Maximum UTF-16 span Core exposes from a candidate offset. */
  readonly maxSpan: number;
  tokenize(input: MarkdownTokenizerInput): MarkdownTokenizeResult<Node>;
}

type ExtensionForDisplay<
  Node extends MarkdownExtensionNode,
  Display extends 'inline' | 'block',
> = Display extends Node['display']
  ? Node & {readonly display: Display}
  : never;

export interface MarkdownSyntaxCapability<
  Node extends MarkdownExtensionNode = MarkdownExtensionNode,
> {
  readonly inline?: readonly [
    MarkdownSyntaxContribution<ExtensionForDisplay<Node, 'inline'>>,
    ...MarkdownSyntaxContribution<ExtensionForDisplay<Node, 'inline'>>[],
  ];
  readonly block?: readonly [
    MarkdownSyntaxContribution<ExtensionForDisplay<Node, 'block'>>,
    ...MarkdownSyntaxContribution<ExtensionForDisplay<Node, 'block'>>[],
  ];
}

export interface MarkdownTransformContext {
  readonly source: string;
  readonly isFinal: boolean;
  readonly display: 'inline' | 'block';
  report(message: string): void;
}

const markdownTransformPluginName = Symbol('MarkdownTransformPluginName');
const markdownTransformHasRenderer = Symbol('MarkdownTransformHasRenderer');
const markdownTransformSourceUnchanged = Symbol(
  'MarkdownTransformSourceUnchanged',
);

type InternalMarkdownTransformContext = MarkdownTransformContext & {
  readonly [markdownTransformPluginName]: string;
  readonly [markdownTransformHasRenderer]: (nodeName: string) => boolean;
  readonly [markdownTransformSourceUnchanged]: boolean;
};

/** @internal Reads the owning plugin name without expanding the public context. */
export function getMarkdownTransformPluginName(
  context: MarkdownTransformContext,
): string | undefined {
  return (context as Partial<InternalMarkdownTransformContext>)[
    markdownTransformPluginName
  ];
}

/**
 * @internal The ownership facts a Core helper needs to validate the nodes a
 * caller's callback handed it, without seeing the rest of the pipeline.
 */
export interface MarkdownHelperOwnership {
  readonly pluginName: string;
  readonly hasRenderer: (nodeName: string) => boolean;
  /** Whether source text still describes the current transform input. */
  readonly sourceUnchanged: boolean;
}

/** @internal Reads this transform's ownership, when Core is running it. */
export function getMarkdownHelperOwnership(
  context: MarkdownTransformContext,
): MarkdownHelperOwnership | undefined {
  const internal = context as Partial<InternalMarkdownTransformContext>;
  const pluginName = internal[markdownTransformPluginName];
  const hasRenderer = internal[markdownTransformHasRenderer];
  const sourceUnchanged = internal[markdownTransformSourceUnchanged];
  return pluginName === undefined ||
    hasRenderer === undefined ||
    sourceUnchanged === undefined
    ? undefined
    : {pluginName, hasRenderer, sourceUnchanged};
}

declare const markdownTransformNode: unique symbol;

export interface MarkdownTransform<Node extends MarkdownExtensionNode = never> {
  (
    document: MarkdownAstRoot<MarkdownExtensionNode>,
    context: MarkdownTransformContext,
  ): MarkdownAstRoot<MarkdownExtensionNode>;
  readonly [markdownTransformNode]?: Node;
}

const markdownTransformClaim = Symbol('MarkdownTransformClaim');
/**
 * Definition key of the first-party source-lines plugin
 * (`module:Markdown/sourceLines`). It is a parse option, not syntax: the
 * plugin enters parse identity so the parser records block lines during the
 * parse it already runs, and no other entry can carry it.
 */
const markdownSourceLinesDefinition = Symbol('MarkdownSourceLines');
const markdownTransformTrusted = Symbol('MarkdownTransformTrusted');

interface ClaimAwareMarkdownTransform<
  Node extends MarkdownExtensionNode = MarkdownExtensionNode,
> extends MarkdownTransform<Node> {
  readonly [markdownTransformClaim]?: (source: string) => boolean;
}

interface TrustAwareMarkdownTransform extends MarkdownTransform<never> {
  readonly [markdownTransformTrusted]?: true;
}

/**
 * @internal Marks a Core-authored transform whose OUTPUT STRUCTURE is entirely
 * Core-computed — it never inserts a caller-supplied node, never edits an
 * existing node's meaning, provenance, or ownership, and never mutates its
 * input. Core then skips the validation and immutability guards it applies to
 * plugin-authored output, whose purpose is to contain untrusted structure.
 *
 * Only helpers in this package may be marked, and only when every node they
 * emit is built here from validated inputs. A helper that inserts anything the
 * caller supplied — the text helper's replacement nodes, for example — is NOT
 * trusted: Core must still validate the tree it returns.
 */
export function markMarkdownTransformTrusted(
  transform: MarkdownTransform<never>,
): MarkdownTransform<never> {
  Object.defineProperty(transform, markdownTransformTrusted, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return transform;
}

/** @internal Registers a cheap source-level claim check for a helper transform. */
export function markMarkdownTransformClaim<
  Node extends MarkdownExtensionNode = never,
>(
  transform: MarkdownTransform<Node>,
  claims: (source: string) => boolean,
): MarkdownTransform<Node> {
  Object.defineProperty(transform, markdownTransformClaim, {
    configurable: false,
    enumerable: false,
    value: claims,
    writable: false,
  });
  return transform;
}

export interface MarkdownExtensionRenderer<Node extends MarkdownExtensionNode> {
  /** Pure render callback. Hooks belong in components returned by this callback. */
  readonly render: (props: {node: Node}) => React.ReactNode;
  readonly toText: (node: Node) => string;
}

export type MarkdownExtensionRenderers<Node extends MarkdownExtensionNode> =
  Readonly<{
    [NodeName in Node['name']]: MarkdownExtensionRenderer<
      Extract<Node, {name: NodeName}>
    >;
  }>;

interface MarkdownPluginDefinitionBase<Name extends string> {
  readonly name: Name;
  readonly apiVersion: 1;
}

export interface MarkdownSyntaxPluginDefinition<
  Name extends string,
  Node extends MarkdownExtensionNode<Name>,
> extends MarkdownPluginDefinitionBase<Name> {
  readonly parseKey: string;
  readonly syntax: MarkdownSyntaxCapability<Node>;
  readonly transform?: MarkdownTransform<Node>;
  readonly renderers: MarkdownExtensionRenderers<Node>;
}

export type MarkdownTransformPluginDefinition<
  Name extends string,
  Node extends MarkdownExtensionNode<Name> = never,
> = MarkdownPluginDefinitionBase<Name> & {
  readonly transform: MarkdownTransform<Node>;
  readonly parseKey?: never;
  readonly syntax?: never;
} & ([Node] extends [never]
    ? {readonly renderers?: never}
    : {readonly renderers: MarkdownExtensionRenderers<Node>});

export type MarkdownPluginDefinition<
  Name extends string,
  Node extends MarkdownExtensionNode<Name> = never,
> =
  | MarkdownSyntaxPluginDefinition<Name, Node>
  | MarkdownTransformPluginDefinition<Name, Node>;

declare const markdownPluginNode: unique symbol;

/** Opaque, covariant entry safe to store in heterogeneous plugin lists. */
export interface MarkdownPluginEntry<
  Node extends MarkdownExtensionNode = MarkdownExtensionNode,
> {
  readonly name: string;
  readonly apiVersion: 1;
  readonly [markdownPluginNode]: Node;
}

export type MarkdownNodeOf<Entry> =
  Entry extends MarkdownPluginEntry<infer Node> ? Node : never;

export type MarkdownExtensionsOf<
  Plugins extends ReadonlyArray<MarkdownPluginEntry>,
> = MarkdownNodeOf<Plugins[number]>;

const MARKDOWN_PLUGIN_BRAND = '@astryxdesign/core/MarkdownPluginEntry';
const markdownPluginDefinition = Symbol.for(MARKDOWN_PLUGIN_BRAND);

interface MarkdownPluginBrand<
  Node extends MarkdownExtensionNode = MarkdownExtensionNode,
> {
  readonly kind: typeof MARKDOWN_PLUGIN_BRAND;
  readonly apiVersion: 1;
  readonly definition: MarkdownPluginDefinition<string, Node>;
}

interface InternalMarkdownPluginEntry<
  Node extends MarkdownExtensionNode = MarkdownExtensionNode,
> extends MarkdownPluginEntry<Node> {
  readonly [markdownPluginDefinition]: MarkdownPluginBrand<Node>;
}

/**
 * @internal Validates an opaque entry and returns its frozen definition for
 * first-party modules that carry their own Symbol.for-branded portable data.
 */
export function getMarkdownPluginDefinition(
  publicEntry: MarkdownPluginEntry,
): MarkdownPluginDefinition<string, MarkdownExtensionNode> {
  if (
    publicEntry == null ||
    typeof publicEntry !== 'object' ||
    Object.getPrototypeOf(publicEntry) !== Object.prototype
  ) {
    fail('entries must come from a compatible createMarkdownPlugin()');
  }
  const entry = publicEntry as Partial<InternalMarkdownPluginEntry>;
  const brand = entry[markdownPluginDefinition];
  const definition = brand?.definition;
  if (
    Reflect.ownKeys(entry).length !== 3 ||
    typeof entry.name !== 'string' ||
    entry.apiVersion !== 1 ||
    !Object.isFrozen(entry) ||
    brand == null ||
    typeof brand !== 'object' ||
    Object.getPrototypeOf(brand) !== Object.prototype ||
    Reflect.ownKeys(brand).length !== 3 ||
    !Object.isFrozen(brand) ||
    brand.kind !== MARKDOWN_PLUGIN_BRAND ||
    brand.apiVersion !== 1 ||
    definition == null ||
    typeof definition !== 'object' ||
    !Object.isFrozen(definition) ||
    definition.name !== entry.name ||
    definition.apiVersion !== entry.apiVersion
  ) {
    fail('entries must come from a compatible createMarkdownPlugin()');
  }
  return definition;
}

/** What a plugin declares, without the definition itself. */
export interface MarkdownPluginCapabilities {
  /** The plugin declares inline or block syntax. */
  readonly syntax: boolean;
  /** The plugin declares an immutable document transform. */
  readonly transform: boolean;
}

/**
 * Whether `plugin` declares syntax and whether it declares a transform, and
 * nothing else about it: the entry stays opaque. Throws, as every consumer of
 * an entry does, when `plugin` did not come from a compatible
 * `createMarkdownPlugin()`. Surfaces that adopt only some capabilities, as
 * the RichText surfaces do, read them here (spec:AST-064 FR4, DEC-6).
 */
export function getMarkdownPluginCapabilities(
  plugin: MarkdownPluginEntry,
): MarkdownPluginCapabilities {
  const definition = getMarkdownPluginDefinition(plugin);
  return Object.freeze({
    syntax: 'syntax' in definition && definition.syntax != null,
    transform: definition.transform != null,
  });
}

function deepFreezeConfig<T>(value: T, seen: Set<object> = new Set()): T {
  if (value != null && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const nested of Object.values(value)) {
      deepFreezeConfig(nested, seen);
    }
    Object.freeze(value);
  }
  return value;
}

function fail(message: string): never {
  throw new Error(`Markdown plugin: ${message}`);
}

function validateSyntax(
  pluginName: string,
  syntax: MarkdownSyntaxCapability,
): void {
  const contributions = [...(syntax.inline ?? []), ...(syntax.block ?? [])];
  if (contributions.length === 0) {
    fail(`"${pluginName}" syntax must declare an inline or block contribution`);
  }
  for (const contribution of contributions) {
    if (!Number.isFinite(contribution.maxSpan) || contribution.maxSpan <= 0) {
      fail(`"${pluginName}" syntax maxSpan must be positive and finite`);
    }
    for (const prefix of contribution.startsWith) {
      if (prefix === '' || prefix.length > contribution.maxSpan) {
        fail(`"${pluginName}" syntax prefixes must be non-empty and bounded`);
      }
    }
  }
}

export function createMarkdownPlugin<
  const Name extends string,
  const Node extends MarkdownExtensionNode<Name>,
>(
  definition: MarkdownSyntaxPluginDefinition<Name, Node>,
): MarkdownPluginEntry<Node>;
export function createMarkdownPlugin<const Name extends string>(
  definition: MarkdownTransformPluginDefinition<Name, never>,
): MarkdownPluginEntry<never>;
export function createMarkdownPlugin<
  const Name extends string,
  const Node extends MarkdownExtensionNode<Name>,
>(
  definition: MarkdownTransformPluginDefinition<Name, Node>,
): MarkdownPluginEntry<Node>;
export function createMarkdownPlugin(
  definition:
    | MarkdownPluginDefinition<string, MarkdownExtensionNode>
    | MarkdownTransformPluginDefinition<string, never>,
): MarkdownPluginEntry {
  if (definition.name.trim() === '') {
    fail('name must be a non-empty string');
  }
  if (definition.apiVersion !== 1) {
    fail(`"${definition.name}" uses unsupported apiVersion`);
  }
  if (
    typeof definition.transform !== 'undefined' &&
    typeof definition.transform !== 'function'
  ) {
    fail(`"${definition.name}" transform must be a function`);
  }
  if ('syntax' in definition && definition.syntax != null) {
    if (definition.parseKey.trim() === '') {
      fail(`"${definition.name}" parseKey must be non-empty`);
    }
    validateSyntax(definition.name, definition.syntax);
    if (Object.keys(definition.renderers).length === 0) {
      fail(`"${definition.name}" syntax must provide renderers`);
    }
  } else if (definition.transform == null) {
    fail(`"${definition.name}" must declare syntax or transform`);
  }

  const frozenDefinition = deepFreezeConfig(definition);
  const brand = Object.freeze({
    kind: MARKDOWN_PLUGIN_BRAND,
    apiVersion: 1 as const,
    definition: frozenDefinition,
  });
  return Object.freeze({
    name: frozenDefinition.name,
    apiVersion: 1 as const,
    [markdownPluginDefinition]: brand,
  }) as unknown as MarkdownPluginEntry;
}

/**
 * @internal Creates the first-party source-lines entry. Its transform is a
 * trusted identity that claims no source, so the transform pipeline skips it;
 * the entry's only effect is the parse option the definition key carries.
 */
export function createMarkdownSourceLinesEntry(
  name: string,
): MarkdownPluginEntry<never> {
  const transform = markMarkdownTransformClaim(
    markMarkdownTransformTrusted(document => document),
    () => false,
  );
  const definition: MarkdownTransformPluginDefinition<string, never> & {
    readonly [markdownSourceLinesDefinition]: true;
  } = {
    name,
    apiVersion: 1,
    transform,
    [markdownSourceLinesDefinition]: true,
  };
  return createMarkdownPlugin(definition);
}

export interface PreparedSyntaxContribution {
  readonly pluginName: string;
  readonly display: 'inline' | 'block';
  readonly contribution: MarkdownSyntaxContribution;
}

interface PreparedTransform {
  readonly pluginName: string;
  readonly transform: MarkdownTransform<MarkdownExtensionNode>;
  readonly claims?: (source: string) => boolean;
  /** Core-authored helper whose output needs no plugin-output validation. */
  readonly trusted: boolean;
}

interface PreparedRenderer {
  readonly pluginName: string;
  readonly renderer: MarkdownExtensionRenderer<MarkdownExtensionNode>;
}

export interface PreparedMarkdownPlugins {
  readonly entries: ReadonlyArray<MarkdownPluginEntry>;
  readonly syntaxEntries: ReadonlyArray<MarkdownPluginEntry>;
  readonly inlineByFirstCharacter: ReadonlyMap<
    string,
    ReadonlyArray<PreparedSyntaxContribution>
  >;
  readonly blockByFirstCharacter: ReadonlyMap<
    string,
    ReadonlyArray<PreparedSyntaxContribution>
  >;
  readonly transforms: ReadonlyArray<PreparedTransform>;
  /** Whether any transform is plugin-authored and needs Core's guards. */
  readonly hasUntrustedTransform: boolean;
  readonly syntaxIdentity: string;
  readonly renderers: ReadonlyMap<string, PreparedRenderer>;
  /** Whether the source-lines plugin is installed (`module:Markdown/sourceLines`). */
  readonly sourceLines: boolean;
}

const preparedPluginLists = new WeakMap<
  ReadonlyArray<MarkdownPluginEntry>,
  PreparedMarkdownPlugins
>();

function appendMapValue<T>(map: Map<string, T[]>, key: string, value: T): void {
  const current = map.get(key);
  if (current == null) {
    map.set(key, [value]);
  } else {
    current.push(value);
  }
}

function syntaxOnlyEntry(
  publicEntry: MarkdownPluginEntry,
): MarkdownPluginEntry {
  const entry = publicEntry as InternalMarkdownPluginEntry;
  const definition = getMarkdownPluginDefinition(publicEntry);
  if (definition.transform == null) {
    return publicEntry;
  }
  const syntaxDefinition = Object.freeze({...definition, transform: undefined});
  return Object.freeze({
    name: entry.name,
    apiVersion: entry.apiVersion,
    [markdownPluginDefinition]: Object.freeze({
      kind: MARKDOWN_PLUGIN_BRAND,
      apiVersion: 1 as const,
      definition: syntaxDefinition,
    }),
  }) as unknown as MarkdownPluginEntry;
}

export function prepareMarkdownPlugins(
  plugins: ReadonlyArray<MarkdownPluginEntry>,
): PreparedMarkdownPlugins | undefined {
  if (plugins.length === 0) {
    return undefined;
  }
  const cached = preparedPluginLists.get(plugins);
  if (cached != null) {
    return cached;
  }

  const names = new Set<string>();
  const inlineByFirstCharacter = new Map<
    string,
    PreparedSyntaxContribution[]
  >();
  const blockByFirstCharacter = new Map<string, PreparedSyntaxContribution[]>();
  const transforms: PreparedTransform[] = [];
  const renderers = new Map<string, PreparedRenderer>();
  const syntaxIdentity: string[] = [];
  const entries: InternalMarkdownPluginEntry[] = [];
  const syntaxEntries: MarkdownPluginEntry[] = [];
  let sourceLines = false;

  for (const publicEntry of plugins) {
    const definition = getMarkdownPluginDefinition(publicEntry);
    const entry = publicEntry as InternalMarkdownPluginEntry;
    if (names.has(definition.name)) {
      fail(`duplicate name "${definition.name}"`);
    }
    names.add(definition.name);
    entries.push(entry);

    if (definition.transform != null) {
      transforms.push({
        pluginName: definition.name,
        transform: definition.transform,
        claims: (definition.transform as ClaimAwareMarkdownTransform)[
          markdownTransformClaim
        ],
        trusted:
          (definition.transform as TrustAwareMarkdownTransform)[
            markdownTransformTrusted
          ] === true,
      });
    }
    if (definition.renderers != null) {
      for (const [nodeName, renderer] of Object.entries(definition.renderers)) {
        renderers.set(`${definition.name}\0${nodeName}`, {
          pluginName: definition.name,
          renderer: renderer,
        });
      }
    }
    if (
      (definition as {readonly [markdownSourceLinesDefinition]?: true})[
        markdownSourceLinesDefinition
      ] === true
    ) {
      sourceLines = true;
      syntaxEntries.push(syntaxOnlyEntry(publicEntry));
      syntaxIdentity.push(
        `${definition.name}\0${definition.apiVersion}\0source-lines`,
      );
    }
    if ('syntax' in definition && definition.syntax != null) {
      syntaxEntries.push(syntaxOnlyEntry(publicEntry));
      syntaxIdentity.push(
        `${definition.name}\0${definition.apiVersion}\0${definition.parseKey}`,
      );
      for (const contribution of definition.syntax.inline ?? []) {
        const prepared: PreparedSyntaxContribution = {
          pluginName: definition.name,
          display: 'inline',
          contribution,
        };
        for (const firstCharacter of new Set(
          contribution.startsWith.map(prefix => prefix[0]),
        )) {
          appendMapValue(inlineByFirstCharacter, firstCharacter, prepared);
        }
      }
      for (const contribution of definition.syntax.block ?? []) {
        const prepared: PreparedSyntaxContribution = {
          pluginName: definition.name,
          display: 'block',
          contribution,
        };
        for (const firstCharacter of new Set(
          contribution.startsWith.map(prefix => prefix[0]),
        )) {
          appendMapValue(blockByFirstCharacter, firstCharacter, prepared);
        }
      }
    }
  }

  const prepared: PreparedMarkdownPlugins = {
    entries,
    syntaxEntries,
    inlineByFirstCharacter,
    blockByFirstCharacter,
    transforms,
    hasUntrustedTransform: transforms.some(entry => !entry.trusted),
    syntaxIdentity: syntaxIdentity.join('\u0001'),
    renderers,
    sourceLines,
  };
  preparedPluginLists.set(plugins, prepared);
  return prepared;
}

export function isMarkdownPluginData(
  value: unknown,
  seen: Set<object> = new Set(),
): value is MarkdownPluginData {
  if (
    value == null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);
  let valid: boolean;
  if (Array.isArray(value)) {
    valid = value.every(item => isMarkdownPluginData(item, seen));
  } else if (Object.getPrototypeOf(value) !== Object.prototype) {
    valid = false;
  } else {
    valid = Object.values(value).every(item =>
      isMarkdownPluginData(item, seen),
    );
  }
  seen.delete(value);
  return valid;
}

export function freezeMarkdownPluginData<T extends MarkdownPluginData>(
  value: T,
): T {
  if (value != null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      freezeMarkdownPluginData(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * The identity of a source-backed node's position: its offsets, or, for a
 * block nested in a list item or quote, which carries lines and no offsets
 * while source lines are on (`module:Markdown/sourceLines`), its lines.
 */
function positionKey(position: MarkdownAstPosition | undefined): string | null {
  const start = position?.start.offset;
  const end = position?.end.offset;
  if (start != null && end != null) {
    return `${start}:${end}`;
  }
  const startLine = position?.start.line;
  const endLine = position?.end.line;
  return startLine == null || endLine == null
    ? null
    : `line ${startLine}:${endLine}`;
}

/** A position's two points measure the same thing and never run backwards. */
function isValidPosition(position: MarkdownAstPosition): boolean {
  const measures = [
    [position.start?.offset, position.end?.offset, 0],
    [position.start?.line, position.end?.line, 1],
  ] as const;
  let measured = false;
  for (const [start, end, minimum] of measures) {
    if (start === undefined && end === undefined) {
      continue;
    }
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      (start as number) < minimum ||
      (end as number) < (start as number)
    ) {
      return false;
    }
    measured = true;
  }
  return measured;
}

interface CodeInternalProperties {
  readonly descriptors: ReadonlyArray<readonly [symbol, PropertyDescriptor]>;
}

function codeSourceSignature(node: Record<string, unknown>): string {
  return JSON.stringify([
    node.lang,
    node.meta,
    node.value,
    node.position ?? null,
  ]);
}

function collectCodeInternalProperties(
  root: MarkdownAstRoot<MarkdownExtensionNode>,
): Map<string, CodeInternalProperties[]> {
  const properties = new Map<string, CodeInternalProperties[]>();
  const visit = (node: MarkdownAstNodeBase & {readonly type: string}): void => {
    if (node.type === 'code') {
      const descriptors = Object.getOwnPropertySymbols(node)
        .map(
          symbol =>
            [symbol, Object.getOwnPropertyDescriptor(node, symbol)] as const,
        )
        .filter(
          (entry): entry is readonly [symbol, PropertyDescriptor] =>
            entry[1]?.enumerable === true,
        );
      if (descriptors.length > 0) {
        const key = codeSourceSignature(
          node as unknown as Record<string, unknown>,
        );
        properties.set(key, [...(properties.get(key) ?? []), {descriptors}]);
      }
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child != null && typeof child === 'object') {
          visit(child as MarkdownAstNodeBase & {readonly type: string});
        }
      }
    }
  };
  visit(root);
  return properties;
}

function restoreCodeInternalProperties(
  previous: MarkdownAstRoot<MarkdownExtensionNode>,
  next: MarkdownAstRoot<MarkdownExtensionNode>,
): MarkdownAstRoot<MarkdownExtensionNode> {
  const properties = collectCodeInternalProperties(previous);
  if (properties.size === 0) {
    return next;
  }

  const visit = (
    node: MarkdownAstNodeBase & {readonly type: string},
  ): MarkdownAstNodeBase & {readonly type: string} => {
    let current = node;
    if (node.type === 'code') {
      const key = codeSourceSignature(
        node as unknown as Record<string, unknown>,
      );
      const queue = properties.get(key);
      const internal = queue?.shift();
      const shouldRestore = internal?.descriptors.some(
        ([symbol, descriptor]) => {
          const current = Object.getOwnPropertyDescriptor(node, symbol);
          return (
            current == null ||
            current.value !== descriptor.value ||
            current.get !== descriptor.get ||
            current.set !== descriptor.set ||
            current.enumerable !== descriptor.enumerable ||
            current.configurable !== descriptor.configurable ||
            current.writable !== descriptor.writable
          );
        },
      );
      if (internal != null && shouldRestore === true) {
        const clone = {...node};
        for (const [symbol, descriptor] of internal.descriptors) {
          Object.defineProperty(clone, symbol, descriptor);
        }
        current = clone;
      }
    }
    if ('children' in current && Array.isArray(current.children)) {
      const currentChildren = current.children as ReadonlyArray<
        MarkdownAstNodeBase & {readonly type: string}
      >;
      const children = currentChildren.map(child => visit(child));
      if (children.some((child, index) => child !== currentChildren[index])) {
        const parent: MarkdownAstNodeBase & {
          readonly type: string;
          readonly children: ReadonlyArray<
            MarkdownAstNodeBase & {readonly type: string}
          >;
        } = {...current, children};
        current = parent;
      }
    }
    return current;
  };

  return visit(next) as MarkdownAstRoot<MarkdownExtensionNode>;
}

interface SourceInvariant {
  readonly type: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly depth?: unknown;
  readonly ordered?: unknown;
  readonly start?: unknown;
  readonly delimiter?: unknown;
  readonly plugin?: unknown;
  readonly name?: unknown;
  readonly display?: unknown;
}

function collectSourceInvariants(
  root: MarkdownAstRoot<MarkdownExtensionNode>,
): Map<string, SourceInvariant[]> {
  const positions = new Map<string, SourceInvariant[]>();
  const visit = (node: MarkdownAstNodeBase & {readonly type: string}): void => {
    const key = positionKey(node.position);
    if (key != null) {
      const record = node as unknown as Record<string, unknown>;
      const invariant = {
        type: node.type,
        startLine: node.position?.start.line,
        endLine: node.position?.end.line,
        depth: record.depth,
        ordered: record.ordered,
        start: record.start,
        delimiter: record.delimiter,
        plugin: record.plugin,
        name: record.name,
        display: record.display,
      };
      positions.set(key, [...(positions.get(key) ?? []), invariant]);
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child != null && typeof child === 'object') {
          visit(child as MarkdownAstNodeBase & {readonly type: string});
        }
      }
    }
  };
  visit(root);
  return positions;
}

function extensionSignature(node: Record<string, unknown>): string {
  return JSON.stringify([
    node.plugin,
    node.name,
    node.display,
    node.data,
    node.source,
    positionKey(node.position as MarkdownAstPosition | undefined),
  ]);
}

interface ExistingExtension {
  readonly plugin: string;
  count: number;
}

function collectExtensionSignatures(
  root: MarkdownAstRoot<MarkdownExtensionNode>,
): Map<string, ExistingExtension> {
  const signatures = new Map<string, ExistingExtension>();
  const visit = (node: MarkdownAstNodeBase & {readonly type: string}): void => {
    if (node.type === 'extension') {
      const signature = extensionSignature(
        node as unknown as Record<string, unknown>,
      );
      const existing = signatures.get(signature);
      signatures.set(signature, {
        plugin: String((node as unknown as Record<string, unknown>).plugin),
        count: (existing?.count ?? 0) + 1,
      });
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child != null && typeof child === 'object') {
          visit(child as MarkdownAstNodeBase & {readonly type: string});
        }
      }
    }
  };
  visit(root);
  return signatures;
}

const sourceHeadingMarker = Symbol('MarkdownSourceHeading');

interface SourceHeadingMarker {
  readonly depth: number;
}

function markSourceHeadings(
  root: MarkdownAstRoot<MarkdownExtensionNode>,
): Set<SourceHeadingMarker> {
  const markers = new Set<SourceHeadingMarker>();
  const visit = (node: MarkdownAstNodeBase & {readonly type: string}): void => {
    if (node.type === 'heading' && !(sourceHeadingMarker in node)) {
      Object.defineProperty(node, sourceHeadingMarker, {
        configurable: false,
        enumerable: true,
        value: Object.freeze({
          depth: (node as unknown as {readonly depth: number}).depth,
        } satisfies SourceHeadingMarker),
        writable: false,
      });
    }
    if (node.type === 'heading') {
      markers.add(
        (
          node as unknown as {
            readonly [sourceHeadingMarker]: SourceHeadingMarker;
          }
        )[sourceHeadingMarker],
      );
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child != null && typeof child === 'object') {
          visit(child as MarkdownAstNodeBase & {readonly type: string});
        }
      }
    }
  };
  visit(root);
  return markers;
}

const PHRASING_TYPES = new Set([
  'text',
  'strong',
  'emphasis',
  'delete',
  'inlineCode',
  'inlineMath',
  'break',
  'link',
  'image',
  'citation',
]);
const BLOCK_TYPES = new Set([
  'heading',
  'paragraph',
  'code',
  'math',
  'blockquote',
  'list',
  'table',
  'thematicBreak',
  'image',
]);
const PHRASING_PARENTS = new Set([
  'heading',
  'paragraph',
  'strong',
  'emphasis',
  'delete',
  'link',
  'tableCell',
]);
const BLOCK_PARENTS = new Set(['root', 'blockquote', 'listItem']);
const CHILD_PARENT_TYPES = new Set([
  ...PHRASING_PARENTS,
  ...BLOCK_PARENTS,
  'list',
  'table',
  'tableRow',
]);

function validateAst(
  root: unknown,
  pluginNames: ReadonlySet<string>,
  rendererKeys: ReadonlySet<string>,
  sourcePositions: Map<string, SourceInvariant[]>,
  sourceHeadingMarkers: ReadonlySet<SourceHeadingMarker>,
  activePluginName: string,
  existingExtensions: Map<string, ExistingExtension>,
  display: 'inline' | 'block',
): root is MarkdownAstRoot<MarkdownExtensionNode> {
  if (root == null || typeof root !== 'object') {
    return false;
  }
  const seen = new Set<object>();
  const seenHeadingMarkers = new Set<SourceHeadingMarker>();
  let count = 0;
  const visit = (
    value: unknown,
    parent: string | null,
    insideLink: boolean,
  ): boolean => {
    if (value == null || typeof value !== 'object' || seen.has(value)) {
      return false;
    }
    if (++count > 100_000) {
      return false;
    }
    seen.add(value);
    const node = value as Record<string, unknown>;
    const type = node.type;
    if (typeof type !== 'string') {
      return false;
    }
    if (node.data !== undefined && !isMarkdownPluginData(node.data)) {
      return false;
    }

    if (parent != null) {
      const extensionDisplay = type === 'extension' ? node.display : undefined;
      const phrasing =
        PHRASING_TYPES.has(type) || extensionDisplay === 'inline';
      const block = BLOCK_TYPES.has(type) || extensionDisplay === 'block';
      if (
        (PHRASING_PARENTS.has(parent) && !phrasing) ||
        (BLOCK_PARENTS.has(parent) && !block) ||
        (insideLink && type === 'link') ||
        (parent === 'list' && type !== 'listItem') ||
        (parent === 'table' && type !== 'tableRow') ||
        (parent === 'tableRow' && type !== 'tableCell')
      ) {
        return false;
      }
    }

    const position = node.position as MarkdownAstPosition | undefined;
    const key = positionKey(position);
    if (position != null && !isValidPosition(position)) {
      return false;
    }
    if (key != null) {
      const invariants = sourcePositions.get(key) ?? [];
      const invariantIndex = invariants.findIndex(
        invariant =>
          invariant.type === type &&
          invariant.startLine === position?.start?.line &&
          invariant.endLine === position?.end?.line &&
          invariant.depth === node.depth &&
          invariant.ordered === node.ordered &&
          invariant.start === node.start &&
          invariant.delimiter === node.delimiter &&
          invariant.plugin === node.plugin &&
          invariant.name === node.name &&
          invariant.display === node.display,
      );
      if (invariantIndex < 0) {
        return false;
      }
      invariants.splice(invariantIndex, 1);
    }
    if (type !== 'extension' && node.source !== undefined) {
      return false;
    }

    switch (type) {
      case 'root':
        if (parent != null) {
          return false;
        }
        break;
      case 'heading': {
        if (![1, 2, 3, 4, 5, 6].includes(node.depth as number)) {
          return false;
        }
        const marker = (
          node as unknown as {
            readonly [sourceHeadingMarker]?: SourceHeadingMarker;
          }
        )[sourceHeadingMarker];
        if (
          marker != null &&
          (!sourceHeadingMarkers.has(marker) ||
            marker.depth !== node.depth ||
            seenHeadingMarkers.has(marker))
        ) {
          return false;
        }
        if (marker != null) {
          seenHeadingMarkers.add(marker);
        }
        break;
      }
      case 'text':
      case 'inlineCode':
      case 'inlineMath':
      case 'math':
        if (typeof node.value !== 'string') {
          return false;
        }
        break;
      case 'code':
        if (
          typeof node.value !== 'string' ||
          (node.lang !== null && typeof node.lang !== 'string') ||
          (node.meta !== undefined && typeof node.meta !== 'string')
        ) {
          return false;
        }
        break;
      case 'link':
        if (
          typeof node.url !== 'string' ||
          !isSafeMarkdownParserUrl(node.url)
        ) {
          return false;
        }
        break;
      case 'image':
        if (
          typeof node.url !== 'string' ||
          !isSafeMarkdownParserUrl(node.url) ||
          typeof node.alt !== 'string'
        ) {
          return false;
        }
        break;
      case 'citation':
        if (typeof node.sourceId !== 'string') {
          return false;
        }
        break;
      case 'list':
        if (
          typeof node.ordered !== 'boolean' ||
          (node.start != null && !Number.isFinite(node.start)) ||
          (node.delimiter != null &&
            node.delimiter !== '.' &&
            node.delimiter !== ')')
        ) {
          return false;
        }
        break;
      case 'table':
        if (
          !Array.isArray(node.align) ||
          !node.align.every(
            value =>
              value === null ||
              value === 'left' ||
              value === 'center' ||
              value === 'right',
          )
        ) {
          return false;
        }
        break;
      case 'extension': {
        if (
          typeof node.plugin !== 'string' ||
          !pluginNames.has(node.plugin) ||
          typeof node.name !== 'string' ||
          (node.display !== 'inline' && node.display !== 'block') ||
          !isMarkdownPluginData(node.data) ||
          !rendererKeys.has(`${node.plugin}\0${node.name}`)
        ) {
          return false;
        }
        const signature = extensionSignature(node);
        const existing = existingExtensions.get(signature);
        if (existing != null && existing.count > 0) {
          existing.count--;
        } else if (
          node.plugin !== activePluginName ||
          node.source !== undefined ||
          node.position !== undefined
        ) {
          return false;
        }
        break;
      }
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'break':
      case 'paragraph':
      case 'blockquote':
      case 'listItem':
      case 'tableRow':
      case 'tableCell':
      case 'thematicBreak':
        break;
      default:
        return false;
    }

    if (CHILD_PARENT_TYPES.has(type)) {
      if (!Array.isArray(node.children)) {
        return false;
      }
      for (const child of node.children) {
        if (!visit(child, type, insideLink || type === 'link')) {
          return false;
        }
      }
    } else if ('children' in node) {
      return false;
    }
    return true;
  };
  const candidate = root as MarkdownAstRoot<MarkdownExtensionNode>;
  return (
    visit(candidate, null, false) &&
    candidate.type === 'root' &&
    Array.from(existingExtensions.values()).every(
      extension =>
        extension.plugin === activePluginName || extension.count === 0,
    ) &&
    (display === 'block' ||
      (candidate.children.length === 1 &&
        candidate.children[0]?.type === 'paragraph'))
  );
}

/**
 * Deeply freezes a Markdown tree.
 *
 * No memo set and no cycle set. Both were measured against this parser's own
 * fixture and together cost four times the freezing they were guarding: a
 * full freeze of a 12k-node tree runs at 19 percent of the parse that built
 * it, a WeakSet memo takes that to 47 percent, and a cycle set to 75. Their
 * absence is safe, not merely cheap: every tree reaching here is acyclic
 * (the parser builds no cycles, and `validateAst` rejects any plugin tree
 * that contains one), and `Object.freeze` on an already-frozen node is a
 * no-op, so re-walking a shared subtree is correct — just not free.
 *
 * Deliberately NOT skipping nodes that look frozen: a node a plugin froze
 * itself may still hold mutable children, and an undecorated sibling a
 * trusted helper carried over by identity must be frozen like any other.
 */
function freezeAstNode(value: unknown): void {
  if (value == null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      freezeAstNode(value[index]);
    }
  } else {
    // `for…in` over a plain AST node rather than Object.values: the entries
    // array is the dominant remaining cost of the walk.
    for (const key in value) {
      freezeAstNode((value as Record<string, unknown>)[key]);
    }
  }
  Object.freeze(value);
}

function freezeAst<T>(value: T): T {
  freezeAstNode(value);
  return value;
}

const reportedProductionPluginFailures = new Set<string>();

/**
 * Freezes only what `next` does not share with `previous`.
 *
 * Valid ONLY when no plugin-authored transform runs in this pipeline. The
 * nodes it skips are the ones a Core helper carried over untouched, and with
 * every transform Core-authored there is no actor that could mutate them:
 * they are left in exactly the state an omitted or empty plugin list leaves
 * them in, which is the state rendering already observes for every
 * zero-plugin document today. The moment one untrusted transform exists,
 * `applyMarkdownTransforms` uses the full `freezeAst` instead, before that
 * transform observes anything — a shared, undecorated sibling included.
 */
function freezeBuiltAst<T>(previous: unknown, next: T): T {
  if (next == null || typeof next !== 'object' || next === previous) {
    return next;
  }
  const before =
    previous != null && typeof previous === 'object'
      ? (previous as Record<string, unknown>)
      : undefined;
  if (Array.isArray(next)) {
    const beforeArray = Array.isArray(previous) ? previous : undefined;
    for (let index = 0; index < next.length; index++) {
      freezeBuiltAst(beforeArray?.[index], next[index]);
    }
  } else {
    for (const key in next) {
      freezeBuiltAst(before?.[key], (next as Record<string, unknown>)[key]);
    }
  }
  Object.freeze(next);
  return next;
}

const HELPER_PHRASING_TYPES = new Set([
  'text',
  'strong',
  'emphasis',
  'delete',
  'inlineCode',
  'inlineMath',
  'break',
  'link',
  'image',
  'citation',
  'extension',
]);

/**
 * @internal Validates and freezes phrasing nodes a Core helper's caller just
 * authored, so the helper may put them straight into its output tree.
 * applying exactly the rules `validateAst` applies to newly-introduced nodes:
 * representable typed data only, no authored provenance, no foreign extension
 * ownership, no unrenderable extension, revalidated destinations, no nested
 * link, no block content, no cycles, and a bounded node count.
 *
 * A helper that validates and freezes its callback's output this way has
 * nothing left for Core to check, because every other node it returns is one
 * Core already validated. That is what lets such a helper run on the trusted
 * path while keeping FR10 and FR11 intact.
 *
 * Returns the frozen nodes, or throws — the caller reports the failure
 * through the ordinary transform failure path.
 */
export function adoptMarkdownHelperNode(
  node: unknown,
  ownership: MarkdownHelperOwnership,
  insideLink = false,
): void {
  adoptMarkdownHelperNodes(singleNodeScratch(node), ownership, insideLink);
}

/**
 * A one-element view for the single-node case, reused between calls so the
 * common replacement costs no array. Refilled on entry and never held past
 * the synchronous validation below, and a callback that re-enters the
 * helper gets a fresh array rather than disturbing an outer walk.
 */
let scratchInUse = false;
const reusableScratch: unknown[] = [undefined];
function singleNodeScratch(node: unknown): unknown[] {
  if (scratchInUse) {
    return [node];
  }
  reusableScratch[0] = node;
  return reusableScratch;
}

export function adoptMarkdownHelperNodes(
  nodes: ReadonlyArray<unknown>,
  ownership: MarkdownHelperOwnership,
  insideLink = false,
): void {
  // The overwhelmingly common replacement is one flat text node. Checking
  // that shape directly avoids the general walk's setup entirely, and this
  // runs once per match.
  if (nodes.length === 1) {
    const only = nodes[0];
    if (
      only != null &&
      typeof only === 'object' &&
      (only as {type?: unknown}).type === 'text' &&
      typeof (only as {value?: unknown}).value === 'string'
    ) {
      let extra = false;
      for (const key in only) {
        if (key !== 'type' && key !== 'value') {
          extra = true;
          break;
        }
      }
      if (!extra) {
        return;
      }
    }
  }
  // Cycle tracking is allocated only once a node with children appears: the
  // common replacement is a flat node, and this runs once per match.
  let seen: Set<object> | undefined;
  let count = 0;
  const visit = (value: unknown, withinLink: boolean): boolean => {
    if (value == null || typeof value !== 'object' || seen?.has(value)) {
      return false;
    }
    if (++count > 10_000) {
      return false;
    }
    if (Array.isArray((value as {children?: unknown}).children)) {
      seen ??= new Set<object>();
      seen.add(value);
    }
    const node = value as Record<string, unknown>;
    const type = node.type;
    if (typeof type !== 'string' || !HELPER_PHRASING_TYPES.has(type)) {
      return false;
    }
    // A helper's callback authors synthetic nodes only: provenance stays
    // Core's to assign, so neither field may be present.
    if (node.position !== undefined) {
      return false;
    }
    if (type !== 'extension' && node.source !== undefined) {
      return false;
    }
    if (node.data !== undefined && !isMarkdownPluginData(node.data)) {
      return false;
    }
    switch (type) {
      case 'text':
      case 'inlineCode':
      case 'inlineMath':
        if (typeof node.value !== 'string') {
          return false;
        }
        break;
      case 'link':
        if (
          withinLink ||
          typeof node.url !== 'string' ||
          !isSafeMarkdownParserUrl(node.url)
        ) {
          return false;
        }
        break;
      case 'image':
        if (
          typeof node.url !== 'string' ||
          !isSafeMarkdownParserUrl(node.url) ||
          typeof node.alt !== 'string'
        ) {
          return false;
        }
        break;
      case 'citation':
        if (typeof node.sourceId !== 'string') {
          return false;
        }
        break;
      case 'extension':
        if (
          node.plugin !== ownership.pluginName ||
          typeof node.name !== 'string' ||
          !ownership.hasRenderer(node.name) ||
          node.display !== 'inline' ||
          node.source !== undefined ||
          !isMarkdownPluginData(node.data)
        ) {
          return false;
        }
        break;
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'break':
        break;
    }
    if (type === 'strong' || type === 'emphasis' || type === 'delete') {
      if (!Array.isArray(node.children)) {
        return false;
      }
      for (const child of node.children) {
        if (!visit(child, withinLink)) {
          return false;
        }
      }
    } else if (type === 'link') {
      if (!Array.isArray(node.children)) {
        return false;
      }
      for (const child of node.children) {
        if (!visit(child, true)) {
          return false;
        }
      }
    } else if ('children' in node) {
      return false;
    }
    return true;
  };
  for (const node of nodes) {
    if (!visit(node, insideLink)) {
      throw new TypeError(
        'Markdown helper callback returned an unrepresentable node',
      );
    }
  }
  // Frozen only once every node passed, so a rejected batch leaves the
  // caller's objects exactly as they were. Freezing is what makes adopting
  // a caller's object safe instead of copying it: the object is now part of
  // an immutable tree, and a later write by whoever still holds a reference
  // cannot reach into the document.
  const reentrant = nodes !== reusableScratch;
  if (!reentrant) {
    scratchInUse = true;
  }
  try {
    for (const node of nodes) {
      freezeAstNode(node);
    }
  } finally {
    if (!reentrant) {
      scratchInUse = false;
      reusableScratch[0] = undefined;
    }
  }
}

export function reportMarkdownPluginFailure(
  pluginName: string,
  phase: 'syntax' | 'transform' | 'render',
  error: unknown,
): void {
  const key = `markdown-plugin:${pluginName}:${phase}`;
  const message = `plugin "${pluginName}" failed in ${phase}; rendered readable fallback.`;
  if (process.env.NODE_ENV === 'production') {
    if (!reportedProductionPluginFailures.has(key)) {
      reportedProductionPluginFailures.add(key);
      devError('Markdown', message);
    }
    return;
  }
  warnOnce(key, 'Markdown', message, error);
}

export function applyMarkdownTransforms<Node extends MarkdownExtensionNode>(
  root: MarkdownAstRoot<Node>,
  plugins: PreparedMarkdownPlugins | undefined,
  source: string,
  isFinal: boolean,
  display: 'inline' | 'block',
): MarkdownAstRoot<Node> {
  if (plugins == null || plugins.transforms.length === 0) {
    return root;
  }
  let pluginNames: Set<string> | undefined;
  let rendererKeys: Set<string> | undefined;
  let document: MarkdownAstRoot<Node> = root;
  // Heading identity is stamped on the mutable parser tree, before anything
  // freezes it, and only when a plugin-authored transform will actually be
  // validated against it. An all-trusted pipeline never pays for it.
  const sourceHeadingMarkers = plugins.hasUntrustedTransform
    ? markSourceHeadings(root)
    : undefined;
  let guarded = false;
  let priorTransformChangedTree = false;
  /** A trusted helper has produced a tree nothing has frozen yet. */
  let deferredFreeze = false;
  for (const prepared of plugins.transforms) {
    if (!priorTransformChangedTree && prepared.claims?.(source) === false) {
      continue;
    }
    // A plugin-authored transform observes deeply frozen input and has its
    // output validated. Both guards exist to contain untrusted structure, so
    // a Core-authored trusted helper needs neither — and a pipeline of only
    // trusted helpers never pays for them at all. Every untrusted transform
    // still receives a frozen tree, including one that follows a trusted
    // helper, whose output is not frozen on the way out.
    if (!prepared.trusted) {
      if (!guarded) {
        pluginNames = new Set(plugins.entries.map(entry => entry.name));
        rendererKeys = new Set(plugins.renderers.keys());
        guarded = true;
      }
      // Deeply freezes the whole tree, including anything a trusted helper
      // left shared and mutable, before plugin-authored code observes it.
      // Subtrees already frozen by an earlier pass are skipped.
      document = freezeAst(document);
      deferredFreeze = false;
    }
    try {
      const context: InternalMarkdownTransformContext = {
        source,
        isFinal,
        display,
        report(message) {
          reportMarkdownPluginFailure(
            prepared.pluginName,
            'transform',
            message,
          );
        },
        [markdownTransformPluginName]: prepared.pluginName,
        [markdownTransformHasRenderer]: (nodeName: string) =>
          plugins.renderers.has(`${prepared.pluginName}\u0000${nodeName}`),
        [markdownTransformSourceUnchanged]: !priorTransformChangedTree,
      };
      const next = prepared.transform(document, context) as unknown;
      if (
        next != null &&
        typeof next === 'object' &&
        typeof (next as {then?: unknown}).then === 'function'
      ) {
        void Promise.resolve(next).catch(() => {});
        throw new TypeError('Async Markdown transforms are not supported');
      }
      if (next === document) {
        continue;
      }
      if (prepared.trusted) {
        priorTransformChangedTree = true;
        // No freeze here. Nothing untrusted can observe this tree yet —
        // only another Core helper, which never mutates its input — so the
        // pipeline freezes once, below, before anything else sees it. That
        // freeze is a FULL walk, never one that stops at nodes merely
        // shared with an earlier unfrozen tree: an undecorated sibling a
        // helper carried over by identity must be frozen too.
        deferredFreeze = true;
        document = next as MarkdownAstRoot<Node>;
        continue;
      }
      const positions = collectSourceInvariants(document);
      const existingExtensions = collectExtensionSignatures(document);
      if (
        !validateAst(
          next,
          pluginNames as ReadonlySet<string>,
          rendererKeys as ReadonlySet<string>,
          positions,
          sourceHeadingMarkers as ReadonlySet<SourceHeadingMarker>,
          prepared.pluginName,
          existingExtensions,
          display,
        )
      ) {
        throw new TypeError('Transform returned an invalid Markdown document');
      }
      priorTransformChangedTree = true;
      document = freezeAst(
        restoreCodeInternalProperties(document, next),
      ) as MarkdownAstRoot<Node>;
    } catch (error) {
      reportMarkdownPluginFailure(prepared.pluginName, 'transform', error);
    }
  }
  if (!deferredFreeze) {
    return document;
  }
  // Freeze what the helpers built. With a plugin-authored transform in the
  // list the whole tree is frozen, because that plugin may observe any part
  // of it; with only Core helpers, the untouched remainder is left exactly
  // as a zero-plugin parse leaves it.
  return plugins.hasUntrustedTransform
    ? freezeAst(document)
    : freezeBuiltAst(root, document);
}

export function getMarkdownExtensionRenderer(
  plugins: PreparedMarkdownPlugins | undefined,
  node: MarkdownExtensionNode,
): MarkdownExtensionRenderer<MarkdownExtensionNode> | undefined {
  return plugins?.renderers.get(`${node.plugin}\0${node.name}`)?.renderer;
}

export function markdownExtensionText(
  plugins: PreparedMarkdownPlugins | undefined,
  node: MarkdownExtensionNode,
): string {
  const renderer = getMarkdownExtensionRenderer(plugins, node);
  if (renderer == null) {
    return node.source ?? '';
  }
  try {
    return renderer.toText(node);
  } catch (error) {
    reportMarkdownPluginFailure(node.plugin, 'render', error);
    return node.source ?? '';
  }
}
