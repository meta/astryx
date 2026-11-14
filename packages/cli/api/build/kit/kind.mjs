// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a build idea asks for a page, a part of a page, or a change to
 * a page the builder already has.
 *
 * Parts (spec:AST-048/FR3). "A date range picker" asks for a part of a page,
 * not a page, and the system's own components say what a part is: an idea
 * whose head noun is a word of a component's name or keywords, Core's or an
 * integration's, asks for that part, unless the noun is a family word ("a data
 * table") or the idea lists a page's worth of pieces. A component named with
 * its listed contents ("a side panel with an owner, a status, and a history")
 * is still one part, unless the component holds records: its category declares
 * a page family (a list, a table). Words search drops as
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
 * date filter") reads as the builder's own page. An idea that opens with "add"
 * and says where the piece goes ("add a filter row above the table") puts it
 * into a page the builder already has, so it is a change too, unless the piece
 * is a page ("add a dashboard to the app") or it asks for a new page ("add a
 * new dashboard").
 */

import {COMPONENT_CATEGORIES} from '../../../authoring/doctypes/component/categories.mjs';
import {stem} from '../../search/search.mjs';
import {
  HEAD_END,
  CONTAINER_PHRASE,
  PHRASE_END,
  PLACE_PHRASE,
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
 * apart, describe a page, unless they are one component's contents.
 */
const PAGE_PIECES = 3;

/**
 * The word that marks a page or part the builder already has, when its phrase
 * names one (see `changesExistingPage`).
 */
const EXISTING = /\bexisting\b/i;

/**
 * The word that opens an idea adding a piece to a page the builder already
 * has (spec:AST-048/FR3, FR9), when the idea says where the piece goes.
 */
const ADDS = /^\s*add\b/i;

/**
 * The word that marks an idea asking for a new page ("a new dashboard", "as a
 * new page"), which is never a change to one the builder has.
 */
const NEW = /\bnew\b/;

/**
 * What an idea asks for (spec:AST-048/FR3): a whole `page`; a `part` of one,
 * when its head noun names one of the system's components and it lists fewer
 * than PAGE_PIECES pieces or only that component's contents; or an `edit` of a
 * page the builder already has.
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
  if (addsToPage(text, familyWords, pages, components)) return 'edit';
  // The head's last word, page words included: "calendar" is the noun of "a
  // calendar", "page" the noun of "a calendar page". An overlay frame names
  // where the thing lives, not the thing: "drafts" is the noun of "drafts in
  // a modal".
  const rawHead = text.split(HEAD_END)[0] ?? '';
  const head = rawHead.replace(CONTAINER_PHRASE, m =>
    containersOf(m).size > 0 ? ' ' : m,
  );
  const noun = lastNoun(head);
  if (familyWords.has(noun)) return 'page';
  const holdsRecords = (/** @type {string} */ word) =>
    namedComponents(word, components).some(c => namesFamily(c, familyWords));
  if (
    describesOnePart(text, rawHead, noun, familyWords, components) &&
    !holdsRecords(noun)
  )
    return 'part';
  const pieces = (text.match(/,/g) ?? []).length + 1;
  if (pieces >= PAGE_PIECES) return 'page';
  const namesPart = (/** @type {string} */ word) =>
    components.some(c => componentTerms(c).includes(word));
  if (!namesPart(noun)) return 'page';
  // A component that holds records, followed by "of", is a page of those
  // records ("a list of jobs"), unless what follows names a component ("a list
  // of buttons") or a page family ("a list of settings toggles").
  if (!holdsRecords(noun) || !endsOnOf(text)) return 'part';
  const phrase = madeOf(text);
  return terms(phrase).some(t => familyWords.has(t)) ||
    namesPart(lastNoun(phrase))
    ? 'part'
    : 'page';
}

/**
 * Whether an idea describes one part and its contents: its head names a
 * component by name and ends on a word ("a side panel with a, b and c"), not
 * on a comma or a colon that starts a list of peers, and no word of the idea
 * names a page family. Such an idea is a part however many pieces it lists.
 * @param {string} text
 * @param {string} head the idea's head, before any frame is removed
 * @param {string} noun
 * @param {Map<string, string>} familyWords
 * @param {ComponentWords[]} components
 * @returns {boolean}
 */
function describesOnePart(text, head, noun, familyWords, components) {
  const end = text.slice(head.length).match(/^\s*([a-z]+)/i);
  return (
    end !== null &&
    components.some(c => nameTerms(c).includes(noun)) &&
    !terms(text).some(t => familyWords.has(t))
  );
}

/**
 * The components a word names: the one whose whole name is the word
 * ("button" names Button), else every component whose name holds it.
 * @param {string} word
 * @param {ComponentWords[]} components
 * @returns {ComponentWords[]}
 */
function namedComponents(word, components) {
  const whole = components.filter(c => {
    const name = nameTerms(c);
    return name.length === 1 && name[0] === word;
  });
  return whole.length > 0
    ? whole
    : components.filter(c => nameTerms(c).includes(word));
}

/**
 * Whether a component's doc files it under a category that declares a page
 * family the project has ("Table & List" declares the table family): such a
 * component holds the records a page of that family shows.
 * @param {ComponentWords} component
 * @param {Map<string, string>} familyWords
 * @returns {boolean}
 */
function namesFamily(component, familyWords) {
  const family = Object.hasOwn(COMPONENT_CATEGORIES, component.category ?? '')
    ? COMPONENT_CATEGORIES[component.category ?? ''].pageFamily
    : undefined;
  return family !== undefined && [...familyWords.values()].includes(family);
}

/**
 * The stem of a phrase's last word.
 * @param {string} phrase
 * @returns {string}
 */
function lastNoun(phrase) {
  const words = (phrase.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    w => w.length >= 2,
  );
  return stem(words[words.length - 1] ?? '');
}

/**
 * Whether an idea's head ends on "of" ("a list of jobs").
 * @param {string} text
 * @returns {boolean}
 */
function endsOnOf(text) {
  return text.match(HEAD_END)?.[0].toLowerCase() === 'of';
}

/**
 * What a head that ends on "of" is made of: the phrase after "of", up to the
 * next head end, without an overlay frame.
 * @param {string} text
 * @returns {string}
 */
function madeOf(text) {
  const end = text.match(HEAD_END);
  const rest = text.slice((end?.index ?? 0) + (end?.[0].length ?? 0));
  return (rest.split(HEAD_END)[0] ?? '').replace(CONTAINER_PHRASE, m =>
    containersOf(m).size > 0 ? ' ' : m,
  );
}

/**
 * Whether an idea adds a piece to a page the builder already has: it opens
 * with "add", says where the piece goes with a place phrase that names
 * something build knows (a page family word, a page template by its whole
 * name, or a component by the head word of its name:
 * "above the table", "to the settings page"; not "to my project"), the
 * piece's head names no page ("add a dashboard with a chart to my project"
 * is a new page), and it asks for no new page.
 * @param {string} text
 * @param {Map<string, string>} familyWords
 * @param {PageTemplate[]} pages
 * @param {ComponentWords[]} components
 * @returns {boolean}
 */
function addsToPage(text, familyWords, pages, components) {
  if (!ADDS.test(text)) return false;
  const place = text.match(PLACE_PHRASE);
  if (!place || place.index === undefined) return false;
  const piece = text.slice(0, place.index).split(HEAD_END)[0] ?? '';
  const target =
    text.slice(place.index + place[0].length).split(HEAD_END)[0] ?? '';
  const named = new Set(terms(target));
  const known = new Set([
    ...familyWords.keys(),
    ...components.map(c => nameTerms(c).at(-1) ?? ''),
  ]);
  const namesTemplate = pages.some(page => {
    const name = templateTerms(page);
    return name.length > 0 && name.every(t => named.has(t));
  });
  return (
    ([...named].some(t => known.has(t)) || namesTemplate) &&
    !namesPage(piece, familyWords, pages) &&
    !asksNewPage(text.toLowerCase().split(PHRASE_END), familyWords)
  );
}

/**
 * Whether a phrase names a page: it ends on a page family word ("add a
 * dashboard"), on a word search drops, such as "page" ("add a settings
 * page"), or on a page template's own name ("add a kanban board").
 * @param {string} phrase
 * @param {Map<string, string>} familyWords
 * @param {PageTemplate[]} pages
 * @returns {boolean}
 */
function namesPage(phrase, familyWords, pages) {
  const words = phrase.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const last = words[words.length - 1] ?? '';
  if (familyWords.has(stem(last)) || terms(last).length === 0) return true;
  const named = new Set(terms(phrase));
  return pages.some(page => {
    const name = templateTerms(page);
    return (
      name.length > 0 &&
      name.includes(stem(last)) &&
      name.every(t => named.has(t))
    );
  });
}

/**
 * The terms of a page template's own name: "kanban-board" is kanban, board.
 * @param {PageTemplate} page
 * @returns {string[]}
 */
function templateTerms(page) {
  return terms(page.name.replace(/-/g, ' '));
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
