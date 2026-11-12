// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for the discover command — dispatcher + barrel.
 *
 * `discover()` browses the integrations a project has and, through discover
 * sources and the official list the CLI carries, the ones it could add. It
 * only reads: the package manager installs.
 * Its job is to resolve the project and its sources (via ./_adapter) and route
 * to the leaf that owns each response shape:
 *
 *   discover                         -> ./list/list.mjs        discover.list
 *   discover <package>[@<version>]   -> ./detail/detail.mjs    discover.detail
 *   discover <package>/<Component>   -> ./detail/doc/doc.mjs   discover.detail.doc
 *   discover <package>/<item>        -> ./detail/item/item.mjs discover.item
 *   discover <words>                 -> ./search/search.mjs    discover.search (always a list)
 *
 * Source results are additive: they ride in `meta.available`/`meta.sources`,
 * in extra fields, or as extra search matches, so every existing field keeps
 * its meaning.
 *
 * @position api/discover — thin router over ./_adapter, ./_catalog-view, and
 *   the discover leaves.
 */

export {OFFICIAL_SOURCE_NAME} from './_adapter.mjs';
import {
  addCommand,
  callSources,
  computerAvailableEntries,
  declaredDependencies,
  describeInstalled,
  discoverPackages,
  findComponent,
  hasSources,
  loadReadKinds,
  officialDeclarations,
  STABLE_KINDS,
  officialFirst,
  officialList,
  withDeclaredOfficial,
} from './_adapter.mjs';
import {
  availableEntries,
  catalogState,
  searchItems,
  withLatest,
} from './_catalog-view.mjs';
import {list} from './list/list.mjs';
import {detail} from './detail/detail.mjs';
import {doc, docFromResult} from './detail/doc/doc.mjs';
import {item} from './detail/item/item.mjs';
import {search} from './search/search.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {levenshteinDistance} from '../../foundation/text/string-utils.mjs';

const DEFAULT_LIMIT = 20;

/**
 * Split a package-shaped query: `name`, `name@version`, or `name/item`, with an
 * optional `@scope/` prefix on the name.
 * @param {string} query
 * @returns {{scoped: boolean, name: string, version?: string, item?: string}}
 */
function splitTarget(query) {
  const scoped = query.startsWith('@');
  const firstSlash = query.indexOf('/');
  let head = query;
  /** @type {string | undefined} */
  let rest;
  const split = scoped
    ? firstSlash < 0
      ? -1
      : query.indexOf('/', firstSlash + 1)
    : firstSlash;
  if (split > 0) {
    head = query.slice(0, split);
    rest = query.slice(split + 1) || undefined;
  }
  const at = head.indexOf('@', 1);
  return {
    scoped,
    name: at > 0 ? head.slice(0, at) : head,
    ...(at > 0 && head.slice(at + 1) ? {version: head.slice(at + 1)} : {}),
    ...(rest ? {item: rest} : {}),
  };
}

/**
 * @param {{type?: unknown, installed?: boolean, available?: boolean, limit?: unknown}} options
 * @param {readonly string[]} kinds the item kinds this project reads
 */
function checkOptions({type, installed, available, limit}, kinds) {
  if (type != null && !kinds.includes(/** @type {string} */ (type))) {
    throw new AstryxError(
      `Unknown --type "${String(type)}"`,
      kinds.map(kind => ({name: kind, reason: 'item kind'})),
      ERROR_CODES.ERR_INVALID_OPTION,
    );
  }
  if (installed && available) {
    throw new AstryxError(
      '--installed and --available cannot be used together',
      undefined,
      ERROR_CODES.ERR_INVALID_OPTION,
    );
  }
  if (
    limit != null &&
    !(typeof limit === 'number' && Number.isInteger(limit) && limit > 0)
  ) {
    throw new AstryxError(
      `--limit must be a positive integer, not "${String(limit)}"`,
      undefined,
      ERROR_CODES.ERR_INVALID_OPTION,
    );
  }
}

/**
 * Items a source lists for a package that look like the one asked for: names
 * that contain it, else the closest few by spelling.
 * @param {import('../../authoring/discover/type.js').DiscoverPackage} entry
 * @param {string} wanted
 * @returns {Array<{name: string, reason: string}>}
 */
function similarItems(entry, wanted) {
  const lower = wanted.toLowerCase();
  const names = [...new Set(entry.contributions.map(c => c.name))];
  const hits = names.filter(name => name.toLowerCase().includes(lower));
  const picked =
    hits.length > 0
      ? hits.slice(0, 5)
      : names
          .map(name => ({
            name,
            distance: levenshteinDistance(lower, name.toLowerCase()),
          }))
          .filter(m => m.distance <= 3)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5)
          .map(m => m.name);
  return picked.map(name => ({
    name: `${entry.package}/${name}`,
    reason: 'similar name',
  }));
}

/**
 * Whether discover answers a query in this project, or answers every query
 * with the list (spec:AST-051 FR1): it answers once the project loads an
 * integration or has a discover source of its own. This is the rule
 * `discover()` applies to the project it loads; the command reads it to keep
 * the list's hints from suggesting queries that only return the list.
 * @param {import('../../foundation/config/project.mjs').Project | undefined} project
 * @returns {boolean}
 */
export function answersQueries(project) {
  return (
    project != null &&
    (project.loadedIntegrations.some(i => !i.__loadError) ||
      hasSources(project))
  );
}

/**
 * @param {string} [query]
 * @param {import('./discover.type.mjs').DiscoverOptions} [options]
 * @returns {Promise<
 *   import('./discover.type.mjs').DiscoverListResponse |
 *   import('./discover.type.mjs').DiscoverDetailResponse |
 *   import('./discover.type.mjs').DiscoverDetailDocResponse |
 *   import('./discover.type.mjs').DiscoverItemResponse |
 *   import('./discover.type.mjs').DiscoverSearchResponse
 * >}
 */
export async function discover(query, options = {}) {
  const {lang = null, zh = false, type, limit} = options;
  // An experimental kind is read only in a project that opts in (spec:AST-017
  // FR27); only then does `--type` take it, or an error name it.
  const kinds =
    options.type != null &&
    !(/** @type {readonly unknown[]} */ (STABLE_KINDS).includes(options.type))
      ? await loadReadKinds()
      : STABLE_KINDS;
  checkOptions(options, kinds);
  const only = options.installed
    ? /** @type {const} */ ('installed')
    : options.available
      ? /** @type {const} */ ('available')
      : undefined;

  const {packages: scanned, configured, project} = await discoverPackages();
  const integrations = await describeInstalled(project, scanned);
  const declared = declaredDependencies(project);
  // The official list is always read, so discover always has a source.
  const official = officialList({project});
  const declarations = officialDeclarations(project, official.packages);
  const add = addCommand(project);
  const addOfficial = addCommand(project, {official: official.packages});
  /** @param {{package: string, official?: true}} pkg */
  const installFor = pkg => (pkg.official ? addOfficial : add)(pkg.package);

  /** @param {{package?: string, version?: string}} [request] */
  const catalogFor = request => callSources(project, request, {official});
  /**
   * What the project has, once a catalog says which official packages it
   * declares.
   * @param {import('./_adapter.mjs').CatalogResult} catalog
   */
  const installedFor = catalog =>
    withDeclaredOfficial(
      project,
      integrations,
      catalog,
      declarations,
      official.packages,
    );

  // No query, or any query in a project that loads no integration and has no
  // discover source of its own: the list (spec:AST-051 FR1).
  if (!query || (integrations.length === 0 && !hasSources(project))) {
    const catalog = await catalogFor();
    const packages = installedFor(catalog);
    // Inside a project, the integrations installed for the computer are
    // available, never loaded (spec AST-081 FR12).
    const computer = await computerAvailableEntries(
      project,
      packages,
      declared,
    );
    const fromSources = officialFirst(
      availableEntries(catalog, packages, declared, {
        officialDeclared: declarations.any,
        install: installFor,
      }),
      official.packages,
      entry => entry.name,
    );
    const named = new Set(fromSources.map(entry => entry.name));
    return list(withLatest(packages, catalog), {
      configured,
      type,
      only,
      available: [
        ...fromSources,
        ...computer.filter(entry => !named.has(entry.name)),
      ],
      sources: catalog.sources,
    });
  }

  // A non-string (truthy) query would crash the parsing below with a raw
  // TypeError (no ERR_* code → downgrades to ERR_UNKNOWN). The CLI only ever
  // passes a string, but the public API must fail with a code.
  if (typeof query !== 'string') {
    throw new AstryxError(
      `Invalid query "${String(query)}"`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }

  const target = splitTarget(query);

  /**
   * One package, one version, or one item, once `target.name` is known to be
   * a package the project or a source has.
   * @param {import('./_adapter.mjs').CatalogResult} catalog
   */
  const packageView = async catalog => {
    const packages = installedFor(catalog);
    const installedNames = new Set(packages.map(p => p.name));
    const entry = catalog.packages.find(p => p.package === target.name);
    const installedAs = entry
      ? catalogState(entry, installedNames, declared, declarations.any)
          .installedAs
      : undefined;
    const isIntegration = integrations.some(p => p.name === target.name);
    // An entry only the official list supplies answers for what it lists.
    // Any other version or item of that package keeps the answer discover
    // gave before the list existed: ERR_UNKNOWN_PACKAGE.
    const officialOnly = entry?.official === true && !isIntegration;
    if (officialOnly && target.version) {
      const local = packages.find(p => p.name === target.name)?.version;
      if (
        target.version !== local &&
        !entry.versions.some(v => v.version === target.version)
      ) {
        throw new AstryxError(
          `${target.name}@${target.version} is not a version discover knows here: ${
            entry.versions.length > 0
              ? `it knows ${entry.versions.map(v => v.version).join(', ')}`
              : 'it knows no version of it for this project'
          }. Other versions are on the package registry.`,
          [...new Set([...entry.versions.map(v => v.version), local])]
            .filter(v => v != null)
            .map(v => ({
              name: `${target.name}@${v}`,
              reason: 'version discover knows',
            })),
          ERROR_CODES.ERR_UNKNOWN_PACKAGE,
        );
      }
    }
    const context = {
      catalog: entry,
      version: target.version,
      // Only an entry the official list supplied gets a pinned version.
      add: entry?.official ? addOfficial : add,
      installedAs,
    };
    if (!target.item) return detail(packages, target.name, context);
    const found = item(packages, target.name, target.item, context);
    if (found) return found;
    // An installed icon set that was withdrawn answers nothing; say why
    // rather than that the package has no such item (spec:AST-084 FR17).
    const gone = packages
      .find(p => p.name === target.name)
      ?.withdrawnIconSets?.find(each => each.name === target.item);
    if (gone) {
      throw new AstryxError(
        `Icon set "${target.item}" in ${target.name} is installed but withdrawn: ${gone.reason}`,
        [],
        ERROR_CODES.ERR_UNKNOWN_COMPONENT,
      );
    }
    if (officialOnly) {
      throw new AstryxError(
        `"${target.item}" not found in ${target.name}`,
        similarItems(entry, target.item),
        ERROR_CODES.ERR_UNKNOWN_PACKAGE,
      );
    }
    // Only an installed package has docs to fall back to. For one that is
    // only in a source, the item is what is unknown, not the package.
    if (entry && !isIntegration) {
      throw new AstryxError(
        `"${target.item}" not found in ${target.name}`,
        similarItems(entry, target.item),
        ERROR_CODES.ERR_UNKNOWN_COMPONENT,
      );
    }
    return await doc(integrations, target.name, target.item, {lang, zh});
  };

  // An installed component keeps resolving to its full doc, before any source
  // is asked anything.
  const installedPkg = integrations.find(p => p.name === target.name);
  if (installedPkg && target.item && !target.version) {
    const resolved = findComponent([installedPkg], target.item);
    if (resolved) return await docFromResult(resolved, {lang, zh});
  }

  if (target.scoped) {
    return await packageView(
      await catalogFor({package: target.name, version: target.version}),
    );
  }

  const listing = await catalogFor();
  const isPackage =
    installedPkg != null ||
    listing.packages.some(p => p.package === target.name);
  if (isPackage && (target.version || target.item || target.name === query)) {
    return await packageView(
      await catalogFor({package: target.name, version: target.version}),
    );
  }

  const packages = installedFor(listing);
  return await search(packages, query, {
    items: searchItems(packages, listing, declared, declarations.any),
    type,
    only,
    limit: limit ?? DEFAULT_LIMIT,
  });
}
