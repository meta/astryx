// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Word matching for search: stems and word forms, word starts,
 * identifier spelling, joined names, and typo tolerance.
 */

import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';

/**
 * Light stemmer: strips common English suffixes so "charts"/"charting" and
 * "chart" share a root. Deliberately crude (no Porter) — good enough to bridge
 * plural/gerund gaps without a dependency.
 * @param {string} w
 * @returns {string}
 */
export function stem(w) {
  let s = w;
  for (const suf of ['ing', 'ed', 'ies', 'es', 's']) {
    if (s.length > suf.length + 2 && s.endsWith(suf)) {
      s = suf === 'ies' ? s.slice(0, -3) + 'y' : s.slice(0, -suf.length);
      break;
    }
  }
  return s;
}

/**
 * Visits the forms of a word that count as the same word, in order, until a
 * visit returns true. The forms are the word, its stem, and its singular when
 * it ends in a plural suffix. So "tables" is "table", "statuses" is "status",
 * and "filtering" is "filter".
 * @param {string} w - Lowercase word.
 * @param {(form: string) => boolean} visit
 * @returns {boolean} whether a visit returned true
 */
function someForm(w, visit) {
  if (visit(w) || visit(stem(w))) return true;
  if (w.length > 3 && w.endsWith('s') && visit(w.slice(0, -1))) return true;
  if (w.length > 4 && w.endsWith('es') && visit(w.slice(0, -2))) return true;
  if (w.length > 4 && w.endsWith('ies') && visit(w.slice(0, -3) + 'y')) {
    return true;
  }
  // A gerund keeps its verb: "spacing" lost a final e ("space"), and
  // "dragging" doubled a consonant ("drag"). A past participle does not: it
  // usually describes a state ("archived notes"), not the action a catalog
  // word names.
  if (w.length >= 6 && w.endsWith('ing')) {
    const base = w.slice(0, -3);
    if (visit(base) || visit(`${base}e`)) return true;
    if (/([b-df-hj-np-tv-z])\1$/.test(base) && visit(base.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

/**
 * The forms of a word that count as the same word (see someForm).
 * @param {string} w - Lowercase word.
 * @returns {Set<string>}
 */
export function wordForms(w) {
  /** @type {Set<string>} */
  const forms = new Set();
  someForm(w, form => {
    forms.add(form);
    return false;
  });
  return forms;
}

/**
 * The singulars a lowercase word may have when it ends in a plural suffix:
 * "tokens" is "token", "boxes" is "box", "entries" is "entry".
 * @param {string} w
 * @returns {string[]}
 */
function singulars(w) {
  /** @type {string[]} */
  const out = [];
  if (w.length > 3 && w.endsWith('s')) out.push(w.slice(0, -1));
  if (w.length > 4 && w.endsWith('es')) out.push(w.slice(0, -2));
  if (w.length > 4 && w.endsWith('ies')) out.push(w.slice(0, -3) + 'y');
  return out;
}

/**
 * Whether two lowercase words are the same word, up to plural and stem form.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameWord(a, b) {
  if (a === b) return true;
  const forms = wordForms(a);
  return someForm(b, form => forms.has(form));
}

/**
 * A search term's forms and the word starts it matches, worked out once for
 * every word the term is compared with.
 * @typedef {{term: string, forms: Set<string>, starts: string[]}} TermWords
 */

/**
 * @param {string} term - Lowercase term.
 * @returns {TermWords}
 */
export function termWords(term) {
  return {
    term,
    forms: wordForms(term),
    // The term or its singular may start the word: "tokens" starts
    // "tokenizer" through "token". A singular needs five letters, so "stats"
    // does not start "status".
    starts: [term, ...singulars(term).filter(f => f.length >= 5)],
  };
}

/**
 * Whether a lowercase word is the term's word, as sameWord answers.
 * @param {TermWords} t
 * @param {string} w
 * @returns {boolean}
 */
export function sameTermWord(t, w) {
  return w === t.term || someForm(w, form => t.forms.has(form));
}

/**
 * The lowercase words of a name or keyword: split at non-alphanumerics and at
 * camelCase boundaries, so "TextInput" is ["text", "input"] and
 * "Dashboard - Analytics" is ["dashboard", "analytics"].
 * @param {string} text
 * @returns {string[]}
 */
export function wordsOf(text) {
  const key = String(text);
  let words = splitWords.get(key);
  if (words === undefined) {
    // A long-running caller ranks many queries; start over rather than grow.
    if (splitWords.size >= SPLIT_WORDS_LIMIT) splitWords.clear();
    words = Object.freeze(
      key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
    splitWords.set(key, words);
  }
  return /** @type {string[]} */ (words);
}

/**
 * Each text's words, split once per process: a search splits the same names
 * and keywords for every term of every query.
 * @type {Map<string, readonly string[]>}
 */
const splitWords = new Map();

/** How many texts' words are kept before the cache starts over. */
const SPLIT_WORDS_LIMIT = 100_000;

/**
 * Whether a term is found inside a name or keyword: it is one of its words, or
 * the start of one (a truncation), and covers at least half of the whole
 * string. Four letters minimum, so a short term never matches by accident.
 * @param {string} term - Lowercase term.
 * @param {string} text - The name or keyword as authored.
 * @returns {boolean}
 */
export function startsAWordOf(term, text) {
  if (!coversHalf(term, text)) return false;
  return startsATermWordOf(termWords(term), text);
}

/**
 * startsAWordOf for a term whose words are already worked out.
 * @param {TermWords} t
 * @param {string} text - The name or keyword as authored.
 * @returns {boolean}
 */
export function startsATermWordOf(t, text) {
  if (!coversHalf(t.term, text)) return false;
  return wordsOf(text).some(
    w => t.starts.some(f => w.startsWith(f)) || sameTermWord(t, w),
  );
}

/**
 * Whether a term is long enough to match inside `text`: four letters, and at
 * least half of the text.
 * @param {string} term
 * @param {string} text
 */
function coversHalf(term, text) {
  return term.length >= 4 && term.length / String(text).length >= 0.5;
}

/**
 * A query with its camelCase and PascalCase identifiers spelled as words, so
 * `SidebarToggle` reads "sidebar toggle" and `useTablePaginationState` "use
 * table pagination state". Plain words, and identifiers joined with `_` or `-`, are
 * unchanged: a joined token that matches nothing stays unmatched.
 * @param {string} query - The query as typed, before lowercasing.
 * @returns {string} Lowercased.
 */
export function spellIdentifiers(query) {
  return String(query)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase();
}

/**
 * A name or keyword with its separators removed, lowercased: `Side Nav`,
 * `side-nav`, and `SideNav` all join to `sidenav`.
 * @param {string} text
 * @returns {string}
 */
export function joined(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * The fewest letters both words need before an edit distance counts as a
 * typo, by distance. Below them, one edit usually makes a different word.
 */
const TYPO_MIN_LENGTH = {1: 5, 2: 8, 3: 11};

/**
 * @param {string} a
 * @param {string} b
 * @param {number} dist
 */
export const isTypo = (a, b, dist) =>
  dist > 0 &&
  dist <= 3 &&
  Math.min(a.length, b.length) >=
    TYPO_MIN_LENGTH[/** @type {1 | 2 | 3} */ (dist)];

/**
 * The edit distance between two words when it counts as a typo (isTypo), or
 * null. The shorter word's length caps the distance that can count. A pair
 * the cap rules out needs no distance table, and the others compute only the
 * cells within the cap.
 * @param {string} a
 * @param {string} b
 * @returns {1 | 2 | 3 | null}
 */
export function typoDistance(a, b) {
  const shorter = Math.min(a.length, b.length);
  const cap =
    shorter >= TYPO_MIN_LENGTH[3]
      ? 3
      : shorter >= TYPO_MIN_LENGTH[2]
        ? 2
        : shorter >= TYPO_MIN_LENGTH[1]
          ? 1
          : 0;
  if (cap === 0) return null;
  const dist = levenshteinDistance(a, b, cap);
  return dist >= 1 && dist <= cap ? /** @type {1 | 2 | 3} */ (dist) : null;
}
