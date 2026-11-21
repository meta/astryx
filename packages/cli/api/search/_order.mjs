// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How a searcher orders the lexical ranker's matches. Search answers
 * only with what the lexical ranker matched, each with its own score and
 * reason. A match never moves past one of another score band (BANDS below)
 * or another kind, doc or not; between runs the lexical order holds. The one
 * exception is a family's root that the lexical ranker marks as leading its
 * part with hits of keyword strength: it moves directly before the part. A
 * band
 * can be wide: 55–99 holds keyword matches beside one-word description hits,
 * and a synonym name match can score under 55, so inside a band a weaker match
 * can lead a stronger one when the weights favor it. Inside such a
 * run the learned order places the matches, with these exceptions: matches
 * that scored the same move as one block; an entry the query names leads; in a
 * query of one or two words, the matches on every word keep their lexical
 * order; and an integration's matches that scored the same keep theirs.
 * Below the first result, a block of one domain is ordered by fit (tiesByFit): a part of the first result, then rarer matched
 * words, then the lexical order. Before that, among matches tied with the
 * first result on score and on the query words they matched, the one whose
 * own name holds more query words leads (tieByOwnName). Last, a family's root
 * that the lexical ranker marks as leading a part of its own family
 * (rootLeadsOf) moves directly before the part when it sits below it
 * (rootsFirst), after the part's tie is ordered as one block; a root with
 * weaker hits (weakRootsOf) moves so only inside the part's run.
 */

import {entryOf} from './_entries.mjs';
import {fold, nameWords, queryWords, words} from './_query-words.mjs';
import {
  answeredTerms,
  movedRootsOf,
  namedLeadsOf,
  rootLeadsOf,
  searchedComponentsOf,
  weakRootsOf,
} from './_result.mjs';

/** @typedef {import('./_entries.mjs').EntryTable} EntryTable */

/**
 * Where each lexical band starts, highest first: the whole query as a name,
 * as a keyword, as a phrase in a title, a title in the query, every word
 * matched, a strong partial match, a name or keyword match, and below that,
 * prose alone.
 */
const BANDS = [195, 188, 170, 160, 151, 100, 55];
/** The lowest score of the every-word top tier. */
const FULL_COVERAGE = 151;

/** @param {number} score */
export const bandOf = score => {
  const i = BANDS.findIndex(floor => score >= floor);
  return i === -1 ? BANDS.length : i;
};

/**
 * The search response: the lexical matches, each band in the learned order.
 * Nothing is added or dropped, so the count and the scores stay the lexical
 * ranker's; only the order inside a band, and so which matches fill the
 * limit, changes.
 * @param {EntryTable} table
 * @param {number[]} order entry positions, best first, by the searcher's weights
 * @param {import('./search.type.mjs').SearchResponse} lexical every lexical match
 * @param {string} query
 * @param {number} limit
 * @param {Map<string, string>} [families] each family member's
 *   `domain:name`, mapped to the family its doc lists it in
 * @returns {import('./search.type.mjs').SearchResponse}
 */
export function orderMatches(table, order, lexical, query, limit, families) {
  const all = lexical.data.results;
  /** @type {Map<number, number>} */
  const place = new Map(order.map((k, i) => [k, i]));
  // Runs of consecutive lexical matches in one band and of one kind (doc or
  // not) are the only places the learned order acts: a match never crosses
  // into another band, or past a doc or a non-doc the lexical ranker placed.
  // A family's root that the lexical ranker marks as leading its part keeps
  // its own run here and moves to its part last (rootsFirst).
  let run = -1;
  /** @type {string} */
  let last = '';
  const items = all.map((res, i) => {
    // Each match's own band: the lexical merge can place a weaker match
    // ahead of a stronger doc, and the two must never share a run.
    const key = `${bandOf(res.score ?? 0)}:${res.domain === 'doc'}`;
    if (key !== last) {
      run++;
      last = key;
    }
    const k = entryOf(table, res);
    return {
      res,
      i,
      band: run,
      learned: k === undefined ? Infinity : (place.get(k) ?? Infinity),
    };
  });
  const roots = rootLeadsOf.get(lexical);
  const weak = weakRootsOf.get(lexical);
  // An entry the query names: by a name match, or by a name of two or more
  // words the lexical ranker put first (namedLeadsOf).
  const leads = namedLeadsOf.get(lexical);
  const named = (/** @type {Item} */ it) =>
    ((it.res.score ?? 0) >= 95 &&
      /^(exact name|plural of the name|name )/.test(it.res.reason ?? '')) ||
    (leads?.has(it.res) ?? false);
  // Matches the lexical ranker scored the same move as one block, in its
  // order; the learned position of the block's first match places the block
  // in its run (not its best member's, which would let one strong member lift
  // a whole block of weak ones), and an entry the query names leads its run.
  // Moving each match on its own breaks search's existing rules for tied
  // matches (`file required` leads with Field, `ci` with the integration
  // check) and grows answers, so ties move together; where the block lands is
  // measured as spec:AST-083 FR6 requires.
  /** @type {Map<string, number>} */
  const block = new Map();
  const blockOf = (/** @type {Item} */ it) => `${it.band}:${it.res.score}`;
  for (const it of items) {
    const at = named(it) ? -1 : it.learned;
    const k = blockOf(it);
    if (!block.has(k) || at === -1) block.set(k, at);
  }
  let ranked = [...items].sort(
    (x, y) =>
      x.band - y.band ||
      (block.get(blockOf(x)) ?? 0) - (block.get(blockOf(y)) ?? 0) ||
      x.i - y.i,
  );
  if (words(query).length <= 2) {
    ranked = keepLexical(ranked, it => (it.res.score ?? 0) >= FULL_COVERAGE);
  }
  ranked = integrationTies(ranked);
  if (ranked.length > 1 && !named(ranked[0])) {
    ranked = tieByOwnName(ranked, query, blockOf, families);
  }
  // Each whole tie is ordered by fit before the limit, so every limit shows
  // the top of one answer. A root moves to its part only after that: placed
  // first, it would split the part's tie, and the fit order would then miss
  // the part. The fit order reads the parts of the result that leads once
  // the roots move: a part's root, when the part comes first.
  const head = ranked[0];
  const headRoot = head && roots?.get(head.res);
  const rootItem = ranked.find(it => it.res === headRoot);
  const lead =
    rootItem && !(weak?.has(head.res) && rootItem.band !== head.band)
      ? rootItem
      : head;
  ranked = tiesByFit(ranked, table, blockOf, lead);
  /** @type {Map<object, object>} */
  const moved = new Map();
  if (roots) ranked = rootsFirst(ranked, roots, moved, weak);
  const shown = ranked.slice(0, limit);
  const response = {
    ...lexical,
    data: {...lexical.data, results: shown.map(it => it.res)},
  };
  const searched = searchedComponentsOf.get(lexical);
  if (searched) searchedComponentsOf.set(response, searched);
  if (moved.size) movedRootsOf.set(response, moved);
  return /** @type {import('./search.type.mjs').SearchResponse} */ (response);
}

/**
 * @typedef {{res: any, i: number, band: number, learned: number}} Item
 */

/** How many parts of the first result lead their ties, across an answer. */
const PARTS_FIRST = 2;

/**
 * Below the first result, matches the lexical ranker scored the same keep
 * their block but are no longer in name order inside it: a part or sibling of
 * the first result leads (TableRow after Table), then the match whose matched
 * words are rarer in the catalog, so a match on a common word alone sits
 * below one on the query's telling words. Nothing crosses a block.
 * @param {Item[]} ranked
 * @param {EntryTable} table
 * @param {(item: Item) => string} blockOf
 * @param {Item} [lead] the result the answer leads with, when that is not
 *   `ranked[0]`: a root that rootsFirst puts ahead of its part
 * @returns {Item[]}
 */
function tiesByFit(ranked, table, blockOf, lead = ranked[0]) {
  if (ranked.length < 3) return ranked;
  const first = nameWords(String(lead.res.name ?? '')).map(fold);
  const {idf, rarest} = table.fields.desc;
  /** @param {Item} it */
  const related = it => {
    // A part's name words start with the first result's whole name words:
    // TableRow is a part of Table, Table is no part of Tab.
    const name = nameWords(String(it.res.name ?? '')).map(fold);
    return (
      (first.length > 0 &&
        name.length > first.length &&
        first.every((w, n) => name[n] === w)) ||
      /^member of /.test(it.res.reason ?? '')
    );
  };
  /** @param {Item} it */
  const rarity = it => {
    const m = /^matches \d+\/\d+ terms: (.*)$/.exec(it.res.reason ?? '');
    if (!m) return 0;
    let sum = 0;
    // A matched term counts by its alphanumeric parts (`three-dot`), and a
    // part the catalog never uses is as rare as a word can be.
    for (const t of m[1].split(', '))
      for (const part of words(t)) sum += idf.get(fold(part)) ?? rarest;
    return sum;
  };
  const out = [ranked[0]];
  let parts = 0;
  for (let i = 1; i < ranked.length;) {
    let j = i;
    const at = (/** @type {Item} */ it) => `${blockOf(it)}:${it.res.domain}`;
    while (j < ranked.length && at(ranked[j]) === at(ranked[i])) j++;
    const run = ranked.slice(i, j);
    if (run.length > 1) {
      const keyed = run.map((it, n) => {
        // At most PARTS_FIRST parts lead, across the answer, so a family
        // with many parts does not crowd out what else the query matched.
        const r = parts < PARTS_FIRST && related(it);
        if (r) parts++;
        return {it, n, r, f: rarity(it)};
      });
      keyed.sort((a, b) => Number(b.r) - Number(a.r) || b.f - a.f || a.n - b.n);
      out.push(...keyed.map(k => k.it));
    } else out.push(...run);
    i = j;
  }
  return out;
}

/**
 * The first result's tie goes to the match whose own name holds more query
 * words. Among matches of one domain that the lexical ranker scored the same
 * as the first result, and that matched the same query words (the terms
 * their reasons list), the match whose name words hold more of the query's
 * words than the first result's name moves first. A first result whose
 * reason lists no terms keeps its place: it matched the whole query, or the
 * query holds its title. A part of the first result never takes its place
 * this way: rootsFirst decides between a family's root and its parts. Only
 * the first place changes, and nothing crosses a block or a domain.
 * @param {Item[]} ranked
 * @param {string} query
 * @param {(item: Item) => string} blockOf
 * @param {Map<string, string>} [families]
 * @returns {Item[]}
 */
export function tieByOwnName(ranked, query, blockOf, families) {
  const first = ranked[0];
  const terms = first ? answered(first) : null;
  if (!terms || ranked.length < 2) return ranked;
  const asked = new Set(queryWords(query));
  /** @param {Item} it */
  const inName = it => {
    const own = new Set(nameWords(String(it.res.name ?? '')).map(fold));
    let n = 0;
    for (const w of asked) if (own.has(w)) n++;
    return n;
  };
  /** @param {Set<string> | null} other */
  const same = other =>
    other !== null &&
    other.size === terms.size &&
    [...other].every(w => terms.has(w));
  let best = 0;
  let most = inName(first);
  for (let j = 1; j < ranked.length; j++) {
    const it = ranked[j];
    if (blockOf(it) !== blockOf(first)) break;
    if (it.res.domain !== first.res.domain || partOf(it, first, families)) {
      continue;
    }
    if (!same(answered(it))) continue;
    const n = inName(it);
    if (n > most) {
      best = j;
      most = n;
    }
  }
  if (best === 0) return ranked;
  const out = [...ranked];
  out.unshift(...out.splice(best, 1));
  return out;
}

/**
 * Whether a match is a part of another: its doc lists it in the other's
 * family, or its name words start with the other's whole name words.
 * @param {Item} it
 * @param {Item} of
 * @param {Map<string, string>} [families]
 */
function partOf(it, of, families) {
  if (families?.get(`${it.res.domain}:${it.res.name}`) === of.res.name) {
    return true;
  }
  const root = nameWords(String(of.res.name ?? '')).map(fold);
  const name = nameWords(String(it.res.name ?? '')).map(fold);
  return name.length > root.length && root.every((w, n) => name[n] === w);
}

/**
 * The matches `pick` selects keep the places they hold, filled in lexical
 * order.
 * @param {Item[]} items
 * @param {(item: Item) => boolean} pick
 * @returns {Item[]}
 */
function keepLexical(items, pick) {
  /** @type {number[]} */
  const at = [];
  items.forEach((it, j) => pick(it) && at.push(j));
  if (at.length < 2) return items;
  const sorted = at.map(j => items[j]).sort((a, b) => a.i - b.i);
  const out = [...items];
  at.forEach((j, n) => (out[j] = sorted[n]));
  return out;
}

/**
 * An integration's matches that the lexical ranker scored the same keep its
 * order among themselves: they have no cards, so the learned order would only
 * guess between them.
 * @param {Item[]} items
 * @returns {Item[]}
 */
export function integrationTies(items) {
  /** @type {Map<number, number[]>} */
  const groups = new Map();
  items.forEach((it, j) => {
    const pkg = it.res.package ?? '';
    if (!pkg || pkg.startsWith('@astryxdesign/')) return;
    const key = it.res.score ?? 0;
    if (!groups.has(key)) groups.set(key, []);
    /** @type {number[]} */ (groups.get(key)).push(j);
  });
  const out = [...items];
  for (const at of groups.values()) {
    if (at.length < 2) continue;
    const sorted = at.map(j => items[j]).sort((a, b) => a.i - b.i);
    at.forEach((j, n) => (out[j] = sorted[n]));
  }
  return out;
}

/**
 * The query words a match answered: the terms its reason lists, folded, or
 * null when it answered the whole query (a name, keyword, or title hit).
 * @param {Item} it
 * @returns {Set<string> | null}
 */
function answered(it) {
  return answeredTerms(it.res.reason);
}

/**
 * A family's root leads a part of its own family: the lexical ranker names
 * the root of each part it leads (rootLeadsOf), and a root placed below that
 * part moves directly before it, whatever its band; before its highest part
 * when it leads several. A root already above its part keeps its place.
 * Nothing else moves.
 * @param {Item[]} ranked
 * @param {Map<object, object>} roots each part's result, mapped to its
 *   root's result
 * @param {Map<object, object>} [moved] filled with each part whose root
 *   moved, mapped to that root
 * @param {Set<object>} [weak] parts whose root leads them only inside their
 *   own run
 * @returns {Item[]}
 */
export function rootsFirst(ranked, roots, moved, weak) {
  const out = [...ranked];
  for (let a = 0; a < out.length; a++) {
    const root = roots.get(out[a].res);
    if (!root) continue;
    const b = out.findIndex((it, n) => n > a && it.res === root);
    if (b < 0) continue;
    if (weak?.has(out[a].res) && out[b].band !== out[a].band) continue;
    out.splice(a, 0, ...out.splice(b, 1));
    moved?.set(out[a + 1].res, root);
  }
  return out;
}
