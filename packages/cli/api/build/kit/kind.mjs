// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a build idea asks for a page, a part of a page, or a change to
 * a page the builder already has.
 *
 * Parts (spec:AST-048/FR3). "A date range picker" asks for a part of a page,
 * not a page, and the system's own components say what a part is: an idea
 * whose head noun is a word of a component's name or keywords, Core's or an
 * integration's, asks for that part, unless the noun is a family word ("a data
 * table") or the idea lists a page's worth of pieces. Words search drops as
 * stopwords ("page", "screen", "app", "view") name no component, so "a calendar
 * page" asks for a page and "a calendar" for a part. A part starts from the
 * base template of the family the idea names ("an empty state for a settings
 * page"), else from the app shell. An idea that changes a page or part the
 * builder already has starts from the app shell too: that page is the
 * builder's to keep (FR9), and no template scaffolds it. "Existing" marks one
 * when its phrase names a page family or a component ("add a column to the
 * existing table"), unless the idea asks for a new page ("a new dashboard like
 * the existing dashboard", "clone the existing dashboard as a new page"). A
 * bare "existing" phrase that names a page ("existing reports dashboard with a
 * date filter") reads as the builder's own page.
 */

import {stem} from '../../search/search.mjs';
import {
  HEAD_END,
  CONTAINER_PHRASE,
  PHRASE_END,
  terms,
  containersOf,
  familyWordsOf,
} from './words.mjs';

/**
 * @typedef {import('./words.mjs').PageTemplate} PageTemplate
 * @typedef {import('./words.mjs').ComponentWords} ComponentWords
 * @typedef {import('./words.mjs').IdeaKind} IdeaKind
 */

/**
 * How many listed pieces make an idea a page: a part is one thing with a detail
 * or two ("a status pill with a tooltip"), while three pieces, two commas
 * apart, describe a page.
 */
const PAGE_PIECES = 3;

/**
 * The word that marks a page or part the builder already has, when its phrase
 * names one (see `changesExistingPage`).
 */
const EXISTING = /\bexisting\b/i;

/**
 * The word that marks an idea asking for a new page ("a new dashboard", "as a
 * new page"), which is never a change to one the builder has.
 */
const NEW = /\bnew\b/;

/**
 * What an idea asks for (spec:AST-048/FR3): a whole `page`; a `part` of one,
 * when its head noun names one of the system's components and it lists fewer
 * than PAGE_PIECES pieces; or an `edit` of a page the builder already has.
 *
 * @param {string} query
 * @param {PageTemplate[]} pages
 * @param {ComponentWords[]} components
 * @returns {IdeaKind}
 */
export function ideaKind(query, pages, components) {
  const text = String(query);
  const familyWords = familyWordsOf(pages);
  if (changesExistingPage(text, familyWords, components)) return 'edit';
  // The head's last word, page words included: "calendar" is the noun of "a
  // calendar", "page" the noun of "a calendar page". An overlay frame names
  // where the thing lives, not the thing: "drafts" is the noun of "drafts in
  // a modal".
  const head = (text.split(HEAD_END)[0] ?? '').replace(CONTAINER_PHRASE, m =>
    containersOf(m).size > 0 ? ' ' : m,
  );
  const words = (head.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    w => w.length >= 2,
  );
  const noun = stem(words[words.length - 1] ?? '');
  if (familyWords.has(noun)) return 'page';
  const pieces = (text.match(/,/g) ?? []).length + 1;
  if (pieces >= PAGE_PIECES) return 'page';
  return components.some(c => componentTerms(c).includes(noun))
    ? 'part'
    : 'page';
}

/**
 * Whether an idea changes a page or part the builder already has: "existing"
 * in the same phrase as a word that names a family of page templates or one of
 * the system's components ("the existing incidents table", "the existing
 * banner"). A new page "inspired by the existing one", or "existing users" on a
 * new page, names neither, and an idea that asks for a new page is no change
 * whatever it names.
 * @param {string} text
 * @param {Map<string, string>} familyWords
 * @param {ComponentWords[]} components
 * @returns {boolean}
 */
function changesExistingPage(text, familyWords, components) {
  const componentWords = new Set(components.flatMap(nameTerms));
  const phrases = text.toLowerCase().split(PHRASE_END);
  if (asksNewPage(phrases, familyWords)) return false;
  return phrases.some(phrase => {
    const at = phrase.search(EXISTING);
    return (
      at >= 0 &&
      terms(phrase.slice(at)).some(
        t => familyWords.has(t) || componentWords.has(t),
      )
    );
  });
}

/**
 * Whether an idea asks for a new page: "new" before a word that names a family
 * of page templates ("a new dashboard"), or before only words search drops,
 * such as "page" ("as a new page"). "A new column" asks for a part.
 * @param {string[]} phrases
 * @param {Map<string, string>} familyWords
 * @returns {boolean}
 */
function asksNewPage(phrases, familyWords) {
  return phrases.some(phrase => {
    const at = phrase.search(NEW);
    if (at < 0) return false;
    const after = terms(phrase.slice(at + 'new'.length));
    return after.length === 0 || familyWords.has(after[0]);
  });
}

/**
 * Whether an idea asks for a new page (see `asksNewPage`), from the idea and
 * the project's page templates.
 * @param {string} query
 * @param {PageTemplate[]} pages
 * @returns {boolean}
 */
export function asksForNewPage(query, pages) {
  return asksNewPage(
    String(query).toLowerCase().split(PHRASE_END),
    familyWordsOf(pages),
  );
}

/**
 * The words of a component's name: "DateRangeInput" is date, range, input.
 * @param {ComponentWords} component
 * @returns {string[]}
 */
function nameTerms(component) {
  return terms(component.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
}

/**
 * The terms a component answers to: the words of its name and of its keywords.
 * @param {ComponentWords} component
 * @returns {string[]}
 */
function componentTerms(component) {
  return [
    ...nameTerms(component),
    ...component.keywords.flatMap(keyword => terms(keyword)),
  ];
}
