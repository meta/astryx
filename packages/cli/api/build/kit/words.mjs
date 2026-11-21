// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The words build's page ranker reads: a template's terms and families,
 * an idea's modifiers, containers and phrase pairs, and search's synonyms.
 *
 * Family words come from the templates' own ids — a word in the ids of two or
 * more templates of one family, plus the family's name when a template carries
 * it — never from a list kept here or from synonyms, so an integration's
 * templates join the vocabulary by being named like their family, and "a
 * landing page" is not a hero because "landing" is a synonym of "hero".
 */

import {stem, STOPWORDS, SYNONYMS} from '../../search/search.mjs';
import {
  matchWholeName,
  nameWords as foldWords,
} from '../../../foundation/text/suggest-order.mjs';

/**
 * Words search drops that name layout: "side navigation", "side by side".
 */
const LAYOUT_WORDS = new Set(['side']);

/**
 * Where an idea's head ends: its first clause, before the parts it lists.
 */
export const HEAD_END =
  /:|,|;|\(|\s[-\u2013\u2014]\s|\b(?:with|showing|listing|for|that|where|plus|including|containing|featuring|which|to|from|of)\b/i;

/**
 * Frames a page can live in, above whatever is underneath. A container phrase
 * counts only when it names one of these.
 */
const OVERLAY_FRAMES = new Set([
  'modal',
  'dialog',
  'drawer',
  'sheet',
  'popup',
  'overlay',
]);

/**
 * The family whose templates are app chrome rather than page content: the
 * explicit `Shell -` category (architecture:template-authoring/INV7).
 */
export const SHELL_FAMILY = 'Shell';

/**
 * Whether a ranked template can be the app shell: a template of the Shell
 * family that is not kept off the gallery. A hidden template is no starter.
 * @param {{family: string, hidden?: boolean} | null | undefined} page
 */
export const isAppShell = page =>
  page?.family === SHELL_FAMILY && page.hidden !== true;

/** A container phrase: "in a modal", "inside the side panel". */
export const CONTAINER_PHRASE =
  /\b(?:in|inside|within)\s+(?:a|an|the)\s+([a-z-]+)(?:\s+([a-z-]+))?/gi;

/**
 * A place phrase: a preposition of place, then a determiner ("above the
 * table", "into my dashboard"). CONTAINER_PHRASE is the narrower class of
 * frames a page lives in ("in a modal"); this one names where a piece goes.
 */
export const PLACE_PHRASE =
  /\b(?:to|into|onto|in|inside|within|on|above|below|beside|under|next to)\s+(?:the|a|an|my|our|this|each|every|existing)\b/i;

/**
 * Where a phrase ends, for finding the word that heads it: punctuation and
 * the words that join phrases.
 */
export const PHRASE_END =
  /[^a-z0-9\s-]+|\s(?:and|or|with|for|of|to|in|on|at|by|from|the|a|an|plus)\s/;

/** @param {string} t */
const isContentWord = t =>
  t.length >= 2 && (LAYOUT_WORDS.has(t) || !STOPWORDS.has(t));

/**
 * Content terms of a text: lowercase alphanumeric words, stopwords removed,
 * stemmed.
 * @param {string} text
 * @returns {string[]}
 */
export function terms(text) {
  return (
    String(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  )
    .filter(isContentWord)
    .map(stem);
}

/**
 * The terms of an idea that only ever modify another word, each with the words
 * it modifies: in each phrase the last content word is its head, and the ones
 * before it describe the next.
 * @param {string} query
 * @returns {Map<string, Set<string>>}
 */
export function modifiersOf(query) {
  const heads = new Set();
  /** @type {Map<string, Set<string>>} */
  const modifiers = new Map();
  for (const phrase of String(query).toLowerCase().split(PHRASE_END)) {
    const words = terms(phrase);
    words.forEach((w, i) => {
      if (i === words.length - 1) heads.add(w);
      else modifiers.set(w, (modifiers.get(w) ?? new Set()).add(words[i + 1]));
    });
  }
  for (const h of heads) modifiers.delete(h);
  return modifiers;
}

/**
 * Adjacent term pairs a text names, "a b", for telling a template that names
 * a whole compound ("executive summary") from one that names only its parts.
 * @param {string[]} texts
 * @returns {Set<string>}
 */
export function pairsOf(texts) {
  const pairs = new Set();
  for (const text of texts) {
    for (const phrase of String(text).toLowerCase().split(PHRASE_END)) {
      const words = terms(phrase);
      for (let i = 1; i < words.length; i++)
        pairs.add(`${words[i - 1]} ${words[i]}`);
    }
  }
  return pairs;
}

/**
 * The terms of an idea that name its frame: "modal" in "in a modal". A card, a
 * table or an existing page after "in a" is where a part goes, not a frame.
 * @param {string} query
 * @returns {Set<string>}
 */
export function containersOf(query) {
  const found = new Set();
  for (const m of String(query).matchAll(CONTAINER_PHRASE)) {
    for (const t of terms(`${m[1]} ${m[2] ?? ''}`)) {
      if (OVERLAY_FRAMES.has(t)) found.add(t);
    }
  }
  return found;
}

/**
 * A template's keywords as the units a request can match, each read with the
 * caller's own word reader. A one-word keyword is that word. A longer keyword
 * is one phrase unit, its words joined by single spaces: a request matches it
 * only when it names those words in that order (`phrasesIn`), and its words
 * never count alone. So "table of contents" on a docs page adds no "table" to
 * that page, and a table request still reads as a table.
 * @param {readonly string[]} keywords
 * @param {(text: string) => string[]} read the caller's word reader
 * @returns {string[]}
 */
export function keywordUnits(keywords, read) {
  return keywords.map(keyword => read(keyword).join(' ')).filter(Boolean);
}

/**
 * The phrase units (two or more words) a request names: the unit's words
 * appear next to each other, in order, in the request's words as the same
 * reader reads them. With `oneWord`, a one-word unit the request names counts
 * too.
 * @param {readonly string[]} words the request's words, in order
 * @param {Iterable<string>} units
 * @param {{oneWord?: boolean}} [options]
 * @returns {Set<string>}
 */
export function phrasesIn(words, units, {oneWord = false} = {}) {
  const text = ` ${words.join(' ')} `;
  const found = new Set();
  for (const unit of units) {
    if ((oneWord || unit.includes(' ')) && text.includes(` ${unit} `)) {
      found.add(unit);
    }
  }
  return found;
}

/**
 * The words a template's keyword units give an idea: each one-word keyword,
 * and every word of each phrase keyword the idea names (`phrasesIn`). A named
 * phrase carries all of its words, as the same words listed one by one would;
 * a phrase the idea does not name gives none of them.
 * @param {readonly string[]} units the template's keyword units (`keywordUnits`)
 * @param {readonly string[]} words the idea's words, in order, read the same way
 * @returns {string[]}
 */
export function keywordWordsFor(units, words) {
  const named = phrasesIn(words, units);
  return units.flatMap(unit =>
    !unit.includes(' ') ? [unit] : named.has(unit) ? unit.split(' ') : [],
  );
}

/**
 * What each frame of an idea holds: for every container phrase ("settings in
 * a modal", "in a settings modal"), the frame's terms with the words that
 * name what sits in it: the head of the phrase right before the container
 * phrase, and the container phrase's own other words. In "a toggle in a modal
 * on the settings page" the modal holds the toggle, not the settings page.
 * @param {string} query
 * @returns {Map<string, Set<string>>} frame term -> terms it holds
 */
export function framesOf(query) {
  const text = String(query);
  /** @type {Map<string, Set<string>>} */
  const held = new Map();
  for (const m of text.matchAll(CONTAINER_PHRASE)) {
    const frames = terms(`${m[1]} ${m[2] ?? ''}`).filter(t =>
      OVERLAY_FRAMES.has(t),
    );
    if (frames.length === 0) continue;
    const before = text.slice(0, m.index).toLowerCase().split(PHRASE_END);
    const lead = terms(before[before.length - 1] ?? '');
    const holds = new Set([
      ...lead.slice(-1),
      ...terms(`${m[1]} ${m[2] ?? ''}`).filter(t => !OVERLAY_FRAMES.has(t)),
    ]);
    for (const f of frames) {
      const set = held.get(f) ?? new Set();
      for (const t of holds) set.add(t);
      held.set(f, set);
    }
  }
  return held;
}

/**
 * The parts of a page template that its name and descriptor words come from.
 * @typedef {object} NamedTemplate
 * @property {string} name
 * @property {string} [displayName]
 * @property {string} [category]
 * @property {string[]} [keywords]
 * @property {string} [description]
 */

/**
 * An idea with every run of its words that names a page template written as
 * that template's own words: "a KanbanBoard page", "a kanban-board page" and
 * "a kanabn board page" read as the template id's words. Only a whole name
 * counts (matchWholeName), a run never crosses punctuation, and the only slip
 * read is a swap of two neighbouring letters in a word of six or more letters
 * that the templates' own descriptors never use, so a real word ("pane",
 * "seating") is never respelled into a name. A run already written as the
 * name's words is left as it is.
 * @param {string} idea
 * @param {NamedTemplate[]} pages the project's page templates
 * @returns {string}
 */
export function readNames(idea, pages) {
  const text = String(idea ?? '');
  const names = pages.map(p => p.name);
  const known = descriptorWordsOf(pages);
  const tokens = [...text.matchAll(/[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*/g)];
  const longest = Math.max(1, ...names.map(n => n.split('-').length));
  const plain = (/** @type {string} */ s) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  let out = '';
  let at = 0;
  for (let i = 0; i < tokens.length;) {
    let matched = 0;
    let name = null;
    for (let n = Math.min(longest, tokens.length - i); n >= 1 && !name; n--) {
      const run = tokens.slice(i, i + n);
      const gaps = run.slice(1).every((t, k) => {
        const prev = run[k];
        return /^\s+$/.test(text.slice(prev.index + prev[0].length, t.index));
      });
      if (!gaps) continue;
      const typed = run.map(t => t[0]).join(' ');
      const found = matchWholeName(typed, names);
      if (!found) continue;
      const nameWords = found.split('-');
      const words = plain(typed);
      const sameWords =
        words.length === nameWords.length &&
        foldWords(typed).join('') === foldWords(found).join('');
      if (sameWords) continue;
      const slipped = words.filter(w => !nameWords.includes(w));
      const joined = words.length < nameWords.length;
      if (!joined && slipped.some(w => known.has(stem(w)))) continue;
      const typedFold = foldWords(typed).join('');
      const nameFold = foldWords(found).join('');
      if (
        typedFold !== nameFold &&
        (!swapsTwo(typedFold, nameFold) ||
          slipped.some(w => w.length < SLIP_MIN_LENGTH))
      ) {
        continue;
      }
      name = found;
      matched = n;
    }
    if (!name) {
      i++;
      continue;
    }
    const first = tokens[i];
    const last = tokens[i + matched - 1];
    out += text.slice(at, first.index) + name.split('-').join(' ');
    at = /** @type {number} */ (last.index) + last[0].length;
    i += matched;
  }
  return out + text.slice(at);
}

/**
 * The fewest letters a slipped word has before it can be read as a name:
 * shorter words are too often other real words one slip away.
 */
const SLIP_MIN_LENGTH = 6;

/**
 * Whether a typed name is a name with two neighbouring letters swapped. A
 * name takes only this slip: a dropped, changed or added letter turns many
 * everyday words ("seating", "retail", "galley") into a template name.
 * @param {string} typed
 * @param {string} name
 * @returns {boolean}
 */
function swapsTwo(typed, name) {
  if (typed.length !== name.length) return false;
  const diff = [...typed].flatMap((c, i) => (c === name[i] ? [] : [i]));
  return (
    diff.length === 2 &&
    diff[1] === diff[0] + 1 &&
    typed[diff[0]] === name[diff[1]] &&
    typed[diff[1]] === name[diff[0]]
  );
}

/** @type {WeakMap<object, Set<string>>} */
const descriptorWordCache = new WeakMap();

/**
 * Every stemmed word the page templates' own descriptors use: ids, display
 * names, categories, keywords and descriptions.
 * @param {NamedTemplate[]} pages
 * @returns {Set<string>}
 */
function descriptorWordsOf(pages) {
  let set = descriptorWordCache.get(pages);
  if (!set) {
    set = new Set();
    for (const p of pages) {
      const text = [
        p.name,
        p.displayName,
        p.category,
        ...(p.keywords ?? []),
        p.description,
      ].join(' ');
      for (const w of String(text)
        .toLowerCase()
        .match(/[a-z0-9]+/g) ?? [])
        set.add(stem(w));
    }
    descriptorWordCache.set(pages, set);
  }
  return set;
}

/** @param {string} text */
export const normalized = text =>
  (
    String(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  ).join(' ');

/** Stemmed synonym lookup built from search's vocabulary, both directions. */
export const SYNONYMS_OF = (() => {
  /** @type {Map<string, Set<string>>} */
  const index = new Map();
  /** @param {string} a @param {string} b */
  const add = (a, b) => {
    const set = index.get(a) ?? new Set();
    set.add(b);
    index.set(a, set);
  };
  for (const [key, values] of Object.entries(SYNONYMS)) {
    const k = stem(key);
    for (const value of values) {
      const v = stem(value);
      add(k, v);
      add(v, k);
      for (const other of values) if (other !== value) add(v, stem(other));
    }
  }
  return index;
})();

/**
 * @typedef {import('../_adapter.mjs').PageTemplate} PageTemplate
 * @typedef {import('../_adapter.mjs').ComponentWords} ComponentWords
 * @typedef {{name: string, score: number, hits: number, familyNamed: boolean, headNamed: boolean, containerMatched: boolean, family: string, base: boolean, matched: Set<string>, typical: number, hidden: boolean}} RankedPage
 * @typedef {'page' | 'part' | 'edit'} IdeaKind
 */

/** @param {PageTemplate} page */
const familyOf = page => (page.category.split(' - ')[0] ?? '').trim();

/**
 * Family words, from the templates' own ids: a word in the ids of two or more
 * templates of one family, plus the family's name when a template carries it.
 * Each word maps to its family.
 * @param {PageTemplate[]} pages
 * @returns {Map<string, string>}
 */
export function familyWordsOf(pages) {
  /** @type {Map<string, Map<string, number>>} */
  const idWords = new Map();
  for (const page of pages) {
    const family = familyOf(page);
    const counts = idWords.get(family) ?? new Map();
    for (const w of new Set(page.name.split('-'))) {
      if (w.length >= 3) counts.set(stem(w), (counts.get(stem(w)) ?? 0) + 1);
    }
    idWords.set(family, counts);
  }
  /** @type {Map<string, string>} */
  const familyOfWord = new Map();
  for (const [family, counts] of idWords) {
    const heads = [...counts].filter(([, c]) => c >= 2).map(([w]) => w);
    const name = normalized(family).split(' ').pop() ?? '';
    if (name.length >= 3 && counts.has(stem(name))) heads.push(stem(name));
    for (const head of heads) {
      if (!familyOfWord.has(head)) familyOfWord.set(head, family);
    }
  }
  return familyOfWord;
}
