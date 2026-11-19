// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compound names: adjacent query words joined into a candidate's name
 * or keyword (`icon button` and IconButton).
 */

import {wordsOf, joined} from './_words.mjs';
import {pluralOf} from './_query.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * The strongest hit a run of two or more adjacent query words has when it is
 * read as one joined word, and the query words it covers. Readers type a
 * compound name as separate words (`table header cell` is TableHeaderCell,
 * `number field` the keyword `numberfield`), and no single word of the run
 * matches on its own.
 *
 * - 100: the run joins to a component, hook, or template name, or its plural
 *   (`table header cells` is TableHeaderCell), or a hook name without its
 *   `use` prefix (`table sticky columns` is useTableStickyColumns).
 * - 90: the run joins to a one-word keyword (`number field` is
 *   `numberfield`).
 * - 95: the run joins to most of a name, cut short (`dropdown menu radio` is
 *   DropdownMenuRadioItem); 92: it is a name's leading words, covering at least half
 *   of it (`top nav mega` is TopNavMegaMenu); 70: it is two or more adjacent
 *   words of a name that cover at least half of it (`header cell` in
 *   TableHeaderCell), the same coverage a word prefix needs. These three
 *   are for components and hooks only.
 *
 * A doc's name is a route or key, so docs are left out.
 * @param {string[]} words - The query's words, stopwords included.
 * @param {Candidate} candidate
 * @returns {{score: number, reason: string, covered: Set<string>, alias?: 'partial' | 'keyword', aliasWords?: number} | null}
 *   `covered` holds the run's words and every stretch of them joined. `alias`
 *   marks a hit on part of a name or on a keyword, not on the whole name.
 */
export function compoundHit(words, candidate) {
  if (candidate.domain === 'doc' || words.length < 2) return null;
  const names = [candidate.name, ...(candidate.aliases ?? [])]
    .filter(Boolean)
    .map(name => ({name, nameJoined: joined(name), nameWords: wordsOf(name)}));
  // Part of a name counts only for a component or hook. A template's name
  // starts with the component it shows (`ProgressBarShowcase`), so part of it
  // names the component, not the template.
  const partial =
    candidate.domain === 'component' || candidate.domain === 'hook';
  // One-word lowercase keywords: a keyword an author declares for a reader
  // to type, joined (`numberfield`). A capitalized one names another entry (a
  // block's `componentsUsed`), which matches by its own name, and a keyword of
  // several words is a phrase, matched as one.
  const keywords = (candidate.keywords ?? []).filter(k =>
    /^[a-z0-9]+$/.test(String(k)),
  );
  /** @type {{score: number, reason: string, covered: Set<string>, alias?: 'partial' | 'keyword', aliasWords?: number} | null} */
  let best = null;
  for (const {run, word} of queryRuns(words)) {
    let score = 0;
    let reason = '';
    /** @type {'partial' | 'keyword' | null} */
    let kind = null;
    for (const {name, nameJoined, nameWords} of names) {
      if (
        nameJoined === word ||
        pluralOf(word, nameJoined) ||
        (candidate.domain === 'hook' && nameJoined === `use${word}`)
      ) {
        if (score < 100)
          [score, reason, kind] = [100, `name ${name} spelled`, null];
      } else if (!partial) {
        continue;
      } else if (
        nameJoined.startsWith(word) &&
        word.length / nameJoined.length >= 0.75
      ) {
        // Most of the name, cut short: `dropdown menu radio` is
        // DropdownMenuRadioItem.
        if (score < 95)
          [score, reason, kind] = [95, `name ${name} spelled`, 'partial'];
      } else if (
        word.length / nameJoined.length >= 0.5 &&
        run.every(
          (w, j) => nameWords[j + (nameWords[0] === 'use' ? 1 : 0)] === w,
        )
      ) {
        // The name's leading words: `top nav mega` is TopNavMegaMenu.
        if (score < 92)
          [score, reason, kind] = [
            92,
            `name ${name} starts "${run.join(' ')}"`,
            'partial',
          ];
      } else if (
        word.length / nameJoined.length >= 0.5 &&
        nameWords.some((_, k) => run.every((w, j) => nameWords[k + j] === w))
      ) {
        if (score < 70)
          [score, reason, kind] = [
            70,
            `name ${name} holds "${run.join(' ')}"`,
            'partial',
          ];
      }
    }
    if (score < 90 && keywords.includes(word)) {
      [score, reason, kind] = [
        90,
        `keyword "${run.join(' ')}" spelled`,
        'keyword',
      ];
    }
    if (score > (best?.score ?? 0)) {
      // Each word of the run, and each identifier typed as several of its
      // words joined (`dropdownMenu` in `dropdownMenu checkbox`).
      const covered = new Set();
      for (let a = 0; a < run.length; a++) {
        for (let b = a + 1; b <= run.length; b++) {
          covered.add(run.slice(a, b).join(''));
        }
      }
      best = {
        score,
        reason,
        covered,
        ...(kind ? {alias: kind, aliasWords: run.length} : {}),
      };
    }
  }
  return best;
}

/**
 * The longest run of adjacent query words read as one name. Core's longest
 * names run to six words; a longer run is a sentence, not a name, and reading
 * every run of a long build idea costs time on every candidate.
 */
export const MAX_RUN_WORDS = 6;

/**
 * Each run of two to {@link MAX_RUN_WORDS} adjacent query words, longest
 * first, with the run joined into one word. Computed once per query.
 * @type {WeakMap<string[], {run: string[], word: string}[]>}
 */
const runsOf = new WeakMap();

/**
 * @param {string[]} words
 * @returns {{run: string[], word: string}[]}
 */
function queryRuns(words) {
  let runs = runsOf.get(words);
  if (runs) return runs;
  runs = [];
  for (let len = Math.min(words.length, MAX_RUN_WORDS); len >= 2; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const run = words.slice(i, i + len);
      runs.push({run, word: run.join('')});
    }
  }
  runsOf.set(words, runs);
  return runs;
}

/**
 * Each candidate's compound hit from its last scoreQuery, so domainPriority
 * reads it without walking the query's runs again.
 * @type {WeakMap<object, ReturnType<typeof compoundHit>>}
 */
export const compoundOf = new WeakMap();
