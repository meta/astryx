// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file discover.search leaf — free-text search across installed packages and,
 * when the project has discover sources, everything it could add.
 *
 * A free-text query always answers with a list, so its response type depends
 * on the form of the query and never on what the project has:
 *   1. any matches                       -> discover.search
 *   2. fuzzy hits on installed component names (distance <= 3)
 *                                        -> throw ERR_NOT_FOUND with
 *                                           suggestions
 *   3. otherwise                         -> throw ERR_NOT_FOUND
 * Matches are installed components, the project's other installed items,
 * packages, and every item a source lists for a package the project could add.
 * Each item is scored with search's word scorer (api/search/_score.mjs), so a
 * query matches word by word, typos in a one-word query included.
 * A caller opens one item by its package path, which ../detail answers.
 *
 * @position api/discover/search — pure ranking over the installed component
 *   names and ../_catalog-view's search items.
 */

import {levenshteinDistance} from '../../../foundation/text/string-utils.mjs';
import {scoreQuery} from '../../search/_score.mjs';
import {
  phraseWords,
  SEARCH_DOMAINS,
  tokenizeQuery,
} from '../../search/_query.mjs';
import {SYNONYM_INDEX} from '../../search/_synonyms.mjs';
import {
  joined,
  sameTermWord,
  spellIdentifiers,
  termWords,
  wordsOf,
} from '../../search/_words.mjs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {DISCOVER_KINDS} from '../../../authoring/discover/parse.mjs';
import {compareText} from '../../../foundation/text/compare-text.mjs';

/**
 * @typedef {import('../_package-scanner.mjs').ScannedPackage} ScannedPackage
 * @typedef {import('../_catalog-view.mjs').SearchItem} SearchItem
 */

const KIND_ORDER = ['package', ...DISCOVER_KINDS];

/**
 * The item as one of search's candidates (api/search/_score.mjs). Its title
 * is another name. The words of its name are derived keywords, so a word
 * inside a camelCase name counts (`chart` in `SalesChart`). Its summary,
 * or a package's own description, is its description.
 * @param {SearchItem} item
 * @param {string} [packageText] the description of the item's package
 */
function candidateOf(item, packageText) {
  return {
    domain: domainOf(item.kind),
    name: item.name,
    aliases: item.title ? [item.title] : [],
    keywords: item.keywords ?? [],
    weakKeywords: wordsOf(item.name),
    description: item.summary ?? item.description ?? '',
    prose: packageText ? [packageText] : [],
  };
}

/**
 * The search domain an item kind is scored as. A kind search has no domain
 * for (a package, a codemod, an agent doc, an icon set) is scored as a template is: by the
 * words of its name, with neither a doc route's rules nor a component's
 * joined-name rule.
 * @param {SearchItem['kind']} kind
 * @returns {import('../../search/_lexical.mjs').Candidate['domain']}
 */
function domainOf(kind) {
  return /** @type {readonly string[]} */ (SEARCH_DOMAINS).includes(kind)
    ? /** @type {import('../../search/_lexical.mjs').Candidate['domain']} */ (
        kind
      )
    : 'template';
}

/**
 * How well an item matches the query, scored the way search scores a
 * candidate: how many query words it matches, then how strongly. The words
 * may match across the item's name, title, keywords, summary, and its
 * package's description. The package's description only adds words the
 * item's own text lacks: an item must match some query word in its own text.
 * Null for no match.
 * @param {SearchItem} item
 * @param {{term: string, tokens: string[], words: string[]}} query
 * @returns {{matched: number, total: number, score: number} | null}
 */
function rank(item, {term, tokens, words}) {
  const own = scoreQuery(term, tokens, candidateOf(item), words);
  if (own == null) return null;
  const withPackage =
    item.packageDescription &&
    item.kind !== 'package' &&
    own.matched < own.total
      ? scoreQuery(
          term,
          tokens,
          candidateOf(item, item.packageDescription),
          words,
        )
      : null;
  const best =
    withPackage != null && byMatch(withPackage, own) < 0 ? withPackage : own;
  return {matched: best.matched, total: best.total, score: best.score};
}

/**
 * A query as rank() reads it. An identifier counts as the words it spells
 * (`EmployeeTypeahead`), and still matches whole as typed.
 * @param {string} query
 */
function queryOf(query) {
  const spelled = spellIdentifiers(String(query).trim());
  return {
    term: String(query).trim().toLowerCase(),
    tokens: tokenizeQuery(spelled),
    words: phraseWords(spelled),
  };
}

/**
 * Whether an item a project could add answers the whole query by its words,
 * the way discover's every-word tier counts them: its name or title is the
 * query with its words joined (`barchart` is BarChart), or each word of the
 * query, or a synonym search reads for it, is a word of the item's name,
 * title, summary, or keywords, with its package's description adding words
 * its own text lacks, in any form search counts as the same word (plural,
 * stem). As in rank(), the item's own text must answer at least one word.
 * It reads words and does not run search's scorer, so it counts no match
 * that search finds only by a word's start, a typo, or a joined keyword.
 * @param {SearchItem[]} items
 * @param {string} query
 * @param {{type?: import('../../../authoring/discover/type').DiscoverKind}} [opts]
 * @returns {boolean}
 */
export function anyAvailableNamed(items, query, {type} = {}) {
  const whole = joined(query);
  // Each word of the query, with the synonyms search reads for it: any one
  // of them answers the word.
  const wanted = queryOf(query)
    .tokens.flatMap(token => wordsOf(token))
    .map(word => [word, ...(SYNONYM_INDEX.get(word) ?? [])].map(termWords));
  if (wanted.length === 0 || whole === '') return false;
  /** @param {string[]} words @param {typeof wanted[number]} forms */
  const answers = (words, forms) =>
    forms.some(t => words.some(w => sameTermWord(t, w)));
  return items.some(item => {
    if (item.installed || (type != null && item.kind !== type)) return false;
    if (
      joined(item.name) === whole ||
      (item.title && joined(item.title) === whole)
    ) {
      return true;
    }
    const own = [
      item.name,
      item.title,
      item.summary,
      item.description,
      ...(item.keywords ?? []),
    ].flatMap(text => (text == null ? [] : wordsOf(text)));
    if (!wanted.some(forms => answers(own, forms))) return false;
    const all = item.packageDescription
      ? [...own, ...wordsOf(item.packageDescription)]
      : own;
    return wanted.every(forms => answers(all, forms));
  });
}

/**
 * Better match first: more query words matched, then the higher score.
 * @param {{matched: number, score: number}} a
 * @param {{matched: number, score: number}} b
 */
const byMatch = (a, b) => b.matched - a.matched || b.score - a.score;

/**
 * Search all packages for `query` (a free-text term that never starts with
 * `@`). Resolves to a search response when anything matches, even a single
 * item, an exact component name or a near-miss name long enough to be a
 * typo, or throws AstryxError (ERR_NOT_FOUND) — with fuzzy suggestions when
 * any exist.
 *
 * @param {ScannedPackage[]} packages installed packages
 * @param {string} query
 * @param {{
 *   items?: SearchItem[],
 *   type?: import('../../../authoring/discover/type').DiscoverKind,
 *   only?: 'installed' | 'available',
 *   limit?: number,
 * }} opts
 * @returns {Promise<import('../discover.type.mjs').DiscoverSearchResponse>}
 */
export async function search(packages, query, opts) {
  const {items = [], type, only, limit} = opts;
  // An empty query must error, not match every component via `.includes('')`
  // (parity with the api/search leaf). The discover() dispatcher already routes
  // an empty query to list, but the leaf must be safe on its own.
  if (!query || !String(query).trim()) {
    throw new AstryxError(
      'A search query is required',
      [{name: 'astryx discover button', reason: 'example'}],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const lower = query.toLowerCase();
  const words = queryOf(query);

  /** @type {SearchItem[]} */
  const installedComponents = packages.flatMap(pkg =>
    pkg.components.map(name => ({
      package: pkg.name,
      kind: /** @type {const} */ ('component'),
      name,
      installed: true,
    })),
  );

  const scored = [...installedComponents, ...items]
    .filter(item => (type == null ? true : item.kind === type))
    .filter(item =>
      only === 'installed'
        ? item.installed
        : only === 'available'
          ? !item.installed
          : true,
    )
    .map(item => ({item, score: rank(item, words)}))
    .filter(
      /** @returns {m is {item: SearchItem, score: {matched: number, total: number, score: number}}} */
      m => m.score != null,
    )
    .sort(
      (a, b) =>
        byMatch(a.score, b.score) ||
        Number(b.item.installed) - Number(a.item.installed) ||
        KIND_ORDER.indexOf(a.item.kind) - KIND_ORDER.indexOf(b.item.kind) ||
        compareText(a.item.package, b.item.package) ||
        compareText(a.item.name, b.item.name),
    );
  // The cut search's suggestions make (orderByAffinity `closest`): when an
  // item matches every word of the query, only such items stay.
  const everyWord = scored.filter(m => m.score.matched >= m.score.total);
  const ranked = everyWord.length > 0 ? everyWord : scored;

  if (ranked.length > 0) {
    const matches = ranked.map(({item}) => ({
      package: item.package,
      component: item.name,
      kind: item.kind,
      installed: item.installed,
      ...(item.title ? {title: item.title} : {}),
      ...(item.summary ? {summary: item.summary} : {}),
    }));
    const shown = limit == null ? matches : matches.slice(0, limit);
    return {
      type: 'discover.search',
      data: {
        query,
        matches: shown,
        ...(shown.length < matches.length ? {total: matches.length} : {}),
      },
    };
  }

  // Fuzzy fallback over installed components.
  const fuzzyMatches = installedComponents
    .map(entry => ({
      ...entry,
      distance: levenshteinDistance(lower, entry.name.toLowerCase()),
    }))
    .filter(m => m.distance <= 3)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (fuzzyMatches.length > 0) {
    throw new AstryxError(
      `"${query}" not found`,
      fuzzyMatches.map(m => ({
        name: m.package + '/' + m.name,
        reason: 'similar name',
      })),
      ERROR_CODES.ERR_NOT_FOUND,
    );
  }

  throw new AstryxError(
    `"${query}" not found in any package`,
    undefined,
    ERROR_CODES.ERR_NOT_FOUND,
  );
}
