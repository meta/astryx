// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A last pass over a searcher's answer: inside each run of one score
 * band and kind, the entries from #2 to #10 that fit the whole query much
 * worse than the others in their run move, in order, after them.
 * @input the ordered response, the gathered candidates, and the query
 * @output the same response with the same results, maybe in a new order
 * @position api/search; rankWith (_main-searcher.mjs) runs it after
 * orderMatches, with the weights the adapter loads (loadSearchData) through
 * build's own loader. The fit is the block picker's `matchOf`
 * (build/blocks/blocks.mjs) over the shipped weights' vocabulary, so an entry
 * the weights never saw is scored from its own docs the same way. Without readable
 * weights the order stays.
 */

import {
  docSideOf,
  matchOf,
  requestSideOf,
  stemOf,
  termsOf,
  wordsOf,
} from '../build/blocks/blocks.mjs';
import {bandOf} from './_order.mjs';
import {searchedComponentsOf} from './_result.mjs';

/** An entry stays in place when its fit is at least this times the median. */
export const FIT_BAR = 1.7;

/** An entry whose name spells at least this many query words never moves. */
const NAME_WORDS = 2;

/** The first result stays; the pass orders the places after it up to here. */
export const FIT_PLACES = 10;

/** @typedef {import('../build/blocks/blocks.mjs').BlockPickerWeights} Weights */
/** @typedef {{vector: Map<number, number>, projected: Float64Array}} Side */

/**
 * Each candidate by `domain:name`; a doc also by its topic and by
 * `topic#section`. The first candidate with a key owns it.
 * @type {WeakMap<any[], Map<string, any>>}
 */
const keyed = new WeakMap();

/**
 * Each candidate's docs side, computed when a result first needs it.
 * @type {WeakMap<Weights, WeakMap<any, Side>>}
 */
const sides = new WeakMap();

/**
 * An entry's docs text: its name words, display name or first title,
 * description, and keywords.
 * @param {any} c
 */
const docText = c =>
  [
    wordsOf(c.name).join(' '),
    c._displayName ?? (Array.isArray(c.titles) ? c.titles[0] : '') ?? '',
    c.description ?? '',
    (Array.isArray(c.keywords) ? c.keywords : []).join(' '),
  ].join(' ');

/**
 * @param {any[]} candidates
 * @returns {Map<string, any>}
 */
function keysOf(candidates) {
  let byKey = keyed.get(candidates);
  if (!byKey) {
    byKey = new Map();
    for (const c of candidates) {
      const keys = [`${c.domain}:${c._resultName ?? c.name}`];
      if (c.domain === 'doc' && c._topic)
        keys.push(
          c._section ? `doc:${c._topic}#${c._section}` : `doc:${c._topic}`,
        );
      for (const k of keys) if (!byKey.has(k)) byKey.set(k, c);
    }
    keyed.set(candidates, byKey);
  }
  return byKey;
}

/**
 * @param {any} c
 * @param {Weights} weights
 * @returns {Side}
 */
function candidateSide(c, weights) {
  let byCandidate = sides.get(weights);
  if (!byCandidate) {
    byCandidate = new WeakMap();
    sides.set(weights, byCandidate);
  }
  let side = byCandidate.get(c);
  if (!side) {
    side = docSideOf(docText(c), weights);
    byCandidate.set(c, side);
  }
  return side;
}

/**
 * A result's docs side: its candidate's, else one from the result's own name,
 * display name and description.
 * @param {any} r
 * @param {any[]} candidates
 * @param {Weights} weights
 * @returns {Side}
 */
function resultSideOf(r, candidates, weights) {
  const byKey = keysOf(candidates);
  if (r.domain === 'doc' && r.section) {
    const c = byKey.get(`doc:${r.name}#${r.section}`);
    if (c) return candidateSide(c, weights);
  }
  const c = byKey.get(`${r.domain}:${r.name}`);
  return c
    ? candidateSide(c, weights)
    : docSideOf(
        `${wordsOf(r.name).join(' ')} ${r.displayName ?? ''} ${r.description ?? ''}`,
        weights,
      );
}

/**
 * A result's run: its score band and kind (doc or not), as orderMatches reads
 * them.
 * @param {any} r
 */
const runOf = r => `${bandOf(r.score ?? 0)}:${r.domain === 'doc'}`;

/**
 * The results with the first kept. Entries #2 to #10 split into runs of one
 * band and kind. Inside a run, the entries that fit the query under FIT_BAR
 * times the run's median fit move, in order, after the others, unless their
 * name spells NAME_WORDS or more of the query's words. A run whose
 * median fit is zero or less keeps its order. Nothing crosses a run, and
 * nothing is added or dropped.
 * @param {any[]} results
 * @param {any[]} candidates
 * @param {string} query
 * @param {Weights | (() => Weights | null | undefined) | null | undefined} weights
 *   the block picker's weights, or a function that reads them; the function
 *   runs only when a run can change. Without weights the order stays
 * @returns {any[]}
 */
export function orderByFit(results, candidates, query, weights) {
  if (!weights || results.length < 3) return results;
  const end = Math.min(FIT_PLACES, results.length);
  /** @type {[number, number][]} */
  const runs = [];
  for (let i = 1; i < end;) {
    let j = i;
    while (j < end && runOf(results[j]) === runOf(results[i])) j++;
    runs.push([i, j]);
    i = j;
  }
  // Only a run of two or more can change, so the weights stay unread when
  // there is none.
  if (!runs.some(([i, j]) => j - i > 1)) return results;
  const w = typeof weights === 'function' ? weights() : weights;
  if (!w) return results;
  const request = requestSideOf(query, w);
  const queryWords = new Set(termsOf(query).filter(t => !t.includes('_')));
  /** @param {any} r */
  const named = r =>
    new Set(
      wordsOf(r.name)
        .map(stemOf)
        .filter(word => queryWords.has(word)),
    ).size >= NAME_WORDS;
  const out = results.slice();
  let changed = false;
  for (const [i, j] of runs) {
    if (j - i < 2) continue;
    const moved = demoteWeak(
      results.slice(i, j),
      request,
      candidates,
      w,
      named,
    );
    moved.forEach((r, k) => {
      if (r !== out[i + k]) changed = true;
      out[i + k] = r;
    });
  }
  return changed ? out : results;
}

/**
 * One run, with the entries under FIT_BAR times its median fit moved, in
 * order, after the others. An entry whose name spells NAME_WORDS or more of
 * the query's words stays with the others: its name is strong evidence.
 * @param {any[]} run
 * @param {Side} request
 * @param {any[]} candidates
 * @param {Weights} weights
 * @param {(r: any) => boolean} named
 * @returns {any[]}
 */
function demoteWeak(run, request, candidates, weights, named) {
  const fits = run.map(
    r => matchOf(request, resultSideOf(r, candidates, weights), weights).match,
  );
  const sorted = [...fits].sort((a, b) => a - b);
  const n = sorted.length;
  const median =
    n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  if (!(median > 0)) return run;
  const bar = FIT_BAR * median;
  const kept = run.map((r, k) => fits[k] >= bar || named(r));
  return [...run.filter((_, k) => kept[k]), ...run.filter((_, k) => !kept[k])];
}

/**
 * The search response with its results ordered by fit (`orderByFit`). Any
 * other response passes through.
 * @template T
 * @param {T} response
 * @param {any[]} candidates
 * @param {string} query
 * @param {Weights | (() => Weights | null | undefined) | null | undefined} weights
 * @returns {T}
 */
export function withFitOrder(response, candidates, query, weights) {
  const r = /** @type {any} */ (response);
  const results = r?.data?.results;
  if (!Array.isArray(results)) return response;
  const ordered = orderByFit(results, candidates, query, weights);
  if (ordered === results) return response;
  const out = {...r, data: {...r.data, results: ordered}};
  const searched = searchedComponentsOf.get(r);
  if (searched) searchedComponentsOf.set(out, searched);
  return /** @type {T} */ (out);
}

/**
 * The search response with at most `limit` results.
 * @template T
 * @param {T} response
 * @param {number} limit
 * @returns {T}
 */
export function withLimit(response, limit) {
  const r = /** @type {any} */ (response);
  const results = r?.data?.results;
  if (!Array.isArray(results) || results.length <= limit) return response;
  const out = {...r, data: {...r.data, results: results.slice(0, limit)}};
  const searched = searchedComponentsOf.get(r);
  if (searched) searchedComponentsOf.set(out, searched);
  return /** @type {T} */ (out);
}
