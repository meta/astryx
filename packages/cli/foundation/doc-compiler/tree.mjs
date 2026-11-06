// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The docs tree: one home for every doc that a namespace places or
 *   adopts (spec:AST-046).
 *
 * @input Namespace docs, guides that name a parent with `placement`, and typed
 *   docs that belong to a discovery group (a CLI typed doc's `namespace`).
 * @output {@link buildDocsTree}: every node by route, each with one parent and
 *   ordered children per slot, plus one diagnostic for each placement that
 *   failed. {@link loadDocsTree} builds the CLI's own tree once per process.
 * @position Between discovery and the readers: `astryx docs <route>`,
 *   `astryx doctor`, and the docsite build all read this tree. The CLI's docs
 *   and each integration's have a home here, and a flat topic's home is the
 *   generated level for its category: Guides or Foundations.
 *   A namespace never scans files and never lists its children: a child names
 *   its parent, or a namespace adopts a discovery group.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';
import {loadCliSelfDocs} from '../discovery/cli-self-docs.mjs';
import {astryxIconDefinitions} from '../discovery/icon-definition-discovery.mjs';
import {routeSegment} from '../discovery/docs-section-key.mjs';
import {diagnostic, sortDiagnostics} from './diagnostics.mjs';
import {readDocView} from './read.mjs';
import {packageSource} from './source.mjs';
import {renderTokens} from './links.mjs';
import {createDocId} from '../identity/provider-identity.mjs';
import {CLI_PROVIDER_ID} from '../identity/providers.mjs';

export {routeSegment};

/** Where the CLI keeps the docs that only the tree reads. */
export const TREE_DOCS_DIR = path.join(CLI_ROOT, 'assets', 'docs', 'tree');

/** The package that owns the CLI's own docs. */
const CLI_PROVIDER = '@astryxdesign/cli';

/** One route segment: lowercase letters and digits joined by single hyphens. */
export const ROUTE_SEGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The generated level that `groupBy: 'kind'` makes for each kind: its route
 * segment, title, and summary.
 * @type {Readonly<Record<string, {segment: string, title: string, summary: string}>>}
 */
export const KIND_GROUPS = Object.freeze({
  command: {
    segment: 'commands',
    title: 'Commands',
    summary: 'Every command and subcommand.',
  },
  function: {
    segment: 'functions',
    title: 'Functions',
    summary: 'Every function: its signature, parameters, returns, and errors.',
  },
  schema: {
    segment: 'schemas',
    title: 'Schemas',
    summary: 'Data shapes, field by field.',
  },
  enum: {
    segment: 'enums',
    title: 'Enums',
    summary:
      'Every fixed list of values, such as error codes and response types.',
  },
  generic: {segment: 'guides', title: 'Guides', summary: 'Every guide.'},
});

/**
 * @typedef {import('../../authoring/doctypes/namespace/type').NamespaceDoc} NamespaceDoc
 * @typedef {import('../../authoring/doctypes/base/type').DocPlacement} DocPlacement
 * @typedef {import('./diagnostics.mjs').CompilerDiagnostic} CompilerDiagnostic
 */

/**
 * @typedef {object} TreeNamespaceInput
 * @property {string} provider the package that owns the namespace
 * @property {string} providerId the provider's ProviderId (its manifest
 *   `providerId`, else its package name); node ids are built from it
 * @property {number} [rank] which provider wins a contested route: the CLI's
 *   own docs are 0, then each integration in configured order
 * @property {string} source `<package>/<path>` of its file
 * @property {NamespaceDoc} doc
 */

/**
 * @typedef {object} TreeDocInput
 * @property {string} provider the package that authored the doc
 * @property {string} providerId the provider's ProviderId (its manifest
 *   `providerId`, else its package name); node ids are built from it
 * @property {number} [rank] which provider wins a contested route: the CLI's
 *   own docs are 0, then each integration in configured order
 * @property {string} source
 * @property {import('../../authoring/doctypes/base/type').AuthoredDocKind} kind
 *   the authored kind: `generic`, `command`, `function`, `schema`, or `enum`
 * @property {string} name the doc's stable name
 * @property {string} title
 * @property {string} summary
 * @property {string | null} group the discovery group adoption reads, or null
 * @property {DocPlacement | undefined} placement
 * @property {any} [ref] what a reader needs to open the doc, carried as given
 */

/**
 * @typedef {object} TreeSlot
 * @property {string} name
 * @property {string} title
 * @property {string[]} children child routes, in reading order
 */

/**
 * A flat topic: a reference topic that no namespace places. The tree gives it
 * a home in the generated level for its category (Guides or Foundations),
 * under its own name.
 * @typedef {object} TreeTopicInput
 * @property {string} provider the package that owns the topic
 * @property {string} providerId the provider's ProviderId
 * @property {string} name the topic's name, which stays its route
 * @property {string} title
 * @property {string} summary
 * @property {string | null} [category] the topic's sidebar group:
 *   `foundations` puts it in Foundations; anything else, in Guides
 * @property {string} source where the topic comes from, for diagnostics
 * @property {string[]} [aliases] every other name the topic answers to: the
 *   topics it replaced, directly or through a chain
 */

/**
 * The generated levels that hold the flat topics, by category
 * (spec:AST-046 FR12). A topic keeps its own name as its route; its level is
 * only where it sits. Readers see these titles in a topic's path, so each is
 * a plain name for what the topics are.
 */
export const TOPIC_LEVELS = Object.freeze({
  guides: Object.freeze({
    route: 'guides',
    title: 'Guides',
    summary:
      'Guides that stand on their own: getting started, principles, theming, and working with AI. Each topic keeps its own name; open one by it.',
  }),
  foundations: Object.freeze({
    route: 'foundations',
    title: 'Foundations',
    summary:
      'Color, elevation, icons, illustrations, motion, shape, and spacing: the visual foundations every component builds on. Each topic keeps its own name; open one by it.',
  }),
});

/**
 * The generated level a flat topic sits in.
 * @param {string | null | undefined} category
 * @returns {'guides' | 'foundations'}
 */
export const topicLevel = category =>
  category === 'foundations' ? 'foundations' : 'guides';

/**
 * @typedef {object} TreeNode
 * @property {string | null} id the doc's DocId, built from its provider's
 *   ProviderId, kind, and name: stable when the route moves; null on a
 *   generated level, which has no authored doc
 * @property {string} route
 * @property {string} kind `namespace` or the doc's authored kind
 * @property {string} provider the package that owns it
 * @property {string} providerId its provider's ProviderId
 * @property {string} name
 * @property {string} title
 * @property {string} summary
 * @property {string[]} [keywords] an authored namespace's search keywords
 * @property {string | null} parent the parent's route; null at the top
 * @property {string | null} slot the parent slot this node sits in
 * @property {number | null} order
 * @property {boolean} generated made by the compiler (a `groupBy: 'kind'`
 *   level, or a flat topics' level), not authored
 * @property {TreeSlot[]} slots a namespace's slots; empty for a leaf
 * @property {string} source
 * @property {any} [ref]
 * @property {import('../discovery/docs-discovery.mjs').GuideOverlay} [guideOverlay]
 *   what integrations do to a guide the tree places, by its route: set by the
 *   project's tree, absent when nothing replaces or extends it
 */

/**
 * @typedef {object} DocsTree
 * @property {Map<string, TreeNode>} nodes by route, in route order
 * @property {CompilerDiagnostic[]} diagnostics sorted
 * @property {(route: string) => TreeNode | undefined} get
 * @property {(route: string) => TreeNode | undefined} getFolded the node at a
 *   route compared without case, as topic names are
 * @property {() => TreeNode[]} roots the namespaces with no parent
 * @property {(node: TreeNode) => TreeNode[]} ancestors top first, not the node
 */

/** @param {string} a @param {string} b */
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The namespace a `placement.parent` names: `namespace:<name>` in the doc's own
 * package, or `<package>/namespace/<name>` spelled out. In phase 1 a parent
 * must belong to the doc's own package.
 * @param {string} parent
 * @param {string} provider
 * @param {Map<string, TreeNamespaceInput>} declared by `provider\0name`
 * @returns {{key: string} | {error: string}}
 */
function resolveParent(parent, provider, declared) {
  let owner = provider;
  let name;
  const short = /^namespace:(.+)$/u.exec(parent);
  const qualified = /^(.+)\/namespace\/([^/]+)$/u.exec(parent);
  if (short) {
    name = short[1];
  } else if (qualified) {
    [, owner, name] = qualified;
  } else {
    return {
      error: `placement.parent "${parent}" is not a namespace reference. Write "namespace:<name>".`,
    };
  }
  if (owner !== provider) {
    return {
      error: `placement.parent "${parent}" belongs to ${owner}. A doc can only be placed in a namespace of its own package (${provider}).`,
    };
  }
  const key = `${owner}\u0000${name}`;
  if (!declared.has(key)) {
    return {
      error: `placement.parent "${parent}" names no namespace; ${provider} declares ${
        [...declared.values()]
          .filter(ns => ns.provider === provider)
          .map(ns => `"${ns.doc.name}"`)
          .sort(byText)
          .join(', ') || 'none'
      }.`,
    };
  }
  return {key};
}

/**
 * Build the tree. Pure: the same inputs give the same tree, whatever order
 * they arrive in.
 *
 * A doc's home is decided once, in this order: its explicit `placement`, then
 * the one adoption rule in its package that matches its group and kind. A
 * placement that fails withdraws the doc; it never falls back to adoption. A
 * doc with neither is a flat topic: it keeps its flat name as its route, and its
 * home is the generated level for its category. The CLI keeps its own routes: an
 * integration's node that would take one is withdrawn with a diagnostic.
 *
 * @param {{namespaces: TreeNamespaceInput[], docs: TreeDocInput[], topics?: TreeTopicInput[]}} inputs
 * @returns {DocsTree}
 */
export function buildDocsTree({namespaces, docs, topics = []}) {
  /** @type {CompilerDiagnostic[]} */
  const diagnostics = [];
  /** @param {string} code @param {{provider: string, source: string}} at @param {string} message @param {string} [field] */
  const report = (code, at, message, field) =>
    diagnostics.push(
      diagnostic(code, {
        provider: at.provider,
        source: at.source,
        message,
        ...(field ? {field} : {}),
      }),
    );

  // Routes the CLI's own docs keep (spec:AST-046 FR11): the name of each of
  // its flat topics, and the generated levels that hold flat topics. Its
  // namespaces keep theirs by rank, because they go into the tree first.
  // Routes compare without case, as topic names do, so `CLI` claims `cli`.
  /** @type {Set<string>} */
  const cliRoutes = new Set(
    topics.length > 0
      ? Object.values(TOPIC_LEVELS).map(level => level.route)
      : [],
  );
  for (const topic of topics) {
    if (topic.provider === CLI_PROVIDER)
      cliRoutes.add(topic.name.toLowerCase());
  }
  // Every other name a topic answers to (the topics it replaced, directly or
  // through a chain) is that topic's route too: `astryx docs <name>` opens the
  // replacement, so no other doc can hold it.
  /** @type {Map<string, TreeTopicInput>} */
  const aliasRoutes = new Map();
  for (const topic of topics) {
    for (const alias of topic.aliases ?? []) {
      aliasRoutes.set(alias.toLowerCase(), topic);
    }
  }

  // Namespaces by package and name.
  /** @type {Map<string, TreeNamespaceInput>} */
  const declared = new Map();
  const sortedNamespaces = [...namespaces].sort(
    (a, b) =>
      (a.rank ?? 0) - (b.rank ?? 0) ||
      byText(a.provider, b.provider) ||
      byText(a.doc.name, b.doc.name) ||
      byText(a.source, b.source),
  );
  for (const input of sortedNamespaces) {
    const {name} = input.doc;
    if (!ROUTE_SEGMENT_RE.test(name)) {
      report(
        'invalid_namespace',
        input,
        `Namespace "${name}" is not a route segment. Use lowercase letters and digits joined by single hyphens.`,
        'name',
      );
      continue;
    }
    const key = `${input.provider}\u0000${name}`;
    const first = declared.get(key);
    if (first) {
      report(
        'invalid_namespace',
        input,
        `Namespace "${name}" is declared twice in ${input.provider}: ${first.source} and ${input.source}.`,
        'name',
      );
      continue;
    }
    declared.set(key, input);
  }

  // Each namespace's parent, checked against the parent's slots.
  /** @type {Map<string, {parentKey: string, slot: string, order: number | null} | null>} */
  const parentOf = new Map();
  for (const [key, input] of declared) {
    const {placement} = input.doc;
    if (placement == null) {
      parentOf.set(key, null);
      continue;
    }
    const home = checkPlacement(placement, 'namespace', input, declared);
    if ('error' in home) {
      report('invalid_placement', input, home.error, 'placement');
      continue;
    }
    parentOf.set(key, {
      parentKey: home.key,
      slot: home.slot,
      order: placement.order ?? null,
    });
  }

  // Routes, top-down. A cycle, or an ancestor that was withdrawn, leaves a
  // namespace (and everything under it) out of the tree.
  /** @type {Map<string, string | null>} */
  const routeOf = new Map();
  /** @param {string} key @param {Set<string>} seen @returns {string | null} */
  const routeFor = (key, seen) => {
    if (routeOf.has(key))
      return /** @type {string | null} */ (routeOf.get(key));
    if (!parentOf.has(key) || seen.has(key)) return null;
    seen.add(key);
    const home = parentOf.get(key);
    const name = /** @type {TreeNamespaceInput} */ (declared.get(key)).doc.name;
    const parentRoute = home == null ? '' : routeFor(home.parentKey, seen);
    const route =
      parentRoute == null
        ? null
        : parentRoute === ''
          ? name
          : `${parentRoute}/${name}`;
    routeOf.set(key, route);
    return route;
  };
  for (const [key, input] of declared) {
    if (routeFor(key, new Set()) == null && parentOf.has(key)) {
      report(
        'invalid_placement',
        input,
        `Namespace "${input.doc.name}" has no route: its placement forms a cycle, or a namespace above it was withdrawn.`,
        'placement',
      );
    }
  }

  /** @type {Map<string, TreeNode>} */
  const nodes = new Map();
  /** @type {Map<string, TreeNode>} nodes by route, compared without case */
  const byFoldedRoute = new Map();
  /** @param {TreeNode} node */
  const nodeLabel = node => node.id ?? `the generated level "${node.route}"`;
  /** @param {TreeNode} node @param {{provider: string, source: string}} at */
  const addNode = (node, at) => {
    const folded = node.route.toLowerCase();
    if (node.provider !== CLI_PROVIDER && cliRoutes.has(folded)) {
      report(
        'duplicate_route',
        at,
        `${nodeLabel(node)} takes the route "${node.route}", which the CLI's own docs keep. Rename it.`,
      );
      return false;
    }
    const alias = aliasRoutes.get(folded);
    if (
      alias != null &&
      node.provider !== CLI_PROVIDER &&
      node.ref?.flatTopic !== alias.name
    ) {
      report(
        'duplicate_route',
        at,
        `${nodeLabel(node)} takes the route "${node.route}", which the topic "${alias.name}" also answers to, because it replaced a topic of that name. Rename it.`,
      );
      return false;
    }
    const taken = byFoldedRoute.get(folded);
    if (
      taken &&
      taken.provider === CLI_PROVIDER &&
      node.provider !== CLI_PROVIDER &&
      !node.generated
    ) {
      // Astryx's own doc keeps its route: name both docs as an author knows
      // them, never by their ids, and say what to change.
      const what = (/** @type {TreeNode} */ n) =>
        n.kind === 'namespace'
          ? 'namespace'
          : n.kind === 'generic'
            ? 'topic'
            : `${n.kind} doc`;
      const scope = String(node.provider).split('/').pop() ?? '';
      const suggestion = `${
        scope
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase() || 'my'
      }-${node.name.toLowerCase()}`;
      report(
        'duplicate_route',
        at,
        `The ${what(node)} "${node.name}" from ${node.provider} and Astryx's own ${what(taken)} "${taken.name}" both have the route "${node.route}", so \`astryx docs ${node.route}\` cannot open both. Fix: rename "${node.name}" (its \`name\` and its file), such as \`name: '${suggestion}'\`${node.route.includes('/') ? ', or place it elsewhere' : ''}.`,
      );
      return false;
    }
    if (taken) {
      report(
        'duplicate_route',
        at,
        `${nodeLabel(node)} and ${nodeLabel(taken)} both have the route "${node.route}". Rename or move one of them.`,
      );
      return false;
    }
    nodes.set(node.route, node);
    byFoldedRoute.set(folded, node);
    return true;
  };

  // Parents before children, so a namespace placed in a withdrawn namespace
  // is withdrawn before anything is placed in it.
  const parentsFirst = [...declared].sort(
    ([a], [b]) =>
      String(routeOf.get(a) ?? '').split('/').length -
      String(routeOf.get(b) ?? '').split('/').length,
  );
  for (const [key, input] of parentsFirst) {
    const route = routeOf.get(key);
    if (route == null) continue;
    const home = parentOf.get(key);
    if (home != null && routeOf.get(home.parentKey) == null) {
      routeOf.set(key, null);
      report(
        'invalid_placement',
        input,
        `Namespace "${input.doc.name}" has no route: the namespace it is placed in was withdrawn.`,
        'placement',
      );
      continue;
    }
    const parentRoute =
      home == null ? null : /** @type {string} */ (routeOf.get(home.parentKey));
    const added = addNode(
      {
        id: createDocId(input.providerId, 'namespace', input.doc.name),
        route,
        kind: 'namespace',
        provider: input.provider,
        providerId: input.providerId,
        name: input.doc.name,
        title: input.doc.title,
        summary: input.doc.summary,
        ...(Array.isArray(input.doc.keywords)
          ? {keywords: input.doc.keywords}
          : {}),
        parent: parentRoute,
        slot: home?.slot ?? null,
        order: home?.order ?? null,
        generated: false,
        ref: {selfDoc: input.doc},
        slots: Object.entries(input.doc.slots).map(([name, slot]) => ({
          name,
          title: slot.title,
          children: [],
        })),
        source: input.source,
      },
      input,
    );
    // A withdrawn namespace has no route, so a namespace placed in it is
    // withdrawn too, and a doc placed in it says so.
    if (!added) routeOf.set(key, null);
  }

  // Docs: explicit placement, else one adoption rule, else no home.
  const sortedDocs = [...docs].sort(
    (a, b) =>
      (a.rank ?? 0) - (b.rank ?? 0) ||
      byText(a.provider, b.provider) ||
      byText(a.kind, b.kind) ||
      byText(a.name, b.name) ||
      byText(a.source, b.source),
  );
  for (const doc of sortedDocs) {
    /** @type {{parentRoute: string, slot: string, order: number | null} | null} */
    let home = null;
    if (doc.placement != null) {
      const placed = checkPlacement(doc.placement, doc.kind, doc, declared);
      if ('error' in placed) {
        report('invalid_placement', doc, placed.error, 'placement');
        continue;
      }
      const parentRoute = routeOf.get(placed.key);
      if (parentRoute == null) {
        report(
          'invalid_placement',
          doc,
          `placement.parent "${doc.placement.parent}" names a namespace that has no route.`,
          'placement',
        );
        continue;
      }
      home = {
        parentRoute,
        slot: placed.slot,
        order: doc.placement.order ?? null,
      };
    } else if (doc.group != null) {
      const matches = adoptionsFor(doc, declared, routeOf);
      if (matches.length > 1) {
        report(
          'overlapping_adoption',
          doc,
          `${doc.provider}/${doc.kind}/${doc.name} is adopted by ${matches
            .map(m => `"${m.namespace.doc.name}"`)
            .join(' and ')}; exactly one namespace may adopt a doc.`,
        );
        continue;
      }
      if (matches.length === 1) {
        const [{key, rule, namespace}] = matches;
        const nsRoute = /** @type {string} */ (routeOf.get(key));
        if (rule.groupBy === 'kind') {
          const group = KIND_GROUPS[doc.kind] ?? {
            segment: `${routeSegment(doc.kind)}s`,
            title: doc.kind,
            summary: `Every ${doc.kind} doc.`,
          };
          const groupRoute = `${nsRoute}/${group.segment}`;
          if (!nodes.has(groupRoute)) {
            const kinds = rule.source.kinds ?? [];
            addNode(
              {
                id: null,
                route: groupRoute,
                kind: 'namespace',
                provider: namespace.provider,
                providerId: namespace.providerId,
                name: group.segment,
                title: group.title,
                summary: group.summary,
                parent: nsRoute,
                slot: rule.into,
                order: kinds.includes(/** @type {any} */ (doc.kind))
                  ? kinds.indexOf(/** @type {any} */ (doc.kind))
                  : null,
                generated: true,
                slots: [{name: 'items', title: group.title, children: []}],
                source: namespace.source,
              },
              namespace,
            );
          }
          const groupNode = nodes.get(groupRoute);
          if (!groupNode?.generated) continue;
          home = {parentRoute: groupRoute, slot: 'items', order: null};
        } else {
          home = {parentRoute: nsRoute, slot: rule.into, order: null};
        }
      }
    }
    if (home == null) continue;
    const segment = routeSegment(doc.name);
    if (segment === '') {
      report(
        'invalid_placement',
        doc,
        `${doc.provider}/${doc.kind}/${doc.name} has no route segment: its name holds no letters or digits.`,
        'name',
      );
      continue;
    }
    addNode(
      {
        id: createDocId(doc.providerId, doc.kind, doc.name),
        route: `${home.parentRoute}/${segment}`,
        kind: doc.kind,
        provider: doc.provider,
        providerId: doc.providerId,
        name: doc.name,
        title: doc.title,
        summary: doc.summary,
        parent: home.parentRoute,
        slot: home.slot,
        order: home.order,
        generated: false,
        slots: [],
        source: doc.source,
        ...(doc.ref === undefined ? {} : {ref: doc.ref}),
      },
      doc,
    );
  }

  // The generated levels (spec:AST-046 FR12): every flat topic sits in the
  // level for its category, in the order the topic list reads, so every doc
  // has a named home in the tree. A topic keeps its own name as its route.
  for (const [key, level] of Object.entries(TOPIC_LEVELS)) {
    const members = topics.filter(topic => topicLevel(topic.category) === key);
    if (members.length === 0) continue;
    const home = {
      id: null,
      route: level.route,
      kind: 'namespace',
      provider: CLI_PROVIDER,
      providerId: CLI_PROVIDER_ID,
      name: level.route,
      title: level.title,
      summary: level.summary,
      parent: null,
      slot: null,
      order: null,
      generated: true,
      slots: [{name: 'topics', title: 'Topics', children: []}],
      source: 'generated',
    };
    if (!addNode(home, {provider: CLI_PROVIDER, source: 'generated'})) continue;
    members.forEach((topic, i) => {
      addNode(
        {
          id: createDocId(topic.providerId, 'generic', topic.name),
          route: topic.name,
          kind: 'generic',
          provider: topic.provider,
          providerId: topic.providerId,
          name: topic.name,
          title: topic.title,
          summary: topic.summary,
          parent: level.route,
          slot: 'topics',
          order: i,
          generated: false,
          slots: [],
          source: topic.source,
          ref: {flatTopic: topic.name},
        },
        topic,
      );
    });
  }

  // Children, per slot, in reading order: order, then title, then id.
  for (const node of nodes.values()) {
    if (node.parent == null) continue;
    const parent = nodes.get(node.parent);
    parent?.slots
      .find(slot => slot.name === node.slot)
      ?.children.push(node.route);
  }
  for (const node of nodes.values()) {
    for (const slot of node.slots) {
      slot.children.sort((a, b) => {
        const x = /** @type {TreeNode} */ (nodes.get(a));
        const y = /** @type {TreeNode} */ (nodes.get(b));
        return (
          (x.order ?? Infinity) - (y.order ?? Infinity) ||
          byText(x.title.toLowerCase(), y.title.toLowerCase()) ||
          byText(x.id ?? x.route, y.id ?? y.route)
        );
      });
    }
  }

  // A topic that answers, through `replaces`, to a route the CLI's own docs
  // keep cannot have it: the CLI's doc opens there. Say so, against the topic.
  for (const topic of topics) {
    if (topic.provider === CLI_PROVIDER) continue;
    for (const alias of topic.aliases ?? []) {
      const holder = byFoldedRoute.get(alias.toLowerCase());
      if (holder != null && holder.provider === CLI_PROVIDER) {
        report(
          'duplicate_route',
          topic,
          `The topic "${topic.name}" answers to "${alias}" through replaces, but the CLI's own docs keep that route, so \`astryx docs ${alias}\` opens theirs. Drop that replacement.`,
        );
      }
    }
  }

  const sorted = new Map([...nodes.entries()].sort(([a], [b]) => byText(a, b)));
  return {
    nodes: sorted,
    diagnostics: sortDiagnostics(diagnostics),
    get: route => sorted.get(route),
    getFolded: route => byFoldedRoute.get(String(route).toLowerCase()),
    roots: () => [...sorted.values()].filter(node => node.parent == null),
    ancestors: node => {
      /** @type {TreeNode[]} */
      const chain = [];
      let parent = node.parent == null ? undefined : sorted.get(node.parent);
      while (parent) {
        chain.unshift(parent);
        parent = parent.parent == null ? undefined : sorted.get(parent.parent);
      }
      return chain;
    },
  };
}

/**
 * Check a placement against the namespace it names: the namespace exists in
 * the doc's own package, the slot is one it declares, and the slot accepts the
 * doc's kind.
 * @param {DocPlacement} placement
 * @param {string} kind
 * @param {{provider: string}} at
 * @param {Map<string, TreeNamespaceInput>} declared
 * @returns {{key: string, slot: string} | {error: string}}
 */
function checkPlacement(placement, kind, at, declared) {
  const target = resolveParent(placement.parent, at.provider, declared);
  if ('error' in target) return target;
  const parent = /** @type {TreeNamespaceInput} */ (declared.get(target.key));
  const slotNames = Object.keys(parent.doc.slots);
  const slot = placement.slot ?? (slotNames.length === 1 ? slotNames[0] : null);
  if (slot == null) {
    return {
      error: `placement names no slot, and namespace "${parent.doc.name}" has ${slotNames.length} (${slotNames.join(', ')}). Name one with placement.slot.`,
    };
  }
  const declaredSlot = parent.doc.slots[slot];
  if (declaredSlot == null) {
    return {
      error: `placement.slot "${slot}" is not a slot of namespace "${parent.doc.name}"; it declares ${slotNames.join(', ')}.`,
    };
  }
  if (!declaredSlot.accepts.kinds.includes(/** @type {any} */ (kind))) {
    return {
      error: `slot "${slot}" of namespace "${parent.doc.name}" does not accept ${kind} docs; it accepts ${declaredSlot.accepts.kinds.join(', ')}.`,
    };
  }
  return {key: target.key, slot};
}

/**
 * Every adoption rule that matches the doc's group and kind, from namespaces
 * that have a route: its own package's, and an experimental CLI namespace's
 * rule that adopts its group from every package (`source.packages: 'all'`).
 * @param {TreeDocInput} doc
 * @param {Map<string, TreeNamespaceInput>} declared
 * @param {Map<string, string | null>} routeOf
 */
function adoptionsFor(doc, declared, routeOf) {
  /** @type {Array<{key: string, namespace: TreeNamespaceInput, rule: NonNullable<NamespaceDoc['adopts']>[number]}>} */
  const matches = [];
  for (const [key, namespace] of declared) {
    if (routeOf.get(key) == null) continue;
    for (const rule of namespace.doc.adopts ?? []) {
      if (rule.source.group !== doc.group) continue;
      // Adopting from every package is experimental (spec:AST-017 FR27): only
      // a CLI namespace marked experimental may (the icon definitions).
      const shared =
        rule.source.packages === 'all' &&
        namespace.provider === CLI_PROVIDER &&
        /** @type {any} */ (namespace.doc).stability === 'experimental';
      if (namespace.provider !== doc.provider && !shared) continue;
      if (
        rule.source.kinds &&
        !rule.source.kinds.includes(/** @type {any} */ (doc.kind))
      ) {
        continue;
      }
      matches.push({key, namespace, rule});
    }
  }
  return matches;
}

/**
 * The files under {@link TREE_DOCS_DIR}, sorted.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function treeDocFiles(dir = TREE_DOCS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(file => /^[\w-]+\.doc\.mjs$/u.test(file))
    .sort(byText)
    .map(file => path.join(dir, file));
}

/**
 * The names of the CLI's own root namespaces (spec:AST-046 FR7): each is read
 * with `astryx docs <name>`, as a flat topic is, though no topic file has its
 * name. Read from the namespace files' text, without loading them, so a
 * synchronous caller (the agent docs block) lists them beside the flat topics.
 * A topic split into a namespace keeps its name in every such list.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function cliRootNamespaceNames(dir = TREE_DOCS_DIR) {
  /** @type {string[]} */
  const names = [];
  for (const file of treeDocFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/["']?type["']?\s*:\s*["']namespace["']/u.test(text)) continue;
    if (/["']?placement["']?\s*:/u.test(text)) continue;
    const name = /["']?name["']?\s*:\s*["']([\w-]+)["']/u.exec(text)?.[1];
    if (name) names.push(name);
  }
  return names.sort(byText);
}

/**
 * The CLI's own tree inputs: the namespace docs and guides under
 * assets/docs/tree, and, unless left out, every typed self-doc with its
 * `namespace` group. A file that fails to load or parse is a diagnostic, never
 * a thrown error.
 * @param {{selfDocs?: boolean, dir?: string}} [options]
 * @returns {Promise<{namespaces: TreeNamespaceInput[], docs: TreeDocInput[], diagnostics: CompilerDiagnostic[]}>}
 */
export async function loadTreeInputs({
  selfDocs = true,
  dir = TREE_DOCS_DIR,
} = {}) {
  /** @type {TreeNamespaceInput[]} */
  const namespaces = [];
  /** @type {TreeDocInput[]} */
  const docs = [];
  /** @type {CompilerDiagnostic[]} */
  const diagnostics = [];
  for (const file of treeDocFiles(dir)) {
    const source = packageSource(file);
    const at = {provider: CLI_PROVIDER, source};
    let doc;
    try {
      doc = await readDocView(file, {
        root: 'tree',
        provider: CLI_PROVIDER,
        loader: 'native',
        strict: true,
      });
    } catch (error) {
      diagnostics.push(
        diagnostic('invalid_doc', {
          ...at,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      continue;
    }
    const stem = path.basename(file, '.doc.mjs');
    if (doc?.name !== stem) {
      diagnostics.push(
        diagnostic('invalid_doc', {
          ...at,
          field: 'name',
          message: `${path.basename(file)} declares name "${doc?.name}"; a docs tree file is named after its doc (${doc?.name}.doc.mjs).`,
        }),
      );
      continue;
    }
    if (doc.type === 'namespace') {
      namespaces.push({
        provider: CLI_PROVIDER,
        providerId: CLI_PROVIDER_ID,
        source,
        doc,
      });
    } else if (doc.type === 'generic') {
      if (doc.placement == null) {
        diagnostics.push(
          diagnostic('invalid_placement', {
            ...at,
            field: 'placement',
            message: `${path.basename(file)} has no placement. A guide in the docs tree names its parent namespace with placement.parent.`,
          }),
        );
        continue;
      }
      docs.push({
        provider: CLI_PROVIDER,
        providerId: CLI_PROVIDER_ID,
        source,
        kind: 'generic',
        name: doc.name,
        title: doc.title,
        summary: doc.description,
        group: null,
        placement: doc.placement,
        ref: {topicFile: file},
      });
    } else {
      diagnostics.push(
        diagnostic('wrong_kind', {
          ...at,
          message: `${path.basename(file)} is stamped type ${JSON.stringify(doc?.type)}; the docs tree reads namespace and generic docs.`,
        }),
      );
    }
  }
  if (selfDocs) {
    // Astryx's icon definitions, adopted by the `icon-definitions` namespace with
    // every installed set's own.
    const definitions = astryxIconDefinitions();
    for (const {file, message} of definitions.errors) {
      diagnostics.push(
        diagnostic('invalid_doc', {
          provider: CLI_PROVIDER,
          source: packageSource(file),
          message,
        }),
      );
    }
    for (const {doc, file} of definitions.definitions) {
      docs.push(
        iconDefinitionTreeInput(doc, file, CLI_PROVIDER, CLI_PROVIDER_ID),
      );
    }
    const {loaded} = await loadCliSelfDocs();
    for (const {source, doc} of loaded) {
      docs.push({
        provider: CLI_PROVIDER,
        providerId: CLI_PROVIDER_ID,
        source: `${CLI_PROVIDER}/${source}`,
        kind: doc.type,
        name: doc.name,
        title: doc.displayName ?? doc.name,
        summary: doc.summary ?? doc.description ?? '',
        group: typeof doc.namespace === 'string' ? doc.namespace : null,
        placement: doc.placement,
        ref: {selfDoc: doc},
      });
    }
  }
  return {namespaces, docs, diagnostics};
}

/** The discovery group every icon definition doc belongs to. */
export const ICON_DEFINITIONS_GROUP = 'icon-definitions';

/**
 * One icon definition as a docs-tree input: grouped for the CLI's
 * `icon-definitions` namespace, which adopts them from every package.
 * @param {import('../../authoring/doctypes/icon-definition/type').IconDefinitionDoc} doc
 * @param {string} file
 * @param {string} provider
 * @param {string} providerId
 * @returns {TreeDocInput}
 */
export function iconDefinitionTreeInput(doc, file, provider, providerId) {
  return {
    provider,
    providerId,
    source: packageSource(file),
    kind: 'icon-definition',
    name: doc.name,
    title: doc.name,
    // Built-in definitions are the ones every set must map; the words are
    // what an author searches the library for.
    summary: `${doc.builtIn ? '[built-in] ' : ''}${doc.description}${doc.words.length > 0 ? ` Words: ${doc.words.join(', ')}.` : ''}`,
    group: ICON_DEFINITIONS_GROUP,
    placement: undefined,
    ref: {selfDoc: doc},
  };
}

/** @type {Map<string, Promise<DocsTree>>} */
const built = new Map();

/**
 * The CLI's own docs tree, built once per process. With `selfDocs: false` it
 * holds only the namespaces and guides, which is all a topic list needs.
 * @param {{selfDocs?: boolean, fresh?: boolean}} [options]
 * @returns {Promise<DocsTree>}
 */
export function loadDocsTree({selfDocs = true, fresh = false} = {}) {
  const key = selfDocs ? 'full' : 'namespaces';
  let tree = fresh ? undefined : built.get(key);
  if (!tree) {
    tree = loadTreeInputs({selfDocs}).then(inputs => {
      const result = buildDocsTree(inputs);
      // Tree inputs carry authored summaries; each renders its doc tokens
      // once, here or where the project tree is built.
      for (const node of result.nodes.values()) {
        node.summary = renderTokens(node.summary);
      }
      return {
        ...result,
        diagnostics: sortDiagnostics([
          ...inputs.diagnostics,
          ...result.diagnostics,
        ]),
      };
    });
    built.set(key, tree);
  }
  return tree;
}

/**
 * Is this node an experimental surface's doc (spec:AST-017 FR27): marked
 * `stability: 'experimental'` itself, or under a namespace that is? Every
 * reader that marks or counts experimental docs asks this one question.
 * @param {DocsTree} tree
 * @param {TreeNode} node
 * @returns {boolean}
 */
export function isExperimentalTreeNode(tree, node) {
  return [...tree.ancestors(node), node].some(
    (/** @type {any} */ each) =>
      each.ref?.selfDoc?.stability === 'experimental',
  );
}
