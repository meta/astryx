// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file String utilities — fuzzy matching and semantic search for component names
 */

// levenshteinDistance lives in its own pure module so browser-bundled code
// (the XLE/XLO language) can use it without this file's dynamic node:fs/path
// imports landing in the webpack graph. Re-exported for existing consumers.
import {levenshteinDistance} from './levenshtein.mjs';
import {compareText} from './compare-text.mjs';
export {levenshteinDistance} from './levenshtein.mjs';

/**
 * Find the closest component names to a given (possibly misspelled) name.
 * Returns matches sorted by distance, filtered to maxDistance.
 * @param {string} name
 * @param {Record<string, string[]>} components
 * @param {number} [maxDistance]
 * @returns {{name: string, distance: number}[]}
 */
export function findClosestComponents(name, components, maxDistance = 3) {
  const allNames = Object.values(components).flat();
  const needle = name.toLowerCase();

  const matches = allNames
    .map(comp => ({
      name: comp,
      distance: levenshteinDistance(needle, comp.toLowerCase()),
    }))
    .filter(m => m.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);

  return matches;
}

/** The score of a component whose name is the typed name, ignoring case. */
export const EXACT_NAME_SCORE = 100;
/** The score of a component with a keyword that is the typed name. */
export const EXACT_KEYWORD_SCORE = 90;

/**
 * Unified component search that scores matches across multiple signals:
 * name similarity, keyword matches, and description/feature text search.
 *
 * Always returns results (top 5 minimum). Scores determine confidence:
 *   100  exact name match
 *    90  exact keyword match
 *    80  name edit distance 1 (a swap of two adjacent letters is one edit)
 *    70  keyword substring or Levenshtein distance 1
 *    60  substring match on component name (min 4 chars, 50%+ coverage)
 *    50  description or feature text contains the search term
 *    40  name edit distance 2
 *    30  keyword Levenshtein distance 2
 *    20  name edit distance 3
 *
 * A name typed as words is one edit from the name when its letters are
 * (`top navv`, `top-navv` for `TopNav`), so a one-edit slip of a name ranks
 * above every keyword match except an exact keyword.
 *
 * Each result: { name, score, reason }, plus `keywordAt` when a keyword set
 * the component's score: the position of the keyword that set it.
 *
 * `others` are the components outside Core that the same lookup reads, such
 * as an integration's. Each one is scored by the same signals, from the
 * parts of its doc that {@link componentMatchView} keeps. A name Core already
 * has keeps Core's doc.
 *
 * @param {string} needle
 * @param {string | null} coreDir null in a run that reads no Core: only the
 *   names in `components` are scored
 * @param {Record<string, string[]>} components
 * @param {Array<{name: string, view: ComponentMatchView | null}>} [others]
 * @returns {Promise<{name: string, score: number, reason: string}[]>}
 */
export async function searchComponents(
  needle,
  coreDir,
  components,
  others = [],
) {
  const term = needle.toLowerCase();
  // The typed name without the separators between its words.
  const termJoined = term.replace(/[\s_./-]+/g, '');
  const coreNames = Object.values(components).flat();
  /** @type {Map<string, ComponentMatchView | null>} */
  const otherViews = new Map();
  const known = new Set(coreNames);
  for (const other of others) {
    if (known.has(other.name)) continue;
    known.add(other.name);
    otherViews.set(other.name, other.view);
  }
  const allNames = [...coreNames, ...otherViews.keys()];
  /** @type {Map<string, {name: string, score: number, reason: string}>} */
  const scored = new Map();
  /** Position of the keyword that set each component's score. */
  /** @type {Map<string, number>} */
  const keywordAt = new Map();

  /**
   * @param {string} name
   * @param {number} score
   * @param {string} reason
   */
  function addMatch(name, score, reason) {
    const existing = scored.get(name);
    if (!existing || score > existing.score) {
      scored.set(name, {name, score, reason});
    }
  }

  // --- Pass 1: Name matching (sync, fast) ---
  for (const comp of allNames) {
    const compLower = comp.toLowerCase();

    // Exact name
    if (compLower === term) {
      addMatch(comp, EXACT_NAME_SCORE, 'exact name');
      continue;
    }

    // Substring match on name (both directions)
    const shorter = term.length < compLower.length ? term : compLower;
    const longer = term.length < compLower.length ? compLower : term;
    if (shorter.length >= 4 && longer.includes(shorter)) {
      const coverage = shorter.length / longer.length;
      if (coverage >= 0.5) {
        addMatch(comp, 60, 'name contains "' + shorter + '"');
      }
    }

    // Edit distance on name; two adjacent letters swapped are one slip. A
    // name typed as words (`top navv` for TopNav) is one slip when its
    // letters are; the same letters are the ranking's call (same words).
    const letterDist = levenshteinDistance(term, compLower, 3, {swaps: true});
    const dist =
      letterDist > 1 &&
      termJoined !== term &&
      levenshteinDistance(termJoined, compLower, 1, {swaps: true}) === 1
        ? 1
        : letterDist;
    if (dist === 1) addMatch(comp, 80, 'similar name (distance ' + dist + ')');
    else if (dist === 2)
      addMatch(comp, 40, 'similar name (distance ' + dist + ')');
    else if (dist === 3)
      addMatch(comp, 20, 'similar name (distance ' + dist + ')');
  }

  // --- Pass 2: Keyword + description matching (each doc's kept view) ---
  const {coreComponentViews} =
    await import('../discovery/core-component-views.mjs');
  // A doc that does not read is not matched, as when no view reads.
  const coreViews = await coreComponentViews(coreDir, coreNames).catch(
    () => new Map(),
  );
  /**
   * The parts of the doc Pass 2 scores for `comp`: Core's, or the view
   * `others` gives.
   * @param {string} comp
   * @returns {ComponentMatchView | null | undefined}
   */
  function docOf(comp) {
    if (otherViews.has(comp)) return otherViews.get(comp);
    return coreViews.get(comp);
  }
  for (const comp of allNames) {
    try {
      /** @type {any} */
      const docs = docOf(comp);
      if (!docs) continue;

      // Keyword matching
      if (docs.keywords && Array.isArray(docs.keywords)) {
        for (const [at, kw] of docs.keywords.entries()) {
          const kwLower = kw.toLowerCase();
          const before = scored.get(comp)?.score ?? 0;

          // Exact keyword
          if (kwLower === term) {
            addMatch(comp, EXACT_KEYWORD_SCORE, 'keyword "' + kw + '"');
            if (!keywordAt.has(comp) || before < EXACT_KEYWORD_SCORE) {
              keywordAt.set(comp, at);
            }
            break;
          }

          // Substring: term contains keyword or keyword contains term
          const s = term.length < kwLower.length ? term : kwLower;
          const l = term.length < kwLower.length ? kwLower : term;
          if (s.length >= 4 && l.includes(s)) {
            const coverage = s.length / l.length;
            if (coverage >= 0.5) {
              addMatch(comp, 70, 'keyword "' + kw + '"');
            }
          }

          const dist = levenshteinDistance(term, kwLower);
          if (dist === 1)
            addMatch(comp, 70, 'keyword "' + kw + '" (distance ' + dist + ')');
          else if (dist === 2)
            addMatch(comp, 30, 'keyword "' + kw + '" (distance ' + dist + ')');
          if ((scored.get(comp)?.score ?? 0) > before) keywordAt.set(comp, at);
        }
      }

      // Description search (whole word boundary)
      const searchDesc = docs.usage?.description || docs.description;
      if (searchDesc && term.length >= 3) {
        const descLower = searchDesc.toLowerCase();
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('\\b' + escaped + '\\b');
        if (re.test(descLower)) {
          addMatch(comp, 50, 'description mentions "' + term + '"');
        }
      }

      // Best practices search (whole word boundary)
      const bestPractices = docs.usage?.bestPractices;
      if (bestPractices && Array.isArray(bestPractices) && term.length >= 3) {
        for (const bp of bestPractices) {
          const bpLower = bp.description.toLowerCase();
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp('\\b' + escaped + '\\b');
          if (re.test(bpLower)) {
            addMatch(comp, 50, 'best practice mentions "' + term + '"');
            break;
          }
        }
      }
    } catch {
      continue;
    }
  }

  // --- Pass 3: a name made of other words around a component's name ---
  // Only when nothing above matched: a contiguous run of the needle's words
  // ("Primitive Button", "Meta Employee Typeahead") that is a component's
  // whole name. Longer runs and runs nearer the end score higher.
  if (scored.size === 0) {
    const words = String(needle)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const byLower = new Map(allNames.map(n => [n.toLowerCase(), n]));
    const longest = Math.max(0, ...allNames.map(n => n.length));
    for (let i = 0; i < words.length; i++) {
      let run = '';
      for (let j = i + 1; j <= words.length; j++) {
        // Grow the run one word at a time; stop once no name is that long.
        run += words[j - 1];
        if (run.length > longest) break;
        if (run.length < 4 || run === term) continue;
        const comp = byLower.get(run);
        if (!comp) continue;
        const span = j - i;
        const atEnd = j === words.length ? 1 : 0;
        addMatch(
          comp,
          10 + Math.min(span, 4) + atEnd,
          'name part "' + run + '"',
        );
      }
    }
    // Keep only the strongest name parts, so a weaker part never sits
    // beside the best one.
    const best = Math.max(0, ...[...scored.values()].map(r => r.score));
    for (const [name, r] of scored) if (r.score < best) scored.delete(name);
  }

  const results = Array.from(scored.values())
    .map(r =>
      keywordAt.has(r.name)
        ? {...r, keywordAt: /** @type {number} */ (keywordAt.get(r.name))}
        : r,
    )
    .sort((a, b) => b.score - a.score || compareText(a.name, b.name));

  return results;
}

/**
 * The parts of a component doc {@link searchComponents} scores: its keywords,
 * its description, and its usage description and best practices.
 * @typedef {{keywords?: unknown, description?: unknown, usage?: {description?: unknown, bestPractices?: Array<{description?: unknown}>}}} ComponentMatchView
 */

/**
 * The {@link ComponentMatchView} of a loaded component doc, as plain data a
 * caller can keep between runs.
 * @param {any} docs
 * @returns {ComponentMatchView | null}
 */
export function componentMatchView(docs) {
  if (!docs || typeof docs !== 'object') return null;
  const usage = docs.usage && typeof docs.usage === 'object' ? docs.usage : {};
  const bestPractices = Array.isArray(usage.bestPractices)
    ? usage.bestPractices.map((/** @type {any} */ bp) =>
        definedFields({description: bp?.description}),
      )
    : undefined;
  return definedFields({
    keywords: docs.keywords,
    description: docs.description,
    usage: definedFields({description: usage.description, bestPractices}),
  });
}

/**
 * `fields` without the ones that are undefined, so the object reads back the
 * same from JSON.
 * @template {Record<string, unknown>} T
 * @param {T} fields
 * @returns {T}
 */
function definedFields(fields) {
  return /** @type {T} */ (
    Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    )
  );
}

/**
 * The first sentence of a text, whitespace collapsed. A period after "e.g" or
 * "i.e", or inside an open quote (a quoted date such as "2. Nov. 2026"), does
 * not end the sentence. Used where a description has to fit on one line:
 * `build`'s text kit, and the text views of `search` and `template --list`.
 * @param {string} text
 * @returns {string}
 */
export function firstSentence(text) {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const ends = /[.!?](?=\s|$)/g;
  for (let m = ends.exec(flat); m; m = ends.exec(flat)) {
    const before = flat.slice(0, m.index);
    if (!/\b(e\.g|i\.e)$/i.test(before) && !insideQuote(before)) {
      return flat.slice(0, m.index + 1);
    }
  }
  return flat;
}

/**
 * Whether a text ends inside a quote it opened: an odd count of straight
 * double quotes, or more opening curly quotes than closing ones.
 * @param {string} text
 * @returns {boolean}
 */
function insideQuote(text) {
  const count = (/** @type {RegExp} */ re) => (text.match(re) ?? []).length;
  return count(/"/g) % 2 === 1 || count(/\u201C/g) > count(/\u201D/g);
}
