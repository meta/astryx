// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file upgrade.run leaf — the terminal, side-effecting run receipt.
 *
 * Orchestrates the non-list upgrade pipeline over the shared `_adapter.mjs`
 * machinery and returns the run receipt. It also OWNS the two mid-pipeline
 * short-circuits that resolve to `upgrade.status` (no_codemods, config_fixable)
 * plus the early up_to_date exit — each delegated to the `status` leaf so the
 * status envelope + its human lines live in one place.
 *
 * Pipeline (--apply): detect installed core → run CORE codemods (before
 * Project.load, so a core CONFIG codemod can repair an otherwise-invalid
 * config) → load config → discover + run INTEGRATION codemods → reconcile
 * ShadCN-copied compositions → post-codemod hooks → render + refresh agent docs
 * from final post-upgrade state. Integration DISCOVERY errors skip that
 * integration; execution errors abort before the agent-doc write.
 *
 * Core codemods ship inside the CLI, so a CLI older than the installed Core
 * has none for the releases after its own version. Every result past the
 * up-to-date exit then carries `cliBehindCore`, and no human line says the
 * upgrade finished; the warning names the same upgrade on the matching CLI.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  detectInstalledTargetVersion,
  detectCliBehindCore,
  prepareAgentDocsRefresh,
  applyAgentDocsRefresh,
  inspectAgentDocs,
  uniqueFiles,
  runPostCodemodHooks,
  getCoreVersionManifests,
  ensureCodemodDeps,
  runCoreCodemods,
  loadProjectContext,
  warnIntegrationIssues,
  selectIntegrationCodemodsFor,
  runIntegrationCodemodsStep,
} from '../_adapter.mjs';
import {
  logRegistryCompositionSummary,
  reconcileRegistryCompositions,
} from '../registry/registry.mjs';
import {
  statusUpToDate,
  statusNoCodemods,
  statusConfigFixable,
  logCliBehindCore,
} from '../status/status.mjs';
import {semverGte} from '../../../foundation/env/semver.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {isOutsideProject} from '../../../foundation/env/project-scope.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {AstryxError} from '../../error.mjs';
import {logger} from '../../logger.mjs';
import {
  assertWithin,
  PathSafetyError,
} from '../../../foundation/fs/path-safety.mjs';
import {createFileProtectionResolver} from '../../../foundation/fs/file-protection.mjs';
import {withoutProtected} from '../../../assets/codemods/runner.mjs';

/**
 * Collapse per-codemod protection hits into one stable row per file.
 * @param {Array<{file: string, codemod: string, reason: string, declaration: string, generated: boolean, command?: string}>} rows
 */
function summarizeProtectedFiles(rows) {
  const byFile = new Map();
  for (const row of rows) {
    const current = byFile.get(row.file) ?? {
      file: row.file,
      codemods: new Set(),
      reasons: new Set(),
      declarations: new Set(),
      commands: new Set(),
    };
    current.codemods.add(row.codemod);
    current.reasons.add(row.reason);
    current.declarations.add(row.declaration);
    if (row.command) current.commands.add(row.command);
    byFile.set(row.file, current);
  }
  return [...byFile.values()]
    .map(item => ({
      file: item.file,
      codemods: [...item.codemods].sort(),
      reasons: [...item.reasons].sort(),
      declarations: [...item.declarations].sort(),
      commands: [...item.commands].sort(),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Collapse per-codemod declined candidates into one row per file, in the
 * receipt's `{file, location?, reason}` shape. A file the receipt lists under
 * `protectedFiles` is left out: a codemod still requires a change to it, and
 * that already makes the run incomplete.
 * @param {Array<{file: string, codemod: string, location?: string, reason: string}>} rows
 * @param {Array<{file: string}>} [protectedRows]
 * @returns {Array<{file: string, location?: string, reason: string}>}
 */
function summarizeDeclinedCandidates(rows, protectedRows = []) {
  /** @type {Map<string, {file: string, location?: string, reason: string}>} */
  const byFile = new Map();
  for (const {file, location, reason} of withoutProtected(
    rows,
    protectedRows,
  )) {
    if (byFile.has(file)) continue;
    byFile.set(file, {file, ...(location ? {location} : {}), reason});
  }
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Print the protected files the run skipped because a codemod could not parse
 * them, from the final declined list (files it reports as protected are
 * already left out), so the text output carries what the receipt lists.
 * @param {Array<{file: string, location?: string, reason: string}>} declined
 */
function logDeclined(declined) {
  if (declined.length === 0) return;
  const n = declined.length;
  logger.warn(
    `${n} protected file${n === 1 ? ' was' : 's were'} skipped because ${n === 1 ? 'it does' : 'they do'} not parse; review manually:`,
  );
  for (const {file, location, reason} of declined) {
    logger.warn(`  ${file}${location ? `:${location}` : ''} - ${reason}`);
  }
}

/**
 * @template {Array<{file: string, location?: string, reason: string}>} T
 * @param {T} declined
 * @returns {T}
 */
function logged(declined) {
  logDeclined(declined);
  return declined;
}

/** @param {string} cwd */
function loadFileProtection(cwd) {
  try {
    return createFileProtectionResolver(cwd);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    logger.log('Upgrade failed\n');
    throw new AstryxError(
      message,
      undefined,
      ERROR_CODES.ERR_CODEMOD_PROTECTION_SOURCE,
    );
  }
}

/**
 * The receipt of a run that stopped after codemods ran. Whatever the codemods
 * already wrote stays on disk, so the error the run throws carries this
 * receipt (`failWithReceipt`): a caller that reads only the error would
 * report nothing changed while the files it lists remain modified
 * (spec:AST-040 FR7).
 *
 * @param {{from: string, to: string, codemods: number, integrations: string[], sourcePathFound: boolean, cwd: string, changedFiles: string[], transformsApplied: number, protectedRows: Array<{file: string, codemod: string, reason: string, declaration: string, generated: boolean, command?: string}>, errors: Array<{file: string, codemod: string, error: string}>, declinedRows?: Array<{file: string, codemod: string, location?: string, reason: string}>, errorCode: string, cliBehindCore?: import('../upgrade.type.mjs').CliBehindCore | null, registryCompositions?: import('../upgrade.type.mjs').RegistryCompositionSummary}} facts
 * @returns {import('../upgrade.type.mjs').UpgradeRunResponse['data']}
 */
function stoppedReceipt({
  from,
  to,
  codemods,
  integrations,
  sourcePathFound,
  cwd,
  changedFiles,
  transformsApplied,
  protectedRows,
  errors,
  declinedRows = [],
  errorCode,
  cliBehindCore,
  registryCompositions,
}) {
  const modifiedFiles = uniqueFiles(changedFiles).map(file =>
    path.relative(cwd, file).split(path.sep).join('/'),
  );
  return /** @type {import('../upgrade.type.mjs').UpgradeRunResponse['data']} */ ({
    from,
    to,
    codemods,
    integrations,
    agentDocsRefreshed: false,
    agentDocs: {
      status: 'current',
      installedVersion: to,
      fromVersions: [],
      files: [],
      refreshed: false,
      action: 'none',
    },
    sourcePathFound,
    filesChanged: modifiedFiles.length,
    transformsApplied,
    modifiedFiles,
    protectedFiles: summarizeProtectedFiles(protectedRows),
    declinedCandidates: logged(
      summarizeDeclinedCandidates(declinedRows, protectedRows),
    ),
    complete: false,
    errorCode,
    errors,
    ...(registryCompositions ? {registryCompositions} : {}),
    ...(cliBehindCore ? {cliBehindCore} : {}),
  });
}

/**
 * The error a run throws once codemods have run: the same message and stable
 * code as always, plus the run's receipt on `receipt`, so the JSON error
 * envelope and a programmatic caller can still see what was written.
 * @param {string} message
 * @param {string} code
 * @param {import('../upgrade.type.mjs').UpgradeRunResponse['data']} receipt
 * @returns {AstryxError & {receipt: import('../upgrade.type.mjs').UpgradeRunResponse['data']}}
 */
function failWithReceipt(message, code, receipt) {
  const err =
    /** @type {AstryxError & {receipt: import('../upgrade.type.mjs').UpgradeRunResponse['data']}} */ (
      new AstryxError(message, undefined, code)
    );
  err.receipt = receipt;
  return err;
}

/**
 * Run the upgrade pipeline for a validated, non-list invocation. Returns the
 * terminal run receipt, or one of the status short-circuits; throws AstryxError
 * on failure. Progress is emitted through the shared `logger` (silent by default).
 *
 * @param {import('../_adapter.mjs').UpgradeOptions} [options]
 * @param {{cwd?: string, origin?: string}} [ctx] `origin` is the folder the
 *   command ran in, when `cwd` is the project root above it
 * @returns {Promise<import('../upgrade.type.mjs').UpgradeStatusResponse | import('../upgrade.type.mjs').UpgradeRunResponse>}
 */
export async function run(options = {}, {cwd = process.cwd(), origin} = {}) {
  // Resolve the source dir against the API's cwd (not process.cwd()) so a
  // programmatic caller in another directory scans the right tree. Confine it to
  // cwd: --apply rewrites files in place, so a `..`-escaping or out-of-tree
  // absolute --path must be rejected (parity with template/theme/swizzle/layout,
  // and this is the most destructive command). allowAbsolute permits an absolute
  // path that still resolves inside cwd.
  let path_;
  try {
    path_ = assertWithin(options.path ?? './src', cwd, {
      allowAbsolute: true,
      label: 'source directory',
    });
  } catch (err) {
    if (err instanceof PathSafetyError) {
      logger.error(err.message);
      logger.log('Aborted\n');
      throw new AstryxError(
        err.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw err;
  }
  const apply = options.apply ?? false;

  // One fact about the resolved source directory, captured before anything
  // runs. `--path` defaults to `./src`, so a project laid out as `app/` (or a
  // typo) skips every code codemod; without this the receipt is byte-identical
  // to a clean, fully migrated project.
  const sourcePathFound = fs.existsSync(path_);

  const currentVersion = /** @type {string} */ (options.from);
  // Named first, so a run that stops on the Core lookup below still says which
  // folder it searched (spec:AST-040 FR12).
  if (origin != null) {
    logger.log(`Project root: ${path.relative(origin, cwd) || '.'}`);
    logger.log(`Source folder: ${path.relative(origin, path_) || '.'}`);
  }
  const installed = detectInstalledTargetVersion(cwd);
  if (!installed) {
    // Outside a project there is no version to install (spec AST-081 FR3).
    const msg = isOutsideProject(cwd)
      ? 'Could not find installed @astryxdesign/core (or legacy @xds/core). This folder is outside a project; upgrade migrates the code of an app project that installs @astryxdesign/core.'
      : `Could not find installed @astryxdesign/core (or legacy @xds/core). Install the target version first, then rerun \`${getCliInvocation()} upgrade --from <old-version>\`.`;
    logger.error(msg);
    logger.log('Aborted\n');
    throw new AstryxError(msg, undefined, ERROR_CODES.ERR_VERSION_DETECT);
  }
  const targetVersion = installed.version;

  const reconcileCompositions = async () => {
    if (options.codemod) return null;
    const result = await reconcileRegistryCompositions(
      {apply, path: path_},
      {
        cwd,
        origin,
        expectedVersion:
          installed.packageName === '@astryxdesign/core'
            ? targetVersion
            : undefined,
        requireExpectedVersion: true,
      },
    );
    if (result.summary.found > 0) {
      logRegistryCompositionSummary(result.summary);
      return result;
    }
    return null;
  };

  logger.log(`From version: ${currentVersion}`);
  logger.log(`Installed target: ${targetVersion} (${installed.packageName})`);

  // Up-to-date check — no codemods will run, safe to render agent docs now.
  if (!options.force && semverGte(currentVersion, targetVersion)) {
    const registryResult = await reconcileCompositions();
    const agentDocsPlan = await prepareAgentDocsRefresh({
      cwd,
      origin,
      installedVersion: targetVersion,
      apply,
    });
    const agentDocs = apply
      ? applyAgentDocsRefresh(agentDocsPlan)
      : agentDocsPlan.summary;
    return statusUpToDate({
      from: currentVersion,
      to: targetVersion,
      agentDocs,
      ...(registryResult ? {registryCompositions: registryResult.summary} : {}),
    });
  }

  // Past the up-to-date exit, codemods are needed through targetVersion. A
  // CLI older than that has none for the releases after its own version.
  const cliBehindCore = detectCliBehindCore({
    from: currentVersion,
    to: targetVersion,
    packageName: installed.packageName,
    options,
    cwd,
    sourcePath: path_,
  });

  const versionManifests = await getCoreVersionManifests(
    currentVersion,
    targetVersion,
  );

  const coreConfigCodemodNames = [];
  for (const {transforms} of versionManifests) {
    for (const t of transforms) {
      if (options.codemod && t.name !== options.codemod) continue;
      if (t.meta?.codemodType === 'config') coreConfigCodemodNames.push(t.name);
    }
  }
  const hasCoreConfigCodemod = coreConfigCodemodNames.length > 0;

  const skipCodemods = new Set(options.skipCodemod ?? []);

  let totalTransforms = 0;
  let totalOptional = 0;
  for (const {transforms} of versionManifests) {
    for (const t of transforms) {
      if (options.codemod && t.name !== options.codemod) continue;
      if (skipCodemods.has(t.name)) continue;
      if (t.optional && !options.codemod) totalOptional++;
      else totalTransforms++;
    }
  }

  // Read and parse all working-tree protection declarations before any
  // dependency installation or codemod write. Core and integration runners
  // share this exact snapshot.
  let protection = loadFileProtection(cwd);

  const ready = await ensureCodemodDeps({installDeps: options.installDeps});
  if (!ready) {
    const msg = 'jscodeshift is required but could not be installed.';
    logger.log('Aborted\n');
    throw new AstryxError(msg, undefined, ERROR_CODES.ERR_DEP_MISSING);
  }

  // CORE codemods run FIRST (before loading config) so a core CONFIG codemod can
  // repair a config the strict loader would otherwise reject.
  const codemodResult = await runCoreCodemods(versionManifests, {
    apply,
    path: path_,
    codemod: options.codemod,
    skipCodemods,
    root: cwd,
    protection,
    coversTarget: !cliBehindCore,
  });
  const coreResult =
    codemodResult && 'totalFilesChanged' in codemodResult
      ? codemodResult
      : null;

  /** @type {Array<import('../../../foundation/integrations/integrations.mjs').LoadedIntegration>} */
  let integrations;
  /** @type {import('../../../authoring/config/type').PostCodemodHook[]} */
  let postCodemodHooks;
  /** @type {boolean} */
  let iconSets;
  try {
    const projectContext = await loadProjectContext(
      cwd,
      options.integration ?? [],
    );
    postCodemodHooks = projectContext.postCodemodHooks;
    integrations = projectContext.integrations;
    iconSets = projectContext.iconSets;
  } catch (err) {
    const configErr = /** @type {Error} */ (err);
    const allProtected = coreResult?.protectedFiles ?? [];
    if (allProtected.length > 0) {
      const protectedFiles = summarizeProtectedFiles(allProtected);
      logger.error(
        `${ERROR_CODES.ERR_CODEMOD_PROTECTED}: protected codemod changes remain while loading the Astryx config.`,
      );
      for (const item of protectedFiles) {
        logger.error(`  ${item.file} — ${item.declarations.join('; ')}`);
      }
      if (cliBehindCore) logCliBehindCore(cliBehindCore, targetVersion);
      logger.log('Upgrade incomplete: protected changes remain\n');
      return {
        type: 'upgrade.run',
        data: {
          from: currentVersion,
          to: targetVersion,
          codemods: totalTransforms,
          integrations: [],
          agentDocsRefreshed: false,
          agentDocs: {
            status: 'current',
            installedVersion: targetVersion,
            fromVersions: [],
            files: [],
            refreshed: false,
            action: 'none',
          },
          sourcePathFound,
          filesChanged: coreResult?.totalFilesChanged ?? 0,
          transformsApplied: coreResult?.totalTransformsApplied ?? 0,
          modifiedFiles: uniqueFiles(coreResult?.changedFiles).map(file =>
            path.relative(cwd, file).split(path.sep).join('/'),
          ),
          protectedFiles,
          declinedCandidates: logged(
            summarizeDeclinedCandidates(
              coreResult?.declinedCandidates ?? [],
              allProtected,
            ),
          ),
          complete: false,
          errorCode: 'ERR_CODEMOD_PROTECTED',
          errors: coreResult?.errors ?? [],
          ...(cliBehindCore ? {cliBehindCore} : {}),
        },
      };
    }
    // Graceful dry-run catch: a config that fails strict validation is expected
    // & fixable ONLY when dry-run AND a pending core config codemod previewed a
    // change (the codemod that would repair it).
    const codemodWouldFixConfig =
      hasCoreConfigCodemod && (coreResult?.totalFilesChanged ?? 0) > 0;
    if (!apply && codemodWouldFixConfig) {
      // Lightweight inspection — no config/Project load (config is still broken
      // in dry-run; the codemod previewed a fix but did not write it).
      const inspection = inspectAgentDocs(cwd, targetVersion);
      return statusConfigFixable({
        from: currentVersion,
        to: targetVersion,
        configError: configErr.message,
        configCodemods: coreConfigCodemodNames,
        cliBehindCore,
        agentDocs:
          /** @type {import('../upgrade.type.mjs').AgentDocsSummary} */ ({
            status: inspection.status,
            installedVersion: targetVersion,
            fromVersions: inspection.blockVersions,
            files: inspection.staleFiles,
            refreshed: false,
            action: inspection.status === 'missing' ? 'nudge-init' : 'none',
          }),
      });
    }
    // Genuine config error: abort.
    logger.error(configErr.message);
    logger.log('Aborted\n');
    if ((coreResult?.writtenFiles.length ?? 0) > 0) {
      // Core codemods already wrote: the error carries what they changed.
      if (cliBehindCore) logCliBehindCore(cliBehindCore, targetVersion);
      const stopped = stoppedReceipt({
        from: currentVersion,
        to: targetVersion,
        codemods: totalTransforms,
        integrations: [],
        sourcePathFound,
        cwd,
        changedFiles: coreResult?.changedFiles ?? [],
        transformsApplied: coreResult?.totalTransformsApplied ?? 0,
        protectedRows: [],
        errors: [
          ...(coreResult?.errors ?? []),
          {file: '.', codemod: 'config', error: configErr.message},
        ],
        declinedRows: coreResult?.declinedCandidates ?? [],
        errorCode: ERROR_CODES.ERR_INVALID_ARGUMENT,
        cliBehindCore,
      });
      throw failWithReceipt(
        configErr.message,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
        stopped,
      );
    }
    throw new AstryxError(
      configErr.message,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }

  if (integrations.length > 0) {
    logger.log(
      `Integrations: ${integrations.map(i => i.name ?? i.__spec).join(', ')}`,
    );
  }

  // Non-blocking nudge for integration validation issues (suppressed for
  // programmatic/--json callers, i.e. the silent logger).
  await warnIntegrationIssues(integrations, {iconSets});

  const integrationVersionGroups = await selectIntegrationCodemodsFor(
    integrations,
    currentVersion,
    targetVersion,
  );
  const hasIntegrationCodemods = integrationVersionGroups.some(
    g => g.codemods.length > 0,
  );

  for (const {codemods} of integrationVersionGroups) {
    for (const c of codemods) {
      if (options.codemod && c.id !== options.codemod) continue;
      if (skipCodemods.has(c.id)) continue;
      if (c.codemod.isOptional && !options.codemod) totalOptional++;
      else totalTransforms++;
    }
  }

  if (versionManifests.length === 0 && !hasIntegrationCodemods) {
    const registryResult = await reconcileCompositions();
    // No codemods in range — safe to render agent docs from current state.
    const agentDocsPlan = await prepareAgentDocsRefresh({
      cwd,
      origin,
      installedVersion: targetVersion,
      apply,
    });
    const agentDocs = apply
      ? applyAgentDocsRefresh(agentDocsPlan)
      : agentDocsPlan.summary;
    return statusNoCodemods({
      from: currentVersion,
      to: targetVersion,
      agentDocs,
      ...(registryResult ? {registryCompositions: registryResult.summary} : {}),
      cliBehindCore,
    });
  }

  if (totalTransforms === 0 && totalOptional === 0) {
    const msg = `Codemod "${options.codemod}" not found. Use --list to see available codemods.`;
    logger.error(msg);
    logger.log('Aborted\n');
    throw new AstryxError(msg, undefined, ERROR_CODES.ERR_UNKNOWN_CODEMOD);
  }

  if (totalTransforms > 0) {
    logger.log(
      `${totalTransforms} codemod${totalTransforms === 1 ? '' : 's'} to run${apply ? '' : ' (dry run)'}`,
    );
  } else {
    logger.log('No automatic codemods to run for this version range.');
  }

  /** @type {import('../upgrade.type.mjs').UpgradeRunResponse['data']} */
  const receipt = {
    from: currentVersion,
    to: targetVersion,
    codemods: totalTransforms,
    integrations: integrations.map(i => i.name ?? i.__spec),
    agentDocsRefreshed: false,
    agentDocs: /** @type {import('../upgrade.type.mjs').AgentDocsSummary} */ ({
      status: 'current',
      installedVersion: targetVersion,
      fromVersions: [],
      files: [],
      refreshed: false,
      action: 'none',
    }),
    // A missing source directory is the one way this command can migrate
    // nothing and still look complete: every codemod is skipped, filesChanged
    // stays 0, and errors stays empty. The receipt carries the fact so a
    // machine consumer can tell "nothing needed changing" from "nothing was
    // ever read" — the human text says so via the runner's own error line.
    sourcePathFound,
  };

  let integrationResult = null;
  if (hasIntegrationCodemods) {
    const coreStagedContents = coreResult?.stagedContents;
    if (
      (coreResult?.writtenFiles.length ?? 0) > 0 ||
      (coreStagedContents?.size ?? 0) > 0
    ) {
      protection = createFileProtectionResolver(cwd, {
        overrides: coreStagedContents,
      });
    }
    logger.log('Applying integration codemods...');
    integrationResult = await runIntegrationCodemodsStep(
      integrationVersionGroups,
      {
        apply,
        path: path_,
        codemod: options.codemod,
        skipCodemods,
        root: cwd,
        protection,
        contents: coreStagedContents,
      },
    );
  }

  const registryResult = await reconcileCompositions();

  // A file a core codemod AND an integration codemod both changed is one file.
  const mergedFilesChanged = new Set([
    ...(coreResult?.changedFiles ?? []),
    ...(integrationResult?.changedFiles ?? []),
  ]).size;
  const mergedTransformsApplied =
    (coreResult?.totalTransformsApplied ?? 0) +
    (integrationResult?.totalTransformsApplied ?? 0);
  const mergedChangedFiles = [
    ...(coreResult?.changedFiles ?? []),
    ...(integrationResult?.changedFiles ?? []),
    ...(registryResult?.writtenFiles ?? []),
  ];
  const mergedErrors = [
    ...(coreResult?.errors ?? []),
    ...(integrationResult?.errors ?? []),
  ];
  let finalErrors = mergedErrors;
  /** @type {string|undefined} */
  let hookFailure;
  const initialProtected = [
    ...(coreResult?.protectedFiles ?? []),
    ...(integrationResult?.protectedFiles ?? []),
  ];
  const registryFilesChanged = registryResult?.writtenFiles.length ?? 0;
  const generatedChangeBlocked = initialProtected.some(item => item.generated);
  const shouldRunHooks =
    postCodemodHooks.length > 0 &&
    (mergedFilesChanged > 0 ||
      registryFilesChanged > 0 ||
      generatedChangeBlocked);
  /** @type {Map<string, Buffer>} */
  const protectedBeforeHooks = new Map();
  if (apply && shouldRunHooks) {
    for (const item of initialProtected) {
      const absolute = path.resolve(cwd, item.file);
      const relative = path.relative(cwd, absolute);
      if (
        relative.startsWith(`..${path.sep}`) ||
        relative === '..' ||
        path.isAbsolute(relative)
      )
        continue;
      try {
        if (fs.lstatSync(absolute).isFile()) {
          protectedBeforeHooks.set(absolute, fs.readFileSync(absolute));
        }
      } catch {
        // A candidate can disappear between planning and regeneration.
      }
    }
  }
  /** @type {string[]} */
  const hookModifiedFiles = [];

  if (shouldRunHooks) {
    const files = uniqueFiles(mergedChangedFiles).map(file =>
      path.relative(cwd, file),
    );
    try {
      await runPostCodemodHooks(postCodemodHooks, {
        packageDir: cwd,
        files,
        apply: apply || false,
      });
    } catch (err) {
      const hookErr = /** @type {Error} */ (err);
      const msg = `Post-codemod hook failed: ${hookErr.message}`;
      logger.error(msg);
      if (initialProtected.length === 0) {
        logger.log('Upgrade failed\n');
        throw failWithReceipt(
          msg,
          ERROR_CODES.ERR_CODEMOD_FAILED,
          stoppedReceipt({
            from: currentVersion,
            to: targetVersion,
            codemods: totalTransforms,
            integrations: receipt.integrations,
            sourcePathFound,
            cwd,
            changedFiles: mergedChangedFiles,
            transformsApplied: mergedTransformsApplied,
            protectedRows: [],
            errors: [
              ...mergedErrors,
              {file: '.', codemod: 'post-codemod-hook', error: msg},
            ],
            declinedRows: [
              ...(coreResult?.declinedCandidates ?? []),
              ...(integrationResult?.declinedCandidates ?? []),
            ],
            errorCode: ERROR_CODES.ERR_CODEMOD_FAILED,
            cliBehindCore,
            ...(registryResult
              ? {registryCompositions: registryResult.summary}
              : {}),
          }),
        );
      }
      hookFailure = msg;
      finalErrors = [
        ...mergedErrors,
        {file: '.', codemod: 'post-codemod-hook', error: msg},
      ];
      logger.log('Regeneration failed; protected changes remain\n');
    }
    if (apply) {
      for (const [file, before] of protectedBeforeHooks) {
        try {
          if (!before.equals(fs.readFileSync(file)))
            hookModifiedFiles.push(file);
        } catch {
          hookModifiedFiles.push(file);
        }
      }
    }
  }

  // A successful apply hook may have regenerated protected outputs. Rerun the
  // selected codemods in preview mode against fresh bytes and fresh declarations
  // to distinguish resolved outputs from changes that remain blocked.
  let remainingProtected = initialProtected;
  let remainingDeclined = [
    ...(coreResult?.declinedCandidates ?? []),
    ...(integrationResult?.declinedCandidates ?? []),
  ];
  if (apply && shouldRunHooks && !hookFailure) {
    let refreshedProtection;
    try {
      refreshedProtection = loadFileProtection(cwd);
    } catch (err) {
      if (!(err instanceof AstryxError)) throw err;
      // The hooks ran after the codemods wrote; the error carries their receipt.
      if (cliBehindCore) logCliBehindCore(cliBehindCore, targetVersion);
      const stopped = stoppedReceipt({
        from: currentVersion,
        to: targetVersion,
        codemods: totalTransforms,
        integrations: receipt.integrations,
        sourcePathFound,
        cwd,
        changedFiles: [...mergedChangedFiles, ...hookModifiedFiles],
        transformsApplied: mergedTransformsApplied,
        protectedRows: initialProtected,
        errors: [
          ...mergedErrors,
          {file: '.', codemod: 'file-protection', error: err.message},
        ],
        declinedRows: [
          ...(coreResult?.declinedCandidates ?? []),
          ...(integrationResult?.declinedCandidates ?? []),
        ],
        errorCode: err.code,
        cliBehindCore,
        ...(registryResult
          ? {registryCompositions: registryResult.summary}
          : {}),
      });
      throw failWithReceipt(err.message, err.code, stopped);
    }
    const coreCheck = await runCoreCodemods(versionManifests, {
      apply: false,
      path: path_,
      codemod: options.codemod,
      skipCodemods,
      root: cwd,
      protection: refreshedProtection,
      silent: true,
    });
    const checkedCore =
      coreCheck && 'totalFilesChanged' in coreCheck ? coreCheck : null;
    const recheckProtection =
      (checkedCore?.stagedContents.size ?? 0) > 0
        ? createFileProtectionResolver(cwd, {
            overrides: checkedCore?.stagedContents,
          })
        : refreshedProtection;
    const integrationCheck = hasIntegrationCodemods
      ? await runIntegrationCodemodsStep(integrationVersionGroups, {
          apply: false,
          path: path_,
          codemod: options.codemod,
          skipCodemods,
          root: cwd,
          protection: recheckProtection,
          contents: checkedCore?.stagedContents,
          silent: true,
        })
      : null;
    const recheckedProtected = [
      ...(checkedCore?.protectedFiles ?? []),
      ...(integrationCheck?.protectedFiles ?? []),
    ];
    const recheckedChangedFiles = [
      ...(checkedCore?.changedFiles ?? []),
      ...(integrationCheck?.changedFiles ?? []),
    ].map(file => path.relative(cwd, file).split(path.sep).join('/'));
    const initialByFile = new Map();
    for (const item of initialProtected) {
      const rows = initialByFile.get(item.file) ?? [];
      rows.push(item);
      initialByFile.set(item.file, rows);
    }
    // A hook that removes a protection marker without regenerating the bytes
    // does not make the required change disappear. Retain the original
    // declaration for that still-pending file.
    for (const file of recheckedChangedFiles) {
      recheckedProtected.push(...(initialByFile.get(file) ?? []));
    }
    remainingProtected = recheckedProtected;
    // Regenerated bytes decide what a codemod could not parse, as they decide
    // what is still protected.
    remainingDeclined = [
      ...(checkedCore?.declinedCandidates ?? []),
      ...(integrationCheck?.declinedCandidates ?? []),
    ];
    finalErrors = [
      ...mergedErrors,
      ...(checkedCore?.errors ?? []),
      ...(integrationCheck?.errors ?? []),
    ];
  }

  const protectedFiles = summarizeProtectedFiles(remainingProtected);
  receipt.filesChanged = mergedFilesChanged;
  receipt.transformsApplied = mergedTransformsApplied;
  receipt.modifiedFiles = uniqueFiles([
    ...mergedChangedFiles,
    ...hookModifiedFiles,
  ]).map(file => path.relative(cwd, file).split(path.sep).join('/'));
  receipt.protectedFiles = protectedFiles;
  receipt.declinedCandidates = logged(
    summarizeDeclinedCandidates(remainingDeclined, remainingProtected),
  );
  receipt.complete = protectedFiles.length === 0 && finalErrors.length === 0;
  if (protectedFiles.length > 0) {
    receipt.errorCode = 'ERR_CODEMOD_PROTECTED';
  } else if (finalErrors.length > 0) {
    // Only on the receipt the thrown error carries (below).
    receipt.errorCode = 'ERR_CODEMOD_FAILED';
  }
  receipt.errors = finalErrors;
  if (registryResult) receipt.registryCompositions = registryResult.summary;
  if (cliBehindCore) receipt.cliBehindCore = cliBehindCore;

  if (protectedFiles.length > 0) {
    logger.error(
      `${ERROR_CODES.ERR_CODEMOD_PROTECTED}: ${protectedFiles.length} protected file${protectedFiles.length === 1 ? '' : 's'} still require${protectedFiles.length === 1 ? 's' : ''} a codemod change:`,
    );
    for (const item of protectedFiles) {
      logger.error(`  ${item.file} — ${item.declarations.join('; ')}`);
      for (const command of item.commands) {
        logger.log(`  Regenerate with: ${command}`);
      }
    }
  }

  if (finalErrors.length > 0 && protectedFiles.length === 0) {
    const msg = `Upgrade completed with ${finalErrors.length} codemod error${finalErrors.length === 1 ? '' : 's'}.`;
    logger.log('Upgrade failed\n');
    // The error carries the receipt: every file the codemods wrote before the
    // failure stays changed, and the caller keeps or reverts them knowingly.
    throw failWithReceipt(
      msg,
      ERROR_CODES.ERR_CODEMOD_FAILED,
      /** @type {import('../upgrade.type.mjs').UpgradeRunResponse['data']} */ (
        /** @type {unknown} */ (receipt)
      ),
    );
  }

  // Only refresh managed docs after all required codemod changes are complete.
  if (receipt.complete) {
    const agentDocsPlan = await prepareAgentDocsRefresh({
      cwd,
      origin,
      installedVersion: targetVersion,
      apply,
      fresh: true,
    });
    const completedAgentDocs = apply
      ? applyAgentDocsRefresh(agentDocsPlan)
      : agentDocsPlan.summary;
    receipt.agentDocs = completedAgentDocs;
    receipt.agentDocsRefreshed = completedAgentDocs.refreshed;
  }

  const registryOk = receipt.registryCompositions?.ok ?? true;
  if (cliBehindCore) logCliBehindCore(cliBehindCore, targetVersion);
  const done = cliBehindCore
    ? 'Upgrade incomplete'
    : apply
      ? 'Upgrade complete'
      : 'Dry run complete';
  logger.log(
    protectedFiles.length > 0
      ? 'Upgrade incomplete: protected changes remain\n'
      : !registryOk
        ? 'Upgrade finished with unresolved registry items\n'
        : sourcePathFound
          ? done + '\n'
          : `${done}, but ${path.relative(cwd, path_) || '.'} does not exist, so no source files were scanned. ` +
            `Pass --path <your source directory> if your code does not live in ./src.\n`,
  );
  return {
    type: 'upgrade.run',
    data: /** @type {import('../upgrade.type.mjs').UpgradeRunResponse['data']} */ (
      /** @type {unknown} */ (receipt)
    ),
  };
}
