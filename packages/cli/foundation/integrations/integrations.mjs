// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration manifest loading for Astryx config.
 *
 * Integrations are PACKAGE NAMES listed in astryx.config.{ts,mjs,js}. Each
 * package declares a single conventional root manifest sibling to its
 * package.json — astryx.integration.{ts,mjs,js} — which contributes
 * components/templates/codemods/docs/themes roots (and the experimental
 * `experimental.iconSets` root), an optional issuesUrl, and an optional
 * cliCommand.
 * Stable provider identity and package metadata come from package.json, not the
 * manifest.
 *
 * @input Integration package names, package.json files, and root manifests.
 * @output LoadedIntegration records with normalized provider identity and roots.
 * @position foundation/integrations — package contribution loading boundary.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {assertWithin} from '../fs/path-safety.mjs';
import {findNodeModulesPackage} from '../fs/paths.mjs';
import {normalizeProviderId} from '../identity/provider-identity.mjs';
// The key census and contribution parsers are internal to the schema module on
// purpose: the public parser still validates the complete authored type, while
// the loader can isolate an invalid optional contribution from valid roots.
import {
  parseAgentDocsField,
  parseCliCommandField,
  parseIntegrationBase,
  unknownIntegrationKeys,
} from '../../authoring/integration/schema.mjs';
import {importUserModule, findPresentFiles} from '../fs/module-loader.mjs';
import {parseGapReportHandler} from '../../authoring/gap-report/parse.mjs';
import {parseDiscoverSource} from '../../authoring/discover/parse.mjs';
import {resolveProviders} from './provider-resolution.mjs';

/**
 * A fully-resolved, loaded integration. Identity (`name`, `version`) comes from
 * the package's package.json; the `components`/`templates`/`codemods`/`docs`/
 * `themes` roots are absolute paths resolved from the manifest. The `__`-prefixed fields
 * are internal bookkeeping used by Doctor integration validation and Project.
 * @typedef {object} LoadedIntegration
 * @property {string} name
 * @property {import('../../authoring/identity/type').ProviderId} [providerId]
 *   normalized stable provider identity; absent only for a legacy unnamed local
 *   package. Unique among contributing integrations: a later claimant is kept
 *   inert with `__providerConflict` (see {@link markProviderConflicts})
 * @property {string} [version]
 * @property {string} [components]
 * @property {string} [templates]
 * @property {string} [codemods]
 * @property {string} [docs]
 * @property {string} [themes]
 * @property {string} [iconSets] the manifest's `experimental.iconSets` root
 * @property {string} [issuesUrl]
 * @property {{append?: readonly string[]}} [agentDocs]
 * @property {string} [cliCommand] the command this package's users run the
 *   CLI with; read by the picker in foundation/env (see cli-command.mjs)
 * @property {string} [__cliCommandError] why a declared `cliCommand` was
 *   ignored; the rest of the manifest still contributes
 * @property {string} [__agentDocsError] contribution-specific validation
 *   failure; other manifest contributions remain available
 * @property {string} __spec
 * @property {string} [__declaredProviderId] the manifest's `providerId` as
 *   written, kept by validation so it can tell whether the package has one
 * @property {string} __packageDir
 * @property {Record<string, unknown>|null} [__packageExports] the owning
 *   package's `exports` map, kept from the package.json this loader already
 *   parsed so import resolution does not read it a second time
 * @property {string} __manifestFile
 * @property {string} [__loadError] set when the manifest failed to load/validate;
 *   such an integration contributes nothing and is surfaced via Project.issues()
 * @property {{providerId: import('../../authoring/identity/type').ProviderId, claimedBy: string, message: string}} [__providerConflict]
 *   set on a package whose provider ID an earlier-loaded package already
 *   claims; it contributes nothing and is reported as a `duplicate_provider`
 *   warning
 * @property {string[]} [__declaredKeys] the keys the manifest object itself
 *   declares, before any is filled in (providerId from the package name)
 * @property {string[]} [__unknownKeys] manifest keys this CLI does not know —
 *   surfaced as a warning; the rest of the manifest still contributes
 * @property {boolean} [__autolinked] loaded because the project declares the
 *   package as a dependency and it ships a manifest, with no astryx.config
 *   entry naming it — see foundation/integrations/autolink.mjs
 * @property {boolean} [__computer] loaded because it is installed beside the
 *   running CLI and the folder is outside a project (spec AST-081 FR12) — see
 *   foundation/integrations/computer-integrations.mjs
 * @property {boolean} [__local] loaded from the package containing the current
 *   working directory, so an author sees the exact bytes they are editing
 * @property {string} [__dependencyField] for an autolinked integration, the
 *   package.json field that declared it (`dependencies`, `devDependencies`,
 *   `optionalDependencies`)
 * @property {import('../../authoring/debug/type').DebugEventHandler} [__debug]
 *   the manifest module's `debug` NAMED export, when it exported a function.
 * @property {import('../../authoring/gap-report/type').GapReportHandler} [__gapReport]
 *   validated package-owned handler from the `gapReport` NAMED export.
 * @property {string} [__gapReportError] isolated named-handler validation error.
 *   Named exports are not manifest keys — see {@link loadManifest}.
 * @property {import('../../authoring/discover/type').DiscoverSource} [__discover]
 *   validated catalog source from the `discover` NAMED export.
 * @property {string} [__discoverError] isolated discover-source validation error.
 */

/** Conventional manifest basenames, in load-precedence order. */
export const MANIFEST_BASENAMES = [
  'astryx.integration.ts',
  'astryx.integration.mjs',
  'astryx.integration.js',
];

/**
 * Normalize a package-owned provider ID without rejecting legacy unnamed local
 * packages at this compatibility boundary.
 * @param {unknown} name
 * @returns {import('../../authoring/identity/type').ProviderId | undefined}
 */
function providerIdForPackage(name) {
  if (typeof name !== 'string' || name.length === 0) return undefined;
  try {
    return normalizeProviderId(name);
  } catch {
    return undefined;
  }
}

/**
 * Resolve provider identity across loaded integrations, in precedence order.
 *
 * Artifact and document IDs are provider-scoped, so two packages cannot both
 * contribute under one provider ID. The same package reached twice (an npm
 * alias beside the package it aliases, with the same name and version) loads
 * once. Any other later claimant, including the same package at another
 * version, stays as an inert entry that carries the conflict. The package being
 * authored claims its ID before precedence order is considered, because the
 * source being edited is authoritative. The winner still contributes; Project
 * issues, Doctor, and the per-command warning name the one set aside instead of
 * dropping it without a word.
 *
 * The conflict pass of {@link resolveProviders}, for a list that is already
 * assembled.
 *
 * @param {LoadedIntegration[]} integrations in precedence order
 * @returns {LoadedIntegration[]}
 */
export function markProviderConflicts(integrations) {
  return resolveProviders(
    integrations.map(integration => ({
      source: /** @type {const} */ ('configured'),
      integration,
      spec: integration?.__spec,
    })),
  ).integrations;
}

/**
 * Return the conventional root manifest paths present in `dir`, in
 * load-precedence order. Unlike {@link resolveManifestPath} this never throws —
 * callers (for example Doctor integration validation) decide how to treat zero / multiple.
 * @param {string} dir
 * @returns {string[]} absolute manifest paths
 */
export function findManifestPaths(dir) {
  return findPresentFiles(dir, MANIFEST_BASENAMES);
}

/**
 * Parse the optional named gap-report handler without making it part of the
 * default manifest schema. A malformed handler is isolated from every other
 * integration contribution and represented as a failed delivery at fan-out.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{handler?: import('../../authoring/gap-report/type').GapReportHandler, error?: string}}
 */
function parseGapReportHandlerExport(value, label) {
  if (value === undefined) return {};
  try {
    return {
      handler: parseGapReportHandler(
        value,
        `${label} named export "gapReport"`,
      ),
    };
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error)};
  }
}

/**
 * Parse the optional named discover source the same way: a malformed one is
 * isolated from every other contribution and reported by `astryx discover`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{source?: import('../../authoring/discover/type').DiscoverSource, error?: string}}
 */
function parseDiscoverSourceExport(value, label) {
  if (value === undefined) return {};
  try {
    return {source: parseDiscoverSource(value, `${label} named export "discover"`)};
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error)};
  }
}

/**
 * Load and validate a manifest module's default export, while isolating the
 * optional `agentDocs` contribution from the manifest's other fields.
 *
 * The base manifest still fails as one unit when a root or `issuesUrl` is
 * invalid. `agentDocs` is parsed separately: a bad contribution is returned as
 * `agentDocsError`, while valid components/templates/docs/codemods stay loaded.
 * The raw object is also inspected before parsing so unknown-key warnings retain
 * forward compatibility.
 *
 * `debug` and `gapReport` come back separately because they are named exports,
 * not manifest keys. A CLI that does not know them simply does not read them.
 *
 * @param {string} file absolute manifest path
 * @param {string} [label] used in error messages
 * @param {{fresh?: boolean}} [options]
 * @returns {Promise<{manifest: import('../../authoring/integration/type').AstryxIntegration, unknownKeys: string[], declaredKeys: string[], debug?: import('../../authoring/debug/type').DebugEventHandler, gapReport?: import('../../authoring/gap-report/type').GapReportHandler, gapReportError?: string, discover?: import('../../authoring/discover/type').DiscoverSource, discoverError?: string, agentDocsError?: string, cliCommandError?: string}>}
 */
export async function loadManifest(
  file,
  label = 'integration manifest',
  {fresh = false} = {},
) {
  const mod = await importUserModule(file, {fresh});
  const raw = mod?.default;
  if (raw === undefined) throw new Error(noDefaultExportMessage(file, label, mod));
  const baseManifest = parseIntegrationBase(raw, label);
  const gapReport = parseGapReportHandlerExport(mod?.gapReport, label);
  const discover = parseDiscoverSourceExport(mod?.discover, label);
  const hasAgentDocs =
    raw != null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Object.prototype.hasOwnProperty.call(raw, 'agentDocs');
  const rawAgentDocs = hasAgentDocs
    ? /** @type {{agentDocs?: unknown}} */ (raw).agentDocs
    : undefined;
  /** @type {import('../../authoring/integration/type').AstryxIntegration['agentDocs']} */
  let agentDocs;
  /** @type {string | undefined} */
  let agentDocsError;
  if (hasAgentDocs && rawAgentDocs !== undefined) {
    try {
      agentDocs = parseAgentDocsField(
        rawAgentDocs,
        `${label} field "agentDocs"`,
      );
    } catch (err) {
      agentDocsError = err instanceof Error ? err.message : String(err);
    }
  }

  /** @type {string | undefined} */
  let cliCommand;
  /** @type {string | undefined} */
  let cliCommandError;
  const rawCliCommand =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? /** @type {{cliCommand?: unknown}} */ (raw).cliCommand
      : undefined;
  if (rawCliCommand !== undefined) {
    try {
      cliCommand = parseCliCommandField(
        rawCliCommand,
        `${label} field "cliCommand"`,
      );
    } catch (err) {
      cliCommandError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    manifest: {
      ...baseManifest,
      ...(agentDocs == null ? {} : {agentDocs}),
      ...(cliCommand == null ? {} : {cliCommand}),
    },
    unknownKeys: unknownIntegrationKeys(raw),
    declaredKeys:
      raw != null && typeof raw === 'object' ? Object.keys(raw) : [],
    debug:
      typeof mod?.debug === 'function'
        ? /** @type {import('../../authoring/debug/type').DebugEventHandler} */ (
            mod.debug
          )
        : undefined,
    gapReport: gapReport.handler,
    gapReportError: gapReport.error,
    discover: discover.source,
    discoverError: discover.error,
    agentDocsError,
    cliCommandError,
  };
}

/**
 * Why a manifest has no default export, said plainly instead of as a schema
 * failure on `undefined`: the file is empty, or it exports other names.
 * @param {string} file
 * @param {string} label
 * @param {Record<string, unknown> | undefined} mod
 */
function noDefaultExportMessage(file, label, mod) {
  const fix = `Fix: export the manifest object as the default export: \`export default {components: './components'}\`, naming the roots the package has.`;
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    // Unreadable now: say only what is missing.
  }
  const names = Object.keys(mod ?? {}).filter(name => name !== 'default');
  if (text.trim() === '') return `${label} is empty. ${fix}`;
  const found =
    names.length > 0
      ? ` (it exports ${names.map(name => `\`${name}\``).join(', ')})`
      : '';
  return `${label} has no default export${found}. ${fix}`;
}

/**
 * Load and validate a manifest module's default export against the integration
 * schema. Throws if the default export is missing or invalid. Exposed for
 * Doctor integration validation.
 * @param {string} file absolute manifest path
 * @param {string} [label] used in error messages
 * @param {{fresh?: boolean}} [options]
 * @returns {Promise<import('../../authoring/integration/type').AstryxIntegration>}
 */
export async function loadManifestObject(
  file,
  label = 'integration manifest',
  options,
) {
  return (await loadManifest(file, label, options)).manifest;
}

/**
 * Resolve the directory of an installed integration package from the consumer's
 * node_modules.
 * @param {string} packageName
 * @param {string} [cwd]
 */
export function resolvePackageDir(packageName, cwd = process.cwd()) {
  // An integration spec is a bare npm package name — never a path. Reject `..`,
  // `.`, and absolute specs so a config can't point the loader (which then
  // dynamically imports the manifest) at an arbitrary module outside
  // node_modules.
  if (
    typeof packageName !== 'string' ||
    packageName.length === 0 ||
    path.isAbsolute(packageName) ||
    packageName.split('/').some(seg => seg === '..' || seg === '.')
  ) {
    throw new Error(
      `Invalid integration package name "${packageName}". Use a bare package name (no path segments).`,
    );
  }
  const nodeModules = path.resolve(cwd, 'node_modules');
  const dir = path.resolve(nodeModules, ...packageName.split('/'));
  if (dir !== nodeModules && !dir.startsWith(nodeModules + path.sep)) {
    throw new Error(
      `Integration "${packageName}" resolves outside node_modules.`,
    );
  }
  return dir;
}

/**
 * Where an integration named in astryx.config is installed: the nearest
 * `node_modules/<name>` at or above `cwd`, found the way an autolinked
 * dependency is, so a package a workspace hoists to its root loads in every
 * member. When it is installed nowhere, `cwd`'s own `node_modules/<name>`,
 * which the caller reports as not installed.
 * @param {string} packageName
 * @param {string} [cwd]
 * @returns {string}
 */
export function resolveInstalledIntegrationDir(
  packageName,
  cwd = process.cwd(),
) {
  // Validates the name first: it throws on a spec with path segments.
  const ownDir = resolvePackageDir(packageName, cwd);
  return findNodeModulesPackage(cwd, packageName)?.packageDir ?? ownDir;
}

/**
 * Find the single conventional root manifest sibling of the package's
 * package.json. Multiple present is a hard error; missing is a hard error.
 * @param {string} packageDir
 * @param {string} spec
 * @returns {string} absolute manifest path
 */
function resolveManifestPath(packageDir, spec) {
  const present = findPresentFiles(packageDir, MANIFEST_BASENAMES);
  if (present.length === 0) {
    throw new Error(
      `Integration package "${spec}" has no conventional root manifest. Add one of: ${MANIFEST_BASENAMES.join(', ')} next to its package.json.`,
    );
  }
  if (present.length > 1) {
    throw new Error(
      `Integration package "${spec}" has multiple root manifests (${present
        .map(file => path.basename(file))
        .join(', ')}). Keep exactly one.`,
    );
  }
  return present[0];
}

/**
 * Load the integration package rooted at `packageDir` directly, without first
 * installing or publishing it. This is the self-resolution seam: an author in
 * a package with a manifest sees the same contributions a consumer installs.
 *
 * A missing manifest returns null. A broken manifest returns the same load-error
 * marker as an installed integration, so Project issues stay truthful.
 *
 * @param {string} packageDir
 * @param {{fresh?: boolean}} [options]
 * @returns {Promise<LoadedIntegration|null>}
 */
export async function loadLocalIntegration(packageDir, {fresh = false} = {}) {
  const manifests = findManifestPaths(packageDir);
  if (manifests.length === 0) return null;

  const pkgPath = path.join(packageDir, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    throw new Error(
      `Could not read the local integration package at ${pkgPath}.`,
    );
  }
  const spec =
    typeof pkg.name === 'string' && pkg.name.length > 0
      ? pkg.name
      : '(local integration)';
  const packageProviderId = providerIdForPackage(pkg.name);
  const manifestFile = resolveManifestPath(packageDir, spec);

  let manifest;
  /** @type {string[]} */
  let unknownKeys;
  /** @type {string[]} */
  let declaredKeys;
  /** @type {import('../../authoring/debug/type').DebugEventHandler | undefined} */
  let debugHandler;
  /** @type {import('../../authoring/gap-report/type').GapReportHandler | undefined} */
  let gapReportHandler;
  /** @type {string | undefined} */
  let gapReportError;
  /** @type {import('../../authoring/discover/type').DiscoverSource | undefined} */
  let discoverSource;
  /** @type {string | undefined} */
  let discoverError;
  /** @type {string | undefined} */
  let agentDocsError;
  /** @type {string | undefined} */
  let cliCommandError;
  try {
    ({
      manifest,
      unknownKeys,
      declaredKeys,
      debug: debugHandler,
      gapReport: gapReportHandler,
      gapReportError,
      discover: discoverSource,
      discoverError,
      agentDocsError,
      cliCommandError,
    } = await loadManifest(manifestFile, `Integration ${spec}`, {fresh}));
  } catch (err) {
    return {
      name: spec,
      ...(packageProviderId == null ? {} : {providerId: packageProviderId}),
      version: pkg.version,
      __spec: spec,
      __packageDir: packageDir,
      __manifestFile: manifestFile,
      __loadError: err instanceof Error ? err.message : String(err),
      __local: true,
    };
  }

  const providerId = providerIdForPackage(manifest.providerId ?? pkg.name);

  /** @param {string | null | undefined} value */
  const resolveRoot = value => {
    if (value == null) return undefined;
    try {
      return assertWithin(value, packageDir, {label: 'contribution root'});
    } catch {
      return undefined;
    }
  };

  return {
    name: spec,
    ...(providerId == null ? {} : {providerId}),
    version: pkg.version,
    components: resolveRoot(manifest.components),
    templates: resolveRoot(manifest.templates),
    codemods: resolveRoot(manifest.codemods),
    docs: resolveRoot(manifest.docs),
    themes: resolveRoot(manifest.themes),
    iconSets: resolveRoot(manifest.experimental?.iconSets),
    issuesUrl: manifest.issuesUrl,
    agentDocs: manifest.agentDocs,
    cliCommand: manifest.cliCommand,
    __cliCommandError: cliCommandError,
    __agentDocsError: agentDocsError,
    __unknownKeys: unknownKeys,
    __declaredKeys: declaredKeys,
    __debug: debugHandler,
    __gapReport: gapReportHandler,
    __gapReportError: gapReportError,
    __discover: discoverSource,
    __discoverError: discoverError,
    __spec: spec,
    __packageDir: packageDir,
    __packageExports: pkg.exports ?? null,
    __manifestFile: manifestFile,
    __local: true,
  };
}

/**
 * Load configured integrations.
 *
 * @param {string[]} [specs] package names
 * @param {{cwd?: string, fresh?: boolean, resolveProviders?: boolean}} [options]
 *   `resolveProviders: false` leaves provider identity to a caller that
 *   resolves it once over a larger set (Project.load)
 * @returns {Promise<LoadedIntegration[]>}
 */
export async function loadIntegrations(
  specs = [],
  {cwd = process.cwd(), fresh = false, resolveProviders = true} = {},
) {
  /** @type {LoadedIntegration[]} */
  const integrations = [];
  const seenSpecs = new Set();

  for (const spec of specs) {
    if (!spec || seenSpecs.has(spec)) continue;
    seenSpecs.add(spec);

    const packageDir = resolveInstalledIntegrationDir(spec, cwd);
    const pkgPath = path.join(packageDir, 'package.json');
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
      throw new Error(
        `Could not find installed integration package "${spec}" at ${pkgPath}. Install it first.`,
      );
    }

    const packageProviderId = providerIdForPackage(pkg.name ?? spec);
    const manifestFile = resolveManifestPath(packageDir, spec);
    let manifest;
    /** @type {string[]} */
    let unknownKeys;
    /** @type {string[]} */
    let declaredKeys;
    /** @type {import('../../authoring/debug/type').DebugEventHandler | undefined} */
    let debugHandler;
    /** @type {import('../../authoring/gap-report/type').GapReportHandler | undefined} */
    let gapReportHandler;
    /** @type {string | undefined} */
    let gapReportError;
    /** @type {import('../../authoring/discover/type').DiscoverSource | undefined} */
    let discoverSource;
    /** @type {string | undefined} */
    let discoverError;
    /** @type {string | undefined} */
    let agentDocsError;
    /** @type {string | undefined} */
    let cliCommandError;
    try {
      ({
        manifest,
        unknownKeys,
        declaredKeys,
        debug: debugHandler,
        gapReport: gapReportHandler,
        gapReportError,
        discover: discoverSource,
        discoverError,
        agentDocsError,
        cliCommandError,
      } = await loadManifest(manifestFile, `Integration ${spec}`, {fresh}));
    } catch (err) {
      // A manifest that throws on import or fails schema validation must NOT take
      // down every command (component/docs/theme don't need this integration).
      // Record a load-error marker; Project surfaces it via issues() and the
      // discovery loops naturally skip it (no components/templates/codemods).
      integrations.push({
        name: pkg.name ?? spec,
        ...(packageProviderId == null ? {} : {providerId: packageProviderId}),
        version: pkg.version,
        __spec: spec,
        __packageDir: packageDir,
        __manifestFile: manifestFile,
        __loadError: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const providerId = providerIdForPackage(
      manifest.providerId ?? pkg.name ?? spec,
    );

    /** @param {string | null | undefined} value */
    const resolveRoot = value => {
      if (value == null) return undefined;
      try {
        return assertWithin(value, packageDir, {label: 'contribution root'});
      } catch {
        // Root escapes the package — skip silently (reported by Doctor validation).
        return undefined;
      }
    };

    integrations.push({
      name: pkg.name ?? spec,
      ...(providerId == null ? {} : {providerId}),
      version: pkg.version,
      components: resolveRoot(manifest.components),
      templates: resolveRoot(manifest.templates),
      codemods: resolveRoot(manifest.codemods),
      docs: resolveRoot(manifest.docs),
      themes: resolveRoot(manifest.themes),
      iconSets: resolveRoot(manifest.experimental?.iconSets),
      issuesUrl: manifest.issuesUrl,
      agentDocs: manifest.agentDocs,
      cliCommand: manifest.cliCommand,
      __cliCommandError: cliCommandError,
      __agentDocsError: agentDocsError,
      __unknownKeys: unknownKeys,
      __declaredKeys: declaredKeys,
      __debug: debugHandler,
      __gapReport: gapReportHandler,
      __gapReportError: gapReportError,
      __discover: discoverSource,
      __discoverError: discoverError,
      __spec: spec,
      __packageDir: packageDir,
      __packageExports: pkg.exports ?? null,
      __manifestFile: manifestFile,
    });
  }

  return resolveProviders ? markProviderConflicts(integrations) : integrations;
}
