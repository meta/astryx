// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable section keys, section lookup, and the topic index.
 *
 * @input Reference-doc sections, each with an optional authored `id`.
 * @output The key a section is addressed by (its `id`, else a kebab-case key
 *   derived from its authored title), lookup by key or title, and the compact
 *   index a topic-only docs read returns.
 * @position Shared by docs discovery (which rejects colliding keys before a
 *   reader sees them), the docs leaves (index, section, detail), and Doctor
 *   (output budgets). Imports nothing from discovery, so both can use it.
 */

/** A stable key: lowercase letters and digits, joined by single hyphens. */
export const SECTION_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The longest summary an index entry carries, in characters. */
export const SECTION_SUMMARY_MAX = 240;

/**
 * A section's authored title. A `--zh`/`--dense` overlay replaces the visible
 * title, but extensions are written against the authored one and keys derive
 * from it, so both stay the same in every language.
 */
const SOURCE_TITLE = Symbol('astryx.docs.sourceTitle');

/**
 * Record the authored title of a section whose visible title a translation
 * overlay replaces.
 * @template {object} T
 * @param {T} section
 * @param {string} title
 * @returns {T}
 */
export function withSourceTitle(section, title) {
  Object.defineProperty(section, SOURCE_TITLE, {
    value: title,
    configurable: true,
  });
  return section;
}

/**
 * @param {any} section
 * @returns {string}
 */
export function sourceTitle(section) {
  return section?.[SOURCE_TITLE] ?? section?.title;
}

/**
 * The key a title derives: accents folded, `&` spelled out, and every other
 * run of non-alphanumerics collapsed to one hyphen. Empty when the title has
 * no Latin letters or digits to derive from.
 * @param {unknown} title
 * @returns {string}
 */
export function sectionTitleKey(title) {
  if (typeof title !== 'string') return '';
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The key a section is addressed by: its authored `id`, else the key its
 * authored title derives.
 * @param {any} section
 * @returns {string}
 */
export function sectionKey(section) {
  return typeof section?.id === 'string'
    ? section.id
    : sectionTitleKey(sourceTitle(section));
}

/**
 * The first section the 0.6.x title-substring lookup would return for a query.
 * @param {any[]} sections
 * @param {string} query
 * @returns {number}
 */
function legacyTitleMatchIndex(sections, query) {
  return sections.findIndex(section => answersTitleQuery(section, query));
}

/**
 * Does a section's authored title answer a 0.6.x title query: does the query
 * appear in it, in any letter case? Merging and key checks share this test,
 * so a pair the merge keeps is never one the key check refuses.
 * @param {any} section
 * @param {string} query
 * @returns {boolean}
 */
export function answersTitleQuery(section, query) {
  const title = sourceTitle(section);
  return (
    typeof title === 'string' &&
    title.toLowerCase().includes(query.toLowerCase())
  );
}

/**
 * A name as a docs-tree route segment: lowercase words joined by hyphens, so
 * `integrationPackCheck` and `integration verify` both read naturally.
 * @param {string} name
 * @returns {string}
 */
export function routeSegment(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fatal key problems: only an explicitly authored `id` can make a previously
 * readable topic invalid. Derived-key collisions and titles with no Latin
 * letters or digits are handled by {@link withSectionKeys} for 0.6.x
 * compatibility.
 * @param {any[]} sections
 * @returns {string[]}
 */
export function sectionKeyErrors(sections) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, number>} */
  const seen = new Map();
  sections.forEach((section, s) => {
    if (section?.id == null) return;
    const at = `sections[${s}]`;
    if (typeof section.id !== 'string' || !SECTION_KEY_RE.test(section.id)) {
      problems.push(
        `${at}.id: ${JSON.stringify(section.id)} is not a stable key. Use lowercase letters and digits joined by single hyphens.`,
      );
      return;
    }
    const first = seen.get(section.id);
    if (first != null) {
      problems.push(
        `${at}: the key "${section.id}" is already used by sections[${first}]. Give one of them a distinct id.`,
      );
      return;
    }
    const legacyOwner = legacyTitleMatchIndex(sections, section.id);
    if (legacyOwner !== -1 && legacyOwner !== s) {
      problems.push(
        `${at}.id: the key "${section.id}" is already a legacy title query for sections[${legacyOwner}]. Choose an id that resolves to this section.`,
      );
      return;
    }
    seen.set(section.id, s);
  });
  return problems;
}

/**
 * Compatibility notices for section keys. These inputs loaded in 0.6.x, so
 * readers keep accepting them and assign deterministic fallback keys.
 * @param {any[]} sections
 * @returns {string[]}
 */
export function sectionKeyProblems(sections) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, number>} */
  const seen = new Map();
  sections.forEach((section, s) => {
    const at = `sections[${s}]`;
    if (
      section?.id == null &&
      (typeof section?.title !== 'string' || section.title === '')
    ) {
      return;
    }
    if (
      section?.id != null &&
      (typeof section.id !== 'string' || !SECTION_KEY_RE.test(section.id))
    ) {
      problems.push(
        `${at}.id: ${JSON.stringify(section.id)} is not a stable key. Use lowercase letters and digits joined by single hyphens.`,
      );
      return;
    }
    const key = sectionKey(section);
    if (key === '') {
      problems.push(
        `${at}: no key derives from the title ${JSON.stringify(section?.title)}. A deterministic section-N compatibility key is used; add an explicit id.`,
      );
      return;
    }
    const first = seen.get(key);
    if (first != null) {
      problems.push(
        `${at}: the key "${key}" is already used by sections[${first}]. A suffixed compatibility key is used for title-derived collisions; give one of them a distinct id or title.`,
      );
      return;
    }
    seen.set(key, s);
  });
  return problems;
}

/**
 * Stamp every section with the key it is addressed by. Runs only after
 * extensions merge: a derived key must never take part in merge matching.
 *
 * When a section one package added already holds the key a title derives, a
 * section another package added later in the doc takes `<provider
 * key>-<title key>`, which names its own package. The section placed first
 * keeps the plain key. Every other collision, one with the topic's own
 * sections included, takes a numeric suffix.
 * @template {{sections: any[]}} T
 * @param {T} doc
 * @param {{providerOf?: (section: any) => string | null | undefined}} [options]
 *   `providerOf` names the package that added a section, or nothing for a
 *   section of the topic itself
 * @returns {T}
 */
export function withSectionKeys(doc, {providerOf} = {}) {
  /** @type {Map<string, any>} key -> the section that holds it */
  const holders = new Map();
  for (const section of doc.sections) {
    const id = section?.id;
    if (typeof id === 'string' && SECTION_KEY_RE.test(id) && !holders.has(id)) {
      holders.set(id, section);
    }
  }
  /** @type {Set<string>} */
  const used = new Set();
  /** @param {string} key @param {number} index */
  const taken = (key, index) =>
    holders.has(key) ||
    used.has(key) ||
    (legacyTitleMatchIndex(doc.sections, key) !== -1 &&
      legacyTitleMatchIndex(doc.sections, key) !== index);
  return {
    ...doc,
    sections: doc.sections.map((section, index) => {
      if (section.id != null) {
        used.add(section.id);
        return section;
      }
      const titleKey = sectionTitleKey(sourceTitle(section));
      let base = titleKey || `section-${index + 1}`;
      const holder = holders.get(base);
      const provider = providerOf?.(section);
      const holderProvider = holder == null ? null : providerOf?.(holder);
      if (
        titleKey !== '' &&
        provider != null &&
        holderProvider != null &&
        holderProvider !== provider
      ) {
        base = `${routeSegment(provider.replace(/^@/, ''))}-${titleKey}`;
      }
      let key = base;
      let suffix = 2;
      while (taken(key, index)) {
        key = `${base}-${suffix}`;
        suffix += 1;
      }
      used.add(key);
      if (!holders.has(key)) holders.set(key, section);
      return withSourceTitle({...section, id: key}, sourceTitle(section));
    }),
  };
}

/**
 * Find the section a reader asked for. The 0.6.x first-match title-substring
 * lookup remains first in the authored-title view. In a localized view, an
 * exact stable key resolves before translated title substrings because those
 * translations cannot participate in language-stable key allocation. Generated
 * keys avoid authored-title conflicts, and authored IDs that would shadow an
 * authored legacy query are rejected.
 * @param {any[]} sections
 * @param {string} query
 * @returns {{section: any | null, candidates: any[]}} `candidates` lists every
 *   legacy title match when the query is ambiguous
 */
export function findDocSection(sections, query) {
  const wanted = query.trim();
  const byKey = sections.find(section => sectionKey(section) === wanted);
  const hasLocalizedTitles = sections.some(
    section => sourceTitle(section) !== section.title,
  );
  if (byKey && hasLocalizedTitles) {
    return {section: byKey, candidates: []};
  }

  const lower = wanted.toLowerCase();
  const legacy = sections.filter(section =>
    section.title.toLowerCase().includes(lower),
  );
  if (legacy.length > 0) {
    return {section: legacy[0], candidates: legacy.length > 1 ? legacy : []};
  }

  const byFallbackKey = sections.find(
    section => sectionKey(section) === wanted,
  );
  if (byFallbackKey) return {section: byFallbackKey, candidates: []};

  const derived = sectionTitleKey(wanted);
  const byDerivedKey = sections.find(
    section =>
      derived !== '' && sectionTitleKey(sourceTitle(section)) === derived,
  );
  return {section: byDerivedKey ?? null, candidates: []};
}

/**
 * One line that says what a section holds: its first prose or list text,
 * whitespace collapsed, cut at a word boundary.
 * @param {any} section
 * @param {number} [max]
 * @returns {string}
 */
export function sectionSummary(section, max = SECTION_SUMMARY_MAX) {
  const first = (section?.content ?? []).find(
    (/** @type {any} */ block) =>
      (block?.type === 'prose' && typeof block.text === 'string') ||
      (block?.type === 'list' && Array.isArray(block.items)),
  );
  const raw =
    first == null ? '' : first.type === 'prose' ? first.text : first.items[0];
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * The index a topic-only read returns: what the topic is, and one entry per
 * section with the key to read it by.
 * @param {{name: string, title: string, description: string, sections: any[]}} doc
 * @returns {Omit<import('../../api/docs/docs.type.mjs').DocsIndex, 'links' | 'sections'> & {sections: import('../../api/docs/docs.type.mjs').DocsIndexEntry[]}}
 */
export function buildDocsIndexData(doc) {
  return {
    name: doc.name,
    title: doc.title,
    description: doc.description,
    sections: doc.sections.map(section => ({
      id: sectionKey(section),
      title: section.title,
      summary: sectionSummary(section),
    })),
  };
}
