// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration structure validation for
 * `astryx doctor integration validate`.
 *
 * Validates exactly ONE integration package at a time and reports findings
 * using the AstryxIntegrationIssue model
 * ({ code, severity: 'warning'|'error', message }; see
 * types/integration.d.ts). Two entry points:
 *
 *   - validateLocalIntegration(cwd)  — the package rooted at `cwd` (nearest
 *     package.json + sibling astryx.integration.{ts,mjs,js}).
 *   - validateInstalledIntegration(spec, cwd) — an installed package resolved
 *     from the node_modules chain at or above `cwd`.
 *
 * Both return a { found, name, version, manifestFile, issues } result. `found`
 * is false only for the no-manifest local case, which is guidance (not an
 * error) so the Doctor check stays exit-0 in a non-integration dir.
 *
 * The on-disk contribution validators themselves (roots + codemods/templates/
 * components/docs, behind `validateLoadedIntegration`) live in
 * `foundation/integrations/validate-contributions.mjs`, because foundation also
 * runs them: `Project` collects integration issues and `integration-warnings`
 * nudges about them on ordinary commands. This file re-exports
 * `validateLoadedIntegration` so existing importers are unaffected, and keeps
 * the command-level entry points that resolve a manifest from disk.
 *
 * Validators are intentionally small and independent so more checks can be
 * appended without reshaping the result. Issue `code`s are stable public
 * strings.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {assertWithin} from '../../foundation/fs/path-safety.mjs';
import {normalizeProviderId} from '../../foundation/identity/provider-identity.mjs';
import {integrationDocTypes} from '../docs/_adapter.mjs';
import {
  iconSetCoverage,
  iconSetIssues,
} from '../../foundation/discovery/icon-set-checks.mjs';
import {olderCliNotes} from '../../foundation/discovery/doc-stability.mjs';
import {templateIconNotes} from '../../foundation/discovery/template-icon-notes.mjs';
import {integrationDocConsistency} from '../../foundation/discovery/doc-consistency.mjs';
import {
  integrationDocCommands,
  integrationDocTargets,
  projectUsesIconSets,
} from './_adapter.mjs';
import {
  THEME_SLUG_RE,
  unreadThemeFolders,
} from '../../foundation/discovery/theme-discovery.mjs';
import {
  createFixContext,
  DOC_CANDIDATE_RE,
  pathIsInside,
  stampOf,
  TEMPLATE_CANDIDATE_RE,
  unreachableFix,
} from '../../foundation/integrations/contribution-fixes.mjs';
import {
  findManifestPaths,
  loadManifest,
  resolveInstalledIntegrationDir,
} from '../../foundation/integrations/integrations.mjs';
// The on-disk contribution validators live in foundation: Project and
// integration-warnings need them too, and foundation must not depend on api.
import {
  blockComponentsCheck,
  componentExamplesCheck,
  componentDocNamesCheck,
  INVALID_CLI_COMMAND,
  isListedIssue,
  issueListed as listed,
  validateLoadedIntegration,
  validateLoadedIntegrationListed,
  issueError as error,
  issueWarning as warning,
  rootProblem,
} from '../../foundation/integrations/validate-contributions.mjs';
import {formatCliCommand} from '../../foundation/env/package-manager.mjs';
import {cliPeerVersionProblem} from '../../foundation/integrations/cli-peer-version.mjs';
import {publicImportIssues} from '../../foundation/integrations/public-imports.mjs';
import {runChoice} from '../../foundation/release/run-context.mjs';

/** The running CLI is outside the package's `@astryxdesign/cli` peer range. */
const CLI_PEER_VERSION = 'cli_peer_version';

/** A doc replaces or extends a name that holds no topic and no guide. */
const DOC_TARGET_NOT_FOUND = 'doc_target_not_found';

/** An extension section's `before` or `after` names no section of the base. */
const DOC_SECTION_UNPLACED = 'doc_section_unplaced';

/** Two docs of one package replace one guide; only the last one is read. */
const DUPLICATE_GUIDE_REPLACEMENT = 'duplicate_guide_replacement';

export {validateLoadedIntegration, isListedIssue};

/**
 * @typedef {import('../../foundation/integrations/issue').AstryxIntegrationIssue} Issue
 */

/**
 * @typedef {Object} ValidateResult
 * @property {boolean} found Whether an integration manifest was located.
 * @property {string} [name] Integration package name (from package.json).
 * @property {string} [version] Integration package version.
 * @property {string} [manifestFile] Absolute path to the loaded manifest.
 * @property {'no_package_json'} [reason] Why nothing was validated (internal).
 * @property {Issue[]} issues
 * @property {Array<{code: string, message: string}>} [notes] Information that
 *   fails nothing, such as `invalid_cli_command` (a malformed `cliCommand`).
 * @property {Issue[]} [listed] Layout findings added after the last minor
 *   release: validate lists them as notes, which count nowhere, since they
 *   may not fail `--strict` until the next (architecture:cli-surface INV35);
 *   `integration verify` still fails on a package.json npm cannot pack.
 * @property {import('../../foundation/integrations/integrations.mjs').LoadedIntegration} [integration]
 * @property {import('../../foundation/discovery/icon-set-checks.mjs').IconSetCoverage[]} [iconSets]
 *   Which definitions each icon set leaves unmapped (spec:AST-084 FR15).
 * @property {import('../../foundation/discovery/doc-stability.mjs').OlderCliNote[]} [olderCliNotes]
 * @property {import('./validate-integration.type.mjs').PublicImportsReport} [publicImports]
 *   what the public-import check could not judge
 */

/**
 * Find the nearest package.json starting from `cwd` and walking up.
 * @param {string} cwd
 * @returns {string | null} absolute path to the package.json, or null.
 */
function findNearestPackageJson(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const ROOT_KINDS = /** @type {const} */ ([
  'components',
  'templates',
  'codemods',
  'docs',
  'themes',
]);

const UNREACHABLE_SCAN_LIMIT = 5_000;
const UNREACHABLE_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
]);
/**
 * A warning for each folder under the themes root that holds modules but is
 * not read as a theme. Either branch of its fix leaves nothing to warn about:
 * the folder becomes a theme, or a dot-folder discovery skips.
 * @param {string} packageDir
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration} loaded
 * @returns {Issue[]}
 */
function unreadThemeFolderIssues(packageDir, loaded) {
  const themes = /** @type {string} */ (loaded.themes);
  return unreadThemeFolders(themes, {
    packageDir,
    packageName: loaded.name,
  }).map(folder => {
    const name = path.basename(folder);
    const shown = `${path.relative(packageDir, folder).split(path.sep).join('/')}/`;
    const hide = `rename it to .${name} so Astryx skips it`;
    let fix;
    if (THEME_SLUG_RE.test(name)) {
      const stem = `${name.replace(/-([a-z0-9])/gu, (_, character) => character.toUpperCase())}Theme`;
      fix = `if it is a theme, add ${stem}.ts and ${stem}.doc.mjs to it (\`${formatCliCommand(`integration add theme ${name}`, packageDir)}\` writes both) and move its code into ${stem}.ts; if not, ${hide}.`;
    } else {
      fix = `${hide}; a theme folder needs a lower-kebab name.`;
    }
    return warning(
      'unread_theme_folder',
      `Folder "${shown}" holds modules but no <name>Theme source or .doc.mjs descriptor, so Astryx does not read it as a theme. Fix: ${fix}`,
    );
  });
}

/**
 * Find real contribution metadata that sits outside every declared root. The
 * scan is local-authoring-only, skips dependency/build output, never follows
 * symlinks, and parses candidates before reporting them so ordinary JS files do
 * not become noise.
 *
 * @param {string} packageDir
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration} loaded
 * @param {string[]} [reported] folders whose files another issue already covers
 * @returns {Promise<Issue[]>}
 */
async function findUnreachableContributionIssues(
  packageDir,
  loaded,
  reported = [],
) {
  // A root that is not a readable folder holds nothing: a fix must never
  // send a file into it.
  const usable = {...loaded};
  for (const kind of ROOT_KINDS) {
    const root = usable[kind];
    if (root != null && rootProblem(root)) usable[kind] = undefined;
  }
  // Every declared root is skipped, readable or not: one that cannot be read
  // has its own issue.
  const roots = /** @type {string[]} */ (
    ROOT_KINDS.map(kind => loaded[kind]).filter(Boolean)
  );
  // A folder a symlinked root points at is read through that root.
  const realRoots = roots.map(root => {
    try {
      return fs.realpathSync(root);
    } catch {
      return root;
    }
  });
  /** @type {Issue[]} */
  const issues = [];
  const context = createFixContext(packageDir, usable);
  let scanned = 0;
  let truncated = false;

  /** @param {string} dir */
  async function walk(dir) {
    if (roots.some(root => pathIsInside(dir, root))) return;
    if (reported.some(folder => pathIsInside(dir, folder))) return;
    let realDir = dir;
    try {
      realDir = fs.realpathSync(dir);
    } catch {
      // Unreadable: reported below.
    }
    if (realRoots.some(root => pathIsInside(realDir, root))) return;
    let entries;
    try {
      entries = fs
        .readdirSync(dir, {withFileTypes: true})
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      // One folder the user running astryx cannot read must not end the whole
      // validation: name it and keep checking the rest of the package.
      const shown = `${path.relative(packageDir, dir).split(path.sep).join('/') || '.'}/`;
      const reason = /** @type {any} */ (err)?.code ?? String(err);
      issues.push(
        warning(
          'unreadable_folder',
          `Could not read "${shown}" (${reason}), so it was not checked for contributions outside a declared root. Fix: make it readable by the user running astryx, or remove it if it does not belong in the package.`,
        ),
      );
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (UNREACHABLE_SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      scanned += 1;
      if (scanned > UNREACHABLE_SCAN_LIMIT) {
        truncated = true;
        return;
      }
      if (
        !TEMPLATE_CANDIDATE_RE.test(entry.name) &&
        !DOC_CANDIDATE_RE.test(entry.name)
      ) {
        continue;
      }
      const stamp = stampOf(context, full);
      if (stamp == null) continue;
      issues.push(
        warning(
          'unreachable_contribution',
          `Found contribution metadata "${path.relative(packageDir, full)}" outside every declared integration root, so it contributes nothing. ${unreachableFix(context, full, stamp)}`,
        ),
      );
    }
  }

  await walk(packageDir);
  if (truncated) {
    issues.push(
      warning(
        'unreachable_scan_truncated',
        `Stopped unreachable-contribution scanning after ${UNREACHABLE_SCAN_LIMIT} files. Narrow the package or move generated output under dist/build.`,
      ),
    );
  }
  return issues;
}

/**
 * Validate a single integration given its package directory and identity.
 * Shared core for the local and installed entry points.
 * @param {string} packageDir
 * @param {{name: string, version?: string}} identity
 * @param {{scanUnreachable?: boolean, own?: boolean, cwd?: string, iconSets?: boolean}} [options]
 *   `own`: the package is the one being authored in the current folder;
 *   `cwd`: the folder whose package manager an install command names;
 *   `iconSets`: read the experimental `experimental.iconSets` root (default
 *   true). Off, the root is not resolved or checked and `iconSets` is not
 *   filled, as in a CLI without icon sets.
 * @returns {Promise<ValidateResult>}
 */
async function validateAtPackageDir(
  packageDir,
  identity,
  {
    scanUnreachable = false,
    own = false,
    cwd = packageDir,
    iconSets = true,
  } = {},
) {
  /** @type {Issue[]} */
  const issues = [];
  /** @type {ValidateResult} */
  const result = {
    found: true,
    name: identity.name,
    version: identity.version,
    manifestFile: undefined,
    issues,
  };

  const manifests = findManifestPaths(packageDir);
  if (manifests.length === 0) {
    issues.push(
      error(
        'missing_manifest',
        `No astryx.integration.{ts,mjs,js} found next to package.json in ${packageDir}.`,
      ),
    );
    return result;
  }
  if (manifests.length > 1) {
    issues.push(
      error(
        'multiple_manifests',
        `Multiple root manifests present (${manifests
          .map(m => path.basename(m))
          .join(', ')}). Keep exactly one.`,
      ),
    );
    return result;
  }

  const manifestFile = manifests[0];
  result.manifestFile = manifestFile;

  // loadManifest validates the base manifest and isolates optional agent-doc
  // validation. A missing default export or invalid base field throws and
  // becomes invalid_manifest; invalid agentDocs is carried to the shared
  // contribution validator so other valid roots remain available.
  let manifest;
  /** @type {string[]} */
  let unknownKeys;
  /** @type {string[]} */
  let declaredKeys;
  /** @type {string | undefined} */
  let agentDocsError;
  /** @type {string | undefined} */
  let cliCommandError;
  try {
    ({manifest, unknownKeys, declaredKeys, agentDocsError, cliCommandError} =
      await loadManifest(
        manifestFile,
        `Integration manifest (${path.basename(manifestFile)})`,
      ));
  } catch (err) {
    issues.push(error('invalid_manifest', /** @type {any} */ (err).message));
    return result;
  }

  /** @type {string[]} absolute roots inside the package */
  const absoluteRoots = [];
  /**
   * @param {string | null | undefined} value
   * @param {string} key the manifest key that declares it
   */
  const resolveRoot = (value, key, kind = 'contribution root') => {
    if (value == null) return undefined;
    if (path.isAbsolute(value)) {
      // An absolute root names this machine's disk, which no install shares,
      // even when it happens to point inside the package.
      const inside = path.relative(packageDir, value);
      const relative =
        inside === '' || (!inside.startsWith('..') && !path.isAbsolute(inside))
          ? `./${inside.split(path.sep).join('/')}`.replace(/\/$/u, '')
          : null;
      // The code an absolute root has always carried, reworded.
      result.issues.push(
        error(
          'root_outside_package',
          `The ${key} root "${value}" is an absolute path, so Astryx reads nothing from it: a root is relative to the package, so it resolves the same wherever the package is installed.` +
            (relative
              ? ` Fix: set \`${key}: '${relative === './' ? '.' : relative}'\` in ${path.basename(manifestFile)}.`
              : ` It also points outside the package. Fix: move the files into the package and set \`${key}\` to their folder relative to package.json, such as './${key}'.`),
        ),
      );
      // Its files are reported through this issue, not one by one.
      if (relative) absoluteRoots.push(path.resolve(value));
      return undefined;
    }
    try {
      return assertWithin(value, packageDir, {label: kind});
    } catch {
      // If the root escapes the package, report an issue instead of crashing.
      result.issues.push({
        code: 'root_outside_package',
        severity: 'error',
        message: `The ${kind} "${value}" resolves outside the integration package directory. Contribution roots must stay within the package.`,
      });
      return undefined;
    }
  };

  const loaded = {
    name: identity.name,
    version: identity.version,
    components: resolveRoot(manifest.components, 'components'),
    templates: resolveRoot(manifest.templates, 'templates'),
    codemods: resolveRoot(manifest.codemods, 'codemods'),
    docs: resolveRoot(manifest.docs, 'docs'),
    themes: resolveRoot(manifest.themes, 'themes'),
    iconSets: iconSets
      ? resolveRoot(manifest.experimental?.iconSets, 'experimental.iconSets')
      : undefined,
    issuesUrl: manifest.issuesUrl,
    agentDocs: manifest.agentDocs,
    cliCommand: manifest.cliCommand,
    __cliCommandError: cliCommandError,
    __agentDocsError: agentDocsError,
    __unknownKeys: unknownKeys,
    __declaredKeys: declaredKeys,
    __spec: identity.name,
    __declaredProviderId: manifest.providerId,
    __packageDir: packageDir,
    __manifestFile: manifestFile,
  };
  result.integration = loaded;

  // Roots + contribution checks are shared with validateLoadedIntegration so
  // the everyday-command nudge runs the exact same validators.
  // A malformed `cliCommand` is an info note beside the issues, not an issue:
  // `integration check --strict` fails on any warning, and a new failure code
  // joins only in a minor release (architecture:cli-surface INV35). Doctor's
  // project check still warns about it.
  const contribution = await validateLoadedIntegrationListed(loaded);
  (result.listed ??= []).push(...contribution.listed);
  for (const issue of contribution.issues) {
    if (issue.code === INVALID_CLI_COMMAND) {
      (result.notes ??= []).push({code: issue.code, message: issue.message});
    } else {
      issues.push(issue);
    }
  }
  // The running CLI outside the package's `@astryxdesign/cli` peer range is a
  // note for the same reason. It is built here, not among the contribution
  // checks, so `integration verify` (which reports their layout findings)
  // does not see it.
  // The version an upgrade starts from is the project's: its own CLI's, or,
  // with none, its Core's, as the project-upgrade notice takes it.
  const choice = runChoice(cwd);
  const from =
    choice.inProject && choice.copy === 'starting' && choice.coreVersion
      ? choice.coreVersion
      : undefined;
  const peerProblem = cliPeerVersionProblem(loaded, undefined, cwd, {
    own,
    from,
  });
  if (peerProblem) {
    (result.notes ??= []).push({code: CLI_PEER_VERSION, message: peerProblem});
  }
  if (loaded.themes && !rootProblem(loaded.themes))
    issues.push(...unreadThemeFolderIssues(packageDir, loaded));
  // The icon-set checks (AST-084 FR15): data against descriptor, module
  // exports, and theme map, all read statically.
  if (loaded.iconSets && !rootProblem(loaded.iconSets)) {
    /** @type {Map<string, import('../../foundation/discovery/icon-set-checks.mjs').IconSetUnchecked[]>} */
    const unchecked = new Map();
    issues.push(...iconSetIssues(packageDir, loaded, unchecked));
    // Which definitions each set leaves unmapped, and what the checks could
    // not judge: listed, never an issue.
    result.iconSets = iconSetCoverage(loaded, unchecked);
  }
  // What the docs say that no reader serves: a prop listed twice, an
  // overlay's text for a prop the doc lacks, an empty or unreachable section,
  // and an overlay of no topic.
  issues.push(
    ...(await integrationDocConsistency(
      {
        components:
          loaded.components && !rootProblem(loaded.components)
            ? loaded.components
            : undefined,
        docs:
          loaded.docs && !rootProblem(loaded.docs) ? loaded.docs : undefined,
      },
      packageDir,
    )),
  );
  // What the package tells apps to import, read from source: package.json
  // `exports`, docs, examples and template imports.
  const publicImports = await publicImportIssues(packageDir, loaded);
  issues.push(...publicImports.issues);
  // Each finding is a note until the next minor makes it a warning.
  // Listed now, a warning from the next minor release: `next`.
  if (publicImports.notes.length > 0)
    (result.notes ??= []).push(
      ...publicImports.notes.map(note => ({...note, next: true})),
    );
  result.publicImports = publicImports.report;
  if (scanUnreachable) {
    issues.push(
      ...(await findUnreachableContributionIssues(
        packageDir,
        loaded,
        absoluteRoots,
      )),
    );
  }
  // Authoring only: a template or namespace doc that sets `stability` is
  // dropped by a CLI before the release that reads it. Noted, never an issue.
  if (scanUnreachable) {
    /** @type {any} */
    let pkg = {};
    try {
      pkg = JSON.parse(
        fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
      );
    } catch {
      // package.json problems are reported by their own check.
    }
    const notes = await olderCliNotes(loaded, pkg, packageDir);
    if (notes.length > 0) result.olderCliNotes = notes;
    // Each template `icons` key the template's source never imports: a note
    // with its fix, never an issue (spec:AST-084 FR10).
    const iconNotes = await templateIconNotes(loaded, packageDir);
    if (iconNotes.length > 0) (result.notes ??= []).push(...iconNotes);
  }

  return result;
}

/**
 * Validate the LOCAL integration package rooted at `cwd`: nearest package.json
 * + a single sibling astryx.integration.{ts,mjs,js}. A missing manifest yields
 * `found: false` (guidance, not an error) so callers stay exit-0.
 * @param {string} [cwd]
 * @returns {Promise<ValidateResult>}
 */
export async function validateLocalIntegration(cwd = process.cwd()) {
  const pkgJsonPath = findNearestPackageJson(cwd);
  if (!pkgJsonPath) {
    return {found: false, reason: 'no_package_json', issues: []};
  }
  const packageDir = path.dirname(pkgJsonPath);

  const manifests = findManifestPaths(packageDir);
  if (manifests.length === 0) {
    // No manifest next to package.json — guidance, not an error.
    return {found: false, issues: []};
  }

  /** @type {{name?: string, version?: string, private?: boolean}} */
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  } catch (err) {
    // A null name means "no manifest here"; this package has one.
    return {
      found: true,
      name: '(local package)',
      manifestFile: manifests[0],
      issues: [
        error(
          'invalid_package_json',
          `Could not parse ${pkgJsonPath}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      ],
    };
  }

  // npm publishes nothing without a name and a version, and the name is the
  // provider ID every reader keys the package's contributions on.
  // A package without one is still checked, under a placeholder name.
  const fields = packageJsonFieldIssues(pkg, pkgJsonPath);
  const name =
    typeof pkg.name === 'string' && pkg.name !== ''
      ? pkg.name
      : '(local package)';
  const result = await validateAtPackageDir(
    packageDir,
    {name, version: pkg.version},
    {scanUnreachable: true, own: true},
  );
  (result.listed ??= []).unshift(
    ...fields,
    // Only a manifest that loaded says whether it declares a providerId; one
    // that did not is reported as invalid_manifest.
    ...(result.integration
      ? providerIdIssues(
          pkg.name,
          result.integration.__declaredProviderId,
          result.integration.__manifestFile,
        )
      : []),
  );
  return result;
}

/**
 * Whether `name` is a bare npm package name, the form a provider ID takes.
 * @param {string} name
 */
function isPackageName(name) {
  try {
    normalizeProviderId(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * A warning when no provider ID can be derived for the package: its
 * package.json `name` is not a bare package name and its manifest declares
 * no `providerId` that is one. Readers key the package's contributions on
 * that ID; a missing name is its own warning.
 * @param {unknown} name package.json `name`
 * @param {unknown} declared the manifest's `providerId`
 * @param {string} manifestFile
 * @returns {Issue[]}
 */
function providerIdIssues(name, declared, manifestFile) {
  if (typeof name !== 'string' || name === '') return [];
  if (isPackageName(name)) return [];
  if (typeof declared === 'string' && isPackageName(declared)) return [];
  const manifest = path.basename(manifestFile);
  return [
    listed(
      'no_provider_id',
      `No provider ID can be derived for this package: package.json "name" ${JSON.stringify(name)} is not a bare package name (an optional @scope/ and a name, each starting with a lowercase letter or digit and holding only lowercase letters, digits, "-", ".", "_" and "~"), and ${manifest} declares no providerId that is one. Astryx files the package's components, templates and docs under that ID, so links to them and selecting the package cannot work. Fix: rename the package, such as "@your-scope/your-package", or set \`providerId: '@your-scope/your-package'\` in ${manifest}.`,
    ),
  ];
}

/**
 * A warning for each field npm needs that package.json lacks.
 * @param {{name?: unknown, version?: unknown, private?: unknown}} pkg
 * @param {string} pkgJsonPath
 * @returns {Issue[]}
 */
function packageJsonFieldIssues(pkg, pkgJsonPath) {
  /** @type {Issue[]} */
  const issues = [];
  const shown = path.basename(pkgJsonPath);
  // Listed, so validate and `--strict` keep the result they had for these
  // packages; `integration verify`, which packs, reports them as errors.
  if (typeof pkg.name !== 'string' || pkg.name === '') {
    issues.push(
      listed(
        'invalid_package_json',
        `${shown} has no "name", so npm cannot pack or publish the package, and a project that installs it has no name to select it by. Fix: add "name": "@your-scope/your-package" to ${shown}.`,
      ),
    );
  }
  // A private package is never published, so it needs no version.
  if (
    pkg.private !== true &&
    (typeof pkg.version !== 'string' || pkg.version === '')
  ) {
    issues.push(
      listed(
        'invalid_package_json',
        `${shown} has no "version", so npm cannot pack or publish the package. Fix: add "version": "0.1.0" to ${shown}.`,
      ),
    );
  }
  return issues;
}

/**
 * Validate an INSTALLED integration package: the nearest `node_modules/<spec>`
 * at or above `cwd`, resolved the way the project loads it.
 * @param {string} spec package name
 * @param {string} [cwd]
 * @param {{iconSets?: boolean}} [options] `iconSets`: check the package's
 *   experimental icon sets; by default only when the project at `cwd` sets
 *   `experimental.iconSet`
 * @returns {Promise<ValidateResult>}
 */
export async function validateInstalledIntegration(
  spec,
  cwd = process.cwd(),
  {iconSets} = {},
) {
  // The resolver throws (path-safety guard) on a spec with path segments,
  // `..`, or an absolute path. Every other malformed input to this command
  // degrades into a diagnostic — so catch it here and return an issue instead
  // of letting the throw escape to a raw stack (human) / generic ERR_UNKNOWN
  // (--json).
  let packageDir;
  try {
    packageDir = resolveInstalledIntegrationDir(spec, cwd);
  } catch (err) {
    return {
      found: true,
      name: spec,
      version: undefined,
      issues: [error('invalid_package_spec', /** @type {any} */ (err).message)],
    };
  }
  const pkgJsonPath = path.join(packageDir, 'package.json');

  /** @type {{name?: string, version?: string}} */
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  } catch (err) {
    const exists = fs.existsSync(pkgJsonPath);
    return {
      found: true,
      name: spec,
      version: undefined,
      issues: [
        error(
          exists ? 'invalid_package_json' : 'package_not_found',
          exists
            ? `Could not parse ${pkgJsonPath}: ${err instanceof Error ? err.message : String(err)}`
            : `Could not find installed integration package "${spec}" at ${pkgJsonPath}. Install it first.`,
        ),
      ],
    };
  }

  return validateAtPackageDir(
    packageDir,
    {name: pkg.name ?? spec, version: pkg.version},
    {cwd, iconSets: iconSets ?? (await projectUsesIconSets(cwd))},
  );
}

/**
 * The doc-syntax notes for a package's topics: each command a topic writes
 * with a runner (`runner_command`), for one package manager
 * (`package_manager_command`), or bare (`plain_command`), and each token that
 * does not parse (`doc_token`), with the file, line and what to write
 * instead. The next minor release turns them into warnings: `next`.
 * @param {any} integration a loaded integration
 * @returns {Promise<Array<{code: string, message: string, next: true}>>}
 */
async function docCommandNotes(integration) {
  const packageDir = integration.__packageDir;
  return (await integrationDocCommands(integration)).map(each => ({
    code: each.code,
    message:
      typeof packageDir === 'string'
        ? `${path.relative(packageDir, each.file).split(path.sep).join('/')}: ${each.message}`
        : each.message,
    next: true,
  }));
}

/**
 * The notes for docs that replace or extend a topic or a guide the docs tree
 * places, or place an extension's section with `before` or `after`: a name
 * that holds neither (such as a namespace) applies nothing, and a key that
 * names no section adds the section at the end. Each is listed, failing nothing, until
 * the next minor release (architecture:cli-surface INV35).
 * @param {any} integration a loaded integration
 * @returns {Promise<Array<{code: string, message: string}>>}
 */
async function docTargetNotes(integration) {
  /** @type {Array<{code: string, message: string}>} */
  const notes = [];
  const targets = await integrationDocTargets(integration);
  /** @type {Map<string, string[]>} lowercased route → the docs replacing it */
  const replacers = new Map();
  for (const each of targets) {
    if (each.kind !== 'guide' || each.relationship !== 'replaces') continue;
    // An old route and the new one name one guide.
    const key = each.guide ?? each.target.toLowerCase();
    replacers.set(key, [...(replacers.get(key) ?? []), each.topic]);
  }
  for (const [route, topics] of replacers) {
    if (topics.length < 2) continue;
    notes.push({
      code: DUPLICATE_GUIDE_REPLACEMENT,
      message: `"${topics.join('", "')}" all replace the guide "${route}", and only the last, "${topics.at(-1)}", is read. Fix: keep one replacement, or make the others extend it.`,
    });
  }
  for (const each of targets) {
    if (each.kind === 'namespace') {
      const shown = each.guidesBelow.slice(0, 8);
      const more = each.guidesBelow.length - shown.length;
      notes.push({
        code: DOC_TARGET_NOT_FOUND,
        message: `"${each.topic}" ${each.relationship} "${each.target}", which is a namespace of the docs tree: it holds no sections to ${each.relationship === 'replaces' ? 'replace' : 'extend'}, so this changes nothing. Fix: name the route of a guide below it${shown.length > 0 ? `: ${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}` : ''}.`,
      });
    } else if (each.kind == null) {
      notes.push({
        code: DOC_TARGET_NOT_FOUND,
        message: `"${each.topic}" ${each.relationship} "${each.target}", which is neither a topic nor a guide of the CLI's docs or this package's own: it changes nothing unless an app also installs a package that provides it. Fix: if it should name one of those, name a topic as \`${formatCliCommand('docs')}\` lists it, or a guide's route as \`${formatCliCommand('docs authoring --depth all')}\` or \`${formatCliCommand('docs cli --depth all')}\` lists it.`,
      });
    }
    for (const {section, field, key} of each.unplaced) {
      notes.push({
        code: DOC_SECTION_UNPLACED,
        message: `Section "${section}" of "${each.topic}" goes ${field} "${key}", which is no section of "${each.guide ?? each.target}", so it is added at the end. Fix: use a key \`${formatCliCommand(`docs ${each.guide ?? each.target} --index`)}\` lists.`,
      });
    }
  }
  return notes;
}

/**
 * Unified entry: validate the LOCAL integration (no `pkg`) or an INSTALLED one
 * (`pkg` given) and return the `integration.validate` envelope. The no-manifest
 * local case is guidance, not an error — it comes back with `validated: false`,
 * `name: null` and no issues so the CLI can print a hint and stay exit-0.
 * `validated` is what tells a machine consumer that empty `issues` means
 * "nothing was checked" rather than "checked and healthy".
 *
 * This is the seam that keeps the CLI a thin wrapper: the command handler calls
 * this and only chooses how to render (human vs --json) + the exit code.
 *
 * @param {string} [pkg] installed package name; omit to validate the cwd package
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('./validate-integration.type.mjs').ValidateIntegrationResponse>}
 */
export async function validateIntegration(pkg, options = {}) {
  const {cwd = process.cwd()} = options;
  const result = pkg
    ? await validateInstalledIntegration(pkg, cwd)
    : await validateLocalIntegration(cwd);
  // Each doc the package ships, against the published authoring type for its
  // kind, read with the project's own compiler. Findings are warnings only.
  const integration = result.found ? result.integration : undefined;
  const docTypes = integration
    ? await integrationDocTypes(integration, cwd)
    : undefined;
  // The component names docs and blocks give: those that cannot be judged
  // are listed in their reports, and those judged wrong are notes.
  const names = integration
    ? [
        await componentDocNamesCheck(integration),
        await blockComponentsCheck(integration),
      ]
    : undefined;
  // Components no block template shows.
  const examples = integration
    ? await componentExamplesCheck(integration)
    : undefined;
  const docNames = names?.[0].report;
  const blockComponents = names?.[1].report;
  // Notes fail nothing: a malformed `cliCommand`, and the findings added
  // after the last minor release, each with its fix in the message, which
  // may not fail `--strict` until the next (architecture:cli-surface INV35):
  // the layout findings and the component names judged wrong.
  // A finding the next minor release turns into a warning is marked `next`:
  // `integration check --strict --next` fails on it today.
  const notes = result.found
    ? [
        // A malformed cliCommand fails --strict from the next minor
        // (spec:AST-081 FR5).
        ...(result.notes ?? []).map(note =>
          note.code === INVALID_CLI_COMMAND ? {...note, next: true} : note,
        ),
        ...(result.listed ?? []).map(issue => ({
          code: issue.code,
          message: issue.message,
          next: true,
        })),
        ...(names ?? []).flatMap(each =>
          each.notes.map(note => ({...note, next: true})),
        ),
        ...(examples?.notes ?? []).map(note => ({...note, next: true})),
      ]
    : [];
  // The doc-syntax findings in the package's topics, as `next` notes with
  // their fixes, the same way.
  if (integration?.docs) {
    notes.push(...(await docCommandNotes(integration)));
    notes.push(
      ...(await docTargetNotes(integration)).map(note => ({...note, next: true})),
    );
  }
  return {
    type: 'integration.validate',
    data: {
      // The one bit that separates "checked and clean" from "never checked":
      // with no manifest there is nothing to validate, and issues stays [].
      validated: result.found,
      name: result.found ? (result.name ?? null) : null,
      version: result.found ? (result.version ?? null) : null,
      issues:
        result.reason === 'no_package_json'
          ? [
              {
                code: 'no_package',
                severity: 'error',
                message:
                  'No package.json found. Run this command inside a package directory.',
              },
            ]
          : result.issues,
      ...(notes.length > 0 ? {notes} : {}),
      ...(docTypes ? {docTypes} : {}),
      ...(docNames ? {docNames} : {}),
      ...(blockComponents ? {blockComponents} : {}),
      // Additive, never counted: present only for a package with icon sets,
      // or with descriptors an older CLI drops.
      ...(result.found && result.iconSets ? {iconSets: result.iconSets} : {}),
      ...(result.found && result.olderCliNotes
        ? {olderCliNotes: result.olderCliNotes}
        : {}),
      // Template assets npm could not place, when there are any.
      ...(examples && examples.unchecked.length > 0
        ? {
            exampleAssets: {
              status: 'checked',
              findings: [],
              unchecked: examples.unchecked,
            },
          }
        : {}),
      // What the public-import check could not judge: listed, never failed on.
      ...(result.found && result.publicImports
        ? {publicImports: result.publicImports}
        : {}),
    },
  };
}

/**
 * Summarize issues by severity.
 * @param {Issue[]} issues
 * @returns {{errors: number, warnings: number}}
 */
export function summarizeIssues(issues) {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === 'error') errors += 1;
    else if (issue.severity === 'warning') warnings += 1;
  }
  return {errors, warnings};
}
