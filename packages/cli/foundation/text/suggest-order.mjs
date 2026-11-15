// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Order the suggestions a failed lookup prints, best first.
 *
 * A failed `component`, `template` or `docs` lookup already knows which
 * entries to suggest; this module decides their order, so the entry the
 * caller most likely meant comes first. Asked for the closest entries only,
 * it also cuts a list where the matches get weaker. It never makes a list
 * longer.
 *
 * Names are compared as words: `DropdownMenuItem`, `dropdown-menu-item` and
 * `Dropdown Menu Items` all read as `dropdown menu item`.
 *
 * @input  the name the caller typed and the candidate entries
 * @output the entries, reordered, and cut when asked
 * @position lib: shared by the component, template and docs lookup errors
 */

import {levenshteinDistance} from './levenshtein.mjs';
import {compareText} from './compare-text.mjs';

/**
 * The score of a near name (nearNameSlips), less a little per slip: above any
 * name that carries only some of the typed words, below one that carries all
 * of them.
 */
const NEAR_NAME_SCORE = 19.6;
/** The score a synonym match gets: an exact keyword's. */
const SYNONYM_SCORE = 90;
/** The score a name with exactly the typed words gets: an exact name's. */
const SAME_WORDS_SCORE = 100;
/**
 * The least score a name gets when it is some of the typed words in a row
 * (`Toast` for `ToastProvider`): above every keyword that only partly matches
 * the typed name (70), below a name that shares the typed compound name's
 * words (72 and up).
 */
const NAME_PART_SCORE = 71;

/**
 * A word with one trailing plural `s` removed (`tabs` → `tab`), leaving short
 * words and `ss` endings alone.
 * @param {string} word
 * @returns {string}
 */
function singular(word) {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss')
    ? word.slice(0, -1)
    : word;
}

/**
 * A name's words, lowercase and singular: camelCase, PascalCase, kebab-case,
 * snake_case, slashes and spaces all split.
 * @param {string} text
 * @returns {string[]}
 */
export function nameWords(text) {
  /** @type {string[]} */
  const words = [];
  for (const part of String(text ?? '').split(/[^A-Za-z0-9]+/)) {
    if (!part) continue;
    const found =
      part.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g) ?? [];
    for (const w of found) words.push(singular(w.toLowerCase()));
  }
  return words;
}

/**
 * The one name a typed name means, read whole. Two tiers, in order:
 * 1. Exact words: the typed name and a name have the same words after
 *    folding (nameWords: any case, separator, singular or plural), so
 *    `DataTable`, `data_table` and `data tables` all mean `data-table`.
 * 2. One near name: when no name has the exact words, the only name whose
 *    folded words are within `maxDistance` edits (1 by default; an adjacent
 *    swap is one edit), when both are `minLength` letters or more (6 by
 *    default).
 * Null when no name, or more than one in the same tier, matches.
 * @param {string} typed
 * @param {string[]} names
 * @param {{maxDistance?: number, minLength?: number}} [options]
 * @returns {string | null}
 */
export function matchWholeName(
  typed,
  names,
  {maxDistance = 1, minLength = 6} = {},
) {
  const folded = foldedName(typed);
  if (!folded) return null;
  let exact = null;
  let near = null;
  let nearCount = 0;
  for (const n of names) {
    const f = foldedName(n);
    if (f === folded) {
      if (exact) return null;
      exact = n;
    } else if (
      folded.length >= minLength &&
      f.length >= minLength &&
      Math.abs(f.length - folded.length) <= maxDistance &&
      levenshteinDistance(folded, f, maxDistance, {swaps: true}) <= maxDistance
    ) {
      near = n;
      nearCount++;
    }
  }
  if (exact) return exact;
  return nearCount === 1 ? near : null;
}

/** @type {Map<string, string>} */
const folds = new Map();

/**
 * A name's words joined: one form for every case and separator.
 * @param {string} text
 * @returns {string}
 */
function foldedName(text) {
  let f = folds.get(text);
  if (f === undefined) {
    f = nameWords(text).join('');
    folds.set(text, f);
  }
  return f;
}

/**
 * How closely one candidate name matches what the caller typed; higher is
 * closer. Tiers, best first: the same words; every typed word present; some
 * typed word present; none. Within a tier, more of the typed words and more of
 * the candidate's own words matched rank higher, and a name that starts with
 * the typed name (or the reverse) gets a small lift. With `typos`, a near name
 * (one or two slips from the typed name) ranks just below the names that
 * carry every typed word.
 * @param {string[]} typed - {@link nameWords} of the typed name
 * @param {string} name
 * @param {{typos?: boolean}} [options]
 * @returns {number}
 */
function affinityOf(typed, name, {typos = false} = {}) {
  const words = nameWords(name);
  if (typed.length === 0 || words.length === 0) return 0;
  const typedJoined = typed.join('');
  const joined = words.join('');
  if (joined === typedJoined) return 40;
  const slips = typos ? nearNameSlips(typedJoined, joined) : 0;
  const near = slips > 0 ? NEAR_NAME_SCORE - slips * 0.2 : 0;
  const have = new Set(words);
  const want = new Set(typed);
  const covered = typed.filter(w => have.has(w)).length / typed.length;
  const precise = words.filter(w => want.has(w)).length / words.length;
  const prefix =
    joined.startsWith(typedJoined) || typedJoined.startsWith(joined) ? 1 : 0;
  const tier = covered === 1 ? 2 : covered > 0 ? 1 : 0;
  // A near name keeps its word score when that is higher: a name that also
  // carries every typed word ranks among the other full matches.
  return Math.max(
    near,
    tier * 10 + covered * 4 + precise * 2 + prefix + precise * 0.01,
  );
}

/**
 * How many slips separate a typed name from a candidate, both with their
 * words joined, when it is a near name: an edit or two adjacent letters
 * swapped count as one slip, one slip is allowed from five letters and two from
 * eight. Zero when it is not a near name.
 * @param {string} typed
 * @param {string} name
 * @returns {number}
 */
function nearNameSlips(typed, name) {
  const shorter = Math.min(typed.length, name.length);
  const cap = shorter >= 8 ? 2 : shorter >= 5 ? 1 : 0;
  if (cap === 0 || Math.abs(typed.length - name.length) > cap) return 0;
  const slips = levenshteinDistance(typed, name, cap, {swaps: true});
  return slips <= cap ? slips : 0;
}

/**
 * The items scored against the typed name, closest first; equal matches keep
 * their original order.
 * @template T
 * @param {string} typedName
 * @param {T[]} items
 * @param {(item: T) => Array<string | undefined>} namesOf
 * @param {{typos?: boolean}} [options]
 * @returns {Array<{item: T, best: number}>}
 */
function scoreByAffinity(typedName, items, namesOf, options = {}) {
  const typed = nameWords(typedName);
  const scored = items.map((item, index) => {
    let best = 0;
    for (const name of namesOf(item)) {
      if (name) best = Math.max(best, affinityOf(typed, name, options));
    }
    return {item, index, best};
  });
  scored.sort((a, b) => b.best - a.best || a.index - b.index);
  return scored;
}

/**
 * The same items, closest to the typed name first; each item is as close as
 * its closest name. Equal matches keep their original order.
 *
 * With `closest`, the list also stops where the matches get weaker. Only
 * typed words longer than one character count here. When the best item
 * carries every such word, only the items that carry every one of them stay;
 * when it carries some of them, the items that carry none are left out. When
 * no item carries one, nothing is left out. The list only ever gets shorter,
 * and its order does not change.
 *
 * With `typos`, a near name (one or two slips from the typed name, as
 * `ButonGroup` or `ButtonGorup` for ButtonGroup) ranks just below the names
 * that carry every typed word and above the rest. With `closest` too, near
 * names stay in the list whatever the cut leaves out, and the list is never
 * longer than it is without `typos`.
 * @template T
 * @param {string} typedName
 * @param {T[]} items
 * @param {(item: T) => Array<string | undefined>} namesOf
 * @param {{closest?: boolean, typos?: boolean}} [options]
 * @returns {T[]}
 */
export function orderByAffinity(typedName, items, namesOf, options = {}) {
  if (!options.typos) return orderByWords(typedName, items, namesOf, options);
  const scored = scoreByAffinity(typedName, items, namesOf, {typos: true});
  if (!options.closest) return scored.map(s => s.item);
  const kept = new Set(orderByWords(typedName, items, namesOf, options));
  return scored
    .filter(s => kept.has(s.item) || isNearScore(s.best))
    .slice(0, kept.size)
    .map(s => s.item);
}

/**
 * Whether a score is a near name's.
 * @param {number} score
 */
const isNearScore = score => score < 20 && score > NEAR_NAME_SCORE - 1;

/**
 * {@link orderByAffinity} without `typos`.
 * @template T
 * @param {string} typedName
 * @param {T[]} items
 * @param {(item: T) => Array<string | undefined>} namesOf
 * @param {{closest?: boolean}} options
 * @returns {T[]}
 */
function orderByWords(typedName, items, namesOf, options) {
  const scored = scoreByAffinity(typedName, items, namesOf);
  if (!options.closest) return scored.map(s => s.item);
  // One-letter words (`a` in `a11y`, `use-a-theme`) say nothing about which
  // entry was meant, so the cut counts only the longer typed words.
  const words = nameWords(typedName).filter(w => w.length > 1);
  const tierOf = (/** @type {T} */ item) => {
    let best = 0;
    for (const name of namesOf(item)) {
      if (name) best = Math.max(best, affinityOf(words, name));
    }
    // Tiers: 1 some typed word, 2 every typed word, 4 the same words.
    return Math.floor(best / 10);
  };
  const tiers = scored.map(s => tierOf(s.item));
  const top = Math.max(0, ...tiers);
  if (top === 0) return scored.map(s => s.item);
  const need = Math.min(top, 2);
  return scored.filter((_, i) => tiers[i] >= need).map(s => s.item);
}

/**
 * Whether a name carries a typed word longer than one character: the words
 * the `closest` cut of {@link orderByAffinity} counts. When no candidate
 * carries one, that cut leaves every candidate in.
 * @param {string} typedName
 * @param {string} name
 * @returns {boolean}
 */
export function carriesTypedWord(typedName, name) {
  const words = nameWords(typedName).filter(w => w.length > 1);
  return affinityOf(words, name) >= 10;
}

/**
 * How closely `name` matches a typed name when it is a near name (one or two
 * slips, as the `typos` option of {@link orderByAffinity} counts them) or
 * carries every typed word; 0 for any other name. Higher is closer, on the
 * scale {@link orderByAffinity} ranks by.
 * @param {string} typedName
 * @param {string} name
 * @returns {number}
 */
export function closeNameScore(typedName, name) {
  const score = affinityOf(nameWords(typedName), name, {typos: true});
  return score >= 20 || isNearScore(score) ? score : 0;
}

/**
 * Docs route suggestions, closest to the typed route first. When every
 * suggestion sits under one namespace the typed route also starts with, that
 * shared part is left out of the comparison: it says nothing about which page
 * was meant. Equal matches keep their order. `closest` stops the list where
 * the matches get weaker, as in {@link orderByAffinity}.
 * @template {{name: string}} T
 * @param {string} topic - the typed route
 * @param {T[]} suggestions
 * @param {{closest?: boolean}} [options]
 * @returns {T[]}
 */
export function orderRouteSuggestions(topic, suggestions, options = {}) {
  let shared = suggestions.length > 0 ? suggestions[0].name : '';
  for (const {name} of suggestions) {
    while (shared && !name.startsWith(shared)) shared = shared.slice(0, -1);
  }
  const namespace = shared.slice(0, shared.lastIndexOf('/') + 1);
  return namespace && topic.startsWith(namespace)
    ? orderByAffinity(
        topic.slice(namespace.length),
        suggestions,
        s => [s.name.slice(namespace.length)],
        options,
      )
    : orderByAffinity(topic, suggestions, s => [s.name], options);
}

/** Library names a synonym may start with (`MUI TextField`). */
const LIBRARY_WORDS = new Set([
  'mui',
  'material',
  'chakra',
  'ant',
  'antd',
  'radix',
  'bootstrap',
  'mantine',
  'shadcn',
  'headless',
  'aria',
  'react',
]);

/**
 * The components whose synonyms name what was typed. A synonym matches when
 * its words, with or without a leading library name, are the typed words
 * (`MUI TextField` matches `MUI TextField`, `TextField` and `text-field`).
 * @param {string} needle
 * @param {Record<string, {synonyms?: string[]}>} cards - component name → its search card
 * @returns {Set<string>}
 */
export function synonymMatches(needle, cards) {
  const typed = nameWords(needle).join('');
  /** @type {Set<string>} */
  const found = new Set();
  if (!typed) return found;
  for (const [name, card] of Object.entries(cards ?? {})) {
    for (const synonym of card?.synonyms ?? []) {
      const words = nameWords(synonym);
      const whole = words.join('');
      while (words.length > 1 && LIBRARY_WORDS.has(words[0])) words.shift();
      if (whole === typed || words.join('') === typed) {
        found.add(name);
        break;
      }
    }
  }
  return found;
}

/** Words that name a structural part of a component (`<Family>Footer`). */
const PART_WORDS = new Set([
  'header',
  'footer',
  'body',
  'content',
  'title',
  'heading',
  'description',
  'item',
  'trigger',
  'action',
  'close',
  'group',
  'cell',
  'row',
  'column',
  'label',
  'icon',
  'root',
  'wrapper',
]);

/** Part words that name the same slot of a component family. */
const SAME_PART = /** @type {Record<string, string[]>} */ ({
  item: ['item', 'option'],
  option: ['option', 'item'],
  header: ['header', 'heading', 'title'],
  heading: ['heading', 'header', 'title'],
  title: ['title', 'heading', 'header'],
});

/**
 * A suggestion score for a component whose name shares the typed compound
 * name's words, on the same scale as `searchComponents`, or null. It covers
 * part names that do not exist: the family part named with other words
 * (`PickerItem` → `PickerOption`), the part named without its family's
 * first word (`RailItem` → `SideRailItem`), the part named without its family's
 * middle word (`FactItem` → `FactListItem`), and the parent of a structural
 * part that is not its own component (`SheetFooter` → `Sheet`, but not
 * `SheetMusic`).
 * @param {string[]} typed - {@link nameWords} of the typed name
 * @param {string} name
 * @returns {{score: number, reason: string} | null}
 */
function compoundMatch(typed, name) {
  if (typed.length < 2) return null;
  const words = nameWords(name);
  const n = words.length;
  const t = typed.length;
  const same = (/** @type {string[]} */ a, /** @type {string[]} */ b) =>
    a.length === b.length && a.every((w, i) => w === b[i]);
  if (
    n >= 2 &&
    same(words.slice(0, -1), typed.slice(0, -1)) &&
    (SAME_PART[typed[t - 1]] ?? []).includes(words[n - 1])
  ) {
    return {score: 79, reason: 'same part of the family'};
  }
  if (n > t && same(words.slice(n - t), typed)) {
    return {score: 78, reason: 'name ends with the words typed'};
  }
  if (n > t && words[0] === typed[0] && words[n - 1] === typed[t - 1]) {
    return {score: 77, reason: 'same part of the family'};
  }
  if (
    n < t &&
    same(typed.slice(0, n), words) &&
    typed.slice(n).every(w => PART_WORDS.has(w))
  ) {
    return {score: 72, reason: 'the family this part belongs to'};
  }
  return null;
}

/**
 * A suggestion score for a component whose whole name is some of the typed
 * words in a row (`Toast` for `ToastProvider`), or null. A name that covers
 * more of the typed letters scores a little higher, so `Collapsible` ranks
 * above `Card` for `CollapsibleCard`. Names shorter than four letters do not
 * count, as in the name parts `searchComponents` finds.
 * @param {string[]} typed - {@link nameWords} of the typed name
 * @param {string} name
 * @returns {{score: number, reason: string} | null}
 */
function namePartMatch(typed, name) {
  const words = nameWords(name);
  const letters = words.join('').length;
  if (words.length >= typed.length || letters < 4) return null;
  if (!containsRun(typed, words)) return null;
  const coverage = letters / typed.join('').length;
  return {
    score: NAME_PART_SCORE + coverage / 2,
    reason: 'name is part of the name typed',
  };
}

/**
 * Whether `run` sits in `words` as a contiguous run.
 * @param {string[]} words
 * @param {string[]} run
 * @returns {boolean}
 */
function containsRun(words, run) {
  for (let i = 0; i + run.length <= words.length; i++) {
    if (run.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

/**
 * Rank component suggestions for a name that resolved to nothing.
 *
 * Every component `searchComponents` scored keeps its score. A component whose
 * name has exactly the typed words (`chat-messages` for `ChatMessage`) scores
 * like an exact name; one of whose synonyms is the typed name (see
 * {@link synonymMatches}) like an exact keyword; one whose name shares the
 * typed compound name's words (see {@link compoundMatch}) just below a
 * one-letter typo of a name. When a keyword only partly matched the typed
 * name, a name that is some of the typed words in a row (see
 * {@link namePartMatch}) ranks above it: name evidence for a typed word beats
 * keyword evidence for it. Equal
 * scores put synonym matches first, then order by how many of the typed words
 * the name carries, then, among names that carry every typed word, by how few
 * other words the name has, then by how early the keyword that matched sits in
 * the component's keywords, then by edit distance, then by shared leading
 * letters, then by name. The caller decides how many to print.
 * @param {string} needle - the typed component name (no `XDS` prefix)
 * @param {Array<{name: string, score: number, reason: string, keywordAt?: number}>} results - `searchComponents` output
 * @param {string[]} allNames - every component name
 * @param {Set<string>} [synonyms] - {@link synonymMatches} for the typed name
 * @returns {Array<{name: string, score: number, reason: string}>}
 */
export function rankComponentSuggestions(
  needle,
  results,
  allNames,
  synonyms = new Set(),
) {
  const term = needle.toLowerCase();
  const typed = nameWords(needle);
  const typedWords = new Set(typed);
  /** @type {Map<string, {name: string, score: number, reason: string, keywordAt: number}>} */
  const byName = new Map();
  for (const r of results) {
    byName.set(r.name, {
      name: r.name,
      score: r.score,
      reason: r.reason,
      keywordAt: r.keywordAt ?? Infinity,
    });
  }
  // The typed words are a name's words (`chat-messages` is `ChatMessage`):
  // that name is meant, ahead of every rule below.
  const joined = typed.join('');
  for (const name of allNames) {
    if (joined && nameWords(name).join('') === joined) {
      byName.set(name, {
        name,
        score: SAME_WORDS_SCORE,
        reason: 'same name',
        keywordAt: -1,
      });
    }
  }
  for (const name of synonyms) {
    if (!allNames.includes(name)) continue;
    const prior = byName.get(name);
    if (!prior || prior.score < SYNONYM_SCORE) {
      byName.set(name, {
        name,
        score: SYNONYM_SCORE,
        reason: 'another name for it',
        keywordAt: Infinity,
      });
    }
  }
  for (const name of allNames) {
    const match = compoundMatch(typed, name);
    if (!match) continue;
    const prior = byName.get(name);
    if (!prior || match.score > prior.score) {
      byName.set(name, {
        name,
        score: match.score,
        reason: match.reason,
        keywordAt: Infinity,
      });
    }
  }
  // When a keyword only partly matched the typed name, a name that is some
  // of the typed words outranks it: name evidence for a typed word beats
  // keyword evidence for it.
  const partialKeyword = results.some(
    r => r.keywordAt !== undefined && r.score < SYNONYM_SCORE,
  );
  for (const name of partialKeyword ? allNames : []) {
    const match = namePartMatch(typed, name);
    if (!match) continue;
    const prior = byName.get(name);
    if (!prior || match.score > prior.score) {
      byName.set(name, {
        name,
        score: match.score,
        reason: match.reason,
        keywordAt: Infinity,
      });
    }
  }
  /** @param {string} name */
  const lead = name => {
    const lower = name.toLowerCase();
    let i = 0;
    while (i < term.length && i < lower.length && term[i] === lower[i]) i++;
    return i / Math.max(term.length, lower.length);
  };
  /**
   * How many typed words the name carries, whole or as a word's start; the
   * last typed word, the one a compound name is a kind of (`PlaceInput` is an
   * input), counts a little more.
   */
  const shared = (/** @type {string} */ name) => {
    const words = nameWords(name);
    const has = (/** @type {string} */ t) =>
      words.some(
        w =>
          w === t ||
          (Math.min(w.length, t.length) >= 3 &&
            (w.startsWith(t) || t.startsWith(w))),
      );
    const count = typed.filter(has).length;
    return typed.length > 1 && has(typed[typed.length - 1])
      ? count + 0.5
      : count;
  };
  /**
   * How many words a name has beyond the typed ones, when it carries every
   * typed word: the fewer, the closer the name. Names that miss a typed word
   * all count the same, so a typo keeps the order below.
   */
  const extraWords = (/** @type {string} */ name) => {
    const words = nameWords(name);
    const have = new Set(words);
    if (!typed.every(w => have.has(w))) return Infinity;
    return words.filter(w => !typedWords.has(w)).length;
  };
  return [...byName.values()]
    .map(r => ({
      ...r,
      synonym: synonyms.has(r.name) ? 1 : 0,
      shared: shared(r.name),
      extra: extraWords(r.name),
      distance: levenshteinDistance(term, r.name.toLowerCase()),
      lead: lead(r.name),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.synonym - a.synonym ||
        b.shared - a.shared ||
        a.extra - b.extra ||
        a.keywordAt - b.keywordAt ||
        a.distance - b.distance ||
        b.lead - a.lead ||
        compareText(a.name, b.name),
    )
    .map(({name, score, reason}) => ({name, score, reason}));
}
