// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The title tier of a multi-word query: the whole query as a phrase in
 * a doc's title or heading, or a whole title inside the query.
 */

import {phraseWords, samePhraseWord} from './_query.mjs';

/**
 * The score of a whole-query phrase inside a doc's title or heading: a keyword
 * substring hit (70) promoted by the same 100 as the exact tier. Below an
 * exact name or keyword (190-200), above the token-sum path (~151 at most).
 */
export const TITLE_PHRASE_SCORE = 170;

/**
 * The score of a whole title inside a longer query, before its coverage bonus:
 * one step below {@link TITLE_PHRASE_SCORE}. The bonus (one per query term the
 * candidate matches, at most 9) orders the sections that share a common title,
 * so "best practices for spacing" puts Spacing's Best Practices first.
 */
export const TITLE_IN_QUERY_SCORE = 160;

/**
 * The first title or heading that holds every word of the query, in order and
 * side by side, or null.
 * @param {string} term - Lowercased full query.
 * @param {string[] | undefined} titles
 * @returns {string | null}
 */
export function headingWithPhrase(term, titles) {
  const query = phraseWords(term);
  if (query.length < 2 || !titles) return null;
  for (const title of titles) {
    const words = phraseWords(String(title ?? ''));
    for (let i = 0; i + query.length <= words.length; i++) {
      if (query.every((word, j) => samePhraseWord(words[i + j], word)))
        return title;
    }
  }
  return null;
}

/**
 * The first title or heading of two words or more that the query holds whole,
 * in order and side by side, or null. A question such as "how do I add dark
 * mode" names the "Dark mode" section outright, around words no title has.
 * @param {string} term - Lowercased full query.
 * @param {string[] | undefined} titles
 * @returns {string | null}
 */
export function titleInQuery(term, titles) {
  const query = phraseWords(term);
  if (!titles) return null;
  for (const title of titles) {
    const words = phraseWords(String(title ?? ''));
    if (words.length < 2 || words.length > query.length) continue;
    for (let i = 0; i + words.length <= query.length; i++) {
      if (words.every((word, j) => samePhraseWord(query[i + j], word)))
        return title;
    }
  }
  return null;
}
