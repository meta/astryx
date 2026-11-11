// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's keyword rule for keywords that name another entry. A
 * component or hook doc's declared keyword that is exactly another entry's
 * whole name (NumberInput declaring `spinner` while a Spinner component
 * exists) points the reader at that other entry; it is not a promise that this
 * entry answers the word. Search does not count such a keyword as a match,
 * unless the entry's own description uses the word too, or the other entry is
 * its own family member or its hook/component pair (useHoverCard and
 * HoverCard).
 * @input the gathered catalog
 * @output the same catalog with those keywords left out of its component and
 *   hook entries
 * @position api/search; only search() (search.mjs) applies it. searchCore and
 *   build read keywords as gathered, so build's output does not move.
 */

/**
 * A name or phrase reduced to its letters and digits, lowercased:
 * `list-item`, `List Item` and `ListItem` all read `listitem`.
 * @param {unknown} text
 * @returns {string}
 */
export const compact = text =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * A compacted word with its plural or singular: `step` and `steps`.
 * @param {string} word
 * @returns {string[]}
 */
const forms = word =>
  word.endsWith('s')
    ? [word, `${word}s`, word.slice(0, -1)]
    : [word, `${word}s`];

/**
 * Whether a compacted word is a run of adjacent words of a text: `tablecell`
 * is in "hundreds of table cell observers", `visuallyhidden` in "a
 * visually-hidden region", and `ton` is not in "button".
 * @param {string[]} words - the text's words, lowercased
 * @param {string} word
 * @returns {boolean}
 */
function inWords(words, word) {
  for (let i = 0; i < words.length; i++) {
    if (!word.startsWith(words[i])) continue;
    let at = 0;
    for (let j = i; j < words.length && word.startsWith(words[j], at); j++) {
      at += words[j].length;
      if (at === word.length) return true;
    }
  }
  return false;
}

/**
 * Whether two entries belong together, so one may name the other in its
 * keywords: one is the other's family, they share a family, or one is the
 * other's hook (`useHoverCard` and `HoverCard`).
 * @param {import('./_lexical.mjs').Candidate} a
 * @param {import('./_lexical.mjs').Candidate} b
 * @returns {boolean}
 */
function related(a, b) {
  if (a._family && (a._family === b.name || a._family === b._family)) {
    return true;
  }
  if (b._family === a.name) return true;
  const x = compact(a.name);
  const y = compact(b.name);
  return x === `use${y}` || y === `use${x}`;
}

/** The domains whose keywords are a doc's declared keywords. */
const DECLARING = new Set(['component', 'hook']);

/**
 * The catalog's component and hook entries, each with the keywords that name
 * another entry left out (see the file comment). Entries with nothing left
 * out are returned as they are.
 * @param {import('./_lexical.mjs').Candidate[]} all
 * @returns {import('./_lexical.mjs').Candidate[]}
 */
export function withoutOtherNames(all) {
  /** @type {Map<string, import('./_lexical.mjs').Candidate[]>} */
  const byName = new Map();
  for (const c of all) {
    if (!DECLARING.has(c.domain)) continue;
    for (const name of [c.name, ...(c.aliases ?? [])]) {
      const key = compact(name);
      if (!key) continue;
      const list = byName.get(key);
      if (list) list.push(c);
      else byName.set(key, [c]);
    }
  }
  return all.map(c => {
    if (!DECLARING.has(c.domain) || !c.keywords?.length) return c;
    /** @type {string[] | null} */
    let described = null;
    const keywords = c.keywords.filter(keyword => {
      const word = compact(keyword);
      if (!word) return true;
      const wordForms = forms(word);
      /** @type {import('./_lexical.mjs').Candidate[]} */
      const others = [];
      for (const form of wordForms) {
        for (const o of byName.get(form) ?? []) {
          if (o !== c && o.name !== c.name) others.push(o);
        }
      }
      if (others.length === 0) return true;
      described ??=
        String(c.description ?? '')
          .toLowerCase()
          .match(/[a-z0-9]+/g) ?? [];
      const words = described;
      if (wordForms.some(form => inWords(words, form))) return true;
      return others.some(o => related(c, o));
    });
    return keywords.length === c.keywords.length ? c : {...c, keywords};
  });
}

/** @type {WeakMap<object, object>} each gathered catalog's search view */
const views = new WeakMap();

/**
 * The gathered catalog as search reads it: its entries with
 * {@link withoutOtherNames} applied. A reused gather gets the same view back.
 * @template {{all: import('./_lexical.mjs').Candidate[], components: import('./_lexical.mjs').Candidate[]}} T
 * @param {T} catalog
 * @returns {T}
 */
export function searchView(catalog) {
  const seen = views.get(catalog);
  if (seen) return /** @type {T} */ (seen);
  const all = withoutOtherNames(catalog.all);
  const swap = new Map(catalog.all.map((c, i) => [c, all[i]]));
  const view = {
    ...catalog,
    all,
    components: catalog.components.map(c => swap.get(c) ?? c),
  };
  views.set(catalog, view);
  return view;
}
