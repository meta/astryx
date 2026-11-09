// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reading a search query: its domains, stopwords, content tokens, and
 * phrase words.
 */

import {unlinkText} from '../../foundation/doc-compiler/links.mjs';
import {sameWord} from './_words.mjs';

/** Valid domain filters for `--type`. */
export const SEARCH_DOMAINS = ['component', 'hook', 'doc', 'template', 'theme'];

/**
 * The domains a search reads without @astryxdesign/core. An open search outside
 * an app covers these alone.
 */
export const CORELESS_DOMAINS = ['doc', 'theme'];

/**
 * Filler words stripped from multi-word queries so natural-language phrasing
 * ("a page where you can see business stats") ranks on its content words.
 * Exported for `build`, whose page ranker strips the same words.
 */
export const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'to',
  'with',
  'and',
  'or',
  'in',
  'on',
  'at',
  'by',
  'that',
  'this',
  'my',
  'your',
  'our',
  'their',
  'is',
  'are',
  'be',
  'it',
  'its',
  'as',
  'from',
  'page',
  'screen',
  'app',
  'application',
  'view',
  'where',
  'you',
  'can',
  'some',
  'like',
  'just',
  'basically',
  'kinda',
  'want',
  'wants',
  'need',
  'needs',
  'something',
  'thing',
  'things',
  'build',
  'make',
  'create',
  'i',
  'me',
  'we',
  'us',
  'so',
  'up',
  'out',
  'over',
  'side',
  'one',
  'big',
]);

/**
 * Split a query into meaningful content tokens (lowercased, stopwords + very
 * short words removed). Empty for single-word queries (callers fall back to
 * whole-phrase scoring).
 * @param {string} term - Already-lowercased query.
 * @returns {string[]}
 */
export function tokenizeQuery(term) {
  return (
    term
      .split(/\s+/)
      // Strip only leading/trailing punctuation; keep joined identifiers intact
      // (e.g. "foo_bar" stays one token) so gibberish stays gibberish.
      .map(t => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
      .filter(t => t.length >= 2 && !STOPWORDS.has(t))
  );
}

/**
 * Score a candidate against a query, handling multi-word natural language.
 * Tries the whole phrase (so exact/near matches still win) AND a per-token
 * pass (so "data table with filters" matches `table-page` via table+filter),
 * and returns whichever is stronger.
 *
 * @param {string} term - Lowercased full query.
 * @param {string[]} tokens - Content tokens from tokenizeQuery(term).
 * @param {object} candidate
 * @returns {{score: number, reason: string} | null}
 */

/**
 * The words of a title or query, lowercased, without punctuation or code ticks.
 * @param {string} text
 * @returns {string[]}
 */
export function phraseWords(text) {
  return (
    unlinkText(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  );
}

/**
 * Whether two words are the same word, allowing a plural on either side, so
 * `data attributes selector` still reads "Data attribute selectors".
 * @param {string} a
 * @param {string} b
 */
export function samePhraseWord(a, b) {
  return (
    a === b ||
    `${a}s` === b ||
    `${b}s` === a ||
    `${a}es` === b ||
    `${b}es` === a
  );
}

/**
 * Whether two phrases are the same words, in order, ignoring case,
 * punctuation, and a plural on any word: `side panel` is "Side panels", and
 * `headers and footers` is `header-and-footer`.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function samePhrase(a, b) {
  const x = phraseWords(a);
  const y = phraseWords(b);
  return (
    x.length > 0 &&
    x.length === y.length &&
    x.every((w, k) => samePhraseWord(w, y[k]) || sameWord(w, y[k]))
  );
}

/**
 * Whether `plural` is the plural of `word`: `integrations` of `integration`,
 * `boxes` of `box`. `es` only follows s, x, z, ch, or sh, so `notes` is not a
 * plural of `not`.
 * @param {string} plural
 * @param {string} word
 */
export function pluralOf(plural, word) {
  if (word.length < 3) return false;
  if (plural === `${word}s`) return true;
  return /(?:s|x|z|ch|sh)$/.test(word) && plural === `${word}es`;
}
