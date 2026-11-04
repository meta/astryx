// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs.detail.section leaf — load a single section of a topic.
 *
 * @input A topic name, a section query, and optional {lang, zh, dense}. Resolves
 *   the topic via the shared adapter, keeps the 0.6.x first title-substring
 *   match, then falls back to a stable key or normalized title key, and links
 *   only that section.
 * @output { type: 'docs.detail.section', data: ReferenceSection } with any
 *   token-ref blocks inlined — matching `astryx --json docs <topic> <section>`.
 *   Throws ERR_UNKNOWN_SECTION when nothing matches, or when the query matches
 *   more than one section (the candidates come back as suggestions).
 *   A namespace's section read (spec:AST-046 FR6) finds the one guide below the
 *   namespace that has the section and answers exactly as that guide's section
 *   read does.
 * @position Leaf nested under api/docs/detail. Shares topic resolution with the
 *   detail leaf via _adapter.mjs and reads through the compiler's lenses.
 */

import {AstryxError} from '../../../error.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {
  findDocSection,
  sectionKey,
  sectionTitleKey,
  sourceTitle,
} from '../../../../foundation/discovery/docs-section-key.mjs';
import {linkReferenceSection} from '../../../../foundation/doc-compiler/compile.mjs';
import {
  readerSections,
  sectionView,
} from '../../../../foundation/doc-compiler/lenses.mjs';
import {
  referenceTargets,
  resolveTopicDocs,
  sectionPackageOf,
} from '../../_adapter.mjs';

/**
 * @param {string} topic
 * @param {string} sectionName a section key, or a title (or part of one)
 * @param {object} [options]
 * @param {string} [options.lang]
 * @param {boolean} [options.zh]
 * @param {boolean} [options.dense]
 * @param {string} [options.cwd]
 * @returns {Promise<import('../../docs.type.mjs').DocsDetailSectionResponse>}
 */
export async function section(topic, sectionName, options = {}) {
  requireSectionName(sectionName);
  const resolved = await resolveTopicDocs(topic, options);
  const sections = readerSections(resolved.node);
  const {section: match} = findDocSection(sections, sectionName);
  if (!match) {
    throw new AstryxError(
      `Section "${sectionName}" not found in "${topic}"`,
      sections.map(s => ({
        name: s.title,
        reason: 'available section',
      })),
      ERROR_CODES.ERR_UNKNOWN_SECTION,
    );
  }

  return sectionResponse(resolved, sections, match);
}

/**
 * An empty section name must error, not resolve to the first section. The
 * docs() dispatcher routes a falsy section to the topic, but a leaf must be
 * safe on its own; a non-string would otherwise throw a raw TypeError.
 * @param {unknown} sectionName
 */
function requireSectionName(sectionName) {
  if (typeof sectionName !== 'string' || !sectionName.trim()) {
    throw new AstryxError(
      'A section name is required',
      undefined,
      ERROR_CODES.ERR_UNKNOWN_SECTION,
    );
  }
}

/**
 * The docs.detail.section response for one section of a resolved topic.
 * @param {Awaited<ReturnType<typeof resolveTopicDocs>>} resolved
 * @param {any[]} sections the topic's reader sections
 * @param {any} match one of them
 * @returns {Promise<import('../../docs.type.mjs').DocsDetailSectionResponse>}
 */
async function sectionResponse({catalog, node, lang, entry}, sections, match) {
  // A section read on its own inlines its token refs, as the whole topic does;
  // otherwise a section that is only a token-ref prints blank. Only this
  // section is linked, so a broken reference elsewhere cannot fail the read.
  const linked = await linkReferenceSection(
    match,
    referenceTargets(catalog, lang),
  );
  // The moves from one section (spec:AST-047): up to its topic's index, and
  // across to the sections before and after it.
  const at = sections.indexOf(match);
  /** @type {import('../../docs.type.mjs').DocsLinks} */
  const links = {up: `astryx docs ${entry.name} --index`};
  if (at > 0) {
    links.previous = `astryx docs ${entry.name} ${sectionKey(sections[at - 1])}`;
  }
  if (at !== -1 && at < sections.length - 1) {
    links.next = `astryx docs ${entry.name} ${sectionKey(sections[at + 1])}`;
  }
  return {
    type: 'docs.detail.section',
    // The package that wrote this section: the topic's own, or an extension's.
    package: sectionPackageOf(entry, node)(match.id),
    data: {...sectionView(node, linked), links},
  };
}

/**
 * @typedef {object} GuideMatch
 * @property {import('../../../../foundation/doc-compiler/tree.mjs').TreeNode} guide
 * @property {Awaited<ReturnType<typeof resolveTopicDocs>>} resolved
 * @property {any[]} sections the guide's reader sections
 * @property {any} match the section it has
 */

/**
 * One section of a namespace (spec:AST-046 FR6): the section read of the one
 * guide below the namespace, at any depth, that has it. Each guide answers
 * with the section its own section read returns for the query; when that
 * section's key (its `id`, else the key its title derives) is the query in
 * some guides, those guides answer first. No guide, or several, fail with ERR_UNKNOWN_SECTION, naming
 * the guides to read instead.
 * @param {import('../../../../foundation/doc-compiler/tree.mjs').DocsTree} tree
 * @param {import('../../../../foundation/doc-compiler/tree.mjs').TreeNode} namespace
 * @param {string} sectionName
 * @param {object} [options] as {@link section}
 * @returns {Promise<import('../../docs.type.mjs').DocsDetailSectionResponse>}
 */
export async function namespaceSection(
  tree,
  namespace,
  sectionName,
  options = {},
) {
  requireSectionName(sectionName);
  const guides = guidesBelow(tree, namespace);
  /** @type {Omit<GuideMatch, 'match'>[]} */
  const reads = [];
  for (const guide of guides) {
    const resolved = await resolveTopicDocs(guide.route, options);
    reads.push({guide, resolved, sections: readerSections(resolved.node)});
  }

  const wanted = sectionName.trim();
  const derived = sectionTitleKey(wanted);
  /** @type {GuideMatch[]} */
  const byKey = [];
  /** @type {GuideMatch[]} */
  const found = [];
  for (const read of reads) {
    // The section the guide's own section read returns for this query, so the
    // namespace read answers exactly what `astryx docs <guide> <section>` does.
    const {section: match} = findDocSection(read.sections, wanted);
    if (!match) continue;
    found.push({...read, match});
    if (
      sectionKey(match) === wanted ||
      (derived !== '' && sectionTitleKey(sourceTitle(match)) === derived)
    ) {
      byKey.push({...read, match});
    }
  }
  const matches = byKey.length > 0 ? byKey : found;
  const chosen = oneGuide(matches);
  if (chosen)
    return sectionResponse(chosen.resolved, chosen.sections, chosen.match);

  if (guides.length === 0) {
    // A namespace with no guide below it (a reference level such as cli/api)
    // has no sections to read: name its children, as before.
    throw new AstryxError(
      `"${namespace.route}" has no sections. Open one of its children instead.`,
      namespace.slots.flatMap(slot =>
        slot.children.map(route => ({
          name: route,
          reason: tree.get(route)?.summary ?? '',
        })),
      ),
      ERROR_CODES.ERR_UNKNOWN_SECTION,
    );
  }
  if (matches.length === 0) {
    throw new AstryxError(
      `Section "${sectionName}" is not in any guide under "${namespace.route}". Open one of its guides instead.`,
      guides.map(guide => ({name: guide.route, reason: guide.summary})),
      ERROR_CODES.ERR_UNKNOWN_SECTION,
    );
  }
  throw new AstryxError(
    `Section "${sectionName}" matches sections in more than one guide under "${namespace.route}". Read it from one of them.`,
    matches.map(({guide, match}) => ({
      name: guide.route,
      reason: `has "${match.title}"`,
    })),
    ERROR_CODES.ERR_UNKNOWN_SECTION,
  );
}

/**
 * The guide a namespace section read answers from, or null to ask. When the
 * query matches sections in several guides, the read asks the reader which
 * guide they mean (spec:AST-046 FR6), where a flat topic's section read
 * returned its first title match. To return the first match in tree order
 * instead, return `matches[0]` here.
 * @param {GuideMatch[]} matches in tree order
 * @returns {GuideMatch | null}
 */
export function oneGuide(matches) {
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Every guide below a namespace, at any depth, in tree order.
 * @param {import('../../../../foundation/doc-compiler/tree.mjs').DocsTree} tree
 * @param {import('../../../../foundation/doc-compiler/tree.mjs').TreeNode} namespace
 * @returns {import('../../../../foundation/doc-compiler/tree.mjs').TreeNode[]}
 */
function guidesBelow(tree, namespace) {
  /** @type {import('../../../../foundation/doc-compiler/tree.mjs').TreeNode[]} */
  const guides = [];
  /** @param {import('../../../../foundation/doc-compiler/tree.mjs').TreeNode} parent */
  const walk = parent => {
    for (const slot of parent.slots) {
      for (const route of slot.children) {
        const child = tree.get(route);
        if (!child || child.parent !== parent.route) continue;
        if (child.kind === 'namespace') walk(child);
        else if (child.kind === 'generic' && child.ref?.topicFile)
          guides.push(child);
      }
    }
  };
  walk(namespace);
  return guides;
}
