// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One search term's score against one candidate: name, keyword, prose,
 * and typo signals.
 *
 * Scoring is keyword + fuzzy ranking (NOT semantic / embeddings — that is a
 * deliberate future follow-up). It reuses the same signal weighting as the
 * component fuzzy resolver in lib/string-utils.mjs:
 *
 *   100  exact name match
 *    95  name is the term's plural or stem form ("buttons" -> Button)
 *    90  exact keyword match
 *    88  keyword is the term's plural or stem form
 *    80  name Levenshtein distance 1 (one-word lookups, words of 5+ letters)
 *    70  keyword word prefix / distance 1 (distance: one-word lookups, 5+ letters)
 *    60  name word prefix (>=4 chars, >=50% coverage)
 *    60  exact weak-keyword match
 *    50  description / prose mentions the term
 *    45  usage guidance mentions the term
 *    40  name Levenshtein distance 2 (one-word lookups, 8+ letters)
 *    40  weak-keyword word prefix
 *    30  keyword Levenshtein distance 2 (one-word lookups, 8+ letters)
 *    20  name Levenshtein distance 3 (one-word lookups, 11+ letters)
 *
 * Name + keyword signals always outweigh description/prose, so an exact match
 * sorts above an incidental mention.
 *
 * A term matches inside a name or keyword only at the start of one of its
 * words: "dash" finds "dashboard" and "input" finds "TextInput", but "file"
 * does not find "profile". Edit distance is typo tolerance, so it applies only
 * to a one-word lookup, where a typo is the likely explanation, and only to
 * words long enough that one edit rarely makes another real word. In a
 * sentence, a near miss is usually a different word: "site" is not "side",
 * "cable" is not "table".
 */

import {levenshteinDistance} from '../../foundation/text/string-utils.mjs';
import {
  stem,
  wordForms,
  sameWord,
  startsAWordOf,
  wordsOf,
  joined,
  isTypo,
} from './_words.mjs';
import {pluralOf} from './_query.mjs';

/**
 * Whether a multi-word term spells out a name word by word: as many words as
 * the name, each the name's word in order or, for a single-letter word, a word
 * starting with that letter ("vertical" for V) that the entry's own
 * description names. `vertical stack` spells out VStack when its description says
 * "vertical"; `visual stack` does not.
 * @param {string} term
 * @param {string} name
 * @param {string} description
 */
function spellsOut(term, name, description) {
  const words = term.split(/\s+/).filter(Boolean);
  const parts = wordsOf(name);
  if (words.length < 2 || words.length !== parts.length) return false;
  const described = wordsOf(description);
  let expanded = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const p = parts[i];
    if (sameWord(w, p)) continue;
    // Only a single-letter word is an abbreviation to spell out: "With" in a
    // name is not spelled out by "without".
    if (p.length !== 1 || !w.startsWith(p)) return false;
    if (!described.some(d => sameWord(d, w))) return false;
    expanded = true;
  }
  return expanded;
}

/**
 * Whether a one-word term is a name's last word and every word before it is a
 * single letter: Stack in VStack and HStack.
 * @param {string} term
 * @param {string} name
 */
function headOfLetters(term, name) {
  const parts = wordsOf(name);
  return (
    parts.length >= 2 &&
    sameWord(term, parts[parts.length - 1]) &&
    parts.slice(0, -1).every(p => p.length === 1)
  );
}

/** How many of a family's members a query naming the family lists. */
const FAMILY_MEMBERS = 3;

/**
 * Score a single candidate against the search term across name, keywords,
 * and prose signals. Returns the best (highest) score plus a human reason,
 * or null if nothing matched above the floor.
 *
 * @param {string} term - Lowercased search term.
 * @param {object} candidate
 * @param {string} candidate.name - Primary identifier (component/hook name, topic, template name).
 * @param {string[]} [candidate.aliases] - Other names, scored like the name (a theme's display name).
 * @param {string} [candidate.domain] - A component, hook, or template name
 *   also matches typed as words: `command palette` is CommandPalette.
 * @param {string[]} [candidate.keywords] - Authored intent (componentsUsed, category words).
 * @param {string[]} [candidate.weakKeywords] - Derived signal (components a page renders).
 * @param {string} [candidate.description]
 * @param {string[]} [candidate.prose] - Extra free-text blobs (doc section text, best practices).
 * @param {string[]} [candidate.guidance] - Usage guidance (features, best practices) — scored a tier below description.
 * @param {string} [candidate._family] - The family whose doc lists the entry as a member.
 * @param {number} [candidate._familyIndex] - The entry's place among that family's members.
 * @param {{fuzzy?: boolean, joins?: boolean, part?: boolean, synonym?: boolean}} [opts] - `fuzzy`: allow edit-distance (typo) matches. Default true; multi-word queries pass false. `joins`: read a spaced query joined into a name or keyword (default true); off when the query names an entry outright. `part`: the term is one word of a longer query, so a name's head word after single letters (Stack in VStack) does not count as a keyword hit for it. `synonym`: the term stands in for a word of the query, so it names no family.
 * @returns {{score: number, reason: string, alias?: 'partial' | 'keyword'} | null}
 *   `alias` marks a hit that read the query's words joined.
 */
export function scoreCandidate(
  term,
  {
    name,
    aliases = [],
    domain,
    keywords = [],
    weakKeywords = [],
    description = '',
    prose = [],
    guidance = [],
    _family,
    _familyIndex,
  },
  {fuzzy = true, joins = true, part = false, synonym = false} = {},
) {
  let best = 0;
  let reason = '';
  /** @type {'partial' | 'keyword' | false} */
  let alias = false;
  /**
   * @param {number} score
   * @param {string} why
   * @param {'partial' | 'keyword' | false} [byAlias] - the hit reads the
   *   query's words joined, into part of a name or into a keyword
   */
  const consider = (score, why, byAlias = false) => {
    if (score > best) {
      best = score;
      reason = why;
      alias = byAlias;
    }
  };

  // ── Name signals ────────────────────────────────────────────────
  // An alias is a name too: a theme answers to its display name as well as
  // its slug.
  for (const candidateName of [name, ...aliases.filter(Boolean)]) {
    const nameLower = candidateName.toLowerCase();
    // A placed guide's name is its route, and the route's last segment is its
    // name too, as a flat topic's is: `codemods` is authoring/building-blocks/codemods.
    const leafLower = nameLower.slice(nameLower.lastIndexOf('/') + 1);

    // A plural of the name is the name: `integration` is the `integrations`
    // guides, `tab` the `tabs` doc.
    // A component, hook, or template name typed as words is its name:
    // `command palette` is CommandPalette. A doc's name is a route or key,
    // matched as written.
    const spelled =
      domain !== 'doc' &&
      !/[\s_-]/.test(nameLower) &&
      nameLower === term.replace(/\s+/g, '');
    if (nameLower === term || leafLower === term || spelled) {
      consider(100, 'exact name');
    } else if (
      joins &&
      (domain === 'component' || domain === 'hook') &&
      /\s/.test(term) &&
      nameLower.startsWith(term.replace(/\s+/g, '')) &&
      term.replace(/\s+/g, '').length / nameLower.length >= 0.75
    ) {
      // Most of the name typed as words, cut short: `complex select` is
      // ComplexSelector, ahead of a one-word keyword elsewhere.
      consider(95, `name "${candidateName}" spelled`, 'partial');
    } else if (
      domain !== 'doc' &&
      domain !== 'theme' &&
      spellsOut(term, candidateName, description)
    ) {
      // The name's short words spelled out, in order, as the entry's own
      // description spells them: `vertical stack` is VStack ("Vertical stack
      // for arranging items top-to-bottom").
      consider(95, `name "${candidateName}" spelled out`);
    } else if (pluralOf(nameLower, term) || pluralOf(term, nameLower)) {
      // One point under the exact spelling, so the doc named `tokens` still
      // outranks the Token component for `tokens`.
      consider(99, 'plural of the name');
    } else {
      if (sameWord(term, nameLower)) consider(95, `name "${candidateName}"`);
      // The term is a word of the name, or starts one: "input" in TextInput.
      else if (
        !part &&
        domain !== 'doc' &&
        domain !== 'theme' &&
        headOfLetters(term, candidateName)
      ) {
        // The whole query is the name's head word after single letters (Stack
        // in VStack, HStack): a variant named by its head, as a keyword is.
        consider(90, `name "${candidateName}" ends in "${term}"`);
      } else if (startsAWordOf(term, candidateName)) {
        consider(60, `name contains "${term}"`);
      }
      if (fuzzy) {
        const dist = levenshteinDistance(term, nameLower);
        if (isTypo(term, nameLower, dist)) {
          consider(
            dist === 1 ? 80 : dist === 2 ? 40 : 20,
            `similar name (distance ${dist})`,
          );
        }
      }
    }
  }

  // ── Family signal ───────────────────────────────────────────────
  // A query naming a family lists its first members as a keyword would: the
  // family doc names them, whether or not a component of the family's name
  // exists ("chat" lists ChatMessage and its siblings). Only the whole query
  // names the family: a word of a longer query lifts no member.
  if (
    !part &&
    !synonym &&
    _family &&
    (_familyIndex ?? Infinity) < FAMILY_MEMBERS &&
    (term === _family.toLowerCase() ||
      term === wordsOf(_family).join(' ') ||
      term.replace(/\s+/g, '') === _family.toLowerCase())
  ) {
    consider(90, `member of ${_family}`);
  }

  // ── Keyword signals ─────────────────────────────────────────────
  const termJoined = joined(term);
  for (const kw of keywords) {
    const kwLower = String(kw).toLowerCase();
    // A one-word keyword typed as separate words is the keyword: `number
    // field` is `numberfield`. Only a
    // lowercase keyword, one an author declares for a reader to type: a
    // capitalized one names another entry (a block's `componentsUsed`). A
    // doc's keywords include code terms, matched as written.
    if (kwLower === term) {
      consider(90, `keyword "${kw}"`);
      continue;
    }
    if (
      joins &&
      domain !== 'doc' &&
      /\s/.test(term) &&
      String(kw) === termJoined
    ) {
      consider(90, `keyword "${kw}"`, 'keyword');
      continue;
    }
    if (sameWord(term, kwLower)) {
      consider(88, `keyword "${kw}"`);
      continue;
    }
    if (startsAWordOf(term, kw)) consider(70, `keyword "${kw}"`);
    if (fuzzy) {
      const dist = levenshteinDistance(term, kwLower);
      if (isTypo(term, kwLower, dist) && dist <= 2) {
        consider(dist === 1 ? 70 : 30, `keyword "${kw}" (distance ${dist})`);
      }
    }
  }

  // ── Weak keyword signals (derived, not authored) ─────────────────
  // Capped at 60 so one incidental component match cannot clear the
  // confident-match gate on its own; it still counts toward multi-term
  // coverage, which is where "this page renders that" is real evidence.
  // No Levenshtein tier — fuzzy matching a derived signal is pure noise.
  for (const kw of weakKeywords) {
    const kwLower = String(kw).toLowerCase();
    if (kwLower === term || sameWord(term, kwLower)) {
      consider(60, `renders ${kw}`);
      continue;
    }
    if (startsAWordOf(term, kw)) consider(40, `renders ${kw}`);
  }

  // ── Prose / description / guidance signals (stem-tolerant whole word) ──
  // Match the term's stem as a whole word, tolerating plural/gerund suffixes
  // so "chart" matches "charts" and "filter" matches "filtering".
  if (term.length >= 3) {
    // Any form of the term, with any common suffix: `spacing` finds
    // "space" and "spaces", `tables` finds "table".
    const roots = [...new Set([stem(term), ...wordForms(term)])]
      .filter(f => f.length >= 3)
      .map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`\\b(?:${roots.join('|')})(s|es|ing|ed|ies)?\\b`);
    if (description && re.test(description.toLowerCase())) {
      consider(50, `description mentions "${term}"`);
    } else {
      let matchedProse = false;
      for (const blob of prose) {
        if (blob && re.test(String(blob).toLowerCase())) {
          consider(50, `docs mention "${term}"`);
          matchedProse = true;
          break;
        }
      }
      // A tier below prose: guidance is what a component says about USING it,
      // so the term appearing there is weaker evidence than the component's own
      // summary. Only consulted when nothing stronger matched.
      if (!matchedProse) {
        for (const blob of guidance) {
          if (blob && re.test(String(blob).toLowerCase())) {
            consider(45, `guidance mentions "${term}"`);
            break;
          }
        }
      }
    }
  }

  return best > 0 ? {score: best, reason, ...(alias ? {alias} : {})} : null;
}
