// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compound names: adjacent query words joined into a candidate's name
 * or keyword (`icon button` and IconButton).
 */

import {wordsOf, joined} from './_words.mjs';
import {pluralOf} from './_query.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * How much of a component's or hook's joined name a run cut short must
 * cover to name it (the 95 tier below). The runs a candidate visits are
 * found with the same share (see runsToVisit).
 */
const SPELLED_SHARE = 0.75;

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
  for (const {run, word} of runsToVisit(words, names, partial, keywords)) {
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
        word.length / nameJoined.length >= SPELLED_SHARE
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
 * Where each joined word stands among a query's runs (queryRuns), by word.
 * Computed once per query.
 * @type {WeakMap<string[], Map<string, number[]>>}
 */
const runsAtOf = new WeakMap();

/**
 * @param {string[]} words
 * @returns {Map<string, number[]>}
 */
function runsAt(words) {
  let at = runsAtOf.get(words);
  if (at) return at;
  at = new Map();
  const runs = queryRuns(words);
  for (let i = 0; i < runs.length; i++) {
    const list = at.get(runs[i].word);
    if (list) list.push(i);
    else at.set(runs[i].word, [i]);
  }
  runsAtOf.set(words, at);
  return at;
}

/**
 * The query's runs that can score against a candidate, in their order. A run
 * scores in compoundHit only when its joined word is one of these:
 * - a joined name, its plural (with `s` or `es`), or a hook's name without
 *   its leading `use`;
 * - for a component or hook, a start of a joined name that covers at least
 *   SPELLED_SHARE of it, or the joined words of a stretch of a name's words
 *   (its leading words, or words it holds);
 * - a one-word keyword.
 * Each is a lowercase string of letters and digits, compared whole. Every
 * other run leaves the score at 0, so it is not visited. When there are no
 * more runs than words to look up, every run is visited.
 * @param {string[]} words
 * @param {Array<{nameJoined: string, nameWords: readonly string[]}>} names
 * @param {boolean} partial - whether part of a name counts (a component or hook)
 * @param {string[]} keywords - the one-word lowercase keywords
 * @returns {{run: string[], word: string}[]}
 */
function runsToVisit(words, names, partial, keywords) {
  const runs = queryRuns(words);
  /** @param {string} nameJoined */
  const shortest = nameJoined => Math.floor(SPELLED_SHARE * nameJoined.length);
  let lookups = keywords.length;
  for (const {nameJoined, nameWords} of names) {
    lookups += 4;
    if (partial) {
      const n = nameWords.length;
      lookups += nameJoined.length - shortest(nameJoined) + (n * (n + 1)) / 2;
    }
  }
  if (lookups >= runs.length) return runs;
  const at = runsAt(words);
  /** @type {Set<number>} */
  const visit = new Set();
  /** @param {string} word */
  const look = word => {
    for (const i of at.get(word) ?? []) visit.add(i);
  };
  for (const {nameJoined, nameWords} of names) {
    look(nameJoined);
    look(`${nameJoined}s`);
    look(`${nameJoined}es`);
    if (nameJoined.startsWith('use')) look(nameJoined.slice(3));
    if (!partial) continue;
    for (let len = shortest(nameJoined); len < nameJoined.length; len++) {
      look(nameJoined.slice(0, len));
    }
    for (let a = 0; a < nameWords.length; a++) {
      let stretch = '';
      for (let b = a; b < nameWords.length; b++) {
        stretch += nameWords[b];
        look(stretch);
      }
    }
  }
  for (const keyword of keywords) look(keyword);
  return [...visit].sort((x, y) => x - y).map(i => runs[i]);
}

/**
 * Each candidate's compound hit from its last scoreQuery, so domainPriority
 * reads it without walking the query's runs again.
 * @type {WeakMap<object, ReturnType<typeof compoundHit>>}
 */
export const compoundOf = new WeakMap();
