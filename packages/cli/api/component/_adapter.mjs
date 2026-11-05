// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared resolver for the `component` command leaves.
 *
 * @input  a component name (+ cwd / package scope) and doc-load options
 * @output resolved subjects the leaves project into their one `{type, data}`
 *         envelope — owners across core/integration, the scoped/legacy/fuzzy
 *         resolution, and the doc-loading / prop-extraction / ownership shaping
 * @position api/component (internal; NOT a response-type leaf, not exported
 *           from ./api). Every view of a component agrees because it resolves
 *           the subject HERE once; the leaves never re-resolve or do I/O of
 *           their own beyond fetching their single subject.
 *
 * This is a PURE REORG of the resolution that used to be inlined (and
 * duplicated across branches) in component.mjs: the core/external/scoped/
 * integration lookup, ambiguity handling, and fuzzy search now live here,
 * deduped, so each leaf stays a thin projection.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  requireCoreDir as requireAnswerCoreDir,
  discoverExternalPackages,
} from '../../foundation/fs/paths.mjs';
import {
  CORE_PACKAGE,
  discoverComponents,
  docStem,
  findComponentReadme,
  findComponentSource,
  findExternalComponentDoc,
  findIntegrationComponent,
  integrationMemberEntry,
  isIntegrationMember,
  recordedDocName,
  resolveImportPath,
  resolveIntegrationImportPath as resolveIntegrationImport,
  unscopedComponentOwners,
} from '../../foundation/discovery/component-discovery.mjs';
import {Project} from '../../foundation/config/project.mjs';
import {loadComponentDoc as loadValidatedComponentDoc} from '../../foundation/discovery/component-loader.mjs';
import {resolveComponentReplacements} from '../../foundation/discovery/component-replacement.mjs';
import {searchComponents} from '../../foundation/text/string-utils.mjs';
import {
  rankComponentSuggestions,
  synonymMatches,
} from '../../foundation/text/suggest-order.mjs';
import {AstryxError, coreDirOrThrow} from '../error.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {
  componentLinkProvider,
  linkComponentDoc,
  loadDocsCatalog,
} from '../docs/_adapter.mjs';

/** How far below the first suggestion's score a later one may be. */
const NEAR_FIRST = 10;

/** @type {Record<string, {synonyms?: string[]}> | undefined} */
let cards;
/**
 * Search's component cards (each component's other names), read once.
 * @returns {Record<string, {synonyms?: string[]}>}
 */
function searchCards() {
  if (!cards) {
    try {
      cards = JSON.parse(
        fs.readFileSync(
          new URL('../search/_cards.json', import.meta.url),
          'utf8',
        ),
      );
    } catch {
      cards = {};
    }
  }
  return /** @type {Record<string, {synonyms?: string[]}>} */ (cards);
}

export {CORE_PACKAGE, unscopedComponentOwners};

/**
 * A loaded component doc. The shared validated loader accepts stamped and legacy
 * component docs; this loose view captures the fields the API reads across both.
 * @typedef {object} LoadedComponentDoc
 * @property {string} [name]
 * @property {string} [description]
 * @property {any[]} [props]
 * @property {any[]} [components]
 * @property {{description?: string}} [usage]
 * @property {any} [theming]
 * @property {string} [import] set when the doc states its own import specifier
 */

/**
 * Options object for the shared component-doc loader.
 * @typedef {{zh?: boolean, dense?: boolean, lang?: string}} LoadDocsOpts
 */

/**
 * An OWNER package that provides a component with a given name: the doc/source
 * paths and the issues URL a later integration-component swizzle needs.
 * @typedef {object} ComponentOwner
 * @property {string} package
 * @property {string} docPath
 * @property {string|null} sourcePath
 * @property {string|undefined} issuesUrl
 * @property {import('../../foundation/integrations/integrations.mjs').LoadedIntegration|null} integration
 * @property {import('../../foundation/discovery/component-discovery.mjs').NameHold} hold
 *   how the owner holds the name, for the owner rule
 */

/**
 * What ownership shaping needs from an owner. The core and legacy-external
 * paths synthesize a bare `{package, sourcePath}` rather than resolving a full
 * {@link ComponentOwner}, so everything past those two is optional here.
 * @typedef {Partial<ComponentOwner> & {package: string, sourcePath: string|null}} OwnershipSubject
 */

/**
 * A back-compat external package discovered via `pkg.astryx.docs`.
 * @typedef {{name: string, category: string, docsDir: string}} ExternalPackageRef
 */

/**
 * The outcome of scoping a lookup to a specific `--package`.
 * @typedef {(
 *   | {kind: 'core', owner: ComponentOwner}
 *   | {kind: 'integration', owner: ComponentOwner}
 *   | {kind: 'legacy', ext: ExternalPackageRef}
 * )} ScopeResolution
 */

/**
 * The result of resolving a bare (unscoped) name to a doc: which file, under
 * which resolved name/owner, and where its swizzleable source lives.
 * @typedef {object} ResolvedUnscopedDoc
 * @property {string} readmePath
 * @property {string} resolvedName
 * @property {string} resolvedOwnerPackage
 * @property {string|null} resolvedSourcePath
 */

/**
 * Locate `@astryxdesign/core`, throwing the stable not-found error when absent.
 * @param {string} cwd
 * @returns {string}
 */
export function requireCoreDir(cwd) {
  return coreDirOrThrow(requireAnswerCoreDir, cwd);
}

/**
 * Load the configured integrations for `cwd`, swallowing any config errors so
 * component discovery never hard-fails on a malformed/absent integration. An
 * empty list means "core only".
 * @param {string} cwd
 * @returns {Promise<import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]>}
 */
export async function loadIntegrationsSafely(cwd) {
  try {
    const project = await Project.load(cwd);
    return /** @type {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} */ (
      project.loadedIntegrations
    );
  } catch {
    return [];
  }
}

/**
 * Every component replacement the loaded integrations declare
 * (spec:AST-035 FR10–FR15): the active one for each replaced Core component,
 * and the findings Doctor reports. With no Core directory, only the opt-in
 * and value findings are computed.
 * @param {string|null} coreDir
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} loadedIntegrations
 * @returns {Promise<import('../../foundation/discovery/component-replacement.mjs').ComponentReplacements>}
 */
export function loadComponentReplacements(coreDir, loadedIntegrations) {
  return resolveComponentReplacements(coreDir, loadedIntegrations);
}

/**
 * The integration component that answers to the Core component name
 * `dirName` for unqualified lookup, or undefined when none replaces it.
 * @param {string} coreDir
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} loadedIntegrations
 * @param {string} dirName
 * @returns {Promise<import('../../foundation/discovery/component-replacement.mjs').ActiveComponentReplacement | undefined>}
 */
export async function resolveComponentReplacement(
  coreDir,
  loadedIntegrations,
  dirName,
) {
  if (loadedIntegrations.length === 0) return undefined;
  return (
    await resolveComponentReplacements(coreDir, loadedIntegrations)
  ).forTarget(dirName);
}

/**
 * Resolve a loaded integration by package name.
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} loadedIntegrations
 * @param {string} packageName
 * @returns {import('../../foundation/integrations/integrations.mjs').LoadedIntegration|null}
 */
function findLoadedIntegration(loadedIntegrations, packageName) {
  return loadedIntegrations.find(i => i.name === packageName) ?? null;
}

/**
 * Read the exact installed version available to a package-qualified component
 * selector. Legacy docs packages do not expose a reliable version here, so a
 * version-qualified lookup never falls through to them.
 * @param {string} coreDir
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} loadedIntegrations
 * @param {string} packageName
 * @returns {string|null}
 */
export function installedComponentPackageVersion(
  coreDir,
  loadedIntegrations,
  packageName,
) {
  if (packageName === CORE_PACKAGE) {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(coreDir, 'package.json'), 'utf8'),
      );
      return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
      return null;
    }
  }
  const integration = findLoadedIntegration(loadedIntegrations, packageName);
  return typeof integration?.version === 'string' ? integration.version : null;
}

/**
 * Resolve an external package by name from the discovered externals list.
 * @param {string} packageName - e.g. '@acme/xds-widgets'
 * @param {string} cwd
 * @returns {ExternalPackageRef | null}
 */
function resolveExternalPackage(packageName, cwd) {
  const externals = discoverExternalPackages(cwd);
  return externals.find(ext => ext.name === packageName) ?? null;
}

/**
 * Build the set of OWNER packages that provide a component with this name
 * across core + every loaded integration. This is what lets the CLI
 * disambiguate by package and expose the owner's source + issuesUrl.
 * @param {string} coreDir
 * @param {string} dirName - bare component name (no `XDS` prefix)
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} loadedIntegrations
 * @returns {ComponentOwner[]}
 */
export function resolveOwners(coreDir, dirName, loadedIntegrations) {
  const coreDocPath = findComponentReadme(coreDir, dirName);
  /** @type {ComponentOwner[]} */
  const owners = [];
  if (coreDocPath) {
    owners.push({
      package: CORE_PACKAGE,
      docPath: coreDocPath,
      sourcePath: findComponentSource(coreDir, dirName),
      issuesUrl: undefined,
      integration: null,
      hold: 'core',
    });
  }
  for (const integration of loadedIntegrations) {
    const found = findIntegrationComponent(integration, dirName);
    if (!found) continue;
    owners.push({
      package: integration.name,
      docPath: found.docPath,
      sourcePath: found.sourcePath,
      issuesUrl: integration.issuesUrl,
      integration,
      hold: found.hold,
    });
  }
  return owners;
}

/**
 * Classify a `--package`-scoped lookup. Searches the scoped package first so a
 * component that exists in both core and an external package (e.g. AppShell,
 * Button, SideNav) resolves to the package the caller asked for.
 * @param {string} packageScope
 * @param {{owners: ComponentOwner[], loadedIntegrations: import('../../foundation/integrations/integrations.mjs').LoadedIntegration[], cwd: string, name: string}} ctx
 * @returns {ScopeResolution}
 */
export function classifyScope(
  packageScope,
  {owners, loadedIntegrations, cwd, name},
) {
  // Core scope: resolve from core directly.
  if (packageScope === CORE_PACKAGE) {
    const owner = owners.find(o => o.package === CORE_PACKAGE);
    if (!owner) {
      throw new AstryxError(
        `No component "${name}" in package "${packageScope}"`,
        undefined,
        ERROR_CODES.ERR_UNKNOWN_COMPONENT,
      );
    }
    return {kind: 'core', owner};
  }

  // Integration scope (authoritative): resolve from the loaded integration.
  const integration = findLoadedIntegration(loadedIntegrations, packageScope);
  if (integration) {
    const owner = owners.find(o => o.package === packageScope);
    if (!owner) {
      throw new AstryxError(
        `No component "${name}" in package "${packageScope}"`,
        undefined,
        ERROR_CODES.ERR_UNKNOWN_COMPONENT,
      );
    }
    return {kind: 'integration', owner};
  }

  // Legacy fallback: node_modules `pkg.astryx.docs` external package.
  const ext = resolveExternalPackage(packageScope, cwd);
  if (!ext) {
    throw new AstryxError(
      `External package "${packageScope}" not found`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_PACKAGE,
    );
  }
  return {kind: 'legacy', ext};
}

/**
 * Internal ambiguity marker. Single-component callers still receive the same
 * AstryxError code, message, and suggestions; batch callers can additionally
 * project every installed candidate without parsing prose.
 */
export class ComponentAmbiguityError extends AstryxError {
  /** @type {import('./component.type.mjs').ComponentBatchCandidate[]} */
  candidates;

  /**
   * @param {ComponentOwner[]} owners
   * @param {string} dirName
   */
  constructor(owners, dirName) {
    super(
      `Component "${dirName}" is provided by multiple packages. Re-run with --package <pkg> to choose one.`,
      owners.map(o => ({name: o.package, reason: 'provides this component'})),
      ERROR_CODES.ERR_AMBIGUOUS_COMPONENT,
    );
    this.candidates = owners.map(owner => ({
      package: owner.package,
      component: dirName,
      kind: 'component',
      installed: true,
    }));
  }
}

/**
 * Refuse to guess when the name is owned by MORE THAN ONE package (core and/or
 * integrations) and the caller did not scope with --package. Legacy
 * `pkg.astryx.docs` externals are intentionally NOT part of this ambiguity set.
 * @param {ComponentOwner[]} owners
 * @param {string} dirName
 * @returns {void}
 */
export function assertUnambiguousOwners(owners, dirName) {
  if (owners.length > 1) {
    throw new ComponentAmbiguityError(owners, dirName);
  }
}

/**
 * Resolve a legacy external package's doc file for `dirName`, or null when the
 * package ships no `.doc.mjs` for it.
 * @param {ExternalPackageRef} ext
 * @param {string} dirName
 * @returns {string | null}
 */
export function resolveLegacyExternalDoc(ext, dirName) {
  const extDocPath = findExternalComponentDoc(ext.docsDir, dirName);
  return extDocPath && extDocPath.endsWith('.doc.mjs') ? extDocPath : null;
}

/**
 * Whether a legacy external package documents `dirName`.
 * @param {string} cwd
 * @param {string} dirName
 * @returns {boolean}
 */
export function legacyExternalDocuments(cwd, dirName) {
  return discoverExternalPackages(cwd).some(
    ext => resolveLegacyExternalDoc(ext, dirName) != null,
  );
}

/**
 * Whether a legacy docs package keeps `dirName` over these owners, each of which
 * holds it only as an export a doc records.
 * @param {string} cwd
 * @param {string} dirName
 * @param {Array<{hold?: string, docPath?: string | null}>} owners
 * @returns {boolean}
 */
export function legacyExternalKeeps(cwd, dirName, owners) {
  return (
    owners.length > 0 &&
    owners.every(
      owner =>
        owner.hold === 'doc' &&
        owner.docPath != null &&
        docStem(owner.docPath).toLowerCase() !== dirName.toLowerCase(),
    ) &&
    legacyExternalDocuments(cwd, dirName)
  );
}

/**
 * The core source file for `dirName` (the no-scope `--source` path reads core
 * directly — it does NOT fall back to externals or fuzzy search).
 * @param {string} coreDir
 * @param {string} dirName
 * @returns {string | null}
 */
export function resolveCoreSourcePath(coreDir, dirName) {
  return findComponentSource(coreDir, dirName);
}

/**
 * Resolve a bare (unscoped) name to a `.doc.mjs`: core first, then back-compat
 * externals, then a conservative fuzzy search. Throws ERR_UNKNOWN_COMPONENT
 * for a genuinely unknown name, and ERR_AMBIGUOUS_COMPONENT when multiple
 * packages provide the same name
 * (with candidate suggestions when close) or ERR_NO_DOC.
 * @param {string} dirName - bare component name (no `XDS` prefix)
 * @param {{coreDir: string, cwd: string, name: string}} ctx - `name` is the caller's original (prefixed) input, used in error text
 * @returns {Promise<ResolvedUnscopedDoc>}
 */
export async function resolveUnscopedDoc(dirName, {coreDir, cwd, name}) {
  let readmePath = findComponentReadme(coreDir, dirName);
  let resolvedName = dirName;
  // Track the resolving owner so the detail payload can carry ownership info.
  // Defaults to core; the legacy-external fallback below may reassign it.
  // Annotated because CORE_PACKAGE's generated declaration carries the literal
  // type, which (unlike a fresh literal) does not widen on assignment.
  /** @type {string} */
  let resolvedOwnerPackage = CORE_PACKAGE;
  let resolvedSourcePath = readmePath
    ? findComponentSource(coreDir, dirName)
    : null;

  if (!readmePath) {
    const externals = discoverExternalPackages(cwd);
    for (const ext of externals) {
      const extDocPath = findExternalComponentDoc(ext.docsDir, dirName);
      if (extDocPath) {
        readmePath = extDocPath;
        resolvedOwnerPackage = ext.name;
        resolvedSourcePath = null;
        break;
      }
    }
  }

  if (!readmePath) {
    const components = discoverComponents(coreDir);
    const results = await searchComponents(dirName, coreDir, components);

    if (results.length > 0) {
      const topScore = results[0].score;
      const topTied = results.filter(r => r.score === topScore);
      const secondScore =
        results.length > topTied.length ? results[topTied.length].score : 0;
      const gap = topScore - secondScore;

      if (topScore >= 90 && topTied.length === 1 && gap >= 20) {
        resolvedName = topTied[0].name;
        readmePath = findComponentReadme(coreDir, resolvedName);
        resolvedOwnerPackage = CORE_PACKAGE;
        resolvedSourcePath = findComponentSource(coreDir, resolvedName);
      } else {
        // How many to suggest: the near-top results, at most five and at
        // least two. Which ones, and in what order, is the suggestion
        // ranking's call.
        const threshold = Math.max(topScore - 20, 1);
        const count = Math.max(
          results.filter(r => r.score >= threshold).slice(0, 5).length,
          Math.min(2, results.length),
        );
        const candidates = rankComponentSuggestions(
          dirName,
          results,
          Object.values(components).flat(),
          synonymMatches(dirName, searchCards()),
        ).slice(0, count);
        // Past the first two suggestions, only the ones about as close as
        // the first (within NEAR_FIRST points), or a close spelling of the
        // whole typed name (a typo): a weaker match after a strong one reads
        // as noise. The list only gets shorter and keeps at least two.
        const typed = dirName.toLowerCase();
        const nearFirst = candidates.filter(
          (c, i) =>
            i < 2 ||
            c.score >= candidates[0].score - NEAR_FIRST ||
            levenshteinDistance(c.name.toLowerCase(), typed) <= 2,
        );
        throw new AstryxError(
          `No component named "${name}"`,
          nearFirst.map(c => ({name: c.name, reason: c.reason})),
          ERROR_CODES.ERR_UNKNOWN_COMPONENT,
        );
      }
    } else {
      throw new AstryxError(
        `No component named "${name}"`,
        undefined,
        ERROR_CODES.ERR_UNKNOWN_COMPONENT,
      );
    }
  }

  if (!readmePath || !readmePath.endsWith('.doc.mjs')) {
    throw new AstryxError(
      `No .doc.mjs found for "${resolvedName}". The component needs a typed doc file.`,
      undefined,
      ERROR_CODES.ERR_NO_DOC,
    );
  }

  return {readmePath, resolvedName, resolvedOwnerPackage, resolvedSourcePath};
}

/**
 * Load a `.doc.mjs` through the shared loader, applying the API's doc-load
 * options. Centralizes the `LoadedComponentDoc`/`LoadDocsOpts` casts so leaves
 * get a typed doc without re-casting.
 * @param {string} docPath
 * @param {{zh?: boolean, dense?: boolean, lang?: string|null}} [opts]
 * @returns {Promise<LoadedComponentDoc>}
 */
export async function loadComponentDoc(docPath, opts = {}) {
  const {zh = false, dense = false, lang = null} = opts;
  try {
    return /** @type {LoadedComponentDoc} */ (
      await loadValidatedComponentDoc(
        docPath,
        /** @type {LoadDocsOpts} */ ({zh, dense, lang}),
      )
    );
  } catch (err) {
    throw new AstryxError(
      `Cannot load component metadata: ${
        err instanceof Error ? err.message : String(err)
      }`,
      undefined,
      ERROR_CODES.ERR_INVALID_DOC,
    );
  }
}

/**
 * Project a loaded doc down to its props table, flattening a multi-component
 * doc's members when the top-level doc has no direct props.
 * @param {LoadedComponentDoc} docs
 * @returns {any[]}
 */
export function extractProps(docs) {
  return (
    docs.props ||
    (docs.components ? docs.components.flatMap(c => c.props || []) : [])
  );
}

/**
 * Augment a loaded `component.detail` doc with ownership metadata. Adds
 * `package`, the resolved `import` specifier, and `sourceAvailable` (whether a
 * swizzleable source file exists for the owner). Existing doc fields (name,
 * usage, props, …) are preserved.
 * @param {LoadedComponentDoc} docs
 * @param {OwnershipSubject} owner
 * @param {string} componentName
 * @param {string} coreDir
 * @returns {import('./component.type.mjs').ComponentDetailResponse['data']}
 */
export function withOwnership(docs, owner, componentName, coreDir) {
  const importSpec =
    owner.package === CORE_PACKAGE
      ? (docs.import ?? resolveImportPath(coreDir, componentName))
      : resolveIntegrationImportPath(owner, componentName, docs.import);
  return /** @type {any} */ ({
    ...docs,
    package: owner.package,
    import: importSpec,
    sourceAvailable: owner.sourcePath != null,
  });
}

/**
 * Resolve the specifier an integration component is imported from.
 *
 * Thin adapter over the shared resolver in foundation, which `search` also
 * uses; the two surfaces have to report the same specifier for the same
 * component.
 *
 * @param {OwnershipSubject} owner
 * @param {string} componentName
 * @param {string|null} [authoredImport]
 * @returns {string}
 */
function resolveIntegrationImportPath(owner, componentName, authoredImport) {
  return resolveIntegrationImport(
    {
      exportsMap: owner.integration?.__packageExports,
      packageDir: owner.integration?.__packageDir,
      docPath: owner.docPath,
      packageName: owner.package,
    },
    componentName,
    authoredImport,
  );
}

/**
 * When the caller asked for "Code" but the resolved doc is for "CodeBlock"
 * (parent), scope the response to just the matching sub-component. Returns the
 * scoped doc (sans ownership) plus the matched member, or null when the doc is
 * not a scopeable parent.
 * @param {LoadedComponentDoc} docs
 * @param {string} dirName
 * @param {string} coreDir
 * @returns {{scoped: LoadedComponentDoc & {parentDoc?: string, import?: string}, matchingComponent: any} | null}
 */
export function scopeSubComponent(docs, dirName, coreDir) {
  const requestedXDS = `XDS${dirName}`;
  const isParentDoc =
    docs.name && docs.name.toLowerCase() !== dirName.toLowerCase();
  const matchingComponent =
    isParentDoc && docs.components
      ? docs.components.find(c => c.name === requestedXDS || c.name === dirName)
      : null;

  if (!matchingComponent) return null;

  /** @type {LoadedComponentDoc & {parentDoc?: string, import?: string}} */
  const scoped = {
    name: dirName,
    description: matchingComponent.description,
    props: matchingComponent.props,
    // Keep parent context for reference
    components: [matchingComponent],
    parentDoc: docs.name,
    import: resolveImportPath(coreDir, dirName),
  };
  if (docs.usage) scoped.usage = docs.usage;
  if (docs.theming) scoped.theming = docs.theming;

  return {scoped, matchingComponent};
}

/**
 * The doc an integration owner shows for `dirName`: when `dirName` is a member
 * its family doc lists under its own name (`AcmeSlide` in an `AcmeCarousel`
 * doc), the doc scoped to that member as {@link scopeSubComponent} scopes
 * Core's, keeping the import the family doc states; otherwise `docs` itself.
 * @param {LoadedComponentDoc} docs
 * @param {OwnershipSubject} owner
 * @param {string} dirName
 * @returns {LoadedComponentDoc & {parentDoc?: string, import?: string}}
 */
export function scopeIntegrationMember(docs, owner, dirName) {
  const record = {name: dirName, docPath: owner.docPath ?? null};
  if (!isIntegrationMember(record)) return docs;
  const entry = integrationMemberEntry(docs, record);
  // The files list the member but the doc this process loaded has no entry
  // for it (the doc changed after it loaded): never answer with the family.
  if (entry == null) {
    throw new AstryxError(
      `No component named "${dirName}": its family doc changed after this process loaded it.`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_COMPONENT,
    );
  }
  // Built from the entry, as scopeSubComponent scopes Core's, so a member that
  // shares the doc's own `name` is scoped too.
  /** @type {LoadedComponentDoc & {parentDoc?: string, import?: string}} */
  const scoped = {
    name: dirName,
    description: entry.description,
    props: entry.props,
    components: [entry],
    // The name the family doc opens under, for every member.
    parentDoc:
      owner.integration && record.docPath
        ? recordedDocName(owner.integration, record.docPath)
        : docs.name === dirName && record.docPath
          ? docStem(record.docPath)
          : docs.name,
  };
  if (docs.usage) scoped.usage = docs.usage;
  if (docs.theming) scoped.theming = docs.theming;
  if (docs.import) scoped.import = docs.import;
  return scoped;
}

/**
 * A search response with every inline `{@link <target>}` in a component
 * result's description resolved to the command that opens the doc it names,
 * as `astryx component` prints it (spec:AST-047 FR9). The response object is
 * kept, with its results replaced.
 * @template {{data: {results: any[]}}} R
 * @param {R} response
 * @param {string} cwd
 * @returns {Promise<R>}
 */
export async function linkSearchResponse(response, cwd) {
  const results = response.data.results;
  if (
    !results.some(
      result =>
        result?.domain === 'component' &&
        typeof result.description === 'string' &&
        result.description.includes('{@'),
    )
  ) {
    return response;
  }
  const linked = [];
  for (const result of results) {
    if (
      result?.domain !== 'component' ||
      typeof result.description !== 'string' ||
      !result.description.includes('{@')
    ) {
      linked.push(result);
      continue;
    }
    const read = await linkComponentResponse(
      {
        type: 'component.detail',
        package: result.package,
        data: {description: result.description},
      },
      cwd,
    );
    linked.push({...result, description: read.data.description});
  }
  response.data = {...response.data, results: linked};
  return response;
}

/**
 * A component read with every inline `{@link <target>}` in its doc text
 * resolved to the command that opens the doc it names (spec:AST-047 FR9), in
 * the detail, its props projection, and each list entry. A Core component's
 * links resolve against the CLI's own docs; an integration's against that
 * integration's. A link that names no doc prints as written.
 * @template {{type: string, package?: string, data?: any}} R
 * @param {R} response
 * @param {string} cwd
 * @returns {Promise<R>}
 */
export async function linkComponentResponse(response, cwd) {
  const {type} = response;
  if (
    type !== 'component.detail' &&
    type !== 'component.detail.props' &&
    type !== 'component.list'
  ) {
    return response;
  }
  // Doc tokens render in the same pass as links.
  if (!JSON.stringify(response.data ?? null).includes('{@')) {
    return response;
  }
  const catalog = await loadDocsCatalog(cwd);
  /** @type {Map<string, string>} */
  const declared = new Map();
  for (const integration of await loadIntegrationsSafely(cwd)) {
    const id = /** @type {any} */ (integration).providerId;
    if (typeof id === 'string') declared.set(integration.name, id);
  }
  /**
   * @param {any} doc
   * @param {string | undefined} owner
   */
  const link = async (doc, owner) => {
    if (typeof owner !== 'string') return doc;
    try {
      return (
        await linkComponentDoc(
          catalog,
          componentLinkProvider(owner, declared.get(owner)),
          doc,
        )
      ).doc;
    } catch {
      // An owner that is not a provider id links nothing; its text reads as
      // written.
      return doc;
    }
  };
  if (type !== 'component.list') {
    return {...response, data: await link(response.data, response.package)};
  }
  /** @type {Record<string, any[]>} */
  const components = {};
  for (const [group, entries] of Object.entries(
    response.data.components ?? {},
  )) {
    const linked = [];
    for (const entry of entries) linked.push(await link(entry, entry?.package));
    components[group] = linked;
  }
  return {...response, data: {...response.data, components}};
}
