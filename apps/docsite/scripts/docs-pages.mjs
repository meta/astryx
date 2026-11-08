// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs-pages.mjs
 *
 * How the CLI's docs become docsite pages. The CLI splits a long topic into a
 * docs-tree namespace of short guides, so an agent can read one guide at a
 * time. A human reader keeps one full page per topic, at the same URL and in
 * the same sidebar spot, whatever the split.
 *
 * @input A docs reader with the CLI docs API's shape
 *   (`docs(topic, section, options)` from `@astryxdesign/cli/api`) and the
 *   flat topics the site already built.
 * @output Doc pages ({topic, title, description, category, sections}) and
 *   redirects from each guide's own slug to its section on the full page.
 * @position Used by generate-data.mjs; tested on its own with a fake reader.
 */

/**
 * Root namespaces that have no page of their own at their slug: /docs/cli is
 * the @astryxdesign/cli package page. Their pages are listed in
 * GUIDE_NAMESPACE_PAGES; a guide below them that no such page holds keeps a
 * page of its own.
 */
export const GUIDE_PAGE_NAMESPACES = new Set(['cli']);

/**
 * The pages a root namespace in GUIDE_PAGE_NAMESPACES shows besides one page
 * per guide: each is one full page of the namespace at `route` (minus the
 * routes in `except`, which another page holds), at `slug`, so every guide
 * slug below it redirects to its section there. `aliases` are older slugs
 * that redirect to the page. The integration guides that `cli` once held as
 * two such pages now sit under `authoring`, an ordinary root namespace.
 * @type {Map<string, Array<{route: string, slug: string, title: string, except?: string[], aliases?: string[]}>>}
 */
export const GUIDE_NAMESPACE_PAGES = new Map();

/**
 * Older slugs of a root namespace's page, which redirect to it: global mode
 * was `cli/global`, and before that the `cli/install-once` guide; the
 * integration guides were the CLI Integrations page before `authoring` took
 * them.
 * @type {Map<string, string[]>}
 */
export const ROOT_PAGE_ALIASES = new Map([
  ['global', ['cli-global', 'cli-install-once']],
  ['authoring', ['cli-integrations', 'cli-integrations-overview']],
]);

/**
 * Older guide slugs of a root namespace, from before its guides moved there:
 * the integration guides were `cli/integrations/…` (/docs/cli-integrations-…)
 * before `authoring` took them, and the Writing docs page and one older alias
 * pointed into them. Each opens where its guide's new slug does.
 * @type {Map<string, {prefix: string, pages: Record<string, string>}>}
 */
export const MOVED_GUIDE_SLUGS = new Map([
  [
    'authoring',
    {
      prefix: 'cli-integrations',
      pages: {
        'cli-writing-docs': 'authoring-building-blocks-docs',
        'cli-integrations-docs-add-a-topic':
          'authoring-building-blocks-docs-add-a-topic',
      },
    },
  ],
]);

/**
 * Redirects for a root namespace's older guide slugs (MOVED_GUIDE_SLUGS),
 * read off the redirects its page made for the guides' new slugs.
 * @param {string} root
 * @param {Record<string, string>} redirects the page's redirects
 * @returns {Record<string, string>}
 */
export function movedGuideRedirects(root, redirects) {
  const moved = MOVED_GUIDE_SLUGS.get(root);
  if (!moved) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [slug, href] of Object.entries(redirects)) {
    if (slug.startsWith(`${root}-`)) {
      out[`${moved.prefix}-${slug.slice(root.length + 1)}`] = href;
    }
  }
  for (const [old, now] of Object.entries(moved.pages)) {
    if (Object.hasOwn(redirects, now)) out[old] = redirects[now];
  }
  return out;
}

/**
 * Flat topics whose full text the site shows on another topic's page. The
 * theme split (before namespaces) left `theme` as a short overview and moved
 * its text to two flat topics, so the theme page shows those two in order in
 * place of the overview's pointers to them.
 */
export const MERGED_TOPICS = new Map([
  ['theme', ['use-a-theme', 'author-a-theme']],
]);

/**
 * Flat topics that are data for other docs, not pages: `token-tables` is what
 * token references read, and the tokens page already shows every table.
 */
export const DATA_ONLY_TOPICS = new Map([['token-tables', 'tokens']]);

/**
 * Anchor ids of a page's sections, the way ReferenceDocView's outline builds
 * them: the slug of each title, numbered on repeats, with heading blocks
 * taking their own ids in between.
 * @param {Array<{title: string, content?: Array<{type?: string, text?: string}>}>} sections
 * @returns {string[]}
 */
export function sectionAnchors(sections) {
  const seen = new Map();
  const unique = (value, fallback) => {
    const base =
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || fallback;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
  return sections.map(section => {
    const id = unique(section.title, 'section');
    for (const block of section.content ?? []) {
      if (block?.type === 'heading' && block.text) {
        unique(`${section.title} ${block.text}`, `${id}-heading`);
      }
    }
    return id;
  });
}

/** A docs-tree route as a site slug: `layout/scaffold` is `layout-scaffold`. */
export const routeSlug = route => route.replaceAll('/', '-');

/**
 * The docsite renders token tables itself, so a resolved token reference is
 * not copied into the registry.
 * @param {any[]} sections
 */
export function withoutResolvedTokens(sections) {
  return sections.map(section => ({
    ...section,
    content: (section.content ?? []).map(block => {
      if (block?.type !== 'token-ref') return block;
      const {resolved: _resolved, ...authored} = block;
      return authored;
    }),
  }));
}

/**
 * Doc text with its CLI commands shown the way a reader runs them. Docs write
 * commands as bare `astryx ...`; the CLI prefixes them when it prints a doc,
 * and the docsite does the same with its own door name. `show(text, lang)`
 * prefixes the commands in one piece of text: prose and list items (`lang`
 * null), or one code block's body in its language. A table cell that is a
 * whole command is prefixed too, the way `astryx docs` prints it.
 * @param {any[]} sections
 * @param {(text: string, lang?: string | null) => string} show
 * @param {string} stem the invocation `show` prefixes with
 */
export function withCliCommands(sections, show, stem) {
  /** @param {string} cell */
  const cell = cell =>
    /^astryx(\s|$)/.test(cell ?? '')
      ? `${stem}${cell.slice('astryx'.length)}`
      : show(cell ?? '');
  return sections.map(section => ({
    ...section,
    content: (section.content ?? []).map(block => {
      switch (block?.type) {
        case 'prose':
        case 'heading':
          return {...block, text: show(block.text ?? '')};
        case 'code':
          return {...block, code: show(block.code ?? '', block.lang ?? '')};
        case 'list':
          return {...block, items: (block.items ?? []).map(item => show(item))};
        case 'table':
          return {...block, rows: (block.rows ?? []).map(row => row.map(cell))};
        default:
          return block;
      }
    }),
  }));
}

/**
 * The sidebar group of a namespace page: the namespace's own category when it
 * declares one, otherwise `foundations` when every guide under it is a
 * foundations doc, otherwise `guide`.
 * @param {string | null | undefined} own
 * @param {Array<string | null | undefined>} guideCategories
 */
export function namespaceCategory(own, guideCategories) {
  if (own) return own;
  return guideCategories.length > 0 &&
    guideCategories.every(category => category === 'foundations')
    ? 'foundations'
    : 'guide';
}

/**
 * One full page for a namespace: every guide under it, compiled in tree
 * order, as `astryx docs <route> --depth all --detail full` reads it. Each
 * guide and nested namespace keeps its slug as a redirect to where its text
 * starts on the page. Typed docs (commands, API docs) open only in
 * `astryx docs` and add nothing to the page.
 *
 * A namespace with no guide placed under it (a generated topic level, Guides
 * or Foundations, whose children are flat topics with pages of their own) has
 * no page.
 * @param {(topic?: string, section?: string, options?: object) => Promise<any>} readDocs
 * @param {string} route
 * @param {{slug?: string, title?: string, except?: string[], aliases?: string[]}} [options]
 *   the page's slug and title when they are not the route's, routes below it
 *   that another page holds, and older slugs that redirect to it
 * @returns {Promise<{page: object, redirects: Record<string, string>} | null>}
 */
export async function namespacePage(readDocs, route, options = {}) {
  const {slug = route, title, except = [], aliases = []} = options;
  const excluded = child =>
    except.some(skip => child === skip || child.startsWith(`${skip}/`));
  const read = await readDocs(route, undefined, {depth: 'all', detail: 'full'});
  if (read?.type !== 'docs.node' || read.data.kind !== 'namespace') return null;
  const node = read.data;
  const sections = [];
  /** @type {Array<[string, number]>} slug and index of its first section */
  const starts = [];
  const guideCategories = [];
  if (node.content?.length > 0) {
    sections.push({title: 'Overview', content: node.content});
  }
  const walk = async slots => {
    for (const slot of slots ?? []) {
      for (const child of slot.children) {
        if (!child.route.startsWith(`${route}/`)) continue;
        if (excluded(child.route)) continue;
        if (child.kind === 'generic') {
          const detail = await readDocs(child.route);
          guideCategories.push(detail?.data?.category ?? null);
          starts.push([routeSlug(child.route), sections.length]);
          sections.push(...withoutResolvedTokens(child.sections ?? []));
        } else if (child.kind === 'namespace') {
          starts.push([routeSlug(child.route), sections.length]);
          if (child.content?.length > 0) {
            sections.push({title: child.title, content: child.content});
          }
          await walk(child.slots);
        }
      }
    }
  };
  await walk(node.slots);
  if (guideCategories.length === 0) return null;

  const anchors = sectionAnchors(sections);
  const href = `/docs/${slug}`;
  const redirects = {};
  for (const [guideSlug, index] of starts) {
    redirects[guideSlug] =
      index < sections.length ? `${href}#${anchors[index]}` : href;
  }
  for (const alias of [routeSlug(route), ...aliases]) {
    if (alias !== slug) redirects[alias] = href;
  }
  return {
    page: {
      topic: slug,
      title: title || node.title || route,
      description: node.summary || '',
      category: namespaceCategory(node.category, guideCategories),
      sections,
    },
    redirects,
  };
}

/**
 * Apply MERGED_TOPICS and DATA_ONLY_TOPICS to the flat topics: a merged
 * topic's sections move onto its host page and its slug redirects there; a
 * data-only topic has no page. A host or part that is missing is skipped, so
 * the rule holds before and after the split that created it.
 * @param {Array<{topic: string, sections: any[]}>} topics
 * @returns {{topics: any[], redirects: Record<string, string>}}
 */
export function mergeFlatTopics(topics) {
  const bySlug = new Map(topics.map(topic => [topic.topic, topic]));
  const redirects = {};
  const dropped = new Set();
  for (const [host, parts] of MERGED_TOPICS) {
    const page = bySlug.get(host);
    const present = parts.filter(part => bySlug.has(part));
    if (!page || present.length === 0) continue;
    const sections = [];
    const starts = [];
    for (const part of present) {
      starts.push([part, sections.length]);
      sections.push(...bySlug.get(part).sections);
      dropped.add(part);
    }
    page.sections = sections;
    const anchors = sectionAnchors(sections);
    for (const [part, index] of starts) {
      redirects[part] = `/docs/${host}#${anchors[index]}`;
    }
  }
  for (const [topic, host] of DATA_ONLY_TOPICS) {
    if (!bySlug.has(topic)) continue;
    dropped.add(topic);
    redirects[topic] = `/docs/${host}`;
  }
  return {topics: topics.filter(topic => !dropped.has(topic.topic)), redirects};
}
