// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs.node leaf — one namespace or typed doc in the docs tree.
 *
 * @input A route the docs tree resolves: a namespace such as `cli/api`, or a
 *   typed doc such as `cli/api/functions/search`, plus {cwd}.
 * @output { type: 'docs.node', data: DocsNode } — the node's identity, title
 *   and summary, the namespaces above it, and either its slots with their
 *   children (a namespace) or its content (a typed doc). By default a
 *   namespace lists its children one level down; a depth read goes as far
 *   down as asked, with each doc below as its identity (brief) or with its
 *   text (compact, full). Matches `astryx --json docs <route> [--depth <n>]`.
 * @position Leaf under api/docs, beside the topic leaves. A guide the tree
 *   places is a topic: the detail leaf reads it by its route.
 */

import {detailView} from '../../../foundation/doc-compiler/lenses.mjs';
import {isExperimentalTreeNode} from '../../../foundation/doc-compiler/tree.mjs';
import {
  compileTopic,
  guideEntry,
  nodeContent,
  placeLinks,
  resolveDocsArgument,
  unknownTopicError,
} from '../_adapter.mjs';

/**
 * @typedef {import('../../../foundation/doc-compiler/tree.mjs').DocsTree} DocsTree
 * @typedef {import('../../../foundation/doc-compiler/tree.mjs').TreeNode} TreeNode
 * @typedef {import('../../../foundation/discovery/docs-discovery.mjs').DocsCatalog} DocsCatalog
 */

/**
 * How far a read goes below the node it names, and how much of each doc below
 * it shows: `depth` levels (Infinity for every level), and `detail` brief (its
 * identity), or compact or full (with its text: a namespace's intro, a guide's
 * sections, a typed doc's content). `lang` selects the guides' language.
 * @typedef {object} DepthRead
 * @property {number} depth
 * @property {'brief' | 'compact' | 'full'} detail
 * @property {string | null} lang
 */

/**
 * The docs.node view of one tree node. Without a depth read, a namespace lists
 * its children one level down.
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {TreeNode} node
 * @param {DepthRead} [read] how far down to go, and how much of each doc below
 * @returns {Promise<import('../docs.type.mjs').DocsNode>}
 */
export async function nodeView(catalog, tree, node, read) {
  const {content} = await nodeContent(catalog, tree, node);
  const slots = node.slots.filter(slot => slot.children.length > 0);
  /** @type {import('../docs.type.mjs').DocsNode} */
  const view = {
    id: node.id,
    route: node.route,
    kind: node.kind,
    package: node.provider,
    title: node.title,
    summary: node.summary,
    ...stabilityOf(tree, node),
    breadcrumb: tree
      .ancestors(node)
      .map(ancestor => ({route: ancestor.route, title: ancestor.title})),
    slots: !read
      ? slots.map(slot => ({
          name: slot.name,
          title: slot.title,
          children: slot.children.map(route =>
            childIdentity(tree, /** @type {TreeNode} */ (tree.get(route))),
          ),
        }))
      : read.depth >= 1
        ? await slotsBelow(catalog, tree, slots, 1, read)
        : [],
    content,
    links: nodeLinks(tree, node),
  };
  if (read && read.depth < 1 && slots.length > 0) {
    view.childCount = countChildren(slots);
  }
  return view;
}

/**
 * `stability: 'experimental'` for a node whose doc is marked experimental, or
 * that sits under an experimental namespace (spec:AST-017 FR27), the way help
 * marks an experimental command; nothing for a stable one, so stable entries
 * read as they always have.
 * @param {DocsTree} tree
 * @param {TreeNode} node
 * @returns {{stability?: 'experimental'}}
 */
function stabilityOf(tree, node) {
  return isExperimentalTreeNode(tree, node) ? {stability: 'experimental'} : {};
}

/**
 * The fields every child carries: what it is, and the route that opens it.
 * @param {DocsTree} tree
 * @param {TreeNode} child
 * @returns {import('../docs.type.mjs').DocsNodeChild}
 */
function childIdentity(tree, child) {
  return {
    route: child.route,
    name: child.route.slice(child.route.lastIndexOf('/') + 1),
    package: child.guideOverlay?.replacement?.package ?? child.provider,
    // A guide an integration's doc took the place of names whose it was.
    ...(child.guideOverlay?.replacement
      ? {
          replaces: child.route,
          replacedPackage:
            child.guideOverlay.replacedPackage ?? child.provider,
        }
      : {}),
    kind: child.kind,
    title: child.title,
    summary: child.summary,
    ...stabilityOf(tree, child),
  };
}

/**
 * @param {TreeNode['slots']} slots
 * @returns {number}
 */
function countChildren(slots) {
  return slots.reduce((count, slot) => count + slot.children.length, 0);
}

/**
 * Slots read `level` levels below the named node: each child at the read's
 * detail, and its own slots while the read goes deeper.
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {TreeNode['slots']} slots
 * @param {number} level
 * @param {DepthRead} read
 * @returns {Promise<import('../docs.type.mjs').DocsNodeSlot[]>}
 */
async function slotsBelow(catalog, tree, slots, level, read) {
  return Promise.all(
    slots.map(async slot => ({
      name: slot.name,
      title: slot.title,
      children: await Promise.all(
        slot.children.map(route =>
          childBelow(
            catalog,
            tree,
            /** @type {TreeNode} */ (tree.get(route)),
            level,
            read,
          ),
        ),
      ),
    })),
  );
}

/**
 * One child of a depth read. Where the read stops, a child with docs below it
 * says how many, so a reader knows to go deeper.
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {TreeNode} child
 * @param {number} level
 * @param {DepthRead} read
 * @returns {Promise<import('../docs.type.mjs').DocsNodeChild>}
 */
async function childBelow(catalog, tree, child, level, read) {
  const view = childIdentity(tree, child);
  if (read.detail !== 'brief') {
    Object.assign(view, await childText(catalog, tree, child, read.lang));
  }
  const slots = child.slots.filter(slot => slot.children.length > 0);
  if (slots.length > 0) {
    if (level < read.depth) {
      view.slots = await slotsBelow(catalog, tree, slots, level + 1, read);
    } else {
      view.childCount = countChildren(slots);
    }
  }
  return view;
}

/**
 * A child's text: a guide's compiled sections, or the content of a namespace
 * or typed doc.
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {TreeNode} child
 * @param {string | null} lang
 * @returns {Promise<{content?: any[], sections?: any[]}>}
 */
async function childText(catalog, tree, child, lang) {
  if (child.kind === 'generic') {
    const entry = child.ref?.topicFile
      ? guideEntry(child)
      : child.ref?.flatTopic
        ? catalog.resolve(child.ref.flatTopic)
        : null;
    if (!entry) return {};
    return {
      sections: detailView(await compileTopic(catalog, entry, lang)).sections,
    };
  }
  const {content} = await nodeContent(catalog, tree, child);
  return {content};
}

/**
 * The moves a node offers (spec:AST-047): up to the level it sits in (the
 * topic list, for a top-level namespace), and across to the nodes before and
 * after it in its parent's slot.
 * @param {DocsTree} tree
 * @param {TreeNode} node
 * @returns {import('../docs.type.mjs').DocsLinks}
 */
function nodeLinks(tree, node) {
  const links = placeLinks(tree, node);
  const related = typedEdges(tree, node).routes;
  if (related.length > 0) {
    links.related = related.map(
      route =>
        /** @type {import('../docs.type.mjs').DocsCommand} */ (
          `astryx docs ${route}`
        ),
    );
  }
  return links;
}

/** @type {WeakMap<DocsTree, Map<string, string>>} */
const routeIndexes = new WeakMap();

/**
 * The route of each node, by its kind and name.
 * @param {DocsTree} tree
 * @returns {Map<string, string>}
 */
function routeIndex(tree) {
  let routes = routeIndexes.get(tree);
  if (!routes) {
    routes = new Map();
    for (const each of tree.nodes.values()) {
      routes.set(`${each.kind}\u0000${each.name}`, each.route);
    }
    routeIndexes.set(tree, routes);
  }
  return routes;
}

/**
 * The kinds of doc each typed field may name. A bare name in one of these
 * fields names a doc of the same provider and one of these kinds, so it is a
 * doc identity (spec:AST-047 FR9).
 */
const EDGE_KINDS = {
  function: {command: ['command'], related: ['function']},
  command: {fn: ['function'], related: ['command']},
};

/**
 * The typed edges a doc declares (spec:AST-047 FR5), resolved to routes: a
 * function doc's `command` and `related`, and a command doc's `fn` and
 * `related`. A bare name resolves among the kinds its field allows; a name
 * that matches docs of more than one allowed kind is an error, never a silent
 * pick. A `command` resolves to the command doc its leading words name, so
 * `integration add theme` (the `integration add` command with its kind
 * argument) opens `integration add`. Every name that resolves to no doc, or to
 * more than one, is returned in `unresolved`; the graph walk test fails on it,
 * so no edge a doc declares can go stale.
 * @param {DocsTree} tree
 * @param {TreeNode} node
 * @returns {{routes: string[], unresolved: string[]}}
 */
export function typedEdges(tree, node) {
  const doc = /** @type {any} */ (node.ref)?.selfDoc;
  /** @type {string[]} */
  const routes = [];
  /** @type {string[]} */
  const unresolved = [];
  const fields = /** @type {Record<string, string[]> | undefined} */ (
    /** @type {any} */ (EDGE_KINDS)[node.kind]
  );
  if (!doc || !fields) return {routes, unresolved};
  const index = routeIndex(tree);
  /** @param {string[]} kinds @param {string} name */
  const among = (kinds, name) =>
    kinds
      .map(kind => index.get(`${kind}\u0000${name}`))
      .filter(route => typeof route === 'string');
  for (const [field, kinds] of Object.entries(fields)) {
    const value = doc[field];
    const names = Array.isArray(value) ? value : value == null ? [] : [value];
    for (const name of names) {
      if (typeof name !== 'string' || name.trim() === '') continue;
      let found = among(kinds, name);
      if (found.length === 0 && field === 'command') {
        const words = name.trim().split(/\s+/);
        for (let n = words.length - 1; n > 0 && found.length === 0; n--) {
          found = among(kinds, words.slice(0, n).join(' '));
        }
      }
      if (found.length === 1) routes.push(/** @type {string} */ (found[0]));
      else if (found.length === 0) {
        unresolved.push(`${field} "${name}" names no ${kinds.join(' or ')} doc`);
      } else {
        unresolved.push(
          `${field} "${name}" names more than one doc (${found.join(', ')})`,
        );
      }
    }
  }
  return {
    routes: [...new Set(routes)].filter(route => route !== node.route),
    unresolved,
  };
}

/**
 * @param {string} route
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('../docs.type.mjs').DocsNodeResponse>}
 */
export async function node(route, options = {}) {
  const found = await resolveDocsArgument(route, options);
  if (found.kind !== 'node')
    throw await unknownTopicError(route, found.catalog);
  return {
    type: 'docs.node',
    // The docs tree names each node's npm package as its provider.
    package: found.node.provider,
    data: await nodeView(found.catalog, found.tree, found.node),
  };
}
