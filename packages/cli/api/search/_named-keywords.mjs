// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's reading of keywords and query words that name another
 * entry. It holds two rules. (1) A component or hook doc's declared keyword
 * that is exactly another entry's whole name (NumberInput declaring `spinner`
 * while a Spinner component exists) points the reader at that other entry; it
 * is not a promise that this entry answers the word. Search does not count
 * such a keyword as a match, unless the entry's own description uses the word
 * too, or the other entry is its own family member or its hook/component pair
 * (useHoverCard and HoverCard). Names are read as the ranker reads them:
 * joined (`joined`, _words.mjs) and either plural (`pluralOf`, _query.mjs).
 * (2) The view marks the catalog `ownEvidence`: another entry's name is that
 * entry's evidence. The components a block uses (its doc's `componentsUsed`,
 * gathered as `_uses`) still match as its keywords, but never answer a query
 * word for the block alone (_score.mjs); and a title inside the query keeps
 * its tier only when no word it leaves unanswered names a component or hook
 * (_lexical.mjs). Both are read while scoring, so the view copies no block.
 * @input the gathered catalog, and the catalogs whose components and hooks
 *   name entries (every component and hook, whatever `type` a search asks for)
 * @output the same catalog as search reads it: those keywords left out of its
 *   component and hook entries, marked `ownEvidence`
 * @position api/search; three places apply it: search() (search.mjs),
 *   rankSearchIndex() (search-index.mjs), and searchCore() (search.mjs) when
 *   it is passed `ownKeywords`, as search's own comparisons do. searchCore
 *   without it and build read keywords as gathered, so build's output does
 *   not move.
 */

import {pluralOf} from './_query.mjs';
import {joined} from './_words.mjs';

/**
 * A joined word with its plural or singular, by search's plural rule
 * (`pluralOf`): `step` and `steps`, `box` and `boxes`.
 * @param {string} word
 * @returns {string[]}
 */
function forms(word) {
  const out = [word];
  for (const plural of [`${word}s`, `${word}es`]) {
    if (pluralOf(plural, word)) out.push(plural);
  }
  for (const single of [word.slice(0, -1), word.slice(0, -2)]) {
    if (pluralOf(word, single)) out.push(single);
  }
  return out;
}

/**
 * Whether a joined word is a run of adjacent words of a text: `tablecell`
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
  const x = joined(a.name);
  const y = joined(b.name);
  return x === `use${y}` || y === `use${x}`;
}

/** The domains whose keywords are a doc's declared keywords. */
const DECLARING = new Set(['component', 'hook']);

/**
 * The catalog's component and hook entries, each with the keywords that name
 * another entry left out (see the file comment). Entries with nothing left
 * out are returned as they are.
 * @param {import('./_lexical.mjs').Candidate[]} all
 * @param {import('./_lexical.mjs').Candidate[]} [named] - the entries whose
 *   names count: `all` itself, unless the caller holds a wider catalog
 *   (`all` cut to one `type`)
 * @returns {import('./_lexical.mjs').Candidate[]}
 */
export function withoutOtherNames(all, named = all) {
  /** @type {Map<string, import('./_lexical.mjs').Candidate[]>} */
  const byName = new Map();
  for (const c of named) {
    if (!DECLARING.has(c.domain)) continue;
    for (const name of [c.name, ...(c.aliases ?? [])]) {
      const key = joined(name);
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
      const word = joined(keyword);
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

/**
 * The catalog's docs, each doc that opens a level (a docs-tree namespace such
 * as `layout`) holding the docs beneath it (`_summarizes`: the pages under its
 * route and their sections). Such a page sums up the docs below it: a word its
 * text shares with one of them is that doc's evidence, which the reader opens
 * at its own grain, so the page does not answer it through that text
 * (`scoreCandidate`, _candidate-score.mjs). Its name, title, description and
 * declared keywords stay its own. Entries with nothing beneath them are
 * returned as they are.
 * @param {import('./_lexical.mjs').Candidate[]} all
 * @returns {import('./_lexical.mjs').Candidate[]}
 */
function withSummarized(all) {
  /** @type {Map<string, import('./_lexical.mjs').Candidate[]>} */
  const below = new Map();
  for (const c of all) {
    const topic = c.domain === 'doc' ? /** @type {any} */ (c)._topic : null;
    if (typeof topic !== 'string') continue;
    for (let at = topic.indexOf('/'); at > 0; at = topic.indexOf('/', at + 1)) {
      const route = topic.slice(0, at);
      const list = below.get(route);
      if (list) list.push(c);
      else below.set(route, [c]);
    }
  }
  if (below.size === 0) return all;
  return all.map(c => {
    const topic = c.domain === 'doc' ? /** @type {any} */ (c)._topic : null;
    const docs = typeof topic === 'string' ? below.get(topic) : undefined;
    if (!docs) return c;
    const view = Object.create(
      Object.getPrototypeOf(c),
      Object.getOwnPropertyDescriptors(c),
    );
    Object.defineProperty(view, '_summarizes', {value: docs});
    return view;
  });
}

/**
 * Each gathered catalog's search views, one per set of naming catalogs.
 * @type {WeakMap<object, {others: object[], view: object}[]>}
 */
const views = new WeakMap();

/**
 * The gathered catalog as search reads it: its entries with
 * {@link withoutOtherNames} applied, and each doc that opens a level read at
 * its own grain ({@link withSummarized}). Names come from the catalog and from
 * `others`, further gathered catalogs (a search for one `type` passes the
 * other of components and hooks, so `type` never changes which keywords
 * count). A reused gather, with the same others, gets the same view back.
 * @template {{all: import('./_lexical.mjs').Candidate[], components: import('./_lexical.mjs').Candidate[]}} T
 * @param {T} catalog
 * @param {{all: import('./_lexical.mjs').Candidate[]}[]} [others]
 * @returns {T & {ownEvidence: true}}
 */
export function searchView(catalog, others = []) {
  const seen = views.get(catalog) ?? [];
  const hit = seen.find(
    v =>
      v.others.length === others.length &&
      v.others.every((o, i) => o === others[i]),
  );
  if (hit) return /** @type {T & {ownEvidence: true}} */ (hit.view);
  const all = withSummarized(
    withoutOtherNames(
      catalog.all,
      others.length === 0
        ? catalog.all
        : [catalog.all, ...others.map(o => o.all)].flat(),
    ),
  );
  const swap = new Map(catalog.all.map((c, i) => [c, all[i]]));
  const view = {
    ...catalog,
    // Search's reading: another entry's name is that entry's evidence
    // (_lexical.mjs, _score.mjs).
    ownEvidence: /** @type {const} */ (true),
    all,
    components: catalog.components.map(c => swap.get(c) ?? c),
  };
  // Only the latest view per catalog is kept: a search reuses one set of
  // naming catalogs until one of them gathers again.
  views.set(catalog, [{others, view}]);
  return view;
}
