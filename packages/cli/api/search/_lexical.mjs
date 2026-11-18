// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lexical ranker: keyword and fuzzy scoring of every gathered
 * candidate, as one pure function (`rankLexical`). `searchCore` (search.mjs)
 * runs it alone, and search's searchers read its ranking. No I/O: the adapter
 * gathers the candidates. Word handling lives in _words.mjs, _synonyms.mjs and
 * _query.mjs; a candidate's score in _score.mjs and _candidate-score.mjs.
 *
 *
 * Returns the same typed envelope { type, data } that `xds --json search`
 * outputs. The CLI command handler is a thin wrapper around this function.
 *
 * Scoring is keyword + fuzzy ranking; the per-term signal weights are
 * listed in _candidate-score.mjs.
 *
 * A multi-word query has a reserved top tier (see {@link scoreQuery}): the
 * whole query as a candidate's name or keyword (190-200), then the whole query
 * as a phrase inside a doc's title or one of its headings (170), then a whole
 * title of two words or more inside the query (160-169), then a candidate that
 * matches every word of the query, at least one of them by name or keyword
 * (151-159). Below those sits everything else: a partial match, or every word
 * matched only in prose or through the components a page renders. A section titled "Light/Dark Mode" answers `dark
 * mode` better than any doc that merely names `mode` in code, however exactly;
 * "Dark mode" answers `how do I add dark mode`; and a guide whose title and
 * description hold both words of `troubleshoot integration` answers it better
 * than a doc named `integration`.
 *
 * Between domains, ranking adds one rule ahead of the score: domain priority
 * (see {@link domainPriority}). A component, hook, template, or theme whose
 * name or keyword a query word hits ranks ahead of every doc the reader did not
 * ask for by name, title, or a declared phrase, so `font size` finds `Text`
 * before a token page whose heading holds the phrase. A doc the query names,
 * whose title the query holds, or that declares the whole query as a keyword
 * keeps its place.
 *
 * Description and guidance are separate tiers on purpose. A component's own
 * one-line description saying "notification" is a claim about what it IS; the
 * same word inside another component's best-practice advice is a passing
 * mention. Scored equally, `Toast` — "a brief, non-blocking notification" —
 * ties with `Card`, `Dialog` and `Item`, which merely mention notifications in
 * their guidance, and ties break alphabetically, so Toast falls off the end of
 * its own best query.
 *
 * `keywords` carry AUTHORED intent — a block's `componentsUsed`, a page's
 * `category` words. `weakKeywords` are DERIVED: the components a page template
 * happens to render, scraped out of its JSX. Derived signal is deliberately
 * capped below the confident-match gate on its own, because breadth is not
 * relevance. At full keyword strength every rendered component is an
 * independent 90-point shot with no penalty for how many a template has, so
 * the broadest pages (a theme showcase rendering one of everything) win
 * queries they have nothing to do with.
 */

import {spellIdentifiers, joined} from './_words.mjs';
import {tokenizeQuery, phraseWords, pluralOf} from './_query.mjs';
import {MAX_RUN_WORDS} from './_compound.mjs';
import {scoreQuery} from './_score.mjs';
import {scoreCandidate} from './_candidate-score.mjs';
import {domainPriority} from './_priority.mjs';
import {toResult, searchedComponentsOf} from './_result.mjs';
import {compareText} from '../../foundation/text/compare-text.mjs';
import {COMPONENT_NAME_RE} from '../../foundation/text/entry-names.mjs';

/**
 * A search candidate gathered from one content domain. Extra underscore-
 * prefixed fields carry domain-specific payload used only by {@link toResult}.
 * @typedef {object} Candidate
 * @property {'component'|'hook'|'doc'|'template'|'theme'} domain
 * @property {string} name
 * @property {string[]} [aliases] - Other names the candidate answers to, scored
 *   with the same name signals: a theme's display name.
 * @property {string[]} [keywords]
 * @property {string[]} [_declared] - A doc's own declared keywords: what its
 *   author lists in `keywords`, without the code terms and table cells its
 *   other keywords add.
 * @property {string[]} [weakKeywords]
 * @property {string[]} [_uses] - The components a block's doc lists as used
 *   (`componentsUsed`), also among its keywords as gathered.
 * @property {string[]} [weakKeywordBound] - Every name `weakKeywords` can
 *   hold, for a page whose weak keywords cost a parse to read.
 * @property {string} [description]
 * @property {string[]} [prose]
 * @property {string[]} [guidance]
 * @property {string[]} [titles] - A doc's title and the headings inside it:
 *   the lines a reader scans to pick it. The whole query standing in one of
 *   them, or one of them standing whole in the query, is a top-tier match.
 * @property {string} [_import]
 * @property {string} [_title]
 * @property {string} [_topic] - A doc result's topic or docs-tree route.
 * @property {string} [_section] - A doc result's section key, when it is one section.
 * @property {string} [_command] - The command that reads exactly this doc part.
 * @property {string} [_parent] - The command that opens the level above a doc
 *   part: its topic's section list, or the docs-tree namespace it sits in.
 * @property {string} [_category] - The category its own doc files it under.
 * @property {string} [_package] - The npm package that owns the candidate:
 *   Core's package for its components, hooks, and templates, the integration's
 *   for what it contributed, and for a doc part the package that wrote it.
 * @property {string} [_displayName]
 * @property {string} [_family] - The family whose doc lists a component as a
 *   member; a query naming the family lists its first members.
 * @property {number} [_familyIndex] - The member's place in that doc's list.
 * @property {'page'|'block'} [_kind]
 * @property {string} [_resultName]
 * @property {string} [_commandName]
 * @property {true} [_notReady] - A template whose doc sets `isReady: false`.
 *   Its result's `isReady` is false; ranking never reads it.
 * @property {'file'|'doc'} [_hold] - How an integration component holds its
 *   name, for the owner rule.
 * @property {string} [_docPath] - An integration component's doc.
 * @property {import('@astryxdesign/cli/authoring').ComponentDeprecation} [_deprecated] -
 *   A deprecated component's replacement, from its doc's `deprecated`.
 */

/**
 * True when the query is the candidate's whole name or another name of it,
 * typed as is or, for anything but a doc, with its spaces removed. Such a
 * query names that entry outright.
 * @param {Candidate} candidate
 * @param {string} term the query, trimmed and lowercased
 * @returns {boolean}
 */
export function namesWhole(candidate, term) {
  return [candidate.name, ...(candidate.aliases ?? [])].some(name => {
    const lower = String(name).toLowerCase();
    return (
      lower === term ||
      (candidate.domain !== 'doc' &&
        !/[\s_-]/.test(lower) &&
        lower === term.replace(/\s+/g, ''))
    );
  });
}

/**
 * Whether a one-identifier query is read as its words when all it matches,
 * read whole, is text that mentions it: when it is written as an entry's
 * name is written (PascalCase: a component, a type, an icon), never as a
 * prop's (camelCase). The scope of that reading, in one place.
 * @param {string} query
 * @returns {boolean}
 */
export function readsMentionAsWords(query) {
  return COMPONENT_NAME_RE.test(query.trim());
}

/**
 * How a one-identifier query is read. It is read as its words when, read
 * whole, it matches nothing: a prop or hook name (camelCase) a doc already
 * mentions keeps the entries that mention it. An identifier written as an
 * entry's name (see readsMentionAsWords) is read as its words also when all
 * it matches is text that mentions it: `mentioned` holds those entries,
 * which keep the hit, and the words find the entries they name. The whole
 * identifier is scored against the catalog only for a query these rules can
 * split; `mentioned` is empty unless the query is split for its mentions.
 * @param {string} query
 * @param {Candidate[]} all
 * @returns {{split: boolean, mentioned: Set<Candidate>}}
 */
function identifierReading(query, all) {
  const term = String(query).trim().toLowerCase();
  const spelled = spellIdentifiers(String(query).trim());
  const oneIdentifier =
    !/\s/.test(term) &&
    spelled !== term &&
    !all.some(candidate => namesWhole(candidate, term));
  const mentionsSplit = oneIdentifier && readsMentionAsWords(String(query));
  /** @type {Set<Candidate>} */
  const mentioned = new Set();
  let wholeHit = false;
  let otherHit = false;
  if (oneIdentifier)
    for (const candidate of all) {
      const hit = scoreCandidate(term, candidate, {mentions: mentionsSplit});
      if (!hit) continue;
      wholeHit = true;
      if (!mentionsSplit || !hit.inText) {
        otherHit = true;
        break;
      }
      mentioned.add(candidate);
    }
  const split = oneIdentifier && (!wholeHit || (mentionsSplit && !otherHit));
  return {split, mentioned: split ? mentioned : new Set()};
}

/**
 * Today's lexical ranking of a gathered catalog: the search response
 * `searchCore` returns.
 *
 * @param {string} query
 * @param {{limit?: number}} options
 * @param {{all: Candidate[], components: Candidate[], searchedComponents: boolean, outside?: boolean, coreSkipped?: string | null, ownEvidence?: boolean}} catalog
 * @returns {import('./search.type.mjs').SearchResponse}
 */
export function rankLexical(query, options, catalog) {
  const {limit = 20} = options;
  const term = String(query).trim().toLowerCase();
  const {all, components} = catalog;

  // A query that is one identifier counts as the words it spells
  // (`SidebarToggle`), and still matches whole as typed. In a query of several
  // words, each identifier stays one term (`ChatComposer ChatLayout` names two
  // components), and its words still join into names (see compoundHit). Both
  // only help a query that names no entry outright: when the query is an
  // entry's name, typed whole or as its words, that entry answers it, and
  // neither reading may add near siblings beside it.
  const spelled = spellIdentifiers(String(query).trim());
  const exact = all.some(candidate => namesWhole(candidate, term));
  const {split, mentioned} = identifierReading(query, all);
  // Read as its words, the identifier still answers the text that mentions
  // it whole: that entry keeps the better of the two readings.
  const wholeTokens = mentioned.size ? tokenizeQuery(term) : null;
  const wholeWords = mentioned.size ? phraseWords(term) : null;
  const tokens = tokenizeQuery(split ? spelled : term);
  /** @type {string[]} */
  const words = exact
    ? []
    : phraseWords(split || /\s/.test(term) ? spelled : term);
  // The entries the query names: a component, hook, or template whose whole
  // name is adjacent query words joined (`icon button in a card header` names
  // IconButton), or one identifier typed as such. A name inside a longer named
  // run does not count (`icon` there is part of IconButton).
  const queryWords = phraseWords(spelled);
  const typedIdentifiers = new Set(
    (String(query).match(/[A-Za-z0-9]+/g) ?? [])
      .filter(w => /[A-Z]/.test(w))
      .map(w => w.toLowerCase()),
  );
  /** @type {Map<string, [number, number]>} each run joined, longest first */
  const spans = new Map();
  for (let len = Math.min(queryWords.length, MAX_RUN_WORDS); len >= 1; len--) {
    for (let a = 0; a + len <= queryWords.length; a++) {
      // One plain word names too much (`list`, `field`); a named entry is a
      // run of joined words, or an identifier typed as one.
      if (len === 1 && !typedIdentifiers.has(queryWords[a])) continue;
      const run = queryWords.slice(a, a + len).join('');
      if (!spans.has(run)) spans.set(run, [a, a + len]);
    }
  }
  /**
   * Where a query word is the candidate's whole name, or null: such an entry
   * keeps the rank its name earns, whatever else it matched.
   * @param {Candidate} candidate
   * @returns {[number, number] | null}
   */
  const wordNamed = candidate => {
    if (candidate.domain === 'doc') return null;
    for (const name of [candidate.name, ...(candidate.aliases ?? [])]) {
      const n = joined(name);
      const at = queryWords.findIndex(w => w === n || w === `${n}s`);
      if (at >= 0) return [at, at + 1];
    }
    return null;
  };
  /** @param {Candidate} candidate @returns {[number, number] | null} */
  const namedSpan = candidate => {
    if (candidate.domain === 'doc') return null;
    /** @type {[number, number] | null} */
    let best = null;
    for (const name of [candidate.name, ...(candidate.aliases ?? [])]) {
      const n = joined(name);
      const span =
        spans.get(n) ??
        spans.get(`${n}s`) ??
        (/(?:s|x|z|ch|sh)$/.test(n) ? spans.get(`${n}es`) : undefined);
      if (span && (!best || span[1] - span[0] > best[1] - best[0])) {
        best = span;
      }
    }
    return best;
  };

  // In search's reading (`ownEvidence`, set by searchView), the query words
  // that name a component or hook outright (its whole name, as `namedSpan`
  // and `wordNamed` read it) and no doc. Such a word asks for that entry, and
  // the title tier reads it (scoreQuery). A word that is also a doc's name
  // (`theme`, `tokens`) may be asking for the doc. Worked out only when the
  // title tier asks, as few queries hold a title.
  /** @type {Set<string> | undefined} */
  let namedWords;
  const namedWordsOf = () => {
    if (namedWords) return namedWords;
    namedWords = new Set();
    if (!catalog.ownEvidence) return namedWords;
    /** @type {string[]} */
    const docNames = [];
    for (const candidate of all) {
      if (candidate.domain === 'doc') {
        for (const name of [candidate.name, candidate._topic]) {
          const route = String(name ?? '');
          docNames.push(joined(route.slice(route.lastIndexOf('/') + 1)));
        }
      } else if (
        candidate.domain === 'component' ||
        candidate.domain === 'hook'
      ) {
        const span = namedSpan(candidate) ?? wordNamed(candidate);
        if (span) {
          for (const w of queryWords.slice(span[0], span[1])) {
            namedWords.add(w);
          }
        }
      }
    }
    for (const w of namedWords) {
      if (docNames.some(n => n === w || pluralOf(w, n) || pluralOf(n, w))) {
        namedWords.delete(w);
      }
    }
    return namedWords;
  };

  // Score every candidate on its own merits. The consumer groups results by
  // role (page / block / component) and takes the top of each, so there's no
  // cross-role competition to engineer — a target page only needs to be the
  // strongest PAGE, not outrank every component.
  /** @type {{result: any, priority: 0 | 1 | 2, key: number, alias: 'partial' | 'keyword' | false, aliasWords: number, candidate: Candidate, span: [number, number] | null, word: [number, number] | null}[]} */
  const ranked = [];
  for (const candidate of all) {
    // What scoreQuery scored each token as, for domainPriority below.
    /** @type {Map<string, {fuzzy: boolean, hit: {score: number, reason: string} | null}>} */
    const tokenHits = new Map();
    const asWords = scoreQuery(term, tokens, candidate, words, {
      tokenHits,
      named: namedWordsOf,
      ownEvidence: catalog.ownEvidence === true,
    });
    const asWhole =
      wholeTokens && mentioned.has(candidate)
        ? scoreQuery(
            term,
            wholeTokens,
            candidate,
            /** @type {string[]} */ (wholeWords),
            {ownEvidence: catalog.ownEvidence === true},
          )
        : null;
    const hit =
      asWhole && (!asWords || asWhole.score > asWords.score)
        ? asWhole
        : asWords;
    if (hit)
      ranked.push({
        result: toResult(
          candidate,
          hit.score,
          hit.reason,
          hit.matched,
          hit.total,
          catalog.outside,
        ),
        priority: domainPriority(
          term,
          tokens,
          candidate,
          hit,
          words,
          tokenHits,
        ),
        key: hit.score,
        alias: hit.alias ?? false,
        aliasWords: hit.aliasWords ?? 0,
        candidate,
        span: namedSpan(candidate),
        word: wordNamed(candidate),
      });
  }
  // A match on a keyword read joined never outranks an entry the query names,
  // and neither does a match on part of another name unless it spans more
  // query words than any named run: `table header with sticky columns` keeps
  // TableHeader above useTableStickyColumns, which only holds the words
  // `sticky columns`. Only the order changes; each result keeps the score its
  // text earned.
  /** @param {[number, number]} inner @param {[number, number]} outer */
  const inside = (inner, outer) =>
    outer[0] <= inner[0] &&
    outer[1] >= inner[1] &&
    outer[1] - outer[0] > inner[1] - inner[0];
  const named = ranked.filter(r => {
    const span = r.span;
    return (
      span != null &&
      !ranked.some(o => o !== r && o.span != null && inside(span, o.span))
    );
  });
  /** @param {{key: number}[]} rows */
  const floorOf = rows =>
    rows.length ? Math.min(...rows.map(r => r.key)) : Infinity;
  const namedFloor = floorOf(named);
  const longestNamed = Math.max(
    0,
    ...named.map(r => (r.span ? r.span[1] - r.span[0] : 0)),
  );
  for (const r of ranked) {
    if (named.includes(r)) continue;
    if (!r.alias || r.word) continue;
    // A match on part of a longer name that spans more words than any named
    // run reads more of the query than the named entry does (`dropdown menu
    // radio` and DropdownMenuRadioItem, against DropdownMenu), so it is not
    // held back. A joined keyword always is.
    if (r.alias === 'partial' && r.aliasWords > longestNamed) continue;
    // It keeps what it earns without those matches.
    const own =
      scoreQuery(term, tokens, r.candidate, words, {
        plain: true,
        ownEvidence: catalog.ownEvidence === true,
      })?.score ?? 0;
    r.key = Math.max(own, Math.min(r.key, namedFloor - 0.5));
  }

  // Docs and everything else are each sorted by score desc, then domain
  // (stable order), then name. The two are merged: at each step the stronger
  // head goes next, except that a head with domain priority goes ahead of a
  // doc head without it (see domainPriority). Each side keeps its own order.
  /** @type {Record<string, number>} */
  const domainOrder = {component: 0, hook: 1, doc: 2, template: 3, theme: 4};
  /**
   * @param {{result: any, key: number}} x
   * @param {{result: any, key: number}} y
   */
  const byScore = ({result: a, key: ka}, {result: b, key: kb}) =>
    kb - ka ||
    (domainOrder[a.domain] ?? 9) - (domainOrder[b.domain] ?? 9) ||
    compareText(a.name, b.name);
  const others = ranked.filter(r => r.result.domain !== 'doc').sort(byScore);
  // Against other domains, a doc the reader asked for competes ahead of docs
  // they did not, so it is not held behind a broad page that outscores it.
  // Docs alone keep their text-match order, with a doc the whole query names
  // first.
  const docs = ranked
    .filter(r => r.result.domain === 'doc')
    .sort((x, y) =>
      others.length > 0
        ? y.priority - x.priority || byScore(x, y)
        : Number(y.priority === 2) - Number(x.priority === 2) || byScore(x, y),
    );
  const scored = [];
  let i = 0;
  let j = 0;
  while (i < others.length || j < docs.length) {
    const other = others[i];
    const doc = docs[j];
    const otherFirst =
      !doc ||
      (other != null &&
        ((other.priority && !doc.priority) || byScore(other, doc) < 0));
    scored.push(otherFirst ? others[i++].result : docs[j++].result);
  }
  // Read as its words, an identifier text mentions keeps that text ahead of
  // every entry its words only match: a mention of the whole identifier is
  // the stronger hit. An entry the words name outright (its whole name is
  // one of them, or a run of them joined, as `named` reads it) keeps its
  // place among them. Each side keeps its order and its scores.
  if (mentioned.size) {
    const ahead = new Set(
      ranked
        .filter(r => mentioned.has(r.candidate) || r.span != null || r.word)
        .map(r => r.result),
    );
    scored.sort((a, b) => Number(ahead.has(b)) - Number(ahead.has(a)));
  }

  // `results` is bounded by `limit` so a caller (and the recorded run that
  // quotes it) never carries an unbounded payload. `matchCount` is the number
  // of matches that bound was applied TO — reporting `results.length` there
  // would report the cap back as if it were the answer, so a query matching
  // 57 things and one matching exactly 20 would be indistinguishable.
  const limited = scored.slice(0, limit);

  /** @type {import('./search.type.mjs').SearchResponse} */
  const response = {
    type: 'search',
    data: {
      query: String(query).trim(),
      matchCount: scored.length,
      // toResult gives every domain its command and domain fields.
      results: /** @type {import('./search.type.mjs').SearchResultEntry[]} */ (
        limited
      ),
    },
  };
  if (catalog.coreSkipped) {
    response.meta = {
      partial: {
        skipped: ['component', 'hook', 'template'],
        reason: catalog.coreSkipped,
      },
    };
  }
  if (catalog.searchedComponents) {
    searchedComponentsOf.set(
      response,
      components.map(c => ({
        name: c.name,
        keywords: c.keywords ?? [],
        category: c._category ?? '',
      })),
    );
  }
  return response;
}
