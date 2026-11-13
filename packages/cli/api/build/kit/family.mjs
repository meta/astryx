// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The family check on a whole page's start: a page that starts in one
 * template family ("Table", the part of a category before ` - `) moves to the
 * best template of another family when a fixed table says that family fits the
 * idea better.
 *
 * @input An idea, its start, the blend's scores and order (weights.mjs), the
 *   ranker's output, and the table (`family.weights.json`, read by the
 *   adapter): a bias and stemmed-word weights per family, and the fixed
 *   coefficients of the move decision.
 * @output `familyMove(...)`: the template id to start from instead, or null to
 *   keep the start.
 * @position Beside start.mjs, which calls it for a whole page only. A family
 *   the table does not list (an integration's own category) is never moved
 *   from or to, so a new family keeps build's own start.
 */

import {stem, weightWords} from './weights.mjs';
import {familyOf} from './words.mjs';

/**
 * @typedef {object} FamilyWeights
 * @property {number} version
 * @property {string[]} families
 * @property {number[]} bias one per family
 * @property {number[]} state two weights: the start's family, 1/(rank+1) of
 *   the family's first template in the blend's order
 * @property {string[]} words stemmed words
 * @property {number[][]} rows one per word: a weight per family
 * @property {number[]} coef the move decision's fixed coefficients
 * @property {number} at the decision moves the start when p >= at
 * @property {number} bar a family is a move target only when the idea's
 *   own words give it at least this much weight
 * @property {number} keep the start stays when the blend scores it this much
 *   or more above the target
 */

/** @param {number[]} xs */
const logSumExp = xs => {
  const m = Math.max(...xs);
  return m + Math.log(xs.reduce((s, x) => s + Math.exp(x - m), 0));
};

/**
 * The template to start from instead of `start`, or null to keep it.
 * @param {object} a
 * @param {string} a.idea
 * @param {string} a.start the start build chose
 * @param {string | null} a.direct search's direct match, if any
 * @param {string | null} a.proposed the ranker's own start
 * @param {{cands: string[], scores: number[]}} a.blend the blend's scores
 * @param {string[]} a.order the blend's order (non-shell templates)
 * @param {import('./rank.mjs').RankedPage[]} a.ranked
 * @param {import('./weights.mjs').DescribedTemplate[]} a.catalog
 * @param {string[]} a.listed the templates the word tables list
 * @param {FamilyWeights | null} a.table
 * @returns {string | null}
 */
export function familyMove({
  idea,
  start,
  direct,
  proposed,
  blend,
  order,
  ranked,
  catalog,
  listed,
  table,
}) {
  if (!table) return null;
  // The tables cannot judge a start they do not list (an integration's
  // template, or one added since they were fit), so it stays.
  if (!listed.includes(start)) return null;
  const byName = new Map(catalog.map(t => [t.name, t]));
  const fam = (/** @type {string | null | undefined} */ n) =>
    n && byName.has(n) ? familyOf(byName.get(n)) : null;
  const known = new Set(table.families);
  const sf = fam(start);
  if (!sf || !known.has(sf)) return null;
  const bs = new Map(blend.cands.map((c, i) => [c, blend.scores[i]]));
  if (!bs.has(start)) return null;

  // The blend's order, then the ranker's, without shells or repeats.
  /** @type {string[]} */
  const ord = [];
  for (const n of [...order, ...ranked.map(r => r.name)]) {
    const f = fam(n);
    if (f && f !== 'Shell' && !ord.includes(n)) ord.push(n);
  }
  /** @type {Map<string, number>} */
  const firstAt = new Map();
  ord.forEach((n, i) => {
    const f = /** @type {string} */ (fam(n));
    if (!firstAt.has(f)) firstAt.set(f, i);
  });

  const stems = new Set(weightWords(idea).map(stem));
  const index = new Map(table.words.map((w, i) => [w, i]));
  /** @type {Record<string, number>} */
  const fs = {};
  /** @type {Record<string, number>} */
  const said = {};
  table.families.forEach((f, j) => {
    let w0 = 0;
    for (const w of stems) {
      const i = index.get(w);
      if (i !== undefined) w0 += table.rows[i][j];
    }
    said[f] = w0;
    let s = table.bias[j] + w0;
    s += table.state[0] * (f === sf ? 1 : 0);
    s += table.state[1] / ((firstAt.get(f) ?? 99) + 1);
    fs[f] = s;
  });
  const top = Math.max(...Object.values(fs));
  const z = Object.values(fs).reduce((s, v) => s + Math.exp(v - top), 0);
  const prob = (/** @type {string} */ f) => Math.exp(fs[f] - top) / z;

  /** @param {string} f */
  const pooled = f => {
    const xs = blend.cands.filter(c => fam(c) === f).map(c => bs.get(c) ?? 0);
    return xs.length ? logSumExp(xs) : -9;
  };
  const top5 = ord.slice(0, 5);
  /** @param {string} f */
  const inTop5 = f => top5.filter(n => fam(n) === f).length;
  /** @param {string} f */
  const named = f => {
    const words = weightWords(f).map(stem);
    return words.some(w => stems.has(w)) ? 1 : 0;
  };
  const rk = ranked.filter(r => r.family !== 'Shell');
  /** @param {string} f */
  const rankGap = f => {
    if (!rk.length) return 0;
    const lead = rk[0].score || 1;
    const best = (/** @type {string} */ g) =>
      Math.max(0, ...rk.filter(r => r.family === g).map(r => r.score));
    return Math.max(
      -2,
      Math.min(2, (best(f) - best(sf)) / (Math.abs(lead) + 1e-9)),
    );
  };

  let best = null;
  let bestP = -1;
  /** @type {Set<string>} */
  const seen = new Set();
  ord.forEach((t, i) => {
    const f = /** @type {string} */ (fam(t));
    if (f === sf || !known.has(f) || seen.has(f) || !bs.has(t)) return;
    seen.add(f);
    // Thin word evidence for the target, or a blend that clearly prefers
    // the start, keeps build's own start.
    if (said[f] < table.bar) return;
    if (
      /** @type {number} */ (bs.get(start)) -
        /** @type {number} */ (bs.get(t)) >=
      table.keep
    )
      return;
    const x = [
      1,
      /** @type {number} */ (bs.get(start)) - /** @type {number} */ (bs.get(t)),
      pooled(sf) - pooled(f),
      inTop5(f) - inTop5(sf),
      1 / (i + 1),
      named(f) - named(sf),
      direct === start ? 1 : 0,
      fam(proposed) === f ? 1 : 0,
      proposed === start ? 1 : 0,
      rankGap(f),
      fs[f] - fs[sf],
      prob(f),
      prob(sf),
      fs[f] === top ? 1 : 0,
    ];
    const logit = x.reduce((s, v, j) => s + v * table.coef[j], 0);
    const p = 1 / (1 + Math.exp(-logit));
    if (p > bestP) {
      bestP = p;
      best = t;
    }
  });
  return best !== null && bestP >= table.at ? best : null;
}
