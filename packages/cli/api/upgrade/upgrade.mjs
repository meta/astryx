// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file upgrade API — dispatcher + barrel over the upgrade leaves.
 *
 * `upgrade(options)` runs codemods that migrate source from a previous Astryx
 * version to the currently installed one, refreshes the managed agent-docs
 * block, and reconciles ShadCN-copied compositions. It is the single entry the
 * CLI calls; it validates the invocation and routes to one leaf, each of which
 * returns its `{type, data}` envelope:
 *   - `list`     (api/upgrade/list)     → upgrade.list — codemods, no run
 *   - `registry` (api/upgrade/registry) → upgrade.registry — copied source only
 *   - `run`      (api/upgrade/run)      → upgrade.run — the terminal run receipt,
 *       plus the up_to_date / no_codemods / config_fixable short-circuits it
 *       delegates to the `status` leaf → upgrade.status
 *
 * Shared version-detection + codemod selection/execution I/O lives in
 * `_adapter.mjs` (the leaves project its results). Errors throw AstryxError
 * (stable code). Human progress is emitted through the shared `logger`
 * (silent by default), so the CLI keeps its exact output and a programmatic
 * caller stays quiet.
 */

import {list} from './list/list.mjs';
import {registryUpgrade} from './registry/registry.mjs';
import {run} from './run/run.mjs';
import {relativeToOrigin, scopeToProject} from './_adapter.mjs';
import {isValidSemver} from '../../foundation/env/semver.mjs';
import {getCliInvocation} from '../../foundation/env/package-manager.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {AstryxError} from '../error.mjs';
import {logger} from '../logger.mjs';

/**
 * @typedef {import('./upgrade.type.mjs').UpgradeOptions} UpgradeOptions
 */

/**
 * Run the upgrade pipeline. Validates the invocation, then dispatches to the
 * list/status/run leaves. Returns the leaf's receipt; throws AstryxError on
 * failure. Progress is emitted through the shared `logger` (silent by default).
 *
 * @param {UpgradeOptions} [options]
 * @param {{cwd?: string}} [ctx]
 * @returns {Promise<import('./upgrade.type.mjs').UpgradeListResponse | import('./upgrade.type.mjs').UpgradeRegistryResponse | import('./upgrade.type.mjs').UpgradeStatusResponse | import('./upgrade.type.mjs').UpgradeRunResponse>}
 */
export async function upgrade(options = {}, {cwd = process.cwd()} = {}) {
  logger.log('\nUpgrade');

  if (options.list && options.registry) {
    const msg = '`--list` and `--registry` cannot be used together.';
    logger.error(msg);
    logger.log('Aborted\n');
    throw new AstryxError(msg, undefined, ERROR_CODES.ERR_INVALID_ARGUMENT);
  }

  if (options.list) {
    const ignored = [
      options.from ? '--from' : null,
      options.force ? '--force' : null,
      options.apply ? '--apply' : null,
      options.path && options.path !== './src' ? '--path' : null,
      options.codemod ? '--codemod' : null,
      options.skipCodemod?.length ? '--skip-codemod' : null,
      options.integration?.length ? '--integration' : null,
      options.installDeps ? '--install-deps' : null,
    ].filter(Boolean);
    if (ignored.length > 0) {
      const msg = `\`--list\` cannot be combined with ${ignored.join(', ')}: it lists available codemods and does not run a migration.`;
      logger.error(msg);
      logger.log('Aborted\n');
      throw new AstryxError(msg, undefined, ERROR_CODES.ERR_INVALID_ARGUMENT);
    }
  }

  if (options.registry) {
    const incompatible = [
      options.from ? '--from' : null,
      options.force ? '--force' : null,
      options.codemod ? '--codemod' : null,
      options.skipCodemod?.length ? '--skip-codemod' : null,
      options.integration?.length ? '--integration' : null,
      options.installDeps ? '--install-deps' : null,
    ].filter(Boolean);
    if (incompatible.length > 0) {
      const msg = `\`--registry\` cannot be combined with ${incompatible.join(', ')}.`;
      logger.error(msg);
      logger.log('Aborted\n');
      throw new AstryxError(msg, undefined, ERROR_CODES.ERR_INVALID_ARGUMENT);
    }
    const scoped = scopeToProject(options, cwd);
    return registryUpgrade(scoped.options, {
      cwd: scoped.cwd,
      origin: scoped.origin,
    });
  }

  if (!options.list && !options.from) {
    // Outside a project there is no version to install (spec AST-081 FR3).
    const msg = isOutsideProject(cwd)
      ? 'Missing required --from. This folder is outside a project; upgrade migrates the code of an app project that installs @astryxdesign/core.'
      : `Missing required --from. Install the target version first, then run \`${getCliInvocation()} upgrade --from <old-version>\`.`;
    logger.error(msg);
    logger.log('Aborted\n');
    throw new AstryxError(msg, undefined, ERROR_CODES.ERR_INVALID_ARGUMENT);
  }

  if (!options.list && !isValidSemver(options.from)) {
    const msg = `Invalid --from value: "${options.from}". Expected a semver string like 0.0.5.`;
    logger.error(msg);
    logger.log('Aborted\n');
    throw new AstryxError(msg, undefined, ERROR_CODES.ERR_INVALID_VERSION);
  }

  if (options.list) {
    return list();
  }

  // A run from a subfolder upgrades the project the folder belongs to, and
  // names files relative to the folder it ran in.
  const scoped = scopeToProject(options, cwd);
  let result;
  try {
    result = await run(scoped.options, {
      cwd: scoped.cwd,
      origin: scoped.origin,
    });
  } catch (err) {
    // A failure after codemods wrote carries their receipt; name its files
    // from the folder the command ran in, as a returned receipt does.
    const receipt = /** @type {any} */ (err)?.receipt;
    if (err instanceof AstryxError && receipt) {
      /** @type {any} */ (err).receipt = relativeToOrigin(
        {type: 'upgrade.run', data: receipt},
        scoped,
      ).data;
    }
    throw err;
  }
  return relativeToOrigin(result, scoped);
}
