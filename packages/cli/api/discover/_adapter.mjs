// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared adapter for the discover leaves: the one place discover reaches
 * the environment.
 *
 * Every `discover.*` leaf projects already-resolved data into a typed response;
 * none of them touch the integration system, the filesystem, or a source. This
 * adapter does: it resolves the project's installed integrations and what each
 * one adds, calls every discover source and keeps a saved copy of each answer,
 * reads the official list the CLI carries after them,
 * locates and loads a component's doc, and names the package manager's add
 * command. Keeping that I/O here (INV21) is what lets `list`, `detail`,
 * `detail/doc`, `detail/item`, and `search` stay pure projections.
 *
 * @position api/discover — orchestration over foundation/config/project,
 *   foundation/integrations, the discovery loaders, and discover sources.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Project,
  availableComputerIntegrations,
} from '../../foundation/config/project.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {projectAddCommand} from '../../foundation/release/notices.mjs';
import {hostedRun} from '../../foundation/runtime/package-root.mjs';
import {scanAllPackages, findComponentInPackages} from './_package-scanner.mjs';
import {loadDocs} from '../../foundation/discovery/component-loader.mjs';
import {collectIdentities} from '../../foundation/integrations/contribution-inventory.mjs';
import {discoverIntegrationIconSets} from '../../foundation/discovery/icon-set-discovery.mjs';
import {detectPackageManager} from '../../foundation/env/package-manager.mjs';
import {isValidSemver, semverCompare} from '../../foundation/env/semver.mjs';
import {assertWithin} from '../../foundation/fs/path-safety.mjs';
import {userCacheDir} from '../../foundation/env/user-dirs.mjs';
import {CLI_ROOT, findInstalledPackage} from '../../foundation/fs/paths.mjs';
import {
  DISCOVER_KINDS,
  parseDiscoverCatalog,
} from '../../authoring/discover/parse.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

const SOURCE_TIMEOUT_MS = 30_000;

/** The name the official list goes by, as a source and on each of its entries. */
export const OFFICIAL_SOURCE_NAME = 'Astryx';

/** Where the official list comes from: the CLI package that carries it. */
const OFFICIAL_SOURCE_FROM = '@astryxdesign/cli';

/** The official list, generated from the repository when the CLI is built. */
export const OFFICIAL_LIST_FILE = path.join(
  CLI_ROOT,
  'assets',
  'discover',
  'official-packages.json',
);

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

/**
 * @typedef {import('./_package-scanner.mjs').ScannedPackage} ScannedPackage
 * @typedef {import('../../authoring/discover/type').DiscoverPackage} DiscoverPackage
 * @typedef {import('../../authoring/discover/type').DiscoverSource} DiscoverSource
 */

/**
 * An official package as this CLI lists it (spec:AST-051 FR11), with what its
 * add command pins (FR2): the project's Core version, the Core range the
 * project declares, or the latest release; with none, it pins nothing.
 * @typedef {DiscoverPackage & {pin?: string}} OfficialPackage
 */

/**
 * The official packages the project's package.json declares: the real package
 * name of each, mapped to the name it is installed under (an npm alias such as
 * `"my-theme": "npm:@astryxdesign/theme-gothic@0.7.0"` installs under
 * `my-theme`). `dependency` holds those declared in dependencies,
 * devDependencies or optionalDependencies, which make a package the project's
 * own; `any` adds peerDependencies, which only keep it from being offered.
 * @typedef {{dependency: Map<string, string>, any: Set<string>}} OfficialDeclarations
 */

/**
 * The official list as this CLI reads it. `error` says why the file could not
 * be read; the list is then empty and discover reports it like a failed source.
 * @typedef {{packages: OfficialPackage[], error?: string}} OfficialList
 */

/**
 * An installed integration with what it adds, per kind. `components` is the
 * scanned component list the discover leaves have always used.
 * @typedef {ScannedPackage & {
 *   templates?: string[],
 *   docs?: string[],
 *   themes?: string[],
 *   codemods?: string[],
 *   iconSets?: string[],
 *   iconSetDetails?: IconSetSummary[],
 *   withdrawnIconSets?: Array<{name: string, reason: string}>,
 * }} InstalledPackage
 */

/**
 * What discover shows about one installed icon set (spec:AST-084 FR17).
 * @typedef {object} IconSetSummary
 * @property {string} name
 * @property {string} displayName
 * @property {string} description
 * @property {string} license
 * @property {number} iconCount
 * @property {{variant?: string}} [default]
 * @property {string[]} definitions the icon definitions its `map` covers
 */

/**
 * What one source did on this run.
 * @typedef {object} SourceState
 * @property {string} name the source's own name, or where it came from when it
 *   gave none
 * @property {string} from `astryx.config`, the integration that exports it, or
 *   `@astryxdesign/cli` for the official list
 * @property {'fresh' | 'saved' | 'failed'} status
 * @property {string} [generatedAt]
 * @property {boolean} [complete]
 * @property {string} [savedAt] when the saved copy in use was written
 * @property {string} [error] why the live call failed
 */

/**
 * Everything every source returned, merged, the official list last. When two
 * sources list the same package, the earlier source's entry is kept. `official`
 * marks an entry the official list supplied.
 * @typedef {{sources: SourceState[], packages: Array<DiscoverPackage & {source: string, official?: true}>}} CatalogResult
 */

/**
 * A located component doc within a scanned package — the shape returned by
 * {@link findComponent}, consumed by {@link loadValidatedDoc}.
 * @typedef {{pkg: ScannedPackage, docPath: string, componentName: string}} ComponentResolution
 */

/**
 * Validate the loose shape of a loaded docs object. Returns an error string
 * describing the first problem, or `null` when the docs are usable.
 * @param {unknown} docs
 * @returns {string | null}
 */
function validateDocs(docs) {
  if (!docs || typeof docs !== 'object')
    return 'docs export is missing or not an object';
  const d = /** @type {Record<string, any>} */ (docs);
  if (typeof d.name !== 'string' || !d.name)
    return 'docs.name is missing or not a string';
  if (!d.usage || typeof d.usage.description !== 'string')
    return 'docs.usage.description is missing or not a string';
  if (d.props && !Array.isArray(d.props)) return 'docs.props must be an array';
  if (d.components && !Array.isArray(d.components))
    return 'docs.components must be an array';
  if (d.usage?.bestPractices && !Array.isArray(d.usage.bestPractices))
    return 'docs.usage.bestPractices must be an array';
  return null;
}

/**
 * Discover the configured external packages for the current project.
 *
 * External packages come from configured integrations that declare a components
 * root; each becomes a scannable package keyed by its docsDir. `configured`
 * reports whether the project configured ANY integration — including one whose
 * manifest failed to load, which contributes nothing but is emphatically not
 * "nothing configured". It lets an empty result distinguish "nothing
 * configured" (`false`) from "configured but nothing discovered" (`true`),
 * which the list leaf surfaces as `meta`.
 *
 * @returns {Promise<{packages: ScannedPackage[], configured: boolean, project: Project}>}
 */
export async function discoverPackages() {
  const project = await Project.load();
  const loadedIntegrations =
    /** @type {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} */ (
      project.loadedIntegrations
    );

  const explicitPackages = loadedIntegrations
    .filter(integration => integration.components)
    .map(integration => ({
      name: integration.name,
      version: integration.version,
      category: integration.name,
      docsDir: integration.components,
    }));
  if (explicitPackages.length === 0) {
    return {packages: [], configured: loadedIntegrations.length > 0, project};
  }

  const packages = scanAllPackages(
    [],
    /** @type {ScannedPackage[]} */ (/** @type {unknown} */ (explicitPackages)),
  );
  return {packages, configured: true, project};
}

/**
 * Every integration the project loads, with what it adds. An integration with
 * no components root is included with `components: []`; one that failed to
 * load is left out (the integration-issues nudge and Doctor report it).
 *
 * @param {Project | undefined} project
 * @param {ScannedPackage[]} scanned the packages {@link discoverPackages} found
 * @returns {Promise<InstalledPackage[]>}
 */
export async function describeInstalled(project, scanned) {
  if (project == null) return scanned;
  const byName = new Map(scanned.map(pkg => [pkg.name, pkg]));
  /** @type {InstalledPackage[]} */
  const installed = [];
  for (const integration of project.loadedIntegrations) {
    if (integration.__loadError) continue;
    const base =
      byName.get(integration.name) ??
      /** @type {ScannedPackage} */ (
        /** @type {unknown} */ ({
          name: integration.name,
          category: integration.name,
          version: integration.version,
          components: [],
        })
      );
    // Components come from the scan above; loading every component doc again
    // here would only slow the list down.
    // Icon sets are read below, only with the opt-in.
    const {identities} = await collectIdentities({
      ...integration,
      components: undefined,
      iconSets: undefined,
    });
    // Icon sets are listed the way every icon surface sees them: a set that
    // is invalid or whose module does not resolve answers nothing (FR9).
    // They are experimental (spec:AST-017 FR27), so discover lists them only
    // in a project that opts in with `experimental.iconSet`.
    const {sets, withdrawn} = optedIntoIconSets(project)
      ? discoverIntegrationIconSets(integration, {projectDir: project.cwd})
      : {sets: [], withdrawn: []};
    installed.push({
      ...base,
      templates: identities.templates.map(t => t.id),
      docs: identities.docs,
      themes: identities.themes.map(t => t.slug),
      codemods: identities.codemods.map(c => `${c.version}/${c.id}`),
      iconSets: sets.map(set => set.name),
      iconSetDetails: sets.map(set => ({
        name: set.name,
        displayName: set.displayName,
        description: set.description,
        license: set.license,
        iconCount: set.data.icons.length,
        ...(set.data.default ? {default: set.data.default} : {}),
        definitions: [...Object.keys(set.data.map ?? {})].sort(),
      })),
      // Never listed; named only to say why a lookup of one answers nothing.
      ...(withdrawn.length > 0
        ? {
            withdrawnIconSets: withdrawn.map(each => ({
              name: each.name,
              reason: each.reason,
            })),
          }
        : {}),
    });
  }
  return installed;
}

/**
 * Whether the project has any discover source: its own `discover` config field,
 * or an integration's `discover` named export (valid or not).
 * @param {Project | undefined} project
 * @returns {boolean}
 */
export function hasSources(project) {
  if (doorSources().length > 0) return true;
  if (project == null) return false;
  if (typeof project.config?.discover === 'function') return true;
  return project.loadedIntegrations.some(
    i => i.__discover != null || i.__discoverError != null,
  );
}

/** Where a discover source a host passed comes from (spec AST-081 FR1). */
const DOOR_SOURCE = 'the host';

/**
 * The discover sources the host that started this run passed, if any.
 * @returns {readonly DiscoverSource[]}
 */
function doorSources() {
  return /** @type {readonly DiscoverSource[]} */ (
    hostedRun()?.discoverSources ?? []
  );
}

/** The source name of a package installed for the computer. */
const COMPUTER_SOURCE = 'installed for this computer';

/**
 * The integrations installed for the computer that a project could add, as
 * available entries with the project's install command (spec AST-081 FR12).
 * Empty outside a project, where they load instead.
 * @param {Project | undefined} project
 * @param {Array<{name: string}>} installed
 * @param {Set<string>} declared
 * @returns {Promise<import('./discover.type.mjs').DiscoverAvailableEntry[]>}
 */
export async function computerAvailableEntries(project, installed, declared) {
  const cwd = project?.cwd ?? process.cwd();
  if (isOutsideProject(cwd)) return [];
  // The same command doctor names: in the project spec:AST-040 FR9 defines,
  // and none where FR9 finds no project.
  const add = projectAddCommand(cwd);
  const have = new Set([...installed.map(pkg => pkg.name), ...declared]);
  return (await availableComputerIntegrations(cwd, have)).map(c => ({
    name: c.name,
    package: c.name,
    components: [],
    ...(c.version ? {version: c.version} : {}),
    ...(c.description ? {description: c.description} : {}),
    source: COMPUTER_SOURCE,
    ...(add ? {install: add(c.name)} : {}),
  }));
}

/**
 * Package names the project's package.json declares in any dependency field.
 * @param {Project | undefined} project
 * @returns {Set<string>}
 */
export function declaredDependencies(project) {
  /** @type {Set<string>} */
  const names = new Set();
  if (project == null) return names;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(project.cwd, 'package.json'), 'utf8'),
    );
    for (const field of DEPENDENCY_FIELDS) {
      for (const name of Object.keys(pkg?.[field] ?? {})) names.add(name);
    }
  } catch {
    // No readable package.json: nothing is declared.
  }
  return names;
}

/**
 * The nearest package.json at or above the project's folder, read. Discover
 * runs from any folder of a project; this is the project's own manifest.
 * @param {Project | undefined} project
 * @returns {{dir: string, pkg: Record<string, any>} | null}
 */
function nearestManifest(project) {
  let dir = project?.cwd ?? process.cwd();
  for (;;) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      try {
        return {dir, pkg: JSON.parse(fs.readFileSync(file, 'utf8'))};
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The fields that make a declared package the project's own. */
const OWN_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];

/**
 * The package a dependency entry installs: its own name, or the target of an
 * npm alias (`npm:<name>@<range>`).
 * @param {string} name
 * @param {unknown} spec
 * @returns {string}
 */
function declaredPackage(name, spec) {
  if (typeof spec !== 'string' || !spec.startsWith('npm:')) return name;
  const target = spec.slice('npm:'.length);
  const at = target.indexOf('@', 1);
  return at > 0 ? target.slice(0, at) : target;
}

/**
 * What the project's own package.json, the nearest one above the folder
 * discover runs in, declares among the official packages.
 * @param {Project | undefined} project
 * @param {OfficialPackage[]} official
 * @returns {OfficialDeclarations}
 */
export function officialDeclarations(project, official) {
  const names = new Set(official.map(pkg => pkg.package));
  /** @type {OfficialDeclarations} */
  const declared = {dependency: new Map(), any: new Set()};
  const manifest = nearestManifest(project);
  if (manifest == null) return declared;
  for (const field of DEPENDENCY_FIELDS) {
    for (const [local, spec] of Object.entries(manifest.pkg?.[field] ?? {})) {
      const real = declaredPackage(local, spec);
      if (!names.has(real)) continue;
      declared.any.add(real);
      if (
        OWN_DEPENDENCY_FIELDS.includes(field) &&
        !declared.dependency.has(real)
      )
        declared.dependency.set(real, local);
    }
  }
  return declared;
}

/**
 * One part of a semver range: an optional comparator and a version that may
 * use `x` or `*` wildcards.
 */
const RANGE_PART =
  /^(?:[<>]=?|=|\^|~)?v?(?:\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

/**
 * Whether a dependency spec is a semver range every supported package manager
 * resolves: comparators, wildcards, `||` and hyphen ranges. A dist-tag, path,
 * URL, alias or workspace protocol is not.
 * @param {string} spec
 * @returns {boolean}
 */
function isSemverRange(spec) {
  const parts = spec
    .trim()
    .split(/\s*\|\|\s*|\s+/u)
    .filter(part => part !== '-');
  return parts.length > 0 && parts.every(part => RANGE_PART.test(part));
}

/**
 * The project's Core: the installed copy's version, else what its own
 * package.json declares (a fresh clone before install): an exact `version`, or
 * a semver `range`. Neither, for a declaration no package manager can pin
 * against, such as a path or a dist-tag. Null when the project has no Core.
 * @param {Project | undefined} project
 * @returns {{version?: string, range?: string} | null}
 */
function projectCore(project) {
  const installed = installedVersion(project, '@astryxdesign/core');
  if (installed) return {version: installed};
  const manifest = nearestManifest(project);
  for (const field of OWN_DEPENDENCY_FIELDS) {
    const spec = manifest?.pkg?.[field]?.['@astryxdesign/core'];
    if (typeof spec !== 'string') continue;
    // A space after an operator (`~ 0.6.8`, `>= 0.6.8 < 0.7.0`) is allowed by
    // node-semver; join each operator to its version before reading the spec.
    const range = spec.trim().replace(/([<>]=?|=|\^|~)\s+/gu, '$1');
    const exact = range.replace(/^=/u, '');
    if (isValidSemver(exact)) return {version: exact};
    return isSemverRange(range) ? {range} : {};
  }
  return null;
}

/**
 * Newest first: by release number, then a release before its prereleases.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function newerFirst(a, b) {
  const byNumber = semverCompare(b, a);
  if (byNumber !== 0) return byNumber;
  const aRelease = !a.includes('-');
  if (aRelease !== !b.includes('-')) return aRelease ? -1 : 1;
  return b.localeCompare(a, 'en', {numeric: true});
}

/**
 * The command that adds a package with the project's package manager. Discover
 * only prints it; it never runs it. Asked for one version, it adds that
 * version. Given the official list, it otherwise pins an official package to
 * what its entry names (spec:AST-051 FR2): the project's Core version or
 * declared Core range, else the latest release. A range is quoted, because
 * `^`, `<`, `>`, `|` and spaces mean something to a shell.
 * @param {Project | undefined} project
 * @param {{official?: OfficialPackage[]}} [options]
 * @returns {(name: string, version?: string) => string}
 */
export function addCommand(project, {official = []} = {}) {
  const pm = detectPackageManager(project?.cwd ?? process.cwd());
  const verb =
    pm === 'pnpm'
      ? 'pnpm add'
      : pm === 'yarn'
        ? 'yarn add'
        : pm === 'bun'
          ? 'bun add'
          : 'npm install';
  const byName = new Map(official.map(pkg => [pkg.package, pkg]));
  return (name, version) => {
    if (version) return `${verb} ${name}@${version}`;
    const pin = byName.get(name)?.pin;
    if (!pin) return `${verb} ${name}`;
    return isValidSemver(pin)
      ? `${verb} ${name}@${pin}`
      : `${verb} "${name}@${pin}"`;
  };
}

/**
 * The per-user cache directory the saved copies live in, never inside a
 * project. Standard platform locations only.
 * @returns {string}
 */
export function defaultCacheDir() {
  return userCacheDir();
}

/**
 * @param {string} cacheDir
 * @param {string} from the source's key: its `from` label, with the host for
 *   a host's source
 * @param {{package?: string, version?: string}} request
 */
function savedCopyPath(cacheDir, from, request) {
  const key = createHash('sha256')
    .update(`${from}\n${request.package ?? ''}\n${request.version ?? ''}`)
    .digest('hex')
    .slice(0, 32);
  const dir = path.join(cacheDir, 'discover');
  return assertWithin(`${key}.json`, dir, {label: 'discover saved copy'});
}

/**
 * @param {string} file
 * @param {string} label
 * @param {boolean} iconSets the project opts into icon sets
 */
function readSavedCopy(file, label, iconSets) {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      savedAt: String(saved.savedAt),
      catalog: parseDiscoverCatalog(saved.catalog, label, {iconSets}),
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} file
 * @param {import('../../authoring/discover/type').DiscoverCatalog} catalog
 */
function writeSavedCopy(file, catalog) {
  try {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({savedAt: new Date().toISOString(), catalog}),
    );
    fs.renameSync(tmp, file);
  } catch {
    // An unwritable cache only costs the offline copy.
  }
}

/**
 * @param {DiscoverSource} source
 * @param {{package?: string, version?: string}} request
 * @param {string} label
 * @param {number} timeoutMs
 * @param {boolean} iconSets the project opts into icon sets
 */
async function callSource(source, request, label, timeoutMs, iconSets) {
  const controller = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new Error(`${label} did not answer within ${timeoutMs / 1000} seconds`),
      );
    }, timeoutMs);
  });
  try {
    const answer = await Promise.race([
      Promise.resolve().then(() =>
        source({signal: controller.signal, ...request}),
      ),
      timedOut,
    ]);
    return parseDiscoverCatalog(answer, label, {iconSets});
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the discover sources — the project's `discover` first, then each
 * integration's in load order, then each a host passed, named as the host's
 * (spec AST-081 FR1, AST-051 FR6) — once per distinct function. A source that
 * throws, times out, or returns an invalid catalog falls back to its saved copy;
 * with none, it is reported and adds nothing. The others always count.
 *
 * @param {Project | undefined} project
 * @param {{package?: string, version?: string}} [request] ask for one package,
 *   and optionally one version's contributions
 * @param {{cacheDir?: string, timeoutMs?: number}} [options]
 * @returns {Promise<CatalogResult>}
 */
async function callOwnSources(project, request = {}, options = {}) {
  const {cacheDir = defaultCacheDir(), timeoutMs = SOURCE_TIMEOUT_MS} = options;
  /** @type {CatalogResult} */
  const result = {sources: [], packages: []};
  const fromDoor = doorSources();
  if (project == null && fromDoor.length === 0) return result;
  // Without the opt-in, icon-set items and fields are unknown before the
  // catalog is checked, so one cannot fail a source (spec:AST-051 FR7).
  const iconSets = optedIntoIconSets(project);

  /** @type {Array<{from: string, key?: string, source?: DiscoverSource, error?: string}>} */
  const origins = [];
  if (typeof project?.config?.discover === 'function') {
    origins.push({from: 'astryx.config', source: project.config.discover});
  }
  for (const integration of project?.loadedIntegrations ?? []) {
    if (integration.__discoverError) {
      origins.push({
        from: integration.name,
        error: integration.__discoverError,
      });
    } else if (integration.__discover) {
      origins.push({from: integration.name, source: integration.__discover});
    }
  }
  // Every tool that carries the CLI reports its sources as the host's, so
  // their saved copies are kept per host, by the root that holds its CLI
  // (spec:AST-051 FR8).
  const host = hostedRun()?.startingRoot ?? '';
  fromDoor.forEach((source, index) => {
    const from =
      fromDoor.length === 1 ? DOOR_SOURCE : `${DOOR_SOURCE} (${index + 1})`;
    origins.push({from, key: `${from}\n${host}`, source});
  });

  /** @type {Set<unknown>} */
  const called = new Set();
  /** @type {Set<string>} */
  const seen = new Set();
  const ask = request.package
    ? {
        package: request.package,
        ...(request.version ? {version: request.version} : {}),
      }
    : {};
  for (const {from, key = from, source, error} of origins) {
    if (source == null) {
      result.sources.push({name: from, from, status: 'failed', error});
      continue;
    }
    if (called.has(source)) continue;
    called.add(source);

    const label = `the discover source from ${from}`;
    const file = savedCopyPath(cacheDir, key, ask);
    /** @type {import('../../authoring/discover/type').DiscoverCatalog} */
    let catalog;
    try {
      catalog = await callSource(source, ask, label, timeoutMs, iconSets);
      writeSavedCopy(file, catalog);
      result.sources.push({
        name: catalog.source.name,
        from,
        status: 'fresh',
        generatedAt: catalog.source.generatedAt,
        complete: catalog.source.complete,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const saved = readSavedCopy(file, label, iconSets);
      if (saved == null) {
        result.sources.push({
          name: from,
          from,
          status: 'failed',
          error: message,
        });
        continue;
      }
      catalog = saved.catalog;
      result.sources.push({
        name: catalog.source.name,
        from,
        status: 'saved',
        generatedAt: catalog.source.generatedAt,
        complete: catalog.source.complete,
        savedAt: saved.savedAt,
        error: message,
      });
    }
    for (const pkg of catalog.packages) {
      if (seen.has(pkg.package)) continue;
      seen.add(pkg.package);
      result.packages.push({...pkg, source: catalog.source.name});
    }
  }
  return result;
}

/**
 * Call every discover source (see {@link callOwnSources}), then read the
 * official list (spec:AST-051 FR11). The list comes last, so a source keeps
 * its entry for an official package, or for any package of the same
 * integration (FR7); the list adds the official packages no source covers.
 * The result stays in source order; discover puts official packages first
 * only where it shows them ({@link officialFirst}).
 *
 * @param {Project | undefined} project
 * @param {{package?: string, version?: string}} [request]
 * @param {{cacheDir?: string, timeoutMs?: number, official?: OfficialList}} [options]
 *   `official`: the list {@link officialList} read; read here when absent
 * @returns {Promise<CatalogResult>}
 */
export async function callSources(project, request = {}, options = {}) {
  const {official = officialList({project}), ...rest} = options;
  const own = await callOwnSources(project, request, rest);
  // A source's entry wins for its package and for the integration it
  // publishes under any name (FR7), so a fork or mirror keeps its place.
  const seen = new Set(
    own.packages.flatMap(pkg => [pkg.package, pkg.integration, ...pkg.aliases]),
  );
  /** @type {CatalogResult['packages']} */
  const added = [];
  for (const {pin: _pin, ...pkg} of official.packages) {
    if (seen.has(pkg.package)) continue;
    if (request.package && pkg.package !== request.package) continue;
    added.push({...pkg, source: OFFICIAL_SOURCE_NAME, official: true});
  }
  return {
    sources: [
      ...own.sources,
      official.error
        ? {
            name: OFFICIAL_SOURCE_NAME,
            from: OFFICIAL_SOURCE_FROM,
            status: 'failed',
            error: official.error,
          }
        : {
            name: OFFICIAL_SOURCE_NAME,
            from: OFFICIAL_SOURCE_FROM,
            status: 'fresh',
            complete: true,
          },
    ],
    // Source order: the first entry per integration is the one discover
    // keeps. Official packages are put first only where discover shows them.
    // An experimental kind is a kind this project does not read unless it
    // opts in, so its items are ignored like any unknown kind (FR7).
    packages: withoutUnreadKinds(project, [...own.packages, ...added]),
  };
}

/**
 * The experimental item kinds a catalog may list (spec:AST-017 FR27):
 * `icon-set`, read only in a project that sets `experimental.iconSet`.
 */
export const EXPERIMENTAL_KINDS = /** @type {const} */ (['icon-set']);

/** The item kinds every project reads: the catalog kinds, less experimental ones. */
export const STABLE_KINDS = DISCOVER_KINDS.filter(
  kind =>
    !(/** @type {readonly string[]} */ (EXPERIMENTAL_KINDS).includes(kind)),
);

/**
 * The item kinds discover reads in the project at the working directory, or
 * the stable kinds when it cannot be read.
 * @returns {Promise<readonly string[]>}
 */
export async function loadReadKinds() {
  return readKinds(await Project.load().catch(() => undefined));
}

/**
 * The item kinds discover reads in this project: every stable kind, and the
 * experimental ones when the project opts in.
 * @param {Project | undefined} project
 * @returns {readonly string[]}
 */
export function readKinds(project) {
  return optedIntoIconSets(project) ? DISCOVER_KINDS : STABLE_KINDS;
}

/**
 * Whether the project opts into icon sets with `experimental.iconSet`.
 * @param {Project | undefined} project
 */
export function optedIntoIconSets(project) {
  return Boolean(project?.config?.experimental?.iconSet);
}

/**
 * @template {{contributions: Array<{kind: string}>}} P
 * @param {Project | undefined} project
 * @param {P[]} packages
 * @returns {P[]}
 */
function withoutUnreadKinds(project, packages) {
  if (optedIntoIconSets(project)) return packages;
  const kinds = readKinds(project);
  return packages.map(pkg => ({
    ...pkg,
    contributions: pkg.contributions.filter(c => kinds.includes(c.kind)),
  }));
}

/**
 * Official packages first, in the official list's order; the rest keep theirs.
 * @template T
 * @param {T[]} items
 * @param {OfficialPackage[]} official
 * @param {(item: T) => string} nameOf
 * @returns {T[]}
 */
export function officialFirst(items, official, nameOf) {
  const order = new Map(official.map((pkg, index) => [pkg.package, index]));
  const rank = (/** @type {T} */ item) => order.get(nameOf(item)) ?? order.size;
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/**
 * The official list this CLI carries (spec:AST-051 FR11). The file holds no
 * versions; each entry takes them from this CLI and the project:
 *
 * - Its latest release is the newest release this CLI knows: its own version
 *   on a release CLI, or the project's Core version when that is a newer
 *   release.
 * - A package released with Core lists a release CLI's own version and the
 *   project's Core version (installed, else declared exactly), so each,
 *   the latest release included, can be looked up. Its add command pins the project's Core version, else the Core range
 *   the project declares, else the latest release; nothing on a canary CLI in
 *   a project with no Core, which may have been published without it.
 * - A canary-only package is listed only by a canary CLI, as a prerelease at
 *   the project's Core version when that is a prerelease, else at the CLI's
 *   own version when the project has no Core. It is not listed beside a
 *   released or declared Core, which it cannot be installed with.
 *
 * @param {{file?: string, version?: string, project?: Project}} [options] the
 *   list file and the CLI version to read it for, both defaulting to this
 *   CLI's own, and the project whose Core decides the versions
 * @returns {OfficialList}
 */
export function officialList({
  file = OFFICIAL_LIST_FILE,
  version,
  project,
} = {}) {
  try {
    const cli = version ?? packageVersion(CLI_ROOT);
    if (cli == null) throw new Error('the CLI package names no version');
    const core = project == null ? null : projectCore(project);
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    const canaryCli = /-canary\./u.test(cli);
    /** @type {(v: string | undefined) => v is string} */
    const isRelease = v => v != null && !v.includes('-');
    const latest =
      [cli, core?.version].filter(isRelease).sort(newerFirst)[0] ?? null;
    /** @type {OfficialPackage[]} */
    const packages = [];
    for (const pkg of list.packages) {
      /** @type {string[]} */
      let listed = [];
      /** @type {string | null} */
      let entryLatest = null;
      /** @type {string | undefined} */
      let pin;
      if (pkg.canaryOnly === true) {
        if (!canaryCli) continue;
        if (core == null) pin = cli;
        else if (core.version && !isRelease(core.version)) pin = core.version;
        else continue;
        listed = [pin];
      } else if (pkg.releasedWithCore === true) {
        entryLatest = latest;
        listed = [
          ...new Set(
            [isRelease(cli) ? cli : undefined, core?.version].filter(
              /** @returns {v is string} */ v => v != null,
            ),
          ),
        ].sort(newerFirst);
        // The project's Core version, else the plain range it declares, else
        // the latest release (spec:AST-051 FR11): a Core declared as
        // `workspace:*`, a `file:` path or a dist-tag, and not installed,
        // still gets a pin.
        pin =
          core == null
            ? canaryCli
              ? undefined
              : cli
            : (core.version ?? core.range ?? entryLatest ?? undefined);
      }
      packages.push({
        package: pkg.package,
        integration: pkg.package,
        aliases: [],
        ...(pkg.description ? {description: pkg.description} : {}),
        latest: entryLatest,
        versions: listed.map(v => ({
          version: v,
          publishedAt: null,
          prerelease: v.includes('-'),
          status: 'ok',
        })),
        contributions: pkg.contributions,
        ...(pin ? {pin} : {}),
      });
    }
    return {packages};
  } catch (err) {
    return {
      packages: [],
      error: `the official list could not be read (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

/**
 * What the project has: its installed integrations plus each official package
 * its own package.json declares as a dependency whose entry the official list
 * supplied, official packages first. A declared official package that a source
 * lists stays as that source shows it (FR7). One that failed to load as an
 * integration stays out. A declared one takes what it adds from the list and
 * its version from the copy the project installed, under an npm alias too.
 *
 * @param {Project | undefined} project
 * @param {InstalledPackage[]} installed from {@link describeInstalled}
 * @param {CatalogResult} catalog
 * @param {OfficialDeclarations} declared from {@link officialDeclarations}
 * @param {OfficialPackage[]} official the official list, for the order
 * @returns {Array<InstalledPackage & {declaredOfficial?: true}>}
 */
export function withDeclaredOfficial(
  project,
  installed,
  catalog,
  declared,
  official,
) {
  const loaded = new Set(project?.loadedIntegrations.map(i => i.name) ?? []);
  /** @type {Array<InstalledPackage & {declaredOfficial?: true}>} */
  const added = [];
  for (const pkg of catalog.packages) {
    const local = declared.dependency.get(pkg.package);
    if (!pkg.official || local == null || loaded.has(pkg.package)) continue;
    const version = installedVersion(project, local);
    added.push(
      /** @type {InstalledPackage & {declaredOfficial: true}} */ (
        /** @type {unknown} */ ({
          name: pkg.package,
          category: pkg.package,
          ...(version ? {version} : {}),
          ...(pkg.description ? {description: pkg.description} : {}),
          ...itemLists(pkg.contributions),
          declaredOfficial: true,
        })
      ),
    );
  }
  return officialFirst([...installed, ...added], official, pkg => pkg.name);
}

/**
 * Group contributions into the entry fields, one list per kind that has any.
 * `components` is always present, like on a scanned package.
 * @param {DiscoverPackage['contributions']} contributions
 * @returns {Record<string, string[]>}
 */
function itemLists(contributions) {
  /** @type {Record<string, string[]>} */
  const lists = {components: []};
  for (const [kind, field] of KIND_FIELDS) {
    const names = contributions.filter(c => c.kind === kind).map(c => c.name);
    if (names.length > 0) lists[field] = names;
  }
  return lists;
}

/**
 * The version in a package directory's package.json, if it names one.
 * @param {string} dir
 * @returns {string | undefined}
 */
function packageVersion(dir) {
  try {
    const {version} = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    return typeof version === 'string' && version ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The version of `name` the project installed, if it installed it.
 * @param {Project | undefined} project
 * @param {string} name
 * @returns {string | undefined}
 */
function installedVersion(project, name) {
  const dir = findInstalledPackage(project?.cwd ?? process.cwd(), name);
  return dir == null ? undefined : packageVersion(dir);
}

/** The list and detail entry fields for each item kind, in display order. */
export const KIND_FIELDS = /** @type {const} */ ([
  ['component', 'components'],
  ['template', 'templates'],
  ['doc', 'docs'],
  ['theme', 'themes'],
  ['codemod', 'codemods'],
  ['agent-doc', 'agentDocs'],
  ['icon-set', 'iconSets'],
]);

/**
 * Project a scanned or installed package into the discover list/detail entry
 * shape. Shared by the list and detail leaves so the entry keys (and their
 * order) stay in one place. A kind list appears only when it is not empty.
 * @param {InstalledPackage & {latest?: string}} pkg
 * @returns {import('./discover.type.mjs').DiscoverListEntry}
 */
export function toEntry(pkg) {
  /** @type {Record<string, unknown>} */
  const entry = {
    name: pkg.name,
    package: pkg.name,
    category: pkg.category,
    components: pkg.components,
    version: pkg.version,
    description: pkg.description,
    displayName: pkg.displayName,
  };
  for (const [, field] of KIND_FIELDS) {
    if (field === 'components') continue;
    const values = /** @type {Record<string, unknown>} */ (pkg)[field];
    if (Array.isArray(values) && values.length > 0) entry[field] = values;
  }
  if (pkg.latest) entry.latest = pkg.latest;
  return /** @type {import('./discover.type.mjs').DiscoverListEntry} */ (entry);
}

/**
 * Locate a component's doc file within the given packages (case-insensitive).
 * @param {ScannedPackage[]} packages
 * @param {string} name
 * @returns {ComponentResolution | null}
 */
export function findComponent(packages, name) {
  return findComponentInPackages(packages, name);
}

/**
 * Load and validate a resolved component's docs. Throws AstryxError
 * (ERR_INVALID_DOC) when the file fails to load or the docs are malformed.
 * Returns the (optionally translated) docs object itself; leaves wrap it in the
 * `discover.detail.doc` envelope.
 * @param {ComponentResolution} result
 * @param {{lang?: string | null, zh?: boolean}} opts
 * @returns {Promise<import('./discover.type.mjs').DiscoverDetailDocResponse['data']>}
 */
export async function loadValidatedDoc(result, {lang, zh}) {
  let docs;
  try {
    docs = await loadDocs(
      result.docPath,
      /** @type {{zh?: boolean, dense?: boolean, lang?: string}} */ ({
        zh,
        lang,
      }),
    );
  } catch (e) {
    throw new AstryxError(
      `Failed to load docs for ${result.componentName}: ${/** @type {any} */ (e).message}`,
      undefined,
      ERROR_CODES.ERR_INVALID_DOC,
    );
  }
  const err = validateDocs(docs);
  if (err)
    throw new AstryxError(
      `Invalid docs for ${result.componentName}: ${err}`,
      undefined,
      ERROR_CODES.ERR_INVALID_DOC,
    );
  return docs;
}
