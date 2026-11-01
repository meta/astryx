// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Word matching for search: stems and word forms, word starts,
 * identifier spelling, joined names, and typo tolerance.
 */

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
 * The forms of a word that count as the same word: itself, its stem, and its
 * singular when it ends in a plural suffix — so "tables" is "table",
 * "statuses" is "status", and "filtering" is "filter".
 * @param {string} w - Lowercase word.
 * @returns {Set<string>}
 */
export function wordForms(w) {
  const forms = new Set([w, stem(w)]);
  if (w.length > 3 && w.endsWith('s')) forms.add(w.slice(0, -1));
  if (w.length > 4 && w.endsWith('es')) forms.add(w.slice(0, -2));
  if (w.length > 4 && w.endsWith('ies')) forms.add(w.slice(0, -3) + 'y');
  // A gerund keeps its verb: "spacing" lost a final e ("space"), and
  // "dragging" doubled a consonant ("drag"). A past participle does not: it
  // usually describes a state ("archived notes"), not the action a catalog
  // word names.
  if (w.length >= 6 && w.endsWith('ing')) {
    const base = w.slice(0, -3);
    forms.add(base);
    forms.add(`${base}e`);
    if (/([b-df-hj-np-tv-z])\1$/.test(base)) forms.add(base.slice(0, -1));
  }
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
  for (const f of wordForms(b)) if (forms.has(f)) return true;
  return false;
}

/**
 * The lowercase words of a name or keyword: split at non-alphanumerics and at
 * camelCase boundaries, so "TextInput" is ["text", "input"] and
 * "Dashboard - Analytics" is ["dashboard", "analytics"].
 * @param {string} text
 * @returns {string[]}
 */
export function wordsOf(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Whether a term is found inside a name or keyword: it is one of its words, or
 * the start of one (a truncation), and covers at least half of the whole
 * string. Four letters minimum, so a short term never matches by accident.
 * @param {string} term - Lowercase term.
 * @param {string} text - The name or keyword as authored.
 * @returns {boolean}
 */
export function startsAWordOf(term, text) {
  if (term.length < 4) return false;
  if (term.length / String(text).length < 0.5) return false;
  // The term or its singular may start the word: "tokens" starts
  // "tokenizer" through "token". A singular needs five letters, so "stats"
  // does not start "status".
  const starts = [term, ...singulars(term).filter(f => f.length >= 5)];
  return wordsOf(text).some(
    w => starts.some(f => w.startsWith(f)) || sameWord(term, w),
  );
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
