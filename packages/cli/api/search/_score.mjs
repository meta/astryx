// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A whole query's score against one candidate: the reserved top tier
 * for multi-word queries, then the per-token scores (see _candidate-score.mjs).
 */

import {SYNONYM_INDEX} from './_synonyms.mjs';
import {joined} from './_words.mjs';
import {phraseWords} from './_query.mjs';
import {compoundHit, compoundOf} from './_compound.mjs';
import {scoreCandidate} from './_candidate-score.mjs';
import {
  TITLE_PHRASE_SCORE,
  TITLE_IN_QUERY_SCORE,
  headingWithPhrase,
  titleInQuery,
} from './_titles.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * Minimum per-token score (in the multi-word pass) to count as a real match.
 * 50 = a genuine name/keyword/description hit; below that is loose Levenshtein
 * fuzz that would otherwise turn gibberish queries into noise.
 *
 * Guidance (45) is deliberately BELOW this floor, so it never counts as one of
 * the matched concepts in a multi-word query. Measured: letting it count moved
 * `nested menu` from SideNav to List and `explain why a field is required` from
 * Field to TextInput — in both cases a component whose guidance happens to
 * mention the other word displaced the one that IS the answer. Breadth is not
 * relevance, the same reason `weakKeywords` are capped. Guidance still decides
 * single-word queries and still breaks ties, which is where it earns its place.
 */
const MIN_TOKEN_SCORE = 50;

/**
 * Best score for a token against a candidate, fanning out through synonyms
 * (synonym hits are discounted so a direct hit always wins).
 * @param {string} tok
 * @param {Candidate} candidate
 * @param {{fuzzy?: boolean, part?: boolean}} [opts] - see scoreCandidate
 * @returns {{score: number, reason: string} | null}
 */
export function bestForToken(tok, candidate, opts = {}) {
  let best = scoreCandidate(tok, candidate, opts);
  const syns = SYNONYM_INDEX.get(tok);
  if (syns) {
    for (const s of syns) {
      // A synonym of a family's name names no family: its members stay put.
      const h = scoreCandidate(s, candidate, {...opts, synonym: true});
      if (h) {
        const score = Math.round(h.score * 0.85);
        if (!best || score > best.score)
          best = {score, reason: `${h.reason} (~${tok})`};
      }
    }
  }
  return best;
}

/**
 * The score of a candidate that matches every content word of a multi-word
 * query, before a bonus of up to 8 for how strong its strongest match is: just
 * above anything that matches only some of the words. The token-sum path tops
 * out near 150 for a partial match (a 100 on one word, the per-word bonus, and
 * the coverage term), so an AND-match with one keyword-strength hit (see
 * {@link STRONG_TOKEN_SCORE}) always outranks an OR-match, and stays below the
 * title tiers.
 */
export const FULL_COVERAGE_SCORE = 151;

/**
 * The strongest single-word hit an every-word match needs to take that tier: a
 * keyword substring. Two passing mentions in prose, or the components a page
 * happens to render, are breadth, not relevance; they stay on the token sum,
 * below an exact name or keyword hit on one of the words.
 */
export const STRONG_TOKEN_SCORE = 70;

/**
 * @param {string} term - Lowercased full query.
 * @param {string[]} tokens - Content tokens from tokenizeQuery(term).
 * @param {Candidate} candidate
 * @param {string[]} [words] - The query's words for compound names (see
 *   compoundHit); empty when the query names an entry outright.
 * @param {{plain?: boolean}} [opts] - `plain`: score without matches on part
 *   of a name or a joined keyword.
 * @returns {{score: number, reason: string, matched: number, total: number, alias?: 'partial' | 'keyword', aliasWords?: number} | null}
 *   `matched`/`total` are the query concepts this candidate answered, out of
 *   the concepts the query had. Callers that must distinguish "matched one word
 *   of three" from "matched all three" — `build`, which gates its pages group
 *   on coverage — cannot recover that from the score, because a single strong
 *   hit and a broad weak one land on the same number.
 */
export function scoreQuery(
  term,
  tokens,
  candidate,
  words = phraseWords(term),
  {plain = false} = {},
) {
  const total = Math.max(tokens.length, 1);
  // A whole-phrase hit answered the whole query by definition.
  const asFull = (/** @type {{score: number, reason: string}} */ hit) => ({
    ...hit,
    matched: total,
    total,
  });
  // Typo tolerance is for one-word lookups. In a multi-word query a near miss
  // is usually a different word, not a typo. One typed identifier is one
  // word, whatever words it spells.
  const fuzzy = tokens.length <= 1 || !/\s/.test(term);
  const full = scoreCandidate(term, candidate, {
    fuzzy,
    joins: !plain && words.length > 0,
  });
  // A query of several words keeps its phrase tiers below even when stopwords
  // leave one content word: "make an integration" is still the phrase an
  // author declares as a keyword, and "build an integration" still names a
  // title outright, though each tokenizes to `integration` alone.
  const phrase = phraseWords(term).length >= 2 || words.length >= 2;
  let compound = compoundHit(words, candidate);
  if (plain) {
    if (compound?.alias) compound = null;
  } else {
    compoundOf.set(candidate, compound);
  }

  /** 0–1 content tokens: whole-phrase fuzzy matching (typo tolerance for
   *  single words), but if stopwords left exactly one DIFFERENT token (e.g.
   *  "pricing page" → "pricing"), score that token too and take the stronger. */
  const fewTokens = () => {
    const single =
      tokens.length === 1 ? bestForToken(tokens[0], candidate, {fuzzy}) : null;
    if (full && (!single || full.score >= single.score)) return asFull(full);
    return single ? asFull(single) : null;
  };
  if (tokens.length <= 1 && !phrase) return fewTokens();

  // The full (untokenized) query matching a candidate's name or a declared
  // keyword VERBATIM — full.score 90 or 100, the only two scoreCandidate
  // outcomes at or above that mark — is a deliberate, explicit label the
  // author chose for exactly this multi-word concept. Promote it to a
  // reserved top tier, safely above the token-sum path's ceiling below
  // (~151: 100 avg + 36 bonus + 15 coverage), so it always outranks a
  // candidate that merely happens to contain several of the query's
  // individual words. Without this, "table of contents" never surfaces
  // Outline (which declares that exact phrase as a keyword) because dozens
  // of Table-related templates each match "table" and "contents" separately
  // and accumulate a higher raw score (#5239).
  if (full && full.score >= 90) {
    return asFull({
      score: full.score + 100,
      reason: full.reason,
      ...(full.alias ? {alias: full.alias, aliasWords: words.length} : {}),
    });
  }

  // The whole query standing as a phrase in a doc's title or one of its
  // headings is the next tier down, and still above the token-sum path. The
  // reader named what the section is about, in order: `dark mode` is the
  // "Light/Dark Mode" section. Without this, the title scores a keyword
  // substring (70) and loses to a doc that happens to name `mode` exactly in
  // a code tick (90 on one token, 98 with coverage), so API enum docs outrank
  // the guide section.
  const heading = headingWithPhrase(term, candidate.titles);
  if (heading != null) {
    return asFull({
      score: TITLE_PHRASE_SCORE,
      reason: `title "${heading}" holds the whole query`,
    });
  }
  if (tokens.length <= 1) return fewTokens();

  // Multi-word natural language: score each content token, counting only
  // strong hits, then reward coverage so candidates matching more terms win.
  let strongest = 0;
  let matched = 0;
  let tokenSum = 0;
  /** @type {string[]} */
  const hitTerms = [];
  // Adjacent words that join into a name or keyword answer each word they
  // join, as strongly as the joined word matches (see compoundHit).
  // Whether a counted word matched only through part of a name or a keyword
  // read joined, not through the entry's own name or a word of it.
  /** @type {'partial' | 'keyword' | false} */
  let alias = false;
  let aliasWords = 0;
  for (const tok of tokens) {
    let h = bestForToken(tok, candidate, {fuzzy, part: true});
    if (
      compound?.covered.has(joined(tok)) &&
      compound.score > (h?.score ?? 0)
    ) {
      h = compound;
      if (compound.alias && compound.score >= MIN_TOKEN_SCORE) {
        alias = alias === 'partial' ? alias : compound.alias;
        aliasWords = compound.aliasWords ?? 0;
      }
    }
    if (h && h.score >= MIN_TOKEN_SCORE) {
      if (h.score > strongest) strongest = h.score;
      matched++;
      hitTerms.push(tok);
      tokenSum += h.score;
    }
  }
  // The reverse of the title tier, a step lower: the query holds a whole title
  // of two words or more, so the reader asked a question around the section's
  // name ("how do I add dark mode"). Coverage breaks ties between sections
  // that share a title such as "Best Practices".
  const named = titleInQuery(term, candidate.titles);
  if (named != null) {
    return {
      score: TITLE_IN_QUERY_SCORE + Math.min(matched, 9),
      reason: `the query names the title "${named}"`,
      matched,
      total,
    };
  }
  if (matched === 0) return full ? asFull(full) : null;

  const reason = `matches ${matched}/${tokens.length} terms: ${hitTerms.join(', ')}`;

  // Every word matched is its own tier. Summed per word, a doc that matches
  // both words of `troubleshoot integration` in its title and description
  // (50 + bonus + coverage = 77) lost to thirty docs that each match
  // `integration` alone, by name or in a code tick (98-108). The reader asked for
  // both; a candidate that has both comes first, ordered among its peers by
  // how strong its matches are. It needs one keyword-strength hit:
  // every word mentioned in prose, or rendered by a page, is breadth, and
  // stays on the token sum below an exact hit on one word.
  //
  // The TOTAL quality of matches orders candidates within this tier, not
  // just the strongest single hit. A doc matching both words by keyword
  // (90 + 90 = 180) outranks one matching keyword + prose (90 + 50 = 140).
  // Before this, every all-word match whose strongest hit was a keyword (90)
  // scored 157, burying the better match among dozens of ties.
  if (matched === tokens.length && strongest >= STRONG_TOKEN_SCORE) {
    return {
      score:
        FULL_COVERAGE_SCORE +
        Math.min(
          Math.floor((tokenSum - matched * MIN_TOKEN_SCORE) / (matched * 5)),
          8,
        ),
      reason,
      matched,
      total,
      ...(alias ? {alias, aliasWords} : {}),
    };
  }

  // Base the score on the STRONGEST concept that matched, plus a bonus per
  // additional matched concept and a coverage term.
  //
  // Deliberately not the mean, and deliberately not divided by total query
  // length. Dividing by total length penalizes verbose / low-fidelity prompts.
  // Dividing by the number of MATCHED tokens (what this used to do) made the
  // score non-monotonic: a second, weaker hit could drag the mean down by more
  // than the coverage bonus added it back, so matching fewer terms well beat
  // matching more terms partially. Concretely, `build "file browser"` scored
  // two form wizards matching only "file" at 98, above the actual file browser
  // matching both terms at 97 — and 98 clears the PAGE_DIRECT gate, so the
  // wrong template was returned as a confident match.
  //
  // Taking the max keeps both properties: a verbose prompt is still scored on
  // the concepts it did hit, and matching a superset of another candidate's
  // terms can never score lower, since every term of the expression is
  // non-decreasing in the set of matched tokens.
  const coverage = matched / tokens.length;
  const tokenScore = Math.round(
    strongest + Math.min(matched - 1, 3) * 12 + coverage * 15,
  );
  if (full && full.score >= tokenScore) return asFull(full);
  return {
    score: tokenScore,
    reason,
    matched,
    total,
    ...(alias ? {alias, aliasWords} : {}),
  };
}
