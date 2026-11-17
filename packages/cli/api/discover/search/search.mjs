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
  spellIdentifiers,
  stem,
  wordForms,
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
 * Better match first: more query words matched, then the higher score.
 * @param {{matched: number, score: number}} a
 * @param {{matched: number, score: number}} b
 */
const byMatch = (a, b) => b.matched - a.matched || b.score - a.score;

/**
 * A quick test that leaves out only items search's scorer cannot match, so
 * ranking scores far fewer of them. A word of the query, or a synonym search
 * reads for it, matches only text that holds one of its forms, less its last
 * letter (every form search counts as the same word starts so: `spacing`
 * holds `spac` of `space`, `entries` holds `entr` of `entry`). A typo, which
 * search reads only in a query of one word or one identifier, needs a name
 * or keyword within three letters of the query or one of its words in
 * length. A query of stopwords alone tests nothing.
 * @param {ReturnType<typeof queryOf>} words
 * @returns {(item: SearchItem) => boolean}
 */
function mayMatch({term, tokens}) {
  if (tokens.length === 0) return () => true;
  const prefixes = new Set();
  for (const token of tokens) {
    for (const word of [token, ...(SYNONYM_INDEX.get(token) ?? [])]) {
      for (const form of [word, stem(word), ...wordForms(word)]) {
        prefixes.add(form.slice(0, Math.max(3, form.length - 1)));
      }
    }
  }
  const fuzzy = tokens.length <= 1 || !/\s/.test(term);
  const lengths = [term, ...tokens]
    .map(word => word.length)
    .filter(length => length >= 5);
  /** @param {string | undefined} text */
  const nearLength = text =>
    text != null &&
    lengths.some(
      length =>
        Math.abs(text.length - length) <= 3 &&
        Math.min(text.length, length) >= 5,
    );
  return item => {
    const text = [
      item.name,
      item.title,
      item.summary,
      item.description,
      item.packageDescription,
      ...(item.keywords ?? []),
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
    for (const prefix of prefixes) if (text.includes(prefix)) return true;
    return (
      fuzzy &&
      (nearLength(item.name) ||
        nearLength(item.title) ||
        (item.keywords ?? []).some(nearLength))
    );
  };
}

/**
 * The items that match `words`, best first, each with its score: the ranking
 * search() lists. When an item matches every word of the query, only such
 * items stay (the cut search's suggestions make, orderByAffinity `closest`).
 * @param {SearchItem[]} items
 * @param {ReturnType<typeof queryOf>} words
 * @param {{type?: string, only?: 'installed' | 'available'}} opts
 * @returns {Array<{item: SearchItem, score: {matched: number, total: number, score: number}}>}
 */
function rankItems(items, words, {type, only}) {
  const may = mayMatch(words);
  const scored = items
    .filter(item => (type == null ? true : item.kind === type))
    .filter(may)
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
  const everyWord = scored.filter(m => m.score.matched >= m.score.total);
  return everyWord.length > 0 ? everyWord : scored;
}

/**
 * Whether search() would list any match for `query`: the same installed
 * components and items, ranked and cut the same way, with no rule of its
 * own. Search's discover line reads it.
 * @param {ScannedPackage[]} packages installed packages
 * @param {string} query
 * @param {{items?: SearchItem[], type?: string}} opts
 * @returns {boolean}
 */
export function answersAny(packages, query, {items = [], type}) {
  if (!String(query ?? '').trim()) return false;
  return (
    rankItems([...installedComponentsOf(packages), ...items], queryOf(query), {
      type,
    }).length > 0
  );
}

/**
 * Every installed component, as an item search ranks.
 * @param {ScannedPackage[]} packages
 * @returns {SearchItem[]}
 */
function installedComponentsOf(packages) {
  return packages.flatMap(pkg =>
    pkg.components.map(name => ({
      package: pkg.name,
      kind: /** @type {const} */ ('component'),
      name,
      installed: true,
    })),
  );
}

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

  const installedComponents = installedComponentsOf(packages);

  const ranked = rankItems([...installedComponents, ...items], words, {
    type,
    only,
  });

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
