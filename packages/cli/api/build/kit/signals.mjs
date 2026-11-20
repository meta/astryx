// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What build weighs for one request, computed once: search's matches
 * grouped into pages, blocks, and domain components; the page template to
 * start from and its alternatives (start.mjs, rank.mjs); and search's whole
 * block list with its scores, for the block picker. answer.mjs turns these and
 * a block list into the build.kit response.
 * @input A request and build's options; templates and components through the
 *   adapter.
 * @output {@link KitSignals}
 * @position api/build/kit, beside kit.mjs and answer.mjs; the main searcher in
 *   tree.mjs calls it.
 */

import {
  searchCore as search,
  searchedComponents,
} from '../../search/search.mjs';
import {coreDirOrThrow} from '../../error.mjs';
import {runBase} from '../../../foundation/bases/resolve.mjs';
import {getResultCoverage} from '../../search/coverage.mjs';
import {CORE_PROVIDER_ID} from '../../../foundation/identity/providers.mjs';
import {
  loadComponents,
  loadTemplates,
  loadWeights,
  pageDestination,
  buildCoreContentDir,
  templateSetupNotes,
} from '../_adapter.mjs';
import {ideaKind, nameTerms} from './kind.mjs';
import {pickStart, rankPages} from './rank.mjs';
import {pickFit} from './weights.mjs';
import {readNames} from './words.mjs';
import {namedOutright} from './weights.mjs';
import {asTemplate, chooseStart, pickStartAlternatives} from './start.mjs';

/** A page at/above this score is a confident direct match. */
const PAGE_DIRECT = 95;

/** Below this a page is too weak to offer at all. */
const PAGE_FLOOR = 50;

/**
 * Below this a block/domain-component match is incidental noise. A single
 * description word in a multi-word idea scores 50 plus at most 7.5 of coverage
 * garnish, so it stays below; a name or keyword hit clears it. `build "weekly
 * brief"` used to offer Toast, Popover and TextInput because their
 * descriptions say "brief".
 */
const DOMAIN_FLOOR = 60;

/**
 * How much of a multi-word query a page must cover to be offered on breadth.
 *
 * Score alone cannot carry this. A page's derived keywords include every
 * component its source renders, so `build "actionable warning banner"` once
 * scored `login`, `contact-form` and `documentation-design` at 95 apiece — an
 * exact hit on "banner" alone, plus the coverage garnish. Matching one of
 * three concepts is not the same claim as matching three.
 */
const PAGE_COVERAGE = 0.5;

/**
 * Always-surfaced primitives. Every page needs a shell + layout/typography/
 * action atoms, but these never keyword-match an idea ("dashboard" != "Stack"),
 * so search alone never returns them. Kept here (not the renderer) because they
 * are ALSO used to exclude these names from the idea-specific `domain` group.
 * Every page template already uses them.
 */
export const FRAME = ['AppShell', 'TopNav', 'SideNav', 'Layout'];

export const FOUNDATION = [
  'VStack',
  'HStack',
  'Grid',
  'StackItem',
  'Card',
  'Section',
  'Text',
  'Heading',
  'Button',
  'Icon',
  'Badge',
  'Divider',
];


/**
 * @typedef {import('../../search/search.type.mjs').SearchResultEntry} SearchResultEntry
 * @typedef {import('../build.type.mjs').BuildStart} BuildStart
 * @typedef {[name: string, score: number, matched: number | null, total: number | null]} BlockScore
 */

/**
 * Everything build weighs for one request.
 * @typedef {object} KitSignals
 * @property {string} query the caller's query, trimmed, as search echoes it
 * @property {string} idea the query as build matches it: a page template it
 *   names in any case or with a swapped pair of letters reads as that
 *   template's own words (readNames)
 * @property {number} matchCount
 * @property {boolean} directMatch
 * @property {BuildStart | null} start the start, its alternatives, and its notes
 * @property {SearchResultEntry[]} pages
 * @property {SearchResultEntry[]} blocks the blocks build names itself
 * @property {SearchResultEntry[]} domain
 * @property {string[]} kitBlocks the names of `blocks`
 * @property {string[]} frame the always-on page-shell components; none on a
 *   base other than Core
 * @property {string[]} foundation the always-on layout, type, and action
 *   components; none on a base other than Core
 * @property {BlockScore[]} searched every block search returned, in its order
 * @property {Map<string, SearchResultEntry>} searchedEntries search's entry for each of those blocks (the first of a name)
 * @property {Map<string, string>} blockText each of those blocks' display name and description, from the catalog
 * @property {string[]} foreign the blocks, named, searched or scaffoldable, whose package is not Core's
 * @property {import('../_adapter.mjs').BlockTemplate[]} catalog every block the project can scaffold
 * @property {{name: string, keywords?: string[]}[]} components every component, with its keywords
 */

/**
 * A block result's name, score, and how much of the query it matched.
 * @param {SearchResultEntry} r
 * @returns {BlockScore}
 */
function blockScore(r) {
  const coverage = getResultCoverage(r);
  return [r.name, r.score, coverage?.matched ?? null, coverage?.total ?? null];
}

/**
 * The not-ready page template the idea names and search matches directly, or
 * null: the one case where build's reason names a template it does not start
 * from. Search for the kit leaves not-ready templates out, so only an idea
 * that names one outright pays for a search that keeps them.
 * @param {string} query the caller's idea
 * @param {{name: string}[]} notReady the project's not-ready page templates
 * @param {() => Promise<SearchResultEntry[]>} searchAll search's results with every template
 * @param {(r: SearchResultEntry) => boolean} pageMatch
 * @returns {Promise<string | null>}
 */
async function namedNotReady(query, notReady, searchAll, pageMatch) {
  /** @param {{name: string}} t */
  const named = t =>
    namedOutright([t.name], readNames(query, [{name: t.name}]), [t])[0];
  const names = new Set(notReady.filter(named).map(t => t.name));
  if (names.size === 0) return null;
  const found = (await searchAll()).find(
    r => names.has(r.name) && pageMatch(r) && r.score >= PAGE_DIRECT,
  );
  return found?.name ?? null;
}

/**
 * Build's signals for one request (see {@link KitSignals}).
 *
 * @param {string} query what you're building (e.g. "analytics dashboard")
 * @param {{cwd?: string, type?: import('../../search/search.type.mjs').SearchDomain, limit?: number}} [options]
 * @returns {Promise<KitSignals>}
 */
export async function kitSignals(query, options = {}) {
  const {cwd = process.cwd(), type, limit = 60} = options;
  // A kit is built from Core's components, hooks, and templates. An open
  // search without core covers the docs alone, so the kit asks for core here.
  if (type !== 'doc') coreDirOrThrow(buildCoreContentDir, cwd);
  // The always-on names are Core components, so they belong to a run on Core
  // and to no other base.
  const run = runBase(cwd);
  const onCore = !run.ok || run.base.core;
  const frame = onCore ? FRAME : [];
  const foundation = onCore ? FOUNDATION : [];
  // search()'s JSDoc @returns widens results to object[]; the SearchResponse
  // shape is the contract (api/search/search.type.mjs). Cast locally rather than
  // tightening the search @returns (a separate follow-up).
  // A kit narrowed to components or hooks has no page to start from; every
  // other kit does, so the reader is never left to compose a page from scratch.
  const wantsPages = !type || type === 'template';
  const templates = wantsPages
    ? await loadTemplates(cwd)
    : {pages: [], blocks: [], notReadyPages: []};
  const catalog = templates.pages;
  // Search reads a page template the idea names in any case, separator or
  // with a neighbour-letter swap in a word of six or more letters as that template's own words
  // (readNames), as the page ranker does, so such a name matches by name.
  const searched = wantsPages ? readNames(query, catalog) : query;
  const searchOptions = {
    cwd,
    type,
    // Search wider than the surfaced kit so a flood of doc matches cannot
    // bury the page templates past the cutoff; the caller's `limit` still
    // caps the kit below. A non-positive or non-integer limit is passed
    // through unchanged so search rejects it (ERR_INVALID_ARGUMENT).
    limit: Number.isInteger(limit) && limit > 0 ? Math.max(limit, 200) : limit,
  };
  const result =
    /** @type {import('../../search/search.type.mjs').SearchResponse} */ (
      await search(searched, {
        ...searchOptions,
        // Build starts only from ready page templates, so it reads search as
        // if a template not ready yet were absent: such a template takes no
        // place, moves no order and adds nothing to the count.
        readyTemplatesOnly: true,
      })
    );
  const results = result.data.results;
  // The TOTAL number of matches, not the number that survived `limit`. The kit
  // below is deliberately small (≤3 pages, ≤5 blocks, ≤6 components) and
  // `results` is itself capped, so every other count here is a cap; this is the
  // one field that says how much the query actually matched.
  const matchCount = result.data.matchCount;

  /**
   * Did this result answer enough of the query to stand as a page on breadth?
   * Single-concept queries have nothing to cover, so they always pass. Coverage
   * stays in a module-private WeakMap and never enters public search/build JSON.
   * @param {object} r
   */
  const covers = r => {
    const coverage = getResultCoverage(r);
    const total = coverage?.total ?? 1;
    if (total <= 1) return true;
    return (coverage?.matched ?? 0) / total >= PAGE_COVERAGE;
  };

  /** @param {SearchResultEntry} r */
  const pageMatch = r =>
    r.domain === 'template' &&
    r.kind !== 'block' &&
    r.score >= PAGE_FLOOR &&
    covers(r);
  const matchedPages = results.filter(pageMatch).slice(0, 3);
  const namedUnready = await namedNotReady(
    query,
    templates.notReadyPages,
    async () =>
      /** @type {import('../../search/search.type.mjs').SearchResponse} */ (
        await search(searched, searchOptions)
      ).data.results,
    pageMatch,
  );
  const searchedBlocks = results.filter(
    r => r.domain === 'template' && r.kind === 'block',
  );
  const blocks = searchedBlocks
    .filter(r => r.score >= DOMAIN_FLOOR)
    .slice(0, 5);
  const always = new Set([...frame, ...foundation]);
  const domain = results
    .filter(
      r =>
        (r.domain === 'component' || r.domain === 'hook') &&
        r.score >= DOMAIN_FLOOR &&
        !always.has(r.name),
    )
    .slice(0, 6);
  const directMatch =
    matchedPages.length > 0 && matchedPages[0].score >= PAGE_DIRECT;

  /**
   * On a loose match, a page entry's `command` previews the layout rather
   * than printing the whole template: `--skeleton` gives the shape without
   * presenting the page as the thing to build. The recommendation itself is
   * `start`, which always scaffolds. Copied rather than mutated: these entries
   * come from `search()` and are not this function's to modify.
   */
  const pages = directMatch
    ? matchedPages
    : matchedPages.map(page => ({
        ...page,
        command: `${page.command} --skeleton`,
      }));

  // The caller's `limit` caps the surfaced kit, even though the search above
  // ran wider to find templates that a flood of doc matches would otherwise
  // bury past the cutoff. Keep pages first, then blocks, then components.
  let budget = limit;
  /**
   * @template T
   * @param {T[]} arr
   * @returns {T[]}
   */
  const toLimit = arr => {
    const out = arr.slice(0, Math.max(0, budget));
    budget -= out.length;
    return out;
  };
  const pagesKept = toLimit(pages);
  const blocksKept = toLimit(blocks);
  const domainKept = toLimit(domain);

  const ranked = wantsPages ? rankPages(query, catalog) : [];
  // A part of a page starts where it lives (spec:AST-048/FR3); the project's
  // own components say what a part is. The search above already gathered them
  // unless it was narrowed to templates.
  const components = wantsPages
    ? (searchedComponents(result) ?? (await loadComponents(cwd)))
    : [];
  const kind = wantsPages ? ideaKind(query, catalog, components) : 'page';
  /** @param {import('../_adapter.mjs').PageTemplate} t */
  const placeOf = t => pageDestination(t.name, cwd);
  const pieceWords = new Set(components.map(c => nameTerms(c).at(-1) ?? ''));
  const chosen = wantsPages
    ? chooseStart(
        ranked,
        kind,
        matchedPages,
        directMatch,
        catalog,
        query,
        placeOf,
        namedUnready,
        pieceWords,
      )
    : null;
  // Name the ranker's next two templates beside the start: the reader judges
  // meaning better than keywords do, and an acceptable template is in these
  // three far more often than it is the start alone.
  // How clearly the pick model prefers the start over the other pages, for a
  // reader that acts on a start only when the choice is clear.
  const fit =
    chosen && chosen.basis !== 'fallback'
      ? pickFit(
          chosen.name,
          query,
          ranked,
          pickStart(ranked, 'page'),
          catalog,
          loadWeights(),
        )
      : null;
  /** @type {Omit<BuildStart, 'isReady'> | null} */
  const picked = chosen && {
    ...chosen,
    ...(fit === null ? {} : {fit}),
    alternatives: pickStartAlternatives(
      ranked,
      kind,
      chosen.name,
      catalog,
      query,
    ).flatMap(r => {
      const t = catalog.find(c => c.name === r.name);
      return t
        ? [{...asTemplate(t, placeOf(t)), isReady: t.isReady !== false}]
        : [];
    }),
  };

  // Analyze what the start template needs that the project lacks (external
  // packages, StyleX compiler). Only the start — alternatives are suggestions,
  // not commitments, so reporting their needs would be noise.
  const startTemplate = picked && catalog.find(t => t.name === picked.name);
  if (picked && startTemplate) {
    const notes = templateSetupNotes(startTemplate, cwd);
    if (notes.length > 0) picked.notes = notes;
  }
  /** @type {BuildStart | null} */
  const start = picked && {
    ...picked,
    isReady: startTemplate?.isReady !== false,
  };

  return {
    // The caller's own words, as search echoes a query; the names read as
    // words are for matching only.
    query: String(query).trim(),
    idea: searched,
    matchCount,
    directMatch,
    start,
    pages: pagesKept,
    blocks: blocksKept,
    domain: domainKept,
    kitBlocks: blocksKept.map(r => r.name),
    frame,
    foundation,
    searched: searchedBlocks.map(blockScore),
    searchedEntries: new Map(
      [...searchedBlocks].reverse().map(r => [r.name, r]),
    ),
    blockText: new Map(
      templates.blocks
        .filter(b => searchedBlocks.some(r => r.name === b.name))
        .map(b => [b.name, `${b.displayName} ${b.description}`]),
    ),
    catalog: templates.blocks,
    components,
    foreign: [
      ...new Set(
        [...blocksKept, ...searchedBlocks, ...templates.blocks]
          .filter(b => b.package !== CORE_PROVIDER_ID)
          .map(b => b.name),
      ),
    ],
  };
}
