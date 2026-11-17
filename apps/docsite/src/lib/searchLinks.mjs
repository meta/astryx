// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where a search result opens on the site.
 * @input A result of the CLI's search (`search()` from `@astryxdesign/cli/api`)
 *   and the site's link tables, built with the site by searchLinkTables().
 * @output The site destination each result opens, plus the title and category
 *   of a registered document destination.
 * @position Shared by scripts/generate-data.mjs (builds the tables) and the
 *   site's search API (reads them). Plain JS so both can import it.
 *
 * The CLI answers with docs-tree routes and section keys, but the site shows
 * each root namespace as one page with anchors, folds some topics into
 * another page, and redirects old slugs (scripts/docs-pages.mjs). So a doc
 * result opens through the pages and redirects the site generated, never by
 * building `/docs/<route>`.
 */

import {exampleAnchorId} from './exampleAnchor.mjs';

/**
 * @typedef {object} SearchLinkTables
 * @property {string[]} pages - Every doc page slug.
 * @property {Record<string, string>} redirects - Slug -> where its text is shown.
 * @property {Record<string, string>} anchors - `<guide slug>#<section key>`
 *   (or `<page>#<section key>`) -> the path of that section, with its anchor.
 * @property {string[]} components - Component and hook names with a page.
 * @property {string[]} templates - Page template slugs with a page.
 * @property {Record<string, string>} blocks - Block name -> the page that shows it.
 * @property {Record<string, string>} titles - A doc page's path, or a
 *   section's path with its anchor, -> the title the site shows for it.
 * @property {Record<string, string>} categories - A doc page's path, or a
 *   section's path with its anchor, -> the registry category of that page.
 */

/**
 * The anchor ids of a page's sections, as the page's outline builds them.
 * @callback SectionAnchors
 * @param {Array<{title: string, content?: unknown[]}>} sections
 * @returns {string[]}
 */

/**
 * The tables a result's link is read from.
 * @param {object} site
 * @param {Array<{topic: string, title?: string, category?: string | null, sections?: Array<{id?: string, title: string}>}>} site.docTopics
 * @param {Record<string, string>} site.docRedirects
 * @param {string[]} site.components
 * @param {string[]} site.templates
 * @param {Array<{name: string, dirName: string, exampleFor: string | null, isShowcase?: boolean}>} site.blocks
 * @param {string[]} site.packagePages - Slugs of package pages (`cli` for
 *   @astryxdesign/cli), which /docs/<slug> also serves.
 * @param {SectionAnchors} site.sectionAnchors
 * @returns {SearchLinkTables}
 */
export function searchLinkTables(site) {
  /** @type {Record<string, string>} */
  const anchors = {};
  /** @type {Record<string, string>} */
  const titles = {};
  /** @type {Record<string, string>} */
  const categories = {};
  // A namespace page (and a merged page) holds the sections of several
  // guides, and a section key is unique only within its guide. Each guide's
  // slug redirects to its first section, so the redirects give each guide's
  // range of sections on the page: a section is keyed by the guide that owns
  // it, `<guide slug>#<section key>`, the way search names it.
  /** @type {Map<string, Array<[number, string]>>} page -> [first section index, guide slug] */
  const starts = new Map();
  const pageAnchors = new Map(
    site.docTopics.map(page => [
      page.topic,
      site.sectionAnchors(/** @type {any} */ (page.sections ?? [])),
    ]),
  );
  for (const [slug, target] of Object.entries(site.docRedirects)) {
    const match = /^\/docs\/([^#]+)#(.+)$/.exec(target);
    if (!match) continue;
    const index = pageAnchors.get(match[1])?.indexOf(match[2]) ?? -1;
    if (index < 0) continue;
    if (!starts.has(match[1])) starts.set(match[1], []);
    starts.get(match[1])?.push([index, slug]);
  }
  for (const page of site.docTopics) {
    const ids = pageAnchors.get(page.topic) ?? [];
    const guides = (starts.get(page.topic) ?? []).sort((a, b) => a[0] - b[0]);
    const pageHref = `/docs/${page.topic}`;
    titles[pageHref] = page.title ?? page.topic;
    if (page.category) categories[pageHref] = page.category;
    (page.sections ?? []).forEach((section, i) => {
      const sectionHref = `${pageHref}#${ids[i]}`;
      titles[sectionHref] = `${page.title ?? page.topic} › ${section.title}`;
      if (page.category) categories[sectionHref] = page.category;
      if (!section.id) return;
      // The guides whose range holds this section: the latest start at or
      // before it (two slugs can share a start: a namespace with no text of
      // its own and its first guide).
      const at = guides.filter(([start]) => start <= i);
      const owner = at.length ? at[at.length - 1][0] : -1;
      const keys = [
        `${page.topic}#${section.id}`,
        ...at
          .filter(([start]) => start === owner)
          .map(([, slug]) => `${slug}#${section.id}`),
      ];
      for (const key of keys) {
        if (!Object.hasOwn(anchors, key))
          anchors[key] = `/docs/${page.topic}#${ids[i]}`;
      }
    });
  }
  const components = new Set(site.components);
  const templates = new Set(site.templates);
  /** @type {Record<string, string>} */
  const blocks = {};
  for (const block of site.blocks) {
    const owner = block.exampleFor;
    const href =
      owner && components.has(owner)
        ? block.isShowcase
          ? `/components/${owner}`
          : `/components/${owner}#${exampleAnchorId(block.dirName)}`
        : owner && templates.has(owner)
          ? `/templates/${owner}`
          : null;
    // Search names a block by its file name, which a Core block's dirName is.
    if (href)
      for (const name of [block.dirName, block.name]) blocks[name] ??= href;
  }
  return {
    pages: [
      ...new Set([
        ...site.docTopics.map(page => page.topic),
        ...site.packagePages,
      ]),
    ].sort(),
    redirects: site.docRedirects,
    anchors,
    components: [...components].sort(),
    templates: [...templates].sort(),
    blocks,
    titles,
    categories,
  };
}

/** @type {WeakMap<SearchLinkTables, {pages: Set<string>, components: Set<string>, templates: Set<string>}>} */
const sets = new WeakMap();

/** @param {SearchLinkTables} tables */
function setsOf(tables) {
  let hit = sets.get(tables);
  if (!hit) {
    hit = {
      pages: new Set(tables.pages),
      components: new Set(tables.components),
      templates: new Set(tables.templates),
    };
    sets.set(tables, hit);
  }
  return hit;
}

/**
 * The page a docs-tree route or topic opens: its own page, the page a
 * redirect shows it on, else the nearest route above it that has one.
 * @param {string} route
 * @param {SearchLinkTables} tables
 * @returns {string}
 */
function docPage(route, tables) {
  const {pages} = setsOf(tables);
  for (let at = route; at; at = at.slice(0, Math.max(0, at.lastIndexOf('/')))) {
    const slug = at.replaceAll('/', '-');
    if (pages.has(slug)) return `/docs/${slug}`;
    if (Object.hasOwn(tables.redirects, slug)) return tables.redirects[slug];
  }
  return '/docs';
}

/**
 * The site path a search result opens.
 * @param {{domain: string, name: string, package?: string, section?: string, kind?: string}} result
 * @param {SearchLinkTables} tables
 * @returns {string}
 */
export function searchResultHref(result, tables) {
  const {components, templates} = setsOf(tables);
  switch (result.domain) {
    case 'component':
    case 'hook':
      return components.has(result.name)
        ? `/components/${result.name}`
        : '/components';
    case 'template':
      if (result.kind === 'block') {
        // A Core block's page is keyed by its name; an integration's by
        // `<package>-<name>`, as the site names its folder.
        for (const key of [
          result.name,
          `${result.package ?? ''}-${result.name}`.replace(
            /[^a-zA-Z0-9_-]/g,
            '-',
          ),
        ]) {
          if (Object.hasOwn(tables.blocks, key)) return tables.blocks[key];
        }
        return '/templates';
      }
      return templates.has(result.name)
        ? `/templates/${result.name}`
        : '/templates';
    case 'theme':
      return '/themes';
    case 'doc': {
      if (result.section) {
        // The section where its own guide shows it, else on its page.
        const own = `${result.name.replaceAll('/', '-')}#${result.section}`;
        if (Object.hasOwn(tables.anchors, own)) return tables.anchors[own];
      }
      const page = docPage(result.name, tables);
      if (!result.section) return page;
      const slug = page.replace(/^\/docs\/?/, '').replace(/#.*$/, '');
      const key = `${slug}#${result.section}`;
      return Object.hasOwn(tables.anchors, key) ? tables.anchors[key] : page;
    }
    default:
      return '/';
  }
}

/**
 * The title the site shows for a doc result: the title of the page, and of
 * the section, its link opens, as the sidebar and page outline name them.
 * Other results keep the CLI's name.
 * @param {{domain: string, name: string, section?: string, title?: string}} result
 * @param {string} href - searchResultHref of the result.
 * @param {SearchLinkTables} tables
 * @returns {string | undefined}
 */
export function searchResultTitle(result, href, tables) {
  if (result.domain !== 'doc') return undefined;
  // The page, or the page and section, the result's link opens.
  if (Object.hasOwn(tables.titles, href)) return tables.titles[href];
  // A doc with no page of its own (an API or command reference) keeps the
  // CLI's title, without the docs tree's placeholder level for unfiled docs.
  return result.title?.replace(/^Unorganized › /, '');
}

/**
 * The registry category of the page a doc result opens. Results without a
 * Docsite page have no category, so presentation can use a deterministic
 * fallback without inventing taxonomy for a registered page.
 * @param {{domain: string}} result
 * @param {string} href - searchResultHref of the result.
 * @param {SearchLinkTables} tables
 * @returns {string | undefined}
 */
export function searchResultCategory(result, href, tables) {
  if (result.domain !== 'doc') return undefined;
  return tables.categories[href];
}
