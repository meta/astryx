// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Health-check engine for `astryx doctor`.
 *
 * Runs a series of diagnostic checks against the user's project and
 * environment, returning a structured report. Outside a project it checks the
 * computer instead (spec AST-081 FR4): the Node version, the release that
 * answered, the newest release the computer knows of, and whether the
 * computer-level agent text is present and current; no check fails because
 * the folder has no project. Each check is a small,
 * self-contained function that returns a {@link DoctorCheck} record, so
 * adding a new diagnostic is just appending a function to {@link SYNC_CHECKS}.
 *
 * The engine is intentionally side-effect-free: it only *reads* the
 * filesystem, environment, and package metadata. It never installs, writes,
 * or mutates anything. That makes it safe to run in CI as a gate (exit 1 on
 * any FAIL) and safe for AI agents to invoke with `--json`.
 *
 * Status semantics:
 *   - 'pass' — everything is healthy.
 *   - 'warn' — non-fatal; the setup works but could be improved.
 *   - 'fail' — something is broken and should be fixed (drives exit 1).
 *   - 'info' — purely informational; never affects exit code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {MIN_NODE_VERSION, isNodeVersionSupported} from '../../foundation/env/node-version.mjs';
import {
  AGENT_DOC_PATHS,
  holdsAstryxBlock,
} from '../../foundation/agent-docs/agent-doc-state.mjs';
import {
  agentDocsTargetDir,
  assertAgentDocsTarget,
  resolveAgentDocsRoot,
} from '../../foundation/agent-docs/agent-docs.mjs';
import {CLI_ROOT, findProjectCoreDir, findInstalledPackage} from '../../foundation/fs/paths.mjs';
import {explainPackageManager, formatCliCommand, getCliInvocation, guessCliInvocation} from '../../foundation/env/package-manager.mjs';
import {chooseDeclaredCliCommand, declaredCliCommandsOf} from '../../foundation/env/cli-command.mjs';
import {
  findConfigPath,
  Project,
  providerLedgerOf,
} from '../../foundation/config/project.mjs';
import {DocsCatalog} from '../../foundation/discovery/docs-discovery.mjs';
import {buildDocsIndexData} from '../../foundation/discovery/docs-section-key.mjs';
import {
  DOC_OUTPUT_BUDGET_BYTES,
  docsIndexBytes,
  oversizedDocSections,
} from '../../foundation/discovery/docs-output-budget.mjs';
import {
  builtinCatalog,
  compileTopic,
  docsLinkProblems,
  guideEntry,
  lowerTopic,
  overlayLanguages,
  projectTree,
} from '../docs/_adapter.mjs';
import {typedEdges} from '../docs/node/node.mjs';
import {detailView, indexView} from '../../foundation/doc-compiler/lenses.mjs';
import {isExperimentalTreeNode} from '../../foundation/doc-compiler/tree.mjs';
import {semverCompare, isValidSemver, satisfiesRange} from '../../foundation/env/semver.mjs';
import {checkAppThemes, checkThemes} from './theme-checks.mjs';
import {availableLine, RUN_FROM_PROJECT, upgradeLine} from '../../foundation/release/notices.mjs';
import {COMPUTER_COMMAND, COMPUTER_INSTALL_STEP} from '../../foundation/agent-docs/computer-agent-text.mjs';
import {alignCommand, addCliCommandFor, computerAgentTextState, installCommandFor, insideProjectElsewhere, projectCoreVersion, projectHasOwnCli, computerIntegrationsOutside, computerIntegrationsToAdd, displayHomePath, outsideProject, releaseFacts, builtIntegrationPackages} from './_adapter.mjs';
import {checkBuilt} from './built-checks.mjs';

/**
 * @typedef {'pass'|'warn'|'fail'|'info'} DoctorStatus
 *
 * @typedef {object} DoctorCheck
 * @property {string} id - Stable machine-readable id (e.g. 'node-version').
 * @property {string} label - Human-readable check name.
 * @property {DoctorStatus} status
 * @property {string} message - One-line result summary.
 * @property {string} [fix] - Actionable remediation, present when not 'pass'.
 *
 * @typedef {object} DoctorReport
 * @property {DoctorCheck[]} checks
 * @property {{pass: number, warn: number, fail: number, info: number}} summary
 *
 * @typedef {object} DoctorContext
 * @property {string} cwd - Directory to diagnose.
 * @property {string} nodeVersion - Running Node version.
 * @property {string|null} coreDir - Resolved core package directory, or null.
 * @property {boolean} [ownCli] - Whether the project installs its own CLI;
 *   false means the copy that started the run answered it (spec AST-081 FR2).
 * @property {string|null} [projectCore] - The Core release the project names
 *   (installed, else locked, else declared), as the daily hint reads it.
 * @property {string|null} configPath - Resolved astryx.config.mjs path, or null.
 * @property {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]|null} [integrations]
 *   Every integration the project loaded, or null when the project could not be
 *   read at all.
 * @property {DocsCatalog|null} [docsCatalog] - The topics a docs read sees.
 * @property {Array<{package?: string, code: string, message: string}>} [docsCatalogIssues]
 *   `invalid_doc` issues from the project's contributed docs.
 * @property {string|null} [docsCatalogError] - Why the project's docs catalog
 *   could not be built, when it could not.
 * @property {Array<{package: string, code: string, severity: 'warning'|'error', message: string}>|null} [integrationIssues]
 * @property {Array<{spec: string, error: string}>|null} [autolinkFailures]
 * @property {Array<{spec: string, label: string, error: string|null}>|null} [configuredIntegrations]
 *   Every name astryx.config lists, from the provider ledger: the package it
 *   reached (or failed to reach) and why loading failed, if it did. Set aside
 *   for a provider conflict, replaced by the package being authored, or
 *   repeated under another name all still count as configured.
 *   installed dependencies whose integration manifest could not be loaded
 *   Combined project-level integration issues, including cross-package template replacement warnings.
 * @property {Error|null} [configError] - Error thrown while resolving the config
 *   path (e.g. multiple config files present), surfaced by checkConfig as a FAIL.
 * @property {{sets: Array<{name: string, package: string}>, withdrawn: Array<{name: string, package: string, reason: string}>, choice: {status: 'selected'|'none'|'ambiguous'|'missing'|'withdrawn', reason: string, configured?: string}}|null} [iconSets]
 *   The project's icon sets (AST-084 FR17), or null when they could not be read.
 *   Experimental: may change or be removed in a patch release.
 * @property {string|null} [projectError] - Why the CLI could not load the
 *   project from its config, when it could not. Checks that need the loaded
 *   project quote it when they skip, so a skip says what was found.
 */

/* ── helpers ──────────────────────────────────────────────────────────── */

/**
 * Safely read + parse a package.json. Returns null on any failure.
 * @param {string} pkgPath
 * @returns {Record<string, any>|null}
 */
function readPkg(pkgPath) {
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Read the version of an installed package from a resolved directory.
 * @param {string|null} dir
 * @returns {string|null}
 */
function pkgVersion(dir) {
  if (!dir) return null;
  const pkg = readPkg(path.join(dir, 'package.json'));
  return pkg?.version ?? null;
}

/**
 * The first line of an error message, bounded for a one-line check message.
 * @param {string} message
 * @returns {string}
 */
function firstLine(message) {
  return String(message).split('\n')[0].slice(0, 300);
}

/**
 * The message of a check that needs the loaded project and could not have it.
 * It carries the reason the CLI gave, so the line says what Doctor found
 * instead of only that it did not look.
 * @param {DoctorContext} ctx
 * @param {string} what
 * @returns {string}
 */
function skippedBecause(ctx, what) {
  return ctx.projectError
    ? `Skipped — ${what}: ${firstLine(ctx.projectError)}`
    : `Skipped — ${what}.`;
}

/** Integrations one message names before it counts the rest. */
const NAMED_INTEGRATIONS = 10;

/**
 * @param {Array<{name?: string, __spec?: string}>} integrations
 * @returns {string}
 */
function nameIntegrations(integrations) {
  const names = integrations.map(
    integration => integration.name ?? integration.__spec ?? '(integration)',
  );
  return names.length <= NAMED_INTEGRATIONS
    ? names.join(', ')
    : `${names.slice(0, NAMED_INTEGRATIONS).join(', ')} and ${names.length - NAMED_INTEGRATIONS} more`;
}

/**
 * The project's root: the folder of its config, else of the nearest
 * package.json above the working directory (where the config is looked for),
 * else the working directory.
 * @param {DoctorContext} ctx
 * @returns {string}
 */
function projectRootOf(ctx) {
  if (ctx.configPath) return path.dirname(ctx.configPath);
  let dir = ctx.cwd;
  for (let i = 0; i < 50; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return ctx.cwd;
}

/* ── individual checks ────────────────────────────────────────────────── */

/**
 * Check 1 — running Node version meets the CLI's minimum.
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkNodeVersion(ctx) {
  const supported = isNodeVersionSupported(ctx.nodeVersion);
  return {
    id: 'node-version',
    label: 'Node.js version',
    status: supported ? 'pass' : 'fail',
    message: supported
      ? `Node v${ctx.nodeVersion} meets the minimum (>=${MIN_NODE_VERSION}).`
      : `Node v${ctx.nodeVersion} is below the required minimum (>=${MIN_NODE_VERSION}).`,
    ...(supported
      ? {}
      : {fix: `Upgrade Node.js to >=${MIN_NODE_VERSION} and re-run.`}),
  };
}

/**
 * Check 2 — @astryxdesign/core is installed and resolvable from the project.
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkCoreInstalled(ctx) {
  const found = Boolean(ctx.coreDir);
  const version = pkgVersion(ctx.coreDir);
  return {
    id: 'core-installed',
    label: '@astryxdesign/core installed',
    status: found ? 'pass' : 'fail',
    message: found
      ? `@astryxdesign/core resolved${version ? ` (v${version})` : ''}.`
      : '@astryxdesign/core could not be resolved from this project.',
    ...(found
      ? {}
      : {fix: 'Install the design system: `npm install @astryxdesign/core` (or yarn/pnpm/bun).'}),
  };
}

/**
 * Check 3 — installed @astryxdesign/core is in step with @astryxdesign/cli (major/minor drift).
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkVersionAlignment(ctx) {
  // A project with no CLI of its own and no Core installed yet (a fresh
  // clone) is compared by the Core it locks or declares, as the daily hint
  // compares it (spec AST-081 FR2).
  const coreVersion =
    pkgVersion(ctx.coreDir) ??
    (ctx.ownCli === false ? (ctx.projectCore ?? null) : null);
  const cliPkg = readPkg(path.join(CLI_ROOT, 'package.json'));
  const cliVersion = cliPkg?.version ?? null;

  if (!coreVersion || !cliVersion) {
    return {
      id: 'version-alignment',
      label: '@astryxdesign/core <-> @astryxdesign/cli alignment',
      status: 'info',
      message: 'Skipped — could not read both @astryxdesign/core and @astryxdesign/cli versions.',
    };
  }

  // A monorepo/linked install often pins a non-semver range like `workspace:*`
  // or `link:...`. `'workspace:*'.split('.').map(Number)` yields NaN, and
  // `NaN !== cliMajor` is always true — that produced a spurious drift WARN
  // with a `NaN.undefined.x` fix string. If either version isn't real semver,
  // there's nothing to compare: skip.
  if (!isValidSemver(coreVersion) || !isValidSemver(cliVersion)) {
    return {
      id: 'version-alignment',
      label: '@astryxdesign/core <-> @astryxdesign/cli alignment',
      status: 'info',
      message:
        `Skipped — @astryxdesign/core v${coreVersion} / @astryxdesign/cli ` +
        `v${cliVersion} are not both comparable semver.`,
    };
  }

  // A project with no CLI of its own is answered by the copy that started
  // the run (spec AST-081 FR2): say so, and how to add the CLI at Core's
  // version.
  if (ctx.ownCli === false) {
    // The same comparison as the daily hint: the CLI against the Core the
    // run reads (spec AST-081 FR2). The command adds the CLI in the project
    // spec:AST-040 FR9 defines; from a folder inside it whose package.json
    // is not the project's, or in no project, the fix says how to reach one.
    const add = addCliCommandFor(ctx.cwd, coreVersion);
    const matches = coreVersion === cliVersion;
    const fix = add
      ? `${matches ? 'To pin it for the team and CI' : 'To match'}, run: ${add.command}.`
      : matches
        ? null
        : NO_PROJECT_FIX;
    return {
      id: 'version-alignment',
      label: '@astryxdesign/core <-> @astryxdesign/cli alignment',
      status: matches ? 'info' : 'warn',
      message: matches
        ? `This project has no Astryx CLI installed; CLI ${cliVersion}, the one you started, answered and matches its Core.`
        : `This project has no Astryx CLI installed; CLI ${cliVersion}, the one you started, answered while its Core is ${coreVersion}.`,
      ...(fix ? {fix} : {}),
    };
  }
  // The project's own CLI answers this project whatever its version
  // (spec AST-081 FR2), so any difference means templates, docs, and agent
  // text come from one release and components from another.
  const drift = coreVersion !== cliVersion;
  return {
    id: 'version-alignment',
    label: '@astryxdesign/core <-> @astryxdesign/cli alignment',
    status: drift ? 'warn' : 'pass',
    message: drift
      ? `This project's CLI ${cliVersion} answers it, but its Core is ${coreVersion}: templates, docs, and agent text come from CLI ${cliVersion}, components from Core ${coreVersion}.`
      : `@astryxdesign/core v${coreVersion} is in step with @astryxdesign/cli v${cliVersion}.`,
    ...(drift ? alignFix(ctx.cwd, cliVersion, coreVersion) : {}),
  };
}

/**
 * The fix for a CLI and Core on different releases, when a command fits.
 * @param {string} cwd
 * @param {string} cli
 * @param {string} core
 * @returns {{fix?: string}}
 */
function alignFix(cwd, cli, core) {
  // From a folder inside a project whose package.json is not the project's,
  // aligning the project would leave this warning in place, so no command
  // fits there (alignCommand returns none): point at the project instead.
  const command = alignCommand(cwd, cli, core);
  return {fix: command ? `To align them, run: ${command}.` : NO_PROJECT_FIX};
}

/**
 * The fix where no install command fits: the folder's package.json is not an
 * Astryx project's (spec AST-040 FR9), and adding there would make it one.
 */
const NO_PROJECT_FIX = RUN_FROM_PROJECT;

/**
 * Check 5 — astryx.config.mjs (if present) loads and has a valid shape.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorCheck>}
 */
export async function checkConfig(ctx) {
  // A resolution error (e.g. multiple astryx.config.* files) is exactly the
  // kind of setup problem doctor should report — not crash on.
  if (ctx.configError) {
    return {
      id: 'config',
      label: 'astryx.config.mjs',
      status: 'fail',
      message: ctx.configError.message,
      fix: 'Keep exactly one astryx.config.{ts,mjs,js} at your project root.',
    };
  }
  if (!ctx.configPath) {
    return {
      id: 'config',
      label: 'astryx.config.mjs',
      status: 'info',
      message: 'No astryx.config.mjs found — using defaults.',
    };
  }

  // Project.load swallows nothing — it surfaces a genuine load failure — but
  // the config check wants to report a bad default export precisely, so we
  // re-import directly to surface a genuine load failure as a FAIL.
  try {
    const {pathToFileURL} = await import('node:url');
    const mod = await import(pathToFileURL(ctx.configPath).href);
    const config = mod.default;
    if (config !== undefined && (typeof config !== 'object' || config === null)) {
      return {
        id: 'config',
        label: 'astryx.config.mjs',
        status: 'fail',
        message: `astryx.config.mjs default export is not an object (got ${typeof config}).`,
        fix: 'Export a default object from astryx.config.mjs, e.g. `export default { integrations: [] };`.',
      };
    }
    // Importing is not the whole test: the CLI also validates the config, and
    // a config it rejects leaves every project-aware command without the
    // project. Doctor is the CI gate, so that fails.
    if (ctx.projectError) {
      return {
        id: 'config',
        label: 'astryx.config.mjs',
        status: 'fail',
        message: `astryx.config.mjs loads, but the CLI could not load the project from it: ${firstLine(ctx.projectError)}`,
        fix: `Fix what the message names. \`${formatCliCommand('docs authoring config', ctx.cwd)}\` lists every field astryx.config accepts.`,
      };
    }
    return {
      id: 'config',
      label: 'astryx.config.mjs',
      status: 'pass',
      message: `astryx.config.mjs loaded cleanly (${path.relative(ctx.cwd, ctx.configPath) || ctx.configPath}).`,
    };
  } catch (err) {
    return {
      id: 'config',
      label: 'astryx.config.mjs',
      status: 'fail',
      message: `astryx.config.mjs failed to load: ${/** @type {any} */ (err).message}`,
      fix: 'Fix the syntax/runtime error in astryx.config.mjs so it imports cleanly.',
    };
  }
}

/**
 * Why no integration is implicitly linked, from what actually loaded. A
 * configured integration is named in astryx.config; the package's own manifest
 * loads as itself (`__local`). Only the first may be described as named in
 * astryx.config: a package with no config that loads its own manifest has no
 * config file to name it.
 *
 * @param {Array<{name?: string, __local?: boolean}>} integrations loaded, none
 *   autolinked and none that failed to load
 * @returns {string}
 */
function describeNoImplicit(integrations) {
  const own = integrations.filter(integration => integration.__local);
  const configured = integrations.length - own.length;
  const ownNames = own.map(integration => integration.name ?? 'this package').join(', ');
  if (own.length === 0) return 'None — every loaded integration is named in astryx.config.';
  if (configured === 0) return `None — the only loaded integration is this package's own manifest (${ownNames}).`;
  return `None — every loaded integration is named in astryx.config or is this package's own manifest (${ownNames}).`;
}

/**
 * Check 6 — integrations that are loaded without an astryx.config entry.
 *
 * The CLI autolinks an installed dependency that ships an
 * `astryx.integration.*` manifest, so a project can be getting components,
 * templates, themes, docs and codemods from a package nothing in the project mentions.
 * Two questions follow, and this line is the answer to both:
 *
 *   - "Why can the CLI see this?" — asked by an author who greps the project
 *     for the package name and finds nothing. Reading our source should not be
 *     part of that answer.
 *   - "Can I delete this dependency?" — asked by an unused-dependency sweep,
 *     which decides by looking for source imports. In exactly this population
 *     there are none: the manifest is the whole link. Naming the dependency
 *     here marks it load-bearing.
 *
 * Always informational. Doctor is a CI gate, and a project that acquired an
 * integration correctly has done nothing to warn about — the point is to say
 * what is loaded, never to push anyone into writing a config entry.
 *
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkImplicitIntegrations(ctx) {
  const id = 'implicit-integrations';
  const label = 'Implicitly linked integrations';

  if (ctx.integrations == null) {
    return {
      id,
      label,
      status: 'info',
      message: skippedBecause(ctx, 'the project configuration could not be read'),
    };
  }

  const implicit = ctx.integrations.filter(
    integration => integration.__autolinked,
  );
  // A dependency whose manifest cannot be loaded leaves no loaded record, so
  // without this line doctor would say no dependency ships a manifest at all.
  const unreadable = describeUnreadableManifests(ctx.autolinkFailures ?? []);

  if (implicit.length === 0) {
    // A record that carries `__loadError` (the package's own manifest, or a
    // configured one, that failed to load) loaded nothing, so it is not named
    // as loaded beside the line reporting that it could not be loaded.
    const loaded = ctx.integrations.filter(integration => !integration.__loadError);
    return {
      id,
      label,
      status: 'info',
      message:
        (loaded.length > 0
          ? describeNoImplicit(loaded)
          : ctx.integrations.length > 0 || unreadable
            ? 'None loaded.'
            : 'None — no installed dependency ships an astryx.integration.* manifest.') +
        unreadable,
    };
  }

  const described = implicit.map(integration => {
    const version = integration.version ? `@${integration.version}` : '';
    // An npm alias installs a package under a different key. The package's own
    // name is its identity; the KEY is what package.json says and what a
    // dependency sweep reads, so when they differ both have to be here.
    const alias =
      integration.__spec && integration.__spec !== integration.name
        ? ` (declared as "${integration.__spec}")`
        : '';
    // A declared root counts only when it exists: the manifest's keys are a
    // claim, and `integration-issues` reports the ones that are not true.
    const declared = [
      'components',
      'templates',
      'themes',
      'docs',
      'codemods',
      // An experimental root counts only in a project that opts in.
      ...(ctx.iconSets?.choice?.configured ? ['iconSets'] : []),
    ].filter(root => integration[/** @type {'components'} */ (root)]);
    const missing = declared.filter(root => {
      const dir = integration[/** @type {'components'} */ (root)];
      if (typeof dir !== 'string') return false;
      const base =
        typeof integration.__packageDir === 'string'
          ? integration.__packageDir
          : (ctx.cwd ?? process.cwd());
      return !fs.existsSync(path.isAbsolute(dir) ? dir : path.resolve(base, dir));
    });
    const roots = declared.filter(root => !missing.includes(root));
    const contributes = roots.length > 0 ? roots.join(', ') : 'nothing';
    const absent =
      missing.length > 0 ? ` (declared ${missing.join(', ')} missing on disk)` : '';
    return `${integration.name}${version}${alias} from ${integration.__dependencyField}, contributing ${contributes}${absent}`;
  });

  const plural = implicit.length === 1 ? '' : 's';
  return {
    id,
    label,
    status: 'info',
    message:
      `${implicit.length} integration${plural} loaded from installed ` +
      `dependencies with no astryx.config entry: ${described.join('; ')}.` +
      unreadable,
    fix:
      'Nothing to fix. Keep these dependencies installed. The CLI links them ' +
      'from package.json, so an unused-dependency check that looks only for ' +
      'source imports will report them as unused. Add them to `integrations` ' +
      'in astryx.config.* to make the link explicit.',
  };
}

/**
 * The sentence `implicit-integrations` adds for dependencies whose manifest
 * could not be loaded, or '' when there are none. Still informational: the
 * package is a dependency's own bug, which `doctor integration validate`
 * diagnoses, but doctor must not report it as absent.
 * @param {Array<{spec: string, error: string}>} failures
 * @returns {string}
 */
function describeUnreadableManifests(failures) {
  if (failures.length === 0) return '';
  const one = failures.length === 1;
  const listed = failures
    .map(({spec, error}) => {
      const reason = String(error).split('\n')[0].slice(0, 160);
      return `${spec} (${reason})`;
    })
    .join('; ');
  return (
    ` ${failures.length} installed ${one ? 'dependency ships' : 'dependencies ship'} ` +
    `an astryx.integration.* manifest that could not be loaded, so ${one ? 'it contributes' : 'they contribute'} ` +
    `nothing: ${listed}. Run \`${formatCliCommand('doctor integration validate <package>')}\` for details.`
  );
}

/**
 * Every integration named in astryx.config loads.
 *
 * A configured integration that cannot be loaded (not installed, no
 * manifest, or a manifest that throws or fails its schema) is withdrawn
 * whole, because none of its contribution roots is trustworthy
 * (spec:AST-035 FR9). The project then runs without something it asked
 * for, so this fails the CI gate.
 *
 * Two neighbours stay as they were. A problem inside one contribution kind
 * leaves the rest of the integration working, so `integration-issues` keeps
 * warning about it (spec:AST-035 FR9). An autolinked dependency that cannot
 * be loaded stays informational in `implicit-integrations`: the project did
 * not ask for it.
 *
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkConfiguredIntegrations(ctx) {
  const id = 'configured-integrations';
  const label = 'Configured integrations';
  if (ctx.integrations == null) {
    // The config check reports a config the CLI cannot load.
    return {
      id,
      label,
      status: 'info',
      message: skippedBecause(ctx, 'the project configuration could not be read'),
    };
  }
  // What counts as configured is what astryx.config names, read from the
  // provider ledger so a package set aside for a provider conflict, or the
  // package being authored when its own config names it, still counts.
  const configured =
    ctx.configuredIntegrations ??
    ctx.integrations
      .filter(integration => !integration.__autolinked && !integration.__local)
      .map(integration => ({
        spec: integration.__spec,
        label: integration.name ?? integration.__spec,
        error:
          integration.__loadError == null
            ? null
            : String(integration.__loadError),
      }));
  if (configured.length === 0) {
    return {
      id,
      label,
      status: 'info',
      message: 'No integration is named in astryx.config.',
    };
  }
  const plural = configured.length === 1 ? '' : 's';
  const withdrawn = configured.filter(entry => entry.error != null);
  if (withdrawn.length > 0) {
    const listed = withdrawn
      .map(
        entry =>
          `${entry.label} (${firstLine(String(entry.error)).slice(0, 160)})`,
      )
      .join('; ');
    return {
      id,
      label,
      status: 'fail',
      message:
        `${withdrawn.length} of ${configured.length} integration${plural} named in astryx.config could not be loaded, ` +
        `so ${withdrawn.length === 1 ? 'it contributes' : 'they contribute'} nothing: ${listed}.`,
      fix:
        `Install each one, fix its astryx.integration.* manifest (\`${formatCliCommand('doctor integration validate <package>', ctx.cwd)}\` says what is wrong), ` +
        'or remove it from `integrations` in astryx.config.',
    };
  }
  return {
    id,
    label,
    status: 'pass',
    message: `${configured.length} integration${plural} named in astryx.config loaded: ${configured.map(entry => entry.label).join(', ')}.`,
  };
}

/**
 * Why init writes no agent docs for `cwd`, or null when it does: the folder
 * it would write to is the home folder or the top of a settings folder in it.
 * @param {string} cwd
 * @returns {string | null}
 */
function agentDocsRefusal(cwd) {
  try {
    assertAgentDocsTarget(agentDocsTargetDir(cwd));
    return null;
  } catch (err) {
    return err instanceof Error && err.name === 'AgentDocsHomeError' ? err.message : null;
  }
}

/**
 * Check 7 — agent docs exist and contain the Astryx section markers.
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkAgentDocs(ctx) {
  // Every file init can write (one shared list), looked for in the working
  // directory, the project root, and the folder init writes them to: run from
  // src/ or a nested package, the docs sit at the root.
  const dirs = [
    ...new Set(
      [ctx.cwd, projectRootOf(ctx), resolveAgentDocsRoot(ctx.cwd) ?? ctx.cwd].map(dir =>
        path.resolve(dir),
      ),
    ),
  ];
  const present = dirs.flatMap(dir =>
    AGENT_DOC_PATHS.map(rel => path.join(dir, rel)).filter(abs =>
      fs.existsSync(abs),
    ),
  );
  /** @param {string} abs */
  const shown = abs => path.relative(ctx.cwd, abs) || path.basename(abs);
  // In the home folder, or at the top of a settings folder in it, init
  // writes no agent docs (INV31), so the fix is moving the project or a hand
  // edit, never init.
  const refusal = agentDocsRefusal(ctx.cwd);
  /** @param {string} initFix */
  const fixFor = initFix =>
    refusal
      ? `${refusal} Move the project into a folder of its own, or edit the Astryx block in its agent file by hand.`
      : initFix;

  if (present.length === 0) {
    return {
      id: 'agent-docs',
      label: 'AI agent docs',
      status: 'info',
      message: `No agent docs found: looked for ${AGENT_DOC_PATHS.join(', ')} in ${dirs.map(dir => path.relative(ctx.cwd, dir) || '.').join(' and ')}.`,
      fix: fixFor(
        `Generate agent docs with \`${getCliInvocation(ctx.cwd)} init --features agents\`.`,
      ),
    };
  }

  /** @param {string} abs */
  const read = abs => {
    try {
      return fs.readFileSync(abs, 'utf-8');
    } catch {
      return '';
    }
  };
  const withMarkers = present.filter(abs => {
    const content = read(abs);
    return (
      (content.includes('<!-- ASTRYX:START -->') || content.includes('<!-- XDS:START -->')) &&
      (content.includes('<!-- ASTRYX:END -->') || content.includes('<!-- XDS:END -->')) &&
      holdsAstryxBlock(content)
    );
  });

  // A managed block that only imports another file (init's GEMINI.md import
  // of AGENTS.md) is broken when that file holds no block: the agents that
  // read either file get no Astryx docs.
  const dangling = present.flatMap(abs => {
    const match = /<!-- ASTRYX:START -->\s*@(\S+)\s*<!-- ASTRYX:END -->/.exec(read(abs));
    if (match == null) return [];
    const target = path.resolve(path.dirname(abs), match[1]);
    return holdsAstryxBlock(read(target)) ? [] : [{abs, target}];
  });
  if (dangling.length > 0) {
    return {
      id: 'agent-docs',
      label: 'AI agent docs',
      status: 'fail',
      message: dangling
        .map(
          ({abs, target}) =>
            `${shown(abs)} imports ${shown(target)}, which holds no Astryx block, so agents that read them get no Astryx docs.`,
        )
        .join(' '),
      fix: fixFor(
        `Write the block again with \`${getCliInvocation(ctx.cwd)} init --features agents\`.`,
      ),
    };
  }

  if (withMarkers.length === 0) {
    return {
      id: 'agent-docs',
      label: 'AI agent docs',
      status: 'warn',
      message: `Agent docs present (${present.map(shown).join(', ')}) but no Astryx section markers found.`,
      fix: fixFor(
        `Add the Astryx section to your agent docs with \`${getCliInvocation(ctx.cwd)} init --features agents\`.`,
      ),
    };
  }

  return {
    id: 'agent-docs',
    label: 'AI agent docs',
    status: 'pass',
    message: `Astryx agent docs section present in ${withMarkers.map(shown).join(', ')}.`,
  };
}

/**
 * Check 8 — @astryxdesign/core peer dependencies are satisfied by installed packages.
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkPeerDeps(ctx) {
  if (!ctx.coreDir) {
    return {
      id: 'peer-deps',
      label: '@astryxdesign/core peer dependencies',
      status: 'info',
      message: 'Skipped — @astryxdesign/core is not installed.',
    };
  }

  const corePkg = readPkg(path.join(ctx.coreDir, 'package.json'));
  const peers = corePkg?.peerDependencies ?? {};
  const peerNames = Object.keys(peers);

  if (peerNames.length === 0) {
    return {
      id: 'peer-deps',
      label: '@astryxdesign/core peer dependencies',
      status: 'info',
      message: '@astryxdesign/core declares no peer dependencies.',
    };
  }

  const missing = [];
  /** @type {Array<{name: string, want: string, have: string}>} */
  const mismatched = [];
  for (const name of peerNames) {
    const want = peers[name];
    const installedDir = findInstalledPackage(ctx.cwd, name);
    if (!installedDir) {
      missing.push(`${name}@${want}`);
      continue;
    }
    // Present and version-readable: verify it actually satisfies the range,
    // not just that the package exists (a bare `npm install` can resolve an
    // out-of-range version from a stale consumer range and still "look" fine).
    const have = pkgVersion(installedDir);
    if (have && !satisfiesRange(have, want)) {
      mismatched.push({name, want, have});
    }
  }

  if (missing.length > 0 || mismatched.length > 0) {
    const problems = [];
    if (missing.length) problems.push(`missing: ${missing.join(', ')}`);
    if (mismatched.length) {
      problems.push(
        `out of range: ${mismatched
          .map(m => `${m.name}@${m.have} (needs ${m.want})`)
          .join(', ')}`,
      );
    }
    // Pin the required range for anything wrong so the hint fixes it even when a
    // stale consumer range would otherwise resolve an incompatible version.
    // Quote targets containing shell metacharacters (e.g. `react@>=19.0.0`).
    const quote = (/** @type {string} */ s) => (/[<>|() ]/.test(s) ? `'${s}'` : s);
    const targets = [...missing, ...mismatched.map(m => `${m.name}@${m.want}`)].map(quote);
    return {
      id: 'peer-deps',
      label: '@astryxdesign/core peer dependencies',
      status: 'warn',
      message: `Peer dependency issues — ${problems.join('; ')}.`,
      fix: `Install compatible peers: \`npm install ${targets.join(' ')}\`.`,
    };
  }

  return {
    id: 'peer-deps',
    label: '@astryxdesign/core peer dependencies',
    status: 'pass',
    message: `All peer dependencies satisfied (${peerNames.join(', ')}).`,
  };
}

/**
 * Summarize the combined integration graph, including cross-package warnings.
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkIntegrationIssues(ctx) {
  const issues = ctx.integrationIssues;
  if (issues == null) {
    return {
      id: 'integration-issues',
      label: 'Integration contributions',
      status: 'info',
      message: skippedBecause(
        ctx,
        'the project integration graph could not be loaded',
      ),
    };
  }
  if (issues.length === 0) {
    // "No problems" is a finding only when something was looked at.
    const checked = (ctx.integrations ?? []).filter(
      integration => integration.__loadError == null,
    );
    if (checked.length === 0) {
      return {
        id: 'integration-issues',
        label: 'Integration contributions',
        status: 'info',
        message:
          'No integration is loaded, so there are no integration contributions to check.',
      };
    }
    return {
      id: 'integration-issues',
      label: 'Integration contributions',
      status: 'pass',
      message: `${checked.length} loaded integration${checked.length === 1 ? '' : 's'} checked (${nameIntegrations(checked)}): contributions and cross-package relationships are valid.`,
    };
  }
  const errors = issues.filter(issue => issue.severity === 'error').length;
  const details = issues
    .map(issue => `${issue.package}: ${issue.message}`)
    .join(' | ');
  // This check is new, so it warns: a project that passed before keeps
  // passing (spec:AST-046 FR8). `astryx doctor integration` fails on errors.
  return {
    id: 'integration-issues',
    label: 'Integration contributions',
    status: 'warn',
    message: `${issues.length} integration issue(s)${errors > 0 ? `, ${errors} of them errors` : ''}: ${details}`,
    fix: `Run \`${formatCliCommand('doctor integration', ctx.cwd)}\` for package-specific diagnostics and resolve cross-package precedence in astryx.config.`,
  };
}

/**
 * The project's icon sets (AST-084 FR17). Fails when `experimental.iconSet` names a set
 * that is not installed, or one that is installed but withdrawn (with why);
 * warns when two or more sets are installed and none is the project's, and
 * for each other installed set that was withdrawn, with why.
 * Icon sets are experimental (spec:AST-017 FR27): only a project that sets
 * `experimental.iconSet` gets the check, so every other report is unchanged.
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck | null}
 */
export function checkIconSets(ctx) {
  const state = ctx.iconSets;
  const id = 'icon-sets';
  const label = 'Icon sets';
  if (state == null) return null;
  const {sets, withdrawn, choice} = state;
  // Only a project that opts in with `experimental.iconSet` gets the check.
  if (!choice.configured) return null;
  if (choice.status === 'missing') {
    return {
      id,
      label,
      status: 'fail',
      message: choice.reason,
      fix: 'Install the package that ships the set, or set experimental.iconSet in astryx.config to an installed set (`astryx experimental icon --list` names them).',
    };
  }
  if (choice.status === 'withdrawn') {
    return {
      id,
      label,
      status: 'fail',
      message: choice.reason,
      fix: 'Run `astryx integration check` in the package that ships the set, or install the module its data names; or set experimental.iconSet in astryx.config to a valid installed set (`astryx experimental icon --list` names them).',
    };
  }
  /** @type {string[]} */
  const problems = [];
  if (choice.status === 'ambiguous') problems.push(choice.reason);
  for (const each of withdrawn) problems.push(each.reason);
  if (problems.length > 0) {
    return {
      id,
      label,
      status: 'warn',
      message: problems.join(' | '),
      fix:
        choice.status === 'ambiguous'
          ? 'Set experimental.iconSet in astryx.config to "<package>/<set>" so templates use one set.'
          : 'Run `astryx integration check` in the package that ships the set, or install its module.',
    };
  }
  return {
    id,
    label,
    status: 'pass',
    message: `${sets.length} icon set${sets.length === 1 ? '' : 's'} installed. ${choice.reason}`,
  };
}

/**
 * Check 10 — report the detected package manager, and say so when the project's
 * own declaration disagrees with what is on disk.
 *
 * Two states are worth surfacing rather than guessing past, because in both the
 * commands the CLI prints can be silently wrong for the project:
 *
 * - FAIL: several lockfiles tie with nothing project-owned to break them.
 * - WARN: a `packageManager` field is declared and a lockfile it contradicts
 *   sits beside it. Astryx follows the declaration, so its own output is right;
 *   the warning is that a tool which follows the lockfile will install with
 *   something else, and that used to be reported as a healthy setup.
 *
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkPackageManager(ctx) {
  const {pm, ambiguous, dir, candidates, declared, strayLockfiles} =
    explainPackageManager(ctx.cwd);

  if (ambiguous) {
    return {
      id: 'package-manager',
      label: 'Package manager',
      status: 'fail',
      message: `Cannot tell which package manager this project uses: ${candidates.join(' and ')} lockfiles both sit in ${dir}, and nothing the project owns picks between them. Commands are printed with the neutral \`npx\` form until this is resolved.`,
      fix: `Add a \`packageManager\` field to ${dir}/package.json, or delete the lockfile that does not belong.`,
    };
  }

  if (declared && strayLockfiles.length > 0) {
    const files = strayLockfiles.map(lock => lock.file).join(' and ');
    const owners = [...new Set(strayLockfiles.map(lock => lock.pm))].join(
      ' and ',
    );
    return {
      id: 'package-manager',
      label: 'Package manager',
      status: 'warn',
      message: `This project declares \`packageManager: ${declared}\` in ${dir}/package.json, but ${files} also sits there. Astryx follows the declaration and prints ${pm} commands; anything that follows the lockfile instead will use ${owners}.`,
      fix: `Delete ${files} from ${dir} and reinstall with ${declared}, or change the \`packageManager\` field if ${owners} is what this project actually uses.`,
    };
  }

  return {
    id: 'package-manager',
    label: 'Package manager',
    status: 'info',
    message:
      pm !== 'npx'
        ? declared
          ? `Detected package manager: ${pm} (declared in ${dir}/package.json).`
          : `Detected package manager: ${pm}.`
        : 'No lockfile detected — defaulting to npm/npx.',
  };
}

/**
 * Check 6b — every contributing integration owns its provider identity.
 *
 * Artifact and document IDs are provider-scoped, so a package that claims a
 * provider ID an earlier-loaded package already holds is loaded inert: its
 * components, templates, themes, docs, and codemods are withdrawn while the
 * earlier package keeps contributing. That can be a deliberate transition
 * (a renamed package installed beside its predecessor), so it warns rather
 * than fails, but it is never allowed to happen quietly.
 *
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkProviderIdentity(ctx) {
  const id = 'provider-identity';
  const label = 'Integration provider identity';

  if (ctx.integrations == null) {
    return {
      id,
      label,
      status: 'info',
      message: skippedBecause(ctx, 'the project configuration could not be read'),
    };
  }

  const conflicts = ctx.integrations.filter(
    integration => integration.__providerConflict,
  );
  if (conflicts.length > 0) {
    return {
      id,
      label,
      status: 'warn',
      message: conflicts
        .map(integration => integration.__providerConflict?.message)
        .join(' '),
      fix:
        'Give each integration its own `providerId` in astryx.integration.*. ' +
        "A renamed package may keep its predecessor's ID only when the " +
        'predecessor is no longer installed.',
    };
  }

  const count = ctx.integrations.filter(
    integration =>
      integration.providerId != null && integration.__loadError == null,
  ).length;
  // An integration that could not be read has no provider ID to check, so the
  // count above is not a complete survey. Say so instead of counting silently.
  const unread = ctx.integrations.filter(
    integration => integration.__loadError != null,
  ).length;
  const unreadNote =
    unread === 0
      ? ''
      : unread === 1
        ? ' 1 loaded integration could not be read, so its provider ID is unknown.'
        : ` ${unread} loaded integrations could not be read, so their provider IDs are unknown.`;
  if (count === 0) {
    return {
      id,
      label,
      status: 'info',
      message:
        (unread === 0
          ? 'None — no loaded integration has a provider identity.'
          : 'No readable integration has a provider identity.') + unreadNote,
    };
  }
  return {
    id,
    label,
    status: 'pass',
    message:
      (count === 1
        ? '1 loaded integration has its own provider ID.'
        : `${count} loaded integrations each have their own provider ID.`) +
      unreadNote,
  };
}

/** @param {number} bytes */
const kilobytes = bytes => `${Math.ceil(bytes / 1024)} KB`;

/**
 * @param {string[]} problems
 * @returns {string}
 */
function joinProblems(problems) {
  return problems.length === 1
    ? problems[0]
    : `${problems.length} problems: ${problems.join('; ')}`;
}

/** How the self-doc audit's problems are fixed. */
const AUTHORING_DOCS_FIX =
  'List every authoring self-doc in AUTHORING_SELF_DOCS, fix the one that fails to load, and split a section that is too large.';

/** How the public-surface audit's problems are fixed. */
const AUTHORING_SURFACE_FIX =
  'Put a self-doc beside each module whose types @astryxdesign/cli/authoring exports and list it in AUTHORING_SELF_DOCS; export what each listed self-doc documents, or remove that self-doc.';

/** Types one problem names before it counts the rest. */
const NAMED_TYPES = 40;

/**
 * @param {string[]} names
 * @returns {string}
 */
function nameTypes(names) {
  return names.length <= NAMED_TYPES
    ? names.join(', ')
    : `${names.slice(0, NAMED_TYPES).join(', ')} and ${names.length - NAMED_TYPES} more`;
}

/**
 * The section keys the field reference lists (`astryx docs
 * authoring/field-reference --index`), read the way that command reads them.
 * @returns {Promise<{keys: Set<string>} | {keys: null, error: string}>}
 */
async function authoringTopicKeys() {
  try {
    const {AUTHORING_REFERENCE_ROUTE} =
      await import('../../foundation/discovery/authoring-self-docs.mjs');
    const catalog = DocsCatalog.fromBuiltins();
    const node = (await projectTree(catalog)).get(AUTHORING_REFERENCE_ROUTE);
    if (!node?.ref?.topicFile) {
      return {keys: null, error: 'the docs tree has no field reference'};
    }
    const index = indexView(await lowerTopic(catalog, guideEntry(node)));
    return {keys: new Set(index.sections.map(section => section.id))};
  } catch (err) {
    return {
      keys: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {Awaited<ReturnType<typeof import('../../foundation/discovery/authoring-surface.mjs').auditAuthoringSurface>>} surface
 * @returns {string[]}
 */
function surfaceProblems(surface) {
  /** @type {string[]} */
  const problems = [];
  if (surface.types === 0 && surface.untraced.length === 0) {
    problems.push(
      `@astryxdesign/cli/authoring exports no types, so nothing was compared with \`${formatCliCommand('docs authoring/field-reference')}\``,
    );
  }
  for (const {module, names, reason, source, key} of surface.unreadable) {
    const why =
      reason === 'no-self-doc'
        ? `no self-doc sits beside ${module}`
        : reason === 'unregistered'
          ? `${source} is not listed in AUTHORING_SELF_DOCS`
          : reason === 'failed'
            ? `${source} does not load`
            : `${source} renders section "${key}", which the topic's index does not list`;
    problems.push(
      `${nameTypes(names)} from ${module} ${names.length === 1 ? 'has' : 'have'} no doc in \`${formatCliCommand('docs authoring/field-reference')}\`: ${why}`,
    );
  }
  for (const {name, reason} of surface.untraced) {
    problems.push(
      `${name} cannot be traced to the module that declares it: ${reason}`,
    );
  }
  for (const {source, subject} of surface.unmatched) {
    problems.push(
      subject
        ? `${source} documents ${subject}, which @astryxdesign/cli/authoring does not export`
        : `${source} documents no type @astryxdesign/cli/authoring exports`,
    );
  }
  return problems;
}

/**
 * Every authoring self-doc is reachable from `astryx docs authoring`, loads,
 * and fits in one read, and every type `@astryxdesign/cli/authoring` exports
 * has its doc there: the self-doc beside the module that declares it. The
 * audits are imported here, inside the try, so a malformed self-doc is
 * reported rather than taking Doctor down.
 * @param {DoctorContext} [_ctx]
 * @param {{root?: string, sources?: string[], topicKeys?: Set<string> | null}} [options]
 *   Another authoring tree, list, or topic index to audit (for tests).
 * @returns {Promise<DoctorCheck>}
 */
export async function checkAuthoringDocs(_ctx, options = {}) {
  const id = 'authoring-docs';
  const label = 'Authoring docs';
  try {
    const {auditAuthoringSelfDocs} =
      await import('../../foundation/discovery/authoring-self-docs.mjs');
    const {auditAuthoringSurface} =
      await import('../../foundation/discovery/authoring-surface.mjs');
    const {root, sources} = options;
    const audit = await auditAuthoringSelfDocs({root, sources});
    const problems = [
      ...audit.unreachable.map(
        source => `${source} is not in \`${formatCliCommand('docs authoring/field-reference')}\``,
      ),
      ...audit.failed.map(
        ({source, error}) => `${source} failed to load: ${error}`,
      ),
      ...audit.oversized.map(
        ({key, bytes}) =>
          `authoring section "${key}" is ${kilobytes(bytes)}, over the ${kilobytes(DOC_OUTPUT_BUDGET_BYTES)} one read may return`,
      ),
    ];
    const topic =
      options.topicKeys === undefined
        ? await authoringTopicKeys()
        : {keys: options.topicKeys};
    const surface = [
      ...('error' in topic
        ? [`\`${formatCliCommand('docs authoring/field-reference')}\` could not be read: ${topic.error}`]
        : []),
      ...surfaceProblems(
        await auditAuthoringSurface({root, sources, topicKeys: topic.keys}),
      ),
    ];
    if (problems.length + surface.length > 0) {
      return {
        id,
        label,
        status: 'fail',
        message: joinProblems([...problems, ...surface]),
        fix: [
          problems.length > 0 ? AUTHORING_DOCS_FIX : null,
          surface.length > 0 ? AUTHORING_SURFACE_FIX : null,
        ]
          .filter(Boolean)
          .join(' '),
      };
    }
    return {
      id,
      label,
      status: 'pass',
      // Experimental schemas are checked like every other but are sections
      // of their experimental route, so the count is unchanged without them
      // (spec:AST-017 FR27).
      message: `All ${audit.sections} authoring schemas are readable in \`${formatCliCommand('docs authoring/field-reference')}\`.`,
    };
  } catch (err) {
    return {
      id,
      label,
      status: 'fail',
      message: `The authoring docs could not be audited: ${err instanceof Error ? err.message : String(err)}`,
      fix: 'Reinstall @astryxdesign/cli.',
    };
  }
}

/** How the CLI-docs audit's problems are fixed. */
const CLI_DOCS_FIX =
  "Set `namespace` on each CLI doc to the one that reads it: cli/commands for a command, cli/api for an API function or the output schema, error codes, and response types, and authoring for a file an author writes (and list it in AUTHORING_SELF_DOCS).";

/** How the docs-tree check's problems are fixed. */
const DOCS_TREE_FIX =
  'Fix each placement, adoption rule, or link the message names: a placement names a namespace of its own package, one of its slots, and a slot that accepts its kind; exactly one namespace adopts each doc; every route belongs to one doc; every link names a doc that exists, as `[<provider>:]<kind>:<name>`.';

/**
 * Every command, API function, schema, and enum doc the CLI ships declares a
 * namespace, and something reads it: the docs tree under `astryx docs cli`
 * for `cli/commands` and `cli/api`, `astryx docs authoring` for `authoring`.
 * @param {DoctorContext | Partial<DoctorContext>} _ctx
 * @param {{root?: string, sources?: string[], authoringSources?: string[]}} [options]
 *   test seams: the CLI root, the docs to audit, and the authoring topic's list
 * @returns {Promise<DoctorCheck>}
 */
export async function checkCliDocs(_ctx, options = {}) {
  const id = 'cli-docs';
  const label = 'CLI docs';
  try {
    const {auditCliSelfDocs} =
      await import('../../foundation/discovery/cli-self-docs.mjs');
    const audit = await auditCliSelfDocs(options);
    const problems = [
      ...audit.missing.map(
        source =>
          `${source} has no namespace, so no \`${formatCliCommand('docs')}\` topic reads it`,
      ),
      ...audit.unknown.map(
        ({source, namespace}) =>
          `${source} has namespace "${namespace}", which no \`${formatCliCommand('docs')}\` topic reads`,
      ),
      ...audit.misfiled.map(({message}) => message),
      ...audit.failed.map(
        ({source, error}) => `${source} failed to load: ${error}`,
      ),
      ...audit.oversized.map(
        ({key, bytes}) =>
          `CLI doc "${key}" is ${kilobytes(bytes)}, over the ${kilobytes(DOC_OUTPUT_BUDGET_BYTES)} one read may return`,
      ),
    ];
    if (problems.length > 0) {
      return {
        id,
        label,
        status: 'fail',
        message: joinProblems(problems),
        fix: CLI_DOCS_FIX,
      };
    }
    return {
      id,
      label,
      status: 'pass',
      // Experimental docs are checked like every other but not counted
      // (spec:AST-017 FR27).
      message: `All ${audit.docs - audit.experimental.docs} CLI docs are readable: ${audit.tree - audit.experimental.tree} in the \`${formatCliCommand('docs cli')}\` tree and ${audit.authoring - audit.experimental.authoring} in \`${formatCliCommand('docs authoring/field-reference')}\`.`,
    };
  } catch (err) {
    return {
      id,
      label,
      status: 'fail',
      message: `The CLI docs could not be audited: ${err instanceof Error ? err.message : String(err)}`,
      fix: 'Reinstall @astryxdesign/cli.',
    };
  }
}

/**
 * The docs tree builds with no error, and every CLI typed doc in a `cli/...`
 * group has a route in it (spec:AST-046): each placement names a namespace of
 * its own package and a slot that accepts it, exactly one namespace adopts
 * each doc, and each route belongs to one doc.
 * @param {DoctorContext | Partial<DoctorContext>} _ctx
 * @param {{tree?: import('../../foundation/doc-compiler/tree.mjs').DocsTree}} [options]
 *   test seam: a tree to check instead of the CLI's own
 * @returns {Promise<DoctorCheck>}
 */
export async function checkDocsTree(_ctx, options = {}) {
  const id = 'docs-tree';
  const label = 'Docs tree';
  try {
    const catalog =
      /** @type {any} */ (_ctx)?.docsCatalog ?? builtinCatalog();
    const tree = options.tree ?? (await projectTree(catalog, {fresh: true}));
    const problems = tree.diagnostics
      .filter(d => d.severity === 'error')
      .map(d => `${d.source ?? d.provider ?? 'docs tree'}: ${d.message}`);
    if (options.tree === undefined) {
      const {loadCliSelfDocs, CLI_DOC_NAMESPACES} =
        await import('../../foundation/discovery/cli-self-docs.mjs');
      const placed = new Set(
        [...tree.nodes.values()].map(
          node => `${node.provider}\u0000${node.kind}\u0000${node.name}`,
        ),
      );
      for (const {source, doc} of (await loadCliSelfDocs()).loaded) {
        if (CLI_DOC_NAMESPACES[doc.namespace]?.reader !== 'tree') continue;
        if (!placed.has(`@astryxdesign/cli\u0000${doc.type}\u0000${doc.name}`)) {
          problems.push(
            `${source} has namespace "${doc.namespace}", but no docs-tree namespace adopts it`,
          );
        }
      }
      // Every link between docs names a doc that exists (spec:AST-047 FR9):
      // typed fields, reference and workflow blocks, and inline links. A
      // reference block also includes all it names.
      for (const node of tree.nodes.values()) {
        for (const edge of typedEdges(tree, node).unresolved) {
          problems.push(`${node.route}: ${edge}`);
        }
      }
      problems.push(...(await docsLinkProblems(catalog, tree)));
      problems.push(
        ...(await docsLinkProblems(catalog, tree, {references: true})),
      );
    }
    // New findings warn: a project that passed before keeps passing
    // (0.6 compatibility), and the warning names what to fix.
    if (problems.length > 0) {
      return {
        id,
        label,
        status: 'warn',
        message: joinProblems(problems),
        fix: DOCS_TREE_FIX,
      };
    }
    // Experimental docs are checked like every other but not counted
    // (spec:AST-017 FR27).
    const nodes = [...tree.nodes.values()].filter(
      node => !isExperimentalTreeNode(tree, node),
    );
    const namespaces = nodes.filter(node => node.kind === 'namespace').length;
    return {
      id,
      label,
      status: 'pass',
      message: `The docs tree has ${nodes.length - namespaces} docs in ${namespaces} sections (${tree.roots().length} at the top), each at one route.`,
    };
  } catch (err) {
    return {
      id,
      label,
      status: 'warn',
      message: `The docs tree could not be built: ${err instanceof Error ? err.message : String(err)}`,
      fix: 'Reinstall @astryxdesign/cli.',
    };
  }
}


/**
 * Every topic reads progressively, in every language it ships: it loads, its
 * section index and each of its sections fit in one read, and no contributed
 * doc is invalid.
 * @param {DoctorContext | Partial<DoctorContext>} ctx
 * @returns {Promise<DoctorCheck>}
 */
export async function checkDocsProgressiveDisclosure(ctx) {
  const id = 'docs-progressive-disclosure';
  const label = 'Documentation navigation and size';
  const budget = kilobytes(DOC_OUTPUT_BUDGET_BYTES);
  /** @type {string[]} */
  const problems = [];
  if (ctx.docsCatalogError) {
    problems.push(`The docs catalog could not be built: ${ctx.docsCatalogError}`);
  }
  for (const issue of ctx.docsCatalogIssues ?? []) {
    problems.push(`${issue.package ?? 'a contributed doc'}: ${issue.message}`);
  }
  let topics = 0;
  const catalog = ctx.docsCatalog;
  if (catalog) {
    // A guide the docs tree places is a topic read by its route; it is held
    // to the same budget as every flat topic.
    const tree = await projectTree(catalog);
    const placed = [...tree.nodes.values()]
      // A flat topic in a topic level is checked above, as a topic.
      .filter(node => node.kind === 'generic' && !node.ref?.flatTopic);
    // An experimental guide is checked but not counted (spec:AST-017 FR27).
    const uncounted = new Set(
      placed
        .filter(node => isExperimentalTreeNode(tree, node))
        .map(node => node.route),
    );
    const guides = placed.map(guideEntry);
    for (const entry of [...catalog.entries(), ...guides]) {
      for (const lang of [null, ...overlayLanguages(entry)]) {
        const where = lang ? `${entry.name} [${lang}]` : entry.name;
        try {
          const doc = detailView(await compileTopic(catalog, entry, lang));
          if (lang == null && !uncounted.has(entry.name)) topics += 1;
          const indexBytes = docsIndexBytes(buildDocsIndexData(doc));
          if (indexBytes > DOC_OUTPUT_BUDGET_BYTES) {
            problems.push(
              `${where}: its section index is ${kilobytes(indexBytes)}, over the ${budget} one read may return`,
            );
          }
          for (const over of oversizedDocSections(doc.sections)) {
            problems.push(
              `${where} ${over.key}: ${kilobytes(over.bytes)}, over the ${budget} one read may return`,
            );
          }
        } catch (err) {
          problems.push(
            `${where}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }
  if (problems.length > 0) {
    return {
      id,
      label,
      status: 'warn',
      message: joinProblems(problems),
      fix: 'Fix the doc each problem names; split a section that is too large into smaller ones, each with its own key.',
    };
  }
  return {
    id,
    label,
    status: 'pass',
    message: `${topics} topics: every section index and section fits in one ${budget} read.`,
  };
}

/**
 * Check 11 — the command every printed command starts with, and a warning when
 * loaded integrations declare different ones (their `cliCommand`). Then the
 * picker uses neither, so commands fall back to the package-manager guess.
 *
 * @param {DoctorContext} ctx
 * @returns {DoctorCheck}
 */
export function checkCliCommand(ctx) {
  const id = 'cli-command';
  const label = 'CLI command';
  const {command, conflict, declared} = chooseDeclaredCliCommand(
    declaredCliCommandsOf(ctx.integrations ?? []),
  );
  if (conflict) {
    const claims = declared
      .map(entry => `${entry.package} (\`${entry.command}\`)`)
      .join(', ');
    return {
      id,
      label,
      status: 'warn',
      message: `Loaded integrations declare different CLI commands: ${claims}. Neither is used, so printed commands start with \`${guessCliInvocation(ctx.cwd)}\`.`,
      fix: 'Remove the integration that does not belong here, or have every package declare the same `cliCommand` in its astryx.integration manifest.',
    };
  }
  if (command) {
    const packages = declared.map(entry => entry.package).join(', ');
    return {
      id,
      label,
      status: 'pass',
      message: `Printed commands start with \`${command}\`, the cliCommand of ${packages}.`,
    };
  }
  return {
    id,
    label,
    status: 'info',
    message: `No loaded integration declares a cliCommand, so printed commands start with \`${getCliInvocation(ctx.cwd)}\`.`,
  };
}

/* ── outside a project: the computer ─────────────────────────────────── */

/**
 * What a computer check reads: the running Node, the release that answered
 * (`meta.answeredBy`), and the newest release the computer knows of.
 * @typedef {object} ComputerContext
 * @property {string} nodeVersion
 * @property {{cli: string, core: string | null, copy: string}} answeredBy
 * @property {string | null} latest the newest release known, or null
 * @property {Array<{path: string, state: import('../../foundation/agent-docs/computer-agent-text.mjs').ComputerAgentTextState}>} [agentText]
  *   each file of the computer-level agent text against this release's rendering
 * @property {import('../../foundation/env/user-settings.mjs').ComputerAgentTextSettings} [agentTextSettings]
 *   the person's choices about the computer-level agent text
 * @property {string | null} [agentTextCommand] the command the skill file
 *   tells agents to run, or null
 * @property {string | null} [agentTextInstall] the install step the skill
 *   file records for when that command is not found, or null
  * @property {string} [cwd] the folder doctor runs in, for the printed fix
 * @property {import('../../foundation/release/notices.mjs').GlobalBehind | null} [globalBehind]
 *   the CLI installed for the computer, when it is older than the newest
 *   release (outside a project)
 * @property {import('../../foundation/release/notices.mjs').ProjectLag | null} [projectLag]
 *   the project's release, when it is behind the newest (inside a project)
 * @property {{key: string, reason: string, at: number} | null} [lastNoticeSkip]
 * @property {{at: number, reason: string} | null} [lastCheckFailure] why the
 *   last update check did not reach the registry, after the last that did
 *   the newest update notice that did not print, and why (diagnostic only)
 * @property {{pid: number | null, host: string | null, since: number} | null} [stateLock]
 *   who holds the state file's lock now (diagnostic only)
  * @property {Array<import('../../foundation/env/search-path.mjs').SearchPathCommand & {upgrade?: string | null, runner?: boolean}>} [searchPathCommands]
 *   every `astryx` on the search path, with the command that upgrades it
 *   the `astryx` commands on the search path, in order
 * @property {import('../../foundation/integrations/computer-integrations.mjs').ComputerIntegrationCandidate[]} [computerIntegrations]
 *   the integrations installed beside the running CLI
 * @property {string[]} [loadedComputerIntegrations] the names of those that
 *   loaded outside a project
 * @property {string[]} [folderIntegrations] the names of the integrations the
 *   folder loads itself, whose copies win over the computer's
 */

/**
 * The release that answered this run outside a project, and the Core it
 * reads from.
 * @param {ComputerContext} ctx
 * @returns {DoctorCheck}
 */
export function checkAnsweringRelease(ctx) {
  const {cli, core} = ctx.answeredBy;
  return {
    id: 'answering-release',
    label: 'Release that answered',
    status: core ? 'pass' : 'info',
    message: `${
      core
        ? `CLI ${cli} with Core ${core} answered, outside a project.`
        : `CLI ${cli} answered, outside a project. It installs Core ${cli} into the per-user cache the first time a command needs it.`
    } How each folder is answered: \`${formatCliCommand('astryx docs global', ctx.cwd)}\`.`,
  };
}

/**
 * The newest release this computer knows of, beside the one that answered
 * (spec AST-081 FR10). Runs inside and outside a project, and is always
 * info. Inside one, a release behind the newest names the install and
 * upgrade commands; outside one, a CLI installed for the computer that is
 * behind names the command of the package manager that installed it, after
 * the Node it needs when the computer runs an older one. Doctor installs
 * nothing.
 * @param {ComputerContext} ctx
 * @returns {DoctorCheck}
 */
export function checkNewestRelease(ctx) {
  const check = newestReleaseCheck(ctx);
  const notes = [
    checkFailureNote(ctx.lastCheckFailure),
    skipNote(ctx.lastNoticeSkip),
    lockNote(ctx.stateLock),
  ].filter(Boolean);
  return notes.length > 0 ? {...check, message: [check.message, ...notes].join(' ')} : check;
}

/**
 * The note on a state-file lock held right now, which keeps notices from
 * being recorded (diagnostic only).
 * @param {{pid: number | null, host: string | null, since: number} | null | undefined} lock
 * @returns {string | null}
 */
function lockNote(lock) {
  if (!lock) return null;
  const by = lock.pid == null ? '' : ` by process ${lock.pid}${lock.host ? ` on ${lock.host}` : ''}`;
  return `The state file's lock is held${by} since ${new Date(lock.since).toISOString()}.`;
}

/**
 * The note on an update check that did not reach the registry (diagnostic
 * only): no check, no notices.
 * @param {{at: number, reason: string} | null | undefined} failed
 * @returns {string | null}
 */
function checkFailureNote(failed) {
  if (!failed) return null;
  const why =
    failed.reason === 'npm-missing'
      ? 'npm could not be started'
      : failed.reason === 'bad-reply'
        ? "npm's answer named no release"
        : failed.reason.startsWith('npm-failed: ')
          ? `npm failed (${failed.reason.slice('npm-failed: '.length)}); its registry and proxy settings decide where it asks`
          : failed.reason;
  return `The last update check, ${new Date(failed.at).toISOString()}, did not reach the registry: ${why}.`;
}

/** What a recorded notice skip's reason means, for doctor's update line. */
const SKIP_REASONS = {
  'already-shown': 'it had already printed that day',
  'no-newer': 'no newer release was known',
  'no-project': 'the folder belongs to no Astryx project, so no install command fits',
};

/**
 * The note on the last update notice that did not print, for diagnosis
 * (diagnostic state, not a contract).
 * @param {{key: string, reason: string, at: number} | null | undefined} skip
 * @returns {string | null}
 */
function skipNote(skip) {
  if (!skip) return null;
  const why = /** @type {Record<string, string>} */ (SKIP_REASONS)[skip.reason] ?? skip.reason;
  return `Last update notice skipped ${new Date(skip.at).toISOString()} (${skip.key}): ${why}.`;
}

/**
 * {@link checkNewestRelease} without the skip note.
 * @param {ComputerContext} ctx
 * @returns {DoctorCheck}
 */
function newestReleaseCheck(ctx) {
  const {latest, globalBehind: behind, projectLag: lag} = ctx;
  const {cli} = ctx.answeredBy;
  const base = {id: 'newest-release', label: 'Newest release', status: /** @type {const} */ ('info')};
  if (behind) {
    return {
      ...base,
      message: `${availableLine(behind.current, behind.newest)}. The CLI installed for the computer stays on its release until you upgrade it.`,
      fix: `${upgradeLine(behind.command, behind.node)}.`,
    };
  }
  if (lag) {
    return {
      ...base,
      message: `This project uses Astryx ${lag.current}; ${lag.newest} is the newest.`,
      fix: `${upgradeLine(`${lag.install}, then ${lag.upgrade}`, lag.node)}.`,
    };
  }
  if (!latest) {
    return {
      ...base,
      message: 'Update check: not run yet, so the newest release is not known here; it runs in the background once a day, after a command.',
    };
  }
  if (isValidSemver(latest) && isValidSemver(cli) && semverCompare(latest, cli) > 0) {
    return {
      ...base,
      message: `Release ${latest} is newer than ${cli}, the release that answered.`,
    };
  }
  return {...base, message: `No newer release is known: the newest is ${latest}.`};
}

/**
 * The `astryx` commands on the search path (spec AST-081 FR11): the first is
 * the one a shell runs. Warns when it is not the Astryx CLI, or is a release
 * that predates the hand-off and so answers every folder itself.
 * @param {ComputerContext} ctx
 * @returns {DoctorCheck}
 */
export function checkCliOnPath(ctx) {
  const rows = ctx.searchPathCommands ?? [];
  const base = {id: 'cli-on-path', label: '`astryx` on the search path'};
  const describe = (/** @type {import('../../foundation/env/search-path.mjs').SearchPathCommand} */ row) =>
    row.astryx ? `${row.file} (CLI ${row.version ?? 'of unknown version'})` : `${row.file} (not the Astryx CLI)`;
  const others = rows.slice(1);
  const othersNote = others.length > 0 ? ` Later on the search path: ${others.map(describe).join(', ')}.` : '';
  const [first] = rows;
  if (!first) {
    return {
      ...base,
      status: 'info',
      message: 'No `astryx` command on the search path, so `astryx` runs only through a package manager.',
      fix: 'To run the CLI in any folder, install it for the computer: `npm i -g @astryxdesign/cli`.',
    };
  }
  if (!first.astryx) {
    return {
      ...base,
      status: 'warn',
      message: `The first \`astryx\` on the search path, ${first.file}, is not the Astryx CLI, so \`astryx\` runs another program.${othersNote}`,
      fix: 'Remove that program from the search path, or put the folder of the CLI installed for the computer before it.',
    };
  }
  if (first.handsOff === false) {
    return {
      ...base,
      status: 'warn',
      message: `The first \`astryx\` on the search path, ${first.file}, runs CLI ${first.version ?? 'of unknown version'}, which predates the hand-off and answers every folder itself.${othersNote}`,
      fix: `To upgrade, run: \`${first.upgrade ?? 'npm i -g @astryxdesign/cli@latest'}\`.`,
    };
  }
  return {
    ...base,
    status: 'pass',
    message: `\`astryx\` runs ${describe(first)}.${othersNote}`,
  };
}

/**
 * The computer-level agent text (spec AST-081 FR4, FR8): turned off, present
 * and equal to this release's rendering, present but different, or absent,
 * for the files the chosen agents read. Always `info`: the text is optional,
 * so it never warns or fails. A file Astryx did not write counts as absent,
 * and a file a person edited is named; both are kept as they are.
 * @param {ComputerContext} ctx
 * @returns {DoctorCheck}
 */
export function checkComputerAgentText(ctx) {
  const state = ctx.agentTextSettings && ctx.agentText ? null : computerAgentTextState();
  const settings = ctx.agentTextSettings ?? /** @type {NonNullable<typeof state>} */ (state).settings;
  const base = {
    id: 'computer-agent-text',
    label: 'Computer-level agent text',
    status: /** @type {const} */ ('info'),
  };
  if (!settings.install) {
    return {
      ...base,
      message: 'The computer-level agent text is turned off (`astryx init --user --remove-agents`), so the CLI installed for the computer does not write it.',
      fix: `To turn it back on, run \`${formatCliCommand('astryx init --user', ctx.cwd)}\`.`,
    };
  }
  const entries = ctx.agentText ?? /** @type {NonNullable<typeof state>} */ (state).entries;
  const command = ctx.agentText ? (ctx.agentTextCommand ?? null) : /** @type {NonNullable<typeof state>} */ (state).command;
  const recorded = (ctx.agentText ? ctx.agentTextInstall : /** @type {NonNullable<typeof state>} */ (state).install) ?? null;
  const fix = `Run \`${formatCliCommand('astryx init --user', ctx.cwd)}\`.`;
  const [file, ...links] = entries;
  const home = (/** @type {{path: string}} */ e) => displayHomePath(e.path);
  const linked = links.filter(l => l.state === 'linked').map(home);
  const copied = links.filter(l => l.state === 'current').map(home);
  const skipped = links.filter(l => l.state === 'foreign' || l.state === 'edited').map(home);
  const dangling = links.filter(l => l.state === 'dangling').map(home);
  const missing = links.filter(l => l.state === 'absent' || l.state === 'differs').map(home);
  const linkNote =
    (linked.length > 0 ? ` Linked into: ${linked.join(', ')}.` : '') +
    (copied.length > 0 ? ` Copied into: ${copied.join(', ')}.` : '') +
    (skipped.length > 0 ? ` Not linked, because something Astryx did not create is there: ${skipped.join(', ')}.` : '') +
    (dangling.length > 0 ? ` Linked, but the skill folder the link points to is not there, so agents reading it see nothing (as in a container that mounts only that folder): ${dangling.join(', ')}.` : '') +
    (missing.length > 0 ? ` Not linked yet: ${missing.join(', ')}.` : '');
  if (file.state === 'foreign' || file.state === 'edited') {
    return {
      ...base,
      message: `${home(file)} ${file.state === 'edited' ? 'was edited since Astryx wrote it' : 'was not written by Astryx'}, so it is left as it is (delete it to get the current text).${linkNote}`,
    };
  }
  if (file.state === 'absent') {
    return {
      ...base,
      message: `No computer-level agent text: agents outside a project with Astryx agent docs do not know Astryx is here.${linkNote}`,
      fix,
    };
  }
  const current = file.state === 'current';
  const status = `${current ? 'The computer-level agent text matches this release' : "The computer-level agent text differs from this release's"}: ${home(file)}.`;
  // The skill outlives the CLI it names when the home folder outlasts the
  // folder the CLI is installed in, as on a machine whose system folders
  // reset on restart. Reported only when no `astryx` command is on the search
  // path at all, apart from a package runner's own copy, which it puts first
  // only for the run it starts (the way back when the global CLI is gone).
  // Any other `astryx`, even one the scan cannot trace to the package, such
  // as the shim of Volta, asdf or mise, may well run the CLI, so doctor stays
  // quiet here and cli-on-path reports what it can; never a false "gone".
  // The reinstalled copy refreshes the text too.
  const rows = ctx.searchPathCommands;
  if (command === COMPUTER_COMMAND && rows && !rows.some(r => !r.runner)) {
    return {
      ...base,
      message: `${status} It tells agents to run \`${COMPUTER_COMMAND}\`, but no \`${COMPUTER_COMMAND}\` command is on the search path, so agents that read it find no CLI to run (as when a restart removes the CLI installed for the computer and keeps the home folder).${linkNote}`,
      fix: recorded
        ? `Run \`${recorded}\`, the step the skill names for when \`${COMPUTER_COMMAND}\` is not found.`
        : `Install it for the computer: \`${COMPUTER_INSTALL_STEP}\`.`,
    };
  }
  return {
    ...base,
    message: `${status}${linkNote}`,
    ...(!current || missing.length > 0 || dangling.length > 0 ? {fix} : {}),
  };
}

/**
 * The integrations installed for the computer (spec AST-081 FR12). Outside a
 * project: each one that loads, and a warning for each that is skipped
 * because its peer ranges exclude the answering release, or fails to load.
 * @param {ComputerContext} ctx
 * @returns {DoctorCheck}
 */
export function checkComputerIntegrations(ctx) {
  const found = ctx.computerIntegrations ?? [];
  const loaded = new Set(ctx.loadedComputerIntegrations ?? []);
  const base = {id: 'computer-integrations', label: 'Integrations installed for this computer'};
  if (found.length === 0) {
    return {
      ...base,
      status: 'info',
      message: 'No integration is installed beside the CLI installed for this computer.',
    };
  }
  const label = (/** @type {{name: string, version?: string}} */ c) => (c.version ? `${c.name}@${c.version}` : c.name);
  const own = new Set(ctx.folderIntegrations ?? []);
  const shadowed = found.filter(c => own.has(c.name));
  const rest = found.filter(c => !own.has(c.name));
  const used = rest.filter(c => !c.incompatible && loaded.has(c.name));
  const skipped = rest.filter(c => c.incompatible);
  const failed = rest.filter(c => !c.incompatible && !loaded.has(c.name));
  const notes = [
    used.length > 0 ? `Used outside a project: ${used.map(label).join(', ')}.` : '',
    ...shadowed.map(c => `${label(c)} is not used here: this folder loads its own copy of ${c.name}.`),
    ...skipped.map(c => `Skipped ${label(c)}: ${c.incompatible}.`),
    ...failed.map(c => `${label(c)} could not be loaded.`),
  ].filter(Boolean);
  const fixes = [
    ...skipped.map(c => `install a release of ${c.name} that supports this CLI`),
    ...failed.map(c => `run \`${formatCliCommand(`astryx doctor integration validate ${c.name}`, ctx.cwd)}\``),
  ];
  return {
    ...base,
    status: skipped.length + failed.length > 0 ? 'warn' : 'pass',
    message: notes.join(' '),
    ...(fixes.length > 0 ? {fix: `To fix: ${fixes.join('; ')}.`} : {}),
  };
}

/**
 * Inside a project, the integrations installed for the computer that the
 * project does not install: available, never used (spec AST-081 FR12).
 * Always info.
 * @param {{installed: Set<string>, candidates: import('../../foundation/integrations/computer-integrations.mjs').ComputerIntegrationCandidate[], install: ((name: string) => string) | null, elsewhere?: boolean}} input
 *   `install`: the command that adds a package with the project's package
 *   manager (read by the adapter); null when the folder belongs to no
 *   project, or `elsewhere`: its package.json is not the project's, where the
 *   fix points at the project's folder
 * @returns {DoctorCheck}
 */
export function checkComputerIntegrationsAvailable({installed, candidates, install, elsewhere = false}) {
  const available = candidates.filter(c => !installed.has(c.name));
  const base = {id: 'computer-integrations', label: 'Integrations installed for this computer', status: /** @type {const} */ ('info')};
  if (available.length === 0) {
    return {...base, message: 'No integration installed for this computer is missing from this project.'};
  }
  const add = install;
  return {
    ...base,
    message: `Installed for this computer but not in this project, so not used here: ${available.map(c => c.name).join(', ')}.`,
    ...(add
      ? {fix: `To use one in this project, run ${available.map(c => `\`${add(c.name)}\``).join(' or ')}.`}
      : elsewhere
        ? {fix: NO_PROJECT_FIX}
        : {}),
  };
}

/**
 * The checks doctor runs outside a project, in order.
 * @type {Array<(ctx: ComputerContext) => DoctorCheck>}
 */
export const COMPUTER_CHECKS = [
  ctx =>
    checkNodeVersion({
      cwd: '',
      nodeVersion: ctx.nodeVersion,
      coreDir: null,
      configPath: null,
    }),
    checkAnsweringRelease,
  checkNewestRelease,
    checkCliOnPath,
  checkComputerIntegrations,
  checkComputerAgentText,
];

/**
 * Doctor outside a project: the computer, never the folder.
 * @param {string} cwd
 * @returns {Promise<DoctorReport>}
 */
async function runComputerChecks(cwd) {
  /** @type {ComputerContext} */
  const ctx = {
    nodeVersion: process.versions.node,
    cwd,
    ...releaseFacts(cwd, {project: false}),
  };
  Object.assign(ctx, await computerIntegrationsOutside(cwd));
  const checks = COMPUTER_CHECKS.map(fn => fn(ctx));
  const summary = {pass: 0, warn: 0, fail: 0, info: 0};
  for (const c of checks) summary[c.status] += 1;
  return {checks, summary};
}

/**
 * Ordered list of synchronous check functions. Append here to add a check.
 * (checkConfig is async and is awaited separately by {@link runChecks}.)
 * A check that returns null does not apply to the project and is left out.
 * @type {Array<(ctx: DoctorContext) => DoctorCheck | null>}
 */
export const SYNC_CHECKS = [
  checkNodeVersion,
  checkCoreInstalled,
  checkVersionAlignment,
  checkImplicitIntegrations,
  checkConfiguredIntegrations,
  checkProviderIdentity,
  checkIntegrationIssues,
  checkIconSets,
  checkAgentDocs,
  checkPeerDeps,
  checkPackageManager,
  checkCliCommand,
];

/**
 * Run all diagnostic checks and return a structured report.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Directory to diagnose (default: process.cwd()).
 * @param {string} [options.built] - A finished build to check for Astryx
 *   use: a project folder, a build output folder, or one built file
 *   (built-checks.mjs). Without it, the checks are unchanged.
 * @returns {Promise<DoctorReport>}
 */
export async function runChecks(options = {}) {
  if (options.built != null) {
    const {built, ...rest} = options;
    const report = await runChecks(rest);
    const cwd = rest.cwd ?? process.cwd();
    const checks = [
      ...report.checks,
      ...checkBuilt(built, {cwd, packages: builtIntegrationPackages(built, cwd)}),
    ];
    const summary = {pass: 0, warn: 0, fail: 0, info: 0};
    for (const c of checks) summary[c.status] += 1;
    return {checks, summary};
  }
  const cwd = options.cwd ?? process.cwd();
  if (outsideProject(cwd)) return runComputerChecks(cwd);
  const coreDir = findProjectCoreDir(cwd);
  // findConfigPath throws when multiple config files coexist. That's a
  // misconfiguration doctor exists to report — catch it and surface it through
  // checkConfig as a FAIL rather than crashing the whole diagnostic engine.
  let configPath = null;
  let configError = null;
  try {
    configPath = findConfigPath(cwd);
  } catch (err) {
    configError = /** @type {Error} */ (err);
  }

  // Resolve integrations the project actually loaded (best-effort; never throws).
  /** @type {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]|null} */
  let integrations = null;
  // A docs read falls back to the built-in topics when the project cannot be
  // read, so the docs checks do too; the config check reports the config.
  /** @type {DocsCatalog|null} */
  let docsCatalog = DocsCatalog.fromBuiltins();
  /** @type {Array<{package?: string, code: string, message: string}>} */
  let docsCatalogIssues = [];
  /** @type {string|null} */
  let docsCatalogError = null;
  /** @type {Array<{package: string, code: string, severity: 'warning'|'error', message: string}>|null} */
  let integrationIssues = null;
  /** @type {Array<{spec: string, error: string}>|null} */
  let autolinkFailures = null;
  /** @type {Array<{spec: string, label: string, error: string|null}>|null} */
  let configuredIntegrations = null;
  /** @type {string|null} */
  let projectError = null;
  /** @type {DoctorContext['iconSets']} */
  let iconSets = null;
  /** @type {import('../../foundation/config/project.mjs').Project | null} */
  let project = null;
  try {
    // Doctor judges the project, so it reads only the Core the project
    // installed, never a carried one (spec AST-081 FR3).
    project = await Project.load(cwd, {core: 'project'});
  } catch (err) {
    // A project the CLI cannot load leaves the checks that need it
    // skipped. The reason is kept: those checks and the config
    // check quote it, so a skip is never silent.
    projectError = err instanceof Error ? err.message : String(err);
  }
  if (project) {
    try {
      integrations = project.loadedIntegrations;
      // An installed dependency whose manifest cannot be loaded is kept out of
      // loadedIntegrations on purpose. The provider ledger still records it.
      const ledgerMap = providerLedgerOf(project);
      const ledger = [...ledgerMap.values()];
      // The package that stands for a configured name: when the package
      // being authored replaces the configured copy, the authored package's
      // outcome is the one that matters, so a broken authored manifest fails
      // the check even though the configured copy itself loaded. A package
      // set aside for a provider conflict keeps its own outcome.
      /** @param {import('../../foundation/integrations/provider-resolution.mjs').ProviderLedgerEntry} entry */
      const standsFor = entry => {
        let current = entry;
        const seen = new Set();
        while (
          current.outcome === 'set-aside' &&
          current.reason === 'replaced-by-authored' &&
          current.winner != null &&
          !seen.has(current.winner) &&
          ledgerMap.has(current.winner)
        ) {
          seen.add(current.winner);
          current = /** @type {typeof entry} */ (ledgerMap.get(current.winner));
        }
        return current;
      };
      // Every package a configured name reached, however it was resolved.
      configuredIntegrations = ledger
        .filter(entry =>
          entry.refs.some(
            ref => ref.source === 'configured' && ref.repeat !== true,
          ),
        )
        .map(entry => {
          const ref = entry.refs.find(
            candidate => candidate.source === 'configured',
          );
          const effective = standsFor(entry);
          // When node_modules/<name> links back to the package being authored,
          // the configured and local candidates share one real path and one
          // entry whose outcome is the set-aside; the authored (`local`)
          // candidate on that entry carries the load error, so it is the
          // outcome that counts. Reading it from the ref, not by comparing
          // paths, holds whether or not the working directory is itself a
          // symlink.
          const authored = effective.refs.find(
            candidate => candidate.source === 'local',
          );
          const authoredError =
            authored?.integration?.__loadError ?? authored?.error ?? null;
          const loadError =
            effective.outcome === 'load-failed'
              ? (effective.error ?? 'its manifest could not be loaded')
              : authoredError != null
                ? String(authoredError)
                : null;
          return {
            spec: ref?.spec ?? entry.label,
            label: entry.integration?.name ?? ref?.spec ?? entry.label,
            error: loadError,
          };
        });
      autolinkFailures = ledger
        .filter(
          entry =>
            entry.outcome === 'load-failed' &&
            entry.candidate.source === 'autolinked',
        )
        .map(entry => ({
          spec: entry.candidate.spec ?? entry.label,
          error: entry.error ?? 'its manifest could not be loaded',
        }));
      try {
        docsCatalog = await project.docs();
        docsCatalogIssues = (await project.issues()).filter(
          issue => issue.code === 'invalid_doc',
        );
      } catch (err) {
        docsCatalog = null;
        docsCatalogError = err instanceof Error ? err.message : String(err);
      }
      try {
        iconSets = await project.iconSets();
      } catch {
        iconSets = null;
      }
      integrationIssues = await project.issues();
    } catch {
      // Best-effort: once the project has loaded, a later read that throws
      // leaves the remaining fields at their defaults. It is no reason to
      // blame the config, so it never becomes projectError.
    }
  }

  /** @type {DoctorContext} */
  const ctx = {
    cwd,
    nodeVersion: process.versions.node,
    coreDir,
    ownCli: projectHasOwnCli(cwd),
    projectCore: projectCoreVersion(cwd),
    configPath,
    integrations,
    docsCatalog,
    docsCatalogIssues,
    docsCatalogError,
    integrationIssues,
    autolinkFailures,
    configuredIntegrations,
    configError,
    projectError,
    iconSets,
  };

  /** @type {DoctorCheck[]} */
  const checks = [];
  // Run the theme checks and config check after the environment checks. The
  // released `themes` check keeps its place, ahead of the app-theme checks.
  for (const fn of SYNC_CHECKS) {
    const check = fn(ctx);
    if (check) checks.push(check);
    if (fn === checkVersionAlignment) {
      const appThemeChecks = await checkAppThemes(cwd);
      checks.push(checkThemes(cwd, appThemeChecks), ...appThemeChecks);
      checks.push(await checkConfig(ctx));
    }
  }
  const facts = releaseFacts(cwd, {project: true});
  checks.push(
    checkNewestRelease({
      nodeVersion: ctx.nodeVersion,
      answeredBy: facts.answeredBy,
      latest: facts.latest,
      projectLag: facts.projectLag,
      lastNoticeSkip: facts.lastNoticeSkip,
      lastCheckFailure: facts.lastCheckFailure,
      stateLock: facts.stateLock,
    }),
  );
  checks.push(
    checkCliOnPath({
      nodeVersion: ctx.nodeVersion,
      answeredBy: facts.answeredBy,
      latest: null,
      searchPathCommands: facts.searchPathCommands,
    }),
  );
  {
    const loadedNames = (project?.loadedIntegrations ?? []).map((/** @type {{name: string}} */ i) => i.name);
    const candidates = await computerIntegrationsToAdd(cwd, loadedNames);
    checks.push(checkComputerIntegrationsAvailable({installed: new Set(loadedNames), candidates, install: installCommandFor(cwd), elsewhere: insideProjectElsewhere(cwd)}));
  }
  checks.push(await checkAuthoringDocs(ctx));
  checks.push(await checkCliDocs(ctx));
  checks.push(await checkDocsTree(ctx));
  checks.push(await checkDocsProgressiveDisclosure(ctx));

  const summary = {pass: 0, warn: 0, fail: 0, info: 0};
  for (const c of checks) summary[c.status] += 1;

  return {checks, summary};
}

/**
 * Programmatic API: run the doctor and return the same envelope shape that
 * `astryx doctor --json` emits.
 *
 * @param {import('./doctor.type.mjs').DoctorOptions} [options]
 * @returns {Promise<{type: 'doctor', data: DoctorReport}>}
 */
export async function doctor(options = {}) {
  const report = await runChecks(options);
  return {type: 'doctor', data: report};
}
