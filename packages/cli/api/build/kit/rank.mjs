// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page ranker behind `build`'s START: which page template an idea
 * should start from, and whether the idea asks for a page at all.
 *
 * @input A free-text idea, the project's ready page templates (id, display
 *   name, description, keywords, `Family - Variant` category) and its
 *   components (name, keywords), all read from each item's own descriptor.
 * @output Every template, ranked, with the query terms it matched and whether
 *   the idea names its family; `ideaKind`, whether the idea asks for a page, a
 *   part of one, or a change to a page the builder has; `pickStart` turns both
 *   into a template or null.
 * @position Beside kit.mjs (api/build/kit/). Search ranks components, docs,
 *   blocks and pages against short lookups; this ranks only page templates,
 *   against the long descriptions builders actually write ("ops dashboard with
 *   a KPI row, a sortable table and a trend chart"). Search's scorer is left
 *   alone: its callers depend on its scores.
 *
 * Why a separate ranker. Real `build` queries run to fifteen words or more.
 * Search scores a page on its single strongest term plus a garnish, so one
 * incidental word decides: "status" picks the project-status dashboard,
 * "board" picks the kanban board for a game board. Here every matched term
 * counts, weighted by how rare it is among page templates (inverse document
 * frequency), so the page that answers more of the idea — and its rarer words —
 * wins. Structural signals sit on top:
 *
 * - The head noun. The words before the first "with", ":" or "," name what
 *   the page is ("audit dashboard: dense table with …"); a family word there
 *   outweighs the same word among the parts.
 * - The container. In "draft history in a modal", the modal is the page's
 *   frame, and a template is its frame; container words count double, and a
 *   container match is evidence enough to start from. Only an overlay frame
 *   counts: "inside a data card" names a component the part lives in, and "in
 *   an existing dashboard" names the page being changed.
 * - Phrase heads. In "side-by-side product response", "product" describes the
 *   response; it is not a product page. A word that only ever modifies the
 *   next one counts half, unless the template names the same pair
 *   ("executive summary").
 * - The family base. A template whose id is its family's name (`dashboard`,
 *   `settings`) is that family's default. A variant displaces it only with two
 *   matched terms of its own ("a small comparison note" does not make a
 *   dashboard the comparison dashboard), and a base too weak to start on its
 *   own displaces no variant ("a funnel for a dashboard" is the funnel).
 */

import {
  HEAD_END,
  SHELL_FAMILY,
  terms,
  modifiersOf,
  pairsOf,
  containersOf,
  normalized,
  SYNONYMS_OF,
  familyWordsOf,
} from './words.mjs';

/**
 * @typedef {import('./words.mjs').PageTemplate} PageTemplate
 * @typedef {import('./words.mjs').RankedPage} RankedPage
 * @typedef {import('./words.mjs').IdeaKind} IdeaKind
 */

/**
 * How much a term counts by where the template names it. The id and category
 * are the author's own label for what the page is; its keywords name the ideas
 * it serves; its description describes the layout.
 */
const FIELD_WEIGHT = {
  id: 3,
  variant: 3,
  family: 2,
  display: 2,
  keywords: 2,
  description: 1,
};

/**
 * A synonym hit counts half a direct hit: a synonym says the idea is near the
 * page, not that it names it.
 */
const SYNONYM_SHARE = 0.5;

/**
 * A container word ("in a modal") counts double: it names the page's frame,
 * which is what a template is.
 */
const CONTAINER = 2;

/**
 * A word that only modifies another ("product" in "product response") counts
 * half: it describes its head, not the page.
 */
const MODIFIER = 0.5;

/**
 * Added when the idea's head names the template's family: more than any one
 * word scores (an id word only one template carries is worth about ten), so the
 * head's family outranks a rarer word among the parts.
 */
const HEAD_FAMILY = 12;

/**
 * Added when the family is named anywhere else in the idea: about a description
 * word, enough to settle a near tie.
 */
const BODY_FAMILY = 2;

/**
 * Added to a family's base template when the idea names that family: settles a
 * near tie toward the family's default page.
 */
const FAMILY_BASE = 2;

/**
 * The least a start must score, and the evidence it needs: two matched terms,
 * or the idea naming its family. One rare word alone is how a tic-tac-toe game
 * board became a kanban board, and it is also too little for a variant to
 * displace its family's base template.
 */
const START_SCORE = 10;

const START_TERMS = 2;

/**
 * Rank page templates against an idea, best first. Ties go to the template
 * with the shorter id (the family's broader page), then by name.
 *
 * @param {string} query
 * @param {PageTemplate[]} pages
 * @returns {RankedPage[]}
 */
export function rankPages(query, pages) {
  const docs = pages.map(page => {
    const [family = '', ...variantParts] = page.category.split(' - ');
    /** @type {Record<keyof typeof FIELD_WEIGHT, string>} */
    const fields = {
      id: page.name.replace(/-/g, ' '),
      variant: variantParts.join(' - '),
      family,
      display: page.displayName,
      // Each keyword is its own phrase: a pair never spans two of them.
      keywords: (page.keywords ?? []).join(', '),
      description: page.description,
    };
    /** @type {Map<string, number>} */
    const bag = new Map();
    for (const [field, text] of Object.entries(fields)) {
      const weight =
        FIELD_WEIGHT[/** @type {keyof typeof FIELD_WEIGHT} */ (field)];
      for (const t of terms(text))
        bag.set(t, Math.max(bag.get(t) ?? 0, weight));
    }
    return {
      page,
      family: family.trim(),
      bag,
      pairs: pairsOf(Object.values(fields)),
    };
  });

  // Inverse document frequency over page templates: a word every dashboard
  // carries says less than one only the funnel carries.
  /** @type {Map<string, number>} */
  const df = new Map();
  for (const {bag} of docs)
    for (const t of bag.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  /** @param {string} t */
  const idf = t => {
    const d = df.get(t);
    return d ? Math.log(1 + (n - d + 0.5) / (d + 0.5)) : 0;
  };

  const familyOfWord = familyWordsOf(pages);
  /** @param {string[]} ts */
  const familiesIn = ts =>
    new Set(ts.filter(t => familyOfWord.has(t)).map(t => familyOfWord.get(t)));

  const queryTerms = [...new Set(terms(query))];
  const headFamilies = familiesIn(
    terms(String(query).split(HEAD_END)[0] ?? ''),
  );
  const namedFamilies = familiesIn(queryTerms);
  const modifiers = modifiersOf(query);
  const containers = containersOf(query);

  const ranked = docs
    .map(({page, family, bag, pairs}) => {
      let score = 0;
      let hits = 0;
      let containerMatched = false;
      /** @type {Set<string>} */
      const matched = new Set();
      for (const t of queryTerms) {
        // A modifier is discounted where the template names it outright; a
        // synonym hit is already discounted by SYNONYM_SHARE.
        const modified = modifiers.get(t);
        const discounted =
          modified !== undefined &&
          ![...modified].some(n => pairs.has(`${t} ${n}`));
        const direct = idf(t) * (bag.get(t) ?? 0) * (discounted ? MODIFIER : 1);
        let viaSynonym = 0;
        for (const s of SYNONYMS_OF.get(t) ?? []) {
          if (queryTerms.includes(s)) continue;
          viaSynonym = Math.max(
            viaSynonym,
            SYNONYM_SHARE * idf(s) * (bag.get(s) ?? 0),
          );
        }
        const value =
          Math.max(direct, viaSynonym) * (containers.has(t) ? CONTAINER : 1);
        if (value > 0) {
          score += value;
          hits++;
          matched.add(t);
          if (containers.has(t)) containerMatched = true;
        }
      }
      const familyNamed = namedFamilies.has(family);
      if (headFamilies.has(family)) score += HEAD_FAMILY;
      else if (familyNamed) score += BODY_FAMILY;
      const base = normalized(page.name) === normalized(family);
      if (familyNamed && base) score += FAMILY_BASE;
      return {
        name: page.name,
        score,
        hits,
        familyNamed,
        containerMatched,
        family,
        base,
        matched,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.name.split('-').length - b.name.split('-').length ||
        a.name.localeCompare(b.name),
    );
  return baseFirst(ranked);
}

/**
 * Put a named family's base template ahead of the variant that outranks it,
 * unless the variant matched START_TERMS terms the base did not, or the base
 * scores too little to start on its own.
 * @param {RankedPage[]} ranked
 * @returns {RankedPage[]}
 */
function baseFirst(ranked) {
  const top = ranked[0];
  if (!top || top.base || !top.familyNamed) return ranked;
  const base = ranked.find(r => r.base && r.family === top.family);
  if (!base || base.score < START_SCORE) return ranked;
  const own = [...top.matched].filter(t => !base.matched.has(t)).length;
  return own >= START_TERMS
    ? ranked
    : [base, ...ranked.filter(r => r !== base)];
}

/**
 * The next closest templates after the start, best first: the ones a reader
 * should check the idea against when the start's shape is wrong. Each matched
 * at least one term and scored at least half of what a start needs.
 *
 * @param {RankedPage[]} ranked
 * @param {string} startName
 * @param {number} [count]
 * @returns {RankedPage[]}
 */
export function pickAlternatives(ranked, startName, count = 2) {
  return ranked
    .filter(
      r => r.name !== startName && r.hits > 0 && r.score >= START_SCORE / 2,
    )
    .slice(0, count);
}

/**
 * The template to start from, or null for the kit's neutral app shell. A page
 * needs evidence to lead: two matched terms, the idea naming the template's
 * family, or its container. A part starts from the base template of the family
 * the idea places it in, else from the app shell (spec:AST-048/FR3); an edit of
 * a page the builder already has starts from the app shell (FR9). Either way,
 * the app shell is the shell template the idea describes when one leads.
 *
 * @param {RankedPage[]} ranked
 * @param {IdeaKind} [kind]
 * @returns {RankedPage | null}
 */
export function pickStart(ranked, kind = 'page') {
  if (kind !== 'page') {
    const host = kind === 'part' && ranked.find(r => r.base && r.familyNamed);
    if (host) return host;
    // Otherwise the app shell (FR2): the shell template the idea describes
    // when one leads ("a frame with sidebar navigation"), else none, for the
    // kit's neutral fallback.
    const lead = pickStart(ranked);
    return lead?.family === SHELL_FAMILY ? lead : null;
  }
  const top = ranked[0];
  if (!top || top.score < START_SCORE) return null;
  return top.hits >= START_TERMS || top.familyNamed || top.containerMatched
    ? top
    : null;
}
