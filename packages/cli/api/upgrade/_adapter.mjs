// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file upgrade adapter — shared version-detection + codemod machinery.
 *
 * The engine the upgrade leaves (list/status/run) sit on. It owns the I/O and
 * resolution for the command: detecting the installed core version, refreshing
 * the managed agent-docs block, selecting codemods from the registry, loading
 * the consumer's project/integrations, and executing the core/integration
 * codemod runners. Leaves call these helpers and PROJECT the results into their
 * one response type; the dispatcher (`upgrade.mjs`) routes.
 *
 * Progress is emitted through the shared `logger` (silent by default), so the
 * CLI keeps its exact output while a programmatic caller stays quiet.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ensureJscodeshift} from '../../assets/codemods/ensure-jscodeshift.mjs';
import {
  getTransformsBetween,
  latestVersion,
} from '../../assets/codemods/registry.mjs';
import {runCodemods} from '../../assets/codemods/runner.mjs';
import {codemodOutcome} from '../../assets/codemods/outcome.mjs';
import {
  discoverIntegrationCodemods,
  selectIntegrationCodemods,
} from '../../assets/codemods/integration-discovery.mjs';
import {runIntegrationCodemods} from '../../assets/codemods/integration-runner.mjs';
import {
  AgentDocsHomeError,
  assertAgentDocsTarget,
  installAgentDocs,
  inspectAgentDocs,
  renderAgentDocsBlock,
} from '../../foundation/agent-docs/agent-docs.mjs';
import {
  CLI_PACKAGE,
  commandInFolder,
  formatCliCommand,
  getDlxPrefix,
  quoteCommandArgument,
} from '../../foundation/env/package-manager.mjs';
import {isValidSemver, semverGt} from '../../foundation/env/semver.mjs';
import {
  CLI_ROOT,
  findAstryxProject,
  findProjectPackageOf,
} from '../../foundation/fs/paths.mjs';
import {Project, providerLedgerOf} from '../../foundation/config/project.mjs';
import {loadIntegrations} from '../../foundation/integrations/integrations.mjs';
import {resolveProviders} from '../../foundation/integrations/provider-resolution.mjs';
import {warnOnIntegrationIssues} from '../../foundation/integrations/integration-warnings.mjs';
import {logger} from '../logger.mjs';

/** The package that owns Core's components, hooks, and codemods. */
export {CORE_PROVIDER_ID as CORE_PACKAGE} from '../../foundation/identity/providers.mjs';

// Re-exported for the run leaf's lightweight agent-docs inspection path
// (config_fixable short-circuit, where the full render cannot load config).
export {inspectAgentDocs};

const execFileAsync = promisify(execFile);

/**
 * @typedef {object} CoreTransformEntry
 * @property {string} name
 * @property {import('../../authoring/codemod/type').CodemodTransform} transform
 * @property {{title: string, description?: string, pr?: string, codemodType?: string}} meta
 * @property {boolean} [optional]
 */
/** @typedef {{version: string, transforms: CoreTransformEntry[]}} CoreVersionManifest */

/**
 * @typedef {object} UpgradeOptions
 * @property {boolean} [list]
 * @property {string} [from]
 * @property {boolean} [apply]
 * @property {boolean} [force]
 * @property {string} [codemod]
 * @property {string[]} [skipCodemod]
 * @property {string[]} [integration]
 * @property {string} [path]
 * @property {boolean} [installDeps]
 * @property {boolean} [registry]
 */

/**
 * Where an upgrade runs: the root of the Astryx project `cwd` belongs to, the
 * nearest folder at or above it whose package.json declares an Astryx
 * package or that an Astryx workspace lists as a member, so a run from any
 * folder inside a project upgrades that project exactly as a run from its
 * root does. Its source, config, agent docs and
 * protection declarations all live there. The search stops at a repository
 * root and ends at the home folder without counting it (see
 * `findAstryxProject`). A `path` the caller names, in any spelling (`./src`,
 * `src`, `src/`), is read from `cwd`, where they typed it. With no `path`,
 * the upgrade scans `./src` at the project root. With no Astryx project, the
 * upgrade runs in `cwd` as released versions did.
 * @param {UpgradeOptions} options
 * @param {string} cwd
 * @returns {{options: UpgradeOptions, cwd: string, origin?: string}} `origin`
 *   is the folder the command ran in, when the project root is above it
 */
export function scopeToProject(options, cwd) {
  const here = path.resolve(cwd);
  const root = findAstryxProject(here) ?? here;
  if (root === here) return {options, cwd};
  const namedPath =
    options.path == null ? {} : {path: path.resolve(here, options.path)};
  return {options: {...options, ...namedPath}, cwd: root, origin: here};
}

/**
 * The result of an upgrade that ran at a project root above the folder the
 * command ran in, with its file paths made relative to that folder, so each
 * resolves from where the command ran: `modifiedFiles`, `agentDocs.files`, and
 * the `file` of each `protectedFiles`, `declinedCandidates` and `errors`
 * entry. The registry step names copied-composition paths from that folder
 * itself (see `reconcileRegistryCompositions`), so they pass through. A
 * result of a run at the project root is returned as it is.
 * @template {{type: string, data: object}} T
 * @param {T} result
 * @param {{cwd: string, origin?: string}} scope from `scopeToProject`
 * @returns {T}
 */
export function relativeToOrigin(result, {cwd: root, origin}) {
  if (origin == null) return result;
  /** @param {string} file */
  const rebase = file =>
    path.relative(origin, path.resolve(root, file)).split(path.sep).join('/') ||
    '.';
  /** @type {Record<string, any>} */
  const data = {...result.data};
  if (data.agentDocs) {
    data.agentDocs = {
      ...data.agentDocs,
      files: data.agentDocs.files.map(rebase),
    };
  }
  if (data.modifiedFiles) data.modifiedFiles = data.modifiedFiles.map(rebase);
  for (const key of [
    'protectedFiles',
    'declinedCandidates',
    'errors',
    'regenerate',
  ]) {
    if (data[key]) {
      data[key] = data[key].map(
        (/** @type {{file: string, declarations?: string[]}} */ entry) => ({
          ...entry,
          file: rebase(entry.file),
          ...(Array.isArray(entry.declarations)
            ? {declarations: entry.declarations.map(rebaseDeclaration(rebase))}
            : {}),
        }),
      );
    }
  }
  return /** @type {T} */ ({...result, data});
}

/**
 * The project-relative file a protection declaration names, and the text
 * around it: the ignore or attributes file that protects a file (and its
 * line), or the symbolic link on its path. Other declarations name no file.
 */
const DECLARATION_PATHS = [
  /^(excluded by )(.+?)(:\d+)?$/u,
  /^(linguist-(?:generated|vendored) in )(.+?)(:\d+)$/u,
  /^(symbolic link at )(.+)()$/u,
];

/**
 * A protection declaration with the file it names rebased, as `rebase` does
 * for result paths.
 * @param {(file: string) => string} rebase
 * @returns {(declaration: string) => string}
 */
function rebaseDeclaration(rebase) {
  return declaration => {
    for (const pattern of DECLARATION_PATHS) {
      const match = pattern.exec(declaration);
      if (match) return `${match[1]}${rebase(match[2])}${match[3] ?? ''}`;
    }
    return declaration;
  };
}

/**
 * Detect the installed target version: the Core the Astryx project of `cwd`
 * installed, in its own node_modules or, for a member its workspace lists, in
 * a folder up to the workspace root. The nearest folder wins, the current
 * name before the legacy one, then Yarn Plug'n'Play. A Core above a project
 * no workspace lists does not count, so a nested project that has not
 * installed its own reports nothing installed. With no Astryx project, only
 * the node_modules of `cwd` itself is read, as released versions did.
 * @param {string} cwd
 * @returns {{version: string, packageName: string}|null}
 */
export function detectInstalledTargetVersion(cwd) {
  const found = findProjectPackageOf(cwd, ['@astryxdesign/core', '@xds/core']);
  if (!found) return null;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(found.packageDir, 'package.json'), 'utf-8'),
    );
    return pkg.version ? {version: pkg.version, packageName: found.name} : null;
  } catch {
    // Unreadable package.json: no version to target.
    return null;
  }
}

/**
 * The running CLI's own version, read from its package.json.
 * @returns {string | null} null when it cannot be read or is not semver
 */
function readRunningCliVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf-8'),
    );
    return isValidSemver(pkg.version) ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * Whether the installed Core is newer than this CLI, so part of the requested
 * range has no codemods here.
 *
 * Core codemods ship inside the CLI. A CLI older than the installed
 * `@astryxdesign/core` has none for the releases after its own version, so it
 * can find no codemods, or stop partway, while the code still needs those
 * releases' migrations. The returned command repeats this upgrade with the CLI
 * release that matches the installed Core.
 *
 * Where an upgrade runs decides what it finds: the installed Core is read
 * from that folder, and `--path` must stay inside it. So the command first
 * changes to `cwd`, the folder this run used, then names `sourcePath`, the
 * directory this run scanned, as an absolute `--path`. Both are named by their
 * physical paths, with every symbolic link resolved: a shell's `cd` follows a
 * link, but the CLI it starts reads its folder with every link resolved and
 * checks `--path` against that. Pasted from any folder, the command finds the
 * same Core and scans the same directory, even after a package runner moved
 * this run (Yarn 1 runs `yarn astryx` at the project root). It is written for
 * a POSIX shell, or for PowerShell on Windows (cmd.exe is not a target), with
 * every argument quoted for that shell.
 *
 * Returns null when the CLI covers the whole range (`to` is not newer than
 * both the CLI and `from`), when the CLI's own version cannot be read, or when
 * the target is legacy `@xds/core`, which no CLI release shares a version with.
 *
 * @param {{from: string, to: string, packageName: string, options: UpgradeOptions, cwd: string, sourcePath: string}} input
 * @returns {import('./upgrade.type.mjs').CliBehindCore | null}
 */
export function detectCliBehindCore({
  from,
  to,
  packageName,
  options,
  cwd,
  sourcePath,
}) {
  if (packageName !== '@astryxdesign/core') return null;
  const cliVersion = readRunningCliVersion();
  if (!cliVersion || !semverGt(to, cliVersion) || !semverGt(to, from)) {
    return null;
  }
  const runFolder = path.resolve(cwd);
  const folder = physicalFolder(runFolder);
  const scanned = path.join(folder, path.relative(runFolder, sourcePath));
  const args = ['upgrade', '--from', from, '--path', scanned];
  if (options.codemod) args.push('--codemod', options.codemod);
  for (const name of options.skipCodemod ?? []) {
    args.push('--skip-codemod', name);
  }
  for (const spec of options.integration ?? []) {
    args.push('--integration', spec);
  }
  if (options.force) args.push('--force');
  if (options.installDeps) args.push('--install-deps');
  if (options.apply) args.push('--apply');
  const upgrade = [
    getDlxPrefix(cwd),
    ...[`${CLI_PACKAGE}@${to}`, ...args].map(arg => quoteCommandArgument(arg)),
  ].join(' ');
  return {cliVersion, command: commandInFolder(folder, upgrade)};
}

/**
 * A folder as the operating system reports it to a process that runs there,
 * with every symbolic link on the way resolved. Falls back to the path as
 * given when it cannot be resolved.
 * @param {string} dir an absolute folder
 * @returns {string}
 */
function physicalFolder(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

/**
 * @param {(string | null | undefined | false)[] | undefined} files
 * @returns {string[]}
 */
export function uniqueFiles(files) {
  return [
    ...new Set(
      (files ?? []).filter(/** @returns {f is string} */ f => Boolean(f)),
    ),
  ];
}

/**
 * Run app code with its stdout writes sent to stderr. Stdout carries only the
 * command's own output, so a hook that prints cannot corrupt `--json`.
 * @template T
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withStdoutOnStderr(fn) {
  const realWrite = process.stdout.write;
  process.stdout.write = /** @type {any} */ (
    function (/** @type {any} */ chunk, /** @type {any[]} */ ...rest) {
      return process.stderr.write(chunk, ...rest);
    }
  );
  try {
    return await fn();
  } finally {
    process.stdout.write = realWrite;
  }
}

/**
 * Run the app config's post-codemod hooks (config.hooks.postCodemod).
 * Dry-run PREVIEWS (buildCommand still called, so a throw fails); apply executes.
 * @param {import('../../authoring/config/type').PostCodemodHook[]} hooks
 * @param {{packageDir: string, files: string[], apply: boolean}} context
 */
export async function runPostCodemodHooks(hooks, context) {
  if (!hooks || hooks.length === 0) return;
  const {packageDir, files, apply} = context;

  for (let i = 0; i < hooks.length; i++) {
    const hook = hooks[i];
    const label = hook.name ?? `postCodemod[${i}]`;
    if (typeof hook.buildCommand !== 'function') {
      throw new Error(
        `Post-codemod hook ${label} is missing a buildCommand function.`,
      );
    }

    const cmd = await withStdoutOnStderr(() =>
      hook.buildCommand({packageDir, files}),
    );
    if (!cmd) {
      logger.log(`Post-codemod hook ${label} produced no command; skipping.`);
      continue;
    }

    if (!apply) {
      const preview = [cmd.command, ...(cmd.args ?? [])].join(' ');
      logger.log(`Post-codemod hook ${label} (dry run): ${preview}`);
      continue;
    }

    await execFileAsync(
      cmd.command,
      cmd.args ?? [],
      /** @type {import('node:child_process').ExecFileOptions & {encoding: 'utf-8'}} */ ({
        cwd: cmd.options?.cwd ?? packageDir,
        timeout: cmd.options?.timeout ?? 300_000,
        stdio: 'pipe',
        encoding: 'utf-8',
        ...cmd.options,
        env: {...process.env, ...(cmd.options?.env ?? {})},
      }),
    );
    logger.log(`[ok] Post-codemod hook ${label} completed.`);
  }
}

/**
 * @typedef {object} AgentDocsRefreshPlan
 * @property {string} cwd
 * @property {string} [origin] the folder the command ran in, when the upgrade
 *   runs at a project root above it
 * @property {string|null} renderedBlock
 * @property {import('./upgrade.type.mjs').AgentDocsSummary} summary
 */

/**
 * The advice to run `init`, phrased for where the command ran: when the
 * upgrade runs at a project root above that folder, it names the root, so the
 * agent docs are installed beside the project's package.json.
 * @param {string} cwd the folder the upgrade runs at
 * @param {string} [origin] the folder the command ran in
 * @returns {string}
 */
function initAdvice(cwd, origin) {
  const command = `\`${formatCliCommand('astryx init --features agents')}\``;
  if (origin == null) return command;
  return `${command} in ${path.relative(origin, cwd) || '.'} (the project root)`;
}

/**
 * Why upgrade leaves the agent docs of a project at the home folder or the
 * top of a settings folder, and what to do instead. init refuses the same
 * folder, so the line never points at it.
 * @param {AgentDocsHomeError} err
 * @param {'stale' | 'missing'} [state] whether a block is there to refresh
 * @returns {string}
 */
function homeRefusalLine(err, state = 'stale') {
  const where = `${err.dir} is the home folder or a settings folder in it, which every project's agents read.`;
  return state === 'missing'
    ? `Agent docs not installed: ${where} To have agent docs, move the project into a folder of its own, or add the Astryx block to its agent file by hand.`
    : `Agent docs not refreshed: ${where} To keep agent docs, move the project into a folder of its own; otherwise update or remove the Astryx block there by hand.`;
}

/**
 * Compute the expected managed block and report staleness without writing.
 * Apply-mode callers commit the prepared bytes only after codemods and hooks
 * succeed.
 *
 * @param {{cwd: string, installedVersion: string, apply: boolean, fresh?: boolean, origin?: string}} ctx
 * @returns {Promise<AgentDocsRefreshPlan>}
 */
export async function prepareAgentDocsRefresh({
  cwd,
  installedVersion,
  apply,
  fresh = false,
  origin,
}) {
  const initial = inspectAgentDocs(cwd, installedVersion);
  /** @type {import('./upgrade.type.mjs').AgentDocsSummary} */
  const summary = {
    status: initial.status,
    installedVersion,
    fromVersions: initial.blockVersions,
    files: [],
    refreshed: false,
    action: 'none',
  };

  if (initial.status === 'missing') {
    // init writes nothing in a project at the home folder or the top of a
    // settings folder, so it is not the remedy there (INV31).
    try {
      assertAgentDocsTarget(cwd);
    } catch (err) {
      if (!(err instanceof AgentDocsHomeError)) throw err;
      summary.action = 'error';
      logger.warn(homeRefusalLine(err, 'missing'));
      return {cwd, origin, renderedBlock: null, summary};
    }
    summary.action = 'nudge-init';
    logger.warn(
      `No Astryx agent-docs block found - AI agents have no component index. Run ${initAdvice(cwd, origin)} to install it.`,
    );
    return {cwd, origin, renderedBlock: null, summary};
  }

  let renderedBlock;
  try {
    renderedBlock = await renderAgentDocsBlock(cwd, {
      installedVersion,
      fresh,
    });
  } catch {
    summary.action = 'error';
    summary.files = initial.files.map(file => file.path);
    logger.warn(
      `Could not render the expected agent docs. Run ${initAdvice(cwd, origin)} to update them manually.`,
    );
    return {cwd, origin, renderedBlock: null, summary};
  }

  const inspection = inspectAgentDocs(cwd, installedVersion, renderedBlock);
  summary.status = inspection.status;
  summary.fromVersions = inspection.blockVersions;
  summary.files = inspection.staleFiles;
  if (inspection.status === 'current') {
    return {cwd, origin, renderedBlock, summary};
  }

  // A project at the home folder or the top of a settings folder is never
  // refreshed (INV31): the dry run says so, as --apply does, rather than
  // offering a refresh that would be refused.
  try {
    assertAgentDocsTarget(cwd);
  } catch (err) {
    if (!(err instanceof AgentDocsHomeError)) throw err;
    summary.action = 'error';
    logger.warn(homeRefusalLine(err));
    return {cwd, origin, renderedBlock: null, summary};
  }

  summary.action = 'would-refresh';
  if (!apply) {
    logger.warn(
      `Agent docs differ from the installed Astryx and integration configuration. Re-run with --apply to refresh (${summary.files.join(', ')}).`,
    );
  }
  return {cwd, origin, renderedBlock, summary};
}

/**
 * Commit a prepared agent-doc refresh.
 * @param {AgentDocsRefreshPlan} plan
 * @returns {import('./upgrade.type.mjs').AgentDocsSummary}
 */
export function applyAgentDocsRefresh(plan) {
  const {cwd, origin, renderedBlock, summary} = plan;
  if (summary.action !== 'would-refresh' || renderedBlock == null)
    return summary;

  try {
    const written = installAgentDocs(cwd, {
      onlyReplace: true,
      renderedBlock,
      // A GEMINI.md that resolves outside the project is left as it is.
      onSkipped: (file, reason) =>
        logger.warn(`Note: ${file} left as it is (${reason}).`),
    });
    summary.refreshed = written.length > 0;
    summary.files = written;
    summary.action = summary.refreshed ? 'refreshed' : 'error';
    if (summary.refreshed) {
      logger.log(`[ok] Agent docs refreshed -> ${written.join(', ')}`);
    } else {
      logger.warn(
        `Agent docs look stale but couldn't be refreshed. Run ${initAdvice(cwd, origin)} to reinstall the block.`,
      );
    }
  } catch (err) {
    summary.action = 'error';
    summary.refreshed = false;
    if (err instanceof AgentDocsHomeError) {
      // init refuses this folder too, so pointing at it would loop: say why,
      // and what to do instead.
      logger.warn(homeRefusalLine(err));
    } else {
      logger.warn(
        `Could not refresh agent docs. Run ${initAdvice(cwd, origin)} to update them manually.`,
      );
    }
  }
  return summary;
}

/**
 * Every registered codemod (oldest→newest) for `upgrade --list`. Registry walk
 * + flatten; nothing is run.
 * @returns {Promise<Array<{name: string, title: string, version: string, pr?: string, optional: boolean}>>}
 */
export async function collectAllCodemods() {
  const codemods = [];
  const manifests = /** @type {CoreVersionManifest[]} */ (
    await getTransformsBetween('0.0.0', latestVersion)
  );
  for (const {version, transforms} of manifests) {
    for (const {name, meta, optional} of transforms) {
      codemods.push({
        name,
        title: meta.title,
        version,
        pr: meta.pr,
        optional: !!optional,
      });
    }
  }
  return codemods;
}

/**
 * Core version manifests for the (from, to] range.
 * @param {string} from
 * @param {string} to
 * @returns {Promise<CoreVersionManifest[]>}
 */
export async function getCoreVersionManifests(from, to) {
  return /** @type {CoreVersionManifest[]} */ ([
    ...(await getTransformsBetween(from, to)),
  ]);
}

/**
 * Ensure jscodeshift is available before running codemods.
 * @param {{installDeps?: boolean}} [options]
 * @returns {Promise<boolean>}
 */
export async function ensureCodemodDeps({installDeps} = {}) {
  return ensureJscodeshift({installDeps, silent: logger.silent});
}

/**
 * @typedef {{kind: 'manual', file: string, codemod: string, message: string, line?: number} | {kind: 'regenerate', file: string, codemod: string, message: string, commands: string[]}} CodemodOutcomeRecord
 */

/**
 * Wrap each core code and config transform so the non-failure outcomes it
 * throws (`assets/codemods/outcome.mjs`) are recorded instead of reaching the
 * runner as errors. The wrapped transform leaves that file unchanged, exactly
 * as the throw did. Project codemods keep their own contract. One wrapper per
 * pass: the regeneration re-check takes a fresh one, so an outcome a hook
 * resolved does not linger.
 *
 * @template {{version: string, transforms: Array<{name: string, transform: any, meta?: {codemodType?: string}}>}} M
 * @param {M[]} versionManifests
 * @param {string} root project root; recorded files are relative to it
 * @returns {{versionManifests: M[], outcomes: CodemodOutcomeRecord[]}}
 */
export function withCodemodOutcomes(versionManifests, root) {
  /** @type {CodemodOutcomeRecord[]} */
  const outcomes = [];
  const wrapped = versionManifests.map(manifest => ({
    ...manifest,
    transforms: manifest.transforms.map(entry => {
      if (entry.meta?.codemodType === 'project') return entry;
      const {transform, name} = entry;
      return {
        ...entry,
        /** @param {{path: string, source: string}} file @param {unknown} api */
        transform(file, api) {
          try {
            return transform(file, api);
          } catch (err) {
            const outcome = codemodOutcome(err);
            if (!outcome) throw err;
            outcomes.push({
              ...outcome,
              file: path.relative(root, file.path).split(path.sep).join('/'),
              codemod: `core:${name}`,
            });
            return undefined;
          }
        },
      };
    }),
  }));
  return {versionManifests: /** @type {M[]} */ (wrapped), outcomes};
}

/**
 * Run the CORE registry codemods. Runs BEFORE the config is loaded so a core
 * CONFIG codemod can repair a config the strict loader would otherwise reject.
 * @param {CoreVersionManifest[]} versionManifests
 * @param {{apply: boolean, path: string, codemod?: string, skipCodemods: Set<string>, root?: string, protection?: {root: string, classify: (file: string) => import('../../foundation/fs/file-protection.mjs').FileProtection[]}, silent?: boolean, coversTarget?: boolean, outcomes?: CodemodOutcomeRecord[]}} options
 */
export async function runCoreCodemods(
  versionManifests,
  {
    apply,
    path: srcPath,
    codemod,
    skipCodemods,
    root,
    protection,
    silent,
    coversTarget,
    outcomes,
  },
) {
  return runCodemods(versionManifests, {
    apply,
    path: srcPath,
    codemod,
    skipCodemods,
    silent: silent ?? logger.silent,
    root,
    protection,
    coversTarget,
    outcomes,
  });
}

/**
 * Load the consumer project's config + integrations. Throws on invalid config;
 * the run leaf decides between the config_fixable preview and a hard abort.
 *
 * Provider identity is resolved by the same resolver Project uses, on top of
 * Project's ledger, under the codemod policy: a package that lists itself runs
 * its installed copy's released codemods, never the work in progress being
 * authored, and autolinked and local packages claim provider IDs without
 * running codemods.
 *
 * @param {string} cwd
 * @param {string[]} [extraIntegrationSpecs] explicit `--integration` specs
 * @returns {Promise<{postCodemodHooks: import('../../authoring/config/type').PostCodemodHook[], integrations: import('../../foundation/integrations/integrations.mjs').LoadedIntegration[], ledger: import('../../foundation/integrations/provider-resolution.mjs').ProviderLedger, iconSets: boolean}>}
 *   `iconSets`: the project sets `experimental.iconSet`
 */
export async function loadProjectContext(cwd, extraIntegrationSpecs = []) {
  // The CLI debug preflight may already have imported this config before core
  // CONFIG codemods run. Upgrade needs the bytes now on disk, not that module
  // cache entry; ordinary Project discovery remains cached by default.
  const project = await Project.load(cwd, {fresh: true, core: 'project'});
  const postCodemodHooks = project.config.hooks?.postCodemod ?? [];
  const configuredSpecs = new Set(project.integrations ?? []);
  // Configured packages come from Project, which has already resolved provider
  // identity over configured, autolinked, and local packages. Loading them
  // again here would let upgrade run codemods from a package Project set aside.
  // Autolinked packages and the package being authored join only as claimants:
  // every other command uses them for their provider IDs, but upgrade has
  // never run their codemods.
  const candidates = project.loadedIntegrations.flatMap(integration => {
    const source =
      !integration.__autolinked && configuredSpecs.has(integration.__spec)
        ? /** @type {const} */ ('configured')
        : integration.__autolinked
          ? /** @type {const} */ ('autolinked')
          : integration.__local
            ? /** @type {const} */ ('local')
            : null;
    return source == null
      ? []
      : [{source, integration, spec: integration.__spec}];
  });
  // A package that lists itself runs its installed copy's released codemods,
  // never the work in progress being authored; the resolver puts that copy in
  // its place. Naming the package being authored with --integration asks for
  // the installed copy too.
  const local = project.loadedIntegrations.find(
    integration => integration.__local,
  );
  const selfListed =
    local != null && !local.__autolinked && configuredSpecs.has(local.__spec);
  const installed =
    local != null && selfListed && project.configPath
      ? await loadIntegrations([local.__spec], {
          cwd: path.dirname(project.configPath),
          resolveProviders: false,
        })
      : [];
  const extraSpecs = uniqueFiles(extraIntegrationSpecs ?? []).filter(
    spec => !configuredSpecs.has(spec),
  );
  const extras =
    extraSpecs.length === 0
      ? []
      : // Resolved from the project, as --integration names a package it
        // installed, not from whichever folder the process started in.
        await loadIntegrations(extraSpecs, {cwd, resolveProviders: false});
  const {integrations, ledger} = resolveProviders(
    [
      ...candidates,
      ...installed.map(integration => ({
        source: /** @type {const} */ ('installed'),
        integration,
        spec: integration.__spec,
      })),
      ...extras.map(integration => ({
        source: /** @type {const} */ ('extra'),
        integration,
        spec: integration.__spec,
      })),
    ],
    {codemods: true, prior: providerLedgerOf(project)},
  );
  return {
    postCodemodHooks,
    integrations,
    ledger,
    iconSets: Boolean(project.config.experimental?.iconSet),
  };
}

/**
 * Non-blocking nudge for integration validation issues. Never throws (a broken
 * nudge must not fail the upgrade) and is suppressed for --json/programmatic
 * callers (the silent logger).
 * @param {Array<import('../../foundation/integrations/integrations.mjs').LoadedIntegration>} integrations
 * @param {{iconSets?: boolean}} [options] `iconSets`: the project sets
 *   `experimental.iconSet`. Without it a package's experimental icon-set root
 *   is not checked (spec:AST-017 FR27, spec:AST-084 FR0), as in the project's
 *   own issues.
 * @returns {Promise<void>}
 */
export async function warnIntegrationIssues(integrations, {iconSets} = {}) {
  try {
    await warnOnIntegrationIssues(
      iconSets
        ? integrations
        : integrations.map(each =>
            each && typeof each === 'object'
              ? {...each, iconSets: undefined}
              : each,
          ),
      {json: logger.silent},
    );
  } catch {
    // Never let the nudge break the upgrade.
  }
}

/**
 * Discover + select the integration codemods that apply in the (from, to]
 * range. An integration whose codemods fail to load is SKIPPED (a definition
 * error is surfaced by the nudge, not a hard failure of the upgrade).
 * @param {Array<import('../../foundation/integrations/integrations.mjs').LoadedIntegration>} integrations
 * @param {string} from
 * @param {string} to
 * @returns {Promise<Array<{version: string, codemods: import('../../authoring/codemod/type').CodemodEntry[]}>>}
 */
export async function selectIntegrationCodemodsFor(integrations, from, to) {
  /** @type {Map<string, Array<import('../../authoring/codemod/type').CodemodEntry>>} */
  const integrationCodemodsByVersion = new Map();
  for (const integration of integrations) {
    if (!integration?.codemods) continue;
    try {
      const byVersion = await discoverIntegrationCodemods([integration]);
      for (const [version, rawList] of byVersion) {
        const list =
          /** @type {Array<import('../../authoring/codemod/type').CodemodEntry>} */ (
            /** @type {unknown} */ (rawList)
          );
        const existing = integrationCodemodsByVersion.get(version);
        if (existing) existing.push(...list);
        else integrationCodemodsByVersion.set(version, [...list]);
      }
    } catch {
      // Skip this integration's codemods (definition error); nudge above surfaces it.
    }
  }
  return /** @type {Array<{version: string, codemods: import('../../authoring/codemod/type').CodemodEntry[]}>} */ (
    selectIntegrationCodemods(integrationCodemodsByVersion, from, to)
  );
}

/**
 * Run the file-based INTEGRATION codemods (config codemods first, then code).
 * @param {Array<{version: string, codemods: import('../../authoring/codemod/type').CodemodEntry[]}>} versionGroups
 * @param {{apply: boolean, path: string, codemod?: string, skipCodemods: Set<string>, root?: string, protection?: {root: string, classify: (file: string) => import('../../foundation/fs/file-protection.mjs').FileProtection[]}, contents?: Map<string, string>, silent?: boolean}} options
 */
export async function runIntegrationCodemodsStep(
  versionGroups,
  {
    apply,
    path: srcPath,
    codemod,
    skipCodemods,
    root,
    protection,
    contents,
    silent,
  },
) {
  const jscodeshift = (await import('jscodeshift')).default;
  return runIntegrationCodemods(versionGroups, {
    apply,
    path: srcPath,
    codemod,
    skipCodemods,
    jscodeshift,
    silent: silent ?? logger.silent,
    root,
    protection,
    contents,
  });
}
