// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The plain signals search's learned searchers score with. Every one
 * is a deterministic count over the query's words and each entry's own text:
 * BM25 over the entry's name, its docs text, and its source-built card; how
 * many query words it covers; whether the query holds its name; the lexical
 * ranker's score and rank; and the router's guess of the domain the query
 * wants. A searcher's weights file holds one number per signal (and per
 * signal and domain); its score is their weighted sum.
 * @input a query, the lexical ranking, the gathered candidates, static weights
 * @output ranked entry ids, and the search response built from them
 * @position api/search; the searchers and the root router import it
 */

import {DOMAINS, ROUTES, words, fold, queryWords} from './_query-words.mjs';
import {entryOf} from './_entries.mjs';

/** @typedef {import('./_entries.mjs').EntryTable} EntryTable */

/** The signal names, in weights-file order (before the per-domain copies). */
export const SIGNALS = [
  's_score',
  's_rr',
  's_in',
  's_top20',
  'd_component',
  'd_hook',
  'd_doc',
  'd_template',
  'd_theme',
  'bm_name',
  'bm_desc',
  'bm_card',
  'cover',
  'cover_all',
  'head',
  'r_dom',
  'r_none',
  'name_in_q',
  'name_exact',
];

/** The signals that also get one copy per domain. */
export const PER_DOMAIN = [
  's_score',
  's_rr',
  'bm_name',
  'bm_desc',
  'bm_card',
  'cover',
  'r_dom',
  'name_in_q',
];

/**
 * Every entry's signals for one query, as rows of numbers.
 * @param {EntryTable} table
 * @param {string} query
 * @param {{domain: string, name: string, score?: number}[]} lexical the lexical ranking, best first
 * @param {number[] | null} route the router's class probabilities
 * @returns {Float64Array[]}
 */
export function signals(table, query, lexical, route) {
  const n = table.ids.length;
  const S = SIGNALS.length;
  const rows = table.ids.map(() => new Float64Array(S));
  const seen = new Set();
  let r = 0;
  for (const res of lexical) {
    const k = entryOf(table, res);
    if (k === undefined || seen.has(k)) continue;
    seen.add(k);
    r++;
    const x = rows[k];
    x[0] = (res.score ?? 0) / 100;
    x[1] = 1 / r;
    x[2] = 1;
    x[3] = r <= 20 ? 1 : 0;
  }
  for (let k = 0; k < n; k++) rows[k][4 + table.domain[k]] = 1;
  const qw = [...new Set(queryWords(query))];
  if (qw.length) {
    const hits = qw.map(() => new Uint8Array(n));
    /** @type {const} */ (['name', 'desc', 'card']).forEach((f, j) => {
      const {post, idf, len, avg} = table.fields[f];
      qw.forEach((w, a) => {
        for (const [k, c] of post.get(w) ?? []) {
          rows[k][9 + j] +=
            ((idf.get(w) ?? 0) * c * 2.2) /
            (c + 1.2 * (0.25 + (0.75 * len[k]) / avg));
          hits[a][k] = 1;
        }
      });
    });
    for (let k = 0; k < n; k++) {
      let cov = 0;
      for (let a = 0; a < qw.length; a++) cov += hits[a][k];
      rows[k][12] = cov / qw.length;
      rows[k][13] = cov === qw.length && qw.length > 1 ? 1 : 0;
      rows[k][14] = hits[qw.length - 1][k];
    }
  }
  if (route) {
    for (let k = 0; k < n; k++) {
      rows[k][15] = route[table.domain[k]];
      rows[k][16] = route[ROUTES.length - 1];
    }
  }
  const all = words(query).map(fold);
  const spaced = ` ${all.join(' ')} `;
  const runs = new Set();
  for (let len = 1; len <= 3; len++) {
    for (let a = 0; a + len <= all.length; a++)
      runs.add(all.slice(a, a + len).join(''));
  }
  const whole = all.join('');
  for (let k = 0; k < n; k++) {
    const nw = table.name[k];
    if (!nw.length) continue;
    const j = nw.join('');
    if (spaced.includes(` ${nw.join(' ')} `) || runs.has(j)) {
      rows[k][17] = 1;
      if (j === whole) rows[k][18] = 1;
    }
  }
  return rows;
}

/**
 * Ranks the entries by a searcher's weights: the weighted sum of each entry's
 * standardized signals and per-domain copies; ties go to the earlier id.
 * @param {EntryTable} table
 * @param {Float64Array[]} rows
 * @param {{w: number[], mu: number[], sd: number[]}} weights
 * @returns {number[]} entry positions, best first
 */
export function rank(table, rows, weights) {
  const {w, mu, sd} = weights;
  const S = SIGNALS.length;
  const per = PER_DOMAIN.map(s => SIGNALS.indexOf(s));
  const score = rows.map((x, k) => {
    let s = 0;
    for (let j = 0; j < S; j++) s += ((x[j] - mu[j]) / sd[j]) * w[j];
    const d = table.domain[k];
    per.forEach((j, p) => {
      for (let dd = 0; dd < DOMAINS.length; dd++) {
        const c = S + p * DOMAINS.length + dd;
        s += (((dd === d ? x[j] : 0) - mu[c]) / sd[c]) * w[c];
      }
    });
    return Math.round(s * 1e9) / 1e9;
  });
  return score.map((s, k) => k).sort((a, b) => score[b] - score[a] || a - b);
}
