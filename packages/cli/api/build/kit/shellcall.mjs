// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether an idea that build would start on the app shell still asks
 * for a whole page.
 *
 * @input The idea, its kind (`ideaKind`), and the page ranker's output.
 * @output True when the idea reads as a new page, so build starts from the
 *   closest page template instead of the empty shell.
 * @position Beside start.mjs (api/build/kit/). It runs only on a shell start,
 *   after the placement rules. An idea with an edit phrase keeps the shell.
 *
 * The call is a linear score over fixed weights
 * (`shell.weights.json`): the idea's words and word pairs, its kind, its
 * length, and how strongly the ranker's best page template matched.
 */

import {loadShellWeights} from '../_adapter.mjs';
import {SHELL_FAMILY} from './words.mjs';

/**
 * Words that mark a change to a page or app the builder already has.
 */
const EDIT =
  /\b(existing|current|my (page|app|dashboard|screen|site)|add (a |an |the )?\w* ?to|change|fix|move|rename|restyle|update|modify|replace|remove|tweak|adjust|improve|refactor|our (page|app))\b/;

/**
 * Whether an idea carries an edit phrase. It needs no word table.
 * @param {string} idea
 * @returns {boolean}
 */
export function hasEditPhrase(idea) {
  return EDIT.test(String(idea).toLowerCase());
}

/**
 * The features the weights are keyed by.
 * @param {string} text the idea, lower case
 * @param {string} kind
 * @param {import('./rank.mjs').RankedPage | undefined} best the ranker's best
 *   page template that is not a shell
 * @returns {Set<string>}
 */
function featuresOf(text, kind, best) {
  const words = text.match(/[a-z]+/g) ?? [];
  const features = new Set(['bias', `k:${kind}`]);
  words.forEach((word, i) => {
    features.add(`u:${word}`);
    if (i > 0) features.add(`b:${words[i - 1]}_${word}`);
  });
  if (best) {
    features.add(`s:${Math.min(Math.floor(best.score / 5), 6)}`);
    features.add(`h:${Math.min(best.hits, 4)}`);
    if (best.familyNamed) features.add('fam');
    if (best.base) features.add('base');
  }
  features.add(`len:${Math.min(Math.floor(words.length / 5), 6)}`);
  features.add(`commas:${Math.min((text.match(/,/g) ?? []).length, 4)}`);
  return features;
}

/**
 * The ranker's best page template that is not a shell, or undefined.
 * @param {import('./rank.mjs').RankedPage[]} ranked
 */
export function bestPage(ranked) {
  return ranked.find(r => r.family !== SHELL_FAMILY && r.score > 0);
}

/**
 * The text score without its threshold, and whether the edit rule fires.
 * Null without the table or a page to weigh.
 * @param {string} idea
 * @param {import('./rank.mjs').IdeaKind} kind
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @returns {{edit: boolean, score: number} | null}
 */
export function shellCallScore(idea, kind, ranked) {
  const weights = loadShellWeights();
  if (!weights) return null;
  const text = String(idea).toLowerCase();
  const best = bestPage(ranked);
  let score = 0;
  for (const feature of featuresOf(text, kind, best))
    score += weights.weights[feature] ?? 0;
  return {edit: EDIT.test(text), score};
}
