// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Domain priority: when a component, hook, template, or theme ranks
 * ahead of docs the reader did not ask for.
 */

import {sameWord} from './_words.mjs';
import {phraseWords, samePhraseWord, samePhrase} from './_query.mjs';
import {compoundHit, compoundOf} from './_compound.mjs';
import {
  bestForToken,
  FULL_COVERAGE_SCORE,
  STRONG_TOKEN_SCORE,
} from './_score.mjs';
import {TITLE_PHRASE_SCORE, TITLE_IN_QUERY_SCORE} from './_titles.mjs';
import {scoreCandidate} from './_candidate-score.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * A match's domain priority: 0 (none), 1, or 2 (a doc the whole query names).
 * A component, hook, template, or theme with priority ranks ahead of any doc
 * without it, whatever the two scores are. Docs among themselves rank by
 * priority, then score; everything else ranks among itself by score.
 *
 * A component, hook, template, or theme has priority (1) when one of the
 * query's words, or the whole query, hits its name or an authored keyword at
 * {@link STRONG_TOKEN_SCORE} or above, or when it matches every word.
 *
 * A doc has priority when the reader asked for that doc:
 * - 2: the whole query is the topic's name, its last route segment, or its
 *   own title, as words and whatever the plural (`font setup` is
 *   typography/font-setup, `side panel` is "Side panels");
 * - 1: a word of the query is the topic's name (`illustration` in a longer
 *   question is the illustrations guide);
 * - 1: a query of two or more words is one of the topic's own declared
 *   keywords, whatever the plural (`code review` on a guide that declares it);
 * - 1: the query holds one of the doc's titles whole (`resizable side panels`
 *   names "Side panels"; `light dark mode button` names "Light/Dark Mode");
 * - 1: the doc matches every word of the query and one of them is a word of
 *   its title (`switch to a dark theme` and "Use a theme").
 * A section answers to its topic's name.
 *
 * A doc that matched only by a heading holding the query, by one word, or by
 * words spread through its text has no priority. Docs are split into many
 * small topics, each with its own headings, so a common phrase such as
 * `font size` hits a heading exactly (170) while the component the reader is
 * after matches one word by keyword (`Text`, 98). Ranked on text alone, every
 * split adds another doc above the component. Broad reference pages match every word of many queries
 * in their text the same way. The score stays the text-match strength the
 * result reports, so callers that gate on it (`build`) see the same numbers.
 *
 * @param {string} term - Lowercased search term.
 * @param {string[]} tokens - Content tokens from tokenizeQuery(term).
 * @param {Candidate} candidate
 * @param {{score: number, matched: number, total: number}} hit - The
 *   candidate's scoreQuery result.
 * @returns {0 | 1 | 2}
 */
export function domainPriority(
  term,
  tokens,
  candidate,
  hit,
  queryWords = phraseWords(term),
) {
  const words = [term, ...tokens];
  if (candidate.domain === 'doc') {
    const topic = String(candidate._topic ?? candidate.name).toLowerCase();
    // The whole query, read as words, is the topic's route, its last
    // segment, or its own title, whatever the plural: `side panel` is
    // layout/side-panels, and `header and footer` is "Headers and footers".
    // A section's title is a heading inside a topic, not the topic's name.
    const named = [topic, topic.slice(topic.lastIndexOf('/') + 1)];
    if (candidate._section == null && candidate.titles?.[0]) {
      named.push(candidate.titles[0]);
    }
    if (named.some(n => samePhrase(term, n))) {
      return 2;
    }
    // A query of two or more words that is one of the doc's own declared
    // keywords, read as words whatever the plural, is the author naming the
    // doc for that phrase: `code review` on a guide that declares it. Only
    // what the author declared counts: the code terms and table cells a
    // doc's other keywords add (`missing_field`) name what it mentions, not
    // what it is for. One word is left out too, and a section declares
    // nothing.
    if (
      phraseWords(term).length >= 2 &&
      candidate._section == null &&
      (candidate._declared ?? []).some(k => samePhrase(term, String(k)))
    ) {
      return 1;
    }
    if (
      words.some(
        w =>
          (scoreCandidate(w, {name: topic}, {fuzzy: false})?.score ?? 0) >= 95,
      )
    ) {
      return 1;
    }
    // A whole title inside the query is the only path to 160-169.
    if (hit.score >= TITLE_IN_QUERY_SCORE && hit.score < TITLE_PHRASE_SCORE) {
      return 1;
    }
    // Every word matched, and one of them names the doc in its title.
    if (
      hit.score >= FULL_COVERAGE_SCORE &&
      hit.score < TITLE_IN_QUERY_SCORE &&
      hit.matched === hit.total
    ) {
      const titleWords = phraseWords(candidate.titles?.[0] ?? '');
      if (
        (tokens.length ? tokens : [term]).some(t =>
          titleWords.some(w => samePhraseWord(t, w) || sameWord(t, w)),
        )
      ) {
        return 1;
      }
    }
    return 0;
  }
  if (hit.score >= FULL_COVERAGE_SCORE) return 1;
  const compound = compoundOf.has(candidate)
    ? compoundOf.get(candidate)
    : compoundHit(queryWords, candidate);
  if ((compound?.score ?? 0) >= STRONG_TOKEN_SCORE) {
    return 1;
  }
  const fuzzy = tokens.length <= 1;
  // The whole query is read as the whole query; its words are parts of it
  // only when there are several.
  return words.some(
    (w, i) =>
      (bestForToken(w, candidate, {fuzzy, part: i > 0 && tokens.length > 1})
        ?.score ?? 0) >= STRONG_TOKEN_SCORE,
  )
    ? 1
    : 0;
}
