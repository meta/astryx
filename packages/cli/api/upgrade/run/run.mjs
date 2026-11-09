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
  withCodemodOutcomes,
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

/** Every declined finding for a manual migration starts with this. */
const MANUAL_MIGRATION_REASON = 'manual migration needed';

/**
 * Where one declined finding ends and the next begins inside a folded
 * `reason`: `; ` before a finding's own prefix.
 */
const NEXT_FINDING =
  /; (?=(?:unparseable protected file|manual migration needed) \()/;

/** The suffix of a folded finding that has no location of its own. */
const LOCATION_UNKNOWN = '(location unknown)';

/**
 * Collapse per-codemod declined candidates into one row per file, in the
 * receipt's `{file, location?, reason}` shape. A file the receipt lists under
 * `protectedFiles` is left out: a codemod still requires a change to it, and
 * that already makes the run incomplete.
 *
 * Every distinct finding for a file is kept, whatever its kind: a single
 * finding is the row as it arrived; several are folded into the one row,
 * each keeping its own prefix (`unparseable protected file (<category>): ...`
 * or `manual migration needed (<codemod>): ...`), joined by `; ` in arrival
 * order. `location` is the first finding's own location (absent when it has
 * none). A later finding whose own location differs from the row's says so at
 * its end: ` (at <location>)` when known, ` (location unknown)` when not; a
 * later finding without a suffix is at the row's location. So no finding is
 * ever read at another finding's location.
 *
 * Rows are grouped by their `/`-separated path, which is also the spelling
 * the row carries: a runner's row keeps the platform separator (backslashes on
 * Windows), while a manual row already uses `/`.
 * @param {Array<{file: string, codemod: string, location?: string, reason: string}>} rows
 * @param {Array<{file: string}>} [protectedRows]
 * @param {string} [sep] The platform path separator (a parameter for tests).
 * @returns {Array<{file: string, location?: string, reason: string}>}
 */
export function summarizeDeclinedCandidates(
  rows,
  protectedRows = [],
  sep = path.sep,
) {
  /** @type {Map<string, Array<{location?: string, reason: string}>>} */
  const byFile = new Map();
  for (const {file: raw, location, reason} of withoutProtected(
    rows,
    protectedRows,
  )) {
    const file = raw.split(sep).join('/');
    const findings = byFile.get(file) ?? [];
    if (!findings.some(f => f.reason === reason && f.location === location)) {
      findings.push({...(location ? {location} : {}), reason});
    }
    byFile.set(file, findings);
  }
  return [...byFile.entries()]
    .map(([file, findings]) => {
      const location = findings[0].location;
      return {
        file,
        ...(location ? {location} : {}),
        reason: findings
          .map((f, index) =>
            index === 0 || f.location === location
              ? f.reason
              : f.location
                ? `${f.reason} (at ${f.location})`
                : `${f.reason} ${LOCATION_UNKNOWN}`,
          )
          .join('; '),
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * The findings a folded declined row carries, each with its own location.
 * @param {{location?: string, reason: string}} row
 * @returns {Array<{location?: string, text: string}>}
 */
function declinedFindings(row) {
  return row.reason.split(NEXT_FINDING).map((text, index) => {
    if (index === 0) {
      return {...(row.location ? {location: row.location} : {}), text};
    }
    if (text.endsWith(` ${LOCATION_UNKNOWN}`)) {
      return {text: text.slice(0, -LOCATION_UNKNOWN.length - 1)};
    }
    const at = / \(at ([^)]+)\)$/.exec(text);
    return at
      ? {location: at[1], text: text.slice(0, at.index)}
      : {...(row.location ? {location: row.location} : {}), text};
  });
}

/**
 * Declined candidates for code a codemod identified but cannot migrate safely
 * (`ManualMigrationRequired`): one row per finding, in the per-codemod row
 * shape the runners use, for `summarizeDeclinedCandidates` to fold with the
 * file's other declined findings. A person makes the change; like every
 * declined candidate, it never fails the run or makes it incomplete
 * (spec:AST-040 FR7).
 * @param {import('../_adapter.mjs').CodemodOutcomeRecord[]} outcomes
 * @returns {Array<{file: string, codemod: string, location?: string, reason: string}>}
 */
function manualDeclinedRows(outcomes) {
  /** @type {Array<{file: string, codemod: string, location?: string, reason: string}>} */
  const rows = [];
  for (const outcome of outcomes) {
    if (outcome.kind !== 'manual') continue;
    rows.push({
      file: outcome.file,
      codemod: outcome.codemod,
      ...(typeof outcome.line === 'number'
        ? {location: String(outcome.line)}
        : {}),
      reason: `${MANUAL_MIGRATION_REASON} (${outcome.codemod}): ${outcome.message}`,
    });
  }
  return rows;
}

/**
 * How many manual migrations the declined rows carry: every finding, not every
 * file (a folded row lists several).
 * @param {Array<{location?: string, reason: string}>} declined
 */
function countManualMigrations(declined) {
  return declined
    .flatMap(declinedFindings)
    .filter(f => f.text.startsWith(MANUAL_MIGRATION_REASON)).length;
}

/**
 * Print the final declined list (files it reports as protected are already
 * left out), so the text output carries what the receipt lists: protected
 * files the run skipped because a codemod could not parse them, and code a
 * codemod could not migrate. Each finding of a folded row is printed under
 * its own kind.
 * @param {Array<{file: string, location?: string, reason: string}>} declined
 */
function logDeclined(declined) {
  /** @type {Array<{file: string, location?: string, text: string}>} */
  const manual = [];
  /** @type {Array<{file: string, location?: string, text: string}>} */
  const unparseable = [];
  for (const row of declined) {
    for (const finding of declinedFindings(row)) {
      (finding.text.startsWith(MANUAL_MIGRATION_REASON)
        ? manual
        : unparseable
      ).push({file: row.file, ...finding});
    }
  }
  /** @param {Array<{file: string, location?: string, text: string}>} rows */
  const lines = rows => {
    for (const {file, location, text} of rows) {
      logger.warn(`  ${file}${location ? `:${location}` : ''} - ${text}`);
    }
  };
  /** @param {Array<{file: string}>} rows */
  const files = rows => new Set(rows.map(row => row.file)).size;
  if (unparseable.length > 0) {
    const n = files(unparseable);
    logger.warn(
      `${n} protected file${n === 1 ? ' was' : 's were'} skipped because ${n === 1 ? 'it does' : 'they do'} not parse; review manually:`,
    );
    lines(unparseable);
  }
  if (manual.length > 0) {
    const n = files(manual);
    logger.warn(
      `${n} file${n === 1 ? ' needs' : 's need'} a manual migration that upgrade cannot make; review manually:`,
    );
    lines(manual);
  }
}

/**
 * Print protected files that still require a codemod change, each with the
 * declarations that protect it and the commands that rebuild it.
 * @param {string} header
 * @param {import('../upgrade.type.mjs').ProtectedCodemodFile[]} protectedFiles
 */
function logProtectedFiles(header, protectedFiles) {
  if (protectedFiles.length === 0) return;
  logger.error(header);
  for (const item of protectedFiles) {
    logger.error(`  ${item.file} — ${item.declarations.join('; ')}`);
    for (const command of item.commands) {
      logger.log(`  Regenerate with: ${command}`);
    }
  }
}

/**
 * Print the generated files to rebuild, each with why and the commands that
 * rebuild it, so the text output carries what `regenerate` lists. Files
 * already printed with their commands (protected files) are skipped.
 * @param {import('../upgrade.type.mjs').RegenerateFile[]} regenerate
 * @param {Array<{file: string}>} [printed]
 */
function logRegenerate(regenerate, printed = []) {
  const skip = new Set(printed.map(item => item.file));
  const rows = regenerate.filter(item => !skip.has(item.file));
  if (rows.length === 0) return;
  logger.error(
    `${rows.length} generated file${rows.length === 1 ? '' : 's'} must be regenerated:`,
  );
  for (const item of rows) {
    logger.error(
      `  ${item.file}${item.messages.length > 0 ? ` — ${item.messages.join(' ')}` : ''}`,
    );
    for (const command of item.commands) {
      logger.log(`  Regenerate with: ${command}`);
    }
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
 * Generated files that must be rebuilt before the upgrade is complete, one row
 * per file: protected generated files a codemod still needs to change, and
 * generated outputs a codemod reported out of date. `commands` are the exact
 * rebuild commands known for the file (its header's `Command:` line, or the
 * command the codemod names).
 * @param {Array<{file: string, codemods: string[], reasons: string[], commands: string[]}>} protectedFiles
 * @param {import('../_adapter.mjs').CodemodOutcomeRecord[]} outcomes
 * @returns {import('../upgrade.type.mjs').RegenerateFile[]}
 */
function summarizeRegenerate(protectedFiles, outcomes) {
  /** @type {Map<string, {codemods: Set<string>, commands: Set<string>, messages: Set<string>}>} */
  const byFile = new Map();
  /** @param {string} file */
  const row = file => {
    const current = byFile.get(file) ?? {
      codemods: new Set(),
      commands: new Set(),
      messages: new Set(),
    };
    byFile.set(file, current);
    return current;
  };
  for (const item of protectedFiles) {
    if (!item.reasons.includes('generated')) continue;
    const current = row(item.file);
    for (const codemod of item.codemods) current.codemods.add(codemod);
    for (const command of item.commands) current.commands.add(command);
  }
  for (const outcome of outcomes) {
    if (outcome.kind !== 'regenerate') continue;
    const current = row(outcome.file);
    current.codemods.add(outcome.codemod);
    for (const command of outcome.commands) current.commands.add(command);
    current.messages.add(outcome.message);
  }
  return [...byFile.entries()]
    .map(([file, item]) => ({
      file,
      codemods: [...item.codemods].sort(),
      commands: [...item.commands].sort(),
      messages: [...item.messages].sort(),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Protection rows for generated outputs a codemod reported out of date, from
 * the run's protection resolver, in the shape the runners report blocked
 * protected candidates. A reported file the project protects (an `@generated`
 * header, `linguist-generated`, ...) is a protected file that still requires a
 * change, so it is listed in `protectedFiles` with the declaration that
 * protects it (spec:AST-040 FR6), and the command the codemod names is one of
 * its `commands`. A reported file nothing protects gets no row here: it is a
 * codemod error (`regenerationErrors`) and stays in `regenerate`.
 * @param {import('../_adapter.mjs').CodemodOutcomeRecord[]} outcomes
 * @param {{classify: (file: string) => import('../../../foundation/fs/file-protection.mjs').FileProtection[]}} protection
 * @param {string} cwd
 * @returns {Array<{file: string, codemod: string, reason: string, declaration: string, generated: boolean, command?: string}>}
 */
function regenerationProtectionRows(outcomes, protection, cwd) {
  /** @type {Array<{file: string, codemod: string, reason: string, declaration: string, generated: boolean, command?: string}>} */
  const rows = [];
  for (const outcome of outcomes) {
    if (outcome.kind !== 'regenerate') continue;
    for (const item of protection.classify(path.resolve(cwd, outcome.file))) {
      const base = {
        file: item.file,
        codemod: outcome.codemod,
        reason: item.reason,
        declaration: item.declaration,
        generated: item.reason === 'generated',
      };
      const commands = [
        ...(item.command ? [item.command] : []),
        ...outcome.commands,
      ];
      if (commands.length === 0) rows.push(base);
      for (const command of commands) rows.push({...base, command});
    }
  }
  return rows;
}

/**
 * Error rows for generated outputs a codemod reported out of date that nothing
 * protects. No protected consumer file blocks such a change, so it is not an
 * ERR_CODEMOD_PROTECTED outcome: the codemod required a change it could not
 * make, which is a codemod failure (ERR_CODEMOD_FAILED), as it was before the
 * outcome was typed. The file stays in `regenerate` with its command.
 * @param {import('../_adapter.mjs').CodemodOutcomeRecord[]} outcomes
 * @param {{classify: (file: string) => import('../../../foundation/fs/file-protection.mjs').FileProtection[]}} protection
 * @param {string} cwd
 * @returns {Array<{file: string, codemod: string, error: string}>}
 */
function regenerationErrors(outcomes, protection, cwd) {
  /** @type {Array<{file: string, codemod: string, error: string}>} */
  const rows = [];
  for (const outcome of outcomes) {
    if (outcome.kind !== 'regenerate') continue;
    if (protection.classify(path.resolve(cwd, outcome.file)).length > 0) {
      continue;
    }
    rows.push({
      file: outcome.file,
      codemod: outcome.codemod,
      error: outcome.message,
    });
  }
  return rows;
}

/**
 * The receipt of a run that stopped after codemods ran. Whatever the codemods
 * already wrote stays on disk, so the error the run throws carries this
 * receipt (`failWithReceipt`): a caller that reads only the error would
 * report nothing changed while the files it lists remain modified
 * (spec:AST-040 FR7).
 *
 * @param {{from: string, to: string, codemods: number, integrations: string[], sourcePathFound: boolean, cwd: string, changedFiles: string[], transformsApplied: number, protectedRows: Array<{file: string, codemod: string, reason: string, declaration: string, generated: boolean, command?: string}>, outcomes?: import('../_adapter.mjs').CodemodOutcomeRecord[], errors: Array<{file: string, codemod: string, error: string}>, declinedRows?: Array<{file: string, codemod: string, location?: string, reason: string}>, errorCode: string, cliBehindCore?: import('../upgrade.type.mjs').CliBehindCore | null, registryCompositions?: import('../upgrade.type.mjs').RegistryCompositionSummary}} facts
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
  outcomes = [],
  errors,
  declinedRows = [],
  errorCode,
  cliBehindCore,
  registryCompositions,
}) {
  const protectedFiles = summarizeProtectedFiles(protectedRows);
  const modifiedFiles = uniqueFiles(changedFiles).map(file =>
    path.relative(cwd, file).split(path.sep).join('/'),
  );
  const regenerate = summarizeRegenerate(protectedFiles, outcomes);
  // The run stopped early; the text still names every file to rebuild.
  logRegenerate(regenerate);
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
    protectedFiles,
    declinedCandidates: logged(
      summarizeDeclinedCandidates(
        [...declinedRows, ...manualDeclinedRows(outcomes)],
        protectedRows,
      ),
    ),
    regenerate,
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
  // repair a config the strict loader would otherwise reject. Manual-migration
  // and regeneration outcomes they report are collected, not counted as errors.
  const initialOutcomes = withCodemodOutcomes(versionManifests, cwd);
  const codemodResult = await runCoreCodemods(
    initialOutcomes.versionManifests,
    {
      apply,
      path: path_,
      codemod: options.codemod,
      skipCodemods,
      root: cwd,
      protection,
      coversTarget: !cliBehindCore,
      outcomes: initialOutcomes.outcomes,
    },
  );
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
    const allProtected = [
      ...(coreResult?.protectedFiles ?? []),
      ...regenerationProtectionRows(initialOutcomes.outcomes, protection, cwd),
    ];
    const staleErrors = regenerationErrors(
      initialOutcomes.outcomes,
      protection,
      cwd,
    );
    // A protected file to regenerate blocks the run like any protected file,
    // so it keeps this incomplete result rather than the config error.
    if (allProtected.length > 0) {
      const protectedFiles = summarizeProtectedFiles(allProtected);
      const regenerate = summarizeRegenerate(
        protectedFiles,
        initialOutcomes.outcomes,
      );
      // The protected result wins, but the config error stays visible.
      logger.error(configErr.message);
      logProtectedFiles(
        `${ERROR_CODES.ERR_CODEMOD_PROTECTED}: protected codemod changes remain while loading the Astryx config.`,
        protectedFiles,
      );
      logRegenerate(regenerate, protectedFiles);
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
              [
                ...(coreResult?.declinedCandidates ?? []),
                ...manualDeclinedRows(initialOutcomes.outcomes),
              ],
              allProtected,
            ),
          ),
          regenerate,
          complete: false,
          errorCode: 'ERR_CODEMOD_PROTECTED',
          errors: [
            ...(coreResult?.errors ?? []),
            ...staleErrors,
            {file: '.', codemod: 'config', error: configErr.message},
          ],
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
    if (
      (coreResult?.writtenFiles.length ?? 0) > 0 ||
      initialOutcomes.outcomes.length > 0
    ) {
      // Core codemods already wrote, or reported files to regenerate or
      // migrate by hand: the error carries what they changed and found.
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
        outcomes: initialOutcomes.outcomes,
        errors: [
          ...(coreResult?.errors ?? []),
          ...staleErrors,
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
  // Generated outputs a codemod reported out of date: the project's declared
  // regeneration may rebuild them, exactly like a blocked generated change.
  const reportedRegeneration = initialOutcomes.outcomes.filter(
    outcome => outcome.kind === 'regenerate',
  );
  const shouldRunHooks =
    postCodemodHooks.length > 0 &&
    (mergedFilesChanged > 0 ||
      registryFilesChanged > 0 ||
      generatedChangeBlocked ||
      reportedRegeneration.length > 0);
  /** @type {Map<string, Buffer>} */
  const protectedBeforeHooks = new Map();
  if (apply && shouldRunHooks) {
    for (const item of [...initialProtected, ...reportedRegeneration]) {
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
      const protectedRegeneration = regenerationProtectionRows(
        initialOutcomes.outcomes,
        protection,
        cwd,
      );
      if (initialProtected.length === 0 && protectedRegeneration.length === 0) {
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
            outcomes: initialOutcomes.outcomes,
            errors: [
              ...mergedErrors,
              ...regenerationErrors(initialOutcomes.outcomes, protection, cwd),
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
  let finalOutcomes = initialOutcomes.outcomes;
  let finalProtection = protection;
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
        protectedRows: [
          ...initialProtected,
          ...regenerationProtectionRows(
            initialOutcomes.outcomes,
            protection,
            cwd,
          ),
        ],
        outcomes: initialOutcomes.outcomes,
        errors: [
          ...mergedErrors,
          ...regenerationErrors(initialOutcomes.outcomes, protection, cwd),
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
    const recheckOutcomes = withCodemodOutcomes(versionManifests, cwd);
    const coreCheck = await runCoreCodemods(recheckOutcomes.versionManifests, {
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
    finalOutcomes = recheckOutcomes.outcomes;
    finalProtection = refreshedProtection;
    finalErrors = [
      ...mergedErrors,
      ...(checkedCore?.errors ?? []),
      ...(integrationCheck?.errors ?? []),
    ];
  }

  const protectedFiles = summarizeProtectedFiles([
    ...remainingProtected,
    ...regenerationProtectionRows(finalOutcomes, finalProtection, cwd),
  ]);
  receipt.filesChanged = mergedFilesChanged;
  receipt.transformsApplied = mergedTransformsApplied;
  receipt.modifiedFiles = uniqueFiles([
    ...mergedChangedFiles,
    ...hookModifiedFiles,
  ]).map(file => path.relative(cwd, file).split(path.sep).join('/'));
  receipt.protectedFiles = protectedFiles;
  const declinedCandidates = logged(
    summarizeDeclinedCandidates(
      [...remainingDeclined, ...manualDeclinedRows(finalOutcomes)],
      // The complete final set, regeneration rows included: a file listed
      // under protectedFiles is never also declined.
      protectedFiles,
    ),
  );
  receipt.declinedCandidates = declinedCandidates;
  const regenerate = summarizeRegenerate(protectedFiles, finalOutcomes);
  receipt.regenerate = regenerate;
  // A protected file to rebuild blocks the run like any protected file
  // (spec:AST-040 FR6). An unprotected one is a required change the codemod
  // could not make: a codemod error. A declined candidate, a manual
  // migration included, never blocks (FR7).
  finalErrors = [
    ...finalErrors,
    ...regenerationErrors(finalOutcomes, finalProtection, cwd),
  ];
  const blocked = protectedFiles.length > 0;
  receipt.complete = !blocked && finalErrors.length === 0;
  if (blocked) {
    receipt.errorCode = 'ERR_CODEMOD_PROTECTED';
  } else if (finalErrors.length > 0) {
    // Only on the receipt the thrown error carries (below).
    receipt.errorCode = 'ERR_CODEMOD_FAILED';
  }
  receipt.errors = finalErrors;
  if (registryResult) receipt.registryCompositions = registryResult.summary;
  if (cliBehindCore) receipt.cliBehindCore = cliBehindCore;

  logProtectedFiles(
    `${ERROR_CODES.ERR_CODEMOD_PROTECTED}: ${protectedFiles.length} protected file${protectedFiles.length === 1 ? '' : 's'} still require${protectedFiles.length === 1 ? 's' : ''} a codemod change:`,
    protectedFiles,
  );
  // Generated outputs a codemod reported out of date, beyond the protected
  // files already listed above.
  logRegenerate(regenerate, protectedFiles);

  if (finalErrors.length > 0 && !blocked) {
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
  const manualCount = countManualMigrations(declinedCandidates);
  const manualNote =
    manualCount > 0
      ? `; ${manualCount} manual migration${manualCount === 1 ? '' : 's'} listed above`
      : '';
  logger.log(
    protectedFiles.length > 0
      ? 'Upgrade incomplete: protected changes remain\n'
      : !registryOk
        ? 'Upgrade finished with unresolved registry items\n'
        : sourcePathFound
          ? done + manualNote + '\n'
          : `${done}${manualNote}, but ${path.relative(cwd, path_) || '.'} does not exist, so no source files were scanned. ` +
            `Pass --path <your source directory> if your code does not live in ./src.\n`,
  );
  return {
    type: 'upgrade.run',
    data: /** @type {import('../upgrade.type.mjs').UpgradeRunResponse['data']} */ (
      /** @type {unknown} */ (receipt)
    ),
  };
}
