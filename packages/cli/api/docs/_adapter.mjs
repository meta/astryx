// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared doc-loading and topic-resolution helpers for the docs leaves.
 *
 * @input The project's doc catalog — the CLI's own
 *   packages/cli/assets/docs/{topic}.doc.mjs plus every topic the configured
 *   integrations contribute — and, when a --dense/--zh overlay is requested,
 *   the sibling {topic}.doc.dense.mjs / {topic}.doc.zh.mjs.
 * @output Catalog access, the compiler input for a topic, and the compiled
 *   node for it: lowered (overlaid, extensions merged, keys stamped) or linked
 *   (token references resolved too), memoized per catalog.
 * @position Sits beside docs.mjs (api/docs/). Hands topics to
 *   foundation/doc-compiler (which loads their files) and memoizes the nodes
 *   per catalog, so no leaf, doctor check or search loads, merges, or resolves
 *   docs on its own. Discovery itself lives in
 *   foundation/discovery/docs-discovery, which the catalog comes from.
 */

import * as path from 'node:path';
import {Project} from '../../foundation/config/project.mjs';
import {
  DocsCatalog,
  isGuideRoute,
  mergeTopicReport,
} from '../../foundation/discovery/docs-discovery.mjs';
import {checkDocTypes} from '../../foundation/discovery/doc-types.mjs';
import {integrationDocFiles} from '../../foundation/discovery/integration-doc-files.mjs';
import {
  linkReferenceTopic,
  lowerReferenceTopic,
} from '../../foundation/doc-compiler/compile.mjs';
import {
  deepFreeze,
  loadTopicFile,
  loadTopicInput,
  OVERLAY_LANGUAGES,
  overlayLanguages,
} from '../../foundation/doc-compiler/read.mjs';
import {
  buildDocsTree,
  isExperimentalTreeNode,
  loadTreeInputs,
} from '../../foundation/doc-compiler/tree.mjs';
import {sortDiagnostics} from '../../foundation/doc-compiler/diagnostics.mjs';
import {
  linkBlocks,
  linkFields,
  parseLinkTarget,
  renderTokens,
} from '../../foundation/doc-compiler/links.mjs';
import {
  createDocId,
  normalizeProviderId,
} from '../../foundation/identity/provider-identity.mjs';
import {
  cliDocIndex,
  cliDocSection,
} from '../../foundation/discovery/cli-self-docs.mjs';
import {
  AUTHORING_REFERENCE_ROUTE,
  EXPERIMENTAL_AUTHORING_ROUTE,
  isExperimentalSelfDoc,
  loadAuthoringSelfDocs,
  schemaFieldTable,
  selfDocSection,
} from '../../foundation/discovery/authoring-self-docs.mjs';
import {CLI_PROVIDER_ID} from '../../foundation/identity/providers.mjs';
import {
  CORE_PACKAGE,
  discoverOwnedComponents,
  discoverValidIntegrationComponents,
} from '../../foundation/discovery/component-discovery.mjs';
import {loadComponentDoc} from '../../foundation/discovery/component-loader.mjs';
import {
  discoverCoreTemplates,
  discoverIntegrationTemplatesForOne,
} from '../../foundation/discovery/template-adapter.mjs';
import {findCoreDir} from '../../foundation/fs/paths.mjs';
import {reusedWhileUnchanged} from '../../foundation/fs/read-record.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {orderRouteSuggestions} from '../../foundation/text/suggest-order.mjs';
import {formatCliCommand} from '../../foundation/env/package-manager.mjs';

export {OVERLAY_LANGUAGES, overlayLanguages};

/**
 * The project's topics: the built-in ones plus whatever the configured
 * integrations contribute.
 *
 * A docs read must not depend on a healthy project config. `astryx docs
 * tokens` answered without loading anything before integrations could
 * contribute topics, and it still answers when the config is unreadable — the
 * built-in topics are the floor, and the integration issues surface on the
 * commands that own them.
 *
 * @param {string} [cwd]
 * @returns {Promise<DocsCatalog>}
 */
export async function loadDocsCatalog(cwd = process.cwd()) {
  try {
    const project = await Project.load(cwd);
    return await project.docs();
  } catch {
    return DocsCatalog.fromBuiltins();
  }
}

/**
 * The overlay a read applies: none for the authored language.
 * @param {string | null | undefined} lang
 * @returns {string | null}
 */
function overlayLanguage(lang) {
  return lang && lang !== 'en' ? lang : null;
}

/** @type {WeakMap<DocsCatalog, Map<string, Promise<import('../../foundation/doc-compiler/compile.mjs').CompiledReferenceNode>>>} */
const loweredByCatalog = new WeakMap();

/**
 * One topic, lowered for `lang` with its links as written: overlaid,
 * extensions merged, keys stamped. Memoized per catalog, so a read that
 * references a topic twice loads it once. Every read of the catalog shares the
 * memoized node, so it is frozen; the lenses hand readers copies.
 * @param {DocsCatalog} catalog
 * @param {import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry} entry
 * @param {string | null} [lang]
 * @returns {Promise<import('../../foundation/doc-compiler/compile.mjs').CompiledReferenceNode>}
 */
function lowerRawTopic(catalog, entry, lang = null) {
  const overlay = overlayLanguage(lang);
  let cache = loweredByCatalog.get(catalog);
  if (!cache) {
    cache = new Map();
    loweredByCatalog.set(catalog, cache);
  }
  const key = `${entry.name.toLowerCase()}\u0000${overlay ?? ''}`;
  let lowered = cache.get(key);
  if (!lowered) {
    lowered = loadTopicInput(entry, overlay).then(input =>
      deepFreeze(lowerReferenceTopic(input)),
    );
    cache.set(key, lowered);
  }
  return lowered;
}

/**
 * @typedef {import('../../foundation/doc-compiler/tree.mjs').DocsTree} DocsTree
 * @typedef {import('../../foundation/doc-compiler/tree.mjs').TreeNode} TreeNode
 * @typedef {import('../../foundation/doc-compiler/links.mjs').LinkProblem} LinkProblem
 * @typedef {import('../../foundation/doc-compiler/links.mjs').LinkResolver} LinkResolver
 * @typedef {import('../../foundation/doc-compiler/links.mjs').DocIncluder} DocIncluder
 * @typedef {import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry} DocsTopicEntry
 */

/** @type {WeakMap<DocsCatalog, Map<string, Promise<{node: import('../../foundation/doc-compiler/compile.mjs').CompiledReferenceNode, problems: LinkProblem[]}>>>} */
const linkedByCatalog = new WeakMap();

/**
 * The CLI's own topics alone, for a check that runs without a project.
 * @returns {DocsCatalog}
 */
export function builtinCatalog() {
  return DocsCatalog.fromBuiltins();
}

/**
 * The provider id a topic's (or an extension's) links resolve against: its
 * owner's.
 * @param {{providerId?: string, package: string}} entry
 * @returns {string}
 */
function providerOf(entry) {
  return normalizeProviderId(entry.providerId ?? entry.package);
}

/**
 * The npm package that wrote each section of a lowered topic: the topic's own
 * package, or the package of the extension that contributed the section
 * (spec cli-surface INV28).
 * @param {DocsTopicEntry} entry
 * @param {{sectionProviders?: Record<string, string>}} node the lowered topic
 * @returns {(sectionId: string | undefined) => string}
 */
export function sectionPackageOf(entry, node) {
  /** @type {Map<string, string>} */
  const byProvider = new Map([[providerOf(entry), entry.package]]);
  for (const extension of entry.extensions ?? []) {
    byProvider.set(providerOf(extension), extension.package);
  }
  return sectionId => {
    const provider =
      sectionId == null ? undefined : node.sectionProviders?.[sectionId];
    return (
      (provider == null
        ? undefined
        : byProvider.get(normalizeProviderId(provider))) ?? entry.package
    );
  };
}

/**
 * One topic, lowered for `lang` with every link between docs resolved
 * (spec:AST-047 FR9): an inline `{@link <target>}` reads as the command that
 * opens its doc, and a `reference` block carries the doc it names and the
 * `content` it includes of it. Memoized per catalog and frozen, like the
 * lowered node.
 * @param {DocsCatalog} catalog
 * @param {DocsTopicEntry} entry
 * @param {string | null} [lang]
 * @returns {Promise<import('../../foundation/doc-compiler/compile.mjs').CompiledReferenceNode>}
 */
export async function lowerTopic(catalog, entry, lang = null) {
  return (await linkTopic(catalog, entry, lang)).node;
}

/**
 * Each link in a topic that names no doc.
 * @param {DocsCatalog} catalog
 * @param {DocsTopicEntry} entry
 * @returns {Promise<LinkProblem[]>}
 */
export async function topicLinkProblems(catalog, entry) {
  return (await linkTopic(catalog, entry, null)).problems;
}

/**
 * @param {DocsCatalog} catalog
 * @param {DocsTopicEntry} entry
 * @param {string | null} lang
 */
function linkTopic(catalog, entry, lang) {
  let cache = linkedByCatalog.get(catalog);
  if (!cache) {
    cache = new Map();
    linkedByCatalog.set(catalog, cache);
  }
  const key = `${entry.name.toLowerCase()}\u0000${overlayLanguage(lang) ?? ''}`;
  let linked = cache.get(key);
  if (!linked) {
    linked = (async () => {
      const raw = await lowerRawTopic(catalog, entry, lang);
      /** @type {Map<string, {resolve: LinkResolver, include: DocIncluder}>} */
      const linkers = new Map();
      /** @param {string} provider */
      const linkerFor = async provider => {
        let linker = linkers.get(provider);
        if (!linker) {
          linker = {
            resolve: await linkResolver(catalog, provider),
            include: await docIncluder(catalog, provider),
          };
          linkers.set(provider, linker);
        }
        return linker;
      };
      /** @type {LinkProblem[]} */
      const problems = [];
      const sections = [];
      // Each section resolves its links against the provider that wrote it:
      // an extension's sections against the extension's provider, never the
      // base topic's.
      for (const section of raw.doc.sections) {
        const provider = raw.sectionProviders?.[section.id];
        const {resolve, include} = await linkerFor(
          provider == null ? providerOf(entry) : normalizeProviderId(provider),
        );
        const linked = await linkBlocks(
          section.content,
          resolve,
          {section: section.id ?? section.title},
          include,
        );
        problems.push(...linked.problems);
        sections.push({...section, content: linked.content});
      }
      // The topic's own text outside its sections, its description and
      // summary, resolves against the topic's own provider.
      const {resolve} = await linkerFor(providerOf(entry));
      const fields = await linkFields(topicTextFields(raw.doc), resolve);
      problems.push(...fields.problems);
      return {
        node: deepFreeze({
          ...raw,
          doc: {...raw.doc, ...fields.doc, sections},
        }),
        problems,
      };
    })();
    cache.set(key, linked);
  }
  return linked;
}

/**
 * The text fields of a topic outside its sections: its description and
 * summary, those it has.
 * @param {any} doc
 * @returns {{description?: string, summary?: string}}
 */
function topicTextFields(doc) {
  /** @type {{description?: string, summary?: string}} */
  const fields = {};
  if (typeof doc?.description === 'string')
    fields.description = doc.description;
  if (typeof doc?.summary === 'string') fields.summary = doc.summary;
  return fields;
}

/**
 * One line of a doc's text, such as a topic's or a tree node's summary, with
 * every inline link resolved against the provider that wrote it (spec:AST-047
 * FR9). A link that names no doc prints as written; doctor names it.
 * @param {DocsCatalog} catalog
 * @param {string} providerId the provider id of the doc the text sits in
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function linkDocText(catalog, providerId, text) {
  if (typeof text !== 'string') return text;
  if (!text.includes('{@link')) return renderTokens(text);
  let provider;
  try {
    provider = normalizeProviderId(providerId);
  } catch {
    return text;
  }
  const linked = await linkFields(
    {description: text},
    await linkResolver(catalog, provider),
  );
  return linked.doc.description ?? text;
}

/**
 * A component doc with every inline link in its text fields resolved
 * (spec:AST-047 FR9): its description, usage, best practices, and each prop's
 * and example's description. Code fields are shown as written. A Core
 * component's links resolve against the CLI's own docs provider; an
 * integration's against that integration's.
 * @template T
 * @param {DocsCatalog} catalog
 * @param {string} providerId the provider id the component's links resolve
 *   against
 * @param {T} doc
 * @returns {Promise<{doc: T, problems: LinkProblem[]}>}
 */
export async function linkComponentDoc(catalog, providerId, doc) {
  // Doc tokens render in the same pass as links (resolveInline).
  if (!JSON.stringify(doc ?? null).includes('{@')) {
    return {doc, problems: []};
  }
  return linkFields(
    doc,
    await linkResolver(catalog, normalizeProviderId(providerId)),
  );
}

/**
 * The provider id a component's doc links resolve against: the CLI's own for
 * a Core component, else its owner package's (or the provider id its manifest
 * declares).
 * @param {string} ownerPackage
 * @param {string} [providerId]
 * @returns {string}
 */
export function componentLinkProvider(ownerPackage, providerId) {
  return ownerPackage === CORE_PACKAGE
    ? CLI_PROVIDER_ID
    : normalizeProviderId(providerId ?? ownerPackage);
}

/** @type {WeakMap<DocsCatalog, Promise<DocsTree>>} */
const treesByCatalog = new WeakMap();

/**
 * The project's docs tree: the CLI's own docs plus the namespace docs and
 * placed guides the configured integrations ship (spec:AST-046), built once
 * per catalog. Without integration docs it is the CLI's tree, built once per
 * process.
 * @param {DocsCatalog} catalog
 * @param {{fresh?: boolean}} [options] `fresh`: reread the CLI's tree files
 * @returns {Promise<DocsTree>}
 */
export function projectTree(catalog, {fresh = false} = {}) {
  let tree = treesByCatalog.get(catalog);
  if (!tree || fresh) {
    tree = buildProjectTree(catalog, fresh);
    treesByCatalog.set(catalog, tree);
  }
  return tree;
}

/** The CLI's own tree files, loaded again after one of them changes. */
const cliTreeInputs = reusedWhileUnchanged(() => loadTreeInputs());

/**
 * Every flat topic in the catalog, as the tree's topic levels read it.
 * @param {DocsCatalog} catalog
 * @returns {Promise<import('../../foundation/doc-compiler/tree.mjs').TreeTopicInput[]>}
 */
async function flatTopicInputs(catalog) {
  /** @type {import('../../foundation/doc-compiler/tree.mjs').TreeTopicInput[]} */
  const topics = [];
  for (const entry of catalog.entries()) {
    const aliases = catalog.aliasesOf(entry);
    let {title, description, category} = entry;
    if (title == null || description == null || category === undefined) {
      try {
        const file = await loadTopicFile(entry.path, null);
        title ??= file.doc?.title;
        description ??= file.doc?.description;
        category ??= file.doc?.category;
      } catch {
        // A topic that does not load is reported where it is read.
      }
    }
    topics.push({
      provider: entry.package,
      providerId: entry.providerId ?? entry.package,
      name: entry.name,
      title: title ?? entry.name,
      // Rendered once, with the tree's other summaries (buildProjectTree).
      summary: description ?? '',
      category: category ?? null,
      source: `${entry.package}:${entry.name}`,
      ...(aliases.length > 0 ? {aliases} : {}),
    });
  }
  return topics;
}

/**
 * The CLI's tree, each configured integration's namespaces and guides, and
 * every flat topic in the generated level for its category.
 * @param {DocsCatalog} catalog
 * @param {boolean} fresh
 * @returns {Promise<DocsTree>}
 */
async function buildProjectTree(catalog, fresh) {
  const added = catalog.treeInputs;
  const cli = await cliTreeInputs({fresh});
  const result = buildDocsTree({
    namespaces: [...cli.namespaces, ...added.flatMap(each => each.namespaces)],
    docs: [...cli.docs, ...added.flatMap(each => each.guides)],
    topics: await flatTopicInputs(catalog),
  });
  // A guide the tree places that an integration replaces or extends by its
  // route, or by the route it had before it moved: reads apply what it does,
  // and a replacement lists under its own title and summary.
  // Each doc applies in configured order to the guide its route names, so a
  // doc naming a guide's old route and one naming its new route stack as if
  // both named the same one.
  for (const record of catalog.guideTargeters) {
    const node = placedGuideAt(
      result,
      /** @type {string} */ (record.replaces ?? record.extendsTopic),
    );
    if (!node) continue;
    /** @type {import('../../foundation/discovery/docs-discovery.mjs').GuideOverlay} */
    const overlay = node.guideOverlay ?? {replacement: null, extensions: []};
    if (record.replaces != null) {
      node.guideOverlay = {
        replacement: record,
        // Extensions were authored against the content that just went away.
        extensions: [],
        ...(overlay.replacement
          ? {replacedPackage: overlay.replacement.package}
          : {}),
      };
    } else {
      node.guideOverlay = {
        ...overlay,
        extensions: [
          ...overlay.extensions,
          {
            package: record.package,
            path: record.path,
            ...(record.providerId ? {providerId: record.providerId} : {}),
          },
        ],
      };
    }
  }
  for (const node of result.nodes.values()) {
    const replacement = node.guideOverlay?.replacement;
    if (replacement) {
      node.title = replacement.title ?? node.title;
      node.summary = replacement.description ?? node.summary;
    }
  }
  // A summary is a doc's text too: each link in it reads as the command that
  // opens its doc, wherever the tree's summaries print (spec:AST-047 FR9).
  for (const node of result.nodes.values()) {
    if (typeof node.summary === 'string' && node.summary.includes('{@')) {
      const replacement = node.guideOverlay?.replacement;
      node.summary = await linkSummary(
        catalog,
        result,
        replacement
          ? (replacement.providerId ?? replacement.package)
          : node.providerId,
        node.summary,
      );
    }
  }
  return {
    ...result,
    diagnostics: sortDiagnostics([...cli.diagnostics, ...result.diagnostics]),
  };
}

/**
 * One summary with each inline link resolved to the command that opens its
 * doc, against the provider that wrote it. A link that names no doc prints as
 * written; doctor names it where it checks the doc's own fields.
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {string} providerId
 * @param {string} summary
 * @returns {Promise<string>}
 */
async function linkSummary(catalog, tree, providerId, summary) {
  if (!summary.includes('{@link')) return renderTokens(summary);
  let provider;
  try {
    provider = normalizeProviderId(providerId);
  } catch {
    return summary;
  }
  const find = docFinderOver(catalog, tree, provider, false);
  const linked = await linkFields({summary}, async target => {
    const found = await find(target);
    return 'problem' in found ? found : found.link;
  });
  return linked.doc.summary;
}

/** @type {WeakMap<DocsTree, Map<string, TreeNode>>} */
const identitiesByTree = new WeakMap();

/** @param {string} provider @param {string} kind @param {string} name */
function identityKey(provider, kind, name) {
  return `${provider}\u0000${kind}\u0000${kind === 'generic' ? name.toLowerCase() : name}`;
}

/**
 * Every tree node with an identity, by provider id, kind, and name.
 * @param {DocsTree} tree
 */
function identitiesOf(tree) {
  let index = identitiesByTree.get(tree);
  if (!index) {
    index = new Map();
    for (const node of tree.nodes.values()) {
      if (node.id == null) continue;
      let provider = node.providerId;
      try {
        provider = normalizeProviderId(node.providerId);
      } catch {
        // Kept as given; a link names it the same way.
      }
      index.set(identityKey(provider, node.kind, node.name), node);
    }
    identitiesByTree.set(tree, index);
  }
  return index;
}

/**
 * The CLI's authoring docs, by kind and name. The field reference under
 * `astryx docs authoring` reads each as one section keyed by its name, so a
 * link to one opens that section. Loaded again after one of them changes,
 * like the CLI's tree files.
 */
const authoringDocs = reusedWhileUnchanged(() =>
  loadAuthoringSelfDocs().then(
    ({loaded}) =>
      new Map(loaded.map(({doc}) => [`${doc.type}\u0000${doc.name}`, doc])),
  ),
);

/**
 * The CLI authoring doc a link names. The `authoring` namespace is the CLI's
 * own, so no integration can take its route.
 * @param {string} kind
 * @param {string} name
 * @returns {Promise<any | null>}
 */
async function authoringDoc(kind, name) {
  return (await authoringDocs()).get(`${kind}\u0000${name}`) ?? null;
}

/**
 * A doc a link found: what a read shows of the link, and the typed doc behind
 * it when a reference block can include it.
 * @typedef {object} FoundDoc
 * @property {import('../../foundation/doc-compiler/links.mjs').DocLink} link
 * @property {string} kind the doc's kind
 * @property {{doc: any, providerId: string, tree: boolean} | null} typed a
 *   schema, command, function, or enum doc: a leaf of the docs tree (`tree`),
 *   or a section of `astryx docs authoring`; null for any other kind
 */

/**
 * How a doc's links find their targets (spec:AST-047 FR9): a doc in the
 * project's docs tree by its identity, a CLI authoring doc (a section of
 * `astryx docs authoring`), or a flat topic by its provider and name. A
 * target that matches none is a problem, never a guess.
 * @param {DocsCatalog} catalog
 * @param {string} fromProvider the provider id of the doc the links sit in
 * @returns {Promise<(target: string) => Promise<FoundDoc | {problem: string}>>}
 */
async function docFinder(catalog, fromProvider) {
  return docFinderOver(catalog, await projectTree(catalog), fromProvider);
}

/**
 * {@link docFinder} over a tree already built, so building the tree can
 * resolve the links in its own summaries.
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {string} fromProvider
 * @param {boolean} [summaries] resolve the links in a found flat topic's
 *   summary; off while a summary is itself being resolved, so two summaries
 *   that link each other cannot loop
 * @returns {(target: string) => Promise<FoundDoc | {problem: string}>}
 */
function docFinderOver(catalog, tree, fromProvider, summaries = true) {
  const identities = identitiesOf(tree);
  return async target => {
    const parsed = parseLinkTarget(target);
    if ('error' in parsed)
      return {
        problem: bareLinkHint(
          parsed.error,
          target,
          catalog,
          identities,
          fromProvider,
        ),
      };
    let provider;
    try {
      provider = normalizeProviderId(parsed.provider ?? fromProvider);
    } catch {
      return {
        problem: `"${target}" names "${parsed.provider}", which is not a provider id: an npm package name, or the \`providerId\` its manifest declares`,
      };
    }
    const node = identities.get(
      identityKey(provider, parsed.kind, parsed.name),
    );
    if (node) {
      return {
        link: {
          target,
          id: /** @type {string} */ (node.id),
          route: node.route,
          title: node.title,
          summary: node.summary,
          command: `astryx docs ${node.route}`,
        },
        kind: node.kind,
        typed: node.ref?.selfDoc
          ? {doc: node.ref.selfDoc, providerId: node.providerId, tree: true}
          : null,
      };
    }
    const authored =
      provider === CLI_PROVIDER_ID
        ? await authoringDoc(parsed.kind, parsed.name)
        : null;
    if (authored) {
      // An experimental schema is a section of its experimental route, not
      // of the field reference (spec:AST-084 FR0).
      const experimental = isExperimentalSelfDoc(authored);
      const route = experimental
        ? EXPERIMENTAL_AUTHORING_ROUTE
        : AUTHORING_REFERENCE_ROUTE;
      return {
        link: {
          target,
          id: createDocId(provider, authored.type, authored.name),
          route,
          title: authored.displayName ?? authored.name,
          summary: renderTokens(authored.description ?? ''),
          command: `astryx docs ${experimental ? route : 'authoring'} ${authored.name}`,
        },
        kind: parsed.kind,
        typed: {doc: authored, providerId: CLI_PROVIDER_ID, tree: false},
      };
    }
    if (parsed.kind === 'generic') {
      const entry = catalog.resolve(parsed.name);
      if (
        entry &&
        !entry.tree &&
        (providerOf(entry) === provider ||
          catalog.aliasesOf(entry).includes(parsed.name.toLowerCase()))
      ) {
        let title = entry.title ?? entry.name;
        let summary = entry.description ?? '';
        try {
          const raw = await lowerRawTopic(catalog, entry);
          title = raw.doc.title ?? title;
          summary = raw.doc.description ?? summary;
          if (summaries) {
            summary = await linkSummary(
              catalog,
              tree,
              providerOf(entry),
              summary,
            );
          }
        } catch {
          // The topic budget check reports a topic that does not load; the
          // link still opens it.
        }
        return {
          link: {
            target,
            id: createDocId(provider, 'generic', parsed.name),
            route: entry.name,
            title,
            summary,
            command: `astryx docs ${entry.name}`,
          },
          kind: 'generic',
          typed: null,
        };
      }
    }
    if (CONTRIBUTED_KINDS.has(parsed.kind)) {
      const link = await contributedDocLink(
        catalog,
        provider,
        parsed.kind,
        parsed.name,
      );
      if (link) {
        // The summary is the target doc's own text, so its links resolve
        // against the target's provider, never the linking doc's: a Core
        // component's against the CLI's docs, like its other fields.
        // contributedDocLink returns the authored text; it renders once here.
        if (summaries && link.summary.includes('{@')) {
          link.summary = await linkSummary(
            catalog,
            tree,
            provider === CORE_COMPONENT_PROVIDER ? CLI_PROVIDER_ID : provider,
            link.summary,
          );
        } else {
          link.summary = renderTokens(link.summary);
        }
        return {link: {target, ...link}, kind: parsed.kind, typed: null};
      }
    }
    const searchType =
      parsed.kind === 'component'
        ? 'component'
        : parsed.kind === 'page' || parsed.kind === 'block'
          ? 'template'
          : 'doc';
    return {
      problem: `"${target}" names no doc. Find it with \`astryx search ${parsed.name} --type ${searchType}\`, then name it as \`[<provider>:]<kind>:<name>\`.`,
    };
  };
}

/**
 * What a link written as a bare name (`{@link deploying}`) should say
 * instead: the exact target to write when a topic or tree doc has that
 * name, or that none does.
 * @param {string} error the parse error
 * @param {string} target the target as written
 * @param {DocsCatalog} catalog
 * @param {Map<string, any>} identities
 * @param {string} fromProvider
 * @returns {string}
 */
function bareLinkHint(error, target, catalog, identities, fromProvider) {
  const name = typeof target === 'string' ? target.trim() : '';
  if (!name || name.includes(':') || /\s/.test(name)) return error;
  /** @param {string} provider */
  const normal = provider => {
    try {
      return normalizeProviderId(provider);
    } catch {
      return provider;
    }
  };
  const from = normal(fromProvider);
  /** @param {string} provider @param {string} kind @param {string} named */
  const written = (provider, kind, named) =>
    `{@link ${normal(provider) === from ? '' : `${provider}:`}${kind}:${named}}`;
  const entry = catalog.resolve(name);
  if (entry) {
    return `${error}. "${name}" is a topic: write \`${written(entry.providerId ?? entry.package, 'generic', entry.name)}\`.`;
  }
  const node = [...identities.values()].find(
    each => String(each.name).toLowerCase() === name.toLowerCase(),
  );
  if (node) {
    return `${error}. "${name}" is a ${node.kind === 'generic' ? 'topic' : `${node.kind} doc`}: write \`${written(node.providerId, node.kind, node.name)}\`.`;
  }
  return `${error}, and no topic is named "${name}". Link a doc that exists, as \`{@link generic:<topic>}\` (\`astryx docs\` lists the topics), or remove the link.`;
}

/** The provider Core's components and templates belong to. */
const CORE_COMPONENT_PROVIDER = (() => {
  try {
    return normalizeProviderId(CORE_PACKAGE);
  } catch {
    return CORE_PACKAGE;
  }
})();

/** The doc kinds no docs tree holds: components and templates. */
const CONTRIBUTED_KINDS = new Set(['component', 'page', 'block']);

/**
 * The link to a component, page, or block doc (spec:AST-047 FR9). No docs tree
 * holds these, so a link finds them among the component and template records
 * the catalog carries, the ones `astryx component` and `astryx template` open,
 * and reads as that command. A component is named by its export name, a
 * template by its id; anything but Core's names its package.
 * @param {DocsCatalog} catalog
 * @param {string} provider normalized provider id
 * @param {string} kind `component`, `page`, or `block`
 * @param {string} name
 * @returns {Promise<Omit<import('../../foundation/doc-compiler/links.mjs').DocLink, 'target'> | null>}
 */
async function contributedDocLink(catalog, provider, kind, name) {
  const contributions = await catalog.contributions();
  if (!contributions) return null;
  const sameProvider = (/** @type {string} */ providerId) => {
    try {
      return normalizeProviderId(providerId) === provider;
    } catch {
      return false;
    }
  };
  if (kind === 'component') {
    const record = contributions.components.find(
      component =>
        component.name === name && sameProvider(component.providerId),
    );
    if (!record) return null;
    /** @type {any} */
    let doc = null;
    try {
      doc = record.docPath ? await loadComponentDoc(record.docPath) : null;
    } catch {
      // The component checks report a doc that does not load; the link
      // still opens the component.
    }
    const entry =
      doc?.name === name
        ? doc
        : doc?.components?.find(
            (/** @type {any} */ each) => each.name === name,
          );
    // Bare, Core's name opens Core's component unless another package ships
    // the same name or replaces it (spec:AST-035 FR11); then the link selects
    // Core, as it always selects any other package.
    const selectPackage =
      record.package !== CORE_PACKAGE ||
      contributions.components.some(
        other =>
          other.package !== CORE_PACKAGE &&
          (other.name === name || other.replaces === name),
      );
    return {
      id: createDocId(provider, 'component', name),
      route: null,
      title: entry?.displayName ?? name,
      summary: entry?.description ?? doc?.description ?? '',
      command: `astryx component ${name}${selectPackage ? ` --package ${record.package}` : ''}`,
    };
  }
  const template = contributions.templates.find(
    each =>
      each.type === kind && each.id === name && sameProvider(each.providerId),
  );
  if (!template) return null;
  // The same for a Core template: another package's template of its kind
  // with its id, or one that replaces it, takes the bare id.
  const selectPackage =
    template.package !== CORE_PACKAGE ||
    contributions.templates.some(
      other =>
        other.package !== CORE_PACKAGE &&
        other.type === template.type &&
        (other.id === name || other.replaces === name),
    );
  return {
    id: createDocId(provider, template.type, name),
    route: null,
    title: template.displayName ?? template.name,
    summary: template.description ?? '',
    command: `astryx template ${name} --type ${template.type}${selectPackage ? ` --package ${template.package}` : ''}`,
  };
}

/**
 * The component and template docs one integration package's links can name:
 * Core's and its own, as `doctor integration docs` checks it before any app
 * configures it.
 * @param {any} integration a loaded integration: its name, provider id, roots,
 *   and package directory
 * @returns {Promise<import('../../foundation/discovery/docs-discovery.mjs').LinkableContributions>}
 */
async function packageContributions(integration) {
  const own = integration.providerId ?? integration.name;
  /** @type {import('../../foundation/discovery/docs-discovery.mjs').LinkableComponent[]} */
  const components = [];
  const coreDir = findCoreDir(integration.__packageDir ?? process.cwd());
  if (coreDir) {
    try {
      for (const record of discoverOwnedComponents(coreDir, [])) {
        components.push({
          providerId: CORE_PACKAGE,
          package: CORE_PACKAGE,
          name: record.name,
          docPath: record.docPath,
        });
      }
    } catch {
      // The components check reports a Core it cannot read.
    }
  }
  if (integration.components) {
    try {
      const {components: records} =
        await discoverValidIntegrationComponents(integration);
      for (const record of records) {
        components.push({
          providerId: own,
          package: integration.name,
          name: record.name,
          docPath: record.docPath,
          // Declared: this package alone cannot tell whether an app applies
          // it, so a link to the Core name it names selects Core.
          ...(typeof record.replaces === 'string'
            ? {replaces: record.replaces}
            : {}),
        });
      }
    } catch {
      // `validate` reports components that do not load.
    }
  }
  /** @type {import('../../foundation/discovery/docs-discovery.mjs').LinkableTemplate[]} */
  const templates = [];
  /** @param {any} template @param {string} providerId @param {string} pkg */
  const addTemplate = (template, providerId, pkg) => {
    if (template.type !== 'page' && template.type !== 'block') return;
    templates.push({
      providerId,
      package: pkg,
      type: template.type,
      id: template.dirName,
      name: template.name,
      ...(template.displayName == null
        ? {}
        : {displayName: template.displayName}),
      ...(template.description == null
        ? {}
        : {description: template.description}),
      ...(typeof template.replaces === 'string'
        ? {replaces: template.replaces}
        : {}),
    });
  };
  try {
    for (const template of await discoverCoreTemplates()) {
      addTemplate(template, CORE_PACKAGE, CORE_PACKAGE);
    }
  } catch {
    // Core templates that do not load leave nothing to link to.
  }
  if (integration.templates) {
    try {
      const {templates: records} =
        await discoverIntegrationTemplatesForOne(integration);
      for (const template of records)
        addTemplate(template, own, integration.name);
    } catch {
      // `validate` reports templates that do not load.
    }
  }
  return {components, templates};
}

/**
 * How a doc's links find their targets (spec:AST-047 FR9), as
 * {@link docFinder} finds them: each resolves to the link a read shows.
 * @param {DocsCatalog} catalog
 * @param {string} fromProvider the provider id of the doc the links sit in
 * @returns {Promise<LinkResolver>}
 */
export async function linkResolver(catalog, fromProvider) {
  const find = await docFinder(catalog, fromProvider);
  return async target => {
    const found = await find(target);
    return 'problem' in found ? found : found.link;
  };
}

/** How a problem names a doc kind that a reference block cannot include. */
const KIND_NAMES = /** @type {Record<string, string>} */ ({
  generic: 'topic',
  namespace: 'namespace',
});

/**
 * How a topic's reference blocks include the docs they name (spec:AST-047
 * FR9): a schema, command, function, or enum doc as `astryx docs` prints
 * it, narrowed by the block's projection and presentation, with the included
 * doc's own links resolved against its own provider. Any other doc shows its
 * title and summary. Each part a block names that it cannot include is a
 * problem, and a read marks where it is missing; a target that names no doc
 * is the resolver's problem.
 * @param {DocsCatalog} catalog
 * @param {string} fromProvider the provider id of the doc the blocks sit in
 * @returns {Promise<DocIncluder>}
 */
async function docIncluder(catalog, fromProvider) {
  const find = await docFinder(catalog, fromProvider);
  const tree = await projectTree(catalog);
  return async block => {
    const found = await find(block.target);
    if ('problem' in found) return {content: [], problems: []};
    return includedContent(catalog, tree, block, found);
  };
}

/**
 * What one reference block includes of the doc it found.
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {any} block
 * @param {FoundDoc} found
 * @returns {Promise<{content: any[], problems: string[]}>}
 */
async function includedContent(catalog, tree, block, found) {
  /** @type {string[]} */
  const problems = [];
  const {fields, sections} = block.projection ?? {};
  const presentation = block.presentation ?? 'full';
  if (sections != null) {
    problems.push(
      'projection.sections: a reference block does not include topic sections; reference a schema, command, function, or enum doc, and name the fields of a schema with projection.fields',
    );
  }
  const typed = found.typed;
  if (typed == null) {
    // A reference shows any other doc only by its title and summary.
    if (fields != null || (block.presentation ?? 'summary') !== 'summary') {
      problems.push(
        `"${block.target}" is a ${KIND_NAMES[found.kind] ?? `${found.kind} doc`}, which a reference block shows only by its title and summary; remove the projection and the presentation, or reference a schema, command, function, or enum doc`,
      );
    }
    return {content: [], problems};
  }
  if (presentation === 'summary') {
    if (fields != null) {
      problems.push(
        "projection.fields: a summary includes no fields; remove projection.fields or presentation: 'summary'",
      );
    }
    return {content: [], problems};
  }
  /** @type {any[]} */
  let content;
  if (fields != null && typed.doc.type === 'schema') {
    /** @type {Map<string, any>} */
    const byName = new Map(
      (typed.doc.fields ?? []).map((/** @type {any} */ field) => [
        field.name,
        field,
      ]),
    );
    const selected = [];
    /** @type {any[]} */
    const missing = [];
    for (const name of fields) {
      const field = byName.get(name);
      if (field) {
        selected.push(field);
        continue;
      }
      problems.push(
        `projection.fields: "${name}" is not a field of ${found.link.title} (${block.target}). Its fields: ${[...byName.keys()].join(', ')}`,
      );
      missing.push({
        type: 'prose',
        text: `[reference: field "${name}" not found in "${block.target}"]`,
      });
    }
    const table = schemaFieldTable(selected);
    content = [...(table ? [table] : []), ...missing];
  } else {
    if (fields != null) {
      problems.push(
        `projection.fields: names the fields of a schema doc, and "${block.target}" is a ${typed.doc.type} doc; remove it to include the whole doc`,
      );
    }
    content = typed.tree
      ? cliDocSection(typed.doc, typedDocIndex(tree)).content
      : selfDocSection(typed.doc).content;
  }
  if (presentation === 'compact') {
    content = content.filter(each => each?.type !== 'code');
  }
  // The included doc's own links resolve against its own provider. A link in
  // it that names no doc is that doc's problem, reported where it is written.
  const linked = await linkBlocks(
    content,
    await linkResolver(catalog, typed.providerId),
  );
  return {content: linked.content, problems};
}

/**
 * Every link in the project's docs that names no doc: in each topic, each
 * guide the tree places, and each typed doc.
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {{owner?: string, references?: boolean}} [options] `owner`: only the
 *   docs this package owns. `references`: instead of the links, each reference
 *   block that cannot include what it names; a reader loses that content,
 *   where a link that names no doc still prints as written
 * @returns {Promise<string[]>}
 */
export async function docsLinkProblems(
  catalog,
  tree,
  {owner, references = false} = {},
) {
  /** @type {string[]} */
  const problems = [];
  /** @param {string} where @param {LinkProblem[]} found */
  const note = (where, found) => {
    for (const problem of found) {
      if ((problem.include === true) !== references) continue;
      problems.push(
        `${where}${problem.section ? ` \u00a7 ${problem.section}` : ''}${problem.field ? ` (${problem.field})` : ''}: ${problem.message}`,
      );
    }
  };
  for (const entry of catalog.entries()) {
    // A package owns a topic it wrote, and the sections it adds to another
    // package's topic.
    if (
      owner != null &&
      entry.package !== owner &&
      !entry.extensions.some(extension => extension.package === owner)
    ) {
      continue;
    }
    try {
      note(entry.name, await topicLinkProblems(catalog, entry));
    } catch {
      // The topic budget check reports a topic that does not load.
    }
  }
  for (const node of tree.nodes.values()) {
    // A package owns a guide it placed, and a guide it replaces or extends by
    // its route.
    if (
      owner != null &&
      node.provider !== owner &&
      node.guideOverlay?.replacement?.package !== owner &&
      !node.guideOverlay?.extensions.some(each => each.package === owner)
    ) {
      continue;
    }
    if (node.kind === 'generic' && node.ref?.topicFile) {
      try {
        note(node.route, await topicLinkProblems(catalog, guideEntry(node)));
      } catch {
        // As above.
      }
    } else if (node.ref?.selfDoc) {
      note(node.route, (await nodeContent(catalog, tree, node)).problems);
    }
  }
  return problems;
}

/**
 * The catalog one integration package's docs and links read, as doctor checks
 * it before any app configures it: the CLI's topics, Core's and the package's
 * components and templates, and the package's own docs.
 * @param {any} integration
 * @param {{records: import('../../foundation/discovery/docs-discovery.mjs').DocsTopicRecord[], namespaces: import('../../foundation/doc-compiler/tree.mjs').TreeNamespaceInput[], guides: import('../../foundation/doc-compiler/tree.mjs').TreeDocInput[]} | null} discovered
 * @returns {DocsCatalog}
 */
function packageCatalog(integration, discovered) {
  const catalog = DocsCatalog.fromBuiltins();
  catalog.setContributions(() => packageContributions(integration));
  if (discovered) {
    for (const record of discovered.records) catalog.add(record);
    catalog.addTreeInputs({
      namespaces: discovered.namespaces.map(input => ({...input, rank: 1})),
      guides: discovered.guides.map(input => ({...input, rank: 1})),
    });
  }
  return catalog;
}

/**
 * What \`astryx doctor integration components\` checks of the links in one
 * integration's own component docs (spec:AST-047 FR9): each link in a
 * description, usage, best practice, or prop's or example's description that
 * names no doc. It prints as written, so each is a warning.
 * @param {any} integration a loaded integration
 * @param {Parameters<typeof packageCatalog>[1]} discovered the package's own
 *   docs, which its components' links may name; null when it ships none
 * @returns {Promise<Array<{severity: 'warning', message: string}>>}
 */
export async function packageComponentLinkProblems(integration, discovered) {
  // A package with no provider id (its manifest's, else its name) links
  // nothing, as on the read path: its text reads as written, so there is
  // nothing to report.
  try {
    normalizeProviderId(integration.providerId ?? integration.name);
  } catch {
    return [];
  }
  const catalog = packageCatalog(integration, discovered);
  return (await componentLinkProblems(catalog, integration.name)).map(
    message => ({severity: /** @type {const} */ ('warning'), message}),
  );
}

/**
 * Each link in a package's own component docs that names no doc. A family doc
 * that documents several components is read once.
 * @param {DocsCatalog} catalog
 * @param {string} owner the package whose component docs are read
 * @returns {Promise<string[]>}
 */
async function componentLinkProblems(catalog, owner) {
  const contributions = await catalog.contributions();
  /** @type {string[]} */
  const problems = [];
  const seen = new Set();
  for (const record of contributions?.components ?? []) {
    if (record.package !== owner || !record.docPath) continue;
    if (seen.has(record.docPath)) continue;
    seen.add(record.docPath);
    /** @type {any} */
    let doc;
    try {
      doc = await loadComponentDoc(record.docPath);
    } catch {
      // The components check reports a doc that does not load.
      continue;
    }
    let provider;
    try {
      provider = componentLinkProvider(record.package, record.providerId);
    } catch {
      // An owner that is not a provider id links nothing (as on the read
      // path); its text reads as written.
      continue;
    }
    const linked = await linkComponentDoc(catalog, provider, doc);
    const name = typeof doc?.name === 'string' ? doc.name : record.name;
    for (const problem of linked.problems) {
      problems.push(
        `component ${name}${problem.field ? ` (${problem.field})` : ''}: ${problem.message}`,
      );
    }
  }
  return problems;
}

/**
 * What \`astryx doctor integration docs\` checks in one integration's docs: the
 * docs tree they build beside the CLI's (namespaces, placements, routes) and
 * every link in them (spec:AST-046, spec:AST-047). A tree problem hides a doc,
 * so it is an error; a link that names no doc prints as written, so it is a
 * warning.
 * @param {{name: string}} integration
 * @param {{records: import('../../foundation/discovery/docs-discovery.mjs').DocsTopicRecord[], namespaces: import('../../foundation/doc-compiler/tree.mjs').TreeNamespaceInput[], guides: import('../../foundation/doc-compiler/tree.mjs').TreeDocInput[]}} discovered
 * @returns {Promise<Array<{severity: 'error' | 'warning', message: string}>>}
 */
export async function packageDocsProblems(integration, discovered) {
  const catalog = packageCatalog(integration, discovered);
  const tree = await projectTree(catalog);
  /** @type {Array<{severity: 'error' | 'warning', message: string}>} */
  const problems = tree.diagnostics
    .filter(d => d.severity === 'error' && d.provider === integration.name)
    .map(d => ({
      severity: /** @type {const} */ ('error'),
      message: `${d.source ?? integration.name}: ${d.message}`,
    }));
  for (const message of await docsLinkProblems(catalog, tree, {
    owner: integration.name,
  })) {
    problems.push({severity: 'warning', message});
  }
  return problems;
}

/**
 * The guide the docs tree places at a route, compared without case, or at the
 * route it moved to; null when the route holds no placed guide.
 * @param {DocsTree} tree
 * @param {string} route
 * @returns {TreeNode | null}
 */
function placedGuideAt(tree, route) {
  const node =
    tree.get(route) ?? tree.getFolded(route) ?? movedRoute(route, tree);
  return node?.kind === 'generic' && node.ref?.topicFile ? node : null;
}

/**
 * The routes of every guide the tree places below a namespace, nearest first,
 * in reading order.
 * @param {DocsTree} tree
 * @param {TreeNode} namespace
 * @returns {string[]}
 */
function placedGuidesBelow(tree, namespace) {
  /** @type {string[]} */
  const routes = [];
  /** @type {TreeNode[]} */
  let level = [namespace];
  while (level.length > 0) {
    /** @type {TreeNode[]} */
    const next = [];
    for (const parent of level) {
      for (const slot of parent.slots) {
        for (const route of slot.children) {
          const child = tree.get(route);
          if (!child || child.parent !== parent.route) continue;
          if (child.kind === 'generic' && child.ref?.topicFile) {
            routes.push(child.route);
          }
          if (child.slots.length > 0) next.push(child);
        }
      }
    }
    level = next;
  }
  return routes;
}

/**
 * What one doc that replaces or extends another does, as a package's own
 * check sees it.
 * @typedef {object} DocTarget
 * @property {string} topic the doc's own name
 * @property {'replaces' | 'extends'} relationship
 * @property {string} target the topic name or route it names
 * @property {'topic' | 'guide' | 'namespace' | null} kind what the target
 *   is: a flat topic, a guide the docs tree places, a namespace (which neither
 *   takes), or null when it names nothing
 * @property {string | null} guide for a guide, the route it is placed at now,
 *   which an old route resolves to
 * @property {string[]} guidesBelow for a namespace, the routes of the guides
 *   placed below it, any of which the doc could name instead
 * @property {string | null} owner the package whose topic or guide it is
 * @property {Array<{section: string, field: 'before' | 'after', key: string}>} unplaced
 *   each section whose `before` or `after` names no section of the target, so
 *   it is added at the end instead
 */

/**
 * Each doc in one integration's docs that replaces or extends a topic, or a
 * guide the docs tree places by its route, read against the CLI's docs and the
 * package's own: what it names and whether that exists, and each section an
 * extension places with `before` or `after` that finds no section there.
 * @param {any} integration
 * @param {{records: import('../../foundation/discovery/docs-discovery.mjs').DocsTopicRecord[], namespaces: import('../../foundation/doc-compiler/tree.mjs').TreeNamespaceInput[], guides: import('../../foundation/doc-compiler/tree.mjs').TreeDocInput[]}} discovered
 * @returns {Promise<DocTarget[]>}
 */
export async function packageDocTargets(integration, discovered) {
  const catalog = packageCatalog(integration, discovered);
  const tree = await projectTree(catalog);
  /** @type {DocTarget[]} */
  const targets = [];
  for (const record of discovered.records) {
    const relationship = record.replaces != null ? 'replaces' : 'extends';
    const target =
      relationship === 'replaces' ? record.replaces : record.extendsTopic;
    if (target == null) continue;
    /** @type {DocTarget['kind']} */
    let kind = null;
    /** @type {string | null} */
    let owner = null;
    /** @type {string | null} */
    let basePath = null;
    /** @type {ReadonlyArray<{path: string}>} every extension of the target, in configured order */
    let extensions = [];
    /** @type {string[]} */
    let guidesBelow = [];
    /** @type {string | null} */
    let guide = null;
    if (isGuideRoute(target)) {
      const node = placedGuideAt(tree, target);
      if (node) {
        kind = 'guide';
        guide = node.route;
        owner = node.provider;
        basePath = node.guideOverlay?.replacement?.path ?? node.ref.topicFile;
        extensions = node.guideOverlay?.extensions ?? [];
      }
    } else {
      // A replacement already holds the topic's place in the catalog, and
      // names the package it took it from.
      const entry = catalog.resolve(target);
      if (entry?.path === record.path) {
        kind = 'topic';
        owner = entry.replacedPackage ?? null;
      } else if (entry) {
        kind = 'topic';
        owner = entry.package;
        basePath = entry.path;
        extensions = entry.extensions;
      }
    }
    if (kind == null) {
      // A namespace holds no sections to take over or merge onto; the guides
      // below it do.
      const node =
        tree.get(target) ?? tree.getFolded(target) ?? movedRoute(target, tree);
      if (node?.kind === 'namespace') {
        kind = 'namespace';
        owner = node.provider;
        guidesBelow = placedGuidesBelow(tree, node);
      }
    }
    /** @type {DocTarget['unplaced']} */
    let unplaced = [];
    if (relationship === 'extends' && basePath != null) {
      // Merge every extension in configured order, as a read does, so a key
      // an earlier extension adds counts as a section of the target.
      let doc = (await loadTopicFile(basePath, null)).doc;
      for (const extension of extensions) {
        if (doc == null) break;
        const file = (await loadTopicFile(extension.path, null)).doc;
        if (file == null) continue;
        const merged = mergeTopicReport(doc, file);
        if (extension.path === record.path) {
          unplaced = merged.unplaced;
          break;
        }
        doc = merged.doc;
      }
    }
    targets.push({
      topic: record.name,
      relationship,
      target,
      kind,
      owner,
      guide,
      guidesBelow,
      unplaced,
    });
  }
  return targets;
}

/**
 * How a token reference finds its target: the topic it names in `catalog`,
 * lowered for the same language.
 * @param {DocsCatalog} catalog
 * @param {string | null} lang
 * @returns {(topic: string) => Promise<import('../../foundation/doc-compiler/compile.mjs').CompiledReferenceNode | null>}
 */
export function referenceTargets(catalog, lang) {
  return async topic => {
    const target = catalog.resolve(topic);
    if (target) return lowerTopic(catalog, target, lang);
    return namespaceReferenceTarget(catalog, topic, lang);
  };
}

/**
 * A docs-tree namespace as the target of a token reference: every guide placed
 * below it, lowered for `lang` and read in tree order as one topic. A flat
 * topic split into a namespace keeps answering the references its readers
 * wrote, so `{type: 'token-ref', topic: 'tokens', section: 'Color Tokens'}`
 * finds the guide that now holds that table. Null for any other route.
 * @param {DocsCatalog} catalog
 * @param {string} route
 * @param {string | null} lang
 * @returns {Promise<import('../../foundation/doc-compiler/compile.mjs').CompiledReferenceNode | null>}
 */
async function namespaceReferenceTarget(catalog, route, lang) {
  const tree = await projectTree(catalog);
  const node = tree.get(route) ?? tree.getFolded(route);
  if (!node || node.kind !== 'namespace' || node.generated) return null;
  /** @type {any[]} */
  const sections = [];
  /** @type {Record<string, string>} */
  const sourceTitles = {};
  /** @param {TreeNode} parent */
  const walk = async parent => {
    for (const slot of parent.slots) {
      for (const childRoute of slot.children) {
        const child = tree.get(childRoute);
        if (!child || child.parent !== parent.route) continue;
        if (child.kind === 'namespace') {
          await walk(child);
        } else if (child.kind === 'generic' && child.ref?.topicFile) {
          const lowered = await lowerTopic(catalog, guideEntry(child), lang);
          sections.push(...lowered.doc.sections);
          for (const [key, title] of Object.entries(lowered.sourceTitles)) {
            sourceTitles[key] ??= title;
          }
        }
      }
    }
  };
  await walk(node);
  if (sections.length === 0) return null;
  return /** @type {any} */ ({
    id: node.route,
    doc: {sections},
    sourceTitles,
  });
}

/**
 * Each reference block in one integration's docs that cannot include what it
 * names (spec:AST-047 FR9): a target that names no doc, a field its schema
 * does not have, or a projection its doc cannot take. A reader would lose
 * that content, so `astryx doctor integration docs` fails on each.
 * @param {{name: string}} integration
 * @param {{records: import('../../foundation/discovery/docs-discovery.mjs').DocsTopicRecord[], namespaces: import('../../foundation/doc-compiler/tree.mjs').TreeNamespaceInput[], guides: import('../../foundation/doc-compiler/tree.mjs').TreeDocInput[]}} discovered
 * @returns {Promise<string[]>}
 */
export async function packageReferenceProblems(integration, discovered) {
  const catalog = DocsCatalog.fromBuiltins();
  catalog.setContributions(() => packageContributions(integration));
  for (const record of discovered.records) catalog.add(record);
  catalog.addTreeInputs({
    namespaces: discovered.namespaces.map(input => ({...input, rank: 1})),
    guides: discovered.guides.map(input => ({...input, rank: 1})),
  });
  return docsLinkProblems(catalog, await projectTree(catalog), {
    owner: integration.name,
    references: true,
  });
}

/**
 * One topic, compiled for `lang`: lowered, then every token reference linked.
 * @param {DocsCatalog} catalog
 * @param {import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry} entry
 * @param {string | null} [lang]
 * @returns {Promise<import('../../foundation/doc-compiler/compile.mjs').CompiledReferenceNode>}
 */
export async function compileTopic(catalog, entry, lang = null) {
  return linkReferenceTopic(
    await lowerTopic(catalog, entry, lang),
    referenceTargets(catalog, lang),
  );
}

/**
 * A guide the docs tree places, as a topic entry the topic readers open by its
 * route. It is never a flat topic: `astryx docs <route>` is its only name.
 * What integrations do to it by its route applies: a replacement is read in
 * its place and names its own package, and each extension's sections merge
 * onto it, each naming the package that wrote it (INV28).
 * @param {import('../../foundation/doc-compiler/tree.mjs').TreeNode} node
 * @returns {import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry}
 */
export function guideEntry(node) {
  const base = {
    name: node.route,
    route: node.route,
    package: node.provider,
    providerId: node.providerId,
    path: node.ref.topicFile,
    extensions: [],
    tree: /** @type {const} */ (true),
    parent: node.parent ?? undefined,
  };
  const overlay = node.guideOverlay;
  if (!overlay) return base;
  const replacement = overlay.replacement;
  return {
    ...base,
    ...(replacement
      ? {
          package: replacement.package,
          providerId: replacement.providerId ?? replacement.package,
          path: replacement.path,
          replaces: node.route,
          // The package whose guide it took over: an earlier replacement's,
          // when the guide was already replaced.
          replacedPackage: overlay.replacedPackage ?? node.provider,
        }
      : {}),
    extensions: [...overlay.extensions],
  };
}

/** @type {WeakMap<DocsTree, ReturnType<typeof cliDocIndex>>} */
const typedDocIndexes = new WeakMap();

/**
 * What a typed doc in the docs tree prints: its content, with every link to
 * another doc resolved (spec:AST-047 FR9). A namespace has no content. The
 * CLI's doc modules are discovery, so this lives in the adapter
 * (architecture:cli-surface INV21).
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {TreeNode} node
 * @returns {Promise<{content: any[], problems: LinkProblem[]}>}
 */
export async function nodeContent(catalog, tree, node) {
  if (!node.ref?.selfDoc) return {content: [], problems: []};
  const resolve = await linkResolver(catalog, node.providerId);
  return linkBlocks(
    cliDocSection(node.ref.selfDoc, typedDocIndex(tree)).content,
    resolve,
  );
}

/**
 * The index a typed doc's content reads its cross-links from: every typed doc
 * in the tree. Built once per tree.
 * @param {DocsTree} tree
 * @returns {ReturnType<typeof cliDocIndex>}
 */
function typedDocIndex(tree) {
  let index = typedDocIndexes.get(tree);
  if (!index) {
    index = cliDocIndex(
      [...tree.nodes.values()].flatMap(each =>
        each.ref?.selfDoc ? [each.ref.selfDoc] : [],
      ),
    );
    typedDocIndexes.set(tree, index);
  }
  return index;
}

/**
 * The command that opens the level a topic sits in when the tree cannot say:
 * a guide's parent namespace, or the topic list.
 * @param {import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry} entry
 * @returns {import('./docs.type.mjs').DocsCommand}
 */
export function topicUp(entry) {
  return entry.tree && entry.parent
    ? `astryx docs ${entry.parent}`
    : 'astryx docs';
}

/**
 * The moves from a node's place in the tree (spec:AST-047 FR2, FR4): up to its
 * parent (the topic list, at the top), and across to the nodes before and
 * after it in its parent's slot.
 * @param {DocsTree} tree
 * @param {TreeNode} node
 * @returns {import('./docs.type.mjs').DocsLinks}
 */
export function placeLinks(tree, node) {
  /** @type {import('./docs.type.mjs').DocsLinks} */
  const links = {
    up: node.parent == null ? 'astryx docs' : `astryx docs ${node.parent}`,
  };
  const parent = node.parent == null ? undefined : tree.get(node.parent);
  // A stable node moves only to stable neighbors, so its links read as they
  // do without experimental features (spec:AST-017 FR27, spec:AST-084 FR0),
  // and an experimental node only to experimental ones, so each next read
  // still names this one as its previous.
  const experimental = isExperimentalTreeNode(tree, node);
  const siblings = (
    parent?.slots.find(slot => slot.children.includes(node.route))?.children ??
    []
  ).filter(route => {
    const sibling = tree.get(route);
    return (
      sibling == null || isExperimentalTreeNode(tree, sibling) === experimental
    );
  });
  const at = siblings.indexOf(node.route);
  if (at > 0) links.previous = `astryx docs ${siblings[at - 1]}`;
  if (at !== -1 && at < siblings.length - 1) {
    links.next = `astryx docs ${siblings[at + 1]}`;
  }
  return links;
}

/**
 * The moves a topic read offers: from its place in the tree, where a guide
 * sits in its namespace and a flat topic in its topic level.
 * @param {DocsCatalog} catalog
 * @param {import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry} entry
 * @returns {Promise<import('./docs.type.mjs').DocsLinks>}
 */
export async function topicLinks(catalog, entry) {
  const tree = await projectTree(catalog);
  const node = tree.get(entry.tree ? (entry.route ?? entry.name) : entry.name);
  const placed =
    node &&
    (entry.tree ? node.kind === 'generic' : node.ref?.flatTopic === entry.name);
  return placed ? placeLinks(tree, node) : {up: topicUp(entry)};
}

/**
 * What a docs argument names: a topic (a flat one, or a guide the docs tree
 * places), a namespace or typed doc in the tree, or nothing, as nameOwner
 * decides.
 * @param {unknown} topic
 * @param {{cwd?: string}} [options]
 * @returns {Promise<
 *   | {kind: 'topic', catalog: DocsCatalog, entry: import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry}
 *   | {kind: 'node', catalog: DocsCatalog, tree: import('../../foundation/doc-compiler/tree.mjs').DocsTree, node: import('../../foundation/doc-compiler/tree.mjs').TreeNode}
 *   | {kind: 'unknown', catalog: DocsCatalog}
 * >}
 */
export async function resolveDocsArgument(topic, {cwd} = {}) {
  const catalog = await loadDocsCatalog(cwd);
  if (typeof topic !== 'string' || topic === '')
    return {kind: 'unknown', catalog};
  const tree = await projectTree(catalog);
  const owner = nameOwner(tree, catalog, topic);
  if (owner == null) return {kind: 'unknown', catalog};
  if (owner.kind === 'topic')
    return {kind: 'topic', catalog, entry: owner.entry};
  return treeArgument(catalog, tree, owner.node);
}

/**
 * Who answers to a name a reader types (spec:AST-046 FR5, FR11). The tree
 * decides first: the node at that route, compared without case, holds it. A
 * name with no node of its own is a topic's other name (its `replaces`
 * alias), and that topic answers, unless the tree gave the topic's own route
 * to another doc. Reads, the topic list, and search all ask this, so they
 * agree on every name.
 * @param {DocsTree} tree
 * @param {DocsCatalog} catalog
 * @param {string} name
 * @returns {{kind: 'topic', entry: import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry} | {kind: 'node', node: TreeNode} | null}
 */
export function nameOwner(tree, catalog, name) {
  const node = tree.get(name) ?? tree.getFolded?.(name);
  if (node != null) {
    if (node.ref?.flatTopic == null) return {kind: 'node', node};
    const entry = catalog.resolve(node.ref.flatTopic);
    return entry == null ? null : {kind: 'topic', entry};
  }
  const entry = catalog.resolve(name);
  if (entry == null) return null;
  const owner = routeOwner(tree, entry);
  return owner == null ? {kind: 'topic', entry} : {kind: 'node', node: owner};
}

/**
 * Whether a topic answers to its own name: what the topic list and search
 * offer must open that topic.
 * @param {DocsTree} tree
 * @param {DocsCatalog} catalog
 * @param {import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry} entry
 * @returns {boolean}
 */
export function holdsOwnName(tree, catalog, entry) {
  const owner = nameOwner(tree, catalog, entry.name);
  return (
    owner?.kind === 'topic' &&
    owner.entry.name === entry.name &&
    owner.entry.package === entry.package
  );
}

/**
 * What a tree node opens as: a guide the tree places reads like a topic; a
 * namespace or a typed doc is a node.
 * @param {DocsCatalog} catalog
 * @param {DocsTree} tree
 * @param {TreeNode} node
 * @returns {{kind: 'topic', catalog: DocsCatalog, entry: import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry} | {kind: 'node', catalog: DocsCatalog, tree: DocsTree, node: TreeNode}}
 */
function treeArgument(catalog, tree, node) {
  if (node.kind === 'generic') {
    return {kind: 'topic', catalog, entry: guideEntry(node)};
  }
  return {kind: 'node', catalog, tree, node};
}

/**
 * The doc that took a flat topic's route in the docs tree, when it is not
 * that topic (spec:AST-046 FR11): the CLI keeps its routes, such as `cli`
 * and `guides`, and a namespace keeps its route over a topic of the same
 * name. Null when the topic owns its route, or the tree has no node there.
 * @param {DocsTree} tree
 * @param {import('../../foundation/discovery/docs-discovery.mjs').DocsTopicEntry} entry
 * @returns {TreeNode | null}
 */
export function routeOwner(tree, entry) {
  const node = tree.get(entry.name) ?? tree.getFolded?.(entry.name);
  if (node == null) return null;
  return node.ref?.flatTopic === entry.name && node.provider === entry.package
    ? null
    : node;
}

/**
 * Routes that moved, old prefix first: the integration guides moved from
 * `cli/integrations` (and, before that, the `cli-integrations` topic) into
 * `authoring`, the one home for integration authors.
 * Only the not-found error reads this, to name where a doc went; an old route
 * opens nothing.
 */
const MOVED_ROUTES = [
  ['cli/integrations', 'authoring'],
  ['cli-integrations', 'authoring'],
];

/**
 * The node an old route moved to, or null.
 * @param {unknown} topic
 * @param {DocsTree} tree
 * @returns {TreeNode | null}
 */
function movedRoute(topic, tree) {
  if (typeof topic !== 'string') return null;
  const wanted = topic.toLowerCase();
  for (const [from, to] of MOVED_ROUTES) {
    if (wanted !== from && !wanted.startsWith(`${from}/`)) continue;
    const node = tree.getFolded(`${to}${wanted.slice(from.length)}`);
    if (node) return node;
  }
  return null;
}

/**
 * The error for a docs argument that names nothing. For a route, it suggests
 * every child of the deepest namespace the route reaches, closest first.
 * Otherwise it suggests the docs the argument names in another spelling, or
 * failing that the topics and top-level namespaces, closest first and cut
 * where the matches get weaker (every one of them when none shares a word
 * with the argument).
 * @param {unknown} topic
 * @param {DocsCatalog} catalog
 * @returns {Promise<AstryxError>}
 */
export async function unknownTopicError(topic, catalog) {
  const tree = await projectTree(catalog);
  /** @type {Array<{name: string, reason: string}>} */
  let suggestions = [];
  // Route children stay whole (spec:AST-046); only the other lists are cut.
  let routeChildren = false;
  if (typeof topic === 'string' && topic.includes('/')) {
    const parts = topic.split('/');
    for (
      let depth = parts.length - 1;
      depth > 0 && suggestions.length === 0;
      depth--
    ) {
      const near = tree.get(parts.slice(0, depth).join('/'));
      if (near) {
        routeChildren = true;
        suggestions = near.slots.flatMap(slot =>
          slot.children.map(route => ({
            name: route,
            reason: tree.get(route)?.summary ?? '',
          })),
        );
      }
    }
  }
  if (suggestions.length === 0 && typeof topic === 'string') {
    // The docs whose own name it is (`doctor` is cli/commands/doctor), or whose
    // route it spells with hyphens (`cli-host-entry` is cli/host-entry).
    const wanted = topic.toLowerCase();
    suggestions = [...tree.nodes.values()]
      .filter(
        node =>
          !node.ref?.flatTopic &&
          (node.name.toLowerCase() === wanted ||
            node.route.replaceAll('/', '-').toLowerCase() === wanted),
      )
      .map(node => ({name: node.route, reason: node.summary}));
  }
  if (suggestions.length === 0) {
    suggestions = [
      ...tree
        .roots()
        .map(root => ({name: root.route, reason: 'docs namespace'})),
      ...catalog.names().map(name => ({name, reason: 'available topic'})),
    ];
  }
  if (typeof topic === 'string') {
    suggestions = orderRouteSuggestions(topic, suggestions, {
      closest: !routeChildren,
    });
  }
  // A route that moved names where it went, ahead of the usual suggestions
  // (spec:AST-046 FR9, FR6).
  const moved = movedRoute(topic, tree);
  if (moved) {
    return new AstryxError(
      `Unknown topic "${String(topic)}". It moved to "${moved.route}"${notLoaded(catalog)}`,
      [
        {name: moved.route, reason: moved.summary},
        ...suggestions.filter(entry => entry.name !== moved.route),
      ],
      ERROR_CODES.ERR_UNKNOWN_TOPIC,
    );
  }
  return new AstryxError(
    `Unknown topic "${String(topic)}"${notLoaded(catalog)}`,
    suggestions,
    ERROR_CODES.ERR_UNKNOWN_TOPIC,
  );
}

/**
 * A sentence naming the packages whose docs did not load, or nothing: a doc
 * that fails to load withdraws its package's docs, so a reader who cannot
 * find one learns where to look.
 * @param {DocsCatalog} catalog
 * @returns {string}
 */
export function notLoaded(catalog) {
  const packages = [...new Set(catalog.issues.map(issue => issue.package))];
  if (packages.length === 0) return '';
  return `. The docs of ${packages.join(', ')} did not load; run \`${formatCliCommand('doctor integration docs')}\` in that package to see why.`;
}

/**
 * Resolve a topic (a flat one, or a guide the docs tree places by its route)
 * and lower it for the topic readers.
 * @param {unknown} topic
 * @param {{lang?: string | null, zh?: boolean, dense?: boolean, cwd?: string}} [options]
 */
export async function resolveTopicDocs(topic, options = {}) {
  const {lang = null, zh = false, dense = false, cwd} = options;
  const effectiveLang = lang || (dense ? 'dense' : zh ? 'zh' : null);
  // A public API caller could pass a non-string topic; it lands on the same
  // stable code as an unknown name rather than a raw TypeError.
  const found = await resolveDocsArgument(topic, {cwd});
  if (found.kind !== 'topic') {
    throw found.kind === 'node'
      ? new AstryxError(
          `"${found.node.route}" is a ${found.node.kind === 'namespace' ? 'namespace' : `${found.node.kind} doc`} in the docs tree, not a topic. Read it with \`${formatCliCommand(`docs ${found.node.route}`)}\`.`,
          undefined,
          ERROR_CODES.ERR_UNKNOWN_TOPIC,
        )
      : await unknownTopicError(topic, found.catalog);
  }
  const {catalog, entry} = found;
  const node = await lowerTopic(catalog, entry, effectiveLang);
  return {catalog, node, lang: effectiveLang, entry};
}

/**
 * Each doc one integration package ships, checked against the published
 * authoring type for its kind with the project's own TypeScript (spec:AST-039
 * FR13). Without TypeScript the report says nothing was checked.
 * @param {any} integration a loaded integration
 * @param {string} cwd
 * @returns {Promise<import('../../foundation/discovery/doc-types.mjs').DocTypesReport & {fixtures?: number}>}
 */
export async function integrationDocTypes(integration, cwd) {
  const packageDir = /** @type {{__packageDir?: string}} */ (integration)
    .__packageDir;
  const {files, unread, fixtures} = await integrationDocFiles(integration);
  const checked = await checkDocTypes(files, {
    packageDir: packageDir ?? cwd,
    resolveFrom: [cwd, packageDir],
  });
  // Test fixtures no reader serves don't ship as docs: only counted.
  const report =
    checked.status === 'checked' && fixtures > 0
      ? {...checked, fixtures}
      : checked;
  if (report.status !== 'checked' || unread.length === 0) return report;
  // A root its reader cannot read serves no doc; say so rather than skip it.
  const rel = (/** @type {string} */ file) =>
    path
      .relative(packageDir ?? cwd, file)
      .split(path.sep)
      .join('/') || '.';
  return {
    ...report,
    unchecked: [
      ...report.unchecked,
      ...unread.map(entry => ({doc: rel(entry.path), reason: entry.reason})),
    ].sort((a, b) => a.doc.localeCompare(b.doc)),
  };
}
